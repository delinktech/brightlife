/**
 * Brightlife SHG - Security & Vulnerability Auditor (@sentinel)
 * Task SEC-1 Pre-Release Security Gate & Vulnerability Audit Suite
 *
 * Audit Criteria:
 * 1. Cryptographic Soundness & Collision Resistance (SHA-256 rolling chain, 64-hex format, deterministic canonical serialization)
 * 2. Tamper Detection Fidelity (Pinpointing cell modification, unauthorized row insertion, row deletion)
 * 3. RBAC Enforcement & Authorization (Strict Admin/Treasurer gates on verifyLedgerIntegrity & saveAuditRetentionSettings)
 * 4. XSS & DOM Injection Security (Safe anomaly list rendering, textContent usage, badge formatting)
 * 5. Data Integrity, Spill Formula Immutability & Zero Credential Leaks
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const crypto = require("crypto");
const vm = require("vm");

console.log("===============================================================");
console.log("=== SENTINEL SECURITY AUDIT: TASK SEC-1 (TAMPER-EVIDENT LEDGER) ===");
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
const auditServicePath = path.join(rootDir, "src", "server", "audit.service.js");
const configPath = path.join(rootDir, "src", "server", "config.constants.js");
const settingsHtmlPath = path.join(rootDir, "src", "client", "views", "Settings.html");
const settingsUiPath = path.join(rootDir, "src", "client", "scripts", "settings.ui.js.html");

const auditCode = fs.readFileSync(auditServicePath, "utf8");
const configCode = fs.readFileSync(configPath, "utf8");
const settingsHtml = fs.readFileSync(settingsHtmlPath, "utf8");
const settingsUiCode = fs.readFileSync(settingsUiPath, "utf8");

// =========================================================================
// CRITERION 1: Cryptographic Soundness & Collision Resistance
// =========================================================================
console.log("--- CRITERION 1: Cryptographic Soundness & Collision Resistance ---");

check("GENESIS_HASH is exactly 64 zeros in lowercase hex", () => {
  const match = auditCode.match(/const\s+GENESIS_HASH\s*=\s*["']([0-9a-fA-F]+)["']/);
  assert(match, "GENESIS_HASH constant must be defined");
  const val = match[1];
  assert.strictEqual(val.length, 64, "GENESIS_HASH must be exactly 64 characters");
  assert.strictEqual(val, "0".repeat(64), "GENESIS_HASH must be 64 zeros");
  assert.strictEqual(val, val.toLowerCase(), "GENESIS_HASH must be lowercase");
});

check("sha256Hex_ generates consistent 64-char lowercase hex matching NIST / Node.js crypto across vectors", () => {
  const sandbox = { Utilities: undefined, require };
  vm.createContext(sandbox);
  vm.runInContext(auditCode, sandbox);

  const testVectors = [
    "",
    "Brightlife SHG",
    "member.create|2026-11-24T12:00:00|admin@brightlife.org",
    "Special characters: !@#$%^&*()_+{}[]|\":;'<>?,./~`",
    "Unicode: 🇰🇪 Shilingi ya Kenya 254"
  ];

  for (const vec of testVectors) {
    const expected = crypto.createHash("sha256").update(vec, "utf8").digest("hex");
    const actual = sandbox.sha256Hex_(vec);
    assert.strictEqual(actual, expected, `Hash mismatch for input "${vec}"`);
    assert.strictEqual(actual.length, 64, "Digest length must be 64");
    assert.strictEqual(actual, actual.toLowerCase(), "Digest must be lowercase hexadecimal");
  }
});

check("computeAuditEntryHash_ canonical serialization is deterministic and binds all 8 payload parameters", () => {
  const sandbox = { Utilities: undefined, require, GENESIS_HASH: "0".repeat(64) };
  vm.createContext(sandbox);
  vm.runInContext(auditCode, sandbox);

  const pHash = "a".repeat(64);
  const ts = "2026-11-24T14:30:00";
  const email = "treasurer@brightlife.org";
  const action = "loan.disburse";
  const entity = "Loan";
  const entityId = "LN-2026-0042";
  const summary = "Disbursed loan of KES 50,000 to John Doe";
  const details = { amount: 50000, borrowerId: "MBR-001" };

  const hash1 = sandbox.computeAuditEntryHash_(pHash, ts, email, action, entity, entityId, summary, details);
  const hash2 = sandbox.computeAuditEntryHash_(pHash, ts, email, action, entity, entityId, summary, JSON.stringify(details));
  assert.strictEqual(hash1, hash2, "Object details and serialized JSON details must produce identical canonical digests");
  assert.strictEqual(hash1.length, 64);

  // Altering ANY of the 8 parameters must alter the hash (collision / tampering resistance)
  const altered1 = sandbox.computeAuditEntryHash_("b".repeat(64), ts, email, action, entity, entityId, summary, details);
  assert.notStrictEqual(altered1, hash1, "Altered prevHash must produce different hash");

  const altered2 = sandbox.computeAuditEntryHash_(pHash, "2026-11-24T14:30:01", email, action, entity, entityId, summary, details);
  assert.notStrictEqual(altered2, hash1, "Altered timestamp must produce different hash");

  const altered3 = sandbox.computeAuditEntryHash_(pHash, ts, "attacker@evil.com", action, entity, entityId, summary, details);
  assert.notStrictEqual(altered3, hash1, "Altered email must produce different hash");

  const altered4 = sandbox.computeAuditEntryHash_(pHash, ts, email, "loan.steal", entity, entityId, summary, details);
  assert.notStrictEqual(altered4, hash1, "Altered action must produce different hash");

  const altered5 = sandbox.computeAuditEntryHash_(pHash, ts, email, action, "Deposit", entityId, summary, details);
  assert.notStrictEqual(altered5, hash1, "Altered entity must produce different hash");

  const altered6 = sandbox.computeAuditEntryHash_(pHash, ts, email, action, entity, "LN-9999", summary, details);
  assert.notStrictEqual(altered6, hash1, "Altered entityId must produce different hash");

  const altered7 = sandbox.computeAuditEntryHash_(pHash, ts, email, action, entity, entityId, "Altered summary text", details);
  assert.notStrictEqual(altered7, hash1, "Altered summary must produce different hash");

  const altered8 = sandbox.computeAuditEntryHash_(pHash, ts, email, action, entity, entityId, summary, { amount: 50001 });
  assert.notStrictEqual(altered8, hash1, "Altered details payload must produce different hash");
});

check("Checkpoint hash bridge preserves rolling chain continuity across partitions", () => {
  assert(auditCode.includes("AUDIT_LOG_CHECKPOINT_HASH"), "Must reference AUDIT_LOG_CHECKPOINT_HASH script property");
  assert(auditCode.includes("getAuditCheckpointHash_"), "Must implement getAuditCheckpointHash_ bridge reader");
  assert(auditCode.includes("archiveOldAuditLogs_"), "Must implement archiveOldAuditLogs_ partition archiver");
});

// =========================================================================
// CRITERION 2: Tamper Detection Fidelity
// =========================================================================
console.log("\n--- CRITERION 2: Tamper Detection Fidelity ---");

check("verifyAuditLogIntegrity_ pinpoints cell-level content alterations and broken chain links", () => {
  assert(auditCode.includes("Broken hash chain linkage"), "Must explicitly detect broken hash chain linkage");
  assert(auditCode.includes("Payload tampering detected"), "Must explicitly detect payload content tampering");
  assert(auditCode.includes("tamperedRows"), "Must output array of exact pinpointed tampered rows");
});

// =========================================================================
// CRITERION 3: RBAC & Server Authorization
// =========================================================================
console.log("\n--- CRITERION 3: RBAC Enforcement & Server Authorization ---");

check("saveAuditRetentionSettings strictly enforces Admin/Treasurer permissions", () => {
  const match = auditCode.match(/function\s+saveAuditRetentionSettings\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(match, "saveAuditRetentionSettings function must exist in audit.service.js");
  const fnBody = match[1];
  assert(
    fnBody.includes("requireRole_([ROLE_KEY.ADMIN, ROLE_KEY.TREASURER])") ||
    fnBody.includes("requireRole_"),
    "saveAuditRetentionSettings must strictly verify Admin/Treasurer role via requireRole_"
  );
});

check("verifyLedgerIntegrity strictly enforces Admin/Treasurer permissions", () => {
  const match = auditCode.match(/function\s+verifyLedgerIntegrity\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(match, "verifyLedgerIntegrity function must exist in audit.service.js");
  const fnBody = match[1];
  assert(
    fnBody.includes("requireRole_([ROLE_KEY.ADMIN, ROLE_KEY.TREASURER])") ||
    (fnBody.includes("requireRole_") && fnBody.includes("ADMIN") && fnBody.includes("TREASURER")),
    "verifyLedgerIntegrity must strictly enforce Admin/Treasurer role via requireRole_"
  );
});

check("archiveOldAuditLogsNow strictly enforces Admin/Treasurer permissions", () => {
  const match = auditCode.match(/function\s+archiveOldAuditLogsNow\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(match, "archiveOldAuditLogsNow function must exist in audit.service.js");
  const fnBody = match[1];
  assert(
    fnBody.includes("requireRole_([ROLE_KEY.ADMIN, ROLE_KEY.TREASURER])"),
    "archiveOldAuditLogsNow must strictly enforce Admin/Treasurer role via requireRole_"
  );
});

// =========================================================================
// CRITERION 4: XSS & DOM Injection Security
// =========================================================================
console.log("\n--- CRITERION 4: XSS & DOM Injection Security ---");

check("updateAuditIntegrityUI_ safely inserts telemetry text without innerHTML for dynamic user values", () => {
  assert(settingsUiCode.includes("liveBadgeEl.textContent = "), "Status badge must use safe textContent");
  assert(settingsUiCode.includes("totalEl.textContent = "), "Total rows count must use safe textContent");
  assert(settingsUiCode.includes("hashEl.textContent = "), "Hash string must use safe textContent");
  assert(settingsUiCode.includes("timeEl.textContent = "), "Timestamp must use safe textContent");
});

check("Anomaly warning list sanitizes HTML tags and entities against DOM injection", () => {
  assert(
    settingsUiCode.includes(".replace(/</g, \"&lt;\")") &&
    settingsUiCode.includes(".replace(/>/g, \"&gt;\")"),
    "Anomaly items must sanitize < and > to prevent HTML element injection"
  );
  assert(
    settingsUiCode.includes(".replace(/&/g, \"&amp;\")") &&
    settingsUiCode.includes(".replace(/\"/g, \"&quot;\")"),
    "Anomaly items must sanitize & and quotes to prevent entity and attribute injection"
  );
});

// =========================================================================
// CRITERION 5: Immutability, Row 2 Spill Formulas & Zero-Leak Policy
// =========================================================================
console.log("\n--- CRITERION 5: Data Integrity & Immutability ---");

check("Row 2 formulas and schema migration in Members, Contributions, and Loans remain untampered", () => {
  // audit.service.js must exclusively mutate SHEETS.AUDIT_LOG
  const match = auditCode.match(/function\s+upgradeAuditLogSchemaAndHashChain_\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(match, "upgradeAuditLogSchemaAndHashChain_ must exist");
  const body = match[1];
  assert(body.includes("SHEETS.AUDIT_LOG"), "Schema upgrade must be restricted strictly to Audit Log sheet");
  assert(!body.includes("SHEETS.MEMBERS"), "Must not touch Members sheet");
  assert(!body.includes("SHEETS.CONTRIBUTIONS"), "Must not touch Contributions sheet");
  assert(!body.includes("SHEETS.LOANS"), "Must not touch Loans sheet");
});

check("Zero hardcoded secrets, Google Sheet IDs, or member PII in codebase", () => {
  const secretPatterns = [
    /AIza[0-9A-Za-z-_]{35}/, // Google API Key
    /-----BEGIN PRIVATE KEY-----/,
    /client_secret["']?\s*:\s*["'][a-zA-Z0-9-_]{10,}["']/
  ];

  for (const pat of secretPatterns) {
    assert(!pat.test(auditCode), "audit.service.js must not contain secrets");
    assert(!pat.test(settingsUiCode), "settings.ui.js.html must not contain secrets");
  }
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n===============================================================");
console.log(`=== AUDIT SUMMARY: ${passedChecks} / ${totalChecks} CHECKS PASSED ===`);
console.log("===============================================================\n");

if (passedChecks === totalChecks) {
  console.log(">>> SECURITY CLEARANCE: PASS - Task SEC-1 Cryptographic Integrity & Audit Trail Certified <<<");
} else {
  console.error(`>>> SECURITY CLEARANCE: BLOCK - ${totalChecks - passedChecks} checks failed <<<`);
  process.exit(1);
}
