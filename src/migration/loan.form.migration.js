/**
 * Brightlife SHG — Google Form Loan Requests Migration & Ingestion Service
 * Managed by @migrator (Financial Data Migration Engineer & ETL Specialist)
 *
 * Source: Tab "Form Loan Requests" (Strictly READ-ONLY)
 * Targets:
 *   - "Loans" (Master Ledger)
 *   - "Guarantors" (Sub-Ledger)
 *   - "Audit Log" (Metadata & Audit Trail)
 *
 * Directives:
 *   1. Strictly Read-Only Source: Never write, sort, or modify rows in "Form Loan Requests".
 *   2. Idempotency: Tag all imported records with deterministic Legacy_Source_Ref.
 *   3. Formula Safety: Populate raw-input columns only. Never overwrite Row 2 =MAP(...) spill formulas.
 *   4. Silent Cutover: Suppress live WhatsApp/Email alerts during historical backfill.
 */

const FORM_LOAN_REQUESTS_TAB = "Form Loan Requests";
const LOANS_TABLE_TAB = "Loans_table";

/**
 * Normalizes a legacy Member No into canonical BLM-XX format
 * e.g., 1 -> "BLM-01", "10" -> "BLM-10", "BL-1" -> "BLM-01", "BLM-05" -> "BLM-05"
 */
function normalizeMemberIdStandard_(raw) {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^BLM-\d+$/i.test(s)) {
    return s.toUpperCase();
  }
  const match = s.match(/^(?:BL[A-Za-z0-9]*-)?(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) {
      return "BLM-" + String(num).padStart(2, "0");
    }
  }
  return s;
}

/**
 * Normalizes Kenyan phone numbers to E.164 (+254...)
 */
function normalizeKenyanPhone_(phone) {
  if (!phone) return "";
  let p = String(phone).replace(/[^0-9+]/g, "").trim();
  if (p.startsWith("+254")) return p;
  if (p.startsWith("254")) return "+" + p;
  if (p.startsWith("0")) return "+254" + p.slice(1);
  if (p.length === 9) return "+254" + p;
  return p;
}

/**
 * Builds an in-memory Member Index mapping Normalized Name, National ID, Phone, and Email to Member ID.
 */
function buildMemberLookupIndex_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const memSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.MEMBERS);
  const index = {
    byNationalId: {},
    byPhone: {},
    byEmail: {},
    byNormalizedName: {},
    members: []
  };

  if (!memSheet || memSheet.getLastRow() <= 1) return index;

  const vals = memSheet.getDataRange().getValues();
  const col = getHeaderMap_(vals[0]);
  const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
  if (midCol === undefined) return index;

  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    const memberId = String(row[midCol] || "").trim();
    if (!memberId) continue;

    const natId = col["National Id"] !== undefined ? String(row[col["National Id"]] || "").trim() : "";
    const phone = col["Phone Number"] !== undefined ? normalizeKenyanPhone_(row[col["Phone Number"]]) : "";
    const email = col["Email"] !== undefined ? String(row[col["Email"]] || "").trim().toLowerCase() : "";
    const first = col["First Name"] !== undefined ? String(row[col["First Name"]] || "").trim() : "";
    const middle = col["Middle Name"] !== undefined ? String(row[col["Middle Name"]] || "").trim() : "";
    const last = col["Last Name"] !== undefined ? String(row[col["Last Name"]] || "").trim() : "";
    const fullName = (first + " " + middle + " " + last).replace(/\s+/g, " ").trim().toLowerCase();

    if (natId) index.byNationalId[natId] = memberId;
    if (phone) index.byPhone[phone] = memberId;
    if (email) index.byEmail[email] = memberId;
    if (fullName) index.byNormalizedName[fullName] = memberId;

    index.members.push({
      memberId: memberId,
      fullName: fullName,
      natId: natId,
      phone: phone,
      email: email
    });
  }

  return index;
}

/**
 * Resolves a Member ID from fuzzy borrower/guarantor input
 */
function resolveMemberIdFromInput_(rawInput, memberIndex) {
  if (!rawInput || !memberIndex) return "";
  const s = String(rawInput).trim();
  const sLower = s.toLowerCase();

  // 1. Direct Member ID match (e.g., "BL-001")
  for (let m = 0; m < memberIndex.members.length; m++) {
    if (memberIndex.members[m].memberId.toLowerCase() === sLower) {
      return memberIndex.members[m].memberId;
    }
  }

  // 2. National ID match
  const cleanId = s.replace(/[^0-9]/g, "");
  if (cleanId.length >= 6 && cleanId.length <= 9 && memberIndex.byNationalId[cleanId]) {
    return memberIndex.byNationalId[cleanId];
  }

  // 3. Phone match
  const phone = normalizeKenyanPhone_(s);
  if (phone && memberIndex.byPhone[phone]) {
    return memberIndex.byPhone[phone];
  }

  // 4. Email match
  if (sLower.indexOf("@") !== -1 && memberIndex.byEmail[sLower]) {
    return memberIndex.byEmail[sLower];
  }

  // 5. Exact normalized full name match
  if (memberIndex.byNormalizedName[sLower]) {
    return memberIndex.byNormalizedName[sLower];
  }

  // 6. Substring name match
  for (let m = 0; m < memberIndex.members.length; m++) {
    const memName = memberIndex.members[m].fullName;
    if (memName && (memName.indexOf(sLower) !== -1 || sLower.indexOf(memName) !== -1)) {
      return memberIndex.members[m].memberId;
    }
  }

  return "";
}

/**
 * Safely renames tab "Form Loan Requests" to "[ARCHIVED] Form Loan Requests",
 * sets tab color to gray (#94a3b8), and logs the deprecation to SHEETS.AUDIT_LOG.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] Optional spreadsheet instance
 * @return {Object} Deprecation status summary
 */
function deprecateFormLoanRequestsTab_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  let formSheet = spreadsheet.getSheetByName(FORM_LOAN_REQUESTS_TAB);
  if (!formSheet) {
    formSheet = getSheetByNameInsensitive_(spreadsheet, FORM_LOAN_REQUESTS_TAB);
  }

  const archivedName = "[ARCHIVED] " + FORM_LOAN_REQUESTS_TAB;

  if (!formSheet) {
    const alreadyArchived = spreadsheet.getSheetByName(archivedName) || getSheetByNameInsensitive_(spreadsheet, archivedName);
    if (alreadyArchived) {
      return {
        success: true,
        alreadyDeprecated: true,
        sheetName: alreadyArchived.getName()
      };
    }
    return {
      success: false,
      error: 'Sheet "' + FORM_LOAN_REQUESTS_TAB + '" not found in workbook.'
    };
  }

  // Rename tab
  try {
    formSheet.setName(archivedName);
  } catch (errRename) {
    console.warn("Could not rename tab to " + archivedName + ": " + errRename.message);
  }

  // Set tab color to gray #94a3b8
  try {
    if (typeof formSheet.setTabColor === "function") {
      formSheet.setTabColor("#94a3b8");
    }
  } catch (errColor) {
    console.warn("Could not set tab color: " + errColor.message);
  }

  // Log deprecation to SHEETS.AUDIT_LOG
  if (typeof appendAuditLog_ === "function") {
    appendAuditLog_(
      "migration.tab_deprecated",
      FORM_LOAN_REQUESTS_TAB,
      archivedName,
      "Deprecated and archived Google Form Loan Requests tab (" + archivedName + ")",
      JSON.stringify({
        originalName: FORM_LOAN_REQUESTS_TAB,
        archivedName: archivedName,
        tabColor: "#94a3b8",
        deprecatedAt: new Date().toISOString()
      })
    );
  }

  return {
    success: true,
    deprecated: true,
    sheetName: archivedName
  };
}

/**
 * Safe inspection of "Form Loan Requests" headers and sample data
 * Strictly READ-ONLY.
 */
function inspectFormLoanRequests_() {
  const ss = getSpreadsheet_();
  const formSheet = getSheetByNameInsensitive_(ss, FORM_LOAN_REQUESTS_TAB);
  if (!formSheet) {
    return {
      success: false,
      error: 'Sheet "' + FORM_LOAN_REQUESTS_TAB + '" not found in workbook.'
    };
  }

  const lastRow = formSheet.getLastRow();
  const lastCol = formSheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return {
      success: true,
      sheetName: formSheet.getName(),
      rowCount: 0,
      headers: [],
      samples: []
    };
  }

  const headers = formSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const sampleCount = Math.min(lastRow - 1, 5);
  const samples = sampleCount > 0 ? formSheet.getRange(2, 1, sampleCount, lastCol).getValues() : [];

  return {
    success: true,
    sheetName: formSheet.getName(),
    totalRows: lastRow,
    totalCols: lastCol,
    headers: headers,
    samples: samples
  };
}

/**
 * ETL Migration: Backfills "Form Loan Requests" into "Loans" and "Guarantors".
 * Idempotent, formula-safe, and non-destructive.
 */
function migrateFormLoanRequestsToLedger_(options) {
  const dryRun = Boolean(options && options.dryRun);
  const ss = getSpreadsheet_();
  let formSheet = getSheetByNameInsensitive_(ss, FORM_LOAN_REQUESTS_TAB);
  if (!formSheet) {
    formSheet = getSheetByNameInsensitive_(ss, "[ARCHIVED] " + FORM_LOAN_REQUESTS_TAB);
  }
  if (!formSheet) {
    throw new Error('Tab "' + FORM_LOAN_REQUESTS_TAB + '" does not exist.');
  }

  const lastRow = formSheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, message: "No form responses to process.", processed: 0, skipped: 0 };
  }

  const formVals = formSheet.getDataRange().getValues();
  const formHeaders = formVals[0];
  const formCol = getHeaderMap_(formHeaders);

  // Identify column indices flexibly across form variants
  function findCol(keywords) {
    for (let i = 0; i < formHeaders.length; i++) {
      const h = String(formHeaders[i] || "").toLowerCase();
      for (let k = 0; k < keywords.length; k++) {
        if (h.indexOf(keywords[k].toLowerCase()) !== -1) return i;
      }
    }
    return undefined;
  }

  const colTimestamp = findCol(["timestamp", "date", "time"]);
  const colBorrowerName = findCol(["borrower name", "applicant name", "full name", "your name", "name"]);
  const colNationalId = findCol(["national id", "id number", "national identity", "id no"]);
  const colPhone = findCol(["phone", "mobile", "tel"]);
  const colEmail = findCol(["email", "mail"]);
  const colAmount = findCol(["amount requested", "loan amount", "requested amount", "amount"]);
  const colPeriod = findCol(["loan period", "period", "tenor", "duration", "months"]);
  const colPurpose = findCol(["purpose", "reason", "usage"]);
  
  // Guarantor columns (up to 3 guarantors)
  const g1NameCol = findCol(["guarantor 1 name", "first guarantor name", "guarantor 1"]);
  const g1AmountCol = findCol(["guarantor 1 amount", "guarantee amount 1", "amount guaranteed 1"]);
  const g2NameCol = findCol(["guarantor 2 name", "second guarantor name", "guarantor 2"]);
  const g2AmountCol = findCol(["guarantor 2 amount", "guarantee amount 2", "amount guaranteed 2"]);
  const g3NameCol = findCol(["guarantor 3 name", "third guarantor name", "guarantor 3"]);
  const g3AmountCol = findCol(["guarantor 3 amount", "guarantee amount 3", "amount guaranteed 3"]);

  const memberIndex = buildMemberLookupIndex_(ss);

  // Target Sheets
  const loansSheet = getRequiredSheet_(SHEETS.LOANS);
  const loanVals = loansSheet.getDataRange().getValues();
  const loanHeaders = loanVals[0];
  const loanCol = getHeaderMap_(loanHeaders);

  const guarSheet = getRequiredSheet_(SHEETS.GUARANTORS);
  const guarVals = guarSheet.getDataRange().getValues();
  const guarHeaders = guarVals[0];
  const guarCol = getHeaderMap_(guarHeaders);

  // Existing Loan IDs for idempotency check (check both canonical BLLN- and legacy LN-)
  const existingLoanIds = {};
  for (let l = 1; l < loanVals.length; l++) {
    const lid = String(loanVals[l][loanCol["Loan ID"]] || "").trim();
    if (lid) {
      existingLoanIds[lid] = true;
      existingLoanIds[lid.toUpperCase()] = true;
    }
  }

  const tz = ss.getSpreadsheetTimeZone() || "Africa/Nairobi";
  const loansToAppend = [];
  const guarantorsToAppend = [];
  const auditLogsToAppend = [];
  const exceptions = [];

  let skippedCount = 0;
  let processedCount = 0;

  for (let r = 1; r < formVals.length; r++) {
    const row = formVals[r];
    const sourceRef = "FORM_LOAN_REQ_R" + (r + 1);

    // Extract Date
    const rawDate = colTimestamp !== undefined ? row[colTimestamp] : null;
    const reqDate = (rawDate ? parseDateInput_(rawDate, tz) : null) || new Date();
    const dateStr = reqDate instanceof Date ? Utilities.formatDate(reqDate, tz, "yyyyMMdd") : "20261119";
    const deterministicLoanId = "BLLN-" + dateStr + "-R" + ("000" + (r + 1)).slice(-4);
    const legacyLoanId = "LN-" + dateStr + "-R" + ("000" + (r + 1)).slice(-4);

    if (existingLoanIds[deterministicLoanId] || existingLoanIds[legacyLoanId] ||
        existingLoanIds[deterministicLoanId.toUpperCase()] || existingLoanIds[legacyLoanId.toUpperCase()]) {
      skippedCount++;
      continue;
    }

    existingLoanIds[deterministicLoanId] = true;
    existingLoanIds[deterministicLoanId.toUpperCase()] = true;

    // Extract Borrower
    const bName = colBorrowerName !== undefined ? String(row[colBorrowerName] || "").trim() : "";
    const bNatId = colNationalId !== undefined ? String(row[colNationalId] || "").trim() : "";
    const bPhone = colPhone !== undefined ? String(row[colPhone] || "").trim() : "";
    const bEmail = colEmail !== undefined ? String(row[colEmail] || "").trim() : "";

    let borrowerMemberId = resolveMemberIdFromInput_(bNatId, memberIndex) ||
                           resolveMemberIdFromInput_(bPhone, memberIndex) ||
                           resolveMemberIdFromInput_(bEmail, memberIndex) ||
                           resolveMemberIdFromInput_(bName, memberIndex);

    if (!borrowerMemberId) {
      exceptions.push({
        sourceRef: sourceRef,
        issue: "Borrower member record not identified in Members register",
        borrowerName: bName,
        nationalId: bNatId,
        phone: bPhone
      });
      // Do not abort: assign placeholder or flag for review
      borrowerMemberId = "UNRESOLVED";
    }

    // Extract Financials
    const rawAmt = colAmount !== undefined ? String(row[colAmount] || "") : "0";
    const requestedAmount = Number(rawAmt.replace(/[^0-9.]/g, "")) || 0;
    const interest = Math.round(requestedAmount * 0.10 * 100) / 100; // 10% standard rate
    const trsFee = 0.00; // Standard processing fee

    // Prepare Loans Row (leaving calculated spill formula columns blank)
    const newLoanRow = new Array(loanHeaders.length).fill("");
    if (loanCol["Loan ID"] !== undefined) newLoanRow[loanCol["Loan ID"]] = deterministicLoanId;
    if (loanCol["Request Date"] !== undefined) newLoanRow[loanCol["Request Date"]] = reqDate;
    if (loanCol["Approved Date"] !== undefined) newLoanRow[loanCol["Approved Date"]] = ""; // Pending
    const midIdx = loanCol["Member ID"] !== undefined ? loanCol["Member ID"] : loanCol["Member id"];
    if (midIdx !== undefined) newLoanRow[midIdx] = borrowerMemberId;

    // Formula columns: Borrower Name, Repayment Amount, Total Paid, Principal Paid, Interest Paid, Fee Paid, Balance, Borrower's Own Savings, Total Guaranteed, Shortfall Amount
    // We leave them as "" to avoid blocking Row 2 =MAP(...) spill formulas.
    if (loanCol["Requested Amount"] !== undefined) newLoanRow[loanCol["Requested Amount"]] = requestedAmount;
    if (loanCol["Interest"] !== undefined) newLoanRow[loanCol["Interest"]] = interest;
    if (loanCol["Transaction Fee"] !== undefined) newLoanRow[loanCol["Transaction Fee"]] = trsFee;
    if (loanCol["Status"] !== undefined) newLoanRow[loanCol["Status"]] = LOAN_STATUS.PENDING;

    loansToAppend.push(newLoanRow);

    // Extract Guarantors
    const guarantorCandidates = [
      { nameCol: g1NameCol, amtCol: g1AmountCol },
      { nameCol: g2NameCol, amtCol: g2AmountCol },
      { nameCol: g3NameCol, amtCol: g3AmountCol },
    ];

    for (let g = 0; g < guarantorCandidates.length; g++) {
      const c = guarantorCandidates[g];
      if (c.nameCol === undefined) continue;
      const gInput = String(row[c.nameCol] || "").trim();
      if (!gInput) continue;

      const gMemberId = resolveMemberIdFromInput_(gInput, memberIndex) || "UNRESOLVED";
      const gRawAmt = c.amtCol !== undefined ? String(row[c.amtCol] || "") : "0";
      const gAmount = Number(gRawAmt.replace(/[^0-9.]/g, "")) || 0;

      const newGuarRow = new Array(guarHeaders.length).fill("");
      if (guarCol["Loan ID"] !== undefined) newGuarRow[guarCol["Loan ID"]] = deterministicLoanId;
      const gMidCol = guarCol["Member ID"] !== undefined ? guarCol["Member ID"] : guarCol["Member id"];
      if (gMidCol !== undefined) newGuarRow[gMidCol] = gMemberId;
      if (guarCol["Guaranteed Amount"] !== undefined) newGuarRow[guarCol["Guaranteed Amount"]] = gAmount;
      // Guarantor Name, Loan Status, Guarantor's Savings Balance, Guarantor Eligibility are all Row 2 spills!

      guarantorsToAppend.push(newGuarRow);
    }

    auditLogsToAppend.push({
      action: "loan.form_migration",
      entity: "Loans",
      entityId: deterministicLoanId,
      summary: "Ingested Google Form loan request for " + (bName || borrowerMemberId) + " (KES " + requestedAmount + ")",
      details: JSON.stringify({
        sourceRef: sourceRef,
        borrowerName: bName,
        borrowerMemberId: borrowerMemberId,
        requestedAmount: requestedAmount,
        purpose: colPurpose !== undefined ? String(row[colPurpose] || "") : "",
        period: colPeriod !== undefined ? String(row[colPeriod] || "") : "",
      })
    });

    processedCount++;
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      processedCount: processedCount,
      skippedCount: skippedCount,
      loansCount: loansToAppend.length,
      guarantorsCount: guarantorsToAppend.length,
      exceptions: exceptions,
      previewLoan: loansToAppend.slice(0, 3)
    };
  }

  // Execute Batch Writes
  if (loansToAppend.length > 0) {
    const startRow = loansSheet.getLastRow() + 1;
    loansSheet.getRange(startRow, 1, loansToAppend.length, loanHeaders.length).setValues(loansToAppend);
  }

  if (guarantorsToAppend.length > 0) {
    const startGuarRow = guarSheet.getLastRow() + 1;
    guarSheet.getRange(startGuarRow, 1, guarantorsToAppend.length, guarHeaders.length).setValues(guarantorsToAppend);
  }

  // Audit trail
  for (let a = 0; a < auditLogsToAppend.length; a++) {
    const log = auditLogsToAppend[a];
    appendAuditLog_(log.action, log.entity, log.entityId, log.summary, log.details);
  }

  SpreadsheetApp.flush();

  // Deprecate form tab if requested and not dry run
  let tabDeprecation = null;
  if (options && options.deprecateTab === true && !dryRun) {
    tabDeprecation = deprecateFormLoanRequestsTab_(ss);
  }

  if (typeof invalidateSheetContextCache_ === "function") {
    invalidateSheetContextCache_(SHEETS.LOANS);
    invalidateSheetContextCache_(SHEETS.GUARANTORS);
  }

  return {
    success: true,
    dryRun: false,
    processedCount: processedCount,
    skippedCount: skippedCount,
    loansAppended: loansToAppend.length,
    guarantorsAppended: guarantorsToAppend.length,
    exceptions: exceptions,
    tabDeprecation: tabDeprecation
  };
}

/**
 * Ingests authoritative historical loans from tab "Loans_table" into "Loans" and "Guarantors".
 *
 * Directives:
 * 1. Retains exact historical Loan Id from Loans_table (do not re-prefix or alter historical books).
 * 2. 100% Idempotency: Checks existing Loan IDs and skips duplicates without mutation.
 * 3. Formula Safety: Leaves Row 2 spill formula columns completely blank ("").
 * 4. Cross-references Form Loan Requests for guarantor backing if present.
 *
 * @param {Object} [options] Migration options ({ dryRun: boolean, deprecateTab: boolean })
 * @return {Object} Migration summary
 */
function migrateLoansTableToLedger_(options) {
  const dryRun = Boolean(options && options.dryRun);
  const ss = getSpreadsheet_();
  let tableSheet = getSheetByNameInsensitive_(ss, LOANS_TABLE_TAB);
  if (!tableSheet) {
    tableSheet = getSheetByNameInsensitive_(ss, "[ARCHIVED] " + LOANS_TABLE_TAB);
  }
  if (!tableSheet) {
    throw new Error('Tab "' + LOANS_TABLE_TAB + '" does not exist.');
  }

  const lastRow = tableSheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, message: "No legacy loans to process.", processed: 0, skipped: 0 };
  }

  const tableVals = tableSheet.getDataRange().getValues();
  const tableHeaders = tableVals[0];

  function findCol(keywords) {
    for (let i = 0; i < tableHeaders.length; i++) {
      const h = String(tableHeaders[i] || "").toLowerCase().trim();
      for (let k = 0; k < keywords.length; k++) {
        if (h === keywords[k].toLowerCase() || h.indexOf(keywords[k].toLowerCase()) !== -1) return i;
      }
    }
    return undefined;
  }

  const colLoanId = findCol(["loan id", "loan no", "id"]);
  const colIssueDate = findCol(["issue date", "date", "approved date"]);
  const colMemberNo = findCol(["member no.", "member no", "member id"]);
  const colOwner = findCol(["owner", "borrower", "name", "member name"]);
  const colAmountBorrowed = findCol(["amount borrowed", "principal", "requested amount"]);
  const colTrsFee = findCol(["transaction fee", "fee"]);
  const colRepayAmount = findCol(["amount to re-pay", "repayment amount", "repay amount"]);
  const colAmountPaid = findCol(["ammount paid", "amount paid", "paid"]);
  const colBalance = findCol(["balance amount", "balance"]);
  const colActive = findCol(["active", "status"]);

  const memberIndex = buildMemberLookupIndex_(ss);

  // Read Guarantor pledges from Form Loan Requests if present
  const formGuarMap = {};
  try {
    const formSheet = getSheetByNameInsensitive_(ss, FORM_LOAN_REQUESTS_TAB) ||
                      getSheetByNameInsensitive_(ss, "[ARCHIVED] " + FORM_LOAN_REQUESTS_TAB);
    if (formSheet && formSheet.getLastRow() > 1) {
      const fVals = formSheet.getDataRange().getValues();
      const fHeaders = fVals[0];
      const findFCol = function(kws) {
        for (let i = 0; i < fHeaders.length; i++) {
          const h = String(fHeaders[i] || "").toLowerCase();
          for (let k = 0; k < kws.length; k++) {
            if (h.indexOf(kws[k].toLowerCase()) !== -1) return i;
          }
        }
        return undefined;
      };
      const fBorrowerCol = findFCol(["borrower name", "applicant name", "full name", "name"]);
      const fNatIdCol = findFCol(["national id", "id number"]);
      const fPhoneCol = findFCol(["phone", "mobile"]);
      const fg1Name = findFCol(["guarantor 1 name", "first guarantor name", "guarantor 1"]);
      const fg1Amt = findFCol(["guarantor 1 amount", "guarantee amount 1", "amount guaranteed 1"]);
      const fg2Name = findFCol(["guarantor 2 name", "second guarantor name", "guarantor 2"]);
      const fg2Amt = findFCol(["guarantor 2 amount", "guarantee amount 2", "amount guaranteed 2"]);
      const fg3Name = findFCol(["guarantor 3 name", "third guarantor name", "guarantor 3"]);
      const fg3Amt = findFCol(["guarantor 3 amount", "guarantee amount 3", "amount guaranteed 3"]);

      for (let fr = 1; fr < fVals.length; fr++) {
        const fRow = fVals[fr];
        const fName = fBorrowerCol !== undefined ? String(fRow[fBorrowerCol] || "").trim() : "";
        const fNatId = fNatIdCol !== undefined ? String(fRow[fNatIdCol] || "").trim() : "";
        const fPhone = fPhoneCol !== undefined ? String(fRow[fPhoneCol] || "").trim() : "";
        const bMid = resolveMemberIdFromInput_(fNatId, memberIndex) ||
                     resolveMemberIdFromInput_(fPhone, memberIndex) ||
                     resolveMemberIdFromInput_(fName, memberIndex);

        const candidates = [
          { name: fg1Name !== undefined ? fRow[fg1Name] : "", amt: fg1Amt !== undefined ? fRow[fg1Amt] : 0 },
          { name: fg2Name !== undefined ? fRow[fg2Name] : "", amt: fg2Amt !== undefined ? fRow[fg2Amt] : 0 },
          { name: fg3Name !== undefined ? fRow[fg3Name] : "", amt: fg3Amt !== undefined ? fRow[fg3Amt] : 0 },
        ];

        const pledges = [];
        for (let c = 0; c < candidates.length; c++) {
          const gInput = String(candidates[c].name || "").trim();
          if (!gInput) continue;
          const gMid = resolveMemberIdFromInput_(gInput, memberIndex) || "UNRESOLVED";
          const gAmt = Number(String(candidates[c].amt || "").replace(/[^0-9.]/g, "")) || 0;
          pledges.push({ memberId: gMid, amount: gAmt });
        }

        if (pledges.length > 0) {
          if (bMid) formGuarMap[bMid.toLowerCase()] = pledges;
          if (fName) formGuarMap[fName.toLowerCase()] = pledges;
        }
      }
    }
  } catch (errGuar) {
    console.warn("Could not index Form Loan Requests for guarantors: " + errGuar.message);
  }

  // Target Sheets
  const loansSheet = getRequiredSheet_(SHEETS.LOANS);
  const loanVals = loansSheet.getDataRange().getValues();
  const loanHeaders = loanVals[0];
  const loanCol = getHeaderMap_(loanHeaders);

  const guarSheet = getRequiredSheet_(SHEETS.GUARANTORS);
  const guarVals = guarSheet.getDataRange().getValues();
  const guarHeaders = guarVals[0];
  const guarCol = getHeaderMap_(guarHeaders);

  // Existing Loan IDs for idempotency check
  const existingLoanIds = {};
  for (let l = 1; l < loanVals.length; l++) {
    const lid = String(loanVals[l][loanCol["Loan ID"]] || "").trim();
    if (lid) {
      existingLoanIds[lid] = true;
      existingLoanIds[lid.toUpperCase()] = true;
    }
  }

  const tz = ss.getSpreadsheetTimeZone() || "Africa/Nairobi";
  const loansToAppend = [];
  const guarantorsToAppend = [];
  const auditLogsToAppend = [];
  const exceptions = [];

  let skippedCount = 0;
  let processedCount = 0;

  for (let r = 1; r < tableVals.length; r++) {
    const row = tableVals[r];

    // Retain exact historical Loan Id per user directive!
    const rawLoanId = colLoanId !== undefined ? String(row[colLoanId] || "").trim() : "";
    if (!rawLoanId) {
      continue;
    }

    if (existingLoanIds[rawLoanId] || existingLoanIds[rawLoanId.toUpperCase()]) {
      skippedCount++;
      continue;
    }

    // Extract Date
    const rawIssueDate = colIssueDate !== undefined ? row[colIssueDate] : null;
    const issueDate = (rawIssueDate ? parseDateInput_(rawIssueDate, tz) : null) || new Date();

    // Extract Borrower Member No & Owner
    const rawMemNo = colMemberNo !== undefined ? row[colMemberNo] : "";
    const ownerName = colOwner !== undefined ? String(row[colOwner] || "").trim() : "";
    let borrowerMemberId = normalizeMemberIdStandard_(rawMemNo);

    // Verify against memberIndex
    if (!borrowerMemberId || borrowerMemberId === "UNRESOLVED") {
      borrowerMemberId = resolveMemberIdFromInput_(ownerName, memberIndex) ||
                         resolveMemberIdFromInput_(rawMemNo, memberIndex) || "UNRESOLVED";
    }

    if (borrowerMemberId === "UNRESOLVED") {
      exceptions.push({
        sourceRef: "LOANS_TABLE_R" + (r + 1),
        loanId: rawLoanId,
        owner: ownerName,
        memberNo: rawMemNo,
        issue: "Borrower member not resolved in Members register"
      });
    }

    // Extract Financials
    const rawBorrowed = colAmountBorrowed !== undefined ? String(row[colAmountBorrowed] || "") : "0";
    const amountBorrowed = Number(rawBorrowed.replace(/[^0-9.]/g, "")) || 0;

    const rawTrsFee = colTrsFee !== undefined ? String(row[colTrsFee] || "") : "0";
    const trsFee = Number(rawTrsFee.replace(/[^0-9.]/g, "")) || 0;

    const rawRepay = colRepayAmount !== undefined ? String(row[colRepayAmount] || "") : "0";
    const amountToRepay = Number(rawRepay.replace(/[^0-9.]/g, "")) || 0;

    const interest = Math.max(0, Math.round((amountToRepay - amountBorrowed) * 100) / 100);

    const rawBal = colBalance !== undefined ? String(row[colBalance] || "") : "0";
    const balanceAmount = Number(rawBal.replace(/[^0-9.]/g, "")) || 0;

    const rawActive = colActive !== undefined ? String(row[colActive] || "").trim().toLowerCase() : "";
    let status = LOAN_STATUS.ACTIVE || "Active";
    if (rawActive === "false" || rawActive === "no" || rawActive === "settled" || (balanceAmount <= 0 && rawActive !== "true")) {
      status = "Settled";
    } else {
      status = "Active";
    }

    // Prepare Loans Row (strictly leaving calculated spill formula columns blank)
    const newLoanRow = new Array(loanHeaders.length).fill("");
    if (loanCol["Loan ID"] !== undefined) newLoanRow[loanCol["Loan ID"]] = rawLoanId;
    if (loanCol["Request Date"] !== undefined) newLoanRow[loanCol["Request Date"]] = issueDate;
    if (loanCol["Approved Date"] !== undefined) newLoanRow[loanCol["Approved Date"]] = issueDate;
    const midIdx = loanCol["Member ID"] !== undefined ? loanCol["Member ID"] : loanCol["Member id"];
    if (midIdx !== undefined) newLoanRow[midIdx] = borrowerMemberId;

    // Formula columns: Borrower Name, Repayment Amount, Total Paid, Principal Paid, Interest Paid, Fee Paid, Balance, Borrower's Own Savings, Total Guaranteed, Shortfall Amount
    // We leave them as "" to avoid blocking Row 2 =MAP(...) spill formulas.
    if (loanCol["Requested Amount"] !== undefined) newLoanRow[loanCol["Requested Amount"]] = amountBorrowed;
    if (loanCol["Interest"] !== undefined) newLoanRow[loanCol["Interest"]] = interest;
    if (loanCol["Transaction Fee"] !== undefined) newLoanRow[loanCol["Transaction Fee"]] = trsFee;
    if (loanCol["Status"] !== undefined) newLoanRow[loanCol["Status"]] = status;

    loansToAppend.push(newLoanRow);
    existingLoanIds[rawLoanId] = true;
    existingLoanIds[rawLoanId.toUpperCase()] = true;

    // Check for matched guarantors from Form Loan Requests
    const pledges = formGuarMap[borrowerMemberId.toLowerCase()] ||
                    (ownerName ? formGuarMap[ownerName.toLowerCase()] : null);
    if (pledges && pledges.length > 0) {
      for (let p = 0; p < pledges.length; p++) {
        const pledge = pledges[p];
        const newGuarRow = new Array(guarHeaders.length).fill("");
        if (guarCol["Loan ID"] !== undefined) newGuarRow[guarCol["Loan ID"]] = rawLoanId;
        const gMidCol = guarCol["Member ID"] !== undefined ? guarCol["Member ID"] : guarCol["Member id"];
        if (gMidCol !== undefined) newGuarRow[gMidCol] = pledge.memberId;
        if (guarCol["Guaranteed Amount"] !== undefined) newGuarRow[guarCol["Guaranteed Amount"]] = pledge.amount;
        guarantorsToAppend.push(newGuarRow);
      }
    }

    auditLogsToAppend.push({
      action: "loan.loans_table_migration",
      entity: "Loans",
      entityId: rawLoanId,
      summary: "Ingested authoritative historical loan " + rawLoanId + " for " + (ownerName || borrowerMemberId) + " (KES " + amountBorrowed + ")",
      details: JSON.stringify({
        sourceRef: "LOANS_TABLE_R" + (r + 1),
        originalLoanId: rawLoanId,
        owner: ownerName,
        memberId: borrowerMemberId,
        amountBorrowed: amountBorrowed,
        interest: interest,
        transactionFee: trsFee,
        status: status,
        balanceAmount: balanceAmount
      })
    });

    processedCount++;
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      source: "Loans_table",
      processedCount: processedCount,
      skippedCount: skippedCount,
      loansCount: loansToAppend.length,
      guarantorsCount: guarantorsToAppend.length,
      exceptions: exceptions,
      previewLoan: loansToAppend.slice(0, 3)
    };
  }

  // Execute Batch Writes
  if (loansToAppend.length > 0) {
    const startRow = loansSheet.getLastRow() + 1;
    loansSheet.getRange(startRow, 1, loansToAppend.length, loanHeaders.length).setValues(loansToAppend);
  }

  if (guarantorsToAppend.length > 0) {
    const startGuarRow = guarSheet.getLastRow() + 1;
    guarSheet.getRange(startGuarRow, 1, guarantorsToAppend.length, guarHeaders.length).setValues(guarantorsToAppend);
  }

  // Audit trail
  for (let a = 0; a < auditLogsToAppend.length; a++) {
    const log = auditLogsToAppend[a];
    appendAuditLog_(log.action, log.entity, log.entityId, log.summary, log.details);
  }

  SpreadsheetApp.flush();

  // Deprecate form tab and/or loans_table tab if requested
  let tabDeprecation = null;
  if (options && options.deprecateTab === true && !dryRun) {
    tabDeprecation = deprecateFormLoanRequestsTab_(ss);
  }

  if (typeof invalidateSheetContextCache_ === "function") {
    invalidateSheetContextCache_(SHEETS.LOANS);
    invalidateSheetContextCache_(SHEETS.GUARANTORS);
  }

  return {
    success: true,
    dryRun: false,
    source: "Loans_table",
    processedCount: processedCount,
    skippedCount: skippedCount,
    loansAppended: loansToAppend.length,
    guarantorsAppended: guarantorsToAppend.length,
    exceptions: exceptions,
    tabDeprecation: tabDeprecation
  };
}
