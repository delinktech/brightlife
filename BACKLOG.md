# Brightlife SHG — Master Product Backlog & Task Ledger
*Maintained and governed by `@scrum` (Technical Scrum Master & Delivery Orchestrator).*  
*Single Source of Truth for all completed, in-progress, and pending engineering deliverables.*

---

## 1. Executive Sprint Overview

| Metric | Status |
| :--- | :--- |
| **Current Live Release** | **`v147`** (Google Apps Script Build `@148`, deployed `@154`) |
| **Total Tracked Tasks** | **39 Tasks** (Expanded with `ARC-1`–`ARC-6`, `UI-3`–`UI-7`, `COM-3`–`COM-6`, `COM-2`, `RPT-3`, `RPT-5`, `SET-1`, `MIG-3`, `SEC-1`) |
| **Completed & Shipped (`[DONE]`)** | **39 Tasks (100.0%)** |
| **Active In-Flight (`[IN PROGRESS]`)** | **0 Tasks** |
| **Prioritized Backlog (`[BACKLOG]`)** | **0 Tasks** (plus MIG-2 full historical backfill pending statements) |
| **Current Sprint Focus** | Core engineering deliverables complete. Awaiting historical physical bank statements for `MIG-2: Equity Bank Statement Ingestion`. |

---

## 2. Completed Deliverables (Shipped in Production)

| Task ID | Domain | Title & Description | Target Agents | Shipped Release | Date Completed |
| :---: | :---: | :--- | :---: | :---: | :---: |
| **`SEC-1`** | Security & Cryptographic Compliance | **Tamper-Evident Ledger Hashing & Audit Log Retention**: Implemented cryptographic SHA-256 rolling hash chain (`computeAuditEntryHash_`, `sha256Hex_`) starting from `GENESIS_HASH` ("0000...0000"), dynamic 9-column schema migration (`upgradeAuditLogSchemaAndHashChain_`) with batch backfill sealing, tamper-evident append-only logger (`appendAuditLog_`), comprehensive integrity scanner and anomaly pinpoint engine (`verifyAuditLogIntegrity_`, `getAuditIntegrityStatus`, `verifyLedgerIntegrity`), configurable audit retention policy (`getAuditRetentionSettings`, `saveAuditRetentionSettings`), archival engine (`archiveOldAuditLogs_`), and Card 6 UI integration in `Settings.html` & `settings.ui.js.html` with real-time integrity status badge, sealed rows counter, seal hash display/copy, manual on-demand integrity verification, and tamper anomaly warnings. | `@fixer`, `@sentinel`, `@designer` | In-Flight / Next Deploy | 2026-11-24 |
| **`COM-2`** | Member Communications & Financial Intelligence | **End-of-Month Automated Member Statements & Dividend Projections with Settings**: Implemented automated monthly statement dispatch engine (`runAutomatedMonthlyStatementDispatch_`, `dispatchAutomatedMonthlyStatementsNow`) with time-driven triggers (`setupAutomatedStatementTrigger_`, `removeAutomatedStatementTrigger_`), day-of-month scheduling (Day 1–28 at 08:00 Nairobi time), strict month-level idempotency protection, and Treasurer/Admin settings (`autoMonthlyStatements`, `autoStatementDay`, `lastAutoDispatchMonth/Timestamp/Count`). Integrated SASRA/IFRS dividend projection engine (`getGroupDividendProjectionPool_`) calculating qualifying savings weight, 20% statutory reserve deduction, annualized net distributable surplus, projected dividend (KES), annualized ROI yield (%), capital pool share (%), and smart payout priority routing (Rule 5.2 loan offset vs. savings capitalization) in rich responsive dark-mode HTML email and WhatsApp templates. | `@fixer` | **`v147`** (`@148`) | 2026-11-24 |
| **`UI-3`** | UI/UX & Frontend Performance | **Advanced Ledger Multi-Sort & Filter Presets**: Interactive column header sorting (Ascending ➔ Descending ➔ Neutral) across dates, numeric amounts, and alphanumeric labels with dynamic SVG/FontAwesome sort indicators; 1-click segmented filter chip presets (`This Month`, `Savings/Deposits`, `Loan Repayments`, `Unallocated/Suspense`, `Large (≥ KES 10,000)` on Contributions; `Active/Disbursed`, `Overdue/In Arrears`, `Fully Repaid`, `Pending Review` on Loans; `Active Members`, `Borrowers`, `Committee/Officers`, `Inactive/Dormant` on Members) with live record counters; and RFC-4180 formula-injection-safe CSV export (`exportContributionsCSV()`, `exportLoansCSV()`, `exportMembersCSV()`) delivering the active filtered and sorted dataset. | `@designer` | **`v146`** (`@147`) | 2026-11-24 |
| **`RPT-3`** | Financial Reporting & Operations | **Statement of Changes in Equity & Direct Cash Flow Statement**: Added IFRS 4-column Equity Statement (Member Savings, 20% Statutory Reserve, 80% Retained Distributable Surplus, Total Equity with zero-variance balance sheet reconciliation), IAS 7 Direct Method Statement of Cash Flows (Operating, Investing, Financing activities with zero-variance cash reconciliation against bank & liquid accounts), standalone print engines (`openPrintEquityStatementReport()`, `openPrintCashFlowStatementReport()`) with official BLG letterhead (`brightlyfe@gmail.com`) and 3-officer governance sign-offs, AGM Audit Pack expansion to 6 institutional sections, and formula-injection-safe CSV exporters (`exportEquityStatementCSV()`, `exportCashFlowStatementCSV()`). | `@fixer`, `@designer`, `@sentinel` | **`v145`** (`@146`) | 2026-11-24 |
| **`MIG-3`** | Migration & Operations | **One-Time 'Form Loan Requests' Backfill & Google Form Deprecation**: Ingests historical executed loans from authoritative Loans_table preserving exact legacy Loan Ids, normalizes Member IDs (BLM-XX), cross-references Form Loan Requests for guarantor pledges, enforces strict Row 2 spill formula safety, provides safe tab archiving ([ARCHIVED] Form Loan Requests with tab color #94a3b8), logs complete audit trail to Audit Log, and adds admin migration modal to Loans.html. | `@migrator`, `@fixer`, `@sentinel` | **`v144`** (`@145`) | 2026-11-24 |
| **`RPT-5`** | Financial Reporting & Credit Operations | **Individual Loan Statement & Amortization Schedule**: Added print statement action buttons to every loan record in Loans.html, implemented getLoanStatementData server RPC with strict RBAC IDOR isolation, and built openPrintLoanStatement in print.ui.js.html rendering official BLG letterhead, 4-up loan KPI cards, facility parameters matrix, guarantor security schedule, itemized repayment ledger with principal & interest breakdown, double-underlined accounting totals, and Dual-Officer Credit Committee & Treasurer certification block. | `@fixer`, `@designer`, `@sentinel` | **`v143`** (`@144`) | 2026-11-23 |
| **`COM-6`** | Member Communications & Financial Reporting | **Official 1/3-Page Member Contribution Receipt Slip & Email Standardization**: Standardized official group contact email to brightlyfe@gmail.com across all letterheads and print views. Added [Print Receipt Slip] in receiptShareModal and direct row actions on Contributions.html, generating compact 1/3-page A4 payment vouchers with receipt serial (BL-RCP-...), M-Pesa/Bank ref, amount in words (numberToWordsKES), post-payment updated savings and loan debt standing, and Treasury Office stamp block. | `@designer`, `@sentinel` | **`v142`** (`@143`) | 2026-11-23 |
| **`COM-5`** | Member Communications & Financial Reporting | **True Chronological Member Statement Ledger & Treasurer Signoff**: Upgraded openPrintMemberStatement and openPrintPersonalStatement to full chronological financial ledgers (Opening Balance, itemized contributions & repayments with running balances, double-underlined closing balance totals), 4-up executive KPI cards (Savings, Net Unencumbered Free Savings, Active Loan, Guarantor Liability), active loan amortization sub-schedules, and official 'Certified by Treasurer' verification block with unique audit refs. | `@fixer`, `@sentinel` | **`v141`** (`@142`) | 2026-11-23 |
| **`COM-4`** | Communications & UI | **Statements Dispatch Hub Print/PDF Export & Print CSS Hardening**: Added [Print / Save PDF] button inside Statements.html certified preview modal with instant zero-latency export to official BLG letterhead; hardened global print CSS with @page A4 portrait sizing, print-color-adjust: exact, table page-break-inside protection, thead repeating headers, and preserved dark-mode badge contrast; rewired top overview print button on Home.html to open official AGM Audit Pack; updated letterhead contact credentials. | `@designer`, `@sentinel` | **`v140`** (`@141`) | 2026-11-23 |
| **`MIG-2`** | Migration & Audit | **Equity Statement Monthly Summary Schema & Dec 2021 Baseline**: Provisioned canonical 'Equity Statement' tab (`SHEETS.EQUITY_STATEMENT`) with Equity maroon branding, number formatting, and idempotent monthly summary schema. Ingested baseline Dec 2021 statement (Acc 0020164001424, KES 583,423.85 opening, KES 33,750.00 in, KES 40,060.00 out, KES 577,113.85 closing), registered named range EquityStatement_ClosingBalance, and synced Accounts sheet. | `@fixer`, `@sentinel` | **`v139`** (`@140`) | 2026-11-22 |
| **`ARC-6`** | Architecture | **Canonical 'CIC Statement' Tab Standardization**: Unified `SHEETS.CIC_STATEMENT` across all services, retired legacy 'Fund Statements' and 'CIC Transactions' with automated safe in-place migration, updated named ranges and verified zero variance. | `@fixer`, `@sentinel` | **`v138`** (`@139`) | 2026-11-22 |
| **`GOV-1`** | Governance | **Multi-Signature Dual-Officer Loan Approval Workflow**: Implemented institutional maker-checker governance for loan disbursements preventing single-user fraud: Stage 1 Chairperson review (`Pending Review` $\to$ `Reviewed` / `Awaiting 2nd Approval`) with endorsement remarks $\to$ Stage 2 Treasurer authorization (`Reviewed` $\to$ `Approved`) with fund release confirmation, strict anti-fraud server-side separation asserting `reviewerEmail !== authorizerEmail`, atomic guarantor liability locking in `Guarantors` sub-ledger, full rejection workflow with pledge release, dual-officer UI action buttons, and complete audit trail logging in `SHEETS.AUDIT_LOG`. | `@fixer`, `@designer`, `@sentinel` | **`v137`** (`@138`) | 2026-11-20 |
| **`ARC-5`** | Architecture | **Standardized 'BL' Entity ID Architecture**: Standardized institutional 'BL' prefix across all system entity identifiers: loans (`BLLN-YYYYMMDD-001`), members (`BLM-01`), investments (`BLINV-YYYY-01`), capital projects (`BLPRJ-01`), and investment cashflows (`BLICF-YYYYMMDD-XXXXXX`), with backward compatibility and normalization for legacy identifiers (`LN-*`, `MEM-*`, `INV-*`, `PRJ-*`, `CF-*`). | `@sentinel`, `@fixer` | **`v136`** (`@137`) | 2026-11-20 |
| **`UI-2`** | UI/UX & Operations | **Native Dashboard Loan Application Workflow**: Implemented 100% dashboard-native `Apply for Loan` modal in `Loans.html` dynamically reading `SET-1` policy limits (multiplier, interest rate, tenor tiers, min guarantors), live borrower savings & max limit lookup, real-time guarantor unencumbered savings & shortfall tracker, interactive amortization calculator, and atomic submission to `Loans` (`Status = "Pending Review"`) and `Guarantors` with `SHEETS.AUDIT_LOG` entry, `v131`–`v135` polish improvements (incl. `v135` guarantor eligibility fix: unencumbered savings = savings minus pledges), and full `DESIGN.md` Light/Dark parity. | `@designer`, `@fixer`, `@sentinel` | **`v130`–`v135`** (`@131`–`@136`) | 2026-11-19 |
| **`SET-1`** | Configuration & Policy | **Admin Loan Policy & Group Settings Management**: Provisioned dynamic loan policy & tenor-tier tables in `Constants` (`Borrower Savings Multiplier` 2x/3x, `Loan Interest Rate Pct`, `Loan Tenor Tiers`, `Minimum Guarantor Count`), built `Settings.html` with `DESIGN.md` Light/Dark parity (`bg-slate-900` / `dark:bg-slate-100`, `min-h-[38px]`, `tabular-nums`), and exposed RBAC-guarded `getLoanPolicySettings` / `saveLoanPolicySettings` RPCs with `SHEETS.AUDIT_LOG` tracking. | `@ledger`, `@fixer`, `@designer`, `@sentinel` | **`v129`** (`@130`) | 2026-11-19 |
| **`RPT-4`** | Financial | **Official AGM & Bank Audit Export Pack**: One-click generation of the combined institutional Brightlife SHG Annual Financial Pack (Executive PDF combining Balance Sheet `RPT-1`, Income Statement `RPT-2`, and Capital Projects summary with BLG letterhead, verification reference hash, watermark, and confidentiality audit stamps, plus multi-statement RFC-4180 CSV / Excel audit package export), adhering to `bg-slate-900` / `dark:bg-slate-100`, `min-h-[38px]`, and `tabular-nums` design tokens. | `@designer`, `@fixer`, `@sentinel` | **`v128`** (`@129`) | 2026-11-19 |
| **`COM-3`** | Communications | **Institutional Communications Polish, HTML Email Escaping, Statement Preview Parity & WhatsApp Alignment**: Enforced strict HTML escaping on dynamic fields in outgoing HTML emails, ensured Statement Preview modal parity with delivered statements, and aligned WhatsApp message formatting and dispatch templates with institutional standards. | `@messenger`, `@fixer`, `@designer`, `@sentinel` | **`v127`** (`@128`) | 2026-11-19 |
| **`UI-7`** | UI/UX | **Date Period / Range Selector & 1-Click Direct WhatsApp Launch**: Implemented Date Period / Range Selector for flexible statement filtering, enabled 1-Click Direct WhatsApp Launch for member statement delivery, fixed active period preset hover state, and aligned confirm modal buttons to dark/light theme. | `@designer`, `@fixer`, `@sentinel` | **`v124`–`v126`** (`@125`–`@127`) | 2026-11-19 |
| **`UI-6`** | UI/UX | **Statements & Confirm Modal Theme Polish, Period Selector & WhatsApp Action Fix**: Polished Light/Dark institutional theme parity across the Statements view and Confirm Modal, implemented custom Tailwind Period dropdown, dark/light button consistency, and resolved WhatsApp blank tab & action dispatch. | `@designer`, `@fixer`, `@sentinel` | **`v122`–`v123`** (`@123`–`@124`) | 2026-11-19 |
| **`UI-5`** | UI/UX & Backend | **Server CacheService, SheetContext & 20-Row Pagination for Dividends & Statements**: Combined server `CacheService`, request-scoped `SheetContext`, and background prefetch to optimize first-visit load times, and added 20-row default pagination to both the **Verified Fund Statements** table (`Dividends`) and **Members Statement Dispatch** table (`Statements`). | `@fixer`, `@designer`, `@sentinel` | **`v121`** (`@122`) | 2026-11-19 |
| **`UI-4`** | UI/UX | **Unified Client-Side SWR Cache & Zero-Skeleton Tab Navigation**: Implemented unified client-side Stale-While-Revalidate (SWR) caching across `dividends`, `statements`, `contributions`, `loans`, `investments`, `accounts`, and `roles`, serving cached view data immediately on tab switch with background revalidation, zero repeated skeletons, and mutation-based cache invalidation. | `@designer`, `@fixer`, `@sentinel` | **`v120`** (`@121`) | 2026-11-19 |
| **`ARC-4`** | Architecture | **Request-Scoped SheetContext & RPC Optimization Pipeline**: Implemented request-scoped `SheetContext` (`server/context.service.js`) batching and lazily caching open sheet instances and multi-range reads per HTTP execution across `apiGetDashboardData` and `apiGetReportsData`, cutting dashboard/report load roundtrips to <= 8 optimized reads with metadata-driven column header resolution. | `@fixer`, `@sentinel` | **`v119`** (`@120`) | 2026-11-19 |
| **`ARC-3`** | Architecture | **Google Sheets Formula Offloading & Materialized View (`Summary KPIs`)**: Deprecated per-row formula injections in `Contributions` and `Members`; installed Row 2 spill formulas (`MAP`, `LAMBDA`, `SUMIFS`, `XLOOKUP`) with plain Row 1 Native Table headers across `Members`, `Contributions`, `Loans`, `Loan Repayments`, `Guarantors`, `Investments`, and `Investment Projects`; provisioned 15-metric `Summary KPIs` materialized view tab, single-range O(1) read path (`readSummaryKpisSnapshot_`, `getSummaryKpisData`), migrated `InvestmentLedger`, retired `CIC Transactions`, and applied `#0F2A44` Native Tables with immediate-flush typed-column guards. | `@ledger`, `@analyst`, `@fixer` | **`v114`–`v118`** (`@115`–`@119`) | 2026-11-19 |
| **`ARC-2`** | Architecture | **Plug-and-Play 3-Tier Investment & Tangible Capital Venture Engine**: Implemented Tier 1 `Investments` market valuation columns (Units Held, Unit Cost, Current Price, FVTPL Carrying Value), Tier 2 `Investment Projects` register (Bee Keeping, Land, Agribusiness), Tier 3 unified `Investment Cashflows` ledger merged non-destructively with legacy `InvestmentLedger`, RPT-1/RPT-2 valuation & dividend rollups, and idempotent `?setupWorkbook=1` provisioner. | `@ledger`, `@analyst`, `@fixer` | **`v113`** (`@114`) | 2026-11-19 |
| **`ARC-1`** | Architecture | **Institutional Schema Standard & Reference Data Architecture**: Standardized all sheet tab names to Institutional Title Case with Single Spaces, implemented bidirectional backward-compatible alias resolution dictionary in `config.js` (`SHEETS.MEMBERS`, `SHEETS.INVESTMENTS`, etc.), restructured `Constants` sheet into formal reference tables (`Asset_Classes`, `Project_Categories`, `Payment_Channels`, `Statutory_Thresholds`) with dynamic data validation dropdown rules. | `@ledger`, `@migrator`, `@fixer` | **`v112`** (`@113`) | 2026-11-19 |
| **`RPT-2`** | Financial | **Statement of Comprehensive Income (Profit & Loss / P&L)**: Audited IFRS operating performance statement on `Reports` tab with 4-card revenue/surplus ribbon, operating revenue breakdown, investment yields, operating expenses, impairment deduction, net distributable surplus, zero-variance dividend basis, RFC-4180 CSV export, and BLG letterhead print preview. | `@analyst`, `@fixer`, `@designer` | **`v111`** (`@112`) | 2026-11-19 |
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
| **`COM-1`** | Communications | **Automated WhatsApp & Email Transaction Receipts**: Implemented `triggerTransactionReceipt(txData)`, `buildReceiptHtmlEmail_`, and `buildReceiptWhatsAppMessage_` in `src/comms/notifications.service.js`, integrated into `addContribution`, `updateContributionStatus` (`src/server/contributions.service.js`) and `addLoanRepayment`, `updateLoanRepaymentStatus` (`src/server/loans.service.js`), with UI triggers (`shareContributionWhatsApp`, `shareLoanPaymentWhatsApp`) and `v127` (`COM-3`) polish. | `@messenger`, `@fixer` | **`v66`** (polished **`v127`**) | 2026-11-19 |

---

## 3. Prioritized Unworked Backlog (The Road Ahead)

> [!NOTE]
> **COM-2 Shipped in Production (`v147` / `@148`):** End-of-Month Automated Member Statements & Dividend Projections with Settings is complete and live. Next sprint focus is `SEC-1: Tamper-Evident Ledger Hashing & Audit Log Retention` (P2), and awaiting historical bank statements for `MIG-2`.

The remaining prioritized tasks and deferred backfills are categorized below in strict execution priority:

### Tier 2: Governance, Core Loan Workflows & Data Reconciliation (`P1`)

#### 1. `MIG-2: Equity Bank Statement Ingestion & Historical Account Reconciliation`
* **Status:** `[BASELINE DONE - WAITING ON HISTORICAL STATEMENTS]`
* **Priority:** `P1 (High)`
* **Domain:** Migration & Audit (`@migrator` $\to$ `@ledger` $\to$ `@fixer` $\to$ `@sentinel`)
* **Location:** `SHEETS.ACCOUNTS` & `SHEETS.EQUITY_STATEMENT`
* **Objective:** Ingest historical Equity Bank statements into itemized transaction records, reconciling physical bank credits against recorded member contribution dates.
* **Progress / Notes:**
  - **Baseline Complete (`v139` / `@140`):** Canonical 'Equity Statement' tab provisioned with maroon branding, idempotent monthly summary schema, named range `EquityStatement_ClosingBalance`, and baseline Dec 2021 statement ingested and verified.
  - **Pending Full Backfill:** Awaiting delivery of remaining historical monthly bank statements (2022–present) from group leadership to complete historical backfill and reconciliation.
* **Dependencies:** `ARC-1` (Shipped in v112).

---

### Tier 3: Advanced Intelligence, Financial Reporting & Platform Hardening (`P2`)

*All core Tier 3 deliverables (`RPT-1`, `RPT-2`, `RPT-3`, `RPT-4`, `RPT-5`, `SEC-1`) are 100% completed.*

---

## 4. Scrum Sprint Dependency Map

```mermaid
graph TD
    subgraph Shipped_Deliverables ["Shipped in Production (v102 - v147)"]
        F1["FIN-1: Decoupled PAR"]
        F2["FIN-2: Net Liquid Cash"]
        F3["FIN-3: Cashflow Period Feeds"]
        H["UI-HDR: Borderless Header & Sub-Nav"]
        V1["VIS-1: Cash Flow Waterfall"]
        V2["VIS-2: Savings vs. Loan Trajectory"]
        C2["COM-2: Monthly Statements & Dividend Projections"]
        V3["VIS-3: SASRA Aging & Provision Matrix"]
        R1["RPT-1: Statement of Financial Position"]
        R2["RPT-2: Statement of Comprehensive Income"]
        R3["RPT-3: Statement of Changes in Equity & Direct Cash Flow"]
        A1["ARC-1: Schema Standard & Reference Constants"]
        A5["ARC-5: 'BL' Entity ID Standardization"]
        A6["ARC-6: Canonical CIC Statement Standardization"]
        M2B["MIG-2: Equity Statement Schema & Dec 2021 Baseline"]
        U2["UI-2: Native Dashboard Loan Application Workflow"]
        G1["GOV-1: Multi-Signature Dual-Officer Loan Approval"]
        C4["COM-4: Statements Dispatch Hub Print/PDF Export"]
        C5["COM-5: True Chronological Member Statement Ledger"]
        C6["COM-6: Official 1/3-Page Member Contribution Slip"]
        R5["RPT-5: Individual Loan Statement & Amortization Schedule"]
        M3["MIG-3: Form Loan Requests Backfill & Form Deprecation"]
        U3["UI-3: Advanced Ledger Multi-Sort & Filter Presets"]
    end

    subgraph Architectural_Modernization ["Architectural Modernization Sprint (Active Focus)"]
        A2["ARC-2: 3-Tier Investment & Projects Engine<br>(Financial Assets + Tangible Ventures - P0)"]
        A3["ARC-3: Formula Offload & Summary KPIs<br>(Spill Formulas & Materialized View - P0)"]
        A4["ARC-4: Request-Scoped SheetContext<br>(<=8 RPC Reads & Column Mapping - P0)"]
    end

    subgraph Reporting_Capstone ["Reporting Suite Capstone (P0)"]
        R4["RPT-4: Official AGM & Bank Audit Pack<br>(PDF Letterhead & CSV Export)"]
    end

    subgraph Sprint_Follow_Up ["Follow-up Sprint (P1 Priorities)"]
        M2["MIG-2: Equity Historical Statements Backfill<br>(Awaiting Remaining Statements)"]
        C1["COM-1: Automated WhatsApp/Email Receipts"]
    end

    subgraph Future_Enhancements ["Deferred & Backlog Enhancements (P2 Priorities)"]
        S1["SEC-1: Tamper-Evident Ledger Hashing"]
    end

    A1 --> A2
    A1 --> A3
    A1 & A3 --> A4
    A1 --> A6
    A1 --> M2B
    M2B -.-> M2
    R1 & R2 & A1 & A2 --> R4
    R1 & R2 --> R3
    U2 --> G1
    C4 --> C5
    C1 & C4 --> C6
    U2 & G1 & C4 --> R5
    U2 & G1 --> M3
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
