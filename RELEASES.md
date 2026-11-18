# Release Ledger
Maintained by `@shipper`

| Release | GAS Build | Deployment ID (Masked) | Git Commit | Channel | Release Date | Summary |
| :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **v92** | `@92` | `AKfycbx4........wRCA` | `b0f9b25` | **Production** | 2026-11-18 | Fixer & Sentinel: Resolved UI freeze with sub-second session bootstrap, People API cache, fail-closed RBAC, and session-gated routing. |
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
