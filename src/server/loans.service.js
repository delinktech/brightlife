function getLoansData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    const session = requireAccess_();
    const isMemberOnly = session.permissions && session.permissions.isMemberOnly;
    const callerMemberId = String(session.memberId || "").trim().toLowerCase();
    const callerMemberName = String(session.memberName || "").trim().toLowerCase();

    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.LOANS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, loans: [], totalPages: 0, totalRows: 0, currentPage: 1 };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      [
        "Loan ID",
        "Request Date",
        "Borrower Name",
        "Requested Amount",
        "Interest",
        "Transaction Fee",
        "Approved Date",
        "Repayment Amount",
        "Borrower’s Own Savings",
        "Total Guaranteed",
        "Shortfall Amount",
        "Total Paid",
        "Balance",
        "Status",
      ],
      SHEETS.LOANS
    );

    const memberIdCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

    // Find any loans guaranteed by this member if isMemberOnly
    var guaranteedLoanIds = {};
    if (isMemberOnly) {
      try {
        var gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
        if (gSheet && gSheet.getLastRow() > 1) {
          var gVals = gSheet.getDataRange().getValues();
          var gCol = getHeaderMap_(gVals[0]);
          for (var gi = 1; gi < gVals.length; gi++) {
            var gName = String(gVals[gi][gCol["Guarantor Name"]] || "").trim().toLowerCase();
            var gLoanId = String(gVals[gi][gCol["Loan ID"]] || "").trim();
            if (gLoanId && callerMemberName && (gName === callerMemberName || callerMemberName.indexOf(gName) !== -1 || gName.indexOf(callerMemberName) !== -1)) {
              guaranteedLoanIds[gLoanId] = true;
            }
          }
        }
      } catch (e) {
        console.error("Guarantor check error: " + e.message);
      }
    }

    const allRows = values
      .slice(1)
      .filter(function (row) {
        var loanId = String(row[col["Loan ID"]] || "").trim();
        if (!loanId) return false;

        if (isMemberOnly) {
          var borrower = String(row[col["Borrower Name"]] || "").trim().toLowerCase();
          var rowMid = memberIdCol !== undefined ? String(row[memberIdCol] || "").trim().toLowerCase() : "";
          var matchBorrower = (callerMemberId && rowMid === callerMemberId) ||
                              (callerMemberName && (borrower === callerMemberName || callerMemberName.indexOf(borrower) !== -1 || borrower.indexOf(callerMemberName) !== -1));
          var matchGuarantor = Boolean(guaranteedLoanIds[loanId]);
          return matchBorrower || matchGuarantor;
        }

        return true;
      })
      .reverse();

    const totalPages = Math.ceil(allRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const tz = ss.getSpreadsheetTimeZone();

    const loans = allRows.slice(start, start + pageLimit).map(function (row) {
      var borrower = row[col["Borrower Name"]] || "";
      var borrowerMemberId = memberIdCol !== undefined ? String(row[memberIdCol] || "").trim() : "";
      var isMyLoan = (callerMemberId && borrowerMemberId.toLowerCase() === callerMemberId) ||
                     (callerMemberName && borrower.toLowerCase().indexOf(callerMemberName) !== -1);
      return {
        id: row[col["Loan ID"]],
        date: formatDateValue_(row[col["Request Date"]], tz),
        borrower: borrower,
        memberId: borrowerMemberId,
        requested: Number(row[col["Requested Amount"]]) || 0,
        interest: Number(row[col["Interest"]]) || 0,
        trsfee: Number(row[col["Transaction Fee"]]) || 0,
        approveddate: formatDateValue_(row[col["Approved Date"]], tz),
        repayment: Number(row[col["Repayment Amount"]]) || 0,
        savings: Number(row[col["Borrower’s Own Savings"]]) || 0,
        guaranteed: Number(row[col["Total Guaranteed"]]) || 0,
        shortfall: Number(row[col["Shortfall Amount"]]) || 0,
        paid: Number(row[col["Total Paid"]]) || 0,
        principalPaid: col["Principal Paid"] !== undefined ? (Number(row[col["Principal Paid"]]) || 0) : 0,
        interestPaid: col["Interest Paid"] !== undefined ? (Number(row[col["Interest Paid"]]) || 0) : 0,
        feePaid: col["Fee Paid"] !== undefined ? (Number(row[col["Fee Paid"]]) || 0) : 0,
        balance: Number(row[col["Balance"]]) || 0,
        status: row[col["Status"]] || LOAN_STATUS.PENDING,
        isGuarantorOnly: isMemberOnly && !isMyLoan,
      };
    });

    return {
      success: true,
      loans: loans,
      totalPages: totalPages,
      totalRows: allRows.length,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get active/payable loans for a specific member/borrower
 */
function getMemberActiveLoans(memberId, memberName) {
  try {
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.LOANS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return { success: true, loans: [] };

    const headers = values[0];
    const col = getHeaderMap_(headers);
    const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

    let targetMid = String(memberId || "").trim().toLowerCase();
    let targetName = String(memberName || "").trim().toLowerCase();
    if (targetName.indexOf("—") !== -1) {
      const parts = targetName.split("—");
      if (!targetMid) targetMid = parts[0].trim().toLowerCase();
      targetName = parts.slice(1).join("—").trim().toLowerCase();
    }

    const activeLoans = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const loanId = String(row[col["Loan ID"]] || "").trim();
      const borrower = String(row[col["Borrower Name"]] || "").trim();
      const rowMid = midCol !== undefined ? String(row[midCol] || "").trim().toLowerCase() : "";
      const status = String(row[col["Status"]] || "").trim();
      const balance = Number(row[col["Balance"]]) || 0;
      const repayment = Number(row[col["Repayment Amount"]]) || 0;
      const paid = Number(row[col["Total Paid"]]) || 0;

      const statusLower = status.toLowerCase();
      if (!loanId || statusLower === "settled" || statusLower === "rejected") continue;

      const effectiveBalance = balance > 0 ? balance : Math.max(0, repayment - paid);

      const borrowerLower = borrower.toLowerCase();
      const match = (targetMid && rowMid === targetMid) ||
                    (targetName && (borrowerLower === targetName || borrowerLower.indexOf(targetName) !== -1 || targetName.indexOf(borrowerLower) !== -1));

      if (match) {
        activeLoans.push({
          loanId: loanId,
          borrower: borrower,
          memberId: rowMid,
          balance: effectiveBalance,
          repayment: repayment,
          paid: paid,
          status: status
        });
      }
    }

    return { success: true, loans: activeLoans };
  } catch (err) {
    return { success: false, error: err.message, loans: [] };
  }
}

function processLoanPayment(data) {
  requirePermission_("loanPayment");
  if (!data || !data.borrower || !data.amount) {
    return { success: false, error: "Borrower and amount are required." };
  }

  const ss = getSpreadsheet_();
  const sheet = getRequiredSheet_(SHEETS.LOANS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const col = getHeaderMap_(headers);

  requireHeaders_(
    col,
    ["Borrower Name", "Repayment Amount", "Total Paid", "Balance", "Status"],
    SHEETS.LOANS
  );

  let borrower = data.borrower.toString().trim();
  let memberId = String(data.memberId || "").trim();
  let explicitLoanId = String(data.loanId || "").trim().toLowerCase();

  if (borrower.indexOf("—") !== -1) {
    const parts = borrower.split("—");
    if (!memberId) memberId = parts[0].trim();
    borrower = parts.slice(1).join("—").trim();
  }
  const borrowerLower = borrower.toLowerCase();
  const memberIdLower = memberId.toLowerCase();
  const paymentAmount = Number(data.amount);
  let targetRowIndex = -1;

  const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

  for (let i = 1; i < values.length; i++) {
    const rowLoanId = String(values[i][col["Loan ID"]] || "").trim().toLowerCase();
    const rowBorrower = (values[i][col["Borrower Name"]] || "")
      .toString()
      .trim()
      .toLowerCase();
    const rowMid = midCol !== undefined ? String(values[i][midCol] || "").trim().toLowerCase() : "";
    const status = values[i][col["Status"]];

    if (status === LOAN_STATUS.SETTLED || status === LOAN_STATUS.REJECTED) continue;

    // If explicitLoanId was specified, match exactly
    if (explicitLoanId) {
      if (rowLoanId === explicitLoanId) {
        targetRowIndex = i + 1;
        break;
      }
    } else {
      const match = (memberIdLower && rowMid === memberIdLower) || (borrowerLower && (rowBorrower === borrowerLower || rowBorrower.indexOf(borrowerLower) !== -1 || borrowerLower.indexOf(rowBorrower) !== -1));
      if (match) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, error: "Active loan not found for borrower: " + data.borrower + (explicitLoanId ? " (" + explicitLoanId + ")" : "") };
  }

  const currentPaid = Number(values[targetRowIndex - 1][col["Total Paid"]]) || 0;
  const repaymentAmount = Number(values[targetRowIndex - 1][col["Repayment Amount"]]) || 0;
  const principalTotal = Number(values[targetRowIndex - 1][col["Requested Amount"]]) || 0;
  const interestTotal = Number(values[targetRowIndex - 1][col["Interest"]]) || 0;
  const trsFeeTotal = Number(values[targetRowIndex - 1][col["Transaction Fee"]]) || 0;

  const newTotalPaid = currentPaid + paymentAmount;
  const newBalance = Math.max(0, repaymentAmount - newTotalPaid);
  const newStatus = newBalance === 0 ? LOAN_STATUS.SETTLED : LOAN_STATUS.ACTIVE;

  // Waterfall Allocation of Cumulative Paid:
  // 1. Transaction Fee
  const allocFee = Math.min(newTotalPaid, trsFeeTotal);
  // 2. Interest
  const remAfterFee = Math.max(0, newTotalPaid - allocFee);
  const allocInterest = Math.min(remAfterFee, interestTotal);
  // 3. Principal
  const remAfterInterest = Math.max(0, remAfterFee - allocInterest);
  const allocPrincipal = Math.min(remAfterInterest, principalTotal);

  // Incremental split for this specific payment
  const curFeePaid = col["Fee Paid"] !== undefined ? (Number(values[targetRowIndex - 1][col["Fee Paid"]]) || 0) : Math.min(currentPaid, trsFeeTotal);
  const curInterestPaid = col["Interest Paid"] !== undefined ? (Number(values[targetRowIndex - 1][col["Interest Paid"]]) || 0) : Math.min(Math.max(0, currentPaid - curFeePaid), interestTotal);
  const curPrincipalPaid = col["Principal Paid"] !== undefined ? (Number(values[targetRowIndex - 1][col["Principal Paid"]]) || 0) : Math.min(Math.max(0, currentPaid - curFeePaid - curInterestPaid), principalTotal);

  const deltaFee = Math.max(0, allocFee - curFeePaid);
  const deltaInterest = Math.max(0, allocInterest - curInterestPaid);
  const deltaPrincipal = Math.max(0, allocPrincipal - curPrincipalPaid);

  const session = requireAccess_();
  const isAdminOrTreasurer = session.role === ROLE_KEY.ADMIN || session.role === ROLE_KEY.TREASURER;
  const initialStatus = (isAdminOrTreasurer && data.autoApprove) ? "Approved" : "Pending";
  const verifiedBy = (isAdminOrTreasurer && data.autoApprove) ? (session.email || "Treasurer") : "";

  // Only apply waterfall balance updates if Approved immediately; if Pending, hold until Treasurer approves
  const isApproved = initialStatus === "Approved";
  if (isApproved) {
    const canWriteLoanCol_ = function (colIdx) {
      if (colIdx === undefined) return false;
      if (typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(sheet, colIdx)) return false;
      const cell = sheet.getRange(targetRowIndex, colIdx + 1);
      return !(cell && typeof cell.getFormula === "function" && cell.getFormula());
    };
    if (canWriteLoanCol_(col["Total Paid"])) sheet.getRange(targetRowIndex, col["Total Paid"] + 1).setValue(newTotalPaid);
    if (canWriteLoanCol_(col["Balance"])) sheet.getRange(targetRowIndex, col["Balance"] + 1).setValue(newBalance);
    if (canWriteLoanCol_(col["Status"])) sheet.getRange(targetRowIndex, col["Status"] + 1).setValue(newStatus);
    if (canWriteLoanCol_(col["Principal Paid"])) sheet.getRange(targetRowIndex, col["Principal Paid"] + 1).setValue(allocPrincipal);
    if (canWriteLoanCol_(col["Interest Paid"])) sheet.getRange(targetRowIndex, col["Interest Paid"] + 1).setValue(allocInterest);
    if (canWriteLoanCol_(col["Fee Paid"])) sheet.getRange(targetRowIndex, col["Fee Paid"] + 1).setValue(allocFee);
  }

  const loanId = String(values[targetRowIndex - 1][col["Loan ID"]] || "");
  const rowLoanMid = midCol !== undefined ? String(values[targetRowIndex - 1][midCol] || "").trim() : memberId;
  const rowLoanBorrower = String(values[targetRowIndex - 1][col["Borrower Name"]] || borrower).trim();

  // 1. Record into dedicated LoanRepayments sub-ledger
  try {
    let repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
    if (!repSheet) {
      repSheet = ss.insertSheet(SHEETS.LOAN_REPAYMENTS);
      repSheet.appendRow([
        "Payment ID",
        "Loan ID",
        "Payment Date",
        "Member ID",
        "Borrower Name",
        "Total Paid",
        "Principal Paid",
        "Interest Paid",
        "Fee Paid",
        "Payment Mode",
        "Transaction ID",
        "Balance Remaining",
        "Status",
        "Verified By"
      ]);
      repSheet.setFrozenRows(1);
    }
    const paymentId = "PAY-" + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyyMMdd-HHmmss");
    const paymentDate = (data.date ? parseDateInput_(data.date) : null) || new Date();
    const repHeaders = repSheet.getRange(1, 1, 1, repSheet.getLastColumn()).getValues()[0];
    const repCol = getHeaderMap_(repHeaders);
    const repRow = new Array(repHeaders.length).fill("");

    if (repCol["Payment ID"] !== undefined) repRow[repCol["Payment ID"]] = paymentId;
    if (repCol["Loan ID"] !== undefined) repRow[repCol["Loan ID"]] = loanId;
    if (repCol["Payment Date"] !== undefined) repRow[repCol["Payment Date"]] = paymentDate;
    if (repCol["Member ID"] !== undefined) repRow[repCol["Member ID"]] = rowLoanMid;
    if (repCol["Borrower Name"] !== undefined) {
      repRow[repCol["Borrower Name"]] =
        (typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(repSheet, repCol["Borrower Name"]))
          ? ""
          : rowLoanBorrower;
    }
    if (repCol["Total Paid"] !== undefined) repRow[repCol["Total Paid"]] = paymentAmount;
    if (repCol["Principal Paid"] !== undefined) repRow[repCol["Principal Paid"]] = deltaPrincipal;
    if (repCol["Interest Paid"] !== undefined) repRow[repCol["Interest Paid"]] = deltaInterest;
    if (repCol["Fee Paid"] !== undefined) repRow[repCol["Fee Paid"]] = deltaFee;
    const repModeCol = repCol["Deposit Channel"] !== undefined ? repCol["Deposit Channel"] : repCol["Payment Mode"];
    if (repModeCol !== undefined) repRow[repModeCol] = data.mode || data.channel || "Equity Bank";
    if (repCol["Transaction ID"] !== undefined) repRow[repCol["Transaction ID"]] = data.tid || "";
    if (repCol["Balance Remaining"] !== undefined) repRow[repCol["Balance Remaining"]] = isApproved ? newBalance : (repaymentAmount - currentPaid);
    if (repCol["Status"] !== undefined) repRow[repCol["Status"]] = initialStatus;
    if (repCol["Verified By"] !== undefined) repRow[repCol["Verified By"]] = verifiedBy;

    repSheet.appendRow(repRow);
  } catch (rErr) {
    console.error("LoanRepayments sub-ledger write error: " + rErr.message);
  }

  // 2. Also log transaction into Contributions sheet as Loan Repayment stream
  try {
    const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
    if (cSheet && cSheet.getLastRow() >= 1) {
      const cVals = cSheet.getDataRange().getValues();
      const cCol = getHeaderMap_(cVals[0]);
      const nextRow = new Array(cVals[0].length).fill("");

      const paymentDate = (data.date ? parseDateInput_(data.date) : null) || new Date();
      if (cCol["Date"] !== undefined) nextRow[cCol["Date"]] = paymentDate;
      if (cCol["Member ID"] !== undefined) nextRow[cCol["Member ID"]] = rowLoanMid;
      if (cCol["Member Name"] !== undefined) {
        nextRow[cCol["Member Name"]] =
          (typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(cSheet, cCol["Member Name"]))
            ? ""
            : rowLoanBorrower;
      }
      if (cCol["Amount"] !== undefined) nextRow[cCol["Amount"]] = paymentAmount;
      const cModeCol = cCol["Deposit Channel"] !== undefined ? cCol["Deposit Channel"] : cCol["Payment Mode"];
      if (cModeCol !== undefined) nextRow[cModeCol] = data.mode || data.channel || "Equity Bank";
      if (cCol["Transaction ID"] !== undefined) nextRow[cCol["Transaction ID"]] = data.tid || "";
      const cTypeCol = cCol["Transaction Type"] !== undefined ? cCol["Transaction Type"] : cCol["Type"];
      if (cTypeCol !== undefined) nextRow[cTypeCol] = "Loan Repayment";
      if (cCol["Status"] !== undefined) nextRow[cCol["Status"]] = initialStatus;
      if (cCol["Verified By"] !== undefined) nextRow[cCol["Verified By"]] = verifiedBy;

      cSheet.appendRow(nextRow);
    }
  } catch (cErr) {
    console.error("Contributions stream append error: " + cErr.message);
  }

  appendAuditLog_(
    "loan.payment",
    "Loans",
    loanId,
    "Submitted repayment of KSh " + paymentAmount + " (" + initialStatus + ") for " + borrower + " (Principal: " + deltaPrincipal + ", Interest: " + deltaInterest + ", Fee: " + deltaFee + ")",
    JSON.stringify({
      borrower: borrower,
      memberId: memberId,
      paymentAmount: paymentAmount,
      principalPaid: deltaPrincipal,
      interestPaid: deltaInterest,
      feePaid: deltaFee,
      totalPrincipalPaid: allocPrincipal,
      totalInterestPaid: allocInterest,
      totalFeePaid: allocFee,
      newTotalPaid: newTotalPaid,
      newBalance: newBalance,
      status: initialStatus,
      verifiedBy: verifiedBy,
    })
  );

  clearDashboardCache_();

  let receiptResult = null;
  if (isApproved) {
    try {
      receiptResult = triggerTransactionReceipt({
        receiptNo: "BL-RCP-" + (data.tid || paymentId),
        date: paymentDate,
        memberId: rowLoanMid,
        memberName: rowLoanBorrower,
        amount: paymentAmount,
        type: "Loan Repayment",
        channel: data.mode || data.channel || "Equity Bank",
        tid: data.tid || paymentId,
        isLoanRepayment: true,
        principalPaid: deltaPrincipal,
        interestPaid: deltaInterest,
        feePaid: deltaFee,
        loanBalance: newBalance
      });
    } catch (rErr) {
      console.error("Auto receipt error: " + rErr.message);
    }
  }

  return { success: true, receipt: receiptResult };
}

/**
 * Fetch dedicated Loan Repayments Sub-Ledger records
 */
function getLoanRepaymentsData(loanId, page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 50;
  try {
    const session = requireAccess_();
    const isMemberOnly = session.permissions && session.permissions.isMemberOnly;
    const callerMemberId = String(session.memberId || "").trim().toLowerCase();
    const callerMemberName = String(session.memberName || "").trim().toLowerCase();

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
    if (!sheet || sheet.getLastRow() <= 1) {
      return { success: true, repayments: [], totalPages: 0, totalRows: 0, currentPage: 1 };
    }

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const col = getHeaderMap_(headers);
    const tz = ss.getSpreadsheetTimeZone();

    const targetLoanId = String(loanId || "").trim().toLowerCase();
    const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

    const allRows = values.slice(1).filter(function(row) {
      const rLoanId = String(row[col["Loan ID"]] || "").trim().toLowerCase();
      if (targetLoanId && rLoanId !== targetLoanId) return false;

      if (isMemberOnly) {
        const borrower = String(row[col["Borrower Name"]] || "").trim().toLowerCase();
        const rowMid = midCol !== undefined ? String(row[midCol] || "").trim().toLowerCase() : "";
        const matchBorrower = (callerMemberId && rowMid === callerMemberId) ||
                              (callerMemberName && (borrower === callerMemberName || callerMemberName.indexOf(borrower) !== -1 || borrower.indexOf(callerMemberName) !== -1));
        return matchBorrower;
      }
      return true;
    }).reverse();

    const totalPages = Math.ceil(allRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;

    const repayments = allRows.slice(start, start + pageLimit).map(function(row) {
      return {
        paymentId: row[col["Payment ID"]] || "",
        loanId: row[col["Loan ID"]] || "",
        date: formatDateValue_(row[col["Payment Date"]], tz),
        memberId: midCol !== undefined ? String(row[midCol] || "").trim() : "",
        borrower: row[col["Borrower Name"]] || "",
        totalPaid: Number(row[col["Total Paid"]]) || 0,
        principalPaid: Number(row[col["Principal Paid"]]) || 0,
        interestPaid: Number(row[col["Interest Paid"]]) || 0,
        feePaid: Number(row[col["Fee Paid"]]) || 0,
        mode: row[col["Payment Mode"]] || "",
        tid: row[col["Transaction ID"]] || "",
        balanceRemaining: Number(row[col["Balance Remaining"]]) || 0,
        status: col["Status"] !== undefined ? (String(row[col["Status"]] || "Approved").trim()) : "Approved",
        verifiedBy: col["Verified By"] !== undefined ? String(row[col["Verified By"]] || "").trim() : "",
      };
    });

    return {
      success: true,
      repayments: repayments,
      totalPages: totalPages,
      totalRows: allRows.length,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message, repayments: [] };
  }
}

/**
 * Treasurer Approval / Rejection of a Loan Repayment
 */
function updateLoanRepaymentStatus(params) {
  const ctx = requirePermission_("loanPayment");
  const session = requireAccess_();
  const role = String(ctx.roleKey || session.roleKey || session.role || "").toLowerCase();
  const isPrivileged = role === ROLE_KEY.ADMIN || role === ROLE_KEY.TREASURER || (ctx.permissions && (ctx.permissions.isAdmin || ctx.permissions.loanPayment));

  if (!isPrivileged) {
    return { success: false, error: "Only the Treasurer or Admin can verify repayments (Your role: " + (ctx.roleLabel || role) + ")." };
  }

  const paymentId = String(params.paymentId || "").trim();
  const newStatus = String(params.status || "").trim(); // "Approved" or "Rejected"
  if (!paymentId || !newStatus) {
    return { success: false, error: "Payment ID and Status are required." };
  }

  const ss = getSpreadsheet_();
  const repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
  if (!repSheet || repSheet.getLastRow() <= 1) {
    return { success: false, error: "LoanRepayments sheet empty." };
  }

  const repVals = repSheet.getDataRange().getValues();
  const repCol = getHeaderMap_(repVals[0]);
  let repRow = -1;
  for (let r = 1; r < repVals.length; r++) {
    if (String(repVals[r][repCol["Payment ID"]] || "").trim() === paymentId) {
      repRow = r + 1;
      break;
    }
  }

  if (repRow === -1) {
    return { success: false, error: "Payment record not found: " + paymentId };
  }

  const currentRepStatus = repCol["Status"] !== undefined ? String(repVals[repRow - 1][repCol["Status"]] || "").trim() : "Approved";
  if (currentRepStatus === newStatus) {
    return { success: true }; // already updated
  }

  const loanId = String(repVals[repRow - 1][repCol["Loan ID"]] || "").trim();
  const paymentAmount = Number(repVals[repRow - 1][repCol["Total Paid"]]) || 0;

  let computedLoanBalance = null;
  let allocPrincipalPaid = 0;
  let allocInterestPaid = 0;
  let allocFeePaid = 0;

  // If transitioning from Pending -> Approved, execute the waterfall balance reduction on the master Loans sheet
  if (currentRepStatus !== "Approved" && newStatus === "Approved") {
    const loanSheet = getRequiredSheet_(SHEETS.LOANS);
    const loanVals = loanSheet.getDataRange().getValues();
    const loanCol = getHeaderMap_(loanVals[0]);
    let targetLoanRow = -1;
    for (let l = 1; l < loanVals.length; l++) {
      if (String(loanVals[l][loanCol["Loan ID"]] || "").trim() === loanId) {
        targetLoanRow = l + 1;
        break;
      }
    }

    if (targetLoanRow !== -1) {
      const curPaid = Number(loanVals[targetLoanRow - 1][loanCol["Total Paid"]]) || 0;
      const repAmount = Number(loanVals[targetLoanRow - 1][loanCol["Repayment Amount"]]) || 0;
      const principalTotal = Number(loanVals[targetLoanRow - 1][loanCol["Requested Amount"]]) || 0;
      const interestTotal = Number(loanVals[targetLoanRow - 1][loanCol["Interest"]]) || 0;
      const feeTotal = Number(loanVals[targetLoanRow - 1][loanCol["Transaction Fee"]]) || 0;

      const newTotalPaid = curPaid + paymentAmount;
      const newBalance = Math.max(0, repAmount - newTotalPaid);
      const newStatusLoan = newBalance === 0 ? LOAN_STATUS.SETTLED : LOAN_STATUS.ACTIVE;

      const allocFee = Math.min(newTotalPaid, feeTotal);
      const remAfterFee = Math.max(0, newTotalPaid - allocFee);
      const allocInterest = Math.min(remAfterFee, interestTotal);
      const remAfterInterest = Math.max(0, remAfterFee - allocInterest);
      const allocPrincipal = Math.min(remAfterInterest, principalTotal);

      computedLoanBalance = newBalance;
      allocPrincipalPaid = allocPrincipal;
      allocInterestPaid = allocInterest;
      allocFeePaid = allocFee;

      const canWriteCol_ = function (colIdx) {
        if (colIdx === undefined) return false;
        if (typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(loanSheet, colIdx)) return false;
        const cell = loanSheet.getRange(targetLoanRow, colIdx + 1);
        return !(cell && typeof cell.getFormula === "function" && cell.getFormula());
      };
      if (canWriteCol_(loanCol["Total Paid"])) loanSheet.getRange(targetLoanRow, loanCol["Total Paid"] + 1).setValue(newTotalPaid);
      if (canWriteCol_(loanCol["Balance"])) loanSheet.getRange(targetLoanRow, loanCol["Balance"] + 1).setValue(newBalance);
      if (canWriteCol_(loanCol["Status"])) loanSheet.getRange(targetLoanRow, loanCol["Status"] + 1).setValue(newStatusLoan);
      if (canWriteCol_(loanCol["Principal Paid"])) loanSheet.getRange(targetLoanRow, loanCol["Principal Paid"] + 1).setValue(allocPrincipal);
      if (canWriteCol_(loanCol["Interest Paid"])) loanSheet.getRange(targetLoanRow, loanCol["Interest Paid"] + 1).setValue(allocInterest);
      if (canWriteCol_(loanCol["Fee Paid"])) loanSheet.getRange(targetLoanRow, loanCol["Fee Paid"] + 1).setValue(allocFee);
    }
  }

  // Update Status and Verified By in LoanRepayments sheet
  if (repCol["Status"] !== undefined) {
    repSheet.getRange(repRow, repCol["Status"] + 1).setValue(newStatus);
  }
  if (repCol["Verified By"] !== undefined) {
    repSheet.getRange(repRow, repCol["Verified By"] + 1).setValue(session.email || "Treasurer");
  }

  // Also update corresponding row in Contributions if found
  try {
    const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
    if (cSheet && cSheet.getLastRow() > 1) {
      const cVals = cSheet.getDataRange().getValues();
      const cCol = getHeaderMap_(cVals[0]);
      const repTid = String(repVals[repRow - 1][repCol["Transaction ID"]] || "").trim();
      const repMid = repCol["Member ID"] !== undefined ? String(repVals[repRow - 1][repCol["Member ID"]] || "").trim().toLowerCase() : "";
      const repDate = repCol["Payment Date"] !== undefined ? new Date(repVals[repRow - 1][repCol["Payment Date"]]) : null;

      let matchedRow = -1;
      // 1. First priority: match by Transaction ID / Receipt
      if (repTid && cCol["Transaction ID"] !== undefined) {
        for (let cr = 1; cr < cVals.length; cr++) {
          if (String(cVals[cr][cCol["Transaction ID"]] || "").trim() === repTid) {
            matchedRow = cr + 1;
            break;
          }
        }
      }

      // 2. Second priority: match by Member ID, Type == 'Loan Repayment', Amount, and Status == 'Pending' (closest row)
      if (matchedRow === -1) {
        for (let cr = cVals.length - 1; cr >= 1; cr--) {
          const cMid = cCol["Member ID"] !== undefined ? String(cVals[cr][cCol["Member ID"]] || "").trim().toLowerCase() : "";
          const cType = String(cVals[cr][cCol["Type"]] || "");
          const cAmt = Number(cVals[cr][cCol["Amount"]]) || 0;
          const cStatus = cCol["Status"] !== undefined ? String(cVals[cr][cCol["Status"]] || "").trim() : "";

          if (cType === "Loan Repayment" && cAmt === paymentAmount && (repMid ? cMid === repMid : true)) {
            // Prefer pending match if approving
            if (newStatus === "Approved" && cStatus === "Pending") {
              matchedRow = cr + 1;
              break;
            } else if (matchedRow === -1) {
              matchedRow = cr + 1;
            }
          }
        }
      }

      if (matchedRow !== -1) {
        if (cCol["Status"] !== undefined) cSheet.getRange(matchedRow, cCol["Status"] + 1).setValue(newStatus);
        if (cCol["Verified By"] !== undefined) cSheet.getRange(matchedRow, cCol["Verified By"] + 1).setValue(session.email || "Treasurer");
      }
    }
  } catch (cSyncErr) {
    console.error("Contributions sync status error: " + cSyncErr.message);
  }

  appendAuditLog_(
    "loan.repayment_status",
    "LoanRepayments",
    paymentId,
    "Repayment " + paymentId + " status updated to " + newStatus + " by " + (session.email || "Treasurer"),
    JSON.stringify({
      paymentId: paymentId,
      newStatus: newStatus,
      verifiedBy: session.email,
    })
  );

  clearDashboardCache_();

  let receiptResult = null;
  if (newStatus === "Approved" && !params.skipReceipt) {
    try {
      const repMid = repCol["Member ID"] !== undefined ? String(repVals[repRow - 1][repCol["Member ID"]] || "").trim() : "";
      const repBorrower = repCol["Borrower Name"] !== undefined ? String(repVals[repRow - 1][repCol["Borrower Name"]] || "").trim() : "";
      const chanA = repCol["Deposit Channel"] !== undefined ? String(repVals[repRow - 1][repCol["Deposit Channel"]] || "").trim() : "";
      const chanB = repCol["Payment Mode"] !== undefined ? String(repVals[repRow - 1][repCol["Payment Mode"]] || "").trim() : "";
      const repChannel = chanA || chanB || "Equity Bank";
      const repTid = repCol["Transaction ID"] !== undefined ? String(repVals[repRow - 1][repCol["Transaction ID"]] || "").trim() : paymentId;

      receiptResult = triggerTransactionReceipt({
        receiptNo: "BL-RCP-" + (repTid || paymentId),
        date: new Date(),
        memberId: repMid,
        memberName: repBorrower,
        amount: paymentAmount,
        type: "Loan Repayment",
        channel: repChannel,
        tid: repTid || paymentId,
        isLoanRepayment: true,
        principalPaid: allocPrincipalPaid,
        interestPaid: allocInterestPaid,
        feePaid: allocFeePaid,
        loanBalance: computedLoanBalance,
      });
    } catch (rErr) {
      console.error("Auto-receipt error in updateLoanRepaymentStatus: " + rErr.message);
    }
  }

  return { success: true, receipt: receiptResult };
}

/**
 * SET-1: Reads Group Loan Policy & Tenor Tiers from the Constants sheet
 * using the request-scoped SheetContext, falling back gracefully to defaults.
 */
function getLoanPolicySettings() {
  try {
    requireAccess_();
    const settings = {
      borrowerMultiplier: 3,
      interestRatePct: 10,
      minGuarantors: 2,
      tenorTiers: [
        { maxAmount: 50000, maxMonths: 3 },
        { maxAmount: 100000, maxMonths: 6 },
        { maxAmount: 999999999, maxMonths: 12 },
      ],
    };

    const ctx = typeof getRequestSheetContext_ === "function" ? getRequestSheetContext_() : null;
    try {
      const values = ctx
        ? ctx.getValues(SHEETS.CONSTANTS)
        : (function () {
            const s = getSheetByNameInsensitive_(getSpreadsheet_(), SHEETS.CONSTANTS);
            return s && s.getLastRow() >= 1 ? s.getDataRange().getValues() : [];
          })();

      if (values && values.length > 1) {
        const col = getHeaderMap_(values[0]);
        const paramIdx = col["loan policy parameter"];
        const valIdx = col["policy value"];
        if (paramIdx !== undefined && valIdx !== undefined) {
          for (let r = 1; r < values.length; r++) {
            const key = String(values[r][paramIdx] || "").trim().toLowerCase();
            const rawVal = Number(values[r][valIdx]);
            if (!key || !isFinite(rawVal)) continue;
            if (key === "borrower savings multiplier" && rawVal > 0) {
              settings.borrowerMultiplier = rawVal;
            } else if (key === "loan interest rate pct" && rawVal >= 0) {
              settings.interestRatePct = rawVal;
            } else if (key === "minimum guarantor count" && rawVal >= 0) {
              settings.minGuarantors = Math.round(rawVal);
            }
          }
        }

        const amtIdx = col["tenor tier max amount"];
        const moIdx = col["tenor tier max months"];
        if (amtIdx !== undefined && moIdx !== undefined) {
          const parsedTiers = [];
          for (let r = 1; r < values.length; r++) {
            const maxAmt = Number(values[r][amtIdx]);
            const maxMo = Number(values[r][moIdx]);
            if (isFinite(maxAmt) && maxAmt > 0 && isFinite(maxMo) && maxMo > 0) {
              parsedTiers.push({ maxAmount: maxAmt, maxMonths: Math.round(maxMo) });
            }
          }
          if (parsedTiers.length > 0) {
            parsedTiers.sort(function (a, b) {
              return a.maxAmount - b.maxAmount;
            });
            settings.tenorTiers = parsedTiers;
          }
        }
      }
    } finally {
      if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
    }

    return { ok: true, success: true, settings: settings, policy: settings };
  } catch (err) {
    return { ok: false, success: false, error: err.message };
  }
}

/**
 * SET-1: Validates and persists Group Loan Policy & Tenor Tiers to Constants,
 * restricted to Admin, Treasurer, and Chairperson roles, with full Audit Log entry.
 */
function saveLoanPolicySettings(payload) {
  let lock = null;
  try {
    const session = requireRole_(["Admin", "Treasurer", "Chairperson"]);
    const input = payload && typeof payload === "object" ? payload : {};

    const rawMultiplier = input.borrowerMultiplier !== undefined ? input.borrowerMultiplier : input.savingsMultiplier;
    const borrowerMultiplier = Number(rawMultiplier);
    const interestRatePct = Number(input.interestRatePct);
    const minGuarantors = Number(input.minGuarantors);
    const rawTiers = Array.isArray(input.tenorTiers) ? input.tenorTiers : [];

    if (!isFinite(borrowerMultiplier) || borrowerMultiplier < 1 || borrowerMultiplier > 10) {
      throw new Error("Borrower Savings Multiplier must be between 1 and 10.");
    }
    if (!isFinite(interestRatePct) || interestRatePct < 0 || interestRatePct > 100) {
      throw new Error("Loan Interest Rate Pct must be between 0 and 100.");
    }
    if (!isFinite(minGuarantors) || minGuarantors < 0 || minGuarantors > 20 || Math.floor(minGuarantors) !== minGuarantors) {
      throw new Error("Minimum Guarantor Count must be a whole number between 0 and 20.");
    }
    if (rawTiers.length === 0) {
      throw new Error("At least one valid tenor tier is required.");
    }

    const cleanTiers = rawTiers.map(function (t) {
      const maxAmt = Number(t && t.maxAmount);
      const maxMo = Number(t && t.maxMonths);
      if (!isFinite(maxAmt) || maxAmt <= 0 || !isFinite(maxMo) || maxMo <= 0) {
        throw new Error("All tenor tiers must have positive Max Amount and Max Months.");
      }
      return { maxAmount: maxAmt, maxMonths: Math.round(maxMo) };
    });
    cleanTiers.sort(function (a, b) {
      return a.maxAmount - b.maxAmount;
    });

    lock = LockService.getScriptLock();
    lock.waitLock(15000);

    const ss = getSpreadsheet_();
    if (typeof provisionConstantsReferenceTables_ === "function") {
      provisionConstantsReferenceTables_(ss);
    }
    const sheet = getSheetByNameInsensitive_(ss, SHEETS.CONSTANTS);
    if (!sheet) {
      throw new Error("Constants sheet could not be provisioned.");
    }

    const lastRow = Math.max(sheet.getLastRow(), 1);
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const col = getHeaderMap_(headers);

    const paramIdx = col["loan policy parameter"];
    const valIdx = col["policy value"];
    const amtIdx = col["tenor tier max amount"];
    const moIdx = col["tenor tier max months"];

    if (paramIdx === undefined || valIdx === undefined || amtIdx === undefined || moIdx === undefined) {
      throw new Error("Loan policy columns are missing from Constants sheet.");
    }

    const paramTargets = {
      "borrower savings multiplier": borrowerMultiplier,
      "loan interest rate pct": interestRatePct,
      "minimum guarantor count": minGuarantors,
    };
    const paramNames = {
      "borrower savings multiplier": "Borrower Savings Multiplier",
      "loan interest rate pct": "Loan Interest Rate Pct",
      "minimum guarantor count": "Minimum Guarantor Count",
    };

    const existingRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    const foundParams = {};
    for (let r = 0; r < existingRows.length; r++) {
      const k = String(existingRows[r][paramIdx] || "").trim().toLowerCase();
      if (paramTargets[k] !== undefined) {
        sheet.getRange(r + 2, valIdx + 1).setValue(paramTargets[k]);
        foundParams[k] = true;
      }
    }

    let appendRowCursor = lastRow + 1;
    Object.keys(paramTargets).forEach(function (k) {
      if (!foundParams[k]) {
        sheet.getRange(appendRowCursor, paramIdx + 1).setValue(paramNames[k]);
        sheet.getRange(appendRowCursor, valIdx + 1).setValue(paramTargets[k]);
        appendRowCursor++;
      }
    });

    const clearTierCount = Math.max(existingRows.length, cleanTiers.length);
    if (clearTierCount > 0) {
      const tierGrid = [];
      for (let i = 0; i < clearTierCount; i++) {
        if (i < cleanTiers.length) {
          tierGrid.push([cleanTiers[i].maxAmount, cleanTiers[i].maxMonths]);
        } else {
          tierGrid.push(["", ""]);
        }
      }
      if (moIdx === amtIdx + 1) {
        sheet.getRange(2, amtIdx + 1, clearTierCount, 2).setValues(tierGrid);
      } else {
        sheet.getRange(2, amtIdx + 1, clearTierCount, 1).setValues(tierGrid.map(function (row) { return [row[0]]; }));
        sheet.getRange(2, moIdx + 1, clearTierCount, 1).setValues(tierGrid.map(function (row) { return [row[1]]; }));
      }
    }

    SpreadsheetApp.flush();
    if (typeof invalidateSheetContextCache_ === "function") invalidateSheetContextCache_(SHEETS.CONSTANTS);
    if (typeof clearDashboardCache_ === "function") clearDashboardCache_();

    const cleanSettings = {
      borrowerMultiplier: borrowerMultiplier,
      interestRatePct: interestRatePct,
      minGuarantors: minGuarantors,
      tenorTiers: cleanTiers,
    };

    if (typeof appendAuditLog_ === "function") {
      appendAuditLog_(
        "loan_policy.updated",
        "LoanPolicy",
        SHEETS.CONSTANTS,
        "Updated group loan policy settings (multiplier=" + borrowerMultiplier + "x, rate=" + interestRatePct + "%, minGuarantors=" + minGuarantors + ")",
        JSON.stringify({
          actorEmail: session.email || (typeof getCurrentUserEmail_ === "function" ? getCurrentUserEmail_() : ""),
          settings: cleanSettings,
        })
      );
    }

    return {
      ok: true,
      success: true,
      message: "Loan policy settings updated successfully.",
      settings: cleanSettings,
      policy: cleanSettings,
    };
  } catch (err) {
    return { ok: false, success: false, error: err.message };
  } finally {
    if (lock) {
      try {
        lock.releaseLock();
      } catch (eLock) {}
    }
  }
}
