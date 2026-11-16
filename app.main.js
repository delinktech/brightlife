function doGet(e) {
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
