# Release Ledger
Maintained by `@shipper`

| Release | GAS Build | Deployment ID (Masked) | Git Commit | Channel | Release Date | Summary |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **v109** | `@110` | `AKfycbx4........wRCA` | `97dc786` | **Production** | 2026-11-19 | Fixer, Designer & Sentinel: Task VIS-3 - Implemented SASRA Delinquency Aging Buckets (Performing, Watch, Substandard, Doubtful, Loss) and Loan Loss Provisioning Matrix with interactive drill-down on Analytics tab. |
| **v108** | `@109` | `AKfycbx4........wRCA` | `a9428f3` | Archived | 2026-11-19 | Fixer, Designer & Sentinel: Task VIS-2 - Implemented Savings vs Loan Exposure Trajectory dual-series visualization and 3-card Balance Sheet Leverage Strip (LDR, Liquidity Coverage, Guarantor Coverage) on Analytics tab. |
| **v107** | `@108` | `AKfycbx4........wRCA` | `96d5d56` | Archived | 2026-11-19 | Fixer, Designer & Sentinel: Task VIS-1 - Implemented Cash Flow Waterfall Chart (opening, inflows, outflows, closing) and full Analytics Suite on Group Overview Analytics tab. |
| **v106** | `@107` | `AKfycbx4........wRCA` | `92181e7` | Archived | 2026-11-19 | Designer & Sentinel: Clean borderless Group Overview header and interactive sub-navigation tabs (Overview, Analytics, Reports) with responsive tab switching. |
| **v105** | `@106` | `AKfycbx4........wRCA` | `0702658` | Archived | 2026-11-19 | Fixer & Sentinel: Task FIN-3 - Restored real period cashflow aggregations (totalInflows, totalOutflows, netCashflow, breakdowns) in buildInvestmentHomeCharts_() for Investment Inflows and Operating Outflows cards. |
| **v104** | `@105` | `AKfycbx4........wRCA` | `b48c18a` | Archived | 2026-11-18 | Fixer & Sentinel: Task FIN-2 - Rectified net liquid cash calculation using computeLiquiditySummary_() from verified accounts and fund statements with SASRA liquidity tiering. |
| **v103** | `@104` | `AKfycbx4........wRCA` | `c029dbf` | Archived | 2026-11-18 | Designer & Sentinel: Modal theme purity across all 15 modals - pure light mode headers (`bg-white`, `text-slate-900`) and pure dark mode headers (`dark:bg-[#090d16]`, `dark:text-white`). |
| **v102** | `@103` | `AKfycbx4........wRCA` | `ad17c14` | Archived | 2026-11-18 | Fixer & Sentinel: Task FIN-1 - Decoupled PAR (Portfolio at Risk) from guarantor shortfall and implemented 3-tier delinquency aging (30/60/90+ days past due) with clean mathematical separation. |
| **v101** | `@102` | `AKfycbx4........wRCA` | `74bd537` | Archived | 2026-11-18 | Designer & Sentinel: Complete UI component & theme harmonization across all 15 modals (executive dark top headers), buttons (3-tier hierarchy), and touch targets (min 38-44px). |
| **v100** | `@101` | `AKfycbx4........wRCA` | `9e4d0d4` | Archived | 2026-11-18 | Designer & Sentinel: Milestone Release - Adapted Bank Balance per Records overview card to light mode styling with crisp borders and high-contrast typography. |
| **v99** | `@100` | `AKfycbx4........wRCA` | `8184ee2` | Archived | 2026-11-18 | Designer & Sentinel: Print modal executive full-bleed dark top header pattern matching session modal styling with sky badge and cancel/print actions. |
| **v98** | `@99` | `AKfycbx4........wRCA` | `549946f` | Archived | 2026-11-18 | Designer & Sentinel: Task 1.C Refinements - Full light mode sidebar styling, print report modal dark/light theme alignment, and dynamic reference tag template fix. |
| **v97** | `@98` | `AKfycbx4........wRCA` | `13ae02d` | Archived | 2026-11-18 | Designer & Sentinel: Task 1.C - Unified brand palette (#004D40 teal, #D97706 warm amber, emerald accents), zero-flash CSS variable dark/light mode engine, and semantic status badge mapping across all 22 client views. |
| **v96** | `@97` | `AKfycbx4........wRCA` | `e9460b5` | Archived | 2026-11-18 | Designer & Fixer: Task 1.A - Interactive search, multi-criteria filtering, and 10-records-per-page pagination across all ledgers (Members, Contributions, Loans, Investments, Roles). |
| **v95** | `@96` | `AKfycbx4........wRCA` | `51f9c57` | Archived | 2026-11-18 | Designer & Sentinel: Task 1.B - Shimmer skeleton loaders, in-app confirmation modal (#blg-confirm-modal), zero browser-native alert/confirm/prompt, and inline table error recovery. |
| **v94** | `@95` | `AKfycbx4........wRCA` | `73c2534` | Archived | 2026-11-18 | Designer & Sentinel: Tier 3 Strategic Upgrades (SWR client cache with owner isolation, liquidity & portfolio health cards, personal loan progress & consistency tracker, dynamic mobile bottom bar, and session popover). |
| **v93** | `@93` | `AKfycbxK........3jA` | `2becd28` | Archived | 2026-11-18 | Designer & Sentinel: Implemented Tier 1 UI/UX Quick Wins & Data Truth fixes (rebound Outstanding loans KPI, removed fake fallbacks, wired all print reports, added tabular-nums, fixed colspans and modal scrolling). |
| **v92** | `@92` | `AKfycbx4........wRCA` | `b0f9b25` | Archived | 2026-11-18 | Fixer & Sentinel: Resolved UI freeze with sub-second session bootstrap, People API cache, fail-closed RBAC, and session-gated routing. |
| **v91** | `@91` | `AKfycbws........M5WQ` | `5ece803` | Archived | 2026-11-18 | Sentinel & Fixer: Hardened diagnostic and maintenance query endpoints behind isDiagnosticAuthorized_ RBAC gate. |
| **v90** | `@90` | `AKfycbw3........hWdQ` | `02fb667` | Archived | 2026-11-18 | Standard folder structure migration to `src/` layout with clasp `rootDir`. Removed legacy `xindex.html`. |
| **v89** | `@89` | `AKfycbyn........C50w` | `b170f50` | Archived | 2026-11-18 | Fixer: Implemented `getAccountsReconciliationData` RPC server method. |
| **v88** | `@88` | `AKfycbyY........Vyg6w` | `9f1c94e` | Archived | 2026-11-18 | Fixer: Initial auto-reconciliation RPC server method. |
| **v87** | `@87` | `AKfycbw6........PwyQ` | `11b468a` | Archived | 2026-11-18 | Migrator: Ingested full 138-tx CIC MMF historical statements (May 2021 – Jul 2026). |
| **v86** | `@86` | `AKfycbwf........NLEw` | `281fa7b` | Archived | 2026-11-17 | Ledger: Direct sheet column references for Members & Loans formulas. |
| **v85** | `@85` | `AKfycbyE........RA9Ig` | `e99f572` | Archived | 2026-11-17 | Ledger: Bound named ranges, zero setNumberFormat on Members typed columns. |
| **v84** | `@84` | `AKfycbz2........8nYg` | `75a7c2e` | Archived | 2026-11-17 | Fixer: Formula application directly without clearing table formatting. |
| **v83** | `@83` | `AKfycbxt........lcGQ` | `5c6eb33` | Archived | 2026-11-17 | Ledger: Clear table typed columns and normalize channels. |
| **v82** | `@82` | `AKfycbyT........StSQ` | `014d483` | Archived | 2026-11-17 | Fixer: Protected setNumberFormat and dynamic in-bound ranges. |

---

### Security Note
- Full Deployment IDs and Web App execution URLs are intentionally masked (`xxxxx........xxxx`) in version control to prevent unauthorized endpoint enumeration and quota exhaustion.
- Live deployment management and rollbacks are executed via local authenticated clasp (`clasp deployments` / `clasp undeploy`) or the Google Apps Script Console.
