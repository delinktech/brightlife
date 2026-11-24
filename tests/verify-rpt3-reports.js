/**
 * Verification test for Task RPT-3: Statement of Changes in Equity & Direct Cash Flow Statement
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("=== VERIFYING TASK RPT-3: EQUITY STATEMENT & DIRECT CASH FLOW STATEMENT ===");

// 1. Check syntax of all relevant server files
const filesToVerify = [
  "group-dashboard/src/server/config.constants.js",
  "group-dashboard/src/server/dashboard.service.js"
];

filesToVerify.forEach(relPath => {
  console.log(`Checking syntax: ${relPath}`);
  const code = fs.readFileSync(relPath, "utf8");
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: relPath });
  }, `Syntax error in ${relPath}`);
  console.log(`  ✓ Syntax OK: ${relPath}`);
});

// Setup mock Apps Script context to execute functions
const context = {
  console: console,
  Date: Date,
  Math: Math,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  RegExp: RegExp,
  JSON: JSON,
  isFinite: isFinite,
  isNaN: isNaN,
  Utilities: {
    formatDate: (date, tz, fmt) => {
      if (!date) return "";
      const d = date instanceof Date ? date : new Date(date);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const day = String(d.getDate()).padStart(2, "0");
      const mmm = months[d.getMonth()];
      const yyyy = d.getFullYear();
      if (fmt.includes("HH:mm:ss")) {
        return `${day} ${mmm} ${yyyy} 12:00:00 EAT`;
      }
      return `${day} ${mmm} ${yyyy}`;
    }
  },
  CacheService: {
    getScriptCache: () => ({
      get: () => null,
      put: () => {}
    })
  },
  SpreadsheetApp: {
    flush: () => {}
  }
};

vm.createContext(context);

// Load constants and dashboard.service into context
const constCode = fs.readFileSync("group-dashboard/src/server/config.constants.js", "utf8");
vm.runInContext(constCode, context);

// Mock helper functions before dashboard service
const mockHelpers = `
function requireAccess_() {}
function getSpreadsheet_() { return mockSpreadsheet; }
function roundCurrency2_(val) { return Math.round((Number(val) || 0) * 100) / 100; }
function safeCellText_(val) {
  let s = String(val === undefined || val === null ? "" : val).trim().slice(0, 500);
  if (/^[=+\\-@\\t\\r]/.test(s)) s = "'" + s;
  return s;
}
function parseSheetDate_(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
function getHeaderMap_(headers) {
  const map = {};
  if (Array.isArray(headers)) {
    headers.forEach((h, idx) => {
      map[String(h).trim()] = idx;
    });
  }
  return map;
}
function getSheetByNameInsensitive_(ss, name) {
  if (!ss || !ss.sheets) return null;
  const target = String(name).trim().toLowerCase();
  for (const s of ss.sheets) {
    if (s.name.trim().toLowerCase() === target) return s;
  }
  return null;
}
function readUnifiedInvestmentLedgerValues_(ss) {
  return [
    ["Date", "Investment ID", "Type", "Category", "Description", "Amount", "Transaction Fee", "Entity Type"],
    [new Date("2026-04-15"), "PRJ-BEE-01", "Capital In", "Beekeeping", "Beehive equipment", 50000, 100, "Project"],
    [new Date("2026-05-20"), "INV-MANSA-01", "Capital In", "Holding", "Mansa X capital", 100000, 200, "Investment"],
    [new Date("2026-06-10"), "PRJ-BEE-01", "Revenue", "Honey Sales", "Organic Honey batch 1", 35000, 0, "Project"],
    [new Date("2026-07-01"), "INV-MANSA-01", "Revenue", "Dividend", "Mansa X Q2 Dividend", 15000, 0, "Investment"],
    [new Date("2026-08-15"), "DIV-01", "Expense", "Dividend", "Annual Dividend distribution", 25000, 0, "Dividend"],
    [new Date("2026-09-10"), "REF-01", "Withdrawal", "Refund", "Member savings exit refund", 12000, 0, "Member"]
  ];
}
function normalizeLedgerType_(type) {
  const s = String(type || "").trim().toLowerCase();
  if (s.includes("capital")) return "capital in";
  if (s.includes("exp")) return "expense";
  if (s.includes("rev")) return "revenue";
  if (s.includes("withdr")) return "withdrawal";
  return s;
}
`;
vm.runInContext(mockHelpers, context);

const dashCode = fs.readFileSync("group-dashboard/src/server/dashboard.service.js", "utf8");
vm.runInContext(dashCode, context);

// Setup mock sheets and spreadsheet
const mockContributionsSheet = {
  name: "Contributions",
  getLastRow: () => 5,
  getDataRange: () => ({
    getValues: () => [
      ["Date", "Member ID", "Member Name", "Amount", "Deposit Channel", "Status", "Type"],
      [new Date("2026-02-10"), "BLG-001", "Grace Mwangi", 50000, "M-Pesa", "Approved", "Monthly Contribution"],
      [new Date("2026-03-15"), "BLG-002", "David Ochieng", 40000, "Bank Transfer", "Approved", "Monthly Contribution"],
      [new Date("2026-04-20"), "BLG-003", "Mary Wanjiku", 3000, "Cash", "Approved", "Registration Fee"],
      [new Date("2026-05-10"), "BLG-004", "John Kamau", -8000, "Refund", "Approved", "Exit Refund"]
    ]
  })
};

const mockLoansSheet = {
  name: "Loans",
  getLastRow: () => 3,
  getDataRange: () => ({
    getValues: () => [
      ["Loan ID", "Member ID", "Principal Amount", "Approved Date", "Status"],
      ["LN-001", "BLG-001", 60000, new Date("2026-03-01"), "Active"],
      ["LN-002", "BLG-002", 40000, new Date("2026-05-01"), "Active"]
    ]
  })
};

const mockRepaymentsSheet = {
  name: "Loan Repayments",
  getLastRow: () => 4,
  getDataRange: () => ({
    getValues: () => [
      ["Repayment ID", "Loan ID", "Payment Date", "Total Paid", "Interest Paid", "Principal Paid", "Status"],
      ["RP-001", "LN-001", new Date("2026-04-01"), 22000, 2000, 20000, "Approved"],
      ["RP-002", "LN-001", new Date("2026-05-01"), 22000, 2000, 20000, "Approved"],
      ["RP-003", "LN-002", new Date("2026-06-01"), 15000, 1500, 13500, "Approved"]
    ]
  })
};

const mockSpreadsheet = {
  sheets: [mockContributionsSheet, mockLoansSheet, mockRepaymentsSheet],
  getSpreadsheetTimeZone: () => "Africa/Nairobi"
};
context.mockSpreadsheet = mockSpreadsheet;

// Mock Balance Sheet and Income Statement payloads
const mockBalanceSheet = {
  asOfDate: "24 Nov 2026",
  range: "year",
  assets: {
    cashAndEquivalents: {
      operatingCash: 250000,
      cashEquivalents: 450000,
      totalCash: 700000
    },
    loansReceivable: {
      grossLoans: 350000,
      allowance: 15000,
      netLoans: 335000
    },
    externalInvestments: {
      items: [{ id: "INV-MANSA-01", name: "Mansa X", value: 150000 }],
      totalInvestments: 150000
    },
    totalAssets: 1185000
  },
  liabilities: {
    payables: 0,
    totalLiabilities: 0
  },
  equity: {
    memberSavings: 800000,
    statutoryReserve: 77000,
    retainedSurplus: 308000,
    totalEquity: 1185000
  },
  totalLiabilitiesAndEquity: 1185000,
  variance: 0.00,
  isBalanced: true
};

const mockIncomeStatement = {
  range: "year",
  totalRevenue: 220000,
  operatingRevenue: {
    loanInterest: 35000,
    processingFees: 12000,
    finesAndPenalties: 3000,
    otherOperatingRevenue: 5000,
    operatingSubtotal: 55000
  },
  investmentYields: {
    cicMmfNetYield: 30000,
    externalInvestments: 15000,
    investmentSubtotal: 45000
  },
  operatingExpenses: {
    bankAndTransactionFees: 8000,
    techAndInfrastructure: 15000,
    agmAndAdmin: 20000,
    otherExpenses: 7000,
    totalExpenses: 50000
  },
  totalExpenses: 50000,
  loanLossProvisionCharge: 15000,
  netOperatingSurplus: 155000,
  appropriations: {
    statutoryReserveTransfer: 31000,
    distributableMemberPool: 124000
  },
  statutoryReserveTransfer: 31000,
  distributableMemberPool: 124000
};

const mockLiquiditySummary = {
  cash: 700000,
  liquidity: {
    ratio: 87.5,
    status: "Well Capitalized",
    totalStatementCash: 700000,
    totalSystemCash: 700000,
    isReconciled: true
  }
};

const mockPortfolio = {
  totalOutstanding: 350000,
  recommendedProvision: 15000
};

context.mockBalanceSheet = mockBalanceSheet;
context.mockIncomeStatement = mockIncomeStatement;
context.mockLiquiditySummary = mockLiquiditySummary;
context.mockPortfolio = mockPortfolio;

// ---------------------------------------------------------------------------
// TEST 1: buildEquityStatement_
// ---------------------------------------------------------------------------
console.log("\n--- TEST 1: buildEquityStatement_ ---");
const testEqCode = `
buildEquityStatement_(
  mockSpreadsheet,
  "Africa/Nairobi",
  new Date("2026-11-24"),
  "year",
  mockBalanceSheet,
  mockIncomeStatement
);
`;
const eqStmt = vm.runInContext(testEqCode, context);

assert(eqStmt, "Equity Statement must be returned");
assert.equal(eqStmt.range, "year", "Range must match");
assert.equal(eqStmt.columns.length, 4, "Must have 4 columns");
assert(eqStmt.columns[0].includes("Member Savings"), "Column 1 must be Member Savings");
assert(eqStmt.columns[1].includes("Statutory Reserve"), "Column 2 must be Statutory Reserve");
assert(eqStmt.columns[2].includes("Retained Distributable Surplus"), "Column 3 must be Retained Distributable Surplus");
assert(eqStmt.columns[3].includes("Total Members' Equity"), "Column 4 must be Total Members' Equity");

// Check rows
assert(Array.isArray(eqStmt.rows), "Must have rows array");
assert.equal(eqStmt.rows.length, 8, "Must have 8 standard rows");

const openingRow = eqStmt.rows.find(r => r.rowKey === "openingBalance");
const closingRow = eqStmt.rows.find(r => r.rowKey === "closingBalance");
assert(openingRow, "Must contain openingBalance row");
assert(closingRow, "Must contain closingBalance row");

console.log("  Opening Balances:", eqStmt.openingBalances);
console.log("  Movements:", eqStmt.movements);
console.log("  Closing Balances:", eqStmt.closingBalances);
console.log("  Reconciliation:", eqStmt.reconciliation);

// Reconciliation assertion
assert.equal(eqStmt.closingBalances.total, mockBalanceSheet.equity.totalEquity, "Closing total must match Balance Sheet total equity");
assert.equal(eqStmt.reconciliation.variance, 0, "Variance against Balance Sheet Total Equity must be 0.00 KES");
assert.equal(eqStmt.reconciliation.isReconciled, true, "isReconciled must be true");
assert.equal(eqStmt.isBalanced, true, "isBalanced must be true");
console.log("  ✓ buildEquityStatement_ verified with zero-variance balance sheet reconciliation!");

// ---------------------------------------------------------------------------
// TEST 2: buildCashFlowStatement_ (IAS 7 Direct Method)
// ---------------------------------------------------------------------------
console.log("\n--- TEST 2: buildCashFlowStatement_ ---");
const testCfCode = `
buildCashFlowStatement_(
  mockSpreadsheet,
  "Africa/Nairobi",
  new Date("2026-11-24"),
  "year",
  mockLiquiditySummary,
  mockPortfolio,
  mockIncomeStatement,
  mockBalanceSheet
);
`;
const cfStmt = vm.runInContext(testCfCode, context);

assert(cfStmt, "Cash Flow Statement must be returned");
assert(cfStmt.operatingActivities, "Must have operatingActivities section");
assert(cfStmt.investingActivities, "Must have investingActivities section");
assert(cfStmt.financingActivities, "Must have financingActivities section");
assert(cfStmt.reconciliation, "Must have reconciliation section");

// Operating activities items
const op = cfStmt.operatingActivities;
assert(typeof op.contributionsReceipts === "number", "Must have contributionsReceipts");
assert(typeof op.loanRepaymentsReceipts === "number", "Must have loanRepaymentsReceipts");
assert(typeof op.loanFeesAndFinesReceipts === "number", "Must have loanFeesAndFinesReceipts");
assert(typeof op.liquidFundYieldsReceipts === "number", "Must have liquidFundYieldsReceipts");
assert(typeof op.loansDisbursed === "number", "Must have loansDisbursed");
assert(typeof op.operatingExpensesPaid === "number", "Must have operatingExpensesPaid");
assert.equal(
  op.netOperatingCashFlow,
  Math.round(((op.contributionsReceipts + op.loanRepaymentsReceipts + op.loanFeesAndFinesReceipts + op.liquidFundYieldsReceipts) - (op.loansDisbursed + op.operatingExpensesPaid)) * 100) / 100,
  "Net operating cash flow must equal inflows minus outflows"
);

// Investing activities items
const inv = cfStmt.investingActivities;
assert(typeof inv.capitalInjectedProjects === "number", "Must have capitalInjectedProjects");
assert(typeof inv.capitalInjectedExternal === "number", "Must have capitalInjectedExternal");
assert(typeof inv.projectInflows === "number", "Must have projectInflows");
assert(typeof inv.investmentLiquidationAndYields === "number", "Must have investmentLiquidationAndYields");
assert.equal(
  inv.netInvestingCashFlow,
  Math.round(((inv.projectInflows + inv.investmentLiquidationAndYields) - (inv.capitalInjectedProjects + inv.capitalInjectedExternal)) * 100) / 100,
  "Net investing cash flow must equal receipts minus capital injections"
);

// Financing activities items
const fin = cfStmt.financingActivities;
assert(typeof fin.registrationAndWelfareFees === "number", "Must have registrationAndWelfareFees");
assert(typeof fin.memberRefundsPaid === "number", "Must have memberRefundsPaid");
assert(typeof fin.dividendsPaid === "number", "Must have dividendsPaid");
assert.equal(
  fin.netFinancingCashFlow,
  Math.round((fin.registrationAndWelfareFees - (fin.memberRefundsPaid + fin.dividendsPaid)) * 100) / 100,
  "Net financing cash flow must equal fee receipts minus exits/dividends"
);

// Reconciliation & Cash Summary
const rec = cfStmt.reconciliation;
assert.equal(rec.closingCash, mockBalanceSheet.assets.cashAndEquivalents.totalCash, "Closing cash must match Balance Sheet total cash");
assert.equal(rec.variance, 0, "Variance against Balance Sheet Cash must be 0.00 KES");
assert.equal(rec.isReconciled, true, "isReconciled must be true");

console.log("  Operating Net:", op.netOperatingCashFlow);
console.log("  Investing Net:", inv.netInvestingCashFlow);
console.log("  Financing Net:", fin.netFinancingCashFlow);
console.log("  Net Increase in Cash:", rec.netIncreaseInCash);
console.log("  Closing Cash:", rec.closingCash, "Balance Sheet Cash:", rec.balanceSheetCash);
console.log("  Reconciliation Variance:", rec.variance, "isReconciled:", rec.isReconciled);
console.log("  ✓ buildCashFlowStatement_ verified per IAS 7 Direct Method with 0.00 variance!");

// ---------------------------------------------------------------------------
// TEST 3: getExecutiveFinancialReports
// ---------------------------------------------------------------------------
console.log("\n--- TEST 3: getExecutiveFinancialReports ---");
// Mock getHomeAnalyticsByRange_ to return the complete suite
const mockHomeAnalytics = {
  balanceSheet: mockBalanceSheet,
  incomeStatement: mockIncomeStatement,
  equityStatement: eqStmt,
  cashFlowStatement: cfStmt,
  liquiditySummary: mockLiquiditySummary,
  portfolio: mockPortfolio,
  cash: 700000,
  savings: 800000,
  loans: 350000
};
context.getHomeAnalyticsByRange_ = () => mockHomeAnalytics;

const execReports = vm.runInContext("getExecutiveFinancialReports('year')", context);
assert(execReports, "Must return executive financial reports");
assert.equal(execReports.ok, true, "ok flag must be true");
assert(execReports.balanceSheet, "Payload must include balanceSheet");
assert(execReports.incomeStatement, "Payload must include incomeStatement");
assert(execReports.equityStatement, "Payload must include equityStatement");
assert(execReports.cashFlowStatement, "Payload must include cashFlowStatement");
assert(execReports.liquiditySummary, "Payload must include liquiditySummary");
assert(execReports.portfolio, "Payload must include portfolio");
console.log("  ✓ getExecutiveFinancialReports payload includes all 6 core financial models!");

// ---------------------------------------------------------------------------
// TEST 4: getAgmAuditExportPackData & exportAgmAuditPackCSV
// ---------------------------------------------------------------------------
console.log("\n--- TEST 4: getAgmAuditExportPackData & exportAgmAuditPackCSV ---");
const agmPack = vm.runInContext("getAgmAuditExportPackData('year')", context);
assert(agmPack.ok, "AGM pack must return ok: true");
assert(agmPack.data.equityStatement, "AGM pack data must contain equityStatement");
assert(agmPack.data.cashFlowStatement, "AGM pack data must contain cashFlowStatement");

const csvResult = vm.runInContext("exportAgmAuditPackCSV('year')", context);
assert(csvResult.ok, "exportAgmAuditPackCSV must return ok: true");
assert(csvResult.csv, "CSV content must be non-empty");

const csvLines = csvResult.csv.split("\r\n");
console.log(`  CSV total lines: ${csvLines.length}`);

// Verify Sections in CSV
const sectionHeaders = csvLines.filter(line => line.startsWith("SECTION"));
console.log("  Sections generated in CSV:");
sectionHeaders.forEach(h => console.log(`    ${h}`));

assert(csvResult.csv.includes("SECTION 1: STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)"), "Must contain Section 1 Balance Sheet");
assert(csvResult.csv.includes("SECTION 2: STATEMENT OF COMPREHENSIVE INCOME"), "Must contain Section 2 Income Statement");
assert(csvResult.csv.includes("SECTION 3: STATEMENT OF CHANGES IN EQUITY"), "Must contain Section 3 Equity Changes");
assert(csvResult.csv.includes("SECTION 4: DIRECT CASH FLOW STATEMENT (IAS 7)"), "Must contain Section 4 Direct Cash Flows");
assert(csvResult.csv.includes("SECTION 5: INVESTMENT PROJECTS SUMMARY"), "Must contain Section 5 Projects Summary");
assert(csvResult.csv.includes("SECTION 6: SASRA / PRUDENTIAL FINANCIAL RATIOS"), "Must contain Section 6 SASRA Ratios");

// Verify formula injection protection in CSV
assert(!csvResult.csv.includes(",="), "No unescaped formula triggers starting with =");
console.log("  ✓ AGM CSV contains all Sections 1-6 with formula injection neutralization!");

console.log("\n=== ALL RPT-3 VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
