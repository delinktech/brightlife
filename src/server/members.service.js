function getMembersData(page, limit) {
  const currentPage = Number(page) > 0 ? Number(page) : 1;
  const pageLimit = Number(limit) > 0 ? Number(limit) : 100;
  try {
    const session = requireAccess_();
    const isMemberOnly = session.permissions && session.permissions.isMemberOnly;
    const callerMemberId = String(session.memberId || "").trim().toLowerCase();
    const callerMemberName = String(session.memberName || "").trim().toLowerCase();

    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.MEMBERS);
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: true, members: [], totalPages: 0, totalRows: 0, currentPage: 1 };
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
        "Gender",
        "Date of Birth",
        "Registration Date",
        "Total Savings",
        "Current Loan Balance",
        "Guaranteed Amount",
        "Status",
      ],
      SHEETS.MEMBERS
    );

    let totalGroupSavings = 0;
    values.slice(1).forEach(function (r) {
      if (r[col["Member ID"]] !== "") {
        totalGroupSavings += Number(r[col["Total Savings"]]) || 0;
      }
    });

    // If member-only caller, filter dataRows to only their own record
    const dataRows = values.slice(1).filter(function (row) {
      const mid = String(row[col["Member ID"]] || "").trim();
      if (!mid) return false;

      if (isMemberOnly) {
        const midLower = mid.toLowerCase();
        const firstName = String(row[col["First Name"]] || "").trim();
        const middleName = String(row[col["Middle Name"]] || "").trim();
        const lastName = String(row[col["Last Name"]] || "").trim();
        const fullName = (firstName + " " + middleName + " " + lastName).replace(/\s+/g, " ").trim().toLowerCase();

        var matchId = callerMemberId && midLower === callerMemberId;
        var matchName = callerMemberName && (fullName === callerMemberName || callerMemberName.indexOf(fullName) !== -1 || fullName.indexOf(callerMemberName) !== -1);
        return matchId || matchName;
      }

      return true;
    });

    const totalPages = Math.ceil(dataRows.length / pageLimit) || 1;
    const start = (currentPage - 1) * pageLimit;
    const tz = ss.getSpreadsheetTimeZone();

    const loanMap = {};
    try {
      const loansSheet = ss.getSheetByName(SHEETS.LOANS);
      if (loansSheet && loansSheet.getLastRow() > 1) {
        const loanValues = loansSheet.getDataRange().getValues();
        if (loanValues.length > 1) {
          const loanCol = getHeaderMap_(loanValues[0]);
          if (loanCol["Borrower Name"] !== undefined && loanCol["Requested Amount"] !== undefined) {
            for (let j = 1; j < loanValues.length; j++) {
              const borrower = String(loanValues[j][loanCol["Borrower Name"]] || "").trim().toLowerCase();
              const amt = Number(loanValues[j][loanCol["Requested Amount"]]) || 0;
              if (borrower) {
                loanMap[borrower] = (loanMap[borrower] || 0) + amt;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Loan map calculation error: " + e.message);
    }

    const members = dataRows.slice(start, start + pageLimit).map(function (row) {
      const middleName = (row[col["Middle Name"]] || "").toString().trim();
      const initial = middleName ? middleName.charAt(0) + "." : "";
      const firstName = row[col["First Name"]] || "";
      const lastName = row[col["Last Name"]] || "";
      const registrationDateValue = row[col["Registration Date"]];
      const fullNameClean = (firstName + " " + middleName + " " + lastName).replace(/\s+/g, " ").trim();
      const nameClean = (firstName + " " + initial + " " + lastName).replace(/\s+/g, " ").trim();
      
      const memberSavings = Number(row[col["Total Savings"]]) || 0;
      const loanBalance = Number(row[col["Current Loan Balance"]]) || 0;
      const guaranteedAmount = Number(row[col["Guaranteed Amount"]]) || 0;
      const maxLoanEligibility = col["Max Loan Eligibility"] !== undefined ? (Number(row[col["Max Loan Eligibility"]]) || 0) : Math.max(0, 2 * (memberSavings - guaranteedAmount) - loanBalance);
      const availableToGuarantee = col["Available to Guarantee"] !== undefined ? (Number(row[col["Available to Guarantee"]]) || 0) : Math.max(0, memberSavings - loanBalance - guaranteedAmount);
      const sharesPct = totalGroupSavings > 0 ? ((memberSavings / totalGroupSavings) * 100).toFixed(2) : "0.00";
      
      const bKey = fullNameClean.toLowerCase();
      const bKeyAlt = nameClean.toLowerCase();
      const totalLoanTaken = loanMap[bKey] !== undefined ? loanMap[bKey] : (loanMap[bKeyAlt] || (loanBalance > 0 ? loanBalance : 0));

      return {
        id: row[col["Member ID"]],
        dob: formatDateValue_(row[col["Date of Birth"]], tz),
        dobIso:
          row[col["Date of Birth"]] instanceof Date
            ? Utilities.formatDate(row[col["Date of Birth"]], tz, "yyyy-MM-dd")
            : "",
        gender: String(row[col["Gender"]] || "").trim(),
        registrationDate: formatDateValue_(registrationDateValue, tz),
        registrationDateIso:
          registrationDateValue instanceof Date
            ? Utilities.formatDate(registrationDateValue, tz, "yyyy-MM-dd")
            : "",
        name: nameClean,
        fullName: fullNameClean,
        nationalId: row[col["National Id"]] || "",
        phone: col["Phone Number"] !== undefined ? String(row[col["Phone Number"]] || "").trim() : "",
        email: col["Email"] !== undefined ? String(row[col["Email"]] || "").trim() : "",
        savings: memberSavings,
        sharesPercent: sharesPct,
        totalLoanTaken: totalLoanTaken,
        loanBalance: loanBalance,
        guaranteed: guaranteedAmount,
        maxLoanEligibility: maxLoanEligibility,
        availableToGuarantee: availableToGuarantee,
        status: row[col["Status"]] || "Active",
      };
    });

    return {
      success: true,
      members: members,
      totalGroupSavings: totalGroupSavings,
      totalPages: totalPages,
      totalRows: dataRows.length,
      currentPage: Math.min(currentPage, totalPages),
      isPersonalOnly: Boolean(isMemberOnly),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function generateNextMemberId_(sheet, colIndex, joinedDate) {
  let yr = new Date().getFullYear();
  if (joinedDate) {
    const parsed = new Date(joinedDate);
    if (!isNaN(parsed.getTime())) {
      yr = parsed.getFullYear();
    }
  }
  const currentYear2Digit = String(yr).slice(-2);
  const prefix = "BLM-" + currentYear2Digit;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + "001";

  const ids = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues().flat();
  let maxNumber = 0;
  const yearPattern = new RegExp("^BLM-" + currentYear2Digit + "(\\d+)$", "i");

  ids.forEach(function (id) {
    if (typeof id !== "string") return;
    const trimmed = id.trim();
    if (!trimmed) return;
    const match = trimmed.match(yearPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) maxNumber = num;
    }
  });

  return prefix + String(maxNumber + 1).padStart(3, "0");
}

function saveMember(data) {
  requirePermission_("membersWrite");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = getSpreadsheet_();
    const sheet = getRequiredSheet_(SHEETS.MEMBERS);
    const values = sheet.getDataRange().getValues();
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
        "Gender",
        "Date of Birth",
        "Registration Date",
        "Status",
      ],
      SHEETS.MEMBERS
    );

    const memberId = (data.memberId || data.id || "").trim();
    const isUpdate = Boolean(memberId);
    const tz = ss.getSpreadsheetTimeZone();

    let targetRowIndex = -1;
    if (isUpdate) {
      for (let i = 1; i < values.length; i++) {
        if (values[i][col["Member ID"]] === memberId) {
          targetRowIndex = i + 1;
          break;
        }
      }
      if (targetRowIndex === -1) {
        throw new Error("Member not found for update: " + memberId);
      }
    }

    const assignedId = isUpdate
      ? memberId
      : generateNextMemberId_(sheet, col["Member ID"] + 1, data.joinedDate);

    const rowData = isUpdate
      ? values[targetRowIndex - 1].slice()
      : new Array(headers.length).fill("");

    rowData[col["Member ID"]] = assignedId;
    rowData[col["First Name"]] = (data.firstName || "").trim();
    rowData[col["Middle Name"]] = (data.middleName || "").trim();
    rowData[col["Last Name"]] = (data.lastName || "").trim();
    rowData[col["National Id"]] = (data.nationalId || "").trim();
    rowData[col["Gender"]] = (data.gender || "").trim();
    rowData[col["Date of Birth"]] = parseDateInput_(data.dob, tz);
    rowData[col["Registration Date"]] = parseDateInput_(data.registrationDate, tz);
    rowData[col["Status"]] = (data.status || "Active").trim();

    if (col["Phone Number"] !== undefined) {
      rowData[col["Phone Number"]] = (data.phone || data.phoneNumber || "").trim();
    }
    if (col["Email"] !== undefined) {
      rowData[col["Email"]] = (data.email || "").trim().toLowerCase();
    }

    if (col["Full Name"] !== undefined) {
      if (typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(sheet, col["Full Name"])) {
        rowData[col["Full Name"]] = "";
      } else {
        rowData[col["Full Name"]] = (
          (data.firstName || "") +
          " " +
          (data.middleName || "") +
          " " +
          (data.lastName || "")
        )
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    // ARC-3: Any column governed by a Row 1 header spill formula must remain blank ("") on insert & update
    // so that row writes never obstruct the array spill with #REF!.
    const spillComputedHeaders = [
      "Total Savings",
      "Current Loan Balance",
      "Guaranteed Amount",
      "Max Loan Eligibility",
      "Available to Guarantee",
      "Full Name",
    ];
    spillComputedHeaders.forEach(function (h) {
      if (col[h] !== undefined && typeof hasHeaderSpillFormula_ === "function" && hasHeaderSpillFormula_(sheet, col[h])) {
        rowData[col[h]] = "";
      }
    });

    if (isUpdate) {
      let savedRow2Formulas = null;
      if (targetRowIndex === 2) {
        savedRow2Formulas = [];
        for (let c = 0; c < headers.length; c++) {
          try {
            const cell = sheet.getRange(2, c + 1);
            const f = cell && typeof cell.getFormula === "function" ? String(cell.getFormula() || "").trim() : "";
            if (f.indexOf("=") === 0 && (f.indexOf("MAP(") !== -1 || f.indexOf("ARRAYFORMULA(") !== -1 || f.indexOf("{") !== -1)) {
              savedRow2Formulas.push({ col1: c + 1, formula: f });
            }
          } catch (e) {}
        }
      }
      sheet.getRange(targetRowIndex, 1, 1, rowData.length).setValues([rowData]);
      if (targetRowIndex === 2 && savedRow2Formulas && savedRow2Formulas.length) {
        savedRow2Formulas.forEach(function (item) {
          try {
            const cell = sheet.getRange(2, item.col1);
            if (cell && typeof cell.setFormula === "function") cell.setFormula(item.formula);
          } catch (e) {}
        });
      }
    } else {
      sheet.appendRow(rowData);
    }

    const action = isUpdate ? "member.update" : "member.create";
    const fullName = [data.firstName, data.middleName, data.lastName]
      .filter(Boolean)
      .join(" ");

    appendAuditLog_(
      action,
      "Member",
      assignedId,
      (isUpdate ? "Updated" : "Registered") + " member " + fullName,
      JSON.stringify({
        assignedId: assignedId,
        status: data.status,
        nationalId: data.nationalId,
      })
    );

    clearDashboardCache_();
    return { success: true, memberId: assignedId };
  } finally {
    lock.releaseLock();
  }
}

function parseDateInput_(val, tz) {
  if (!val) return "";
  if (val instanceof Date) return val;
  const s = String(val).trim();
  if (!s) return "";
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  return s;
}
