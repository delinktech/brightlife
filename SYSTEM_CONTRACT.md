# Brightlife SHG — System Contract & Shared State
*Maintained and synchronized by specialist sub-agents (`@scrum`, `@shipper`, `@ledger`, `@analyst`, `@fixer`, `@migrator`, `@messenger`, `@designer`, `@sentinel`).*

---

## 1. Environment & Deployment (`@shipper`)
- **GAS Script ID:** `13PqieSL........GSQj` *(Masked)*
- **Active Production Deployment:** `AKfycbx4........wRCA` *(Masked)*
- **Current Live Version:** `v141` (Google Apps Script Build `@142`)
- **Timezone:** `Africa/Nairobi`
- **Release Ledger:** See `RELEASES.md` for historical release versions and changelog.

---

## 2. Workbook & Tab Schema (`@ledger`)
- **Production / WIP Workbook ID:** `18zbE2MS........bu_0` *(Masked)*
- **Legacy Workbook ID:** Pending legacy workbook ingestion *(Read-Only for `@migrator`)*

### 2.0 Permanent Workbook Design & Governance Standards
All agents (`@ledger`, `@fixer`, `@migrator`, `@analyst`, `@shipper`) MUST enforce these permanent workbook rules across every tab and column:
1. **Tab & Column Naming (Institutional Title Case with Single Spaces — Zero Underscores):**
   - All sheet tab names, table headers, and `Constants` reference headers/labels MUST use **Institutional Title Case with Single Spaces** (e.g., `Member ID`, `Investment Projects`, `Investment Cashflows`, `Summary KPIs`, `Asset Classes`, `Project Categories`, `Deposit Channel`, `Statutory Thresholds`, `Threshold Value`).
   - **Strictly Prohibited:** Underscores (`_`), `snake_case`, or `camelCase` in sheet names or column headers.
2. **Google Sheets Native Tables & Canonical Theme Color (`#0F2A44`):**
   - Every sheet tab must be formatted as a **Google Sheets Native Table** ("Convert to table" via Google Sheets API v4 `addTable` for new tabs and `updateTable` when appending adjacent columns to existing tables like `Constants` or `Investments`).
   - **Canonical Table Color (`#0F2A44`):** Header Row 1 background **`#0F2A44`** (`rgb(15, 42, 68)`), bold white text (`#FFFFFF`), frozen Row 1, with alternating row banding (`#FFFFFF` / `#F4F7FA`).
   - **Native Table Typed-Column Guard (`This operation is not allowed on cells in typed columns`):** In Google Sheets Native Tables, columns may carry native Table Column Types. Calling `setNumberFormat` or `setDataValidation` across unbounded `getMaxRows()` (crossing the table boundary) or on a typed table column throws `Exception: This operation is not allowed on cells in typed columns.`. Always bound column ranges to `Math.max(sheet.getLastRow() - 1, 1)` and wrap `setNumberFormat` / `setDataValidation` in `try/catch`.
3. **Row 2 Spill Formula Architecture:**
   - Google Sheets Native Tables prohibit formulas in Row 1 (`Formulas are not supported in a table header row.`).
   - **Row 1** must always remain a plain-text header value (`setValue(headerTitle)`).
   - **Row 2** is the anchor cell for all column-wide `=MAP(A2:A, LAMBDA(...))` array spill formulas. Row-level writers must leave spill-governed cells empty (`""`) on rows `2..N` (and preserve Row 2's `=MAP(...)` formula when updating Row 2).
4. **Single Source of Truth — Zero Duplicate Columns or Redundant Tabs:**
   - **Reuse `Deposit Channel` in `Constants`:** Never add duplicate `Payment Channels` columns to `Constants`; all payment/deposit channel validations point to `Constants!Deposit Channel`.
   - **Consolidated Bank, MMF & Investment Ledgers:**
     - `Equity Statement` is the single canonical Equity Bank statement tab (`SHEETS.EQUITY_STATEMENT`) for account `0020164001424`. Linked to Named Range `EquityStatement_ClosingBalance`.
     - `CIC Statement` is the single canonical MMF statement tab (`CIC Transactions` and legacy `Fund Statements` are retired and consolidated to `CIC Statement`).
     - `Investment Cashflows` is the single unified investment transaction ledger (all legacy `InvestmentLedger` rows are migrated to `Investment Cashflows`, all `Investments` / `Investment Projects` formulas reference `Cashflows_*` Named Ranges, and `InvestmentLedger` is retired and deleted).

### Approved Deposit Channels
Any deposit, payment, or reconciliation record must strictly match one of the 5 approved channels in `Constants!Deposit Channel`:
1. `Cash`
2. `Equity Bank`
3. `CIC MMF`
4. `Mansa X`
5. `Refund / Expense Offset` *(Non-cash operational offsets)*

### Core Table Schemas & Headers
* **`Members`**: `Member ID | First Name | Middle Name | Last Name | Full Name [CALC] | National Id | Gender | Date of Birth | Phone Number | Email | Registration Date | Status | Total Savings [CALC] | Current Loan Balance [CALC] | Guaranteed Amount [CALC] | Max Loan Eligibility [CALC] | Available to Guarantee [CALC]`
* **`Contributions`**: `Date | Member ID | Member Name [LOOKUP] | Amount | Deposit Channel | Transaction ID | Type | Status | Verified By`
* **`Loans`**: `Loan ID | Request Date | Approved Date | Member ID | Borrower Name [LOOKUP] | Requested Amount | Interest | Transaction Fee | Repayment Amount [CALC] | Total Paid [CALC] | Principal Paid [CALC] | Interest Paid [CALC] | Fee Paid [CALC] | Balance [CALC] | Status | Borrower’s Own Savings [CALC] | Total Guaranteed [CALC] | Shortfall Amount [CALC]`
* **`Loan Repayments`**: `Payment ID | Loan ID | Payment Date | Member ID | Borrower Name [LOOKUP] | Total Paid | Principal Paid | Interest Paid | Fee Paid | Deposit Channel | Transaction ID | Balance Remaining | Status | Verified By`
* **`Guarantors`**: `Loan ID | Member ID | Guarantor Name [LOOKUP] | Guaranteed Amount | Loan Status [LOOKUP] | Guarantor’s Savings Balance [LOOKUP] | Guarantor Eligibility [CALC]`
* **`Investments`** *(Tier 1 Master Catalog - Instruments & Shares)*: `Investment ID | Name | Start Date | Money Invested [CALC] | Revenue [CALC] | ROI Amount [CALC] | ROI % [CALC] | Status | Asset Class | Institution | Ticker | Units Held | Unit Cost | Current Price | Last Valued | Carrying Value [CALC]`
* **`Investment Projects`** *(Tier 2 Master Catalog - Tangible & Agribusiness)*: `Project ID | Project Name | Category | Linked Investment ID | Start Date | Operating Capacity | Capacity Unit | Lead Member | Approved Budget | Status | Notes | Created At | Capital Deployed [CALC] | Cumulative Revenue [CALC] | Cumulative OpEx [CALC] | Carrying Value [CALC]`
* **`Investment Cashflows`** *(Tier 3 Unified Transactional Ledger — replaces `InvestmentLedger`)*: `Transaction ID | Date | Entity Type | Entity ID | Flow Type | Category | Description | Amount | Transaction Fee | Payment Channel | Reference | Recorded By | Recorded At`
* **`Accounts`**: `Org. Name | Acc. Number | Payment Mode | Paybill | Inflows [CALC] | Outflows [CALC] | System Balance [CALC] | Statement Balance | Balance Date | Variance [CALC] | Reconciliation Status [CALC] | Notes` *(Equity Bank Acc. Number: `0020164001424`)*
* **`Summary KPIs`** *(Materialized O(1) Cache)*: `Metric Key | Value | Formula Basis & Description`
* **`Constants`** *(Single Unified Native Table — Title Case with Single Spaces)*: `Gender | Membership Status | Deposit Channel | Transaction Type | Contribution Status | Loans Statuses | Investment Statuses | Ledger Types | Ledger Categories | Roles | Member Selector | Asset Classes | Project Categories | Statutory Thresholds | Threshold Value`
* **`Equity Statement`** *(Single Canonical Equity Bank Statement Table — `SHEETS.EQUITY_STATEMENT`)*: `Statement Date | Account Name | Account Number | Opening Balance | Money In (Deposits) | Money Out (Withdrawals) | Net Change | Closing Balance | Statement Ref | Notes / Breakdown` *(Named Range: `EquityStatement_ClosingBalance`)*
* **`CIC Statement`** *(Single Canonical MMF Statement Table — replaces `CIC Transactions` and legacy `Fund Statements`)*: `Statement Date | Fund Channel | Opening Balance | Purchases / Deposits | Gross Interest | Withholding Tax | Net Yield | Withdrawals | Closing Balance | Statement Ref`
* **`Roles`**: `Email | Role | Permissions | Status`
* **`Audit Log`**: `Timestamp | Actor Email | Action | Entity | Entity ID | Summary | Details`

---

## 3. Active RPC Endpoints (`@fixer`)
Client-server contracts called via `google.script.run`:

* **`getAccountsReconciliationData()`**
  - **Returns**: `{ success: boolean, summary: { totalPhysicalBankCash, totalSystemBookCash, netVariance, isBalanced, totalGroupAssets, totalOutstandingLoans, totalInvestments }, rows: [...] }`
* **`updateAccountStatementBalance(data)`**
  - **Payload**: `{ rowNumber: number, statementBalance: number, statementDate: string, notes: string }`
  - **Returns**: `{ success: boolean, error?: string }`
* **`getAccountsData()`**
  - **Returns**: `{ success: boolean, accounts: [...], rows: [...], canReconcile: boolean, summary: {...} }`
* **`getDashboardData(range)`**
  - **Returns**: KPI statistics, monthly comparison trends, top contributors, loan status breakdown, portfolio at risk.
* **`getContributionsData()`**
  - **Returns**: Contribution logs, annual member breakdown, pending approvals.
* **`getLoansData()`**
  - **Returns**: Loan portfolio register, borrower limits, repayment schedules, guarantors map.
* **`getDividendsData()`**
  - **Returns**: Net distributable pool, loan interest earnings, investment gains, proposed reserve ratio, member payout matrix.

---

## 4. Migration Status (`@migrator`)
* **Batch 1 — CIC MMF Historical Statement Backfill (Completed)**:
  - **Statement Period:** 20 May 2021 to 31 July 2026 (Connected to Oct 2026)
  - **Ingested Itemized Records:** 138 individual transactions into `CIC Transactions`.
  - **Aggregated Statements:** 66 monthly historical statements in `CIC Statement`.
  - **Statement Reconciled Closing Balance:** `KES 899,551.62` (as of 31 Jul 2026) / `KES 976,564.16` (as of 31 Oct 2026).
  - **Reconciliation Audit:** 100% matched to official CIC statement summary down to the exact cent (Total Purchases: `1,615,130.00`, Gross Interest: `228,731.35`, Withdrawals: `910,000.00`, WHT: `34,309.69`).
  - **Reconciliation Status:** `Balanced`.
* **Batch 2 — Equity Bank Historical Statement Backfill (Task MIG-2 - Baseline Active)**:
  - **Account Number:** `0020164001424` (`SHEETS.EQUITY_STATEMENT` / `Equity Statement`)
  - **Baseline Ingested:** Dec 2021 statement (Acc `0020164001424`, `KES 583,423.85` opening, `KES 33,750.00` in, `KES 40,060.00` out, `KES -6,310.00` net change, `KES 577,113.85` closing).
  - **Named Range:** `EquityStatement_ClosingBalance` registered and linked to `Accounts` statement balance.
  - **Statement Ref:** `EQ-STMT-DEC-2021` (Dec 2021: 8 M-Pesa deposits `33,750.00`, 1 Cheque #000016 `40,000.00`, 1 Inward clearing fee `60.00`).
  - **Reconciliation Status:** `Balanced`.

---

## 5. Security & Compliance Gate (`@sentinel`)
* **Pre-Deployment Gate:** Mandatory sign-off required before `@shipper` updates Production.
* **Secret Sanitization:** All Google Sheet IDs, Script IDs, and Deployment IDs in public/git docs must be masked (`xxxxx........xxxx`). Local `.clasp.json` must remain untracked.
* **RBAC Enforcement:** All state-modifying RPC methods must enforce `requirePermission_()` server-side.
* **Input Sanitization:** Client-side DOM insertions must use `escapeHtml()` / `escapeHtmlAttr()`; inputs saved to sheets must be stripped of formula injection prefixes (`=`, `+`, `-`, `@`).
* **OAuth Scope Minimization:** `src/appsscript.json` must request only explicit, least-privilege scopes.

---

## 6. Statements Dispatch Hub & Document Printing (`@designer`, `@sentinel`)
* **Task COM-4 Deliverables (Statements Preview PDF Export & Print CSS Hardening)**:
  - **Statements Preview PDF Export:** Implemented 1-click `[Print / Save PDF]` button inside the certified monthly statement preview modal (`Statements.html`, `statements.ui.js.html`), enabling immediate export to paper or PDF directly from the active preview state without re-fetching.
  - **Global Print CSS Hardening (`Index.html`):** Configured `@page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }` with `print-color-adjust: exact !important`, isolated `.blg-avoid-break` / `table { page-break-inside: avoid; }`, enabled `thead { display: table-header-group; }` repeating headers across pages, and enforced high-contrast print typography preserving status badge fidelity.
  - **AGM Pack Wiring (`Home.html`):** Rewired the primary print button in Group Overview header to launch the official AGM & Bank Audit Pack modal (`openReportModal('agm-pack')`).
  - **Official Letterhead Credentials:** Synchronized verified organization contact details, postal address, email, and registration credentials across `PrintReportModal.html` and statement export layouts.
* **Task COM-5 Deliverables (True Chronological Member Statement Ledger & Single-Officer Treasurer Certification)**:
  - **Chronological Statement Ledger (`openPrintMemberStatement`, `openPrintPersonalStatement`):** Re-engineered member statements from simple static receipts into true chronological double-entry financial transaction ledgers. Computes exact historical opening balances prior to statement period start, processes itemized contributions and loan repayments in strict ascending date order with running balances, and displays accounting-standard double-underlined closing balance totals.
  - **Executive 4-Up Member KPI Header Cards:** Installed high-impact visual financial health summaries presenting Total Cumulative Savings, Net Unencumbered Free Savings, Current Active Loan Exposure, and Outstanding Guarantor Liability.
  - **Net Unencumbered Free Savings Calculation:** Accurately isolates unencumbered savings by deducting active guarantor pledges (`Math.max(0, closingSavings - totalGuaranteed)`), providing transparent visibility into borrowing capacity.
  - **Active Loan Amortization Sub-Schedules:** Embeds dedicated amortization schedules for active member borrowings, including principal, interest, fee breakdowns, and residual principal balance.
  - **Single-Officer Treasurer Certification:** Implemented official "Certified by Treasurer" compliance and audit verification block featuring the treasurer's signature, timestamp, and unique deterministic verification audit reference code (`BLG-TR-YYYYMMDD-MEMBERID`), while strictly preserving mandatory 3-officer statutory sign-off for institutional Balance Sheet and Income Statements.
