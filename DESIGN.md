# Brightlife SHG — UI/UX Design System (`DESIGN.md`)

**Single Source of Truth** for Brightlife Self-Help Group's Executive Financial Dashboard (`src/client/views/*.html` and `src/client/scripts/*.html`).  
Every view, component, modal, table, and interactive control must adhere to this system in both **Light Mode** (`html.light`) and **Dark Mode** (`html.dark`).

---

## 1. Color Palette & Light/Dark Theme Tokens

Theme switching is class-based (`tailwind.config = { darkMode: 'class' }`) and persisted via `localStorage.getItem('bl_theme')` (`light` | `dark` | `system`), applied before first paint in `Index.html`.

### Surface & Canvas Hierarchy
| Role | Light Mode | Dark Mode |
|---|---|---|
| **App Canvas (`<body>`)** | `bg-slate-50/70` | `dark:bg-[#020617]` |
| **Sidebar (`tailwind.config` `sidebar`)** | `#090d16` (`border: #1e293b`, `foreground: #94a3b8`, `active: #f8fafc`) | `#090d16` |
| **Card / Panel / Modal Surface** | `bg-white` | `dark:bg-[#0b1320]` |
| **Modal / Popover Header Surface** | `bg-white` | `dark:bg-[#090d16]` |
| **Subtle Inset / Table Header / Input** | `bg-slate-50` / `bg-slate-50/70` / `bg-slate-100` | `dark:bg-slate-900` / `dark:bg-slate-900/60` |
| **Backdrop Overlay** | `bg-slate-900/60` / `bg-slate-950/60` `backdrop-blur-sm` | `dark:bg-slate-950/80` `backdrop-blur-sm` |

### Borders & Dividers
| Role | Light Mode | Dark Mode |
|---|---|---|
| **Card / Modal Border** | `border-slate-200` | `dark:border-slate-700/80` |
| **Input / Button / Dropdown Border** | `border-slate-200` | `dark:border-slate-700` |
| **Internal Divider / Table Row** | `border-slate-100` / `divide-slate-100` | `dark:border-slate-800` / `dark:divide-slate-800` |

### Text Hierarchy
| Role | Light Mode | Dark Mode |
|---|---|---|
| **Primary Heading / Value** | `text-slate-900` | `dark:text-white` / `dark:text-slate-100` |
| **Body / Secondary Copy** | `text-slate-600` / `text-slate-700` | `dark:text-slate-300` / `dark:text-slate-200` |
| **Muted / Subtitle / Micro-label** | `text-slate-500` | `dark:text-slate-400` |
| **Placeholder / Disabled Icon** | `text-slate-400` | `dark:text-slate-500` |

### Brand & Semantic Accents
| Semantic Role | Light Mode | Dark Mode | Usage |
|---|---|---|---|
| **Institutional Deep Forest Teal** | `#004D40` / `emerald-700` | `emerald-400` / `emerald-500` | Certified email/receipt accents, positive yield figures, active/approved pills |
| **Institutional Navy** | `#0F2A44` / `slate-900` | `slate-100` | Executive branding & high-contrast primary actions |
| **Success / Active / Healthy** | `bg-emerald-50 text-emerald-700 border-emerald-200` | `dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60` | Positive balances, active status, WhatsApp/Email row actions |
| **Warning / Pending / Tight** | `bg-amber-50 text-amber-700 border-amber-200` | `dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60` | Pending approvals, missing phone badges, loan balances |
| **Danger / Arrears / Destructive** | `bg-rose-50 text-rose-700 border-rose-200` | `dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60` | Overdue/arrears, missing email badges, destructive actions |
| **Info / Planning** | `bg-sky-50 text-sky-700 border-sky-200` | `dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-500/30` | Informational badges, chart highlights, Flatpickr `today` ring |

---

## 2. Button Hierarchy (Light & Dark Mode)

All interactive buttons must include `transition-colors`, `whitespace-nowrap` (for toolbar/action labels), and meet minimum touch targets:
- **Desktop:** `min-h-[38px]`
- **Mobile-first / Modal footers:** `min-h-[44px] sm:min-h-[38px]`

### Primary Action (Canonical)
Used for page header primary CTAs (`Notification Settings`, `Record Fund Statement`), bulk dispatch (`Email Statements (0)`), modal primary submit/confirm (`Send Email`, `Send Now`, `Save Settings`, `Apply Range`), and `#blg-confirm-modal` default/`info` actions:
```html
bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-semibold rounded-lg shadow-sm transition-colors
```

### Secondary / Outline Button
Used for `Refresh`, `Print`, `Cancel`, and pagination `Previous` / `Next` controls:
```html
bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-colors
```

### Ghost / Icon Button
Used for modal close (`×`) and table/card icon triggers:
```html
min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded-lg transition-colors
```

### Destructive Action
Used for irreversible deletions, rejections, or high-risk confirmations (`iconType: "danger"` in `showConfirmDialog`):
```html
bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors
```

### Disabled State
Always pair the native `disabled` attribute with explicit disabled utility classes so non-actionable controls cannot fire RPCs:
```html
disabled:opacity-45 disabled:cursor-not-allowed
```

---

## 3. Typography & Financial Number Formatting

- **Primary Sans Font:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (antialiased).
- **Monospace / Financial Font:** `'JetBrains Mono', monospace` via `.font-mono`, which enforces `font-variant-numeric: tabular-nums`.
- **Tabular Alignment:** Every currency figure, percentage, count, date, and pagination indicator (`Showing 1–20 of 45`) must use `tabular-nums` (and `font-mono` for financial amounts/IDs).
- **Currency Formatting:** Prefix all Kenyan Shilling amounts with **`KES`** (e.g., `KES 150,000`), rounded cleanly in summary KPIs/tables (`formatKshStmt`) or exact 2-decimal precision where accounting detail requires it. Right-align all numeric currency columns (`text-right font-mono tabular-nums`).
- **Heading & Micro-Label Scale:**
  - **Page Title (`<h2>`):** `text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight`
  - **Page Subtitle:** `text-xs text-slate-500 dark:text-slate-400 mt-0.5`
  - **Section / Modal Title:** `text-sm font-bold text-slate-900 dark:text-white`
  - **KPI / Table Header Micro-Labels:** `text-[10px]` or `text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400`

---

## 4. Layout & Component Patterns

### Page Header & Action Bar
- Flex container: `flex flex-col sm:flex-row sm:items-center justify-between gap-3`.
- Left: Page `<h2>`, optional single status pill, and 1-line description.
- Right: Single canonical placement for `Refresh` (Secondary/Outline) and the page's primary CTA (Primary Action). **Never** duplicate Settings or Refresh buttons inside KPI cards or sub-toolbars.

### 4-Card KPI Summary Ribbon
- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4` (or `grid-cols-2 lg:grid-cols-4` on compact views).
- Card shell: `bg-white dark:bg-[#0b1320] rounded-xl border border-slate-200 dark:border-slate-700/80 p-4 shadow-sm`.
- Top row: Uppercase tracking-wider label on left + uniform static icon badge (`p-2` or `w-7 h-7 rounded-lg`) on right.
- Middle: `text-lg sm:text-xl font-bold font-mono tabular-nums`.
- Bottom: `text-[11px]` contextual subtext.

### Data Tables, Pagination & Skeletons
- **Wrapper:** `overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800`.
- **Header (`<thead>`):** `bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider`.
- **Rows (`<tbody>`):** `divide-y divide-slate-100 dark:divide-slate-800 text-[11px]` with `hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors`.
- **Pagination Footer:** Default page size is **20 rows** (`pageSize: 20`). Footer bar uses `px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs` with `Showing X–Y of Z`, `Previous`, `Page A of B` (`font-mono tabular-nums`), and `Next`.
- **Loading Skeletons:** Use `renderCardSkeleton(count)` and `renderTableSkeleton(columns, rows)` from `app.ui.js.html` backed by `.skeleton-shimmer` (`#f1f5f9`/`#e2e8f0` light, `#0f172a`/`#1e293b` dark).
- **Empty State:** Centered single row (`colspan="N"`) with `py-8 text-center text-slate-500 dark:text-slate-400`.

### Custom Popovers, Period Selectors & Flatpickr
- Avoid bare native `<select>` elements where custom rich UI is needed; when using native `<select>`, `Index.html` applies `appearance: none` with a single SVG chevron. Never stack a custom FontAwesome chevron over a visible native `<select>` arrow.
- **Period / Date Range Popover (`#stmt-period-popover`):** Trigger button (`min-h-[38px]`) displays calendar icon + uppercase `Period` micro-label + active label + single rotating `fa-chevron-down`.
- **Active vs. Inactive Preset Buttons:** Always replace the full `className` when toggling active state so light-mode hover classes never collide:
  - **Active:** `bg-slate-900 hover:bg-slate-800 text-white border-slate-900 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 dark:border-slate-100`
  - **Inactive:** `bg-white hover:bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-200 dark:border-slate-700`
- **Flatpickr:** Styled globally in `Index.html` for both light and dark modes (`.flatpickr-calendar` renders in `document.body`; popover click-outside handlers must ignore clicks inside `.flatpickr-calendar`).

### Modals (`#blg-confirm-modal` & Feature Modals)
- **Backdrop:** `fixed inset-0 z-50` (or `z-[60]` for `#blg-confirm-modal`) `bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto`.
- **Dialog Card:** `bg-white dark:bg-[#0b1320] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/80 w-full max-w-md` (or `max-w-2xl` for statement preview) `max-h-[90vh] overflow-y-auto my-auto`.
- **Executive Header:** `bg-white dark:bg-[#090d16] px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3` with a `w-10 h-10 rounded-xl` semantic icon box, truncated title/subtitle, and `min-w-[38px] min-h-[38px]` close button.
- **Confirmation Modal (`showConfirmDialog`):** Supports `iconType`:
  - `info` (default): `bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200` + standard Primary button.
  - `warning`: `amber` badge + `amber` confirm button.
  - `danger`: `rose` badge + `rose` confirm button (auto-focuses `Cancel` for safety).
  - `success`: `emerald` badge + `emerald` confirm button.

### Semantic Status Pills (`renderStatusPill`)
Use `window.renderStatusPill(status, labelOverride)` in `app.ui.js.html` for consistent `rounded-full text-[11px] font-semibold px-2.5 py-0.5` badges:
- **Emerald:** `active`, `approved`, `disbursed`, `balanced`, `matched`, `surplus`, `completed`, `healthy`, `well capitalized`, `zero arrears`
- **Amber:** `pending`, `under review`, `paused`, `tight liquidity`, `low risk`
- **Rose:** `in arrears`, `arrears`, `deficit`, `rejected`, `defaulted`, `overdue`, `variance`, `elevated arrears`, `capital constrained`
- **Sky:** `planning`, `healthy buffer`
- **Slate (fallback):** All other neutral statuses.

---

## 5. UI/UX Rules & Anti-Patterns

1. **No Browser-Native Dialogs:** Never use `window.alert()`, `window.confirm()`, or `window.prompt()`. Always use `showConfirmDialog()` and `showNotification()`.
2. **No Duplicate Controls:** Keep a single canonical `Notification Settings` / `Refresh` button in the page header; never duplicate settings gears on KPI cards or secondary toolbars.
3. **No Double Chevrons:** Never place a FontAwesome chevron icon over a visible native `<select>` (which already renders an arrow). Use either a styled `<select>` with `appearance: none` OR a hidden `<select>` paired with a custom Tailwind dropdown/popover.
4. **No Hover Collisions on Active Buttons:** Never toggle only `bg-slate-900` on top of `hover:bg-slate-50`—active preset/tab buttons will flash white on hover. Always swap the complete active vs. inactive class string.
5. **No Async `window.open()` After `google.script.run`:** Popup blockers (especially inside Google Apps Script iframes) block `window.open()` inside async callbacks, and `window.open("", "_blank", "noopener,noreferrer")` returns `null` leaving a blank `about:blank` tab. For external launches like WhatsApp (`https://wa.me/...`), render a direct `<a href="..." target="_blank" rel="noopener noreferrer">` or call `window.open()` synchronously with pre-computed data (with a `showNotification(..., { actionUrl })` fallback).
6. **Mandatory External Link Safety:** Validate external URLs (e.g. `isValidWhatsAppUrl_` restricting to `https://wa.me/` and `https://api.whatsapp.com/`), escape all interpolated attributes/text with `escapeHtmlAttr()`, and always include `target="_blank" rel="noopener noreferrer"`.
