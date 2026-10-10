/** App release label (shown in sidebar). Bump when you ship meaningful changes. */
const APP_VERSION = "0.0.2";

const SHEETS = Object.freeze({
  MEMBERS: "Members",
  CONTRIBUTIONS: "Contributions",
  LOANS: "Loans",
  GUARANTORS: "Guarantors",
  INVESTMENTS: "Investments",
  INVESTMENT_LEDGER: "InvestmentLedger",
  ACCOUNTS: "Accounts",
  /** Columns: Email, Name, Role, Active */
  ROLES: "Roles",
  AUDIT_LOG: "AuditLog",
});

/** Normalized role keys from the Roles sheet */
const ROLE_KEY = Object.freeze({
  ADMIN: "admin",
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

/** 
 * Spreadsheet ID for standalone Apps Script deployments.
 * If your Apps Script is standalone (not created via Extensions > Apps Script inside the sheet),
 * paste your Google Sheet ID here (e.g. "1a2b3c4d5e..."). Leave empty if container-bound.
 */
const SPREADSHEET_ID = "";

function getSpreadsheet_() {
  if (typeof SPREADSHEET_ID !== "undefined" && SPREADSHEET_ID && String(SPREADSHEET_ID).trim()) {
    try {
      return SpreadsheetApp.openById(String(SPREADSHEET_ID).trim());
    } catch (err) {
      console.error("Failed to open spreadsheet by SPREADSHEET_ID: " + err.message);
    }
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error(
    "No active spreadsheet found. If this is a standalone Apps Script project, please update config constants.gs and set SPREADSHEET_ID to your Google Sheet's ID."
  );
}

function getRequiredSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
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

function formatCurrency_(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}
