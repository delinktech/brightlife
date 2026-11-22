function getDashboardData() {
  requireAccess_();
  try {
    const ctx = typeof beginRequestSheetContext_ === "function" ? beginRequestSheetContext_() : null;
    const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
    const kpiSnap = typeof readSummaryKpisSnapshot_ === "function" ? readSummaryKpisSnapshot_(ss) : null;
    const loans = ctx ? ctx.getValues(SHEETS.LOANS, { required: true }) : getRequiredSheet_(SHEETS.LOANS).getDataRange().getValues();
    const guarantors = ctx ? ctx.getValues(SHEETS.GUARANTORS, { required: true }) : getRequiredSheet_(SHEETS.GUARANTORS).getDataRange().getValues();

    let totalPool = kpiSnap ? kpiSnap.totalMemberSavings : 0;
    let totalActiveLoans = kpiSnap ? kpiSnap.totalOutstandingLoans : 0;
    let pendingLoansCount = kpiSnap ? kpiSnap.pendingLoansCount : 0;

    if (!kpiSnap) {
      const members = ctx ? ctx.getValues(SHEETS.MEMBERS, { required: true }) : getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();
      const mCol = members.length > 0 ? getHeaderMap_(members[0]) : {};
      const savIdx = mCol["Total Savings"] !== undefined ? mCol["Total Savings"] : 6;
      for (let i = 1; i < members.length; i++) {
        totalPool += Number(members[i][savIdx]) || 0;
      }
    }

    const gCol = guarantors.length > 0 ? getHeaderMap_(guarantors[0]) : {};
    const gLidIdx = gCol["Loan ID"] !== undefined ? gCol["Loan ID"] : 0;
    const gNameIdx = gCol["Guarantor Name"] !== undefined ? gCol["Guarantor Name"] : 1;
    const gAmtIdx = gCol["Guaranteed Amount"] !== undefined ? gCol["Guaranteed Amount"] : 2;

    const guarantorMap = {};
    for (let j = 1; j < guarantors.length; j++) {
      const loanId = guarantors[j][gLidIdx];
      if (!guarantorMap[loanId]) guarantorMap[loanId] = [];
      guarantorMap[loanId].push({
        name: guarantors[j][gNameIdx],
        amount: guarantors[j][gAmtIdx],
      });
    }

    const lCol = loans.length > 0 ? getHeaderMap_(loans[0]) : {};
    const lIdIdx = lCol["Loan ID"] !== undefined ? lCol["Loan ID"] : 0;
    const lNameIdx = lCol["Borrower Name"] !== undefined ? lCol["Borrower Name"] : 1;
    const lAmtIdx = lCol["Balance"] !== undefined ? lCol["Balance"] : (lCol["Requested Amount"] !== undefined ? lCol["Requested Amount"] : 2);
    const lStatIdx = lCol["Status"] !== undefined ? lCol["Status"] : 5;

    const loanList = [];
    for (let k = 1; k < loans.length; k++) {
      const loanId = loans[k][lIdIdx];
      if (!loanId) continue;
      const status = loans[k][lStatIdx];
      const amt = Number(loans[k][lAmtIdx]) || 0;
      if (!kpiSnap) {
        if (status === LOAN_STATUS.ACTIVE || status === LOAN_STATUS.APPROVED) totalActiveLoans += amt;
        if (status === LOAN_STATUS.PENDING) pendingLoansCount++;
      }

      loanList.push({
        id: loanId,
        borrower: loans[k][lNameIdx],
        amount: amt,
        status: status,
        guarantors: guarantorMap[loanId] || [],
      });
    }

    return {
      stats: {
        pool: totalPool,
        activeLoans: totalActiveLoans,
        cash: kpiSnap ? kpiSnap.netCashPosition : (totalPool - totalActiveLoans),
        pending: pendingLoansCount,
        invested: kpiSnap ? kpiSnap.totalInvestmentAssets : 0,
        activeMembers: kpiSnap ? kpiSnap.totalActiveMembers : 0,
        parRate: kpiSnap ? kpiSnap.activeParPct : 0,
        fromMaterializedView: Boolean(kpiSnap),
      },
      loans: loanList,
      rpcProfile: ctx ? ctx.getProfile() : null,
    };
  } finally {
    if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
  }
}

function clearDashboardCache_() {
  try {
    if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
    var cache = CacheService.getScriptCache();
    var now = new Date();
    var curMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    cache.removeAll([
      "home_analytics_year",
      "home_analytics_quarter",
      "home_analytics_this_month",
      "dividend_overview_v1",
      "statements_overview_default",
      "statements_overview_" + curMonthKey
    ]);
  } catch (err) {
    console.error("clearDashboardCache_ error: " + err.message);
  }
}

function getHomeAnalytics(rangeKey) {
  return getHomeAnalyticsByRange_(rangeKey || "year");
}

function getHomeAnalyticsByRange_(rangeKey) {
  requireAccess_();
  const effectiveRange = normalizeRangeKey_(rangeKey);
  const cacheKey = "home_analytics_" + effectiveRange;

  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (cacheErr) {
    console.error("Cache read error: " + cacheErr.message);
  }

  try {
    const ctx = typeof beginRequestSheetContext_ === "function" ? beginRequestSheetContext_() : null;
    const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
  const now = new Date();
  const currentYear = now.getFullYear();
  const tz = ss.getSpreadsheetTimeZone();
  const rangeBounds = getDateRangeBounds_(effectiveRange, now);

  // ARC-3 + ARC-4: Query the single-row materialized view "Summary KPIs" in 1 instant range call
  // and reuse request-scoped SheetContext cached matrices for all operational tabs.
  const kpiSnap = typeof readSummaryKpisSnapshot_ === "function" ? readSummaryKpisSnapshot_(ss) : null;
  const contributionRows = ctx ? ctx.getValues(SHEETS.CONTRIBUTIONS, { required: true }) : getRequiredSheet_(SHEETS.CONTRIBUTIONS).getDataRange().getValues();
  const loanRows = ctx ? ctx.getValues(SHEETS.LOANS, { required: true }) : getRequiredSheet_(SHEETS.LOANS).getDataRange().getValues();

  let totalSavings = 0;
  let totalLoans = 0;
  let memberCount = 0;

  if (kpiSnap && (kpiSnap.totalRegisteredMembers > 0 || kpiSnap.totalMemberSavings > 0)) {
    totalSavings = kpiSnap.totalMemberSavings;
    totalLoans = kpiSnap.totalOutstandingLoans;
    memberCount = kpiSnap.totalRegisteredMembers;
  } else {
    const memberRows = ctx ? ctx.getValues(SHEETS.MEMBERS, { required: true }) : getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();
    if (memberRows.length > 1) {
      const memberHeaders = memberRows[0];
      const memberCol = getHeaderMap_(memberHeaders);
      requireHeaders_(
        memberCol,
        ["Member ID", "Total Savings", "Current Loan Balance"],
        SHEETS.MEMBERS
      );

      for (let i = 1; i < memberRows.length; i++) {
        const row = memberRows[i];
        if (!row[memberCol["Member ID"]]) continue;
        totalSavings += Number(row[memberCol["Total Savings"]]) || 0;
        totalLoans += Number(row[memberCol["Current Loan Balance"]]) || 0;
        memberCount++;
      }
    }
  }

  let filteredContributions = 0;
  let yearToDateContributions = 0;
  let monthlyContributionsCurrent = 0;
  let monthlyContributionsPrevious = 0;
  const monthlyContributionMap = {};
  const yearlyContributionMap = {};
  const contributionByMember = {};

  if (contributionRows.length > 1) {
    const contributionHeaders = contributionRows[0];
    const contributionCol = getHeaderMap_(contributionHeaders);
    requireHeaders_(
      contributionCol,
      ["Date", "Amount", "Member Name"],
      SHEETS.CONTRIBUTIONS
    );

    for (let j = 1; j < contributionRows.length; j++) {
      const row = contributionRows[j];
      const rawDate = row[contributionCol["Date"]];
      const amount = Number(row[contributionCol["Amount"]]) || 0;
      const memberName = String(row[contributionCol["Member Name"]] || "").trim();
      if (!(rawDate instanceof Date) || amount <= 0) continue;

      const year = rawDate.getFullYear();
      const month = rawDate.getMonth();
      const monthKey = year + "-" + String(month + 1).padStart(2, "0");

      monthlyContributionMap[monthKey] = (monthlyContributionMap[monthKey] || 0) + amount;
      yearlyContributionMap[year] = (yearlyContributionMap[year] || 0) + amount;

      if (isWithinRange_(rawDate, rangeBounds.start, rangeBounds.end)) {
        filteredContributions += amount;
        if (memberName) {
          contributionByMember[memberName] = (contributionByMember[memberName] || 0) + amount;
        }
      }
      if (year === currentYear && rawDate <= now) {
        yearToDateContributions += amount;
      }
      if (year === now.getFullYear() && month === now.getMonth()) {
        monthlyContributionsCurrent += amount;
      }
    }
  }

  const previousMonthDate = new Date(currentYear, now.getMonth() - 1, 1);
  const previousMonthKey =
    previousMonthDate.getFullYear() +
    "-" +
    String(previousMonthDate.getMonth() + 1).padStart(2, "0");
  monthlyContributionsPrevious = monthlyContributionMap[previousMonthKey] || 0;

  const twoMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const twoMonthsAgoKey =
    twoMonthsAgoDate.getFullYear() +
    "-" +
    String(twoMonthsAgoDate.getMonth() + 1).padStart(2, "0");
  const monthlyContributionsTwoMonthsAgo = monthlyContributionMap[twoMonthsAgoKey] || 0;

  const currentMonthKey = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const sameMonthLastYearKey =
    now.getFullYear() - 1 + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const sameRangeLastYear = getSameRangeLastYearBounds_(rangeBounds);

  let samePeriodLastYearContrib = 0;
  if (contributionRows.length > 1) {
    const contributionHeaders = contributionRows[0];
    const contributionCol = getHeaderMap_(contributionHeaders);
    for (let j = 1; j < contributionRows.length; j++) {
      const row = contributionRows[j];
      const rawDate = row[contributionCol["Date"]];
      const amount = Number(row[contributionCol["Amount"]]) || 0;
      if (!(rawDate instanceof Date) || amount <= 0) continue;
      if (isWithinRange_(rawDate, sameRangeLastYear.start, sameRangeLastYear.end)) {
        samePeriodLastYearContrib += amount;
      }
    }
  }

  const monthlyGrowthMoM = calculateGrowthPercent_(
    monthlyContributionsCurrent,
    monthlyContributionsPrevious
  );
  const monthlyGrowthLastVsTwoMonthsAgo = calculateGrowthPercent_(
    monthlyContributionsPrevious,
    monthlyContributionsTwoMonthsAgo
  );
  const monthlyGrowthYoY = calculateGrowthPercent_(
    monthlyContributionMap[currentMonthKey] || 0,
    monthlyContributionMap[sameMonthLastYearKey] || 0
  );
  const rangeGrowthYoY = calculateGrowthPercent_(
    filteredContributions,
    samePeriodLastYearContrib
  );

  let activeLoanCount = 0;
  let pendingLoanCount = 0;
  let settledLoanCount = 0;
  let totalRepaymentDue = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let parAmount = 0;
  let aging = { current: 0, par30: 0, par60: 0, par90: 0, loss: 0 };
  let agingCounts = { current: 0, par30: 0, par60: 0, par90: 0, loss: 0 };
  let totalGuaranteed = 0;
  let totalShortfall = 0;
  let underGuaranteedCount = 0;

  if (loanRows.length > 1) {
    const loanHeaders = loanRows[0];
    const loanCol = getHeaderMap_(loanHeaders);
    requireHeaders_(
      loanCol,
      ["Status", "Repayment Amount", "Total Paid", "Balance", "Shortfall Amount"],
      SHEETS.LOANS
    );

    const dueDateCol = loanCol["Due Date"] !== undefined ? loanCol["Due Date"] : loanCol["Maturity Date"];
    const approvedDateCol = loanCol["Approved Date"] !== undefined ? loanCol["Approved Date"] : loanCol["Request Date"];
    const loanTermCol = loanCol["Loan Term (Months)"] !== undefined ? loanCol["Loan Term (Months)"] : loanCol["Term"];
    const guaranteedCol = loanCol["Total Guaranteed"];

    for (let k = 1; k < loanRows.length; k++) {
      const status = String(loanRows[k][loanCol["Status"]] || "").trim();
      const statusLower = status.toLowerCase();
      const isDelinquentStatus =
        statusLower.indexOf("arrear") !== -1 ||
        statusLower.indexOf("default") !== -1 ||
        statusLower.indexOf("overdue") !== -1;

      const repaymentAmount = Number(loanRows[k][loanCol["Repayment Amount"]]) || 0;
      const paidAmount = Number(loanRows[k][loanCol["Total Paid"]]) || 0;
      const balanceAmount = Number(loanRows[k][loanCol["Balance"]]) || 0;
      const shortfallAmount = Number(loanRows[k][loanCol["Shortfall Amount"]]) || 0;

      if (status === LOAN_STATUS.ACTIVE || isDelinquentStatus) activeLoanCount++;
      if (status === LOAN_STATUS.PENDING) pendingLoanCount++;
      if (status === LOAN_STATUS.SETTLED) settledLoanCount++;

      if (status !== LOAN_STATUS.REJECTED) {
        totalRepaymentDue += repaymentAmount;
        totalPaid += paidAmount;
      }

      if ((status === LOAN_STATUS.ACTIVE || isDelinquentStatus) && balanceAmount > 0) {
        totalOutstanding += balanceAmount;

        // Track collateral coverage & shortfall separately from repayment arrears
        if (guaranteedCol !== undefined) totalGuaranteed += Number(loanRows[k][guaranteedCol]) || 0;
        if (shortfallAmount > 0) {
          totalShortfall += shortfallAmount;
          underGuaranteedCount++;
        }

        // 3-Tier Delinquency Waterfall
        let isOverdue = false;
        let daysPastDue = 0;

        // Tier 1: Explicit Delinquency Status
        if (isDelinquentStatus) {
          isOverdue = true;
          daysPastDue = statusLower.indexOf("default") !== -1 ? 91 : 31;
        }

        // Tier 2: Explicit Due Date column
        let hasExplicitDueDate = false;
        if (!isOverdue && dueDateCol !== undefined && loanRows[k][dueDateCol]) {
          const dVal = loanRows[k][dueDateCol];
          const dueDate = dVal instanceof Date ? dVal : new Date(dVal);
          if (!isNaN(dueDate.getTime())) {
            hasExplicitDueDate = true;
            const diffDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              isOverdue = true;
              daysPastDue = diffDays;
            }
          }
        }

        // Tier 3: Inferred Due Date from Approved Date + Tenor (Default 3 months)
        if (!isOverdue && !hasExplicitDueDate && approvedDateCol !== undefined && loanRows[k][approvedDateCol]) {
          const aVal = loanRows[k][approvedDateCol];
          const approvedDate = aVal instanceof Date ? aVal : new Date(aVal);
          if (!isNaN(approvedDate.getTime())) {
            let tenorMonths = 3;
            if (loanTermCol !== undefined && Number(loanRows[k][loanTermCol]) > 0) {
              tenorMonths = Number(loanRows[k][loanTermCol]);
            }
            const inferredDueDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + tenorMonths, approvedDate.getDate());
            const diffDays = Math.floor((now.getTime() - inferredDueDate.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              isOverdue = true;
              daysPastDue = diffDays;
            }
          }
        }

        // Classify into 5 statutory SASRA aging buckets
        if (isOverdue) {
          parAmount += balanceAmount;
          if (daysPastDue <= 30) {
            aging.par30 += balanceAmount;
            agingCounts.par30++;
          } else if (daysPastDue <= 60) {
            aging.par60 += balanceAmount;
            agingCounts.par60++;
          } else if (daysPastDue <= 90) {
            aging.par90 += balanceAmount;
            agingCounts.par90++;
          } else {
            aging.loss += balanceAmount;
            agingCounts.loss++;
          }
        } else {
          aging.current += balanceAmount;
          agingCounts.current++;
        }
      }
    }
  }

  const repaymentRate = totalRepaymentDue > 0 ? (totalPaid / totalRepaymentDue) * 100 : 0;
  const parRate = totalOutstanding > 0 ? (parAmount / totalOutstanding) * 100 : 0;
  const performingAmount = Math.max(0, totalOutstanding - parAmount);
  const performingRate = totalOutstanding > 0 ? (performingAmount / totalOutstanding) * 100 : 0;
  const recommendedProvisionRaw =
    (0.01 * (aging.current || 0)) +
    (0.05 * (aging.par30 || 0)) +
    (0.25 * (aging.par60 || 0)) +
    (0.50 * (aging.par90 || 0)) +
    (1.00 * (aging.loss || 0));
  const recommendedProvision = Math.round(recommendedProvisionRaw * 100) / 100;
  const netLoanAssetValue = Math.max(0, Math.round((totalOutstanding - recommendedProvision) * 100) / 100);

  const sasraTiers = [
    { key: "current", label: "Current (0 days)", classification: "Performing", daysRange: "0 days", ratePct: 1, rate: 0.01 },
    { key: "par30", label: "1–30 Days Overdue", classification: "Watch", daysRange: "1–30 days", ratePct: 5, rate: 0.05 },
    { key: "par60", label: "31–60 Days Overdue", classification: "Substandard", daysRange: "31–60 days", ratePct: 25, rate: 0.25 },
    { key: "par90", label: "61–90 Days Overdue", classification: "Doubtful", daysRange: "61–90 days", ratePct: 50, rate: 0.50 },
    { key: "loss", label: "91+ Days Overdue", classification: "Loss", daysRange: "91+ days", ratePct: 100, rate: 1.00 },
  ];
  const agingMatrix = sasraTiers.map(function (t) {
    const amount = Math.round((aging[t.key] || 0) * 100) / 100;
    const count = agingCounts[t.key] || 0;
    const sharePct = totalOutstanding > 0 ? Math.round(((amount / totalOutstanding) * 100) * 100) / 100 : 0;
    const provisionAmount = Math.round((amount * t.rate) * 100) / 100;
    return {
      key: t.key,
      label: t.label,
      classification: t.classification,
      daysRange: t.daysRange,
      count: count,
      amount: amount,
      sharePct: sharePct,
      provisionRate: t.ratePct,
      provisionRateDecimal: t.rate,
      provisionAmount: provisionAmount,
    };
  });

  const monthLabels = [];
  const monthValues = [];
  const trendMonths = effectiveRange === "this_month" ? 6 : 12;
  for (let m = trendMonths - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthLabels.push(Utilities.formatDate(d, tz, "MMM yy"));
    monthValues.push(monthlyContributionMap[key] || 0);
  }

  const yearlySeries = [];
  // last 10 years
  for (let yOff = 9; yOff >= 0; yOff--) {
    const y = currentYear - yOff;
    yearlySeries.push({
      year: String(y),
      total: yearlyContributionMap[y] || 0,
    });
  }

  const topContributors = Object.keys(contributionByMember)
    .map(function (name) {
      return {
        name: name,
        amount: contributionByMember[name],
      };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    })
    .slice(0, 5);

  let investmentCount = 0;
  try {
    const invSheet = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const invValues = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, invSheet) : invSheet.getDataRange().getValues();
      if (invValues.length > 1) {
        const invCol = getHeaderMap_(invValues[0]);
        if (invCol["Investment ID"] !== undefined) {
          for (let iv = 1; iv < invValues.length; iv++) {
            if (invValues[iv][invCol["Investment ID"]]) investmentCount++;
          }
        }
      }
    }
  } catch (invErr) {
    investmentCount = 0;
  }

  const liquiditySummary = computeLiquiditySummary_(ss, totalSavings, totalLoans);
  const investments = buildInvestmentHomeCharts_(tz, now, effectiveRange, rangeBounds);
  const portfolioPayload = {
    repaymentRate: repaymentRate,
    parRate: parRate,
    totalOutstanding: totalOutstanding,
    parAmount: parAmount,
    performingAmount: performingAmount,
    performingRate: performingRate,
    aging: aging,
    recommendedProvision: recommendedProvision,
    netLoanAssetValue: netLoanAssetValue,
    matrix: agingMatrix,
  };
  const balanceSheet = buildBalanceSheet_(
    ss,
    tz,
    now,
    effectiveRange,
    liquiditySummary,
    portfolioPayload,
    totalSavings
  );
  const incomeStatement = buildIncomeStatement_(
    ss,
    tz,
    now,
    effectiveRange,
    rangeBounds,
    portfolioPayload,
    loanRows
  );

  const invInflows = (investments && investments.breakdown && investments.breakdown.inflows) || {};
  const invOutflows = (investments && investments.breakdown && investments.breakdown.outflows) || {};
  const wfContributions = Math.round((filteredContributions || 0) * 100) / 100;
  const wfLoanRepayments = Number(invInflows.loanRepayments) || 0;
  const wfFundYield = Number(invInflows.fundYields !== undefined ? invInflows.fundYields : invInflows.fundYield) || 0;
  const wfLedgerRevenue = Number(invInflows.ledgerRevenue) || 0;
  const wfLoansDisbursed = Number(invOutflows.loansDisbursed) || 0;
  const wfOperatingExpenses = Number(invOutflows.operatingExpenses) || 0;

  const totalPeriodInflows = wfContributions + wfLoanRepayments + wfFundYield + wfLedgerRevenue;
  const totalPeriodOutflows = wfLoansDisbursed + wfOperatingExpenses;
  const netPeriodCashflow = totalPeriodInflows - totalPeriodOutflows;
  const closingLiquidCash = liquiditySummary.cash;
  const openingLiquidCash = Math.max(0, Math.round((closingLiquidCash - netPeriodCashflow) * 100) / 100);

  const result = {
    range: effectiveRange,
    savings: totalSavings,
    loans: totalLoans,
    invested: balanceSheet.assets.externalInvestments.totalInvestments,
    investmentCount: investmentCount,
    memberCount: memberCount,
    cash: liquiditySummary.cash,
    liquidity: liquiditySummary.liquidity,
    balanceSheet: balanceSheet,
    incomeStatement: incomeStatement,
    cashflowWaterfall: {
      openingCash: openingLiquidCash,
      closingCash: closingLiquidCash,
      netCashflow: Math.round(netPeriodCashflow * 100) / 100,
      inflows: {
        contributions: wfContributions,
        loanRepayments: wfLoanRepayments,
        fundYield: wfFundYield,
        ledgerRevenue: wfLedgerRevenue,
        total: Math.round(totalPeriodInflows * 100) / 100,
      },
      outflows: {
        loansDisbursed: wfLoansDisbursed,
        operatingExpenses: wfOperatingExpenses,
        total: Math.round(totalPeriodOutflows * 100) / 100,
      },
    },
    yearlyContributions: filteredContributions,
    yearToDateContributions: yearToDateContributions,
    currentMonthContributions: monthlyContributionsCurrent,
    previousMonthContributions: monthlyContributionsPrevious,
    growth: {
      monthOverMonth: monthlyGrowthMoM,
      yearOverYearMonth: monthlyGrowthYoY,
      yearOverYearRange: rangeGrowthYoY,
    },
    contributionMonthCompare: {
      thisMonth: {
        percent: monthlyGrowthMoM,
        delta: monthlyContributionsCurrent - monthlyContributionsPrevious,
      },
      lastMonth: {
        percent: monthlyGrowthLastVsTwoMonthsAgo,
        delta: monthlyContributionsPrevious - monthlyContributionsTwoMonthsAgo,
      },
    },
    topContributors: topContributors,
    portfolio: portfolioPayload,
    collateralRisk: {
      totalGuaranteed: totalGuaranteed,
      totalShortfall: totalShortfall,
      underGuaranteedLoansCount: underGuaranteedCount,
      collateralCoverageRatio: totalOutstanding > 0 ? (totalGuaranteed / totalOutstanding) * 100 : 100,
    },
    monthlyContributionsTrend: {
      labels: monthLabels,
      values: monthValues,
    },
    yearlyContributionTotals: yearlySeries,
    loanStatusBreakdown: {
      active: activeLoanCount,
      pending: pendingLoanCount,
      settled: settledLoanCount,
    },
    accountsBalanceChart: getAccountsBalanceChartData_(),
    investments: investments,
    exposureTrajectory: buildExposureTrajectory_(ss, tz, now, effectiveRange, contributionRows, loanRows),
    rpcProfile: ctx ? ctx.getProfile() : null,
  };

  try {
    const payloadStr = JSON.stringify(result);
    if (payloadStr.length < 100000) {
      CacheService.getScriptCache().put(cacheKey, payloadStr, 300);
    }
  } catch (putErr) {
    console.error("Cache put error: " + putErr.message);
  }

    return result;
  } finally {
    if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
  }
}

/**
 * Computes actual liquid cash across Bank/Till (operatingCash) and MMF/Fund accounts (cashEquivalents),
 * falling back to latest Fund Statements closing balances and finally unlent member capital.
 */
function computeLiquiditySummary_(ss, totalSavings, totalLoans) {
  let operatingCash = 0;
  let cashEquivalents = 0;
  let totalStatementCash = 0;
  let totalSystemCash = 0;

  try {
    const accSheet = getSheetByNameInsensitive_(ss, SHEETS.ACCOUNTS);
    if (accSheet && accSheet.getLastRow() > 1) {
      const accRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, accSheet) : accSheet.getDataRange().getValues();
      if (accRows.length > 1) {
        const col = getHeaderMap_(accRows[0]);
        for (let i = 1; i < accRows.length; i++) {
          const row = accRows[i];
          const orgName = col["Org. Name"] !== undefined ? String(row[col["Org. Name"]] || "").trim() : "";
          const accNumber = col["Acc. Number"] !== undefined ? String(row[col["Acc. Number"]] || "").trim() : "";
          if (!orgName && !accNumber) continue;

          const hasStmtVal = col["Statement Balance"] !== undefined && row[col["Statement Balance"]] !== "" && row[col["Statement Balance"]] !== undefined;
          const stmtBal = Number(hasStmtVal ? row[col["Statement Balance"]] : row[col["Balance"]]) || 0;

          const hasSysVal = col["System Balance"] !== undefined && row[col["System Balance"]] !== "" && row[col["System Balance"]] !== undefined;
          const inflows = col["Inflows"] !== undefined ? (Number(row[col["Inflows"]]) || 0) : 0;
          const outflows = col["Outflows"] !== undefined ? (Number(row[col["Outflows"]]) || 0) : 0;
          const sysBal = hasSysVal ? (Number(row[col["System Balance"]]) || 0) : (inflows - outflows);

          const effectiveBal = stmtBal > 0 ? stmtBal : sysBal;
          const labelLower = (orgName + " " + accNumber).toLowerCase();
          if (
            labelLower.indexOf("mmf") !== -1 ||
            labelLower.indexOf("cic") !== -1 ||
            labelLower.indexOf("mansa") !== -1 ||
            labelLower.indexOf("fund") !== -1
          ) {
            cashEquivalents += effectiveBal;
          } else {
            operatingCash += effectiveBal;
          }

          totalStatementCash += effectiveBal;
          totalSystemCash += sysBal;
        }
      }
    }
  } catch (accErr) {
    console.error("Accounts liquidity read error: " + accErr.message);
  }

  // Fallback Tier 2: Latest CIC Statement closing balance per channel if Accounts yielded no balance
  if (totalStatementCash === 0) {
    try {
      const fundSheet = getSheetByNameInsensitive_(ss, SHEETS.CIC_STATEMENT);
      if (fundSheet && fundSheet.getLastRow() > 1) {
        const fRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, fundSheet) : fundSheet.getDataRange().getValues();
        if (fRows.length > 1) {
          const fCol = getHeaderMap_(fRows[0]);
          const closingCol = fCol["Closing Balance"];
          const dateCol = fCol["Statement Date"];
          const channelCol = fCol["Fund Channel"];
          if (closingCol !== undefined) {
            const latestByChannel = {};
            for (let f = 1; f < fRows.length; f++) {
              const fRow = fRows[f];
              const rawClosing = fRow[closingCol];
              if (rawClosing === "" || rawClosing === undefined || rawClosing === null) continue;
              const closingBal = Number(rawClosing) || 0;
              const channelName = channelCol !== undefined ? String(fRow[channelCol] || "Fund").trim() : "Fund";
              const rawDate = dateCol !== undefined ? fRow[dateCol] : null;
              const parsedDate = rawDate instanceof Date ? rawDate : (rawDate ? new Date(rawDate) : null);
              const ts = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;

              const prev = latestByChannel[channelName];
              if (!prev || ts > prev.ts || (ts === prev.ts && f > prev.rowIdx)) {
                latestByChannel[channelName] = { ts: ts, rowIdx: f, closing: closingBal };
              }
            }
            Object.keys(latestByChannel).forEach(function (ch) {
              const bal = latestByChannel[ch].closing;
              if (bal > 0) {
                totalStatementCash += bal;
                cashEquivalents += bal;
              }
            });
          }
        }
      }
    } catch (fundErr) {
      console.error("Fund statements liquidity fallback error: " + fundErr.message);
    }
  }

  // Fallback Tier 3: Unlent member capital when neither Accounts nor Fund Statements provide balances
  const totalLiquidCash = totalStatementCash > 0 ? totalStatementCash : Math.max(0, totalSavings - totalLoans);
  const liqRatio = totalSavings > 0 ? (totalLiquidCash / totalSavings) * 100 : 0;
  let liqStatus = "Optimal";
  if (liqRatio < 15) liqStatus = "Deficit / High Risk";
  else if (liqRatio < 30) liqStatus = "Adequate";
  else liqStatus = "Well Capitalized";

  return {
    cash: totalLiquidCash,
    liquidity: {
      ratio: Math.round(liqRatio * 100) / 100,
      status: liqStatus,
      totalStatementCash: totalLiquidCash,
      totalSystemCash: totalSystemCash,
      netVariance: totalLiquidCash - totalSystemCash,
      isReconciled: Math.abs(totalLiquidCash - totalSystemCash) < 1,
      isEstimated: totalStatementCash === 0,
      tiers: {
        operatingCash: operatingCash,
        cashEquivalents: cashEquivalents,
      },
    },
  };
}

function getAccountsBalanceChartData_() {
  const labels = [];
  const values = [];
  const rows = [];
  try {
    const ss = getSpreadsheet_();
    const sheet = getSheetByNameInsensitive_(ss, SHEETS.ACCOUNTS);
    if (!sheet) return { labels: labels, values: values, rows: rows };
    const raw = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, sheet) : sheet.getDataRange().getValues();
    if (raw.length <= 1) return { labels: labels, values: values, rows: rows };
    const col = getHeaderMap_(raw[0]);
    const tz = ss.getSpreadsheetTimeZone();
    if (
      col["Org. Name"] === undefined ||
      col["Acc. Number"] === undefined ||
      col["Balance"] === undefined
    ) {
      return { labels: labels, values: values, rows: rows };
    }

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i];
      const org = String(row[col["Org. Name"]] || "").trim();
      const number = String(row[col["Acc. Number"]] || "").trim();
      const balance = Number(row[col["Balance"]]) || 0;
      if (!org && !number) continue;
      const labelBase = org || "Account";
      const numberTail = number ? " • " + number.slice(-4) : "";
      labels.push(labelBase + numberTail);
      values.push(balance);
      rows.push({
        orgName: org,
        accountNumber: number,
        balanceDate:
          col["Balance Date"] !== undefined
            ? formatDateValue_(row[col["Balance Date"]], tz)
            : "",
        balance: balance,
      });
    }
  } catch (err) {
    return { labels: [], values: [], rows: [] };
  }
  return { labels: labels, values: values, rows: rows };
}

function parseSheetDate_(raw) {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Home dashboard: investment charts and period inflow/outflow cashflow cards.
 * Optional sheets return empty series / 0 totals without breaking the dashboard.
 */
function buildInvestmentHomeCharts_(tz, now, effectiveRange, rangeBounds) {
  const ss = getSpreadsheet_();
  const bounds = rangeBounds || getDateRangeBounds_(normalizeRangeKey_(effectiveRange), now);

  const investedVsRevenue = [];
  try {
    const sheet = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENTS);
    if (sheet) {
      const values = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, sheet) : sheet.getDataRange().getValues();
      if (values.length > 1) {
        const headers = values[0];
        const col = getHeaderMap_(headers);
        if (
          col["Investment ID"] !== undefined &&
          col["Money Invested"] !== undefined &&
          col["Revenue"] !== undefined
        ) {
          for (let i = 1; i < values.length; i++) {
            const row = values[i];
            if (!row[col["Investment ID"]]) continue;
            let name = String(row[col["Name"]] || "").trim();
            if (!name) name = String(row[col["Investment ID"]]);
            if (name.length > 28) {
              name = name.substring(0, 26) + "\u2026";
            }
            investedVsRevenue.push({
              label: name,
              invested: Number(row[col["Money Invested"]]) || 0,
              revenue: Number(row[col["Revenue"]]) || 0,
            });
          }
        }
      }
    }
  } catch (e) {
    // optional sheet
  }

  let repaymentsInflow = 0;
  try {
    const repSheet = getSheetByNameInsensitive_(ss, SHEETS.LOAN_REPAYMENTS);
    if (repSheet && repSheet.getLastRow() > 1) {
      const rv = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, repSheet) : repSheet.getDataRange().getValues();
      if (rv.length > 1) {
        const rc = getHeaderMap_(rv[0]);
        const rDateCol =
          rc["Payment Date"] !== undefined
            ? rc["Payment Date"]
            : (rc["Repayment Date"] !== undefined ? rc["Repayment Date"] : rc["Date"]);
        const rAmtCol = rc["Total Paid"] !== undefined ? rc["Total Paid"] : rc["Amount"];
        const rStatCol = rc["Status"];

        if (rDateCol !== undefined && rAmtCol !== undefined) {
          for (let r = 1; r < rv.length; r++) {
            const row = rv[r];
            const parsedDate = parseSheetDate_(row[rDateCol]);
            if (!parsedDate || !isWithinRange_(parsedDate, bounds.start, bounds.end)) continue;

            const stat = rStatCol !== undefined ? String(row[rStatCol] || "").trim().toLowerCase() : "";
            if (stat !== "" && stat !== "approved") continue;

            repaymentsInflow += Number(row[rAmtCol]) || 0;
          }
        }
      }
    }
  } catch (eRep) {
    // optional sheet
  }

  let fundYieldInflow = 0;
  try {
    const fundSheet = getSheetByNameInsensitive_(ss, SHEETS.CIC_STATEMENT);
    if (fundSheet && fundSheet.getLastRow() > 1) {
      const fv = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, fundSheet) : fundSheet.getDataRange().getValues();
      if (fv.length > 1) {
        const fc = getHeaderMap_(fv[0]);
        const fDateCol = fc["Statement Date"] !== undefined ? fc["Statement Date"] : fc["Date"];
        const netCol = fc["Net Yield"];
        const grossCol = fc["Gross Interest"];
        const taxCol = fc["Withholding Tax"];

        if (fDateCol !== undefined) {
          for (let f = 1; f < fv.length; f++) {
            const row = fv[f];
            const parsedDate = parseSheetDate_(row[fDateCol]);
            if (!parsedDate || !isWithinRange_(parsedDate, bounds.start, bounds.end)) continue;

            const gross = grossCol !== undefined ? (Number(row[grossCol]) || 0) : 0;
            const tax = taxCol !== undefined ? (Number(row[taxCol]) || 0) : 0;
            const netRaw = netCol !== undefined ? row[netCol] : undefined;
            const hasNet = netRaw !== "" && netRaw !== undefined && netRaw !== null && Number(netRaw) !== 0;
            const netYield = hasNet ? (Number(netRaw) || 0) : (gross - tax);

            fundYieldInflow += netYield;
          }
        }
      }
    }
  } catch (eFund) {
    // optional sheet
  }

  let loansDisbursedOutflow = 0;
  try {
    const loanSheet = getSheetByNameInsensitive_(ss, SHEETS.LOANS);
    if (loanSheet && loanSheet.getLastRow() > 1) {
      const lvLoans = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(ss, loanSheet) : loanSheet.getDataRange().getValues();
      if (lvLoans.length > 1) {
        const lcLoans = getHeaderMap_(lvLoans[0]);
        const appDateCol = lcLoans["Approved Date"];
        const reqAmtCol =
          lcLoans["Requested Amount"] !== undefined ? lcLoans["Requested Amount"] : lcLoans["Principal Amount"];
        const statCol = lcLoans["Status"];

        if (appDateCol !== undefined && reqAmtCol !== undefined && statCol !== undefined) {
          for (let k = 1; k < lvLoans.length; k++) {
            const row = lvLoans[k];
            const stat = String(row[statCol] || "").trim().toLowerCase();
            if (stat !== "active" && stat !== "settled") continue;

            const parsedDate = parseSheetDate_(row[appDateCol]);
            if (!parsedDate || !isWithinRange_(parsedDate, bounds.start, bounds.end)) continue;

            loansDisbursedOutflow += Number(row[reqAmtCol]) || 0;
          }
        }
      }
    }
  } catch (eLoan) {
    // optional sheet
  }

  let ledgerRevenueInflow = 0;
  let ledgerOutflow = 0;
  const monthlyRev = {};
  const monthlyExp = {};
  const revenueByCategoryMap = {};
  try {
    {
      const lv = readUnifiedInvestmentLedgerValues_(ss); // ARC-2 unified ledger
      if (lv.length > 1) {
        const lc = getHeaderMap_(lv[0]);
        if (
          lc["Date"] !== undefined &&
          lc["Type"] !== undefined &&
          lc["Amount"] !== undefined
        ) {
          for (let j = 1; j < lv.length; j++) {
            const row = lv[j];
            const rawDate = parseSheetDate_(row[lc["Date"]]);
            if (!rawDate) continue;
            const kind = normalizeLedgerType_(row[lc["Type"]]);
            const absAmt = Math.abs(Number(row[lc["Amount"]]) || 0);
            const fee = lc["Transaction Fee"] !== undefined ? (Number(row[lc["Transaction Fee"]]) || 0) : 0;
            const catLabel = lc["Category"] !== undefined ? ledgerCategoryLabel_(row[lc["Category"]]) : "Uncategorized";
            const monthKey =
              rawDate.getFullYear() + "-" + String(rawDate.getMonth() + 1).padStart(2, "0");
            const inRange = isWithinRange_(rawDate, bounds.start, bounds.end);

            if (kind === "revenue") {
              monthlyRev[monthKey] = (monthlyRev[monthKey] || 0) + absAmt;
              if (inRange) {
                revenueByCategoryMap[catLabel] = (revenueByCategoryMap[catLabel] || 0) + absAmt;
                ledgerRevenueInflow += absAmt;
              }
            } else if (kind === "expense" || kind === "capital in") {
              monthlyExp[monthKey] = (monthlyExp[monthKey] || 0) + absAmt + fee;
              if (inRange) {
                ledgerOutflow += absAmt + fee;
              }
            }
          }
        }
      }
    }
  } catch (e2) {
    // optional sheet
  }

  const trendMonths = effectiveRange === "this_month" ? 6 : 12;
  const monthLabels = [];
  const revenueSeries = [];
  const expenditureSeries = [];
  for (let m = trendMonths - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthLabels.push(Utilities.formatDate(d, tz, "MMM yy"));
    revenueSeries.push(monthlyRev[key] || 0);
    expenditureSeries.push(monthlyExp[key] || 0);
  }

  const catKeys = Object.keys(revenueByCategoryMap).sort(function (a, b) {
    return revenueByCategoryMap[b] - revenueByCategoryMap[a];
  });
  const revenueCategoryLabels = catKeys;
  const revenueCategoryValues = catKeys.map(function (k) {
    return revenueByCategoryMap[k];
  });

  const totalInflows = repaymentsInflow + fundYieldInflow + ledgerRevenueInflow;
  const totalOutflows = loansDisbursedOutflow + ledgerOutflow;

  return {
    totalInflows: Math.round(totalInflows * 100) / 100,
    totalOutflows: Math.round(totalOutflows * 100) / 100,
    netCashflow: Math.round((totalInflows - totalOutflows) * 100) / 100,
    breakdown: {
      inflows: {
        loanRepayments: Math.round(repaymentsInflow * 100) / 100,
        fundYields: Math.round(fundYieldInflow * 100) / 100,
        ledgerRevenue: Math.round(ledgerRevenueInflow * 100) / 100,
      },
      outflows: {
        loansDisbursed: Math.round(loansDisbursedOutflow * 100) / 100,
        operatingExpenses: Math.round(ledgerOutflow * 100) / 100,
      },
    },
    investedVsRevenue: investedVsRevenue,
    monthlyInvestmentTrend: {
      labels: monthLabels,
      revenue: revenueSeries,
      expenditures: expenditureSeries,
    },
    revenueByCategory: {
      labels: revenueCategoryLabels,
      values: revenueCategoryValues,
    },
  };
}

/**
 * Builds rolling 12-month (or 6-month for 'this_month') member savings vs net loan exposure
 * trajectory against the SASRA 85% prudential ceiling.
 */
function buildExposureTrajectory_(ss, tz, now, effectiveRange, cachedContributionRows, cachedLoanRows) {
  const spreadsheet = ss || getSpreadsheet_();
  const trendMonths = effectiveRange === "this_month" ? 6 : 12;

  const contribEntries = [];
  try {
    let cRows = cachedContributionRows;
    if (!cRows) {
      const cSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.CONTRIBUTIONS);
      cRows = cSheet && cSheet.getLastRow() > 1 ? (typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, cSheet) : cSheet.getDataRange().getValues()) : [];
    }
    if (cRows && cRows.length > 1) {
      const cCol = getHeaderMap_(cRows[0]);
      const dateCol = cCol["Date"];
      const amtCol = cCol["Amount"];
      const statCol = cCol["Status"];
      if (dateCol !== undefined && amtCol !== undefined) {
        for (let i = 1; i < cRows.length; i++) {
          const row = cRows[i];
          const dt = parseSheetDate_(row[dateCol]);
          const amt = Number(row[amtCol]) || 0;
          if (!dt || amt <= 0) continue;
          const stat = statCol !== undefined ? String(row[statCol] || "").trim().toLowerCase() : "";
          if (stat !== "" && stat !== "approved") continue;
          contribEntries.push({ ts: dt.getTime(), amt: amt });
        }
      }
    }
  } catch (eContrib) {
    console.error("Exposure trajectory contributions error: " + eContrib.message);
  }

  const loanDisbursalEntries = [];
  try {
    let lRows = cachedLoanRows;
    if (!lRows) {
      const lSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOANS);
      lRows = lSheet && lSheet.getLastRow() > 1 ? (typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, lSheet) : lSheet.getDataRange().getValues()) : [];
    }
    if (lRows && lRows.length > 1) {
      const lCol = getHeaderMap_(lRows[0]);
      const appDateCol = lCol["Approved Date"];
      const reqDateCol = lCol["Request Date"];
      const prinCol =
        lCol["Requested Amount"] !== undefined ? lCol["Requested Amount"] : lCol["Principal Amount"];
      const statCol = lCol["Status"];
      if (prinCol !== undefined && (appDateCol !== undefined || reqDateCol !== undefined)) {
        for (let k = 1; k < lRows.length; k++) {
          const row = lRows[k];
          const stat = statCol !== undefined ? String(row[statCol] || "").trim().toLowerCase() : "";
          if (stat === "pending" || stat === "rejected") continue;
          const rawDt =
            appDateCol !== undefined && row[appDateCol]
              ? row[appDateCol]
              : (reqDateCol !== undefined ? row[reqDateCol] : null);
          const dt = parseSheetDate_(rawDt);
          const principal = Number(row[prinCol]) || 0;
          if (!dt || principal <= 0) continue;
          loanDisbursalEntries.push({ ts: dt.getTime(), amt: principal });
        }
      }
    }
  } catch (eLoans) {
    console.error("Exposure trajectory loans error: " + eLoans.message);
  }

  const principalRepaymentEntries = [];
  try {
    const repSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOAN_REPAYMENTS);
    if (repSheet && repSheet.getLastRow() > 1) {
      const rRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, repSheet) : repSheet.getDataRange().getValues();
      if (rRows.length > 1) {
        const rCol = getHeaderMap_(rRows[0]);
        const rDateCol =
          rCol["Payment Date"] !== undefined
            ? rCol["Payment Date"]
            : (rCol["Repayment Date"] !== undefined ? rCol["Repayment Date"] : rCol["Date"]);
        const rPrinCol =
          rCol["Principal Paid"] !== undefined
            ? rCol["Principal Paid"]
            : (rCol["Principal Portion"] !== undefined ? rCol["Principal Portion"] : undefined);
        const rFallbackAmtCol = rCol["Total Paid"] !== undefined ? rCol["Total Paid"] : rCol["Amount"];
        const rAmtCol = rPrinCol !== undefined ? rPrinCol : rFallbackAmtCol;
        const rStatCol = rCol["Status"];

        if (rDateCol !== undefined && rAmtCol !== undefined) {
          for (let r = 1; r < rRows.length; r++) {
            const row = rRows[r];
            const stat = rStatCol !== undefined ? String(row[rStatCol] || "").trim().toLowerCase() : "";
            if (stat !== "" && stat !== "approved") continue;
            const dt = parseSheetDate_(row[rDateCol]);
            const prinPaid = Number(row[rAmtCol]) || 0;
            if (!dt || prinPaid <= 0) continue;
            principalRepaymentEntries.push({ ts: dt.getTime(), amt: prinPaid });
          }
        }
      }
    }
  } catch (eRepay) {
    console.error("Exposure trajectory repayments error: " + eRepay.message);
  }

  const labels = [];
  const cumulativeSavingsSeries = [];
  const loanExposureSeries = [];
  const prudentialCeilingSeries = [];
  const series = [];

  for (let m = trendMonths - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const monthKey = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const label = Utilities.formatDate(d, tz, "MMM yy");
    const monthEndTs = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();

    let cumSavings = 0;
    for (let i = 0; i < contribEntries.length; i++) {
      if (contribEntries[i].ts <= monthEndTs) cumSavings += contribEntries[i].amt;
    }

    let cumLoansDisbursed = 0;
    for (let k = 0; k < loanDisbursalEntries.length; k++) {
      if (loanDisbursalEntries[k].ts <= monthEndTs) cumLoansDisbursed += loanDisbursalEntries[k].amt;
    }

    let cumPrincipalRepaid = 0;
    for (let r = 0; r < principalRepaymentEntries.length; r++) {
      if (principalRepaymentEntries[r].ts <= monthEndTs) cumPrincipalRepaid += principalRepaymentEntries[r].amt;
    }

    const roundedSavings = Math.round(cumSavings * 100) / 100;
    const exposure = Math.max(0, Math.round((cumLoansDisbursed - cumPrincipalRepaid) * 100) / 100);
    const ceiling = Math.round(roundedSavings * 0.85 * 100) / 100;

    labels.push(label);
    cumulativeSavingsSeries.push(roundedSavings);
    loanExposureSeries.push(exposure);
    prudentialCeilingSeries.push(ceiling);
    series.push({
      label: label,
      monthKey: monthKey,
      cumulativeSavings: roundedSavings,
      loanExposure: exposure,
      prudentialCeiling: ceiling,
    });
  }

  const currentSavings = cumulativeSavingsSeries.length
    ? cumulativeSavingsSeries[cumulativeSavingsSeries.length - 1]
    : 0;
  const currentLoanExposure = loanExposureSeries.length
    ? loanExposureSeries[loanExposureSeries.length - 1]
    : 0;
  const rawUtilization = currentSavings > 0 ? (currentLoanExposure / currentSavings) * 100 : 0;
  const utilizationRate = Math.round(rawUtilization * 100) / 100;
  const idleCapitalBuffer = Math.max(0, Math.round((currentSavings - currentLoanExposure) * 100) / 100);

  let prudentialBand = "neutral";
  if (currentSavings <= 0) prudentialBand = "neutral";
  else if (utilizationRate < 40) prudentialBand = "underutilized";
  else if (utilizationRate <= 75) prudentialBand = "healthy";
  else if (utilizationRate <= 85) prudentialBand = "elevated";
  else prudentialBand = "overleveraged";

  return {
    labels: labels,
    cumulativeSavings: cumulativeSavingsSeries,
    loanExposure: loanExposureSeries,
    prudentialCeiling: prudentialCeilingSeries,
    series: series,
    summary: {
      currentSavings: currentSavings,
      currentLoanExposure: currentLoanExposure,
      utilizationRate: utilizationRate,
      idleCapitalBuffer: idleCapitalBuffer,
      prudentialBand: prudentialBand,
    },
  };
}

function roundCurrency2_(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Builds IFRS / SASRA-aligned Statement of Financial Position (Balance Sheet)
 * reconciling Cash & Equivalents, Net Loans Receivable, External Investments,
 * Liabilities, Member Share Capital, 20% Statutory Reserve, and Retained Surplus.
 */
function buildBalanceSheet_(ss, tz, now, effectiveRange, liquiditySummary, portfolio, savings) {
  const spreadsheet = ss || getSpreadsheet_();
  const liq = (liquiditySummary && liquiditySummary.liquidity) || {};
  const liqTiers = liq.tiers || {};
  const operatingCash = roundCurrency2_(
    liqTiers.operatingCash !== undefined ? liqTiers.operatingCash : liq.operatingCash
  );
  const cashEquivalents = roundCurrency2_(
    liqTiers.cashEquivalents !== undefined ? liqTiers.cashEquivalents : liq.cashEquivalents
  );
  const totalCash = roundCurrency2_(liquiditySummary && liquiditySummary.cash);

  const pf = portfolio || {};
  const grossLoans = roundCurrency2_(pf.totalOutstanding);
  const allowance = roundCurrency2_(pf.recommendedProvision);
  const netLoans = Math.max(
    0,
    roundCurrency2_(pf.netLoanAssetValue !== undefined ? pf.netLoanAssetValue : (grossLoans - allowance))
  );

  let totalInvestments = 0;
  const investmentItems = [];
  try {
    const invSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const invRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, invSheet) : invSheet.getDataRange().getValues();
      if (invRows.length > 1) {
        const col = getHeaderMap_(invRows[0]);
        const idCol = col["Investment ID"];
        const nameCol = col["Name"] !== undefined ? col["Name"] : col["Investment Name"];
        const currValCol = col["Current Value"];
        const investedCol =
          col["Money Invested"] !== undefined
            ? col["Money Invested"]
            : (col["Amount Invested"] !== undefined ? col["Amount Invested"] : col["Invested"]);
        const statCol = col["Status"];

        const INACTIVE_INV_STATUSES = {
          exited: true,
          closed: true,
          sold: true,
          matured: true,
          settled: true,
          inactive: true,
          cancelled: true,
          rejected: true,
        };

        for (let i = 1; i < invRows.length; i++) {
          const row = invRows[i];
          const invId = idCol !== undefined ? String(row[idCol] || "").trim() : "";
          const invName = nameCol !== undefined ? String(row[nameCol] || "").trim() : "";
          if (!invId && !invName) continue;

          if (statCol !== undefined) {
            const stat = String(row[statCol] || "").trim().toLowerCase();
            if (INACTIVE_INV_STATUSES[stat]) continue;
          }

          const hasCurrVal =
            currValCol !== undefined &&
            row[currValCol] !== "" &&
            row[currValCol] !== undefined &&
            row[currValCol] !== null;
          // ARC-2: Units Held x Current Price (FVTPL) takes precedence when a holding is marked to market.
          const engineVal = typeof valueInvestmentRow_ === "function" ? valueInvestmentRow_(row, col) : null;
          const isMarked = engineVal && engineVal.valuationBasis !== "Cost";
          const rawVal = isMarked
            ? engineVal.carryingValue
            : (hasCurrVal ? row[currValCol] : (investedCol !== undefined ? row[investedCol] : 0));
          const val = roundCurrency2_(rawVal);
          if (val <= 0) continue;

          totalInvestments += val;
          investmentItems.push({
            id: invId,
            name: invName || invId,
            value: val,
          });
        }
      }
    }
  } catch (invErr) {
    console.error("Balance sheet external investments error: " + invErr.message);
  }
  // ARC-2: Tier 2 standalone capital projects (not linked to a Tier 1 row) carried at deployed cost.
  try {
    if (typeof getStandaloneProjectCarryingItems_ === "function") {
      getStandaloneProjectCarryingItems_(spreadsheet).forEach(function (p) {
        totalInvestments += p.value;
        investmentItems.push({ id: p.id, name: p.name, value: p.value });
      });
    }
  } catch (prjErr) {
    console.error("Balance sheet capital projects error: " + prjErr.message);
  }
  totalInvestments = roundCurrency2_(totalInvestments);

  const totalAssets = roundCurrency2_(totalCash + netLoans + totalInvestments);
  const payables = 0;
  const totalLiabilities = payables;

  const memberSavings = roundCurrency2_(savings);
  const surplusPool = Math.max(0, totalAssets - totalLiabilities - memberSavings);
  const statutoryReserve = Math.max(0, roundCurrency2_(surplusPool * 0.20));
  const retainedSurplus = roundCurrency2_(totalAssets - totalLiabilities - memberSavings - statutoryReserve);
  const totalEquity = roundCurrency2_(memberSavings + statutoryReserve + retainedSurplus);
  const totalLiabilitiesAndEquity = roundCurrency2_(totalLiabilities + totalEquity);
  const variance = roundCurrency2_(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = Math.abs(variance) < 0.01;
  const solvencyBase = totalLiabilities + memberSavings;
  const solvencyRatio =
    solvencyBase > 0
      ? Math.round(((totalAssets / solvencyBase) * 100) * 10) / 10
      : 100;

  return {
    asOfDate: Utilities.formatDate(now || new Date(), tz || "Africa/Nairobi", "dd MMM yyyy"),
    range: effectiveRange,
    assets: {
      cashAndEquivalents: {
        operatingCash: operatingCash,
        cashEquivalents: cashEquivalents,
        totalCash: totalCash,
      },
      loansReceivable: {
        grossLoans: grossLoans,
        allowance: allowance,
        netLoans: netLoans,
      },
      externalInvestments: {
        items: investmentItems,
        totalInvestments: totalInvestments,
      },
      totalAssets: totalAssets,
    },
    liabilities: {
      payables: payables,
      totalLiabilities: totalLiabilities,
    },
    equity: {
      memberSavings: memberSavings,
      statutoryReserve: statutoryReserve,
      retainedSurplus: retainedSurplus,
      totalEquity: totalEquity,
    },
    totalLiabilitiesAndEquity: totalLiabilitiesAndEquity,
    variance: variance,
    isBalanced: isBalanced,
    solvencyRatio: solvencyRatio,
  };
}

/**
 * Builds IFRS / SASRA-aligned Statement of Comprehensive Income (Income & Expenditure)
 * for the active reporting range, including operating revenue, investment yields,
 * categorized operating expenses, impairment provision charge, and SASRA Sec 51 appropriations.
 */
function buildIncomeStatement_(ss, tz, now, effectiveRange, rangeBounds, portfolio, cachedLoanRows) {
  const spreadsheet = ss || getSpreadsheet_();
  const bounds = rangeBounds || getDateRangeBounds_(normalizeRangeKey_(effectiveRange), now || new Date());
  const timeZone = tz || "Africa/Nairobi";

  let loanInterest = 0;
  let ledgerProcessingFees = 0;
  let loansTransactionFees = 0;
  let finesAndPenalties = 0;
  let otherOperatingRevenue = 0;

  let cicMmfNetYield = 0;
  let externalInvestments = 0;

  let bankAndTransactionFees = 0;
  let techAndInfrastructure = 0;
  let agmAndAdmin = 0;
  let otherExpenses = 0;

  // 1a. Loan Interest from approved Loan Repayments in range
  try {
    const repSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOAN_REPAYMENTS);
    if (repSheet && repSheet.getLastRow() > 1) {
      const rRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, repSheet) : repSheet.getDataRange().getValues();
      if (rRows.length > 1) {
        const rCol = getHeaderMap_(rRows[0]);
        const rDateCol =
          rCol["Payment Date"] !== undefined
            ? rCol["Payment Date"]
            : (rCol["Repayment Date"] !== undefined ? rCol["Repayment Date"] : rCol["Date"]);
        const rIntCol =
          rCol["Interest Paid"] !== undefined
            ? rCol["Interest Paid"]
            : rCol["Interest Portion"];
        const rStatCol = rCol["Status"];

        if (rDateCol !== undefined && rIntCol !== undefined) {
          for (let r = 1; r < rRows.length; r++) {
            const row = rRows[r];
            const stat = rStatCol !== undefined ? String(row[rStatCol] || "").trim().toLowerCase() : "";
            if (stat !== "" && stat !== "approved") continue;
            const dt = parseSheetDate_(row[rDateCol]);
            if (!dt || !isWithinRange_(dt, bounds.start, bounds.end)) continue;
            loanInterest += Number(row[rIntCol]) || 0;
          }
        }
      }
    }
  } catch (eRep) {
    console.error("Income statement loan repayments error: " + eRep.message);
  }

  // 1b. Fallback Loan Processing / Transaction Fees from Loans in range
  try {
    let lRows = cachedLoanRows;
    if (!lRows) {
      const lSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.LOANS);
      lRows = lSheet && lSheet.getLastRow() > 1 ? (typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, lSheet) : lSheet.getDataRange().getValues()) : [];
    }
    if (lRows && lRows.length > 1) {
      const lCol = getHeaderMap_(lRows[0]);
      const appDateCol =
        lCol["Approved Date"] !== undefined ? lCol["Approved Date"] : lCol["Request Date"];
      const feeCol = lCol["Transaction Fee"];
      const statCol = lCol["Status"];
      if (appDateCol !== undefined && feeCol !== undefined) {
        for (let k = 1; k < lRows.length; k++) {
          const row = lRows[k];
          const stat = statCol !== undefined ? String(row[statCol] || "").trim().toLowerCase() : "";
          if (stat === "pending" || stat === "rejected") continue;
          const dt = parseSheetDate_(row[appDateCol]);
          if (!dt || !isWithinRange_(dt, bounds.start, bounds.end)) continue;
          loansTransactionFees += Number(row[feeCol]) || 0;
        }
      }
    }
  } catch (eLoanFees) {
    console.error("Income statement loan fees error: " + eLoanFees.message);
  }

  // 2a. CIC MMF & CIC Statement Net Yield in range
  try {
    const fundSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.CIC_STATEMENT);
    if (fundSheet && fundSheet.getLastRow() > 1) {
      const fRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, fundSheet) : fundSheet.getDataRange().getValues();
      if (fRows.length > 1) {
        const fCol = getHeaderMap_(fRows[0]);
        const fDateCol = fCol["Statement Date"] !== undefined ? fCol["Statement Date"] : fCol["Date"];
        const netCol = fCol["Net Yield"];
        const grossCol = fCol["Gross Interest"];
        const taxCol = fCol["Withholding Tax"];
        if (fDateCol !== undefined) {
          for (let f = 1; f < fRows.length; f++) {
            const row = fRows[f];
            const dt = parseSheetDate_(row[fDateCol]);
            if (!dt || !isWithinRange_(dt, bounds.start, bounds.end)) continue;
            const gross = grossCol !== undefined ? (Number(row[grossCol]) || 0) : 0;
            const tax = taxCol !== undefined ? (Number(row[taxCol]) || 0) : 0;
            const netRaw = netCol !== undefined ? row[netCol] : undefined;
            const hasNet = netRaw !== "" && netRaw !== undefined && netRaw !== null && Number(netRaw) !== 0;
            cicMmfNetYield += hasNet ? (Number(netRaw) || 0) : (gross - tax);
          }
        }
      }
    }
  } catch (eFund) {
    console.error("Income statement fund statements error: " + eFund.message);
  }

  // 2b. External Investment realized returns from SHEETS.INVESTMENTS in range
  try {
    const invSheet = getSheetByNameInsensitive_(spreadsheet, SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const iRows = typeof getSheetValuesCached_ === "function" ? getSheetValuesCached_(spreadsheet, invSheet) : invSheet.getDataRange().getValues();
      if (iRows.length > 1) {
        const iCol = getHeaderMap_(iRows[0]);
        const dateCol =
          iCol["Maturity Date"] !== undefined
            ? iCol["Maturity Date"]
            : (iCol["Start Date"] !== undefined
                ? iCol["Start Date"]
                : (iCol["Date Invested"] !== undefined ? iCol["Date Invested"] : iCol["Date"]));
        const roiCol = iCol["ROI Amount"];
        const revCol = iCol["Revenue"];
        const currValCol = iCol["Current Value"];
        const invAmtCol =
          iCol["Money Invested"] !== undefined
            ? iCol["Money Invested"]
            : (iCol["Amount Invested"] !== undefined ? iCol["Amount Invested"] : iCol["Invested"]);
        const statCol = iCol["Status"];

        for (let i = 1; i < iRows.length; i++) {
          const row = iRows[i];
          if (statCol !== undefined) {
            const stat = String(row[statCol] || "").trim().toLowerCase();
            if (stat === "cancelled" || stat === "rejected") continue;
          }
          if (dateCol !== undefined) {
            const rawDt = row[dateCol];
            const dt = parseSheetDate_(rawDt);
            if (!dt || !isWithinRange_(dt, bounds.start, bounds.end)) continue;
          }

          let realized = 0;
          if (roiCol !== undefined && row[roiCol] !== "" && row[roiCol] !== undefined) {
            realized = Number(row[roiCol]) || 0;
          } else if (revCol !== undefined && row[revCol] !== "" && row[revCol] !== undefined) {
            realized = Number(row[revCol]) || 0;
          } else if (currValCol !== undefined && invAmtCol !== undefined) {
            const cv = Number(row[currValCol]) || 0;
            const iv = Number(row[invAmtCol]) || 0;
            realized = Math.max(0, cv - iv);
          }
          externalInvestments += realized;
        }
      }
    }
  } catch (eInv) {
    console.error("Income statement external investments error: " + eInv.message);
  }

  // 1c & 4. InvestmentLedger operating revenue & categorized operating expenses in range
  try {
    {
      const lv = readUnifiedInvestmentLedgerValues_(spreadsheet); // ARC-2 unified ledger
      if (lv.length > 1) {
        const lc = getHeaderMap_(lv[0]);
        if (lc["Date"] !== undefined && lc["Type"] !== undefined && lc["Amount"] !== undefined) {
          for (let j = 1; j < lv.length; j++) {
            const row = lv[j];
            const dt = parseSheetDate_(row[lc["Date"]]);
            if (!dt || !isWithinRange_(dt, bounds.start, bounds.end)) continue;

            const kind = normalizeLedgerType_(row[lc["Type"]]);
            const absAmt = Math.abs(Number(row[lc["Amount"]]) || 0);
            const fee = lc["Transaction Fee"] !== undefined ? (Number(row[lc["Transaction Fee"]]) || 0) : 0;
            const cat = lc["Category"] !== undefined ? String(row[lc["Category"]] || "").trim() : "";
            const desc = lc["Description"] !== undefined ? String(row[lc["Description"]] || "").trim() : "";
            const labelLower = (cat + " " + desc).toLowerCase();

            if (kind === "revenue") {
              if (cat.toLowerCase() === "dividend") {
                // ARC-2: equity share dividends are investment yields, not operating revenue.
                externalInvestments += absAmt;
              } else if (
                labelLower.indexOf("process") !== -1 ||
                labelLower.indexOf("application") !== -1 ||
                labelLower.indexOf("origination") !== -1 ||
                labelLower.indexOf("loan fee") !== -1
              ) {
                ledgerProcessingFees += absAmt;
              } else if (
                labelLower.indexOf("fine") !== -1 ||
                labelLower.indexOf("penalt") !== -1 ||
                labelLower.indexOf("late") !== -1
              ) {
                finesAndPenalties += absAmt;
              } else {
                otherOperatingRevenue += absAmt;
              }
            } else if (kind === "expense") {
              if (fee > 0) {
                bankAndTransactionFees += fee;
              }
              if (
                labelLower.indexOf("bank") !== -1 ||
                labelLower.indexOf("mpesa") !== -1 ||
                labelLower.indexOf("m-pesa") !== -1 ||
                labelLower.indexOf("withdraw") !== -1 ||
                labelLower.indexOf("transaction fee") !== -1 ||
                labelLower.indexOf("transfer fee") !== -1 ||
                labelLower.indexOf("charge") !== -1 ||
                labelLower.indexOf("paybill") !== -1
              ) {
                bankAndTransactionFees += absAmt;
              } else if (
                labelLower.indexOf("tech") !== -1 ||
                labelLower.indexOf("software") !== -1 ||
                labelLower.indexOf("host") !== -1 ||
                labelLower.indexOf("domain") !== -1 ||
                labelLower.indexOf("cloud") !== -1 ||
                labelLower.indexOf("server") !== -1 ||
                labelLower.indexOf("comm") !== -1 ||
                labelLower.indexOf("internet") !== -1 ||
                labelLower.indexOf("sms") !== -1 ||
                labelLower.indexOf("airtime") !== -1
              ) {
                techAndInfrastructure += absAmt;
              } else if (
                labelLower.indexOf("agm") !== -1 ||
                labelLower.indexOf("committee") !== -1 ||
                labelLower.indexOf("meeting") !== -1 ||
                labelLower.indexOf("refreshment") !== -1 ||
                labelLower.indexOf("catering") !== -1 ||
                labelLower.indexOf("stationery") !== -1 ||
                labelLower.indexOf("transport") !== -1 ||
                labelLower.indexOf("legal") !== -1 ||
                labelLower.indexOf("admin") !== -1 ||
                labelLower.indexOf("audit") !== -1
              ) {
                agmAndAdmin += absAmt;
              } else {
                otherExpenses += absAmt;
              }
            }
          }
        }
      }
    }
  } catch (eLedger) {
    console.error("Income statement ledger error: " + eLedger.message);
  }

  loanInterest = roundCurrency2_(loanInterest);
  const processingFees = roundCurrency2_(
    ledgerProcessingFees > 0 ? ledgerProcessingFees : loansTransactionFees
  );
  finesAndPenalties = roundCurrency2_(finesAndPenalties);
  otherOperatingRevenue = roundCurrency2_(otherOperatingRevenue);
  const operatingSubtotal = roundCurrency2_(
    loanInterest + processingFees + finesAndPenalties + otherOperatingRevenue
  );

  cicMmfNetYield = roundCurrency2_(cicMmfNetYield);
  externalInvestments = roundCurrency2_(externalInvestments);
  const investmentSubtotal = roundCurrency2_(cicMmfNetYield + externalInvestments);

  const totalRevenue = roundCurrency2_(operatingSubtotal + investmentSubtotal);

  bankAndTransactionFees = roundCurrency2_(bankAndTransactionFees);
  techAndInfrastructure = roundCurrency2_(techAndInfrastructure);
  agmAndAdmin = roundCurrency2_(agmAndAdmin);
  otherExpenses = roundCurrency2_(otherExpenses);
  const totalExpenses = roundCurrency2_(
    bankAndTransactionFees + techAndInfrastructure + agmAndAdmin + otherExpenses
  );

  const operatingSurplusBeforeImpairment = roundCurrency2_(totalRevenue - totalExpenses);
  const pf = portfolio || {};
  const loanLossProvisionCharge = roundCurrency2_(pf.recommendedProvision);
  const netOperatingSurplus = roundCurrency2_(
    operatingSurplusBeforeImpairment - loanLossProvisionCharge
  );
  const costToIncomeRatio =
    totalRevenue > 0
      ? Math.round(((totalExpenses / totalRevenue) * 100) * 100) / 100
      : 0;

  let statutoryReserveTransfer = 0;
  let distributableMemberPool = 0;
  if (netOperatingSurplus > 0) {
    statutoryReserveTransfer = roundCurrency2_(netOperatingSurplus * 0.20);
    distributableMemberPool = roundCurrency2_(netOperatingSurplus * 0.80);
  }

  return {
    range: effectiveRange,
    periodStart: Utilities.formatDate(bounds.start, timeZone, "dd MMM yyyy"),
    periodEnd: Utilities.formatDate(new Date(bounds.end.getTime() - 1), timeZone, "dd MMM yyyy"),
    operatingRevenue: {
      loanInterest: loanInterest,
      processingFees: processingFees,
      finesAndPenalties: finesAndPenalties,
      otherOperatingRevenue: otherOperatingRevenue,
      operatingSubtotal: operatingSubtotal,
    },
    investmentYields: {
      cicMmfNetYield: cicMmfNetYield,
      externalInvestments: externalInvestments,
      investmentSubtotal: investmentSubtotal,
    },
    totalRevenue: totalRevenue,
    operatingExpenses: {
      bankAndTransactionFees: bankAndTransactionFees,
      techAndInfrastructure: techAndInfrastructure,
      agmAndAdmin: agmAndAdmin,
      otherExpenses: otherExpenses,
      totalExpenses: totalExpenses,
    },
    totalExpenses: totalExpenses,
    operatingSurplusBeforeImpairment: operatingSurplusBeforeImpairment,
    loanLossProvisionCharge: loanLossProvisionCharge,
    netOperatingSurplus: netOperatingSurplus,
    costToIncomeRatio: costToIncomeRatio,
    appropriations: {
      statutoryReserveTransfer: statutoryReserveTransfer,
      distributableMemberPool: distributableMemberPool,
    },
    statutoryReserveTransfer: statutoryReserveTransfer,
    distributableMemberPool: distributableMemberPool,
  };
}

function normalizeRangeKey_(rangeKey) {
  const supported = {
    this_month: true,
    quarter: true,
    year: true,
  };
  const value = String(rangeKey || "year").toLowerCase();
  return supported[value] ? value : "year";
}

function getDateRangeBounds_(rangeKey, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  if (rangeKey === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return {
      start: new Date(now.getFullYear(), quarterStartMonth, 1),
      end: end,
    };
  }

  if (rangeKey === "year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: end,
    };
  }

  return {
    start: start,
    end: end,
  };
}

function getSameRangeLastYearBounds_(rangeBounds) {
  return {
    start: new Date(
      rangeBounds.start.getFullYear() - 1,
      rangeBounds.start.getMonth(),
      rangeBounds.start.getDate()
    ),
    end: new Date(
      rangeBounds.end.getFullYear() - 1,
      rangeBounds.end.getMonth(),
      rangeBounds.end.getDate()
    ),
  };
}

function isWithinRange_(date, start, end) {
  return date >= start && date < end;
}

function calculateGrowthPercent_(current, previous) {
  if (!previous && !current) return 0;
  if (!previous && current > 0) return 100;
  return ((current - previous) / previous) * 100;
}

/**
 * RPT-4: Official AGM & Bank Audit Export Pack.
 * Aggregates Balance Sheet, Income Statement, Investment Projects Summary,
 * and SASRA / prudential financial ratios using the request-scoped SheetContext.
 */
function getAgmAuditPackData(rangeKey) {
  try {
    requireAccess_();
    const effectiveRange = normalizeRangeKey_(rangeKey || "year");
    const homeData = getHomeAnalyticsByRange_(effectiveRange);
    const ctx = typeof getRequestSheetContext_ === "function" ? getRequestSheetContext_() : null;
    try {
      const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
      const tz = (ss && ss.getSpreadsheetTimeZone()) || "Africa/Nairobi";
      const now = new Date();

      const balanceSheet = (homeData && homeData.balanceSheet) || {};
      const incomeStatement = (homeData && homeData.incomeStatement) || {};
      const portfolio = (homeData && homeData.portfolio) || {};

      let projectsSummary = {
        projects: [],
        totals: { approvedBudget: 0, capitalDeployed: 0, revenue: 0, operatingExpenses: 0, netSurplus: 0 },
      };
      if (
        typeof buildProjectsSummary_ === "function" &&
        typeof aggregateLedgerByEntity_ === "function" &&
        typeof readUnifiedInvestmentLedgerValues_ === "function"
      ) {
        const agg = aggregateLedgerByEntity_(readUnifiedInvestmentLedgerValues_(ss));
        projectsSummary = buildProjectsSummary_(ss, agg);
      }

      const totalAssets = Number((balanceSheet.assets && balanceSheet.assets.totalAssets) || 0);
      const totalLiabilities = Number((balanceSheet.liabilities && balanceSheet.liabilities.totalLiabilities) || 0);
      const memberSavings = Number((balanceSheet.equity && balanceSheet.equity.memberSavings) || 0);
      const totalCash = Number(
        (balanceSheet.assets && balanceSheet.assets.cashAndEquivalents && balanceSheet.assets.cashAndEquivalents.totalCash) || 0
      );
      const allowance = Number(
        (balanceSheet.assets && balanceSheet.assets.loansReceivable && balanceSheet.assets.loansReceivable.allowance) || 0
      );
      const totalRevenue = Number(incomeStatement.totalRevenue || 0);
      const totalExpenses = Number(incomeStatement.totalExpenses || 0);
      const netOperatingSurplus = Number(incomeStatement.netOperatingSurplus || 0);
      const recommendedProvision = Number(portfolio.recommendedProvision || 0);

      const solvencyBase = totalLiabilities + memberSavings;
      const solvencyRatio = solvencyBase > 0 ? Math.round((totalAssets / solvencyBase) * 1000) / 10 : 100;

      // Liquidity Ratio: Cash & Cash Equivalents vs Total Liabilities + 15% of Member Savings immediate obligation buffer
      const immediateObligations = totalLiabilities + memberSavings * 0.15;
      const liquidityRatio = immediateObligations > 0 ? Math.round((totalCash / immediateObligations) * 1000) / 10 : 100;

      const costToIncomeRatio = totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 1000) / 10 : 0;
      const returnOnAssets = totalAssets > 0 ? Math.round((netOperatingSurplus / totalAssets) * 10000) / 100 : 0;
      const loanLossReserveCoverage =
        recommendedProvision > 0 ? Math.round((allowance / recommendedProvision) * 1000) / 10 : 100;

      const tsHex = Math.floor(now.getTime() / 1000).toString(16).toUpperCase();
      const verificationRef = "BLG-AGM-" + effectiveRange.toUpperCase() + "-" + tsHex;

      return {
        ok: true,
        data: {
          rangeKey: effectiveRange,
          asOfDate: balanceSheet.asOfDate || Utilities.formatDate(now, tz, "dd MMM yyyy"),
          generatedAt: Utilities.formatDate(now, tz, "dd MMM yyyy HH:mm:ss z"),
          verificationRef: verificationRef,
          balanceSheet: balanceSheet,
          incomeStatement: incomeStatement,
          projectsSummary: projectsSummary,
          ratios: {
            solvencyRatio: solvencyRatio,
            liquidityRatio: liquidityRatio,
            costToIncomeRatio: costToIncomeRatio,
            returnOnAssets: returnOnAssets,
            loanLossReserveCoverage: loanLossReserveCoverage,
          },
        },
      };
    } finally {
      if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function csvEscapeCell_(val) {
  if (typeof val === "number") {
    return isFinite(val) ? String(val) : "0";
  }
  const sanitized =
    typeof safeCellText_ === "function"
      ? safeCellText_(val)
      : (function (v) {
          const s = String(v === undefined || v === null ? "" : v).trim().slice(0, 500);
          return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
        })(val);
  if (/[",\r\n]/.test(sanitized)) {
    return '"' + sanitized.replace(/"/g, '""') + '"';
  }
  return sanitized;
}

/**
 * RPT-4: Exports the Official AGM & Bank Audit Pack as an RFC-4180 CSV
 * with formula-injection neutralization via safeCellText_().
 */
function exportAgmAuditPackCSV(rangeKey) {
  try {
    const res = getAgmAuditPackData(rangeKey);
    if (!res || !res.ok || !res.data) {
      return { ok: false, error: (res && res.error) || "Failed to generate AGM Audit Pack." };
    }

    const d = res.data;
    const bs = d.balanceSheet || {};
    const is = d.incomeStatement || {};
    const ratios = d.ratios || {};
    const proj = d.projectsSummary || { projects: [], totals: {} };

    const lines = [];
    const pushRow = function (cols) {
      lines.push(cols.map(csvEscapeCell_).join(","));
    };

    pushRow(["BRIGHTLIFE SHG - OFFICIAL AGM & BANK AUDIT PACK"]);
    pushRow(["Verification Reference", d.verificationRef]);
    pushRow(["Reporting Range", d.rangeKey]);
    pushRow(["As Of Date", d.asOfDate]);
    pushRow(["Generated At", d.generatedAt]);
    pushRow([]);

    pushRow(["SECTION 1: SASRA / PRUDENTIAL FINANCIAL RATIOS", "Value"]);
    pushRow(["Solvency Ratio (%)", ratios.solvencyRatio]);
    pushRow(["Liquidity Ratio (%)", ratios.liquidityRatio]);
    pushRow(["Cost-to-Income Ratio (%)", ratios.costToIncomeRatio]);
    pushRow(["Return on Assets (%)", ratios.returnOnAssets]);
    pushRow(["Loan Loss Reserve Coverage (%)", ratios.loanLossReserveCoverage]);
    pushRow([]);

    const assets = bs.assets || {};
    const cash = assets.cashAndEquivalents || {};
    const loansRec = assets.loansReceivable || {};
    const extInv = assets.externalInvestments || {};
    const liab = bs.liabilities || {};
    const eq = bs.equity || {};

    pushRow(["SECTION 2: STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)", "Amount (KES)"]);
    pushRow(["Operating Cash (Bank / Till)", cash.operatingCash || 0]);
    pushRow(["Cash Equivalents (MMF / Funds)", cash.cashEquivalents || 0]);
    pushRow(["Total Cash & Equivalents", cash.totalCash || 0]);
    pushRow(["Gross Loans Receivable", loansRec.grossLoans || 0]);
    pushRow(["Less: Loan Loss Allowance", loansRec.allowance || 0]);
    pushRow(["Net Loans Receivable", loansRec.netLoans || 0]);
    pushRow(["External Investments", extInv.totalInvestments || 0]);
    pushRow(["TOTAL ASSETS", assets.totalAssets || 0]);
    pushRow(["Payables / Liabilities", liab.payables || 0]);
    pushRow(["TOTAL LIABILITIES", liab.totalLiabilities || 0]);
    pushRow(["Member Savings", eq.memberSavings || 0]);
    pushRow(["Statutory Reserve (20%)", eq.statutoryReserve || 0]);
    pushRow(["Retained Surplus", eq.retainedSurplus || 0]);
    pushRow(["TOTAL EQUITY", eq.totalEquity || 0]);
    pushRow(["TOTAL LIABILITIES & EQUITY", bs.totalLiabilitiesAndEquity || 0]);
    pushRow(["Balance Sheet Variance", bs.variance || 0]);
    pushRow([]);

    const opRev = is.operatingRevenue || {};
    const invY = is.investmentYields || {};
    const opExp = is.operatingExpenses || {};
    const app = is.appropriations || {};

    pushRow(["SECTION 3: STATEMENT OF COMPREHENSIVE INCOME", "Amount (KES)"]);
    pushRow(["Loan Interest Income", opRev.loanInterest || 0]);
    pushRow(["Processing Fees", opRev.processingFees || 0]);
    pushRow(["Fines & Penalties", opRev.finesAndPenalties || 0]);
    pushRow(["Other Operating Revenue", opRev.otherOperatingRevenue || 0]);
    pushRow(["CIC MMF Net Yield", invY.cicMmfNetYield || 0]);
    pushRow(["External Investment Yields", invY.externalInvestments || 0]);
    pushRow(["TOTAL REVENUE", is.totalRevenue || 0]);
    pushRow(["Bank & Transaction Fees", opExp.bankAndTransactionFees || 0]);
    pushRow(["Tech & Infrastructure", opExp.techAndInfrastructure || 0]);
    pushRow(["AGM & Admin", opExp.agmAndAdmin || 0]);
    pushRow(["Other Expenses", opExp.otherExpenses || 0]);
    pushRow(["TOTAL OPERATING EXPENSES", is.totalExpenses || 0]);
    pushRow(["Loan Loss Provision Charge", is.loanLossProvisionCharge || 0]);
    pushRow(["NET OPERATING SURPLUS", is.netOperatingSurplus || 0]);
    pushRow(["Statutory Reserve Transfer (20%)", app.statutoryReserveTransfer || 0]);
    pushRow(["Distributable Member Pool (80%)", app.distributableMemberPool || 0]);
    pushRow([]);

    pushRow([
      "SECTION 4: INVESTMENT PROJECTS SUMMARY",
      "Project Name",
      "Category",
      "Status",
      "Approved Budget (KES)",
      "Capital Deployed (KES)",
      "Revenue (KES)",
      "Operating Expenses (KES)",
      "Net Surplus (KES)",
      "Return on Capital (%)",
    ]);
    (proj.projects || []).forEach(function (p) {
      pushRow([
        p.id,
        p.name,
        p.category,
        p.status,
        p.approvedBudget || 0,
        p.capitalDeployed || 0,
        p.revenue || 0,
        p.operatingExpenses || 0,
        p.netSurplus || 0,
        p.returnOnCapitalPct || 0,
      ]);
    });
    const pt = proj.totals || {};
    pushRow([
      "TOTALS",
      "",
      "",
      "",
      pt.approvedBudget || 0,
      pt.capitalDeployed || 0,
      pt.revenue || 0,
      pt.operatingExpenses || 0,
      pt.netSurplus || 0,
      "",
    ]);

    return {
      ok: true,
      filename: "Brightlife_AGM_Audit_Pack_" + d.rangeKey + "_" + d.verificationRef + ".csv",
      csv: lines.join("\r\n"),
      verificationRef: d.verificationRef,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
