/**
 * Brightlife SHG - Equity Bank Statement Ingestion & Monthly Summary Schema Backfill
 * Task MIG-2: Equity Bank Statement Ingestion & Monthly Summary Schema
 * Official Equity Bank Statement: Account 0020164001424, Period 02-12-2021 to 01-01-2022
 */

const EQUITY_STATEMENT_ACCOUNT_NUMBER = "0020164001424";

/**
 * Raw granular transactions from official Equity Bank Statement (Dec 2021).
 * Preserved for future member transaction cross-referencing and historical backfill.
 */
const EQUITY_DEC_2021_RAW_TRANSACTIONS = [
  {
    date: "2021-12-11",
    desc: "MPS 254723369545 PLB7YBF2AP EDWARDMWANGI",
    ref: "PLB7YBF2AP",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 2000.00,
    moneyOut: 0.00,
    runningBalance: 585423.85
  },
  {
    date: "2021-12-14",
    desc: "MPS 254720791833 PLC11MLBVZ ESTHERNDUTAM",
    ref: "PLC11MLBVZ",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 3000.00,
    moneyOut: 0.00,
    runningBalance: 588423.85
  },
  {
    date: "2021-12-14",
    desc: "MPS 254713608995 PLC31U1E3J ANTHONYMWANG",
    ref: "PLC31U1E3J",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 3000.00,
    moneyOut: 0.00,
    runningBalance: 591423.85
  },
  {
    date: "2021-12-14",
    desc: "MPS 254723953887 PLC31U7QZT MERCYWANJIRU",
    ref: "PLC31U7QZT",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 1000.00,
    moneyOut: 0.00,
    runningBalance: 592423.85
  },
  {
    date: "2021-12-14",
    desc: "MPS 254722375073 PLC01YN6CE SARAHMUTHONI",
    ref: "PLC01YN6CE",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 1750.00,
    moneyOut: 0.00,
    runningBalance: 594173.85
  },
  {
    date: "2021-12-14",
    desc: "MPS 254721286695 PLD433PRPG RUTHWAMBUIMW",
    ref: "PLD433PRPG",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 1000.00,
    moneyOut: 0.00,
    runningBalance: 595173.85
  },
  {
    date: "2021-12-14",
    desc: "MPS 254719406541 PLD93PMUSB HENRYMAINAMW",
    ref: "PLD93PMUSB",
    type: "Deposit",
    channel: "M-Pesa",
    moneyIn: 2000.00,
    moneyOut: 0.00,
    runningBalance: 597173.85
  },
  {
    date: "2021-12-15",
    desc: "MANYORE FESTUS T-BY:/134914395345/15-12-",
    ref: "134914395345",
    type: "Deposit",
    channel: "Transfer",
    moneyIn: 20000.00,
    moneyOut: 0.00,
    runningBalance: 617173.85
  },
  {
    date: "2021-12-23",
    desc: "ChequeNo.000016 Presented-CHQ-16",
    ref: "CHQ-16",
    type: "Withdrawal",
    channel: "Cheque",
    moneyIn: 0.00,
    moneyOut: 40000.00,
    runningBalance: 577173.85
  },
  {
    date: "2021-12-23",
    desc: "Inward Clearing Charge",
    ref: "FEE-CLR",
    type: "Charge",
    channel: "Bank Fee",
    moneyIn: 0.00,
    moneyOut: 60.00,
    runningBalance: 577113.85
  }
];

/**
 * Standard monthly summary aggregates for Equity Bank.
 * New monthly statements are appended here as they become available.
 */
const EQUITY_HISTORICAL_MONTHLY_SUMMARIES = [
  {
    dateStr: "2021-12-31",
    accountName: "Equity Bank",
    accountNumber: EQUITY_STATEMENT_ACCOUNT_NUMBER,
    openingBalance: 583423.85,
    moneyIn: 33750.00,
    moneyOut: 40060.00,
    netChange: -6310.00,
    closingBalance: 577113.85,
    statementRef: "EQ-STMT-DEC-2021",
    notes: "Dec 2021: 8 M-Pesa deposits (33,750.00), 1 Cheque #000016 (40,000.00), 1 Inward clearing fee (60.00)"
  }
];

/**
 * Idempotently executes Equity Bank historical statement backfill.
 * Aggregates monthly summaries and synchronizes 'Equity Statement' and 'Accounts' tabs.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss]
 * @returns {Object} Backfill result summary
 */
function runEquityHistoricalBackfill_(ss) {
  if (!ss) ss = getSpreadsheet_();

  const results = {
    success: false,
    sheetName: SHEETS.EQUITY_STATEMENT,
    rowsBefore: 0,
    rowsAfter: 0,
    insertedCount: 0,
    updatedCount: 0,
    accountsUpdated: false
  };

  // 1. Ensure Equity Statement sheet exists and schema is set up
  if (typeof setupEquityStatementSchema_ === "function") {
    setupEquityStatementSchema_(ss);
  }

  let eqSheet = getSheetByNameInsensitive_(ss, SHEETS.EQUITY_STATEMENT);
  if (!eqSheet) {
    eqSheet = ss.insertSheet(SHEETS.EQUITY_STATEMENT);
  }

  const requiredHeaders = [
    "Statement Date",
    "Account Name",
    "Account Number",
    "Opening Balance",
    "Money In (Deposits)",
    "Money Out (Withdrawals)",
    "Net Change",
    "Closing Balance",
    "Statement Ref",
    "Notes / Breakdown"
  ];

  if (eqSheet.getLastRow() < 1) {
    eqSheet.appendRow(requiredHeaders);
    eqSheet.setFrozenRows(1);
  }

  // Ensure header styling
  try {
    eqSheet.getRange(1, 1, 1, requiredHeaders.length)
      .setFontWeight("bold")
      .setBackground("#800020")
      .setFontColor("#ffffff");
    eqSheet.setFrozenRows(1);
  } catch (eStyle) {}

  const currentVals = eqSheet.getDataRange().getValues();
  results.rowsBefore = Math.max(0, currentVals.length - 1);
  const headerCol = getHeaderMap_(currentVals[0]);

  // Index existing rows by Statement Ref or Date
  const existingByRef = {};
  const existingByDate = {};
  for (let r = 1; r < currentVals.length; r++) {
    const sRef = headerCol["Statement Ref"] !== undefined ? String(currentVals[r][headerCol["Statement Ref"]] || "").trim() : "";
    const sDate = headerCol["Statement Date"] !== undefined ? String(currentVals[r][headerCol["Statement Date"]] || "").trim() : "";
    if (sRef) existingByRef[sRef] = r + 1; // 1-based row index
    if (sDate) existingByDate[sDate.substring(0, 10)] = r + 1;
  }

  // Monthly summaries to process
  const summaries = EQUITY_HISTORICAL_MONTHLY_SUMMARIES.slice();

  summaries.forEach(function (summary) {
    const rowArray = [
      summary.dateStr,
      summary.accountName,
      summary.accountNumber,
      summary.openingBalance,
      summary.moneyIn,
      summary.moneyOut,
      summary.netChange,
      summary.closingBalance,
      summary.statementRef,
      summary.notes
    ];

    const matchRow = existingByRef[summary.statementRef] || existingByDate[summary.dateStr];
    if (matchRow) {
      // Update existing row
      eqSheet.getRange(matchRow, 1, 1, rowArray.length).setValues([rowArray]);
      results.updatedCount++;
    } else {
      // Append new row
      eqSheet.appendRow(rowArray);
      results.insertedCount++;
    }
  });

  // Apply number formatting
  const totalRows = Math.max(eqSheet.getLastRow() - 1, 1);
  try {
    eqSheet.getRange(2, 3, totalRows, 1).setNumberFormat("@");
    eqSheet.getRange(2, 4, totalRows, 5).setNumberFormat("#,##0.00");
  } catch (eFmt) {}

  results.rowsAfter = Math.max(0, eqSheet.getLastRow() - 1);

  // 2. Synchronize Equity Bank on Accounts tab
  try {
    const accSheet = getSheetByNameInsensitive_(ss, SHEETS.ACCOUNTS);
    if (accSheet && accSheet.getLastRow() > 1) {
      const aVals = accSheet.getDataRange().getValues();
      const aCol = getHeaderMap_(aVals[0]);
      const orgCol = aCol["Org. Name"];
      const accCol = aCol["Acc. Number"];

      if (orgCol !== undefined && accCol !== undefined) {
        for (let r = 1; r < aVals.length; r++) {
          const org = String(aVals[r][orgCol] || "").toLowerCase();
          if (org.indexOf("equity") !== -1) {
            accSheet.getRange(r + 1, accCol + 1).setNumberFormat("@").setValue(EQUITY_STATEMENT_ACCOUNT_NUMBER);
            results.accountsUpdated = true;
            break;
          }
        }
      }
    }
  } catch (eAcc) {
    console.error("runEquityHistoricalBackfill_: Failed to sync Accounts sheet: " + eAcc.message);
  }

  results.success = true;
  return results;
}
