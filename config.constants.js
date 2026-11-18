/** App release label (shown in sidebar). Bump when you ship meaningful changes. */
const APP_VERSION = "0.0.2";

const SHEETS = Object.freeze({
  MEMBERS: "Members",
  CONTRIBUTIONS: "Contributions",
  LOANS: "Loans",
  LOAN_REPAYMENTS: "Loan Repayments",
  GUARANTORS: "Guarantors",
  INVESTMENTS: "Investments",
  INVESTMENT_LEDGER: "InvestmentLedger",
  ACCOUNTS: "Accounts",
  ROLES: "Roles",
  AUDIT_LOG: "AuditLog",
  CONSTANTS: "Constants",
  FUND_STATEMENTS: "Fund Statements",
  CIC_TRANSACTIONS: "CIC Transactions",
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

function getSheetByNameInsensitive_(ss, targetName) {
  if (!ss || !targetName) return null;
  const target = String(targetName).trim().toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName().trim().toLowerCase();
    if (name === target) return sheets[i];
  }
  return null;
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
