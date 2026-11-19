/**
 * Append-only audit trail in sheet "AuditLog".
 * Columns: Timestamp, Actor Email, Action, Entity, Entity ID, Summary, Details
 */

function syncRepaymentsStatusFromContributions_() {
  const ss = getSpreadsheet_();
  let repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
  if (!repSheet) {
    const allSheets = ss.getSheets();
    for (let s = 0; s < allSheets.length; s++) {
      const sName = allSheets[s].getName().replace(/\s+/g, "").toLowerCase();
      if (sName === "loanrepayments" || sName === "loanrepayment") {
        repSheet = allSheets[s];
        break;
      }
    }
  }

  const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
  if (!repSheet || !cSheet || repSheet.getLastRow() <= 1 || cSheet.getLastRow() <= 1) return;

  // Make sure Status column is in repSheet
  let repVals = repSheet.getDataRange().getValues();
  let repCol = getHeaderMap_(repVals[0]);
  if (repCol["Status"] === undefined) {
    const newColIdx = repSheet.getLastColumn() + 1;
    repSheet.getRange(1, newColIdx).setValue("Status");
    repVals = repSheet.getDataRange().getValues();
    repCol = getHeaderMap_(repVals[0]);
  }
  if (repCol["Verified By"] === undefined) {
    const newColIdx = repSheet.getLastColumn() + 1;
    repSheet.getRange(1, newColIdx).setValue("Verified By");
    repVals = repSheet.getDataRange().getValues();
    repCol = getHeaderMap_(repVals[0]);
  }

  // Attach Constants!$E$2:$E validation to Status in repSheet
  const constSheet = ss.getSheetByName(SHEETS.CONSTANTS);
  if (constSheet && repCol["Status"] !== undefined) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(constSheet.getRange("E2:E"), true)
      .setAllowInvalid(true)
      .build();
    repSheet.getRange(2, repCol["Status"] + 1, Math.max(repSheet.getLastRow() - 1, 1), 1).setDataValidation(rule);
  }

  const cVals = cSheet.getDataRange().getValues();
  const cCol = getHeaderMap_(cVals[0]);

  // Read status from Contributions
  const cMap = {};
  for (let c = 1; c < cVals.length; c++) {
    const type = String(cVals[c][cCol["Type"]] || "").toLowerCase();
    if (type.indexOf("loan") !== -1 || type.indexOf("repayment") !== -1) {
      const amt = Number(cVals[c][cCol["Amount"]]) || 0;
      const status = cCol["Status"] !== undefined ? String(cVals[c][cCol["Status"]] || "").trim() : "Approved";
      const mid = cCol["Member ID"] !== undefined ? String(cVals[c][cCol["Member ID"]] || "").trim().toLowerCase() : "";
      const key = mid + "_" + amt;
      cMap[key] = status;
    }
  }

  // Update repSheet rows to match
  for (let r = 1; r < repVals.length; r++) {
    const rAmt = Number(repVals[r][repCol["Total Paid"]]) || 0;
    const rMid = repCol["Member ID"] !== undefined ? String(repVals[r][repCol["Member ID"]] || "").trim().toLowerCase() : "";
    const key = rMid + "_" + rAmt;
    const matchedStatus = cMap[key] || "Pending";
    repSheet.getRange(r + 1, repCol["Status"] + 1).setValue(matchedStatus);
  }
}
function getOrCreateAuditSheet_() {
  var ss = getSpreadsheet_();
  var sheet = getSheetByNameInsensitive_(ss, SHEETS.AUDIT_LOG);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SHEETS.AUDIT_LOG);
  sheet.appendRow([
    "Timestamp",
    "Actor Email",
    "Action",
    "Entity",
    "Entity ID",
    "Summary",
    "Details",
  ]);
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * @param {string} action e.g. member.create, member.update, contribution.create
 * @param {string} entity e.g. Member, Contribution
 * @param {string} entityId optional id or ""
 * @param {string} summary one line
 * @param {string} detailsJson optional JSON string
 */
function appendAuditLog_(action, entity, entityId, summary, detailsJson) {
  try {
    var sheet = getOrCreateAuditSheet_();
    var tz = getSpreadsheet_().getSpreadsheetTimeZone();
    var ts = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
    var email = "";
    try {
      email = String(Session.getActiveUser().getEmail() || "").trim();
    } catch (e) {}
    sheet.appendRow([
      ts,
      email,
      action,
      entity,
      entityId || "",
      summary || "",
      detailsJson || "",
    ]);
  } catch (err) {
    console.error("appendAuditLog_: " + err);
  }
}

/**
 * Global onEdit Trigger for the Google Sheets Workbook
 * When a user directly types or changes a Member ID in Contributions, Loans, or Guarantors,
 * this instantly looks up the member's full name from Members and writes it cleanly.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();
    const col = e.range.getColumn();

    if (row <= 1) return;
    if (sheetName !== SHEETS.CONTRIBUTIONS && sheetName !== SHEETS.LOANS && sheetName !== SHEETS.GUARANTORS && sheetName !== SHEETS.LOAN_REPAYMENTS) {
      return;
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headerMap = getHeaderMap_(headers);

    let midColName = "Member ID";
    let nameColName = "Member Name";
    if (sheetName === SHEETS.LOANS || sheetName === SHEETS.LOAN_REPAYMENTS) nameColName = "Borrower Name";
    if (sheetName === SHEETS.GUARANTORS) nameColName = "Guarantor Name";

    const midColIdx = headerMap[midColName];
    const nameColIdx = headerMap[nameColName];

    if (midColIdx === undefined || nameColIdx === undefined) return;

    const ss = sheet.getParent();
    const memberSheet = ss.getSheetByName(SHEETS.MEMBERS);
    if (!memberSheet) return;

    // User edited the Member ID column
    if (col === midColIdx + 1) {
      const changedMid = String(e.value || sheet.getRange(row, col).getValue() || "").trim();
      const nameCell = sheet.getRange(row, nameColIdx + 1);

      if (!changedMid) {
        nameCell.setValue("");
        return;
      }

      // Lookup Name from Members sheet
      const memVals = memberSheet.getDataRange().getValues();
      const memCol = getHeaderMap_(memVals[0]);
      let resolvedName = "";

      for (let i = 1; i < memVals.length; i++) {
        const id = String(memVals[i][memCol["Member ID"]] || "").trim();
        if (id.toLowerCase() === changedMid.toLowerCase()) {
          const first = String(memVals[i][memCol["First Name"]] || "").trim();
          const middle = String(memVals[i][memCol["Middle Name"]] || "").trim();
          const last = String(memVals[i][memCol["Last Name"]] || "").trim();
          const initial = middle ? middle.charAt(0) + "." : "";
          resolvedName = (first + " " + initial + " " + last).replace(/\s+/g, " ").trim();
          if (!resolvedName) resolvedName = (first + " " + last).replace(/\s+/g, " ").trim();
          break;
        }
      }

      if (resolvedName) {
        nameCell.setValue(resolvedName);
      }
    }
  } catch (err) {
    console.error("onEdit trigger error: " + err.message);
  }
}

/**
 * Self-healing Schema Migration & Integrity Utility
 * Enforces:
 * 1. Member ID placed directly BEFORE Member Name.
 * 2. Member ID is the single source of truth foreign key.
 * 3. Member Name column is dynamically populated via formula XLOOKUP.
 * 4. Adds data validation dropdown on Member ID column referencing Members sheet.
 * 5. Adds Principal Paid, Interest Paid, and Fee Paid columns to Loans sheet if missing.
 */
function runSchemaMigrationAddMemberIds_() {
  const ss = getSpreadsheet_();

  // 0. Ensure all Named Ranges are registered
  try {
    setupAllNamedRanges_(ss);
  } catch (errNR) {
    console.error("Named ranges initial setup error: " + errNR.message);
  }

  // 1. Build a fast lookup map: Name -> Member ID from Members sheet
  const memberSheet = ss.getSheetByName(SHEETS.MEMBERS);
  const nameToId = {};
  const idToFullName = {};
  let totalMembersCount = 0;
  if (memberSheet && memberSheet.getLastRow() > 1) {
    const memValues = memberSheet.getDataRange().getValues();
    const memCol = getHeaderMap_(memValues[0]);
    if (memCol["Member ID"] !== undefined) {
      totalMembersCount = memValues.length - 1;
      for (let i = 1; i < memValues.length; i++) {
        const mid = String(memValues[i][memCol["Member ID"]] || "").trim();
        const first = String(memValues[i][memCol["First Name"]] || "").trim();
        const middle = String(memValues[i][memCol["Middle Name"]] || "").trim();
        const last = String(memValues[i][memCol["Last Name"]] || "").trim();
        const initial = middle ? middle.charAt(0) + "." : "";

        const full1 = (first + " " + middle + " " + last).replace(/\s+/g, " ").trim();
        const full2 = (first + " " + initial + " " + last).replace(/\s+/g, " ").trim();
        const full3 = (first + " " + last).replace(/\s+/g, " ").trim();

        if (mid) {
          idToFullName[mid] = full1 || full3;
          if (full1) nameToId[full1.toLowerCase()] = mid;
          if (full2) nameToId[full2.toLowerCase()] = mid;
          if (full3) nameToId[full3.toLowerCase()] = mid;
          nameToId[mid.toLowerCase()] = mid;
        }
      }
    }
  }

  // Helper to reorder Member ID before Member Name and apply XLOOKUP formula
  function setupTableColumns_(sheet, midHeader, nameHeader) {
    if (!sheet || sheet.getLastRow() < 1) return;
    const vals = sheet.getDataRange().getValues();
    const col = getHeaderMap_(vals[0]);

    let midIdx = col[midHeader];
    let nameIdx = col[nameHeader];

    // Ensure Member ID column exists
    if (midIdx === undefined) {
      if (nameIdx !== undefined) {
        // Insert Member ID directly BEFORE Member Name
        sheet.insertColumnBefore(nameIdx + 1);
        sheet.getRange(1, nameIdx + 1).setValue(midHeader);
      } else {
        sheet.insertColumnAfter(1);
        sheet.getRange(1, 2).setValue(midHeader);
      }
    } else if (nameIdx !== undefined && midIdx > nameIdx) {
      // Member ID exists but is AFTER Member Name -> Move Member ID column before Member Name
      const midColNumber = midIdx + 1;
      const nameColNumber = nameIdx + 1;
      sheet.moveColumns(sheet.getRange(1, midColNumber), nameColNumber);
    }

    // Refresh layout indices after column move/insert
    const freshVals = sheet.getDataRange().getValues();
    const freshCol = getHeaderMap_(freshVals[0]);
    const finalMidIdx = freshCol[midHeader];
    const finalNameIdx = freshCol[nameHeader];

    if (finalMidIdx === undefined || finalNameIdx === undefined) return;

    // Backfill empty Member IDs using existing names
    for (let r = 1; r < freshVals.length; r++) {
      const curMid = String(freshVals[r][finalMidIdx] || "").trim();
      if (!curMid) {
        const rawName = String(freshVals[r][finalNameIdx] || "").trim().toLowerCase();
        let matchedId = nameToId[rawName];
        if (!matchedId) {
          for (const k in nameToId) {
            if (rawName.indexOf(k) !== -1 || k.indexOf(rawName) !== -1) {
              matchedId = nameToId[k];
              break;
            }
          }
        }
        if (matchedId) {
          sheet.getRange(r + 1, finalMidIdx + 1).setValue(matchedId);
        }
      }
    }

    // Remove any conflicting Data Validation rules on the Name column
    // so formulas or text can be placed freely without validation rejections
    sheet.getRange(2, finalNameIdx + 1, Math.max(sheet.getLastRow() - 1, 1), 1).clearDataValidations();

    const midColLetter = getColLetter_(finalMidIdx + 1);
    for (let r = 2; r <= Math.max(sheet.getLastRow(), 2); r++) {
      const cell = sheet.getRange(r, finalNameIdx + 1);
      // Use Named Ranges: Members_MemberID and Members_FullName
      const formula = '=IF(' + midColLetter + r + '="", "", IFERROR(XLOOKUP(' + midColLetter + r + ', Members_MemberID, Members_FullName, "—"), ""))';
      cell.clearContent();
      cell.setFormula(formula);
    }

    // Add Data Validation Dropdown to Member ID column pointing to Members_MemberID
    const memIdRange = ss.getRangeByName("Members_MemberID");
    if (memIdRange) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(memIdRange, true)
        .setAllowInvalid(false)
        .setHelpText("Please select a valid Member ID registered in the Members directory.")
        .build();
      sheet.getRange(2, finalMidIdx + 1, Math.max(sheet.getLastRow() - 1, 1), 1).setDataValidation(rule);
    }
  }

  // Apply to Contributions, Loans, and Guarantors
  try {
    setupTableColumns_(ss.getSheetByName(SHEETS.CONTRIBUTIONS), "Member ID", "Member Name");
  } catch (errC) {
    console.error("Contributions column setup error: " + errC.message);
  }

  try {
    setupLoansSchemaAndFormulas_(ss, nameToId, idToFullName);
  } catch (errL) {
    console.error("Loans schema and formula setup error: " + errL.message);
  }

  try {
    setupTableColumns_(ss.getSheetByName(SHEETS.GUARANTORS), "Member ID", "Guarantor Name");
  } catch (errG) {
    console.error("Guarantors column setup error: " + errG.message);
  }

  // Helper to attach Status column with Data Validation pointing to Constants!$E$2:$E
  function setupStatusValidation_(sheet, statusColName, verifiedByColName) {
    if (!sheet || sheet.getLastRow() < 1) return;
    const vals = sheet.getDataRange().getValues();
    const col = getHeaderMap_(vals[0]);
    let statusIdx = col[statusColName];
    if (statusIdx === undefined) {
      let lastC = sheet.getLastColumn() + 1;
      sheet.getRange(1, lastC).setValue(statusColName);
      statusIdx = lastC - 1;
    }
    if (verifiedByColName && col[verifiedByColName] === undefined) {
      let lastC = sheet.getLastColumn() + 1;
      sheet.getRange(1, lastC).setValue(verifiedByColName);
    }

    const constSheet = ss.getSheetByName(SHEETS.CONSTANTS);
    if (constSheet) {
      // Column E in Constants sheet (Constants!$E$2:$E)
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInRange(constSheet.getRange("E2:E"), true)
        .setAllowInvalid(true)
        .build();
      sheet.getRange(2, statusIdx + 1, Math.max(sheet.getLastRow() - 1, 1), 1).setDataValidation(rule);
    }

    // Only backfill truly legacy rows (if row was added before today and has no status)
    // Do NOT overwrite rows that were explicitly saved or left blank intentionally
    const freshVals = sheet.getDataRange().getValues();
    for (let r = 1; r < freshVals.length; r++) {
      const curStat = String(freshVals[r][statusIdx] || "").trim();
      // Only set to Approved if cell is completely undefined or null in old historical rows
      if (curStat === "") {
        // Leave existing blank or set to Pending for recent entries
      }
    }
  }

  // Ensure dedicated LoanRepayments sheet exists with proper columns
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
    setupTableColumns_(repSheet, "Member ID", "Borrower Name");
    setupStatusValidation_(repSheet, "Status", "Verified By");
  } catch (errR) {
    console.error("LoanRepayments sheet setup error: " + errR.message);
  }

  // Ensure Contributions has Status column with validation to Constants!$E$2:$E
  try {
    const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
    if (cSheet) {
      setupStatusValidation_(cSheet, "Status", "Verified By");
    }
  } catch (errCStat) {
    console.error("Contributions status validation setup error: " + errCStat.message);
  }

  try {
    syncRepaymentsStatusFromContributions_();
  } catch (errSync) {
    console.error("syncRepaymentsStatusFromContributions_ error: " + errSync.message);
  }

  // Setup formula-driven dynamic Total Savings on Members sheet
  try {
    setupLoanRepaymentsFormulas_(ss);
  } catch (errRepF) {
    console.error("setupLoanRepaymentsFormulas_ error: " + errRepF.message);
  }

  try {
    setupGuarantorsSchemaAndFormulas_(ss);
  } catch (errGuarF) {
    console.error("setupGuarantorsSchemaAndFormulas_ error: " + errGuarF.message);
  }

  let savError = null;
  try {
    setupMembersSavingsFormula_(ss);
  } catch (errSav) {
    savError = errSav.message + " | " + errSav.stack;
    console.error("setupMembersSavingsFormula_ error: " + errSav.message);
  }

  // Refresh Contributions Member Name formula so any legacy #REF! is repaired
  try {
    setupTableColumns_(ss.getSheetByName(SHEETS.CONTRIBUTIONS), "Member ID", "Member Name");
  } catch (errCRef) {
    console.error("Contributions repair error: " + errCRef.message);
  }

  // Setup formula-driven dynamic Bank & Cash Reconciliation on Accounts sheet
  try {
    setupAccountsReconciliationSchema_(ss);
  } catch (errAcc) {
    console.error("setupAccountsReconciliationSchema_ error: " + errAcc.message);
  }

  // Setup Fund Statements schema and initial CIC MMF statement records
  try {
    setupFundStatementsSchema_(ss);
  } catch (errFund) {
    console.error("setupFundStatementsSchema_ error: " + errFund.message);
  }

  // Normalize historical deposit channels across operational sheets to approved channels
  try {
    normalizeHistoricalDepositChannels_(ss);
  } catch (errNorm) {
    console.error("normalizeHistoricalDepositChannels_ error: " + errNorm.message);
  }

  return { success: true, savError: savError };
}

/**
 * Normalizes deposit channels on existing historical rows to strictly the 5 approved channels
 */
function normalizeHistoricalDepositChannels_(ss) {
  if (!ss) ss = getSpreadsheet_();
  [SHEETS.CONTRIBUTIONS, SHEETS.LOAN_REPAYMENTS, SHEETS.ACCOUNTS].forEach(function (sName) {
    const s = ss.getSheetByName(sName);
    if (!s || s.getLastRow() <= 1) return;
    const vals = s.getDataRange().getValues();
    const col = getHeaderMap_(vals[0]);
    const chanCol = col["Deposit Channel"] !== undefined ? col["Deposit Channel"] : (col["Payment Mode"] !== undefined ? col["Payment Mode"] : col["Channel"]);
    if (chanCol === undefined) return;
    for (let r = 1; r < vals.length; r++) {
      const raw = String(vals[r][chanCol] || "").trim();
      const norm = normalizeDepositChannel_(raw);
      if (raw !== norm) {
        s.getRange(r + 1, chanCol + 1).setValue(norm);
      }
    }
  });
}

/**
 * Ensures 'Accounts' sheet has formula-driven columns:
 * Inflows (SUMIFS), Outflows (SUMIFS), System Balance, Statement Balance, Variance, Status
 */
function setupAccountsReconciliationSchema_(ss) {
  if (!ss) ss = getSpreadsheet_();
  const accSheet = ss.getSheetByName(SHEETS.ACCOUNTS);
  if (!accSheet || accSheet.getLastRow() < 1) return;

  const vals = accSheet.getDataRange().getValues();
  const col = getHeaderMap_(vals[0]);

  const requiredHeaders = [
    "Org. Name",
    "Acc. Number",
    "Payment Mode",
    "Paybill",
    "Inflows",
    "Outflows",
    "System Balance",
    "Statement Balance",
    "Balance Date",
    "Variance",
    "Reconciliation Status"
  ];

  let lastCol = accSheet.getLastColumn();
  requiredHeaders.forEach(function(h) {
    if (col[h] === undefined) {
      lastCol++;
      accSheet.getRange(1, lastCol).setValue(h);
    }
  });

  const freshVals = accSheet.getDataRange().getValues();
  const freshCol = getHeaderMap_(freshVals[0]);

  const channelColIdx = freshCol["Deposit Channel"] !== undefined ? freshCol["Deposit Channel"] : freshCol["Payment Mode"];
  const modeColLetter = getColLetter_(channelColIdx + 1);
  const inflowsColLetter = getColLetter_(freshCol["Inflows"] + 1);
  const outflowsColLetter = getColLetter_(freshCol["Outflows"] + 1);
  const sysBalColLetter = getColLetter_(freshCol["System Balance"] + 1);
  const stmtBalColLetter = getColLetter_(freshCol["Statement Balance"] + 1);

  // Migrate legacy 'Balance' to 'Statement Balance' if needed
  if (freshCol["Balance"] !== undefined && freshCol["Statement Balance"] !== undefined) {
    for (let r = 2; r <= freshVals.length; r++) {
      const oldBal = freshVals[r - 1][freshCol["Balance"]];
      const curStmt = freshVals[r - 1][freshCol["Statement Balance"]];
      if ((curStmt === "" || curStmt === 0 || curStmt === undefined) && oldBal !== "" && oldBal !== undefined) {
        accSheet.getRange(r, freshCol["Statement Balance"] + 1).setValue(oldBal);
      }
    }
  }

  // Dynamically resolve Contributions and Loan Repayments column letters
  let cAmtLetter = "D";
  let cModeLetter = "E";
  let cStatLetter = "H";
  try {
    const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
    if (cSheet && cSheet.getLastRow() >= 1) {
      const cHeaders = cSheet.getRange(1, 1, 1, cSheet.getLastColumn()).getValues()[0];
      const cCol = getHeaderMap_(cHeaders);
      if (cCol["Amount"] !== undefined) cAmtLetter = getColLetter_(cCol["Amount"] + 1);
      const cm = cCol["Deposit Channel"] !== undefined ? cCol["Deposit Channel"] : cCol["Payment Mode"];
      if (cm !== undefined) cModeLetter = getColLetter_(cm + 1);
      if (cCol["Status"] !== undefined) cStatLetter = getColLetter_(cCol["Status"] + 1);
    }
  } catch (eC) {}

  let rTotalLetter = "E";
  let rModeLetter = "J";
  let rStatLetter = "M";
  try {
    const rSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
    if (rSheet && rSheet.getLastRow() >= 1) {
      const rHeaders = rSheet.getRange(1, 1, 1, rSheet.getLastColumn()).getValues()[0];
      const rCol = getHeaderMap_(rHeaders);
      const rt = rCol["Total Paid"] !== undefined ? rCol["Total Paid"] : rCol["Amount"];
      if (rt !== undefined) rTotalLetter = getColLetter_(rt + 1);
      const rm = rCol["Deposit Channel"] !== undefined ? rCol["Deposit Channel"] : rCol["Payment Mode"];
      if (rm !== undefined) rModeLetter = getColLetter_(rm + 1);
      if (rCol["Status"] !== undefined) rStatLetter = getColLetter_(rCol["Status"] + 1);
    }
  } catch (eR) {}

  // Populate dynamic SUMIFS formulas and update account deposit channels
  const totalRows = Math.max(accSheet.getLastRow(), 2);
  for (let r = 2; r <= totalRows; r++) {
    const orgCell = freshVals[r - 1] ? String(freshVals[r - 1][freshCol["Org. Name"]] || "").trim() : "";
    if (!orgCell) continue;

    // Ensure account row matches the exact Deposit Channel name
    if (channelColIdx !== undefined) {
      const orgLower = orgCell.toLowerCase();
      const targetChannel = orgLower.indexOf("equity") !== -1
        ? "Equity Bank"
        : (orgLower.indexOf("cic") !== -1
            ? "CIC MMF"
            : (orgLower.indexOf("mansa") !== -1
                ? "Mansa X"
                : orgCell));
      const curChan = String(freshVals[r - 1][channelColIdx] || "").trim();
      if (!curChan || curChan.toLowerCase() === "m-pesa") {
        accSheet.getRange(r, channelColIdx + 1).setValue(targetChannel);
      }
    }

    // Inflows = Contributions + Loan Repayments matching this channel via Named Ranges
    if (freshCol["Inflows"] !== undefined) {
      const inflowFormula = '=SUMIFS(Contributions_Amount, Contributions_Mode, ' + modeColLetter + r + ', Contributions_Status, "Approved") + SUMIFS(Repayments_TotalPaid, Repayments_Mode, ' + modeColLetter + r + ', Repayments_Status, "Approved")';
      accSheet.getRange(r, freshCol["Inflows"] + 1).setFormula(inflowFormula);
    }

    // Outflows = Loans Disbursed (where Status = 'Approved' or 'Active') or Investments
    if (freshCol["Outflows"] !== undefined) {
      accSheet.getRange(r, freshCol["Outflows"] + 1).setValue(0);
    }

    // System Balance = Inflows - Outflows
    if (freshCol["System Balance"] !== undefined) {
      const sysBalFormula = '=' + inflowsColLetter + r + ' - ' + outflowsColLetter + r;
      accSheet.getRange(r, freshCol["System Balance"] + 1).setFormula(sysBalFormula);
    }

    // Variance = Statement Balance - System Balance
    if (freshCol["Variance"] !== undefined) {
      const varFormula = '=' + stmtBalColLetter + r + ' - ' + sysBalColLetter + r;
      accSheet.getRange(r, freshCol["Variance"] + 1).setFormula(varFormula);
    }

    // Status: Reconciled vs Variance
    if (freshCol["Reconciliation Status"] !== undefined) {
      const varLetter = getColLetter_(freshCol["Variance"] + 1);
      const statFormula = '=IF(' + varLetter + r + ' = 0, "Reconciled", IF(' + varLetter + r + ' > 0, "Surplus", "Deficit"))';
      accSheet.getRange(r, freshCol["Reconciliation Status"] + 1).setFormula(statFormula);
    }
  }
}

/**
 * Ensures 'Fund Statements' sheet exists and contains verified monthly statement summaries.
 */
function setupFundStatementsSchema_(ss) {
  if (!ss) ss = getSpreadsheet_();
  let fundSheet = ss.getSheetByName(SHEETS.FUND_STATEMENTS);
  if (!fundSheet) {
    fundSheet = ss.insertSheet(SHEETS.FUND_STATEMENTS);
  }

  const requiredHeaders = [
    "Statement Date",
    "Fund Channel",
    "Opening Balance",
    "Purchases / Deposits",
    "Gross Interest",
    "Withholding Tax",
    "Net Yield",
    "Withdrawals",
    "Closing Balance",
    "Statement Ref"
  ];

  if (fundSheet.getLastRow() < 1) {
    fundSheet.appendRow(requiredHeaders);
    fundSheet.setFrozenRows(1);
  } else {
    const vals = fundSheet.getDataRange().getValues();
    const col = getHeaderMap_(vals[0]);
    let lastCol = fundSheet.getLastColumn();
    requiredHeaders.forEach(function(h) {
      if (col[h] === undefined) {
        lastCol++;
        fundSheet.getRange(1, lastCol).setValue(h);
      }
    });
  }

  // Pre-populate initial CIC MMF statement rows if sheet only has headers
  if (fundSheet.getLastRow() <= 1) {
    const initialRows = [
      [
        new Date(2026, 7, 31), // 31 Aug 2026
        "CIC MMF",
        899551.63,
        6500.00,
        6186.49,
        927.97,
        "=E2-F2",
        0,
        911310.15,
        "CIC-MMF-AUG-2026"
      ],
      [
        new Date(2026, 8, 30), // 30 Sep 2026
        "CIC MMF",
        911310.15,
        9500.00,
        6096.37,
        914.46,
        "=E3-F3",
        0,
        925992.07,
        "CIC-MMF-SEP-2026"
      ],
      [
        new Date(2026, 9, 31), // 31 Oct 2026
        "CIC MMF",
        925992.07,
        45000.00,
        6555.40,
        983.31,
        "=E4-F4",
        0,
        976564.16,
        "CIC-MMF-OCT-2026"
      ]
    ];

    initialRows.forEach(function(row) {
      fundSheet.appendRow(row);
    });
  }

  // Sync CIC MMF Statement Balance in Accounts sheet to 976,564.16 as of 31-Oct-2026
  try {
    const accSheet = ss.getSheetByName(SHEETS.ACCOUNTS);
    if (accSheet && accSheet.getLastRow() > 1) {
      const aVals = accSheet.getDataRange().getValues();
      const aCol = getHeaderMap_(aVals[0]);
      const stmtCol = aCol["Statement Balance"] !== undefined ? aCol["Statement Balance"] : aCol["Balance"];
      const dateCol = aCol["Balance Date"];
      const orgCol = aCol["Org. Name"];

      if (stmtCol !== undefined && orgCol !== undefined) {
        for (let r = 1; r < aVals.length; r++) {
          const org = String(aVals[r][orgCol] || "").toLowerCase();
          if (org.indexOf("cic") !== -1) {
            accSheet.getRange(r + 1, stmtCol + 1).setValue(976564.16);
            if (dateCol !== undefined) {
              accSheet.getRange(r + 1, dateCol + 1).setValue(new Date(2026, 9, 31));
            }
            break;
          }
        }
      }
    }
  } catch (eAcc) {
    console.error("Failed to sync CIC MMF balance to Accounts: " + eAcc.message);
  }
}

/**
 * Ensures 'Total Savings', 'Current Loan Balance', 'Guaranteed Amount',
 * 'Max Loan Eligibility', and 'Available to Guarantee' on Members sheet are 100% dynamic and formula-driven.
 */
/**
 * Helper to get column range from row 2 downward for named range
 */
function getNamedColumnRange_(ss, sheetName, colLetter) {
  const s = ss.getSheetByName(sheetName);
  if (!s) return null;
  const maxRows = Math.max(s.getMaxRows(), 100);
  return s.getRange(colLetter + "2:" + colLetter + maxRows);
}

/**
 * Helper to register or update a Named Range on the Spreadsheet in-place
 * (Uses setRange so existing formula references are never broken into #REF!)
 */
function setOrUpdateNamedRange_(ss, name, range) {
  if (!ss || !name || !range) return;
  try {
    const namedRanges = ss.getNamedRanges();
    for (let i = 0; i < namedRanges.length; i++) {
      if (namedRanges[i].getName() === name) {
        namedRanges[i].setRange(range);
        return;
      }
    }
    ss.setNamedRange(name, range);
  } catch (err) {
    console.error("setNamedRange error for " + name + ": " + err.message);
  }
}

/**
 * Registers Named Ranges across all operational sheets so cross-sheet formulas
 * use human-readable column names (e.g. Members_MemberID, Members_FullName, Loans_Balance)
 * rather than fragile, hardcoded column letters (A, B, C...).
 */
function setupAllNamedRanges_(ss) {
  if (!ss) ss = getSpreadsheet_();

  // 1. Members
  const memSheet = ss.getSheetByName(SHEETS.MEMBERS);
  if (memSheet && memSheet.getLastRow() >= 1) {
    const memH = memSheet.getDataRange().getValues()[0];
    const memCol = getHeaderMap_(memH);

    if (memCol["Member ID"] !== undefined) {
      const l = getColLetter_(memCol["Member ID"] + 1);
      setOrUpdateNamedRange_(ss, "Members_MemberID", getNamedColumnRange_(ss, SHEETS.MEMBERS, l));
    }
    const fnCol = memCol["Full Name"] !== undefined ? memCol["Full Name"] : memCol["Member Name"];
    if (fnCol !== undefined) {
      const l = getColLetter_(fnCol + 1);
      setOrUpdateNamedRange_(ss, "Members_FullName", getNamedColumnRange_(ss, SHEETS.MEMBERS, l));
    }
    if (memCol["Total Savings"] !== undefined) {
      const l = getColLetter_(memCol["Total Savings"] + 1);
      setOrUpdateNamedRange_(ss, "Members_TotalSavings", getNamedColumnRange_(ss, SHEETS.MEMBERS, l));
    }
    if (memCol["Current Loan Balance"] !== undefined) {
      const l = getColLetter_(memCol["Current Loan Balance"] + 1);
      setOrUpdateNamedRange_(ss, "Members_CurrentLoanBalance", getNamedColumnRange_(ss, SHEETS.MEMBERS, l));
    }
    if (memCol["Guaranteed Amount"] !== undefined) {
      const l = getColLetter_(memCol["Guaranteed Amount"] + 1);
      setOrUpdateNamedRange_(ss, "Members_GuaranteedAmount", getNamedColumnRange_(ss, SHEETS.MEMBERS, l));
    }
    if (memCol["Status"] !== undefined) {
      const l = getColLetter_(memCol["Status"] + 1);
      setOrUpdateNamedRange_(ss, "Members_Status", getNamedColumnRange_(ss, SHEETS.MEMBERS, l));
    }
  }

  // 2. Loans
  const loanSheet = ss.getSheetByName(SHEETS.LOANS);
  if (loanSheet && loanSheet.getLastRow() >= 1) {
    const lH = loanSheet.getDataRange().getValues()[0];
    const lCol = getHeaderMap_(lH);

    if (lCol["Loan ID"] !== undefined) {
      const l = getColLetter_(lCol["Loan ID"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_LoanID", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    const lMid = lCol["Member ID"] !== undefined ? lCol["Member ID"] : lCol["Member id"];
    if (lMid !== undefined) {
      const l = getColLetter_(lMid + 1);
      setOrUpdateNamedRange_(ss, "Loans_MemberID", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Borrower Name"] !== undefined) {
      const l = getColLetter_(lCol["Borrower Name"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_BorrowerName", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Requested Amount"] !== undefined) {
      const l = getColLetter_(lCol["Requested Amount"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_RequestedAmount", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Interest"] !== undefined) {
      const l = getColLetter_(lCol["Interest"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_Interest", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Transaction Fee"] !== undefined) {
      const l = getColLetter_(lCol["Transaction Fee"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_Fee", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Repayment Amount"] !== undefined) {
      const l = getColLetter_(lCol["Repayment Amount"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_RepaymentAmount", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Total Paid"] !== undefined) {
      const l = getColLetter_(lCol["Total Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_TotalPaid", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Principal Paid"] !== undefined) {
      const l = getColLetter_(lCol["Principal Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_PrincipalPaid", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Interest Paid"] !== undefined) {
      const l = getColLetter_(lCol["Interest Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_InterestPaid", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Fee Paid"] !== undefined) {
      const l = getColLetter_(lCol["Fee Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_FeePaid", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Balance"] !== undefined) {
      const l = getColLetter_(lCol["Balance"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_Balance", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
    if (lCol["Status"] !== undefined) {
      const l = getColLetter_(lCol["Status"] + 1);
      setOrUpdateNamedRange_(ss, "Loans_Status", getNamedColumnRange_(ss, SHEETS.LOANS, l));
    }
  }

  // 3. Loan Repayments
  const repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
  if (repSheet && repSheet.getLastRow() >= 1) {
    const rH = repSheet.getDataRange().getValues()[0];
    const rCol = getHeaderMap_(rH);

    if (rCol["Payment ID"] !== undefined) {
      const l = getColLetter_(rCol["Payment ID"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_PaymentID", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Loan ID"] !== undefined) {
      const l = getColLetter_(rCol["Loan ID"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_LoanID", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    const rMid = rCol["Member ID"] !== undefined ? rCol["Member ID"] : rCol["Member id"];
    if (rMid !== undefined) {
      const l = getColLetter_(rMid + 1);
      setOrUpdateNamedRange_(ss, "Repayments_MemberID", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Borrower Name"] !== undefined) {
      const l = getColLetter_(rCol["Borrower Name"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_BorrowerName", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Total Paid"] !== undefined) {
      const l = getColLetter_(rCol["Total Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_TotalPaid", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Principal Paid"] !== undefined) {
      const l = getColLetter_(rCol["Principal Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_PrincipalPaid", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Interest Paid"] !== undefined) {
      const l = getColLetter_(rCol["Interest Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_InterestPaid", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Fee Paid"] !== undefined) {
      const l = getColLetter_(rCol["Fee Paid"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_FeePaid", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    const rChan = rCol["Deposit Channel"] !== undefined ? rCol["Deposit Channel"] : rCol["Payment Mode"];
    if (rChan !== undefined) {
      const l = getColLetter_(rChan + 1);
      setOrUpdateNamedRange_(ss, "Repayments_Mode", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
    if (rCol["Status"] !== undefined) {
      const l = getColLetter_(rCol["Status"] + 1);
      setOrUpdateNamedRange_(ss, "Repayments_Status", getNamedColumnRange_(ss, SHEETS.LOAN_REPAYMENTS, l));
    }
  }

  // 4. Contributions
  const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
  if (cSheet && cSheet.getLastRow() >= 1) {
    const cH = cSheet.getDataRange().getValues()[0];
    const cCol = getHeaderMap_(cH);

    const cMid = cCol["Member ID"] !== undefined ? cCol["Member ID"] : cCol["Member id"];
    if (cMid !== undefined) {
      const l = getColLetter_(cMid + 1);
      setOrUpdateNamedRange_(ss, "Contributions_MemberID", getNamedColumnRange_(ss, SHEETS.CONTRIBUTIONS, l));
    }
    if (cCol["Member Name"] !== undefined) {
      const l = getColLetter_(cCol["Member Name"] + 1);
      setOrUpdateNamedRange_(ss, "Contributions_MemberName", getNamedColumnRange_(ss, SHEETS.CONTRIBUTIONS, l));
    }
    if (cCol["Amount"] !== undefined) {
      const l = getColLetter_(cCol["Amount"] + 1);
      setOrUpdateNamedRange_(ss, "Contributions_Amount", getNamedColumnRange_(ss, SHEETS.CONTRIBUTIONS, l));
    }
    const cChan = cCol["Deposit Channel"] !== undefined ? cCol["Deposit Channel"] : cCol["Payment Mode"];
    if (cChan !== undefined) {
      const l = getColLetter_(cChan + 1);
      setOrUpdateNamedRange_(ss, "Contributions_Mode", getNamedColumnRange_(ss, SHEETS.CONTRIBUTIONS, l));
    }
    const cType = cCol["Transaction Type"] !== undefined ? cCol["Transaction Type"] : cCol["Type"];
    if (cType !== undefined) {
      const l = getColLetter_(cType + 1);
      setOrUpdateNamedRange_(ss, "Contributions_Type", getNamedColumnRange_(ss, SHEETS.CONTRIBUTIONS, l));
    }
    if (cCol["Status"] !== undefined) {
      const l = getColLetter_(cCol["Status"] + 1);
      setOrUpdateNamedRange_(ss, "Contributions_Status", getNamedColumnRange_(ss, SHEETS.CONTRIBUTIONS, l));
    }
  }

  // 5. Guarantors
  const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
  if (gSheet && gSheet.getLastRow() >= 1) {
    const gH = gSheet.getDataRange().getValues()[0];
    const gCol = getHeaderMap_(gH);

    if (gCol["Loan ID"] !== undefined) {
      const l = getColLetter_(gCol["Loan ID"] + 1);
      setOrUpdateNamedRange_(ss, "Guarantors_LoanID", getNamedColumnRange_(ss, SHEETS.GUARANTORS, l));
    }
    const gMid = gCol["Member ID"] !== undefined ? gCol["Member ID"] : gCol["Member id"];
    if (gMid !== undefined) {
      const l = getColLetter_(gMid + 1);
      setOrUpdateNamedRange_(ss, "Guarantors_MemberID", getNamedColumnRange_(ss, SHEETS.GUARANTORS, l));
    }
    if (gCol["Guaranteed Amount"] !== undefined) {
      const l = getColLetter_(gCol["Guaranteed Amount"] + 1);
      setOrUpdateNamedRange_(ss, "Guarantors_GuaranteedAmount", getNamedColumnRange_(ss, SHEETS.GUARANTORS, l));
    }
    const gStat = gCol["Loan Status"] !== undefined ? gCol["Loan Status"] : gCol["Status"];
    if (gStat !== undefined) {
      const l = getColLetter_(gStat + 1);
      setOrUpdateNamedRange_(ss, "Guarantors_Status", getNamedColumnRange_(ss, SHEETS.GUARANTORS, l));
    }
  }
}

/**
 * Standardizes the 'Loans' sheet:
 * 1. Arranges columns in a standard, logical lending structure:
 *    [Loan ID, Request Date, Approved Date, Member ID, Borrower Name, Requested Amount,
 *     Interest, Transaction Fee, Repayment Amount, Total Paid, Principal Paid,
 *     Interest Paid, Fee Paid, Balance, Status, Borrower’s Own Savings, Total Guaranteed, Shortfall Amount]
 * 2. Backfills missing Member IDs or Borrower Names.
 * 3. Safely preserves all historical data and ensures historical repayments exist in Loan Repayments.
 * 4. Applies native Google Sheets formulas using Named Ranges (Column Names instead of A, B, C...):
 *    - Borrower Name: XLOOKUP(Member ID, Members_MemberID, Members_FullName, "—")
 *    - Repayment Amount: Requested Amount + Interest + Transaction Fee
 *    - Total Paid: SUMIFS(Repayments_TotalPaid, Repayments_LoanID, Loan ID, Repayments_Status, "Approved")
 *    - Principal Paid: SUMIFS of Principal Paid from Loan Repayments
 *    - Interest Paid: SUMIFS of Interest Paid from Loan Repayments
 *    - Fee Paid: SUMIFS of Fee Paid from Loan Repayments
 *    - Balance: MAX(0, Repayment Amount - Total Paid)
 *    - Status: Active if approved and Balance > 0, Settled if Balance <= 0, Pending if not approved
 *    - Borrower's Own Savings: XLOOKUP(Member ID, Members_MemberID, Members_TotalSavings, 0)
 *    - Total Guaranteed: SUMIFS(Guarantors_GuaranteedAmount, Guarantors_LoanID, Loan ID)
 *    - Shortfall Amount: MAX(0, Repayment Amount - (Own Savings + Guaranteed))
 */
function setupLoansSchemaAndFormulas_(ss, nameToId, idToFullName) {
  if (!ss) ss = getSpreadsheet_();
  const loanSheet = ss.getSheetByName(SHEETS.LOANS);
  if (!loanSheet || loanSheet.getLastRow() < 1) return;

  const STANDARD_HEADERS = [
    "Loan ID",                 // A (Col 1)
    "Request Date",            // B (Col 2)
    "Approved Date",           // C (Col 3)
    "Member ID",               // D (Col 4)
    "Borrower Name",           // E (Col 5)
    "Requested Amount",        // F (Col 6)
    "Interest",                // G (Col 7)
    "Transaction Fee",         // H (Col 8)
    "Repayment Amount",        // I (Col 9)
    "Total Paid",              // J (Col 10)
    "Principal Paid",          // K (Col 11)
    "Interest Paid",           // L (Col 12)
    "Fee Paid",                // M (Col 13)
    "Balance",                 // N (Col 14)
    "Status",                  // O (Col 15)
    "Borrower’s Own Savings",  // P (Col 16)
    "Total Guaranteed",        // Q (Col 17)
    "Shortfall Amount",        // R (Col 18)
  ];

  const ALIAS_MAP = {
    "Loan ID": ["loan id", "loanid", "id", "loan_id"],
    "Request Date": ["request date", "application date", "date", "requested date"],
    "Approved Date": ["approved date", "approval date", "date approved"],
    "Member ID": ["member id", "memberid", "member_id", "mid"],
    "Borrower Name": ["borrower name", "borrower", "member name", "name", "borrower_name"],
    "Requested Amount": ["requested amount", "principal amount", "principal", "loan amount", "amount", "requested_amount"],
    "Interest": ["interest", "interest amount", "loan interest"],
    "Transaction Fee": ["transaction fee", "fee", "processing fee", "admin fee", "trans fee"],
    "Repayment Amount": ["repayment amount", "total repayable", "repayable amount", "total amount", "total repayment"],
    "Total Paid": ["total paid", "amount paid", "paid", "repaid"],
    "Principal Paid": ["principal paid", "principal repaid"],
    "Interest Paid": ["interest paid", "interest repaid"],
    "Fee Paid": ["fee paid", "transaction fee paid"],
    "Balance": ["balance", "loan balance", "outstanding balance", "balance remaining", "current balance"],
    "Status": ["status", "loan status"],
    "Borrower’s Own Savings": ["borrower’s own savings", "borrower's own savings", "own savings", "borrower savings", "savings"],
    "Total Guaranteed": ["total guaranteed", "guaranteed amount", "guaranteed", "guarantors total"],
    "Shortfall Amount": ["shortfall amount", "shortfall"]
  };

  const oldVals = loanSheet.getDataRange().getValues();
  const oldHeaders = oldVals[0];
  const oldCol = getHeaderMap_(oldHeaders);
  const numRows = oldVals.length;

  // Extract all existing rows mapped to standardized columns
  const standardRows = [];
  for (let r = 1; r < numRows; r++) {
    const rowObj = {};
    STANDARD_HEADERS.forEach(function (h) {
      if (oldCol[h] !== undefined) {
        rowObj[h] = oldVals[r][oldCol[h]];
      } else {
        const aliases = ALIAS_MAP[h] || [];
        let found = false;
        for (let a = 0; a < aliases.length; a++) {
          const alias = aliases[a];
          for (const rawCol in oldCol) {
            if (rawCol.trim().toLowerCase() === alias) {
              rowObj[h] = oldVals[r][oldCol[rawCol]];
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) rowObj[h] = "";
      }
    });

    // Resolve Member ID from Name or Name from Member ID
    let mid = String(rowObj["Member ID"] || "").trim();
    let bName = String(rowObj["Borrower Name"] || "").trim();

    if (!mid && bName && nameToId) {
      const lower = bName.toLowerCase();
      if (nameToId[lower]) {
        mid = nameToId[lower];
        rowObj["Member ID"] = mid;
      }
    }
    if (!bName && mid && idToFullName) {
      if (idToFullName[mid]) {
        bName = idToFullName[mid];
        rowObj["Borrower Name"] = bName;
      }
    }

    standardRows.push(rowObj);
  }

  // Ensure Loan Repayments sheet exists
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
      "Deposit Channel",
      "Transaction ID",
      "Balance Remaining",
      "Status",
      "Verified By"
    ]);
    repSheet.setFrozenRows(1);
  }

  // Backfill historical repayment records into Loan Repayments if needed
  if (repSheet && repSheet.getLastRow() >= 1) {
    const repVals = repSheet.getDataRange().getValues();
    const repHeaders = repVals[0];
    const repCol = getHeaderMap_(repHeaders);
    const loanApprovedPaid = {};

    for (let i = 1; i < repVals.length; i++) {
      const rLoanId = repCol["Loan ID"] !== undefined ? String(repVals[i][repCol["Loan ID"]] || "").trim() : "";
      const rStat = repCol["Status"] !== undefined ? String(repVals[i][repCol["Status"]] || "").trim() : "";
      const rAmt = repCol["Total Paid"] !== undefined ? (Number(repVals[i][repCol["Total Paid"]]) || 0) : 0;
      if (rLoanId && rStat === "Approved") {
        loanApprovedPaid[rLoanId] = (loanApprovedPaid[rLoanId] || 0) + rAmt;
      }
    }

    standardRows.forEach(function (rowObj) {
      const loanId = String(rowObj["Loan ID"] || "").trim();
      const histPaid = Number(rowObj["Total Paid"]) || 0;
      const existingRepPaid = loanApprovedPaid[loanId] || 0;

      if (loanId && histPaid > existingRepPaid) {
        const missingPaid = histPaid - existingRepPaid;
        const histPrin = Number(rowObj["Principal Paid"]) || missingPaid;
        const histInt = Number(rowObj["Interest Paid"]) || 0;
        const histFee = Number(rowObj["Fee Paid"]) || 0;
        const pId = "PAY-HIST-" + loanId;
        const pDate = rowObj["Approved Date"] || rowObj["Request Date"] || new Date();

        const newRepRow = new Array(repHeaders.length).fill("");
        if (repCol["Payment ID"] !== undefined) newRepRow[repCol["Payment ID"]] = pId;
        if (repCol["Loan ID"] !== undefined) newRepRow[repCol["Loan ID"]] = loanId;
        if (repCol["Payment Date"] !== undefined) newRepRow[repCol["Payment Date"]] = pDate;
        if (repCol["Member ID"] !== undefined) newRepRow[repCol["Member ID"]] = rowObj["Member ID"];
        if (repCol["Borrower Name"] !== undefined) newRepRow[repCol["Borrower Name"]] = rowObj["Borrower Name"];
        if (repCol["Total Paid"] !== undefined) newRepRow[repCol["Total Paid"]] = missingPaid;
        if (repCol["Principal Paid"] !== undefined) newRepRow[repCol["Principal Paid"]] = histPrin;
        if (repCol["Interest Paid"] !== undefined) newRepRow[repCol["Interest Paid"]] = histInt;
        if (repCol["Fee Paid"] !== undefined) newRepRow[repCol["Fee Paid"]] = histFee;
        const repModeCol = repCol["Deposit Channel"] !== undefined ? repCol["Deposit Channel"] : repCol["Payment Mode"];
        if (repModeCol !== undefined) newRepRow[repModeCol] = "Equity Bank";
        if (repCol["Transaction ID"] !== undefined) newRepRow[repCol["Transaction ID"]] = "HISTORICAL";
        if (repCol["Balance Remaining"] !== undefined) newRepRow[repCol["Balance Remaining"]] = Number(rowObj["Balance"]) || 0;
        if (repCol["Status"] !== undefined) newRepRow[repCol["Status"]] = "Approved";
        if (repCol["Verified By"] !== undefined) newRepRow[repCol["Verified By"]] = "System Migration";

        repSheet.appendRow(newRepRow);
        loanApprovedPaid[loanId] = (loanApprovedPaid[loanId] || 0) + missingPaid;
      }
    });
  }

  // Clear sheet contents and write new standard headers
  loanSheet.clearContents();
  loanSheet.getRange(1, 1, 1, STANDARD_HEADERS.length).setValues([STANDARD_HEADERS]);
  loanSheet.setFrozenRows(1);

  // Write re-mapped row data (values only, formulas will be applied below)
  if (standardRows.length > 0) {
    const valuesMatrix = standardRows.map(function (rowObj) {
      return STANDARD_HEADERS.map(function (h) {
        return rowObj[h] !== undefined ? rowObj[h] : "";
      });
    });
    loanSheet.getRange(2, 1, valuesMatrix.length, STANDARD_HEADERS.length).setValues(valuesMatrix);
  }

  // Refresh Named Ranges so that Loans columns are registered under their standard names
  setupAllNamedRanges_(ss);

  const totalRows = Math.max(loanSheet.getLastRow(), 2);

  // Apply native Google Sheets formulas row by row using Named Ranges (Column Names)
  for (let r = 2; r <= totalRows; r++) {
    // E (Borrower Name): XLOOKUP from Members using Named Ranges
    loanSheet.getRange(r, 5).setFormula(
      '=IF(D' + r + '="", "", IFERROR(XLOOKUP(D' + r + ', Members_MemberID, Members_FullName, "—"), ""))'
    );

    // I (Repayment Amount): Requested Amount (F) + Interest (G) + Fee (H)
    loanSheet.getRange(r, 9).setFormula(
      '=IF(F' + r + '="", 0, F' + r + ' + G' + r + ' + H' + r + ')'
    );

    // J (Total Paid): SUMIFS from Loan Repayments using Named Ranges
    loanSheet.getRange(r, 10).setFormula(
      '=IF(A' + r + '="", 0, SUMIFS(Repayments_TotalPaid, Repayments_LoanID, A' + r + ', Repayments_Status, "Approved"))'
    );

    // K (Principal Paid): SUMIFS of Principal Paid from Loan Repayments using Named Ranges
    loanSheet.getRange(r, 11).setFormula(
      '=IF(A' + r + '="", 0, SUMIFS(Repayments_PrincipalPaid, Repayments_LoanID, A' + r + ', Repayments_Status, "Approved"))'
    );

    // L (Interest Paid): SUMIFS of Interest Paid from Loan Repayments using Named Ranges
    loanSheet.getRange(r, 12).setFormula(
      '=IF(A' + r + '="", 0, SUMIFS(Repayments_InterestPaid, Repayments_LoanID, A' + r + ', Repayments_Status, "Approved"))'
    );

    // M (Fee Paid): SUMIFS of Fee Paid from Loan Repayments using Named Ranges
    loanSheet.getRange(r, 13).setFormula(
      '=IF(A' + r + '="", 0, SUMIFS(Repayments_FeePaid, Repayments_LoanID, A' + r + ', Repayments_Status, "Approved"))'
    );

    // N (Balance): MAX(0, Repayment Amount - Total Paid)
    loanSheet.getRange(r, 14).setFormula(
      '=IF(I' + r + '="", 0, MAX(0, I' + r + ' - J' + r + '))'
    );

    // P (Borrower’s Own Savings): XLOOKUP from Members using Named Ranges
    loanSheet.getRange(r, 16).setFormula(
      '=IF(D' + r + '="", 0, IFERROR(XLOOKUP(D' + r + ', Members_MemberID, Members_TotalSavings, 0), 0))'
    );

    // Q (Total Guaranteed): SUMIFS from Guarantors using Named Ranges
    loanSheet.getRange(r, 17).setFormula(
      '=IF(A' + r + '="", 0, SUMIFS(Guarantors_GuaranteedAmount, Guarantors_LoanID, A' + r + '))'
    );

    // R (Shortfall Amount): MAX(0, Repayment Amount - (Own Savings + Total Guaranteed))
    loanSheet.getRange(r, 18).setFormula(
      '=IF(I' + r + '="", 0, MAX(0, I' + r + ' - (P' + r + ' + Q' + r + ')))'
    );

    // O (Status): Settled if Balance == 0 and Repayment > 0, else Active / Pending / Rejected
    const currentStat = standardRows[r - 2] ? String(standardRows[r - 2]["Status"] || "").trim() : "";
    if (currentStat === LOAN_STATUS.REJECTED) {
      loanSheet.getRange(r, 15).setValue(LOAN_STATUS.REJECTED);
    } else if (currentStat === LOAN_STATUS.PENDING) {
      loanSheet.getRange(r, 15).setValue(LOAN_STATUS.PENDING);
    } else {
      loanSheet.getRange(r, 15).setFormula(
        '=IF(A' + r + '="", "", IF(I' + r + '=0, "Pending", IF(N' + r + '<=0, "Settled", "Active")))'
      );
    }
  }

  // Format currency columns
  const currencyCols = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18];
  currencyCols.forEach(function (c) {
    loanSheet.getRange(2, c, Math.max(loanSheet.getLastRow() - 1, 1), 1).setNumberFormat("#,##0.00");
  });

  // Format date columns
  loanSheet.getRange(2, 2, Math.max(loanSheet.getLastRow() - 1, 1), 1).setNumberFormat("yyyy-mm-dd");
  loanSheet.getRange(2, 3, Math.max(loanSheet.getLastRow() - 1, 1), 1).setNumberFormat("yyyy-mm-dd");

  // Data validation for Member ID pointing to Members_MemberID
  const memIdNamedRange = ss.getRangeByName("Members_MemberID");
  if (memIdNamedRange) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(memIdNamedRange, true)
      .setAllowInvalid(false)
      .setHelpText("Please select a valid Member ID registered in the Members directory.")
      .build();
    loanSheet.getRange(2, 4, Math.max(loanSheet.getLastRow() - 1, 1), 1).setDataValidation(rule);
  }
}

/**
 * Ensures all formulas on the Members sheet are 100% Google Sheets native using Named Ranges
 */
function setupMembersSavingsFormula_(ss) {
  if (!ss) ss = getSpreadsheet_();
  const memSheet = ss.getSheetByName(SHEETS.MEMBERS);
  const cSheet = ss.getSheetByName(SHEETS.CONTRIBUTIONS);
  const loanSheet = ss.getSheetByName(SHEETS.LOANS);
  const guarSheet = ss.getSheetByName(SHEETS.GUARANTORS);
  if (!memSheet || memSheet.getLastRow() < 1) return;

  const memVals = memSheet.getDataRange().getValues();
  const headers = memVals[0];
  const memCol = getHeaderMap_(headers);
  const totalRows = memSheet.getLastRow();
  if (totalRows <= 1) return;

  // Refresh all named ranges
  setupAllNamedRanges_(ss);

  const savColIdx = memCol["Total Savings"];
  const memIdColIdx = memCol["Member ID"];
  const loanBalColIdx = memCol["Current Loan Balance"];
  const guarColIdx = memCol["Guaranteed Amount"];
  const maxLoanColIdx = memCol["Max Loan Eligibility"];
  const availGuarColIdx = memCol["Available to Guarantee"];
  const statusColIdx = memCol["Status"];
  const fnColIdx = memCol["Full Name"];
  const fnIdx = memCol["First Name"];
  const mnIdx = memCol["Middle Name"];
  const lnIdx = memCol["Last Name"];

  if (memIdColIdx === undefined) return;

  const memIdLetter = getColLetter_(memIdColIdx + 1);
  const savColLetter = savColIdx !== undefined ? getColLetter_(savColIdx + 1) : "K";
  const mLoanBalLetter = loanBalColIdx !== undefined ? getColLetter_(loanBalColIdx + 1) : "L";
  const guarColLetter = guarColIdx !== undefined ? getColLetter_(guarColIdx + 1) : "M";
  const memStatLetter = statusColIdx !== undefined ? getColLetter_(statusColIdx + 1) : "P";

  for (let r = 2; r <= totalRows; r++) {
    // 1. Total Savings: sum approved contributions matching Member ID
    if (savColIdx !== undefined) {
      memSheet.getRange(r, savColIdx + 1).setFormula(
        '=IF(' + memIdLetter + r + '="", 0, SUMIFS(Contributions!$D:$D, Contributions!$B:$B, ' + memIdLetter + r + ', Contributions!$H:$H, "Approved"))'
      );
    }

    // 2. Current Loan Balance: sum Balance from Loans matching Member ID and Status Active or Approved
    if (loanBalColIdx !== undefined) {
      memSheet.getRange(r, loanBalColIdx + 1).setFormula(
        '=IF(' + memIdLetter + r + '="", 0, SUMIFS(Loans!$N:$N, Loans!$D:$D, ' + memIdLetter + r + ', Loans!$O:$O, "Active") + SUMIFS(Loans!$N:$N, Loans!$D:$D, ' + memIdLetter + r + ', Loans!$O:$O, "Approved"))'
      );
    }

    // 3. Guaranteed Amount: sum Guaranteed Amount from Guarantors matching Member ID and Status Active or Approved
    if (guarColIdx !== undefined) {
      memSheet.getRange(r, guarColIdx + 1).setFormula(
        '=IF(' + memIdLetter + r + '="", 0, SUMIFS(Guarantors!$F:$F, Guarantors!$B:$B, ' + memIdLetter + r + ', Guarantors!$D:$D, "Active") + SUMIFS(Guarantors!$F:$F, Guarantors!$B:$B, ' + memIdLetter + r + ', Guarantors!$D:$D, "Approved"))'
      );
    }

    // 4. Max Loan Eligibility: 2 * (Savings - Guaranteed) - Loan Balance
    if (maxLoanColIdx !== undefined) {
      memSheet.getRange(r, maxLoanColIdx + 1).setFormula(
        '=IF(' + memIdLetter + r + '="", 0, MAX(0, 2 * (' + savColLetter + r + ' - ' + guarColLetter + r + ') - ' + mLoanBalLetter + r + '))'
      );
    }

    // 5. Available to Guarantee: Savings - Loan Balance - Guaranteed Amount
    if (availGuarColIdx !== undefined) {
      memSheet.getRange(r, availGuarColIdx + 1).setFormula(
        '=IF(OR(' + memStatLetter + r + ' <> "Active", ' + memIdLetter + r + ' = ""), 0, MAX(0, ' + savColLetter + r + ' - ' + mLoanBalLetter + r + ' - ' + guarColLetter + r + '))'
      );
    }

    // 6. Full Name formula: First Name + Middle Name + Last Name
    if (fnColIdx !== undefined && fnIdx !== undefined && lnIdx !== undefined) {
      const fnL = getColLetter_(fnIdx + 1);
      const mnL = mnIdx !== undefined ? getColLetter_(mnIdx + 1) : "";
      const lnL = getColLetter_(lnIdx + 1);
      const nameFormula = mnL
        ? '=IF(' + fnL + r + '="", "", TRIM(' + fnL + r + ' & " " & ' + mnL + r + ' & " " & ' + lnL + r + '))'
        : '=IF(' + fnL + r + '="", "", TRIM(' + fnL + r + ' & " " & ' + lnL + r + '))';
      memSheet.getRange(r, fnColIdx + 1).setFormula(nameFormula);
    }
  }
}

/**
 * Converts 1-based column index to spreadsheet column letter (e.g., 1 -> A, 14 -> N, 27 -> AA)
 */
function getColLetter_(colNumber) {
  let letter = "";
  let temp = colNumber;
  while (temp > 0) {
    let mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

/**
 * Populates Borrower Name formulas on Loan Repayments using Named Ranges
 */
function setupLoanRepaymentsFormulas_(ss) {
  if (!ss) ss = getSpreadsheet_();
  const repSheet = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
  if (!repSheet || repSheet.getLastRow() < 1) return;

  const vals = repSheet.getDataRange().getValues();
  const col = getHeaderMap_(vals[0]);
  const totalRows = Math.max(repSheet.getLastRow(), 2);

  const memIdColIdx = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
  const nameColIdx = col["Borrower Name"];

  if (memIdColIdx !== undefined && nameColIdx !== undefined) {
    const midLetter = getColLetter_(memIdColIdx + 1);
    for (let r = 2; r <= totalRows; r++) {
      repSheet.getRange(r, nameColIdx + 1).setFormula(
        '=IF(' + midLetter + r + '="", "", IFERROR(XLOOKUP(' + midLetter + r + ', Members_MemberID, Members_FullName, "—"), ""))'
      );
    }
  }
}

/**
 * Ensures Guarantors sheet has dynamic, error-free formulas using Named Ranges
 */
function setupGuarantorsSchemaAndFormulas_(ss) {
  if (!ss) ss = getSpreadsheet_();
  const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
  if (!gSheet || gSheet.getLastRow() < 1) return;

  const vals = gSheet.getDataRange().getValues();
  const col = getHeaderMap_(vals[0]);
  const totalRows = Math.max(gSheet.getLastRow(), 2);

  const loanIdColIdx = col["Loan ID"];
  const memIdColIdx = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
  const nameColIdx = col["Guarantor Name"];
  const loanStatColIdx = col["Loan Status"];
  const savColIdx = col["Guarantor’s Savings Balance"] !== undefined ? col["Guarantor’s Savings Balance"] : col["Guarantor's Savings Balance"];
  const eligColIdx = col["Guarantor Eligibility"];

  for (let r = 2; r <= totalRows; r++) {
    const midLetter = memIdColIdx !== undefined ? getColLetter_(memIdColIdx + 1) : "B";
    const loanIdLetter = loanIdColIdx !== undefined ? getColLetter_(loanIdColIdx + 1) : "A";

    // Guarantor Name
    if (nameColIdx !== undefined) {
      gSheet.getRange(r, nameColIdx + 1).setFormula(
        '=IF(' + midLetter + r + '="", "", IFERROR(XLOOKUP(' + midLetter + r + ', Members_MemberID, Members_FullName, "—"), ""))'
      );
    }

    // Loan Status
    if (loanStatColIdx !== undefined) {
      gSheet.getRange(r, loanStatColIdx + 1).setFormula(
        '=IF(' + loanIdLetter + r + '="", "", IFERROR(XLOOKUP(' + loanIdLetter + r + ', Loans_LoanID, Loans_Status, "—"), ""))'
      );
    }

    // Guarantor’s Savings Balance
    if (savColIdx !== undefined) {
      gSheet.getRange(r, savColIdx + 1).setFormula(
        '=IF(' + midLetter + r + '="", 0, IFERROR(XLOOKUP(' + midLetter + r + ', Members_MemberID, Members_TotalSavings, 0), 0))'
      );
    }

    // Guarantor Eligibility: VALID if Savings Balance >= Guaranteed Amount
    if (eligColIdx !== undefined && savColIdx !== undefined && col["Guaranteed Amount"] !== undefined) {
      const savLetter = getColLetter_(savColIdx + 1);
      const amtLetter = getColLetter_(col["Guaranteed Amount"] + 1);
      gSheet.getRange(r, eligColIdx + 1).setFormula(
        '=IF(' + midLetter + r + '="", "", IF(' + savLetter + r + ' >= ' + amtLetter + r + ', "VALID", "INSUFFICIENT_SAVINGS"))'
      );
    }
  }

  try {
    if (savColIdx !== undefined) gSheet.getRange(2, savColIdx + 1, totalRows - 1, 1).setNumberFormat("#,##0.00");
    if (col["Guaranteed Amount"] !== undefined) gSheet.getRange(2, col["Guaranteed Amount"] + 1, totalRows - 1, 1).setNumberFormat("#,##0.00");
  } catch (errGFmt) {}
}

function testDiagnoseSheetHeaders_() {
  const ss = getSpreadsheet_();
  const res = {};

  const namedRanges = ss.getNamedRanges();
  res["_namedRanges"] = namedRanges.map(function(nr) {
    try {
      return { name: nr.getName(), range: nr.getRange().getA1Notation(), sheet: nr.getRange().getSheet().getName() };
    } catch (e) {
      return { name: nr.getName(), error: e.message };
    }
  });

  [SHEETS.MEMBERS, SHEETS.CONTRIBUTIONS, SHEETS.LOANS, SHEETS.GUARANTORS, SHEETS.LOAN_REPAYMENTS, SHEETS.ACCOUNTS, SHEETS.INVESTMENTS, SHEETS.CONSTANTS, SHEETS.FUND_STATEMENTS, SHEETS.CIC_TRANSACTIONS].forEach(function(sName) {
    const s = ss.getSheetByName(sName);
    if (!s) {
      res[sName] = "SHEET NOT FOUND";
    } else {
      const headers = s.getRange(1, 1, 1, Math.max(s.getLastColumn(), 1)).getValues()[0];
      const dataRows = s.getLastRow() > 1 ? s.getRange(2, 1, Math.min(s.getLastRow() - 1, 5), Math.max(s.getLastColumn(), 1)).getValues() : [];
      const formulaRows = s.getLastRow() > 1 ? s.getRange(2, 1, Math.min(s.getLastRow() - 1, 5), Math.max(s.getLastColumn(), 1)).getFormulas() : [];
      res[sName] = { rowCount: s.getLastRow(), headers: headers, preview: dataRows, formulas: formulaRows };
    }
  });
  return res;
}
