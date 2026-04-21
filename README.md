# Brightlife SHG Dashboard

Google Apps Script web app for a savings and credit group: members, contributions, loans, investments, and accounts. The UI is served from `Index.html` (`index.html`) with Tailwind (CDN) and Chart.js.

## Requirements

- A Google Spreadsheet with this project **bound** to it (Extensions → Apps Script), or deployed with access to the target spreadsheet.
- Sheet tabs named to match `SHEETS` in `config.constants.gs` (e.g. `Members`, `Contributions`, `Loans`, `Roles`, …).
- A **named range** `BL_CONTRIBUTIONS` pointing at the Contributions table (including headers) — used when posting transactions.
- Optional: **People API** (Advanced Google Service) for profile name and photo in the header. If unavailable, the app falls back to `Roles.Name` or a friendly name from the email address.

## Deployment

1. In Apps Script, deploy as **Web app**.
2. For **role-based access** and a correct **per-user email**, set:
   - **Execute as:** *User accessing the web app*
   - **Who has access:** your org (e.g. *Anyone within …* or *Anyone*), as appropriate.

If the app runs as a single fixed user, `Session.getActiveUser().getEmail()` will not reflect each visitor; RBAC and audit logs would then be wrong for multi-user use.

`appsscript.json` may still show template defaults; the **Web app** deployment dialog in the Apps Script UI is what actually applies execute-as and access.

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
- **Role** — one of: `admin`, `secretary`, `member` (aliases like `administrator` / `members` are normalized).
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
