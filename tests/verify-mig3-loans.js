/**
 * Brightlife SHG - Test Suite for Task MIG-3
 * One-Time 'Form Loan Requests' Backfill & Google Form Deprecation
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("===============================================================");
console.log("=== VERIFICATION TEST SUITE: TASK MIG-3 FORM LOANS BACKFILL ===");
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
const migrationFilePath = path.join(rootDir, "src", "migration", "loan.form.migration.js");
const loansServicePath = path.join(rootDir, "src", "server", "loans.service.js");
const appMainPath = path.join(rootDir, "src", "server", "app.main.js");
const loansHtmlPath = path.join(rootDir, "src", "client", "views", "Loans.html");
const loansUiPath = path.join(rootDir, "src", "client", "scripts", "loans.ui.js.html");

const migrationCode = fs.readFileSync(migrationFilePath, "utf8");
const loansServiceCode = fs.readFileSync(loansServicePath, "utf8");
const appMainCode = fs.readFileSync(appMainPath, "utf8");
const loansHtmlCode = fs.readFileSync(loansHtmlPath, "utf8");
const loansUiCode = fs.readFileSync(loansUiPath, "utf8");

// -------------------------------------------------------------
// SECTION 1: Static Code & Syntax Analysis
// -------------------------------------------------------------
console.log("--- SECTION 1: Static Code & Directive Verification ---");

check("loan.form.migration.js enforces canonical BLLN- prefix (Task ARC-5)", () => {
  assert(migrationCode.includes('const deterministicLoanId = "BLLN-" + dateStr + "-R" + ("000" + (r + 1)).slice(-4);'),
    "Must generate canonical BLLN-YYYYMMDD-RXXXX ID format");
});

check("loan.form.migration.js checks both BLLN- and legacy LN- in existingLoanIds for 100% idempotency", () => {
  assert(migrationCode.includes('const legacyLoanId = "LN-" + dateStr + "-R" + ("000" + (r + 1)).slice(-4);'),
    "Must define legacyLoanId LN- format");
  assert(migrationCode.includes('existingLoanIds[deterministicLoanId] || existingLoanIds[legacyLoanId]'),
    "Must check both deterministicLoanId and legacyLoanId in existingLoanIds");
});

check("loan.form.migration.js implements deprecateFormLoanRequestsTab_(ss)", () => {
  assert(migrationCode.includes("function deprecateFormLoanRequestsTab_(ss)"),
    "Must define deprecateFormLoanRequestsTab_(ss)");
  assert(migrationCode.includes('"[ARCHIVED] " + FORM_LOAN_REQUESTS_TAB'),
    "Must rename tab to [ARCHIVED] Form Loan Requests");
  assert(migrationCode.includes('"#94a3b8"'),
    "Must set tab color to gray #94a3b8");
});

check("loan.form.migration.js triggers deprecation if options.deprecateTab === true and not dryRun", () => {
  assert(migrationCode.includes("options.deprecateTab === true && !dryRun"),
    "Must check options.deprecateTab === true && !dryRun");
  assert(migrationCode.includes("deprecateFormLoanRequestsTab_(ss)"),
    "Must invoke deprecateFormLoanRequestsTab_(ss)");
});

check("loans.service.js exposes secure runFormLoansMigration admin RPC with RBAC", () => {
  assert(loansServiceCode.includes("function runFormLoansMigration(options)"),
    "Must declare runFormLoansMigration(options)");
  assert(loansServiceCode.includes("requireAccess_()"),
    "Must call requireAccess_()");
  assert(loansServiceCode.includes("isAdmin === true || session.roleKey === ROLE_KEY.ADMIN || session.roleKey === ROLE_KEY.TREASURER"),
    "Must verify staff/admin/treasurer privileges");
  assert(loansServiceCode.includes("migrateFormLoanRequestsToLedger_(options)"),
    "Must delegate to migrateFormLoanRequestsToLedger_");
});

check("app.main.js includes params.migrateFormLoans in isDebugAction gate", () => {
  assert(appMainCode.includes("params.migrateFormLoans"),
    "isDebugAction must include params.migrateFormLoans");
  assert(appMainCode.includes('if (params.migrateFormLoans === "1")'),
    "Must handle params.migrateFormLoans === '1'");
  assert(appMainCode.includes("MIGRATE_FORM_LOANS_RESULT:"),
    "Must return MIGRATE_FORM_LOANS_RESULT output");
});

check("Loans.html contains admin-only Migrate Past Loans button with data-require-perm='isAdmin'", () => {
  assert(loansHtmlCode.includes('onclick="openFormLoansMigrationModal()"'),
    "Must invoke openFormLoansMigrationModal()");
  assert(loansHtmlCode.includes('data-require-perm="isAdmin"'),
    "Must require isAdmin permission");
  assert(loansHtmlCode.includes("Migrate Past Loans"),
    "Must display 'Migrate Past Loans' button text");
});

check("loans.ui.js.html declares openFormLoansMigrationModal and executeFormLoansMigration", () => {
  assert(loansUiCode.includes("function openFormLoansMigrationModal()"),
    "Must declare openFormLoansMigrationModal()");
  assert(loansUiCode.includes("function executeFormLoansMigration(dryRun)"),
    "Must declare executeFormLoansMigration(dryRun)");
  assert(loansUiCode.includes("window.openFormLoansMigrationModal = openFormLoansMigrationModal;"),
    "Must expose openFormLoansMigrationModal on window");
  assert(loansUiCode.includes("window.executeFormLoansMigration = executeFormLoansMigration;"),
    "Must expose executeFormLoansMigration on window");
});

// -------------------------------------------------------------
// SECTION 2: Mock Sheets VM Functional Execution
// -------------------------------------------------------------
console.log("\n--- SECTION 2: Functional Execution & Formula Safety in VM ---");

class MockSheet {
  constructor(name, data) {
    this.name = name;
    this.data = data || [];
    this.tabColor = null;
  }
  getName() { return this.name; }
  setName(newName) { this.name = newName; return this; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return this.data[0] ? this.data[0].length : 0; }
  setTabColor(color) { this.tabColor = color; return this; }
  getTabColor() { return this.tabColor; }
  getDataRange() {
    const self = this;
    return {
      getValues() { return self.data.map(row => [...row]); }
    };
  }
  getRange(startRow, startCol, numRows, numCols) {
    const self = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r++) {
          const rowIdx = startRow - 1 + r;
          const rowData = self.data[rowIdx] || [];
          out.push(rowData.slice(startCol - 1, startCol - 1 + numCols));
        }
        return out;
      },
      setValues(vals) {
        for (let r = 0; r < vals.length; r++) {
          const rowIdx = startRow - 1 + r;
          if (!self.data[rowIdx]) self.data[rowIdx] = [];
          for (let c = 0; c < vals[r].length; c++) {
            self.data[rowIdx][startCol - 1 + c] = vals[r][c];
          }
        }
        return this;
      }
    };
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
    this.tz = "Africa/Nairobi";
  }
  getSheetByName(name) {
    for (const s of Object.values(this.sheets)) {
      if (s.getName() === name) return s;
    }
    return null;
  }
  getSpreadsheetTimeZone() { return this.tz; }
}

function createTestEnvironment() {
  const ss = new MockSpreadsheet();

  // 1. Form Loan Requests sheet
  const formHeaders = [
    "Timestamp", "Borrower Name", "National ID", "Phone Number", "Email",
    "Loan Amount Requested", "Loan Period (Months)", "Loan Purpose",
    "Guarantor 1 Name", "Guarantor 1 Amount",
    "Guarantor 2 Name", "Guarantor 2 Amount"
  ];
  const formRows = [
    formHeaders,
    ["2023-04-15 10:00:00", "Alice Wanjiru", "12345678", "+254712345678", "alice@example.com", "50000", "12", "Business Expansion", "Bob Otieno", "25000", "Charlie Kamau", "25000"],
    ["2023-05-10 11:30:00", "Bob Otieno", "23456789", "+254723456789", "bob@example.com", "30000", "6", "School Fees", "Alice Wanjiru", "30000", "", ""]
  ];
  ss.sheets["Form Loan Requests"] = new MockSheet("Form Loan Requests", formRows);

  // 2. Members sheet
  const memberHeaders = ["Member ID", "First Name", "Middle Name", "Last Name", "National Id", "Phone Number", "Email"];
  const memberRows = [
    memberHeaders,
    ["BL-001", "Alice", "", "Wanjiru", "12345678", "+254712345678", "alice@example.com"],
    ["BL-002", "Bob", "", "Otieno", "23456789", "+254723456789", "bob@example.com"],
    ["BL-003", "Charlie", "", "Kamau", "34567890", "+254734567890", "charlie@example.com"]
  ];
  ss.sheets["Members"] = new MockSheet("Members", memberRows);

  // 3. Loans sheet (Row 1 headers, Row 2 contains spill formulas)
  const loanHeaders = [
    "Loan ID", "Borrower Name", "Request Date", "Approved Date", "Member ID",
    "Requested Amount", "Repayment Amount", "Total Paid", "Principal Paid",
    "Interest Paid", "Fee Paid", "Balance", "Interest", "Transaction Fee",
    "Status", "Borrower's Own Savings", "Total Guaranteed", "Shortfall Amount"
  ];
  ss.sheets["Loans"] = new MockSheet("Loans", [loanHeaders]);

  // 4. Guarantors sheet
  const guarHeaders = [
    "Loan ID", "Member ID", "Guarantor Name", "Guaranteed Amount",
    "Loan Status", "Guarantor's Savings Balance", "Guarantor Eligibility"
  ];
  ss.sheets["Guarantors"] = new MockSheet("Guarantors", [guarHeaders]);

  // 5. Audit Log sheet
  const auditHeaders = ["Timestamp", "User Email", "Action", "Entity", "Entity ID", "Summary", "Details"];
  ss.sheets["Audit Log"] = new MockSheet("Audit Log", [auditHeaders]);

  const auditLogs = [];

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
    parseInt: parseInt,
    isNaN: isNaN,
    SpreadsheetApp: {
      flush: () => {}
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const date = new Date(d);
        const y = date.getUTCFullYear();
        const m = ("0" + (date.getUTCMonth() + 1)).slice(-2);
        const day = ("0" + date.getUTCDate()).slice(-2);
        return `${y}${m}${day}`;
      }
    },
    SHEETS: {
      MEMBERS: "Members",
      LOANS: "Loans",
      GUARANTORS: "Guarantors",
      AUDIT_LOG: "Audit Log"
    },
    LOAN_STATUS: {
      PENDING: "Pending",
      ACTIVE: "Active"
    },
    ROLE_KEY: {
      ADMIN: "admin",
      TREASURER: "treasurer",
      MEMBER: "member"
    },
    getSpreadsheet_: () => ss,
    getRequiredSheet_: (name) => {
      const s = ss.getSheetByName(name);
      if (!s) throw new Error("Missing required sheet: " + name);
      return s;
    },
    getSheetByNameInsensitive_: (spreadsheet, name) => {
      const lower = name.toLowerCase();
      for (const s of Object.values(spreadsheet.sheets)) {
        if (s.getName().toLowerCase() === lower) return s;
      }
      return null;
    },
    getHeaderMap_: (headers) => {
      const map = {};
      headers.forEach((h, idx) => {
        if (h) map[String(h).trim()] = idx;
      });
      return map;
    },
    parseDateInput_: (d) => new Date(d),
    appendAuditLog_: (action, entity, entityId, summary, details) => {
      auditLogs.push({ action, entity, entityId, summary, details });
      ss.sheets["Audit Log"].data.push([
        new Date().toISOString(), "test@brightlife.org", action, entity, entityId, summary, details
      ]);
    },
    invalidateSheetContextCache_: () => {}
  };

  vm.createContext(context);
  vm.runInContext(migrationCode, context);

  return { ss, context, auditLogs };
}

check("migrateFormLoanRequestsToLedger_ dryRun mode operates safely without sheet mutation", () => {
  const { ss, context } = createTestEnvironment();
  const res = vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: true })", context);

  assert.strictEqual(res.success, true, "Dry run must succeed");
  assert.strictEqual(res.dryRun, true, "dryRun flag must be true");
  assert.strictEqual(res.processedCount, 2, "Must process 2 requests");
  assert.strictEqual(res.skippedCount, 0, "Must skip 0 requests initially");
  assert.strictEqual(res.loansCount, 2, "Must identify 2 loans");
  assert.strictEqual(res.guarantorsCount, 3, "Must identify 3 guarantors total");

  // Verify no mutation
  assert.strictEqual(ss.getSheetByName("Loans").data.length, 1, "Loans sheet must remain untouched");
  assert.strictEqual(ss.getSheetByName("Guarantors").data.length, 1, "Guarantors sheet must remain untouched");
});

check("Live migration populates canonical BLLN- loan IDs and links member IDs correctly", () => {
  const { ss, context } = createTestEnvironment();
  const res = vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: false, deprecateTab: true })", context);

  assert.strictEqual(res.success, true, "Live migration must succeed");
  assert.strictEqual(res.processedCount, 2, "Must process 2 loans");
  assert.strictEqual(res.loansAppended, 2, "Must append 2 loans");
  assert.strictEqual(res.guarantorsAppended, 3, "Must append 3 guarantors");

  const loansSheet = ss.getSheetByName("Loans");
  assert.strictEqual(loansSheet.data.length, 3, "Loans sheet should have header + 2 loans");

  const loan1 = loansSheet.data[1];
  const loan2 = loansSheet.data[2];

  // Check canonical BLLN- ID format
  assert(loan1[0].startsWith("BLLN-20230415-R0002"), `Loan 1 ID must start with BLLN-20230415-R0002, got ${loan1[0]}`);
  assert.strictEqual(loan1[4], "BL-001", "Loan 1 borrower member ID must resolve to BL-001 (Alice)");
  assert.strictEqual(loan1[5], 50000, "Loan 1 requested amount must be 50000");

  assert(loan2[0].startsWith("BLLN-20230510-R0003"), `Loan 2 ID must start with BLLN-20230510-R0003, got ${loan2[0]}`);
  assert.strictEqual(loan2[4], "BL-002", "Loan 2 borrower member ID must resolve to BL-002 (Bob)");
  assert.strictEqual(loan2[5], 30000, "Loan 2 requested amount must be 30000");
});

check("Spill formula safety: Computed columns in Loans & Guarantors remain strictly blank ('')", () => {
  const { ss, context } = createTestEnvironment();
  vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: false, deprecateTab: true })", context);

  const loansSheet = ss.getSheetByName("Loans");
  const loan1 = loansSheet.data[1];
  const loanHeaders = loansSheet.data[0];

  // In Loans: Borrower Name (col 1), Repayment Amount (col 6), Total Paid (col 7),
  // Principal Paid (col 8), Interest Paid (col 9), Fee Paid (col 10), Balance (col 11),
  // Borrower's Own Savings (col 15), Total Guaranteed (col 16), Shortfall Amount (col 17)
  const computedLoanColIndices = [1, 6, 7, 8, 9, 10, 11, 15, 16, 17];
  computedLoanColIndices.forEach(idx => {
    assert.strictEqual(loan1[idx], "", `Loans column '${loanHeaders[idx]}' at index ${idx} must remain blank "" for Row 2 spill formula`);
  });

  const guarSheet = ss.getSheetByName("Guarantors");
  const guar1 = guarSheet.data[1];
  const guarHeaders = guarSheet.data[0];

  // In Guarantors: Guarantor Name (col 2), Loan Status (col 4),
  // Guarantor's Savings Balance (col 5), Guarantor Eligibility (col 6)
  const computedGuarColIndices = [2, 4, 5, 6];
  computedGuarColIndices.forEach(idx => {
    assert.strictEqual(guar1[idx], "", `Guarantors column '${guarHeaders[idx]}' at index ${idx} must remain blank "" for Row 2 spill formula`);
  });

  // Raw-input columns: Loan ID (0), Member ID (1), Guaranteed Amount (3)
  assert(guar1[0].startsWith("BLLN-"), "Guarantors Loan ID must be populated");
  assert.strictEqual(guar1[1], "BL-002", "Guarantor 1 Member ID must be BL-002 (Bob)");
  assert.strictEqual(guar1[3], 25000, "Guaranteed amount must be 25000");
});

check("Tab deprecation renames Form Loan Requests to [ARCHIVED], sets gray color, logs audit", () => {
  const { ss, context, auditLogs } = createTestEnvironment();
  const res = vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: false, deprecateTab: true })", context);

  assert(res.tabDeprecation, "tabDeprecation result must be present");
  assert.strictEqual(res.tabDeprecation.success, true, "Tab deprecation must succeed");
  assert.strictEqual(res.tabDeprecation.sheetName, "[ARCHIVED] Form Loan Requests");

  // Check tab renamed
  const archivedSheet = ss.getSheetByName("[ARCHIVED] Form Loan Requests");
  assert(archivedSheet, "Tab must be renamed to '[ARCHIVED] Form Loan Requests'");
  assert.strictEqual(archivedSheet.getTabColor(), "#94a3b8", "Tab color must be #94a3b8");

  // Check audit log recorded
  const deprecationLog = auditLogs.find(l => l.action === "migration.tab_deprecated");
  assert(deprecationLog, "Audit log must contain migration.tab_deprecated entry");
  assert.strictEqual(deprecationLog.entityId, "[ARCHIVED] Form Loan Requests");
});

check("Idempotency: Re-running migration produces 0 duplicates (100% skipped)", () => {
  const { ss, context } = createTestEnvironment();

  // First run
  vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: false, deprecateTab: false })", context);
  const loansAfterRun1 = ss.getSheetByName("Loans").data.length;
  const guarAfterRun1 = ss.getSheetByName("Guarantors").data.length;

  // Second run
  const res2 = vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: false, deprecateTab: false })", context);
  assert.strictEqual(res2.processedCount, 0, "No new loans should be processed on second run");
  assert.strictEqual(res2.skippedCount, 2, "All 2 loans should be skipped as duplicates");
  assert.strictEqual(res2.loansAppended, 0, "0 loans appended on second run");
  assert.strictEqual(res2.guarantorsAppended, 0, "0 guarantors appended on second run");

  // Verify lengths unchanged
  assert.strictEqual(ss.getSheetByName("Loans").data.length, loansAfterRun1, "Loans row count must remain unchanged");
  assert.strictEqual(ss.getSheetByName("Guarantors").data.length, guarAfterRun1, "Guarantors row count must remain unchanged");
});

check("Idempotency recognizes legacy LN- prefix in existingLoanIds and skips duplicates", () => {
  const { ss, context } = createTestEnvironment();

  // Pre-seed Loans sheet with a legacy LN- loan that corresponds to Row 2
  const loansSheet = ss.getSheetByName("Loans");
  const legacyRow = new Array(loansSheet.data[0].length).fill("");
  legacyRow[0] = "LN-20230415-R0002"; // Legacy prefix
  legacyRow[4] = "BL-001";
  loansSheet.data.push(legacyRow);

  const res = vm.runInContext("migrateFormLoanRequestsToLedger_({ dryRun: false, deprecateTab: false })", context);
  // Row 2 has legacy LN-20230415-R0002, Row 3 is new
  assert.strictEqual(res.skippedCount, 1, "Row 2 must be skipped because legacy LN- ID exists");
  assert.strictEqual(res.processedCount, 1, "Only Row 3 should be processed");
  assert.strictEqual(res.loansAppended, 1, "Only 1 loan appended");
});

check("loans.service.js runFormLoansMigration RBAC gate allows staff and blocks non-staff", () => {
  const { context } = createTestEnvironment();
  vm.runInContext(loansServiceCode, context);

  // Non-staff session
  context.requireAccess_ = () => ({
    roleKey: "member",
    permissions: { isAdmin: false }
  });

  assert.throws(() => {
    vm.runInContext("runFormLoansMigration({ dryRun: true })", context);
  }, /Access denied: Administrative privileges required/, "Must reject non-staff user");

  // Staff (Treasurer) session
  context.requireAccess_ = () => ({
    roleKey: "treasurer",
    permissions: { isAdmin: false }
  });

  const res = vm.runInContext("runFormLoansMigration({ dryRun: true })", context);
  assert.strictEqual(res.success, true, "Must permit Treasurer access to runFormLoansMigration");
});

check("app.main.js doGet responds to ?migrateFormLoans=1 with JSON result", () => {
  const { context } = createTestEnvironment();
  vm.runInContext(loansServiceCode, context);
  vm.runInContext(appMainCode, context);

  context.isDiagnosticAuthorized_ = () => true;
  let textOutput = "";
  context.ContentService = {
    createTextOutput: (txt) => {
      textOutput = txt;
      return {
        setMimeType: () => ({})
      };
    },
    MimeType: { TEXT: "TEXT" }
  };

  vm.runInContext('doGet({ parameter: { migrateFormLoans: "1", dryRun: "1" } })', context);
  assert(textOutput.startsWith("MIGRATE_FORM_LOANS_RESULT:"), `Output must start with MIGRATE_FORM_LOANS_RESULT, got: ${textOutput}`);
  assert(textOutput.includes('"dryRun": true'), "Output must contain dryRun result");
});

// -------------------------------------------------------------
// SECTION 3: Authoritative Loans_table Migration Tests
// -------------------------------------------------------------
console.log("\n--- SECTION 3: Authoritative Loans_table Migration Tests ---");

function createLoansTableTestEnvironment() {
  const env = createTestEnvironment();
  const ss = env.ss;

  // Add Loans_table sheet with exact user headers
  const ltHeaders = [
    "Loan Id", "Issue Date", "Member No.", "Owner", "Amount Borrowed",
    "Transaction fee", "Amount to re-pay", "Ammount paid", "Balance Amount", "Active"
  ];
  const ltRows = [
    ltHeaders,
    ["LN-1", "2022-01-15", "1", "Alice Wanjiru", "40000", "500", "44000", "44000", "0", "FALSE"], // Settled historical loan
    ["LN-2", "2023-03-20", "2", "Bob Otieno", "60000", "500", "66000", "30000", "36000", "TRUE"],   // Active historical loan
    ["3", "2023-08-10", "BLM-03", "Charlie Kamau", "20000", "200", "22000", "0", "22000", "TRUE"]   // Active with numeric ID "3"
  ];
  ss.sheets["Loans_table"] = new MockSheet("Loans_table", ltRows);

  return env;
}

check("migrateLoansTableToLedger_ retains exact historical Loan Id without alteration", () => {
  const { ss, context } = createLoansTableTestEnvironment();
  const res = vm.runInContext("migrateLoansTableToLedger_({ dryRun: false })", context);

  assert.strictEqual(res.success, true, "migrateLoansTableToLedger_ must succeed");
  assert.strictEqual(res.processedCount, 3, "Must process all 3 loans from Loans_table");
  assert.strictEqual(res.loansAppended, 3, "Must append 3 loans");

  const loansSheet = ss.getSheetByName("Loans");
  const row1 = loansSheet.data[1];
  const row2 = loansSheet.data[2];
  const row3 = loansSheet.data[3];

  // User directive: "We can retain the current Loan Ids.. only the new loans should take up the updated loans ids"
  assert.strictEqual(row1[0], "LN-1", "Must preserve exact historical Loan Id 'LN-1'");
  assert.strictEqual(row2[0], "LN-2", "Must preserve exact historical Loan Id 'LN-2'");
  assert.strictEqual(row3[0], "3", "Must preserve exact historical Loan Id '3'");
});

check("migrateLoansTableToLedger_ normalizes Member No. to canonical BLM-XX standard", () => {
  const { ss, context } = createLoansTableTestEnvironment();
  vm.runInContext("migrateLoansTableToLedger_({ dryRun: false })", context);

  const loansSheet = ss.getSheetByName("Loans");
  assert.strictEqual(loansSheet.data[1][4], "BLM-01", "Member No '1' must be normalized to 'BLM-01'");
  assert.strictEqual(loansSheet.data[2][4], "BLM-02", "Member No '2' must be normalized to 'BLM-02'");
  assert.strictEqual(loansSheet.data[3][4], "BLM-03", "Member No 'BLM-03' must remain 'BLM-03'");
});

check("migrateLoansTableToLedger_ maps financial fields and active status correctly", () => {
  const { ss, context } = createLoansTableTestEnvironment();
  vm.runInContext("migrateLoansTableToLedger_({ dryRun: false })", context);

  const loansSheet = ss.getSheetByName("Loans");
  const row1 = loansSheet.data[1]; // LN-1: 40k borrowed, 44k repay (interest 4000), 500 fee, bal 0, Active=FALSE -> Settled
  assert.strictEqual(row1[5], 40000, "Requested Amount must be 40000");
  assert.strictEqual(row1[12], 4000, "Interest must be 44000 - 40000 = 4000");
  assert.strictEqual(row1[13], 500, "Transaction fee must be 500");
  assert.strictEqual(row1[14], "Settled", "Status must be 'Settled' for zero balance / Active=FALSE");

  const row2 = loansSheet.data[2]; // LN-2: 60k borrowed, 66k repay (interest 6000), 500 fee, bal 36k, Active=TRUE -> Active
  assert.strictEqual(row2[5], 60000, "Requested Amount must be 60000");
  assert.strictEqual(row2[12], 6000, "Interest must be 66000 - 60000 = 6000");
  assert.strictEqual(row2[13], 500, "Transaction fee must be 500");
  assert.strictEqual(row2[14], "Active", "Status must be 'Active' for balance > 0 / Active=TRUE");
});

check("migrateLoansTableToLedger_ cross-references Form Loan Requests for guarantors", () => {
  const { ss, context } = createLoansTableTestEnvironment();
  const res = vm.runInContext("migrateLoansTableToLedger_({ dryRun: false })", context);

  // In test environment, Form Loan Requests has Alice (BL-001/BLM-01) with 2 guarantors, and Bob with 1 guarantor
  assert(res.guarantorsAppended >= 2, "Must link guarantors from Form Loan Requests");
  const guarSheet = ss.getSheetByName("Guarantors");
  assert(guarSheet.data.length > 1, "Guarantors sheet must contain linked pledges");
  assert.strictEqual(guarSheet.data[1][0], "LN-1", "Guarantor Loan ID must match loan LN-1");
});

check("migrateLoansTableToLedger_ enforces 100% idempotency when executed repeatedly", () => {
  const { ss, context } = createLoansTableTestEnvironment();

  // Run 1
  vm.runInContext("migrateLoansTableToLedger_({ dryRun: false })", context);
  const rowsAfterRun1 = ss.getSheetByName("Loans").data.length;

  // Run 2
  const res2 = vm.runInContext("migrateLoansTableToLedger_({ dryRun: false })", context);
  assert.strictEqual(res2.processedCount, 0, "0 loans should be processed on repeat run");
  assert.strictEqual(res2.skippedCount, 3, "All 3 loans should be skipped");
  assert.strictEqual(ss.getSheetByName("Loans").data.length, rowsAfterRun1, "Loans row count must remain unchanged");
});

check("runFormLoansMigration prioritizes Loans_table as primary authoritative source", () => {
  const { context } = createLoansTableTestEnvironment();
  vm.runInContext(loansServiceCode, context);

  context.requireAccess_ = () => ({
    roleKey: "admin",
    permissions: { isAdmin: true }
  });

  const res = vm.runInContext("runFormLoansMigration({ dryRun: true })", context);
  assert.strictEqual(res.source, "Loans_table", "Must use Loans_table as primary migration source");
  assert.strictEqual(res.processedCount, 3, "Must process 3 loans from Loans_table");
});

console.log("\n===============================================================");
console.log(`=== SUMMARY: ${passedChecks} / ${totalChecks} CHECKS PASSED ===`);
console.log("===============================================================\n");

if (passedChecks === totalChecks) {
  console.log("🎉 All MIG-3 loan requests backfill & form deprecation verification checks PASSED successfully!");
  process.exit(0);
} else {
  console.error("❌ Some verification checks failed.");
  process.exit(1);
}
