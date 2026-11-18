# Brightlife SHG — System Contract & Shared State
*Updated automatically by specialist sub-agents after schema, RPC, or release changes.*

## 1. Environment & Deployment (`@shipper`)
- **GAS Script ID:** `<INSERT_SCRIPT_ID>`
- **Production Deployment ID:** `<INSERT_PROD_DEPLOYMENT_ID>`
- **Current Live Version:** `v0.1.0` (GAS Version `1`)
- **Timezone:** `Africa/Nairobi`

## 2. Workbook & Tab Schema (`@ledger`)
- **WIP Workbook ID:** `<INSERT_WIP_SHEET_ID>`
- **Legacy Workbook ID:** `<INSERT_LEGACY_SHEET_ID>` *(Read-Only for `@migrator`)*
- **Core Tabs:**
  - `Members`: `Member_ID | Full_Name | Phone_E164 | Email | Role | Status | Join_Date`
  - `Transactions_Log`: `Tx_ID | Date | Member_ID | Type | Amount | Reference | Legacy_Source_Ref | Is_Historical`
  - `Loans`: `Loan_ID | Member_ID | Principal | Interest_Rate | Disbursed_Date | Due_Date | Balance | Status | Is_Historical`
  - `Dashboard_KPIs`: Single-row aggregated metrics (`Total_Savings | Active_Loans | Portfolio_At_Risk | Cash_Balance`)
  - `Comms_Log`: `Log_ID | Timestamp | Member_ID | Channel | Template_Type | Reference_ID | Status | Provider_Msg_ID`

## 3. Active RPC Endpoints (`@fixer`)
- `getDashboardBootstrapData()` -> Returns `{ success: true, data: { user: { id, name, role }, kpis: {...}, recentTx: [...] } }`

## 4. Migration Status (`@migrator`)
- **Last Backfill Batch:** `None`
- **Reconciliation Status:** `Pending`