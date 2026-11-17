function saveContribution(data) {
  requirePermission_("contributionsWrite");
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
  const range = ss.getRangeByName("BL_CONTRIBUTIONS");
  if (range) {
    sheet = range.getSheet();
  } else if (!sheet) {
    throw new Error("Contributions sheet or named range 'BL_CONTRIBUTIONS' not found.");
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = getHeaderMap_(headers);

  // Extract clean memberId and memberName if passed in compound format e.g. "BL01 — Beatrice Mwangi"
  let memberId = String(data.memberId || "").trim();
  let memberName = String(data.memberName || "").trim();
  if (memberName && memberName.indexOf("—") !== -1) {
    const parts = memberName.split("—");
    if (!memberId) memberId = parts[0].trim();
    memberName = parts.slice(1).join("—").trim();
  }

  const newRow = new Array(headers.length).fill("");
  newRow[col["Date"]] = data.date ? new Date(data.date) : new Date();

  // Primary Foreign Key: Member ID is the single source of truth
  if (col["Member ID"] !== undefined) {
    newRow[col["Member ID"]] = memberId;
  }

  // Member Name is dynamically computed via formula pointing to Members Column N
  const nameIdx = col["Member Name"];
  if (nameIdx !== undefined) {
    const nextRowNumber = sheet.getLastRow() + 1;
    const midIdx = col["Member ID"];
    if (midIdx !== undefined) {
      const midColLetter = String.fromCharCode(65 + midIdx);
      newRow[nameIdx] = '=IF(' + midColLetter + nextRowNumber + '="", "", IFERROR(XLOOKUP(' + midColLetter + nextRowNumber + ', Members!$A$2:$A, Members!$N$2:$N, "—"), ""))';
    } else {
      newRow[nameIdx] = memberName;
    }
  }

  const modeCol = col["Deposit Channel"] !== undefined ? col["Deposit Channel"] : col["Payment Mode"];
  const typeCol = col["Transaction Type"] !== undefined ? col["Transaction Type"] : col["Type"];

  newRow[col["Amount"]] = Number(data.amount) || 0;
  if (modeCol !== undefined) newRow[modeCol] = data.mode || data.channel || "";
  newRow[col["Transaction ID"]] = data.tid || "";
  if (typeCol !== undefined) newRow[typeCol] = data.type || "Monthly Contribution";

  // Financial Governance: Tag as Pending unless entered by verified admin/treasurer with explicit approval
  const session = requireAccess_();
  const isAdminOrTreasurer = session.role === ROLE_KEY.ADMIN || session.role === ROLE_KEY.TREASURER;
  const initialStatus = (isAdminOrTreasurer && data.autoApprove) ? "Approved" : "Pending";
  const verifiedBy = (isAdminOrTreasurer && data.autoApprove) ? (session.email || "Treasurer") : "";

  if (col["Status"] !== undefined) {
    newRow[col["Status"]] = initialStatus;
  }
  if (col["Verified By"] !== undefined) {
    newRow[col["Verified By"]] = verifiedBy;
  }

  sheet.appendRow(newRow);
  var typeLabel = String(data.type || "Contribution");
  appendAuditLog_(
    "contribution.create",
    "Contribution",
    memberId || "",
    typeLabel + " (" + initialStatus + ") — " + memberName.slice(0, 80),
    JSON.stringify({
      memberId: memberId,
      memberName: memberName,
      amount: Number(data.amount) || 0,
      mode: data.mode,
      type: data.type,
      tid: data.tid || "",
      status: initialStatus,
      verifiedBy: verifiedBy,
    })
  );
  clearDashboardCache_();

  let receiptResult = null;
  if (initialStatus === "Approved") {
    try {
      receiptResult = triggerTransactionReceipt({
        receiptNo: "BL-RCP-" + (data.tid || ("ROW" + (sheet.getLastRow()))),
        date: new Date(),
        memberId: memberId,
        memberName: memberName,
        amount: Number(data.amount) || 0,
        type: data.type || "Monthly Contribution",
        channel: data.mode || data.channel || "Equity Bank",
        tid: data.tid || "",
        isLoanRepayment: data.type === "Loan Repayment",
      });
    } catch (rcpErr) {
      console.error("Auto receipt error: " + rcpErr.message);
    }
  }

  return { success: true, receipt: receiptResult };
}

function getContributionsData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    const session = requireAccess_();
    const isMemberOnly = session.permissions && session.permissions.isMemberOnly;
    const callerMemberId = String(session.memberId || "").trim().toLowerCase();
    const callerMemberName = String(session.memberName || "").trim().toLowerCase();

    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.CONTRIBUTIONS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, contributions: [], totalPages: 0, currentPage: 1 };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      ["Date", "Member Name", "Amount"],
      SHEETS.CONTRIBUTIONS
    );

    const modeCol = col["Deposit Channel"] !== undefined ? col["Deposit Channel"] : col["Payment Mode"];
    const typeCol = col["Transaction Type"] !== undefined ? col["Transaction Type"] : col["Type"];
    const memberIdCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

    const allRowsWithIndex = [];
    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      const rowName = String(row[col["Member Name"]] || "").trim();
      if (!rowName) continue;

      if (isMemberOnly) {
        const rowMid = memberIdCol !== undefined ? String(row[memberIdCol] || "").trim().toLowerCase() : "";
        const rowNameLower = rowName.toLowerCase();
        const matchId = callerMemberId && rowMid === callerMemberId;
        const matchName = callerMemberName && (rowNameLower === callerMemberName || callerMemberName.indexOf(rowNameLower) !== -1 || rowNameLower.indexOf(callerMemberName) !== -1);
        if (!matchId && !matchName) continue;
      }
      allRowsWithIndex.push({
        rowNumber: r + 1, // exact 1-based sheet row index
        data: row
      });
    }
    allRowsWithIndex.reverse();

    const totalPages = Math.ceil(allRowsWithIndex.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const pageItems = allRowsWithIndex.slice(start, start + pageLimit);
    const tz = ss.getSpreadsheetTimeZone();

    // Fast memory map of member contact info
    const memSheet = ss.getSheetByName(SHEETS.MEMBERS);
    const memMap = {};
    if (memSheet && memSheet.getLastRow() > 1) {
      const mVals = memSheet.getDataRange().getValues();
      const mCol = getHeaderMap_(mVals[0]);
      for (let m = 1; m < mVals.length; m++) {
        const mid = mCol["Member ID"] !== undefined ? String(mVals[m][mCol["Member ID"]] || "").trim().toLowerCase() : "";
        const mname = mCol["Full Name"] !== undefined ? String(mVals[m][mCol["Full Name"]] || "").trim().toLowerCase() : (mCol["Member Name"] !== undefined ? String(mVals[m][mCol["Member Name"]] || "").trim().toLowerCase() : "");
        const rawPhone = mCol["Phone Number"] !== undefined ? String(mVals[m][mCol["Phone Number"]] || "").trim() : "";
        const cleanPh = typeof normalizeKenyanPhone_ === "function" ? normalizeKenyanPhone_(rawPhone) : rawPhone;
        const email = mCol["Email"] !== undefined ? String(mVals[m][mCol["Email"]] || "").trim() : "";
        const info = { phone: rawPhone, cleanPhone: cleanPh, email: email };
        if (mid) memMap[mid] = info;
        if (mname) memMap[mname] = info;
      }
    }

    const contributions = pageItems.map(function (item) {
      const row = item.data;
      const mIdVal = memberIdCol !== undefined ? String(row[memberIdCol] || "").trim() : "";
      const mNameVal = String(row[col["Member Name"]] || "").trim();
      const memInfo = (mIdVal && memMap[mIdVal.toLowerCase()]) || (mNameVal && memMap[mNameVal.toLowerCase()]) || {};

      return {
        rowNumber: item.rowNumber,
        date: formatDateValue_(row[col["Date"]], tz),
        name: mNameVal,
        memberId: mIdVal,
        phone: memInfo.phone || "",
        cleanPhone: memInfo.cleanPhone || "",
        email: memInfo.email || "",
        amount: formatCurrency_(row[col["Amount"]]),
        amountRaw: Number(row[col["Amount"]]) || 0,
        mode: modeCol !== undefined ? row[modeCol] : "",
        type: typeCol !== undefined ? row[typeCol] : "Monthly Contribution",
        tid: col["Transaction ID"] !== undefined ? String(row[col["Transaction ID"]] || "").trim() : "",
        status: col["Status"] !== undefined ? (String(row[col["Status"]] || "Approved").trim()) : "Approved",
        verifiedBy: col["Verified By"] !== undefined ? String(row[col["Verified By"]] || "").trim() : "",
      };
    });

    return {
      success: true,
      contributions: contributions,
      totalPages: totalPages,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Treasurer Approval / Rejection of a Contribution
 */
function updateContributionStatus(params) {
  const ctx = requirePermission_("contributionsWrite");
  const session = requireAccess_();
  const role = String(ctx.roleKey || session.roleKey || session.role || "").toLowerCase();
  const isPrivileged = role === ROLE_KEY.ADMIN || role === ROLE_KEY.TREASURER || (ctx.permissions && (ctx.permissions.isAdmin || ctx.permissions.contributionsWrite));

  if (!isPrivileged) {
    return { success: false, error: "Only the Treasurer or Admin can verify transactions (Your role: " + (ctx.roleLabel || role) + ")." };
  }

  const tid = String(params.tid || "").trim();
  const rowNumber = Number(params.rowNumber);
  const newStatus = String(params.status || "").trim(); // "Approved" or "Rejected"

  const ss = getSpreadsheet_();
  const sheet = getRequiredSheet_(SHEETS.CONTRIBUTIONS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = getHeaderMap_(headers);

  let targetRow = -1;
  if (tid && col["Transaction ID"] !== undefined) {
    for (let r = 1; r < values.length; r++) {
      if (String(values[r][col["Transaction ID"]] || "").trim() === tid) {
        targetRow = r + 1;
        break;
      }
    }
  }

  if (targetRow === -1 && rowNumber > 1 && rowNumber <= values.length) {
    targetRow = rowNumber;
  }

  if (targetRow === -1) {
    return { success: false, error: "Transaction record not found." };
  }

  if (col["Status"] !== undefined) {
    sheet.getRange(targetRow, col["Status"] + 1).setValue(newStatus);
  }
  if (col["Verified By"] !== undefined) {
    sheet.getRange(targetRow, col["Verified By"] + 1).setValue(session.email || "Treasurer");
  }

  // If this contribution is a Loan Repayment, also update the Loan Repayments sheet and credit the loan!
  try {
    const isLoanRepayment = String(values[targetRow - 1][col["Type"]] || "") === "Loan Repayment";
    const paymentAmount = Number(values[targetRow - 1][col["Amount"]]) || 0;
    const paymentMid = col["Member ID"] !== undefined ? String(values[targetRow - 1][col["Member ID"]] || "").trim() : "";

    if (isLoanRepayment && paymentAmount > 0) {
      const repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
      if (repSheet && repSheet.getLastRow() > 1) {
        const repVals = repSheet.getDataRange().getValues();
        const repCol = getHeaderMap_(repVals[0]);
        for (let rr = 1; rr < repVals.length; rr++) {
          const rMid = repCol["Member ID"] !== undefined ? String(repVals[rr][repCol["Member ID"]] || "").trim() : "";
          const rAmt = Number(repVals[rr][repCol["Total Paid"]]) || 0;
          if (rMid === paymentMid && rAmt === paymentAmount) {
            if (repCol["Status"] !== undefined) repSheet.getRange(rr + 1, repCol["Status"] + 1).setValue(newStatus);
            if (repCol["Verified By"] !== undefined) repSheet.getRange(rr + 1, repCol["Verified By"] + 1).setValue(session.email || "Treasurer");
            
            // Execute loan balance reduction waterfall if moving to Approved
            if (newStatus === "Approved") {
              const pId = repCol["Payment ID"] !== undefined ? String(repVals[rr][repCol["Payment ID"]] || "").trim() : "";
              if (pId) {
                updateLoanRepaymentStatus({ paymentId: pId, status: "Approved", skipReceipt: true });
              }
            }
            break;
          }
        }
      }
    }
  } catch (syncLRErr) {
    console.error("syncLRErr: " + syncLRErr.message);
  }

  appendAuditLog_(
    "contribution.status_update",
    "Contribution",
    tid || ("Row " + targetRow),
    "Updated contribution status to " + newStatus + " by " + (session.email || "Treasurer"),
    JSON.stringify({
      targetRow: targetRow,
      newStatus: newStatus,
      verifiedBy: session.email,
    })
  );

  clearDashboardCache_();

  let receiptResult = null;
  if (newStatus === "Approved") {
    try {
      const rowVals = sheet.getRange(targetRow, 1, 1, sheet.getLastColumn()).getValues()[0];
      const rowMid = col["Member ID"] !== undefined ? String(rowVals[col["Member ID"]] || "").trim() : "";
      const rowMName = col["Member Name"] !== undefined ? String(rowVals[col["Member Name"]] || "").trim() : "";
      const rowAmt = Number(rowVals[col["Amount"]]) || 0;
      const rowTid = col["Transaction ID"] !== undefined ? String(rowVals[col["Transaction ID"]] || "").trim() : tid;
      const rowType = col["Transaction Type"] !== undefined ? String(rowVals[col["Transaction Type"]] || "") : (col["Type"] !== undefined ? String(rowVals[col["Type"]] || "") : "Monthly Contribution");
      const chanA = col["Deposit Channel"] !== undefined ? String(rowVals[col["Deposit Channel"]] || "").trim() : "";
      const chanB = col["Payment Mode"] !== undefined ? String(rowVals[col["Payment Mode"]] || "").trim() : "";
      const rowChannel = chanA || chanB || "Equity Bank";
      const rowDate = col["Date"] !== undefined ? rowVals[col["Date"]] : new Date();

      receiptResult = triggerTransactionReceipt({
        receiptNo: "BL-RCP-" + (rowTid || ("ROW" + targetRow)),
        date: rowDate,
        memberId: rowMid,
        memberName: rowMName,
        amount: rowAmt,
        type: rowType,
        channel: rowChannel,
        tid: rowTid,
        isLoanRepayment: rowType === "Loan Repayment",
      });
    } catch (rErr) {
      console.error("Auto-receipt error in updateContributionStatus: " + rErr.message);
    }
  }

  return { success: true, receipt: receiptResult };
}
