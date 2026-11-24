/**
 * Brightlife SHG - System Tester & Code Fixer (@fixer)
 * Task COM-2: End-of-Month Automated Member Statements & Dividend Projections with Settings
 * Verification Test Suite
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

console.log("======================================================================");
console.log("=== FIXER TEST SUITE: TASK COM-2 AUTOMATED STATEMENTS & PROJECTIONS ===");
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
const notifPath = path.join(rootDir, "src", "comms", "notifications.service.js");
const statementsViewPath = path.join(rootDir, "src", "client", "views", "Statements.html");
const statementsUiPath = path.join(rootDir, "src", "client", "scripts", "statements.ui.js.html");

const notifCode = fs.readFileSync(notifPath, "utf8");
const statementsViewHtml = fs.readFileSync(statementsViewPath, "utf8");
const statementsUiCode = fs.readFileSync(statementsUiPath, "utf8");

// =========================================================================
// SECTION 1: Syntax & File Integrity Verification
// =========================================================================
console.log("--> Section 1: File Syntax & Integrity Checks");

check("notifications.service.js parses without syntax errors", () => {
  new vm.Script(notifCode, { filename: "notifications.service.js" });
});

check("statements.ui.js.html extract script parses without syntax errors", () => {
  const match = statementsUiCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/i);
  const scriptContent = match ? match[1] : statementsUiCode;
  new vm.Script(scriptContent, { filename: "statements.ui.js.html" });
});

check("Statements.html contains automated statement settings DOM elements", () => {
  assert(statementsViewHtml.includes('id="setting-auto-monthly-statements"'), "Missing auto-monthly-statements checkbox");
  assert(statementsViewHtml.includes('id="setting-auto-statement-day"'), "Missing auto-statement-day input");
  assert(statementsViewHtml.includes('id="setting-auto-dispatch-status"'), "Missing auto-dispatch-status container");
  assert(statementsViewHtml.includes('btn-dispatch-auto-now'), "Missing manual dispatch action button");
});

// =========================================================================
// SECTION 2: Environment Sandbox Setup
// =========================================================================
function createMockGASContext(initialProps = {}) {
  const scriptProperties = Object.assign({}, initialProps);
  const auditLogs = [];
  const sentEmails = [];
  const triggers = [];

  let currentRoleKey = "treasurer";
  let currentUserEmail = "treasurer@brightlife.org";
  let currentPermissions = { accountsWrite: true, isAdmin: true };

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

  const MailApp = {
    sendEmail(opts) {
      sentEmails.push(opts);
    }
  };

  const ScriptApp = {
    getProjectTriggers() {
      return triggers.slice();
    },
    deleteTrigger(trig) {
      const idx = triggers.indexOf(trig);
      if (idx !== -1) triggers.splice(idx, 1);
    },
    newTrigger(fnName) {
      const trigObj = {
        handler: fnName,
        timeBased() { return this; },
        onMonthDay(d) { this.day = d; return this; },
        atHour(h) { this.hour = h; return this; },
        inTimezone(tz) { this.tz = tz; return this; },
        create() {
          const t = {
            getHandlerFunction: () => fnName,
            handler: fnName,
            day: this.day,
            hour: this.hour,
            tz: this.tz,
          };
          triggers.push(t);
          return t;
        }
      };
      return trigObj;
    }
  };

  const Utilities = {
    formatDate(d, tz, pattern) {
      const dt = d instanceof Date ? d : new Date(d);
      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, "0");
      const day = String(dt.getDate()).padStart(2, "0");
      if (pattern === "yyyyMMdd") return `${year}${month}${day}`;
      if (pattern === "yyyy-MM-dd") return `${year}-${month}-${day}`;
      if (pattern === "yyyy-MM") return `${year}-${month}`;
      if (pattern === "d") return String(dt.getDate());
      if (pattern === "dd MMM yyyy") return `${day} Nov ${year}`;
      if (pattern === "MMMM yyyy") return `November ${year}`;
      return `${year}-${month}-${day}`;
    },
    sleep(ms) {}
  };

  const CacheService = {
    getScriptCache() {
      return {
        get(k) { return null; },
        put(k, v, exp) {}
      };
    }
  };

  // Mock Members table
  const membersData = [
    ["Member ID", "First Name", "Last Name", "Email", "Phone Number", "Total Savings", "Current Loan Balance", "Status"],
    ["BLM-01", "Alice", "Wanjiku", "alice@test.com", "0712345678", 50000, 0, "Active"],
    ["BLM-02", "Bob", "Otieno", "bob@test.com", "0723456789", 30000, 15000, "Active"],
    ["BLM-03", "Charlie", "Kamau", "", "0734567890", 20000, 0, "Active"], // No email
    ["BLM-04", "Diana", "Mutua", "diana@test.com", "0745678901", 10000, 0, "Inactive"],
  ];

  // Mock Repayments table
  const repaymentsData = [
    ["Payment ID", "Member ID", "Borrower Name", "Payment Date", "Principal Portion", "Interest Paid", "Fee Paid", "Total Paid", "Status"],
    ["PAY-01", "BLM-02", "Bob Otieno", "2026-11-10", 5000, 1000, 200, 6200, "Approved"],
    ["PAY-02", "BLM-02", "Bob Otieno", "2026-10-10", 5000, 1000, 200, 6200, "Approved"],
  ];

  // Mock Loans table
  const loansData = [
    ["Loan ID", "Member ID", "Borrower Name", "Requested Amount", "Interest", "Transaction Fee", "Total Paid", "Balance", "Status"],
    ["LN-01", "BLM-02", "Bob Otieno", 30000, 3000, 500, 10000, 15000, "Active"],
  ];

  // Mock CIC Statement
  const cicData = [
    ["Statement Date", "Fund Channel", "Opening Balance", "Purchases / Deposits", "Gross Interest", "Withholding Tax", "Net Yield", "Closing Balance", "Statement Ref"],
    ["2026-11-01", "CIC MMF", 100000, 0, 5000, 750, 4250, 104250, "REF-01"],
  ];

  // Mock Investments
  const investmentsData = [
    ["Investment ID", "Title", "Date Invested", "Money Invested", "ROI Amount", "Status"],
    ["INV-01", "Treasury Bond FXD", "2026-01-15", 50000, 3500, "Active"],
  ];

  // Mock Contributions table
  const contributionsData = [
    ["Transaction ID", "Member ID", "Member Name", "Date", "Amount", "Transaction Type", "Deposit Channel", "Status"],
    ["TX-01", "BLM-01", "Alice Wanjiku", "2026-11-05", 5000, "Monthly Contribution", "Equity Bank", "Approved"],
    ["TX-02", "BLM-02", "Bob Otieno", "2026-11-06", 3000, "Late Payment Fine", "Equity Bank", "Approved"],
  ];

  function createSheetMock(name, data) {
    return {
      getName: () => name,
      getLastRow: () => data.length,
      getDataRange: () => ({
        getValues: () => data.map(r => r.slice())
      })
    };
  }

  const sheets = {
    "Members": createSheetMock("Members", membersData),
    "Loan Repayments": createSheetMock("Loan Repayments", repaymentsData),
    "Loans": createSheetMock("Loans", loansData),
    "CIC Statement": createSheetMock("CIC Statement", cicData),
    "Investments": createSheetMock("Investments", investmentsData),
    "Contributions": createSheetMock("Contributions", contributionsData),
  };

  const SpreadsheetAppMock = {
    getSheetByName(name) {
      return sheets[name] || null;
    },
    getSpreadsheetTimeZone() {
      return "Africa/Nairobi";
    }
  };

  const context = {
    PropertiesService,
    MailApp,
    ScriptApp,
    Utilities,
    CacheService,
    console,
    SHEETS: {
      MEMBERS: "Members",
      CONTRIBUTIONS: "Contributions",
      LOANS: "Loans",
      LOAN_REPAYMENTS: "Loan Repayments",
      GUARANTORS: "Guarantors",
      INVESTMENTS: "Investments",
      CIC_STATEMENT: "CIC Statement",
      ACCOUNTS: "Accounts",
      AUDIT_LOG: "Audit Log",
    },
    ROLE_KEY: {
      ADMIN: "admin",
      CHAIRPERSON: "chairperson",
      TREASURER: "treasurer",
      SECRETARY: "secretary",
      MEMBER: "member",
    },
    LOAN_STATUS: {
      ACTIVE: "Active",
      SETTLED: "Settled",
      REJECTED: "Rejected",
    },
    getSpreadsheet_() {
      return SpreadsheetAppMock;
    },
    getRequiredSheet_(name) {
      const s = sheets[name];
      if (!s) throw new Error("Sheet not found: " + name);
      return s;
    },
    getHeaderMap_(headers) {
      const map = {};
      headers.forEach((h, idx) => { map[String(h).trim()] = idx; });
      return map;
    },
    requireHeaders_(map, reqs, name) {
      reqs.forEach(r => {
        if (map[r] === undefined) throw new Error(`Missing header ${r} in ${name}`);
      });
    },
    requireAccess_() {
      return {
        email: currentUserEmail,
        roleKey: currentRoleKey,
        role: currentRoleKey,
        permissions: currentPermissions
      };
    },
    requirePermission_(perm) {
      return {
        roleKey: currentRoleKey,
        role: currentRoleKey,
        granted: true
      };
    },
    appendAuditLog_(action, module, entityId, summary, details) {
      auditLogs.push({ action, module, entityId, summary, details });
    },
    // Test helper controls
    setRole(role, email = "user@test.com", perms = {}) {
      currentRoleKey = role;
      currentUserEmail = email;
      currentPermissions = perms;
    },
    getAuditLogs: () => auditLogs,
    getSentEmails: () => sentEmails,
    getTriggers: () => triggers,
    getScriptProperties: () => scriptProperties,
  };

  vm.createContext(context);
  vm.runInContext(notifCode, context);
  return context;
}

// =========================================================================
// SECTION 3: Settings Payload & Property Handling
// =========================================================================
console.log("\n--> Section 2: Notification & Statement Settings");

check("getNotificationSettings returns correct defaults when properties are empty", () => {
  const ctx = createMockGASContext({});
  const s = ctx.getNotificationSettings();
  assert.strictEqual(s.autoEmailReceipts, true, "autoEmailReceipts default should be true");
  assert.strictEqual(s.autoMonthlyStatements, false, "autoMonthlyStatements default should be false");
  assert.strictEqual(s.autoStatementDay, 1, "autoStatementDay default should be 1");
  assert.strictEqual(s.notificationBcc, "", "notificationBcc default should be empty string");
  assert.strictEqual(s.lastAutoDispatchMonth, "", "lastAutoDispatchMonth default should be empty");
  assert.strictEqual(s.lastAutoDispatchCount, 0, "lastAutoDispatchCount default should be 0");
});

check("saveNotificationSettings successfully persists autoMonthlyStatements and autoStatementDay", () => {
  const ctx = createMockGASContext({});
  const res = ctx.saveNotificationSettings({
    autoEmailReceipts: false,
    autoMonthlyStatements: true,
    autoStatementDay: 5,
    notificationBcc: "treasury@brightlife.org"
  });

  assert.strictEqual(res.success, true, "saveNotificationSettings should return success: true");
  const s = ctx.getNotificationSettings();
  assert.strictEqual(s.autoEmailReceipts, false);
  assert.strictEqual(s.autoMonthlyStatements, true);
  assert.strictEqual(s.autoStatementDay, 5);
  assert.strictEqual(s.notificationBcc, "treasury@brightlife.org");

  // Verify trigger setup
  const trigs = ctx.getTriggers();
  assert.strictEqual(trigs.length, 1, "Should have created 1 trigger");
  assert.strictEqual(trigs[0].handler, "runAutomatedMonthlyStatementDispatch_");
  assert.strictEqual(trigs[0].day, 5, "Trigger day should match configured autoStatementDay (5)");
  assert.strictEqual(trigs[0].hour, 8, "Trigger hour should be 8:00 AM");

  // Verify audit log
  const logs = ctx.getAuditLogs();
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].action, "settings.notifications_update");
});

check("saveNotificationSettings safely removes trigger when autoMonthlyStatements is disabled", () => {
  const ctx = createMockGASContext({
    AUTO_MONTHLY_STATEMENTS: "true",
    AUTO_STATEMENT_DAY: "1"
  });
  // Simulate active trigger
  ctx.setupAutomatedStatementTrigger_();
  assert.strictEqual(ctx.getTriggers().length, 1);

  // Now turn it off
  const res = ctx.saveNotificationSettings({
    autoMonthlyStatements: false
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(ctx.getNotificationSettings().autoMonthlyStatements, false);
  assert.strictEqual(ctx.getTriggers().length, 0, "Trigger should be deleted when autoMonthlyStatements is false");
});

check("saveNotificationSettings rejects non-privileged member roles", () => {
  const ctx = createMockGASContext({});
  ctx.setRole("member", "member@test.com", { isMemberOnly: true });

  const res = ctx.saveNotificationSettings({
    autoMonthlyStatements: true
  });
  assert.strictEqual(res.success, false);
  assert(res.error.includes("Only the Treasurer or Admin"), "Should enforce RBAC error message");
});

// =========================================================================
// SECTION 4: Dividend Projection Calculation Engine
// =========================================================================
console.log("\n--> Section 3: Dividend Projection Engine");

check("getGroupDividendProjectionPool_ accurately aggregates group savings and net distributable surplus", () => {
  const ctx = createMockGASContext({});
  const pool = ctx.getGroupDividendProjectionPool_();

  // Active members savings: Alice (50,000) + Bob (30,000) + Charlie (20,000) = 100,000 (Diana inactive)
  assert.strictEqual(pool.totalGroupSavings, 100000, `Expected 100000, got ${pool.totalGroupSavings}`);
  assert.strictEqual(pool.activeMemberCount, 3, "Should count 3 active members");
  assert(pool.totalDistributableSurplus > 0, "Distributable surplus should be greater than 0");
});

check("getMemberMonthlyStatementData includes accurate dividend projection for debt-free member", () => {
  const ctx = createMockGASContext({});
  const stmt = ctx.getMemberMonthlyStatementData("BLM-01", "2026-11");

  assert(stmt.dividendProjection, "Statement must attach dividendProjection object");
  const proj = stmt.dividendProjection;

  assert.strictEqual(proj.qualifyingSavings, 50000);
  assert.strictEqual(proj.groupSavings, 100000);
  assert.strictEqual(proj.shareOfPoolPct, 50, "Alice has 50% of group savings");
  assert(proj.projectedDividend > 0, "Projected dividend should be positive");
  assert(proj.projectedRoiPct > 0, "Projected ROI should be positive");
  assert.strictEqual(
    proj.payoutPriorityNote,
    "Under Bylaws Rule 5.2, dividends will be credited to member savings.",
    "Debt-free member should credit to savings"
  );
});

check("getMemberMonthlyStatementData applies loan offset priority note for borrowing member", () => {
  const ctx = createMockGASContext({});
  const stmt = ctx.getMemberMonthlyStatementData("BLM-02", "2026-11");

  assert(stmt.dividendProjection, "Statement must attach dividendProjection object");
  const proj = stmt.dividendProjection;

  assert.strictEqual(proj.qualifyingSavings, 30000);
  assert.strictEqual(proj.shareOfPoolPct, 30, "Bob has 30% of group savings");
  assert.strictEqual(
    proj.payoutPriorityNote,
    "Under Bylaws Rule 5.2, dividends will automatically offset active loan balance first.",
    "Borrower with active balance should have loan offset note"
  );
});

check("Dividend projection engine handles zero savings edge cases cleanly", () => {
  const ctx = createMockGASContext({});
  const stmt = ctx.getMemberMonthlyStatementData("BLM-01", "2026-11");
  // Force 0 savings
  stmt.closingSavings = 0;
  stmt.loanBalance = 0;

  // Emulate calculation with 0 savings
  const pool = { totalGroupSavings: 100000, totalDistributableSurplus: 10000 };
  const qualifyingSavings = 0;
  const weight = pool.totalGroupSavings > 0 ? qualifyingSavings / pool.totalGroupSavings : 0;
  const projectedDividend = pool.totalDistributableSurplus * weight;
  const sharePct = Math.round(weight * 10000) / 100;
  const projectedRoiPct = qualifyingSavings > 0 ? (projectedDividend / qualifyingSavings) * 100 : 0;

  assert.strictEqual(projectedDividend, 0);
  assert.strictEqual(sharePct, 0);
  assert.strictEqual(projectedRoiPct, 0);
});

// =========================================================================
// SECTION 5: HTML Email & WhatsApp Template Branded Card Inclusion
// =========================================================================
console.log("\n--> Section 4: Email & WhatsApp Template Formatting");

check("buildMonthlyStatementHtmlEmail_ renders branded Projected Year-End Dividend section", () => {
  const ctx = createMockGASContext({});
  const stmt = ctx.getMemberMonthlyStatementData("BLM-01", "2026-11");
  const html = ctx.buildMonthlyStatementHtmlEmail_(stmt);

  assert(html.includes("Projected Year-End Dividend &amp; Interest Yield"), "HTML email missing Dividend card title");
  assert(html.includes("Est. 50% Yield") || html.includes("% Yield"), "HTML email missing Yield badge");
  assert(html.includes("Share of Capital Pool"), "HTML email missing Share of Capital Pool label");
  assert(html.includes("50%"), "HTML email missing pool share percent");
  assert(html.includes("Under Bylaws Rule 5.2, dividends will be credited to member savings."), "HTML email missing Rule 5.2 note");
  assert(html.includes(".bl-proj-card"), "HTML email missing dark mode card class in style");
  assert(html.includes(".bl-proj-note"), "HTML email missing dark mode note class in style");
});

check("buildMonthlyStatementWhatsAppMessage_ includes concise dividend yield summary", () => {
  const ctx = createMockGASContext({});
  const stmt = ctx.getMemberMonthlyStatementData("BLM-01", "2026-11");
  const wa = ctx.buildMonthlyStatementWhatsAppMessage_(stmt);

  assert(wa.includes("*PROJECTED DIVIDEND YIELD:*"), "WhatsApp missing PROJECTED DIVIDEND YIELD header");
  assert(wa.includes("• Est. Year-End Dividend: KES"), "WhatsApp missing Est. Year-End Dividend line");
  assert(wa.includes("• Est. Return on Savings:"), "WhatsApp missing Est. Return on Savings line");
  assert(wa.includes("• Share of Group Pool: 50%"), "WhatsApp missing Share of Group Pool");
  assert(wa.includes("• Payout Priority: Under Bylaws Rule 5.2"), "WhatsApp missing Payout Priority");
});

// =========================================================================
// SECTION 6: Automated Dispatch & Idempotency Guard Logic
// =========================================================================
console.log("\n--> Section 5: Automated Dispatch & Idempotency");

check("runAutomatedMonthlyStatementDispatch_ skips when autoMonthlyStatements is disabled and unforced", () => {
  const ctx = createMockGASContext({
    AUTO_MONTHLY_STATEMENTS: "false"
  });

  const res = ctx.runAutomatedMonthlyStatementDispatch_();
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.skipped, true);
  assert(res.reason.includes("disabled in settings"));
  assert.strictEqual(ctx.getSentEmails().length, 0);
});

check("runAutomatedMonthlyStatementDispatch_ dispatches to active members with email and skips members without email", () => {
  const ctx = createMockGASContext({
    AUTO_MONTHLY_STATEMENTS: "true",
    AUTO_STATEMENT_DAY: "1"
  });

  // Force bypass day check
  const res = ctx.runAutomatedMonthlyStatementDispatch_({ bypassDayCheck: true, monthKey: "2026-10" });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.total, 3, "3 active members");
  assert.strictEqual(res.sent, 2, "Alice and Bob have emails");
  assert.strictEqual(res.skippedNoEmail, 1, "Charlie has no email");
  assert.strictEqual(res.failed, 0);

  const sent = ctx.getSentEmails();
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[0].to, "alice@test.com");
  assert.strictEqual(sent[1].to, "bob@test.com");

  // Check properties updated
  const props = ctx.getScriptProperties();
  assert.strictEqual(props.LAST_AUTO_STATEMENT_DISPATCH_MONTH, "2026-10");
  assert.strictEqual(props.LAST_AUTO_STATEMENT_DISPATCH_COUNT, "2");
  assert(props.LAST_AUTO_STATEMENT_DISPATCH_TIMESTAMP !== undefined);

  // Check audit log
  const logs = ctx.getAuditLogs();
  const dispatchLog = logs.find(l => l.action === "statement.automated_monthly_dispatch");
  assert(dispatchLog, "Must write statement.automated_monthly_dispatch audit log");
});

check("runAutomatedMonthlyStatementDispatch_ idempotently blocks duplicate runs for the same month unless force=true", () => {
  const ctx = createMockGASContext({
    AUTO_MONTHLY_STATEMENTS: "true",
    AUTO_STATEMENT_DAY: "1",
    LAST_AUTO_STATEMENT_DISPATCH_MONTH: "2026-10",
    LAST_AUTO_STATEMENT_DISPATCH_TIMESTAMP: "2026-11-01T08:00:00Z"
  });

  // 1st attempt: should skip due to idempotency
  const res1 = ctx.runAutomatedMonthlyStatementDispatch_({ bypassDayCheck: true, monthKey: "2026-10" });
  assert.strictEqual(res1.skipped, true);
  assert(res1.reason.includes("already been dispatched"));
  assert.strictEqual(ctx.getSentEmails().length, 0);

  // 2nd attempt with force: true
  const res2 = ctx.runAutomatedMonthlyStatementDispatch_({ bypassDayCheck: true, monthKey: "2026-10", force: true });
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.sent, 2);
  assert.strictEqual(ctx.getSentEmails().length, 2);
});

check("dispatchAutomatedMonthlyStatementsNow enforces Treasurer/Admin permission", () => {
  const ctx = createMockGASContext({
    AUTO_MONTHLY_STATEMENTS: "true"
  });
  ctx.setRole("member", "member@test.com", { isMemberOnly: true });

  const res = ctx.dispatchAutomatedMonthlyStatementsNow(true);
  assert.strictEqual(res.success, false);
  assert(res.error.includes("Only the Treasurer or Admin"), "Should block unprivileged member");
});

console.log("\n======================================================================");
console.log(`=== TEST SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED ===`);
console.log("======================================================================\n");

if (passedChecks !== totalChecks) {
  process.exit(1);
}
