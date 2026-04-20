function getDashboardData() {
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

function getHomeAnalytics(rangeKey) {
  return getHomeAnalyticsByRange_(rangeKey || "year");
}

function getHomeAnalyticsByRange_(rangeKey) {
  const ss = getSpreadsheet_();
  const now = new Date();
  const currentYear = now.getFullYear();
  const tz = ss.getSpreadsheetTimeZone();
  const effectiveRange = normalizeRangeKey_(rangeKey);
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

  if (loanRows.length > 1) {
    const loanHeaders = loanRows[0];
    const loanCol = getHeaderMap_(loanHeaders);
    requireHeaders_(
      loanCol,
      ["Status", "Repayment Amount", "Total Paid", "Balance", "Shortfall Amount"],
      SHEETS.LOANS
    );

    for (let k = 1; k < loanRows.length; k++) {
      const status = String(loanRows[k][loanCol["Status"]] || "").trim();
      const repaymentAmount = Number(loanRows[k][loanCol["Repayment Amount"]]) || 0;
      const paidAmount = Number(loanRows[k][loanCol["Total Paid"]]) || 0;
      const balanceAmount = Number(loanRows[k][loanCol["Balance"]]) || 0;
      const shortfallAmount = Number(loanRows[k][loanCol["Shortfall Amount"]]) || 0;

      if (status === LOAN_STATUS.ACTIVE) activeLoanCount++;
      if (status === LOAN_STATUS.PENDING) pendingLoanCount++;
      if (status === LOAN_STATUS.SETTLED) settledLoanCount++;

      if (status !== LOAN_STATUS.REJECTED) {
        totalRepaymentDue += repaymentAmount;
        totalPaid += paidAmount;
      }

      if (status === LOAN_STATUS.ACTIVE && balanceAmount > 0) {
        totalOutstanding += balanceAmount;
        if (shortfallAmount > 0) {
          parAmount += shortfallAmount;
        }
      }
    }
  }

  const repaymentRate = totalRepaymentDue > 0 ? (totalPaid / totalRepaymentDue) * 100 : 0;
  const parRate = totalOutstanding > 0 ? (parAmount / totalOutstanding) * 100 : 0;

  const monthLabels = [];
  const monthValues = [];
  const trendMonths = effectiveRange === "this_month" ? 6 : 12;
  for (let m = trendMonths - 1; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthLabels.push(Utilities.formatDate(d, tz, "MMM yy"));
    monthValues.push(monthlyContributionMap[key] || 0);
  }

  const yearKeys = Object.keys(yearlyContributionMap)
    .map(function (value) {
      return Number(value);
    })
    .sort(function (a, b) {
      return a - b;
    });
  const recentYears = yearKeys.slice(-5);
  const yearlySeries = recentYears.map(function (year) {
    return {
      year: String(year),
      total: yearlyContributionMap[year] || 0,
    };
  });

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

  return {
    range: effectiveRange,
    savings: totalSavings,
    loans: totalLoans,
    invested: 0,
    investmentCount: investmentCount,
    memberCount: memberCount,
    cash: totalSavings - totalLoans,
    yearlyContributions: filteredContributions,
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
    investments: buildInvestmentHomeCharts_(tz, now, effectiveRange, rangeBounds),
  };
}

/**
 * Home dashboard: investment charts (optional sheets — missing tabs return empty series).
 */
function buildInvestmentHomeCharts_(tz, now, effectiveRange, rangeBounds) {
  const investedVsRevenue = [];
  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEETS.INVESTMENTS);
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

  const monthlyRev = {};
  const monthlyExp = {};
  const revenueByCategoryMap = {};
  try {
    const ledgerSheet = getSpreadsheet_().getSheetByName(SHEETS.INVESTMENT_LEDGER);
    if (ledgerSheet) {
      const lv = ledgerSheet.getDataRange().getValues();
      if (lv.length > 1) {
        const lc = getHeaderMap_(lv[0]);
        if (
          lc["Date"] !== undefined &&
          lc["Type"] !== undefined &&
          lc["Category"] !== undefined &&
          lc["Amount"] !== undefined &&
          lc["Transaction Fee"] !== undefined
        ) {
          for (let j = 1; j < lv.length; j++) {
            const row = lv[j];
            const rawDate = row[lc["Date"]];
            if (!(rawDate instanceof Date)) continue;
            const kind = normalizeLedgerType_(row[lc["Type"]]);
            const absAmt = Math.abs(Number(row[lc["Amount"]]) || 0);
            const fee = Number(row[lc["Transaction Fee"]]) || 0;
            const catLabel = ledgerCategoryLabel_(row[lc["Category"]]);
            const monthKey =
              rawDate.getFullYear() + "-" + String(rawDate.getMonth() + 1).padStart(2, "0");

            if (kind === "revenue") {
              monthlyRev[monthKey] = (monthlyRev[monthKey] || 0) + absAmt;
              if (isWithinRange_(rawDate, rangeBounds.start, rangeBounds.end)) {
                revenueByCategoryMap[catLabel] = (revenueByCategoryMap[catLabel] || 0) + absAmt;
              }
            } else if (kind === "expense") {
              monthlyExp[monthKey] = (monthlyExp[monthKey] || 0) + absAmt + fee;
            } else if (kind === "capital in") {
              monthlyExp[monthKey] = (monthlyExp[monthKey] || 0) + absAmt + fee;
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

  return {
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
