function getMembersData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.MEMBERS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, members: [], totalPages: 0, currentPage: 1 };
    }

    const headers = values[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(
      col,
      [
        "Member ID",
        "First Name",
        "Middle Name",
        "Last Name",
        "National Id",
        "Date of Birth",
        "Total Savings",
        "Current Loan Balance",
        "Guaranteed Amount",
        "Status",
      ],
      SHEETS.MEMBERS
    );

    const dataRows = values.slice(1).filter(function (row) {
      return row[col["Member ID"]] !== "";
    });
    const totalPages = Math.ceil(dataRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const tz = ss.getSpreadsheetTimeZone();

    const members = dataRows.slice(start, start + pageLimit).map(function (row) {
      const middleName = (row[col["Middle Name"]] || "").toString().trim();
      const initial = middleName ? middleName.charAt(0) + "." : "";
      const firstName = row[col["First Name"]] || "";
      const lastName = row[col["Last Name"]] || "";
      return {
        id: row[col["Member ID"]],
        dob: formatDateValue_(row[col["Date of Birth"]], tz),
        name: (firstName + " " + initial + " " + lastName).replace(/\s+/g, " ").trim(),
        fullName: (firstName + " " + middleName + " " + lastName).replace(/\s+/g, " ").trim(),
        nationalId: row[col["National Id"]] || "",
        savings: Number(row[col["Total Savings"]]) || 0,
        loanBalance: Number(row[col["Current Loan Balance"]]) || 0,
        guaranteed: Number(row[col["Guaranteed Amount"]]) || 0,
        status: row[col["Status"]] || "Active",
      };
    });

    return {
      success: true,
      members: members,
      totalPages: totalPages,
      currentPage: Math.min(currentPage, totalPages),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function generateNextMemberId_(sheet, colIndex) {
  const year = Utilities.formatDate(new Date(), "GMT+3", "yy");
  const prefix = "BL" + year + "-";
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + "0001";

  const ids = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues().flat();
  let maxNumber = 0;
  ids.forEach(function (id) {
    if (typeof id !== "string" || id.indexOf(prefix) !== 0) return;
    const parts = id.split("-");
    const num = parseInt(parts[1], 10);
    if (!isNaN(num) && num > maxNumber) maxNumber = num;
  });

  return prefix + String(maxNumber + 1).padStart(4, "0");
}

function saveMember(data) {
  const sheet = getRequiredSheet_(SHEETS.MEMBERS);
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const col = getHeaderMap_(headers);
  requireHeaders_(
    col,
    [
      "Member ID",
      "First Name",
      "Middle Name",
      "Last Name",
      "National Id",
      "Date of Birth",
      "Status",
    ],
    SHEETS.MEMBERS
  );

  const dobValue = data.dob ? new Date(data.dob) : "";

  if (data.id) {
    for (let i = 1; i < values.length; i++) {
      if (values[i][col["Member ID"]] !== data.id) continue;
      const row = i + 1;
      sheet.getRange(row, col["First Name"] + 1).setValue(data.firstName || "");
      sheet.getRange(row, col["Middle Name"] + 1).setValue(data.middleName || "");
      sheet.getRange(row, col["Last Name"] + 1).setValue(data.lastName || "");
      sheet.getRange(row, col["National Id"] + 1).setValue(data.nationalId || "");
      sheet.getRange(row, col["Date of Birth"] + 1).setValue(dobValue);
      sheet.getRange(row, col["Status"] + 1).setValue(data.status || "Active");
      return { success: true, message: "Member details updated successfully." };
    }
    throw new Error("Member ID not found.");
  }

  const rowData = new Array(headers.length).fill("");
  rowData[col["Member ID"]] = generateNextMemberId_(sheet, col["Member ID"] + 1);
  rowData[col["First Name"]] = data.firstName || "";
  rowData[col["Middle Name"]] = data.middleName || "";
  rowData[col["Last Name"]] = data.lastName || "";
  rowData[col["National Id"]] = data.nationalId || "";
  rowData[col["Date of Birth"]] = dobValue;
  if (col["Status"] !== undefined) {
    rowData[col["Status"]] = data.status || "Active";
  }
  sheet.appendRow(rowData);
  return { success: true, message: "Member registered successfully." };
}
