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
        tenorMonths: (col["Loan Tenor"] !== undefined && row[col["Loan Tenor"]]) ? (Number(row[col["Loan Tenor"]]) || 12) : ((col["Tenor"] !== undefined && row[col["Tenor"]]) ? (Number(row[col["Tenor"]]) || 12) : 12),
        purpose: (col["Loan Purpose"] !== undefined && row[col["Loan Purpose"]]) ? String(row[col["Loan Purpose"]]).trim() : ((col["Purpose"] !== undefined && row[col["Purpose"]]) ? String(row[col["Purpose"]]).trim() : "Business"),
        reviewedBy: col["Reviewed By"] !== undefined ? String(row[col["Reviewed By"]] || "") : "",
        reviewedDate: col["Reviewed Date"] !== undefined ? formatDateValue_(row[col["Reviewed Date"]], tz) : "",
        approvedBy: col["Approved By"] !== undefined ? String(row[col["Approved By"]] || "") : "",
        reviewNotes: col["Review Notes"] !== undefined ? String(row[col["Review Notes"]] || "") : "",
        disbursementChannel: col["Disbursement Channel"] !== undefined ? String(row[col["Disbursement Channel"]] || "") : "",
        disbursementReference: col["Disbursement Reference"] !== undefined ? String(row[col["Disbursement Reference"]] || "") : "",
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

/**
 * UI-2: Native Dashboard Loan Application Workflow.
 * Validates borrower eligibility, tenor tier, and guarantor coverage against live
 * Constants policy settings, then atomically appends to Loans & Guarantors while
 * leaving Row 2 spill-formula columns blank.
 */
function submitLoanApplication(payload) {
  let lock = null;
  try {
    const session = requireAccess_();
    const input = payload && typeof payload === "object" ? payload : {};

    const requestedMemberId = String(input.memberId || input.borrowerId || session.memberId || "").trim();
    if (!requestedMemberId) {
      throw new Error("Member ID is required to submit a loan application.");
    }
    if (session.permissions && session.permissions.isMemberOnly) {
      const callerMid = String(session.memberId || "").trim().toLowerCase();
      if (!callerMid || callerMid !== requestedMemberId.toLowerCase()) {
        throw new Error("Access denied: You can only submit a loan application for your own Member ID.");
      }
    }

    const rawAmount = input.requestedAmount !== undefined ? input.requestedAmount : input.amount;
    const requestedAmount = Number(rawAmount);
    if (!isFinite(requestedAmount) || requestedAmount <= 0) {
      throw new Error("Requested loan amount must be greater than zero.");
    }

    const tenorMonths = Number(input.tenorMonths);
    if (!isFinite(tenorMonths) || tenorMonths <= 0 || Math.floor(tenorMonths) !== tenorMonths) {
      throw new Error("Loan tenor must be a positive whole number of months.");
    }

    // 1. Read active loan policy settings
    const policyRes = getLoanPolicySettings();
    const policy = (policyRes && (policyRes.settings || policyRes.policy)) || {
      borrowerMultiplier: 3,
      interestRatePct: 10,
      minGuarantors: 2,
      tenorTiers: [
        { maxAmount: 50000, maxMonths: 3 },
        { maxAmount: 100000, maxMonths: 6 },
        { maxAmount: 999999999, maxMonths: 12 },
      ],
    };

    // 2. Validate tenor against matching tier
    const tiers = Array.isArray(policy.tenorTiers) && policy.tenorTiers.length > 0
      ? policy.tenorTiers.slice().sort(function (a, b) { return a.maxAmount - b.maxAmount; })
      : [{ maxAmount: 999999999, maxMonths: 12 }];
    let matchedTier = tiers[tiers.length - 1];
    for (let t = 0; t < tiers.length; t++) {
      if (requestedAmount <= Number(tiers[t].maxAmount)) {
        matchedTier = tiers[t];
        break;
      }
    }
    const maxAllowedMonths = Number(matchedTier.maxMonths) || 12;
    if (tenorMonths > maxAllowedMonths) {
      throw new Error(
        "Requested tenor (" + tenorMonths + " months) exceeds the maximum allowed " +
        maxAllowedMonths + " months for a loan of KES " + requestedAmount.toLocaleString() + "."
      );
    }

    // 3. Acquire lock before reading Members / Loans / Guarantors for atomic validation & write
    lock = LockService.getScriptLock();
    lock.waitLock(15000);

    const ss = getSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone() || "Africa/Nairobi";

    // Build member lookup map from SHEETS.MEMBERS
    const memberSheet = getRequiredSheet_(SHEETS.MEMBERS);
    const mValues = memberSheet.getDataRange().getValues();
    if (mValues.length <= 1) {
      throw new Error("Members registry is empty.");
    }
    const mCol = getHeaderMap_(mValues[0]);
    requireHeaders_(mCol, ["Member ID", "Total Savings"], SHEETS.MEMBERS);

    const memberMap = {};
    for (let r = 1; r < mValues.length; r++) {
      const row = mValues[r];
      const mid = String(row[mCol["Member ID"]] || "").trim();
      if (!mid) continue;
      const first = mCol["First Name"] !== undefined ? String(row[mCol["First Name"]] || "").trim() : "";
      const last = mCol["Last Name"] !== undefined ? String(row[mCol["Last Name"]] || "").trim() : "";
      const fullName = mCol["Full Name"] !== undefined && row[mCol["Full Name"]]
        ? String(row[mCol["Full Name"]]).trim()
        : [first, last].filter(Boolean).join(" ");
      memberMap[mid.toLowerCase()] = {
        memberId: mid,
        fullName: fullName || mid,
        savings: Number(row[mCol["Total Savings"]]) || 0,
      };
    }

    const borrower = memberMap[requestedMemberId.toLowerCase()];
    if (!borrower) {
      throw new Error("Borrower member not found: " + requestedMemberId);
    }

    const maxEligible = Math.round(borrower.savings * policy.borrowerMultiplier * 100) / 100;
    if (requestedAmount > maxEligible) {
      throw new Error(
        "Requested amount (KES " + requestedAmount.toLocaleString() + ") exceeds maximum borrowing limit of KES " +
        maxEligible.toLocaleString() + " (" + policy.borrowerMultiplier + "x your savings of KES " +
        borrower.savings.toLocaleString() + ")."
      );
    }

    // 4. Read Loans & Guarantors under lock to compute existing guarantee liabilities and Loan ID sequence
    const loanSheet = getRequiredSheet_(SHEETS.LOANS);
    const loanValues = loanSheet.getDataRange().getValues();
    if (loanValues.length < 1) {
      throw new Error("Loans sheet header row is missing.");
    }
    const loanHeaders = loanValues[0];
    const loanCol = getHeaderMap_(loanHeaders);
    requireHeaders_(loanCol, ["Loan ID", "Member ID", "Requested Amount", "Status"], SHEETS.LOANS);

    const existingLoanIds = {};
    const loanStatusMap = {};
    const dateStamp = Utilities.formatDate(new Date(), tz, "yyyyMMdd");
    const idPrefix = "BLLN-" + dateStamp + "-";
    const legacyPrefix = "LN-" + dateStamp + "-";
    let maxSeq = 0;

    for (let i = 1; i < loanValues.length; i++) {
      const existingId = String(loanValues[i][loanCol["Loan ID"]] || "").trim();
      if (!existingId) continue;
      existingLoanIds[existingId.toUpperCase()] = true;
      loanStatusMap[existingId.toLowerCase()] = String(loanValues[i][loanCol["Status"]] || "").trim().toLowerCase();
      if (existingId.indexOf(idPrefix) === 0) {
        const seqPart = parseInt(existingId.slice(idPrefix.length), 10);
        if (!isNaN(seqPart) && seqPart > maxSeq) maxSeq = seqPart;
      } else if (existingId.indexOf(legacyPrefix) === 0) {
        const seqPart = parseInt(existingId.slice(legacyPrefix.length), 10);
        if (!isNaN(seqPart) && seqPart > maxSeq) maxSeq = seqPart;
      }
    }

    const gSheet = getRequiredSheet_(SHEETS.GUARANTORS);
    const gValues = gSheet.getDataRange().getValues();
    if (gValues.length < 1) {
      throw new Error("Guarantors sheet header row is missing.");
    }
    const gHeaders = gValues[0];
    const gCol = getHeaderMap_(gHeaders);
    requireHeaders_(gCol, ["Loan ID", "Member ID", "Guaranteed Amount"], SHEETS.GUARANTORS);

    const existingGuaranteesByMember = {};
    for (let r = 1; r < gValues.length; r++) {
      const gRow = gValues[r];
      const gLoanId = String(gRow[gCol["Loan ID"]] || "").trim().toLowerCase();
      const gMemId = String(gRow[gCol["Member ID"]] || "").trim().toLowerCase();
      if (!gMemId) continue;
      const gPledged = Number(gRow[gCol["Guaranteed Amount"]]) || 0;
      if (gPledged <= 0) continue;

      const statusFromLoans = loanStatusMap[gLoanId];
      const fallbackStatus = gCol["Loan Status"] !== undefined ? String(gRow[gCol["Loan Status"]] || "").trim().toLowerCase() : "";
      const effStatus = statusFromLoans !== undefined ? statusFromLoans : fallbackStatus;
      if (effStatus !== "settled" && effStatus !== "rejected" && effStatus !== "closed") {
        existingGuaranteesByMember[gMemId] = (existingGuaranteesByMember[gMemId] || 0) + gPledged;
      }
    }

    const fmtCur = function (v) {
      return typeof formatCurrency_ === "function" ? formatCurrency_(v) : "KES " + Number(v || 0).toLocaleString();
    };

    // 5. Validate guarantors against unencumbered savings
    const rawGuarantors = Array.isArray(input.guarantors) ? input.guarantors : [];
    const seenGuarantors = {};
    const validGuarantors = [];
    let totalGuaranteed = 0;

    for (let g = 0; g < rawGuarantors.length; g++) {
      const item = rawGuarantors[g] || {};
      const gMid = String(item.memberId || "").trim();
      const gAmt = Number(item.amount !== undefined ? item.amount : item.guaranteedAmount);
      if (!gMid) continue;

      const gLower = gMid.toLowerCase();
      if (gLower === borrower.memberId.toLowerCase()) {
        throw new Error("Borrower cannot guarantee their own loan.");
      }
      if (seenGuarantors[gLower]) {
        throw new Error("Duplicate guarantor selected: " + gMid);
      }
      if (!isFinite(gAmt) || gAmt <= 0) {
        throw new Error("Guaranteed amount for " + gMid + " must be greater than zero.");
      }
      const gMember = memberMap[gLower];
      if (!gMember) {
        throw new Error("Guarantor member not found: " + gMid);
      }
      const existingGuarantees = Math.round((existingGuaranteesByMember[gLower] || 0) * 100) / 100;
      const guarantorUnencumbered = Math.max(0, Math.round((gMember.savings - existingGuarantees) * 100) / 100);
      if (guarantorUnencumbered <= 0 || gAmt > guarantorUnencumbered) {
        throw new Error(
          "Guarantor " + gMember.fullName + " does not have sufficient unencumbered guarantee capacity for the pledged amount."
        );
      }

      seenGuarantors[gLower] = true;
      totalGuaranteed += gAmt;
      validGuarantors.push({
        memberId: gMember.memberId,
        fullName: gMember.fullName,
        amount: Math.round(gAmt * 100) / 100,
      });
    }

    if (validGuarantors.length < policy.minGuarantors) {
      throw new Error(
        "At least " + policy.minGuarantors + " valid guarantor(s) are required (provided " + validGuarantors.length + ")."
      );
    }

    const totalCoverage = borrower.savings + totalGuaranteed;
    if (totalCoverage < requestedAmount) {
      throw new Error(
        "Total loan coverage (Borrower Savings + Guaranteed Amounts = KES " + totalCoverage.toLocaleString() +
        ") must be at least the requested amount (KES " + requestedAmount.toLocaleString() + ")."
      );
    }

    // 6. Calculate financials & generate collision-free Loan ID: BLLN-YYYYMMDD-XXX
    const interest = Math.round(requestedAmount * (policy.interestRatePct / 100) * 100) / 100;
    const fee = 0.00;

    let nextSeq = maxSeq + 1;
    let loanId = idPrefix + String(nextSeq).padStart(3, "0");
    while (existingLoanIds[loanId.toUpperCase()]) {
      nextSeq++;
      loanId = idPrefix + String(nextSeq).padStart(3, "0");
    }

    // 7. Atomic append to SHEETS.LOANS (leaving Row 2 spill formula columns blank "")
    const loanRow = new Array(loanHeaders.length).fill("");
    if (loanCol["Request Date"] !== undefined) loanRow[loanCol["Request Date"]] = new Date();
    if (loanCol["Loan ID"] !== undefined) loanRow[loanCol["Loan ID"]] = loanId;
    if (loanCol["Member ID"] !== undefined) loanRow[loanCol["Member ID"]] = borrower.memberId;
    if (loanCol["Requested Amount"] !== undefined) loanRow[loanCol["Requested Amount"]] = requestedAmount;
    if (loanCol["Interest"] !== undefined) loanRow[loanCol["Interest"]] = interest;
    if (loanCol["Transaction Fee"] !== undefined) loanRow[loanCol["Transaction Fee"]] = fee;
    if (loanCol["Status"] !== undefined) loanRow[loanCol["Status"]] = "Pending Review";
    loanSheet.appendRow(loanRow);

    // 8. Atomic append to SHEETS.GUARANTORS (leaving Row 2 spill formula columns blank "")
    validGuarantors.forEach(function (g) {
      const gRow = new Array(gHeaders.length).fill("");
      if (gCol["Loan ID"] !== undefined) gRow[gCol["Loan ID"]] = loanId;
      if (gCol["Member ID"] !== undefined) gRow[gCol["Member ID"]] = g.memberId;
      if (gCol["Guaranteed Amount"] !== undefined) gRow[gCol["Guaranteed Amount"]] = g.amount;
      gSheet.appendRow(gRow);
    });

    SpreadsheetApp.flush();

    if (typeof appendAuditLog_ === "function") {
      appendAuditLog_(
        "loan.application_submitted",
        "Loans",
        loanId,
        "Submitted loan application " + loanId + " for " + borrower.fullName + " (KES " + requestedAmount.toLocaleString() + ", " + tenorMonths + "m)",
        JSON.stringify({
          loanId: loanId,
          memberId: borrower.memberId,
          requestedAmount: requestedAmount,
          interest: interest,
          tenorMonths: tenorMonths,
          guarantors: validGuarantors,
          purpose: String(input.purpose || "").trim(),
        })
      );
    }

    if (typeof invalidateSheetContextCache_ === "function") {
      invalidateSheetContextCache_(SHEETS.LOANS);
      invalidateSheetContextCache_(SHEETS.GUARANTORS);
    }
    if (typeof clearDashboardCache_ === "function") clearDashboardCache_();

    return {
      ok: true,
      success: true,
      loanId: loanId,
      message: "Loan application submitted successfully.",
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

/**
 * Computes unencumbered savings per member (Total Savings minus active/pending guarantees)
 * for internal server-side guarantor eligibility checks.
 */
function computeMemberUnencumberedMap_(ss) {
  const mValues = typeof getSheetValuesCached_ === "function"
    ? getSheetValuesCached_(ss, SHEETS.MEMBERS, { required: true })
    : getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();
  const lValues = typeof getSheetValuesCached_ === "function"
    ? getSheetValuesCached_(ss, SHEETS.LOANS)
    : (function () {
        const s = ss.getSheetByName(SHEETS.LOANS);
        return s && s.getLastRow() >= 1 ? s.getDataRange().getValues() : [];
      })();
  const gValues = typeof getSheetValuesCached_ === "function"
    ? getSheetValuesCached_(ss, SHEETS.GUARANTORS)
    : (function () {
        const s = ss.getSheetByName(SHEETS.GUARANTORS);
        return s && s.getLastRow() >= 1 ? s.getDataRange().getValues() : [];
      })();

  const loanStatusMap = {};
  if (lValues && lValues.length > 1) {
    const lCol = getHeaderMap_(lValues[0]);
    const lidIdx = lCol["Loan ID"];
    const statIdx = lCol["Status"];
    if (lidIdx !== undefined) {
      for (let i = 1; i < lValues.length; i++) {
        const lid = String(lValues[i][lidIdx] || "").trim().toLowerCase();
        if (lid) {
          loanStatusMap[lid] = statIdx !== undefined ? String(lValues[i][statIdx] || "").trim().toLowerCase() : "";
        }
      }
    }
  }

  const pledgedByMember = {};
  if (gValues && gValues.length > 1) {
    const gCol = getHeaderMap_(gValues[0]);
    const gLidIdx = gCol["Loan ID"];
    const gMidIdx = gCol["Member ID"];
    const gAmtIdx = gCol["Guaranteed Amount"];
    const gStatIdx = gCol["Loan Status"];
    if (gMidIdx !== undefined && gAmtIdx !== undefined) {
      for (let r = 1; r < gValues.length; r++) {
        const mid = String(gValues[r][gMidIdx] || "").trim().toLowerCase();
        if (!mid) continue;
        const amt = Number(gValues[r][gAmtIdx]) || 0;
        if (amt <= 0) continue;
        const lid = gLidIdx !== undefined ? String(gValues[r][gLidIdx] || "").trim().toLowerCase() : "";
        const st = (lid && loanStatusMap[lid] !== undefined)
          ? loanStatusMap[lid]
          : (gStatIdx !== undefined ? String(gValues[r][gStatIdx] || "").trim().toLowerCase() : "");
        if (st !== "settled" && st !== "rejected" && st !== "closed") {
          pledgedByMember[mid] = (pledgedByMember[mid] || 0) + amt;
        }
      }
    }
  }

  const members = [];
  if (mValues && mValues.length > 1) {
    const mCol = getHeaderMap_(mValues[0]);
    const midIdx = mCol["Member ID"];
    const fIdx = mCol["First Name"];
    const mIdx = mCol["Middle Name"];
    const lIdx = mCol["Last Name"];
    const fullIdx = mCol["Full Name"];
    const savIdx = mCol["Total Savings"];
    const statIdx = mCol["Status"];
    for (let r = 1; r < mValues.length; r++) {
      const row = mValues[r];
      const mid = midIdx !== undefined ? String(row[midIdx] || "").trim() : "";
      if (!mid) continue;
      const status = statIdx !== undefined ? String(row[statIdx] || "Active").trim().toLowerCase() : "active";
      if (status !== "active") continue;
      const first = fIdx !== undefined ? String(row[fIdx] || "").trim() : "";
      const middle = mIdx !== undefined ? String(row[mIdx] || "").trim() : "";
      const last = lIdx !== undefined ? String(row[lIdx] || "").trim() : "";
      const initial = middle ? middle.charAt(0) + "." : "";
      const name = (fullIdx !== undefined && row[fullIdx])
        ? String(row[fullIdx]).trim()
        : [first, initial, last].filter(Boolean).join(" ").trim();
      const savings = savIdx !== undefined ? (Number(row[savIdx]) || 0) : 0;
      const pledged = pledgedByMember[mid.toLowerCase()] || 0;
      const unencumbered = Math.max(0, Math.round((savings - pledged) * 100) / 100);
      members.push({
        id: mid,
        name: name || mid,
        unencumbered: unencumbered,
        eligible: unencumbered > 0,
      });
    }
  }
  return members;
}

/**
 * Privacy-safe guarantor directory for the Loan Application modal.
 * Returns ONLY { id, name, eligible } with zero numeric savings/balances.
 */
function getEligibleGuarantorDirectory() {
  try {
    requireAccess_();
    const ctx = typeof getRequestSheetContext_ === "function" ? getRequestSheetContext_() : null;
    try {
      const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
      const list = computeMemberUnencumberedMap_(ss).map(function (m) {
        return { id: m.id, name: m.name, eligible: m.eligible };
      });
      return { ok: true, success: true, guarantors: list };
    } finally {
      if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
    }
  } catch (err) {
    return { ok: false, success: false, error: err.message, guarantors: [] };
  }
}

/**
 * Privacy-safe server check for whether a guarantor has sufficient unencumbered savings
 * for a requested pledge amount, without exposing their exact balance.
 */
function checkGuarantorCapacity(guarantorId, amount) {
  try {
    requireAccess_();
    const gId = String(guarantorId || "").trim().toLowerCase();
    const reqAmt = Number(amount) || 0;
    if (!gId || reqAmt <= 0) {
      return { ok: true, sufficient: false };
    }
    const ctx = typeof getRequestSheetContext_ === "function" ? getRequestSheetContext_() : null;
    try {
      const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
      const list = computeMemberUnencumberedMap_(ss);
      const found = list.find(function (m) { return m.id.toLowerCase() === gId; });
      const sufficient = Boolean(found && found.unencumbered > 0 && reqAmt <= found.unencumbered);
      return { ok: true, sufficient: sufficient };
    } finally {
      if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
    }
  } catch (err) {
    return { ok: false, sufficient: false, error: err.message };
  }
}

/**
 * Fetches the list of guarantors and their unencumbered capacity for a specific loan.
 */
function getLoanGuarantors(loanId) {
  try {
    requireAccess_();
    const lid = String(loanId || "").trim();
    if (!lid) {
      return { ok: true, success: true, loanId: "", guarantors: [] };
    }
    const ss = getSpreadsheet_();
    const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
    if (!gSheet || gSheet.getLastRow() <= 1) {
      return { ok: true, success: true, loanId: lid, guarantors: [] };
    }

    const gVals = gSheet.getDataRange().getValues();
    const gCol = getHeaderMap_(gVals[0]);
    const gLidCol = gCol["Loan ID"];
    const gMidCol = gCol["Member ID"];
    const gNameCol = gCol["Guarantor Name"];
    const gAmtCol = gCol["Guaranteed Amount"];
    const gStatusCol = gCol["Status"] !== undefined ? gCol["Status"] : (gCol["Loan Status"] !== undefined ? gCol["Loan Status"] : gCol["Guarantor Status"]);

    if (gLidCol === undefined || gMidCol === undefined) {
      return { ok: true, success: true, loanId: lid, guarantors: [] };
    }

    // Unencumbered capacity map
    const unencMap = {};
    try {
      const list = computeMemberUnencumberedMap_(ss);
      list.forEach(function (m) {
        unencMap[String(m.id || "").trim().toLowerCase()] = m.unencumbered || 0;
      });
    } catch (eU) {
      console.warn("computeMemberUnencumberedMap_ in getLoanGuarantors: " + eU.message);
    }

    const guarantors = [];
    const lidLower = lid.toLowerCase();
    for (let r = 1; r < gVals.length; r++) {
      const rowLid = String(gVals[r][gLidCol] || "").trim().toLowerCase();
      if (rowLid === lidLower) {
        const mid = String(gVals[r][gMidCol] || "").trim();
        const name = gNameCol !== undefined ? String(gVals[r][gNameCol] || "").trim() : "";
        const amt = gAmtCol !== undefined ? (Number(gVals[r][gAmtCol]) || 0) : 0;
        const st = gStatusCol !== undefined ? String(gVals[r][gStatusCol] || "").trim() : "Pending";
        const unenc = unencMap[mid.toLowerCase()] !== undefined ? unencMap[mid.toLowerCase()] : 0;

        guarantors.push({
          memberId: mid,
          fullName: name || mid,
          amount: amt,
          status: st,
          unencumbered: unenc,
        });
      }
    }

    return { ok: true, success: true, loanId: lid, guarantors: guarantors };
  } catch (err) {
    return { ok: false, success: false, error: err.message, guarantors: [] };
  }
}

/* ------------------------------------------------------------------ *
 * GOV-1: Multi-Signature Dual-Officer Loan Approval Workflow
 * ------------------------------------------------------------------ */

/**
 * Ensures SHEETS.LOANS has the necessary columns for dual-officer governance.
 * Row 2 spill formulas are never touched or overwritten.
 */
function ensureLoansReviewHeaders_(sheet) {
  const targetHeaders = [
    "Reviewed By",
    "Reviewed Date",
    "Approved By",
    "Approved Date",
    "Review Notes",
    "Disbursement Channel",
    "Disbursement Reference",
  ];
  const lastCol = sheet.getLastColumn();
  const existingHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const map = getHeaderMap_(existingHeaders);
  let nextCol = lastCol + 1;
  let added = false;

  targetHeaders.forEach(function (h) {
    if (map[h] === undefined) {
      if (nextCol > sheet.getMaxColumns()) {
        sheet.insertColumnAfter(sheet.getMaxColumns());
      }
      sheet.getRange(1, nextCol).setValue(h);
      map[h] = nextCol - 1;
      nextCol++;
      added = true;
    }
  });

  if (added) {
    const width = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, width).setFontWeight("bold");
    if (typeof invalidateSheetContextCache_ === "function") {
      invalidateSheetContextCache_(SHEETS.LOANS);
    }
  }

  return map;
}

/**
 * 1. reviewLoanApplication(payload)
 * First signature: Chairperson or Admin reviews loan application.
 * Anti-self-approval: Blocks if caller is the borrower.
 * Validates status is "Pending Review" (or legacy "Pending").
 * Transitions status to "Reviewed".
 */
function reviewLoanApplication(payload) {
  const p = payload || {};
  const loanId = String(p.loanId || p.id || "").trim();
  const notes = String(p.notes || p.reviewNotes || "").trim();

  if (!loanId) {
    return { ok: false, success: false, error: "Loan ID is required." };
  }

  let session = null;
  try {
    session = requireRole_(["Chairperson", "Admin"]);
  } catch (errRole) {
    const ctx = requireAccess_();
    if (ctx && ctx.permissions && ctx.permissions.loanReview) {
      session = ctx;
    } else {
      return { ok: false, success: false, error: errRole.message };
    }
  }

  const callerEmail = String(getCurrentUserEmail_() || "").trim().toLowerCase();
  const callerMemberId = String(session.memberId || "").trim().toLowerCase();
  const callerMemberName = String(session.memberName || "").trim().toLowerCase();
  const reviewerIdentifier = String(session.roleSheetName || session.memberName || callerEmail || "Chairperson").trim();

  let lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(15000);

    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.LOANS);
    const col = ensureLoansReviewHeaders_(sheet);
    requireHeaders_(col, ["Loan ID", "Status"], SHEETS.LOANS);

    const values = sheet.getDataRange().getValues();
    let targetRowIndex = -1;
    let targetRow = null;

    for (let r = 1; r < values.length; r++) {
      if (String(values[r][col["Loan ID"]] || "").trim().toLowerCase() === loanId.toLowerCase()) {
        targetRowIndex = r + 1;
        targetRow = values[r];
        break;
      }
    }

    if (targetRowIndex === -1 || !targetRow) {
      return { ok: false, success: false, error: "Loan " + loanId + " not found." };
    }

    // Extract borrower details
    const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
    const borrowerMemberId = midCol !== undefined ? String(targetRow[midCol] || "").trim() : "";
    const borrowerName = col["Borrower Name"] !== undefined ? String(targetRow[col["Borrower Name"]] || "").trim() : "";
    const requestedAmount = col["Requested Amount"] !== undefined ? (Number(targetRow[col["Requested Amount"]]) || 0) : 0;

    let borrowerEmail = "";
    try {
      const bContact = typeof getMemberContactAndFinancials_ === "function"
        ? getMemberContactAndFinancials_(borrowerMemberId || borrowerName)
        : null;
      if (bContact && bContact.email) {
        borrowerEmail = String(bContact.email).trim().toLowerCase();
      }
    } catch (eB) {}

    // Anti-self-approval enforcement
    const isBorrower = (callerMemberId && borrowerMemberId && callerMemberId === borrowerMemberId.toLowerCase()) ||
                       (callerEmail && borrowerEmail && callerEmail === borrowerEmail) ||
                       (callerMemberName && borrowerName && callerMemberName === borrowerName.toLowerCase());

    if (isBorrower) {
      return {
        ok: false,
        success: false,
        error: "Self-approval prohibited: You cannot review your own loan application.",
      };
    }

    // Status validation
    const currentStatus = String(targetRow[col["Status"]] || "").trim();
    const currentStatusLower = currentStatus.toLowerCase();

    if (currentStatusLower === "reviewed") {
      return { ok: false, success: false, error: "Loan is already reviewed." };
    }
    if (currentStatusLower !== "pending review" && currentStatusLower !== "pending") {
      return {
        ok: false,
        success: false,
        error: "Loan is not pending review (current status: " + currentStatus + ").",
      };
    }

    // State transition to Reviewed (Row 2 spill formulas preserved)
    const now = new Date();
    sheet.getRange(targetRowIndex, col["Status"] + 1).setValue("Reviewed");

    if (col["Reviewed By"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Reviewed By"] + 1).setValue(reviewerIdentifier);
    }
    if (col["Reviewed Date"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Reviewed Date"] + 1).setValue(now);
    }
    if (col["Review Notes"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Review Notes"] + 1).setValue(notes);
    }

    SpreadsheetApp.flush();

    // Audit log
    appendAuditLog_(
      "loan.reviewed",
      "Loan",
      loanId,
      "Loan reviewed by " + reviewerIdentifier + (notes ? " (Notes: " + notes + ")" : ""),
      JSON.stringify({
        notes: notes,
        reviewer: reviewerIdentifier,
        reviewerEmail: callerEmail,
        borrower: borrowerName,
        borrowerMemberId: borrowerMemberId,
        requestedAmount: requestedAmount,
      })
    );

    // Notifications (non-blocking)
    try {
      notifyLoanReviewed_(loanId, borrowerName, borrowerMemberId, borrowerEmail, reviewerIdentifier, notes, requestedAmount);
    } catch (eNotif) {
      console.error("notifyLoanReviewed_ error: " + eNotif.message);
    }

    if (typeof invalidateSheetContextCache_ === "function") {
      invalidateSheetContextCache_(SHEETS.LOANS);
    }
    if (typeof clearDashboardCache_ === "function") {
      clearDashboardCache_();
    }

    return {
      ok: true,
      success: true,
      loanId: loanId,
      status: "Reviewed",
      reviewedBy: reviewerIdentifier,
      message: "Loan " + loanId + " successfully reviewed and queued for treasurer disbursement authorization.",
    };
  } catch (err) {
    return { ok: false, success: false, error: err.message };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eL) {}
    }
  }
}

/**
 * 2. authorizeLoanDisbursement(payload)
 * Second signature: Treasurer or Admin authorizes loan disbursement.
 * Anti-collusion separation-of-duties: Strictly blocks if authorizer == reviewer.
 * Anti-self-approval: Blocks if authorizer == borrower.
 * Validates status is "Reviewed".
 * Transitions status to "Approved" (or "Active").
 * In SHEETS.GUARANTORS: marks matching guarantor commitments as "Active".
 */
function authorizeLoanDisbursement(payload) {
  const p = payload || {};
  const loanId = String(p.loanId || p.id || "").trim();
  const notes = String(p.notes || "").trim();
  const paymentChannel = normalizeDepositChannel_(p.paymentChannel || p.channel || DEPOSIT_CHANNELS.EQUITY_BANK);
  const reference = String(p.reference || p.ref || "").trim();

  if (!loanId) {
    return { ok: false, success: false, error: "Loan ID is required." };
  }

  let session = null;
  try {
    session = requireRole_(["Treasurer", "Admin"]);
  } catch (errRole) {
    const ctx = requireAccess_();
    if (ctx && ctx.permissions && ctx.permissions.loanDisburse) {
      session = ctx;
    } else {
      return { ok: false, success: false, error: errRole.message };
    }
  }

  const callerEmail = String(getCurrentUserEmail_() || "").trim().toLowerCase();
  const callerMemberId = String(session.memberId || "").trim().toLowerCase();
  const callerMemberName = String(session.memberName || "").trim().toLowerCase();
  const authorizerIdentifier = String(session.roleSheetName || session.memberName || callerEmail || "Treasurer").trim();

  let lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(15000);

    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.LOANS);
    const col = ensureLoansReviewHeaders_(sheet);
    requireHeaders_(col, ["Loan ID", "Status"], SHEETS.LOANS);

    const values = sheet.getDataRange().getValues();
    let targetRowIndex = -1;
    let targetRow = null;

    for (let r = 1; r < values.length; r++) {
      if (String(values[r][col["Loan ID"]] || "").trim().toLowerCase() === loanId.toLowerCase()) {
        targetRowIndex = r + 1;
        targetRow = values[r];
        break;
      }
    }

    if (targetRowIndex === -1 || !targetRow) {
      return { ok: false, success: false, error: "Loan " + loanId + " not found." };
    }

    // 1. Borrower check (Anti-self-approval)
    const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
    const borrowerMemberId = midCol !== undefined ? String(targetRow[midCol] || "").trim() : "";
    const borrowerName = col["Borrower Name"] !== undefined ? String(targetRow[col["Borrower Name"]] || "").trim() : "";
    const requestedAmount = col["Requested Amount"] !== undefined ? (Number(targetRow[col["Requested Amount"]]) || 0) : 0;

    let borrowerEmail = "";
    try {
      const bContact = typeof getMemberContactAndFinancials_ === "function"
        ? getMemberContactAndFinancials_(borrowerMemberId || borrowerName)
        : null;
      if (bContact && bContact.email) {
        borrowerEmail = String(bContact.email).trim().toLowerCase();
      }
    } catch (eB) {}

    const isBorrower = (callerMemberId && borrowerMemberId && callerMemberId === borrowerMemberId.toLowerCase()) ||
                       (callerEmail && borrowerEmail && callerEmail === borrowerEmail) ||
                       (callerMemberName && borrowerName && callerMemberName === borrowerName.toLowerCase());

    if (isBorrower) {
      return {
        ok: false,
        success: false,
        error: "Self-approval prohibited: You cannot authorize disbursement of your own loan.",
      };
    }

    // 2. Reviewer check (Strict Anti-Collusion Separation-of-Duties)
    const reviewedByVal = col["Reviewed By"] !== undefined ? String(targetRow[col["Reviewed By"]] || "").trim().toLowerCase() : "";
    if (reviewedByVal) {
      const isSameAsReviewer = (callerEmail && reviewedByVal === callerEmail) ||
                               (callerMemberName && reviewedByVal === callerMemberName) ||
                               (callerMemberId && reviewedByVal === callerMemberId) ||
                               (session.roleSheetName && reviewedByVal === String(session.roleSheetName).trim().toLowerCase());
      if (isSameAsReviewer) {
        return {
          ok: false,
          success: false,
          error: "Anti-collusion separation-of-duties violation: The reviewer and disbursement authorizer cannot be the same individual.",
        };
      }
    }

    // 3. Status validation: Must be "Reviewed"
    const currentStatus = String(targetRow[col["Status"]] || "").trim();
    if (currentStatus.toLowerCase() !== "reviewed") {
      return {
        ok: false,
        success: false,
        error: "Loan must be reviewed before disbursement authorization (current status: " + currentStatus + ").",
      };
    }

    // 4. State transition to Approved
    const now = new Date();
    sheet.getRange(targetRowIndex, col["Status"] + 1).setValue("Approved");

    if (col["Approved By"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Approved By"] + 1).setValue(authorizerIdentifier);
    }
    if (col["Approved Date"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Approved Date"] + 1).setValue(now);
    }
    if (col["Disbursement Channel"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Disbursement Channel"] + 1).setValue(paymentChannel);
    }
    if (col["Disbursement Reference"] !== undefined) {
      sheet.getRange(targetRowIndex, col["Disbursement Reference"] + 1).setValue(reference);
    }

    // 5. In SHEETS.GUARANTORS: marks matching guarantor commitments as "Active"
    let updatedGuarantorCount = 0;
    try {
      const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
      if (gSheet && gSheet.getLastRow() > 1) {
        const gVals = gSheet.getDataRange().getValues();
        const gCol = getHeaderMap_(gVals[0]);
        const gLidCol = gCol["Loan ID"];
        let gStatusCol = gCol["Status"] !== undefined ? gCol["Status"] : (gCol["Loan Status"] !== undefined ? gCol["Loan Status"] : gCol["Guarantor Status"]);

        if (gStatusCol === undefined) {
          const nextGCol = gSheet.getLastColumn() + 1;
          gSheet.getRange(1, nextGCol).setValue("Status").setFontWeight("bold");
          gStatusCol = nextGCol - 1;
        }

        if (gLidCol !== undefined && gStatusCol !== undefined) {
          for (let gr = 1; gr < gVals.length; gr++) {
            if (String(gVals[gr][gLidCol] || "").trim().toLowerCase() === loanId.toLowerCase()) {
              gSheet.getRange(gr + 1, gStatusCol + 1).setValue("Active");
              updatedGuarantorCount++;
            }
          }
        }
      }
    } catch (eG) {
      console.error("Guarantors update error: " + eG.message);
    }

    SpreadsheetApp.flush();

    // Audit log
    appendAuditLog_(
      "loan.approved",
      "Loan",
      loanId,
      "Loan disbursement authorized by " + authorizerIdentifier + " via " + paymentChannel + (reference ? " (Ref: " + reference + ")" : ""),
      JSON.stringify({
        notes: notes,
        paymentChannel: paymentChannel,
        reference: reference,
        authorizer: authorizerIdentifier,
        authorizerEmail: callerEmail,
        borrower: borrowerName,
        guarantorsActivated: updatedGuarantorCount,
      })
    );

    // Notifications (WhatsApp & Email receipts to borrower and copy-notifies guarantors)
    try {
      notifyLoanDisbursed_(loanId, borrowerName, borrowerMemberId, borrowerEmail, requestedAmount, paymentChannel, reference, authorizerIdentifier);
    } catch (eNotif) {
      console.error("notifyLoanDisbursed_ error: " + eNotif.message);
    }

    if (typeof invalidateSheetContextCache_ === "function") {
      invalidateSheetContextCache_(SHEETS.LOANS);
      invalidateSheetContextCache_(SHEETS.GUARANTORS);
    }
    if (typeof clearDashboardCache_ === "function") {
      clearDashboardCache_();
    }

    return {
      ok: true,
      success: true,
      loanId: loanId,
      status: "Approved",
      approvedBy: authorizerIdentifier,
      paymentChannel: paymentChannel,
      reference: reference,
      guarantorsActivated: updatedGuarantorCount,
      message: "Loan " + loanId + " disbursement successfully authorized via " + paymentChannel + ".",
    };
  } catch (err) {
    return { ok: false, success: false, error: err.message };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eL) {}
    }
  }
}

/**
 * 3. rejectLoanApplication(payload)
 * Chairperson, Treasurer, or Admin rejects the loan application.
 * Validates status is "Pending Review" (or "Pending") or "Reviewed".
 * Transitions status to "Rejected".
 * In SHEETS.GUARANTORS: marks guarantor commitments as "Released".
 */
function rejectLoanApplication(payload) {
  const p = payload || {};
  const loanId = String(p.loanId || p.id || "").trim();
  const reason = String(p.reason || p.notes || "").trim();

  if (!loanId) {
    return { ok: false, success: false, error: "Loan ID is required." };
  }
  if (!reason) {
    return { ok: false, success: false, error: "Rejection reason is required." };
  }

  let session = null;
  try {
    session = requireRole_(["Chairperson", "Treasurer", "Admin"]);
  } catch (errRole) {
    const ctx = requireAccess_();
    if (ctx && ctx.permissions && (ctx.permissions.loanReview || ctx.permissions.loanDisburse || ctx.permissions.isAdmin)) {
      session = ctx;
    } else {
      return { ok: false, success: false, error: errRole.message };
    }
  }

  const callerEmail = String(getCurrentUserEmail_() || "").trim().toLowerCase();
  const rejecterIdentifier = String(session.roleSheetName || session.memberName || callerEmail || session.roleLabel || "Officer").trim();

  let lock = null;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(15000);

    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.LOANS);
    const col = ensureLoansReviewHeaders_(sheet);
    requireHeaders_(col, ["Loan ID", "Status"], SHEETS.LOANS);

    const values = sheet.getDataRange().getValues();
    let targetRowIndex = -1;
    let targetRow = null;

    for (let r = 1; r < values.length; r++) {
      if (String(values[r][col["Loan ID"]] || "").trim().toLowerCase() === loanId.toLowerCase()) {
        targetRowIndex = r + 1;
        targetRow = values[r];
        break;
      }
    }

    if (targetRowIndex === -1 || !targetRow) {
      return { ok: false, success: false, error: "Loan " + loanId + " not found." };
    }

    // Status validation
    const currentStatus = String(targetRow[col["Status"]] || "").trim();
    const currentStatusLower = currentStatus.toLowerCase();

    if (currentStatusLower === "rejected") {
      return { ok: false, success: false, error: "Loan is already rejected." };
    }
    if (currentStatusLower === "settled" || currentStatusLower === "approved" || currentStatusLower === "active") {
      return {
        ok: false,
        success: false,
        error: "Cannot reject loan with status '" + currentStatus + "'.",
      };
    }
    if (currentStatusLower !== "pending review" && currentStatusLower !== "pending" && currentStatusLower !== "reviewed") {
      return {
        ok: false,
        success: false,
        error: "Loan is not in a reviewable state (current status: " + currentStatus + ").",
      };
    }

    // State transition to Rejected
    sheet.getRange(targetRowIndex, col["Status"] + 1).setValue("Rejected");

    if (col["Review Notes"] !== undefined) {
      const existingNotes = String(targetRow[col["Review Notes"]] || "").trim();
      const updatedNotes = existingNotes ? (existingNotes + " | Rejected: " + reason) : ("Rejected: " + reason);
      sheet.getRange(targetRowIndex, col["Review Notes"] + 1).setValue(updatedNotes);
    }

    // In SHEETS.GUARANTORS: marks guarantor commitments as "Released"
    let releasedGuarantorCount = 0;
    try {
      const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
      if (gSheet && gSheet.getLastRow() > 1) {
        const gVals = gSheet.getDataRange().getValues();
        const gCol = getHeaderMap_(gVals[0]);
        const gLidCol = gCol["Loan ID"];
        let gStatusCol = gCol["Status"] !== undefined ? gCol["Status"] : (gCol["Loan Status"] !== undefined ? gCol["Loan Status"] : gCol["Guarantor Status"]);

        if (gStatusCol === undefined) {
          const nextGCol = gSheet.getLastColumn() + 1;
          gSheet.getRange(1, nextGCol).setValue("Status").setFontWeight("bold");
          gStatusCol = nextGCol - 1;
        }

        if (gLidCol !== undefined && gStatusCol !== undefined) {
          for (let gr = 1; gr < gVals.length; gr++) {
            if (String(gVals[gr][gLidCol] || "").trim().toLowerCase() === loanId.toLowerCase()) {
              gSheet.getRange(gr + 1, gStatusCol + 1).setValue("Released");
              releasedGuarantorCount++;
            }
          }
        }
      }
    } catch (eG) {
      console.error("Guarantors release error: " + eG.message);
    }

    SpreadsheetApp.flush();

    const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
    const borrowerMemberId = midCol !== undefined ? String(targetRow[midCol] || "").trim() : "";
    const borrowerName = col["Borrower Name"] !== undefined ? String(targetRow[col["Borrower Name"]] || "").trim() : "";

    let borrowerEmail = "";
    try {
      const bContact = typeof getMemberContactAndFinancials_ === "function"
        ? getMemberContactAndFinancials_(borrowerMemberId || borrowerName)
        : null;
      if (bContact && bContact.email) {
        borrowerEmail = String(bContact.email).trim().toLowerCase();
      }
    } catch (eB) {}

    // Audit log
    appendAuditLog_(
      "loan.rejected",
      "Loan",
      loanId,
      "Loan application rejected by " + rejecterIdentifier + ": " + reason,
      JSON.stringify({
        reason: reason,
        rejecter: rejecterIdentifier,
        rejecterEmail: callerEmail,
        borrower: borrowerName,
        borrowerMemberId: borrowerMemberId,
        guarantorsReleased: releasedGuarantorCount,
      })
    );

    // Notification to borrower
    try {
      notifyLoanRejected_(loanId, borrowerName, borrowerMemberId, borrowerEmail, reason, rejecterIdentifier);
    } catch (eNotif) {
      console.error("notifyLoanRejected_ error: " + eNotif.message);
    }

    if (typeof invalidateSheetContextCache_ === "function") {
      invalidateSheetContextCache_(SHEETS.LOANS);
      invalidateSheetContextCache_(SHEETS.GUARANTORS);
    }
    if (typeof clearDashboardCache_ === "function") {
      clearDashboardCache_();
    }

    return {
      ok: true,
      success: true,
      loanId: loanId,
      status: "Rejected",
      reason: reason,
      guarantorsReleased: releasedGuarantorCount,
      message: "Loan " + loanId + " application has been rejected and guarantor liabilities released.",
    };
  } catch (err) {
    return { ok: false, success: false, error: err.message };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eL) {}
    }
  }
}

/* ------------------------------------------------------------------ *
 * Notification Helpers for Multi-Signature Loan Workflow
 * ------------------------------------------------------------------ */

/**
 * Dispatches notification when a loan application has been reviewed.
 * Notifies the borrower and the Treasurer.
 */
function notifyLoanReviewed_(loanId, borrowerName, borrowerMemberId, borrowerEmail, reviewerIdentifier, notes, requestedAmount) {
  try {
    if (typeof MailApp === "undefined") return;

    const ss = getSpreadsheet_();
    const formattedAmt = "KES " + (Number(requestedAmount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    // 1. Notify Borrower
    if (borrowerEmail && borrowerEmail.indexOf("@") !== -1) {
      try {
        MailApp.sendEmail({
          to: borrowerEmail,
          subject: "Brightlife SHG - Loan Application #" + loanId + " Reviewed",
          name: "Brightlife SHG Governance",
          htmlBody:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; padding: 20px;">' +
            '<h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">Loan Application Reviewed</h2>' +
            "<p>Dear " + (borrowerName || "Member") + ",</p>" +
            "<p>Your loan application <strong>#" + loanId + "</strong> for <strong>" + formattedAmt + "</strong> has been reviewed by <strong>" + reviewerIdentifier + "</strong> and queued for Treasurer disbursement authorization.</p>" +
            (notes ? '<p style="background: #f1f5f9; padding: 10px; border-radius: 6px;"><em>Review Notes:</em> ' + notes + "</p>" : "") +
            '<p style="color: #64748b; font-size: 12px; margin-top: 24px;">Brightlife Self Help Group • Governance & Credit Committee</p>' +
            "</div>",
        });
      } catch (eMailB) {
        console.error("notifyLoanReviewed_ borrower email error: " + eMailB.message);
      }
    }

    // 2. Notify Treasurer(s)
    try {
      const rSheet = ss.getSheetByName(SHEETS.ROLES);
      if (rSheet && rSheet.getLastRow() > 1) {
        const rVals = rSheet.getDataRange().getValues();
        const rCol = getHeaderMap_(rVals[0]);
        const emailIdx = rCol["Email"];
        const roleIdx = rCol["Role"];
        const activeIdx = rCol["Active"];

        if (emailIdx !== undefined && roleIdx !== undefined) {
          const treasurerEmails = [];
          for (let i = 1; i < rVals.length; i++) {
            const role = String(rVals[i][roleIdx] || "").trim().toLowerCase();
            const isActive = activeIdx === undefined || isActiveRoleFlag_(rVals[i][activeIdx]);
            if (isActive && (role === "treasurer" || role === "finance" || role === "admin")) {
              const tEmail = String(rVals[i][emailIdx] || "").trim();
              if (tEmail && tEmail.indexOf("@") !== -1 && treasurerEmails.indexOf(tEmail) === -1) {
                treasurerEmails.push(tEmail);
              }
            }
          }

          if (treasurerEmails.length > 0) {
            MailApp.sendEmail({
              to: treasurerEmails.join(","),
              subject: "Brightlife SHG - Action Required: Loan #" + loanId + " Ready for Disbursement",
              name: "Brightlife SHG Governance",
              htmlBody:
                '<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; padding: 20px;">' +
                '<h2 style="color: #0f172a; border-bottom: 2px solid #059669; padding-bottom: 8px;">Action Required: Loan Disbursement Authorization</h2>' +
                "<p>A loan application has been reviewed and requires Treasurer authorization for disbursement:</p>" +
                "<ul>" +
                "<li><strong>Loan ID:</strong> " + loanId + "</li>" +
                "<li><strong>Borrower:</strong> " + (borrowerName || borrowerMemberId) + "</li>" +
                "<li><strong>Amount:</strong> " + formattedAmt + "</li>" +
                "<li><strong>Reviewed By:</strong> " + reviewerIdentifier + "</li>" +
                (notes ? "<li><strong>Review Notes:</strong> " + notes + "</li>" : "") +
                "</ul>" +
                "<p>Please log in to the Brightlife Dashboard to authorize disbursement.</p>" +
                '<p style="color: #64748b; font-size: 12px; margin-top: 24px;">Brightlife Self Help Group • Governance & Credit Committee</p>' +
                "</div>",
            });
          }
        }
      }
    } catch (eMailT) {
      console.error("notifyLoanReviewed_ treasurer email error: " + eMailT.message);
    }
  } catch (err) {
    console.error("notifyLoanReviewed_ error: " + err.message);
  }
}

/**
 * Dispatches notification when a loan is disbursed.
 * Sends email receipt to borrower and copy-notifies guarantors.
 */
function notifyLoanDisbursed_(loanId, borrowerName, borrowerMemberId, borrowerEmail, requestedAmount, paymentChannel, reference, authorizerIdentifier) {
  try {
    if (typeof MailApp === "undefined") return;

    const ss = getSpreadsheet_();
    const formattedAmt = "KES " + (Number(requestedAmount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const nowStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone() || "GMT+3", "yyyy-MM-dd HH:mm");

    // 1. Notify Borrower
    if (borrowerEmail && borrowerEmail.indexOf("@") !== -1) {
      try {
        MailApp.sendEmail({
          to: borrowerEmail,
          subject: "Brightlife SHG - Loan Disbursement Confirmed #" + loanId,
          name: "Brightlife SHG Treasury",
          htmlBody:
            '<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; padding: 20px;">' +
            '<h2 style="color: #0f172a; border-bottom: 2px solid #059669; padding-bottom: 8px;">Loan Disbursement Confirmed</h2>' +
            "<p>Dear " + (borrowerName || "Member") + ",</p>" +
            "<p>Your loan disbursement has been authorized and executed:</p>" +
            "<ul>" +
            "<li><strong>Loan ID:</strong> " + loanId + "</li>" +
            "<li><strong>Disbursed Amount:</strong> " + formattedAmt + "</li>" +
            "<li><strong>Payment Channel:</strong> " + paymentChannel + "</li>" +
            (reference ? "<li><strong>Reference:</strong> " + reference + "</li>" : "") +
            "<li><strong>Authorized By:</strong> " + authorizerIdentifier + "</li>" +
            "<li><strong>Date:</strong> " + nowStr + "</li>" +
            "</ul>" +
            "<p>Thank you for partnering with Brightlife SHG.</p>" +
            '<p style="color: #64748b; font-size: 12px; margin-top: 24px;">Brightlife Self Help Group • Treasury</p>' +
            "</div>",
        });
      } catch (eMailB) {
        console.error("notifyLoanDisbursed_ borrower email error: " + eMailB.message);
      }
    }

    // 2. Copy-notify Guarantors
    try {
      const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
      if (gSheet && gSheet.getLastRow() > 1) {
        const gVals = gSheet.getDataRange().getValues();
        const gCol = getHeaderMap_(gVals[0]);
        const gLidCol = gCol["Loan ID"];
        const gMidCol = gCol["Member ID"];
        const gNameCol = gCol["Guarantor Name"];
        const gAmtCol = gCol["Guaranteed Amount"];

        if (gLidCol !== undefined && gMidCol !== undefined) {
          for (let gr = 1; gr < gVals.length; gr++) {
            if (String(gVals[gr][gLidCol] || "").trim().toLowerCase() === loanId.toLowerCase()) {
              const gMid = String(gVals[gr][gMidCol] || "").trim();
              const gName = gNameCol !== undefined ? String(gVals[gr][gNameCol] || "").trim() : "";
              const gPledged = gAmtCol !== undefined ? (Number(gVals[gr][gAmtCol]) || 0) : 0;
              const formattedPledged = "KES " + gPledged.toLocaleString("en-US", { minimumFractionDigits: 2 });

              let gEmail = "";
              try {
                const gContact = typeof getMemberContactAndFinancials_ === "function"
                  ? getMemberContactAndFinancials_(gMid || gName)
                  : null;
                if (gContact && gContact.email) {
                  gEmail = String(gContact.email).trim().toLowerCase();
                }
              } catch (eGC) {}

              if (gEmail && gEmail.indexOf("@") !== -1) {
                MailApp.sendEmail({
                  to: gEmail,
                  subject: "Brightlife SHG - Loan Guarantee Activated #" + loanId,
                  name: "Brightlife SHG Treasury",
                  htmlBody:
                    '<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; padding: 20px;">' +
                    '<h2 style="color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">Loan Guarantee Activated</h2>' +
                    "<p>Dear " + (gName || "Guarantor") + ",</p>" +
                    "<p>This is to confirm that the loan for <strong>" + (borrowerName || "Member") + "</strong> (Loan ID: <strong>#" + loanId + "</strong>) has been disbursed.</p>" +
                    "<p>Your guarantee commitment of <strong>" + formattedPledged + "</strong> is now <strong>Active</strong>.</p>" +
                    '<p style="color: #64748b; font-size: 12px; margin-top: 24px;">Brightlife Self Help Group • Treasury</p>' +
                    "</div>",
                });
              }
            }
          }
        }
      }
    } catch (eMailG) {
      console.error("notifyLoanDisbursed_ guarantors email error: " + eMailG.message);
    }
  } catch (err) {
    console.error("notifyLoanDisbursed_ error: " + err.message);
  }
}

/**
 * Dispatches notification when a loan application is rejected.
 */
function notifyLoanRejected_(loanId, borrowerName, borrowerMemberId, borrowerEmail, reason, rejecterIdentifier) {
  try {
    if (typeof MailApp === "undefined") return;

    if (borrowerEmail && borrowerEmail.indexOf("@") !== -1) {
      MailApp.sendEmail({
        to: borrowerEmail,
        subject: "Brightlife SHG - Loan Application #" + loanId + " Status Update",
        name: "Brightlife SHG Credit Committee",
        htmlBody:
          '<div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; padding: 20px;">' +
          '<h2 style="color: #0f172a; border-bottom: 2px solid #dc2626; padding-bottom: 8px;">Loan Application Update</h2>' +
          "<p>Dear " + (borrowerName || "Member") + ",</p>" +
          "<p>We regret to inform you that your loan application <strong>#" + loanId + "</strong> has been <strong>Rejected</strong>.</p>" +
          '<p style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 10px; margin: 15px 0;"><strong>Reason:</strong> ' + reason + "</p>" +
          "<p>Any savings pledged by your guarantors for this application have been released.</p>" +
          "<p>If you have any questions or require clarification, please reach out to the group leadership.</p>" +
          '<p style="color: #64748b; font-size: 12px; margin-top: 24px;">Brightlife Self Help Group • Credit Committee</p>' +
          "</div>",
      });
    }
  } catch (err) {
    console.error("notifyLoanRejected_ error: " + err.message);
  }
}

/**
 * Retrieve complete Individual Loan Schedule & Amortization Statement data for a specific loan.
 * Supports borrower self-service (RBAC enforced) and administrative audit review.
 *
 * @param {string} loanId - Target Loan ID (e.g. "LN0001", "LN-2026-001")
 * @return {Object} Formatted loan details, sorted repayments, guarantors, and verification ref.
 */
function getLoanStatementData(loanId) {
  const session = requireAccess_();
  const isMemberOnly = session.permissions && session.permissions.isMemberOnly;
  const callerMemberId = String(session.memberId || "").trim().toLowerCase();
  const callerMemberName = String(session.memberName || "").trim().toLowerCase();

  const targetLoanId = String(loanId || "").trim();
  if (!targetLoanId) {
    throw new Error("Loan ID is required.");
  }
  const cleanLoanId = targetLoanId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  const ss = getSpreadsheet_();
  const tz = ss.getSpreadsheetTimeZone() || "Africa/Nairobi";
  const loanSheet = getRequiredSheet_(SHEETS.LOANS);
  const loanValues = loanSheet.getDataRange().getValues();
  if (loanValues.length <= 1) {
    throw new Error("Loan record not found: " + targetLoanId);
  }

  const loanHeaders = loanValues[0];
  const loanCol = getHeaderMap_(loanHeaders);
  requireHeaders_(loanCol, ["Loan ID", "Borrower Name", "Requested Amount", "Status"], SHEETS.LOANS);

  const memberIdCol = loanCol["Member ID"] !== undefined ? loanCol["Member ID"] : loanCol["Member id"];

  let targetRow = null;
  for (let i = 1; i < loanValues.length; i++) {
    const row = loanValues[i];
    const rLoanId = String(row[loanCol["Loan ID"]] || "").trim();
    if (rLoanId.toLowerCase() === targetLoanId.toLowerCase()) {
      targetRow = row;
      break;
    }
  }

  if (!targetRow) {
    throw new Error("Loan record not found: " + targetLoanId);
  }

  const borrowerName = String(targetRow[loanCol["Borrower Name"]] || "").trim();
  const borrowerMemberId = memberIdCol !== undefined ? String(targetRow[memberIdCol] || "").trim() : "";

  // Enforce RBAC: If member-only, borrower must match caller
  if (isMemberOnly) {
    const matchMemberId = callerMemberId && borrowerMemberId.toLowerCase() === callerMemberId;
    const matchMemberName = callerMemberName && (
      borrowerName.toLowerCase() === callerMemberName ||
      callerMemberName.indexOf(borrowerName.toLowerCase()) !== -1 ||
      borrowerName.toLowerCase().indexOf(callerMemberName) !== -1
    );

    if (!matchMemberId && !matchMemberName) {
      throw new Error("Access denied: You can only view your own loan statement.");
    }
  }

  const requested = Number(targetRow[loanCol["Requested Amount"]]) || 0;
  const interestColVal = loanCol["Interest"] !== undefined ? Number(targetRow[loanCol["Interest"]]) : NaN;
  const trsFeeColVal = loanCol["Transaction Fee"] !== undefined ? (Number(targetRow[loanCol["Transaction Fee"]]) || 0) : 0;
  const repaymentColVal = loanCol["Repayment Amount"] !== undefined ? Number(targetRow[loanCol["Repayment Amount"]]) : NaN;

  // Calculate repayment and interest: standard 10% flat interest if not explicit
  const calculatedInterest = !isNaN(interestColVal) ? interestColVal : Math.round(requested * 0.10);
  const repayment = !isNaN(repaymentColVal) && repaymentColVal > 0 ? repaymentColVal : (requested + calculatedInterest + trsFeeColVal);
  const interest = !isNaN(interestColVal) ? interestColVal : (repayment - requested);

  const paid = loanCol["Total Paid"] !== undefined ? (Number(targetRow[loanCol["Total Paid"]]) || 0) : 0;
  const balance = loanCol["Balance"] !== undefined ? (Number(targetRow[loanCol["Balance"]]) || 0) : (repayment - paid);

  const requestDate = loanCol["Request Date"] !== undefined ? (formatDateValue_(targetRow[loanCol["Request Date"]], tz) || (targetRow[loanCol["Request Date"]] ? String(targetRow[loanCol["Request Date"]]) : "")) : "";
  const approvedDate = loanCol["Approved Date"] !== undefined ? (formatDateValue_(targetRow[loanCol["Approved Date"]], tz) || (targetRow[loanCol["Approved Date"]] ? String(targetRow[loanCol["Approved Date"]]) : "")) : "";
  const disbursedDateCol = loanCol["Disbursed Date"] !== undefined ? loanCol["Disbursed Date"] : loanCol["Approved Date"];
  const disbursedDate = disbursedDateCol !== undefined ? (formatDateValue_(targetRow[disbursedDateCol], tz) || (targetRow[disbursedDateCol] ? String(targetRow[disbursedDateCol]) : "")) : approvedDate;

  const reviewedBy = loanCol["Reviewed By"] !== undefined ? String(targetRow[loanCol["Reviewed By"]] || "").trim() : "";
  const authorizedBy = loanCol["Approved By"] !== undefined
    ? String(targetRow[loanCol["Approved By"]] || "").trim()
    : (loanCol["Authorized By"] !== undefined ? String(targetRow[loanCol["Authorized By"]] || "").trim() : "");
  const disbursementRef = loanCol["Disbursement Reference"] !== undefined
    ? String(targetRow[loanCol["Disbursement Reference"]] || "").trim()
    : (loanCol["Disbursement Ref"] !== undefined ? String(targetRow[loanCol["Disbursement Ref"]] || "").trim() : "");
  const disbursementChannel = loanCol["Disbursement Channel"] !== undefined ? String(targetRow[loanCol["Disbursement Channel"]] || "").trim() : "";
  const status = loanCol["Status"] !== undefined ? String(targetRow[loanCol["Status"]] || LOAN_STATUS.PENDING).trim() : LOAN_STATUS.PENDING;

  const loanDetails = {
    loanId: String(targetRow[loanCol["Loan ID"]] || targetLoanId),
    memberId: borrowerMemberId,
    borrower: borrowerName,
    requested: requested,
    repayment: repayment,
    interest: interest,
    interestRate: "10%",
    paid: paid,
    balance: balance,
    requestDate: requestDate,
    approvedDate: approvedDate,
    disbursedDate: disbursedDate,
    status: status,
    reviewedBy: reviewedBy,
    authorizedBy: authorizedBy,
    disbursementRef: disbursementRef,
    disbursementChannel: disbursementChannel,
  };

  // Retrieve Repayments from SHEETS.LOAN_REPAYMENTS
  const repaymentsList = [];
  try {
    const repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
    if (repSheet && repSheet.getLastRow() > 1) {
      const repValues = repSheet.getDataRange().getValues();
      const repHeaders = repValues[0];
      const repCol = getHeaderMap_(repHeaders);
      const rLoanIdCol = repCol["Loan ID"];
      const pDateCol = repCol["Payment Date"];
      const pIdCol = repCol["Payment ID"];
      const tidCol = repCol["Transaction ID"];
      const prinCol = repCol["Principal Paid"];
      const intCol = repCol["Interest Paid"];
      const feeCol = repCol["Fee Paid"];
      const totCol = repCol["Total Paid"];
      const modeCol = repCol["Payment Mode"];
      const balRemCol = repCol["Balance Remaining"];
      const repStatusCol = repCol["Status"];

      if (rLoanIdCol !== undefined) {
        for (let r = 1; r < repValues.length; r++) {
          const rRow = repValues[r];
          const rLoanId = String(rRow[rLoanIdCol] || "").trim();
          if (rLoanId.toLowerCase() === targetLoanId.toLowerCase()) {
            const rawDate = pDateCol !== undefined ? rRow[pDateCol] : "";
            const parsedDate = rawDate instanceof Date ? rawDate : new Date(rawDate);
            const dateStr = formatDateValue_(rawDate, tz) || (rawDate ? String(rawDate) : "");

            repaymentsList.push({
              _time: (parsedDate instanceof Date && !isNaN(parsedDate.getTime())) ? parsedDate.getTime() : 0,
              paymentId: pIdCol !== undefined ? String(rRow[pIdCol] || "") : "",
              date: dateStr,
              tid: tidCol !== undefined ? String(rRow[tidCol] || "") : "",
              principalPaid: prinCol !== undefined ? (Number(rRow[prinCol]) || 0) : 0,
              interestPaid: intCol !== undefined ? (Number(rRow[intCol]) || 0) : 0,
              feePaid: feeCol !== undefined ? (Number(rRow[feeCol]) || 0) : 0,
              totalPaid: totCol !== undefined ? (Number(rRow[totCol]) || 0) : 0,
              mode: modeCol !== undefined ? String(rRow[modeCol] || "") : "",
              balanceRemaining: balRemCol !== undefined ? (Number(rRow[balRemCol]) || 0) : 0,
              status: repStatusCol !== undefined ? String(rRow[repStatusCol] || "Approved").trim() : "Approved",
            });
          }
        }
      }

      // Sort chronologically by payment date
      repaymentsList.sort(function(a, b) {
        return a._time - b._time;
      });

      // Clean up internal sort key
      repaymentsList.forEach(function(item) {
        delete item._time;
      });
    }
  } catch (repErr) {
    console.error("Error retrieving loan repayments for statement: " + repErr.message);
  }

  // Retrieve Guarantors from SHEETS.GUARANTORS
  const guarantorsList = [];
  try {
    const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
    if (gSheet && gSheet.getLastRow() > 1) {
      const gValues = gSheet.getDataRange().getValues();
      const gHeaders = gValues[0];
      const gCol = getHeaderMap_(gHeaders);
      const gLidCol = gCol["Loan ID"];
      const gMidCol = gCol["Member ID"] !== undefined ? gCol["Member ID"] : gCol["Member id"];
      const gNameCol = gCol["Guarantor Name"] !== undefined
        ? gCol["Guarantor Name"]
        : (gCol["Member Name"] !== undefined ? gCol["Member Name"] : gCol["Name"]);
      const gAmtCol = gCol["Guaranteed Amount"] !== undefined
        ? gCol["Guaranteed Amount"]
        : (gCol["Amount Pledged"] !== undefined ? gCol["Amount Pledged"] : gCol["Amount"]);
      const gStatCol = gCol["Status"] !== undefined
        ? gCol["Status"]
        : (gCol["Loan Status"] !== undefined ? gCol["Loan Status"] : gCol["Guarantor Status"]);

      let memberNameById = null;

      if (gLidCol !== undefined) {
        for (let gr = 1; gr < gValues.length; gr++) {
          const gRow = gValues[gr];
          const gLoanId = String(gRow[gLidCol] || "").trim();
          if (gLoanId.toLowerCase() === targetLoanId.toLowerCase()) {
            const gMid = gMidCol !== undefined ? String(gRow[gMidCol] || "").trim() : "";
            let gName = gNameCol !== undefined ? String(gRow[gNameCol] || "").trim() : "";
            if (!gName && gMid) {
              if (!memberNameById) {
                memberNameById = {};
                try {
                  const mSheet = ss.getSheetByName(SHEETS.MEMBERS);
                  if (mSheet && mSheet.getLastRow() > 1) {
                    const mVals = mSheet.getDataRange().getValues();
                    const mCol = getHeaderMap_(mVals[0]);
                    const mMIdCol = mCol["Member ID"] !== undefined ? mCol["Member ID"] : mCol["Member id"];
                    const mNameCol = mCol["Full Name"] !== undefined ? mCol["Full Name"] : (mCol["Member Name"] !== undefined ? mCol["Member Name"] : mCol["Name"]);
                    if (mMIdCol !== undefined && mNameCol !== undefined) {
                      for (let mi = 1; mi < mVals.length; mi++) {
                        const mIdVal = String(mVals[mi][mMIdCol] || "").trim();
                        if (mIdVal) memberNameById[mIdVal.toLowerCase()] = String(mVals[mi][mNameCol] || "").trim();
                      }
                    }
                  }
                } catch (_) {}
              }
              gName = memberNameById[gMid.toLowerCase()] || gMid;
            }
            const gAmt = gAmtCol !== undefined ? (Number(gRow[gAmtCol]) || 0) : 0;
            const gStatus = gStatCol !== undefined ? String(gRow[gStatCol] || "Active").trim() : "Active";
            guarantorsList.push({
              memberId: gMid,
              guarantorName: gName,
              amountPledged: gAmt,
              status: gStatus,
            });
          }
        }
      }
    }
  } catch (gErr) {
    console.error("Error retrieving guarantors for statement: " + gErr.message);
  }

  const verificationRef = "BLG-LN-STMT-" + cleanLoanId + "-" + Utilities.formatDate(new Date(), "Africa/Nairobi", "yyyyMMdd");

  return {
    success: true,
    loan: loanDetails,
    repayments: repaymentsList,
    guarantors: guarantorsList,
    verificationRef: verificationRef,
  };
}
