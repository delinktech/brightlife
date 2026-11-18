/**
 * Service to calculate and deliver personal member financial reports.
 * Used for "My Financials" portal view.
 */

function getPersonalFinancialsData() {
  const session = requireAccess_();
  const callerEmail = session.email;
  const callerMemberId = String(session.memberId || "").trim();
  const callerMemberName = String(session.memberName || "").trim();

  const ss = getSpreadsheet_();
  const tz = ss.getSpreadsheetTimeZone();

  // 1. Fetch Member Registry & Total Group Savings
  let myMemberRecord = null;
  let totalGroupSavings = 0;
  let activeMembersCount = 0;

  try {
    const memSheet = getRequiredSheet_(SHEETS.MEMBERS);
    const memValues = memSheet.getDataRange().getValues();
    if (memValues.length > 1) {
      const col = getHeaderMap_(memValues[0]);
      for (let i = 1; i < memValues.length; i++) {
        const row = memValues[i];
        const mid = String(row[col["Member ID"]] || "").trim();
        if (!mid) continue;

        const savings = Number(row[col["Total Savings"]]) || 0;
        totalGroupSavings += savings;
        if (row[col["Status"]] === "Active") activeMembersCount++;

        const firstName = String(row[col["First Name"]] || "").trim();
        const middleName = String(row[col["Middle Name"]] || "").trim();
        const lastName = String(row[col["Last Name"]] || "").trim();
        const fullName = (firstName + " " + middleName + " " + lastName).replace(/\s+/g, " ").trim();

        const matchId = callerMemberId && mid.toLowerCase() === callerMemberId.toLowerCase();
        const matchName = callerMemberName && (fullName.toLowerCase() === callerMemberName.toLowerCase() ||
          callerMemberName.toLowerCase().indexOf(fullName.toLowerCase()) !== -1 ||
          fullName.toLowerCase().indexOf(callerMemberName.toLowerCase()) !== -1);

        if (matchId || matchName) {
          myMemberRecord = {
            memberId: mid,
            fullName: fullName,
            nationalId: row[col["National Id"]] || "",
            registrationDate: formatDateValue_(row[col["Registration Date"]], tz),
            savings: savings,
            loanBalance: Number(row[col["Current Loan Balance"]]) || 0,
            guaranteedAmount: Number(row[col["Guaranteed Amount"]]) || 0,
            availableToGuarantee: Number(row[col["Available to Guarantee"]]) || Math.max(0, savings - (Number(row[col["Guaranteed Amount"]]) || 0)),
            status: row[col["Status"]] || "Active",
          };
        }
      }
    }
  } catch (e) {
    console.error("Personal member record error: " + e.message);
  }

  const personalSavings = myMemberRecord ? myMemberRecord.savings : 0;
  const sharesPercentage = totalGroupSavings > 0 ? ((personalSavings / totalGroupSavings) * 100).toFixed(2) : "0.00";

  // 2. Fetch Personal Contributions Ledger
  const personalContributions = [];
  let totalPersonalContributionsSum = 0;
  try {
    const cSheet = getRequiredSheet_(SHEETS.CONTRIBUTIONS);
    const cValues = cSheet.getDataRange().getValues();
    if (cValues.length > 1) {
      const col = getHeaderMap_(cValues[0]);
      const midCol = col["Member ID"] !== undefined ? col["Member ID"] : col["Member id"];

      for (let i = 1; i < cValues.length; i++) {
        const row = cValues[i];
        const rowName = String(row[col["Member Name"]] || "").trim();
        if (!rowName) continue;

        const rowMid = midCol !== undefined ? String(row[midCol] || "").trim().toLowerCase() : "";
        const rowNameLower = rowName.toLowerCase();
        const cMemberIdLower = callerMemberId.toLowerCase();
        const cMemberNameLower = callerMemberName.toLowerCase();

        const matchId = cMemberIdLower && rowMid === cMemberIdLower;
        const matchName = cMemberNameLower && (rowNameLower === cMemberNameLower ||
          cMemberNameLower.indexOf(rowNameLower) !== -1 ||
          rowNameLower.indexOf(cMemberNameLower) !== -1);

        if (matchId || matchName) {
          const amt = Number(row[col["Amount"]]) || 0;
          totalPersonalContributionsSum += amt;
          personalContributions.push({
            date: formatDateValue_(row[col["Date"]], tz),
            amount: amt,
            amountFormatted: formatCurrency_(amt),
            mode: row[col["Payment Mode"]] || "",
            tid: row[col["Transaction ID"]] || "",
            type: row[col["Type"]] || "Monthly Contribution",
          });
        }
      }
    }
  } catch (e) {
    console.error("Personal contributions error: " + e.message);
  }

  // 3. Fetch Personal Loans & Guarantorships
  const personalLoans = [];
  const loansGuaranteedByMe = [];
  let totalPersonalLoanBalance = 0;
  let totalGuaranteedLiability = 0;

  try {
    const lSheet = getRequiredSheet_(SHEETS.LOANS);
    const lValues = lSheet.getDataRange().getValues();

    // Check Guarantors tab
    const guarantorMap = {};
    try {
      const gSheet = ss.getSheetByName(SHEETS.GUARANTORS);
      if (gSheet && gSheet.getLastRow() > 1) {
        const gValues = gSheet.getDataRange().getValues();
        const gCol = getHeaderMap_(gValues[0]);
        for (let g = 1; g < gValues.length; g++) {
          const loanId = String(gValues[g][gCol["Loan ID"]] || "").trim();
          const gName = String(gValues[g][gCol["Guarantor Name"]] || "").trim();
          const gAmt = Number(gValues[g][gCol["Guaranteed Amount"]]) || 0;
          if (loanId && gName) {
            if (!guarantorMap[loanId]) guarantorMap[loanId] = [];
            guarantorMap[loanId].push({ name: gName, amount: gAmt });

            if (callerMemberName && gName.toLowerCase().indexOf(callerMemberName.toLowerCase()) !== -1) {
              loansGuaranteedByMe.push({
                loanId: loanId,
                amount: gAmt,
                amountFormatted: formatCurrency_(gAmt),
              });
              totalGuaranteedLiability += gAmt;
            }
          }
        }
      }
    } catch (ge) {
      console.error("Guarantors lookup error: " + ge.message);
    }

    if (lValues.length > 1) {
      const col = getHeaderMap_(lValues[0]);
      for (let l = 1; l < lValues.length; l++) {
        const row = lValues[l];
        const borrower = String(row[col["Borrower Name"]] || "").trim();
        const loanId = String(row[col["Loan ID"]] || "").trim();
        if (!loanId) continue;

        const borrowerLower = borrower.toLowerCase();
        const cMemberNameLower = callerMemberName.toLowerCase();
        const isMyLoan = cMemberNameLower && (borrowerLower === cMemberNameLower ||
          cMemberNameLower.indexOf(borrowerLower) !== -1 ||
          borrowerLower.indexOf(cMemberNameLower) !== -1);

        if (isMyLoan) {
          const bal = Number(row[col["Balance"]]) || 0;
          totalPersonalLoanBalance += bal;
          personalLoans.push({
            id: loanId,
            requestDate: formatDateValue_(row[col["Request Date"]], tz),
            approvedDate: formatDateValue_(row[col["Approved Date"]], tz),
            requestedAmount: Number(row[col["Requested Amount"]]) || 0,
            requestedAmountFormatted: formatCurrency_(row[col["Requested Amount"]]),
            repaymentAmount: Number(row[col["Repayment Amount"]]) || 0,
            repaymentAmountFormatted: formatCurrency_(row[col["Repayment Amount"]]),
            paid: Number(row[col["Total Paid"]]) || 0,
            paidFormatted: formatCurrency_(row[col["Total Paid"]]),
            balance: bal,
            balanceFormatted: formatCurrency_(bal),
            status: row[col["Status"]] || "Pending",
            guarantors: guarantorMap[loanId] || [],
          });
        }
      }
    }
  } catch (le) {
    console.error("Personal loans error: " + le.message);
  }

  // 4. Fetch Group Investments for Profit Share Calculation
  let totalGroupInvestments = 0;
  let totalGroupRevenue = 0;
  let totalGroupNetProfit = 0;
  try {
    const invSheet = ss.getSheetByName(SHEETS.INVESTMENTS);
    if (invSheet && invSheet.getLastRow() > 1) {
      const invValues = invSheet.getDataRange().getValues();
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
  } catch (ie) {
    console.error("Investments summary error: " + ie.message);
  }

  const myShareOfProfit = totalGroupNetProfit > 0 && totalGroupSavings > 0
    ? (totalGroupNetProfit * (personalSavings / totalGroupSavings))
    : 0;

  return {
    success: true,
    user: {
      email: callerEmail,
      memberId: myMemberRecord ? myMemberRecord.memberId : callerMemberId,
      name: myMemberRecord ? myMemberRecord.fullName : callerMemberName,
      status: myMemberRecord ? myMemberRecord.status : "Active",
      registrationDate: myMemberRecord ? myMemberRecord.registrationDate : "—",
    },
    personalSummary: {
      savings: personalSavings,
      savingsFormatted: formatCurrency_(personalSavings),
      sharesPercentage: sharesPercentage + "%",
      activeLoanBalance: totalPersonalLoanBalance,
      activeLoanBalanceFormatted: formatCurrency_(totalPersonalLoanBalance),
      guaranteedLiability: totalGuaranteedLiability,
      guaranteedLiabilityFormatted: formatCurrency_(totalGuaranteedLiability),
      estimatedProfitShare: myShareOfProfit,
      estimatedProfitShareFormatted: formatCurrency_(myShareOfProfit),
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
  };
}
