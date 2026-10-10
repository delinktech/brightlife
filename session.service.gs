/**
 * Current user context for the web app UI.
 * Requires deploy: Execute as "User accessing the web app" for per-user email.
 *
 * Display name: Roles.Name (when the user has an active row), then People API,
 * then a friendly name derived from the email local part.
 */

function getSessionInfo() {
  var email = getCurrentUserEmail_();
  var profile = getGoogleProfile_();
  var roleCtx = getSessionRoleContext_(email);

  var nameFromRoles = roleCtx.roleSheetName ? String(roleCtx.roleSheetName).trim() : "";
  var displayName =
    nameFromRoles || profile.displayName || friendlyNameFromEmail_(email);

  return {
    success: true,
    email: email,
    displayName: displayName,
    photoUrl: profile.photoUrl || "",
    version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "0.0.0",
    status: "active",
    role: roleCtx.roleKey,
    roleLabel: roleCtx.roleLabel,
    hasAccess: roleCtx.hasAccess,
    permissions: roleCtx.permissions,
  };
}

/**
 * Single People API read for names + photos (Advanced Service "People API").
 */
function getGoogleProfile_() {
  var out = { displayName: "", photoUrl: "" };
  try {
    if (typeof People === "undefined" || !People || !People.People) return out;
    var person = People.People.get("people/me", {
      personFields: "names,photos",
    });
    if (!person) return out;

    if (person.names && person.names.length > 0) {
      var n = person.names[0];
      if (n.displayName && String(n.displayName).trim()) {
        out.displayName = String(n.displayName).trim();
      } else {
        var parts = [];
        if (n.givenName) parts.push(String(n.givenName).trim());
        if (n.middleName) parts.push(String(n.middleName).trim());
        if (n.familyName) parts.push(String(n.familyName).trim());
        if (parts.length) out.displayName = parts.join(" ");
      }
    }

    if (person.photos && person.photos.length > 0) {
      var primary = person.photos.filter(function (p) {
        return p.metadata && p.metadata.primary;
      })[0];
      var photo = primary || person.photos[0];
      if (photo && photo.url && String(photo.url).trim()) {
        out.photoUrl = String(photo.url).trim();
      }
    }
  } catch (e) {
    return out;
  }
  return out;
}

function friendlyNameFromEmail_(email) {
  var local = String(email || "")
    .split("@")[0]
    .trim();
  if (!local) return "User";
  return local
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(function (w) {
      return w.length > 0;
    })
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
