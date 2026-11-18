/**
 * Current user context for the web app UI.
 * Requires deploy: Execute as "User accessing the web app" for per-user email.
 *
 * Display name: Roles.Member/Name (when the user has an active row), then People API,
 * then a friendly name derived from the email local part.
 */

function getSessionInfo() {
  try {
    var email = getCurrentUserEmail_();
    var profile = getGoogleProfile_(email);
    var roleCtx = getSessionRoleContext_(email);

    var nameFromRoles = roleCtx.roleSheetName ? String(roleCtx.roleSheetName).trim() : "";
    var displayName =
      nameFromRoles || profile.displayName || friendlyNameFromEmail_(email);

    return {
      success: true,
      email: email,
      displayName: displayName,
      memberId: roleCtx.memberId || "",
      memberName: roleCtx.memberName || displayName,
      photoUrl: profile.photoUrl || "",
      version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "0.0.0",
      status: "active",
      role: roleCtx.roleKey,
      roleLabel: roleCtx.roleLabel,
      hasAccess: roleCtx.hasAccess,
      permissions: roleCtx.permissions,
    };
  } catch (err) {
    console.error("getSessionInfo error: " + (err && err.message ? err.message : err));
    return {
      success: false,
      error: err && err.message ? String(err.message) : "Unable to load session info.",
    };
  }
}

/**
 * Single People API read for names + photos (Advanced Service "People API").
 * Caches per-user profile in UserCache for 30 minutes to keep session checks lightweight.
 */
function getGoogleProfile_(email) {
  var out = { displayName: "", photoUrl: "" };
  var cacheKey = email ? "bl_profile_" + String(email).trim().toLowerCase() : "";
  try {
    if (cacheKey && typeof CacheService !== "undefined") {
      var cached = CacheService.getUserCache().get(cacheKey);
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          return {
            displayName: parsed.displayName ? String(parsed.displayName) : "",
            photoUrl: parsed.photoUrl ? String(parsed.photoUrl) : "",
          };
        }
      }
    }
  } catch (cacheReadErr) {
    // Ignore cache read failures and fetch live profile
  }

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
      var chosen = primary || person.photos[0];
      if (chosen && chosen.url) {
        out.photoUrl = String(chosen.url);
      }
    }

    if (cacheKey && (out.displayName || out.photoUrl) && typeof CacheService !== "undefined") {
      try {
        CacheService.getUserCache().put(cacheKey, JSON.stringify(out), 1800);
      } catch (cacheWriteErr) {
        // Ignore cache write failures
      }
    }
  } catch (err) {
    // People API is optional
  }
  return out;
}
