/**
 * Verification test for Task UI-3: Advanced Ledger Multi-Sort & Filter Presets
 * Covers Contributions, Loans, and Members ledgers.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("=================================================================");
console.log("=== VERIFYING TASK UI-3: ADVANCED LEDGER MULTI-SORT & PRESETS ===");
console.log("=================================================================\n");

function extractScript(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.replace(/<script[^>]*>/, "").replace(/<\/script>/, "");
}

// -------------------------------------------------------------
// 1. Syntax Check
// -------------------------------------------------------------
console.log("--- TEST 1: Client Script Syntax Validation ---");
const clientScripts = [
  "group-dashboard/src/client/scripts/contributions.ui.js.html",
  "group-dashboard/src/client/scripts/loans.ui.js.html",
  "group-dashboard/src/client/scripts/members.ui.js.html"
];

clientScripts.forEach((file) => {
  const code = extractScript(file);
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: file });
  }, `Syntax error in ${file}`);
  console.log(`  ✓ Syntax OK: ${file}`);
});

// -------------------------------------------------------------
// 2. HTML View Structure Checks
// -------------------------------------------------------------
console.log("\n--- TEST 2: HTML View Template Markup Checks ---");

const contribHtml = fs.readFileSync("group-dashboard/src/client/views/Contributions.html", "utf8");
const loansHtml = fs.readFileSync("group-dashboard/src/client/views/Loans.html", "utf8");
const membersHtml = fs.readFileSync("group-dashboard/src/client/views/Members.html", "utf8");

// Contributions checks
assert(contribHtml.includes("exportContributionsCSV()"), "Contributions.html must contain exportContributionsCSV()");
assert(contribHtml.includes("contributions-preset-bar"), "Contributions.html must contain contributions-preset-bar");
assert(contribHtml.includes("c-preset-this_month"), "Contributions.html must contain this_month preset");
assert(contribHtml.includes("c-preset-savings"), "Contributions.html must contain savings preset");
assert(contribHtml.includes("c-preset-loan_repayments"), "Contributions.html must contain loan_repayments preset");
assert(contribHtml.includes("c-preset-unallocated"), "Contributions.html must contain unallocated preset");
assert(contribHtml.includes("c-preset-large"), "Contributions.html must contain large preset");
assert(contribHtml.includes("sortContributions('date')"), "Contributions.html must have sortable date header");
assert(contribHtml.includes("sortContributions('amount')"), "Contributions.html must have sortable amount header");
console.log("  ✓ Contributions.html markup validated");

// Loans checks
assert(loansHtml.includes("exportLoansCSV()"), "Loans.html must contain exportLoansCSV()");
assert(loansHtml.includes("loans-preset-bar"), "Loans.html must contain loans-preset-bar");
assert(loansHtml.includes("l-preset-active"), "Loans.html must contain active preset");
assert(loansHtml.includes("l-preset-overdue"), "Loans.html must contain overdue preset");
assert(loansHtml.includes("l-preset-settled"), "Loans.html must contain settled preset");
assert(loansHtml.includes("l-preset-pending"), "Loans.html must contain pending preset");
assert(loansHtml.includes("sortLoans('id')"), "Loans.html must have sortable ID header");
assert(loansHtml.includes("sortLoans('balance')"), "Loans.html must have sortable balance header");
console.log("  ✓ Loans.html markup validated");

// Members checks
assert(membersHtml.includes("exportMembersCSV()"), "Members.html must contain exportMembersCSV()");
assert(membersHtml.includes("members-preset-bar"), "Members.html must contain members-preset-bar");
assert(membersHtml.includes("m-preset-active"), "Members.html must contain active members preset");
assert(membersHtml.includes("m-preset-borrowers"), "Members.html must contain borrowers preset");
assert(membersHtml.includes("m-preset-officers"), "Members.html must contain officers preset");
assert(membersHtml.includes("m-preset-dormant"), "Members.html must contain dormant preset");
assert(membersHtml.includes("sortMembers('name')"), "Members.html must have sortable member name header");
assert(membersHtml.includes("sortMembers('savings')"), "Members.html must have sortable savings header");
console.log("  ✓ Members.html markup validated");

// -------------------------------------------------------------
// 3. Functional Execution Tests: Contributions Sorting & Presets
// -------------------------------------------------------------
console.log("\n--- TEST 3: Contributions Ledger Multi-Sort & Presets ---");

function createMockDom() {
  const elements = {};
  return {
    document: {
      getElementById: (id) => {
        if (!elements[id]) {
          elements[id] = {
            id,
            value: "",
            innerText: "",
            innerHTML: "",
            className: "",
            classList: {
              contains: () => false,
              add: () => {},
              remove: () => {},
              toggle: () => {}
            },
            setAttribute: () => {},
            getAttribute: () => "",
            querySelector: () => ({ innerHTML: "" }),
            querySelectorAll: () => [],
            addEventListener: () => {},
            removeEventListener: () => {}
          };
        }
        return elements[id];
      },
      querySelectorAll: (sel) => {
        return Object.values(elements).filter(el => (el.className || "").includes(sel.replace(".", "")));
      },
      createElement: (tag) => ({
        tag,
        click: () => {},
        setAttribute: () => {},
        classList: { add: () => {}, remove: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {}
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
      body: { appendChild: () => {}, removeChild: () => {} }
    },
    elements
  };
}

const mockDomC = createMockDom();
const sandboxC = {
  window: {},
  document: mockDomC.document,
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Intl: Intl,
  renderStatusPill: (s) => `<span>${s}</span>`,
  renderTablePagination: () => {},
  showNotification: (msg, type) => { sandboxC.lastNotice = { msg, type }; }
};
sandboxC.window = sandboxC;

vm.createContext(sandboxC);
vm.runInContext(extractScript("group-dashboard/src/client/scripts/contributions.ui.js.html"), sandboxC);

const now = new Date();
const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
const sampleContributions = [
  { rowNumber: 1, date: currentMonthStr, name: "Alice Mwangi", memberId: "BLM-01", type: "Monthly Contribution", amountRaw: 5000, amount: "KES 5,000", mode: "Equity Bank", status: "Approved" },
  { rowNumber: 2, date: "2025-01-10", name: "Bob Otieno", memberId: "BLM-02", type: "Loan Payment", amountRaw: 12000, amount: "KES 12,000", mode: "Cash", status: "Approved" },
  { rowNumber: 3, date: currentMonthStr, name: "Unallocated Depositor", memberId: "", type: "Deposit", amountRaw: 3000, amount: "KES 3,000", mode: "Equity Bank", status: "Pending" },
  { rowNumber: 4, date: "2025-02-15", name: "Catherine Kamau", memberId: "BLM-03", type: "Monthly Contribution", amountRaw: 15000, amount: "KES 15,000", mode: "CIC MMF", status: "Approved" }
];

sandboxC.applyContributionsData({ contributions: sampleContributions.slice() });

assert.strictEqual(mockDomC.document.getElementById("c-count-all").innerText, 4);
assert.strictEqual(mockDomC.document.getElementById("c-count-this_month").innerText, 2);
assert.strictEqual(mockDomC.document.getElementById("c-count-savings").innerText, 3);
assert.strictEqual(mockDomC.document.getElementById("c-count-loan_repayments").innerText, 1);
assert.strictEqual(mockDomC.document.getElementById("c-count-unallocated").innerText, 1);
assert.strictEqual(mockDomC.document.getElementById("c-count-large").innerText, 2);
console.log("  ✓ Contributions preset counts correctly calculated");

// Test Preset Filtering
sandboxC.setContributionPreset("loan_repayments");
assert.strictEqual(sandboxC.filteredContributions.length, 1);
assert.strictEqual(sandboxC.filteredContributions[0].name, "Bob Otieno");
console.log("  ✓ Contributions preset 'loan_repayments' filtered correctly");

sandboxC.setContributionPreset("large");
assert.strictEqual(sandboxC.filteredContributions.length, 2);
assert(sandboxC.filteredContributions.every(c => c.amountRaw >= 10000));
console.log("  ✓ Contributions preset 'large' filtered correctly");

// Test Column Sorting
sandboxC.setContributionPreset("all");
sandboxC.sortContributions("amount"); // asc
assert.strictEqual(sandboxC.filteredContributions[0].amountRaw, 3000);
assert.strictEqual(sandboxC.filteredContributions[3].amountRaw, 15000);
console.log("  ✓ Contributions amount ascending sort OK");

sandboxC.sortContributions("amount"); // desc
assert.strictEqual(sandboxC.filteredContributions[0].amountRaw, 15000);
assert.strictEqual(sandboxC.filteredContributions[3].amountRaw, 3000);
console.log("  ✓ Contributions amount descending sort OK");

sandboxC.sortContributions("amount"); // neutral / null
assert.strictEqual(sandboxC.contributionSortDirection, null);
console.log("  ✓ Contributions sort reset to neutral OK");

// -------------------------------------------------------------
// 4. Functional Execution Tests: Loans Sorting & Presets
// -------------------------------------------------------------
console.log("\n--- TEST 4: Loans Ledger Multi-Sort & Presets ---");

const mockDomL = createMockDom();
const sandboxL = {
  window: {},
  document: mockDomL.document,
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Intl: Intl,
  formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
  renderStatusPill: (s) => `<span>${s}</span>`,
  renderTablePagination: () => {},
  showNotification: (msg, type) => { sandboxL.lastNotice = { msg, type }; }
};
sandboxL.window = sandboxL;

vm.createContext(sandboxL);
vm.runInContext(extractScript("group-dashboard/src/client/scripts/loans.ui.js.html"), sandboxL);

const sampleLoans = [
  { id: "LN-001", borrower: "David Kimani", memberId: "BLM-04", date: "2026-01-01", approveddate: "2026-01-05", requested: 50000, repayment: 55000, paid: 20000, balance: 35000, status: "Active", tenorMonths: 12 },
  { id: "LN-002", borrower: "Esther Wanjiku", memberId: "BLM-05", date: "2024-01-01", approveddate: "2024-01-05", requested: 30000, repayment: 33000, paid: 5000, balance: 28000, status: "Active", tenorMonths: 6 }, // overdue
  { id: "LN-003", borrower: "Francis Njoroge", memberId: "BLM-06", date: "2025-06-01", approveddate: "2025-06-05", requested: 40000, repayment: 44000, paid: 44000, balance: 0, status: "Settled", tenorMonths: 12 },
  { id: "LN-004", borrower: "Grace Achieng", memberId: "BLM-07", date: "2026-02-01", approveddate: "", requested: 80000, repayment: 88000, paid: 0, balance: 88000, status: "Pending Review", tenorMonths: 12 }
];

sandboxL.applyLoansData({ loans: sampleLoans.slice() });

assert.strictEqual(mockDomL.document.getElementById("l-count-all").innerText, 4);
assert.strictEqual(mockDomL.document.getElementById("l-count-active").innerText, 2);
assert.strictEqual(mockDomL.document.getElementById("l-count-overdue").innerText, 1);
assert.strictEqual(mockDomL.document.getElementById("l-count-settled").innerText, 1);
assert.strictEqual(mockDomL.document.getElementById("l-count-pending").innerText, 1);
console.log("  ✓ Loans preset counts correctly calculated");

// Test Preset Filtering
sandboxL.setLoanPreset("overdue");
assert.strictEqual(sandboxL.filteredLoans.length, 1);
assert.strictEqual(sandboxL.filteredLoans[0].id, "LN-002");
console.log("  ✓ Loans preset 'overdue' filtered correctly");

sandboxL.setLoanPreset("settled");
assert.strictEqual(sandboxL.filteredLoans.length, 1);
assert.strictEqual(sandboxL.filteredLoans[0].id, "LN-003");
console.log("  ✓ Loans preset 'settled' filtered correctly");

// Test Column Sorting
sandboxL.setLoanPreset("all");
sandboxL.sortLoans("balance"); // asc
assert.strictEqual(sandboxL.filteredLoans[0].balance, 0);
assert.strictEqual(sandboxL.filteredLoans[3].balance, 88000);
console.log("  ✓ Loans balance ascending sort OK");

sandboxL.sortLoans("balance"); // desc
assert.strictEqual(sandboxL.filteredLoans[0].balance, 88000);
assert.strictEqual(sandboxL.filteredLoans[3].balance, 0);
console.log("  ✓ Loans balance descending sort OK");

// -------------------------------------------------------------
// 5. Functional Execution Tests: Members Sorting & Presets
// -------------------------------------------------------------
console.log("\n--- TEST 5: Members Directory Multi-Sort & Presets ---");

const mockDomM = createMockDom();
const sandboxM = {
  window: {},
  document: mockDomM.document,
  console: console,
  Date: Date,
  Math: Math,
  Number: Number,
  String: String,
  Array: Array,
  Intl: Intl,
  formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
  renderStatusPill: (s) => `<span>${s}</span>`,
  renderTablePagination: () => {},
  currentRoles: [
    { email: "treasurer@brightlife.org", memberId: "BLM-01", roleKey: "treasurer" },
    { email: "chair@brightlife.org", memberId: "BLM-02", roleKey: "chairperson" }
  ],
  showNotification: (msg, type) => { sandboxM.lastNotice = { msg, type }; }
};
sandboxM.window = sandboxM;

vm.createContext(sandboxM);
vm.runInContext(extractScript("group-dashboard/src/client/scripts/members.ui.js.html"), sandboxM);

const sampleMembers = [
  { id: "BLM-01", name: "John Doe", savings: 100000, sharesPercent: "10.00", totalLoanTaken: 0, loanBalance: 0, guaranteed: 0, availableToGuarantee: 100000, maxLoanEligibility: 200000, status: "Active" },
  { id: "BLM-02", name: "Jane Smith", savings: 250000, sharesPercent: "25.00", totalLoanTaken: 50000, loanBalance: 30000, guaranteed: 20000, availableToGuarantee: 200000, maxLoanEligibility: 430000, status: "Active" },
  { id: "BLM-03", name: "Hassan Ali", savings: 50000, sharesPercent: "5.00", totalLoanTaken: 0, loanBalance: 0, guaranteed: 0, availableToGuarantee: 50000, maxLoanEligibility: 100000, status: "Inactive" }
];

sandboxM.applyMembersData(sampleMembers.slice());

assert.strictEqual(mockDomM.document.getElementById("m-count-all").innerText, 3);
assert.strictEqual(mockDomM.document.getElementById("m-count-active").innerText, 2);
assert.strictEqual(mockDomM.document.getElementById("m-count-borrowers").innerText, 1);
assert.strictEqual(mockDomM.document.getElementById("m-count-officers").innerText, 2); // John Doe & Jane Smith in currentRoles
assert.strictEqual(mockDomM.document.getElementById("m-count-dormant").innerText, 1); // Hassan Ali
console.log("  ✓ Members preset counts correctly calculated");

// Test Preset Filtering
sandboxM.setMemberPreset("borrowers");
assert.strictEqual(sandboxM.filteredMembers.length, 1);
assert.strictEqual(sandboxM.filteredMembers[0].name, "Jane Smith");
console.log("  ✓ Members preset 'borrowers' filtered correctly");

sandboxM.setMemberPreset("officers");
assert.strictEqual(sandboxM.filteredMembers.length, 2);
console.log("  ✓ Members preset 'officers' filtered correctly");

// Test Column Sorting
sandboxM.setMemberPreset("all");
sandboxM.sortMembers("savings"); // asc
assert.strictEqual(sandboxM.filteredMembers[0].savings, 50000);
assert.strictEqual(sandboxM.filteredMembers[2].savings, 250000);
console.log("  ✓ Members savings ascending sort OK");

sandboxM.sortMembers("savings"); // desc
assert.strictEqual(sandboxM.filteredMembers[0].savings, 250000);
assert.strictEqual(sandboxM.filteredMembers[2].savings, 50000);
console.log("  ✓ Members savings descending sort OK");

// -------------------------------------------------------------
// 6. Formula Injection (CSV Injection) Protection Checks
// -------------------------------------------------------------
console.log("\n--- TEST 6: Formula Injection Protection Defense ---");

function testCsvSanitizer(sanitizerFn, name) {
  const maliciousValues = [
    "=1+1",
    "-5+2",
    "+CMD('calc')",
    "@SUM(A1:A10)",
    "\tmalicious",
    "\rmalicious"
  ];
  maliciousValues.forEach((val) => {
    const sanitized = sanitizerFn(val);
    assert(
      sanitized.startsWith("\"'") || sanitized.startsWith("'"),
      `${name} failed to neutralize formula prefix for value: ${val} (got: ${sanitized})`
    );
  });
  // Safe values
  assert.strictEqual(sanitizerFn("KES 5,000"), '"KES 5,000"');
  assert.strictEqual(sanitizerFn("Standard Name"), '"Standard Name"');
  console.log(`  ✓ ${name} neutralized all formula injection vectors (=, +, -, @, \\t, \\r)`);
}

testCsvSanitizer(sandboxC.sanitizeContributionCsvCell, "sanitizeContributionCsvCell");
testCsvSanitizer(sandboxL.sanitizeLoanCsvCell, "sanitizeLoanCsvCell");
testCsvSanitizer(sandboxM.sanitizeMemberCsvCell, "sanitizeMemberCsvCell");

console.log("\n=================================================================");
console.log("=== ALL 6 SUITES PASSED: TASK UI-3 FULLY VERIFIED ===");
console.log("=================================================================");
