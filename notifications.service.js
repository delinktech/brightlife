/**
 * Brightlife SHG - Notifications, Receipts & Member Statements Service
 * Handles:
 * 1. Automatic email receipts on transaction approval
 * 2. WhatsApp one-click pre-composed receipt generation (wa.me)
 * 3. Monthly member financial statements (Rich HTML Email & WhatsApp)
 * 4. Bulk monthly statement dispatching with delivery tracking
 */

/**
 * Test function to verify and authorize MailApp email sending in Apps Script editor
 */
function testSendEmail() {
  const userEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  if (!userEmail) throw new Error("No active email detected. Please run from Apps Script editor.");
  MailApp.sendEmail({
    to: userEmail,
    subject: "Brightlife SHG - Email System Test",
    body: "This is a test email confirming that email permissions are successfully authorized for Brightlife SHG.",
    name: "Brightlife SHG Treasury"
  });
  console.log("Test email sent successfully to " + userEmail);
  return "Test email successfully sent to " + userEmail;
}

/**
 * Normalizes Kenyan phone numbers to E.164 without '+' (e.g. 254712345678)
 */
function normalizeKenyanPhone_(phone) {
  if (!phone) return "";
  let clean = String(phone).replace(/[^\d+]/g, "").trim();
  if (clean.startsWith("+")) clean = clean.substring(1);
  if (clean.startsWith("0")) clean = "254" + clean.substring(1);
  if (clean.length === 9 && (clean.startsWith("7") || clean.startsWith("1"))) clean = "254" + clean;
  return clean;
}

/**
 * Formats a number as KES currency string
 */
function formatCurrency_(amount) {
  const num = Number(amount) || 0;
  return "KES " + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats Date to friendly string (e.g. 12 Oct 2026)
 */
function formatFriendlyDate_(dateVal) {
  if (!dateVal) return "—";
  try {
    const tz = getSpreadsheet_().getSpreadsheetTimeZone() || "Africa/Nairobi";
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return Utilities.formatDate(d, tz, "dd MMM yyyy");
  } catch (e) {
    return String(dateVal);
  }
}

/**
 * Retrieves Notification Settings from Script Properties
 */
function getNotificationSettings() {
  const props = PropertiesService.getScriptProperties();
  const autoEmail = props.getProperty("AUTO_EMAIL_RECEIPTS");
  const bcc = props.getProperty("NOTIFICATION_BCC_EMAIL");
  return {
    autoEmailReceipts: autoEmail === null ? true : autoEmail === "true",
    notificationBcc: bcc || "",
  };
}

/**
 * Saves Notification Settings (Treasurer/Admin only)
 */
function saveNotificationSettings(data) {
  const ctx = requirePermission_("accountsWrite");
  const session = requireAccess_();
  const role = String(ctx.roleKey || session.roleKey || session.role || "").toLowerCase();
  const isPrivileged = role === ROLE_KEY.ADMIN || role === ROLE_KEY.TREASURER;
  if (!isPrivileged) {
    return { success: false, error: "Only the Treasurer or Admin can update notification settings." };
  }

  const props = PropertiesService.getScriptProperties();
  if (data.autoEmailReceipts !== undefined) {
    props.setProperty("AUTO_EMAIL_RECEIPTS", data.autoEmailReceipts ? "true" : "false");
  }
  if (data.notificationBcc !== undefined) {
    props.setProperty("NOTIFICATION_BCC_EMAIL", String(data.notificationBcc || "").trim());
  }

  appendAuditLog_(
    "settings.notifications_update",
    "Settings",
    "NotificationSettings",
    "Updated notification settings by " + (session.email || "Treasurer"),
    JSON.stringify(data)
  );

  return { success: true };
}

/**
 * Fetches fresh member details, balances, and contact info by Member ID or Name
 */
function getMemberContactAndFinancials_(memberIdOrName) {
  if (!memberIdOrName) return null;
  const searchKey = String(memberIdOrName).trim().toLowerCase();

  const ss = getSpreadsheet_();
  const memSheet = getRequiredSheet_(SHEETS.MEMBERS);
  const values = memSheet.getDataRange().getValues();
  const headers = values[0];
  const col = getHeaderMap_(headers);

  let targetRow = null;
  for (let i = 1; i < values.length; i++) {
    const rowId = col["Member ID"] !== undefined ? String(values[i][col["Member ID"]] || "").trim().toLowerCase() : "";
    const rowName = col["Full Name"] !== undefined ? String(values[i][col["Full Name"]] || "").trim().toLowerCase() : "";
    const altName = col["Member Name"] !== undefined ? String(values[i][col["Member Name"]] || "").trim().toLowerCase() : "";

    if (rowId === searchKey || rowName === searchKey || altName === searchKey) {
      targetRow = values[i];
      break;
    }
  }

  if (!targetRow) return null;

  const mId = col["Member ID"] !== undefined ? String(targetRow[col["Member ID"]] || "").trim() : "";
  const mName = col["Full Name"] !== undefined ? String(targetRow[col["Full Name"]] || "").trim() : (col["Member Name"] !== undefined ? String(targetRow[col["Member Name"]] || "").trim() : "");
  const mPhone = col["Phone Number"] !== undefined ? String(targetRow[col["Phone Number"]] || "").trim() : "";
  const mEmail = col["Email"] !== undefined ? String(targetRow[col["Email"]] || "").trim() : "";
  const mSavings = col["Total Savings"] !== undefined ? (Number(targetRow[col["Total Savings"]]) || 0) : 0;
  const mLoanBalance = col["Current Loan Balance"] !== undefined ? (Number(targetRow[col["Current Loan Balance"]]) || 0) : 0;

  return {
    id: mId,
    name: mName,
    phone: mPhone,
    cleanPhone: normalizeKenyanPhone_(mPhone),
    email: mEmail,
    savings: mSavings,
    loanBalance: mLoanBalance,
  };
}

/**
 * Builds formatted text for WhatsApp Receipt
 */
function buildReceiptWhatsAppMessage_(data) {
  const receiptNo = data.receiptNo || "BL-RCP-" + Utilities.formatDate(new Date(), "Africa/Nairobi", "yyyyMMdd-HHmm");
  const dateStr = formatFriendlyDate_(data.date || new Date());
  const memberLine = data.memberId ? (data.memberName + " (" + data.memberId + ")") : data.memberName;
  const channel = data.channel || data.mode || "Direct Deposit";
  const type = data.type || "Contribution";
  const amountStr = formatCurrency_(data.amount);

  let loanBreakdown = "";
  if (data.isLoanRepayment || type === "Loan Repayment") {
    if (data.principalPaid || data.interestPaid) {
      loanBreakdown = "\n📋 *Repayment Breakdown:*\n• Principal: " + formatCurrency_(data.principalPaid || 0) +
                      "\n• Interest: " + formatCurrency_(data.interestPaid || 0) +
                      (data.feePaid ? ("\n• Fee: " + formatCurrency_(data.feePaid)) : "");
    }
  }

  let text = "🟢 *BRIGHTLIFE SHG RECEIPT* 🟢\n" +
    "────────────────────────────\n" +
    "📄 *Receipt No:* " + receiptNo + "\n" +
    "📅 *Date:* " + dateStr + "\n" +
    "👤 *Member:* " + memberLine + "\n" +
    "🏷️ *Type:* " + type + "\n" +
    "💳 *Channel:* " + channel + "\n" +
    "💰 *Amount Paid:* " + amountStr + "\n" +
    (data.tid ? ("🔖 *Ref/TID:* " + data.tid + "\n") : "") +
    "✅ *Status:* Approved & Credited\n" +
    loanBreakdown + "\n" +
    "📊 *UPDATED FINANCIALS:*\n" +
    "• Total Savings: " + formatCurrency_(data.totalSavings || 0) + "\n" +
    "• Outstanding Loan: " + formatCurrency_(data.loanBalance || 0) + "\n" +
    "────────────────────────────\n" +
    "_Thank you for your commitment to Brightlife SHG!_\n" +
    "_Brightlife SHG Treasury_";

  return text;
}

/**
 * Builds Rich Branded HTML Receipt Email
 */
function buildReceiptHtmlEmail_(data) {
  const receiptNo = data.receiptNo || "BL-RCP-" + Utilities.formatDate(new Date(), "Africa/Nairobi", "yyyyMMdd-HHmm");
  const dateStr = formatFriendlyDate_(data.date || new Date());
  const memberLine = data.memberId ? (data.memberName + " (" + data.memberId + ")") : data.memberName;
  const channel = data.channel || data.mode || "Direct Deposit";
  const type = data.type || "Contribution";
  const amountStr = formatCurrency_(data.amount);
  const savingsStr = formatCurrency_(data.totalSavings || 0);
  const loanBalStr = formatCurrency_(data.loanBalance || 0);

  let loanBreakdownHtml = "";
  if ((data.isLoanRepayment || type === "Loan Repayment") && (data.principalPaid || data.interestPaid)) {
    loanBreakdownHtml = `
      <tr>
        <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Principal Paid</td>
        <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${formatCurrency_(data.principalPaid || 0)}</td>
      </tr>
      <tr>
        <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Loan Interest Paid</td>
        <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${formatCurrency_(data.interestPaid || 0)}</td>
      </tr>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brightlife SHG Receipt</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 580px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 28px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">BRIGHTLIFE SELF HELP GROUP</h1>
              <p style="margin: 6px 0 0 0; color: #a7f3d0; font-size: 13px; font-weight: 500;">Official Transaction Receipt</p>
              <div style="margin-top: 12px; display: inline-block; background: rgba(255,255,255,0.18); border-radius: 20px; padding: 4px 14px;">
                <span style="color: #ffffff; font-size: 12px; font-weight: 600;">Receipt #${receiptNo}</span>
              </div>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td style="padding: 24px 24px 12px 24px; text-align: center; background: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
              <span style="font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 1px;">Amount Received & Approved</span>
              <div style="margin-top: 4px; font-size: 32px; font-weight: 800; color: #064e3b;">${amountStr}</div>
              <div style="margin-top: 4px;">
                <span style="display: inline-block; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; text-transform: uppercase;">Verified & Credited ✅</span>
              </div>
            </td>
          </tr>

          <!-- Details Table -->
          <tr>
            <td style="padding: 20px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                <tr style="background: #f8fafc;">
                  <td style="padding: 10px 14px; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Transaction Details</td>
                  <td></td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Member</td>
                  <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${memberLine}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Transaction Date</td>
                  <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${dateStr}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Transaction Type</td>
                  <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${type}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Deposit Channel</td>
                  <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${channel}</td>
                </tr>
                ${data.tid ? `
                <tr>
                  <td style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Ref / Transaction ID</td>
                  <td style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-family: monospace; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${data.tid}</td>
                </tr>` : ""}
                ${loanBreakdownHtml}
              </table>
            </td>
          </tr>

          <!-- Balances Card -->
          <tr>
            <td style="padding: 0 24px 20px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 14px;">
                <tr>
                  <td width="50%" style="padding: 6px 12px; border-right: 1px solid #e2e8f0; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Your Total Savings</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #047857;">${savingsStr}</div>
                  </td>
                  <td width="50%" style="padding: 6px 12px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Outstanding Loan Debt</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: ${data.loanBalance > 0 ? '#b91c1c' : '#64748b'};">${loanBalStr}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f1f5f9; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">This is an automated receipt issued by Brightlife Self Help Group Treasury.</p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">Nairobi, Kenya • Together We Prosper</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Triggers receipt generation (Email dispatch + WhatsApp URL) for an approved transaction
 */
function triggerTransactionReceipt(txData) {
  try {
    const member = getMemberContactAndFinancials_(txData.memberId || txData.memberName);
    const settings = getNotificationSettings();

    const receiptNo = txData.receiptNo || ("BL-RCP-" + Utilities.formatDate(new Date(), "Africa/Nairobi", "yyyyMMdd-HHmm"));
    const dataForReceipt = {
      receiptNo: receiptNo,
      date: txData.date || new Date(),
      memberId: member ? member.id : (txData.memberId || ""),
      memberName: member ? member.name : (txData.memberName || "Member"),
      amount: Number(txData.amount) || 0,
      type: txData.type || "Monthly Contribution",
      channel: txData.channel || txData.mode || "Equity Bank",
      tid: txData.tid || "",
      isLoanRepayment: txData.isLoanRepayment || (txData.type === "Loan Repayment"),
      principalPaid: Number(txData.principalPaid) || 0,
      interestPaid: Number(txData.interestPaid) || 0,
      feePaid: Number(txData.feePaid) || 0,
      totalSavings: member ? member.savings : (Number(txData.totalSavings) || 0),
      loanBalance: member ? member.loanBalance : (Number(txData.loanBalance) || 0),
    };

    // 1. WhatsApp details
    const whatsAppText = buildReceiptWhatsAppMessage_(dataForReceipt);
    const cleanPhone = member ? member.cleanPhone : normalizeKenyanPhone_(txData.phone || "");
    const whatsAppUrl = cleanPhone ? ("https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(whatsAppText)) : "";

    // 2. Email Dispatch if automated and email available
    let emailSent = false;
    let emailError = null;
    const recipientEmail = (member && member.email) ? member.email : (txData.email || "").trim();

    if (settings.autoEmailReceipts && recipientEmail && recipientEmail.indexOf("@") !== -1) {
      try {
        const htmlBody = buildReceiptHtmlEmail_(dataForReceipt);
        const mailOptions = {
          to: recipientEmail,
          subject: "Brightlife SHG - Payment Receipt #" + receiptNo,
          htmlBody: htmlBody,
          name: "Brightlife SHG Treasury",
        };
        if (settings.notificationBcc && settings.notificationBcc.indexOf("@") !== -1) {
          mailOptions.bcc = settings.notificationBcc;
        }
        MailApp.sendEmail(mailOptions);
        emailSent = true;

        appendAuditLog_(
          "receipt.email_sent",
          "Receipt",
          receiptNo,
          "Receipt emailed to " + recipientEmail + " for " + formatCurrency_(dataForReceipt.amount),
          JSON.stringify({ receiptNo: receiptNo, recipient: recipientEmail })
        );
      } catch (mailErr) {
        emailError = mailErr.message;
        console.error("sendReceiptEmail error: " + mailErr.message);
      }
    }

    return {
      success: true,
      receiptNo: receiptNo,
      emailSent: emailSent,
      emailError: emailError,
      recipientEmail: recipientEmail,
      recipientPhone: member ? member.phone : (txData.phone || ""),
      whatsAppUrl: whatsAppUrl,
      whatsAppText: whatsAppText,
    };
  } catch (err) {
    console.error("triggerTransactionReceipt error: " + err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Builds Monthly Statement Data for a specific member and month (e.g. "2026-10")
 */
function getMemberMonthlyStatementData(memberId, monthKey) {
  const member = getMemberContactAndFinancials_(memberId);
  if (!member) {
    throw new Error("Member not found: " + memberId);
  }

  const ss = getSpreadsheet_();
  const tz = ss.getSpreadsheetTimeZone() || "Africa/Nairobi";

  // Determine month filter range
  // monthKey format: "yyyy-MM" e.g. "2026-10"
  let targetYear, targetMonth;
  if (monthKey && monthKey.indexOf("-") !== -1) {
    const parts = monthKey.split("-");
    targetYear = parseInt(parts[0], 10);
    targetMonth = parseInt(parts[1], 10) - 1; // 0-indexed
  } else {
    const now = new Date();
    targetYear = now.getFullYear();
    targetMonth = now.getMonth();
  }

  const monthStartDate = new Date(targetYear, targetMonth, 1, 0, 0, 0);
  const monthEndDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
  const monthLabel = Utilities.formatDate(monthStartDate, tz, "MMMM yyyy");

  // 1. Gather all contributions for this member in this month
  const contribSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
  const monthlyTransactions = [];
  let monthDeposits = 0;

  if (contribSheet && contribSheet.getLastRow() > 1) {
    const cVals = contribSheet.getDataRange().getValues();
    const cCol = getHeaderMap_(cVals[0]);
    const mIdLower = member.id.toLowerCase();
    const mNameLower = member.name.toLowerCase();

    for (let r = 1; r < cVals.length; r++) {
      const row = cVals[r];
      const rMid = cCol["Member ID"] !== undefined ? String(row[cCol["Member ID"]] || "").trim().toLowerCase() : "";
      const rName = cCol["Member Name"] !== undefined ? String(row[cCol["Member Name"]] || "").trim().toLowerCase() : "";
      const status = cCol["Status"] !== undefined ? String(row[cCol["Status"]] || "Approved").trim() : "Approved";

      if (status !== "Approved") continue;
      if (rMid !== mIdLower && rName !== mNameLower && rName.indexOf(mNameLower) === -1) continue;

      const rawDate = row[cCol["Date"]];
      const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (isNaN(d.getTime())) continue;

      if (d >= monthStartDate && d <= monthEndDate) {
        const amt = Number(row[cCol["Amount"]]) || 0;
        const type = cCol["Transaction Type"] !== undefined ? String(row[cCol["Transaction Type"]] || "") : (cCol["Type"] !== undefined ? String(row[cCol["Type"]] || "") : "Contribution");
        const channel = cCol["Deposit Channel"] !== undefined ? String(row[cCol["Deposit Channel"]] || "") : (cCol["Payment Mode"] !== undefined ? String(row[cCol["Payment Mode"]] || "") : "Bank");
        const tid = cCol["Transaction ID"] !== undefined ? String(row[cCol["Transaction ID"]] || "") : "";

        monthDeposits += amt;
        monthlyTransactions.push({
          date: Utilities.formatDate(d, tz, "dd MMM yyyy"),
          type: type,
          channel: channel,
          amount: amt,
          tid: tid,
          status: status,
        });
      }
    }
  }

  // 2. Gather loan repayments and active loan status
  const loanSheet = ss.getSheetByName(SHEETS.LOANS);
  const activeLoans = [];
  let monthLoanRepaid = 0;

  if (loanSheet && loanSheet.getLastRow() > 1) {
    const lVals = loanSheet.getDataRange().getValues();
    const lCol = getHeaderMap_(lVals[0]);
    const mIdLower = member.id.toLowerCase();
    const mNameLower = member.name.toLowerCase();

    for (let l = 1; l < lVals.length; l++) {
      const row = lVals[l];
      const lMid = lCol["Member ID"] !== undefined ? String(row[lCol["Member ID"]] || "").trim().toLowerCase() : "";
      const lBorrower = lCol["Borrower Name"] !== undefined ? String(row[lCol["Borrower Name"]] || "").trim().toLowerCase() : "";
      const lStatus = String(row[lCol["Status"]] || "Active").trim();

      if (lMid === mIdLower || lBorrower === mNameLower || lBorrower.indexOf(mNameLower) !== -1) {
        if (lStatus !== LOAN_STATUS.REJECTED) {
          activeLoans.push({
            loanId: String(row[lCol["Loan ID"]] || ""),
            requestedAmount: Number(row[lCol["Requested Amount"]]) || 0,
            repaymentAmount: Number(row[lCol["Repayment Amount"]]) || 0,
            totalPaid: Number(row[lCol["Total Paid"]]) || 0,
            balance: Number(row[lCol["Balance"]]) || 0,
            status: lStatus,
          });
        }
      }
    }
  }

  // 3. Compute opening & closing savings
  const closingSavings = member.savings;
  const openingSavings = Math.max(0, closingSavings - monthDeposits);

  return {
    memberId: member.id,
    memberName: member.name,
    phone: member.phone,
    cleanPhone: member.cleanPhone,
    email: member.email,
    monthKey: monthKey,
    monthLabel: monthLabel,
    openingSavings: openingSavings,
    monthDeposits: monthDeposits,
    closingSavings: closingSavings,
    loanBalance: member.loanBalance,
    monthLoanRepaid: monthLoanRepaid,
    transactions: monthlyTransactions,
    activeLoans: activeLoans,
    statementDate: Utilities.formatDate(new Date(), tz, "dd MMMM yyyy"),
  };
}

/**
 * Builds WhatsApp message for Monthly Statement
 */
function buildMonthlyStatementWhatsAppMessage_(stmt) {
  const dateStr = stmt.statementDate;
  const memberLine = stmt.memberName + " (" + stmt.memberId + ")";

  let loansText = "• Outstanding Loan Balance: " + formatCurrency_(stmt.loanBalance);
  if (stmt.activeLoans && stmt.activeLoans.length > 0) {
    loansText += "\n• Active Loans: " + stmt.activeLoans.length + " loan(s)";
    stmt.activeLoans.forEach(function (ln) {
      loansText += "\n  └ " + ln.loanId + ": Bal " + formatCurrency_(ln.balance) + " (" + ln.status + ")";
    });
  }

  let txListText = "";
  if (stmt.transactions && stmt.transactions.length > 0) {
    txListText = "\n📋 *TRANSACTIONS IN " + stmt.monthLabel.toUpperCase() + ":*\n";
    stmt.transactions.forEach(function (tx) {
      txListText += "• " + tx.date + ": " + formatCurrency_(tx.amount) + " (" + tx.type + " via " + tx.channel + ")\n";
    });
  } else {
    txListText = "\n📋 *TRANSACTIONS:* No direct deposits recorded this month.\n";
  }

  const text = "📊 *BRIGHTLIFE SHG - MONTHLY STATEMENT* 📊\n" +
    "────────────────────────────\n" +
    "📅 *Period:* " + stmt.monthLabel + "\n" +
    "👤 *Member:* " + memberLine + "\n" +
    "────────────────────────────\n" +
    "💰 *SAVINGS OVERVIEW:*\n" +
    "• Opening Savings: " + formatCurrency_(stmt.openingSavings) + "\n" +
    "• Deposits This Month: " + formatCurrency_(stmt.monthDeposits) + "\n" +
    "• Closing Total Savings: " + formatCurrency_(stmt.closingSavings) + "\n\n" +
    "📋 *LOAN OVERVIEW:*\n" +
    loansText + "\n" +
    txListText +
    "────────────────────────────\n" +
    "_For any balance questions, contact the Treasurer._\n" +
    "_Brightlife SHG Treasury • " + dateStr + "_";

  return text;
}

/**
 * Builds Rich Branded HTML Monthly Statement Email
 */
function buildMonthlyStatementHtmlEmail_(stmt) {
  const memberLine = stmt.memberName + " (" + stmt.memberId + ")";
  const openingStr = formatCurrency_(stmt.openingSavings);
  const depositsStr = formatCurrency_(stmt.monthDeposits);
  const closingSavingsStr = formatCurrency_(stmt.closingSavings);
  const loanBalStr = formatCurrency_(stmt.loanBalance);

  let txRowsHtml = "";
  if (stmt.transactions && stmt.transactions.length > 0) {
    txRowsHtml = stmt.transactions.map(function (tx) {
      return `
        <tr>
          <td style="padding: 10px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9;">${tx.date}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${tx.type}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${tx.channel}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${formatCurrency_(tx.amount)}</td>
        </tr>
      `;
    }).join("");
  } else {
    txRowsHtml = `
      <tr>
        <td colspan="4" style="padding: 16px; font-size: 13px; color: #94a3b8; text-align: center;">No direct deposit transactions recorded during this period.</td>
      </tr>
    `;
  }

  let loansHtml = "";
  if (stmt.activeLoans && stmt.activeLoans.length > 0) {
    const loanRows = stmt.activeLoans.map(function (ln) {
      return `
        <tr>
          <td style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${ln.loanId}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #334155; text-align: right; border-bottom: 1px solid #f1f5f9;">${formatCurrency_(ln.repaymentAmount)}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #15803d; font-weight: 600; text-align: right; border-bottom: 1px solid #f1f5f9;">${formatCurrency_(ln.totalPaid)}</td>
          <td style="padding: 10px 12px; font-size: 13px; color: #b91c1c; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${formatCurrency_(ln.balance)}</td>
          <td style="padding: 10px 12px; font-size: 12px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ln.balance === 0 ? '#dcfce7; color: #15803d;' : '#fef3c7; color: #b45309;'} font-weight: 600;">${ln.status}</span>
          </td>
        </tr>
      `;
    }).join("");

    loansHtml = `
      <div style="margin-top: 24px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Active Loan Schedule</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff;">
          <tr style="background: #f8fafc;">
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Loan ID</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Total Due</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Paid</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Balance</th>
            <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: center; text-transform: uppercase;">Status</th>
          </tr>
          ${loanRows}
        </table>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Brightlife SHG Monthly Statement</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 620px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 28px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">BRIGHTLIFE SELF HELP GROUP</h1>
                    <p style="margin: 4px 0 0 0; color: #a7f3d0; font-size: 13px; font-weight: 500;">Monthly Member Statement • ${stmt.monthLabel}</p>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background: rgba(255,255,255,0.2); color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 14px;">${stmt.statementDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Member Header Card -->
          <tr>
            <td style="padding: 18px 24px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Statement Issued To</div>
                    <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px;">${memberLine}</div>
                  </td>
                  <td align="right">
                    <div style="font-size: 12px; color: #64748b;">${stmt.phone || "—"}</div>
                    <div style="font-size: 12px; color: #047857; font-weight: 500;">${stmt.email || "No email on file"}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Financial Snapshot KPIs -->
          <tr>
            <td style="padding: 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="32%" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase;">Deposited This Month</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #15803d;">${depositsStr}</div>
                  </td>
                  <td width="2%"></td>
                  <td width="32%" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Total Savings Balance</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #047857;">${closingSavingsStr}</div>
                  </td>
                  <td width="2%"></td>
                  <td width="32%" style="background: ${stmt.loanBalance > 0 ? '#fef2f2' : '#f8fafc'}; border: 1px solid ${stmt.loanBalance > 0 ? '#fecaca' : '#e2e8f0'}; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: ${stmt.loanBalance > 0 ? '#991b1b' : '#64748b'}; text-transform: uppercase;">Loan Debt Balance</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: ${stmt.loanBalance > 0 ? '#dc2626' : '#64748b'};">${loanBalStr}</div>
                  </td>
                </tr>
              </table>

              <!-- Monthly Activity Table -->
              <div style="margin-top: 24px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Activity in ${stmt.monthLabel}</h3>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: #ffffff;">
                  <tr style="background: #f8fafc;">
                    <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Date</th>
                    <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Type</th>
                    <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Channel</th>
                    <th style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Amount</th>
                  </tr>
                  ${txRowsHtml}
                </table>
              </div>

              <!-- Active Loans Schedule -->
              ${loansHtml}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f1f5f9; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #64748b;">This statement is an official certified summary from Brightlife Self Help Group Treasury.</p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">Nairobi, Kenya • Together We Prosper • Confidential</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Sends a monthly statement to an individual member
 */
function sendMemberMonthlyStatement(params) {
  try {
    const memberId = String(params.memberId || "").trim();
    const monthKey = String(params.monthKey || "").trim(); // "yyyy-MM"
    const sendEmail = params.sendEmail !== false;

    if (!memberId) {
      return { success: false, error: "Member ID is required." };
    }

    const stmt = getMemberMonthlyStatementData(memberId, monthKey);
    const whatsAppText = buildMonthlyStatementWhatsAppMessage_(stmt);
    const whatsAppUrl = stmt.cleanPhone ? ("https://wa.me/" + stmt.cleanPhone + "?text=" + encodeURIComponent(whatsAppText)) : "";

    let emailSent = false;
    let emailError = null;

    if (sendEmail) {
      if (stmt.email && stmt.email.indexOf("@") !== -1) {
        try {
          const htmlBody = buildMonthlyStatementHtmlEmail_(stmt);
          const settings = getNotificationSettings();
          const mailOptions = {
            to: stmt.email,
            subject: "Brightlife SHG - Monthly Statement (" + stmt.monthLabel + ")",
            htmlBody: htmlBody,
            name: "Brightlife SHG Treasury",
          };
          if (settings.notificationBcc && settings.notificationBcc.indexOf("@") !== -1) {
            mailOptions.bcc = settings.notificationBcc;
          }
          MailApp.sendEmail(mailOptions);
          emailSent = true;

          appendAuditLog_(
            "statement.email_sent",
            "Statement",
            memberId,
            "Monthly statement for " + stmt.monthLabel + " emailed to " + stmt.email,
            JSON.stringify({ memberId: memberId, month: stmt.monthLabel })
          );
        } catch (mErr) {
          emailError = mErr.message;
          console.error("sendMemberMonthlyStatement error: " + mErr.message);
        }
      } else {
        emailError = "Member has no valid email address on file.";
      }
    }

    return {
      success: true,
      emailSent: emailSent,
      emailError: emailError,
      recipientEmail: stmt.email,
      recipientPhone: stmt.phone,
      whatsAppUrl: whatsAppUrl,
      whatsAppText: whatsAppText,
      statementData: stmt,
    };
  } catch (err) {
    console.error("sendMemberMonthlyStatement error: " + err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Dispatches monthly statements to multiple members in bulk (Admin/Treasurer only)
 */
function sendBulkMonthlyStatements(params) {
  const ctx = requirePermission_("accountsWrite");
  const session = requireAccess_();
  const role = String(ctx.roleKey || session.roleKey || session.role || "").toLowerCase();
  const isPrivileged = role === ROLE_KEY.ADMIN || role === ROLE_KEY.TREASURER;
  if (!isPrivileged) {
    return { success: false, error: "Only the Treasurer or Admin can dispatch bulk statements." };
  }

  const monthKey = String(params.monthKey || "").trim();
  const memberIds = Array.isArray(params.memberIds) ? params.memberIds : [];

  if (memberIds.length === 0) {
    return { success: false, error: "No members selected for dispatch." };
  }

  const results = {
    total: memberIds.length,
    sent: 0,
    skippedNoEmail: 0,
    failed: 0,
    details: [],
  };

  const settings = getNotificationSettings();

  memberIds.forEach(function (mId) {
    try {
      const stmt = getMemberMonthlyStatementData(mId, monthKey);
      if (stmt.email && stmt.email.indexOf("@") !== -1) {
        const htmlBody = buildMonthlyStatementHtmlEmail_(stmt);
        const mailOptions = {
          to: stmt.email,
          subject: "Brightlife SHG - Monthly Statement (" + stmt.monthLabel + ")",
          htmlBody: htmlBody,
          name: "Brightlife SHG Treasury",
        };
        if (settings.notificationBcc && settings.notificationBcc.indexOf("@") !== -1) {
          mailOptions.bcc = settings.notificationBcc;
        }
        MailApp.sendEmail(mailOptions);
        results.sent++;
        results.details.push({ memberId: mId, name: stmt.memberName, status: "Sent", email: stmt.email });
      } else {
        results.skippedNoEmail++;
        results.details.push({ memberId: mId, name: stmt.memberName, status: "Skipped (No Email)", email: "" });
      }
    } catch (err) {
      results.failed++;
      results.details.push({ memberId: mId, status: "Failed", error: err.message });
    }
  });

  appendAuditLog_(
    "statement.bulk_dispatch",
    "Statement",
    monthKey || "Latest",
    "Bulk dispatched " + results.sent + " statements for " + (monthKey || "month") + " by " + (session.email || "Treasurer"),
    JSON.stringify(results)
  );

  return { success: true, results: results };
}

/**
 * Returns overview data for the Monthly Statements modal/dashboard view
 */
function getMonthlyStatementsOverviewData(monthKey) {
  const membersRes = getMembersData(1, 500);
  const members = membersRes.members || [];

  // Default to previous month if not specified
  const now = new Date();
  const defYear = now.getFullYear();
  const defMonth = String(now.getMonth() + 1).padStart(2, "0");
  const activeMonthKey = monthKey || (defYear + "-" + defMonth);

  // Available months: generate last 6 months
  const availableMonths = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = Utilities.formatDate(d, "Africa/Nairobi", "yyyy-MM");
    const label = Utilities.formatDate(d, "Africa/Nairobi", "MMMM yyyy");
    availableMonths.push({ key: key, label: label });
  }

  const memberRows = members.map(function (m) {
    const cleanPhone = normalizeKenyanPhone_(m.phone);
    return {
      id: m.id,
      name: m.name,
      fullName: m.fullName || m.name,
      phone: m.phone || "",
      cleanPhone: cleanPhone,
      email: m.email || "",
      hasEmail: Boolean(m.email && m.email.indexOf("@") !== -1),
      hasPhone: Boolean(cleanPhone),
      savings: m.savings,
      loanBalance: m.loanBalance,
    };
  });

  return {
    activeMonthKey: activeMonthKey,
    availableMonths: availableMonths,
    members: memberRows,
    settings: getNotificationSettings(),
  };
}
