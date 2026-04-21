function getLoansData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.LOANS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, loans: [], totalPages: 0, currentPage: 1 };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      [
        "Loan ID",
        "Request Date",
        "Borrower Name",
        "Requested Amount",
        "Interest",
        "Transaction Fee",
        "Approved Date",
        "Repayment Amount",
        "Borrower’s Own Savings",
        "Total Guaranteed",
        "Shortfall Amount",
        "Total Paid",
        "Balance",
        "Status",
      ],
      SHEETS.LOANS
    );

    const allRows = values
      .slice(1)
      .filter(function (row) {
        return row[col["Loan ID"]] !== "";
      })
      .reverse();
    const totalPages = Math.ceil(allRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const tz = ss.getSpreadsheetTimeZone();

    const loans = allRows.slice(start, start + pageLimit).map(function (row) {
      return {
        id: row[col["Loan ID"]],
        date: formatDateValue_(row[col["Request Date"]], tz),
        borrower: row[col["Borrower Name"]] || "",
        requested: Number(row[col["Requested Amount"]]) || 0,
        interest: Number(row[col["Interest"]]) || 0,
        trsfee: Number(row[col["Transaction Fee"]]) || 0,
        approveddate: formatDateValue_(row[col["Approved Date"]], tz),
        repayment: Number(row[col["Repayment Amount"]]) || 0,
        savings: Number(row[col["Borrower’s Own Savings"]]) || 0,
        guaranteed: Number(row[col["Total Guaranteed"]]) || 0,
        shortfall: Number(row[col["Shortfall Amount"]]) || 0,
        paid: Number(row[col["Total Paid"]]) || 0,
        balance: Number(row[col["Balance"]]) || 0,
        status: row[col["Status"]] || LOAN_STATUS.PENDING,
      };
    });

    return {
      success: true,
      loans: loans,
      totalPages: totalPages,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function processLoanPayment(data) {
  requirePermission_("loanPayment");
  if (!data || !data.borrower || !data.amount) {
    return { success: false, error: "Borrower and amount are required." };
  }

  return saveContribution({
    date: new Date(),
    memberName: data.borrower,
    amount: Number(data.amount) || 0,
    mode: data.mode || "Cash",
    tid: data.tid || "",
    type: "Loan Payment",
  });
}
