function getAccountsData() {
  try {
    requireAccess_();
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.ACCOUNTS);
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) {
      return { success: true, accounts: [] };
    }

    const headers = rows[0];
    const col = getHeaderMap_(headers);
    requireHeaders_(col, ["Org. Name", "Acc. Number", "Balance Date", "Balance"], SHEETS.ACCOUNTS);
    const tz = ss.getSpreadsheetTimeZone();
    const accounts = rows.slice(1).filter(function (row) {
      return row[col["Org. Name"]] || row[col["Acc. Number"]];
    }).map(function (row) {
      return {
        orgName: String(row[col["Org. Name"]] || "").trim(),
        accountNumber: String(row[col["Acc. Number"]] || "").trim(),
        balanceDate: formatDateValue_(row[col["Balance Date"]], tz),
        balance: Number(row[col["Balance"]]) || 0,
        paymentMode:
          col["Payment Mode"] !== undefined
            ? String(row[col["Payment Mode"]] || "").trim()
            : "",
        paybill:
          col["Paybill"] !== undefined ? String(row[col["Paybill"]] || "").trim() : "",
      };
    });
    return { success: true, accounts: accounts };
  } catch (error) {
    return { success: false, error: error.message, accounts: [] };
  }
}
