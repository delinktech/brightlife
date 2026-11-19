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
 * One-shot institutional workbook setup for ARC-1 + ARC-2.
 * Never deletes, renames, reorders or overwrites existing data.
 */
function runInstitutionalWorkbookSetup_() {
  const ss = getSpreadsheet_();
  const report = { constants: null, investments: null, projects: null, cashflows: null, prepopulated: [] };

  report.constants = provisionConstantsReferenceTables_(ss);
  const refRanges = getConstantsReferenceRanges_(ss);

  report.investments = provisionInvestmentsRegister_(ss, refRanges);
  report.projects = provisionInvestmentProjects_(ss, refRanges);
  report.cashflows = provisionInvestmentCashflows_(ss, refRanges);
  report.prepopulated = prepopulateInvestmentEngine_(ss);

  SpreadsheetApp.flush();
  try { clearDashboardCache_(); } catch (e) {}
  appendAuditLog_(
    "workbook.setup",
    "Workbook",
    "",
    "ARC-2 institutional investment engine provisioned",
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
    asset_classes: "assetClasses",
    project_categories: "projectCategories",
    payment_channels: "paymentChannels",
  };
  for (let c = 0; c < headers.length; c++) {
    const key = String(headers[c] || "").trim().toLowerCase();
    if (wanted[key]) {
      out[wanted[key]] = sheet.getRange(2, c + 1, Math.max(sheet.getMaxRows() - 1, 1), 1);
    }
  }
  return out;
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
  return sheet.getRange(2, idx + 1, Math.max(sheet.getMaxRows() - 1, 1), 1);
}

function applyListValidation_(range, values) {
  if (!range) return;
  range.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(true).build()
  );
}

function applyRangeValidation_(range, sourceRange) {
  if (!range || !sourceRange) return;
  range.setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(sourceRange, true).setAllowInvalid(true).build()
  );
}

function applyNumberFormat_(sheet, headers, fmt) {
  headers.forEach(function (h) {
    const r = columnRange_(sheet, h);
    if (r) r.setNumberFormat(fmt);
  });
}

function provisionInvestmentsRegister_(ss, refRanges) {
  const res = ensureHeaderedSheet_(ss, SHEETS.INVESTMENTS, INVESTMENT_ENGINE.TIER1_APPENDED_HEADERS);
  const sheet = res.sheet;
  applyRangeValidation_(columnRange_(sheet, "Asset Class"), refRanges.assetClasses);
  applyNumberFormat_(sheet, ["Units Held"], "#,##0.####");
  applyNumberFormat_(sheet, ["Unit Cost", "Current Price"], "#,##0.00");
  applyNumberFormat_(sheet, ["Last Valued"], "dd mmm yyyy");
  return { created: res.created, addedHeaders: res.addedHeaders };
}

function provisionInvestmentProjects_(ss, refRanges) {
  const res = ensureHeaderedSheet_(ss, SHEETS.INVESTMENT_PROJECTS, INVESTMENT_ENGINE.PROJECT_HEADERS);
  const sheet = res.sheet;
  applyRangeValidation_(columnRange_(sheet, "Category"), refRanges.projectCategories);
  applyListValidation_(columnRange_(sheet, "Status"), INVESTMENT_ENGINE.PROJECT_STATUSES);
  const inv = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENTS);
  if (inv) applyRangeValidation_(columnRange_(sheet, "Linked Investment ID"), inv.getRange("A2:A"));
  applyNumberFormat_(sheet, ["Approved Budget"], "#,##0.00");
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
    const pid = nextSequentialId_(prj, "Project ID", "PRJ-");
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
  let max = 0;
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
  return prefix + String(max + 1).padStart(3, "0");
}

function appendRowByHeaders_(sheet, rowObj) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const row = headers.map(function (h) {
    const key = String(h || "").trim();
    return rowObj[key] !== undefined ? rowObj[key] : "";
  });
  const target = sheet.getLastRow() + 1;
  sheet.getRange(target, 1, 1, row.length).setValues([row]);
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
    const lv = legacy.getDataRange().getValues();
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
    const cv = cf.getDataRange().getValues();
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
  const pv = prj.getDataRange().getValues();
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
      const id = nextSequentialId_(sheet, "Investment ID", "INV-");
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
      const id = nextSequentialId_(sheet, "Project ID", "PRJ-");
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
    const exists = regIdx !== undefined && regVals.slice(1).some(function (r) { return String(r[regIdx] || "").trim() === entityId; });
    if (!exists) return { success: false, error: entityType + " " + entityId + " was not found in " + registry + "." };

    return withInvestmentLock_(function () {
      const sheet = getRequiredSheet_(SHEETS.INVESTMENT_CASHFLOWS);
      const txId = "ICF-" + Utilities.formatDate(date, tz, "yyyyMMdd") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
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
