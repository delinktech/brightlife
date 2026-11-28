/**
 * Automated Verification Suite for AUTH-3:
 * Google Identity Services (GIS) Sign-In UI & Sign-Out Lifecycle
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
  }
}

console.log("\n======================================================================");
console.log("=== BRIGHTLIFE SHG: AUTH-3 SIGN-IN UI & SIGN-OUT AUDIT ===");
console.log("======================================================================\n");

const indexHtmlPath = path.join(__dirname, "..", "src", "client", "views", "Index.html");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

const appJsPath = path.join(__dirname, "..", "src", "client", "scripts", "app.ui.js.html");
const appJs = fs.readFileSync(appJsPath, "utf8");

console.log("--> Section 1: Template HTML & GIS Script Integration");

it("Index.html loads Google Identity Services (accounts.google.com/gsi/client)", () => {
  assert.ok(
    indexHtml.includes("https://accounts.google.com/gsi/client"),
    "Missing GIS script inclusion in Index.html"
  );
});

it("Index.html configures GOOGLE_CLIENT_ID matching the registered web client", () => {
  assert.ok(
    indexHtml.includes("961631543108-en4e2seqgq8tkk0fs0ehl9hmsqr0itpr.apps.googleusercontent.com"),
    "GOOGLE_CLIENT_ID is missing or mismatched in Index.html"
  );
});

it("Index.html includes sign-in-container with Google button mount point", () => {
  assert.ok(indexHtml.includes('id="sign-in-container"'), "Missing #sign-in-container page wrapper");
  assert.ok(indexHtml.includes('id="google-signin-btn"'), "Missing #google-signin-btn target element");
  assert.ok(indexHtml.includes('id="signin-loading-spinner"'), "Missing #signin-loading-spinner element");
});

console.log("\n--> Section 2: Sign-Out Triggers & Account Popover Actions");

it("Index.html includes Sign Out button in Session & Account popover modal", () => {
  assert.ok(
    indexHtml.includes('id="btn-session-signout"') && indexHtml.includes("handleSignOut()"),
    "Missing Sign Out button in session-account-modal"
  );
});

it("Index.html includes Sign Out button in Access Denied screen", () => {
  assert.ok(
    indexHtml.includes('id="btn-access-denied-signout"') && indexHtml.includes("handleSignOut()"),
    "Missing Sign Out button in access-denied-container"
  );
});

it("Index.html includes Sign Out button in Sidebar profile footer", () => {
  assert.ok(
    indexHtml.includes('id="sidebar-signout-btn"') && indexHtml.includes("handleSignOut()"),
    "Missing Sign Out trigger in sidebar footer"
  );
});

console.log("\n--> Section 3: Client Script Controllers & Sign-Out Lifecycle");

it("app.ui.js.html implements initGoogleIdentityServices", () => {
  assert.ok(
    appJs.includes("function initGoogleIdentityServices()"),
    "Missing initGoogleIdentityServices definition"
  );
  assert.ok(
    appJs.includes("window.initGoogleIdentityServices = initGoogleIdentityServices"),
    "initGoogleIdentityServices not exposed on window"
  );
});

it("app.ui.js.html implements handleGoogleCredentialResponse", () => {
  assert.ok(
    appJs.includes("function handleGoogleCredentialResponse(response)"),
    "Missing handleGoogleCredentialResponse definition"
  );
  assert.ok(
    appJs.includes("window.ApiClient.setIdToken(response.credential)"),
    "Credential token not stored via ApiClient"
  );
});

it("app.ui.js.html implements handleSignOut with complete session teardown", () => {
  assert.ok(
    appJs.includes("function handleSignOut()"),
    "Missing handleSignOut definition"
  );
  assert.ok(
    appJs.includes("window.ApiClient.clearSession()"),
    "handleSignOut does not clear ApiClient storage"
  );
  assert.ok(
    appJs.includes("google.accounts.id.disableAutoSelect()"),
    "handleSignOut does not disable GSI auto-select"
  );
  assert.ok(
    appJs.includes('showPage("sign-in")'),
    "handleSignOut does not transition back to sign-in view"
  );
});

it("app.ui.js.html routes unauthenticated headless users directly to sign-in page", () => {
  assert.ok(
    appJs.includes('targetPageId = "sign-in"'),
    "showPage does not handle sign-in page routing"
  );
  assert.ok(
    appJs.includes('"sign-in": "Sign In to Brightlife"'),
    "PAGE_TITLE_LABELS does not define label for sign-in"
  );
});

console.log("\n======================================================================");
console.log(`=== AUTH-3 VERIFICATION COMPLETE: ${passedTests}/${totalTests} CHECKS PASSED ===`);
console.log("======================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
