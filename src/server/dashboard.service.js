function getDashboardData() {
  requireAccess_();
  const ss = getSpreadsheet_();
  const members = getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();
  const loans = getRequiredSheet_(SHEETS.LOANS).getDataRange().getValues();
  const guarantors = getRequiredSheet_(SHEETS.GUARANTORS).getDataRange().getValues();

  let totalPool = 0;
  let totalActiveLoans = 0;
  let pendingLoansCount = 0;

  for (let i = 1; i < members.length; i++) {
    totalPool += Number(members[i][6]) || 0;
  }

  const guarantorMap = {};
  for (let j = 1; j < guarantors.length; j++) {
    const loanId = guarantors[j][0];
    if (!guarantorMap[loanId]) guarantorMap[loanId] = [];
    guarantorMap[loanId].push({
      name: guarantors[j][1],
      amount: guarantors[j][2],
    });
  }

  const loanList = [];
  for (let k = 1; k < loans.length; k++) {
    const loanId = loans[k][0];
    const status = loans[k][5];
    if (status === LOAN_STATUS.ACTIVE) totalActiveLoans += Number(loans[k][2]) || 0;
    if (status === LOAN_STATUS.PENDING) pendingLoansCount++;

    loanList.push({
      id: loanId,
      borrower: loans[k][1],
      amount: Number(loans[k][2]) || 0,
      status: status,
      guarantors: guarantorMap[loanId] || [],
    });
  }

  return {
    stats: {
      pool: totalPool,
      activeLoans: totalActiveLoans,
      cash: totalPool - totalActiveLoans,
      pending: pendingLoansCount,
    },
    loans: loanList,
  };
}

function clearDashboardCache_() {
  try {
    var cache = CacheService.getScriptCache();
    cache.removeAll(["home_analytics_year", "home_analytics_quarter", "home_analytics_this_month"]);
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

  const ss = getSpreadsheet_();
  const now = new Date();
  const currentYear = now.getFullYear();
  const tz = ss.getSpreadsheetTimeZone();
  const rangeBounds = getDateRangeBounds_(effectiveRange, now);

  const memberRows = getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();
  const contributionRows = getRequiredSheet_(SHEETS.CONTRIBUTIONS).getDataRange().getValues();
  const loanRows = getRequiredSheet_(SHEETS.LOANS).getDataRange().getValues();

  let totalSavings = 0;
  let totalLoans = 0;
  let memberCount = 0;

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
  let aging = { current: 0, par30: 0, par60: 0, par90: 0 };
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

        // Classify into PAR & SASRA aging buckets
        if (isOverdue) {
          parAmount += balanceAmount;
          if (daysPastDue <= 30) aging.par30 += balanceAmount;
          else if (daysPastDue <= 90) aging.par60 += balanceAmount;
          else aging.par90 += balanceAmount;
        } else {
          aging.current += balanceAmount;
        }
      }
    }
  }

  const repaymentRate = totalRepaymentDue > 0 ? (totalPaid / totalRepaymentDue) * 100 : 0;
  const parRate = totalOutstanding > 0 ? (parAmount / totalOutstanding) * 100 : 0;
  const performingAmount = Math.max(0, totalOutstanding - parAmount);
  const performingRate = totalOutstanding > 0 ? (performingAmount / totalOutstanding) * 100 : 0;
  const recommendedProvision = (0.01 * aging.current) + (0.05 * aging.par30) + (0.25 * aging.par60) + (0.50 * aging.par90);

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
    const invSheet = getSpreadsheet_().getSheetByName(SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const invValues = invSheet.getDataRange().getValues();
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
    invested: 0,
    investmentCount: investmentCount,
    memberCount: memberCount,
    cash: liquiditySummary.cash,
    liquidity: liquiditySummary.liquidity,
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
    portfolio: {
      repaymentRate: repaymentRate,
      parRate: parRate,
      totalOutstanding: totalOutstanding,
      parAmount: parAmount,
      performingAmount: performingAmount,
      performingRate: performingRate,
      aging: aging,
      recommendedProvision: recommendedProvision,
    },
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
      const accRows = accSheet.getDataRange().getValues();
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

  // Fallback Tier 2: Latest Fund Statements closing balance per channel if Accounts yielded no balance
  if (totalStatementCash === 0) {
    try {
      const fundSheet = getSheetByNameInsensitive_(ss, SHEETS.FUND_STATEMENTS);
      if (fundSheet && fundSheet.getLastRow() > 1) {
        const fRows = fundSheet.getDataRange().getValues();
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
    const sheet = ss.getSheetByName(SHEETS.ACCOUNTS);
    if (!sheet) return { labels: labels, values: values, rows: rows };
    const raw = sheet.getDataRange().getValues();
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
      const values = sheet.getDataRange().getValues();
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
      const rv = repSheet.getDataRange().getValues();
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
    const fundSheet = getSheetByNameInsensitive_(ss, SHEETS.FUND_STATEMENTS);
    if (fundSheet && fundSheet.getLastRow() > 1) {
      const fv = fundSheet.getDataRange().getValues();
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
      const lvLoans = loanSheet.getDataRange().getValues();
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
    const ledgerSheet = getSheetByNameInsensitive_(ss, SHEETS.INVESTMENT_LEDGER);
    if (ledgerSheet) {
      const lv = ledgerSheet.getDataRange().getValues();
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
      cRows = cSheet && cSheet.getLastRow() > 1 ? cSheet.getDataRange().getValues() : [];
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
      lRows = lSheet && lSheet.getLastRow() > 1 ? lSheet.getDataRange().getValues() : [];
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
      const rRows = repSheet.getDataRange().getValues();
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
