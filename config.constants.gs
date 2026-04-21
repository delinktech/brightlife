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

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
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
  headers.forEach(function (name, index) {
    map[name] = index;
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
