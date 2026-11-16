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

  const orgName = rows[rowNumber - 1][col["Org. Name"]];
  appendAuditLog_(
    "account.reconcile",
    "Accounts",
    String(orgName || rowNumber),
    "Updated physical statement balance for " + orgName + " to KES " + stmtBal,
    JSON.stringify({ row: rowNumber, org: orgName, balance: stmtBal })
  );

  return { success: true };
}
