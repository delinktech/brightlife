# Brightlife SHG Dashboard — Feature Roadmap & Task Tracking

This document maintains the chronological status of completed features, active work items, and pending backlog tasks for the **Brightlife SHG Group Dashboard**.

---

## 1. Completed Tasks

| # | Feature / Improvement | Module / Scope | Status | Date Completed |
|---|---|---|---|---|
| **1** | **Server-Side Caching (`CacheService`)** | `dashboard.service.gs` | **Completed** | Oct 11, 2026 |
| | *5-minute TTL caching for home analytics calculations with auto-invalidation on data updates.* | | | |
| **2** | **In-App Role & Access Management UI** | `Roles.html`, `auth.service.gs` | **Completed** | Oct 11, 2026 |
| | *Admin panel & modal to assign Admin, Treasurer, Secretary, Member roles & toggle user active status.* | | | |
| **4** | **Printable PDF Reports (BLG Letterhead)** | `PrintReportModal.html`, `print.ui.js.html` | **Completed** | Oct 11, 2026 |
| | *Printable PDF statements for Member Financials, Contributions, Loans Portfolio & Accounts with official BLG letterhead.* | | | |

---

## 2. Active Pending Tasks Queue

| # | Task Title | Description & Proposed Scope | Priority | Status |
|---|---|---|---|---|
| **5** | **Interactive Table Filtering & Search** | Add live member text search, date range pickers, and status filters across Members, Contributions, Loans & Accounts tables. | High | **Next Candidate** |
| **6** | **Audit Trail UI Page for Admins** | Dedicated `Audit Log` tab for Admins to view change history from the `BL_AUDIT_LOG` sheet (user actions, timestamps, details). | Medium | Queued |
| **3** | **Kiswahili / English Dual Language Toggle** | Bilingual UI toggle for English & Kiswahili translations across sidebar labels, headers, cards, and modal dialogs. | Low | Queued |

---

## 3. Backlog & Future Proposals

*New feature requests and proposed enhancements can be added here as the application grows.*

- [ ] **Automated M-Pesa Payment Reconciliation**: Matching M-Pesa receipt codes directly with member ledger rows.
- [ ] **Guarantor Shortfall & Risk Warning Alert**: Highlighting members with under-guaranteed active loans.
- [ ] **Investment Dividends & Return Calculator**: Calculating expected ROI payout per active member based on total savings pool.

---

> *Last Updated: 11 October 2026*
