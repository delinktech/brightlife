# Bright Life SHG — Executive Treasury, Financial OS & Member Portal

[![Release v1.0.0](https://img.shields.io/badge/Release-v1.0.0-0284c7.svg)](https://github.com/delinktech/brightlife)
[![Google Apps Script](https://img.shields.io/badge/Engine-Google%20Apps%20Script-34A853.svg)](https://developers.google.com/apps-script)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Cloud%20Monolith-0F2A44.svg)](#system-architecture)
[![License: Private](https://img.shields.io/badge/License-Proprietary-slate.svg)](#license)

**Bright Life Self Help Group (SHG) Financial OS** is an institutional-grade financial operations management platform, actuarial reporting engine, and member portal engineered for savings and credit cooperative self-help groups.

Built on an event-driven **Google Apps Script** serverless architecture with **Google Sheets** serving as the core transactional ledger, the system features a responsive, role-gated Single Page Application (SPA) styled with **Tailwind CSS**, interactive actuarial data visualizations powered by **Chart.js**, and an automated CI/CD deployment pipeline via **GitHub Pages** and **GitHub Actions**.

---

## Table of Contents

1. [Executive Summary & Core Capabilities](#executive-summary--core-capabilities)
2. [System Architecture](#system-architecture)
3. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
4. [Functional Modules](#functional-modules)
5. [Database Schema (Google Sheets Ledger)](#database-schema-google-sheets-ledger)
6. [Deployment & DevOps](#deployment--devops)
   - [Google Apps Script Backend (Clasp)](#google-apps-script-backend-clasp)
   - [GitHub Pages Gateway & Custom Domain](#github-pages-gateway--custom-domain)
7. [Automated Testing & Verification](#automated-testing--verification)
8. [License & Governance](#license--governance)

---

## Executive Summary & Core Capabilities

- **Institutional Treasury & SASRA Prudential Monitoring**: Real-time solvency tracking, Capital Utilization Rate, Idle Capital Buffer, SASRA 85% statutory leverage boundary, Portfolio at Risk (PAR 30, PAR 90+), Recovery Rate, and return telemetry (ROE, ROA).
- **Multi-Account Reconciliation**: Synchronized ledger tracking liquid cash, commercial bank accounts (e.g., Equity Bank), money market funds (CIC Group), and tangible development projects.
- **Credit Book & Loan Management**: End-to-end loan application intake, multi-guarantor approval workflows, automated amortization schedules, repayment processing, and provision tracking.
- **Member Self-Service & Digital Passbook**: Personalized statements, year-to-date contribution tracking, dividend allocation breakdowns, and downloadable audit-ready PDF packs.
- **Automated Communication & Statement Delivery**: Server-side triggers dispatch monthly account statements and email receipts to members with configurable notification schedules stored directly in the database.
- **Enterprise Security & Immutable Audit Trail**: All privileged administrative mutations generate append-only audit entries recording actor email, entity identifier, action type, timestamp, and detailed context.

---

## System Architecture

The codebase follows a clean, decoupled modular structure designed for Google Apps Script execution constraints:

```
group-dashboard/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml      # Automated GitHub Actions workflow for GitHub Pages
├── dashboard/
│   ├── .nojekyll                 # Bypasses Jekyll parsing on GitHub Pages
│   └── index.html                # Custom domain portal wrapper with Google banner masking
├── docs/
│   ├── ROADMAP.md                # System roadmap, backlog, and release history
│   └── Brightlife SHG...pdf      # Architectural and actuarial specification documentation
├── src/
│   ├── appsscript.json           # Manifest defining OAuth scopes and web app runtime
│   ├── client/
│   │   ├── scripts/              # Client-side domain controllers (*.ui.js.html)
│   │   │   ├── accounts.ui.js.html
│   │   │   ├── app.ui.js.html    # Core SPA routing, theme engine & session state
│   │   │   ├── contributions.ui.js.html
│   │   │   ├── dividends.ui.js.html
│   │   │   ├── investments.ui.js.html
│   │   │   ├── loans.ui.js.html
│   │   │   ├── members.ui.js.html
│   │   │   ├── myfinancials.ui.js.html
│   │   │   ├── print.ui.js.html
│   │   │   ├── roles.ui.js.html
│   │   │   ├── settings.ui.js.html
│   │   │   └── statements.ui.js.html
│   │   └── views/                # Reusable HTML subviews and components
│   │       ├── Accounts.html
│   │       ├── Contributions.html
│   │       ├── Dividends.html
│   │       ├── Home.html         # Executive Treasury & Analytics overview
│   │       ├── Index.html        # Main SPA shell, responsive sidebar & top navbar
│   │       ├── Investments.html
│   │       ├── Loans.html
│   │       ├── Members.html
│   │       ├── MyFinancials.html
│   │       ├── PrintReportModal.html
│   │       ├── Roles.html
│   │       ├── Settings.html
│   │       └── Statements.html
│   ├── comms/
│   │   └── notifications.service.js # Automated email dispatch & scheduled triggers
│   ├── migration/                # Financial ledger backfills & schema synchronization
│   │   ├── cic.backfill.service.js
│   │   ├── equity.backfill.service.js
│   │   └── loan.form.migration.js
│   └── server/                   # Backend micro-services (*.service.js)
│       ├── accounts.service.js
│       ├── app.main.js           # Entry point (doGet & template include router)
│       ├── audit.service.js      # Append-only audit logging engine
│       ├── auth.service.js       # RBAC authorization and permission verification
│       ├── config.constants.js   # Global configuration, sheet names & versioning
│       ├── context.service.js
│       ├── contributions.service.js
│       ├── dashboard.service.js  # Actuarial telemetry & executive aggregation
│       ├── dividend.service.js
│       ├── investments.service.js
│       ├── loans.service.js
│       ├── members.service.js
│       ├── personal.service.js
│       ├── projects.service.js
│       └── session.service.js    # Identity verification & profile hydration
└── tests/
    └── verify-ana1-frontend-ui.js # Automated regression suite for DOM integrity & charts
```

---

## Role-Based Access Control (RBAC)

Access is strictly enforced on both client (UI gating via `data-require-perm` attributes) and server (via `requirePermission_` in `auth.service.js`):

| Role | Badge Styling | Permitted Domains & Responsibilities |
| :--- | :--- | :--- |
| **Admin** | `bg-sky-50 text-sky-700` (Light)<br>`bg-sky-950 text-sky-300` (Dark) | **Full System Authority**: User role assignment, global policy settings, interest rate thresholds, notification schedule management, full audit inspection. |
| **Treasurer** | `bg-purple-50 text-purple-700` (Light)<br>`bg-purple-950 text-purple-300` (Dark) | **Financial Operations**: Contribution ledger entries, loan disbursement and repayment recording, bank reconciliation, investment portfolio adjustments. |
| **Secretary** | `bg-emerald-50 text-emerald-700` (Light)<br>`bg-emerald-950 text-emerald-300` (Dark) | **Registry & Intake**: Member onboarding, digital KYC management, loan application review and guarantor intake processing. |
| **Member** | `bg-slate-100 text-slate-700` (Light)<br>`bg-slate-800 text-slate-300` (Dark) | **Personal Financial Portal**: Personal savings passbook, loan statements, dividend breakdown, loan application submission, and group aggregate statistics. |

---

## Functional Modules

### 1. Executive Treasury & Actuarial Telemetry (`Home.html`)
- **Key Performance Indicators**: Total Savings Pool, Active Loan Capital, Repayment Recovery Rate, Outstanding Balances.
- **Actuarial Risk Micro-Strip**: Return on Equity (ROE), Return on Assets (ROA), Liquidity Ratio (benchmark $\ge 15\%$), and Portfolio at Risk (PAR 30 and PAR 90+).
- **Capital Trajectory**: 12-Month capital mobilization trend plotted against the SASRA 85% statutory leverage cap.
- **Dynamic Asset Allocation**: Interactive toggle alternating between asset distribution (Liquid, Loans, Projects) and institutional account balances (Equity Bank, CIC Group, M-Pesa Floats).

### 2. Credit Book & Loan Management (`Loans.html`)
- Loan application submission with automatic guarantor checks and balance verifications.
- Multi-tier loan status lifecycle: `Pending Review` $\rightarrow$ `Approved` $\rightarrow$ `Disbursed` $\rightarrow$ `Servicing` $\rightarrow$ `Cleared` / `Defaulted`.
- Built-in amortization calculator computing reducing balance and flat rate schedules with actuarial accuracy.

### 3. Contributions & Savings Engine (`Contributions.html`)
- Batch posting and automated calculation of monthly member contributions.
- Automatic tracking of arrears, penalties, and welfare allocations.
- Historical contribution search, filtering by member ID, date range, or payment mode.

### 4. Automated Communications & Notifications (`notifications.service.js`)
- Server-side cron triggers generating monthly account statements and email delivery.
- Bi-directional schedule synchronization: Automated statement day and delivery preferences are synchronized directly between Google Apps Script `PropertiesService` and the `Constants` sheet.

---

## Database Schema (Google Sheets Ledger)

The backend utilizes structured Google Sheets tabs as an append-safe database:

| Tab Name | Purpose & Primary Columns |
| :--- | :--- |
| **`Members`** | Member roster: `MemberId`, `Full Name`, `Email`, `Phone`, `Status`, `JoinedDate`, `TotalSavings`, `ActiveLoans`. |
| **`Contributions`** | Contribution ledger: `Date`, `MemberId`, `Amount`, `Type` (Savings, Welfare, Fine), `Reference`, `RecordedBy`. |
| **`Loans`** | Credit book: `LoanId`, `MemberId`, `Principal`, `InterestRate`, `DurationMonths`, `Balance`, `Status`, `IssuedDate`. |
| **`Roles`** | Access control: `Email`, `Name`, `Role` (`admin`, `treasurer`, `secretary`, `member`), `Active`. |
| **`Accounts`** | Institution balances: `AccountId`, `Institution`, `AccountType`, `Balance`, `LastReconciled`. |
| **`Investments`** | Strategic assets: `InvestmentId`, `Name`, `AssetClass`, `PrincipalInvested`, `CurrentValue`. |
| **`InvestmentLedger`** | Investment cash flows: `Date`, `InvestmentId`, `FlowType`, `Amount`, `Description`. |
| **`Guarantors`** | Loan security records: `LoanId`, `GuarantorMemberId`, `AmountGuaranteed`, `ApprovalStatus`. |
| **`Constants`** | System settings & triggers: `Parameter`, `Value`, `Description`, `LastUpdated`. |
| **`AuditLog`** | Immutable audit trail: `Timestamp`, `ActorEmail`, `Action`, `Entity`, `EntityId`, `Summary`, `Details`. |

---

## Deployment & DevOps

### Google Apps Script Backend (Clasp)

The backend runs as a Google Apps Script Web App authorized to execute in the user's Google context (`executeAs: USER_ACCESSING`).

1. **Prerequisites**:
   - Node.js (v18+)
   - Google Clasp CLI (`npm install -g @google/clasp`)
   - Authenticated with Google Apps Script: `clasp login`

2. **Syncing Code to Google Apps Script**:
   ```bash
   cd group-dashboard
   clasp push --force
   ```

3. **Deploying a Release Version**:
   ```bash
   # Create a versioned snapshot
   clasp version "Release v153: Production deployment"

   # Deploy to the production deployment ID
   clasp deploy --deploymentId <PRODUCTION_DEPLOYMENT_ID> --versionNumber <VERSION_NUMBER> --description "Release v153"
   ```

### GitHub Pages Gateway & Custom Domain

To deliver a polished web portal without Google Apps Script's top warning banner, the portal wrapper in `/dashboard` embeds the Web App inside a responsive, security-hardened container.

- **CI/CD Workflow**: [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) automates deployment directly from `/dashboard` on every push to `master`.
- **Enabling GitHub Pages**:
  1. Open the repository on GitHub: `https://github.com/delinktech/brightlife`
  2. Navigate to **Settings** $\rightarrow$ **Pages**.
  3. Under **Build and deployment** $\rightarrow$ **Source**, choose **GitHub Actions**.
  4. The site will be published at `https://delinktech.github.io/brightlife/` (or your mapped custom domain).

---

## Automated Testing & Verification

The project includes an automated frontend verification suite validating DOM hierarchy, Chart.js canvas lifecycle, and responsive breakpoints:

```bash
node tests/verify-ana1-frontend-ui.js
```

**Verification Checklist (24/24 Checks Passing):**
- [x] Tag closure and DOM nesting validation (0 rogue or orphaned tags).
- [x] Subview layout isolation (Overview, Analytics, Reports tabs render independently).
- [x] Responsive layout and truncate guards on mobile/tablet viewports.
- [x] Asset Allocation & Account Balance Chart.js canvas state toggling.
- [x] Actuarial micro-strip typography and badge responsiveness.

---

## License & Governance

Copyright &copy; 2026 Bright Life Self Help Group (SHG). All rights reserved.  
Maintained by Delink Technologies (`delinktech`).
