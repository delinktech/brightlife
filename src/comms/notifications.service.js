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
  return /^254[17]\d{8}$/.test(clean) ? clean : "";
}

/**
 * Normalizes deposit channels strictly to the 5 approved channels
 */
function normalizeDepositChannel_(channel) {
  if (!channel) return "Equity Bank";
  const c = String(channel).trim();
  const lower = c.toLowerCase();
  if (lower === "m-pesa" || lower === "mpesa" || lower.indexOf("mpesa") !== -1 || lower.indexOf("paybill") !== -1) {
    return "Equity Bank";
  }
  const VALID = ["Cash", "Equity Bank", "CIC MMF", "Mansa X", "Refund / Expense Offset"];
  for (let i = 0; i < VALID.length; i++) {
    if (VALID[i].toLowerCase() === lower) return VALID[i];
  }
  return c;
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
 * Escapes HTML special characters to prevent injection in email templates
 */
function escapeHtml_(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Retrieves Notification Settings from Script Properties
 */
function getNotificationSettings() {
  const props = PropertiesService.getScriptProperties();
  const autoEmail = props.getProperty("AUTO_EMAIL_RECEIPTS");
  const bcc = props.getProperty("NOTIFICATION_BCC_EMAIL");
  const autoMonthly = props.getProperty("AUTO_MONTHLY_STATEMENTS");
  const autoDay = props.getProperty("AUTO_STATEMENT_DAY");
  const lastMonth = props.getProperty("LAST_AUTO_STATEMENT_DISPATCH_MONTH");
  const lastTs = props.getProperty("LAST_AUTO_STATEMENT_DISPATCH_TIMESTAMP");
  const lastCount = props.getProperty("LAST_AUTO_STATEMENT_DISPATCH_COUNT");

  return {
    autoEmailReceipts: autoEmail === null ? true : autoEmail === "true",
    autoMonthlyStatements: autoMonthly === "true",
    autoStatementDay: autoDay ? (parseInt(autoDay, 10) || 1) : 1,
    notificationBcc: bcc || "",
    lastAutoDispatchMonth: lastMonth || "",
    lastAutoDispatchTimestamp: lastTs || "",
    lastAutoDispatchCount: lastCount ? (parseInt(lastCount, 10) || 0) : 0,
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
  if (data.autoMonthlyStatements !== undefined) {
    const isAuto = data.autoMonthlyStatements === true || data.autoMonthlyStatements === "true";
    props.setProperty("AUTO_MONTHLY_STATEMENTS", isAuto ? "true" : "false");
    if (isAuto) {
      setupAutomatedStatementTrigger_();
    } else {
      removeAutomatedStatementTrigger_();
    }
  }
  if (data.autoStatementDay !== undefined) {
    const day = parseInt(data.autoStatementDay, 10);
    const validDay = !isNaN(day) && day >= 1 && day <= 28 ? day : 1;
    props.setProperty("AUTO_STATEMENT_DAY", String(validDay));
    if (props.getProperty("AUTO_MONTHLY_STATEMENTS") === "true") {
      setupAutomatedStatementTrigger_();
    }
  }

  appendAuditLog_(
    "settings.notifications_update",
    "Settings",
    "NotificationSettings",
    "Updated notification settings by " + (session.email || "Treasurer"),
    JSON.stringify(data)
  );

  return { success: true, settings: getNotificationSettings() };
}

/**
 * Fetches fresh member details, balances, and contact info by Member ID or Name
 */
function getMemberContactAndFinancials_(memberIdOrName) {
  if (!memberIdOrName) return null;
  const rawKey = String(memberIdOrName).trim();
  const searchKey = rawKey.toLowerCase();

  // Extract Member ID if passed in format "Name (BLM-01)", "Name (BL25-XXXX)", or "(BLM-01)"
  let extractedId = "";
  const idMatch = rawKey.match(/\((BL[A-Za-z0-9]*-?\d+)\)/i) || rawKey.match(/(BL[A-Za-z0-9]*-?\d+)\)/i) || rawKey.match(/(BL[A-Za-z0-9]*-?\d+)/i);
  if (idMatch) extractedId = idMatch[1].trim().toLowerCase();

  const ss = getSpreadsheet_();
  const memSheet = getRequiredSheet_(SHEETS.MEMBERS);
  const values = memSheet.getDataRange().getValues();
  const headers = values[0];
  const col = getHeaderMap_(headers);

  let targetRow = null;
  // 1. Exact match on Member ID, Full Name, or Member Name
  for (let i = 1; i < values.length; i++) {
    const rowId = col["Member ID"] !== undefined ? String(values[i][col["Member ID"]] || "").trim().toLowerCase() : "";
    const rowName = col["Full Name"] !== undefined ? String(values[i][col["Full Name"]] || "").trim().toLowerCase() : "";
    const altName = col["Member Name"] !== undefined ? String(values[i][col["Member Name"]] || "").trim().toLowerCase() : "";

    if ((extractedId && rowId === extractedId) || rowId === searchKey || rowName === searchKey || altName === searchKey) {
      targetRow = values[i];
      break;
    }
  }

  // 2. Substring fallback match
  if (!targetRow) {
    for (let i = 1; i < values.length; i++) {
      const rowId = col["Member ID"] !== undefined ? String(values[i][col["Member ID"]] || "").trim().toLowerCase() : "";
      const rowName = col["Full Name"] !== undefined ? String(values[i][col["Full Name"]] || "").trim().toLowerCase() : "";
      if (rowId && searchKey.indexOf(rowId) !== -1) {
        targetRow = values[i];
        break;
      }
      if (rowName && (searchKey.indexOf(rowName) !== -1 || rowName.indexOf(searchKey) !== -1)) {
        targetRow = values[i];
        break;
      }
    }
  }

  if (!targetRow) return null;

  const mId = col["Member ID"] !== undefined ? String(targetRow[col["Member ID"]] || "").trim() : "";
  let mName = col["Full Name"] !== undefined ? String(targetRow[col["Full Name"]] || "").trim() : (col["Member Name"] !== undefined ? String(targetRow[col["Member Name"]] || "").trim() : "");
  if (!mName && col["First Name"] !== undefined) {
    const fn = String(targetRow[col["First Name"]] || "").trim();
    const mn = col["Middle Name"] !== undefined ? String(targetRow[col["Middle Name"]] || "").trim() : "";
    const ln = col["Last Name"] !== undefined ? String(targetRow[col["Last Name"]] || "").trim() : "";
    mName = [fn, mn, ln].filter(Boolean).join(" ");
  }
  const mPhone = col["Phone Number"] !== undefined ? String(targetRow[col["Phone Number"]] || "").trim() : "";
  const mEmail = col["Email"] !== undefined ? String(targetRow[col["Email"]] || "").trim() : "";
  const mSavings = col["Total Savings"] !== undefined ? (Number(targetRow[col["Total Savings"]]) || 0) : 0;
  let mLoanBalance = col["Current Loan Balance"] !== undefined ? (Number(targetRow[col["Current Loan Balance"]]) || 0) : 0;
  const mNationalId = col["National Id"] !== undefined ? String(targetRow[col["National Id"]] || "").trim() : (col["National ID"] !== undefined ? String(targetRow[col["National ID"]] || "").trim() : (col["NationalID"] !== undefined ? String(targetRow[col["NationalID"]] || "").trim() : (col["NID"] !== undefined ? String(targetRow[col["NID"]] || "").trim() : "")));
  const mStatus = col["Status"] !== undefined ? String(targetRow[col["Status"]] || "Active").trim() : "Active";
  const mGuaranteed = col["Guaranteed Amount"] !== undefined ? (Number(targetRow[col["Guaranteed Amount"]]) || 0) : 0;

  // Real-time lookup of active loan balances from Loans sheet
  try {
    const loanRes = typeof getMemberActiveLoans === "function" ? getMemberActiveLoans(mId, mName) : null;
    if (loanRes && loanRes.success && loanRes.loans && loanRes.loans.length > 0) {
      let activeSum = 0;
      loanRes.loans.forEach(function (ln) {
        activeSum += Number(ln.balance) || 0;
      });
      if (activeSum > 0) {
        mLoanBalance = activeSum;
      }
    }
  } catch (eLn) {
    console.warn("getMemberContactAndFinancials_ active loans lookup notice: " + eLn.message);
  }

  return {
    id: mId,
    name: mName,
    phone: mPhone,
    cleanPhone: normalizeKenyanPhone_(mPhone),
    email: mEmail,
    savings: mSavings,
    loanBalance: mLoanBalance,
    nationalId: mNationalId,
    status: mStatus,
    guaranteed: mGuaranteed,
  };
}

/**
 * Builds formatted text for WhatsApp Receipt
 */
function buildReceiptWhatsAppMessage_(data) {
  const receiptNo = data.receiptNo || "BL-RCP-" + Utilities.formatDate(new Date(), "Africa/Nairobi", "yyyyMMdd-HHmm");
  const dateStr = formatFriendlyDate_(data.date || new Date());
  let cleanName = String(data.memberName || "Member").trim();
  cleanName = cleanName.replace(/\s*\([A-Z0-9-]+\)\s*$/i, "").trim().toUpperCase();
  const memberIdClean = String(data.memberId || "").trim().toUpperCase();
  const memberLine = memberIdClean ? (cleanName + " (" + memberIdClean + ")") : cleanName;
  const channel = normalizeDepositChannel_(data.channel || data.mode);
  const type = data.type || "Contribution";
  const amountStr = formatCurrency_(data.amount);

  let loanBreakdown = "";
  if (data.isLoanRepayment || type === "Loan Repayment") {
    if (data.principalPaid || data.interestPaid || data.feePaid) {
      loanBreakdown = "\n📋 *Repayment Breakdown:*\n• Principal: " + formatCurrency_(data.principalPaid || 0) +
                      "\n• Interest: " + formatCurrency_(data.interestPaid || 0) +
                      (data.feePaid ? ("\n• Fee: " + formatCurrency_(data.feePaid)) : "") + "\n";
    }
  }

  let text = "🟢 *BRIGHTLIFE SHG RECEIPT*\n" +
    "────────────────────────────\n" +
    "*Receipt No:* " + receiptNo + "\n" +
    "*Date:* " + dateStr + "\n" +
    "*Member:* " + memberLine + "\n" +
    "*Type:* " + type + "\n" +
    "*Channel:* " + channel + "\n" +
    "*Amount Paid:* *" + amountStr + "*\n" +
    (data.tid ? ("*Ref/TID:* " + data.tid + "\n") : "") +
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
  let cleanName = String(data.memberName || "Member").trim();
  cleanName = cleanName.replace(/\s*\([A-Z0-9-]+\)\s*$/i, "").trim().toUpperCase();
  const memberIdClean = String(data.memberId || "").trim().toUpperCase();
  const memberLine = memberIdClean ? (cleanName + " (" + memberIdClean + ")") : cleanName;
  const channel = normalizeDepositChannel_(data.channel || data.mode);
  const type = data.type || "Contribution";
  const amountStr = formatCurrency_(data.amount);
  const savingsStr = formatCurrency_(data.totalSavings || 0);
  const loanBalanceNum = Number(data.loanBalance) || 0;
  const loanBalStr = formatCurrency_(loanBalanceNum);

  let loanBreakdownHtml = "";
  if ((data.isLoanRepayment || type === "Loan Repayment") && (data.principalPaid || data.interestPaid || Number(data.feePaid) > 0)) {
    loanBreakdownHtml = `
      <tr>
        <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Principal Paid</td>
        <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(data.principalPaid || 0))}</td>
      </tr>
      <tr>
        <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Loan Interest Paid</td>
        <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(data.interestPaid || 0))}</td>
      </tr>
      ${Number(data.feePaid) > 0 ? `
      <tr>
        <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Fee Paid</td>
        <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(data.feePaid))}</td>
      </tr>` : ""}
    `;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Brightlife SHG Receipt</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {
      .bl-body { background-color: #0f172a !important; color: #e2e8f0 !important; }
      .bl-card { background-color: #1e293b !important; border-color: #334155 !important; }
      .bl-surface { background-color: #0f172a !important; border-color: #334155 !important; }
      .bl-banner { background-color: #064e3b !important; border-color: #065f46 !important; }
      .bl-banner-label { color: #a7f3d0 !important; }
      .bl-banner-amount { color: #ffffff !important; }
      .bl-text-strong { color: #f8fafc !important; }
      .bl-text-muted { color: #94a3b8 !important; }
      .bl-border { border-color: #334155 !important; }
      .bl-footer { background-color: #0f172a !important; border-color: #334155 !important; }
    }
  </style>
</head>
<body class="bl-body" style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" class="bl-body" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="bl-card" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #064e3b; background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 28px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">BRIGHTLIFE SELF HELP GROUP</h1>
              <p style="margin: 6px 0 0 0; color: #a7f3d0; font-size: 13px; font-weight: 500;">Official Transaction Receipt</p>
              <div style="margin-top: 12px; display: inline-block; background-color: #065f46; background: rgba(255,255,255,0.18); border-radius: 20px; padding: 4px 14px;">
                <span style="color: #ffffff; font-size: 12px; font-weight: 600;">Receipt #${escapeHtml_(receiptNo)}</span>
              </div>
            </td>
          </tr>

          <!-- Amount Banner -->
          <tr>
            <td class="bl-banner" style="padding: 24px 24px 12px 24px; text-align: center; background-color: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
              <span class="bl-banner-label" style="font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 1px;">Amount Received &amp; Approved</span>
              <div class="bl-banner-amount" style="margin-top: 4px; font-size: 32px; font-weight: 800; color: #064e3b;">${escapeHtml_(amountStr)}</div>
              <div style="margin-top: 4px;">
                <span style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 12px; text-transform: uppercase;">Verified &amp; Credited ✅</span>
              </div>
            </td>
          </tr>

          <!-- Details Table -->
          <tr>
            <td style="padding: 20px 24px;">
              <table role="presentation" class="bl-border" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                <tr class="bl-surface" style="background-color: #f8fafc;">
                  <td class="bl-text-muted" style="padding: 10px 14px; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase;">Transaction Details</td>
                  <td></td>
                </tr>
                <tr>
                  <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Member</td>
                  <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(memberLine)}</td>
                </tr>
                <tr>
                  <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Transaction Date</td>
                  <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(dateStr)}</td>
                </tr>
                <tr>
                  <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Transaction Type</td>
                  <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(type)}</td>
                </tr>
                <tr>
                  <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Deposit Channel</td>
                  <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(channel)}</td>
                </tr>
                ${data.tid ? `
                <tr>
                  <td class="bl-text-muted bl-border" style="padding: 10px 14px; color: #475569; font-size: 13px; border-top: 1px solid #f1f5f9;">Ref / Transaction ID</td>
                  <td class="bl-text-strong bl-border" style="padding: 10px 14px; color: #0f172a; font-size: 13px; font-family: monospace; font-weight: 600; text-align: right; border-top: 1px solid #f1f5f9;">${escapeHtml_(data.tid)}</td>
                </tr>` : ""}
                ${loanBreakdownHtml}
              </table>
            </td>
          </tr>

          <!-- Balances Card -->
          <tr>
            <td style="padding: 0 24px 20px 24px;">
              <table role="presentation" class="bl-surface bl-border" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 14px;">
                <tr>
                  <td class="bl-border" width="50%" style="padding: 6px 12px; border-right: 1px solid #e2e8f0; text-align: center;">
                    <div class="bl-text-muted" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Your Total Savings</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #047857;">${escapeHtml_(savingsStr)}</div>
                  </td>
                  <td width="50%" style="padding: 6px 12px; text-align: center;">
                    <div class="bl-text-muted" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Outstanding Loan Debt</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: ${loanBalanceNum > 0 ? '#b91c1c' : '#64748b'};">${escapeHtml_(loanBalStr)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="bl-footer bl-border" style="background-color: #f1f5f9; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p class="bl-text-muted" style="margin: 0; font-size: 12px; color: #64748b;">This is an automated receipt issued by Brightlife Self Help Group Treasury.</p>
              <p class="bl-text-muted" style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">Nairobi, Kenya • Together We Prosper</p>
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

    // If explicit post-payment loan balance is provided, use it; otherwise fallback to member live loan balance
    let finalLoanBal = 0;
    if (txData.loanBalance !== undefined && txData.loanBalance !== null && !isNaN(txData.loanBalance)) {
      finalLoanBal = Number(txData.loanBalance);
    } else if (member && member.loanBalance !== undefined && member.loanBalance !== null) {
      finalLoanBal = Number(member.loanBalance);
    }

    const dataForReceipt = {
      receiptNo: receiptNo,
      date: txData.date || new Date(),
      memberId: member ? member.id : (txData.memberId || ""),
      memberName: member ? member.name : (txData.memberName || "Member"),
      amount: Number(txData.amount) || 0,
      type: txData.type || "Monthly Contribution",
      channel: normalizeDepositChannel_(txData.channel || txData.mode || "Equity Bank"),
      tid: txData.tid || "",
      isLoanRepayment: txData.isLoanRepayment || (txData.type === "Loan Repayment"),
      principalPaid: Number(txData.principalPaid) || 0,
      interestPaid: Number(txData.interestPaid) || 0,
      feePaid: Number(txData.feePaid) || 0,
      totalSavings: member ? member.savings : (Number(txData.totalSavings) || 0),
      loanBalance: finalLoanBal,
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
      receiptData: Object.assign({}, dataForReceipt, {
        date: dataForReceipt.date instanceof Date ? dataForReceipt.date.toISOString() : dataForReceipt.date
      }),
    };
  } catch (err) {
    console.error("triggerTransactionReceipt error: " + err.message);
    return { success: false, error: err.message };
  }
}

let _BLG_DIVIDEND_POOL_CACHE = null;

/**
 * Calculates or retrieves cached group-wide financial aggregates for dividend projections:
 * - totalGroupSavings: Sum of active member qualifying savings
 * - totalDistributableSurplus: Annualized distributable surplus after statutory reserve (20%)
 */
function getGroupDividendProjectionPool_(ss) {
  if (_BLG_DIVIDEND_POOL_CACHE) {
    return _BLG_DIVIDEND_POOL_CACHE;
  }

  const spreadsheet = ss || getSpreadsheet_();
  let totalGroupSavings = 0;
  let activeMemberCount = 0;

  // 1. Total Group Savings from active members in Members sheet
  try {
    const memSheet = spreadsheet.getSheetByName(SHEETS.MEMBERS);
    if (memSheet && memSheet.getLastRow() > 1) {
      const mVals = memSheet.getDataRange().getValues();
      const mCol = getHeaderMap_(mVals[0]);
      const statusIdx = mCol["Status"];
      const savingsIdx = mCol["Total Savings"];

      for (let i = 1; i < mVals.length; i++) {
        const row = mVals[i];
        const status = statusIdx !== undefined ? String(row[statusIdx] || "Active").trim().toLowerCase() : "active";
        if (status === "active") {
          activeMemberCount++;
          if (savingsIdx !== undefined) {
            totalGroupSavings += Number(row[savingsIdx]) || 0;
          }
        }
      }
    }
  } catch (eM) {
    console.warn("getGroupDividendProjectionPool_ members scan notice: " + eM.message);
  }

  // 2. Earnings calculation: check if income statement / actual historical surplus is available
  let actualDistributablePool = null;
  try {
    if (typeof buildIncomeStatement_ === "function") {
      const now = new Date();
      const isRep = buildIncomeStatement_(spreadsheet, "Africa/Nairobi", now, "this_year");
      if (isRep && isRep.distributableMemberPool !== undefined && isRep.distributableMemberPool > 0) {
        actualDistributablePool = Number(isRep.distributableMemberPool);
      }
    }
  } catch (eIs) {
    // Expected if not available in current execution context
  }

  let totalDistributableSurplus = 0;

  if (actualDistributablePool !== null && actualDistributablePool > 0) {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const annualized = (actualDistributablePool / month) * 12;
    totalDistributableSurplus = Math.round(annualized * 100) / 100;
  } else {
    // Fallback: calculate cumulative earnings from ledger
    let totalLoanInterest = 0;
    let loanProcessingFees = 0;
    let finesAndPenalties = 0;
    let investmentYields = 0;

    // a) Loan Interest & Fees from LOAN_REPAYMENTS
    try {
      const repSheet = spreadsheet.getSheetByName(SHEETS.LOAN_REPAYMENTS);
      if (repSheet && repSheet.getLastRow() > 1) {
        const rVals = repSheet.getDataRange().getValues();
        const rCol = getHeaderMap_(rVals[0]);
        const intIdx = rCol["Interest Paid"] !== undefined ? rCol["Interest Paid"] : rCol["Interest Portion"];
        const feeIdx = rCol["Fee Paid"] !== undefined ? rCol["Fee Paid"] : rCol["Transaction Fee"];
        const statIdx = rCol["Status"];

        for (let r = 1; r < rVals.length; r++) {
          const row = rVals[r];
          const stat = statIdx !== undefined ? String(row[statIdx] || "Approved").trim().toLowerCase() : "approved";
          if (stat === "approved") {
            if (intIdx !== undefined) totalLoanInterest += Number(row[intIdx]) || 0;
            if (feeIdx !== undefined) loanProcessingFees += Number(row[feeIdx]) || 0;
          }
        }
      }
    } catch (eR) {
      console.warn("getGroupDividendProjectionPool_ loan repayments notice: " + eR.message);
    }

    // b) Loan Processing Fees from LOANS table (if not in repayments)
    try {
      const loanSheet = spreadsheet.getSheetByName(SHEETS.LOANS);
      if (loanSheet && loanSheet.getLastRow() > 1) {
        const lVals = loanSheet.getDataRange().getValues();
        const lCol = getHeaderMap_(lVals[0]);
        const feeIdx = lCol["Transaction Fee"] !== undefined ? lCol["Transaction Fee"] : lCol["Processing Fee"];
        const statIdx = lCol["Status"];

        for (let l = 1; l < lVals.length; l++) {
          const row = lVals[l];
          const stat = statIdx !== undefined ? String(row[statIdx] || "").trim().toLowerCase() : "";
          if (stat !== "rejected" && stat !== "cancelled") {
            if (feeIdx !== undefined && loanProcessingFees === 0) {
              loanProcessingFees += Number(row[feeIdx]) || 0;
            }
          }
        }
      }
    } catch (eL) {
      console.warn("getGroupDividendProjectionPool_ loans notice: " + eL.message);
    }

    // c) Fines & Penalties from CONTRIBUTIONS
    try {
      const cSheet = spreadsheet.getSheetByName(SHEETS.CONTRIBUTIONS);
      if (cSheet && cSheet.getLastRow() > 1) {
        const cVals = cSheet.getDataRange().getValues();
        const cCol = getHeaderMap_(cVals[0]);
        const typeIdx = cCol["Transaction Type"] !== undefined ? cCol["Transaction Type"] : cCol["Type"];
        const amtIdx = cCol["Amount"];
        const statIdx = cCol["Status"];

        for (let c = 1; c < cVals.length; c++) {
          const row = cVals[c];
          const stat = statIdx !== undefined ? String(row[statIdx] || "Approved").trim().toLowerCase() : "approved";
          if (stat === "approved") {
            const tStr = typeIdx !== undefined ? String(row[typeIdx] || "").toLowerCase() : "";
            if (tStr.indexOf("fine") !== -1 || tStr.indexOf("penalt") !== -1 || tStr.indexOf("late") !== -1) {
              if (amtIdx !== undefined) finesAndPenalties += Number(row[amtIdx]) || 0;
            }
          }
        }
      }
    } catch (eC) {
      console.warn("getGroupDividendProjectionPool_ contributions notice: " + eC.message);
    }

    // d) Investment Yields from CIC Statement & Investments
    try {
      const cicSheet = spreadsheet.getSheetByName(SHEETS.CIC_STATEMENT);
      if (cicSheet && cicSheet.getLastRow() > 1) {
        const fVals = cicSheet.getDataRange().getValues();
        const fCol = getHeaderMap_(fVals[0]);
        const grossIdx = fCol["Gross Interest"];
        const taxIdx = fCol["Withholding Tax"];
        const netIdx = fCol["Net Yield"];

        for (let f = 1; f < fVals.length; f++) {
          const row = fVals[f];
          const gross = grossIdx !== undefined ? (Number(row[grossIdx]) || 0) : 0;
          const tax = taxIdx !== undefined ? (Number(row[taxIdx]) || 0) : 0;
          const net = netIdx !== undefined && Number(row[netIdx]) ? Number(row[netIdx]) : (gross - tax);
          investmentYields += net;
        }
      }
    } catch (eCic) {
      console.warn("getGroupDividendProjectionPool_ CIC notice: " + eCic.message);
    }

    try {
      const invSheet = spreadsheet.getSheetByName(SHEETS.INVESTMENTS);
      if (invSheet && invSheet.getLastRow() > 1) {
        const iVals = invSheet.getDataRange().getValues();
        const iCol = getHeaderMap_(iVals[0]);
        const roiIdx = iCol["ROI Amount"];
        const statIdx = iCol["Status"];

        for (let j = 1; j < iVals.length; j++) {
          const row = iVals[j];
          const stat = statIdx !== undefined ? String(row[statIdx] || "").toLowerCase() : "";
          if (stat !== "cancelled" && stat !== "rejected") {
            if (roiIdx !== undefined) investmentYields += Number(row[roiIdx]) || 0;
          }
        }
      }
    } catch (eInv) {
      console.warn("getGroupDividendProjectionPool_ investments notice: " + eInv.message);
    }

    const grossEarnings = totalLoanInterest + loanProcessingFees + finesAndPenalties + investmentYields;
    const statutoryReserve = Math.round(grossEarnings * 0.20 * 100) / 100;
    const distributable = Math.max(0, grossEarnings - statutoryReserve);

    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const annualizedDistributable = month > 0 && month < 12 ? (distributable / month) * 12 : distributable;
    totalDistributableSurplus = Math.round(Math.max(distributable, annualizedDistributable) * 100) / 100;
  }

  _BLG_DIVIDEND_POOL_CACHE = {
    totalGroupSavings: Math.max(0, Math.round(totalGroupSavings * 100) / 100),
    totalDistributableSurplus: Math.max(0, totalDistributableSurplus),
    activeMemberCount: activeMemberCount,
  };

  return _BLG_DIVIDEND_POOL_CACHE;
}

/**
 * Builds Monthly Statement Data for a specific member and month (e.g. "2026-10")
 * or custom date range (startDate / endDate as "yyyy-MM-dd").
 * Also supports all-time full history statement when monthKey is "all" or omitted.
 */
function getMemberMonthlyStatementData(memberId, monthKeyOrOpts, startDateArg, endDateArg) {
  const session = requireAccess_();
  let targetMemberId = memberId;
  if (!targetMemberId && session.memberId) {
    targetMemberId = session.memberId;
  }
  if (session.permissions && session.permissions.isMemberOnly) {
    const callerId = String(session.memberId || "").trim().toLowerCase();
    const targetId = String(targetMemberId || "").trim().toLowerCase();
    if (!callerId || !targetId || callerId !== targetId) {
      throw new Error("Access denied: You can only view your own statement.");
    }
  }

  let monthKey = "";
  let startDate = startDateArg;
  let endDate = endDateArg;
  if (monthKeyOrOpts && typeof monthKeyOrOpts === "object") {
    monthKey = monthKeyOrOpts.monthKey || "";
    startDate = monthKeyOrOpts.startDate || startDateArg;
    endDate = monthKeyOrOpts.endDate || endDateArg;
  } else if (typeof monthKeyOrOpts === "string") {
    monthKey = monthKeyOrOpts;
  }

  const member = getMemberContactAndFinancials_(targetMemberId);
  if (!member) {
    throw new Error("Member not found: " + targetMemberId);
  }

  const ss = getSpreadsheet_();
  const tz = ss.getSpreadsheetTimeZone() || "Africa/Nairobi";

  // Determine filter range: custom [startDate, endDate] or monthKey ("yyyy-MM") or all-time
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
  const hasRange =
    startDate &&
    endDate &&
    isoPattern.test(String(startDate).trim()) &&
    isoPattern.test(String(endDate).trim());

  const isAllHistory = !hasRange && (!monthKey || String(monthKey).trim().toLowerCase() === "all");

  let monthStartDate = null;
  let monthEndDate = null;
  let monthLabel = "";

  if (hasRange) {
    const sp = String(startDate).trim().split("-");
    const ep = String(endDate).trim().split("-");
    monthStartDate = new Date(parseInt(sp[0], 10), parseInt(sp[1], 10) - 1, parseInt(sp[2], 10), 0, 0, 0);
    monthEndDate = new Date(parseInt(ep[0], 10), parseInt(ep[1], 10) - 1, parseInt(ep[2], 10), 23, 59, 59);
    if (monthStartDate > monthEndDate) {
      const tmp = monthStartDate;
      monthStartDate = new Date(monthEndDate.getFullYear(), monthEndDate.getMonth(), monthEndDate.getDate(), 0, 0, 0);
      monthEndDate = new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate(), 23, 59, 59);
    }
    const lastDayOfMonth = new Date(monthStartDate.getFullYear(), monthStartDate.getMonth() + 1, 0).getDate();
    if (
      monthStartDate.getFullYear() === monthEndDate.getFullYear() &&
      monthStartDate.getMonth() === monthEndDate.getMonth() &&
      monthStartDate.getDate() === 1 &&
      monthEndDate.getDate() === lastDayOfMonth
    ) {
      monthLabel = Utilities.formatDate(monthStartDate, tz, "MMMM yyyy");
    } else {
      monthLabel =
        Utilities.formatDate(monthStartDate, tz, "dd MMM yyyy") +
        " \u2013 " +
        Utilities.formatDate(monthEndDate, tz, "dd MMM yyyy");
    }
  } else if (!isAllHistory) {
    const now = new Date();
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth();
    if (monthKey && String(monthKey).indexOf("-") !== -1) {
      const parts = String(monthKey).split("-");
      const parsedYear = parseInt(parts[0], 10);
      const parsedMonth = parseInt(parts[1], 10) - 1; // 0-indexed
      if (!isNaN(parsedYear) && !isNaN(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11) {
        targetYear = parsedYear;
        targetMonth = parsedMonth;
      }
    }

    monthStartDate = new Date(targetYear, targetMonth, 1, 0, 0, 0);
    monthEndDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
    monthLabel = Utilities.formatDate(monthStartDate, tz, "MMMM yyyy");
  } else {
    monthLabel = "All Time (Full Member History)";
  }

  const mIdLower = member.id.toLowerCase();
  const mNameLower = member.name.toLowerCase();

  // 1. Gather all contributions & savings transactions
  const contribSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
  let openingSavings = 0;
  const inRangeRawTransactions = [];
  const recordedTids = {};

  if (contribSheet && contribSheet.getLastRow() > 1) {
    const cVals = contribSheet.getDataRange().getValues();
    const cCol = getHeaderMap_(cVals[0]);

    for (let r = 1; r < cVals.length; r++) {
      const row = cVals[r];
      const rMid = cCol["Member ID"] !== undefined ? String(row[cCol["Member ID"]] || "").trim().toLowerCase() : "";
      const rName = cCol["Member Name"] !== undefined ? String(row[cCol["Member Name"]] || "").trim().toLowerCase() : "";
      const status = cCol["Status"] !== undefined ? String(row[cCol["Status"]] || "Approved").trim() : "Approved";

      if (status !== "Approved") continue;
      if (rMid !== mIdLower && (!mNameLower || (rName !== mNameLower && rName.indexOf(mNameLower) === -1))) continue;

      const rawDate = row[cCol["Date"]];
      const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (isNaN(d.getTime())) continue;

      const amt = Number(row[cCol["Amount"]]) || 0;
      const type = cCol["Transaction Type"] !== undefined ? String(row[cCol["Transaction Type"]] || "") : (cCol["Type"] !== undefined ? String(row[cCol["Type"]] || "") : "Contribution");
      const channel = cCol["Deposit Channel"] !== undefined ? String(row[cCol["Deposit Channel"]] || "") : (cCol["Payment Mode"] !== undefined ? String(row[cCol["Payment Mode"]] || "") : "Equity Bank");
      const tid = cCol["Transaction ID"] !== undefined ? String(row[cCol["Transaction ID"]] || "").trim() : "";
      if (tid) recordedTids[tid] = true;

      const typeLower = type.toLowerCase();
      const isWithdrawal = typeLower.indexOf("withdrawal") !== -1 || typeLower.indexOf("refund") !== -1 || typeLower.indexOf("offset") !== -1;
      const moneyIn = isWithdrawal ? 0 : amt;
      const moneyOut = isWithdrawal ? amt : 0;

      if (!isAllHistory && monthStartDate && d < monthStartDate) {
        openingSavings += (moneyIn - moneyOut);
      } else if (isAllHistory || (d >= monthStartDate && d <= monthEndDate)) {
        inRangeRawTransactions.push({
          rawDate: d,
          date: Utilities.formatDate(d, tz, "dd MMM yyyy"),
          ref: tid || (member.id + "-TX" + r),
          tid: tid,
          particulars: type || "Monthly Contribution",
          type: type || "Contribution",
          channel: normalizeDepositChannel_(channel),
          moneyIn: moneyIn,
          moneyOut: moneyOut,
          status: status,
          category: isWithdrawal ? "withdrawal" : "contribution"
        });
      }
    }
  }

  // 2. Gather active loans sub-schedule
  const loanSheet = ss.getSheetByName(SHEETS.LOANS);
  const activeLoans = [];
  if (loanSheet && loanSheet.getLastRow() > 1) {
    const lVals = loanSheet.getDataRange().getValues();
    const lCol = getHeaderMap_(lVals[0]);

    for (let l = 1; l < lVals.length; l++) {
      const row = lVals[l];
      const lMid = lCol["Member ID"] !== undefined ? String(row[lCol["Member ID"]] || "").trim().toLowerCase() : "";
      const lBorrower = lCol["Borrower Name"] !== undefined ? String(row[lCol["Borrower Name"]] || "").trim().toLowerCase() : "";
      const lStatus = String(row[lCol["Status"]] || "Active").trim();

      if (lMid === mIdLower || (mNameLower && (lBorrower === mNameLower || lBorrower.indexOf(mNameLower) !== -1))) {
        if (lStatus !== LOAN_STATUS.REJECTED) {
          const reqAmt = Number(row[lCol["Requested Amount"]]) || 0;
          const intAmt = Number(row[lCol["Interest"]]) || 0;
          const feeAmt = Number(row[lCol["Transaction Fee"]]) || 0;
          const repAmt = Number(row[lCol["Repayment Amount"]]) || (reqAmt + intAmt + feeAmt);
          const paidAmt = Number(row[lCol["Total Paid"]]) || 0;
          const balAmt = lCol["Balance"] !== undefined ? (Number(row[lCol["Balance"]]) || 0) : Math.max(0, repAmt - paidAmt);

          activeLoans.push({
            loanId: String(row[lCol["Loan ID"]] || ("LN-" + l)),
            requestedAmount: reqAmt,
            repaymentAmount: repAmt,
            totalPaid: paidAmt,
            balance: balAmt,
            status: lStatus,
          });
        }
      }
    }
  }

  // 3. Gather approved loan repayments
  const repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
  let monthLoanRepaid = 0;
  if (repSheet && repSheet.getLastRow() > 1) {
    const rVals = repSheet.getDataRange().getValues();
    const rCol = getHeaderMap_(rVals[0]);

    for (let i = 1; i < rVals.length; i++) {
      const row = rVals[i];
      const rMid = rCol["Member ID"] !== undefined ? String(row[rCol["Member ID"]] || "").trim().toLowerCase() : "";
      const rName = rCol["Borrower Name"] !== undefined ? String(row[rCol["Borrower Name"]] || "").trim().toLowerCase() : "";
      const rStatus = rCol["Status"] !== undefined ? String(row[rCol["Status"]] || "Approved").trim() : "Approved";
      if (rStatus !== "Approved") continue;
      if (rMid !== mIdLower && (!mNameLower || (rName !== mNameLower && rName.indexOf(mNameLower) === -1))) continue;

      const rawDate = row[rCol["Payment Date"]];
      const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (isNaN(d.getTime())) continue;

      const totalPaid = Number(row[rCol["Total Paid"]]) || 0;
      const loanId = String(row[rCol["Loan ID"]] || "").trim();
      const pId = String(row[rCol["Payment ID"]] || "").trim();
      const rTid = String(row[rCol["Transaction ID"]] || "").trim();
      const channel = rCol["Payment Mode"] !== undefined ? String(row[rCol["Payment Mode"]] || "") : (rCol["Deposit Channel"] !== undefined ? String(row[rCol["Deposit Channel"]] || "") : "Equity Bank");

      if (isAllHistory || (d >= monthStartDate && d <= monthEndDate)) {
        monthLoanRepaid += totalPaid;
        // If not already recorded in Contributions table, include in transactions ledger
        const isAlreadyRecorded = (rTid && recordedTids[rTid]) || (pId && recordedTids[pId]);
        if (!isAlreadyRecorded) {
          if (rTid) recordedTids[rTid] = true;
          if (pId) recordedTids[pId] = true;
          inRangeRawTransactions.push({
            rawDate: d,
            date: Utilities.formatDate(d, tz, "dd MMM yyyy"),
            ref: rTid || pId || (loanId + "-REP"),
            tid: rTid || pId || "",
            particulars: "Loan Repayment (" + (loanId || "Loan") + ")",
            type: "Loan Repayment",
            channel: normalizeDepositChannel_(channel),
            moneyIn: totalPaid,
            moneyOut: 0,
            status: rStatus,
            category: "loan_repayment"
          });
        }
      }
    }
  }

  // 4. Gather Guarantor Pledges
  const guarantorPledges = [];
  let totalGuaranteed = 0;
  try {
    const guarSheet = ss.getSheetByName(SHEETS.GUARANTORS);
    if (guarSheet && guarSheet.getLastRow() > 1) {
      const gVals = guarSheet.getDataRange().getValues();
      const gCol = getHeaderMap_(gVals[0]);
      const midCol = gCol["Member ID"] !== undefined ? gCol["Member ID"] : gCol["Member id"];

      for (let g = 1; g < gVals.length; g++) {
        const row = gVals[g];
        const gMid = midCol !== undefined ? String(row[midCol] || "").trim().toLowerCase() : "";
        const gName = gCol["Guarantor Name"] !== undefined ? String(row[gCol["Guarantor Name"]] || "").trim().toLowerCase() : "";
        const isMyPledge = (gMid && gMid === mIdLower) || (mNameLower && (gName === mNameLower || gName.indexOf(mNameLower) !== -1));

        if (isMyPledge) {
          const pledgeAmt = Number(row[gCol["Guaranteed Amount"]]) || 0;
          const loanStatus = gCol["Loan Status"] !== undefined ? String(row[gCol["Loan Status"]] || "Active").trim() : (gCol["Status"] !== undefined ? String(row[gCol["Status"]] || "Active").trim() : "Active");
          const loanId = String(row[gCol["Loan ID"]] || "").trim();
          const borrower = gCol["Borrower Name"] !== undefined ? String(row[gCol["Borrower Name"]] || "").trim() : "";

          guarantorPledges.push({
            loanId: loanId,
            borrower: borrower,
            amount: pledgeAmt,
            status: loanStatus,
          });

          const statLower = loanStatus.toLowerCase();
          if (statLower !== "settled" && statLower !== "rejected" && statLower !== "released" && statLower !== "cleared") {
            totalGuaranteed += pledgeAmt;
          }
        }
      }
    }
  } catch (errGuar) {
    console.warn("guarantor lookup notice: " + errGuar.message);
  }

  if (totalGuaranteed === 0 && member.guaranteed > 0) {
    totalGuaranteed = member.guaranteed;
  }

  // 5. Chronological Ledger Sorting & Running Savings Balance Calculation
  inRangeRawTransactions.sort(function (a, b) {
    const timeA = a.rawDate instanceof Date ? a.rawDate.getTime() : new Date(a.rawDate).getTime();
    const timeB = b.rawDate instanceof Date ? b.rawDate.getTime() : new Date(b.rawDate).getTime();
    return timeA - timeB;
  });

  if (isAllHistory) {
    openingSavings = 0;
  } else {
    openingSavings = Math.max(0, openingSavings);
  }

  let runningSavings = openingSavings;
  let totalMoneyIn = 0;
  let totalMoneyOut = 0;

  const itemizedTransactions = inRangeRawTransactions.map(function (tx) {
    const mIn = Number(tx.moneyIn) || 0;
    const mOut = Number(tx.moneyOut) || 0;
    totalMoneyIn += mIn;
    totalMoneyOut += mOut;
    runningSavings = runningSavings + mIn - mOut;
    return {
      date: tx.date,
      rawDate: tx.rawDate instanceof Date ? tx.rawDate.toISOString() : String(tx.rawDate),
      ref: tx.ref,
      tid: tx.tid,
      particulars: tx.particulars,
      type: tx.type,
      channel: tx.channel,
      moneyIn: mIn,
      moneyOut: mOut,
      amount: mIn > 0 ? mIn : mOut,
      balance: runningSavings,
      status: tx.status,
      category: tx.category
    };
  });

  const closingSavings = isAllHistory ? (runningSavings > 0 ? runningSavings : member.savings) : runningSavings;
  const netFreeSavings = Math.max(0, closingSavings - totalGuaranteed);
  const activeLoanSum = activeLoans.reduce((sum, ln) => sum + (String(ln.status).toLowerCase() !== "settled" ? ln.balance : 0), 0);
  const finalStmtLoanBalance = activeLoanSum > 0 ? activeLoanSum : member.loanBalance;

  const serial = Math.random().toString(36).substring(2, 6).toUpperCase();
  const yyyymmdd = Utilities.formatDate(new Date(), tz, "yyyyMMdd");
  const cleanId = String(member.id || "BLM").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const verificationRef = "BLG-STMT-" + cleanId + "-" + yyyymmdd + "-" + serial;

  // Calculate member's projected year-end dividend & yield (Task COM-2)
  const poolData = getGroupDividendProjectionPool_(ss);
  const qualifyingSavings = Math.max(0, Number(member.savings) || Number(closingSavings) || 0);
  const totalGroupSavings = poolData.totalGroupSavings || 0;
  const totalDistributableSurplus = poolData.totalDistributableSurplus || 0;

  let sharePct = 0;
  let projectedDividend = 0;
  let projectedRoiPct = 0;

  if (totalGroupSavings > 0 && qualifyingSavings > 0) {
    const weight = qualifyingSavings / totalGroupSavings;
    projectedDividend = totalDistributableSurplus * weight;
    sharePct = Math.round(weight * 10000) / 100;
    projectedRoiPct = (projectedDividend / qualifyingSavings) * 100;
  }

  const dividendProjection = {
    qualifyingSavings: qualifyingSavings,
    groupSavings: totalGroupSavings,
    shareOfPoolPct: sharePct,
    projectedPool: totalDistributableSurplus,
    projectedDividend: Math.round(projectedDividend * 100) / 100,
    projectedRoiPct: Math.round(projectedRoiPct * 10) / 10,
    payoutPriorityNote: (finalStmtLoanBalance > 0 || member.loanBalance > 0)
      ? "Under Bylaws Rule 5.2, dividends will automatically offset active loan balance first."
      : "Under Bylaws Rule 5.2, dividends will be credited to member savings."
  };

  const stmt = {
    success: true,
    memberId: member.id,
    memberName: member.name,
    nationalId: member.nationalId || "",
    status: member.status || "Active",
    phone: member.phone,
    cleanPhone: member.cleanPhone,
    email: member.email,
    monthKey: monthKey || "",
    startDate: (isAllHistory || !monthStartDate) ? "" : Utilities.formatDate(monthStartDate, tz, "yyyy-MM-dd"),
    endDate: (isAllHistory || !monthEndDate) ? "" : Utilities.formatDate(monthEndDate, tz, "yyyy-MM-dd"),
    monthLabel: monthLabel,
    isAllHistory: isAllHistory,
    openingSavings: openingSavings,
    monthDeposits: totalMoneyIn,
    totalMoneyIn: totalMoneyIn,
    totalMoneyOut: totalMoneyOut,
    closingSavings: closingSavings,
    loanBalance: finalStmtLoanBalance,
    monthLoanRepaid: monthLoanRepaid,
    totalGuaranteed: totalGuaranteed,
    netFreeSavings: netFreeSavings,
    transactions: itemizedTransactions,
    activeLoans: activeLoans,
    guarantorPledges: guarantorPledges,
    statementDate: Utilities.formatDate(new Date(), tz, "dd MMMM yyyy"),
    verificationRef: verificationRef,
    dividendProjection: dividendProjection,
  };

  const whatsAppText = buildMonthlyStatementWhatsAppMessage_(stmt);
  stmt.whatsAppText = whatsAppText;
  stmt.whatsAppUrl = stmt.cleanPhone ? ("https://wa.me/" + stmt.cleanPhone + "?text=" + encodeURIComponent(whatsAppText)) : "";
  return stmt;
}

/**
 * Builds WhatsApp message for Monthly Statement
 */
function buildMonthlyStatementWhatsAppMessage_(stmt) {
  const dateStr = stmt.statementDate;
  const memberNameUpper = String(stmt.memberName || "Member").toUpperCase();
  const memberLine = stmt.memberId ? (memberNameUpper + " (" + stmt.memberId + ")") : memberNameUpper;

  let loansText = "• Outstanding Loan Balance: " + formatCurrency_(stmt.loanBalance);
  if (stmt.activeLoans && stmt.activeLoans.length > 0) {
    loansText += "\n• Active Loans: " + stmt.activeLoans.length + " loan(s)";
    stmt.activeLoans.forEach(function (ln) {
      loansText += "\n  └ " + ln.loanId + ": Bal " + formatCurrency_(ln.balance) + " (" + ln.status + ")";
    });
  }

  let dividendProjectionText = "";
  if (stmt.dividendProjection) {
    const proj = stmt.dividendProjection;
    dividendProjectionText =
      "\n💰 *PROJECTED DIVIDEND YIELD:*\n" +
      "• Est. Year-End Dividend: " + formatCurrency_(proj.projectedDividend) + "\n" +
      "• Est. Return on Savings: " + (proj.projectedRoiPct || 0) + "%\n" +
      "• Share of Group Pool: " + (proj.shareOfPoolPct || 0) + "%\n" +
      "• Payout Priority: " + (proj.payoutPriorityNote || "Credited under Bylaws Rule 5.2") + "\n";
  }

  let txListText = "";
  if (stmt.transactions && stmt.transactions.length > 0) {
    const maxTx = 10;
    const totalTx = stmt.transactions.length;
    const recentTx = totalTx > maxTx ? stmt.transactions.slice(-maxTx) : stmt.transactions;
    txListText = "\n📋 *TRANSACTIONS IN " + stmt.monthLabel.toUpperCase() + ":*\n";
    recentTx.forEach(function (tx) {
      txListText += "• " + tx.date + ": " + formatCurrency_(tx.amount) + " (" + (tx.particulars || tx.type) + " via " + tx.channel + ")\n";
    });
    if (totalTx > maxTx) {
      txListText += "...and " + (totalTx - maxTx) + " more (see email statement)\n";
    }
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
    "• Total Inflows: " + formatCurrency_(stmt.totalMoneyIn !== undefined ? stmt.totalMoneyIn : stmt.monthDeposits) + "\n" +
    "• Closing Total Savings: " + formatCurrency_(stmt.closingSavings) + "\n" +
    "• Net Free Savings: " + formatCurrency_(stmt.netFreeSavings !== undefined ? stmt.netFreeSavings : stmt.closingSavings) + "\n\n" +
    "📋 *LOAN OVERVIEW:*\n" +
    loansText + "\n" +
    dividendProjectionText +
    txListText +
    "────────────────────────────\n" +
    "_Verification Ref: " + (stmt.verificationRef || "Certified") + "_\n" +
    "_For any balance questions, contact the Treasurer._\n" +
    "_Brightlife SHG Treasury • " + dateStr + "_";

  return text;
}

/**
 * Builds Rich Branded HTML Monthly Statement Email
 */
function buildMonthlyStatementHtmlEmail_(stmt) {
  const memberNameUpper = String(stmt.memberName || "Member").toUpperCase();
  const memberLine = stmt.memberId ? (memberNameUpper + " (" + stmt.memberId + ")") : memberNameUpper;
  const openingStr = formatCurrency_(stmt.openingSavings);
  const depositsStr = formatCurrency_(stmt.monthDeposits);
  const closingSavingsStr = formatCurrency_(stmt.closingSavings);
  const loanBalanceNum = Number(stmt.loanBalance) || 0;
  const loanBalStr = formatCurrency_(loanBalanceNum);

  const proj = stmt.dividendProjection || {
    qualifyingSavings: 0,
    groupSavings: 0,
    shareOfPoolPct: 0,
    projectedPool: 0,
    projectedDividend: 0,
    projectedRoiPct: 0,
    payoutPriorityNote: "Under Bylaws Rule 5.2, dividends will be credited to member savings."
  };

  let txRowsHtml = "";
  if (stmt.transactions && stmt.transactions.length > 0) {
    txRowsHtml = stmt.transactions.map(function (tx) {
      return `
        <tr>
          <td class="bl-text-muted bl-border" style="padding: 10px 12px; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(tx.date)}</td>
          <td class="bl-text-strong bl-border" style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(tx.type)}</td>
          <td class="bl-text-muted bl-border" style="padding: 10px 12px; font-size: 13px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(tx.channel)}</td>
          <td class="bl-text-strong bl-border" style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(tx.amount))}</td>
        </tr>
      `;
    }).join("");
  } else {
    txRowsHtml = `
      <tr>
        <td colspan="4" class="bl-text-muted" style="padding: 16px; font-size: 13px; color: #94a3b8; text-align: center;">No direct deposit transactions recorded during this period.</td>
      </tr>
    `;
  }

  let loansHtml = "";
  if (stmt.activeLoans && stmt.activeLoans.length > 0) {
    const loanRows = stmt.activeLoans.map(function (ln) {
      return `
        <tr>
          <td class="bl-text-strong bl-border" style="padding: 10px 12px; font-size: 13px; color: #0f172a; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(ln.loanId)}</td>
          <td class="bl-text-muted bl-border" style="padding: 10px 12px; font-size: 13px; color: #334155; text-align: right; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(ln.repaymentAmount))}</td>
          <td class="bl-border" style="padding: 10px 12px; font-size: 13px; color: #15803d; font-weight: 600; text-align: right; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(ln.totalPaid))}</td>
          <td class="bl-border" style="padding: 10px 12px; font-size: 13px; color: #b91c1c; font-weight: 700; text-align: right; border-bottom: 1px solid #f1f5f9;">${escapeHtml_(formatCurrency_(ln.balance))}</td>
          <td class="bl-border" style="padding: 10px 12px; font-size: 12px; text-align: center; border-bottom: 1px solid #f1f5f9;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 10px; background-color: ${ln.balance === 0 ? '#dcfce7; color: #15803d;' : '#fef3c7; color: #b45309;'} font-weight: 600;">${escapeHtml_(ln.status)}</span>
          </td>
        </tr>
      `;
    }).join("");

    loansHtml = `
      <div style="margin-top: 24px;">
        <h3 class="bl-text-strong" style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Active Loan Schedule</h3>
        <table role="presentation" class="bl-card bl-border" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
          <tr class="bl-surface" style="background-color: #f8fafc;">
            <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Loan ID</th>
            <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Total Due</th>
            <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Paid</th>
            <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Balance</th>
            <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: center; text-transform: uppercase;">Status</th>
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
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Brightlife SHG Monthly Statement</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media only screen and (max-width: 560px) {
      .kpi-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; margin-bottom: 10px !important; }
      .kpi-spacer { display: none !important; width: 0 !important; height: 0 !important; }
    }
    @media (prefers-color-scheme: dark) {
      .bl-body { background-color: #0f172a !important; color: #e2e8f0 !important; }
      .bl-card { background-color: #1e293b !important; border-color: #334155 !important; }
      .bl-surface { background-color: #0f172a !important; border-color: #334155 !important; }
      .bl-kpi-green { background-color: #064e3b !important; border-color: #065f46 !important; }
      .bl-kpi-red { background-color: #450a0a !important; border-color: #7f1d1d !important; }
      .bl-proj-card { background-color: #1e293b !important; border-color: #059669 !important; }
      .bl-proj-note { background-color: #064e3b !important; border-color: #065f46 !important; color: #a7f3d0 !important; }
      .bl-text-strong { color: #f8fafc !important; }
      .bl-text-muted { color: #94a3b8 !important; }
      .bl-border { border-color: #334155 !important; }
      .bl-footer { background-color: #0f172a !important; border-color: #334155 !important; }
    }
  </style>
</head>
<body class="bl-body" style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" class="bl-body" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" class="bl-card" width="100%" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background-color: #064e3b; background: linear-gradient(135deg, #064e3b 0%, #047857 100%); padding: 28px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">BRIGHTLIFE SELF HELP GROUP</h1>
                    <p style="margin: 4px 0 0 0; color: #a7f3d0; font-size: 13px; font-weight: 500;">Monthly Member Statement • ${escapeHtml_(stmt.monthLabel)}</p>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: #065f46; background: rgba(255,255,255,0.2); color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 14px;">${escapeHtml_(stmt.statementDate)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Member Header Card -->
          <tr>
            <td class="bl-surface bl-border" style="padding: 18px 24px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div class="bl-text-muted" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Statement Issued To</div>
                    <div class="bl-text-strong" style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px;">${escapeHtml_(memberLine)}</div>
                  </td>
                  <td align="right">
                    <div class="bl-text-muted" style="font-size: 12px; color: #64748b;">${escapeHtml_(stmt.phone || "—")}</div>
                    <div style="font-size: 12px; color: #047857; font-weight: 500;">${escapeHtml_(stmt.email || "No email on file")}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Financial Snapshot KPIs -->
          <tr>
            <td style="padding: 24px;">
              <div class="bl-surface bl-border" style="margin-bottom: 12px; padding: 10px 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 13px;">
                <span class="bl-text-muted" style="color: #475569; font-weight: 600;">Opening Savings (Start of Period):</span>
                <strong class="bl-text-strong" style="color: #0f172a; float: right;">${escapeHtml_(openingStr)}</strong>
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td class="kpi-cell bl-kpi-green" width="32%" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase;">Deposited This Month</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #15803d;">${escapeHtml_(depositsStr)}</div>
                  </td>
                  <td class="kpi-spacer" width="2%"></td>
                  <td class="kpi-cell bl-surface bl-border" width="32%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; text-align: center;">
                    <div class="bl-text-muted" style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase;">Total Savings Balance</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #047857;">${escapeHtml_(closingSavingsStr)}</div>
                  </td>
                  <td class="kpi-spacer" width="2%"></td>
                  <td class="kpi-cell ${loanBalanceNum > 0 ? 'bl-kpi-red' : 'bl-surface bl-border'}" width="32%" style="background-color: ${loanBalanceNum > 0 ? '#fef2f2' : '#f8fafc'}; border: 1px solid ${loanBalanceNum > 0 ? '#fecaca' : '#e2e8f0'}; border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; font-weight: 700; color: ${loanBalanceNum > 0 ? '#991b1b' : '#64748b'}; text-transform: uppercase;">Loan Debt Balance</div>
                    <div style="margin-top: 4px; font-size: 18px; font-weight: 800; color: ${loanBalanceNum > 0 ? '#dc2626' : '#64748b'};">${escapeHtml_(loanBalStr)}</div>
                  </td>
                </tr>
              </table>

              <!-- Projected Year-End Dividend & Interest Yield Card (COM-2) -->
              <div style="margin-top: 20px;">
                <table role="presentation" class="bl-card bl-border bl-proj-card" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #10b981; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.08);">
                  <tr>
                    <td style="background-color: #064e3b; background: linear-gradient(135deg, #064e3b 0%, #059669 100%); padding: 12px 18px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td>
                            <h3 style="margin: 0; font-size: 13px; font-weight: 700; color: #ffffff; letter-spacing: 0.3px; text-transform: uppercase;">
                              💰 Projected Year-End Dividend &amp; Interest Yield
                            </h3>
                          </td>
                          <td align="right">
                            <span style="display: inline-block; background-color: rgba(255,255,255,0.2); color: #ecfdf5; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;">
                              Est. ${escapeHtml_(String(proj.projectedRoiPct || 0))}% Yield
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 16px 18px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td class="bl-border" width="50%" style="padding-right: 14px; border-right: 1px solid #e2e8f0;">
                            <div class="bl-text-muted" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Projected Dividend</div>
                            <div style="margin-top: 4px; font-size: 22px; font-weight: 800; color: #047857;">${escapeHtml_(formatCurrency_(proj.projectedDividend || 0))}</div>
                            <div class="bl-text-muted" style="margin-top: 2px; font-size: 11px; color: #64748b;">Annualized return on qualifying savings</div>
                          </td>
                          <td width="50%" style="padding-left: 14px;">
                            <div class="bl-text-muted" style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Share of Capital Pool</div>
                            <div class="bl-text-strong" style="margin-top: 4px; font-size: 18px; font-weight: 800; color: #0f172a;">${escapeHtml_(String(proj.shareOfPoolPct || 0))}%</div>
                            <div class="bl-text-muted" style="margin-top: 2px; font-size: 11px; color: #64748b;">of ${escapeHtml_(formatCurrency_(proj.projectedPool || 0))} pool</div>
                          </td>
                        </tr>
                      </table>
                      <div class="bl-surface bl-border bl-proj-note" style="margin-top: 14px; padding: 10px 14px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 12px; color: #166534; line-height: 1.4;">
                        <strong>Payout Rule:</strong> ${escapeHtml_(proj.payoutPriorityNote || "")}
                      </div>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Monthly Activity Table -->
              <div style="margin-top: 24px;">
                <h3 class="bl-text-strong" style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Activity in ${escapeHtml_(stmt.monthLabel)}</h3>
                <table role="presentation" class="bl-card bl-border" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
                  <tr class="bl-surface" style="background-color: #f8fafc;">
                    <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Date</th>
                    <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Type</th>
                    <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: left; text-transform: uppercase;">Channel</th>
                    <th class="bl-text-muted" style="padding: 10px 12px; font-size: 11px; font-weight: 700; color: #64748b; text-align: right; text-transform: uppercase;">Amount</th>
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
            <td class="bl-footer bl-border" style="background-color: #f1f5f9; padding: 18px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p class="bl-text-muted" style="margin: 0; font-size: 12px; color: #64748b;">This statement is an official certified summary from Brightlife Self Help Group Treasury.</p>
              <p class="bl-text-muted" style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">Nairobi, Kenya • Together We Prosper • Confidential</p>
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
    const session = requireAccess_();
    const memberId = String(params.memberId || "").trim();
    const monthKey = String(params.monthKey || "").trim(); // "yyyy-MM"
    const startDate = String(params.startDate || "").trim();
    const endDate = String(params.endDate || "").trim();
    const sendEmail = params.sendEmail !== false;

    if (!memberId) {
      return { success: false, error: "Member ID is required." };
    }

    if (session.permissions && session.permissions.isMemberOnly) {
      const callerId = String(session.memberId || "").trim().toLowerCase();
      if (sendEmail || !callerId || callerId !== memberId.toLowerCase()) {
        return { success: false, error: "Access denied: Staff permissions required to dispatch statements." };
      }
    }

    const stmt = getMemberMonthlyStatementData(memberId, monthKey, startDate, endDate);
    const whatsAppText = buildMonthlyStatementWhatsAppMessage_(stmt);
    const whatsAppUrl = stmt.cleanPhone ? ("https://wa.me/" + stmt.cleanPhone + "?text=" + encodeURIComponent(whatsAppText)) : "";
    const htmlBody = buildMonthlyStatementHtmlEmail_(stmt);

    let emailSent = false;
    let emailError = null;

    if (sendEmail) {
      if (stmt.email && stmt.email.indexOf("@") !== -1) {
        try {
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
      htmlBody: htmlBody,
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
  const startDate = String(params.startDate || "").trim();
  const endDate = String(params.endDate || "").trim();
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
      const stmt = getMemberMonthlyStatementData(mId, monthKey, startDate, endDate);
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
        Utilities.sleep(200);
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
  const session = requireAccess_();
  if (session.permissions && session.permissions.isMemberOnly) {
    throw new Error("Access denied: Staff permissions required to view monthly statements.");
  }

  const cacheKey = "statements_overview_" + (monthKey || "default");
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheErr) {
    console.warn("Statements cache read error: " + cacheErr.message);
  }

  const ctx = typeof beginRequestSheetContext_ === "function" ? beginRequestSheetContext_() : null;
  try {
    const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
    const values = typeof getSheetValuesCached_ === "function"
      ? getSheetValuesCached_(ss, SHEETS.MEMBERS, { required: true })
      : getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();

    const memberRows = [];
    if (values && values.length > 1) {
      const col = getHeaderMap_(values[0]);
      requireHeaders_(col, ["Member ID", "First Name", "Last Name", "Total Savings", "Current Loan Balance"], SHEETS.MEMBERS);

      for (let r = 1; r < values.length; r++) {
        const row = values[r];
        const mid = String(row[col["Member ID"]] || "").trim();
        if (!mid) continue;

        const firstName = String(row[col["First Name"]] || "").trim();
        const middleName = col["Middle Name"] !== undefined ? String(row[col["Middle Name"]] || "").trim() : "";
        const lastName = String(row[col["Last Name"]] || "").trim();
        const initial = middleName ? middleName.charAt(0) + "." : "";
        const fullNameClean = (firstName + " " + middleName + " " + lastName).replace(/\s+/g, " ").trim();
        const nameClean = (firstName + " " + initial + " " + lastName).replace(/\s+/g, " ").trim();
        const phone = col["Phone Number"] !== undefined ? String(row[col["Phone Number"]] || "").trim() : "";
        const email = col["Email"] !== undefined ? String(row[col["Email"]] || "").trim() : "";
        const cleanPhone = normalizeKenyanPhone_(phone);

        memberRows.push({
          id: mid,
          name: nameClean,
          fullName: fullNameClean || nameClean,
          phone: phone,
          cleanPhone: cleanPhone,
          email: email,
          hasEmail: Boolean(email && email.indexOf("@") !== -1),
          hasPhone: Boolean(cleanPhone),
          savings: Number(row[col["Total Savings"]]) || 0,
          loanBalance: Number(row[col["Current Loan Balance"]]) || 0,
        });
      }
    }

    // Default to current month if not specified
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

    const result = {
      activeMonthKey: activeMonthKey,
      availableMonths: availableMonths,
      members: memberRows,
      settings: getNotificationSettings(),
    };

    try {
      const payloadStr = JSON.stringify(result);
      if (payloadStr.length < 100000) {
        CacheService.getScriptCache().put(cacheKey, payloadStr, 300);
      }
    } catch (putErr) {
      console.warn("Statements cache put error: " + putErr.message);
    }

    return result;
  } finally {
    if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
  }
}

/**
 * Returns the target month key ("yyyy-MM") for automated statement dispatch.
 * If running in the first 5 days of the month, targets the previous completed month;
 * otherwise targets the current month.
 */
function getAutomatedStatementMonthKey_(date) {
  const d = date || new Date();
  const day = d.getDate();
  if (day <= 5) {
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const y = prev.getFullYear();
    const m = String(prev.getMonth() + 1).padStart(2, "0");
    return y + "-" + m;
  } else {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return y + "-" + m;
  }
}

/**
 * Automated end-of-month monthly statement dispatch engine.
 * Idempotently iterates active members and dispatches statements with dividend projections.
 */
function runAutomatedMonthlyStatementDispatch_(options) {
  const opts = options || {};
  const props = PropertiesService.getScriptProperties();
  const autoEnabled = props.getProperty("AUTO_MONTHLY_STATEMENTS") === "true";

  if (!autoEnabled && !opts.force && !opts.bypassDayCheck) {
    return {
      success: false,
      skipped: true,
      reason: "Automated monthly statements are disabled in settings.",
      total: 0,
      sent: 0,
      skippedNoEmail: 0,
      failed: 0,
    };
  }

  const now = new Date();
  let timeZone = "Africa/Nairobi";
  let ss = null;
  try {
    ss = getSpreadsheet_();
    if (ss) timeZone = ss.getSpreadsheetTimeZone() || timeZone;
  } catch (eSs) {}

  let currentDay = now.getDate();
  try {
    currentDay = parseInt(Utilities.formatDate(now, timeZone, "d"), 10);
  } catch (eDay) {}

  const autoStatementDay = parseInt(props.getProperty("AUTO_STATEMENT_DAY"), 10) || 1;

  if (!opts.bypassDayCheck && currentDay !== autoStatementDay) {
    return {
      success: false,
      skipped: true,
      reason: "Current day (" + currentDay + ") does not match scheduled autoStatementDay (" + autoStatementDay + ").",
      total: 0,
      sent: 0,
      skippedNoEmail: 0,
      failed: 0,
    };
  }

  const targetMonthKey = opts.monthKey || getAutomatedStatementMonthKey_(now);

  // Idempotency guard: prevent duplicate automated dispatch in the same month
  const lastDispatchedMonth = props.getProperty("LAST_AUTO_STATEMENT_DISPATCH_MONTH") || "";
  if (!opts.force && lastDispatchedMonth === targetMonthKey) {
    return {
      success: false,
      skipped: true,
      reason: "Automated monthly statements for " + targetMonthKey + " have already been dispatched on " + (props.getProperty("LAST_AUTO_STATEMENT_DISPATCH_TIMESTAMP") || "earlier") + ".",
      monthKey: targetMonthKey,
      total: 0,
      sent: 0,
      skippedNoEmail: 0,
      failed: 0,
    };
  }

  if (!ss) ss = getSpreadsheet_();
  const memSheet = getRequiredSheet_(SHEETS.MEMBERS);
  const mValues = memSheet.getDataRange().getValues();
  if (!mValues || mValues.length <= 1) {
    return {
      success: false,
      error: "No member records found.",
      total: 0,
      sent: 0,
      skippedNoEmail: 0,
      failed: 0,
    };
  }

  const mCol = getHeaderMap_(mValues[0]);
  requireHeaders_(mCol, ["Member ID", "Status"], SHEETS.MEMBERS);

  const activeMembers = [];
  for (let r = 1; r < mValues.length; r++) {
    const row = mValues[r];
    const status = String(row[mCol["Status"]] || "Active").trim().toLowerCase();
    if (status !== "active") continue;

    const mid = String(row[mCol["Member ID"]] || "").trim();
    if (!mid) continue;

    const email = mCol["Email"] !== undefined ? String(row[mCol["Email"]] || "").trim() : "";
    activeMembers.push({
      memberId: mid,
      email: email,
    });
  }

  const results = {
    total: activeMembers.length,
    sent: 0,
    skippedNoEmail: 0,
    failed: 0,
    monthKey: targetMonthKey,
    details: [],
  };

  const settings = getNotificationSettings();

  activeMembers.forEach(function (mem) {
    try {
      const stmt = getMemberMonthlyStatementData(mem.memberId, targetMonthKey);
      const recipientEmail = (stmt && stmt.email) ? stmt.email : mem.email;

      if (recipientEmail && recipientEmail.indexOf("@") !== -1) {
        const htmlBody = buildMonthlyStatementHtmlEmail_(stmt);
        const mailOptions = {
          to: recipientEmail,
          subject: "Brightlife SHG - Monthly Statement (" + stmt.monthLabel + ")",
          htmlBody: htmlBody,
          name: "Brightlife SHG Treasury",
        };
        if (settings.notificationBcc && settings.notificationBcc.indexOf("@") !== -1) {
          mailOptions.bcc = settings.notificationBcc;
        }
        MailApp.sendEmail(mailOptions);
        results.sent++;
        results.details.push({ memberId: mem.memberId, name: stmt.memberName, status: "Sent", email: recipientEmail });
        Utilities.sleep(200);
      } else {
        results.skippedNoEmail++;
        results.details.push({ memberId: mem.memberId, name: (stmt ? stmt.memberName : mem.memberId), status: "Skipped (No Email)", email: "" });
      }
    } catch (err) {
      results.failed++;
      results.details.push({ memberId: mem.memberId, status: "Failed", error: err.message });
    }
  });

  const nowIso = new Date().toISOString();
  props.setProperty("LAST_AUTO_STATEMENT_DISPATCH_MONTH", targetMonthKey);
  props.setProperty("LAST_AUTO_STATEMENT_DISPATCH_TIMESTAMP", nowIso);
  props.setProperty("LAST_AUTO_STATEMENT_DISPATCH_COUNT", String(results.sent));

  appendAuditLog_(
    "statement.automated_monthly_dispatch",
    "Statement",
    targetMonthKey,
    "Automated monthly statements dispatched for " + targetMonthKey + ": " + results.sent + " sent, " + results.skippedNoEmail + " skipped, " + results.failed + " failed.",
    JSON.stringify({ monthKey: targetMonthKey, total: results.total, sent: results.sent, skippedNoEmail: results.skippedNoEmail, failed: results.failed })
  );

  return {
    success: true,
    total: results.total,
    sent: results.sent,
    skippedNoEmail: results.skippedNoEmail,
    failed: results.failed,
    monthKey: targetMonthKey,
    timestamp: nowIso,
    details: results.details,
  };
}

/**
 * Public RPC: Manually triggers automated monthly statements immediately (Admin/Treasurer only).
 * Bypasses day-of-month check.
 * Optional `force` boolean bypasses the month idempotency check.
 */
function dispatchAutomatedMonthlyStatementsNow(force) {
  const ctx = requirePermission_("accountsWrite");
  const session = requireAccess_();
  const role = String(ctx.roleKey || session.roleKey || session.role || "").toLowerCase();
  const isPrivileged = role === ROLE_KEY.ADMIN || role === ROLE_KEY.TREASURER;
  if (!isPrivileged) {
    return { success: false, error: "Only the Treasurer or Admin can trigger automated statements dispatch." };
  }

  return runAutomatedMonthlyStatementDispatch_({
    force: Boolean(force),
    bypassDayCheck: true,
  });
}

/**
 * Inspects project triggers for automated monthly statement dispatch
 */
function getAutomatedStatementTriggers_() {
  try {
    if (typeof ScriptApp === "undefined" || !ScriptApp.getProjectTriggers) return [];
    const triggers = ScriptApp.getProjectTriggers();
    return triggers.filter(function (t) {
      return t && typeof t.getHandlerFunction === "function" && t.getHandlerFunction() === "runAutomatedMonthlyStatementDispatch_";
    });
  } catch (e) {
    console.warn("Could not inspect project triggers: " + e.message);
    return [];
  }
}

/**
 * Removes any existing automated statement triggers
 */
function removeAutomatedStatementTrigger_() {
  try {
    if (typeof ScriptApp === "undefined" || !ScriptApp.deleteTrigger) return false;
    const triggers = getAutomatedStatementTriggers_();
    triggers.forEach(function (t) {
      try {
        ScriptApp.deleteTrigger(t);
      } catch (delErr) {
        console.warn("Could not delete trigger: " + delErr.message);
      }
    });
    return true;
  } catch (e) {
    console.warn("removeAutomatedStatementTrigger_ error: " + e.message);
    return false;
  }
}

/**
 * Sets up monthly time-driven trigger for runAutomatedMonthlyStatementDispatch_
 * on the configured autoStatementDay at 08:00 Nairobi time.
 */
function setupAutomatedStatementTrigger_() {
  try {
    if (typeof ScriptApp === "undefined" || !ScriptApp.newTrigger) return false;
    removeAutomatedStatementTrigger_();

    const props = PropertiesService.getScriptProperties();
    const autoDay = parseInt(props.getProperty("AUTO_STATEMENT_DAY"), 10) || 1;
    const validDay = Math.max(1, Math.min(28, autoDay));

    ScriptApp.newTrigger("runAutomatedMonthlyStatementDispatch_")
      .timeBased()
      .onMonthDay(validDay)
      .atHour(8)
      .inTimezone("Africa/Nairobi")
      .create();

    return true;
  } catch (e) {
    console.warn("setupAutomatedStatementTrigger_ notice: " + e.message);
    return false;
  }
}
