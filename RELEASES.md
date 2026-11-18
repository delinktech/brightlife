# Release Ledger
Maintained by `@shipper`

| Version | Clasp Deployment ID | Date | Summary |
| :--- | :--- | :--- | :--- |
| **v90** | *(Pending deployment)* | 2026-11-18 | **Standard Folder Structure Migration**: Moved all code to `src/` (`server/`, `comms/`, `migration/`, `client/views/`, `client/scripts/`), configured `.clasp.json` (`rootDir: "./src"`), updated `.claspignore`, removed legacy `xindex.html`, added path-agnostic view/script loader in `app.main.js`. |
| **v89** | `AKfycbyng6Zhc-DbvzXsc8y29wFXu_6JGCKuqxqFtyxoTCSCsBvPcy7UhSQFPUIgPZ_iZfC50w` | 2026-11-18 | **Fixer Agent**: Implemented `getAccountsReconciliationData` RPC server method, verified via `?testReconciliation=1`. |
| **v88** | `AKfycbyY5IObcV5Smc1F2bhp87apwiGIritoXcKXzRX8OwEsDOktRQoS7tsmUdzO9VSjgVyg6w` | 2026-11-18 | Initial RPC implementation of `getAccountsReconciliationData`. |
| **v87** | `AKfycbw6A8Z-cBidVc_A9pIFaW2atsK5sjEjYfRLWkCZVgs5v5gY0LJLJpiiLzDauuDY_5PwyQ` | 2026-11-18 | **Brightlife Archivist**: Ingested full 138-tx CIC MMF statement (May 2021 – Jul 2026), created `CIC Transactions` sheet and populated `Fund Statements`. |
| **v86** | `AKfycbwfrAsNMp8kP44OJ0WVHr4td3BQZFTLpllUvjdejlsoDlaJButtQFSu5pl07LZ_YWNLEw` | 2026-11-17 | Direct sheet column references on `Members` (`Contributions!$D:$D`, etc.) resolving formula errors. |
