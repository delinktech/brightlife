/**
 * Verification Suite for Task ANA-1: Executive & Member Dashboard Financial Intelligence & Actuarial UX (Phase 1)
 *
 * Verifies:
 * 1. Free vs Encumbered Savings mathematical identity (freeSavings + encumberedSavings === totalSavings).
 * 2. Dynamic Effective Borrowing Capacity with Delinquency Lockout.
 * 3. Bylaws Rule 5.2 Dual-Stream Dividend Routing (Loan Offset vs Savings Reinvestment).
 * 4. Active Loans Lifecycle Enrichment (daysToMaturity, dueDateFormatted, isOverdue, repayment breakdown).
 * 5. Credit Standing & Consistency Tiering (Tier 1 Flawless, Tier 2 Good Standing, Tier 3 Attention Required).
 * 6. Executive Ratios & Telemetry (CDR vs SASRA 85% cap, PAR 30/90, ROE, ROA, Liquidity Ratio).
 * 7. Value-Weighted SASRA Credit Quality Distribution & Chama Asset Allocation.
 * 8. Zero-breakage of existing RPC signatures (getPersonalFinancialsData, getHomeAnalytics, getDashboardData, etc.).
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("===============================================================================");
console.log("   VERIFYING TASK ANA-1: FINANCIAL INTELLIGENCE & ACTUARIAL UX (PHASE 1)       ");
console.log("===============================================================================\n");

// 1. Verify syntax of modified files
const filesToVerify = [
  "group-dashboard/src/server/personal.service.js",
  "group-dashboard/src/server/dashboard.service.js",
];

filesToVerify.forEach(relPath => {
  console.log(`Checking syntax: ${relPath}`);
  const code = fs.readFileSync(relPath, "utf8");
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: relPath });
  }, `Syntax error in ${relPath}`);
  console.log(`  ✓ Syntax OK: ${relPath}`);
});

// Setup mock Apps Script context
let activeSession = {
  email: "alice@brightlife.org",
  memberId: "BLM-001",
  memberName: "Alice Wanjiku",
  roleKey: "member",
  permissions: { isAdmin: false }
};

const mockSpreadsheet = {
  getSpreadsheetTimeZone: () => "Africa/Nairobi",
  getSheetByName: function (name) {
    if (!this.sheets) return null;
    const target = String(name).trim().toLowerCase();
    for (const s of this.sheets) {
      if (s.name.trim().toLowerCase() === target) return s;
    }
    return null;
  },
  sheets: []
};

function createMockSheet(name, data) {
  return {
    name: name,
    getLastRow: () => data.length,
    getDataRange: () => ({
      getValues: () => data
    })
  };
}

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
  parseInt: parseInt,
  Utilities: {
    formatDate: (date, tz, fmt) => {
      if (!date) return "";
      const d = date instanceof Date ? date : new Date(date);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const day = String(d.getDate()).padStart(2, "0");
      const mmm = months[d.getMonth()];
      const yyyy = d.getFullYear();
      return `${day} ${mmm} ${yyyy}`;
    }
  },
  CacheService: {
    getScriptCache: () => ({
      get: () => null,
      put: () => {},
      removeAll: () => {}
    })
  },
  SpreadsheetApp: {
    flush: () => {}
  }
};

vm.createContext(context);

// Load constants
const constCode = fs.readFileSync("group-dashboard/src/server/config.constants.js", "utf8");
vm.runInContext(constCode, context);

// Inject helper functions
const helperCode = `
function requireAccess_() { return activeSession; }
function getSpreadsheet_() { return mockSpreadsheet; }
function getRequiredSheet_(name) {
  const s = mockSpreadsheet.getSheetByName(name);
  if (!s) throw new Error("Missing required sheet: " + name);
  return s;
}
function getSheetByNameInsensitive_(ss, name) {
  return ss.getSheetByName(name);
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
function requireHeaders_(colMap, required, sheetName) {
  required.forEach(r => {
    if (colMap[r] === undefined) throw new Error("Missing column " + r + " in " + sheetName);
  });
}
function formatDateValue_(val, tz) {
  if (!val) return "—";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "dd MMM yyyy");
  return String(val);
}
function formatCurrency_(num) {
  const val = Number(num) || 0;
  return "KES " + val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function roundCurrency2_(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}
`;
vm.runInContext(helperCode, context);
context.mockSpreadsheet = mockSpreadsheet;
Object.defineProperty(context, "activeSession", {
  get: () => activeSession,
  set: (v) => { activeSession = v; }
});

// Load personal.service.js and dashboard.service.js into VM
const personalCode = fs.readFileSync("group-dashboard/src/server/personal.service.js", "utf8");
vm.runInContext(personalCode, context);

const dashboardCode = fs.readFileSync("group-dashboard/src/server/dashboard.service.js", "utf8");
vm.runInContext(dashboardCode, context);

// ==============================================================================
// TEST SUITE 1: Free vs Encumbered Savings Math Identity
// ==============================================================================
console.log("\n--- TEST SUITE 1: Free vs Encumbered Savings Math Identity ---");

function setupMockChamaData(opts = {}) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  // 1. Members
  const members = [
    ["Member ID", "First Name", "Middle Name", "Last Name", "Full Name", "National Id", "Gender", "Date of Birth", "Phone Number", "Email", "Registration Date", "Status", "Total Savings", "Current Loan Balance", "Guaranteed Amount", "Available to Guarantee"],
    ["BLM-001", "Alice", "", "Wanjiku", "Alice Wanjiku", "12345678", "Female", new Date("1990-01-01"), "0711000001", "alice@brightlife.org", new Date("2021-01-01"), "Active", opts.aliceSavings !== undefined ? opts.aliceSavings : 150000, opts.aliceLoanBal !== undefined ? opts.aliceLoanBal : 0, 60000, 90000],
    ["BLM-002", "Bob", "", "Otieno", "Bob Otieno", "23456789", "Male", new Date("1988-02-02"), "0711000002", "bob@brightlife.org", new Date("2021-02-01"), "Active", 250000, 100000, 0, 250000],
    ["BLM-003", "Charlie", "", "Kamau", "Charlie Kamau", "34567890", "Male", new Date("1992-03-03"), "0711000003", "charlie@brightlife.org", new Date("2021-03-01"), "Active", 100000, 50000, 0, 100000],
  ];

  // 2. Contributions (Alice has 11 monthly contributions trailing)
  const contribs = [
    ["Date", "Member ID", "Member Name", "Amount", "Deposit Channel", "Transaction ID", "Type", "Status", "Verified By"]
  ];
  const contribMonths = opts.aliceContribMonths !== undefined ? opts.aliceContribMonths : 11;
  for (let i = 0; i < contribMonths; i++) {
    const d = new Date(y, m - i, 15);
    contribs.push([d, "BLM-001", "Alice Wanjiku", 10000, "Equity Bank", `TX-ALICE-${i}`, "Monthly Contribution", "Approved", "Treasurer"]);
  }

  // 3. Loans
  const loans = [
    ["Loan ID", "Request Date", "Approved Date", "Due Date", "Member ID", "Borrower Name", "Requested Amount", "Interest", "Transaction Fee", "Repayment Amount", "Total Paid", "Principal Paid", "Interest Paid", "Fee Paid", "Balance", "Status", "Borrower’s Own Savings", "Total Guaranteed", "Shortfall Amount"],
  ];
  if (opts.aliceHasLoan) {
    const isOverdue = opts.aliceLoanOverdue === true;
    const loanBal = opts.aliceLoanBal !== undefined ? opts.aliceLoanBal : 50000;
    const loanDue = isOverdue ? new Date(y, m - 1, 1) : new Date(y, m + 2, 1);
    const loanStatus = isOverdue ? (opts.aliceLoanStatus || "In Arrears") : "Active";
    loans.push(["BL-LN-001", new Date(y, m - 3, 1), new Date(y, m - 3, 5), loanDue, "BLM-001", "Alice Wanjiku", 60000, 6000, 500, 66500, 16500, 10000, 6000, 500, loanBal, loanStatus, 150000, 60000, 0]);
  }
  // Other loans
  loans.push(["BL-LN-002", new Date(y, m - 2, 1), new Date(y, m - 2, 5), new Date(y, m + 4, 1), "BLM-002", "Bob Otieno", 100000, 10000, 1000, 111000, 11000, 0, 10000, 1000, 100000, "Active", 250000, 100000, 0]);
  loans.push(["BL-LN-003", new Date(y, m - 4, 1), new Date(y, m - 4, 5), new Date(y, m - 1, 1), "BLM-003", "Charlie Kamau", 50000, 5000, 500, 55500, 5500, 0, 5000, 500, 50000, "In Arrears", 100000, 50000, 0]);

  // 4. Guarantors
  const guarantors = [
    ["Loan ID", "Member ID", "Guarantor Name", "Guaranteed Amount", "Loan Status", "Guarantor’s Savings Balance", "Guarantor Eligibility"]
  ];
  if (opts.aliceGuarantorships) {
    opts.aliceGuarantorships.forEach((g, idx) => {
      guarantors.push([g.loanId, "BLM-001", "Alice Wanjiku", g.amount, g.status || "Active", 150000, 90000]);
    });
  } else {
    // Alice guarantees Bob's active loan for 60,000
    guarantors.push(["BL-LN-002", "BLM-001", "Alice Wanjiku", 60000, "Active", 150000, 90000]);
  }

  // 5. Loan Repayments
  const repayments = [
    ["Payment ID", "Loan ID", "Payment Date", "Member ID", "Borrower Name", "Total Paid", "Principal Paid", "Interest Paid", "Fee Paid", "Deposit Channel", "Transaction ID", "Balance Remaining", "Status", "Verified By"],
    ["RP-001", "BL-LN-002", new Date(y, m - 1, 10), "BLM-002", "Bob Otieno", 11000, 0, 10000, 1000, "Equity Bank", "TX-RP-001", 100000, "Approved", "Treasurer"],
    ["RP-002", "BL-LN-003", new Date(y, m - 2, 10), "BLM-003", "Charlie Kamau", 5500, 0, 5000, 500, "Cash", "TX-RP-002", 50000, "Approved", "Treasurer"],
  ];

  // 6. Investments
  const investments = [
    ["Investment ID", "Name", "Start Date", "Money Invested", "Revenue", "ROI Amount", "ROI %", "Status", "Asset Class", "Institution", "Ticker", "Units Held", "Unit Cost", "Current Price", "Last Valued", "Carrying Value"],
    ["INV-CIC-01", "CIC Money Market Fund", new Date("2021-05-20"), 500000, 560000, 60000, 12, "Active", "Money Market Fund", "CIC Asset Management", "CICMMF", 560000, 1, 1, new Date(), 560000],
    ["INV-LAND-01", "Juja Farm Agri-Project", new Date("2023-01-15"), 400000, 480000, 80000, 20, "Active", "Tangible Fixed Asset", "Brightlife SHG", "JUJA", 1, 400000, 480000, new Date(), 480000],
  ];

  // 7. CIC Statement
  const cicStatement = [
    ["Statement Date", "Fund Channel", "Opening Balance", "Purchases / Deposits", "Gross Interest", "Withholding Tax", "Net Yield", "Withdrawals", "Closing Balance", "Statement Ref"],
    [new Date(y, m - 1, 30), "CIC MMF", 540000, 10000, 5000, 750, 4250, 0, 554250, "CIC-STMT-01"],
    [new Date(y, m, 15), "CIC MMF", 554250, 0, 6000, 900, 5100, 0, 560000, "CIC-STMT-02"],
  ];

  // 8. Accounts
  const accounts = [
    ["Org. Name", "Acc. Number", "Payment Mode", "Paybill", "Inflows", "Outflows", "System Balance", "Statement Balance", "Balance Date", "Variance", "Reconciliation Status", "Notes"],
    ["Equity Bank", "0020164001424", "Equity Bank", "247247", 1200000, 900000, 300000, 300000, new Date(), 0, "Balanced", "Operating current account"],
    ["CIC Asset Management", "CIC-MMF-001", "CIC MMF", "", 600000, 40000, 560000, 560000, new Date(), 0, "Balanced", "Liquid reserves"],
  ];

  // 9. Constants
  const constants = [
    ["Loan Policy Parameter", "Policy Value", "Statutory Thresholds", "Threshold Value"],
    ["Borrower Savings Multiplier", opts.savingsMultiplier !== undefined ? opts.savingsMultiplier : 3, "SASRA Max Loan Exposure Pct", 85],
    ["Loan Interest Rate Pct", 10, "Statutory Reserve Transfer Pct", 20],
    ["Minimum Guarantor Count", 2, "Liquidity Min Pct", 15],
  ];

  mockSpreadsheet.sheets = [
    createMockSheet("Members", members),
    createMockSheet("Contributions", contribs),
    createMockSheet("Loans", loans),
    createMockSheet("Loan Repayments", repayments),
    createMockSheet("Guarantors", guarantors),
    createMockSheet("Investments", investments),
    createMockSheet("CIC Statement", cicStatement),
    createMockSheet("Accounts", accounts),
    createMockSheet("Constants", constants),
  ];
}

// Subtest 1A: Standard Member with 150k savings, 60k active guarantee
setupMockChamaData({ aliceSavings: 150000, aliceLoanBal: 0 });
let res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.success, true, "RPC call must succeed");
assert.strictEqual(res.personalSummary.savings, 150000, "Alice savings should be 150,000");
assert.strictEqual(res.personalSummary.encumberedSavings, 60000, "Encumbered savings must be 60,000");
assert.strictEqual(res.personalSummary.freeSavings, 90000, "Free savings must be 90,000");
assert.strictEqual(
  res.personalSummary.freeSavings + res.personalSummary.encumberedSavings,
  res.personalSummary.savings,
  "Math Identity: freeSavings + encumberedSavings === savings"
);
console.log("  ✓ Subtest 1A: Standard guarantee (150k savings, 60k encumbered = 90k free) matches identity.");

// Subtest 1B: Over-encumbered guarantee (50k savings, 70k guarantee pledge)
setupMockChamaData({
  aliceSavings: 50000,
  aliceGuarantorships: [{ loanId: "BL-LN-002", amount: 70000, status: "Active" }]
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.savings, 50000, "Alice savings should be 50,000");
assert.strictEqual(res.personalSummary.encumberedSavings, 50000, "Encumbered cannot exceed total savings (cap at 50,000)");
assert.strictEqual(res.personalSummary.freeSavings, 0, "Free savings must be Math.max(0, 50000 - 50000) === 0");
assert.strictEqual(
  res.personalSummary.freeSavings + res.personalSummary.encumberedSavings,
  res.personalSummary.savings,
  "Math Identity: freeSavings + encumberedSavings === savings (over-encumbered)"
);
console.log("  ✓ Subtest 1B: Over-encumbered pledge cap (50k savings, 70k pledge = 50k encumbered, 0 free) matches identity.");

// Subtest 1C: Released or Settled Guarantor Commitments do NOT encumber savings
setupMockChamaData({
  aliceSavings: 120000,
  aliceGuarantorships: [
    { loanId: "BL-LN-002", amount: 40000, status: "Released" }, // Released
    { loanId: "BL-LN-003", amount: 30000, status: "Settled" },  // Settled
  ]
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.savings, 120000, "Alice savings should be 120,000");
assert.strictEqual(res.personalSummary.encumberedSavings, 0, "Released/settled commitments must not encumber savings");
assert.strictEqual(res.personalSummary.freeSavings, 120000, "Free savings must equal 100% of savings when commitments are cleared");
assert.strictEqual(
  res.personalSummary.freeSavings + res.personalSummary.encumberedSavings,
  res.personalSummary.savings,
  "Math Identity: freeSavings + encumberedSavings === savings (cleared commitments)"
);
console.log("  ✓ Subtest 1C: Released & settled guarantor commitments do not freeze savings.");

// ==============================================================================
// TEST SUITE 2: Dynamic Borrowing Capacity & Delinquency Lockout
// ==============================================================================
console.log("\n--- TEST SUITE 2: Dynamic Borrowing Capacity & Delinquency Lockout ---");

// Subtest 2A: Performing Member (Savings 100k, Multiplier 3x, Active Loan 50k, Encumbered 20k)
// Capacity = Math.max(0, (100k * 3) - 50k - 20k) = 300k - 70k = 230,000
setupMockChamaData({
  aliceSavings: 100000,
  aliceHasLoan: true,
  aliceLoanBal: 50000,
  aliceLoanOverdue: false,
  savingsMultiplier: 3.0,
  aliceGuarantorships: [{ loanId: "BL-LN-002", amount: 20000, status: "Active" }]
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.delinquencyLocked, false, "Performing member must NOT be delinquency locked");
assert.strictEqual(res.personalSummary.delinquencyReason, "", "Delinquency reason must be empty string");
assert.strictEqual(res.personalSummary.borrowingMultiplier, 3, "Multiplier should be 3.0x");
assert.strictEqual(res.personalSummary.effectiveBorrowingCapacity, 230000, "Effective borrowing capacity should be 230,000");
assert.strictEqual(res.personalSummary.borrowingCapacity, 230000, "borrowingCapacity alias must match effectiveBorrowingCapacity");
console.log("  ✓ Subtest 2A: Performing member capacity calculated accurately ((100k*3) - 50k - 20k = 230,000).");

// Subtest 2B: Delinquent Member (Active Loan in Arrears -> Capacity Locked to 0)
setupMockChamaData({
  aliceSavings: 100000,
  aliceHasLoan: true,
  aliceLoanBal: 50000,
  aliceLoanOverdue: true, // Delinquent!
  aliceLoanStatus: "In Arrears",
  savingsMultiplier: 3.0,
  aliceGuarantorships: []
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.delinquencyLocked, true, "Delinquent member MUST be locked out");
assert.strictEqual(res.personalSummary.effectiveBorrowingCapacity, 0, "Capacity must be hard-locked to KES 0");
assert.strictEqual(
  res.personalSummary.delinquencyReason,
  "Account has active facility in arrears. Borrowing privilege locked until settled.",
  "Delinquency reason must inform the member clearly"
);
console.log("  ✓ Subtest 2B: Delinquency lock hard-locks borrowing capacity to KES 0 with statutory warning.");

// Subtest 2C: Dynamic Policy Multiplier from Constants (e.g. 4.0x)
setupMockChamaData({
  aliceSavings: 80000,
  aliceHasLoan: false,
  aliceLoanBal: 0,
  savingsMultiplier: 4.0,
  aliceGuarantorships: [{ loanId: "BL-LN-002", amount: 10000, status: "Active" }]
});
res = vm.runInContext("getPersonalFinancialsData()", context);

// Capacity = (80k * 4) - 0 - 10k = 320k - 10k = 310,000
assert.strictEqual(res.personalSummary.borrowingMultiplier, 4.0, "Multiplier should be read as 4.0x from Constants");
assert.strictEqual(res.personalSummary.effectiveBorrowingCapacity, 310000, "Capacity with 4x multiplier should be 310,000");
console.log("  ✓ Subtest 2C: Dynamic multiplier from Constants correctly changes borrowing ceiling.");

// ==============================================================================
// TEST SUITE 3: Bylaws Rule 5.2 Dual-Stream Dividend Routing
// ==============================================================================
console.log("\n--- TEST SUITE 3: Bylaws Rule 5.2 Dual-Stream Dividend Routing ---");

// Subtest 3A: Member has active loan debt < projected dividend
// Example: Projected Dividend = KES 20,000, Active Loan Balance = KES 12,000
// Rule 5.2 routing: Loan Offset = 12,000, Savings Reinvestment = 8,000
setupMockChamaData({
  aliceSavings: 150000, // Total group savings = 150k + 250k + 100k = 500k (Alice has 30% share)
  aliceHasLoan: true,
  aliceLoanBal: 12000,
  aliceLoanOverdue: false
});
res = vm.runInContext("getPersonalFinancialsData()", context);

const projDiv = res.personalSummary.projectedDividend;
const loanOffset = res.personalSummary.dividendLoanOffset;
const savingsReinvest = res.personalSummary.dividendSavingsReinvest;
const hasOffset = res.personalSummary.hasLoanOffset;

assert(projDiv > 0, "Projected dividend must be positive given earnings in mock data");
assert.strictEqual(loanOffset, Math.min(projDiv, 12000), "Loan offset must equal Math.min(projectedDividend, loanBalance)");
assert.strictEqual(savingsReinvest, Math.max(0, projDiv - loanOffset), "Savings reinvestment must equal Math.max(0, projDiv - loanOffset)");
assert.strictEqual(hasOffset, true, "hasLoanOffset must be true when loanOffset > 0");
assert.strictEqual(
  Math.round((loanOffset + savingsReinvest) * 100) / 100,
  projDiv,
  "Bylaws 5.2 Identity: dividendLoanOffset + dividendSavingsReinvest === projectedDividend"
);
console.log(`  ✓ Subtest 3A: Rule 5.2 dual-stream split verified (Proj: ${projDiv}, Offset: ${loanOffset}, Reinvest: ${savingsReinvest}).`);

// Subtest 3B: Member debt-free (Active Loan Balance = 0)
// Rule 5.2 routing: Loan Offset = 0, Savings Reinvestment = 100% of projected dividend
setupMockChamaData({
  aliceSavings: 150000,
  aliceHasLoan: false,
  aliceLoanBal: 0
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.dividendLoanOffset, 0, "Debt-free member must have 0 loan offset");
assert.strictEqual(res.personalSummary.hasLoanOffset, false, "hasLoanOffset must be false when debt-free");
assert.strictEqual(res.personalSummary.dividendSavingsReinvest, res.personalSummary.projectedDividend, "100% of dividend goes to savings reinvestment");
console.log("  ✓ Subtest 3B: Debt-free member 100% dividend capitalization verified.");

// Subtest 3C: Member active loan balance exceeds projected dividend
setupMockChamaData({
  aliceSavings: 50000,
  aliceHasLoan: true,
  aliceLoanBal: 999999, // very large loan
  aliceLoanOverdue: false
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.dividendLoanOffset, res.personalSummary.projectedDividend, "100% of dividend routed to debt reduction");
assert.strictEqual(res.personalSummary.dividendSavingsReinvest, 0, "0 surplus left for savings reinvestment");
assert.strictEqual(res.personalSummary.hasLoanOffset, true, "hasLoanOffset must be true");
console.log("  ✓ Subtest 3C: Under-surplus loan offset (100% to debt offset, 0 to savings) verified.");

// ==============================================================================
// TEST SUITE 4: Active Loans Lifecycle & Credit Standing Tiers
// ==============================================================================
console.log("\n--- TEST SUITE 4: Active Loans Lifecycle & Credit Standing Tiers ---");

// Subtest 4A: Active Loan Object Enrichment
setupMockChamaData({
  aliceSavings: 150000,
  aliceHasLoan: true,
  aliceLoanBal: 50000,
  aliceLoanOverdue: false
});
res = vm.runInContext("getPersonalFinancialsData()", context);

assert(Array.isArray(res.loans) && res.loans.length > 0, "Alice must have loans array");
const loanObj = res.loans[0];
assert("daysToMaturity" in loanObj, "Loan object must have daysToMaturity");
assert("dueDateFormatted" in loanObj, "Loan object must have dueDateFormatted");
assert("isOverdue" in loanObj, "Loan object must have isOverdue boolean");
assert("principalPaid" in loanObj, "Loan object must have principalPaid");
assert("interestPaid" in loanObj, "Loan object must have interestPaid");
assert("feePaid" in loanObj, "Loan object must have feePaid");
assert("balance" in loanObj, "Loan object must have balance");
assert.strictEqual(typeof loanObj.isOverdue, "boolean", "isOverdue must be boolean");
console.log(`  ✓ Subtest 4A: Active loan lifecycle enriched (Due: ${loanObj.dueDateFormatted}, Days: ${loanObj.daysToMaturity}, Balance: ${loanObj.balance}).`);

// Subtest 4B: Credit Standing Tier 1: Flawless (10-12 monthly contributions, 0 defaults)
setupMockChamaData({ aliceContribMonths: 11, aliceHasLoan: false });
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.creditTier, "Tier 1: Flawless", "11 active months must yield Tier 1: Flawless");
assert.strictEqual(res.personalSummary.creditStanding.tier, "Tier 1: Flawless");
assert(res.personalSummary.consistencyScore >= 83, "Consistency score should be >= 83%");
assert(res.personalSummary.streakMonths > 0, "Streak months should be positive");
console.log(`  ✓ Subtest 4B: Tier 1: Flawless verified (Score: ${res.personalSummary.consistencyScore}%, Streak: ${res.personalSummary.streakMonths} mos).`);

// Subtest 4C: Credit Standing Tier 2: Good Standing (6-9 monthly contributions, 0 defaults)
setupMockChamaData({ aliceContribMonths: 7, aliceHasLoan: false });
res = vm.runInContext("getPersonalFinancialsData()", context);

assert.strictEqual(res.personalSummary.creditTier, "Tier 2: Good Standing", "7 active months must yield Tier 2: Good Standing");
console.log("  ✓ Subtest 4C: Tier 2: Good Standing verified (7 months active).");

// Subtest 4D: Credit Standing Tier 3: Attention Required (< 6 contributions OR active default)
setupMockChamaData({ aliceContribMonths: 4, aliceHasLoan: false });
res = vm.runInContext("getPersonalFinancialsData()", context);
assert.strictEqual(res.personalSummary.creditTier, "Tier 3: Attention Required", "< 6 months must yield Tier 3");

// Active default forces Tier 3 even with 12 contributions
setupMockChamaData({ aliceContribMonths: 12, aliceHasLoan: true, aliceLoanOverdue: true, aliceLoanStatus: "Default" });
res = vm.runInContext("getPersonalFinancialsData()", context);
assert.strictEqual(res.personalSummary.creditTier, "Tier 3: Attention Required", "Active default forces Tier 3 regardless of contributions");
console.log("  ✓ Subtest 4D: Tier 3: Attention Required verified for low consistency and active arrears.");

// ==============================================================================
// TEST SUITE 5: Executive Ratios & Actuarial UX Telemetry
// ==============================================================================
console.log("\n--- TEST SUITE 5: Executive Ratios & Actuarial UX Telemetry ---");

setupMockChamaData();
const homeAnalytics = vm.runInContext("getHomeAnalytics('year')", context);

// 1. Capital Deployment Ratio (CDR)
assert("cdr" in homeAnalytics, "Home analytics must contain cdr");
assert("isAboveSasraCap" in homeAnalytics, "Home analytics must contain isAboveSasraCap");
assert(typeof homeAnalytics.cdr === "number", "cdr must be numeric");
assert.strictEqual(typeof homeAnalytics.isAboveSasraCap, "boolean", "isAboveSasraCap must be boolean");
// Total savings = 500,000, Total loans = 150,000 -> CDR = 30.0%
assert.strictEqual(homeAnalytics.cdr, 30.0, "CDR should be (150,000 / 500,000) * 100 = 30.0%");
assert.strictEqual(homeAnalytics.isAboveSasraCap, false, "30.0% is below SASRA 85% ceiling");
console.log(`  ✓ Subtest 5A: Capital Deployment Ratio (CDR): ${homeAnalytics.cdr}% (SASRA Cap Exceeded: ${homeAnalytics.isAboveSasraCap}).`);

// 2. PAR 30 vs PAR 90+ & Provisioning Breakdown
assert("par30Amount" in homeAnalytics, "Must contain par30Amount");
assert("par30Ratio" in homeAnalytics, "Must contain par30Ratio");
assert("par90Amount" in homeAnalytics, "Must contain par90Amount");
assert("par90Ratio" in homeAnalytics, "Must contain par90Ratio");
assert("totalRequiredProvision" in homeAnalytics, "Must contain totalRequiredProvision");
assert(homeAnalytics.totalRequiredProvision > 0, "Provision must be positive");
console.log(`  ✓ Subtest 5B: PAR Telemetry: PAR 30 = ${homeAnalytics.par30Amount} (${homeAnalytics.par30Ratio}%), PAR 90 = ${homeAnalytics.par90Amount} (${homeAnalytics.par90Ratio}%), Provision = ${homeAnalytics.totalRequiredProvision}`);

// 3. Executive Profitability (ROE, ROA, Liquidity Ratio)
assert("roe" in homeAnalytics, "Must contain roe");
assert("roa" in homeAnalytics, "Must contain roa");
assert("liquidityRatio" in homeAnalytics, "Must contain liquidityRatio");
assert("executiveTelemetry" in homeAnalytics, "Must contain executiveTelemetry");
assert.strictEqual(homeAnalytics.executiveTelemetry.cdr, homeAnalytics.cdr);
assert.strictEqual(homeAnalytics.executiveTelemetry.roe, homeAnalytics.roe);
console.log(`  ✓ Subtest 5C: Executive Profitability & Liquidity: ROE = ${homeAnalytics.roe}%, ROA = ${homeAnalytics.roa}%, Liquidity = ${homeAnalytics.liquidityRatio}%`);

// 4. Value-Weighted SASRA Credit Quality Distribution
assert("sasraCreditQuality" in homeAnalytics, "Must contain sasraCreditQuality");
assert(Array.isArray(homeAnalytics.sasraCreditQuality.amounts), "Credit quality amounts must be an array");
assert.strictEqual(homeAnalytics.sasraCreditQuality.amounts.length, 5, "Must have exactly 5 SASRA classification buckets");
assert.strictEqual(homeAnalytics.sasraCreditQuality.labels.length, 5, "Must have exactly 5 labels");
assert.strictEqual(homeAnalytics.sasraCreditQuality.colors.length, 5, "Must have exactly 5 colors");
const sumCreditBuckets = homeAnalytics.sasraCreditQuality.amounts.reduce((a, b) => a + b, 0);
assert.strictEqual(Math.round(sumCreditBuckets), Math.round(homeAnalytics.portfolio.totalOutstanding), "Sum of 5 buckets must equal total outstanding loans");
console.log(`  ✓ Subtest 5D: SASRA Credit Quality Distribution: [${homeAnalytics.sasraCreditQuality.amounts.join(", ")}] sums to portfolio total.`);

// 5. Chama Asset Allocation
assert("assetAllocation" in homeAnalytics, "Must contain assetAllocation");
const alloc = homeAnalytics.assetAllocation;
assert("bankCash" in alloc, "Asset allocation must have bankCash");
assert("mmfEquivalents" in alloc, "Asset allocation must have mmfEquivalents");
assert("netLoans" in alloc, "Asset allocation must have netLoans");
assert("tangibleProjects" in alloc, "Asset allocation must have tangibleProjects");
assert("totalAssets" in alloc, "Asset allocation must have totalAssets");
assert(alloc.totalAssets > 0, "Total assets must be positive");
console.log(`  ✓ Subtest 5E: Chama Asset Allocation: Bank=${alloc.bankCash}, MMF=${alloc.mmfEquivalents}, Loans=${alloc.netLoans}, Projects=${alloc.tangibleProjects}, Total=${alloc.totalAssets}`);

// ==============================================================================
// TEST SUITE 6: Zero-Breakage of Existing RPC Signatures & Aliases
// ==============================================================================
console.log("\n--- TEST SUITE 6: Zero-Breakage of Existing RPC Signatures & Aliases ---");

// Test getPersonalFinancialsData contract
const pfData = vm.runInContext("getPersonalFinancialsData()", context);
assert.strictEqual(pfData.success, true);
assert("user" in pfData, "Must preserve 'user'");
assert("personalSummary" in pfData, "Must preserve 'personalSummary'");
assert("groupOverview" in pfData, "Must preserve 'groupOverview'");
assert("contributions" in pfData, "Must preserve 'contributions'");
assert("loans" in pfData, "Must preserve 'loans'");
assert("guaranteedLoans" in pfData, "Must preserve 'guaranteedLoans'");
console.log("  ✓ getPersonalFinancialsData() signature and base structure 100% preserved.");

// Test getHomeAnalyticsData and getDashboardOverviewData aliases
const homeData = vm.runInContext("getHomeAnalyticsData('year')", context);
assert.strictEqual(homeData.range, "year");
assert.strictEqual(homeData.cdr, homeAnalytics.cdr);

const dashData = vm.runInContext("getDashboardOverviewData('year')", context);
assert.strictEqual(dashData.range, "year");
assert.strictEqual(dashData.cdr, homeAnalytics.cdr);
console.log("  ✓ getHomeAnalyticsData() and getDashboardOverviewData() aliases functional.");

// Test getDashboardData stats enrichment
const legacyDash = vm.runInContext("getDashboardData()", context);
assert("stats" in legacyDash);
assert("cdr" in legacyDash.stats, "getDashboardData().stats must have cdr");
assert("isAboveSasraCap" in legacyDash.stats, "getDashboardData().stats must have isAboveSasraCap");
console.log(`  ✓ getDashboardData() returns stats with CDR (${legacyDash.stats.cdr}%, isAboveSasraCap: ${legacyDash.stats.isAboveSasraCap}).`);

console.log("\n===============================================================================");
console.log("   ALL ANA-1 FINANCIAL INTELLIGENCE & ACTUARIAL UX TESTS PASSED (100% GREEN)   ");
console.log("===============================================================================\n");
