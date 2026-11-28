/**
 * Automated Verification Suite for AUTH-2:
 * Client-Side ApiClient Transport & google.script.run Transparent Proxy Shim
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
console.log("=== BRIGHTLIFE SHG: AUTH-2 APICLIENT TRANSPORT & PROXY SUITE ===");
console.log("======================================================================\n");

// Read api.client.js.html (strip <script> and </script> tags for Node VM)
const clientScriptPath = path.join(__dirname, "..", "src", "client", "scripts", "api.client.js.html");
const rawScript = fs.readFileSync(clientScriptPath, "utf8");
const cleanCode = rawScript.replace(/<\/?script>/g, "");

// In-memory sessionStorage/localStorage mocks
const storageMock = {};
const mockSessionStorage = {
  getItem: (k) => storageMock[k] || null,
  setItem: (k, v) => { storageMock[k] = String(v); },
  removeItem: (k) => { delete storageMock[k]; }
};

let lastFetchRequest = null;
let mockFetchResponse = {
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ success: true, testData: 123 })
};

const context = {
  console: console,
  Date: Date,
  Math: Math,
  JSON: JSON,
  String: String,
  Number: Number,
  atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
  decodeURIComponent: decodeURIComponent,
  sessionStorage: mockSessionStorage,
  localStorage: mockSessionStorage,
  document: {
    querySelector: () => null
  },
  location: {
    hostname: "delinktech.github.io" // Headless domain!
  },
  fetch: async (url, opts) => {
    lastFetchRequest = { url, opts, body: JSON.parse(opts.body) };
    return mockFetchResponse;
  }
};

context.window = context;
context.global = context;

vm.createContext(context);
vm.runInContext(cleanCode, context);

const ApiClient = context.ApiClient;

async function runAllTests() {
  console.log("--> Section 1: ApiClient Core Configuration & Token Management");

  await it("ApiClient is defined and initialized", async () => {
    assert.ok(ApiClient);
    assert.strictEqual(typeof ApiClient.request, "function");
    assert.strictEqual(typeof ApiClient.getIdToken, "function");
    assert.strictEqual(typeof ApiClient.setIdToken, "function");
  });

  await it("ApiClient defaults to production Web App URL and supports override", async () => {
    assert.ok(ApiClient.getApiUrl().includes("script.google.com/macros/s/"));
    ApiClient.setApiUrl("https://staging.brightlife.test/exec");
    assert.strictEqual(ApiClient.getApiUrl(), "https://staging.brightlife.test/exec");
    ApiClient.clearSession();
  });

  await it("ApiClient correctly manages ID token storage and session state", async () => {
    assert.strictEqual(ApiClient.getIdToken(), "");
    assert.strictEqual(ApiClient.hasActiveSession(), false);

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: "https://accounts.google.com",
      email: "testuser@gmail.com",
      name: "Test User",
      exp: futureExp
    })).toString("base64url");
    const sampleToken = `${header}.${payload}.signature123`;

    ApiClient.setIdToken(sampleToken);
    assert.strictEqual(ApiClient.getIdToken(), sampleToken);
    assert.strictEqual(ApiClient.hasActiveSession(), true);

    const claims = ApiClient.getDecodedToken();
    assert.strictEqual(claims.email, "testuser@gmail.com");
    assert.strictEqual(claims.exp, futureExp);

    ApiClient.clearSession();
    assert.strictEqual(ApiClient.getIdToken(), "");
    assert.strictEqual(ApiClient.hasActiveSession(), false);
  });

  console.log("\n--> Section 2: HTTP Fetch Transport & Request Serialization");

  await it("ApiClient.request sends CORS-safelisted text/plain POST with ID token and payload", async () => {
    ApiClient.setIdToken("mock.token.jwt");
    ApiClient.setApiUrl("https://api.brightlife.org/exec");

    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ success: true, message: "OK" })
    };

    const res = await ApiClient.request("getDashboardData", { range: "this-year" });
    assert.strictEqual(res.success, true);
    assert.strictEqual(lastFetchRequest.url, "https://api.brightlife.org/exec");
    assert.strictEqual(lastFetchRequest.opts.method, "POST");
    assert.strictEqual(lastFetchRequest.opts.headers["Content-Type"], "text/plain;charset=utf-8");
    assert.strictEqual(lastFetchRequest.body.action, "getDashboardData");
    assert.strictEqual(lastFetchRequest.body.idToken, "mock.token.jwt");
    assert.strictEqual(lastFetchRequest.body.payload.range, "this-year");
  });

  await it("ApiClient.callRpc unpacks positional arguments into structured payloads", async () => {
    await ApiClient.callRpc("getDashboardOverviewData", ["custom-range"]);
    assert.strictEqual(lastFetchRequest.body.action, "getDashboardOverviewData");
    assert.strictEqual(lastFetchRequest.body.payload.range, "custom-range");

    await ApiClient.callRpc("getLoansData", [2, 25]);
    assert.strictEqual(lastFetchRequest.body.action, "getLoansData");
    assert.strictEqual(lastFetchRequest.body.payload.page, 2);
    assert.strictEqual(lastFetchRequest.body.payload.limit, 25);

    await ApiClient.callRpc("endorseLoan", ["BLLN-202611-001", "Approved for review"]);
    assert.strictEqual(lastFetchRequest.body.action, "endorseLoan");
    assert.strictEqual(lastFetchRequest.body.payload.loanId, "BLLN-202611-001");
    assert.strictEqual(lastFetchRequest.body.payload.remarks, "Approved for review");
  });

  console.log("\n--> Section 3: google.script.run Transparent Proxy Shim");

  await it("google.script.run proxy intercepts RPC and executes success handler", async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ success: true, summary: { totalSavings: 500000 } })
    };

    let receivedResult = null;
    await new Promise((resolve, reject) => {
      context.google.script.run
        .withSuccessHandler((res) => {
          receivedResult = res;
          resolve();
        })
        .withFailureHandler((err) => {
          reject(new Error("Failure handler should not be called: " + err.message));
        })
        .getDashboardData();
    });

    assert.strictEqual(receivedResult.success, true);
    assert.strictEqual(receivedResult.summary.totalSavings, 500000);
    assert.strictEqual(lastFetchRequest.body.action, "getDashboardData");
  });

  await it("google.script.run proxy catches API errors and executes failure handler", async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ success: false, error: "Access denied: Unauthorized role" })
    };

    let caughtError = null;
    await new Promise((resolve, reject) => {
      context.google.script.run
        .withSuccessHandler(() => {
          reject(new Error("Success handler should not be called on error"));
        })
        .withFailureHandler((err) => {
          caughtError = err;
          resolve();
        })
        .getRolesData();
    });

    assert.ok(caughtError);
    assert.ok(caughtError.message.includes("Access denied: Unauthorized role"));
    assert.strictEqual(lastFetchRequest.body.action, "getRolesData");
  });

  console.log("\n======================================================================");
  console.log(`=== AUTH-2 VERIFICATION COMPLETE: ${passedTests}/${totalTests} CHECKS PASSED ===`);
  console.log("======================================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

async function it(description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${description}`);
    console.error(`         ${err.message}`);
  }
}

runAllTests();
