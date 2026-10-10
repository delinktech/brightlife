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
  if (value === false || value === 0) return false;
  var s = String(value || "")
    .trim()
    .toLowerCase();
  if (!s) return false;
  return s === "true" || s === "yes" || s === "y" || s === "1" || s === "active";
}

function normalizeRoleKey_(raw) {
  var s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "admin" || s === "administrator" || s === "chairperson") return ROLE_KEY.ADMIN;
  if (s === "treasurer" || s === "finance") return ROLE_KEY.TREASURER;
  if (s === "secretary") return ROLE_KEY.SECRETARY;
  if (s === "member" || s === "members") return ROLE_KEY.MEMBER;
  return ROLE_KEY.NONE;
}

function getOrCreateRolesSheet_() {
  var ss = getSpreadsheet_();
  var sheet = getSheetByNameInsensitive_(ss, SHEETS.ROLES);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEETS.ROLES);
  sheet.appendRow(["Email", "Name", "Role", "Active"]);
  sheet.setFrozenRows(1);
  var ownerEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (ownerEmail) {
    sheet.appendRow([ownerEmail, "Owner Admin", "Admin", true]);
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
    var ss = getSpreadsheet_();
    var sheet = getSheetByNameInsensitive_(ss, SHEETS.ROLES);
    if (!sheet) {
      sheet = getOrCreateRolesSheet_();
    }
    if (!sheet || sheet.getLastRow() < 2) return null;

    var range = sheet.getDataRange();
    var values = range.getValues();
    var displayValues = range.getDisplayValues();
    if (!values || values.length < 2) return null;

    var headerRowIndex = -1;
    var colMap = {};
    for (var h = 0; h < Math.min(values.length, 5); h++) {
      var testMap = getHeaderMap_(values[h]);
      if (testMap["email"] !== undefined) {
        headerRowIndex = h;
        colMap = testMap;
        break;
      }
    }

    if (headerRowIndex === -1 || colMap["email"] === undefined) {
      return null;
    }

    var emailCol = colMap["email"];
    var roleCol = colMap["role"];
    var activeCol = colMap["active"];
    var nameCol = colMap["name"];

    for (var i = headerRowIndex + 1; i < values.length; i++) {
      var row = values[i];
      var displayRow = displayValues ? displayValues[i] : [];

      var rawEmailVal = emailCol !== undefined ? row[emailCol] : "";
      var dispEmailVal = displayRow && emailCol !== undefined ? displayRow[emailCol] : "";

      var rowEmail = extractEmailFromString_(rawEmailVal) || extractEmailFromString_(dispEmailVal);
      if (!rowEmail || rowEmail !== targetEmail) continue;

      var rawActive = activeCol !== undefined ? row[activeCol] : true;
      var dispActive = displayRow && activeCol !== undefined ? displayRow[activeCol] : "";
      var isActive = activeCol === undefined ? true : (isActiveRoleFlag_(rawActive) || isActiveRoleFlag_(dispActive));

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
      accountsWrite: true,
      investmentsWrite: true,
      isAdmin: true,
    };
  }
  if (roleKey === ROLE_KEY.TREASURER) {
    return {
      membersWrite: false,
      contributionsWrite: true,
      loanPayment: true,
      loanRequest: false,
      accountsWrite: true,
      investmentsWrite: true,
      isAdmin: false,
    };
  }
  if (roleKey === ROLE_KEY.SECRETARY) {
    return {
      membersWrite: true,
      contributionsWrite: false,
      loanPayment: false,
      loanRequest: true,
      accountsWrite: false,
      investmentsWrite: false,
      isAdmin: false,
    };
  }
  if (roleKey === ROLE_KEY.MEMBER) {
    return {
      membersWrite: false,
      contributionsWrite: false,
      loanPayment: false,
      loanRequest: true,
      accountsWrite: false,
      investmentsWrite: false,
      isAdmin: false,
    };
  }
  return {
    membersWrite: false,
    contributionsWrite: false,
    loanPayment: false,
    loanRequest: false,
    accountsWrite: false,
    investmentsWrite: false,
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
  labels[ROLE_KEY.TREASURER] = "Treasurer";
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
 * Ensures current user is listed in the Roles table with an active role (Admin, Treasurer, Secretary, or Member).
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
 * @param {string} permKey — "membersWrite" | "contributionsWrite" | "loanPayment" | "loanRequest" | "accountsWrite" | "investmentsWrite"
 */
function requirePermission_(permKey) {
  var ctx = requireAccess_();
  if (!ctx.permissions[permKey]) {
    throw new Error("You do not have permission to perform this action.");
  }
}

/**
 * Fetch all user roles for the Admin User Roles management UI.
 */
function getAllUserRoles() {
  try {
    requirePermission_("isAdmin");
    var ss = getSpreadsheet_();
    var sheet = getSheetByNameInsensitive_(ss, SHEETS.ROLES);
    if (!sheet) {
      sheet = getOrCreateRolesSheet_();
    }

    var values = sheet.getDataRange().getValues();
    var displayValues = sheet.getDataRange().getDisplayValues();
    if (!values || values.length <= 1) {
      return { success: true, roles: [] };
    }

    var headers = values[0];
    var colMap = getHeaderMap_(headers);
    requireHeaders_(colMap, ["Email", "Role"], SHEETS.ROLES);

    var emailCol = colMap["Email"];
    var nameCol = colMap["Name"];
    var roleCol = colMap["Role"];
    var activeCol = colMap["Active"];

    var roles = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var dispRow = displayValues ? displayValues[i] : [];

      var rawEmail = emailCol !== undefined ? row[emailCol] : "";
      var dispEmail = dispRow && emailCol !== undefined ? dispRow[emailCol] : "";
      var email = extractEmailFromString_(rawEmail) || extractEmailFromString_(dispEmail);
      if (!email) continue;

      var rawName = nameCol !== undefined ? row[nameCol] : "";
      var dispName = dispRow && nameCol !== undefined ? dispRow[nameCol] : "";
      var name = String(rawName || dispName || "").trim();

      var rawRole = roleCol !== undefined ? row[roleCol] : "";
      var dispRole = dispRow && roleCol !== undefined ? dispRow[roleCol] : "";
      var roleRaw = String(rawRole || dispRole || "").trim();
      var roleKey = normalizeRoleKey_(roleRaw);

      var rawActive = activeCol !== undefined ? row[activeCol] : true;
      var dispActive = dispRow && activeCol !== undefined ? dispRow[activeCol] : "";
      var isActive = activeCol === undefined ? true : (isActiveRoleFlag_(rawActive) || isActiveRoleFlag_(dispActive));

      var roleLabel = "Member";
      if (roleKey === ROLE_KEY.ADMIN) roleLabel = "Admin";
      else if (roleKey === ROLE_KEY.TREASURER) roleLabel = "Treasurer";
      else if (roleKey === ROLE_KEY.SECRETARY) roleLabel = "Secretary";
      else if (roleKey === ROLE_KEY.MEMBER) roleLabel = "Member";

      roles.push({
        email: email,
        name: name || friendlyNameFromEmail_(email),
        role: roleLabel,
        roleKey: roleKey,
        active: isActive,
      });
    }

    return { success: true, roles: roles };
  } catch (error) {
    return { success: false, error: error.message, roles: [] };
  }
}

/**
 * Add or update a user's role and active status in the Roles sheet.
 */
function saveUserRole(data) {
  requirePermission_("isAdmin");
  if (!data || !data.email) {
    throw new Error("Email address is required.");
  }

  var targetEmail = extractEmailFromString_(data.email);
  if (!targetEmail || targetEmail.indexOf("@") === -1) {
    throw new Error("Please enter a valid email address.");
  }

  var rawRole = String(data.role || "Member").trim();
  var normKey = normalizeRoleKey_(rawRole);
  if (normKey === ROLE_KEY.NONE) {
    throw new Error("Invalid role selection. Must be Admin, Treasurer, Secretary, or Member.");
  }

  var roleLabel = "Member";
  if (normKey === ROLE_KEY.ADMIN) roleLabel = "Admin";
  else if (normKey === ROLE_KEY.TREASURER) roleLabel = "Treasurer";
  else if (normKey === ROLE_KEY.SECRETARY) roleLabel = "Secretary";
  else if (normKey === ROLE_KEY.MEMBER) roleLabel = "Member";

  var activeVal = data.active !== undefined ? (data.active === true || data.active === "true" || data.active === 1 || data.active === "Active") : true;
  var userName = String(data.name || "").trim();

  var ss = getSpreadsheet_();
  var sheet = getSheetByNameInsensitive_(ss, SHEETS.ROLES);
  if (!sheet) {
    sheet = getOrCreateRolesSheet_();
  }

  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var colMap = getHeaderMap_(headers);
  requireHeaders_(colMap, ["Email", "Role"], SHEETS.ROLES);

  var emailCol = colMap["Email"];
  var nameCol = colMap["Name"];
  var roleCol = colMap["Role"];
  var activeCol = colMap["Active"];

  var updated = false;

  if (values.length > 1) {
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var rowEmail = extractEmailFromString_(row[emailCol]);
      if (rowEmail === targetEmail) {
        var rowIndex = i + 1;
        if (roleCol !== undefined) sheet.getRange(rowIndex, roleCol + 1).setValue(roleLabel);
        if (nameCol !== undefined && userName) sheet.getRange(rowIndex, nameCol + 1).setValue(userName);
        if (activeCol !== undefined) sheet.getRange(rowIndex, activeCol + 1).setValue(activeVal);
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    var newRow = new Array(headers.length).fill("");
    if (emailCol !== undefined) newRow[emailCol] = targetEmail;
    if (nameCol !== undefined) newRow[nameCol] = userName || friendlyNameFromEmail_(targetEmail);
    if (roleCol !== undefined) newRow[roleCol] = roleLabel;
    if (activeCol !== undefined) newRow[activeCol] = activeVal;
    sheet.appendRow(newRow);
  }

  appendAuditLog_(
    updated ? "role.update" : "role.create",
    "Roles",
    targetEmail,
    (updated ? "Updated" : "Added") + " user role for " + targetEmail + " to " + roleLabel + " (" + (activeVal ? "Active" : "Inactive") + ")",
    JSON.stringify({
      email: targetEmail,
      name: userName,
      role: roleLabel,
      active: activeVal,
    })
  );

  return {
    success: true,
    message: updated ? "User role updated successfully." : "New user role added successfully.",
  };
}
