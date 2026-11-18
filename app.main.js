function doGet(e) {
  // If ?fix=1 is in the URL, instantly restore all formulas on Members, Loans, and Guarantors
  if (e && e.parameter && e.parameter.fix === "1") {
    try {
      const ss = getSpreadsheet_();
      const memSheet = ss.getSheetByName(SHEETS.MEMBERS);
      const totalRows = Math.max(memSheet.getLastRow(), 2);

      // Direct, standard Google Sheets formulas that NEVER turn into #REF!
      for (let r = 2; r <= totalRows; r++) {
        memSheet.getRange(r, 11).setFormula('=IF(A' + r + '="", 0, SUMIFS(Contributions!$D:$D, Contributions!$B:$B, A' + r + ', Contributions!$H:$H, "Approved"))');
        memSheet.getRange(r, 12).setFormula('=IF(A' + r + '="", 0, SUMIFS(Loans!$N:$N, Loans!$D:$D, A' + r + ', Loans!$O:$O, "Active") + SUMIFS(Loans!$N:$N, Loans!$D:$D, A' + r + ', Loans!$O:$O, "Approved"))');
        memSheet.getRange(r, 13).setFormula('=IF(A' + r + '="", 0, SUMIFS(Guarantors!$F:$F, Guarantors!$B:$B, A' + r + ', Guarantors!$D:$D, "Active") + SUMIFS(Guarantors!$F:$F, Guarantors!$B:$B, A' + r + ', Guarantors!$D:$D, "Approved"))');
        memSheet.getRange(r, 14).setFormula('=IF(A' + r + '="", 0, MAX(0, 2 * (K' + r + ' - M' + r + ') - L' + r + '))');
        memSheet.getRange(r, 15).setFormula('=IF(OR(P' + r + '<>"Active", A' + r + '=""), 0, MAX(0, K' + r + ' - L' + r + ' - M' + r + '))');
        memSheet.getRange(r, 17).setFormula('=IF(B' + r + '="", "", TRIM(B' + r + ' & " " & C' + r + ' & " " & D' + r + '))');
      }

      // Also ensure Loans Borrower’s Own Savings points cleanly to Members!$K:$K
      const loanSheet = ss.getSheetByName(SHEETS.LOANS);
      if (loanSheet && loanSheet.getLastRow() >= 2) {
        for (let lr = 2; lr <= loanSheet.getLastRow(); lr++) {
          loanSheet.getRange(lr, 16).setFormula('=IF(D' + lr + '="", 0, IFERROR(XLOOKUP(D' + lr + ', Members!$A:$A, Members!$K:$K, 0), 0))');
        }
      }

      // Also ensure Guarantors Savings Balance points cleanly to Members!$K:$K
      const guarSheet = ss.getSheetByName(SHEETS.GUARANTORS);
      if (guarSheet && guarSheet.getLastRow() >= 2) {
        for (let gr = 2; gr <= guarSheet.getLastRow(); gr++) {
          guarSheet.getRange(gr, 5).setFormula('=IF(B' + gr + '="", 0, IFERROR(XLOOKUP(B' + gr + ', Members!$A:$A, Members!$K:$K, 0), 0))');
        }
      }

      return ContentService.createTextOutput("FIX_SUCCESS: Formulas restored across Members, Loans, and Guarantors.");
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

  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Brightlife SHG Dashboard")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
