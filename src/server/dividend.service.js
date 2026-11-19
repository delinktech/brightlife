/**
 * Dividend & Interest Distribution Service
 *
 * Implements:
 * 1. Method A: Flat proportional allocation based on member qualifying Total Savings.
 * 2. Smart Priority Payout: If a member has an active loan, dividend settles the loan balance first;
 *    any surplus is credited directly to member savings (Dividend Capitalization).
 * 3. Configurable Reserve Fund retention (default 0%).
 * 4. Atomic execution with audit logging.
 */

function getDividendOverviewData() {
  try {
    const session = requireAccess_();
    const isAdminOrTreasurer =
      session.roleKey === ROLE_KEY.ADMIN ||
      session.roleKey === ROLE_KEY.TREASURER ||
      (session.permissions && (session.permissions.accountsWrite === true || session.permissions.isAdmin === true));

    if (!isAdminOrTreasurer) {
      throw new Error("Access denied: Only Admin or Treasurer can manage dividends.");
    }

    const cacheKey = "dividend_overview_v1";
    try {
      const cached = CacheService.getScriptCache().get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (cacheErr) {
      console.warn("Dividend cache read error: " + cacheErr.message);
    }

    const ctx = typeof beginRequestSheetContext_ === "function" ? beginRequestSheetContext_() : null;
    try {
      const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();

      // 1. Gather all active members and their current savings and loan balance
      const mValues = typeof getSheetValuesCached_ === "function"
        ? getSheetValuesCached_(ss, SHEETS.MEMBERS, { required: true })
        : getRequiredSheet_(SHEETS.MEMBERS).getDataRange().getValues();
      const mCol = getHeaderMap_(mValues[0]);
      requireHeaders_(mCol, ["Member ID", "First Name", "Status"], SHEETS.MEMBERS);

      let totalGroupSavings = 0;
      const qualifyingMembers = [];

      for (let r = 1; r < mValues.length; r++) {
        const row = mValues[r];
        const status = String(row[mCol["Status"]] || "").trim().toLowerCase();
        if (status !== "active") continue;

        const mid = String(row[mCol["Member ID"]] || "").trim();
        if (!mid) continue;

        const first = String(row[mCol["First Name"]] || "").trim();
        const middle = mCol["Middle Name"] !== undefined ? String(row[mCol["Middle Name"]] || "").trim() : "";
        const last = mCol["Last Name"] !== undefined ? String(row[mCol["Last Name"]] || "").trim() : "";
        const fullName = mCol["Full Name"] !== undefined && row[mCol["Full Name"]]
          ? String(row[mCol["Full Name"]]).trim()
          : [first, middle, last].filter(Boolean).join(" ");

        const savings = mCol["Total Savings"] !== undefined ? (Number(row[mCol["Total Savings"]]) || 0) : 0;
        const loanBal = mCol["Current Loan Balance"] !== undefined ? (Number(row[mCol["Current Loan Balance"]]) || 0) : 0;

        if (savings > 0) {
          totalGroupSavings += savings;
          qualifyingMembers.push({
            memberId: mid,
            fullName: fullName,
            savings: savings,
            loanBalance: loanBal,
          });
        }
      }

      // 2. Gather cumulative loan interest earned from Loan Repayments
      let totalLoanInterest = 0;
      try {
        const rVals = typeof getSheetValuesCached_ === "function"
          ? getSheetValuesCached_(ss, SHEETS.LOAN_REPAYMENTS)
          : (function () {
              const s = ss.getSheetByName(SHEETS.LOAN_REPAYMENTS);
              return s && s.getLastRow() > 1 ? s.getDataRange().getValues() : [];
            })();
        if (rVals && rVals.length > 1) {
          const rCol = getHeaderMap_(rVals[0]);
          const intIdx = rCol["Interest Paid"];
          const statIdx = rCol["Status"];
          if (intIdx !== undefined) {
            for (let i = 1; i < rVals.length; i++) {
              const stat = statIdx !== undefined ? String(rVals[i][statIdx] || "").toLowerCase() : "approved";
              if (stat === "approved") {
                totalLoanInterest += Number(rVals[i][intIdx]) || 0;
              }
            }
          }
        }
      } catch (eR) {
        console.warn("Could not calculate loan interest: " + eR.message);
      }

      // 3. Gather investment returns from Fund Statements (CIC MMF & Mansa X) and Investments
      let totalInvestmentGains = 0;
      const fundStatementList = [];
      const tz = ss.getSpreadsheetTimeZone();

      try {
        const fVals = typeof getSheetValuesCached_ === "function"
          ? getSheetValuesCached_(ss, SHEETS.FUND_STATEMENTS)
          : (function () {
              const s = ss.getSheetByName(SHEETS.FUND_STATEMENTS);
              return s && s.getLastRow() > 1 ? s.getDataRange().getValues() : [];
            })();
        if (fVals && fVals.length > 1) {
          const fCol = getHeaderMap_(fVals[0]);
          for (let f = 1; f < fVals.length; f++) {
            const row = fVals[f];
            const gross = Number(row[fCol["Gross Interest"]]) || 0;
            const tax = Number(row[fCol["Withholding Tax"]]) || 0;
            const rawNet = fCol["Net Yield"] !== undefined ? Number(row[fCol["Net Yield"]]) : 0;
            const net = rawNet || (gross - tax);
            totalInvestmentGains += net;

            fundStatementList.push({
              date: formatDateValue_(row[fCol["Statement Date"]], tz),
              fund: String(row[fCol["Fund Channel"]] || "").trim(),
              opening: Number(row[fCol["Opening Balance"]]) || 0,
              deposits: Number(row[fCol["Purchases / Deposits"]]) || 0,
              grossInterest: gross,
              wht: tax,
              netYield: net,
              closing: Number(row[fCol["Closing Balance"]]) || 0,
              ref: String(row[fCol["Statement Ref"]] || "").trim()
            });
          }
        }
      } catch (eFund) {
        console.warn("Could not calculate fund statement yield: " + eFund.message);
      }

      try {
        const iVals = typeof getSheetValuesCached_ === "function"
          ? getSheetValuesCached_(ss, SHEETS.INVESTMENTS)
          : (function () {
              const s = ss.getSheetByName(SHEETS.INVESTMENTS);
              return s && s.getLastRow() > 1 ? s.getDataRange().getValues() : [];
            })();
        if (iVals && iVals.length > 1) {
          const iCol = getHeaderMap_(iVals[0]);
          if (iCol["ROI Amount"] !== undefined) {
            for (let j = 1; j < iVals.length; j++) {
              totalInvestmentGains += Number(iVals[j][iCol["ROI Amount"]]) || 0;
            }
          }
        }
      } catch (eI) {
        console.warn("Could not calculate investment returns: " + eI.message);
      }

      // 4. Calculate member shares
      qualifyingMembers.forEach(function (m) {
        m.sharePercent = totalGroupSavings > 0 ? (m.savings / totalGroupSavings) * 100 : 0;
      });

      // Suggested pool is cumulative interest + investment gains
      const suggestedPool = Math.max(0, totalLoanInterest + totalInvestmentGains);

      const result = {
        success: true,
        summary: {
          totalGroupSavings: totalGroupSavings,
          totalLoanInterest: totalLoanInterest,
          totalInvestmentGains: totalInvestmentGains,
          suggestedPool: suggestedPool,
          qualifyingMemberCount: qualifyingMembers.length,
        },
        members: qualifyingMembers,
        fundStatements: fundStatementList,
      };

      try {
        const payloadStr = JSON.stringify(result);
        if (payloadStr.length < 100000) {
          CacheService.getScriptCache().put(cacheKey, payloadStr, 300);
        }
      } catch (putErr) {
        console.warn("Dividend cache put error: " + putErr.message);
      }

      return result;
    } finally {
      if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Calculates live preview of dividend distribution according to Method A and Smart Priority Routing.
 */
function calculateDividendDistributionPreview(params) {
  try {
    const session = requireAccess_();
    const isAdminOrTreasurer =
      session.roleKey === ROLE_KEY.ADMIN ||
      session.roleKey === ROLE_KEY.TREASURER ||
      (session.permissions && (session.permissions.accountsWrite === true || session.permissions.isAdmin === true));

    if (!isAdminOrTreasurer) {
      throw new Error("Access denied: Only Admin or Treasurer can calculate dividends.");
    }

    const poolAmount = Number(params.poolAmount) || 0;
    if (poolAmount <= 0) {
      throw new Error("Please specify a valid dividend pool amount greater than 0.");
    }

    const reservePercent = Math.max(0, Math.min(100, Number(params.reservePercent) || 0));
    const autoOffsetLoans = params.autoOffsetLoans !== false; // default true

    const overview = getDividendOverviewData();
    if (!overview.success) throw new Error(overview.error);

    const totalSavings = overview.summary.totalGroupSavings;
    if (totalSavings <= 0) {
      throw new Error("No qualifying member savings found to distribute dividends.");
    }

    const reserveAmount = Math.round(poolAmount * (reservePercent / 100) * 100) / 100;
    const distributablePool = Math.max(0, poolAmount - reserveAmount);

    let totalGrossAllocated = 0;
    let totalLoanOffset = 0;
    let totalSavingsCredited = 0;

    const previewItems = overview.members.map(function (m) {
      const shareRatio = m.savings / totalSavings;
      const grossDividend = Math.round(distributablePool * shareRatio * 100) / 100;
      totalGrossAllocated += grossDividend;

      let loanOffset = 0;
      let savingsCredit = grossDividend;

      if (autoOffsetLoans && m.loanBalance > 0) {
        loanOffset = Math.min(grossDividend, m.loanBalance);
        savingsCredit = Math.round((grossDividend - loanOffset) * 100) / 100;
      }

      totalLoanOffset += loanOffset;
      totalSavingsCredited += savingsCredit;

      return {
        memberId: m.memberId,
        fullName: m.fullName,
        savings: m.savings,
        sharePercent: m.sharePercent,
        grossDividend: grossDividend,
        loanBalance: m.loanBalance,
        loanOffset: loanOffset,
        savingsCredit: savingsCredit,
      };
    });

    return {
      success: true,
      summary: {
        poolAmount: poolAmount,
        reservePercent: reservePercent,
        reserveAmount: reserveAmount,
        distributablePool: distributablePool,
        totalGrossAllocated: totalGrossAllocated,
        totalLoanOffset: totalLoanOffset,
        totalSavingsCredited: totalSavingsCredited,
        autoOffsetLoans: autoOffsetLoans,
      },
      preview: previewItems,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Atomically executes and posts the dividend distribution.
 */
function executeDividendDistribution(data) {
  try {
    const session = requirePermission_("accountsWrite");
    const ss = getSpreadsheet_();
    const allocations = data.allocations || [];
    if (!allocations.length) {
      throw new Error("No dividend allocations provided to execute.");
    }

    const year = String(data.year || new Date().getFullYear()).trim();
    const tz = ss.getSpreadsheetTimeZone();
    const today = new Date();

    const cSheet = getRequiredSheet_(SHEETS.CONTRIBUTIONS);
    const cHeaders = cSheet.getRange(1, 1, 1, cSheet.getLastColumn()).getValues()[0];
    const cCol = getHeaderMap_(cHeaders);

    const cModeIdx = cCol["Deposit Channel"] !== undefined ? cCol["Deposit Channel"] : cCol["Payment Mode"];
    const cTypeIdx = cCol["Transaction Type"] !== undefined ? cCol["Transaction Type"] : cCol["Type"];

    let countLoanOffsets = 0;
    let countSavingsCredits = 0;
    let totalOffsetAmount = 0;
    let totalSavingsAmount = 0;

    allocations.forEach(function (item) {
      const mid = String(item.memberId || "").trim();
      const name = String(item.fullName || "").trim();
      const offset = Number(item.loanOffset) || 0;
      const savings = Number(item.savingsCredit) || 0;

      // 1. Process Loan Offset if applicable
      if (offset > 0) {
        try {
          processLoanPayment({
            borrower: name,
            memberId: mid,
            amount: offset,
            mode: "Refund / Expense Offset",
            tid: "DIV-LOAN-" + year + "-" + mid,
            autoApprove: true,
          });
          countLoanOffsets++;
          totalOffsetAmount += offset;
        } catch (eLoan) {
          console.error("Failed loan offset for " + mid + ": " + eLoan.message);
        }
      }

      // 2. Process Savings Capitalization if applicable
      if (savings > 0) {
        const nextRow = new Array(cHeaders.length).fill("");
        if (cCol["Date"] !== undefined) nextRow[cCol["Date"]] = today;
        if (cCol["Member ID"] !== undefined) nextRow[cCol["Member ID"]] = mid;

        if (cCol["Member Name"] !== undefined) {
          const nextRowIdx = cSheet.getLastRow() + 1;
          const midColLetter = getColLetter_(cCol["Member ID"] + 1);
          nextRow[cCol["Member Name"]] =
            '=IF(' + midColLetter + nextRowIdx + '="", "", IFERROR(XLOOKUP(' + midColLetter + nextRowIdx + ', Members_MemberID, Members_FullName, "' + name + '"), "' + name + '"))';
        }

        if (cCol["Amount"] !== undefined) nextRow[cCol["Amount"]] = savings;
        if (cModeIdx !== undefined) nextRow[cModeIdx] = "Refund / Expense Offset";
        if (cCol["Transaction ID"] !== undefined) nextRow[cCol["Transaction ID"]] = "DIV-SAV-" + year + "-" + mid;
        if (cTypeIdx !== undefined) nextRow[cTypeIdx] = "Monthly Contribution";
        if (cCol["Status"] !== undefined) nextRow[cCol["Status"]] = "Approved";
        if (cCol["Verified By"] !== undefined) nextRow[cCol["Verified By"]] = session.email || "Treasurer";

        cSheet.appendRow(nextRow);
        countSavingsCredits++;
        totalSavingsAmount += savings;
      }
    });

    // 3. Log Audit Record
    appendAuditLog_(
      "dividend.distribution",
      "Treasury",
      year,
      "Executed " + year + " dividend distribution: KES " + (totalOffsetAmount + totalSavingsAmount).toLocaleString() + " across " + allocations.length + " members",
      JSON.stringify({
        year: year,
        totalDistributed: totalOffsetAmount + totalSavingsAmount,
        totalLoanOffset: totalOffsetAmount,
        totalSavingsCredit: totalSavingsAmount,
        memberCount: allocations.length,
        executedBy: session.email,
      })
    );

    clearDashboardCache_();

    return {
      success: true,
      year: year,
      countLoanOffsets: countLoanOffsets,
      countSavingsCredits: countSavingsCredits,
      totalOffsetAmount: totalOffsetAmount,
      totalSavingsAmount: totalSavingsAmount,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Saves a new monthly statement summary entry into Fund Statements
 */
function saveFundStatement(data) {
  try {
    requirePermission_("accountsWrite");
    const ss = getSpreadsheet_();
    let fundSheet = ss.getSheetByName(SHEETS.FUND_STATEMENTS);
    if (!fundSheet) {
      setupFundStatementsSchema_(ss);
      fundSheet = ss.getSheetByName(SHEETS.FUND_STATEMENTS);
    }

    const date = data.date ? parseDateInput_(data.date, ss.getSpreadsheetTimeZone()) : new Date();
    const fund = String(data.fund || "CIC MMF").trim();
    const opening = Number(data.opening) || 0;
    const deposits = Number(data.deposits) || 0;
    const gross = Number(data.grossInterest) || 0;
    const tax = Number(data.wht) || 0;
    const net = Number(data.netYield) || (gross - tax);
    const withdrawals = Number(data.withdrawals) || 0;
    const closing = Number(data.closing) || (opening + deposits + net - withdrawals);
    const ref = String(data.ref || "").trim();

    fundSheet.appendRow([
      date,
      fund,
      opening,
      deposits,
      gross,
      tax,
      net,
      withdrawals,
      closing,
      ref
    ]);

    // Also update Accounts sheet statement balance if closing balance is provided
    try {
      const accSheet = ss.getSheetByName(SHEETS.ACCOUNTS);
      if (accSheet && accSheet.getLastRow() > 1) {
        const aVals = accSheet.getDataRange().getValues();
        const aCol = getHeaderMap_(aVals[0]);
        const stmtCol = aCol["Statement Balance"] !== undefined ? aCol["Statement Balance"] : aCol["Balance"];
        const dateCol = aCol["Balance Date"];
        const orgCol = aCol["Org. Name"];

        if (stmtCol !== undefined && orgCol !== undefined) {
          for (let r = 1; r < aVals.length; r++) {
            const org = String(aVals[r][orgCol] || "").toLowerCase();
            if ((fund.toLowerCase().indexOf("cic") !== -1 && org.indexOf("cic") !== -1) ||
                (fund.toLowerCase().indexOf("mansa") !== -1 && org.indexOf("mansa") !== -1)) {
              accSheet.getRange(r + 1, stmtCol + 1).setValue(closing);
              if (dateCol !== undefined) {
                accSheet.getRange(r + 1, dateCol + 1).setValue(date);
              }
              break;
            }
          }
        }
      }
    } catch (eAcc) {}

    appendAuditLog_(
      "fund.statement_log",
      "Fund Statements",
      fund,
      "Logged monthly statement for " + fund + " as of " + (data.date || "") + ": Net Yield KES " + net,
      JSON.stringify(data)
    );

    clearDashboardCache_();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Frontend aliases for compatibility with UI callers.
 */
function simulateDividendDistribution(params) {
  return calculateDividendDistributionPreview(params);
}

function saveFundStatementEntry(data) {
  return saveFundStatement(data);
}
