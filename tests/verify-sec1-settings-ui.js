/**
 * Verification Test Suite: SEC-1 Settings View UI Integration
 * Validates the Cryptographic Ledger Integrity & Tamper-Evident Audit Trail Card in Settings.html
 * and its controller logic in settings.ui.js.html.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

let totalChecks = 0;
let passedChecks = 0;

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
const settingsViewPath = path.join(rootDir, "src", "client", "views", "Settings.html");
const settingsUiPath = path.join(rootDir, "src", "client", "scripts", "settings.ui.js.html");

const settingsViewHtml = fs.readFileSync(settingsViewPath, "utf8");
const settingsUiCode = fs.readFileSync(settingsUiPath, "utf8");

console.log("======================================================================");
console.log("=== VERIFICATION TEST SUITE: SEC-1 SETTINGS VIEW INTEGRATION       ===");
console.log("======================================================================");

console.log("\n--> Section 1: Template Markup & DOM Requirements");

check("Settings.html contains Card 6 Cryptographic Ledger Integrity & Tamper-Evident Audit Trail", () => {
  assert(settingsViewHtml.includes("Cryptographic Ledger Integrity &amp; Tamper-Evident Audit Trail"), "Card title missing");
  assert(settingsViewHtml.includes('id="audit-integrity-status-pill"'), "Missing audit integrity status pill");
  assert(settingsViewHtml.includes("fa-shield-halved"), "Missing shield-halved icon");
});

check("Settings.html contains status ribbon telemetry fields", () => {
  assert(settingsViewHtml.includes('id="audit-live-status-badge"'), "Missing live status badge element");
  assert(settingsViewHtml.includes('id="audit-total-sealed-rows"'), "Missing total sealed rows counter");
  assert(settingsViewHtml.includes('id="audit-last-hash"'), "Missing last hash element");
  assert(settingsViewHtml.includes('id="btn-copy-audit-hash"'), "Missing copy seal hash button");
  assert(settingsViewHtml.includes('id="audit-last-verified-at"'), "Missing last verified timestamp element");
});

check("Settings.html contains direct verification action button", () => {
  assert(settingsViewHtml.includes('id="btn-verify-audit-integrity"'), "Missing verify audit integrity button");
  assert(settingsViewHtml.includes("runManualAuditIntegrityVerification()"), "Missing runManualAuditIntegrityVerification onclick call");
  assert(settingsViewHtml.includes("Verify Ledger Integrity Now"), "Button text mismatch");
});

check("Settings.html contains Tamper Anomaly Warning Alert box (hidden by default)", () => {
  assert(settingsViewHtml.includes('id="audit-tamper-alert-box"'), "Missing audit-tamper-alert-box");
  assert(settingsViewHtml.includes('id="audit-tamper-anomalies-list"'), "Missing audit-tamper-anomalies-list container");
  const alertBoxMatch = settingsViewHtml.match(/id="audit-tamper-alert-box"[^>]*class="([^"]*)"/);
  assert(alertBoxMatch && alertBoxMatch[1].includes("hidden"), "Alert box should be hidden by default");
});

check("Settings.html contains Audit Log Retention Period input and technical explanation", () => {
  assert(settingsViewHtml.includes('id="audit-retention-days"'), "Missing audit-retention-days input");
  assert(settingsViewHtml.includes('min="0"'), "Retention days missing min=0");
  assert(settingsViewHtml.includes("Transactions and audit trails are sealed sequentially with SHA-256"), "Missing cryptographic explanation");
});

console.log("\n--> Section 2: Controller Script Syntax & Execution Logic");

check("settings.ui.js.html extract script parses without syntax errors", () => {
  const match = settingsUiCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  const scriptContent = match ? match[1] : settingsUiCode;
  new vm.Script(scriptContent, { filename: "settings.ui.js.html" });
});

check("normalizeAuditRetentionSettings_ correctly sanitizes and bounds properties", () => {
  const match = settingsUiCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  const scriptContent = match ? match[1] : settingsUiCode;

  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => []
    },
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);

  assert(typeof sandbox.normalizeAuditRetentionSettings_ === "function", "normalizeAuditRetentionSettings_ not defined");

  // Default empty test
  const defaults = sandbox.normalizeAuditRetentionSettings_({});
  assert.strictEqual(defaults.retentionDays, 365);
  assert.strictEqual(defaults.isInfinite, false);

  // Infinite (0) retention test
  const infinite = sandbox.normalizeAuditRetentionSettings_({ retentionDays: 0 });
  assert.strictEqual(infinite.retentionDays, 0);
  assert.strictEqual(infinite.isInfinite, true);

  // Negative / NaN fallback test
  const invalid = sandbox.normalizeAuditRetentionSettings_({ retentionDays: -10 });
  assert.strictEqual(invalid.retentionDays, 365);

  const custom = sandbox.normalizeAuditRetentionSettings_({ retentionDays: 730 });
  assert.strictEqual(custom.retentionDays, 730);
  assert.strictEqual(custom.isInfinite, false);
});

check("updateAuditIntegrityUI_ updates DOM elements accurately for verified and tampered statuses", () => {
  const match = settingsUiCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  const scriptContent = match ? match[1] : settingsUiCode;

  const domElements = {
    "audit-integrity-status-pill": { className: "", innerHTML: "" },
    "audit-live-status-badge": { className: "", textContent: "" },
    "audit-total-sealed-rows": { textContent: "" },
    "audit-last-hash": { textContent: "", title: "" },
    "audit-last-verified-at": { textContent: "" },
    "audit-tamper-alert-box": {
      classList: {
        classes: new Set(["hidden"]),
        add: function(c) { this.classes.add(c); },
        remove: function(c) { this.classes.delete(c); },
        contains: function(c) { return this.classes.has(c); }
      }
    },
    "audit-tamper-anomalies-list": { innerHTML: "" }
  };

  const sandbox = {
    window: {},
    document: {
      getElementById: (id) => domElements[id] || null,
      querySelectorAll: () => []
    },
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);

  // Test 1: Verified ledger
  sandbox.updateAuditIntegrityUI_({
    isValid: true,
    totalEntries: 42,
    verifiedEntries: 42,
    tamperedCount: 0,
    tamperedRows: [],
    lastVerifiedHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    checkedAt: "2026-11-24 15:30:00"
  });

  assert(domElements["audit-integrity-status-pill"].innerHTML.includes("IMMUTABLE &amp; VERIFIED"), "Status pill text mismatch");
  assert.strictEqual(domElements["audit-live-status-badge"].textContent, "IMMUTABLE & VERIFIED");
  assert.strictEqual(domElements["audit-total-sealed-rows"].textContent, "42");
  assert(domElements["audit-last-hash"].title.includes("abcdef0123456789"), "Hash title should have full hash");
  assert(domElements["audit-last-hash"].textContent.includes("..."), "Hash should be truncated");
  assert(domElements["audit-tamper-alert-box"].classList.contains("hidden"), "Alert box should be hidden on verified");

  // Test 2: Tampered ledger
  sandbox.updateAuditIntegrityUI_({
    isValid: false,
    totalEntries: 42,
    verifiedEntries: 40,
    tamperedCount: 2,
    tamperedRows: [
      { row: 3, reason: "Payload digest mismatch" },
      { row: 7, reason: "Broken rolling hash link" }
    ],
    lastVerifiedHash: "1111111111111111111111111111111111111111111111111111111111111111",
    checkedAt: "2026-11-24 15:35:00"
  });

  assert(domElements["audit-integrity-status-pill"].innerHTML.includes("TAMPER DETECTED"), "Status pill should show tampered");
  assert(domElements["audit-live-status-badge"].textContent.includes("TAMPER DETECTED"), "Live status badge should show tampered");
  assert(!domElements["audit-tamper-alert-box"].classList.contains("hidden"), "Alert box should be revealed on tampered");
  assert(domElements["audit-tamper-anomalies-list"].innerHTML.includes("Row 3: Payload digest mismatch"), "Anomalies list missing row 3");
  assert(domElements["audit-tamper-anomalies-list"].innerHTML.includes("Row 7: Broken rolling hash link"), "Anomalies list missing row 7");
});

check("loadLoanPolicySettings hooks into loadAuditIntegrityStatus", () => {
  const match = settingsUiCode.match(/function\s+loadLoanPolicySettings\s*\([^)]*\)\s*\{([\s\S]*?)(?:const\s+cacheKey|$)/);
  assert(match, "Could not match loadLoanPolicySettings signature");
  assert(match[1].includes("loadAuditIntegrityStatus"), "loadLoanPolicySettings does not invoke loadAuditIntegrityStatus");
});

check("Controller exports all required SEC-1 helper functions to window", () => {
  const match = settingsUiCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  const scriptContent = match ? match[1] : settingsUiCode;

  const sandbox = {
    window: {},
    document: {
      getElementById: () => null,
      querySelectorAll: () => []
    },
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(scriptContent, sandbox);

  assert(typeof sandbox.window.loadAuditIntegrityStatus === "function", "window.loadAuditIntegrityStatus missing");
  assert(typeof sandbox.window.runManualAuditIntegrityVerification === "function", "window.runManualAuditIntegrityVerification missing");
  assert(typeof sandbox.window.updateAuditIntegrityUI_ === "function", "window.updateAuditIntegrityUI_ missing");
  assert(typeof sandbox.window.copyAuditLastHash_ === "function", "window.copyAuditLastHash_ missing");
  assert(typeof sandbox.window.normalizeAuditRetentionSettings_ === "function", "window.normalizeAuditRetentionSettings_ missing");
  assert(typeof sandbox.window.saveAllSettings === "function", "window.saveAllSettings missing");
});

console.log("\n======================================================================");
console.log(`=== TEST SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED ===`);
console.log("======================================================================");

if (passedChecks !== totalChecks) {
  process.exitCode = 1;
}
