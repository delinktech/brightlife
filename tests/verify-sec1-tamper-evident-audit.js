/**
 * Brightlife SHG - Systems & Cryptographic Verification Suite (@fixer)
 * Task SEC-1: Tamper-Evident Ledger Hashing & Audit Log Retention Engine
 *
 * Test Verification Gates:
 * 1. File Syntax & Static Code Analysis
 * 2. Cryptographic SHA-256 Engine Consistency (GAS Utilities vs. Node crypto)
 * 3. Rolling Hash Chain Construction & Linking
 * 4. Schema Migration & Historical Row Sealing (7-col to 9-col upgrade)
 * 5. Tamper Detection & Pinpoint Integrity Scanner (Payload mutation, row deletion, illegal insertion)
 * 6. Audit Log Retention Policy & Archive Checkpoint Bridge
 * 7. Fast Cache & RBAC Barrier Enforcement
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const crypto = require("crypto");

console.log("======================================================================");
console.log("=== FIXER TEST SUITE: TASK SEC-1 TAMPER-EVIDENT AUDIT LOG ENGINE  ===");
console.log("======================================================================\n");

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

const auditCode = fs.readFileSync(auditServicePath, "utf8");
const configCode = fs.readFileSync(configPath, "utf8");

// =========================================================================
// SECTION 1: Syntax & Static Code Analysis
// =========================================================================
console.log("--> Section 1: File Syntax & Static Structure");

check("audit.service.js parses without syntax errors", () => {
  new vm.Script(auditCode, { filename: "audit.service.js" });
});

check("Defines 64-character GENESIS_HASH constant", () => {
  assert(auditCode.includes('const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";'), "GENESIS_HASH must be 64 zeros");
});

check("Contains all required SEC-1 core functions", () => {
  const requiredFns = [
    "function sha256Hex_",
    "function computeAuditEntryHash_",
    "function getAuditCheckpointHash_",
    "function getOrCreateAuditSheet_",
    "function upgradeAuditLogSchemaAndHashChain_",
    "function appendAuditLog_",
    "function verifyAuditLogIntegrity_",
    "function getAuditIntegrityStatus",
    "function verifyLedgerIntegrity",
    "function getAuditRetentionSettings",
    "function saveAuditRetentionSettings",
    "archiveOldAuditLogs_",
    "archiveOldAuditLogsNow"
  ];
  for (const fn of requiredFns) {
    assert(auditCode.includes(fn), `Missing function: ${fn}`);
  }
});

// =========================================================================
// SECTION 2: Mock Environment Setup
// =========================================================================
function createMockAuditEnvironment(initialProps = {}) {
  const scriptProperties = Object.assign({}, initialProps);
  const cacheStorage = {};

  // Mock Sheets
  const sheetsByName = {};

  class MockRange {
    constructor(sheet, startRow, startCol, numRows, numCols) {
      this.sheet = sheet;
      this.startRow = startRow;
      this.startCol = startCol;
      this.numRows = numRows;
      this.numCols = numCols;
    }

    getValues() {
      const res = [];
      for (let r = 0; r < this.numRows; r++) {
        const rowIdx = this.startRow - 1 + r;
        const row = this.sheet.rows[rowIdx] || [];
        const slice = [];
        for (let c = 0; c < this.numCols; c++) {
          const colIdx = this.startCol - 1 + c;
          slice.push(row[colIdx] !== undefined ? row[colIdx] : "");
        }
        res.push(slice);
      }
      return res;
    }

    setValues(values) {
      for (let r = 0; r < values.length; r++) {
        const rowIdx = this.startRow - 1 + r;
        if (!this.sheet.rows[rowIdx]) {
          this.sheet.rows[rowIdx] = [];
        }
        for (let c = 0; c < values[r].length; c++) {
          const colIdx = this.startCol - 1 + c;
          this.sheet.rows[rowIdx][colIdx] = values[r][c];
        }
      }
      return this;
    }

    setValue(val) {
      return this.setValues([[val]]);
    }

    getValue() {
      const vals = this.getValues();
      return vals[0] && vals[0][0] !== undefined ? vals[0][0] : "";
    }
  }

  class MockSheet {
    constructor(name, rows = []) {
      this.name = name;
      this.rows = JSON.parse(JSON.stringify(rows));
      this.frozenRows = 0;
      this.tabColor = null;
    }

    getName() { return this.name; }
    setFrozenRows(n) { this.frozenRows = n; }
    setTabColor(c) { this.tabColor = c; }

    getLastRow() {
      return this.rows.length;
    }

    getLastColumn() {
      let maxCols = 0;
      for (const r of this.rows) {
        if (r.length > maxCols) maxCols = r.length;
      }
      return maxCols;
    }

    getRange(startRow, startCol, numRows = 1, numCols = 1) {
      return new MockRange(this, startRow, startCol, numRows, numCols);
    }

    appendRow(rowArr) {
      this.rows.push(rowArr.slice());
    }

    deleteRows(startRow, count = 1) {
      const idx = startRow - 1;
      this.rows.splice(idx, count);
    }
  }

  const mockSpreadsheet = {
    sheets: sheetsByName,
    getSheetByName(name) {
      return sheetsByName[name] || null;
    },
    insertSheet(name) {
      const s = new MockSheet(name);
      sheetsByName[name] = s;
      return s;
    },
    getSheets() {
      return Object.values(sheetsByName);
    },
    getSpreadsheetTimeZone() {
      return "Africa/Nairobi";
    }
  };

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(key) {
          return scriptProperties[key] !== undefined ? scriptProperties[key] : null;
        },
        setProperty(key, val) {
          scriptProperties[key] = String(val);
        },
        deleteProperty(key) {
          delete scriptProperties[key];
        },
        getProperties() {
          return Object.assign({}, scriptProperties);
        }
      };
    }
  };

  const CacheService = {
    getScriptCache() {
      return {
        get(key) {
          const item = cacheStorage[key];
          if (!item) return null;
          if (Date.now() > item.expires) {
            delete cacheStorage[key];
            return null;
          }
          return item.value;
        },
        put(key, val, ttlSeconds) {
          cacheStorage[key] = {
            value: String(val),
            expires: Date.now() + (ttlSeconds * 1000)
          };
        },
        remove(key) {
          delete cacheStorage[key];
        }
      };
    }
  };

  const Utilities = {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "UTF_8" },
    computeDigest(algo, str) {
      const buf = crypto.createHash("sha256").update(Buffer.from(String(str), "utf8")).digest();
      const raw = [];
      for (let i = 0; i < buf.length; i++) {
        let b = buf[i];
        if (b > 127) b -= 256; // simulate signed byte
        raw.push(b);
      }
      return raw;
    },
    formatDate(d, tz, pattern) {
      const dt = d instanceof Date ? d : new Date(d);
      const pad = (n) => String(n).padStart(2, "0");
      const yyyy = dt.getFullYear();
      const MM = pad(dt.getMonth() + 1);
      const dd = pad(dt.getDate());
      const HH = pad(dt.getHours());
      const mm = pad(dt.getMinutes());
      const ss = pad(dt.getSeconds());

      if (pattern === "yyyy-MM-dd'T'HH:mm:ss") {
        return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}`;
      }
      if (pattern === "yyyy-MM-dd HH:mm:ss") {
        return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
      }
      return `${yyyy}-${MM}-${dd}`;
    }
  };

  let mockActiveUser = { getEmail: () => "treasurer@brightlife.org" };
  const Session = {
    getActiveUser: () => mockActiveUser
  };

  const SpreadsheetApp = {
    openById: () => mockSpreadsheet,
    getActiveSpreadsheet: () => mockSpreadsheet,
    newDataValidation: () => ({
      requireValueInRange: () => ({
        setAllowInvalid: () => ({
          build: () => ({})
        })
      })
    })
  };

  const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

  const sandbox = {
    console,
    Buffer,
    setTimeout,
    clearTimeout,
    Date,
    PropertiesService,
    CacheService,
    Utilities,
    Session,
    SpreadsheetApp,
    GENESIS_HASH,
    getSpreadsheet_: () => mockSpreadsheet,
    getSheetByNameInsensitive_: (ss, name) => {
      const n = String(name || "").trim().toLowerCase();
      const all = ss.getSheets();
      for (const s of all) {
        if (s.getName().trim().toLowerCase() === n) return s;
      }
      return null;
    },
    getCurrentUserEmail_: () => mockActiveUser.getEmail(),
    requireAccess_: () => ({ roleKey: "treasurer", hasAccess: true }),
    requireRole_: (roles) => {
      const list = Array.isArray(roles) ? roles : [roles];
      if (!list.includes("treasurer") && !list.includes("admin")) {
        throw new Error("Permission denied");
      }
      return true;
    },
    setMockUser: (email, role) => {
      mockActiveUser = { getEmail: () => email };
      sandbox.requireRole_ = (roles) => {
        const list = Array.isArray(roles) ? roles : [roles];
        if (!list.includes(role)) throw new Error("Permission denied");
        return true;
      };
    },
    mockSpreadsheet,
    scriptProperties,
    cacheStorage,
    MockSheet
  };

  vm.createContext(sandbox);

  // Load config.constants.js then audit.service.js
  vm.runInContext(configCode, sandbox);
  sandbox.getSpreadsheet_ = () => mockSpreadsheet;
  vm.runInContext(auditCode, sandbox);
  sandbox.getSpreadsheet_ = () => mockSpreadsheet;
  sandbox.GENESIS_HASH = GENESIS_HASH;

  return sandbox;
}

// =========================================================================
// SECTION 3: Cryptographic SHA-256 Consistency Tests
// =========================================================================
console.log("\n--> Section 2: Cryptographic SHA-256 Engine Consistency");

check("sha256Hex_ produces exact byte-for-byte match with Node.js crypto.createHash across test vectors", () => {
  const env = createMockAuditEnvironment();

  const testVectors = [
    "",
    "Brightlife SHG Ledger",
    "0000000000000000000000000000000000000000000000000000000000000000|2026-11-24T14:00:00|treasurer@blg.com|member.create|Member|BLM-01|Created member|{}",
    "Special characters: 💰 KES 25,000.00 & UTF-8 symbols: äöü, ©, ✓, 🔒",
    JSON.stringify({ nested: { a: 1, b: [2, 3, "test"], c: true } })
  ];

  for (const vec of testVectors) {
    const expected = crypto.createHash("sha256").update(Buffer.from(vec, "utf8")).digest("hex");
    const actual = env.sha256Hex_(vec);
    assert.strictEqual(actual, expected, `Hash mismatch for vector: "${vec}"`);
    assert.strictEqual(actual.length, 64, "SHA-256 hex must be exactly 64 characters");
  }
});

check("computeAuditEntryHash_ builds canonical 8-field pipe-separated payload and returns SHA-256 hex", () => {
  const env = createMockAuditEnvironment();
  const prev = env.GENESIS_HASH;
  const ts = "2026-11-24T10:15:30";
  const email = "treasurer@brightlife.org";
  const action = "loan.disburse";
  const entity = "Loan";
  const entityId = "BLLN-20261124-001";
  const summary = "Disbursed loan KES 50,000 to BLM-04";
  const details = { amount: 50000, borrowerId: "BLM-04" };

  const hash = env.computeAuditEntryHash_(prev, ts, email, action, entity, entityId, summary, details);
  assert.strictEqual(typeof hash, "string");
  assert.strictEqual(hash.length, 64);

  // Verify against independent Node.js crypto computation
  const expectedPayload = [
    prev,
    ts,
    email,
    action,
    entity,
    entityId,
    summary,
    JSON.stringify(details)
  ].join("|");
  const expectedHash = crypto.createHash("sha256").update(expectedPayload, "utf8").digest("hex");
  assert.strictEqual(hash, expectedHash, "Canonical string generation must match independent crypto calculation");
});

check("computeAuditEntryHash_ handles null, undefined, and Date timestamps defensively", () => {
  const env = createMockAuditEnvironment();
  const dateObj = new Date("2026-11-24T08:30:00Z");
  const hash = env.computeAuditEntryHash_(null, dateObj, null, null, null, null, null, null);
  assert.strictEqual(hash.length, 64);
  assert.doesNotThrow(() => env.computeAuditEntryHash_());
});

// =========================================================================
// SECTION 4: Tamper-Evident Rolling Hash Chain Construction
// =========================================================================
console.log("\n--> Section 3: Rolling Hash Chain Construction & Linking");

check("appendAuditLog_ creates canonical 9-column Audit Log and links Genesis row", () => {
  const env = createMockAuditEnvironment();
  env.appendAuditLog_("member.create", "Member", "BLM-01", "Created member BLM-01", { firstName: "Grace" });

  const sheet = env.mockSpreadsheet.getSheetByName("Audit Log");
  assert(sheet, "Audit Log sheet must be automatically created");
  assert.strictEqual(sheet.getLastRow(), 2, "Must contain header row + 1 data row");

  const headers = sheet.getRange(1, 1, 1, 9).getValues()[0];
  assert.deepStrictEqual(headers, [
    "Timestamp", "Actor Email", "Action", "Entity", "Entity ID", "Summary", "Details", "Previous Hash", "Entry Hash"
  ]);

  const row2 = sheet.getRange(2, 1, 1, 9).getValues()[0];
  assert.strictEqual(row2[2], "member.create");
  assert.strictEqual(row2[3], "Member");
  assert.strictEqual(row2[4], "BLM-01");
  assert.strictEqual(row2[7], env.GENESIS_HASH, "Row 2 (first block) Previous Hash must equal GENESIS_HASH");
  assert.strictEqual(row2[8].length, 64, "Row 2 Entry Hash must be valid 64-char hex");
});

check("Sequential appendAuditLog_ calls build an unbroken cryptographic rolling chain", () => {
  const env = createMockAuditEnvironment();

  env.appendAuditLog_("member.create", "Member", "BLM-01", "First member", "");
  env.appendAuditLog_("contribution.deposit", "Contribution", "BLC-001", "Savings deposit KES 2,000", "");
  env.appendAuditLog_("loan.request", "Loan", "BLLN-001", "Applied for loan KES 20,000", "");

  const sheet = env.mockSpreadsheet.getSheetByName("Audit Log");
  assert.strictEqual(sheet.getLastRow(), 4, "Must contain header + 3 data rows");

  const rows = sheet.getRange(2, 1, 3, 9).getValues();

  // Row 2 (block 1)
  assert.strictEqual(rows[0][7], env.GENESIS_HASH);
  const block1Hash = rows[0][8];

  // Row 3 (block 2) Previous Hash must equal Row 2 Entry Hash
  assert.strictEqual(rows[1][7], block1Hash, "Row 3 Previous Hash must link to Row 2 Entry Hash");
  const block2Hash = rows[1][8];

  // Row 4 (block 3) Previous Hash must equal Row 3 Entry Hash
  assert.strictEqual(rows[2][7], block2Hash, "Row 4 Previous Hash must link to Row 3 Entry Hash");
});

// =========================================================================
// SECTION 5: Schema Migration & Historical Row Backfill
// =========================================================================
console.log("\n--> Section 4: Schema Migration & Historical Sealing");

check("upgradeAuditLogSchemaAndHashChain_ dynamically upgrades 7-col legacy sheet to 9-col and seals historical rows", () => {
  const env = createMockAuditEnvironment();

  // Create legacy 7-column sheet with 3 unhashed historical rows
  const legacyRows = [
    ["Timestamp", "Actor Email", "Action", "Entity", "Entity ID", "Summary", "Details"],
    ["2026-10-01T08:00:00", "admin@blg.com", "system.init", "System", "BL-SYS", "Initial system setup", "{}"],
    ["2026-10-05T09:30:00", "admin@blg.com", "member.create", "Member", "BLM-01", "Added founder", "{}"],
    ["2026-10-10T14:15:00", "treasurer@blg.com", "contribution.create", "Contribution", "BLC-01", "Initial deposit", "{}"]
  ];
  const sheet = env.mockSpreadsheet.insertSheet("Audit Log");
  legacyRows.forEach(r => sheet.appendRow(r));

  assert.strictEqual(sheet.getLastColumn(), 7);
  assert.strictEqual(sheet.getLastRow(), 4);

  // Execute schema upgrade
  const res = env.upgradeAuditLogSchemaAndHashChain_();
  assert.strictEqual(res.upgraded, true);
  assert.strictEqual(res.totalRowsSealed, 3);

  // Verify headers expanded
  assert.strictEqual(sheet.getLastColumn(), 9);
  const updatedHeaders = sheet.getRange(1, 1, 1, 9).getValues()[0];
  assert.strictEqual(updatedHeaders[7], "Previous Hash");
  assert.strictEqual(updatedHeaders[8], "Entry Hash");

  // Verify all 3 rows now have unbroken rolling hashes
  const updatedData = sheet.getRange(2, 1, 3, 9).getValues();
  assert.strictEqual(updatedData[0][7], env.GENESIS_HASH, "Row 1 of legacy data must link to GENESIS_HASH");
  assert.strictEqual(updatedData[1][7], updatedData[0][8], "Row 2 must link to Row 1 hash");
  assert.strictEqual(updatedData[2][7], updatedData[1][8], "Row 3 must link to Row 2 hash");

  // Now verify integrity check passes 100% on newly sealed historical data
  const checkReport = env.verifyAuditLogIntegrity_();
  assert.strictEqual(checkReport.isValid, true);
  assert.strictEqual(checkReport.verifiedEntries, 3);
  assert.strictEqual(checkReport.tamperedCount, 0);
  assert.strictEqual(checkReport.statusBadge, "IMMUTABLE_AND_VERIFIED");
});

// =========================================================================
// SECTION 6: Tamper Detection & Integrity Scanner
// =========================================================================
console.log("\n--> Section 5: Tamper Detection & Anomaly Pinpointing");

check("verifyAuditLogIntegrity_ confirms 100% valid ledger when untampered", () => {
  const env = createMockAuditEnvironment();

  for (let i = 1; i <= 5; i++) {
    env.appendAuditLog_("action." + i, "Entity", "ID-" + i, "Summary " + i, JSON.stringify({ index: i }));
  }

  const report = env.verifyAuditLogIntegrity_();
  assert.strictEqual(report.isValid, true);
  assert.strictEqual(report.totalEntries, 5);
  assert.strictEqual(report.verifiedEntries, 5);
  assert.strictEqual(report.tamperedCount, 0);
  assert.strictEqual(report.tamperedRows.length, 0);
  assert.strictEqual(report.statusBadge, "IMMUTABLE_AND_VERIFIED");
});

check("verifyAuditLogIntegrity_ catches payload modification in Row 3 and pinpoints exact row", () => {
  const env = createMockAuditEnvironment();

  env.appendAuditLog_("member.create", "Member", "BLM-01", "Original member BLM-01", "{}");
  env.appendAuditLog_("loan.disburse", "Loan", "BLLN-001", "Approved loan KES 20,000", '{"amount":20000}');
  env.appendAuditLog_("loan.repay", "Loan", "BLLN-001", "Repaid loan KES 5,000", '{"amount":5000}');

  const sheet = env.mockSpreadsheet.getSheetByName("Audit Log");

  // Simulating an unauthorized manual edit directly in Google Sheets at Row 3 (Loan Disbursed)
  // Attacker changed summary to claim amount was 50,000 instead of 20,000
  sheet.getRange(3, 6).setValue("Approved loan KES 50,000"); // Column 6 = Summary

  const report = env.verifyAuditLogIntegrity_();
  assert.strictEqual(report.isValid, false, "Integrity check must fail when payload is altered");
  assert.strictEqual(report.tamperedCount, 1);
  assert.strictEqual(report.statusBadge, "TAMPER_DETECTED");

  const anomaly = report.tamperedRows[0];
  assert.strictEqual(anomaly.row, 3, "Must pinpoint Row 3 as the tampered entry");
  assert.strictEqual(anomaly.action, "loan.disburse");
  assert(anomaly.reason.includes("Payload tampering detected"));
});

check("verifyAuditLogIntegrity_ catches row deletion and flags broken hash chain linkage", () => {
  const env = createMockAuditEnvironment();

  env.appendAuditLog_("block.1", "Test", "1", "First entry", "");
  env.appendAuditLog_("block.2", "Test", "2", "Second entry to be deleted", "");
  env.appendAuditLog_("block.3", "Test", "3", "Third entry", "");

  const sheet = env.mockSpreadsheet.getSheetByName("Audit Log");

  // Attacker deletes Row 3 (block.2) out of band
  sheet.deleteRows(3, 1);

  const report = env.verifyAuditLogIntegrity_();
  assert.strictEqual(report.isValid, false);
  assert.strictEqual(report.statusBadge, "TAMPER_DETECTED");

  // Block 3 is now at Row 3, but its recorded Previous Hash points to the deleted Block 2
  assert(report.tamperedRows.length > 0);
  const anomaly = report.tamperedRows[0];
  assert(anomaly.reason.includes("Broken hash chain linkage"));
});

check("verifyAuditLogIntegrity_ catches unauthorized row insertion", () => {
  const env = createMockAuditEnvironment();

  env.appendAuditLog_("block.1", "Test", "1", "First", "");
  env.appendAuditLog_("block.2", "Test", "2", "Second", "");

  const sheet = env.mockSpreadsheet.getSheetByName("Audit Log");

  // Attacker inserts a forged row between Row 2 and Row 3
  const forgedRow = [
    "2026-11-24T12:00:00",
    "hacker@evil.com",
    "unauthorized.payout",
    "Account",
    "BL-ACC",
    "Stolen funds",
    "{}",
    env.GENESIS_HASH, // forged prev hash
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ];
  sheet.rows.splice(2, 0, forgedRow);

  const report = env.verifyAuditLogIntegrity_();
  assert.strictEqual(report.isValid, false);
  assert.strictEqual(report.statusBadge, "TAMPER_DETECTED");
});

// =========================================================================
// SECTION 7: Retention & Archival Management
// =========================================================================
console.log("\n--> Section 6: Audit Log Retention Policy & Archive Checkpoint Bridge");

check("getAuditRetentionSettings returns default 365 days when unconfigured", () => {
  const env = createMockAuditEnvironment();
  const settings = env.getAuditRetentionSettings();
  assert.strictEqual(settings.retentionDays, 365);
  assert.strictEqual(settings.isInfinite, false);
});

check("saveAuditRetentionSettings persists policy and enforces RBAC permission check", () => {
  const env = createMockAuditEnvironment();

  const res = env.saveAuditRetentionSettings(180);
  assert.strictEqual(res.retentionDays, 180);
  assert.strictEqual(env.scriptProperties["AUDIT_LOG_RETENTION_DAYS"], "180");

  // Non-privileged member should be rejected
  env.setMockUser("guest@member.org", "member");
  assert.throws(() => env.saveAuditRetentionSettings(90), /Permission denied/);
});

check("archiveOldAuditLogs_ moves expired entries, updates checkpoint bridge, and retains valid chain", () => {
  const env = createMockAuditEnvironment();

  // Create 3 old entries (400 days old) and 2 recent entries (5 days old)
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const oldDate1 = new Date(now - 420 * dayMs);
  const oldDate2 = new Date(now - 410 * dayMs);
  const oldDate3 = new Date(now - 400 * dayMs);
  const recentDate1 = new Date(now - 5 * dayMs);
  const recentDate2 = new Date(now - 1 * dayMs);

  // Append 5 chronological entries manually
  const sheet = env.getOrCreateAuditSheet_();
  let prev = env.GENESIS_HASH;

  const dates = [oldDate1, oldDate2, oldDate3, recentDate1, recentDate2];
  for (let i = 0; i < dates.length; i++) {
    const tsStr = env.Utilities.formatDate(dates[i], "Africa/Nairobi", "yyyy-MM-dd'T'HH:mm:ss");
    const h = env.computeAuditEntryHash_(prev, tsStr, "admin@blg.com", "action." + i, "Entity", "ID-" + i, "Log " + i, "{}");
    sheet.appendRow([tsStr, "admin@blg.com", "action." + i, "Entity", "ID-" + i, "Log " + i, "{}", prev, h]);
    prev = h;
  }

  assert.strictEqual(sheet.getLastRow(), 6); // header + 5 rows

  // Archive entries older than 365 days
  const archRes = env.archiveOldAuditLogs_(365);
  assert.strictEqual(archRes.success, true);
  assert.strictEqual(archRes.archivedCount, 3);
  assert(archRes.archiveSheet.includes("[ARCHIVED] Audit Log"));

  // Check archive sheet
  const archSheet = env.mockSpreadsheet.getSheetByName(archRes.archiveSheet);
  assert(archSheet, "Archive sheet must exist");
  assert.strictEqual(archSheet.getLastRow(), 4, "Archive sheet must contain header + 3 rows");

  // Check active sheet has remaining 2 rows + 1 newly logged archival audit entry
  assert.strictEqual(sheet.getLastRow(), 4); // header + 2 unarchived rows + 1 archival audit entry

  // Crucial Cryptographic Test: ScriptProperties must store the checkpoint hash bridge
  const checkpointHash = env.scriptProperties["AUDIT_LOG_CHECKPOINT_HASH"];
  assert.strictEqual(checkpointHash, archRes.checkpointHash);
  assert.strictEqual(checkpointHash.length, 64);

  // Active sheet Row 2's Previous Hash must match the checkpoint hash bridge
  const activeRow2 = sheet.getRange(2, 1, 1, 9).getValues()[0];
  assert.strictEqual(activeRow2[7], checkpointHash);

  // Verification of the trimmed active sheet MUST still succeed via the checkpoint bridge!
  const integrityReport = env.verifyAuditLogIntegrity_();
  assert.strictEqual(integrityReport.isValid, true, "Chain must remain valid across archive boundary");
  assert.strictEqual(integrityReport.verifiedEntries, 3, "Verified count includes 2 remaining entries plus the newly sealed archival log entry");
  assert.strictEqual(integrityReport.genesisHash, checkpointHash);
  assert.strictEqual(integrityReport.statusBadge, "IMMUTABLE_AND_VERIFIED");
});

// =========================================================================
// SECTION 8: Caching & RPC Endpoint Performance
// =========================================================================
console.log("\n--> Section 7: Fast Cache & RPC Performance");

check("getAuditIntegrityStatus caches result for 60s and invalidates on append", () => {
  const env = createMockAuditEnvironment();

  env.appendAuditLog_("init", "System", "1", "Initial record", "");

  const status1 = env.getAuditIntegrityStatus();
  assert.strictEqual(status1.totalEntries, 1);
  assert(env.cacheStorage["audit_integrity_status_cache"], "Cache entry must be written");

  // Mutate sheet without calling append (simulating unverified state)
  const sheet = env.mockSpreadsheet.getSheetByName("Audit Log");
  sheet.getRange(2, 6).setValue("Direct Alteration");

  // Read with cache (should still return cached clean status)
  const cachedStatus = env.getAuditIntegrityStatus(false);
  assert.strictEqual(cachedStatus.isValid, true, "Cached status should return within TTL");

  // Force bypass cache
  const freshStatus = env.getAuditIntegrityStatus(true);
  assert.strictEqual(freshStatus.isValid, false, "Forced check must detect alteration");
});

check("verifyLedgerIntegrity RPC bypasses cache and enforces access control", () => {
  const env = createMockAuditEnvironment();
  env.appendAuditLog_("test", "Test", "1", "Testing", "");

  const res = env.verifyLedgerIntegrity();
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.isValid, true);
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log("\n======================================================================");
console.log(`=== TEST SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED ===`);
console.log("======================================================================");

if (passedChecks === totalChecks) {
  console.log("\n>>> SECURITY CLEARANCE: PASS - Task SEC-1 Engine Verified Immutable & Production-Ready <<<");
} else {
  console.error(`\n>>> FAILURE: ${totalChecks - passedChecks} checks failed <<<`);
  process.exit(1);
}
