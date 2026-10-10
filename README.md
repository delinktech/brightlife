# Brightlife SHG Dashboard

Google Apps Script web app for a savings and credit group: members, contributions, loans, investments, and accounts. The UI is served from `Index.html` (`index.html`) with Tailwind (CDN) and Chart.js.

## Requirements & Setup

- **Google Spreadsheet**:
  - Bound to this script (Extensions → Apps Script inside the sheet), OR
  - Standalone script with **`SPREADSHEET_ID`** set in `config.constants.gs`.
- **Sheet tabs** named to match `SHEETS` in `config.constants.gs` (`Members`, `Contributions`, `Loans`, `Roles`, `Accounts`, `Investments`, `InvestmentLedger`, `Guarantors`, `AuditLog`).
- **Roles tab**: Columns must be `Email`, `Name`, `Role`, `Active`. The `Roles` tab is automatically initialized with headers if missing.
- **Named range**: `BL_CONTRIBUTIONS` pointing at the Contributions table (including headers) — used when posting transactions.
- **People API**: Advanced Google Service for user profile names and photos (safely optional).

## Troubleshooting "Exception: You do not have permission to call SpreadsheetApp..."

If you see an error dialog saying **"You do not have permission to call SpreadsheetApp..."**:

1. **Authorize OAuth Scopes**:
   - In Google Apps Script, click **Deploy > New deployment** (or **Test deployments**).
   - Authorize the requested permissions (`Google Sheets`, `User email`, `User profile`) when prompted.
2. **For Standalone Apps Script Projects**:
   - Open `config.constants.gs`.
   - Copy your Google Sheet ID from its URL (`https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit`) and paste it into `const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID";`.
3. **Web App Deployment Settings**:
   - **Execute as:** *User accessing the web app* (or *Me* if sharing single context).
   - **Who has access:** *Anyone with Google account* (or *Anyone within domain*).

## Spreadsheet layout

| Sheet        | Purpose |
|-------------|---------|
| **Members** | Member registry and balances (see `members.service.gs` for expected headers). |
| **Contributions** | Ledger of contributions and payments. |
| **Loans**   | Loan portfolio. |
| **Roles**   | Access control: **Email**, **Name**, **Role**, **Active**. |
| **AuditLog** | Created automatically: append-only audit rows for guarded actions. |
| Other tabs  | `Guarantors`, `Investments`, `InvestmentLedger`, `Accounts` as used by the respective services. |

### Roles sheet

- **Email** — must match the signed-in Google account (case-insensitive).
- **Name** — shown in the app header when set (preferred over the People API name for display).
- **Role** — one of: `admin`, `treasurer`, `secretary`, `member` (aliases like `chairperson` / `finance` / `administrator` are normalized).
  - 🔵 **Admin**: Full system control & role administration.
  - 🟣 **Treasurer**: Financial operations (Contributions, Loan Payments, Accounts, Investments).
  - 🟢 **Secretary**: Member registry management & Loan Request Intake.
  - ⚪ **Member**: View-only group analytics + submit loan requests.
- **Active** — `TRUE`, `yes`, `1`, etc. for an active assignment.

Permissions are defined in `auth.service.gs` (`getPermissionsForRoleKey_`) and enforced on the server with `requirePermission_`. The client uses `getSessionInfo()` (`session.service.gs`) to receive `permissions` and toggles UI with `data-require-perm` attributes.

### Audit log

The **AuditLog** sheet is created on first use with columns: Timestamp, Actor Email, Action, Entity, Entity ID, Summary, Details. Writes are triggered from services after successful mutations (e.g. members, contributions).

## Project structure (main files)

| File | Role |
|------|------|
| `app.main.gs` | `doGet`, `include` for HTML templates. |
| `config.constants.gs` | `APP_VERSION`, sheet names, `getSpreadsheet_`, header helpers. |
| `session.service.gs` | `getSessionInfo`, People profile helper, display name chain. |
| `auth.service.gs` | Role lookup, permissions, `requirePermission_`. |
| `audit.service.gs` | `appendAuditLog_`. |
| `*.service.gs` | Data and mutations per domain (members, contributions, loans, …). |
| `index.html` | Shell: sidebar, header, page containers. |
| `*.html` | Page fragments included into the shell. |
| `app.ui.js.html`, `*.ui.js.html` | Client-side behavior per page. |

Release label shown in the sidebar comes from `APP_VERSION` in `config.constants.gs` — bump it when you ship meaningful changes.

## Development

Use [clasp](https://github.com/google/clasp) to sync this folder with Apps Script if you work locally: `clasp push` / `clasp pull`. Ensure script file names match Apps Script conventions (e.g. `Index` vs `index` may matter for `createTemplateFromFile("Index")` — keep in sync with your project).
