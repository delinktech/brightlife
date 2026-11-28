function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var isDebugAction = Boolean(params.fix || params.backfillCic || params.testReconciliation || params.diagnose || params.migrate || params.setupWorkbook || params.migrateFormLoans);

  // Security Gate (@sentinel): Block unauthorized access to diagnostic and maintenance endpoints
  if (isDebugAction) {
    if (!isDiagnosticAuthorized_(e)) {
      return ContentService.createTextOutput("403_FORBIDDEN: Administrative authorization required to access diagnostic endpoints.")
        .setMimeType(ContentService.MimeType.TEXT);
    }
  }

  // MIG-3: Google Form Loan Requests backfill & form deprecation
  if (params.migrateFormLoans === "1") {
    try {
      const dryRun = params.dryRun === "1";
      const deprecate = params.deprecate === "1";
      const ss = getSpreadsheet_();
      const hasLoansTable = Boolean(getSheetByNameInsensitive_(ss, "Loans_table"));
      let res;
      if (hasLoansTable && typeof migrateLoansTableToLedger_ === "function") {
        res = migrateLoansTableToLedger_({ dryRun: dryRun, deprecateTab: deprecate });
      } else if (typeof migrateFormLoanRequestsToLedger_ === "function") {
        res = migrateFormLoanRequestsToLedger_({ dryRun: dryRun, deprecateTab: deprecate });
      } else {
        res = { error: "migrateFormLoanRequestsToLedger_ function unavailable" };
      }
      return ContentService.createTextOutput("MIGRATE_FORM_LOANS_RESULT:\n" + JSON.stringify(res, null, 2));
    } catch (err) {
      return ContentService.createTextOutput("MIGRATE_FORM_LOANS_ERROR: " + err.message + "\n" + (err.stack || ""));
    }
  }

  // ARC-1 + ARC-2: ?setupWorkbook=1 idempotently provisions Constants reference tables and the
  // 3-tier investment engine tabs (Investments columns, Investment Projects, Investment Cashflows).
  if (params.setupWorkbook === "1") {
    try {
      const setupRes = runInstitutionalWorkbookSetup_();
      return ContentService.createTextOutput("SETUP_WORKBOOK_SUCCESS:\n" + JSON.stringify(setupRes, null, 2));
    } catch (errSetup) {
      return ContentService.createTextOutput("SETUP_WORKBOOK_ERROR: " + errSetup.message + "\n" + (errSetup.stack || ""));
    }
  }

  // If ?fix=1 is in the URL, instantly restore all Row 1 header spill formulas and Summary KPIs
  if (params.fix === "1") {
    try {
      const ss = getSpreadsheet_();
      const spillRes = typeof provisionWorkbookSpillFormulas_ === "function" ? provisionWorkbookSpillFormulas_(ss) : null;
      const kpiRes = typeof provisionSummaryKpisSheet_ === "function" ? provisionSummaryKpisSheet_(ss) : null;
      return ContentService.createTextOutput(
        "FIX_SUCCESS: Row 1 spill formulas and Summary KPIs restored.\n" +
        JSON.stringify({ spillFormulas: spillRes, summaryKpis: kpiRes }, null, 2)
      );
    } catch (errFix) {
      return ContentService.createTextOutput("FIX_ERROR: " + errFix.message);
    }
  }

  // If ?backfillCic=1 is in the URL, run BrightlifeArchivist CIC statement backfill
  if (e && e.parameter && e.parameter.backfillCic === "1") {
    try {
      const res = backfillCicStatement_();
      return ContentService.createTextOutput("CIC_BACKFILL_SUCCESS: " + JSON.stringify(res, null, 2));
    } catch (err) {
      return ContentService.createTextOutput("CIC_BACKFILL_ERROR: " + err.message + "\n" + err.stack);
    }
  }

  // If ?testReconciliation=1 is in the URL, test getAccountsReconciliationData RPC
  if (e && e.parameter && e.parameter.testReconciliation === "1") {
    try {
      const res = getAccountsReconciliationData();
      return ContentService.createTextOutput("RECONCILIATION_TEST_SUCCESS:\n" + JSON.stringify(res, null, 2));
    } catch (err) {
      return ContentService.createTextOutput("RECONCILIATION_TEST_ERROR: " + err.message + "\n" + err.stack);
    }
  }

  // If ?diagnose=1 is in the URL, return sheet header layout
  if (e && e.parameter && e.parameter.diagnose === "1") {
    try {
      const diag = testDiagnoseSheetHeaders_();
      return ContentService.createTextOutput(JSON.stringify(diag, null, 2));
    } catch (err) {
      return ContentService.createTextOutput("Diagnose error: " + err.message);
    }
  }

  // If ?migrate=1 is in the URL, run migration and return diagnostics
  if (e && e.parameter && e.parameter.migrate === "1") {
    try {
      const res = runSchemaMigrationAddMemberIds_();
      return ContentService.createTextOutput("Migration result: " + JSON.stringify(res));
    } catch (err) {
      return ContentService.createTextOutput("Migration error: " + err.message + "\n" + err.stack);
    }
  }

  var template;
  try {
    template = HtmlService.createTemplateFromFile("client/views/Index");
  } catch (eTpl) {
    template = HtmlService.createTemplateFromFile("Index");
  }

  return template
    .evaluate()
    .setTitle("Brightlife SHG Dashboard")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  var candidates = [];
  if (filename.indexOf("/") !== -1) {
    candidates.push(filename);
  } else {
    if (filename.indexOf(".ui.js") !== -1 || filename.indexOf(".js") !== -1) {
      candidates.push("client/scripts/" + filename);
    } else {
      candidates.push("client/views/" + filename);
    }
    candidates.push(filename);
  }

  for (var i = 0; i < candidates.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(candidates[i]).getContent();
    } catch (e) {
      // Try next candidate
    }
  }
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Security Gate (@sentinel): Verifies administrative clearance for diagnostic/maintenance endpoints.
 * Requires an active admin session OR a matching admin secret key.
 */
function isDiagnosticAuthorized_(e) {
  var providedKey = (e && e.parameter && e.parameter.key) ? String(e.parameter.key).trim() : "";
  if (providedKey) {
    try {
      var scriptKey = PropertiesService.getScriptProperties().getProperty("ADMIN_DIAGNOSTIC_KEY");
      if (scriptKey && providedKey === scriptKey) return true;
    } catch (eProp) {}

    if (typeof ADMIN_SECRET_KEY !== "undefined" && ADMIN_SECRET_KEY && providedKey === ADMIN_SECRET_KEY) {
      return true;
    }
  }

  try {
    var email = getCurrentUserEmail_();
    if (email) {
      var ctx = getSessionRoleContext_(email);
      if (ctx && ctx.hasAccess && ctx.permissions && (ctx.permissions.isAdmin === true || ctx.roleKey === "admin")) {
        return true;
      }
    }
  } catch (eAuth) {}

  return false;
}

/**
 * Headless API Gateway (AUTH-1).
 * Accepts JSON payloads via POST from decoupled clients (e.g. GitHub Pages or custom domain):
 * {
 *   "action": "getSessionInfo",
 *   "idToken": "eyJhbGciOiJSUzI1NiIs...",
 *   "payload": { ... }
 * }
 */
function doPost(e) {
  var responseData = { success: false, error: "Invalid request" };
  try {
    var rawContents = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    if (!rawContents && e && e.parameter && e.parameter.data) {
      rawContents = e.parameter.data;
    }

    if (!rawContents) {
      return createJsonResponse_({ success: false, error: "Empty request body" }, 400);
    }

    var body = null;
    try {
      body = JSON.parse(rawContents);
    } catch (parseErr) {
      return createJsonResponse_({ success: false, error: "Malformed JSON payload: " + parseErr.message }, 400);
    }

    if (!body || typeof body !== "object") {
      return createJsonResponse_({ success: false, error: "Payload must be a JSON object" }, 400);
    }

    var action = body.action ? String(body.action).trim() : "";
    var idToken = body.idToken ? String(body.idToken).trim() : "";
    var payload = body.payload || {};

    if (!action) {
      return createJsonResponse_({ success: false, error: "Missing required 'action' field" }, 400);
    }

    // Diagnostic/Maintenance endpoints can bypass token if authorized by secret key
    var isAuthBypassed = false;
    if (body.key && typeof isDiagnosticAuthorized_ === "function" && isDiagnosticAuthorized_({ parameter: { key: body.key } })) {
      isAuthBypassed = true;
    }

    if (!isAuthBypassed) {
      // Strict Token Verification
      if (!idToken) {
        return createJsonResponse_({ success: false, error: "Authentication required: Missing Google ID token" }, 401);
      }

      var tokenResult = verifyGoogleIdToken_(idToken);
      if (!tokenResult || !tokenResult.valid || !tokenResult.email) {
        return createJsonResponse_({
          success: false,
          error: "Authentication failed: " + (tokenResult && tokenResult.error ? tokenResult.error : "Invalid token")
        }, 401);
      }

      // Establish request-scoped authentication context
      ACTIVE_REQUEST_USER_EMAIL_ = tokenResult.email;
      ACTIVE_REQUEST_USER_PROFILE_ = {
        name: tokenResult.name || "",
        picture: tokenResult.picture || ""
      };
    }

    // Execute requested action within verified context
    var result = dispatchHeadlessAction_(action, payload);
    if (result && typeof result === "object") {
      responseData = result;
      if (responseData.success === undefined) {
        responseData.success = true;
      }
    } else {
      responseData = { success: true, data: result };
    }
  } catch (err) {
    console.error("doPost error: " + (err.message || err));
    responseData = {
      success: false,
      error: (err && err.message) ? err.message : String(err)
    };
  } finally {
    // Clean up request-scoped session context
    ACTIVE_REQUEST_USER_EMAIL_ = null;
    ACTIVE_REQUEST_USER_PROFILE_ = null;
  }

  return createJsonResponse_(responseData, responseData.success !== false ? 200 : 500);
}

function createJsonResponse_(data, statusCode) {
  var jsonStr = JSON.stringify(data);
  return ContentService.createTextOutput(jsonStr)
    .setMimeType(ContentService.MimeType.JSON);
}

function dispatchHeadlessAction_(action, payload) {
  var p = payload || {};
  switch (action) {
    // Session & User Identity
    case "getSessionInfo":
      return getSessionInfo();
    case "getPersonalFinancialsData":
      return getPersonalFinancialsData();

    // Dashboard Overview & Analytics
    case "getDashboardData":
      return getDashboardData();
    case "getHomeAnalytics":
    case "getHomeAnalyticsData":
      return typeof getHomeAnalyticsData === "function" ? getHomeAnalyticsData(p.range || p.rangeKey || "this-month") : getHomeAnalytics(p.range || p.rangeKey || "this-month");
    case "getDashboardOverviewData":
      return typeof getDashboardOverviewData === "function" ? getDashboardOverviewData(p.range || p.rangeKey || "this-month") : getDashboardData();
    case "getAgmAuditPackData":
      return typeof getAgmAuditPackData === "function" ? getAgmAuditPackData(p.range || p.rangeKey) : { success: false, error: "getAgmAuditPackData unavailable" };
    case "getAgmAuditExportPackData":
      return typeof getAgmAuditExportPackData === "function" ? getAgmAuditExportPackData(p.range || p.rangeKey) : { success: false, error: "getAgmAuditExportPackData unavailable" };

    // Members Registry
    case "getMembersData":
      return typeof getMembersData === "function" ? getMembersData(p.page, p.limit) : { success: false, error: "getMembersData unavailable" };
    case "addMember":
      return typeof addMember === "function" ? addMember(p) : { success: false, error: "addMember unavailable" };
    case "updateMember":
      return typeof updateMember === "function" ? updateMember(p) : { success: false, error: "updateMember unavailable" };

    // Contributions
    case "getContributionsData":
      return typeof getContributionsData === "function" ? getContributionsData(p.page, p.limit) : { success: false, error: "getContributionsData unavailable" };
    case "addContribution":
      return typeof addContribution === "function" ? addContribution(p) : { success: false, error: "addContribution unavailable" };
    case "updateContributionStatus":
      return typeof updateContributionStatus === "function" ? updateContributionStatus(p.id, p.status) : { success: false, error: "updateContributionStatus unavailable" };

    // Loans & Credit Facilities
    case "getLoansData":
      return typeof getLoansData === "function" ? getLoansData(p.page, p.limit) : { success: false, error: "getLoansData unavailable" };
    case "getLoanRepaymentsData":
      return typeof getLoanRepaymentsData === "function" ? getLoanRepaymentsData(p.loanId, p.page, p.limit) : { success: false, error: "getLoanRepaymentsData unavailable" };
    case "addLoan":
      return typeof addLoan === "function" ? addLoan(p) : { success: false, error: "addLoan unavailable" };
    case "addLoanRepayment":
      return typeof addLoanRepayment === "function" ? addLoanRepayment(p) : { success: false, error: "addLoanRepayment unavailable" };
    case "getLoanStatementData":
      return typeof getLoanStatementData === "function" ? getLoanStatementData(p.loanId || p.id) : { success: false, error: "getLoanStatementData unavailable" };
    case "getBorrowerLoanEligibility":
      return typeof getBorrowerLoanEligibility === "function" ? getBorrowerLoanEligibility(p.borrowerId || p.memberId) : { success: false, error: "getBorrowerLoanEligibility unavailable" };
    case "getEligibleGuarantors":
      return typeof getEligibleGuarantors === "function" ? getEligibleGuarantors(p.borrowerId || p.memberId) : { success: false, error: "getEligibleGuarantors unavailable" };
    case "endorseLoan":
      return typeof endorseLoan === "function" ? endorseLoan(p.loanId, p.remarks) : { success: false, error: "endorseLoan unavailable" };
    case "authorizeLoan":
      return typeof authorizeLoan === "function" ? authorizeLoan(p.loanId, p.remarks) : { success: false, error: "authorizeLoan unavailable" };
    case "rejectLoan":
      return typeof rejectLoan === "function" ? rejectLoan(p.loanId, p.reason) : { success: false, error: "rejectLoan unavailable" };

    // Accounts & Statements
    case "getAccountsData":
      return typeof getAccountsData === "function" ? getAccountsData() : { success: false, error: "getAccountsData unavailable" };
    case "getAccountsReconciliationData":
      return typeof getAccountsReconciliationData === "function" ? getAccountsReconciliationData() : { success: false, error: "getAccountsReconciliationData unavailable" };
    case "getDividendOverviewData":
      return typeof getDividendOverviewData === "function" ? getDividendOverviewData() : { success: false, error: "getDividendOverviewData unavailable" };
    case "getMonthlyStatementsOverviewData":
      return typeof getMonthlyStatementsOverviewData === "function" ? getMonthlyStatementsOverviewData() : { success: false, error: "getMonthlyStatementsOverviewData unavailable" };

    // Investments & Projects
    case "getInvestmentsData":
      return typeof getInvestmentsData === "function" ? getInvestmentsData(p.page, p.limit) : { success: false, error: "getInvestmentsData unavailable" };
    case "getSummaryKpisData":
      return typeof getSummaryKpisData === "function" ? getSummaryKpisData() : { success: false, error: "getSummaryKpisData unavailable" };

    // Roles & RBAC Administration
    case "getRolesData":
      return typeof getRolesData === "function" ? getRolesData() : { success: false, error: "getRolesData unavailable" };
    case "saveRole":
    case "saveUserRole":
      return typeof saveUserRole === "function" ? saveUserRole(p) : (typeof saveRole === "function" ? saveRole(p) : { success: false, error: "saveRole unavailable" });
    case "deleteRole":
    case "deleteUserRole":
      return typeof deleteUserRole === "function" ? deleteUserRole(p.email || p) : (typeof deleteRole === "function" ? deleteRole(p.email || p) : { success: false, error: "deleteRole unavailable" });

    // Settings & System Governance
    case "getLoanPolicySettings":
      return typeof getLoanPolicySettings === "function" ? getLoanPolicySettings() : { success: false, error: "getLoanPolicySettings unavailable" };
    case "saveLoanPolicySettings":
      return typeof saveLoanPolicySettings === "function" ? saveLoanPolicySettings(p) : { success: false, error: "saveLoanPolicySettings unavailable" };
    case "getNotificationSettings":
      return typeof getNotificationSettings === "function" ? getNotificationSettings() : { success: false, error: "getNotificationSettings unavailable" };
    case "saveNotificationSettings":
      return typeof saveNotificationSettings === "function" ? saveNotificationSettings(p) : { success: false, error: "saveNotificationSettings unavailable" };
    case "getAuditRetentionSettings":
      return typeof getAuditRetentionSettings === "function" ? getAuditRetentionSettings() : { success: false, error: "getAuditRetentionSettings unavailable" };
    case "saveAuditRetentionSettings":
      return typeof saveAuditRetentionSettings === "function" ? saveAuditRetentionSettings(p) : { success: false, error: "saveAuditRetentionSettings unavailable" };
    case "getAuditIntegrityStatus":
      return typeof getAuditIntegrityStatus === "function" ? getAuditIntegrityStatus() : { success: false, error: "getAuditIntegrityStatus unavailable" };
    case "verifyAuditLogIntegrity":
      return typeof verifyAuditLogIntegrity === "function" ? verifyAuditLogIntegrity() : { success: false, error: "verifyAuditLogIntegrity unavailable" };

    default:
      if (typeof this[action] === "function" && action.indexOf("_") !== 0) {
        return this[action](p);
      }
      return { success: false, error: "Unsupported or unknown action: " + action };
  }
}

/**
 * One-time authorization trigger for script owner to grant UrlFetchApp external_request scope.
 * Run this function once from the Apps Script editor toolbar.
 */
function authorizeScriptPermissions() {
  var testUrl = "https://oauth2.googleapis.com/tokeninfo";
  try {
    var resp = UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
    Logger.log("UrlFetchApp authorization verified! HTTP Code: " + resp.getResponseCode());
    return "UrlFetchApp authorization verified successfully! Status: " + resp.getResponseCode();
  } catch (e) {
    Logger.log("Authorization error: " + e.message);
    throw e;
  }
}

