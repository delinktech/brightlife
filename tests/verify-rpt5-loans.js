/**
 * Brightlife SHG - Test Suite for Task RPT-5
 * Individual Loan Schedule & Amortization Statement
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("===============================================================");
console.log("=== VERIFICATION TEST SUITE: TASK RPT-5 LOAN STATEMENT     ===");
console.log("===============================================================\n");

let passedChecks = 0;
let totalChecks = 0;

function check(desc, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// Helper: load JS inside an HTML script tag
function extractScript(htmlContent) {
  const match = htmlContent.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  return match ? match[1] : htmlContent;
}

const rootDir = path.resolve(__dirname, "..");
const loansServicePath = path.join(rootDir, "src", "server", "loans.service.js");
const loansUiPath = path.join(rootDir, "src", "client", "scripts", "loans.ui.js.html");
const printUiPath = path.join(rootDir, "src", "client", "scripts", "print.ui.js.html");

const loansServiceCode = fs.readFileSync(loansServicePath, "utf8");
const loansUiCode = extractScript(fs.readFileSync(loansUiPath, "utf8"));
const printUiCode = extractScript(fs.readFileSync(printUiPath, "utf8"));

// -------------------------------------------------------------
// SECTION 1: Backend Service Verification (loans.service.js)
// -------------------------------------------------------------
console.log("--- SECTION 1: Backend getLoanStatementData Service ---");

check("getLoanStatementData function exists in loans.service.js", () => {
  assert(loansServiceCode.includes("function getLoanStatementData(loanId)"), "getLoanStatementData function must exist");
});

check("Enforces RBAC via requireAccess_ and borrower matching", () => {
  assert(loansServiceCode.includes("requireAccess_()"), "Must call requireAccess_()");
  assert(loansServiceCode.includes("isMemberOnly"), "Must check isMemberOnly");
  assert(loansServiceCode.includes("Access denied: You can only view your own loan statement."), "Must throw exact error message on unauthorized access");
});

check("Retrieves loan, repayments, guarantors and builds verificationRef", () => {
  assert(loansServiceCode.includes("SHEETS.LOANS"), "Must read SHEETS.LOANS");
  assert(loansServiceCode.includes("SHEETS.LOAN_REPAYMENTS"), "Must read SHEETS.LOAN_REPAYMENTS");
  assert(loansServiceCode.includes("SHEETS.GUARANTORS"), "Must read SHEETS.GUARANTORS");
  assert(loansServiceCode.includes("BLG-LN-STMT-"), "Must construct BLG-LN-STMT- verification reference");
});

// Test execution of getLoanStatementData in mock environment
check("Execution test: RBAC blocks unauthorized member-only caller", () => {
  const sandbox = {
    requireAccess_: () => ({
      permissions: { isMemberOnly: true },
      memberId: "BLM-002",
      memberName: "Jane Doe"
    }),
    getSpreadsheet_: () => ({
      getSpreadsheetTimeZone: () => "Africa/Nairobi",
      getSheetByName: (name) => null
    }),
    getRequiredSheet_: (sheetName) => ({
      getDataRange: () => ({
        getValues: () => [
          ["Loan ID", "Borrower Name", "Member ID", "Requested Amount", "Interest", "Transaction Fee", "Approved Date", "Repayment Amount", "Total Paid", "Balance", "Status", "Reviewed By", "Approved By"],
          ["LN001", "John Smith", "BLM-001", 50000, 5000, 200, new Date("2026-01-15"), 55200, 20000, 35200, "Active", "treasurer@blg.org", "chair@blg.org"]
        ]
      })
    }),
    getHeaderMap_: (headers) => {
      const map = {};
      headers.forEach((h, i) => { map[h] = i; });
      return map;
    },
    requireHeaders_: () => true,
    formatDateValue_: (d, tz) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "")),
    Utilities: {
      formatDate: (d, tz, fmt) => "20261123"
    },
    LOAN_STATUS: { PENDING: "Pending Review" },
    SHEETS: { LOANS: "Loans", LOAN_REPAYMENTS: "Loan Repayments", GUARANTORS: "Guarantors", MEMBERS: "Members" },
    console: console
  };

  const script = new vm.Script(loansServiceCode + "\n; globalThis.getLoanStatementData = getLoanStatementData;");
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  assert.throws(
    () => {
      ctx.getLoanStatementData("LN001");
    },
    /Access denied: You can only view your own loan statement\./,
    "Should throw access denied for non-matching member"
  );
});

check("Execution test: Borrower can view own statement with sorted repayments and guarantors", () => {
  const sandbox = {
    requireAccess_: () => ({
      permissions: { isMemberOnly: true },
      memberId: "BLM-001",
      memberName: "John Smith"
    }),
    getSpreadsheet_: () => ({
      getSpreadsheetTimeZone: () => "Africa/Nairobi",
      getSheetByName: (name) => {
        if (name === "Loan Repayments") {
          return {
            getLastRow: () => 3,
            getDataRange: () => ({
              getValues: () => [
                ["Payment ID", "Loan ID", "Payment Date", "Principal Paid", "Interest Paid", "Fee Paid", "Total Paid", "Payment Mode", "Transaction ID", "Balance Remaining", "Status"],
                ["REP-002", "LN001", new Date("2026-03-01"), 10000, 1000, 0, 11000, "M-Pesa", "TID-002", 33200, "Approved"],
                ["REP-001", "LN001", new Date("2026-02-01"), 10000, 1000, 0, 11000, "Equity Bank", "TID-001", 44200, "Approved"]
              ]
            })
          };
        }
        if (name === "Guarantors") {
          return {
            getLastRow: () => 2,
            getDataRange: () => ({
              getValues: () => [
                ["Loan ID", "Member ID", "Guarantor Name", "Guaranteed Amount", "Status"],
                ["LN001", "BLM-005", "Alice Brown", 25000, "Active"]
              ]
            })
          };
        }
        return null;
      }
    }),
    getRequiredSheet_: (sheetName) => ({
      getDataRange: () => ({
        getValues: () => [
          ["Loan ID", "Borrower Name", "Member ID", "Requested Amount", "Interest", "Transaction Fee", "Approved Date", "Repayment Amount", "Total Paid", "Balance", "Status", "Reviewed By", "Approved By", "Disbursement Reference", "Disbursement Channel"],
          ["LN001", "John Smith", "BLM-001", 50000, 5000, 200, new Date("2026-01-15"), 55200, 22000, 33200, "Active", "reviewer@blg.org", "treasurer@blg.org", "TX-DISB-99", "Equity Bank"]
        ]
      })
    }),
    getHeaderMap_: (headers) => {
      const map = {};
      headers.forEach((h, i) => { map[h] = i; });
      return map;
    },
    requireHeaders_: () => true,
    formatDateValue_: (d, tz) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "")),
    Utilities: {
      formatDate: (d, tz, fmt) => "20261123"
    },
    LOAN_STATUS: { PENDING: "Pending Review" },
    SHEETS: { LOANS: "Loans", LOAN_REPAYMENTS: "Loan Repayments", GUARANTORS: "Guarantors", MEMBERS: "Members" },
    console: console
  };

  const script = new vm.Script(loansServiceCode + "\n; globalThis.getLoanStatementData = getLoanStatementData;");
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  const res = ctx.getLoanStatementData("LN001");
  assert(res && res.success === true, "Should succeed for authorized borrower");
  assert.strictEqual(res.loan.loanId, "LN001");
  assert.strictEqual(res.loan.borrower, "John Smith");
  assert.strictEqual(res.loan.memberId, "BLM-001");
  assert.strictEqual(res.loan.requested, 50000);
  assert.strictEqual(res.loan.repayment, 55200);
  assert.strictEqual(res.loan.interest, 5000);
  assert.strictEqual(res.loan.interestRate, "10%");
  assert.strictEqual(res.loan.paid, 22000);
  assert.strictEqual(res.loan.balance, 33200);
  assert.strictEqual(res.loan.disbursementRef, "TX-DISB-99");
  assert.strictEqual(res.loan.disbursementChannel, "Equity Bank");

  // Chronological sorting check: REP-001 (Feb 01) before REP-002 (Mar 01)
  assert.strictEqual(res.repayments.length, 2);
  assert.strictEqual(res.repayments[0].paymentId, "REP-001");
  assert.strictEqual(res.repayments[1].paymentId, "REP-002");

  // Guarantors check
  assert.strictEqual(res.guarantors.length, 1);
  assert.strictEqual(res.guarantors[0].guarantorName, "Alice Brown");
  assert.strictEqual(res.guarantors[0].amountPledged, 25000);
  assert.strictEqual(res.guarantors[0].status, "Active");

  // Verification ref check
  assert.strictEqual(res.verificationRef, "BLG-LN-STMT-LN001-20261123");
});

// -------------------------------------------------------------
// SECTION 2: Client UI Loans Table Actions (loans.ui.js.html)
// -------------------------------------------------------------
console.log("\n--- SECTION 2: Client UI Loans Table Actions ---");

check("renderLoanTable outputs Print button in col-l-actions for all loan states", () => {
  const dummyEl = {
    addEventListener: () => {},
    removeEventListener: () => {},
    innerHTML: "",
    value: ""
  };
  const tableBody = {
    innerHTML: "",
    set innerHTML(val) { this._val = val; },
    get innerHTML() { return this._val || ""; }
  };
  const dummyDoc = {
    innerHTML: "",
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => {
      if (id === "loan-table-body") {
        return tableBody;
      }
      return dummyEl;
    }
  };

  const sandbox = {
    document: dummyDoc,
    window: {
      APP_PERMS: { loanReview: true, loanDisburse: true, isAdmin: true, isMemberOnly: false },
      currentUser: { email: "treasurer@blg.org" }
    },
    formatMoney: (val) => "KES " + Number(val || 0).toLocaleString(),
    escapeHtmlAttr: (s) => String(s || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
    renderStatusPill: (s) => `<span>${s}</span>`,
    applySavedColumnPreferences: () => {},
    loadedLoans: [],
    console: console
  };

  const script = new vm.Script(loansUiCode + "\n; globalThis.renderLoanTable = renderLoanTable;");
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  // 1. Pending Review loan
  ctx.renderLoanTable([
    { id: "LN-PEND", borrower: "Bob", requested: 30000, repayment: 33000, paid: 0, balance: 33000, status: "Pending Review" }
  ]);
  assert(tableBody.innerHTML.includes("openPrintLoanStatement('LN-PEND')"), "Pending review loan must have print button");
  assert(tableBody.innerHTML.includes("Review</span>"), "Pending review loan retains Review button");

  // 2. Reviewed loan
  ctx.renderLoanTable([
    { id: "LN-REV", borrower: "Charlie", requested: 40000, repayment: 44000, paid: 0, balance: 44000, status: "Reviewed" }
  ]);
  assert(tableBody.innerHTML.includes("openPrintLoanStatement('LN-REV')"), "Reviewed loan must have print button");
  assert(tableBody.innerHTML.includes("Authorize</span>"), "Reviewed loan retains Authorize button");

  // 3. Active / Approved / Settled loan
  ctx.renderLoanTable([
    { id: "LN-ACT", borrower: "David", requested: 20000, repayment: 22000, paid: 10000, balance: 12000, status: "Active" },
    { id: "LN-SET", borrower: "Eve", requested: 10000, repayment: 11000, paid: 11000, balance: 0, status: "Settled" }
  ]);
  assert(tableBody.innerHTML.includes("openPrintLoanStatement('LN-ACT')"), "Active loan must have print button");
  assert(tableBody.innerHTML.includes("openPrintLoanStatement('LN-SET')"), "Settled loan must have print button");
});

check("Exports renderLoanTable and renderLoansTable to window", () => {
  assert(loansUiCode.includes("window.renderLoansTable = renderLoanTable;"), "Must export window.renderLoansTable");
});

// -------------------------------------------------------------
// SECTION 3: Client UI Print Statement (print.ui.js.html)
// -------------------------------------------------------------
console.log("\n--- SECTION 3: Client UI Print Loan Statement Modal ---");

check("openPrintLoanStatement and renderPrintLoanStatementFromData_ exported to window", () => {
  assert(printUiCode.includes("window.openPrintLoanStatement = openPrintLoanStatement;"), "Must export openPrintLoanStatement");
  assert(printUiCode.includes("window.renderPrintLoanStatementFromData_ = renderPrintLoanStatementFromData_;"), "Must export renderPrintLoanStatementFromData_");
});

check("renderPrintLoanStatementFromData_ populates Header, 4-Up KPIs, Terms, Guarantors, Repayment Ledger, Sign-off", () => {
  const elements = {};
  function getOrCreate(id) {
    if (!elements[id]) {
      elements[id] = {
        textContent: "",
        className: "",
        innerHTML: "",
        classList: {
          classes: new Set(),
          add(c) { this.classes.add(c); },
          remove(c) { this.classes.delete(c); },
          toggle(c, force) { if (force !== undefined) { if (force) this.classes.add(c); else this.classes.delete(c); } else { if (this.classes.has(c)) this.classes.delete(c); else this.classes.add(c); } }
        }
      };
    }
    return elements[id];
  }

  const dummyDoc = {
    getElementById: (id) => getOrCreate(id),
    body: { classList: { add() {}, remove() {} } }
  };

  const sandbox = {
    document: dummyDoc,
    window: {},
    formatDateForLetterhead: () => "23 November 2026",
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    console: console
  };

  const script = new vm.Script(printUiCode + "\n; globalThis.renderPrintLoanStatementFromData_ = renderPrintLoanStatementFromData_;");
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  const sampleData = {
    success: true,
    loan: {
      loanId: "LN-2026-0042",
      memberId: "BLM-008",
      borrower: "Grace Hopper",
      requested: 100000,
      repayment: 110000,
      interest: 10000,
      interestRate: "10%",
      paid: 55000,
      balance: 55000,
      requestDate: "10 Jan 2026",
      approvedDate: "15 Jan 2026",
      disbursedDate: "16 Jan 2026",
      status: "Active",
      reviewedBy: "credit_chair@blg.org",
      authorizedBy: "treasurer@blg.org",
      disbursementRef: "EQB-TX-9901",
      disbursementChannel: "Equity Bank"
    },
    repayments: [
      {
        paymentId: "PAY-01",
        date: "16 Feb 2026",
        tid: "MPESA-01",
        principalPaid: 25000,
        interestPaid: 2500,
        feePaid: 0,
        totalPaid: 27500,
        mode: "M-Pesa",
        balanceRemaining: 82500,
        status: "Approved"
      },
      {
        paymentId: "PAY-02",
        date: "16 Mar 2026",
        tid: "MPESA-02",
        principalPaid: 25000,
        interestPaid: 2500,
        feePaid: 0,
        totalPaid: 27500,
        mode: "M-Pesa",
        balanceRemaining: 55000,
        status: "Approved"
      }
    ],
    guarantors: [
      { memberId: "BLM-001", guarantorName: "John Smith", amountPledged: 50000, status: "Active" },
      { memberId: "BLM-002", guarantorName: "Jane Doe", amountPledged: 50000, status: "Active" }
    ],
    verificationRef: "BLG-LN-STMT-LN20260042-20261123"
  };

  ctx.renderPrintLoanStatementFromData_(sampleData);

  // 1. Header & Metadata
  assert.strictEqual(elements["print-report-title"].textContent, "LOAN ACCOUNT STATEMENT & AMORTIZATION SCHEDULE");
  assert.strictEqual(elements["print-report-badge"].textContent, "Active");
  assert(elements["print-report-badge"].className.includes("bg-sky-100"), "Active loan badge must have sky semantic color");
  assert(elements["print-report-subtitle"].textContent.includes("LN-2026-0042"));
  assert(elements["print-report-subtitle"].textContent.includes("Grace Hopper"));
  assert.strictEqual(elements["print-ref-display"].textContent, "Ref: BLG-LN-STMT-LN20260042-20261123");

  // 2. 4-Up KPI Row & Terms Matrix
  const kpiHtml = elements["print-kpi-row"].innerHTML;
  assert(kpiHtml.includes("Principal Facility"), "Must render Principal Facility KPI card");
  assert(kpiHtml.includes("Total Repayment Due"), "Must render Total Repayment Due KPI card");
  assert(kpiHtml.includes("Amount Repaid to Date"), "Must render Amount Repaid to Date KPI card");
  assert(kpiHtml.includes("Outstanding Payoff Balance"), "Must render Outstanding Payoff Balance KPI card");
  assert(kpiHtml.includes("Borrower &amp; Member ID") || kpiHtml.includes("Borrower"), "Must render Loan Terms & Parameters Matrix");
  assert(kpiHtml.includes("Interest Rate"), "Must render Interest Rate parameter");
  assert(kpiHtml.includes("10.0% Flat") || kpiHtml.includes("10%"), "Must show 10% Flat interest rate");

  // 3. Itemized Repayment Ledger Table
  const tableHead = elements["print-table-head"].innerHTML;
  assert(tableHead.includes("Payment Date"), "Table must include Payment Date column");
  assert(tableHead.includes("Ref / TID"), "Table must include Ref / TID column");
  assert(tableHead.includes("Principal Paid (KES)"), "Table must include Principal Paid column");
  assert(tableHead.includes("Interest Paid (KES)"), "Table must include Interest Paid column");
  assert(tableHead.includes("Total Paid (KES)"), "Table must include Total Paid column");
  assert(tableHead.includes("Balance Remaining (KES)"), "Table must include Balance Remaining column");

  const tableBody = elements["print-table-body"].innerHTML;
  assert(tableBody.includes("Disbursed Facility"), "Row 1 must be initial Disbursed Facility opening balance");
  assert(tableBody.includes("MPESA-01"), "Must itemize repayment 1");
  assert(tableBody.includes("MPESA-02"), "Must itemize repayment 2");

  const tableFoot = elements["print-table-foot"].innerHTML;
  assert(tableFoot.includes("Total Repayments &amp; Certified Final Balance"), "Footer must have certification label");
  assert(tableFoot.includes("border-double"), "Footer must have certified double underline style");

  // 4. Guarantor Security Schedule
  const extraHtml = elements["print-extra-schedules"].innerHTML;
  assert(extraHtml.includes("Guarantor Security Schedule"), "Must render Guarantor Security Schedule");
  assert(extraHtml.includes("John Smith"), "Must list guarantor John Smith");
  assert(extraHtml.includes("Jane Doe"), "Must list guarantor Jane Doe");
  assert(extraHtml.includes("Total Guaranteed Sum") || extraHtml.includes("Total Security Pledged"), "Must show total guaranteed security");

  // 5. Credit Committee & Treasurer Sign-off Block
  const signoffHtml = elements["print-treasurer-signoff-block"].innerHTML;
  assert(
    signoffHtml.includes("Certified as a true and complete loan statement from the Bright Life Self Help Group Credit Ledger"),
    "Must include exact certification statement"
  );
  assert(signoffHtml.includes("Credit Committee Reviewer"), "Must include Credit Committee Reviewer signature line");
  assert(signoffHtml.includes("Group Treasurer"), "Must include Group Treasurer signature line");
  assert(signoffHtml.includes("BLG-LN-STMT-LN20260042-20261123"), "Must include verification ref in signoff");
});

check("XSS and HTML injection prevention on dynamic values", () => {
  const elements = {};
  function getOrCreate(id) {
    if (!elements[id]) {
      elements[id] = {
        textContent: "",
        className: "",
        innerHTML: "",
        classList: { add() {}, remove() {}, toggle() {} }
      };
    }
    return elements[id];
  }

  const dummyDoc = {
    getElementById: (id) => getOrCreate(id),
    body: { classList: { add() {}, remove() {} } }
  };

  const sandbox = {
    document: dummyDoc,
    window: {},
    formatDateForLetterhead: () => "23 November 2026",
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    console: console
  };

  const script = new vm.Script(printUiCode + "\n; globalThis.renderPrintLoanStatementFromData_ = renderPrintLoanStatementFromData_;");
  const ctx = vm.createContext(sandbox);
  script.runInContext(ctx);

  const hostileData = {
    success: true,
    loan: {
      loanId: '<script>alert("loanId")</script>',
      memberId: 'BLM-008"><img src=x onerror=alert(1)>',
      borrower: 'Malicious <script>alert("user")</script>',
      requested: 10000,
      repayment: 11000,
      interest: 1000,
      paid: 5000,
      balance: 6000,
      status: "Active",
      reviewedBy: '<svg onload=alert(1)>',
      authorizedBy: 'Treasurer <b onmouseover=alert(1)>',
      disbursementRef: 'REF"><script>alert(2)</script>',
      disbursementChannel: 'Channel <script>alert(3)</script>'
    },
    repayments: [
      {
        paymentId: "PAY-01",
        date: "2026-01-01",
        tid: '<script>alert("tid")</script>',
        principalPaid: 5000,
        interestPaid: 0,
        feePaid: 0,
        totalPaid: 5000,
        mode: '<img src=x onerror=alert(4)>',
        balanceRemaining: 6000,
        status: "Approved"
      }
    ],
    guarantors: [
      { memberId: "BLM-001", guarantorName: 'Evil <script>alert("guar")</script>', amountPledged: 5000, status: "Active" }
    ],
    verificationRef: 'BLG-LN-STMT-MALICIOUS<script>'
  };

  ctx.renderPrintLoanStatementFromData_(hostileData);

  const allRenderedHtml = [
    elements["print-kpi-row"].innerHTML,
    elements["print-table-body"].innerHTML,
    elements["print-table-foot"].innerHTML,
    elements["print-extra-schedules"].innerHTML,
    elements["print-treasurer-signoff-block"].innerHTML
  ].join("\n");

  assert(!allRenderedHtml.includes("<script>"), "Raw <script> tags must not exist in rendered HTML");
  assert(!allRenderedHtml.includes("<img src=x"), "Raw <img> tags must not exist in rendered HTML");
  assert(!allRenderedHtml.includes("<svg onload="), "Raw <svg> tags must not exist in rendered HTML");
});

console.log("\n===============================================================");
console.log(`>>> VERIFICATION COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED <<<`);
console.log("===============================================================");
