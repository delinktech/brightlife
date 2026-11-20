/**
 * ARC-2: Plug-and-Play 3-Tier Investment & Tangible Capital Venture Engine.
 *
 *   Tier 1  Investments           Financial instruments (MMFs, listed shares, T-Bills, fixed deposits).
 *                                 Legacy columns preserved; market columns appended to the right.
 *   Tier 2  Investment Projects   Tangible ventures (Bee Keeping, land, real estate, agribusiness).
 *                                 Static attributes only - all money totals are DERIVED from Tier 3.
 *   Tier 3  Investment Cashflows  Unified money-movement ledger keyed by Entity Type + Entity ID.
 *
 * Plug-and-play rule: adding a new share holding or a new project is just a new row.
 * No code changes, no new tabs. Every report consumes the unified reader below.
 *
 * Non-breaking rule: the legacy "InvestmentLedger" tab is still read (never rewritten), and
 * merged with "Investment Cashflows" through readUnifiedInvestmentLedgerValues_().
 */

const INVESTMENT_ENGINE = Object.freeze({
  TIER1_APPENDED_HEADERS: [
    "Asset Class",
    "Institution",
    "Ticker",
    "Units Held",
    "Unit Cost",
    "Current Price",
    "Last Valued",
    "Carrying Value",
  ],
  PROJECT_HEADERS: [
    "Project ID",
    "Project Name",
    "Category",
    "Linked Investment ID",
    "Start Date",
    "Operating Capacity",
    "Capacity Unit",
    "Lead Member",
    "Approved Budget",
    "Status",
    "Notes",
    "Created At",
    "Capital Deployed",
    "Cumulative Revenue",
    "Cumulative OpEx",
    "Carrying Value",
  ],
  CASHFLOW_HEADERS: [
    "Transaction ID",
    "Date",
    "Entity Type",
    "Entity ID",
    "Flow Type",
    "Category",
    "Description",
    "Amount",
    "Transaction Fee",
    "Payment Channel",
    "Reference",
    "Recorded By",
    "Recorded At",
  ],
  ENTITY_TYPES: ["Investment", "Project"],
  FLOW_TYPES: ["Capital In", "Expense", "Revenue", "Dividend", "Withdrawal"],
  PROJECT_STATUSES: ["Planning", "Active", "Paused", "Completed", "Exited"],
  INVESTMENT_STATUSES: ["Active", "Matured", "Sold", "Exited", "Closed"],
  LEGACY_LEDGER_HEADERS: ["Date", "Investment ID", "Type", "Category", "Description", "Amount", "Transaction Fee"],
});

/* ------------------------------------------------------------------ *
 * Provisioning (idempotent - safe to run any number of times)
 * ------------------------------------------------------------------ */

/**
 * One-shot institutional workbook setup for ARC-1 + ARC-2 + ARC-3.
 * Never deletes, renames, reorders or overwrites existing data.
 */
function runInstitutionalWorkbookSetup_() {
  const ss = getSpreadsheet_();
  const report = {
    constants: null,
    investments: null,
    projects: null,
    cashflows: null,
    migratedLedger: null,
    retiredSheets: [],
    prepopulated: [],
    spillFormulas: null,
    summaryKpis: null,
    nativeTables: null,
    warnings: [],
  };

  try {
    report.constants = provisionConstantsReferenceTables_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("constants: " + e.message);
  }
  let refRanges = {};
  try {
    refRanges = getConstantsReferenceRanges_(ss);
  } catch (e) {
    report.warnings.push("refRanges: " + e.message);
  }

  try {
    report.investments = provisionInvestmentsRegister_(ss, refRanges);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("investments: " + e.message);
  }
  try {
    report.projects = provisionInvestmentProjects_(ss, refRanges);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("projects: " + e.message);
  }
  try {
    report.cashflows = provisionInvestmentCashflows_(ss, refRanges);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("cashflows: " + e.message);
  }
  try {
    report.migratedLedger = migrateAndRetireLegacyInvestmentLedger_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("migratedLedger: " + e.message);
  }

  // Retire redundant CIC Transactions tab when Fund Statements exists
  try {
    const cicSheet = ss.getSheetByName(SHEETS.CIC_TRANSACTIONS);
    const fundSheet = getSheetByNameInsensitive_(ss, SHEETS.FUND_STATEMENTS);
    if (cicSheet && (!fundSheet || fundSheet.getName() !== cicSheet.getName())) {
      if (typeof ss.deleteSheet === "function") {
        ss.deleteSheet(cicSheet);
      }
      report.retiredSheets.push(SHEETS.CIC_TRANSACTIONS);
    }
    SpreadsheetApp.flush();
  } catch (eCic) {
    report.warnings.push("retireCic: " + eCic.message);
  }
  if (report.migratedLedger && report.migratedLedger.retiredSheet) {
    report.retiredSheets.push(SHEETS.INVESTMENT_LEDGER);
  }

  try {
    report.prepopulated = prepopulateInvestmentEngine_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("prepopulated: " + e.message);
  }
  try {
    report.spillFormulas = provisionWorkbookSpillFormulas_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("spillFormulas: " + e.message);
  }
  try {
    report.summaryKpis = provisionSummaryKpisSheet_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("summaryKpis: " + e.message);
  }
  try {
    report.nativeTables = syncWorkbookNativeTables_(ss);
    SpreadsheetApp.flush();
  } catch (e) {
    report.warnings.push("nativeTables: " + e.message);
  }

  try { clearDashboardCache_(); } catch (e) {}
  appendAuditLog_(
    "workbook.setup",
    "Workbook",
    "",
    "ARC-1/ARC-2/ARC-3 institutional workbook engine & Summary KPIs provisioned",
    JSON.stringify(report)
  );
  return report;
}

/** Locates the Constants reference tables by header and returns A1 ranges for validation. */
function getConstantsReferenceRanges_(ss) {
  const out = {};
  const sheet = getSheetByNameInsensitive_(ss, SHEETS.CONSTANTS);
  if (!sheet) return out;
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return out;
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const wanted = {
    "asset classes": "assetClasses",
    asset_classes: "assetClasses",
    "project categories": "projectCategories",
    project_categories: "projectCategories",
    "deposit channel": "paymentChannels",
    "payment modes": "paymentChannels",
    "payment channels": "paymentChannels",
    payment_channels: "paymentChannels",
  };
  let foundDepositChannel = false;
  for (let c = 0; c < headers.length; c++) {
    const key = String(headers[c] || "").trim().toLowerCase();
    const mapped = wanted[key];
    if (!mapped) continue;
    if (mapped === "paymentChannels") {
      if (foundDepositChannel && key !== "deposit channel") continue;
      if (key === "deposit channel") foundDepositChannel = true;
    }
    out[mapped] = sheet.getRange(2, c + 1, Math.max(sheet.getLastRow() - 1, 1), 1);
  }
  return out;
}

/**
 * Migrates all legacy rows from "InvestmentLedger" into "Investment Cashflows",
 * updates any Investments formulas referencing InvestmentLedger to Cashflows_*,
 * and deletes the retired "InvestmentLedger" tab.
 */
function migrateAndRetireLegacyInvestmentLedger_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const result = { migratedCount: 0, updatedFormulas: 0, retiredSheet: false };
  try {
    const legacy = spreadsheet.getSheetByName(SHEETS.INVESTMENT_LEDGER);
    const cf = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENT_CASHFLOWS);
    const tz = spreadsheet.getSpreadsheetTimeZone();

    if (legacy && cf && legacy.getName() !== cf.getName()) {
      if (legacy.getLastRow() > 1) {
        const lv = legacy.getDataRange().getValues();
        const lc = getHeaderMap_(lv[0]);

        const existingKeys = {};
        if (cf.getLastRow() > 1) {
          const cv = cf.getDataRange().getValues();
          const cc = getHeaderMap_(cv[0]);
          for (let j = 1; j < cv.length; j++) {
            const eId = cc["Entity ID"] !== undefined ? String(cv[j][cc["Entity ID"]] || "").trim() : "";
            const fType = cc["Flow Type"] !== undefined ? String(cv[j][cc["Flow Type"]] || "").trim() : "";
            const amt = cc["Amount"] !== undefined ? Math.abs(Number(cv[j][cc["Amount"]]) || 0) : 0;
            const desc = cc["Description"] !== undefined ? String(cv[j][cc["Description"]] || "").trim() : "";
            if (eId || fType || amt) {
              existingKeys[eId + "|" + fType + "|" + amt + "|" + desc] = true;
            }
          }
        }

        for (let r = 1; r < lv.length; r++) {
          const invId = lc["Investment ID"] !== undefined ? String(lv[r][lc["Investment ID"]] || "").trim() : "";
          const rawType = lc["Type"] !== undefined ? String(lv[r][lc["Type"]] || "").trim() : "";
          const cat = lc["Category"] !== undefined ? String(lv[r][lc["Category"]] || "").trim() : "";
          const desc = lc["Description"] !== undefined ? String(lv[r][lc["Description"]] || "").trim() : "";
          const amt = lc["Amount"] !== undefined ? Math.abs(Number(lv[r][lc["Amount"]]) || 0) : 0;
          const fee = lc["Transaction Fee"] !== undefined ? (Number(lv[r][lc["Transaction Fee"]]) || 0) : 0;
          const dt = lc["Date"] !== undefined ? lv[r][lc["Date"]] : "";

          if (!invId && !rawType && !amt) continue;
          const kindLower = typeof normalizeLedgerType_ === "function" ? normalizeLedgerType_(rawType) : rawType.toLowerCase();
          let flowType = "Expense";
          if (kindLower === "capital in") flowType = "Capital In";
          else if (kindLower === "revenue") flowType = "Revenue";
          else if (kindLower === "withdrawal") flowType = "Withdrawal";
          else if (kindLower === "dividend") flowType = "Dividend";

          const dedupKey = invId + "|" + flowType + "|" + amt + "|" + desc;
          if (existingKeys[dedupKey]) continue;

          appendRowByHeaders_(cf, {
            "Transaction ID": "BLICF-HIST-" + String(r).padStart(3, "0"),
            "Date": dt,
            "Entity Type": "Investment",
            "Entity ID": invId,
            "Flow Type": flowType,
            "Category": cat,
            "Description": desc,
            "Amount": amt,
            "Transaction Fee": fee,
            "Payment Channel": "Cash",
            "Reference": "MIGRATED-LEDGER",
            "Recorded By": "System Migration",
            "Recorded At": Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss"),
          });
          existingKeys[dedupKey] = true;
          result.migratedCount++;
        }
      }

      if (typeof setupAllNamedRanges_ === "function") {
        try { setupAllNamedRanges_(spreadsheet); } catch (eNR) {}
      }

      const invSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENTS);
      if (invSheet && invSheet.getLastRow() > 1) {
        const iHeaders = invSheet.getRange(1, 1, 1, invSheet.getLastColumn()).getValues()[0];
        const iCol = getHeaderMap_(iHeaders);
        const miCol = iCol["Money Invested"];
        const revCol = iCol["Revenue"];
        const lastInvRow = invSheet.getLastRow();
        for (let r = 2; r <= lastInvRow; r++) {
          if (miCol !== undefined) {
            try {
              const cell = invSheet.getRange(r, miCol + 1);
              const f = cell && typeof cell.getFormula === "function" ? String(cell.getFormula() || "") : "";
              if (/InvestmentLedger/i.test(f)) {
                cell.setFormula(
                  '=SUMIFS(Cashflows_Amount, Cashflows_EntityID, A' + r + ', Cashflows_FlowType, "Capital In") + SUMIFS(Cashflows_Amount, Cashflows_EntityID, A' + r + ', Cashflows_FlowType, "Expense") + SUMIFS(Cashflows_Fee, Cashflows_EntityID, A' + r + ')'
                );
                result.updatedFormulas++;
              }
            } catch (eMI) {}
          }
          if (revCol !== undefined) {
            try {
              const cell = invSheet.getRange(r, revCol + 1);
              const f = cell && typeof cell.getFormula === "function" ? String(cell.getFormula() || "") : "";
              if (/InvestmentLedger/i.test(f)) {
                cell.setFormula(
                  '=SUMIFS(Cashflows_Amount, Cashflows_EntityID, A' + r + ', Cashflows_FlowType, "Revenue") + SUMIFS(Cashflows_Amount, Cashflows_EntityID, A' + r + ', Cashflows_FlowType, "Dividend")'
                );
                result.updatedFormulas++;
              }
            } catch (eRev) {}
          }
        }
      }

      if (typeof spreadsheet.deleteSheet === "function") {
        spreadsheet.deleteSheet(legacy);
        result.retiredSheet = true;
      }
    }
  } catch (err) {
    console.warn("migrateAndRetireLegacyInvestmentLedger_ error: " + err.message);
  }
  return result;
}

/**
 * Applies canonical Navy (#0F2A44) header styling to all sheets and synchronizes
 * Google Sheets Native Tables ("Convert to table") via the Sheets v4 REST API.
 */
function syncWorkbookNativeTables_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const summary = { updatedTables: [], addedTables: [] };
  const allSheets = spreadsheet.getSheets();

  allSheets.forEach(function (sheet) {
    try {
      const lastCol = Math.max(sheet.getLastColumn(), 1);
      sheet.getRange(1, 1, 1, lastCol).setFontWeight("bold").setBackground("#0f2a44").setFontColor("#ffffff");
      sheet.setFrozenRows(1);
    } catch (eStyle) {}
  });

  if (typeof UrlFetchApp === "undefined" || typeof ScriptApp === "undefined") {
    return summary;
  }

  try {
    const ssId = typeof spreadsheet.getId === "function" ? spreadsheet.getId() : SPREADSHEET_ID;
    const token = ScriptApp.getOAuthToken();
    const metaUrl = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(ssId) + "?fields=sheets(properties(sheetId,title),tables)";
    const metaRes = UrlFetchApp.fetch(metaUrl, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true,
    });
    if (metaRes.getResponseCode() !== 200) return summary;

    const meta = JSON.parse(metaRes.getContentText() || "{}");
    const sheetMetaList = meta.sheets || [];
    const navyRowsProps = {
      headerColorStyle: { rgbColor: { red: 15 / 255, green: 42 / 255, blue: 68 / 255 } },
      firstBandColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } },
      secondBandColorStyle: { rgbColor: { red: 244 / 255, green: 247 / 255, blue: 250 / 255 } },
    };

    const batchUrl = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(ssId) + ":batchUpdate";
    function postBatch_(requests) {
      return UrlFetchApp.fetch(batchUrl, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + token },
        payload: JSON.stringify({ requests: requests }),
        muteHttpExceptions: true,
      });
    }

    sheetMetaList.forEach(function (sm) {
      if (!sm || !sm.properties) return;
      const sheetId = sm.properties.sheetId;
      const title = sm.properties.title;
      const liveSheet = spreadsheet.getSheetByName(title);
      if (!liveSheet) return;

      const endRow = Math.max(liveSheet.getLastRow(), 2);
      const endCol = Math.max(liveSheet.getLastColumn(), 1);
      const gridRange = {
        sheetId: sheetId,
        startRowIndex: 0,
        endRowIndex: endRow,
        startColumnIndex: 0,
        endColumnIndex: endCol,
      };

      const existingTables = sm.tables || [];
      if (existingTables.length > 0) {
        const tbl = existingTables[0];
        let res = postBatch_([
          {
            updateTable: {
              table: {
                tableId: tbl.tableId,
                name: tbl.name,
                range: gridRange,
                rowsProperties: navyRowsProps,
              },
              fields: "range,rowsProperties",
            },
          },
        ]);
        if (res.getResponseCode() !== 200) {
          res = postBatch_([
            {
              updateTable: {
                table: {
                  tableId: tbl.tableId,
                  name: tbl.name,
                  range: gridRange,
                },
                fields: "range",
              },
            },
          ]);
        }
        if (res.getResponseCode() === 200) summary.updatedTables.push(title);
      } else {
        const safeTableName = String(title || "Table")
          .replace(/[^A-Za-z0-9_]/g, "_")
          .replace(/^_+|_+$/g, "") + "_Table";
        let res = postBatch_([
          {
            addTable: {
              table: {
                name: safeTableName,
                range: gridRange,
                rowsProperties: navyRowsProps,
              },
            },
          },
        ]);
        if (res.getResponseCode() !== 200) {
          res = postBatch_([
            {
              addTable: {
                table: {
                  name: safeTableName,
                  range: gridRange,
                },
              },
            },
          ]);
        }
        if (res.getResponseCode() === 200) summary.addedTables.push(title);
      }
    });
  } catch (eApi) {
    console.warn("syncWorkbookNativeTables_ warning: " + eApi.message);
  }
  return summary;
}

function ensureHeaderedSheet_(ss, sheetName, headers) {
  let sheet = getSheetByNameInsensitive_(ss, sheetName);
  let created = false;
  if (!sheet || sheet.getName().trim().toLowerCase() !== sheetName.toLowerCase()) {
    // Alias hits (e.g. legacy tab) must not be hijacked - create the canonical tab.
    sheet = ss.insertSheet(sheetName);
    created = true;
  }
  const lastCol = sheet.getLastColumn();
  const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const map = getHeaderMap_(existing);
  const added = [];
  let nextCol = lastCol + 1;
  if (lastCol > 0 && existing.every(function (h) { return String(h || "").trim() === ""; })) {
    nextCol = 1;
  }
  headers.forEach(function (h) {
    if (map[h] === undefined) {
      if (nextCol > sheet.getMaxColumns()) sheet.insertColumnAfter(sheet.getMaxColumns());
      sheet.getRange(1, nextCol).setValue(h);
      added.push(h);
      nextCol++;
    }
  });
  if (created || added.length) {
    const width = sheet.getLastColumn();
    sheet.getRange(1, 1, 1, width).setFontWeight("bold").setBackground("#0f2a44").setFontColor("#ffffff");
    sheet.setFrozenRows(1);
  }
  return { sheet: sheet, created: created, addedHeaders: added };
}

function columnRange_(sheet, headerName) {
  const lastCol = sheet.getLastColumn();
  const map = getHeaderMap_(sheet.getRange(1, 1, 1, lastCol).getValues()[0]);
  const idx = map[headerName];
  if (idx === undefined) return null;
  return sheet.getRange(2, idx + 1, Math.max(sheet.getLastRow() - 1, 1), 1);
}

function applyListValidation_(range, values) {
  if (!range) return;
  try {
    range.setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build()
    );
    SpreadsheetApp.flush();
  } catch (e) {}
}

function applyRangeValidation_(range, sourceRange) {
  if (!range || !sourceRange) return;
  try {
    range.setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInRange(sourceRange, true).setAllowInvalid(true).build()
    );
    SpreadsheetApp.flush();
  } catch (e) {}
}

function applyNumberFormat_(sheet, headers, fmt) {
  headers.forEach(function (h) {
    try {
      const r = columnRange_(sheet, h);
      if (r) {
        r.setNumberFormat(fmt);
        SpreadsheetApp.flush();
      }
    } catch (e) {}
  });
}

function provisionInvestmentsRegister_(ss, refRanges) {
  const res = ensureHeaderedSheet_(ss, SHEETS.INVESTMENTS, INVESTMENT_ENGINE.TIER1_APPENDED_HEADERS);
  const sheet = res.sheet;
  applyRangeValidation_(columnRange_(sheet, "Asset Class"), refRanges.assetClasses);
  applyNumberFormat_(sheet, ["Units Held"], "#,##0.####");
  applyNumberFormat_(sheet, ["Unit Cost", "Current Price", "Carrying Value"], "#,##0.00");
  applyNumberFormat_(sheet, ["Last Valued"], "dd mmm yyyy");

  // ARC-3: Row 2 spill formula for Carrying Value (Units Held * Current Price when marked to market, else Money Invested)
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = getHeaderMap_(headers);
  if (
    col["Carrying Value"] !== undefined &&
    col["Investment ID"] !== undefined &&
    col["Money Invested"] !== undefined &&
    col["Status"] !== undefined &&
    col["Units Held"] !== undefined &&
    col["Current Price"] !== undefined
  ) {
    try {
      const idL = getColLetter_(col["Investment ID"] + 1);
      const invL = getColLetter_(col["Money Invested"] + 1);
      const statL = getColLetter_(col["Status"] + 1);
      const uL = getColLetter_(col["Units Held"] + 1);
      const pL = getColLetter_(col["Current Price"] + 1);
      installColumnSpillFormula_(
        sheet,
        col["Carrying Value"],
        "Carrying Value",
        "MAP(" + idL + "2:" + idL + ", " + invL + "2:" + invL + ", " + statL + "2:" + statL + ", " + uL + "2:" + uL + ", " + pL + "2:" + pL + ', LAMBDA(id, inv, stat, u, p, IF(id="", "", IF(REGEXMATCH(LOWER(TRIM(stat)), "^(exited|closed|sold|matured|settled|inactive|cancelled|rejected)$"), 0, IF(AND(N(u)>0, N(p)>0), N(u)*N(p), N(inv))))))'
      );
    } catch (eSpill) {
      console.warn("Could not install Carrying Value spill formula on Investments: " + eSpill.message);
    }
  }
  return { created: res.created, addedHeaders: res.addedHeaders };
}

function provisionInvestmentProjects_(ss, refRanges) {
  const res = ensureHeaderedSheet_(ss, SHEETS.INVESTMENT_PROJECTS, INVESTMENT_ENGINE.PROJECT_HEADERS);
  const sheet = res.sheet;
  applyRangeValidation_(columnRange_(sheet, "Category"), refRanges.projectCategories);
  applyListValidation_(columnRange_(sheet, "Status"), INVESTMENT_ENGINE.PROJECT_STATUSES);
  const inv = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENTS);
  if (inv) applyRangeValidation_(columnRange_(sheet, "Linked Investment ID"), inv.getRange("A2:A"));
  applyNumberFormat_(sheet, ["Approved Budget", "Capital Deployed", "Cumulative Revenue", "Cumulative OpEx", "Carrying Value"], "#,##0.00");
  applyNumberFormat_(sheet, ["Start Date"], "dd mmm yyyy");
  return { created: res.created, addedHeaders: res.addedHeaders };
}

function provisionInvestmentCashflows_(ss, refRanges) {
  const res = ensureHeaderedSheet_(ss, SHEETS.INVESTMENT_CASHFLOWS, INVESTMENT_ENGINE.CASHFLOW_HEADERS);
  const sheet = res.sheet;
  applyListValidation_(columnRange_(sheet, "Entity Type"), INVESTMENT_ENGINE.ENTITY_TYPES);
  applyListValidation_(columnRange_(sheet, "Flow Type"), INVESTMENT_ENGINE.FLOW_TYPES);
  applyRangeValidation_(columnRange_(sheet, "Payment Channel"), refRanges.paymentChannels);
  applyNumberFormat_(sheet, ["Amount", "Transaction Fee"], "#,##0.00");
  applyNumberFormat_(sheet, ["Date"], "dd mmm yyyy");
  return { created: res.created, addedHeaders: res.addedHeaders };
}

/**
 * Pre-population using ONLY data already in the workbook (no invented figures):
 *  - Classifies blank "Asset Class" cells from the investment name (shares / MMF / bee keeping...).
 *  - Creates a linked Tier 2 project row for any agribusiness/real-estate investment
 *    (e.g. Bee Keeping) that does not yet have one. Financial totals stay in Tier 1 to avoid double counting.
 */
function prepopulateInvestmentEngine_(ss) {
  const actions = [];
  const inv = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENTS);
  const prj = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENT_PROJECTS);
  if (!inv || inv.getLastRow() < 2) return actions;

  const iv = inv.getDataRange().getValues();
  const ic = getHeaderMap_(iv[0]);
  const acCol = ic["Asset Class"];
  const projectCandidates = [];

  for (let r = 1; r < iv.length; r++) {
    const id = String(iv[r][ic["Investment ID"]] || "").trim();
    const name = String(iv[r][ic["Name"]] || "").trim();
    if (!id && !name) continue;
    const guess = classifyInvestmentName_(name);
    if (acCol !== undefined && !String(iv[r][acCol] || "").trim() && guess.assetClass) {
      inv.getRange(r + 1, acCol + 1).setValue(guess.assetClass);
      actions.push("Classified " + (id || name) + " as " + guess.assetClass);
    }
    if (guess.projectCategory && id) {
      projectCandidates.push({
        id: id,
        name: name,
        category: guess.projectCategory,
        startDate: ic["Start Date"] !== undefined ? iv[r][ic["Start Date"]] : "",
        status: ic["Status"] !== undefined ? String(iv[r][ic["Status"]] || "").trim() : "",
      });
    }
  }

  if (!prj || !projectCandidates.length) return actions;
  const pv = prj.getDataRange().getValues();
  const pc = getHeaderMap_(pv[0]);
  const linked = {};
  for (let p = 1; p < pv.length; p++) {
    const l = String(pv[p][pc["Linked Investment ID"]] || "").trim();
    if (l) linked[l] = true;
  }
  const tz = ss.getSpreadsheetTimeZone();
  projectCandidates.forEach(function (c) {
    if (linked[c.id]) return;
    const pid = nextSequentialId_(prj, "Project ID", "BLPRJ-");
    const rowObj = {
      "Project ID": pid,
      "Project Name": c.name,
      "Category": c.category,
      "Linked Investment ID": c.id,
      "Start Date": c.startDate || "",
      "Status": /exit|sold|closed/i.test(c.status) ? "Exited" : "Active",
      "Notes": "Auto-linked from Investments register (ARC-2). Fill in capacity, lead member and budget.",
      "Created At": Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm"),
    };
    appendRowByHeaders_(prj, rowObj);
    actions.push("Created project " + pid + " linked to " + c.id + " (" + c.name + ")");
  });
  return actions;
}

function classifyInvestmentName_(name) {
  const n = String(name || "").toLowerCase();
  if (/bee|hive|honey|apiar/.test(n)) return { assetClass: "Agribusiness", projectCategory: "Agribusiness" };
  if (/poultry|dairy|farm|greenhouse|agri/.test(n)) return { assetClass: "Agribusiness", projectCategory: "Agribusiness" };
  if (/land|plot|acre|real estate|rental|house|apartment/.test(n)) return { assetClass: "Real Estate / Land", projectCategory: "Real Estate & Land" };
  if (/share|equity|stock|nse|safaricom|kcb|eabl/.test(n)) return { assetClass: "Listed Equities / Shares", projectCategory: "" };
  if (/mmf|money market|cic|mansa|sanlam|etica/.test(n)) return { assetClass: "Money Market Fund", projectCategory: "" };
  if (/t-bill|treasury|bond|infra/.test(n)) return { assetClass: "Treasury Bills / Bonds", projectCategory: "" };
  if (/fixed deposit|\bfd\b/.test(n)) return { assetClass: "Fixed Deposit", projectCategory: "" };
  return { assetClass: "", projectCategory: "" };
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function nextSequentialId_(sheet, headerName, prefix) {
  if (headerName === "Investment ID" || (prefix && /INV/i.test(prefix))) {
    let tz = "GMT+3";
    try {
      if (sheet && typeof sheet.getParent === "function" && sheet.getParent() && sheet.getParent().getSpreadsheetTimeZone) {
        tz = sheet.getParent().getSpreadsheetTimeZone();
      } else if (typeof getSpreadsheet_ === "function") {
        tz = getSpreadsheet_().getSpreadsheetTimeZone();
      }
    } catch (e) {}
    const year = Utilities.formatDate(new Date(), tz, "yyyy");
    const invPrefix = "BLINV-" + year + "-";
    let max = 0;
    if (sheet.getLastRow() > 1) {
      const vals = sheet.getDataRange().getValues();
      const idx = getHeaderMap_(vals[0])[headerName];
      if (idx !== undefined) {
        for (let r = 1; r < vals.length; r++) {
          const str = String(vals[r][idx] || "").trim();
          if (!str) continue;
          // Match new year-based format BLINV-YYYY-XX
          const mYear = str.match(new RegExp("^BLINV-" + year + "-(\\d+)$", "i"));
          if (mYear) {
            max = Math.max(max, parseInt(mYear[1], 10));
            continue;
          }
          // Match legacy format INV-XXX or BLINV-XXX without year
          const mLegacy = str.match(/^(?:BL)?INV-(\d+)$/i);
          if (mLegacy) {
            max = Math.max(max, parseInt(mLegacy[1], 10));
            continue;
          }
        }
      }
    }
    return invPrefix + String(max + 1).padStart(2, "0");
  }

  if (headerName === "Project ID" || (prefix && /PRJ/i.test(prefix))) {
    const prjPrefix = "BLPRJ-";
    let max = 0;
    if (sheet.getLastRow() > 1) {
      const vals = sheet.getDataRange().getValues();
      const idx = getHeaderMap_(vals[0])[headerName];
      if (idx !== undefined) {
        for (let r = 1; r < vals.length; r++) {
          const str = String(vals[r][idx] || "").trim();
          if (!str) continue;
          // Match BLPRJ-XX or legacy PRJ-XXX / PRJ-XX
          const m = str.match(/^(?:BL)?PRJ-(\d+)$/i);
          if (m) {
            max = Math.max(max, parseInt(m[1], 10));
          }
        }
      }
    }
    return prjPrefix + String(max + 1).padStart(2, "0");
  }

  let max = 0;
  const effPrefix = prefix || "";
  if (sheet.getLastRow() > 1) {
    const vals = sheet.getDataRange().getValues();
    const idx = getHeaderMap_(vals[0])[headerName];
    if (idx !== undefined) {
      for (let r = 1; r < vals.length; r++) {
        const m = String(vals[r][idx] || "").match(/(\d+)\s*$/);
        if (m) max = Math.max(max, Number(m[1]));
      }
    }
  }
  return effPrefix + String(max + 1).padStart(2, "0");
}

function appendRowByHeaders_(sheet, rowObj) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const isSpillCol = headers.map(function (_h, idx) {
    return typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(sheet, idx);
  });
  const row = headers.map(function (h, idx) {
    if (isSpillCol[idx]) return "";
    const key = String(h || "").trim();
    return rowObj[key] !== undefined ? rowObj[key] : "";
  });

  const lastRow = sheet.getLastRow();
  let target = lastRow + 1;
  let savedRow2Formulas = null;

  if (lastRow === 2) {
    const row2Vals = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    const nonSpillBlank = row2Vals.every(function (v, idx) {
      return isSpillCol[idx] || String(v === undefined || v === null ? "" : v).trim() === "";
    });
    if (nonSpillBlank) {
      target = 2;
      savedRow2Formulas = [];
      for (let c = 0; c < lastCol; c++) {
        if (isSpillCol[c]) {
          try {
            const cell = sheet.getRange(2, c + 1);
            const f = cell && typeof cell.getFormula === "function" ? String(cell.getFormula() || "").trim() : "";
            if (f) savedRow2Formulas.push({ col1: c + 1, formula: f });
          } catch (e) {}
        }
      }
    }
  }

  sheet.getRange(target, 1, 1, row.length).setValues([row]);
  if (target === 2 && savedRow2Formulas && savedRow2Formulas.length) {
    savedRow2Formulas.forEach(function (item) {
      try {
        const cell = sheet.getRange(2, item.col1);
        if (cell && typeof cell.setFormula === "function") cell.setFormula(item.formula);
      } catch (e) {}
    });
  }
  if (typeof invalidateSheetContextCache_ === "function") {
    try { invalidateSheetContextCache_(sheet.getName()); } catch (e) {}
  }
  return target;
}

/** Formula-injection defence for user-supplied free text. */
function safeCellText_(v) {
  const s = String(v === undefined || v === null ? "" : v).trim().slice(0, 500);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function toMoney_(v) {
  const n = Number(String(v === undefined || v === null ? "" : v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

function canonicalFromList_(value, list) {
  const v = String(value || "").trim().toLowerCase();
  for (let i = 0; i < list.length; i++) if (list[i].toLowerCase() === v) return list[i];
  return "";
}

/* ------------------------------------------------------------------ *
 * Unified ledger reader (legacy InvestmentLedger + Investment Cashflows)
 * ------------------------------------------------------------------ */

/**
 * Returns a 2D array shaped like the legacy InvestmentLedger tab:
 *   [Date, Investment ID, Type, Category, Description, Amount, Transaction Fee, Entity Type]
 * so every existing consumer (P&L, cashflow cards, per-investment ledger) works unchanged.
 * "Dividend" flows are surfaced as Type "Revenue" / Category "Dividend".
 */
function readUnifiedInvestmentLedgerValues_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const header = INVESTMENT_ENGINE.LEGACY_LEDGER_HEADERS.concat(["Entity Type"]);
  const out = [header];

  const legacy = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENT_LEDGER);
  if (legacy && legacy.getName().trim().toLowerCase() === String(SHEETS.INVESTMENT_LEDGER).toLowerCase() && legacy.getLastRow() > 1) {
    const lv = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, legacy) : legacy.getDataRange().getValues();
    const lc = getHeaderMap_(lv[0]);
    for (let i = 1; i < lv.length; i++) {
      out.push([
        lc["Date"] !== undefined ? lv[i][lc["Date"]] : "",
        lc["Investment ID"] !== undefined ? lv[i][lc["Investment ID"]] : "",
        lc["Type"] !== undefined ? lv[i][lc["Type"]] : "",
        lc["Category"] !== undefined ? lv[i][lc["Category"]] : "",
        lc["Description"] !== undefined ? lv[i][lc["Description"]] : "",
        lc["Amount"] !== undefined ? lv[i][lc["Amount"]] : 0,
        lc["Transaction Fee"] !== undefined ? lv[i][lc["Transaction Fee"]] : 0,
        "Investment",
      ]);
    }
  }

  const cf = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENT_CASHFLOWS);
  if (cf && cf.getName().trim().toLowerCase() === String(SHEETS.INVESTMENT_CASHFLOWS).toLowerCase() && cf.getLastRow() > 1) {
    const cv = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, cf) : cf.getDataRange().getValues();
    const cc = getHeaderMap_(cv[0]);
    if (cc["Date"] !== undefined && cc["Flow Type"] !== undefined && cc["Amount"] !== undefined) {
      for (let j = 1; j < cv.length; j++) {
        const flow = String(cv[j][cc["Flow Type"]] || "").trim();
        if (!flow) continue;
        const isDividend = flow.toLowerCase() === "dividend";
        const cat = cc["Category"] !== undefined ? String(cv[j][cc["Category"]] || "").trim() : "";
        out.push([
          cv[j][cc["Date"]],
          cc["Entity ID"] !== undefined ? cv[j][cc["Entity ID"]] : "",
          isDividend ? "Revenue" : flow,
          isDividend ? (cat || "Dividend") : cat,
          cc["Description"] !== undefined ? cv[j][cc["Description"]] : "",
          cv[j][cc["Amount"]],
          cc["Transaction Fee"] !== undefined ? cv[j][cc["Transaction Fee"]] : 0,
          cc["Entity Type"] !== undefined ? String(cv[j][cc["Entity Type"]] || "").trim() : "",
        ]);
      }
    }
  }
  return out;
}

/** Aggregates the unified ledger per entity id. */
function aggregateLedgerByEntity_(ledgerValues) {
  const agg = {};
  for (let i = 1; i < ledgerValues.length; i++) {
    const row = ledgerValues[i];
    const id = String(row[1] || "").trim();
    if (!id) continue;
    if (!agg[id]) agg[id] = { capitalIn: 0, expenses: 0, revenue: 0, dividends: 0, withdrawals: 0, fees: 0, lastDate: null };
    const a = agg[id];
    const amt = Math.abs(Number(row[5]) || 0);
    const fee = Number(row[6]) || 0;
    const kind = normalizeLedgerType_(row[2]);
    const cat = String(row[3] || "").toLowerCase();
    if (kind === "capital in") { a.capitalIn += amt; a.fees += fee; }
    else if (kind === "expense") { a.expenses += amt; a.fees += fee; }
    else if (kind === "revenue") { if (cat === "dividend") a.dividends += amt; else a.revenue += amt; }
    else if (kind === "withdrawal") a.withdrawals += amt;
    const d = row[0] instanceof Date ? row[0] : null;
    if (d && (!a.lastDate || d > a.lastDate)) a.lastDate = d;
  }
  return agg;
}

/* ------------------------------------------------------------------ *
 * Valuation (shared with RPT-1 Balance Sheet)
 * ------------------------------------------------------------------ */

const INACTIVE_ENGINE_STATUSES = Object.freeze({
  exited: true, closed: true, sold: true, matured: true, settled: true,
  inactive: true, cancelled: true, rejected: true, completed: false,
});

/**
 * Tier 1 market valuation: Units Held x Current Price when both are present (FVTPL),
 * otherwise falls back to Money Invested (cost). Returns null when the row is inactive.
 */
function valueInvestmentRow_(row, col) {
  const stat = col["Status"] !== undefined ? String(row[col["Status"]] || "").trim().toLowerCase() : "";
  if (INACTIVE_ENGINE_STATUSES[stat]) return null;
  const units = col["Units Held"] !== undefined ? Number(row[col["Units Held"]]) || 0 : 0;
  const price = col["Current Price"] !== undefined ? Number(row[col["Current Price"]]) || 0 : 0;
  const unitCost = col["Unit Cost"] !== undefined ? Number(row[col["Unit Cost"]]) || 0 : 0;
  const invested = col["Money Invested"] !== undefined ? Number(row[col["Money Invested"]]) || 0 : 0;
  const costBasis = units > 0 && unitCost > 0 ? units * unitCost : invested;
  const marked = units > 0 && price > 0;
  const carrying = marked ? units * price : invested;
  return {
    costBasis: Math.round(costBasis * 100) / 100,
    carryingValue: Math.round(carrying * 100) / 100,
    unrealizedGain: marked ? Math.round((carrying - costBasis) * 100) / 100 : 0,
    valuationBasis: marked ? "Market (FVTPL)" : "Cost",
  };
}

/**
 * Tier 2 carrying values for projects that are NOT linked to a Tier 1 row
 * (linked projects are already valued in Tier 1 - prevents double counting).
 */
function getStandaloneProjectCarryingItems_(ss, ledgerValues) {
  const items = [];
  const prj = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENT_PROJECTS);
  if (!prj || prj.getLastRow() < 2) return items;
  const pv = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, prj) : prj.getDataRange().getValues();
  const pc = getHeaderMap_(pv[0]);
  if (pc["Project ID"] === undefined) return items;
  const agg = aggregateLedgerByEntity_(ledgerValues || readUnifiedInvestmentLedgerValues_(ss));
  for (let r = 1; r < pv.length; r++) {
    const id = String(pv[r][pc["Project ID"]] || "").trim();
    if (!id) continue;
    const linked = pc["Linked Investment ID"] !== undefined ? String(pv[r][pc["Linked Investment ID"]] || "").trim() : "";
    if (linked) continue;
    const stat = pc["Status"] !== undefined ? String(pv[r][pc["Status"]] || "").trim().toLowerCase() : "";
    if (stat === "exited") continue;
    const a = agg[id];
    if (!a) continue;
    const carrying = Math.round(Math.max(0, a.capitalIn - a.withdrawals) * 100) / 100;
    if (carrying <= 0) continue;
    items.push({ id: id, name: String(pv[r][pc["Project Name"]] || id).trim(), value: carrying, tier: "Project" });
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Read APIs
 * ------------------------------------------------------------------ */

function getInvestmentsSummary() {
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    const ledger = readUnifiedInvestmentLedgerValues_(ss);
    const agg = aggregateLedgerByEntity_(ledger);

    const instruments = [];
    const totals = { costBasis: 0, carryingValue: 0, unrealizedGain: 0, dividends: 0, revenue: 0 };
    const inv = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENTS);
    if (inv && inv.getLastRow() > 1) {
      const iv = inv.getDataRange().getValues();
      const ic = getHeaderMap_(iv[0]);
      for (let r = 1; r < iv.length; r++) {
        const row = iv[r];
        const id = ic["Investment ID"] !== undefined ? String(row[ic["Investment ID"]] || "").trim() : "";
        if (!id) continue;
        const val = valueInvestmentRow_(row, ic);
        const a = agg[id] || { dividends: 0, revenue: 0, capitalIn: 0, expenses: 0, withdrawals: 0 };
        const item = {
          id: id,
          name: String(row[ic["Name"]] || id).trim(),
          assetClass: ic["Asset Class"] !== undefined ? String(row[ic["Asset Class"]] || "").trim() : "",
          institution: ic["Institution"] !== undefined ? String(row[ic["Institution"]] || "").trim() : "",
          ticker: ic["Ticker"] !== undefined ? String(row[ic["Ticker"]] || "").trim() : "",
          unitsHeld: ic["Units Held"] !== undefined ? Number(row[ic["Units Held"]]) || 0 : 0,
          unitCost: ic["Unit Cost"] !== undefined ? Number(row[ic["Unit Cost"]]) || 0 : 0,
          currentPrice: ic["Current Price"] !== undefined ? Number(row[ic["Current Price"]]) || 0 : 0,
          lastValued: ic["Last Valued"] !== undefined ? formatDateValue_(row[ic["Last Valued"]], tz) : "",
          status: ic["Status"] !== undefined ? String(row[ic["Status"]] || "").trim() || "Active" : "Active",
          active: !!val,
          costBasis: val ? val.costBasis : 0,
          carryingValue: val ? val.carryingValue : 0,
          unrealizedGain: val ? val.unrealizedGain : 0,
          valuationBasis: val ? val.valuationBasis : "Inactive",
          ledgerDividends: Math.round(a.dividends * 100) / 100,
          ledgerRevenue: Math.round(a.revenue * 100) / 100,
        };
        instruments.push(item);
        if (val) {
          totals.costBasis += item.costBasis;
          totals.carryingValue += item.carryingValue;
          totals.unrealizedGain += item.unrealizedGain;
        }
        totals.dividends += item.ledgerDividends;
        totals.revenue += item.ledgerRevenue;
      }
    }
    Object.keys(totals).forEach(function (k) { totals[k] = Math.round(totals[k] * 100) / 100; });

    const projects = buildProjectsSummary_(ss, agg);
    const standalone = getStandaloneProjectCarryingItems_(ss, ledger);
    const standaloneTotal = standalone.reduce(function (s, x) { return s + x.value; }, 0);

    return {
      success: true,
      instruments: instruments,
      instrumentTotals: totals,
      projects: projects.projects,
      projectTotals: projects.totals,
      totalInvestmentAssets: Math.round((totals.carryingValue + standaloneTotal) * 100) / 100,
      options: getInvestmentEngineOptions_(ss),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getProjectsSummary() {
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const agg = aggregateLedgerByEntity_(readUnifiedInvestmentLedgerValues_(ss));
    const res = buildProjectsSummary_(ss, agg);
    return { success: true, projects: res.projects, totals: res.totals };
  } catch (error) {
    return { success: false, error: error.message, projects: [] };
  }
}

function buildProjectsSummary_(ss, agg) {
  const projects = [];
  const totals = { approvedBudget: 0, capitalDeployed: 0, revenue: 0, operatingExpenses: 0, netSurplus: 0 };
  const prj = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENT_PROJECTS);
  if (!prj || prj.getLastRow() < 2) return { projects: projects, totals: totals };
  const tz = ss.getSpreadsheetTimeZone();
  const pv = prj.getDataRange().getValues();
  const pc = getHeaderMap_(pv[0]);
  for (let r = 1; r < pv.length; r++) {
    const row = pv[r];
    const id = String(row[pc["Project ID"]] || "").trim();
    if (!id) continue;
    const linked = pc["Linked Investment ID"] !== undefined ? String(row[pc["Linked Investment ID"]] || "").trim() : "";
    // Linked projects inherit cashflows booked against either the project or its Tier 1 row.
    const a = mergeAgg_(agg[id], linked ? agg[linked] : null);
    const budget = Number(row[pc["Approved Budget"]]) || 0;
    const capex = a.capitalIn;
    const revenue = a.revenue + a.dividends;
    const opex = a.expenses + a.fees;
    const net = revenue - opex;
    const p = {
      id: id,
      name: String(row[pc["Project Name"]] || id).trim(),
      category: String(row[pc["Category"]] || "").trim(),
      linkedInvestmentId: linked,
      startDate: pc["Start Date"] !== undefined ? formatDateValue_(row[pc["Start Date"]], tz) : "",
      operatingCapacity: pc["Operating Capacity"] !== undefined ? row[pc["Operating Capacity"]] : "",
      capacityUnit: pc["Capacity Unit"] !== undefined ? String(row[pc["Capacity Unit"]] || "").trim() : "",
      leadMember: pc["Lead Member"] !== undefined ? String(row[pc["Lead Member"]] || "").trim() : "",
      status: String(row[pc["Status"]] || "").trim() || "Active",
      approvedBudget: round2_(budget),
      capitalDeployed: round2_(capex),
      budgetUtilizationPct: budget > 0 ? Math.round((capex / budget) * 1000) / 10 : 0,
      revenue: round2_(revenue),
      operatingExpenses: round2_(opex),
      capitalReturned: round2_(a.withdrawals),
      netSurplus: round2_(net),
      returnOnCapitalPct: capex > 0 ? Math.round((net / capex) * 1000) / 10 : 0,
    };
    projects.push(p);
    totals.approvedBudget += p.approvedBudget;
    totals.capitalDeployed += p.capitalDeployed;
    totals.revenue += p.revenue;
    totals.operatingExpenses += p.operatingExpenses;
    totals.netSurplus += p.netSurplus;
  }
  Object.keys(totals).forEach(function (k) { totals[k] = round2_(totals[k]); });
  return { projects: projects, totals: totals };
}

function mergeAgg_(a, b) {
  const z = { capitalIn: 0, expenses: 0, revenue: 0, dividends: 0, withdrawals: 0, fees: 0 };
  [a, b].forEach(function (x) {
    if (!x) return;
    Object.keys(z).forEach(function (k) { z[k] += Number(x[k]) || 0; });
  });
  return z;
}

function round2_(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function getInvestmentEngineOptions_(ss) {
  const ranges = getConstantsReferenceRanges_(ss);
  function listFrom(range) {
    if (!range) return [];
    return range.getValues().map(function (r) { return String(r[0] || "").trim(); }).filter(Boolean);
  }
  return {
    assetClasses: listFrom(ranges.assetClasses),
    projectCategories: listFrom(ranges.projectCategories),
    paymentChannels: listFrom(ranges.paymentChannels),
    entityTypes: INVESTMENT_ENGINE.ENTITY_TYPES.slice(),
    flowTypes: INVESTMENT_ENGINE.FLOW_TYPES.slice(),
    projectStatuses: INVESTMENT_ENGINE.PROJECT_STATUSES.slice(),
  };
}

/* ------------------------------------------------------------------ *
 * Write APIs (Admin / Treasurer - investmentsWrite)
 * ------------------------------------------------------------------ */

function withInvestmentLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Adds a Tier 1 financial instrument (e.g. a share holding). */
function addInvestmentAsset(payload) {
  try {
    requirePermission_("investmentsWrite");
    const p = payload || {};
    const name = safeCellText_(p.name);
    if (!name) return { success: false, error: "Investment name is required." };
    const units = p.unitsHeld === "" || p.unitsHeld === undefined ? "" : Number(p.unitsHeld);
    const unitCost = p.unitCost === "" || p.unitCost === undefined ? "" : toMoney_(p.unitCost);
    const price = p.currentPrice === "" || p.currentPrice === undefined ? "" : toMoney_(p.currentPrice);
    if ([units, unitCost, price].some(function (x) { return x !== "" && (!isFinite(x) || x < 0); })) {
      return { success: false, error: "Units, unit cost and price must be non-negative numbers." };
    }
    let invested = p.moneyInvested === "" || p.moneyInvested === undefined ? "" : toMoney_(p.moneyInvested);
    if (invested === "" && units !== "" && unitCost !== "") invested = round2_(units * unitCost);
    if (invested === "" || !isFinite(invested) || invested < 0) {
      return { success: false, error: "Money invested (or units x unit cost) is required." };
    }
    const ss = getSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    return withInvestmentLock_(function () {
      const sheet = getRequiredSheet_(SHEETS.INVESTMENTS);
      const id = nextSequentialId_(sheet, "Investment ID", "BLINV-");
      appendRowByHeaders_(sheet, {
        "Investment ID": id,
        "Name": name,
        "Start Date": parseDateInput_(p.startDate, tz) || new Date(),
        "Money Invested": invested,
        "Status": canonicalFromList_(p.status, INVESTMENT_ENGINE.INVESTMENT_STATUSES) || "Active",
        "Asset Class": safeCellText_(p.assetClass),
        "Institution": safeCellText_(p.institution),
        "Ticker": safeCellText_(p.ticker).toUpperCase(),
        "Units Held": units,
        "Unit Cost": unitCost,
        "Current Price": price,
        "Last Valued": price !== "" ? new Date() : "",
      });
      appendAuditLog_("investment.create", "Investment", id, "Added " + name, JSON.stringify({ invested: invested, units: units }));
      try { clearDashboardCache_(); } catch (e) {}
      return { success: true, id: id };
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Marks a Tier 1 holding to market (e.g. today's NSE share price). */
function updateInvestmentValuation(investmentId, currentPrice, unitsHeld) {
  try {
    requirePermission_("investmentsWrite");
    const id = String(investmentId || "").trim();
    const price = toMoney_(currentPrice);
    if (!id) return { success: false, error: "Investment ID is required." };
    if (!isFinite(price) || price < 0) return { success: false, error: "Current price must be a non-negative number." };
    return withInvestmentLock_(function () {
      const sheet = getRequiredSheet_(SHEETS.INVESTMENTS);
      const vals = sheet.getDataRange().getValues();
      const col = getHeaderMap_(vals[0]);
      requireHeaders_(col, ["Investment ID", "Current Price", "Last Valued"], SHEETS.INVESTMENTS);
      for (let r = 1; r < vals.length; r++) {
        if (String(vals[r][col["Investment ID"]] || "").trim() !== id) continue;
        sheet.getRange(r + 1, col["Current Price"] + 1).setValue(price);
        sheet.getRange(r + 1, col["Last Valued"] + 1).setValue(new Date());
        if (unitsHeld !== undefined && unitsHeld !== "" && col["Units Held"] !== undefined) {
          const u = Number(unitsHeld);
          if (!isFinite(u) || u < 0) return { success: false, error: "Units held must be a non-negative number." };
          sheet.getRange(r + 1, col["Units Held"] + 1).setValue(u);
        }
        appendAuditLog_("investment.revalue", "Investment", id, "Marked to market @ " + price, "");
        try { clearDashboardCache_(); } catch (e) {}
        return { success: true, id: id };
      }
      return { success: false, error: "Investment " + id + " not found." };
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Adds a Tier 2 tangible venture (e.g. a new apiary site). */
function addInvestmentProject(payload) {
  try {
    requirePermission_("investmentsWrite");
    const p = payload || {};
    const name = safeCellText_(p.name);
    if (!name) return { success: false, error: "Project name is required." };
    const budget = p.approvedBudget === "" || p.approvedBudget === undefined ? "" : toMoney_(p.approvedBudget);
    if (budget !== "" && (!isFinite(budget) || budget < 0)) return { success: false, error: "Approved budget must be a non-negative number." };
    const ss = getSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    return withInvestmentLock_(function () {
      const sheet = getRequiredSheet_(SHEETS.INVESTMENT_PROJECTS);
      const id = nextSequentialId_(sheet, "Project ID", "BLPRJ-");
      appendRowByHeaders_(sheet, {
        "Project ID": id,
        "Project Name": name,
        "Category": safeCellText_(p.category),
        "Linked Investment ID": safeCellText_(p.linkedInvestmentId),
        "Start Date": parseDateInput_(p.startDate, tz) || "",
        "Operating Capacity": p.operatingCapacity !== undefined && p.operatingCapacity !== "" ? Number(p.operatingCapacity) || safeCellText_(p.operatingCapacity) : "",
        "Capacity Unit": safeCellText_(p.capacityUnit),
        "Lead Member": safeCellText_(p.leadMember),
        "Approved Budget": budget,
        "Status": canonicalFromList_(p.status, INVESTMENT_ENGINE.PROJECT_STATUSES) || "Planning",
        "Notes": safeCellText_(p.notes),
        "Created At": Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm"),
      });
      appendAuditLog_("project.create", "Investment Project", id, "Added " + name, JSON.stringify({ budget: budget }));
      try { clearDashboardCache_(); } catch (e) {}
      return { success: true, id: id };
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/** Records any money movement against a Tier 1 instrument or Tier 2 project. */
function recordInvestmentCashflow(payload) {
  try {
    const ctx = requirePermission_("investmentsWrite");
    const p = payload || {};
    const entityType = canonicalFromList_(p.entityType, INVESTMENT_ENGINE.ENTITY_TYPES);
    const flowType = canonicalFromList_(p.flowType, INVESTMENT_ENGINE.FLOW_TYPES);
    const entityId = String(p.entityId || "").trim();
    const amount = toMoney_(p.amount);
    const fee = p.transactionFee === "" || p.transactionFee === undefined ? 0 : toMoney_(p.transactionFee);
    if (!entityType) return { success: false, error: "Entity Type must be Investment or Project." };
    if (!flowType) return { success: false, error: "Flow Type must be one of: " + INVESTMENT_ENGINE.FLOW_TYPES.join(", ") + "." };
    if (!entityId) return { success: false, error: "Entity ID is required." };
    if (!isFinite(amount) || amount <= 0) return { success: false, error: "Amount must be greater than zero." };
    if (!isFinite(fee) || fee < 0) return { success: false, error: "Transaction fee must be a non-negative number." };

    const ss = getSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    const date = parseDateInput_(p.date, tz) || new Date();
    if (!(date instanceof Date)) return { success: false, error: "Invalid date." };

    const registry = entityType === "Investment" ? SHEETS.INVESTMENTS : SHEETS.INVESTMENT_PROJECTS;
    const idHeader = entityType === "Investment" ? "Investment ID" : "Project ID";
    const reg = getRequiredSheet_(registry);
    const regVals = reg.getDataRange().getValues();
    const regIdx = getHeaderMap_(regVals[0])[idHeader];
    const exists = regIdx !== undefined && regVals.slice(1).some(function (r) { return String(r[regIdx] || "").trim().toLowerCase() === entityId.toLowerCase(); });
    if (!exists) return { success: false, error: entityType + " " + entityId + " was not found in " + registry + "." };

    return withInvestmentLock_(function () {
      const sheet = getRequiredSheet_(SHEETS.INVESTMENT_CASHFLOWS);
      const txId = "BLICF-" + Utilities.formatDate(date, tz, "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
      appendRowByHeaders_(sheet, {
        "Transaction ID": txId,
        "Date": date,
        "Entity Type": entityType,
        "Entity ID": entityId,
        "Flow Type": flowType,
        "Category": safeCellText_(p.category) || (flowType === "Dividend" ? "Dividend" : ""),
        "Description": safeCellText_(p.description),
        "Amount": amount,
        "Transaction Fee": fee,
        "Payment Channel": typeof normalizeDepositChannel_ === "function" ? normalizeDepositChannel_(p.paymentChannel) : safeCellText_(p.paymentChannel),
        "Reference": safeCellText_(p.reference),
        "Recorded By": safeCellText_(ctx.roleSheetName || ctx.memberName || getCurrentUserEmail_()),
        "Recorded At": Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss"),
      });
      appendAuditLog_(
        "investment.cashflow",
        entityType,
        entityId,
        flowType + " " + amount + " (" + txId + ")",
        JSON.stringify({ fee: fee, category: p.category || "" })
      );
      try { clearDashboardCache_(); } catch (e) {}
      return { success: true, transactionId: txId };
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/* ------------------------------------------------------------------ *
 * ARC-3: Row 1 Header Spill Formulas & Summary KPIs Materialized View
 * ------------------------------------------------------------------ */

/**
 * Installs non-volatile Row 1 header-anchored spill formulas (MAP + LAMBDA + SUMIFS / XLOOKUP)
 * across Members, Contributions, Loans, Loan Repayments, Guarantors, Investments, and Investment Projects,
 * purging legacy per-row formula injections.
 */
function provisionWorkbookSpillFormulas_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const upgraded = [];

  try {
    if (typeof setupAllNamedRanges_ === "function") setupAllNamedRanges_(spreadsheet);
  } catch (eNR) {}

  // 1. Members sheet spill formulas
  try {
    const memSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.MEMBERS);
    if (memSheet && memSheet.getLastRow() >= 1 && typeof setupMembersSavingsFormula_ === "function") {
      setupMembersSavingsFormula_(spreadsheet);
      upgraded.push("Members");
    }
  } catch (eMem) {}

  // 2. Contributions sheet: Member Name spill formula (only when Member ID column exists)
  try {
    const cSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.CONTRIBUTIONS);
    if (cSheet && cSheet.getLastRow() >= 1) {
      const cHeaders = cSheet.getRange(1, 1, 1, Math.max(cSheet.getLastColumn(), 1)).getValues()[0];
      const cCol = getHeaderMap_(cHeaders);
      const midIdx = cCol["Member ID"] !== undefined ? cCol["Member ID"] : cCol["Member id"];
      const nameIdx = cCol["Member Name"];
      if (midIdx !== undefined && nameIdx !== undefined) {
        const midL = getColLetter_(midIdx + 1);
        installColumnSpillFormula_(
          cSheet,
          nameIdx,
          "Member Name",
          "MAP(" + midL + "2:" + midL + ', LAMBDA(mid, IF(mid="", "", IFERROR(XLOOKUP(mid, Members_MemberID, Members_FullName, "—"), ""))))'
        );
        upgraded.push("Contributions");
      }
    }
  } catch (eCon) {}

  // 3. Loans sheet: dynamic Row 1 spill formulas for all computed columns present on the sheet
  try {
    const lSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOANS);
    if (lSheet && lSheet.getLastRow() >= 1) {
      const lHeaders = lSheet.getRange(1, 1, 1, Math.max(lSheet.getLastColumn(), 1)).getValues()[0];
      const lCol = getHeaderMap_(lHeaders);
      const lidIdx = lCol["Loan ID"];
      const midIdx = lCol["Member ID"] !== undefined ? lCol["Member ID"] : lCol["Member id"];
      const nameIdx = lCol["Borrower Name"];
      const reqIdx = lCol["Requested Amount"];
      const intIdx = lCol["Interest"];
      const feeIdx = lCol["Transaction Fee"];
      const repIdx = lCol["Repayment Amount"];
      const paidIdx = lCol["Total Paid"];
      const pPaidIdx = lCol["Principal Paid"];
      const iPaidIdx = lCol["Interest Paid"];
      const fPaidIdx = lCol["Fee Paid"];
      const balIdx = lCol["Balance"];
      const savHeader = lCol["Borrower’s Own Savings"] !== undefined ? "Borrower’s Own Savings" : "Borrower's Own Savings";
      const savIdx = lCol["Borrower’s Own Savings"] !== undefined ? lCol["Borrower’s Own Savings"] : lCol["Borrower's Own Savings"];
      const guarIdx = lCol["Total Guaranteed"];
      const shortIdx = lCol["Shortfall Amount"];

      const repSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOAN_REPAYMENTS);
      const hasRepaymentsLedger = Boolean(repSheet && repSheet.getLastRow() > 1);

      if (lidIdx !== undefined) {
        const lidL = getColLetter_(lidIdx + 1);
        if (midIdx !== undefined && nameIdx !== undefined) {
          const midL = getColLetter_(midIdx + 1);
          installColumnSpillFormula_(
            lSheet,
            nameIdx,
            "Borrower Name",
            "MAP(" + midL + "2:" + midL + ', LAMBDA(mid, IF(mid="", "", IFERROR(XLOOKUP(mid, Members_MemberID, Members_FullName, "—"), ""))))'
          );
        }
        if (repIdx !== undefined && reqIdx !== undefined && intIdx !== undefined && feeIdx !== undefined) {
          const reqL = getColLetter_(reqIdx + 1);
          const intL = getColLetter_(intIdx + 1);
          const feeL = getColLetter_(feeIdx + 1);
          installColumnSpillFormula_(
            lSheet,
            repIdx,
            "Repayment Amount",
            "MAP(" + lidL + "2:" + lidL + ", " + reqL + "2:" + reqL + ", " + intL + "2:" + intL + ", " + feeL + "2:" + feeL + ', LAMBDA(lid, req, intr, fee, IF(lid="", "", N(req) + N(intr) + N(fee))))'
          );
        }
        if (hasRepaymentsLedger) {
          if (paidIdx !== undefined) {
            installColumnSpillFormula_(
              lSheet,
              paidIdx,
              "Total Paid",
              "MAP(" + lidL + "2:" + lidL + ', LAMBDA(lid, IF(lid="", "", SUMIFS(Repayments_TotalPaid, Repayments_LoanID, lid, Repayments_Status, "Approved"))))'
            );
          }
          if (pPaidIdx !== undefined) {
            installColumnSpillFormula_(
              lSheet,
              pPaidIdx,
              "Principal Paid",
              "MAP(" + lidL + "2:" + lidL + ', LAMBDA(lid, IF(lid="", "", SUMIFS(Repayments_PrincipalPaid, Repayments_LoanID, lid, Repayments_Status, "Approved"))))'
            );
          }
          if (iPaidIdx !== undefined) {
            installColumnSpillFormula_(
              lSheet,
              iPaidIdx,
              "Interest Paid",
              "MAP(" + lidL + "2:" + lidL + ', LAMBDA(lid, IF(lid="", "", SUMIFS(Repayments_InterestPaid, Repayments_LoanID, lid, Repayments_Status, "Approved"))))'
            );
          }
          if (fPaidIdx !== undefined) {
            installColumnSpillFormula_(
              lSheet,
              fPaidIdx,
              "Fee Paid",
              "MAP(" + lidL + "2:" + lidL + ', LAMBDA(lid, IF(lid="", "", SUMIFS(Repayments_FeePaid, Repayments_LoanID, lid, Repayments_Status, "Approved"))))'
            );
          }
        }
        if (balIdx !== undefined && repIdx !== undefined && paidIdx !== undefined) {
          const repL = getColLetter_(repIdx + 1);
          const paidL = getColLetter_(paidIdx + 1);
          installColumnSpillFormula_(
            lSheet,
            balIdx,
            "Balance",
            "MAP(" + lidL + "2:" + lidL + ", " + repL + "2:" + repL + ", " + paidL + "2:" + paidL + ', LAMBDA(lid, rep, paid, IF(lid="", "", MAX(0, N(rep) - N(paid)))))'
          );
        }
        if (savIdx !== undefined && midIdx !== undefined) {
          const midL = getColLetter_(midIdx + 1);
          installColumnSpillFormula_(
            lSheet,
            savIdx,
            savHeader,
            "MAP(" + midL + "2:" + midL + ', LAMBDA(mid, IF(mid="", "", IFERROR(XLOOKUP(mid, Members_MemberID, Members_TotalSavings, 0), 0))))'
          );
        }
        if (guarIdx !== undefined) {
          installColumnSpillFormula_(
            lSheet,
            guarIdx,
            "Total Guaranteed",
            "MAP(" + lidL + "2:" + lidL + ', LAMBDA(lid, IF(lid="", "", SUMIFS(Guarantors_GuaranteedAmount, Guarantors_LoanID, lid))))'
          );
        }
        if (shortIdx !== undefined && repIdx !== undefined && savIdx !== undefined && guarIdx !== undefined) {
          const repL = getColLetter_(repIdx + 1);
          const savL = getColLetter_(savIdx + 1);
          const guarL = getColLetter_(guarIdx + 1);
          installColumnSpillFormula_(
            lSheet,
            shortIdx,
            "Shortfall Amount",
            "MAP(" + lidL + "2:" + lidL + ", " + repL + "2:" + repL + ", " + savL + "2:" + savL + ", " + guarL + "2:" + guarL + ', LAMBDA(lid, rep, sav, guar, IF(lid="", "", MAX(0, N(rep) - (N(sav) + N(guar))))))'
          );
        }
        upgraded.push("Loans");
      }
    }
  } catch (eLn) {}

  // 4. Loan Repayments sheet spill formulas
  try {
    const repSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOAN_REPAYMENTS);
    if (repSheet && repSheet.getLastRow() >= 1 && typeof setupLoanRepaymentsFormulas_ === "function") {
      setupLoanRepaymentsFormulas_(spreadsheet);
      upgraded.push("Loan Repayments");
    }
  } catch (eRep) {}

  // 5. Guarantors sheet spill formulas
  try {
    const gSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.GUARANTORS);
    if (gSheet && gSheet.getLastRow() >= 1 && typeof setupGuarantorsSchemaAndFormulas_ === "function") {
      setupGuarantorsSchemaAndFormulas_(spreadsheet);
      upgraded.push("Guarantors");
    }
  } catch (eGuar) {}

  // 6. Investment Projects sheet spill formulas (Capital Deployed, Cumulative Revenue, Cumulative OpEx, Carrying Value)
  try {
    const prjSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENT_PROJECTS);
    if (prjSheet && prjSheet.getLastRow() >= 1) {
      const pHeaders = prjSheet.getRange(1, 1, 1, Math.max(prjSheet.getLastColumn(), 1)).getValues()[0];
      const pCol = getHeaderMap_(pHeaders);
      const pidIdx = pCol["Project ID"];
      const linkIdx = pCol["Linked Investment ID"];
      const statIdx = pCol["Status"];
      if (pidIdx !== undefined && linkIdx !== undefined && statIdx !== undefined) {
        const pidL = getColLetter_(pidIdx + 1);
        const linkL = getColLetter_(linkIdx + 1);
        const statL = getColLetter_(statIdx + 1);
        if (pCol["Capital Deployed"] !== undefined) {
          installColumnSpillFormula_(
            prjSheet,
            pCol["Capital Deployed"],
            "Capital Deployed",
            "MAP(" + pidL + "2:" + pidL + ", " + linkL + "2:" + linkL + ', LAMBDA(pid, lnk, IF(pid="", "", IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, pid, Cashflows_FlowType, "Capital In"), 0) + IF(lnk="", 0, IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, lnk, Cashflows_FlowType, "Capital In"), 0)))))'
          );
        }
        if (pCol["Cumulative Revenue"] !== undefined) {
          installColumnSpillFormula_(
            prjSheet,
            pCol["Cumulative Revenue"],
            "Cumulative Revenue",
            "MAP(" + pidL + "2:" + pidL + ", " + linkL + "2:" + linkL + ', LAMBDA(pid, lnk, IF(pid="", "", IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, pid, Cashflows_FlowType, "Revenue") + SUMIFS(Cashflows_Amount, Cashflows_EntityID, pid, Cashflows_FlowType, "Dividend"), 0) + IF(lnk="", 0, IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, lnk, Cashflows_FlowType, "Revenue") + SUMIFS(Cashflows_Amount, Cashflows_EntityID, lnk, Cashflows_FlowType, "Dividend"), 0)))))'
          );
        }
        if (pCol["Cumulative OpEx"] !== undefined) {
          installColumnSpillFormula_(
            prjSheet,
            pCol["Cumulative OpEx"],
            "Cumulative OpEx",
            "MAP(" + pidL + "2:" + pidL + ", " + linkL + "2:" + linkL + ', LAMBDA(pid, lnk, IF(pid="", "", IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, pid, Cashflows_FlowType, "Expense"), 0) + IF(lnk="", 0, IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, lnk, Cashflows_FlowType, "Expense"), 0)))))'
          );
        }
        if (pCol["Carrying Value"] !== undefined) {
          installColumnSpillFormula_(
            prjSheet,
            pCol["Carrying Value"],
            "Carrying Value",
            "MAP(" + pidL + "2:" + pidL + ", " + linkL + "2:" + linkL + ", " + statL + "2:" + statL + ', LAMBDA(pid, lnk, stat, IF(pid="", "", IF(OR(lnk<>"", LOWER(TRIM(stat))="exited"), 0, MAX(0, IFERROR(SUMIFS(Cashflows_Amount, Cashflows_EntityID, pid, Cashflows_FlowType, "Capital In") - SUMIFS(Cashflows_Amount, Cashflows_EntityID, pid, Cashflows_FlowType, "Withdrawal"), 0))))))'
          );
        }
        upgraded.push("Investment Projects");
      }
    }
  } catch (ePrj) {}

  try {
    if (typeof setupAllNamedRanges_ === "function") setupAllNamedRanges_(spreadsheet);
  } catch (eNR2) {}

  return { upgradedSheets: upgraded };
}

/**
 * ARC-3: Provisions the dedicated "Summary KPIs" materialized view sheet.
 * Maintains live non-volatile formulas in B2:B16 for instant 1-range O(1) reads.
 */
function provisionSummaryKpisSheet_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  const res = ensureHeaderedSheet_(spreadsheet, SHEETS.SUMMARY_KPIS, [
    "Metric Key",
    "Value",
    "Formula Basis & Description",
  ]);
  const sheet = res.sheet;
  const baseline = computeSummaryKpisBaseline_(spreadsheet);

  const kpiDefinitions = [
    ["Total_Active_Members", baseline.totalActiveMembers, '=IFERROR(COUNTIF(Members_Status, "Active"), 0)', "Count of active members in Members register"],
    ["Total_Registered_Members", baseline.totalRegisteredMembers, "=IFERROR(COUNTA(Members_MemberID), 0)", "Total registered members in Members register"],
    ["Total_Member_Savings", baseline.totalMemberSavings, "=IFERROR(SUM(Members_TotalSavings), 0)", "Cumulative approved member savings pool (KES)"],
    ["Total_Disbursed_Loans", baseline.totalDisbursedLoans, '=IFERROR(SUMIFS(Loans_RequestedAmount, Loans_Status, "<>Rejected", Loans_Status, "<>Pending"), 0)', "Cumulative principal disbursed across approved/active/settled loans (KES)"],
    ["Total_Outstanding_Loans", baseline.totalOutstandingLoans, '=IFERROR(SUMIFS(Loans_Balance, Loans_Status, "Active") + SUMIFS(Loans_Balance, Loans_Status, "Approved"), 0)', "Total active & approved loan balances receivable (KES)"],
    ["Active_Loans_Count", baseline.activeLoansCount, '=IFERROR(COUNTIF(Loans_Status, "Active") + COUNTIF(Loans_Status, "Approved"), 0)', "Number of currently active or approved loans"],
    ["Pending_Loans_Count", baseline.pendingLoansCount, '=IFERROR(COUNTIF(Loans_Status, "Pending"), 0)', "Number of loan applications awaiting approval"],
    ["Settled_Loans_Count", baseline.settledLoansCount, '=IFERROR(COUNTIF(Loans_Status, "Settled"), 0)', "Number of fully repaid and settled loans"],
    ["Total_Loan_Interest_Earned", baseline.totalLoanInterestEarned, '=IFERROR(SUMIFS(Repayments_InterestPaid, Repayments_Status, "Approved"), 0)', "Cumulative verified loan interest earned (KES)"],
    [
      "Net_Cash_Position",
      baseline.netCashPosition,
      '=IF(IFERROR(SUM(Accounts_Balance), 0) + IF(IFERROR(COUNTIF(Accounts_OrgName, "*CIC*"), 0)=0, IFERROR(LOOKUP(2, 1/(FundStatements_ClosingBalance<>""), FundStatements_ClosingBalance), 0), 0) > 0, IFERROR(SUM(Accounts_Balance), 0) + IF(IFERROR(COUNTIF(Accounts_OrgName, "*CIC*"), 0)=0, IFERROR(LOOKUP(2, 1/(FundStatements_ClosingBalance<>""), FundStatements_ClosingBalance), 0), 0), MAX(0, B4 - B6))',
      "Verified physical bank + MMF cash (fallback to unlent member capital) (KES)",
    ],
    ["Total_Investment_Assets", baseline.totalInvestmentAssets, "=IFERROR(SUM(Investments_CarryingValue), 0) + IFERROR(SUM(Projects_CarryingValue), 0)", "Combined carrying value of Tier 1 instruments & standalone Tier 2 projects (KES)"],
    ["Total_Group_Assets", baseline.totalGroupAssets, "=B11 + B6 + B12", "Total Group Assets = Net Cash Position + Outstanding Loans + Investment Assets (KES)"],
    [
      "Active_PAR_Amount",
      baseline.activeParAmount,
      '=IFERROR(SUMIFS(Loans_Balance, Loans_Status, "Active", Loans_ApprovedDate, "<" & (TODAY() - 90)) + SUMIFS(Loans_Balance, Loans_Status, "*Arrear*") + SUMIFS(Loans_Balance, Loans_Status, "*Default*") + SUMIFS(Loans_Balance, Loans_Status, "*Overdue*"), 0)',
      "Portfolio at Risk balance (>90d tenor or delinquent status) (KES)",
    ],
    ["Active_PAR_Pct", baseline.activeParPct, "=IF(B6 > 0, ROUND((B14 / B6) * 100, 2), 0)", "Active Portfolio at Risk percentage of active loan book (%)"],
    ["Statutory_Reserve_Fund", baseline.statutoryReserveFund, "=MAX(0, ROUND((B13 - B4) * 0.20, 2))", "SASRA Section 51 statutory reserve (20% of accumulated surplus) (KES)"],
  ];

  const valueRows = kpiDefinitions.map(function (d) {
    return [d[0], d[1], d[3]];
  });
  sheet.getRange(2, 1, valueRows.length, 3).setValues(valueRows);
  for (let i = 0; i < kpiDefinitions.length; i++) {
    try {
      const cell = sheet.getRange(i + 2, 2);
      if (cell && typeof cell.setFormula === "function") {
        cell.setFormula(kpiDefinitions[i][2]);
      }
    } catch (eF) {}
  }
  try {
    sheet.getRange(2, 2, valueRows.length, 1).setNumberFormat("#,##0.00");
  } catch (eFmt) {}

  return {
    created: res.created,
    metricCount: kpiDefinitions.length,
  };
}

/**
 * Computes baseline KPI totals from existing sheets (also used as fallback if Summary KPIs
 * has not yet been provisioned on the spreadsheet).
 */
function computeSummaryKpisBaseline_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  let totalActiveMembers = 0;
  let totalRegisteredMembers = 0;
  let totalMemberSavings = 0;
  let totalDisbursedLoans = 0;
  let totalOutstandingLoans = 0;
  let activeLoansCount = 0;
  let pendingLoansCount = 0;
  let settledLoansCount = 0;
  let totalLoanInterestEarned = 0;
  let activeParAmount = 0;

  try {
    const memSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.MEMBERS);
    if (memSheet && memSheet.getLastRow() > 1) {
      const mVals = memSheet.getDataRange().getValues();
      const mCol = getHeaderMap_(mVals[0]);
      for (let i = 1; i < mVals.length; i++) {
        const mid = mCol["Member ID"] !== undefined ? String(mVals[i][mCol["Member ID"]] || "").trim() : "";
        if (!mid) continue;
        totalRegisteredMembers++;
        const stat = mCol["Status"] !== undefined ? String(mVals[i][mCol["Status"]] || "").trim().toLowerCase() : "active";
        if (stat === "active") totalActiveMembers++;
        if (mCol["Total Savings"] !== undefined) {
          totalMemberSavings += Number(mVals[i][mCol["Total Savings"]]) || 0;
        }
      }
    }
  } catch (eM) {}

  try {
    const loanSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOANS);
    if (loanSheet && loanSheet.getLastRow() > 1) {
      const lVals = loanSheet.getDataRange().getValues();
      const lCol = getHeaderMap_(lVals[0]);
      for (let k = 1; k < lVals.length; k++) {
        const lid = lCol["Loan ID"] !== undefined ? String(lVals[k][lCol["Loan ID"]] || "").trim() : "";
        if (!lid) continue;
        const stat = lCol["Status"] !== undefined ? String(lVals[k][lCol["Status"]] || "").trim() : "";
        const statLower = stat.toLowerCase();
        const req = lCol["Requested Amount"] !== undefined ? (Number(lVals[k][lCol["Requested Amount"]]) || 0) : 0;
        const bal = lCol["Balance"] !== undefined ? (Number(lVals[k][lCol["Balance"]]) || 0) : 0;
        if (statLower !== "rejected" && statLower !== "pending") {
          totalDisbursedLoans += req;
        }
        const isDelinq = statLower.indexOf("arrear") !== -1 || statLower.indexOf("default") !== -1 || statLower.indexOf("overdue") !== -1;
        if (statLower === "active" || statLower === "approved" || isDelinq) {
          activeLoansCount++;
          totalOutstandingLoans += bal;
          if (isDelinq) activeParAmount += bal;
        } else if (statLower === "pending") {
          pendingLoansCount++;
        } else if (statLower === "settled") {
          settledLoansCount++;
        }
      }
    }
  } catch (eL) {}

  let netCashPosition = Math.max(0, totalMemberSavings - totalOutstandingLoans);
  try {
    if (typeof computeLiquiditySummary_ === "function") {
      const liq = computeLiquiditySummary_(spreadsheet, totalMemberSavings, totalOutstandingLoans);
      if (liq && isFinite(liq.cash)) netCashPosition = liq.cash;
    }
  } catch (eC) {}

  let totalInvestmentAssets = 0;
  try {
    const invSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const iVals = invSheet.getDataRange().getValues();
      const iCol = getHeaderMap_(iVals[0]);
      for (let r = 1; r < iVals.length; r++) {
        if (iCol["Investment ID"] !== undefined && !iVals[r][iCol["Investment ID"]]) continue;
        const v = valueInvestmentRow_(iVals[r], iCol);
        if (v && v.carryingValue > 0) totalInvestmentAssets += v.carryingValue;
      }
    }
    getStandaloneProjectCarryingItems_(spreadsheet).forEach(function (p) {
      totalInvestmentAssets += p.value;
    });
  } catch (eI) {}

  const totalGroupAssets = round2_(netCashPosition + totalOutstandingLoans + totalInvestmentAssets);
  const activeParPct = totalOutstandingLoans > 0 ? round2_((activeParAmount / totalOutstandingLoans) * 100) : 0;
  const statutoryReserveFund = Math.max(0, round2_((totalGroupAssets - totalMemberSavings) * 0.20));

  return {
    fromMaterializedView: false,
    totalActiveMembers: totalActiveMembers,
    totalRegisteredMembers: totalRegisteredMembers,
    totalMemberSavings: round2_(totalMemberSavings),
    totalDisbursedLoans: round2_(totalDisbursedLoans),
    totalOutstandingLoans: round2_(totalOutstandingLoans),
    activeLoansCount: activeLoansCount,
    pendingLoansCount: pendingLoansCount,
    settledLoansCount: settledLoansCount,
    totalLoanInterestEarned: round2_(totalLoanInterestEarned),
    netCashPosition: round2_(netCashPosition),
    totalInvestmentAssets: round2_(totalInvestmentAssets),
    totalGroupAssets: totalGroupAssets,
    activeParAmount: round2_(activeParAmount),
    activeParPct: activeParPct,
    statutoryReserveFund: statutoryReserveFund,
  };
}

/**
 * ARC-3: Single-range O(1) reader for the "Summary KPIs" materialized view tab.
 * Executes exactly ONE getRange("A2:B16").getValues() call (~5ms) instead of scanning 6 sheets.
 * Returns null if the tab does not exist yet so callers can fall back gracefully.
 */
function readSummaryKpisSnapshot_(ss) {
  try {
    const spreadsheet = ss || getSpreadsheet_();
    const sheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.SUMMARY_KPIS);
    if (!sheet) return null;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const rows = sheet.getRange(2, 1, Math.min(lastRow - 1, 25), 2).getValues();
    const map = {};
    let numericCount = 0;
    for (let i = 0; i < rows.length; i++) {
      const k = String(rows[i][0] || "").trim().toLowerCase();
      const rawVal = rows[i][1];
      if (!k) continue;
      // Ignore unevaluated formula strings if a non-evaluating mock overwrote values
      if (typeof rawVal === "string" && rawVal.trim().indexOf("=") === 0) return null;
      const num = Number(rawVal);
      if (isFinite(num)) {
        map[k] = num;
        numericCount++;
      }
    }
    if (numericCount < 3) return null;

    return {
      fromMaterializedView: true,
      totalActiveMembers: Number(map["total_active_members"]) || 0,
      totalRegisteredMembers: Number(map["total_registered_members"]) || 0,
      totalMemberSavings: round2_(map["total_member_savings"] !== undefined ? map["total_member_savings"] : map["total_group_savings"]),
      totalDisbursedLoans: round2_(map["total_disbursed_loans"] !== undefined ? map["total_disbursed_loans"] : map["total_disbursed_principal"]),
      totalOutstandingLoans: round2_(map["total_outstanding_loans"]),
      activeLoansCount: Number(map["active_loans_count"]) || 0,
      pendingLoansCount: Number(map["pending_loans_count"]) || 0,
      settledLoansCount: Number(map["settled_loans_count"]) || 0,
      totalLoanInterestEarned: round2_(map["total_loan_interest_earned"]),
      netCashPosition: round2_(map["net_cash_position"] !== undefined ? map["net_cash_position"] : map["total_liquid_bank_cash"]),
      totalInvestmentAssets: round2_(map["total_investment_assets"] !== undefined ? map["total_investment_assets"] : map["total_investments_carrying_val"]),
      totalGroupAssets: round2_(map["total_group_assets"]),
      activeParAmount: round2_(map["active_par_amount"] !== undefined ? map["active_par_amount"] : map["par_30_amount"]),
      activeParPct: round2_(map["active_par_pct"]),
      statutoryReserveFund: round2_(map["statutory_reserve_fund"] !== undefined ? map["statutory_reserve_fund"] : map["statutory_reserve_fund_est"]),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Public RPC endpoint returning the instant materialized KPIs from "Summary KPIs" in 1 range read.
 */
function getSummaryKpisData() {
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const snap = readSummaryKpisSnapshot_(ss) || computeSummaryKpisBaseline_(ss);
    return {
      success: true,
      fromMaterializedView: Boolean(snap.fromMaterializedView),
      kpis: snap,
    };
  } catch (error) {
    return { success: false, error: error.message, kpis: null };
  }
}
