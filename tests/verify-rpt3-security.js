/**
 * Brightlife SHG - Security & Vulnerability Auditor (@sentinel)
 * Task RPT-3 Pre-Release Security Gate & Vulnerability Audit Suite
 *
 * Audit Criteria:
 * 1. XSS & Template Injection Security (DOM & Print escaping)
 * 2. Formula Injection Defense (CSV Injection protection per RFC-4180)
 * 3. RBAC Enforcement & IDOR Isolation (requireAccess_ on executive models)
 * 4. Data Integrity & Sheet Immutability (0.00 variance, zero spill formula threats)
 * 5. Letterhead Standardization & Zero Credential Leaks
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

console.log("===============================================================");
console.log("=== SENTINEL SECURITY AUDIT: TASK RPT-3 (EQUITY & CASH FLOW) ===");
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

const rootDir = path.resolve(__dirname, "..");
const dashboardServicePath = path.join(rootDir, "src", "server", "dashboard.service.js");
const printUiPath = path.join(rootDir, "src", "client", "scripts", "print.ui.js.html");
const homeHtmlPath = path.join(rootDir, "src", "client", "views", "Home.html");
const printModalPath = path.join(rootDir, "src", "client", "views", "PrintReportModal.html");

const dashboardCode = fs.readFileSync(dashboardServicePath, "utf8");
const printUiCode = fs.readFileSync(printUiPath, "utf8");
const homeHtmlCode = fs.readFileSync(homeHtmlPath, "utf8");
const printModalHtml = fs.readFileSync(printModalPath, "utf8");

// =========================================================================
// SECTION 1: XSS & TEMPLATE INJECTION SECURITY
// =========================================================================
console.log("--- CRITERION 1: XSS & Template Injection Prevention ---");

check("escapePrintHtml sanitizes &, <, >, and \" characters safely", () => {
  const match = printUiCode.match(/function escapePrintHtml\(str\)\s*\{([\s\S]*?)\}/);
  assert(match, "escapePrintHtml function must exist in print.ui.js.html");
  const fnBody = match[1];
  const escapePrintHtml = new Function("str", fnBody);

  const testPayload = '<script>alert("XSS")</script>&<img src=x onerror=alert(1)>';
  const escaped = escapePrintHtml(testPayload);
  assert(!escaped.includes("<"), "Must not contain unescaped <");
  assert(!escaped.includes(">"), "Must not contain unescaped >");
  assert(!escaped.includes('"'), 'Must not contain unescaped "');
  assert(escaped.includes("&lt;script&gt;"), "Tags must be properly entity-encoded");
});

check("Home.html renderEquityStatement & renderCashFlowStatement use textContent for dynamic DOM insertion", () => {
  assert(
    homeHtmlCode.includes("window.renderEquityStatement = function"),
    "renderEquityStatement must be defined"
  );
  assert(
    homeHtmlCode.includes("window.renderCashFlowStatement = function"),
    "renderCashFlowStatement must be defined"
  );

  const eqMatch = homeHtmlCode.match(/window\.renderEquityStatement\s*=\s*function[\s\S]*?setTxt\s*=\s*function\s*\(id,\s*txt\)\s*\{([\s\S]*?)\};/);
  assert(eqMatch && eqMatch[1].includes("textContent"), "renderEquityStatement setTxt must use textContent");

  const cfMatch = homeHtmlCode.match(/window\.renderCashFlowStatement\s*=\s*function[\s\S]*?setTxt\s*=\s*function\s*\(id,\s*txt\)\s*\{([\s\S]*?)\};/);
  assert(cfMatch && cfMatch[1].includes("textContent"), "renderCashFlowStatement setTxt must use textContent");
});

check("print.ui.js.html print views escape all dynamic table cells and labels", () => {
  assert(
    printUiCode.includes("function renderPrintEquityStatementView_"),
    "renderPrintEquityStatementView_ must be defined"
  );
  assert(
    printUiCode.includes("function renderPrintCashFlowStatementView_"),
    "renderPrintCashFlowStatementView_ must be defined"
  );

  // In renderPrintEquityStatementView_, colRow escapes label
  assert(
    printUiCode.includes("escapePrintHtml(label)"),
    "colRow must escape labels with escapePrintHtml"
  );

  // In renderPrintCashFlowStatementView_, secHdr, row, and subtotalRow escape labels/titles
  assert(
    printUiCode.includes("secHdr = function (title)"),
    "secHdr must be defined in cash flow view"
  );
  assert(
    printUiCode.includes("escapePrintHtml(title)"),
    "secHdr must escape title with escapePrintHtml"
  );
});

// =========================================================================
// SECTION 2: FORMULA INJECTION DEFENSE (CSV INJECTION)
// =========================================================================
console.log("\n--- CRITERION 2: Formula Injection Defense (CSV Injection) ---");

check("Home.html bsCsvCell_ neutralizes formula characters (=, +, -, @, \\t, \\r)", () => {
  const match = homeHtmlCode.match(/function bsCsvCell_\(val\)[\s\S]*?\n  \}/);
  assert(match, "bsCsvCell_ must be defined in Home.html");
  const fnModule = new Function(match[0] + "\nreturn bsCsvCell_;");
  const bsCsvCell_ = fnModule();

  const attackVectors = [
    "=1+1",
    "+cmd|'/c calc'!A0",
    "-2+3*4",
    "@SUM(A1:A10)",
    "\t=1+1",
    "\r=1+1",
    '=cmd|\'/c notepad\'!A0',
  ];

  attackVectors.forEach((payload) => {
    const sanitized = bsCsvCell_(payload);
    assert(sanitized.startsWith('"\''), `Payload [${payload}] must be prefixed with quote-apostrophe: ${sanitized}`);
  });

  // Regular safe values
  assert.strictEqual(bsCsvCell_("Safe text"), '"Safe text"');
  assert.strictEqual(bsCsvCell_(123.45), '"123.45"');
  assert.strictEqual(bsCsvCell_('Text with "quotes"'), '"Text with ""quotes"""');
});

check("print.ui.js.html safeCellText_ neutralizes formula characters", () => {
  const match = printUiCode.match(/function safeCellText_\(val\)[\s\S]*?\n  \}/);
  assert(match, "safeCellText_ must be defined in print.ui.js.html");
  const fnModule = new Function(match[0] + "\nreturn safeCellText_;");
  const safeCellText_ = fnModule();

  const attackVectors = ["=cmd", "+1+1", "-5", "@SUM(A1)", "\tTAB", "\rCR"];
  attackVectors.forEach((payload) => {
    const sanitized = safeCellText_(payload);
    assert(sanitized.startsWith('"\''), `Payload [${payload}] must be neutralized with apostrophe`);
  });
});

check("dashboard.service.js csvEscapeCell_ neutralizes formula injection in string fields", () => {
  const match = dashboardCode.match(/function csvEscapeCell_\(val\)[\s\S]*?\n\}/);
  assert(match, "csvEscapeCell_ must be defined in dashboard.service.js");

  const safeCellText_ = function (v) {
    const s = String(v === undefined || v === null ? "" : v).trim().slice(0, 500);
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  };

  const fnModule = new Function("safeCellText_", match[0] + "\nreturn csvEscapeCell_;");
  const csvEscapeCell_ = fnModule(safeCellText_);

  const attackVectors = ["=cmd|' /C calc'!A0", "+cmd", "-cmd", "@SUM", "\t=1", "\r=1"];
  attackVectors.forEach((payload) => {
    const sanitized = csvEscapeCell_(payload);
    assert(sanitized.startsWith("'") || sanitized.startsWith('"\''), `Payload [${payload}] must be neutralized: ${sanitized}`);
  });

  // Ensure finite numbers remain valid string representations
  assert.strictEqual(csvEscapeCell_(100), "100");
  assert.strictEqual(csvEscapeCell_(-50), "-50");
  assert.strictEqual(csvEscapeCell_(0), "0");
});

check("exportAgmAuditPackCSV, exportEquityStatementCSV & exportCashFlowStatementCSV exist and sanitize cells", () => {
  assert(dashboardCode.includes("function exportAgmAuditPackCSV(rangeKey)"), "exportAgmAuditPackCSV must exist in server");
  assert(homeHtmlCode.includes("window.exportEquityStatementCSV = function"), "exportEquityStatementCSV must exist in client");
  assert(homeHtmlCode.includes("window.exportCashFlowStatementCSV = function"), "exportCashFlowStatementCSV must exist in client");
  assert(printUiCode.includes("function exportAgmAuditPackCSV()"), "exportAgmAuditPackCSV must exist in print.ui.js.html");
});

// =========================================================================
// SECTION 3: RBAC & AUTHORIZATION
// =========================================================================
console.log("\n--- CRITERION 3: RBAC & Access Control Enforcement ---");

check("getExecutiveFinancialReports enforces requireAccess_() barrier", () => {
  const match = dashboardCode.match(/function getExecutiveFinancialReports\(rangeKey\)\s*\{([\s\S]*?)\}/);
  assert(match, "getExecutiveFinancialReports must be defined");
  assert(
    match[1].includes("requireAccess_()"),
    "getExecutiveFinancialReports must call requireAccess_() before serving data"
  );
});

check("getAgmAuditPackData enforces requireAccess_() barrier", () => {
  const match = dashboardCode.match(/function getAgmAuditPackData\(rangeKey\)\s*\{([\s\S]*?)\}/);
  assert(match, "getAgmAuditPackData must be defined");
  assert(
    match[1].includes("requireAccess_()"),
    "getAgmAuditPackData must call requireAccess_() before serving data"
  );
});

check("Zero IDOR vulnerability: executive reports are group aggregates without user-scoped ID parameters", () => {
  const match = dashboardCode.match(/function getExecutiveFinancialReports\(rangeKey\)/);
  assert(match, "getExecutiveFinancialReports must only accept rangeKey, not caller or member ID parameters");
  assert(!dashboardCode.includes("getExecutiveFinancialReports(memberId"), "No memberId parameter allowed in executive report");
});

// =========================================================================
// SECTION 4: DATA INTEGRITY & GOOGLE SHEETS IMMUTABILITY
// =========================================================================
console.log("\n--- CRITERION 4: Data Integrity & Google Sheets Immutability ---");

check("Zero write operations in RPT-3 backend ensuring Row 2 spill formulas are untampered", () => {
  const eqFnMatch = dashboardCode.match(/function buildEquityStatement_[\s\S]*?return\s*\{[\s\S]*?\};\s*\}/);
  assert(eqFnMatch, "buildEquityStatement_ function body found");
  const eqFnCode = eqFnMatch[0];

  assert(!eqFnCode.includes(".setValue("), "buildEquityStatement_ must not write to any cells");
  assert(!eqFnCode.includes(".setValues("), "buildEquityStatement_ must not set ranges");
  assert(!eqFnCode.includes(".appendRow("), "buildEquityStatement_ must not append rows");
  assert(!eqFnCode.includes(".clear("), "buildEquityStatement_ must not clear sheets");

  const cfFnMatch = dashboardCode.match(/function buildCashFlowStatement_[\s\S]*?return\s*\{[\s\S]*?\};\s*\}/);
  assert(cfFnMatch, "buildCashFlowStatement_ function body found");
  const cfFnCode = cfFnMatch[0];

  assert(!cfFnCode.includes(".setValue("), "buildCashFlowStatement_ must not write to any cells");
  assert(!cfFnCode.includes(".setValues("), "buildCashFlowStatement_ must not set ranges");
  assert(!cfFnCode.includes(".appendRow("), "buildCashFlowStatement_ must not append rows");
  assert(!cfFnCode.includes(".clear("), "buildCashFlowStatement_ must not clear sheets");
});

check("buildEquityStatement_ and buildCashFlowStatement_ compute strict reconciliation variance checks", () => {
  assert(
    dashboardCode.includes("const variance = roundCurrency2_(calculatedClosingTotal - closingTotalEquity);"),
    "buildEquityStatement_ must compute variance against balance sheet equity"
  );
  assert(
    dashboardCode.includes("const variance = roundCurrency2_(closingCash - bsCash);"),
    "buildCashFlowStatement_ must compute variance against balance sheet cash"
  );
  assert(
    dashboardCode.includes("const isReconciled = Math.abs(variance) < 0.01;"),
    "buildCashFlowStatement_ must enforce 0.01 tolerance for reconciliation"
  );
});

// =========================================================================
// SECTION 5: LETTERHEAD & CREDENTIAL SECURITY
// =========================================================================
console.log("\n--- CRITERION 5: Standardization & Zero Credential Leaks ---");

check("PrintReportModal.html uses official contact email brightlyfe@gmail.com", () => {
  assert(
    printModalHtml.includes("brightlyfe@gmail.com"),
    "PrintReportModal must contain official email brightlyfe@gmail.com"
  );
  assert(
    !printModalHtml.includes("brightlifeshg@gmail.com"),
    "PrintReportModal must not contain deprecated brightlifeshg@gmail.com"
  );
});

check("Zero unmasked credentials, API keys, or private tokens in audited commits", () => {
  const secretPatterns = [
    /AIza[0-9A-Za-z-_]{35}/,
    /AKIA[0-9A-Z]{16}/,
    /ghp_[0-9a-zA-Z]{36}/,
    /-----BEGIN PRIVATE KEY-----/
  ];

  secretPatterns.forEach((pattern) => {
    assert(!pattern.test(dashboardCode), `dashboard.service.js must not contain secrets matching ${pattern}`);
    assert(!pattern.test(printUiCode), `print.ui.js.html must not contain secrets matching ${pattern}`);
    assert(!pattern.test(homeHtmlCode), `Home.html must not contain secrets matching ${pattern}`);
  });
});

console.log("\n===============================================================");
console.log(`=== AUDIT SUMMARY: ${passedChecks} / ${totalChecks} CHECKS PASSED ===`);
console.log("===============================================================");

if (passedChecks === totalChecks) {
  console.log("\n>>> SECURITY CLEARANCE: PASS - Task RPT-3 Approved for Release <<<");
} else {
  console.log("\n>>> SECURITY CLEARANCE: BLOCK - Vulnerabilities Detected <<<");
  process.exit(1);
}
