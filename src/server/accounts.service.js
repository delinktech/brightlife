function getAccountsData() {
  try {
    const session = requireAccess_();
    const isAdminOrTreasurer =
      session.roleKey === ROLE_KEY.ADMIN ||
      session.roleKey === ROLE_KEY.TREASURER ||
      (session.permissions && (session.permissions.accountsWrite === true || session.permissions.isAdmin === true));
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.ACCOUNTS);
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return { success: true, accounts: [], canReconcile: isAdminOrTreasurer };
    }

    const headers = rows[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(col, ["Org. Name", "Acc. Number"], SHEETS.ACCOUNTS);
    const tz = ss.getSpreadsheetTimeZone();

    let totalSystemCash = 0;
    let totalStatementCash = 0;
    let totalInflows = 0;
    let totalOutflows = 0;

    const accounts = rows.slice(1).filter(function (row) {
      return row[col["Org. Name"]] || row[col["Acc. Number"]];
    }).map(function (row, idx) {
      const orgName = String(row[col["Org. Name"]] || "").trim();
      const accountNumber = String(row[col["Acc. Number"]] || "").trim();
      
      const inflows = col["Inflows"] !== undefined ? (Number(row[col["Inflows"]]) || 0) : 0;
      const outflows = col["Outflows"] !== undefined ? (Number(row[col["Outflows"]]) || 0) : 0;
      const systemBalance = col["System Balance"] !== undefined ? (Number(row[col["System Balance"]]) || 0) : (inflows - outflows);
      
      // Statement balance defaults to 'Statement Balance' or legacy 'Balance'
      const stmtRaw = col["Statement Balance"] !== undefined ? row[col["Statement Balance"]] : row[col["Balance"]];
      const statementBalance = Number(stmtRaw) || 0;
      
      const variance = col["Variance"] !== undefined ? (Number(row[col["Variance"]]) || 0) : (statementBalance - systemBalance);
      const rawStatus = col["Reconciliation Status"] !== undefined ? String(row[col["Reconciliation Status"]] || "").trim() : "";
      const status = rawStatus || (variance === 0 ? "Reconciled" : (variance > 0 ? "Surplus" : "Deficit"));

      totalSystemCash += systemBalance;
      totalStatementCash += statementBalance;
      totalInflows += inflows;
      totalOutflows += outflows;

      return {
        rowNumber: idx + 2,
        orgName: orgName,
        accountNumber: accountNumber,
        balanceDate: col["Balance Date"] !== undefined ? formatDateValue_(row[col["Balance Date"]], tz) : "",
        balance: statementBalance,
        statementBalance: statementBalance,
        systemBalance: systemBalance,
        inflows: inflows,
        outflows: outflows,
        variance: variance,
        status: status,
        paymentMode: (col["Deposit Channel"] !== undefined ? String(row[col["Deposit Channel"]] || "") : String(row[col["Payment Mode"]] || "")).trim(),
        paybill: col["Paybill"] !== undefined ? String(row[col["Paybill"]] || "").trim() : "",
      };
    });

    // Also calculate Non-Cash Refund / Expense Offsets
    let totalRefundOffsets = 0;
    try {
      const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
      if (cSheet && cSheet.getLastRow() > 1) {
        const cVals = cSheet.getDataRange().getValues();
        const cCol = getHeaderMap_(cVals[0]);
        const cModeIdx = cCol["Deposit Channel"] !== undefined ? cCol["Deposit Channel"] : cCol["Payment Mode"];
        if (cModeIdx !== undefined && cCol["Amount"] !== undefined) {
          for (let c = 1; c < cVals.length; c++) {
            const mode = String(cVals[c][cModeIdx] || "").toLowerCase();
            const stat = cCol["Status"] !== undefined ? String(cVals[c][cCol["Status"]] || "").toLowerCase() : "approved";
            if (stat === "approved" && (mode.indexOf("refund") !== -1 || mode.indexOf("offset") !== -1)) {
              totalRefundOffsets += Number(cVals[c][cCol["Amount"]]) || 0;
            }
          }
        }
      }
    } catch (eOff) {}

    return {
      success: true,
      accounts: accounts,
      rows: accounts,
      canReconcile: Boolean(isAdminOrTreasurer),
      summary: {
        totalSystemCash: totalSystemCash,
        totalStatementCash: totalStatementCash,
        totalInflows: totalInflows,
        totalOutflows: totalOutflows,
        netVariance: totalStatementCash - totalSystemCash,
        totalRefundOffsets: totalRefundOffsets,
        isFullyReconciled: Math.abs(totalStatementCash - totalSystemCash) < 0.01,
      }
    };
  } catch (error) {
    return { success: false, error: error.message, accounts: [] };
  }
}

/**
 * Updates an account's physical statement balance directly from bank statement.
 */
function updateAccountStatementBalance(data) {
  requirePermission_("accountsWrite");
  const ss = getSpreadsheet_();
  const sheet = getRequiredSheet_(SHEETS.ACCOUNTS);
  const rows = sheet.getDataRange().getValues();
  const col = getHeaderMap_(rows[0]);

  const rowNumber = Number(data.rowNumber);
  if (!rowNumber || rowNumber < 2 || rowNumber > rows.length) {
    throw new Error("Invalid target account row.");
  }

  const stmtBal = Number(data.statementBalance) || 0;
  const tz = ss.getSpreadsheetTimeZone();

  if (col["Statement Balance"] !== undefined) {
    sheet.getRange(rowNumber, col["Statement Balance"] + 1).setValue(stmtBal);
  } else if (col["Balance"] !== undefined) {
    sheet.getRange(rowNumber, col["Balance"] + 1).setValue(stmtBal);
  }

  if (col["Balance Date"] !== undefined) {
    const d = data.statementDate ? new Date(data.statementDate) : new Date();
    sheet.getRange(rowNumber, col["Balance Date"] + 1).setValue(isNaN(d.getTime()) ? new Date() : d);
  }

  if (col["Notes"] !== undefined && data.notes !== undefined) {
    sheet.getRange(rowNumber, col["Notes"] + 1).setValue(String(data.notes || ""));
  }

  if (col["Reconciliation Status"] !== undefined) {
    const statusCell = sheet.getRange(rowNumber, col["Reconciliation Status"] + 1);
    if (!statusCell.getFormula()) {
      const sysBal = col["System Balance"] !== undefined ? (Number(rows[rowNumber - 1][col["System Balance"]]) || 0) : 0;
      const isBal = Math.abs(stmtBal - sysBal) < 0.01;
      statusCell.setValue(isBal ? "Balanced" : (stmtBal > sysBal ? "Surplus" : "Deficit"));
    }
  }

  const orgName = rows[rowNumber - 1][col["Org. Name"]];
  appendAuditLog_(
    "account.reconcile",
    "Accounts",
    String(orgName || rowNumber),
    "Updated physical statement balance for " + orgName + " to KES " + stmtBal,
    JSON.stringify({ row: rowNumber, org: orgName, balance: stmtBal })
  );

  if (typeof clearDashboardCache_ === "function") {
    clearDashboardCache_();
  }

  return { success: true };
}

/**
 * Retrieves auto-reconciliation data across all bank, fund, and cash accounts.
 * Returns KPI summaries and account-level comparisons between physical statement balances and ledger system balances.
 */
function getAccountsReconciliationData() {
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.ACCOUNTS);
    const rows = sheet.getDataRange().getValues();
    const tz = ss.getSpreadsheetTimeZone();

    let totalPhysicalBankCash = 0;
    let totalSystemBookCash = 0;
    const reconciliationRows = [];

    if (rows.length > 1) {
      const headers = rows[0];
      const col = getHeaderMap_(headers);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const orgName = String(row[col["Org. Name"]] || "").trim();
        const accountNumber = String(row[col["Acc. Number"]] || "").trim();
        if (!orgName && !accountNumber) continue;

        const inflows = col["Inflows"] !== undefined ? (Number(row[col["Inflows"]]) || 0) : 0;
        const outflows = col["Outflows"] !== undefined ? (Number(row[col["Outflows"]]) || 0) : 0;
        const systemBalance = col["System Balance"] !== undefined 
          ? (Number(row[col["System Balance"]]) || 0) 
          : (inflows - outflows);

        const stmtRaw = col["Statement Balance"] !== undefined ? row[col["Statement Balance"]] : row[col["Balance"]];
        const physicalBalance = Number(stmtRaw) || 0;

        const variance = col["Variance"] !== undefined 
          ? (Number(row[col["Variance"]]) || 0) 
          : (physicalBalance - systemBalance);

        const rawStatus = col["Reconciliation Status"] !== undefined ? String(row[col["Reconciliation Status"]] || "").trim() : "";
        const isBalanced = Math.abs(variance) < 0.01;
        const status = rawStatus || (isBalanced ? "Matched" : (variance > 0 ? "Surplus" : "Deficit"));

        const paymentMode = (col["Deposit Channel"] !== undefined ? String(row[col["Deposit Channel"]] || "") : String(row[col["Payment Mode"]] || "")).trim();
        const balanceDate = col["Balance Date"] !== undefined ? formatDateValue_(row[col["Balance Date"]], tz) : "";
        const notes = col["Notes"] !== undefined ? String(row[col["Notes"]] || "").trim() : "";

        totalPhysicalBankCash += physicalBalance;
        totalSystemBookCash += systemBalance;

        reconciliationRows.push({
          rowNumber: i + 1,
          name: orgName,
          institution: orgName,
          type: paymentMode || "Bank / Fund",
          accountNumber: accountNumber,
          physicalBalance: physicalBalance,
          systemBalance: systemBalance,
          variance: variance,
          isBalanced: isBalanced,
          status: status,
          statementDate: balanceDate,
          reconciledNotes: notes
        });
      }
    }

    // Calculate Active Loans balance
    let totalOutstandingLoans = 0;
    try {
      const loanSheet = ss.getSheetByName(SHEETS.LOANS);
      if (loanSheet && loanSheet.getLastRow() > 1) {
        const lVals = loanSheet.getDataRange().getValues();
        const lCol = getHeaderMap_(lVals[0]);
        const balIdx = lCol["Loan Balance"] !== undefined ? lCol["Loan Balance"] : lCol["Balance"];
        const statIdx = lCol["Status"];
        if (balIdx !== undefined) {
          for (let l = 1; l < lVals.length; l++) {
            const stat = statIdx !== undefined ? String(lVals[l][statIdx] || "").trim().toLowerCase() : "";
            if (stat === "disbursed" || stat === "active" || stat === "approved" || stat === "") {
              totalOutstandingLoans += Number(lVals[l][balIdx]) || 0;
            }
          }
        }
      }
    } catch (eL) {
      console.warn("Reconciliation loans error:", eL.message);
    }

    // Calculate Active Investments balance
    let totalInvestments = 0;
    try {
      const invSheet = ss.getSheetByName(SHEETS.INVESTMENTS);
      if (invSheet && invSheet.getLastRow() > 1) {
        const iVals = invSheet.getDataRange().getValues();
        const iCol = getHeaderMap_(iVals[0]);
        const valIdx = iCol["Current Value"] !== undefined ? iCol["Current Value"] : (iCol["Amount Invested"] !== undefined ? iCol["Amount Invested"] : iCol["Amount"]);
        const statIdx = iCol["Status"];
        if (valIdx !== undefined) {
          for (let v = 1; v < iVals.length; v++) {
            const stat = statIdx !== undefined ? String(iVals[v][statIdx] || "").trim().toLowerCase() : "";
            if (stat !== "closed" && stat !== "liquidated" && stat !== "rejected") {
              totalInvestments += Number(iVals[v][valIdx]) || 0;
            }
          }
        }
      }
    } catch (eI) {
      console.warn("Reconciliation investments error:", eI.message);
    }

    const netVariance = totalPhysicalBankCash - totalSystemBookCash;
    const isGlobalBalanced = Math.abs(netVariance) < 0.01;
    const totalGroupAssets = totalPhysicalBankCash + totalOutstandingLoans + totalInvestments;

    return {
      success: true,
      summary: {
        totalPhysicalBankCash: Math.round(totalPhysicalBankCash * 100) / 100,
        totalSystemBookCash: Math.round(totalSystemBookCash * 100) / 100,
        netVariance: Math.round(netVariance * 100) / 100,
        isBalanced: isGlobalBalanced,
        totalGroupAssets: Math.round(totalGroupAssets * 100) / 100,
        totalOutstandingLoans: Math.round(totalOutstandingLoans * 100) / 100,
        totalInvestments: Math.round(totalInvestments * 100) / 100
      },
      rows: reconciliationRows
    };
  } catch (error) {
    console.error("getAccountsReconciliationData error:", error);
    return {
      success: false,
      error: error.message,
      summary: {
        totalPhysicalBankCash: 0,
        totalSystemBookCash: 0,
        netVariance: 0,
        isBalanced: true,
        totalGroupAssets: 0
      },
      rows: []
    };
  }
}
