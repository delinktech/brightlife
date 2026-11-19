/** App release label (shown in sidebar). Bump when you ship meaningful changes. */
const APP_VERSION = "0.0.3";

/** Diagnostic & maintenance endpoint security key */
const ADMIN_SECRET_KEY = "bl_admin_sec_984210";

const SHEETS = Object.freeze({
  MEMBERS: "Members",
  CONTRIBUTIONS: "Contributions",
  LOANS: "Loans",
  LOAN_REPAYMENTS: "Loan Repayments",
  GUARANTORS: "Guarantors",
  INVESTMENTS: "Investments",
  INVESTMENT_PROJECTS: "Investment Projects",
  INVESTMENT_LEDGER: "InvestmentLedger",
  INVESTMENT_CASHFLOWS: "Investment Cashflows",
  ACCOUNTS: "Accounts",
  ROLES: "Roles",
  AUDIT_LOG: "Audit Log",
  CONSTANTS: "Constants",
  FUND_STATEMENTS: "Fund Statements",
  CIC_TRANSACTIONS: "CIC Transactions",
  SUMMARY_KPIS: "Summary KPIs",
});

const TRANSACTION_STATUS = Object.freeze({
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
});

/** Normalized role keys from the Roles sheet */
const ROLE_KEY = Object.freeze({
  ADMIN: "admin",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
  MEMBER: "member",
  NONE: "none",
});

const LOAN_STATUS = Object.freeze({
  ACTIVE: "Active",
  PENDING: "Pending",
  APPROVED: "Approved",
  SETTLED: "Settled",
  REJECTED: "Rejected",
});

const DEPOSIT_CHANNELS = Object.freeze({
  CASH: "Cash",
  EQUITY_BANK: "Equity Bank",
  CIC_MMF: "CIC MMF",
  MANSA_X: "Mansa X",
  REFUND_OFFSET: "Refund / Expense Offset",
});

/**
 * Normalizes deposit channels strictly to the 5 approved channels
 */
function normalizeDepositChannel_(channel) {
  if (!channel) return DEPOSIT_CHANNELS.EQUITY_BANK;
  const c = String(channel).trim();
  const lower = c.toLowerCase();
  if (lower === "m-pesa" || lower === "mpesa" || lower.indexOf("mpesa") !== -1 || lower.indexOf("paybill") !== -1) {
    return DEPOSIT_CHANNELS.EQUITY_BANK;
  }
  const VALID = [
    DEPOSIT_CHANNELS.CASH,
    DEPOSIT_CHANNELS.EQUITY_BANK,
    DEPOSIT_CHANNELS.CIC_MMF,
    DEPOSIT_CHANNELS.MANSA_X,
    DEPOSIT_CHANNELS.REFUND_OFFSET,
  ];
  for (let i = 0; i < VALID.length; i++) {
    if (VALID[i].toLowerCase() === lower) return VALID[i];
  }
  return c;
}

const TRANSACTION_TYPES = Object.freeze({
  MONTHLY_CONTRIBUTION: "Monthly Contribution",
  LOAN_REPAYMENT: "Loan Repayment",
  MEMBERSHIP_FEE: "Membership Fee",
  DIVIDEND_CAPITALIZATION: "Dividend Capitalization",
});

/** 
 * Spreadsheet ID for standalone Apps Script deployments.
 * If your Apps Script is standalone (not created via Extensions > Apps Script inside the sheet),
 * paste your Google Sheet ID here (e.g. "1a2b3c4d5e..."). Leave empty if container-bound.
 */
const SPREADSHEET_ID = "18zbE2MSVciTkdbwjgtiVqASJ9VEO3IEnlrTGZoXbu_0";

function getSpreadsheet_() {
  var lastErr = "";
  if (typeof SPREADSHEET_ID !== "undefined" && SPREADSHEET_ID && String(SPREADSHEET_ID).trim()) {
    try {
      return SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
    } catch (err) {
      lastErr = "openById error: " + err.message;
      console.error(lastErr);
    }
  }
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (err) {
    if (!lastErr) lastErr = "getActiveSpreadsheet error: " + err.message;
    console.error("getActiveSpreadsheet error: " + err.message);
  }
  throw new Error(
    "Could not access spreadsheet (" + (lastErr || "No ID set") + "). Please grant permissions in Apps Script or update Web App Deployment."
  );
}

const SHEET_NAME_ALIASES = Object.freeze({
  "auditlog": ["Audit Log", "AuditLog"],
  "audit log": ["Audit Log", "AuditLog"],
  // ARC-2: legacy ledgers and the unified Cashflows tab have different schemas and are
  // merged explicitly by readUnifiedInvestmentLedgerValues_(); they must never alias each other.
  "investmentledger": ["InvestmentLedger", "Investment Ledger"],
  "investment cashflows": ["Investment Cashflows", "Investment_Cashflows"],
  "investment_cashflows": ["Investment Cashflows", "Investment_Cashflows"],
  "cic transactions": ["CIC Transactions", "CIC_Transactions"],
  "cic_transactions": ["CIC Transactions", "CIC_Transactions"],
  "investments_register": ["Investments", "Investments_Register"],
  "investments": ["Investments", "Investments_Register"],
  "investment_projects": ["Investment Projects", "Investment_Projects"],
  "investment projects": ["Investment Projects", "Investment_Projects"],
  "summary_kpis": ["Summary KPIs", "Summary_KPIs"],
  "summary kpis": ["Summary KPIs", "Summary_KPIs"],
});

function getSheetByNameInsensitive_(ss, targetName) {
  if (!ss || !targetName) return null;
  const target = String(targetName).trim().toLowerCase();
  const sheets = ss.getSheets();
  const byLowerName = {};
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName().trim().toLowerCase();
    if (!byLowerName[name]) byLowerName[name] = sheets[i];
  }

  // Exact match takes precedence
  if (byLowerName[target]) return byLowerName[target];

  // Fallback to configured aliases
  const candidates = SHEET_NAME_ALIASES[target];
  if (candidates && candidates.length) {
    for (let c = 0; c < candidates.length; c++) {
      const candKey = candidates[c].trim().toLowerCase();
      if (byLowerName[candKey]) return byLowerName[candKey];
    }
  }

  return null;
}

/**
 * Idempotently provisions the 4 standardized institutional reference tables
 * (Asset_Classes, Project_Categories, Payment_Channels, Statutory_Thresholds)
 * in the Constants sheet, starting past Column E so existing Status validation
 * values in Constants!$E$2:$E are strictly preserved.
 */
function provisionConstantsReferenceTables_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  let sheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.CONSTANTS);
  let createdSheet = false;
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEETS.CONSTANTS);
    createdSheet = true;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const existingHeaders =
    lastRow >= 1 && lastCol >= 1
      ? getHeaderMap_(sheet.getRange(1, 1, 1, lastCol).getValues()[0])
      : {};

  const tables = [
    {
      key: "asset_classes",
      columns: [
        [
          "Asset_Classes",
          "Operating Cash",
          "Money Market Fund",
          "Listed Equities / Shares",
          "Treasury Bills / Bonds",
          "Fixed Deposit",
          "Real Estate / Land",
          "Agribusiness",
          "Equity / Venture",
        ],
      ],
    },
    {
      key: "project_categories",
      columns: [
        [
          "Project_Categories",
          "Real Estate & Land",
          "Agribusiness",
          "Financial Instruments",
          "Infrastructure & Equipment",
          "Working Capital",
        ],
      ],
    },
    {
      key: "payment_channels",
      columns: [
        [
          "Payment_Channels",
          DEPOSIT_CHANNELS.CASH,
          DEPOSIT_CHANNELS.EQUITY_BANK,
          DEPOSIT_CHANNELS.CIC_MMF,
          DEPOSIT_CHANNELS.MANSA_X,
          DEPOSIT_CHANNELS.REFUND_OFFSET,
        ],
      ],
    },
    {
      key: "statutory_thresholds",
      columns: [
        [
          "Statutory_Thresholds",
          "SASRA_MAX_LOAN_EXPOSURE_PCT",
          "STATUTORY_RESERVE_TRANSFER_PCT",
          "PROVISION_CURRENT_PCT",
          "PROVISION_WATCH_1_30_PCT",
          "PROVISION_SUBSTANDARD_31_60_PCT",
          "PROVISION_DOUBTFUL_61_90_PCT",
          "PROVISION_LOSS_91_PLUS_PCT",
          "LIQUIDITY_MIN_PCT",
          "LIQUIDITY_OPTIMAL_PCT",
        ],
        ["Threshold_Value", 85, 20, 1, 5, 25, 50, 100, 15, 30],
      ],
    },
  ];

  // Never overwrite Columns A-E (Column 5 / E is reserved for Status data validation).
  let nextCol = Math.max(6, lastCol + 1);
  const addedTables = [];
  const skippedTables = [];

  for (let t = 0; t < tables.length; t++) {
    const tbl = tables[t];
    if (existingHeaders[tbl.key] !== undefined) {
      skippedTables.push(tbl.columns[0][0]);
      continue;
    }

    const rowCount = tbl.columns[0].length;
    const colCount = tbl.columns.length;
    const grid = [];
    for (let r = 0; r < rowCount; r++) {
      const rowArr = [];
      for (let c = 0; c < colCount; c++) {
        rowArr.push(tbl.columns[c][r]);
      }
      grid.push(rowArr);
    }

    sheet.getRange(1, nextCol, rowCount, colCount).setValues(grid);
    nextCol += colCount;
    addedTables.push(tbl.columns[0][0]);
  }

  return {
    success: true,
    createdSheet: createdSheet,
    addedTables: addedTables,
    skippedTables: skippedTables,
  };
}

function getRequiredSheet_(sheetName) {
  const ss = getSpreadsheet_();
  const sheet = getSheetByNameInsensitive_(ss, sheetName);
  if (!sheet) {
    throw new Error('Missing required sheet: "' + sheetName + '"');
  }
  return sheet;
}

function getHeaderMap_(headers) {
  const map = {};
  if (!headers || !Array.isArray(headers)) return map;
  headers.forEach(function (name, index) {
    const raw = String(name || "");
    const trimmed = raw.trim();
    map[raw] = index;
    map[trimmed] = index;
    map[trimmed.toLowerCase()] = index;
  });
  return map;
}

function requireHeaders_(headerMap, requiredHeaders, sheetName) {
  const missing = requiredHeaders.filter(function (name) {
    return headerMap[name] === undefined;
  });
  if (missing.length) {
    throw new Error(
      'Missing headers in "' + sheetName + '": ' + missing.join(", ")
    );
  }
}

function formatDateValue_(value, tz) {
  return value instanceof Date ? Utilities.formatDate(value, tz, "dd MMM yyyy") : "";
}

function parseDateInput_(val, tz) {
  if (!val) return "";
  if (val instanceof Date) return val;
  const s = String(val).trim();
  if (!s) return "";
  // Check if already in standard ISO or Date format
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return s;
}

function formatCurrency_(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

/**
 * ARC-3: Returns true when Row 1 of the given 0-based column index carries a header-anchored
 * spill formula (e.g. ={"Member Name"; MAP(...)}). Row-level writers must leave cells in
 * rows 2..N of that column empty ("") so they never obstruct the array spill with #REF!.
 */
function hasHeaderSpillFormula_(sheet, colIndexZeroBased) {
  if (!sheet || colIndexZeroBased === undefined || colIndexZeroBased === null || colIndexZeroBased < 0) {
    return false;
  }
  try {
    const cell = sheet.getRange(1, colIndexZeroBased + 1);
    if (!cell || typeof cell.getFormula !== "function") return false;
    const f = String(cell.getFormula() || "").trim();
    return f.indexOf("=") === 0 && (f.indexOf("MAP(") !== -1 || f.indexOf("ARRAYFORMULA(") !== -1 || f.indexOf("{") !== -1);
  } catch (e) {
    return false;
  }
}

/**
 * ARC-3: Installs a single Row 1 header-anchored spill formula ={"Header"; MAP(...)} on a column,
 * purging any legacy per-row formulas or blocking values in rows 2..lastRow first.
 */
function installColumnSpillFormula_(sheet, colIndexZeroBased, headerTitle, mapExpr) {
  if (!sheet || colIndexZeroBased === undefined || colIndexZeroBased === null || colIndexZeroBased < 0) {
    return null;
  }
  const col1 = colIndexZeroBased + 1;
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const clearCount = Math.max(lastRow - 1, 1);
  const dataRange = sheet.getRange(2, col1, clearCount, 1);
  if (dataRange && typeof dataRange.clearDataValidations === "function") {
    try { dataRange.clearDataValidations(); } catch (e) {}
  }
  if (dataRange && typeof dataRange.clearContent === "function") {
    try { dataRange.clearContent(); } catch (e) {}
  }
  const safeHeader = String(headerTitle || "").replace(/"/g, '""');
  const spillFormula = '={"' + safeHeader + '"; ' + mapExpr + "}";
  const headerCell = sheet.getRange(1, col1);
  headerCell.setValue(headerTitle);
  if (headerCell && typeof headerCell.setFormula === "function") {
    headerCell.setFormula(spillFormula);
  }
  return spillFormula;
}

/**
 * ARC-3: In-memory lookup of a member's full name by Member ID from SHEETS.MEMBERS.
 * Used for audit logs, receipts, and non-spill fallback without injecting sheet formulas.
 */
function resolveMemberFullNameById_(ss, memberId, fallbackName) {
  const cleanFallback = String(fallbackName || "").trim();
  if (cleanFallback) return cleanFallback;
  const targetId = String(memberId || "").trim().toLowerCase();
  if (!targetId) return "";
  try {
    const spreadsheet = ss || getSpreadsheet_();
    const memSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.MEMBERS);
    if (!memSheet || memSheet.getLastRow() <= 1) return "";
    const vals = memSheet.getDataRange().getValues();
    const col = getHeaderMap_(vals[0]);
    if (col["Member ID"] === undefined) return "";
    for (let i = 1; i < vals.length; i++) {
      const id = String(vals[i][col["Member ID"]] || "").trim().toLowerCase();
      if (id !== targetId) continue;
      if (col["Full Name"] !== undefined && String(vals[i][col["Full Name"]] || "").trim()) {
        return String(vals[i][col["Full Name"]]).trim();
      }
      const first = col["First Name"] !== undefined ? String(vals[i][col["First Name"]] || "").trim() : "";
      const middle = col["Middle Name"] !== undefined ? String(vals[i][col["Middle Name"]] || "").trim() : "";
      const last = col["Last Name"] !== undefined ? String(vals[i][col["Last Name"]] || "").trim() : "";
      return (first + " " + middle + " " + last).replace(/\s+/g, " ").trim();
    }
  } catch (e) {}
  return "";
}
