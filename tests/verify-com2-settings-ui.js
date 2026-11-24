/**
 * Verification Test Suite: COM-2 Settings View UI Integration
 * Validates the Automated Member Statements & Communications Policy Card in Settings.html
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
console.log("=== VERIFICATION TEST SUITE: COM-2 SETTINGS VIEW INTEGRATION       ===");
console.log("======================================================================");

console.log("\n--> Section 1: Template Markup & DOM Requirements");

check("Settings.html contains Card 5 Automated Member Statements & Communications Policy", () => {
  assert(settingsViewHtml.includes("Automated Member Statements &amp; Communications Policy"), "Card title missing");
  assert(settingsViewHtml.includes('id="comm-policy-status-pill"'), "Missing policy status pill");
});

check("Settings.html contains auto-monthly statements toggle and dispatch day input", () => {
  assert(settingsViewHtml.includes('id="comm-auto-monthly-statements"'), "Missing comm-auto-monthly-statements toggle");
  assert(settingsViewHtml.includes('id="comm-auto-statement-day"'), "Missing comm-auto-statement-day input");
  assert(settingsViewHtml.includes('min="1"'), "comm-auto-statement-day missing min=1");
  assert(settingsViewHtml.includes('max="28"'), "comm-auto-statement-day missing max=28");
});

check("Settings.html contains auto-email receipts and BCC input", () => {
  assert(settingsViewHtml.includes('id="comm-auto-email-receipts"'), "Missing comm-auto-email-receipts toggle");
  assert(settingsViewHtml.includes('id="comm-notification-bcc"'), "Missing comm-notification-bcc input");
});

check("Settings.html contains status ribbon telemetry fields", () => {
  assert(settingsViewHtml.includes('id="comm-active-state-text"'), "Missing comm-active-state-text element");
  assert(settingsViewHtml.includes('id="comm-last-month-text"'), "Missing comm-last-month-text element");
  assert(settingsViewHtml.includes('id="comm-last-timestamp-text"'), "Missing comm-last-timestamp-text element");
  assert(settingsViewHtml.includes('id="comm-last-count-text"'), "Missing comm-last-count-text element");
});

check("Settings.html contains direct action button [Dispatch Test / Run Now]", () => {
  assert(settingsViewHtml.includes('id="btn-dispatch-test-statements"'), "Missing btn-dispatch-test-statements button");
  assert(settingsViewHtml.includes("triggerSettingsAutoDispatchNow()"), "Missing triggerSettingsAutoDispatchNow call");
  assert(settingsViewHtml.includes("Dispatch Test / Run Now"), "Button text mismatch");
});

console.log("\n--> Section 2: Controller Script Syntax & Execution Logic");

check("settings.ui.js.html extract script parses without syntax errors", () => {
  const match = settingsUiCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  const scriptContent = match ? match[1] : settingsUiCode;
  new vm.Script(scriptContent, { filename: "settings.ui.js.html" });
});

check("normalizeNotificationSettings_ correctly sanitizes and bounds properties", () => {
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

  assert(typeof sandbox.normalizeNotificationSettings_ === "function", "normalizeNotificationSettings_ not defined");

  // Default empty test
  const defaults = sandbox.normalizeNotificationSettings_({});
  assert.strictEqual(defaults.autoEmailReceipts, true);
  assert.strictEqual(defaults.autoMonthlyStatements, false);
  assert.strictEqual(defaults.autoStatementDay, 1);
  assert.strictEqual(defaults.notificationBcc, "");
  assert.strictEqual(defaults.lastAutoDispatchMonth, "");
  assert.strictEqual(defaults.lastAutoDispatchCount, 0);

  // Clamping test
  const clampedLow = sandbox.normalizeNotificationSettings_({ autoStatementDay: 0 });
  assert.strictEqual(clampedLow.autoStatementDay, 1);

  const clampedHigh = sandbox.normalizeNotificationSettings_({ autoStatementDay: 31 });
  assert.strictEqual(clampedHigh.autoStatementDay, 1);

  const validDay = sandbox.normalizeNotificationSettings_({ autoStatementDay: 15 });
  assert.strictEqual(validDay.autoStatementDay, 15);
});

check("Controller exports all required communication helper functions to window", () => {
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

  assert(typeof sandbox.window.loadCommunicationSettings === "function", "window.loadCommunicationSettings missing");
  assert(typeof sandbox.window.populateCommunicationSettingsForm_ === "function", "window.populateCommunicationSettingsForm_ missing");
  assert(typeof sandbox.window.syncCommActiveBadge_ === "function", "window.syncCommActiveBadge_ missing");
  assert(typeof sandbox.window.triggerSettingsAutoDispatchNow === "function", "window.triggerSettingsAutoDispatchNow missing");
  assert(typeof sandbox.window.saveAllSettings === "function", "window.saveAllSettings missing");
});

console.log("\n======================================================================");
console.log(`=== TEST SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED ===`);
console.log("======================================================================");

if (passedChecks !== totalChecks) {
  process.exitCode = 1;
}
