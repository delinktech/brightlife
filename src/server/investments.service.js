/**
 * Investments master list and per-investment ledger (InvestmentLedger sheet).
 */

function getInvestmentsData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.INVESTMENTS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, investments: [], totalPages: 0, currentPage: 1 };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      [
        "Investment ID",
        "Name",
        "Start Date",
        "Money Invested",
        "Revenue",
        "ROI Amount",
        "ROI %",
        "Status",
      ],
      SHEETS.INVESTMENTS
    );

    const dataRows = values.slice(1).filter(function (row) {
      return row[col["Investment ID"]] !== "";
    });
    const totalPages = Math.ceil(dataRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const tz = ss.getSpreadsheetTimeZone();

    const investments = dataRows.slice(start, start + pageLimit).map(function (row) {
      const roiPct = row[col["ROI %"]];
      return {
        id: row[col["Investment ID"]],
        name: row[col["Name"]] || "",
        startDate: formatDateValue_(row[col["Start Date"]], tz),
        moneyInvested: Number(row[col["Money Invested"]]) || 0,
        revenue: Number(row[col["Revenue"]]) || 0,
        roiAmount: Number(row[col["ROI Amount"]]) || 0,
        roiPercent: Number(roiPct) || 0,
        status: String(row[col["Status"]] || "").trim() || "Active",
      };
    });

    return {
      success: true,
      investments: investments,
      totalPages: totalPages,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message, investments: [], totalPages: 0, currentPage: 1 };
  }
}

function getInvestmentLedger(investmentId) {
  try {
    requireAccess_();
    if (!investmentId) {
      return { success: false, error: "Investment ID is required.", entries: [], summary: null };
    }

    const ss = getSpreadsheet_();
    // ARC-2: merged view of legacy InvestmentLedger + Investment Cashflows (works for project IDs too).
    const values = readUnifiedInvestmentLedgerValues_(ss);
    if (values.length <= 1) {
      return {
        success: true,
        investmentId: investmentId,
        entries: [],
        summary: emptyLedgerSummary_(),
      };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      ["Date", "Investment ID", "Type", "Category", "Description", "Amount", "Transaction Fee"],
      SHEETS.INVESTMENT_LEDGER
    );

    const tz = ss.getSpreadsheetTimeZone();
    const rows = values.slice(1).filter(function (row) {
      return String(row[col["Investment ID"]] || "").trim() === String(investmentId).trim();
    });

    rows.sort(function (a, b) {
      const da = a[col["Date"]];
      const db = b[col["Date"]];
      const ta = da instanceof Date ? da.getTime() : 0;
      const tb = db instanceof Date ? db.getTime() : 0;
      return tb - ta;
    });

    let operatingExpenses = 0;
    let capitalExpenditures = 0;
    let transactionFeesOnSpend = 0;
    let revenue = 0;
    let totalWithdrawals = 0;
    const revenueByCategory = {};
    const withdrawalByCategory = {};

    const entries = rows.map(function (row) {
      const amount = Number(row[col["Amount"]]) || 0;
      const fee = Number(row[col["Transaction Fee"]]) || 0;
      const kind = normalizeLedgerType_(row[col["Type"]]);
      const absAmt = Math.abs(amount);
      const catLabel = ledgerCategoryLabel_(row[col["Category"]]);
      if (kind === "capital in") {
        capitalExpenditures += absAmt;
        transactionFeesOnSpend += fee;
      } else if (kind === "revenue") {
        revenue += absAmt;
        revenueByCategory[catLabel] = (revenueByCategory[catLabel] || 0) + absAmt;
      } else if (kind === "expense") {
        operatingExpenses += absAmt;
        transactionFeesOnSpend += fee;
      } else if (kind === "withdrawal") {
        totalWithdrawals += absAmt;
        withdrawalByCategory[catLabel] = (withdrawalByCategory[catLabel] || 0) + absAmt;
      }
      return {
        date: formatDateValue_(row[col["Date"]], tz),
        type: String(row[col["Type"]] || "").trim(),
        typeKey: kind,
        category: String(row[col["Category"]] || "").trim(),
        description: String(row[col["Description"]] || "").trim(),
        amount: amount,
        transactionFee: fee,
      };
    });

    var totalExpenditures =
      operatingExpenses + capitalExpenditures + transactionFeesOnSpend;

    return {
      success: true,
      investmentId: investmentId,
      entries: entries,
      summary: {
        revenue: revenue,
        revenueBreakdown: breakdownToArray_(revenueByCategory),
        operatingExpenses: operatingExpenses,
        capitalExpenditures: capitalExpenditures,
        transactionFees: transactionFeesOnSpend,
        totalExpenditures: totalExpenditures,
        totalWithdrawals: totalWithdrawals,
        withdrawalBreakdown: breakdownToArray_(withdrawalByCategory),
      },
    };
  } catch (error) {
    return { success: false, error: error.message, entries: [], summary: null };
  }
}

function emptyLedgerSummary_() {
  return {
    revenue: 0,
    revenueBreakdown: [],
    operatingExpenses: 0,
    capitalExpenditures: 0,
    transactionFees: 0,
    totalExpenditures: 0,
    totalWithdrawals: 0,
    withdrawalBreakdown: [],
  };
}

function ledgerCategoryLabel_(raw) {
  var s = String(raw || "").trim();
  return s || "Uncategorized";
}

function breakdownToArray_(map) {
  return Object.keys(map)
    .map(function (k) {
      return { category: k, amount: map[k] };
    })
    .sort(function (a, b) {
      return b.amount - a.amount;
    });
}

/**
 * Sheet types: Capital in (CapEx / fixed assets), Expense (OpEx), Revenue, Withdrawal.
 */
function normalizeLedgerType_(raw) {
  var t = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (t === "capital in" || t === "capital-in") return "capital in";
  if (t === "expense") return "expense";
  if (t === "revenue") return "revenue";
  if (t === "withdrawal") return "withdrawal";
  return t;
}
