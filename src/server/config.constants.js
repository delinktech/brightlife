/** App release label (shown in sidebar). Bump when you ship meaningful changes. */
const APP_VERSION = "1.0.0";

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
  CIC_STATEMENT: "CIC Statement",
  EQUITY_STATEMENT: "Equity Statement",
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
  CHAIRPERSON: "chairperson",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
  MEMBER: "member",
  NONE: "none",
});

/** Granular role permissions map (GOV-1 Dual-Officer multi-sig loan approval) */
const ROLE_PERMISSIONS = Object.freeze({
  [ROLE_KEY.ADMIN]: Object.freeze({
    membersWrite: true,
    contributionsWrite: true,
    loanPayment: true,
    loanRequest: true,
    loanReview: true,
    loanDisburse: true,
    accountsWrite: true,
    investmentsWrite: true,
    isAdmin: true,
    isMemberOnly: false,
  }),
  [ROLE_KEY.CHAIRPERSON]: Object.freeze({
    membersWrite: false,
    contributionsWrite: false,
    loanPayment: false,
    loanRequest: true,
    loanReview: true,
    loanDisburse: false,
    accountsWrite: false,
    investmentsWrite: false,
    isAdmin: false,
    isMemberOnly: false,
  }),
  [ROLE_KEY.TREASURER]: Object.freeze({
    membersWrite: false,
    contributionsWrite: true,
    loanPayment: true,
    loanRequest: false,
    loanReview: false,
    loanDisburse: true,
    accountsWrite: true,
    investmentsWrite: true,
    isAdmin: false,
    isMemberOnly: false,
  }),
  [ROLE_KEY.SECRETARY]: Object.freeze({
    membersWrite: true,
    contributionsWrite: false,
    loanPayment: false,
    loanRequest: true,
    loanReview: false,
    loanDisburse: false,
    accountsWrite: false,
    investmentsWrite: false,
    isAdmin: false,
    isMemberOnly: false,
  }),
  [ROLE_KEY.MEMBER]: Object.freeze({
    membersWrite: false,
    contributionsWrite: false,
    loanPayment: false,
    loanRequest: true,
    loanReview: false,
    loanDisburse: false,
    accountsWrite: false,
    investmentsWrite: false,
    isAdmin: false,
    isMemberOnly: true,
  }),
  [ROLE_KEY.NONE]: Object.freeze({
    membersWrite: false,
    contributionsWrite: false,
    loanPayment: false,
    loanRequest: false,
    loanReview: false,
    loanDisburse: false,
    accountsWrite: false,
    investmentsWrite: false,
    isAdmin: false,
    isMemberOnly: true,
  }),
});

const LOAN_STATUS = Object.freeze({
  ACTIVE: "Active",
  PENDING: "Pending",
  PENDING_REVIEW: "Pending Review",
  REVIEWED: "Reviewed",
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

const EQUITY_BANK_ACCOUNT_NUMBER = "0020164001424";

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

function openSpreadsheetDirect_() {
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

function getSpreadsheet_() {
  if (typeof ACTIVE_REQUEST_SHEET_CONTEXT_ !== "undefined" && ACTIVE_REQUEST_SHEET_CONTEXT_) {
    return ACTIVE_REQUEST_SHEET_CONTEXT_.getSpreadsheet();
  }
  return openSpreadsheetDirect_();
}

const SHEET_NAME_ALIASES = Object.freeze({
  "auditlog": ["Audit Log", "AuditLog"],
  "audit log": ["Audit Log", "AuditLog"],
  // ARC-2: legacy ledgers and the unified Cashflows tab have different schemas and are
  // merged explicitly by readUnifiedInvestmentLedgerValues_(); they must never alias each other.
  "investmentledger": ["InvestmentLedger", "Investment Ledger"],
  "investment cashflows": ["Investment Cashflows", "Investment_Cashflows"],
  "investment_cashflows": ["Investment Cashflows", "Investment_Cashflows"],
  "cic statement": ["CIC Statement", "Fund Statements", "Fund_Statements", "CIC Transactions", "CIC_Transactions"],
  "cic_statement": ["CIC Statement", "Fund Statements", "Fund_Statements", "CIC Transactions", "CIC_Transactions"],
  "fund statements": ["CIC Statement", "Fund Statements", "Fund_Statements"],
  "fund_statements": ["CIC Statement", "Fund Statements", "Fund_Statements"],
  "cic transactions": ["CIC Statement", "CIC Transactions", "CIC_Transactions"],
  "cic_transactions": ["CIC Statement", "CIC Transactions", "CIC_Transactions"],
  "equity statement": ["Equity Statement", "Equity_Statement", "Equity Bank Statement"],
  "equity_statement": ["Equity Statement", "Equity_Statement", "Equity Bank Statement"],
  "investments_register": ["Investments", "Investments_Register"],
  "investments": ["Investments", "Investments_Register"],
  "investment_projects": ["Investment Projects", "Investment_Projects"],
  "investment projects": ["Investment Projects", "Investment_Projects"],
  "summary_kpis": ["Summary KPIs", "Summary_KPIs"],
  "summary kpis": ["Summary KPIs", "Summary_KPIs"],
});

function getSheetByNameInsensitive_(ss, targetName) {
  if (!ss && typeof ACTIVE_REQUEST_SHEET_CONTEXT_ !== "undefined" && ACTIVE_REQUEST_SHEET_CONTEXT_) {
    return ACTIVE_REQUEST_SHEET_CONTEXT_.getSheet(targetName);
  }
  if (!ss || !targetName) return null;
  if (typeof ACTIVE_REQUEST_SHEET_CONTEXT_ !== "undefined" && ACTIVE_REQUEST_SHEET_CONTEXT_) {
    return ACTIVE_REQUEST_SHEET_CONTEXT_.getSheet(targetName);
  }
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
 * Idempotently unifies and standardizes the CIC Statement sheet name.
 * Checks if a sheet named 'Fund Statements' or 'CIC Transactions' exists,
 * and renames it to 'CIC Statement' (or deletes duplicate 'CIC Transactions'
 * if 'CIC Statement' already exists).
 * Returns the standardized 'CIC Statement' Sheet object (or null if none exist yet).
 */
function ensureCicStatementTabRenamed_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  if (!spreadsheet) return null;

  let cicStatementSheet = spreadsheet.getSheetByName(SHEETS.CIC_STATEMENT);
  const fundSheet = spreadsheet.getSheetByName("Fund Statements") || spreadsheet.getSheetByName("Fund_Statements");
  const cicTxSheet = spreadsheet.getSheetByName("CIC Transactions") || spreadsheet.getSheetByName("CIC_Transactions");

  if (cicStatementSheet) {
    if (cicTxSheet && cicTxSheet.getName() !== SHEETS.CIC_STATEMENT) {
      try {
        if (typeof spreadsheet.deleteSheet === "function") {
          spreadsheet.deleteSheet(cicTxSheet);
        }
      } catch (e) {
        console.warn("Could not delete legacy CIC Transactions sheet: " + e.message);
      }
    }
    if (fundSheet && fundSheet.getName() !== SHEETS.CIC_STATEMENT) {
      try {
        if (typeof spreadsheet.deleteSheet === "function") {
          spreadsheet.deleteSheet(fundSheet);
        }
      } catch (e) {
        console.warn("Could not delete legacy Fund Statements sheet: " + e.message);
      }
    }
    return cicStatementSheet;
  }

  if (fundSheet) {
    fundSheet.setName(SHEETS.CIC_STATEMENT);
    cicStatementSheet = fundSheet;
    if (cicTxSheet && cicTxSheet !== fundSheet) {
      try {
        if (typeof spreadsheet.deleteSheet === "function") {
          spreadsheet.deleteSheet(cicTxSheet);
        }
      } catch (e) {
        console.warn("Could not delete legacy CIC Transactions sheet: " + e.message);
      }
    }
    return cicStatementSheet;
  }

  if (cicTxSheet) {
    cicTxSheet.setName(SHEETS.CIC_STATEMENT);
    return cicTxSheet;
  }

  return null;
}

/**
 * Idempotently provisions the standardized institutional reference tables
 * (Asset Classes, Project Categories, Deposit Channel, Statutory Thresholds + Threshold Value)
 * in the Constants sheet using Title Case with Single Spaces (zero underscores),
 * cleaning up any legacy underscore headers or duplicate Payment_Channels columns while
 * preserving existing Status validation values in Constants!$E$2:$E.
 */
function provisionConstantsReferenceTables_(ss) {
  const spreadsheet = ss || getSpreadsheet_();
  let sheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.CONSTANTS);
  let createdSheet = false;
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEETS.CONSTANTS);
    createdSheet = true;
  }

  const headerRenames = {
    asset_classes: "Asset Classes",
    project_categories: "Project Categories",
    statutory_thresholds: "Statutory Thresholds",
    threshold_value: "Threshold Value",
  };

  const thresholdKeyRenames = {
    SASRA_MAX_LOAN_EXPOSURE_PCT: "SASRA Max Loan Exposure Pct",
    STATUTORY_RESERVE_TRANSFER_PCT: "Statutory Reserve Transfer Pct",
    PROVISION_CURRENT_PCT: "Provision Current Pct",
    PROVISION_WATCH_1_30_PCT: "Provision Watch 1 30 Pct",
    PROVISION_SUBSTANDARD_31_60_PCT: "Provision Substandard 31 60 Pct",
    PROVISION_DOUBTFUL_61_90_PCT: "Provision Doubtful 61 90 Pct",
    PROVISION_LOSS_91_PLUS_PCT: "Provision Loss 91 Plus Pct",
    LIQUIDITY_MIN_PCT: "Liquidity Min Pct",
    LIQUIDITY_OPTIMAL_PCT: "Liquidity Optimal Pct",
  };

  let lastRow = sheet.getLastRow();
  let lastCol = sheet.getLastColumn();
  const initialHeaders =
    lastRow >= 1 && lastCol >= 1
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];
  const initialMap = getHeaderMap_(initialHeaders);
  const hasCanonicalChannelCol =
    initialMap["deposit channel"] !== undefined ||
    initialMap["payment modes"] !== undefined;

  let seenPaymentChannelsCol = false;
  for (let c = initialHeaders.length - 1; c >= 0; c--) {
    const rawHeader = String(initialHeaders[c] || "").trim();
    const lowerHeader = rawHeader.toLowerCase();

    if (lowerHeader === "payment_channels" || lowerHeader === "payment channels") {
      if (hasCanonicalChannelCol || seenPaymentChannelsCol) {
        if (typeof sheet.deleteColumn === "function") {
          sheet.deleteColumn(c + 1);
        } else {
          sheet.getRange(1, c + 1, Math.max(sheet.getLastRow(), 1), 1).clearContent();
        }
        continue;
      }
      seenPaymentChannelsCol = true;
      sheet.getRange(1, c + 1).setValue("Deposit Channel");
      continue;
    }

    if (headerRenames[lowerHeader]) {
      const canonicalHeader = headerRenames[lowerHeader];
      if (rawHeader !== canonicalHeader) {
        sheet.getRange(1, c + 1).setValue(canonicalHeader);
      }
    }

    if (lowerHeader === "statutory_thresholds" || lowerHeader === "statutory thresholds") {
      const rCount = Math.max(sheet.getLastRow() - 1, 0);
      if (rCount > 0) {
        const colRange = sheet.getRange(2, c + 1, rCount, 1);
        const colVals = colRange.getValues();
        let changed = false;
        for (let r = 0; r < colVals.length; r++) {
          const cellKey = String(colVals[r][0] || "").trim();
          if (thresholdKeyRenames[cellKey]) {
            colVals[r][0] = thresholdKeyRenames[cellKey];
            changed = true;
          }
        }
        if (changed) colRange.setValues(colVals);
      }
    }
  }

  lastRow = sheet.getLastRow();
  lastCol = sheet.getLastColumn();
  const existingHeaders =
    lastRow >= 1 && lastCol >= 1
      ? getHeaderMap_(sheet.getRange(1, 1, 1, lastCol).getValues()[0])
      : {};

  const tables = [
    {
      keys: ["asset classes", "asset_classes"],
      columns: [
        [
          "Asset Classes",
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
      keys: ["project categories", "project_categories"],
      columns: [
        [
          "Project Categories",
          "Real Estate & Land",
          "Agribusiness",
          "Financial Instruments",
          "Infrastructure & Equipment",
          "Working Capital",
        ],
      ],
    },
    {
      keys: ["deposit channel", "payment modes", "payment channels", "payment_channels"],
      columns: [
        [
          "Deposit Channel",
          DEPOSIT_CHANNELS.CASH,
          DEPOSIT_CHANNELS.EQUITY_BANK,
          DEPOSIT_CHANNELS.CIC_MMF,
          DEPOSIT_CHANNELS.MANSA_X,
          DEPOSIT_CHANNELS.REFUND_OFFSET,
        ],
      ],
    },
    {
      keys: ["statutory thresholds", "statutory_thresholds"],
      columns: [
        [
          "Statutory Thresholds",
          "SASRA Max Loan Exposure Pct",
          "Statutory Reserve Transfer Pct",
          "Provision Current Pct",
          "Provision Watch 1 30 Pct",
          "Provision Substandard 31 60 Pct",
          "Provision Doubtful 61 90 Pct",
          "Provision Loss 91 Plus Pct",
          "Liquidity Min Pct",
          "Liquidity Optimal Pct",
        ],
        ["Threshold Value", 85, 20, 1, 5, 25, 50, 100, 15, 30],
      ],
    },
    {
      keys: ["loan policy parameter"],
      columns: [
        [
          "Loan Policy Parameter",
          "Borrower Savings Multiplier",
          "Loan Interest Rate Pct",
          "Minimum Guarantor Count",
        ],
        ["Policy Value", 3, 10, 2],
      ],
    },
    {
      keys: ["tenor tier max amount"],
      columns: [
        ["Tenor Tier Max Amount", 50000, 100000, 999999999],
        ["Tenor Tier Max Months", 3, 6, 12],
      ],
    },
    {
      keys: ["notification setting parameter", "notification settings parameter", "statement setting parameter"],
      columns: [
        [
          "Notification Setting Parameter",
          "Auto Statement Day",
          "Auto Monthly Statements",
          "Auto Email Receipts",
          "Notification Bcc Email",
        ],
        ["Setting Value", 1, "FALSE", "TRUE", ""],
      ],
    },
  ];

  // Place immediately adjacent to the last occupied column (or Col 6 if empty sheet so Col E is reserved for Status).
  let nextCol = lastCol >= 1 ? lastCol + 1 : 6;
  const addedTables = [];
  const skippedTables = [];

  for (let t = 0; t < tables.length; t++) {
    const tbl = tables[t];
    const alreadyExists = tbl.keys.some(function (k) {
      return existingHeaders[k] !== undefined;
    });
    if (alreadyExists) {
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
 * ARC-3: Returns true when Row 2 (or legacy Row 1) of the given 0-based column index carries a
 * spill formula (e.g. =MAP(...) in Row 2, or legacy ={"Header"; MAP(...)} in Row 1). Row-level
 * writers must leave cells in rows 2..N of that column empty ("") so they never obstruct the array spill with #REF!.
 */
function hasHeaderSpillFormula_(sheet, colIndexZeroBased) {
  if (!sheet || colIndexZeroBased === undefined || colIndexZeroBased === null || colIndexZeroBased < 0) {
    return false;
  }
  const col1 = colIndexZeroBased + 1;
  const rowsToCheck = [2, 1];
  for (let i = 0; i < rowsToCheck.length; i++) {
    try {
      const cell = sheet.getRange(rowsToCheck[i], col1);
      if (!cell || typeof cell.getFormula !== "function") continue;
      const f = String(cell.getFormula() || "").trim();
      if (f.indexOf("=") === 0 && (f.indexOf("MAP(") !== -1 || f.indexOf("ARRAYFORMULA(") !== -1 || f.indexOf("{") !== -1)) {
        return true;
      }
    } catch (e) {}
  }
  return false;
}

/**
 * ARC-3: Installs a single Row 2 anchored spill formula =MAP(...) on a column while keeping
 * Row 1 strictly as plain text (compatible with Google Sheets Native Tables), purging any
 * legacy per-row formulas or blocking values in rows 2..lastRow first.
 */
function installColumnSpillFormula_(sheet, colIndexZeroBased, headerTitle, mapExpr) {
  if (!sheet || colIndexZeroBased === undefined || colIndexZeroBased === null || colIndexZeroBased < 0) {
    return null;
  }
  const col1 = colIndexZeroBased + 1;
  try {
    const headerCell = sheet.getRange(1, col1);
    const curVal = headerCell && typeof headerCell.getValue === "function" ? String(headerCell.getValue() || "") : "";
    if (curVal !== String(headerTitle || "")) {
      headerCell.setValue(headerTitle);
      SpreadsheetApp.flush();
    }
  } catch (eHeader) {}

  const lastRow = Math.max(sheet.getLastRow(), 2);
  const clearCount = Math.max(lastRow - 1, 1);
  const dataRange = sheet.getRange(2, col1, clearCount, 1);
  if (dataRange && typeof dataRange.clearContent === "function") {
    try {
      dataRange.clearContent();
      SpreadsheetApp.flush();
    } catch (eClear) {}
  }

  const spillFormula = "=" + String(mapExpr || "").replace(/^=+/, "").trim();
  try {
    const anchorCell = sheet.getRange(2, col1);
    if (anchorCell && typeof anchorCell.setFormula === "function") {
      anchorCell.setFormula(spillFormula);
      SpreadsheetApp.flush();
    }
  } catch (e) {
    console.warn("Could not install Row 2 spill formula on " + sheet.getName() + " col " + col1 + ": " + e.message);
    return null;
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
