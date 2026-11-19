/**
 * ARC-4: Request-Scoped SheetContext & RPC Optimization Pipeline.
 *
 * Centralizes spreadsheet handle resolution, sheet lookup (`ss.getSheets()`),
 * full-sheet value matrix reads (`sheet.getDataRange().getValues()`), and
 * header map indexing (`getHeaderMap_`) within a single HTTP/RPC execution.
 *
 * Guarantees:
 *   1. Each sheet is read at most ONCE per request (eliminating redundant scans
 *      across getHomeAnalyticsByRange_, computeLiquiditySummary_, buildInvestmentHomeCharts_,
 *      buildBalanceSheet_, buildIncomeStatement_, getAccountsBalanceChartData_,
 *      buildExposureTrajectory_, readUnifiedInvestmentLedgerValues_, and getStandaloneProjectCarryingItems_).
 *   2. Metadata-driven column resolution (`resolveColumnIndex` / `getCellValue`)
 *      decouples business logic from column order or minor header variations.
 *   3. Telemetry profiling (`getProfile()`) tracks `sheetReads`, `cacheHits`, and
 *      `sheetsReadList` to verify <= 8 sheet reads per full dashboard load.
 *   4. Automatic cache invalidation (`invalidateSheet` / `resetRequestSheetContext_`)
 *      whenever any write occurs.
 */

var ACTIVE_REQUEST_SHEET_CONTEXT_ = null;

function createSheetContext_(ss) {
  let spreadsheet = ss || null;
  let sheetsByLowerName = null;
  const valuesCache = {};
  const headerMapCache = {};
  const stats = {
    sheetReads: 0,
    rangeReads: 0,
    cacheHits: 0,
    sheetsReadList: [],
    readsBySheet: {},
  };

  function getSpreadsheet() {
    if (!spreadsheet) {
      spreadsheet = openSpreadsheetDirect_();
    }
    return spreadsheet;
  }

  function ensureSheetDirectory_() {
    if (sheetsByLowerName) return sheetsByLowerName;
    const s = getSpreadsheet();
    const list = s ? s.getSheets() : [];
    sheetsByLowerName = {};
    for (let i = 0; i < list.length; i++) {
      const name = String(list[i].getName() || "").trim().toLowerCase();
      if (name && !sheetsByLowerName[name]) {
        sheetsByLowerName[name] = list[i];
      }
    }
    return sheetsByLowerName;
  }

  function getSheet(targetName) {
    if (!targetName) return null;
    const target = String(targetName).trim().toLowerCase();
    const dir = ensureSheetDirectory_();
    if (dir[target]) return dir[target];

    if (typeof SHEET_NAME_ALIASES !== "undefined" && SHEET_NAME_ALIASES[target]) {
      const candidates = SHEET_NAME_ALIASES[target];
      for (let c = 0; c < candidates.length; c++) {
        const candKey = String(candidates[c] || "").trim().toLowerCase();
        if (dir[candKey]) return dir[candKey];
      }
    }
    return null;
  }

  function canonicalSheetKey_(sheetOrName) {
    if (!sheetOrName) return "";
    if (typeof sheetOrName === "string") {
      const resolved = getSheet(sheetOrName);
      return resolved
        ? String(resolved.getName() || "").trim().toLowerCase()
        : String(sheetOrName).trim().toLowerCase();
    }
    if (typeof sheetOrName.getName === "function") {
      return String(sheetOrName.getName() || "").trim().toLowerCase();
    }
    return "";
  }

  function recordRead_(canonicalName) {
    stats.sheetReads++;
    stats.readsBySheet[canonicalName] = (stats.readsBySheet[canonicalName] || 0) + 1;
    if (stats.sheetsReadList.indexOf(canonicalName) === -1) {
      stats.sheetsReadList.push(canonicalName);
    }
  }

  function getValues(sheetName, options) {
    const opts = options || {};
    const sheet = typeof sheetName === "string" ? getSheet(sheetName) : sheetName;
    if (!sheet) {
      if (opts.required) {
        throw new Error('Missing required sheet: "' + sheetName + '"');
      }
      return [];
    }
    const key = canonicalSheetKey_(sheet);
    if (!opts.forceRefresh && valuesCache[key] !== undefined) {
      stats.cacheHits++;
      return valuesCache[key];
    }
    const vals = sheet.getDataRange().getValues();
    valuesCache[key] = vals || [];
    headerMapCache[key] = vals && vals.length > 0 ? getHeaderMap_(vals[0]) : {};
    recordRead_(sheet.getName());
    return valuesCache[key];
  }

  function getHeaderMap(sheetName) {
    const vals = getValues(sheetName);
    const key = canonicalSheetKey_(sheetName);
    if (headerMapCache[key]) return headerMapCache[key];
    const map = vals && vals.length > 0 ? getHeaderMap_(vals[0]) : {};
    if (key) headerMapCache[key] = map;
    return map;
  }

  function readRange(sheetName, a1OrRow, col, numRows, numCols) {
    const sheet = typeof sheetName === "string" ? getSheet(sheetName) : sheetName;
    if (!sheet) return [];
    stats.rangeReads++;
    if (typeof a1OrRow === "string") {
      return sheet.getRange(a1OrRow).getValues();
    }
    return sheet.getRange(a1OrRow, col || 1, numRows || 1, numCols || 1).getValues();
  }

  function resolveColumnIndex(headerMapOrSheet, aliases) {
    const map =
      headerMapOrSheet && typeof headerMapOrSheet === "string"
        ? getHeaderMap(headerMapOrSheet)
        : headerMapOrSheet || {};
    const list = Array.isArray(aliases) ? aliases : [aliases];
    for (let i = 0; i < list.length; i++) {
      const candidate = String(list[i] || "").trim();
      if (!candidate) continue;
      if (map[candidate] !== undefined) return map[candidate];
      const lower = candidate.toLowerCase();
      if (map[lower] !== undefined) return map[lower];
      const normalized = lower.replace(/[_\s]+/g, " ");
      if (map[normalized] !== undefined) return map[normalized];
    }
    return undefined;
  }

  function getCellValue(row, headerMapOrSheet, aliases, fallback) {
    const defaultVal = fallback !== undefined ? fallback : "";
    if (!row || !Array.isArray(row)) return defaultVal;
    const idx = resolveColumnIndex(headerMapOrSheet, aliases);
    if (idx === undefined || idx < 0 || idx >= row.length) return defaultVal;
    const val = row[idx];
    return val === undefined || val === null ? defaultVal : val;
  }

  function invalidateSheet(sheetName) {
    if (!sheetName) {
      sheetsByLowerName = null;
      Object.keys(valuesCache).forEach(function (k) { delete valuesCache[k]; });
      Object.keys(headerMapCache).forEach(function (k) { delete headerMapCache[k]; });
      return;
    }
    const key = canonicalSheetKey_(sheetName);
    if (key) {
      delete valuesCache[key];
      delete headerMapCache[key];
    }
    const rawKey = String(sheetName).trim().toLowerCase();
    delete valuesCache[rawKey];
    delete headerMapCache[rawKey];
    sheetsByLowerName = null;
  }

  function getProfile() {
    let maxReadsPerSheet = 0;
    Object.keys(stats.readsBySheet).forEach(function (k) {
      if (stats.readsBySheet[k] > maxReadsPerSheet) {
        maxReadsPerSheet = stats.readsBySheet[k];
      }
    });
    return {
      sheetReads: stats.sheetReads,
      rangeReads: stats.rangeReads,
      cacheHits: stats.cacheHits,
      uniqueSheetsRead: stats.sheetsReadList.length,
      maxReadsPerSheet: maxReadsPerSheet,
      sheetsReadList: stats.sheetsReadList.slice(),
      readsBySheet: Object.assign({}, stats.readsBySheet),
    };
  }

  return {
    getSpreadsheet: getSpreadsheet,
    getSheet: getSheet,
    getValues: getValues,
    getHeaderMap: getHeaderMap,
    readRange: readRange,
    resolveColumnIndex: resolveColumnIndex,
    getCellValue: getCellValue,
    invalidateSheet: invalidateSheet,
    getProfile: getProfile,
  };
}

/**
 * Returns the active request-scoped SheetContext, creating one if none exists
 * (or if a different spreadsheet instance is explicitly passed).
 */
function getRequestSheetContext_(ss) {
  if (!ACTIVE_REQUEST_SHEET_CONTEXT_ || (ss && ACTIVE_REQUEST_SHEET_CONTEXT_.getSpreadsheet() !== ss)) {
    ACTIVE_REQUEST_SHEET_CONTEXT_ = createSheetContext_(ss);
  }
  return ACTIVE_REQUEST_SHEET_CONTEXT_;
}

/**
 * Starts a fresh request-scoped SheetContext (clearing any stale in-memory state from prior calls).
 */
function beginRequestSheetContext_(ss) {
  ACTIVE_REQUEST_SHEET_CONTEXT_ = createSheetContext_(ss);
  return ACTIVE_REQUEST_SHEET_CONTEXT_;
}

/**
 * Clears the active request-scoped SheetContext.
 */
function resetRequestSheetContext_() {
  ACTIVE_REQUEST_SHEET_CONTEXT_ = null;
}

/**
 * Invalidates a specific sheet (or all sheets when omitted) in the active request context.
 */
function invalidateSheetContextCache_(sheetName) {
  if (ACTIVE_REQUEST_SHEET_CONTEXT_) {
    ACTIVE_REQUEST_SHEET_CONTEXT_.invalidateSheet(sheetName);
  }
}

/**
 * Convenience helper: returns cached 2D values array for `sheetName` via the request-scoped
 * SheetContext (reading `sheet.getDataRange().getValues()` at most once per request).
 */
function getSheetValuesCached_(ss, sheetName, options) {
  const ctx = getRequestSheetContext_(ss);
  return ctx.getValues(sheetName, options);
}
