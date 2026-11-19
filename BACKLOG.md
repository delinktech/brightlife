# Brightlife SHG — Master Product Backlog & Task Ledger
*Maintained and governed by `@scrum` (Technical Scrum Master & Delivery Orchestrator).*  
*Single Source of Truth for all completed, in-progress, and pending engineering deliverables.*

---

## 1. Executive Sprint Overview

| Metric | Status |
| :--- | :--- |
| **Current Live Release** | **`v110`** (Google Apps Script Build `@111`, Commit `bf401f5`) |
| **Total Tracked Tasks** | **23 Tasks** |
| **Completed & Shipped (`[DONE]`)** | **12 Tasks (52.2%)** |
| **Active In-Flight (`[IN PROGRESS]`)** | **1 Task (`RPT-2`)** |
| **Prioritized Backlog (`[BACKLOG]`)** | **10 Tasks (43.5%)** |
| **Current Sprint Focus** | Phase 2: Institutional Reporting Suite (`RPT-2: Statement of Comprehensive Income / P&L`) |

---

## 2. Completed Deliverables (Shipped in Production)

| Task ID | Domain | Title & Description | Target Agents | Shipped Release | Date Completed |
| :---: | :---: | :--- | :---: | :---: | :---: |
| **`RPT-1`** | Financial | **Statement of Financial Position (Balance Sheet)**: Audited IFRS/SASRA Balance Sheet on `Reports` tab with dual-column classical ledger, 4-card solvency ribbon, zero-variance guarantee, RFC-4180 CSV export, and BLG letterhead print preview. | `@analyst`, `@fixer`, `@designer` | **`v110`** (`@111`) | 2026-11-19 |
| **`FIN-1`** | Financial | **Decoupled PAR & 3-Tier Delinquency Waterfall**: Decoupled Portfolio at Risk from guarantor shortfall; implemented 3-tier delinquency classification (explicit status $\to$ due date $\to$ tenor) and Section 51 statutory provisioning. | `@analyst`, `@fixer` | **`v102`** (`@103`) | 2026-11-18 |
| **`FIN-2`** | Financial | **Net Liquid Cash Reconciliation**: Replaced artificial `savings - loans` formula with true verified physical bank accounts + CIC MMF liquidity summary and fallback waterfall. | `@analyst`, `@fixer` | **`v104`** (`@105`) | 2026-11-19 |
| **`FIN-3`** | Financial | **Multi-Source Cashflow Restoration**: Re-wired period inflows (repayments, yields, revenue) and outflows (disbursements, expenses) across active date ranges. | `@analyst`, `@fixer` | **`v105`** (`@106`) | 2026-11-19 |
| **`UI-HDR`** | UI/UX | **Borderless Header & Sub-Navigation Tabs**: Replaced bulky card with canvas header (removed redundant name/A/C/+Add Member) and introduced `[Overview] [Analytics] [Reports]` segmented tabs. | `@designer` | **`v106`** (`@107`) | 2026-11-19 |
| **`VIS-1`** | Visual | **Cash Flow Waterfall Chart**: Implemented IAS 7 liquid cash flow bridge ($\text{Opening} + \text{Inflows} - \text{Outflows} = \text{Closing}$) with floating bars and decomposition matrix on `Analytics` tab. | `@analyst`, `@designer`, `@fixer` | **`v107`** (`@108`) | 2026-11-19 |
| **`VIS-2`** | Visual | **Cumulative Savings vs. Loan Exposure Trajectory**: Implemented rolling 12-month area/line chart against the SASRA 85% prudential ceiling with 4-band leverage KPI strip on `Analytics` tab. | `@analyst`, `@designer`, `@fixer` | **`v108`** (`@109`) | 2026-11-19 |
| **`VIS-3`** | Visual | **SASRA Delinquency Aging Buckets & Provisioning Matrix**: Implemented full 5-tier statutory impairment schedule (1%, 5%, 25%, 50%, 100%), horizontal bar chart, and Net Carrying Loan Asset audit table on `Analytics` tab. | `@analyst`, `@designer`, `@fixer` | **`v109`** (`@110`) | 2026-11-19 |
| **`UI-1A`** | UI/UX | **Interactive Search, Filtering & Pagination**: Instant live search, multi-criteria filtering, and 10-per-page pagination across all 6 data tables. | `@designer` | **`v96`** (`@97`) | 2026-11-18 |
| **`UI-1B`** | UI/UX | **Responsive Mobile Layout & Touch Targets**: 38–44px touch targets, mobile card wrapping, and responsive table navigation. | `@designer` | **`v95`** (`@96`) | 2026-11-18 |
| **`UI-1C`** | UI/UX | **Institutional Theme Engine & Modal Purity**: Zero-flash theme boot, Sun/Moon switcher, and 100% pure Light Mode / Dark Mode across all 15 modals. | `@designer` | **`v97`–`v103`** | 2026-11-18 |
| **`MIG-1`** | Migration | **CIC MMF Historical Statement Ingestion**: Ingested 138 transactions and 66 monthly statements back to May 2021, fully reconciling closing balances to the exact cent. | `@migrator`, `@ledger` | **`v90`–`v92`** | 2026-11-18 |

---

## 3. Prioritized Unworked Backlog (The Road Ahead)

The remaining 11 tasks are categorized below in strict execution priority:

### Tier 1: Immediate Strategic Priorities (Active Sprint Focus)

#### 1. `RPT-2: Statement of Comprehensive Income (Profit & Loss / P&L)` `[IN PROGRESS]`
* **Priority:** `P0 (Top Strategic Priority)`
* **Domain:** Financial Reporting (`@analyst` $\to$ `@fixer` $\to$ `@designer`)
* **Location:** `Reports` tab (`#home-subview-reports`)
* **Objective:** Formalize operating performance over the selected period:
  - **Operating Revenue:** Loan Interest Earned + Processing Fees + Fines/Penalties.
  - **Investment Yields:** CIC MMF Net Yields + Mansa X Returns.
  - **Less Operating Expenses:** Bank/Paybill Charges + Software & Technology Fees + Meeting/AGM Costs.
  - **Less Provisions:** Period Loan Loss Impairment Allocation.
  - **Result:** **Net Distributable Surplus** available for member dividend allocation.
* **Dependencies:** FIN-3, RPT-1 (Unblocked and ready for immediate implementation).

#### 2. `RPT-4: Official AGM & Bank Audit Export Pack`
* **Priority:** `P1 (High)`
* **Domain:** Document Governance (`@designer` $\to$ `@fixer` $\to$ `@sentinel`)
* **Location:** `Reports` tab
* **Objective:** One-click generation of the official Brightlife SHG Financial Report:
  - Executive PDF with formal BLG letterhead, verification reference hash, and confidentiality stamps.
  - Full CSV/Excel audit package export for commercial bank financing or SACCO regulator filing.
* **Dependencies:** RPT-1 (Shipped in v110), RPT-2.

---

### Tier 2: Governance, Exports & Data Reconciliation

#### 3. `GOV-1: Multi-Signature Dual-Officer Loan Approval Workflow`
* **Priority:** `P1 (High)`
* **Domain:** Governance & Internal Controls (`@ledger` $\to$ `@fixer` $\to$ `@designer` $\to$ `@sentinel`)
* **Location:** `Loans.html` & `server/loans.service.js`
* **Objective:** Prevent single-user loan disbursement fraud by requiring dual authorization:
  - Chairperson initial review $\to$ Treasurer final authorization before loan moves to `Approved` and triggers disbursement.
  - Audit trail logging in `SHEETS.AUDIT_LOG`.
* **Dependencies:** UI-2.

#### 4. `MIG-2: Equity Bank Statement Ingestion & Historical Account Reconciliation`
* **Priority:** `P1 (High)`
* **Domain:** Migration & Audit (`@migrator` $\to$ `@ledger`)
* **Location:** `SHEETS.ACCOUNTS` & `SHEETS.FUND_STATEMENTS`
* **Objective:** Ingest historical Equity Bank statements into itemized transaction records, reconciling physical bank credits against recorded member contribution dates.
* **Dependencies:** None.

#### 5. `COM-1: Automated WhatsApp & Email Transaction Receipts`
* **Priority:** `P1 (High)`
* **Domain:** Member Communications (`@messenger` $\to$ `@fixer`)
* **Location:** `server/comms.service.js`
* **Objective:** Automatically dispatch instant branded SMS/WhatsApp receipts and email notifications to members whenever their contributions or loan repayments are approved.
* **Dependencies:** None (`@messenger` infrastructure).

---

### Tier 3: Advanced Intelligence, Workflows & Platform Hardening

#### 6. `UI-2: Working Member Loan Application Workflow` `[BACKLOGGED / DEFERRED]`
* **Priority:** `P2 (Deferred by User Request)`
* **Domain:** User Experience & Core Operations (`@designer` $\to$ `@fixer`)
* **Location:** `Loans.html` (`Apply for Loan` Modal)
* **Objective:** Replace static/placeholder loan request flow with an interactive, end-to-end loan application modal:
  - Dynamic Borrower Selection with real-time savings lookup.
  - Real-time 3x Borrowing Limit & Eligibility Calculation.
  - Real-time Guarantor Allocation & Guarantee Deficit Tracker.
  - Interactive Loan Calculator: Amortization schedule, monthly installments, total interest.
  - Server-side validation and write to `SHEETS.LOANS` with `Status = "Pending"`.
* **Dependencies:** None (Data schema in `SHEETS.LOANS` and `SHEETS.GUARANTORS` is ready).

#### 7. `RPT-3: Statement of Changes in Equity & Direct Cash Flow Statement`
* **Priority:** `P2 (Medium)`
* **Domain:** Financial Reporting (`@analyst` $\to$ `@fixer` $\to$ `@designer`)
* **Location:** `Reports` tab
* **Objective:** Full multi-year capital progression tracking and IAS 7 direct cash flows (Operating, Investing, Financing).
* **Dependencies:** RPT-1, RPT-2.

#### 8. `UI-3: Advanced Ledger Multi-Sort & Filter Presets`
* **Priority:** `P2 (Medium)`
* **Domain:** UI/UX (`@designer`)
* **Location:** `Contributions.html`, `Loans.html`, `Members.html`
* **Objective:** Column header click-to-sort (Asc/Desc), saved filter presets (e.g. "Overdue Only", "Unallocated"), and multi-column export.
* **Dependencies:** UI-1A.

#### 9. `COM-2: End-of-Month Automated Member Statements & Dividend Projections`
* **Priority:** `P2 (Medium)`
* **Domain:** Member Communications (`@messenger` $\to$ `@fixer`)
* **Location:** `server/comms.service.js`
* **Objective:** Scheduled monthly batch delivery of individual member financial summaries, showing personal savings balance, active loan installments due, and projected year-end dividend yield.
* **Dependencies:** COM-1, RPT-2.

#### 10. `MIG-3: Legacy Chama Google Sheet Consolidation`
* **Priority:** `P2 (Medium)`
* **Domain:** Migration (`@migrator` $\to$ `@ledger`)
* **Location:** Legacy Workbooks
* **Objective:** Final ingestion and archival of any legacy standalone spreadsheet tabs into the unified Brightlife database.
* **Dependencies:** MIG-2.

#### 11. `SEC-1: Tamper-Evident Ledger Hashing & Audit Log Retention`
* **Priority:** `P2 (Medium)`
* **Domain:** Security & Compliance (`@sentinel` $\to$ `@fixer`)
* **Location:** `server/audit.service.js`
* **Objective:** Cryptographic SHA-256 rolling hash chain on financial ledger entries to detect manual row tampering outside the Web App.
* **Dependencies:** None.

---

## 4. Scrum Sprint Dependency Map

```mermaid
graph TD
    subgraph Shipped_Deliverables ["Shipped in Production (v102 - v110)"]
        F1["FIN-1: Decoupled PAR"]
        F2["FIN-2: Net Liquid Cash"]
        F3["FIN-3: Cashflow Period Feeds"]
        H["UI-HDR: Borderless Header & Sub-Nav"]
        V1["VIS-1: Cash Flow Waterfall"]
        V2["VIS-2: Savings vs. Loan Trajectory"]
        V3["VIS-3: SASRA Aging & Provision Matrix"]
        R1["RPT-1: Statement of Financial Position"]
    end

    subgraph Sprint_Next ["Active Sprint Focus (Top Priority)"]
        R2["RPT-2: Statement of Comprehensive Income<br>(Profit & Loss / P&L - P0)"]
        R4["RPT-4: Official AGM & Bank Audit Pack<br>(PDF Letterhead & CSV Export - P1)"]
    end

    subgraph Sprint_Follow_Up ["Follow-up Sprint (P1 Priorities)"]
        G1["GOV-1: Multi-Signature Dual-Officer Loan Approval"]
        M2["MIG-2: Equity Bank Statement Ingestion"]
        C1["COM-1: Automated WhatsApp/Email Receipts"]
    end

    subgraph Future_Enhancements ["Deferred & Backlog Enhancements (P2 Priorities)"]
        U2["UI-2: Member Loan Application Workflow<br>(Deferred by User)"]
        R3["RPT-3: Statement of Changes in Equity"]
        U3["UI-3: Column Sorting & Filter Presets"]
        C2["COM-2: Monthly Member Statements Dispatch"]
        M3["MIG-3: Legacy Workbook Ingestion"]
        S1["SEC-1: Tamper-Evident Ledger Hashing"]
    end

    F2 & V3 --> R1
    R1 --> R2
    R1 & R2 --> R4
    U2 -.-> G1
    R2 --> C2
    C1 --> C2
```

---

## 5. Scrum Master Operating Rules
1. **Single Source of Truth:** Any new feature request or bug must be assigned a unique Task ID and recorded in `BACKLOG.md` before implementation begins.
2. **Definition of Done (DoD):** A task is only marked `[DONE]` when:
   - Specialist agent has implemented code.
   - Automated Node syntax and VM tests pass (`15/15 PASS`).
   - `@sentinel` issues `SECURITY_CLEARANCE: PASS`.
   - `@shipper` commits code and deploys to Google Apps Script.
   - Release is recorded in `RELEASES.md` and `SYSTEM_CONTRACT.md`.
3. **Transparency:** Whenever the user asks "what are we working on?" or "what remains?", `@scrum` provides the exact burndown from this ledger.
