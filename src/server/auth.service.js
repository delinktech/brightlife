/**
 * Role-based access from spreadsheet tab "Roles" (Email, Member, Role, Active, Notes).
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
  sheet.appendRow(["Email", "Member", "Role", "Active", "Notes"]);
  sheet.setFrozenRows(1);
  var ownerEmail = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (ownerEmail) {
    sheet.appendRow([ownerEmail, "", "Admin", true, "Owner Admin"]);
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

/**
 * Parses a Member string like "BL25-0016 — Derick Mwangi Wanjiru" or pure "BL25-0016".
 */
function parseMemberField_(rawMember) {
  var s = String(rawMember || "").trim();
  if (!s) return { memberId: "", memberName: "" };
  if (s.indexOf(" — ") !== -1) {
    var parts = s.split(" — ");
    return {
      memberId: String(parts[0] || "").trim(),
      memberName: String(parts[1] || "").trim(),
    };
  }
  if (s.indexOf(" - ") !== -1) {
    var parts = s.split(" - ");
    return {
      memberId: String(parts[0] || "").trim(),
      memberName: String(parts[1] || "").trim(),
    };
  }
  return {
    memberId: s,
    memberName: "",
  };
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
    if (!values || values.length <= 1) return null;

    var headerRowIndex = -1;
    var colMap = {};
    for (var r = 0; r < Math.min(values.length, 5); r++) {
      var rowH = values[r];
      var tempMap = {};
      var foundEmail = false;
      for (var c = 0; c < rowH.length; c++) {
        var key = String(rowH[c] || "").trim().toLowerCase();
        if (key) tempMap[key] = c;
        if (key === "email") foundEmail = true;
      }
      if (foundEmail) {
        headerRowIndex = r;
        colMap = tempMap;
        break;
      }
    }

    if (headerRowIndex === -1 || colMap["email"] === undefined) {
      return null;
    }

    var emailCol = colMap["email"];
    var memberCol = colMap["member"] !== undefined ? colMap["member"] : colMap["member id"];
    var roleCol = colMap["role"];
    var activeCol = colMap["active"];
    var notesCol = colMap["notes"];
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

      var rawMember = memberCol !== undefined ? (displayRow[memberCol] || row[memberCol]) : "";
      var parsedMember = parseMemberField_(rawMember);

      var rawNotes = notesCol !== undefined ? (displayRow[notesCol] || row[notesCol]) : "";
      var rawName = nameCol !== undefined ? (displayRow[nameCol] || row[nameCol]) : "";

      var resolvedName = parsedMember.memberName || String(rawName || "").trim();
      if (!resolvedName && String(rawNotes || "").trim()) {
        resolvedName = String(rawNotes).trim();
      }

      return {
        email: targetEmail,
        memberId: parsedMember.memberId,
        memberName: resolvedName,
        name: resolvedName,
        roleRaw: roleVal,
        notes: String(rawNotes || "").trim(),
      };
    }

    // Secondary fallback: Check if email exists in Members sheet
    try {
      var memSheet = getSheetByNameInsensitive_(ss, SHEETS.MEMBERS);
      if (memSheet && memSheet.getLastRow() > 1) {
        var memVals = memSheet.getDataRange().getValues();
        var memCol = getHeaderMap_(memVals[0]);
        var memEmailIdx = memCol["Email"] !== undefined ? memCol["Email"] : memCol["email"];
        var memIdIdx = memCol["Member ID"];
        var memStatusIdx = memCol["Status"];

        if (memEmailIdx !== undefined && memIdIdx !== undefined) {
          for (var m = 1; m < memVals.length; m++) {
            var mRow = memVals[m];
            var mEmail = extractEmailFromString_(mRow[memEmailIdx]);
            if (mEmail === targetEmail) {
              var mStatus = memStatusIdx !== undefined ? String(mRow[memStatusIdx] || "").trim().toLowerCase() : "active";
              if (mStatus === "active" || mStatus === "") {
                var first = memCol["First Name"] !== undefined ? String(mRow[memCol["First Name"]] || "").trim() : "";
                var middle = memCol["Middle Name"] !== undefined ? String(mRow[memCol["Middle Name"]] || "").trim() : "";
                var last = memCol["Last Name"] !== undefined ? String(mRow[memCol["Last Name"]] || "").trim() : "";
                var initial = middle ? middle.charAt(0) + "." : "";
                var mName = (first + " " + initial + " " + last).replace(/\s+/g, " ").trim();

                return {
                  email: targetEmail,
                  memberId: String(mRow[memIdIdx] || "").trim(),
                  memberName: mName,
                  name: mName,
                  roleRaw: "Member",
                  notes: "Auto-matched from Members Email",
                };
              }
            }
          }
        }
      }
    } catch (memLookupErr) {
      console.error("Members sheet fallback email lookup error: " + memLookupErr.message);
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
      isMemberOnly: false,
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
      isMemberOnly: false,
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
      isMemberOnly: false,
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
      isMemberOnly: true,
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
    isMemberOnly: true,
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

  var resolvedName = row ? (row.name || row.memberName || "") : "";
  if (!resolvedName && email) {
    if (email.toLowerCase().indexOf("brightlyfe") !== -1) {
      resolvedName = "Bright Life";
    }
  }

  return {
    roleKey: roleKey,
    roleLabel: labels[roleKey] || roleKey,
    permissions: perms,
    roleSheetName: resolvedName,
    memberId: row ? row.memberId : "",
    memberName: row ? row.memberName : "",
    hasAccess: roleKey !== ROLE_KEY.NONE,
  };
}

function requireAccess_() {
  var email = getCurrentUserEmail_();
  var ctx = getSessionRoleContext_(email);
  if (!ctx.hasAccess) {
    throw new Error(
      "Access denied: " + (email || "user") + " does not have an active role in the group. Please contact the administrator."
    );
  }
  return ctx;
}

function requirePermission_(permKey) {
  var email = getCurrentUserEmail_();
  var ctx = getSessionRoleContext_(email);
  if (!ctx.hasAccess) {
    throw new Error("Access denied: You must be an active group member.");
  }
  if (!ctx.permissions || !ctx.permissions[permKey]) {
    throw new Error("Permission denied: Your role (" + ctx.roleLabel + ") does not allow this action.");
  }
  return ctx;
}

function friendlyNameFromEmail_(email) {
  if (!email) return "Member";
  var local = String(email).split("@")[0] || "";
  local = local.replace(/[._+-]+/g, " ").trim();
  if (!local) return "Member";
  return local
    .split(/\s+/)
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Get all configured roles for the Admin UI panel.
 */
function getRolesData() {
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
    var memberCol = colMap["Member"] !== undefined ? colMap["Member"] : colMap["Member ID"];
    var roleCol = colMap["Role"];
    var activeCol = colMap["Active"];
    var notesCol = colMap["Notes"];

    var roles = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var dispRow = displayValues ? displayValues[i] : [];

      var rawEmail = emailCol !== undefined ? row[emailCol] : "";
      var dispEmail = dispRow && emailCol !== undefined ? dispRow[emailCol] : "";
      var email = extractEmailFromString_(rawEmail) || extractEmailFromString_(dispEmail);
      if (!email) continue;

      var rawMember = memberCol !== undefined ? (dispRow[memberCol] || row[memberCol]) : "";
      var parsedMember = parseMemberField_(rawMember);

      var rawNotes = notesCol !== undefined ? (dispRow[notesCol] || row[notesCol]) : "";

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

      var displayName = parsedMember.memberName || String(rawNotes || "").trim() || friendlyNameFromEmail_(email);

      roles.push({
        email: email,
        member: rawMember,
        memberId: parsedMember.memberId,
        name: displayName,
        role: roleLabel,
        roleKey: roleKey,
        active: isActive,
        notes: String(rawNotes || "").trim(),
      });
    }

    return { success: true, roles: roles };
  } catch (error) {
    return { success: false, error: error.message, roles: [] };
  }
}

/** Alias for frontend compatibility */
function getAllUserRoles() {
  return getRolesData();
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
  var memberVal = String(data.member || "").trim();
  var notesVal = String(data.notes || "").trim();

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
  var memberCol = colMap["Member"] !== undefined ? colMap["Member"] : colMap["Member ID"];
  var roleCol = colMap["Role"];
  var activeCol = colMap["Active"];
  var notesCol = colMap["Notes"];

  var updated = false;

  if (values.length > 1) {
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var rowEmail = extractEmailFromString_(row[emailCol]);
      if (rowEmail === targetEmail) {
        var rowIndex = i + 1;
        if (memberCol !== undefined && memberVal) sheet.getRange(rowIndex, memberCol + 1).setValue(memberVal);
        if (roleCol !== undefined) sheet.getRange(rowIndex, roleCol + 1).setValue(roleLabel);
        if (activeCol !== undefined) sheet.getRange(rowIndex, activeCol + 1).setValue(activeVal);
        if (notesCol !== undefined && notesVal) sheet.getRange(rowIndex, notesCol + 1).setValue(notesVal);
        updated = true;
        break;
      }
    }
  }

  if (!updated) {
    var newRow = new Array(headers.length).fill("");
    if (emailCol !== undefined) newRow[emailCol] = targetEmail;
    if (memberCol !== undefined) newRow[memberCol] = memberVal;
    if (roleCol !== undefined) newRow[roleCol] = roleLabel;
    if (activeCol !== undefined) newRow[activeCol] = activeVal;
    if (notesCol !== undefined) newRow[notesCol] = notesVal;
    sheet.appendRow(newRow);
  }

  appendAuditLog_(
    updated ? "role.update" : "role.create",
    "Roles",
    targetEmail,
    (updated ? "Updated" : "Added") + " user role for " + targetEmail + " to " + roleLabel + " (" + (activeVal ? "Active" : "Inactive") + ")",
    JSON.stringify({
      email: targetEmail,
      member: memberVal,
      role: roleLabel,
      active: activeVal,
      notes: notesVal,
    })
  );

  return {
    success: true,
    message: updated ? "User role updated successfully." : "New user role added successfully.",
  };
}
