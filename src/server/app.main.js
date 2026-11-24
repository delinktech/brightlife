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
