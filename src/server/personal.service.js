/**
 * Service to calculate and deliver personal member financial reports.
 * Used for "My Financials" portal view.
 *
 * Implements Task ANA-1: Financial Intelligence & Actuarial UX (Phase 1):
 * - Free vs Encumbered Savings Split
 * - Dynamic Effective Borrowing Capacity with Delinquency Lockout
 * - Bylaws Rule 5.2 Dual-Stream Dividend Routing
 * - Active Loans Lifecycle Enrichment (Maturity Countdown, Repayment Breakdown)
 * - Credit Standing / Reputation Tiering (Trailing 12-Month Consistency & Streak)
 */

function getPersonalFinancialsData() {
  const session = requireAccess_();
  const callerEmail = session.email;
  const callerMemberId = String(session.memberId || "").trim();
  const callerMemberName = String(session.memberName || "").trim();

  const ctx = typeof beginRequestSheetContext_ === "function" ? beginRequestSheetContext_() : null;
  try {
    const ss = ctx ? ctx.getSpreadsheet() : getSpreadsheet_();
    const tz = ss.getSpreadsheetTimeZone();
    const now = new Date();

    // 1. Fetch Member Registry & Total Group Savings
    let myMemberRecord = null;
    let totalGroupSavings = 0;
    let activeMembersCount = 0;

    try {
      const memSheet = getRequiredSheet_(SHEETS.MEMBERS);
      const memValues = typeof getSheetValuesCached_ === "function"
        ? getSheetValuesCached_(ss, memSheet, { required: true })
        : memSheet.getDataRange().getValues();

      if (memValues.length > 1) {
        const col = getHeaderMap_(memValues[0]);
        for (let i = 1; i < memValues.length; i++) {
          const row = memValues[i];
          const mid = String(row[col["Member ID"]] || "").trim();
          if (!mid) continue;

          const savings = Number(row[col["Total Savings"]]) || 0;
          totalGroupSavings += savings;
          const statusStr = String(row[col["Status"]] || "Active").trim();
          if (statusStr.toLowerCase() === "active") activeMembersCount++;

          const firstName = String(row[col["First Name"]] || "").trim();
          const middleName = col["Middle Name"] !== undefined ? String(row[col["Middle Name"]] || "").trim() : "";
          const lastName = col["Last Name"] !== undefined ? String(row[col["Last Name"]] || "").trim() : "";
          const fullName = col["Full Name"] !== undefined && row[col["Full Name"]]
            ? String(row[col["Full Name"]]).trim()
            : [firstName, middleName, lastName].filter(Boolean).join(" ");

          const rowEmail = col["Email"] !== undefined ? String(row[col["Email"]] || "").trim().toLowerCase() : "";
          const cEmailLower = callerEmail ? callerEmail.toLowerCase() : "";

          const matchId = callerMemberId && mid.toLowerCase() === callerMemberId.toLowerCase();
          const matchEmail = cEmailLower && rowEmail && rowEmail === cEmailLower;
          const matchName = callerMemberName && (
            fullName.toLowerCase() === callerMemberName.toLowerCase() ||
            callerMemberName.toLowerCase().indexOf(fullName.toLowerCase()) !== -1 ||
            fullName.toLowerCase().indexOf(callerMemberName.toLowerCase()) !== -1
          );

          if (matchId || matchEmail || matchName) {
            myMemberRecord = {
              memberId: mid,
              fullName: fullName,
              email: rowEmail,
              nationalId: row[col["National Id"]] || "",
              registrationDate: formatDateValue_(row[col["Registration Date"]], tz),
              savings: savings,
              loanBalance: Number(row[col["Current Loan Balance"]]) || 0,
              guaranteedAmount: Number(row[col["Guaranteed Amount"]]) || 0,
              availableToGuarantee: Number(row[col["Available to Guarantee"]]) || Math.max(0, savings - (Number(row[col["Guaranteed Amount"]]) || 0)),
              status: statusStr,
            };
          }
        }
      }
    } catch (e) {
      console.error("Personal member record error: " + e.message);
    }

    const personalSavings = myMemberRecord ? myMemberRecord.savings : 0;
    const resolvedMemberId = myMemberRecord ? myMemberRecord.memberId : callerMemberId;
    const resolvedMemberName = myMemberRecord ? myMemberRecord.fullName : callerMemberName;
    const sharesPercentage = totalGroupSavings > 0 ? ((personalSavings / totalGroupSavings) * 100).toFixed(2) : "0.00";

    // 2. Fetch Personal Contributions Ledger & Build 12-Month Trailing Consistency
    const personalContributions = [];
    let totalPersonalContributionsSum = 0;
    const memberMonthlyContribs = {};

    // Generate keys for trailing 12 months (0 = current month, 11 = 11 months ago)
    const trailing12MonthKeys = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      trailing12MonthKeys.push(key);
    }

    try {
      const cSheet = getRequiredSheet_(SHEETS.CONTRIBUTIONS);
      const cValues = typeof getSheetValuesCached_ === "function"
        ? getSheetValuesCached_(ss, cSheet, { required: true })
        : cSheet.getDataRange().getValues();

      if (cValues.length > 1) {
        const col = getHeaderMap_(cValues[0]);
        const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

        for (let i = 1; i < cValues.length; i++) {
          const row = cValues[i];
          const rowName = String(row[col["Member Name"]] || "").trim();
          const rowMid = midCol !== undefined ? String(row[midCol] || "").trim().toLowerCase() : "";
          if (!rowName && !rowMid) continue;

          const rowNameLower = rowName.toLowerCase();
          const cMemberIdLower = resolvedMemberId.toLowerCase();
          const cMemberNameLower = resolvedMemberName.toLowerCase();

          const matchId = cMemberIdLower && rowMid === cMemberIdLower;
          const matchName = cMemberNameLower && (
            rowNameLower === cMemberNameLower ||
            cMemberNameLower.indexOf(rowNameLower) !== -1 ||
            rowNameLower.indexOf(cMemberNameLower) !== -1
          );

          if (matchId || matchName) {
            const amt = Number(row[col["Amount"]]) || 0;
            const rawDate = row[col["Date"]];
            const parsedDate = rawDate instanceof Date ? rawDate : parsePersonalDate_(rawDate);
            const status = col["Status"] !== undefined ? String(row[col["Status"]] || "Approved").trim().toLowerCase() : "approved";

            if (status !== "rejected" && amt > 0 && parsedDate && !isNaN(parsedDate.getTime())) {
              const monthKey = parsedDate.getFullYear() + "-" + String(parsedDate.getMonth() + 1).padStart(2, "0");
              memberMonthlyContribs[monthKey] = (memberMonthlyContribs[monthKey] || 0) + amt;
            }

            totalPersonalContributionsSum += amt;
            personalContributions.push({
              date: formatDateValue_(rawDate, tz),
              amount: amt,
              amountFormatted: formatCurrency_(amt),
              mode: row[col["Payment Mode"]] || row[col["Deposit Channel"]] || "",
              tid: row[col["Transaction ID"]] || "",
              type: row[col["Type"]] || row[col["Transaction Type"]] || "Monthly Contribution",
              status: col["Status"] !== undefined ? row[col["Status"]] : "Approved",
            });
          }
        }
      }
    } catch (e) {
      console.error("Personal contributions error: " + e.message);
    }

    // Calculate Trailing 12-Month Consistency & Streak
    let activeMonthsInLast12 = 0;
    for (let m = 0; m < 12; m++) {
      const key = trailing12MonthKeys[m];
      if ((memberMonthlyContribs[key] || 0) > 0) {
        activeMonthsInLast12++;
      }
    }
    const consistencyScore = Math.round((activeMonthsInLast12 / 12) * 100);

    let streakMonths = 0;
    let streakStartIndex = 0;
    if ((memberMonthlyContribs[trailing12MonthKeys[0]] || 0) <= 0) {
      // If current month deposit not yet recorded, check if last month was active
      if ((memberMonthlyContribs[trailing12MonthKeys[1]] || 0) > 0) {
        streakStartIndex = 1;
      } else {
        streakStartIndex = -1;
      }
    }

    if (streakStartIndex >= 0) {
      for (let s = streakStartIndex; s < 12; s++) {
        const key = trailing12MonthKeys[s];
        if ((memberMonthlyContribs[key] || 0) > 0) {
          streakMonths++;
        } else {
          break;
        }
      }
    }

    // 3. Pre-scan Loans to map status & balance for guarantor commitments validation
    const loansStatusMap = {};
    let lRows = [];
    try {
      const lSheet = getRequiredSheet_(SHEETS.LOANS);
      lRows = typeof getSheetValuesCached_ === "function"
        ? getSheetValuesCached_(ss, lSheet, { required: true })
        : lSheet.getDataRange().getValues();

      if (lRows.length > 1) {
        const lCol = getHeaderMap_(lRows[0]);
        for (let l = 1; l < lRows.length; l++) {
          const lId = String(lRows[l][lCol["Loan ID"]] || "").trim();
          if (!lId) continue;
          const stat = String(lRows[l][lCol["Status"]] || "").trim();
          const bal = Number(lRows[l][lCol["Balance"]]) || 0;
          const req = Number(lRows[l][lCol["Requested Amount"]]) || 0;
          loansStatusMap[lId.toLowerCase()] = {
            id: lId,
            status: stat,
            balance: bal,
            requestedAmount: req,
            isSettled: stat.toLowerCase() === "settled" || (stat.toLowerCase() === "approved" && bal <= 0 && lRows[l][lCol["Total Paid"]]),
            isRejected: stat.toLowerCase() === "rejected" || stat.toLowerCase() === "cancelled",
          };
        }
      }
    } catch (lScanErr) {
      console.warn("Loans pre-scan notice: " + lScanErr.message);
    }

    // 4. Fetch Guarantor Commitments (Free vs Encumbered Savings Identity)
    const guarantorMap = {};
    const loansGuaranteedByMe = [];
    let totalGuaranteedLiability = 0;
    let totalActiveGuaranteedAmount = 0;

    try {
      const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
      if (gSheet && gSheet.getLastRow() > 1) {
        const gValues = typeof getSheetValuesCached_ === "function"
          ? getSheetValuesCached_(ss, gSheet)
          : gSheet.getDataRange().getValues();

        if (gValues.length > 1) {
          const gCol = getHeaderMap_(gValues[0]);
          const gLidCol = gCol["Loan ID"];
          const gMidCol = gCol["Member ID"] !== undefined ? gCol["Member ID"] : gCol["Member id"];
          const gNameCol = gCol["Guarantor Name"] !== undefined ? gCol["Guarantor Name"] : gCol["Member Name"];
          const gAmtCol = gCol["Guaranteed Amount"] !== undefined ? gCol["Guaranteed Amount"] : gCol["Amount"];
          const gStatCol = gCol["Status"] !== undefined ? gCol["Status"] : gCol["Loan Status"];

          for (let g = 1; g < gValues.length; g++) {
            const gRow = gValues[g];
            const loanId = gLidCol !== undefined ? String(gRow[gLidCol] || "").trim() : "";
            const gName = gNameCol !== undefined ? String(gRow[gNameCol] || "").trim() : "";
            const gMid = gMidCol !== undefined ? String(gRow[gMidCol] || "").trim() : "";
            const gAmt = gAmtCol !== undefined ? (Number(gRow[gAmtCol]) || 0) : 0;
            const gStatus = gStatCol !== undefined ? String(gRow[gStatCol] || "").trim().toLowerCase() : "";

            if (!loanId) continue;

            if (!guarantorMap[loanId]) guarantorMap[loanId] = [];
            guarantorMap[loanId].push({ name: gName, memberId: gMid, amount: gAmt });

            const matchMid = resolvedMemberId && gMid && gMid.toLowerCase() === resolvedMemberId.toLowerCase();
            const matchName = resolvedMemberName && gName && (
              gName.toLowerCase() === resolvedMemberName.toLowerCase() ||
              resolvedMemberName.toLowerCase().indexOf(gName.toLowerCase()) !== -1 ||
              gName.toLowerCase().indexOf(resolvedMemberName.toLowerCase()) !== -1
            );

            if (matchMid || matchName) {
              const linkedLoan = loansStatusMap[loanId.toLowerCase()];
              const isLoanSettled = linkedLoan ? (linkedLoan.isSettled || (linkedLoan.balance <= 0 && linkedLoan.status.toLowerCase() !== "pending")) : false;
              const isLoanRejected = linkedLoan ? linkedLoan.isRejected : (gStatus === "rejected" || gStatus === "cancelled");
              const isGuarantorReleased = gStatus === "released" || gStatus === "cleared" || gStatus === "settled";

              const isActiveCommitment = !isLoanSettled && !isLoanRejected && !isGuarantorReleased;

              totalGuaranteedLiability += gAmt;
              if (isActiveCommitment) {
                totalActiveGuaranteedAmount += gAmt;
              }

              loansGuaranteedByMe.push({
                loanId: loanId,
                amount: gAmt,
                amountFormatted: formatCurrency_(gAmt),
                status: gStatus || (linkedLoan ? linkedLoan.status : "Active"),
                isActive: isActiveCommitment,
                loanBalance: linkedLoan ? linkedLoan.balance : 0,
              });
            }
          }
        }
      }
    } catch (ge) {
      console.error("Guarantors lookup error: " + ge.message);
    }

    // Mathematical identity: encumberedSavings <= personalSavings, freeSavings + encumberedSavings === personalSavings
    const encumberedSavings = Math.min(personalSavings, totalActiveGuaranteedAmount);
    const freeSavings = Math.max(0, Math.round((personalSavings - encumberedSavings) * 100) / 100);

    // 5. Fetch Personal Loans with Lifecycle Enrichment
    const personalLoans = [];
    let totalPersonalLoanBalance = 0;
    let hasDelinquentFacility = false;

    if (lRows.length > 1) {
      const col = getHeaderMap_(lRows[0]);
      const lMidCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];
      const dueDateCol = col["Due Date"] !== undefined ? col["Due Date"] : col["Maturity Date"];
      const approvedDateCol = col["Approved Date"] !== undefined ? col["Approved Date"] : col["Request Date"];
      const loanTermCol = col["Loan Term (Months)"] !== undefined ? col["Loan Term (Months)"] : col["Term"];

      for (let l = 1; l < lRows.length; l++) {
        const row = lRows[l];
        const loanId = String(row[col["Loan ID"]] || "").trim();
        if (!loanId) continue;

        const borrower = String(row[col["Borrower Name"]] || "").trim();
        const rowMid = lMidCol !== undefined ? String(row[lMidCol] || "").trim().toLowerCase() : "";
        const borrowerLower = borrower.toLowerCase();
        const cMemberIdLower = resolvedMemberId.toLowerCase();
        const cMemberNameLower = resolvedMemberName.toLowerCase();

        const matchId = cMemberIdLower && rowMid === cMemberIdLower;
        const matchName = cMemberNameLower && (
          borrowerLower === cMemberNameLower ||
          cMemberNameLower.indexOf(borrowerLower) !== -1 ||
          borrowerLower.indexOf(cMemberNameLower) !== -1
        );

        if (matchId || matchName) {
          const bal = Number(row[col["Balance"]]) || 0;
          const statusStr = String(row[col["Status"]] || "Pending").trim();
          const statusLower = statusStr.toLowerCase();
          const isDelinquentStatus =
            statusLower.indexOf("arrear") !== -1 ||
            statusLower.indexOf("default") !== -1 ||
            statusLower.indexOf("overdue") !== -1;

          if (statusStr === LOAN_STATUS.ACTIVE || isDelinquentStatus || (statusLower === "approved" && bal > 0)) {
            totalPersonalLoanBalance += bal;
          }

          const requestedAmount = Number(row[col["Requested Amount"]]) || 0;
          const repaymentAmount = Number(row[col["Repayment Amount"]]) || 0;
          const totalPaid = Number(row[col["Total Paid"]]) || 0;
          const principalPaid = col["Principal Paid"] !== undefined ? (Number(row[col["Principal Paid"]]) || 0) : 0;
          const interestPaid = col["Interest Paid"] !== undefined ? (Number(row[col["Interest Paid"]]) || 0) : 0;
          const feePaid = col["Fee Paid"] !== undefined ? (Number(row[col["Fee Paid"]]) || 0) : 0;

          // Due date and maturity countdown
          let dueDate = null;
          if (dueDateCol !== undefined && row[dueDateCol]) {
            const rawDue = row[dueDateCol];
            dueDate = rawDue instanceof Date ? rawDue : parsePersonalDate_(rawDue);
          }
          if (!dueDate && approvedDateCol !== undefined && row[approvedDateCol]) {
            const rawApp = row[approvedDateCol];
            const appDate = rawApp instanceof Date ? rawApp : parsePersonalDate_(rawApp);
            if (appDate && !isNaN(appDate.getTime())) {
              const tenorMonths = loanTermCol !== undefined && Number(row[loanTermCol]) > 0 ? Number(row[loanTermCol]) : 3;
              dueDate = new Date(appDate.getFullYear(), appDate.getMonth() + tenorMonths, appDate.getDate());
            }
          }

          let daysToMaturity = null;
          let dueDateFormatted = "—";
          let isOverdue = false;

          if (dueDate && !isNaN(dueDate.getTime())) {
            dueDateFormatted = formatDateValue_(dueDate, tz);
            const diffMs = dueDate.getTime() - now.getTime();
            daysToMaturity = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (daysToMaturity < 0 && bal > 0 && statusLower !== "settled" && statusLower !== "rejected") {
              isOverdue = true;
            }
          }

          if (isDelinquentStatus && bal > 0) {
            isOverdue = true;
          }

          if ((isOverdue || isDelinquentStatus) && bal > 0) {
            hasDelinquentFacility = true;
          }

          personalLoans.push({
            id: loanId,
            requestDate: formatDateValue_(row[col["Request Date"]], tz),
            approvedDate: formatDateValue_(row[col["Approved Date"]], tz),
            dueDateFormatted: dueDateFormatted,
            daysToMaturity: daysToMaturity,
            isOverdue: isOverdue,
            requestedAmount: requestedAmount,
            requestedAmountFormatted: formatCurrency_(requestedAmount),
            repaymentAmount: repaymentAmount,
            repaymentAmountFormatted: formatCurrency_(repaymentAmount),
            paid: totalPaid,
            paidFormatted: formatCurrency_(totalPaid),
            principalPaid: principalPaid,
            principalPaidFormatted: formatCurrency_(principalPaid),
            interestPaid: interestPaid,
            interestPaidFormatted: formatCurrency_(interestPaid),
            feePaid: feePaid,
            feePaidFormatted: formatCurrency_(feePaid),
            balance: bal,
            balanceFormatted: formatCurrency_(bal),
            status: statusStr,
            guarantors: guarantorMap[loanId] || [],
          });
        }
      }
    }

    // Assign Credit Standing / Reputation Tier
    let creditTier = "Tier 3: Attention Required";
    if (!hasDelinquentFacility) {
      if (activeMonthsInLast12 >= 10) {
        creditTier = "Tier 1: Flawless";
      } else if (activeMonthsInLast12 >= 6) {
        creditTier = "Tier 2: Good Standing";
      }
    }

    // 6. Dynamic Borrowing Capacity with Delinquency Lockout
    const multiplier = getSavingsMultiplier_(ss);
    let effectiveBorrowingCapacity = 0;
    let delinquencyLocked = false;
    let delinquencyReason = "";

    if (hasDelinquentFacility) {
      effectiveBorrowingCapacity = 0;
      delinquencyLocked = true;
      delinquencyReason = "Account has active facility in arrears. Borrowing privilege locked until settled.";
    } else {
      effectiveBorrowingCapacity = Math.max(
        0,
        Math.round(((personalSavings * multiplier) - totalPersonalLoanBalance - encumberedSavings) * 100) / 100
      );
      delinquencyLocked = false;
      delinquencyReason = "";
    }

    // 7. Bylaws Rule 5.2 Dual-Stream Dividend Projection
    const poolData = getDividendProjectionPool_(ss);
    const poolSavings = poolData && poolData.totalGroupSavings > 0 ? poolData.totalGroupSavings : totalGroupSavings;
    const distributableSurplus = poolData ? (poolData.totalDistributableSurplus || 0) : 0;

    const projectedDividend = (poolSavings > 0 && personalSavings > 0)
      ? Math.round((distributableSurplus * (personalSavings / poolSavings)) * 100) / 100
      : 0;

    const dividendLoanOffset = Math.min(projectedDividend, totalPersonalLoanBalance);
    const dividendSavingsReinvest = Math.max(0, Math.round((projectedDividend - dividendLoanOffset) * 100) / 100);
    const hasLoanOffset = dividendLoanOffset > 0;

    // 8. Fetch Group Investments for backward compatibility profit share
    let totalGroupInvestments = 0;
    let totalGroupRevenue = 0;
    let totalGroupNetProfit = 0;
    try {
      const invSheet = ss.getSheetByName(SHEETS.INVESTMENTS);
      if (invSheet && invSheet.getLastRow() > 1) {
        const invValues = typeof getSheetValuesCached_ === "function"
          ? getSheetValuesCached_(ss, invSheet)
          : invSheet.getDataRange().getValues();

        if (invValues.length > 1) {
          const col = getHeaderMap_(invValues[0]);
          for (let v = 1; v < invValues.length; v++) {
            const invested = Number(invValues[v][col["Money Invested"]]) || 0;
            const rev = Number(invValues[v][col["Revenue"]]) || 0;
            const roi = Number(invValues[v][col["ROI Amount"]]) || (rev - invested);
            totalGroupInvestments += invested;
            totalGroupRevenue += rev;
            totalGroupNetProfit += roi;
          }
        }
      }
    } catch (ie) {
      console.error("Investments summary error: " + ie.message);
    }

    const myShareOfProfit = totalGroupNetProfit > 0 && totalGroupSavings > 0
      ? Math.round((totalGroupNetProfit * (personalSavings / totalGroupSavings)) * 100) / 100
      : 0;

    return {
      success: true,
      user: {
        email: callerEmail,
        memberId: resolvedMemberId,
        name: resolvedMemberName,
        status: myMemberRecord ? myMemberRecord.status : "Active",
        registrationDate: myMemberRecord ? myMemberRecord.registrationDate : "—",
      },
      personalSummary: {
        savings: personalSavings,
        savingsFormatted: formatCurrency_(personalSavings),
        freeSavings: freeSavings,
        freeSavingsFormatted: formatCurrency_(freeSavings),
        encumberedSavings: encumberedSavings,
        encumberedSavingsFormatted: formatCurrency_(encumberedSavings),
        totalActiveGuaranteedAmount: totalActiveGuaranteedAmount,
        totalActiveGuaranteedAmountFormatted: formatCurrency_(totalActiveGuaranteedAmount),
        sharesPercentage: sharesPercentage + "%",
        activeLoanBalance: totalPersonalLoanBalance,
        activeLoanBalanceFormatted: formatCurrency_(totalPersonalLoanBalance),
        guaranteedLiability: totalGuaranteedLiability,
        guaranteedLiabilityFormatted: formatCurrency_(totalGuaranteedLiability),
        // Dynamic Effective Borrowing Capacity
        effectiveBorrowingCapacity: effectiveBorrowingCapacity,
        effectiveBorrowingCapacityFormatted: formatCurrency_(effectiveBorrowingCapacity),
        borrowingCapacity: effectiveBorrowingCapacity, // Alias for backward compatibility
        borrowingMultiplier: multiplier,
        delinquencyLocked: delinquencyLocked,
        delinquencyReason: delinquencyReason,
        // Bylaws Rule 5.2 Dividend Projection
        projectedDividend: projectedDividend,
        projectedDividendFormatted: formatCurrency_(projectedDividend),
        dividendLoanOffset: dividendLoanOffset,
        dividendLoanOffsetFormatted: formatCurrency_(dividendLoanOffset),
        dividendSavingsReinvest: dividendSavingsReinvest,
        dividendSavingsReinvestFormatted: formatCurrency_(dividendSavingsReinvest),
        hasLoanOffset: hasLoanOffset,
        // Legacy profit share preserved
        estimatedProfitShare: myShareOfProfit,
        estimatedProfitShareFormatted: formatCurrency_(myShareOfProfit),
        // Credit Reputation Tier & Consistency
        creditTier: creditTier,
        consistencyScore: consistencyScore,
        streakMonths: streakMonths,
        creditStanding: {
          tier: creditTier,
          creditTier: creditTier,
          consistencyScore: consistencyScore,
          streakMonths: streakMonths,
          activeMonthsCount: activeMonthsInLast12,
          hasActiveDefault: hasDelinquentFacility,
        },
      },
      groupOverview: {
        totalSavingsPool: totalGroupSavings,
        totalSavingsPoolFormatted: formatCurrency_(totalGroupSavings),
        totalInvestments: totalGroupInvestments,
        totalInvestmentsFormatted: formatCurrency_(totalGroupInvestments),
        totalProfit: totalGroupNetProfit,
        totalProfitFormatted: formatCurrency_(totalGroupNetProfit),
        activeMembers: activeMembersCount,
      },
      contributions: personalContributions.reverse(),
      loans: personalLoans,
      guaranteedLoans: loansGuaranteedByMe,
      rpcProfile: ctx ? ctx.getProfile() : null,
    };
  } finally {
    if (typeof resetRequestSheetContext_ === "function") resetRequestSheetContext_();
  }
}

/**
 * Reads savings multiplier from Constants sheet (Loan Policy Parameter or Statutory Thresholds).
 * Defaults to 3.0x per chama policy.
 */
function getSavingsMultiplier_(ss) {
  try {
    const spreadsheet = ss || (typeof getSpreadsheet_ === "function" ? getSpreadsheet_() : null);
    if (!spreadsheet) return 3.0;

    const constSheet = spreadsheet.getSheetByName(SHEETS.CONSTANTS);
    if (constSheet && constSheet.getLastRow() > 1) {
      const cVals = constSheet.getDataRange().getValues();
      const col = getHeaderMap_(cVals[0]);

      // Check Loan Policy Parameter column
      const paramCol = col["Loan Policy Parameter"] !== undefined ? col["Loan Policy Parameter"] : col["loan policy parameter"];
      const valCol = col["Policy Value"] !== undefined ? col["Policy Value"] : col["policy value"];
      if (paramCol !== undefined && valCol !== undefined) {
        for (let r = 1; r < cVals.length; r++) {
          const key = String(cVals[r][paramCol] || "").trim().toLowerCase();
          const val = Number(cVals[r][valCol]);
          if ((key === "borrower savings multiplier" || key === "max loan multiplier" || key === "savings multiplier") && val > 0) {
            return val;
          }
        }
      }

      // Check Statutory Thresholds column
      const statCol = col["Statutory Thresholds"] !== undefined ? col["Statutory Thresholds"] : col["statutory thresholds"];
      const tValCol = col["Threshold Value"] !== undefined ? col["Threshold Value"] : col["threshold value"];
      if (statCol !== undefined && tValCol !== undefined) {
        for (let r = 1; r < cVals.length; r++) {
          const key = String(cVals[r][statCol] || "").trim().toLowerCase();
          const val = Number(cVals[r][tValCol]);
          if ((key.indexOf("multiplier") !== -1 || key.indexOf("borrower savings") !== -1) && val > 0) {
            return val;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Savings multiplier lookup notice: " + e.message);
  }
  return 3.0;
}

/**
 * Retrieves or calculates centralized group dividend pool surplus.
 */
function getDividendProjectionPool_(ss) {
  if (typeof getGroupDividendProjectionPool_ === "function") {
    try {
      const pool = getGroupDividendProjectionPool_(ss);
      if (pool && typeof pool.totalDistributableSurplus === "number") {
        return pool;
      }
    } catch (e) {
      console.warn("getGroupDividendProjectionPool_ invocation notice: " + e.message);
    }
  }
  return computeGroupDividendPoolFallback_(ss);
}

/**
 * Computes statutory distributable dividend pool fallback directly from ledgers.
 * Rule: Gross Earnings (Loan interest, fees, fines, investment yields) less 20% statutory reserve.
 */
function computeGroupDividendPoolFallback_(ss) {
  const spreadsheet = ss || (typeof getSpreadsheet_ === "function" ? getSpreadsheet_() : null);
  let totalGroupSavings = 0;
  let activeMemberCount = 0;

  if (!spreadsheet) {
    return { totalGroupSavings: 0, totalDistributableSurplus: 0, activeMemberCount: 0 };
  }

  try {
    const memSheet = spreadsheet.getSheetByName(SHEETS.MEMBERS);
    if (memSheet && memSheet.getLastRow() > 1) {
      const mVals = memSheet.getDataRange().getValues();
      const mCol = getHeaderMap_(mVals[0]);
      const statusIdx = mCol["Status"];
      const savingsIdx = mCol["Total Savings"];

      for (let i = 1; i < mVals.length; i++) {
        const row = mVals[i];
        const status = statusIdx !== undefined ? String(row[statusIdx] || "Active").trim().toLowerCase() : "active";
        if (status === "active") {
          activeMemberCount++;
          if (savingsIdx !== undefined) totalGroupSavings += Number(row[savingsIdx]) || 0;
        }
      }
    }
  } catch (eM) {
    console.warn("Dividend pool members scan notice: " + eM.message);
  }

  let totalLoanInterest = 0;
  let loanProcessingFees = 0;
  let finesAndPenalties = 0;
  let investmentYields = 0;

  // Loan interest & fees
  try {
    const repSheet = spreadsheet.getSheetByName(SHEETS.LOAN_REPAYMENTS);
    if (repSheet && repSheet.getLastRow() > 1) {
      const rVals = repSheet.getDataRange().getValues();
      const rCol = getHeaderMap_(rVals[0]);
      const intIdx = rCol["Interest Paid"] !== undefined ? rCol["Interest Paid"] : rCol["Interest Portion"];
      const feeIdx = rCol["Fee Paid"] !== undefined ? rCol["Fee Paid"] : rCol["Transaction Fee"];
      const statIdx = rCol["Status"];

      for (let r = 1; r < rVals.length; r++) {
        const row = rVals[r];
        const stat = statIdx !== undefined ? String(row[statIdx] || "Approved").trim().toLowerCase() : "approved";
        if (stat === "approved") {
          if (intIdx !== undefined) totalLoanInterest += Number(row[intIdx]) || 0;
          if (feeIdx !== undefined) loanProcessingFees += Number(row[feeIdx]) || 0;
        }
      }
    }
  } catch (eR) {
    console.warn("Dividend pool repayments scan notice: " + eR.message);
  }

  // Fallback loan fees
  try {
    const loanSheet = spreadsheet.getSheetByName(SHEETS.LOANS);
    if (loanSheet && loanSheet.getLastRow() > 1) {
      const lVals = loanSheet.getDataRange().getValues();
      const lCol = getHeaderMap_(lVals[0]);
      const feeIdx = lCol["Transaction Fee"] !== undefined ? lCol["Transaction Fee"] : lCol["Processing Fee"];
      const statIdx = lCol["Status"];

      for (let l = 1; l < lVals.length; l++) {
        const row = lVals[l];
        const stat = statIdx !== undefined ? String(row[statIdx] || "").trim().toLowerCase() : "";
        if (stat !== "rejected" && stat !== "cancelled") {
          if (feeIdx !== undefined && loanProcessingFees === 0) {
            loanProcessingFees += Number(row[feeIdx]) || 0;
          }
        }
      }
    }
  } catch (eL) {
    console.warn("Dividend pool loans scan notice: " + eL.message);
  }

  // Fines and penalties
  try {
    const cSheet = spreadsheet.getSheetByName(SHEETS.CONTRIBUTIONS);
    if (cSheet && cSheet.getLastRow() > 1) {
      const cVals = cSheet.getDataRange().getValues();
      const cCol = getHeaderMap_(cVals[0]);
      const typeIdx = cCol["Transaction Type"] !== undefined ? cCol["Transaction Type"] : cCol["Type"];
      const amtIdx = cCol["Amount"];
      const statIdx = cCol["Status"];

      for (let c = 1; c < cVals.length; c++) {
        const row = cVals[c];
        const stat = statIdx !== undefined ? String(row[statIdx] || "Approved").trim().toLowerCase() : "approved";
        if (stat === "approved") {
          const tStr = typeIdx !== undefined ? String(row[typeIdx] || "").toLowerCase() : "";
          if (tStr.indexOf("fine") !== -1 || tStr.indexOf("penalt") !== -1 || tStr.indexOf("late") !== -1) {
            if (amtIdx !== undefined) finesAndPenalties += Number(row[amtIdx]) || 0;
          }
        }
      }
    }
  } catch (eC) {
    console.warn("Dividend pool contributions scan notice: " + eC.message);
  }

  // Investment yields from CIC Statement & Investments
  try {
    const cicSheet = spreadsheet.getSheetByName(SHEETS.CIC_STATEMENT);
    if (cicSheet && cicSheet.getLastRow() > 1) {
      const fVals = cicSheet.getDataRange().getValues();
      const fCol = getHeaderMap_(fVals[0]);
      const grossIdx = fCol["Gross Interest"];
      const taxIdx = fCol["Withholding Tax"];
      const netIdx = fCol["Net Yield"];

      for (let f = 1; f < fVals.length; f++) {
        const row = fVals[f];
        const gross = grossIdx !== undefined ? (Number(row[grossIdx]) || 0) : 0;
        const tax = taxIdx !== undefined ? (Number(row[taxIdx]) || 0) : 0;
        const net = netIdx !== undefined && Number(row[netIdx]) ? Number(row[netIdx]) : (gross - tax);
        investmentYields += net;
      }
    }
  } catch (eCic) {
    console.warn("Dividend pool CIC scan notice: " + eCic.message);
  }

  try {
    const invSheet = spreadsheet.getSheetByName(SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const iVals = invSheet.getDataRange().getValues();
      const iCol = getHeaderMap_(iVals[0]);
      const roiIdx = iCol["ROI Amount"];
      const statIdx = iCol["Status"];

      for (let j = 1; j < iVals.length; j++) {
        const row = iVals[j];
        const stat = statIdx !== undefined ? String(row[statIdx] || "").toLowerCase() : "";
        if (stat !== "cancelled" && stat !== "rejected") {
          if (roiIdx !== undefined) investmentYields += Number(row[roiIdx]) || 0;
        }
      }
    }
  } catch (eInv) {
    console.warn("Dividend pool investments scan notice: " + eInv.message);
  }

  const grossEarnings = totalLoanInterest + loanProcessingFees + finesAndPenalties + investmentYields;
  const statutoryReserve = Math.round(grossEarnings * 0.20 * 100) / 100;
  const distributable = Math.max(0, grossEarnings - statutoryReserve);

  return {
    totalGroupSavings: Math.max(0, Math.round(totalGroupSavings * 100) / 100),
    totalDistributableSurplus: Math.max(0, Math.round(distributable * 100) / 100),
    activeMemberCount: activeMemberCount,
  };
}

/**
 * Robust date parser supporting Date instances, ISO strings, and dd MMM yyyy formats.
 */
function parsePersonalDate_(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const str = String(raw).trim();
  if (!str) return null;
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  const monthsMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  const parts = str.split(/[\s\-\/\.]+/);
  if (parts.length === 3) {
    if (isNaN(parts[1]) && monthsMap[parts[1].toLowerCase()] !== undefined) {
      const d = parseInt(parts[0], 10);
      const m = monthsMap[parts[1].toLowerCase()];
      const y = parseInt(parts[2], 10);
      const fullY = y < 100 ? (y > 50 ? 1900 + y : 2000 + y) : y;
      const res = new Date(fullY, m, d);
      if (!isNaN(res.getTime())) return res;
    }
  }
  return null;
}
