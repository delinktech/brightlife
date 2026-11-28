/**
 * Automated Verification Suite for AUTH-1:
 * Headless Google OAuth ID Token Verification & doPost API Gateway
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
console.log("=== BRIGHTLIFE SHG: AUTH-1 HEADLESS GATEWAY & GOOGLE OAUTH SUITE ===");
console.log("======================================================================\n");

// Read server scripts into VM context
const serverDir = path.join(__dirname, "..", "src", "server");
const files = [
  "config.constants.js",
  "auth.service.js",
  "audit.service.js",
  "session.service.js",
  "app.main.js"
];

const context = {
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  encodeURIComponent: encodeURIComponent,
  parseInt: parseInt,
  parseFloat: parseFloat,
  Number: Number,
  String: String,
  Boolean: Boolean,
  Array: Array,
  Object: Object,
  Session: {
    getActiveUser: () => ({ getEmail: () => "brightlyfe@gmail.com" }),
    getEffectiveUser: () => ({ getEmail: () => "brightlyfe@gmail.com" })
  },
  ContentService: {
    MimeType: { JSON: "application/json", TEXT: "text/plain" },
    createTextOutput: (str) => ({
      _content: str,
      setMimeType: function (m) { this._mime = m; return this; }
    })
  },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => null,
      put: (k, v, ttl) => {}
    }),
    getUserCache: () => ({
      get: (k) => null,
      put: (k, v, ttl) => {}
    })
  },
  UrlFetchApp: {
    fetch: (url, opts) => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({})
    })
  }
};

vm.createContext(context);

files.forEach(f => {
  const filePath = path.join(serverDir, f);
  const code = fs.readFileSync(filePath, "utf8");
  vm.runInContext(code, context);
});

console.log("--> Section 1: Configuration & Client ID Registration");

it("GOOGLE_CLIENT_ID is properly configured and matches registered client", () => {
  assert.strictEqual(typeof context.GOOGLE_CLIENT_ID, "string");
  assert.strictEqual(
    context.GOOGLE_CLIENT_ID,
    "961631543108-en4e2seqgq8tkk0fs0ehl9hmsqr0itpr.apps.googleusercontent.com"
  );
});

console.log("\n--> Section 2: Google ID Token Verification Unit Tests");

it("verifyGoogleIdToken_ rejects empty or non-string tokens", () => {
  const resNull = context.verifyGoogleIdToken_(null);
  assert.strictEqual(resNull.valid, false);

  const resEmpty = context.verifyGoogleIdToken_("   ");
  assert.strictEqual(resEmpty.valid, false);

  const resNum = context.verifyGoogleIdToken_(12345);
  assert.strictEqual(resNum.valid, false);
});

it("verifyGoogleIdToken_ rejects tokens when Google tokeninfo returns HTTP error", () => {
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 400,
    getContentText: () => JSON.stringify({ error_description: "Invalid Value" })
  });

  const res = context.verifyGoogleIdToken_("invalid.test.token");
  assert.strictEqual(res.valid, false);
  assert.ok(res.error.includes("HTTP 400"));
});

it("verifyGoogleIdToken_ rejects tokens with invalid issuer", () => {
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      iss: "https://evil-issuer.com",
      aud: context.GOOGLE_CLIENT_ID,
      email: "delink4n@gmail.com",
      email_verified: "true",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  });

  const res = context.verifyGoogleIdToken_("test.jwt.token");
  assert.strictEqual(res.valid, false);
  assert.ok(res.error.includes("Invalid token issuer"));
});

it("verifyGoogleIdToken_ rejects tokens with audience mismatch", () => {
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "attacker-client-id.apps.googleusercontent.com",
      email: "delink4n@gmail.com",
      email_verified: "true",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  });

  const res = context.verifyGoogleIdToken_("test.jwt.token");
  assert.strictEqual(res.valid, false);
  assert.ok(res.error.includes("Token audience mismatch"));
});

it("verifyGoogleIdToken_ rejects expired tokens", () => {
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      iss: "https://accounts.google.com",
      aud: context.GOOGLE_CLIENT_ID,
      email: "delink4n@gmail.com",
      email_verified: "true",
      exp: Math.floor(Date.now() / 1000) - 60 // 60s in the past
    })
  });

  const res = context.verifyGoogleIdToken_("test.jwt.token");
  assert.strictEqual(res.valid, false);
  assert.ok(res.error.includes("Token has expired"));
});

it("verifyGoogleIdToken_ rejects tokens where email_verified is false", () => {
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      iss: "https://accounts.google.com",
      aud: context.GOOGLE_CLIENT_ID,
      email: "delink4n@gmail.com",
      email_verified: "false",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  });

  const res = context.verifyGoogleIdToken_("test.jwt.token");
  assert.strictEqual(res.valid, false);
  assert.ok(res.error.includes("Email address is not verified"));
});

it("verifyGoogleIdToken_ accepts valid Google ID token matching Client ID", () => {
  const futureExp = Math.floor(Date.now() / 1000) + 1800;
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      iss: "https://accounts.google.com",
      aud: context.GOOGLE_CLIENT_ID,
      email: "Delink4n@Gmail.Com", // Mixed case test
      email_verified: "true",
      name: "Delink 4N",
      picture: "https://lh3.googleusercontent.com/a/photo.jpg",
      sub: "110169484474386276334",
      exp: futureExp
    })
  });

  const res = context.verifyGoogleIdToken_("valid.sample.jwt");
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.email, "delink4n@gmail.com");
  assert.strictEqual(res.name, "Delink 4N");
  assert.strictEqual(res.picture, "https://lh3.googleusercontent.com/a/photo.jpg");
  assert.strictEqual(res.exp, futureExp);
});

console.log("\n--> Section 3: Headless doPost Gateway Integration");

it("doPost rejects empty request body", () => {
  const out = context.doPost({});
  const res = JSON.parse(out._content);
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes("Empty request body"));
});

it("doPost rejects malformed JSON", () => {
  const out = context.doPost({ postData: { contents: "{ invalid json " } });
  const res = JSON.parse(out._content);
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes("Malformed JSON"));
});

it("doPost rejects request missing 'action'", () => {
  const out = context.doPost({ postData: { contents: JSON.stringify({ idToken: "token" }) } });
  const res = JSON.parse(out._content);
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes("Missing required 'action' field"));
});

it("doPost rejects unauthenticated request missing 'idToken'", () => {
  const out = context.doPost({ postData: { contents: JSON.stringify({ action: "getSessionInfo" }) } });
  const res = JSON.parse(out._content);
  assert.strictEqual(res.success, false);
  assert.ok(res.error.includes("Missing Google ID token"));
});

it("doPost sets request context, executes action, and resets context cleanly", () => {
  // Mock valid token response
  context.UrlFetchApp.fetch = () => ({
    getResponseCode: () => 200,
    getContentText: () => JSON.stringify({
      iss: "https://accounts.google.com",
      aud: context.GOOGLE_CLIENT_ID,
      email: "delink4n@gmail.com",
      email_verified: "true",
      name: "Delink 4N",
      exp: Math.floor(Date.now() / 1000) + 1800
    })
  });

  // Mock getSessionInfo to assert context propagation
  let seenCallerEmail = "";
  context.getSessionInfo = function () {
    seenCallerEmail = context.getCurrentUserEmail_();
    return { success: true, email: seenCallerEmail, displayName: "Delink 4N" };
  };

  const out = context.doPost({
    postData: {
      contents: JSON.stringify({
        action: "getSessionInfo",
        idToken: "valid.google.token"
      })
    }
  });

  const res = JSON.parse(out._content);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.email, "delink4n@gmail.com");
  assert.strictEqual(seenCallerEmail, "delink4n@gmail.com");

  // Assert teardown: ACTIVE_REQUEST_USER_EMAIL_ must be null after execution
  assert.strictEqual(context.ACTIVE_REQUEST_USER_EMAIL_, null);
});

it("getCurrentUserEmail_ falls back safely to Session when ACTIVE_REQUEST_USER_EMAIL_ is null", () => {
  context.ACTIVE_REQUEST_USER_EMAIL_ = null;
  const email = context.getCurrentUserEmail_();
  assert.strictEqual(email, "brightlyfe@gmail.com");
});

console.log("\n======================================================================");
console.log(`=== AUTH-1 VERIFICATION COMPLETE: ${passedTests}/${totalTests} CHECKS PASSED ===`);
console.log("======================================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
