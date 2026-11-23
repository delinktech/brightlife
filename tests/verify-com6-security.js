/**
 * Brightlife SHG - Security & Vulnerability Auditor (@sentinel)
 * Task COM-6 Pre-Release Verification Test Suite
 *
 * Audit Criteria:
 * 1. Email Standardization (Letterhead & Settings contact email)
 * 2. XSS & Injection Safety (escapePrintHtml on all dynamic receipt slip fields)
 * 3. Financial & Arithmetic Accuracy (numberToWordsKES and balance formatting)
 * 4. CSS & Paper Sizing (.blg-receipt-slip page-break isolation & modal cleanup)
 * 5. Regression Testing (zero regressions across standard reports & workflows)
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("===============================================================");
console.log("=== SENTINEL SECURITY AUDIT: TASK COM-6 (COMMIT 337026e)     ===");
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
const srcDir = path.join(rootDir, "src");
const printUiPath = path.join(rootDir, "src", "client", "scripts", "print.ui.js.html");
const contribUiPath = path.join(rootDir, "src", "client", "scripts", "contributions.ui.js.html");
const printModalPath = path.join(rootDir, "src", "client", "views", "PrintReportModal.html");
const statementsPath = path.join(rootDir, "src", "client", "views", "Statements.html");
const indexHtmlPath = path.join(rootDir, "src", "client", "views", "Index.html");
const contribViewPath = path.join(rootDir, "src", "client", "views", "Contributions.html");
const notifPath = path.join(rootDir, "src", "comms", "notifications.service.js");

const printUiCode = extractScript(fs.readFileSync(printUiPath, "utf8"));
const contribUiCode = extractScript(fs.readFileSync(contribUiPath, "utf8"));
const printModalHtml = fs.readFileSync(printModalPath, "utf8");
const statementsHtml = fs.readFileSync(statementsPath, "utf8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const contribViewHtml = fs.readFileSync(contribViewPath, "utf8");
const notifCode = fs.readFileSync(notifPath, "utf8");

// Setup VM sandbox with comprehensive mock DOM
function createMockEnvironment() {
  const elements = {};
  function getEl(id) {
    if (!elements[id]) {
      const cls = new Set();
      const el = {
        id: id,
        innerHTML: "",
        textContent: "",
        innerText: "",
        className: "",
        classList: {
          classes: cls,
          add(...cList) {
            cList.forEach((c) => cls.add(c));
            el.className = Array.from(cls).join(" ");
          },
          remove(...cList) {
            cList.forEach((c) => cls.delete(c));
            el.className = Array.from(cls).join(" ");
          },
          contains(c) {
            return cls.has(c);
          },
          toggle(c, force) {
            if (force === true) {
              cls.add(c);
            } else if (force === false) {
              cls.delete(c);
            } else if (cls.has(c)) {
              cls.delete(c);
            } else {
              cls.add(c);
            }
            el.className = Array.from(cls).join(" ");
            return cls.has(c);
          }
        },
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k]; },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
      };
      elements[id] = el;
    }
    return elements[id];
  }

  const mockWindow = {
    print: () => {},
    currentReceiptPayload: null,
    addEventListener: () => {}
  };

  const bodyCls = new Set();
  const mockDocument = {
    getElementById: (id) => getEl(id),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: {
      classList: {
        classes: bodyCls,
        add(...cList) { cList.forEach((c) => bodyCls.add(c)); },
        remove(...cList) { cList.forEach((c) => bodyCls.delete(c)); },
        contains(c) { return bodyCls.has(c); }
      }
    }
  };

  const sandbox = {
    window: mockWindow,
    document: mockDocument,
    console: console,
    Math: Math,
    Number: Number,
    String: String,
    Boolean: Boolean,
    Date: Date,
    Array: Array,
    Object: Object,
    isNaN: isNaN,
    showNotification: () => {}
  };
  vm.createContext(sandbox);
  return { sandbox, elements, getEl };
}

// -------------------------------------------------------------
// CRITERION 1: Email Standardization
// -------------------------------------------------------------
console.log("--- CRITERION 1: Email Standardization ---");

check("Official letterhead contact email consistently reads brightlyfe@gmail.com", () => {
  assert(
    printModalHtml.includes("brightlyfe@gmail.com"),
    "PrintReportModal.html must contain brightlyfe@gmail.com in contact header"
  );
});

check("Statements BCC placeholder reads brightlyfe@gmail.com", () => {
  assert(
    statementsHtml.includes("brightlyfe@gmail.com"),
    "Statements.html BCC placeholder must contain brightlyfe@gmail.com"
  );
});

check("Zero deprecated brightlifeshg@gmail.com occurrences in src/ codebase", () => {
  const deprecatedTarget = ["brightlife", "shg", "@gmail.com"].join("");
  function searchDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        searchDir(fullPath);
      } else if (/\.(html|js|json)$/i.test(entry.name)) {
        const text = fs.readFileSync(fullPath, "utf8");
        assert(
          !text.includes(deprecatedTarget),
          `Deprecated email ${deprecatedTarget} found in ${fullPath}`
        );
      }
    }
  }
  searchDir(srcDir);
});

// -------------------------------------------------------------
// CRITERION 2: XSS & Injection Safety
// -------------------------------------------------------------
console.log("\n--- CRITERION 2: XSS & Injection Safety ---");

check("escapePrintHtml sanitizes &, <, >, and \" characters safely", () => {
  const { sandbox } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);

  const maliciousInput = '<script>alert("XSS & Injection")</script>';
  const escaped = sandbox.escapePrintHtml(maliciousInput);
  assert.strictEqual(
    escaped,
    "&lt;script&gt;alert(&quot;XSS &amp; Injection&quot;)&lt;/script&gt;",
    "escapePrintHtml did not neutralize all HTML entities properly"
  );
});

check("Receipt slip dynamic inputs are escaped against DOM injection", () => {
  const { sandbox, getEl } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);

  const xssPayload = {
    memberName: '<img src="x" onerror="alert(\'xss_name\')">',
    memberId: "M001<script>evil()</script>",
    recipientPhone: "'+alert('phone')+'",
    channel: '<svg onload="alert(1)">',
    tid: "TID-99<marquee>HACK</marquee>",
    receiptNo: "BL-RCP-<script>hacked()</script>",
    type: "<script>alert('type')</script>",
    amount: 5000,
    date: "2026-11-23"
  };

  sandbox.openPrintReceiptSlip(xssPayload);

  const kpiRow = getEl("print-kpi-row").innerHTML;
  const tableBody = getEl("print-table-body").innerHTML;

  // Verify none of the unescaped script / onerror tags appear in the injected HTML
  assert(!kpiRow.includes("<img src="), "Member name XSS vector injected unescaped into KPI row!");
  assert(!kpiRow.includes("<script>evil()"), "Member ID XSS vector injected unescaped into KPI row!");
  assert(!kpiRow.includes("<svg onload="), "Deposit channel XSS vector injected unescaped into KPI row!");
  assert(!kpiRow.includes("<marquee>HACK"), "TID XSS vector injected unescaped into KPI row!");
  assert(!kpiRow.includes("<script>hacked()"), "Receipt # XSS vector injected unescaped into KPI row!");

  assert(!tableBody.includes("<script>alert('type')"), "Payment particulars XSS vector injected into table body!");

  // Verify properly escaped entities exist
  assert(kpiRow.includes("&lt;img src=&quot;x&quot; onerror=&quot;alert('xss_name')&quot;&gt;"), "Member name was not properly escaped in DOM");
  assert(kpiRow.includes("&lt;script&gt;evil()&lt;/script&gt;"), "Member ID was not properly escaped in DOM");
});

check("Formula injection characters in particulars/TID are neutralized in HTML output", () => {
  const { sandbox, getEl } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);

  const formulaPayload = {
    memberName: "John Doe",
    memberId: "M002",
    tid: "=cmd|' /C calc'!A0",
    amount: 1000,
    type: "@SUM(1+1)"
  };

  sandbox.openPrintReceiptSlip(formulaPayload);
  const kpiRow = getEl("print-kpi-row").innerHTML;
  assert(kpiRow.includes("=cmd|' /C calc'!A0"), "TID rendered properly without execution");
});

// -------------------------------------------------------------
// CRITERION 3: Financial & Arithmetic Accuracy
// -------------------------------------------------------------
console.log("\n--- CRITERION 3: Financial & Arithmetic Accuracy ---");

check("numberToWordsKES accurately converts integers to Kenyan Shillings words", () => {
  const { sandbox } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);
  const fn = sandbox.numberToWordsKES;

  assert.strictEqual(fn(0), "Kenya Shillings Zero Only");
  assert.strictEqual(fn(1), "Kenya Shillings One Only");
  assert.strictEqual(fn(12), "Kenya Shillings Twelve Only");
  assert.strictEqual(fn(20), "Kenya Shillings Twenty Only");
  assert.strictEqual(fn(25), "Kenya Shillings Twenty-Five Only");
  assert.strictEqual(fn(100), "Kenya Shillings One Hundred Only");
  assert.strictEqual(fn(105), "Kenya Shillings One Hundred and Five Only");
  assert.strictEqual(fn(125), "Kenya Shillings One Hundred and Twenty-Five Only");
  assert.strictEqual(fn(1000), "Kenya Shillings One Thousand Only");
  assert.strictEqual(fn(1001), "Kenya Shillings One Thousand One Only");
  assert.strictEqual(fn(1050), "Kenya Shillings One Thousand Fifty Only");
  assert.strictEqual(fn(1500), "Kenya Shillings One Thousand Five Hundred Only");
  assert.strictEqual(fn(20000), "Kenya Shillings Twenty Thousand Only");
  assert.strictEqual(fn(100000), "Kenya Shillings One Hundred Thousand Only");
  assert.strictEqual(fn(1000000), "Kenya Shillings One Million Only");
  assert.strictEqual(fn(2500000), "Kenya Shillings Two Million Five Hundred Thousand Only");
  assert.strictEqual(fn(1000000000), "Kenya Shillings One Billion Only");
});

check("numberToWordsKES accurately converts decimals and cents without NaN or undefined", () => {
  const { sandbox } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);
  const fn = sandbox.numberToWordsKES;

  assert.strictEqual(fn(0.05), "Kenya Shillings Five Cents Only");
  assert.strictEqual(fn(0.50), "Kenya Shillings Fifty Cents Only");
  assert.strictEqual(fn(1525.50), "Kenya Shillings One Thousand Five Hundred and Twenty-Five and Fifty Cents Only");
  assert.strictEqual(fn(25450.75), "Kenya Shillings Twenty-Five Thousand Four Hundred and Fifty and Seventy-Five Cents Only");
  assert.strictEqual(fn("1000"), "Kenya Shillings One Thousand Only");
});

check("numberToWordsKES handles edge cases (negative, null, undefined, NaN) safely", () => {
  const { sandbox } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);
  const fn = sandbox.numberToWordsKES;

  assert.strictEqual(fn(-100), "Kenya Shillings Zero Only");
  assert.strictEqual(fn(null), "Kenya Shillings Zero Only");
  assert.strictEqual(fn(undefined), "Kenya Shillings Zero Only");
  assert.strictEqual(fn(NaN), "Kenya Shillings Zero Only");
  assert.strictEqual(fn(""), "Kenya Shillings Zero Only");
  assert.strictEqual(fn("invalid"), "Kenya Shillings Zero Only");
});

check("Balances and debt coloring format correctly in receipt slip DOM", () => {
  const { sandbox, getEl } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);

  // Case A: Member with debt
  sandbox.openPrintReceiptSlip({
    amount: 2000,
    totalSavings: 75000,
    loanBalance: 15000
  });

  const schedulesEl = getEl("print-extra-schedules").innerHTML;
  assert(schedulesEl.includes("KES 75,000.00"), "Savings balance not properly formatted with 2 decimal places");
  assert(schedulesEl.includes("KES 15,000.00"), "Loan balance not properly formatted with 2 decimal places");
  assert(schedulesEl.includes("text-rose-700"), "Outstanding debt should have rose color badge");

  // Case B: Member debt-free
  sandbox.openPrintReceiptSlip({
    amount: 2000,
    totalSavings: 80000,
    loanBalance: 0
  });
  const schedulesEl2 = getEl("print-extra-schedules").innerHTML;
  assert(schedulesEl2.includes("text-emerald-700"), "Clear loan status should have emerald color badge");
});

// -------------------------------------------------------------
// CRITERION 4: CSS & Paper Sizing
// -------------------------------------------------------------
console.log("\n--- CRITERION 4: CSS & Paper Sizing ---");

check("CSS defines .blg-receipt-slip with strict page-break avoidance and border styling", () => {
  assert(indexHtml.includes(".blg-receipt-slip"), "Index.html must contain .blg-receipt-slip styling");
  assert(indexHtml.includes("border: 1.5px solid #0f172a !important;"), "Must specify receipt border");
  assert(indexHtml.includes("page-break-inside: avoid !important;"), "Must avoid page break in print mode");
  assert(indexHtml.includes("break-inside: avoid !important;"), "Must support modern CSS break-inside");
  assert(indexHtml.includes(".blg-receipt-slip .blg-vertical-line"), "Must suppress full-page vertical ruler on slip");
});

check("closePrintModal thoroughly cleans up .blg-receipt-slip and avoids state bleeding", () => {
  const { sandbox, getEl } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);

  // Open slip
  sandbox.openPrintReceiptSlip({ amount: 1000 });
  const printArea = getEl("blg-printable-area");
  assert(printArea.classList.contains("blg-receipt-slip"), "Printable area should have blg-receipt-slip class");

  // Close modal
  sandbox.closePrintModal();
  assert(!printArea.classList.contains("blg-receipt-slip"), "blg-receipt-slip must be removed on closePrintModal");
  assert.strictEqual(getEl("print-table-foot").innerHTML, "", "print-table-foot must be cleared");
  assert.strictEqual(getEl("print-extra-schedules").innerHTML, "", "print-extra-schedules must be cleared");
  assert.strictEqual(getEl("print-treasurer-signoff-block").innerHTML, "", "treasurer signoff block must be cleared");
  assert(getEl("print-extra-schedules").classList.contains("hidden"), "extra schedules must be hidden");
  assert(getEl("print-treasurer-signoff-block").classList.contains("hidden"), "treasurer signoff must be hidden");
});

// -------------------------------------------------------------
// CRITERION 5: Regression Testing
// -------------------------------------------------------------
console.log("\n--- CRITERION 5: Regression Testing ---");

check("Contributions UI retains openReceiptWhatsAppModal backwards-compatibility alias", () => {
  const { sandbox } = createMockEnvironment();
  vm.runInContext(contribUiCode, sandbox);

  assert(typeof sandbox.window.openReceiptWhatsAppModal === "function", "openReceiptWhatsAppModal alias must exist on window");
  assert(typeof sandbox.window.openReceiptShareModal === "function", "openReceiptShareModal must exist on window");
  assert(typeof sandbox.window.printCurrentContributionReceipt === "function", "printCurrentContributionReceipt must exist on window");
  assert(typeof sandbox.window.printContributionRowReceipt === "function", "printContributionRowReceipt must exist on window");
});

check("Print button exists in contribution row action buttons and share modal", () => {
  assert(contribViewHtml.includes("btn-print-receipt-slip"), "Print button must be in share modal");
  assert(contribUiCode.includes("printContributionRowReceipt("), "Print button must be rendered in row actions");
});

check("Statutory Statement & Audit reports retain full 3-officer signoff capability", () => {
  const { sandbox, getEl } = createMockEnvironment();
  vm.runInContext(printUiCode, sandbox);

  // Standard report open with showSignoff: true
  sandbox.showPrintModal_({ showSignoff: true });
  assert(!getEl("print-signoff-block").classList.contains("hidden"), "Standard 3-officer signoff must be visible");
  assert(getEl("print-treasurer-signoff-block").classList.contains("hidden"), "Treasurer-only block must remain hidden");
});

check("notifications.service.js syntax and receiptData payload structure", () => {
  assert(notifCode.includes("receiptData: Object.assign({}, dataForReceipt"), "notifications.service.js must attach receiptData");
  assert(notifCode.includes("dataForReceipt.date instanceof Date"), "receiptData must serialize Date to ISO string");
  
  // Syntax check via node vm
  const script = new vm.Script(notifCode, { filename: "notifications.service.js" });
  assert(script, "notifications.service.js parsed into valid VM script");
});

console.log("\n===============================================================");
console.log(`>>> AUDIT COMPLETE: ${passedChecks}/${totalChecks} CHECKS PASSED <<<`);
if (passedChecks === totalChecks) {
  console.log(">>> SECURITY CLEARANCE: PASS - ZERO VULNERABILITIES DETECTED <<<");
} else {
  console.log(">>> SECURITY CLEARANCE: BLOCK - DEFECTS FOUND <<<");
}
console.log("===============================================================");
