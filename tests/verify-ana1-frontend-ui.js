/**
 * Verification Test Suite: ANA-1 Executive & Member Dashboard Financial Intelligence & Actuarial UX (Phase 1)
 *
 * Validates:
 * 1. Member Portal (MyFinancials.html & myfinancials.ui.js.html):
 *    - Card 1: Total Savings with Free vs Encumbered/Pledged split badges.
 *    - Credit Reputation Tier Badge: Tier 1/2/3, streak months, and consistency score.
 *    - Card 3 / Capacity: Effective Borrowing Capacity with dynamic policy multiplier & Delinquency Lockout banner.
 *    - Card 4: Projected Year-End Dividend with Bylaws Rule 5.2 dual-stream routing (debt offset vs savings credit).
 *    - Loans Table: Due Date / Maturity column with days countdown / overdue badge, and [Print Statement] button.
 * 2. Executive Overview (Home.html & app.ui.js.html):
 *    - Card 2: Capital Deployment Ratio (CDR) badge with SASRA 85% cap alert.
 *    - Card 4: Granular PAR 30 (Watch) vs PAR 90+ (Non-Performing) split with statutory provisioning coverage.
 *    - Institutional Actuarial Telemetry Micro-Strip: ROE, ROA, and Liquidity Ratio with SASRA floor indicator.
 *    - Charting Taxonomy: Value-weighted SASRA Credit Quality Donut (5 statutory risk tiers) with official palette.
 *    - Chama Asset Allocation Donut: 4 core asset classes (Bank Cash, MMF, Net Loans, Tangible Projects) with toggle.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

let totalChecks = 0;
let passedChecks = 0;

function check(desc, fn) {
  totalChecks++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passedChecks++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         Error: ${err.message}`);
    process.exitCode = 1;
  }
}

const rootDir = path.resolve(__dirname, "..");
const myFinancialsViewPath = path.join(rootDir, "src", "client", "views", "MyFinancials.html");
const myFinancialsUiPath = path.join(rootDir, "src", "client", "scripts", "myfinancials.ui.js.html");
const homeViewPath = path.join(rootDir, "src", "client", "views", "Home.html");
const appUiPath = path.join(rootDir, "src", "client", "scripts", "app.ui.js.html");

const myFinancialsViewHtml = fs.readFileSync(myFinancialsViewPath, "utf8");
const myFinancialsUiRaw = fs.readFileSync(myFinancialsUiPath, "utf8");
const homeViewHtml = fs.readFileSync(homeViewPath, "utf8");
const appUiRaw = fs.readFileSync(appUiPath, "utf8");

console.log("======================================================================");
console.log("=== VERIFICATION TEST SUITE: ANA-1 FRONTEND UI & ACTUARIAL UX     ===");
console.log("======================================================================");

// -----------------------------------------------------------------------------
// SECTION 1: Syntax Validation
// -----------------------------------------------------------------------------
console.log("\n--> Section 1: Template & Script Syntax Validation");

check("myfinancials.ui.js.html script block compiles without syntax error", () => {
  const code = myFinancialsUiRaw.replace(/<\/?script>/g, "");
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: "myfinancials.ui.js.html" });
  });
});

check("app.ui.js.html script block compiles without syntax error", () => {
  const code = appUiRaw.replace(/<\/?script>/g, "");
  assert.doesNotThrow(() => {
    new vm.Script(code, { filename: "app.ui.js.html" });
  });
});

check("Home.html embedded scripts compile without syntax error", () => {
  const scriptMatches = homeViewHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
  assert(scriptMatches.length > 0, "Home.html should contain embedded script blocks");
  scriptMatches.forEach((s, i) => {
    const code = s.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    assert.doesNotThrow(() => {
      new vm.Script(code, { filename: `Home.html_script_${i}` });
    });
  });
});

// -----------------------------------------------------------------------------
// SECTION 2: Member Portal Markup & DOM Requirements (MyFinancials.html)
// -----------------------------------------------------------------------------
console.log("\n--> Section 2: Member Portal Template Elements (MyFinancials.html)");

check("MyFinancials.html contains Card 1 Free vs Pledged Savings sub-pills", () => {
  assert(myFinancialsViewHtml.includes('id="pf-my-savings"'), "Missing pf-my-savings element");
  assert(myFinancialsViewHtml.includes('id="pf-savings-split-container"'), "Missing pf-savings-split-container");
  assert(myFinancialsViewHtml.includes('id="pf-free-savings-badge"'), "Missing pf-free-savings-badge");
  assert(myFinancialsViewHtml.includes('id="pf-free-savings-val"'), "Missing pf-free-savings-val element");
  assert(myFinancialsViewHtml.includes('id="pf-pledged-savings-badge"'), "Missing pf-pledged-savings-badge");
  assert(myFinancialsViewHtml.includes('id="pf-pledged-savings-val"'), "Missing pf-pledged-savings-val element");
});

check("MyFinancials.html contains Credit Reputation Tier, Streak, and Consistency Strip", () => {
  assert(myFinancialsViewHtml.includes('id="pf-credit-reputation-strip"'), "Missing pf-credit-reputation-strip");
  assert(myFinancialsViewHtml.includes('id="pf-credit-tier-badge"'), "Missing pf-credit-tier-badge");
  assert(myFinancialsViewHtml.includes('id="pf-credit-tier-text"'), "Missing pf-credit-tier-text element");
  assert(myFinancialsViewHtml.includes('id="pf-streak-badge"'), "Missing pf-streak-badge");
  assert(myFinancialsViewHtml.includes('id="pf-streak-text"'), "Missing pf-streak-text element");
  assert(myFinancialsViewHtml.includes('id="pf-consistency-badge"'), "Missing pf-consistency-badge");
  assert(myFinancialsViewHtml.includes('id="pf-consistency-text"'), "Missing pf-consistency-text element");
});

check("MyFinancials.html contains Borrowing Capacity card with Delinquency Lockout Banner", () => {
  assert(myFinancialsViewHtml.includes('id="pf-borrowing-capacity"'), "Missing pf-borrowing-capacity");
  assert(myFinancialsViewHtml.includes('id="pf-borrowing-badge"'), "Missing pf-borrowing-badge");
  assert(myFinancialsViewHtml.includes('id="pf-delinquency-lock-banner"'), "Missing pf-delinquency-lock-banner");
  assert(myFinancialsViewHtml.includes('id="pf-delinquency-lock-reason"'), "Missing pf-delinquency-lock-reason");
  const bannerMatch = myFinancialsViewHtml.match(/id="pf-delinquency-lock-banner"[^>]*class="([^"]*)"/);
  assert(bannerMatch && bannerMatch[1].includes("hidden"), "Delinquency banner must be hidden by default");
});

check("MyFinancials.html contains Card 4 Rule 5.2 Dual-Stream Dividend Routing", () => {
  assert(myFinancialsViewHtml.includes('id="pf-my-profit-share"'), "Missing pf-my-profit-share");
  assert(myFinancialsViewHtml.includes('id="pf-dividend-routing-box"'), "Missing pf-dividend-routing-box");
  assert(myFinancialsViewHtml.includes('id="pf-dividend-offset-badge"'), "Missing pf-dividend-offset-badge");
  assert(myFinancialsViewHtml.includes('id="pf-dividend-offset-val"'), "Missing pf-dividend-offset-val");
  assert(myFinancialsViewHtml.includes('id="pf-dividend-reinvest-badge"'), "Missing pf-dividend-reinvest-badge");
  assert(myFinancialsViewHtml.includes('id="pf-dividend-reinvest-val"'), "Missing pf-dividend-reinvest-val");
  assert(myFinancialsViewHtml.includes("Rule 5.2"), "Missing Bylaws Rule 5.2 compliance note");
});

check("MyFinancials.html active loans table includes Due Date / Maturity and Action columns", () => {
  assert(myFinancialsViewHtml.includes("Due Date / Maturity"), "Missing Due Date / Maturity table header");
  assert(myFinancialsViewHtml.includes("Action"), "Missing Action table header");
  assert(myFinancialsViewHtml.includes('colspan="7"'), "Empty state row must span 7 columns");
});

// -----------------------------------------------------------------------------
// SECTION 3: Member Portal Execution & Controller Logic (myfinancials.ui.js.html)
// -----------------------------------------------------------------------------
console.log("\n--> Section 3: Member Portal Controller Logic (myfinancials.ui.js.html)");

function createMockElement(id) {
  return {
    id: id,
    textContent: "",
    innerText: "",
    className: "",
    style: {},
    classList: {
      classes: new Set(),
      add: function (cls) { this.classes.add(cls); },
      remove: function (cls) { this.classes.delete(cls); },
      contains: function (cls) { return this.classes.has(cls); }
    },
    title: "",
    innerHTML: ""
  };
}

function setupMockDom() {
  const elements = {};
  function getOrCreate(id) {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  }
  return {
    elements,
    document: {
      getElementById: (id) => getOrCreate(id),
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null
    }
  };
}

check("renderPersonalFinancials handles performing member with Tier 1 and Dual-Stream Dividend", () => {
  const { elements, document } = setupMockDom();
  const context = {
    document: document,
    window: {},
    console: console,
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    escapePfHtml: (s) => String(s || ""),
    renderStatusPill: (s) => `<span>${s}</span>`,
    openPrintLoanStatement: () => {}
  };

  const code = myFinancialsUiRaw.replace(/<\/?script>/g, "");
  vm.createContext(context);
  vm.runInContext(code, context);

  const mockPerformingData = {
    user: { name: "Alice Wanjiku", memberId: "BLM-001", status: "Active", registrationDate: "15 Jan 2024" },
    personalSummary: {
      savings: 150000,
      savingsFormatted: "KES 150,000",
      freeSavings: 90000,
      freeSavingsFormatted: "KES 90,000",
      encumberedSavings: 60000,
      encumberedSavingsFormatted: "KES 60,000",
      sharesPercentage: "15.00%",
      activeLoanBalance: 50000,
      activeLoanBalanceFormatted: "KES 50,000",
      effectiveBorrowingCapacity: 340000,
      effectiveBorrowingCapacityFormatted: "KES 340,000",
      borrowingMultiplier: 3.0,
      delinquencyLocked: false,
      delinquencyReason: "",
      projectedDividend: 39804,
      projectedDividendFormatted: "KES 39,804",
      dividendLoanOffset: 12000,
      dividendLoanOffsetFormatted: "KES 12,000",
      dividendSavingsReinvest: 27804,
      dividendSavingsReinvestFormatted: "KES 27,804",
      creditTier: "Tier 1: Flawless",
      streakMonths: 11,
      consistencyScore: 92
    },
    loans: [
      {
        id: "LN-001",
        requestedAmountFormatted: "KES 100,000",
        paidFormatted: "KES 50,000",
        balance: 50000,
        balanceFormatted: "KES 50,000",
        dueDateFormatted: "01 Jan 2027",
        daysToMaturity: 37,
        isOverdue: false,
        status: "Active"
      }
    ],
    contributions: []
  };

  context.renderPersonalFinancials(mockPerformingData);

  assert.strictEqual(elements["pf-my-savings"].textContent, "KES 150,000");
  assert.strictEqual(elements["pf-free-savings-val"].textContent, "KES 90,000");
  assert.strictEqual(elements["pf-pledged-savings-val"].textContent, "KES 60,000");
  assert(!elements["pf-pledged-savings-badge"].classList.contains("hidden"), "Pledged badge must be shown when encumbered > 0");

  assert.strictEqual(elements["pf-credit-tier-text"].textContent, "Tier 1: Flawless");
  assert(elements["pf-credit-tier-badge"].className.includes("emerald"), "Tier 1 badge must have emerald styling");
  assert.strictEqual(elements["pf-streak-text"].textContent, "11 Months Streak");
  assert.strictEqual(elements["pf-consistency-text"].textContent, "92% Deposit Consistency");

  assert.strictEqual(elements["pf-borrowing-capacity"].textContent, "KES 340,000");
  assert(elements["pf-delinquency-lock-banner"].classList.contains("hidden"), "Delinquency banner must be hidden for performing member");
  assert(elements["pf-borrowing-badge"].textContent.includes("3.0x"), "Borrowing badge must display multiplier");

  assert.strictEqual(elements["pf-my-profit-share"].textContent, "KES 39,804");
  assert.strictEqual(elements["pf-dividend-offset-val"].textContent, "KES 12,000");
  assert.strictEqual(elements["pf-dividend-reinvest-val"].textContent, "KES 27,804");

  const loansTbodyHtml = elements["pf-loans-tbody"].innerHTML;
  assert(loansTbodyHtml.includes("01 Jan 2027"), "Loans table must contain due date");
  assert(loansTbodyHtml.includes("In 37 days"), "Loans table must contain countdown");
  assert(loansTbodyHtml.includes("openPrintLoanStatement('LN-001')"), "Loans table must contain print action invoking openPrintLoanStatement");
});

check("renderPersonalFinancials handles delinquent member with statutory lock and overdue badge", () => {
  const { elements, document } = setupMockDom();
  const context = {
    document: document,
    window: {},
    console: console,
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    escapePfHtml: (s) => String(s || ""),
    renderStatusPill: (s) => `<span>${s}</span>`,
    openPrintLoanStatement: () => {}
  };

  const code = myFinancialsUiRaw.replace(/<\/?script>/g, "");
  vm.createContext(context);
  vm.runInContext(code, context);

  const mockDelinquentData = {
    user: { name: "Bob Delinquent", memberId: "BLM-002", status: "Active" },
    personalSummary: {
      savings: 50000,
      savingsFormatted: "KES 50,000",
      freeSavings: 50000,
      freeSavingsFormatted: "KES 50,000",
      encumberedSavings: 0,
      encumberedSavingsFormatted: "KES 0",
      activeLoanBalance: 60000,
      activeLoanBalanceFormatted: "KES 60,000",
      effectiveBorrowingCapacity: 0,
      effectiveBorrowingCapacityFormatted: "KES 0",
      borrowingMultiplier: 3.0,
      delinquencyLocked: true,
      delinquencyReason: "Member facility LN-002 is 15 days past due.",
      creditTier: "Tier 3: Attention Required",
      streakMonths: 0,
      consistencyScore: 40
    },
    loans: [
      {
        id: "LN-002",
        requestedAmountFormatted: "KES 60,000",
        paidFormatted: "KES 0",
        balance: 60000,
        balanceFormatted: "KES 60,000",
        dueDateFormatted: "10 Nov 2026",
        daysToMaturity: -15,
        isOverdue: true,
        status: "In Arrears"
      }
    ]
  };

  context.renderPersonalFinancials(mockDelinquentData);

  assert.strictEqual(elements["pf-borrowing-capacity"].textContent, "KES 0");
  assert(!elements["pf-delinquency-lock-banner"].classList.contains("hidden"), "Delinquency banner must be visible when locked");
  assert.strictEqual(elements["pf-delinquency-lock-reason"].textContent, "Member facility LN-002 is 15 days past due.");
  assert(elements["pf-borrowing-badge"].textContent.includes("Delinquency Locked"), "Borrowing badge must show lock status");

  assert(elements["pf-credit-tier-badge"].className.includes("rose"), "Tier 3 badge must have rose styling");
  assert(elements["pf-pledged-savings-badge"].classList.contains("hidden"), "Pledged badge must be hidden when encumbered === 0");

  const loansTbodyHtml = elements["pf-loans-tbody"].innerHTML;
  assert(loansTbodyHtml.includes("15 days overdue"), "Overdue loans must display red warning overdue countdown");
});

// -----------------------------------------------------------------------------
// SECTION 4: Executive Overview Markup & DOM Requirements (Home.html)
// -----------------------------------------------------------------------------
console.log("\n--> Section 4: Executive Overview Template Elements (Home.html)");

check("Home.html contains Card 2 Capital Deployment Ratio (CDR) and SASRA Cap Warning", () => {
  assert(homeViewHtml.includes('id="home-cdr-badge"'), "Missing home-cdr-badge");
  assert(homeViewHtml.includes('id="home-cdr-val"'), "Missing home-cdr-val element");
  assert(homeViewHtml.includes('id="home-cdr-warning"'), "Missing home-cdr-warning element");
  assert(homeViewHtml.includes("85% SASRA Cap"), "Missing 85% SASRA Cap indicator");
});

check("Home.html contains Card 4 PAR 30 vs PAR 90+ split and Statutory Provisioning", () => {
  assert(homeViewHtml.includes('id="home-par30-val"'), "Missing home-par30-val element");
  assert(homeViewHtml.includes('id="home-par90-val"'), "Missing home-par90-val element");
  assert(homeViewHtml.includes('id="home-par-provision-badge"'), "Missing home-par-provision-badge");
  assert(homeViewHtml.includes('id="home-par-provision-val"'), "Missing home-par-provision-val element");
});

check("Home.html contains Profitability & Liquidity Telemetry Micro-Strip", () => {
  assert(homeViewHtml.includes('id="home-actuarial-microstrip"'), "Missing home-actuarial-microstrip");
  assert(homeViewHtml.includes('id="home-roe-badge"'), "Missing home-roe-badge");
  assert(homeViewHtml.includes('id="home-roe-val"'), "Missing home-roe-val element");
  assert(homeViewHtml.includes('id="home-roa-badge"'), "Missing home-roa-badge");
  assert(homeViewHtml.includes('id="home-roa-val"'), "Missing home-roa-val element");
  assert(homeViewHtml.includes('id="home-liquidity-badge"'), "Missing home-liquidity-badge");
  assert(homeViewHtml.includes('id="home-liquidity-val"'), "Missing home-liquidity-val element");
  assert(homeViewHtml.includes("15% SASRA Floor"), "Missing 15% SASRA Floor indicator");
});

check("Home.html contains Upgraded SASRA Credit Quality Donut and Chama Asset Allocation Donut", () => {
  assert(homeViewHtml.includes('id="loanStatusChart"'), "Missing loanStatusChart canvas");
  assert(homeViewHtml.includes("SASRA Credit Quality Distribution"), "Missing SASRA Credit Quality card header");
  assert(homeViewHtml.includes('id="assetAllocationChart"'), "Missing assetAllocationChart canvas");
  assert(homeViewHtml.includes('id="btn-toggle-asset-alloc"'), "Missing btn-toggle-asset-alloc toggle");
  assert(homeViewHtml.includes('id="btn-toggle-acct-bal"'), "Missing btn-toggle-acct-bal toggle");
});

// -----------------------------------------------------------------------------
// SECTION 5: Executive Overview Controller & Charting Logic (app.ui.js.html & Home.html)
// -----------------------------------------------------------------------------
console.log("\n--> Section 5: Executive Overview Controller & Charting Logic");

check("applyDashboardData populates CDR, PAR 30/90, and Actuarial Telemetry Micro-Strip", () => {
  const { elements, document } = setupMockDom();
  let renderedMainChartsCalledWith = null;

  const context = {
    document: document,
    window: {},
    console: console,
    currentHomeRange: "year",
    setInterval: setInterval,
    clearInterval: clearInterval,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    updateRangeButtons: () => {},
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    formatPercent: (v) => (Number(v || 0)).toFixed(1) + "%",
    formatMoneyCompactK: (v) => "KES " + Math.round(Number(v || 0) / 1000) + "K",
    rangeLabel: (r) => r,
    renderContributionMomIndicator: () => {},
    renderMainCharts: (d) => { renderedMainChartsCalledWith = d; }
  };

  const code = appUiRaw.replace(/<\/?script>/g, "");
  vm.createContext(context);
  vm.runInContext(code, context);

  const mockOverviewData = {
    savings: 1000000,
    loans: 300000,
    cdr: 30.0,
    isAboveSasraCap: false,
    par30Ratio: 3.5,
    par90Ratio: 1.2,
    totalRequiredProvision: 13500,
    roe: 9.4,
    roa: 7.8,
    liquidityRatio: 18.5,
    executiveTelemetry: {
      cdr: 30.0,
      isAboveSasraCap: false,
      par30Ratio: 3.5,
      par90Ratio: 1.2,
      totalRequiredProvision: 13500,
      roe: 9.4,
      roa: 7.8,
      liquidityRatio: 18.5
    }
  };

  context.applyDashboardData(mockOverviewData);

  assert.strictEqual(elements["home-cdr-val"].innerText, "30.0%");
  assert(elements["home-cdr-warning"].classList.contains("hidden"), "CDR warning must be hidden when below SASRA cap");
  assert.strictEqual(elements["home-par30-val"].innerText, "3.5%");
  assert.strictEqual(elements["home-par90-val"].innerText, "1.2%");
  assert(elements["home-par-provision-val"].innerText.includes("13,500"), "Provisioning value should contain 13,500");
  assert.strictEqual(elements["home-roe-val"].innerText, "9.4%");
  assert(elements["home-roe-status"].innerText.includes("≥ 8.0%"), "ROE compliant indicator expected");
  assert.strictEqual(elements["home-roa-val"].innerText, "7.8%");
  assert.strictEqual(elements["home-liquidity-val"].innerText, "18.5%");
  assert(elements["home-liquidity-indicator"].innerText.includes("≥ 15%"), "Liquidity compliant indicator expected");
  assert.strictEqual(renderedMainChartsCalledWith, mockOverviewData);
});

check("applyDashboardData shows amber warning when CDR exceeds SASRA 85% statutory cap", () => {
  const { elements, document } = setupMockDom();
  const context = {
    document: document,
    window: {},
    console: console,
    currentHomeRange: "year",
    setInterval: setInterval,
    clearInterval: clearInterval,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    updateRangeButtons: () => {},
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    formatPercent: (v) => (Number(v || 0)).toFixed(1) + "%",
    formatMoneyCompactK: (v) => "KES " + Math.round(Number(v || 0) / 1000) + "K",
    rangeLabel: (r) => r,
    renderContributionMomIndicator: () => {},
    renderMainCharts: () => {}
  };

  const code = appUiRaw.replace(/<\/?script>/g, "");
  vm.createContext(context);
  vm.runInContext(code, context);

  context.applyDashboardData({
    savings: 1000000,
    loans: 900000,
    cdr: 90.0,
    isAboveSasraCap: true,
    liquidityRatio: 12.0
  });

  assert.strictEqual(elements["home-cdr-val"].innerText, "90.0%");
  assert(!elements["home-cdr-warning"].classList.contains("hidden"), "CDR warning must be visible when above 85% cap");
  assert(elements["home-liquidity-indicator"].innerText.includes("< 15%"), "Liquidity shortfall warning expected");
});

check("Home.html renderMainCharts builds SASRA Credit Quality and Chama Asset Allocation donuts", () => {
  const { elements, document } = setupMockDom();
  let createdCharts = {};

  class MockChart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      createdCharts[ctx.id] = this;
    }
    destroy() {}
  }

  const context = {
    document: document,
    window: {},
    console: console,
    Chart: MockChart,
    charts: {},
    getChartThemeTokens: () => ({ tickColor: "#64748b", gridColor: "#e2e8f0" }),
    formatChartKes: (v) => "KES " + Number(v || 0).toLocaleString(),
    formatMoney: (v) => "KES " + Number(v || 0).toLocaleString(),
    setChartEmptyState: () => false,
    renderPortfolioAndLiquidityHealth: () => {},
    renderTopContributors: () => {},
    renderHomeAccountsTable: () => {},
    renderInvestmentCharts: () => {},
    window: {
      renderCashflowWaterfall: () => {},
      renderSavingsExposureTrajectory: () => {},
      renderSasraAging: () => {},
      renderBalanceSheet: () => {},
      renderIncomeStatement: () => {}
    }
  };

  const scriptMatches = homeViewHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
  const scriptCode = scriptMatches[0].replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
  vm.createContext(context);
  vm.runInContext(scriptCode, context);

  const mockAnalyticsData = {
    sasraCreditQuality: {
      amounts: [100000, 20000, 15000, 5000, 0],
      labels: ["Normal (0 DPD)", "Watch (1–30 DPD)", "Substandard (31–60 DPD)", "Doubtful (61–90 DPD)", "Loss (91+ DPD)"],
      total: 140000
    },
    assetAllocation: {
      bankCash: 300000,
      mmfEquivalents: 560000,
      netLoans: 136500,
      tangibleProjects: 900000,
      amounts: [300000, 560000, 136500, 900000],
      labels: ["Liquid Bank Cash", "MMF Equivalents", "Net Loans Receivable", "Tangible Capital Projects"],
      colors: ["#0284c7", "#6366f1", "#10b981", "#f59e0b"]
    }
  };

  context.renderMainCharts(mockAnalyticsData);

  // Verify loanStatusChart upgrade
  const loanChart = createdCharts["loanStatusChart"];
  assert(loanChart, "loanStatusChart should be initialized");
  assert.strictEqual(loanChart.config.type, "doughnut", "loanStatusChart must be configured as a doughnut chart");
  assert.deepStrictEqual(Array.from(loanChart.config.data.datasets[0].data), [100000, 20000, 15000, 5000, 0]);
  assert.deepStrictEqual(
    Array.from(loanChart.config.data.datasets[0].backgroundColor),
    ["#10b981", "#f59e0b", "#fb923c", "#ef4444", "#991b1b"],
    "Official SASRA palette expected on credit quality donut"
  );

  // Verify assetAllocationChart
  const assetChart = createdCharts["assetAllocationChart"];
  assert(assetChart, "assetAllocationChart should be initialized");
  assert.strictEqual(assetChart.config.type, "doughnut", "assetAllocationChart must be a doughnut chart");
  assert.deepStrictEqual(Array.from(assetChart.config.data.datasets[0].data), [300000, 560000, 136500, 900000]);
});

check("toggleHomeMixChart correctly alternates between Assets and Accounts canvases", () => {
  const { elements, document } = setupMockDom();
  const context = {
    document: document,
    window: {}
  };

  const scriptMatches = homeViewHtml.match(/<script[\s\S]*?<\/script>/gi) || [];
  const scriptCode = scriptMatches[0].replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
  vm.createContext(context);
  vm.runInContext(scriptCode, context);

  assert(typeof context.toggleHomeMixChart === "function", "toggleHomeMixChart should be defined");

  // Toggle to accounts
  context.toggleHomeMixChart("accounts");
  assert(elements["assetAllocationChart"].classList.contains("hidden"), "Asset canvas should be hidden in accounts mode");
  assert(!elements["accountBalanceChart"].classList.contains("hidden"), "Accounts canvas should be visible in accounts mode");

  // Toggle back to assets
  context.toggleHomeMixChart("assets");
  assert(!elements["assetAllocationChart"].classList.contains("hidden"), "Asset canvas should be visible in assets mode");
  assert(elements["accountBalanceChart"].classList.contains("hidden"), "Accounts canvas should be hidden in assets mode");
});

// -----------------------------------------------------------------------------
// SECTION 6: UI/UX Responsive Layout & DOM Integrity Regression Suite
// -----------------------------------------------------------------------------
console.log("\n--> Section 6: UI/UX Responsive Layout & DOM Integrity Regressions");

check("Home.html DOM tree has 0 tag nesting / premature closure errors", () => {
  const stripped = homeViewHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const tagRegex = /<\/?([a-zA-Z0-9\-]+)(?:\s+[^>]*?)?(\/?)>/g;
  let match;
  let stack = [];
  const selfClosing = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  let mismatches = 0;

  while ((match = tagRegex.exec(stripped)) !== null) {
    const matchedText = match[0];
    const tagName = match[1].toLowerCase();
    const isSelfClose = match[2] === '/' || selfClosing.has(tagName);
    const isClose = matchedText.startsWith('</');

    if (isSelfClose) continue;
    if (isClose) {
      if (stack.length === 0) {
        mismatches++;
      } else {
        const top = stack.pop();
        if (top !== tagName) mismatches++;
      }
    } else {
      stack.push(tagName);
    }
  }
  assert.strictEqual(mismatches, 0, "Found mismatched tags in Home.html");
  assert.strictEqual(stack.length, 0, "Found unclosed tags in Home.html");
});

check("Overview subview correctly encapsulates middle row charts & cash position cards", () => {
  const overviewOpenIdx = homeViewHtml.indexOf('id="home-subview-overview"');
  const analyticsOpenIdx = homeViewHtml.indexOf('id="home-subview-analytics"');
  const reportsOpenIdx = homeViewHtml.indexOf('id="home-subview-reports"');
  const sectionCloseIdx = homeViewHtml.lastIndexOf('</section>');

  assert(overviewOpenIdx !== -1, "Missing home-subview-overview");
  assert(analyticsOpenIdx > overviewOpenIdx, "home-subview-analytics must follow overview");
  assert(reportsOpenIdx > analyticsOpenIdx, "home-subview-reports must follow analytics");
  assert(sectionCloseIdx > reportsOpenIdx, "section#home must enclose reports subview");

  const overviewSlice = homeViewHtml.substring(overviewOpenIdx, analyticsOpenIdx);
  assert(overviewSlice.includes('id="assetAllocationChart"'), "assetAllocationChart must be inside overview subview");
  assert(overviewSlice.includes('id="home-cash"'), "home-cash card must be inside overview subview");
  assert(overviewSlice.includes('id="home-actuarial-microstrip"'), "home-actuarial-microstrip must be inside overview subview");
});

check("Chama Asset Allocation and Cash Position cards use responsive typography & truncate protection", () => {
  assert(homeViewHtml.includes('max-w-full overflow-hidden w-full h-56 sm:h-64'), "Donut chart container must be constrained to prevent blowout");
  assert(homeViewHtml.includes('id="home-cash" class="text-lg sm:text-xl xl:text-2xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight font-mono tabular-nums truncate"'), "home-cash must have responsive font sizes and truncate");
  assert(homeViewHtml.includes('id="home-investment-inflows" class="text-lg sm:text-xl xl:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums truncate"'), "home-investment-inflows must have responsive font sizes and truncate");
  assert(homeViewHtml.includes('id="home-operating-outflows" class="text-lg sm:text-xl xl:text-2xl font-bold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums truncate"'), "home-operating-outflows must have responsive font sizes and truncate");
});

check("Actuarial Telemetry micro-strip wraps cleanly across mobile and tablet screens", () => {
  assert(homeViewHtml.includes('grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 w-full lg:w-auto'), "Microstrip grid must be responsive for mobile/tablet");
  assert(homeViewHtml.includes('id="home-liquidity-badge" class="inline-flex flex-wrap items-center gap-1'), "Liquidity ratio badge must allow flex-wrap for SASRA floor");
});

check("Portfolio Snapshot displays stacked savings and loan metrics to eliminate truncation", () => {
  assert(homeViewHtml.includes('id="trajectory-snapshot-savings"'), "Missing stacked trajectory-snapshot-savings");
  assert(homeViewHtml.includes('id="trajectory-snapshot-loans"'), "Missing stacked trajectory-snapshot-loans");
});

check("Reports Subview top 4 KPI cards feature full responsive sizing and truncate safeguards", () => {
  assert(homeViewHtml.includes('id="agm-kpi-assets" class="text-base sm:text-lg xl:text-xl font-bold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums truncate"'), "agm-kpi-assets must be responsive and truncated");
  assert(homeViewHtml.includes('id="agm-kpi-equity" class="text-base sm:text-lg xl:text-xl font-bold text-indigo-700 dark:text-indigo-400 tracking-tight font-mono tabular-nums truncate"'), "agm-kpi-equity must be responsive and truncated");
  assert(homeViewHtml.includes('id="agm-kpi-surplus" class="text-base sm:text-lg xl:text-xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight font-mono tabular-nums truncate"'), "agm-kpi-surplus must be responsive and truncated");
  assert(homeViewHtml.includes('id="agm-kpi-solvency" class="text-base sm:text-lg xl:text-xl font-bold text-slate-900 dark:text-white tracking-tight font-mono tabular-nums truncate"'), "agm-kpi-solvency must be responsive and truncated");
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log("\n======================================================================");
console.log(`=== TEST SUMMARY: ${passedChecks}/${totalChecks} CHECKS PASSED ===`);
console.log("======================================================================");

if (passedChecks !== totalChecks) {
  process.exit(1);
}
