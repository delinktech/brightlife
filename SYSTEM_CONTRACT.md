# Brightlife SHG — System Contract & Shared State
*Maintained and synchronized by specialist sub-agents (`@shipper`, `@ledger`, `@analyst`, `@fixer`, `@migrator`, `@messenger`, `@designer`, `@sentinel`).*

---

## 1. Environment & Deployment (`@shipper`)
- **GAS Script ID:** `13PqieSL........GSQj` *(Masked)*
- **Active Production Deployment:** `AKfycbx4........wRCA` *(Masked)*
- **Current Live Version:** `v100` (Google Apps Script Build `@101`)
- **Timezone:** `Africa/Nairobi`
- **Release Ledger:** See `RELEASES.md` for historical release versions and changelog.

---

## 2. Workbook & Tab Schema (`@ledger`)
- **Production / WIP Workbook ID:** `18zbE2MS........bu_0` *(Masked)*
- **Legacy Workbook ID:** Pending legacy workbook ingestion *(Read-Only for `@migrator`)*

### Approved Deposit Channels
Any deposit, payment, or reconciliation record must strictly match one of the 5 approved channels:
1. `Cash`
2. `Equity Bank`
3. `CIC MMF`
4. `Mansa X`
5. `Refund / Expense Offset` *(Non-cash operational offsets)*

### Core Table Schemas & Headers
* **`Members`**: `Member ID | Full Name | ID Number | KRA PIN | Phone Number | Email | Status | Registration Date | Total Savings | Current Loan Balance | Guaranteed Amount | Max Loan Eligibility | Available to Guarantee`
* **`Contributions`**: `Contribution ID | Member ID | Member Name | Amount | Deposit Channel | Transaction Reference | Date | Status | Notes`
* **`Loans`**: `Loan ID | Member ID | Borrower Name | Principal Amount | Interest Rate (%) | Loan Term (Months) | Disbursed Date | Due Date | Total Loan Repaid | Loan Balance | Shortfall Amount | Status | Notes`
* **`Loan Repayments`**: `Repayment ID | Loan ID | Member ID | Amount | Repayment Date | Deposit Channel | Reference / TID | Principal Portion | Interest Portion | Penalty / Fee Portion | Notes`
* **`Guarantors`**: `Guarantor Record ID | Loan ID | Borrower ID | Guarantor Member ID | Guaranteed Amount | Status`
* **`Investments`**: `Investment ID | Investment Name | Asset Class | Institution / Platform | Amount Invested | Current Value | Date Invested | Maturity Date | Expected Yield (%) | Status | Notes`
* **`Accounts`**: `Org. Name | Acc. Number | Payment Mode | Paybill | Inflows | Outflows | System Balance | Statement Balance | Balance Date | Variance | Reconciliation Status`
* **`Fund Statements`**: `Statement Date | Fund Channel | Opening Balance | Purchases / Deposits | Gross Interest | Withholding Tax | Net Yield | Withdrawals | Closing Balance | Statement Ref`
* **`CIC Transactions`**: `Transaction ID | Date | Description | Purchase | Interest | Withdrawal | Withholding Tax | Balance`
* **`Roles`**: `Email | Role | Permissions | Status`
* **`AuditLog`**: `Log ID | Timestamp | User Email | Action | Entity | Entity ID | Details`
* **`Constants`**: Config key-value parameters.

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
  - **Aggregated Statements:** 66 monthly historical statements in `Fund Statements`.
  - **Statement Reconciled Closing Balance:** `KES 899,551.62` (as of 31 Jul 2026) / `KES 976,564.16` (as of 31 Oct 2026).
  - **Reconciliation Audit:** 100% matched to official CIC statement summary down to the exact cent (Total Purchases: `1,615,130.00`, Gross Interest: `228,731.35`, Withdrawals: `910,000.00`, WHT: `34,309.69`).
  - **Reconciliation Status:** `Balanced`.

---

## 5. Security & Compliance Gate (`@sentinel`)
* **Pre-Deployment Gate:** Mandatory sign-off required before `@shipper` updates Production.
* **Secret Sanitization:** All Google Sheet IDs, Script IDs, and Deployment IDs in public/git docs must be masked (`xxxxx........xxxx`). Local `.clasp.json` must remain untracked.
* **RBAC Enforcement:** All state-modifying RPC methods must enforce `requirePermission_()` server-side.
* **Input Sanitization:** Client-side DOM insertions must use `escapeHtml()` / `escapeHtmlAttr()`; inputs saved to sheets must be stripped of formula injection prefixes (`=`, `+`, `-`, `@`).
* **OAuth Scope Minimization:** `src/appsscript.json` must request only explicit, least-privilege scopes.
