/**
 * Brightlife SHG - Equity Statement Schema & Backfill Verification Test
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("--- Starting Equity Statement Verification ---");

// 1. Check syntax of all modified / created files
const filesToVerify = [
  "src/server/config.constants.js",
  "src/server/audit.service.js",
  "src/migration/equity.backfill.service.js"
];

const basePath = path.resolve(__dirname, "..");

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
  SpreadsheetApp: {
    flush: () => {}
  }
};

vm.createContext(context);

filesToVerify.forEach(relPath => {
  const fullPath = path.join(basePath, relPath);
  console.log(`Checking syntax: ${relPath}`);
  const code = fs.readFileSync(fullPath, "utf8");
  try {
    const script = new vm.Script(code, { filename: relPath });
    // Run script in context with minimal GAS mocks
    script.runInContext(context);
    console.log(`  ✓ Syntax OK: ${relPath}`);
  } catch (err) {
    console.error(`  ✗ Syntax/Execution Error in ${relPath}:`, err.message);
    process.exit(1);
  }
});

// 2. Verify SHEETS and constants
console.log("Verifying Constants:");
const SHEETS = vm.runInContext("SHEETS", context);
const SHEET_NAME_ALIASES = vm.runInContext("SHEET_NAME_ALIASES", context);
const EQUITY_BANK_ACCOUNT_NUMBER = vm.runInContext("EQUITY_BANK_ACCOUNT_NUMBER", context);

if (SHEETS.EQUITY_STATEMENT !== "Equity Statement") {
  console.error("  ✗ SHEETS.EQUITY_STATEMENT is not 'Equity Statement':", SHEETS.EQUITY_STATEMENT);
  process.exit(1);
}
console.log("  ✓ SHEETS.EQUITY_STATEMENT =", SHEETS.EQUITY_STATEMENT);

if (!SHEET_NAME_ALIASES["equity statement"] || !SHEET_NAME_ALIASES["equity_statement"]) {
  console.error("  ✗ SHEET_NAME_ALIASES missing equity statement entries");
  process.exit(1);
}
console.log("  ✓ SHEET_NAME_ALIASES['equity statement'] =", JSON.stringify(SHEET_NAME_ALIASES["equity statement"]));

if (EQUITY_BANK_ACCOUNT_NUMBER !== "0020164001424") {
  console.error("  ✗ EQUITY_BANK_ACCOUNT_NUMBER is not '0020164001424':", EQUITY_BANK_ACCOUNT_NUMBER);
  process.exit(1);
}
console.log("  ✓ EQUITY_BANK_ACCOUNT_NUMBER =", EQUITY_BANK_ACCOUNT_NUMBER);

// 3. Test mock execution of setupEquityStatementSchema_ and runEquityHistoricalBackfill_
console.log("\nTesting Mock Google Sheets Execution:");

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
    this.value = null;
    this.values = [];
    this.formula = null;
    this.numberFormat = null;
    this.fontWeight = null;
    this.background = null;
    this.fontColor = null;
  }
  setValue(val) { this.value = val; return this; }
  getValue() { return this.value; }
  setValues(vals) { this.values = vals; return this; }
  getValues() { return this.values; }
  setFormula(f) { this.formula = f; return this; }
  setNumberFormat(fmt) { this.numberFormat = fmt; return this; }
  setFontWeight(fw) { this.fontWeight = fw; return this; }
  setBackground(bg) { this.background = bg; return this; }
  setFontColor(fc) { this.fontColor = fc; return this; }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.frozenRows = 0;
  }
  getName() { return this.name; }
  setName(n) { this.name = n; return this; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows[0] ? this.rows[0].length : 0; }
  getMaxRows() { return 100; }
  setFrozenRows(n) { this.frozenRows = n; }
  appendRow(row) { this.rows.push(row.slice()); }
  getDataRange() {
    const range = new MockRange(this, 1, 1, this.rows.length, this.getLastColumn());
    range.getValues = () => this.rows.map(r => r.slice());
    return range;
  }
  getRange(row, col, numRows = 1, numCols = 1) {
    const range = new MockRange(this, row, col, numRows, numCols);
    range.setValue = (val) => {
      while (this.rows.length < row) this.rows.push([]);
      while (this.rows[row - 1].length < col) this.rows[row - 1].push("");
      this.rows[row - 1][col - 1] = val;
      return range;
    };
    range.setValues = (vals) => {
      for (let r = 0; r < vals.length; r++) {
        const targetR = row + r - 1;
        while (this.rows.length <= targetR) this.rows.push([]);
        for (let c = 0; c < vals[r].length; c++) {
          const targetC = col + c - 1;
          while (this.rows[targetR].length <= targetC) this.rows[targetR].push("");
          this.rows[targetR][targetC] = vals[r][c];
        }
      }
      return range;
    };
    return range;
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = {};
    this.namedRanges = {};
  }
  getSheets() { return Object.values(this.sheets); }
  getSheetByName(name) { return this.sheets[name] || null; }
  insertSheet(name) {
    const s = new MockSheet(name);
    this.sheets[name] = s;
    return s;
  }
  getNamedRanges() {
    return Object.keys(this.namedRanges).map(name => ({
      getName: () => name,
      getRange: () => this.namedRanges[name],
      setRange: (r) => { this.namedRanges[name] = r; }
    }));
  }
  setNamedRange(name, range) { this.namedRanges[name] = range; }
  removeNamedRange(name) { delete this.namedRanges[name]; }
}

const mockSS = new MockSpreadsheet();
// Pre-populate Accounts sheet
const accSheet = mockSS.insertSheet(SHEETS.ACCOUNTS);
accSheet.appendRow([
  "Org. Name", "Acc. Number", "Deposit Channel", "Payment Mode", "Paybill",
  "Inflows", "Outflows", "System Balance", "Statement Balance", "Balance Date", "Variance", "Reconciliation Status"
]);
accSheet.appendRow([
  "Equity Bank", "", "Equity Bank", "Bank", "",
  0, 0, 0, 577113.85, "2021-12-31", 0, "Reconciled"
]);

context.mockSS = mockSS;

// Run setupEquityStatementSchema_
const resSheet = vm.runInContext("setupEquityStatementSchema_(mockSS)", context);
console.log("  ✓ setupEquityStatementSchema_ returned sheet:", resSheet.getName());
console.log("  ✓ Total rows in Equity Statement:", resSheet.rows.length);
console.log("  ✓ Header row:", JSON.stringify(resSheet.rows[0]));
console.log("  ✓ Dec 2021 Baseline row:", JSON.stringify(resSheet.rows[1]));

if (resSheet.rows.length !== 2) {
  console.error("  ✗ Expected 2 rows (header + baseline), got", resSheet.rows.length);
  process.exit(1);
}
if (resSheet.rows[1][0] !== "2021-12-31" || resSheet.rows[1][2] !== "0020164001424" || resSheet.rows[1][7] !== 577113.85) {
  console.error("  ✗ Baseline values mismatch:", resSheet.rows[1]);
  process.exit(1);
}

// Run setupAllNamedRanges_
vm.runInContext("setupAllNamedRanges_(mockSS)", context);
if (!mockSS.namedRanges["EquityStatement_ClosingBalance"]) {
  console.error("  ✗ EquityStatement_ClosingBalance named range was not set!");
  process.exit(1);
}
console.log("  ✓ Named Range 'EquityStatement_ClosingBalance' registered successfully!");

// Run setupAccountsReconciliationSchema_
vm.runInContext("setupAccountsReconciliationSchema_(mockSS)", context);
const equityAccRow = accSheet.rows[1];
const accNumberColIdx = accSheet.rows[0].indexOf("Acc. Number");
if (equityAccRow[accNumberColIdx] !== "0020164001424") {
  console.error("  ✗ Equity Bank Acc. Number not updated on Accounts sheet! Got:", equityAccRow[accNumberColIdx]);
  process.exit(1);
}
console.log("  ✓ Equity Bank Acc. Number updated to '0020164001424' on Accounts sheet!");

// Run runEquityHistoricalBackfill_
const backfillRes = vm.runInContext("runEquityHistoricalBackfill_(mockSS)", context);
console.log("  ✓ runEquityHistoricalBackfill_ result:", JSON.stringify(backfillRes));
if (!backfillRes.success) {
  console.error("  ✗ runEquityHistoricalBackfill_ reported failure!");
  process.exit(1);
}

// Verify Granular raw transactions
const rawTx = vm.runInContext("EQUITY_DEC_2021_RAW_TRANSACTIONS", context);
console.log(`  ✓ Raw transactions count: ${rawTx.length}`);
const totalIn = rawTx.reduce((sum, t) => sum + t.moneyIn, 0);
const totalOut = rawTx.reduce((sum, t) => sum + t.moneyOut, 0);
console.log(`  ✓ Aggregated Money In: ${totalIn} (Expected: 33750)`);
console.log(`  ✓ Aggregated Money Out: ${totalOut} (Expected: 40060)`);
if (totalIn !== 33750 || totalOut !== 40060) {
  console.error("  ✗ Raw transaction aggregates do not match statement totals!");
  process.exit(1);
}

console.log("\nALL VERIFICATION TESTS PASSED SUCCESSFULLY! ✓");
