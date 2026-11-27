# Brightlife SHG Dashboard — Feature Roadmap & Task Tracking

This document maintains the chronological status of completed features, active work items, and pending backlog tasks for the **Brightlife SHG Group Dashboard**.

---

## 1. Completed Tasks & Release History

| Release | Feature / Improvement | Module / Scope | Status | Date Completed |
|---|---|---|---|---|
| **v1.0.1** | **Annual Cohort Member Numbering (`BLM-YYNNN`)** | `members.service.js` | **Completed** | Nov 27, 2026 |
| | *Introduced cohort-aware automatic member ID generation format (e.g. BLM-26001, BLM-26002) keyed to registration year.* | | | |
| **v1.0.0** | **Production Baseline: SemVer Standard & Single Source of Truth** | System Core | **Completed** | Nov 27, 2026 |
| | *Established strict SemVer standard (v1.0.0) across backend constant, dynamic client hydration, and deployment pipelines.* | | | |
| **v0.15.3** | **Light Mode Theme Parity & Portal Gateway** | `Index.html`, `app.ui.js.html`, `dashboard/` | **Completed** | Nov 27, 2026 |
| | *Refactored navbar avatar and sidebar role badges for high-contrast light/dark mode parity; deployed automated GitHub Pages gateway pipeline.* | | | |
| **v152** | **Workbook Constants Sync for Statements** | `Constants`, `notifications.service.js` | **Completed** | Nov 27, 2026 |
| | *Bi-directional persistence for automated statement dispatch day, monthly schedules & BCC settings.* | | | |
| **v151** | **Asset Allocation Donut Canvas Isolation** | `Home.html`, `dashboard.service.js` | **Completed** | Nov 27, 2026 |
| | *Fixed Chart.js canvas blowout and blowout clipping across responsive breakpoints.* | | | |
| **v150** | **Responsive View Isolation & DOM Tree Guard** | `Home.html`, `Index.html` | **Completed** | Nov 27, 2026 |
| | *Eliminated subview bleeding between Overview, Analytics, and Reports tabs.* | | | |
| **v149** | **SASRA Prudential Telemetry Strip** | `Home.html`, `dashboard.service.js` | **Completed** | Nov 27, 2026 |
| | *Added SASRA 85% credit leverage boundary, liquidity ratio, PAR 30/90+ and actuarial return metrics (ROE, ROA).* | | | |
| **v148** | **Cryptographic Admin Verification & Security** | `auth.service.js`, `Index.html` | **Completed** | Nov 27, 2026 |
| | *Hardened role authentication and gated administrative maintenance endpoints.* | | | |
| **v147** | **Executive Communication Engine** | `notifications.service.js` | **Completed** | Nov 27, 2026 |
| | *Automated monthly statement generator and email dispatch queue.* | | | |

---

## 2. Active Pending Tasks Queue (ClickUp Synchronized)

The following deliverables have been prioritized and synchronized with the ClickUp project board under the **Backlog & Features** list (`1200460000065096`):

| Task ID | Task Title & Scope | Priority | Assigned Agents | ClickUp Link | Status |
|---|---|---|---|---|---|
| **INT-1** | **Automated M-Pesa C2B SMS Parser & Transaction Matcher**<br>*Modal paste interface with regex parsing, fuzzy member matching, batch review grid, and duplicate fraud prevention.* | **High (P1)** | `@fixer`, `@designer`, `@sentinel`, `@shipper` | [123tzfy1ux1](https://app.clickup.com/t/123tzfy1ux1) | **Ready for Sprint** |
| **SEC-2** | **Guarantor Exposure & Under-Secured Loan Risk Matrix**<br>*Active pledge exposure aggregation, net unencumbered savings guard, visual risk tags, and automatic pledge liberation upon loan payoff.* | **High (P1)** | `@fixer`, `@designer`, `@sentinel`, `@shipper` | [123tzfy1ux2](https://app.clickup.com/t/123tzfy1ux2) | **Ready for Sprint** |
| **DIV-1** | **Annual Surplus Distribution & AGM Dividend Yield Simulator**<br>*Actuarial net profit distribution modeling after 20% statutory reserve, Rule 5.2 loan offset waterfall, and interactive "what-if" planning slider.* | **Medium (P2)** | `@analyst`, `@fixer`, `@designer`, `@sentinel` | [123tzfy1ux3](https://app.clickup.com/t/123tzfy1ux3) | **Ready for Sprint** |
| **OPS-2** | **Automated Google Drive Workbook Snapshot & Backup Trigger**<br>*Time-driven automated weekly/monthly backup cloning to Drive, state hashing, 12-month rolling retention rotation, and Settings health widget.* | **Medium (P2)** | `@fixer`, `@sentinel`, `@shipper` | [123tzfy1ux4](https://app.clickup.com/t/123tzfy1ux4) | **Ready for Sprint** |
| **LOC-1** | **Bilingual Interface Localization (English & Kiswahili)**<br>*Client-side i18n translation matrix (Akiba, Mikopo, Wanachama), zero-reload instantaneous DOM switcher, and persistent user preference.* | **Polish (P3)** | `@designer`, `@sentinel`, `@shipper` | [123tzfy1ux5](https://app.clickup.com/t/123tzfy1ux5) | **Ready for Sprint** |
| **MIG-2** | **Full Financial Reconciliation Audit & Statement Digitization**<br>*Continuous reconciliation audit against historical physical bank statements (standing ingestion awaiting physical PDFs from leadership).* | **High (P1)** | `@migrator`, `@ledger`, `@fixer` | N/A | **Standing Ingestion** |

---

## 3. Backlog & Future Proposals

- [ ] **SMS Gateway Fallback (Africa's Talking)**: Automated SMS notification fallback for members without registered smartphones or WhatsApp access.
- [ ] **Native Mobile Progressive Web App (PWA) Manifest**: Offline caching shell, service workers, and home-screen installability across iOS and Android.
- [ ] **Direct M-Pesa Daraja API Integration**: Webhook receiver for automated real-time C2B payment capture directly into Google Apps Script.

---

## 4. Architectural Evolution: Headless SaaS Migration (Path C Specification)

### Executive Summary
To elevate the Bright Life SHG platform to a commercial-grade, multi-tenant digital banking experience under a verified custom domain (e.g., `https://portal.brightlife.org`), the system architecture is scheduled to migrate from a monolithic Google Apps Script HTML Service container to a **Decoupled Headless Single Page Application (SPA)**.

### Target Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               CLIENT BROWSER                 │
                    │   Custom Domain: https://portal.brightlife.org │
                    └──────────────────────┬───────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
          ┌───────────────────────────┐         ┌───────────────────────────┐
          │  Google Identity Services │         │     Static SPA Client     │
          │  (OAuth 2.0 / One-Tap)    │         │  GitHub Pages / Vercel    │
          │  - Official Google Sign-In│         │  - Tailwind CSS + UI      │
          │  - Returns JWT ID Token   │         │  - Chart.js Visuals       │
          └─────────────┬─────────────┘         └─────────────┬─────────────┘
                        │                                     │
                        │        Signed Bearer ID Token       │
                        └──────────────────┬──────────────────┘
                                           │ HTTPS POST (JSON)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │           HEADLESS APPS SCRIPT API           │
                    │             doPost(e) / doGet(e)             │
                    │  - Verifies Token with Google TokenInfo API │
                    │  - Evaluates Role Permissions via Roles Tab │
                    │  - Dispatches Business Logic to Services     │
                    └──────────────────────┬───────────────────────┘
                                           │ Read / Write
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │            TRANSACTIONAL DATABASE            │
                    │            Google Sheets Ledger             │
                    │  (Members, Contributions, Loans, AuditLog)  │
                    └──────────────────────────────────────────────┘
```

### Strategic Benefits
1. **Permanent Removal of Google Apps Script Warning Banner**: Because `script.google.com` is accessed strictly in the background as an HTTP JSON API (and never rendered directly as a webpage), Google never injects the 38px warning bar.
2. **Permanent Elimination of Iframe 401 Cookie Errors**: The client never loads in a third-party iframe. Authentication uses cryptographically signed Google OAuth ID tokens transmitted in the request header, eliminating cookie-blocking failures.
3. **True Custom Domain**: The entire user journey remains on `https://portal.brightlife.org` from landing, authentication, and report downloads to logout.
4. **Progressive Web App (PWA)**: The headless frontend can be saved to home screens on iOS and Android as a native mobile application.

### Migration Blueprint & Phases

#### Phase 1: Google Cloud Project & OAuth Client Setup
- Register a project in [Google Cloud Console](https://console.cloud.google.com/).
- Configure OAuth Consent Screen with institutional branding and authorized JavaScript origins (`https://delinktech.github.io`, `https://portal.brightlife.org`).
- Generate an OAuth 2.0 Client ID for Google Identity Services.

#### Phase 2: Headless API Gateway (`doPost`)
- Convert `app.main.js` to handle structured JSON requests:
  ```json
  {
    "action": "getDashboardSummary",
    "idToken": "eyJhbGciOiJSUzI1NiIs...",
    "payload": { "range": "year" }
  }
  ```
- Implement `verifyGoogleToken_(idToken)` using Google's public tokeninfo endpoint (`https://oauth2.googleapis.com/tokeninfo?id_token=...`).
- Route authorized actions to existing domain services (`dashboard.service.js`, `loans.service.js`, `members.service.js`).

#### Phase 3: Client Transport Abstraction
- Abstract client data fetching from `google.script.run` into a modular `ApiClient` class:
  ```javascript
  const apiClient = {
    async request(action, payload = {}) {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, idToken: sessionToken, payload })
      });
      return await res.json();
    }
  };
  ```

#### Phase 4: Production Custom Domain Cutover
- Map DNS CNAME `portal.brightlife.org` to GitHub Pages or Cloudflare Pages.
- Enforce HTTPS and verify end-to-end token exchange.

---

> *Last Updated: 27 November 2026 • Bright Life SHG System Architecture*
