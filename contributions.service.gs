function saveContribution(data) {
  requirePermission_("contributionsWrite");
  const range = getSpreadsheet_().getRangeByName("BL_CONTRIBUTIONS");
  if (!range) throw new Error("Named range 'BL_CONTRIBUTIONS' not found.");

  const headers = range.getValues()[0];
  const col = getHeaderMap_(headers);
  requireHeaders_(
    col,
    ["Date", "Member Name", "Amount", "Payment Mode", "Transaction ID", "Type"],
    "BL_CONTRIBUTIONS"
  );

  const newRow = new Array(headers.length).fill("");
  newRow[col["Date"]] = data.date ? new Date(data.date) : new Date();
  newRow[col["Member Name"]] = data.memberName || "";
  newRow[col["Amount"]] = Number(data.amount) || 0;
  newRow[col["Payment Mode"]] = data.mode || "";
  newRow[col["Transaction ID"]] = data.tid || "";
  newRow[col["Type"]] = data.type || "Monthly Contribution";

  range.getSheet().appendRow(newRow);
  var typeLabel = String(data.type || "Contribution");
  appendAuditLog_(
    "contribution.create",
    "Contribution",
    "",
    typeLabel + " — " + String(data.memberName || "").slice(0, 80),
    JSON.stringify({
      amount: Number(data.amount) || 0,
      mode: data.mode,
      type: data.type,
      tid: data.tid || "",
    })
  );
  return { success: true };
}

function getContributionsData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.CONTRIBUTIONS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, contributions: [], totalPages: 0, currentPage: 1 };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      ["Date", "Member Name", "Amount", "Payment Mode", "Type"],
      SHEETS.CONTRIBUTIONS
    );

    const allRows = values
      .slice(1)
      .filter(function (row) {
        return row[col["Member Name"]] !== "";
      })
      .reverse();

    const totalPages = Math.ceil(allRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const pageRows = allRows.slice(start, start + pageLimit);
    const tz = ss.getSpreadsheetTimeZone();

    const contributions = pageRows.map(function (row) {
      return {
        date: formatDateValue_(row[col["Date"]], tz),
        name: row[col["Member Name"]],
        amount: formatCurrency_(row[col["Amount"]]),
        mode: row[col["Payment Mode"]],
        type: row[col["Type"]],
      };
    });

    return {
      success: true,
      contributions: contributions,
      totalPages: totalPages,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
