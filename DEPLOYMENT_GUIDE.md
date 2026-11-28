# Brightlife SHG: Deployment & Release Guide

This document is the standard operating procedure (SOP) for testing and deploying changes to the Brightlife SHG Financial Operating System across both local development, Google Apps Script headless API, and the decoupled GitHub Pages member portal.

---

## 1. System Architecture: Decoupled Headless Model

Brightlife SHG uses a **decoupled architecture**:
1. **Frontend**: Static Single Page Application (SPA) hosted on GitHub Pages (`https://delinktech.github.io/dashboard/`) or tested locally on `http://localhost:8088/`.
   - Built with Tailwind CSS, Chart.js, and Google Identity Services (GIS).
   - Authenticates members using Google One-Tap / Google Sign-In button (`accounts.google.com/gsi/client`).
   - Uses `ApiClient` to send CORS-safelisted HTTP `POST` requests passing the Google OAuth ID Token (JWT).
2. **Backend**: Google Apps Script Web App operating as a headless API gateway via `doPost(e)`.
   - Configured with `executeAs: USER_DEPLOYING` (runs under the script owner's credentials).
   - Configured with `access: ANYONE_ANONYMOUS` so requests from the web portal reach `doPost(e)` without 3rd-party cookie blocks.
   - Cryptographically verifies the caller's Google ID token against `GOOGLE_CLIENT_ID` via `verifyGoogleIdToken_`.
   - Restricts data access strictly to registered members in the `Roles` sheet (Zero-IDOR policy).

---

## 2. Environments & Identifiers

| Component | Staging / Local Dev | Production |
| :--- | :--- | :--- |
| **Frontend URL** | `http://localhost:8088/` | `https://delinktech.github.io/dashboard/` |
| **Google Client ID** | `961631543108-en4e2seqgq8tkk0fs0ehl9hmsqr0itpr.apps.googleusercontent.com` | Same (Unified OAuth Client) |
| **Authorized JS Origins** | `http://localhost:8088`, `http://127.0.0.1:8088` | `https://delinktech.github.io` |
| **Apps Script Deployment** | `AKfycbwhg7ua3NEVMbXNkkJzHyo1j5UsizL0Zme6GPYGHLW7JPoR0Jg7GiRRlajzNc8bphieoA` | `AKfycbx4NBY3rdhsCAJljxlTw3dQRGpxXTHOXUWLnaJzoscRLJWWo-uPoX4J-S75HtLFB0wRCA` |
| **Apps Script Access** | Execute as: **Me** \| Who has access: **Anyone** | Execute as: **Me** \| Who has access: **Anyone** |

---

## 3. Routine Deployments (Code Changes Only)

When you make changes to frontend views, scripts, or backend services that do **not** add new Google permission scopes:

### Step 1: Run Automated Verification Tests
Run all test suites before deploying:
```bash
cd group-dashboard
node tests/verify-auth-headless-gateway.js
node tests/verify-auth-client-transport.js
node tests/verify-auth-ui-signin.js
node tests/verify-auth-idor-security.js
```
*All checks must pass before proceeding.*

### Step 2: Push Backend Code to Apps Script
```bash
npx @google/clasp push --force
```

### Step 3: Deploy to the Target Deployment
- **For Staging**:
  ```bash
  npx @google/clasp deploy -i AKfycbwhg7ua3NEVMbXNkkJzHyo1j5UsizL0Zme6GPYGHLW7JPoR0Jg7GiRRlajzNc8bphieoA -d "Staging Update: <Description>"
  ```
- **For Production** (once staging is verified):
  ```bash
  npx @google/clasp deploy -i AKfycbx4NBY3rdhsCAJljxlTw3dQRGpxXTHOXUWLnaJzoscRLJWWo-uPoX4J-S75HtLFB0wRCA -d "Production Release: <Description>"
  ```

### Step 4: Compile & Publish Static Frontend
Recompile the single-file portal bundle:
```bash
node scripts/build-static-portal.js
```
To deploy to GitHub Pages:
- Copy the compiled bundle to `dashboard/index.html` (or your GitHub Pages source branch).
- Commit and push to git:
  ```bash
  git add .
  git commit -m "chore(release): deploy vX.X.X to GitHub Pages"
  git push origin <branch>
  ```

---

## 4. Special Deployment: When Adding New Google Permissions

Google Apps Script enforces strict permission isolation for Web Apps executing as `USER_DEPLOYING`. Whenever a new Apps Script service is added (for example: `UrlFetchApp`, `GmailApp`, `DriveApp`, or an Advanced Service):

### Step 1: Declare Scope in `appsscript.json`
Add the required OAuth scope under `"oauthScopes"` in `src/appsscript.json`.

### Step 2: Push to Apps Script
```bash
npx @google/clasp push --force
```

### Step 3: Grant Script Owner Authorization in Editor (One-Time)
1. Open the [Apps Script Editor](https://script.google.com/d/13PqieSLLoV7UZ9utFw0umojsHbRvcQVkLAEFeGol0PH5CCUS81UkGSQj/edit).
2. Select any function from the top toolbar dropdown (e.g. `authorizeScriptPermissions` or `doGet`).
3. Click the **Run** button (▶️).
4. In the Google popup, click **Review permissions** > Choose your account > **Advanced** > **Go to Brightlife SHG (unsafe)** > **Allow**.

### Step 4: Refresh Web App Deployment in Apps Script UI (Crucial!)
> [!IMPORTANT]
> `clasp deploy` updates the version in Google's database, but Google **only binds your newly granted account permissions to the Web App deployment when saved via the Apps Script Web UI**.

1. In the Apps Script Editor, click **Deploy** (top right blue button) > **Manage deployments**.
2. Select your deployment in the left sidebar.
3. Click the **Edit** icon (pencil ✏️) at the top right of the modal.
4. In the **Version** dropdown, select **"New version"**.
5. Confirm:
   - **Execute as**: `Me (<your email>)`
   - **Who has access**: `Anyone`
6. Click **Deploy**.

---

## 5. Troubleshooting & Diagnostics Checklist

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **`403 Forbidden` on `gsi/status` or `button`** | Origin mismatch in Google Cloud Console. | Check the browser address bar. Ensure the exact origin (e.g. `http://localhost:8088` or `http://127.0.0.1:8088` or `https://delinktech.github.io`) is listed under **Authorized JavaScript origins** in Google Cloud Console. |
| **`401 Unauthorized` / CORS block on API `POST`** | Web App deployment access is set to "Only myself" or "Anyone with Google Account". | In Apps Script UI, open **Deploy > Manage deployments > Edit**, change **Who has access** to **Anyone**, and click Deploy. |
| **`You do not have permission to call UrlFetchApp.fetch`** | Deployment credentials were not updated after new scope authorization. | In Apps Script UI, open **Deploy > Manage deployments > Edit**, choose **New version** in the Version dropdown, and click **Deploy**. |
| **Unauthenticated user sees blank dashboard** | Frontend session check bypassed. | Ensure `showPage()` and `resolveSessionLandingPage()` maintain the `auth-gate-active` state, strictly routing unauthenticated sessions to `sign-in`. |

---

## 6. Local Server Quick Reference
To start the local preview server on port 8088:
```bash
node scripts/serve-local.js
```
Open: `http://localhost:8088/` (or `http://127.0.0.1:8088/`).
