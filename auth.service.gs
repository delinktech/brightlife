/**
 * Role-based access from spreadsheet tab "Roles" (Email, Name, Role, Active).
 */

function getCurrentUserEmail_() {
  try {
    var activeEmail = String(Session.getActiveUser().getEmail() || "").trim();
    if (activeEmail) return activeEmail;
    var effectiveEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
    return effectiveEmail;
  } catch (e) {
    return "";
  }
}

function isActiveRoleFlag_(value) {
  if (value === true || value === 1) return true;
  var s = String(value || "")
    .trim()
    .toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1" || s === "active";
}

function normalizeRoleKey_(raw) {
  var s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "admin" || s === "administrator") return ROLE_KEY.ADMIN;
  if (s === "secretary") return ROLE_KEY.SECRETARY;
  if (s === "member" || s === "members") return ROLE_KEY.MEMBER;
  return ROLE_KEY.NONE;
}

function getOrCreateRolesSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEETS.ROLES);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.ROLES);
  }
  if (sheet.getLastRow() < 1) {
    sheet.appendRow(["Email", "Name", "Role", "Active"]);
    sheet.setFrozenRows(1);
  }
  if (sheet.getLastRow() === 1) {
    var ownerEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
    if (ownerEmail) {
      sheet.appendRow([ownerEmail, "Owner Admin", "Admin", true]);
    }
  }
  return sheet;
}

function extractEmailFromString_(val) {
  if (!val) return "";
  if (typeof val === "object") {
    if (val.email) return String(val.email).trim().toLowerCase();
    try {
      val = JSON.stringify(val);
    } catch (e) {
      val = String(val);
    }
  }
  var str = String(val || "");
  var match = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  if (match) return match[0].trim().toLowerCase();
  return str.replace(/[\s\u00A0]+/g, "").toLowerCase();
}

function lookupRoleRowForEmail_(email) {
  var targetEmail = extractEmailFromString_(email);
  if (!targetEmail) return null;

  try {
    var sheet = getOrCreateRolesSheet_();
    if (!sheet || sheet.getLastRow() < 2) return null;

    var range = sheet.getDataRange();
    var values = range.getValues();
    var displayValues = range.getDisplayValues();
    if (!values || values.length < 2) return null;

    var headerRowIndex = 0;
    var colMap = getHeaderMap_(values[0]);
    var emailCol = colMap["email"];

    if (emailCol === undefined) {
      for (var h = 0; h < Math.min(values.length, 5); h++) {
        var testMap = getHeaderMap_(values[h]);
        if (testMap["email"] !== undefined) {
          headerRowIndex = h;
          colMap = testMap;
          emailCol = testMap["email"];
          break;
        }
      }
    }

    if (emailCol === undefined) {
      console.error("Roles sheet missing 'Email' header");
      return null;
    }

    var roleCol = colMap["role"];
    var activeCol = colMap["active"];
    var nameCol = colMap["name"];

    for (var i = headerRowIndex + 1; i < values.length; i++) {
      var row = values[i];
      var displayRow = displayValues[i];

      var rawEmailVal = emailCol !== undefined ? row[emailCol] : "";
      var dispEmailVal = displayRow && emailCol !== undefined ? displayRow[emailCol] : "";

      var rowEmail = extractEmailFromString_(rawEmailVal) || extractEmailFromString_(dispEmailVal);
      if (rowEmail !== targetEmail) continue;

      var rawActive = activeCol !== undefined ? row[activeCol] : true;
      var dispActive = displayRow && activeCol !== undefined ? displayRow[activeCol] : "";
      var isActive = isActiveRoleFlag_(rawActive) || isActiveRoleFlag_(dispActive);

      if (!isActive) return null;

      var rawRole = roleCol !== undefined ? row[roleCol] : "";
      var dispRole = displayRow && roleCol !== undefined ? displayRow[roleCol] : "";
      var roleVal = String(rawRole || dispRole || "").trim();

      var rawName = nameCol !== undefined ? row[nameCol] : "";
      var dispName = displayRow && nameCol !== undefined ? displayRow[nameCol] : "";
      var nameVal = String(rawName || dispName || "").trim();

      return {
        email: targetEmail,
        name: nameVal,
        roleRaw: roleVal,
      };
    }
  } catch (err) {
    console.error("lookupRoleRowForEmail_ error: " + err.message);
    return null;
  }
  return null;
}

function getPermissionsForRoleKey_(roleKey) {
  if (roleKey === ROLE_KEY.ADMIN) {
    return {
      membersWrite: true,
      contributionsWrite: true,
      loanPayment: true,
      loanRequest: true,
      isAdmin: true,
    };
  }
  if (roleKey === ROLE_KEY.SECRETARY) {
    return {
      membersWrite: true,
      contributionsWrite: false,
      loanPayment: true,
      loanRequest: true,
      isAdmin: false,
    };
  }
  if (roleKey === ROLE_KEY.MEMBER) {
    return {
      membersWrite: false,
      contributionsWrite: true,
      loanPayment: true,
      loanRequest: true,
      isAdmin: false,
    };
  }
  return {
    membersWrite: false,
    contributionsWrite: false,
    loanPayment: false,
    loanRequest: false,
    isAdmin: false,
  };
}

function getSessionRoleContext_(email) {
  var row = lookupRoleRowForEmail_(email);
  var roleKey = row ? normalizeRoleKey_(row.roleRaw) : ROLE_KEY.NONE;
  if (!row || roleKey === ROLE_KEY.NONE) {
    roleKey = ROLE_KEY.NONE;
  }
  var perms = getPermissionsForRoleKey_(roleKey);
  var labels = {};
  labels[ROLE_KEY.ADMIN] = "Admin";
  labels[ROLE_KEY.SECRETARY] = "Secretary";
  labels[ROLE_KEY.MEMBER] = "Member";
  labels[ROLE_KEY.NONE] = "No role";
  return {
    roleKey: roleKey,
    roleLabel: labels[roleKey] || roleKey,
    permissions: perms,
    roleSheetName: row ? row.name || "" : "",
    hasAccess: roleKey !== ROLE_KEY.NONE,
  };
}

/**
 * Ensures current user is listed in the Roles table with an active role (Admin, Secretary, or Member).
 */
function requireAccess_() {
  var email = getCurrentUserEmail_();
  var ctx = getSessionRoleContext_(email);
  if (!ctx.hasAccess) {
    var identifier = email ? ("email '" + email + "'") : "account";
    throw new Error(
      "Access Denied: Your Google " + identifier + " is not authorized. Please ask an Administrator to add your email to the Roles sheet."
    );
  }
  return ctx;
}

/**
 * @param {string} permKey — "membersWrite" | "contributionsWrite" | "loanPayment" | "loanRequest"
 */
function requirePermission_(permKey) {
  var ctx = requireAccess_();
  if (!ctx.permissions[permKey]) {
    throw new Error("You do not have permission to perform this action.");
  }
}
