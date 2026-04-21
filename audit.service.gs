/**
 * Append-only audit trail in sheet "AuditLog".
 * Columns: Timestamp, Actor Email, Action, Entity, Entity ID, Summary, Details
 */

function getOrCreateAuditSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEETS.AUDIT_LOG);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SHEETS.AUDIT_LOG);
  sheet.appendRow([
    "Timestamp",
    "Actor Email",
    "Action",
    "Entity",
    "Entity ID",
    "Summary",
    "Details",
  ]);
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * @param {string} action e.g. member.create, member.update, contribution.create
 * @param {string} entity e.g. Member, Contribution
 * @param {string} entityId optional id or ""
 * @param {string} summary one line
 * @param {string} detailsJson optional JSON string
 */
function appendAuditLog_(action, entity, entityId, summary, detailsJson) {
  try {
    var sheet = getOrCreateAuditSheet_();
    var tz = getSpreadsheet_().getSpreadsheetTimeZone();
    var ts = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss");
    var email = "";
    try {
      email = String(Session.getActiveUser().getEmail() || "").trim();
    } catch (e) {}
    sheet.appendRow([
      ts,
      email,
      action,
      entity,
      entityId || "",
      summary || "",
      detailsJson || "",
    ]);
  } catch (err) {
    console.error("appendAuditLog_: " + err);
  }
}
