// Per-execution in-memory caches
var _dbSS      = null;
var _dbSheets  = {};
var _dbHeaders = {};

function _ss() {
  if (!_dbSS) _dbSS = SpreadsheetApp.getActiveSpreadsheet();
  return _dbSS;
}

function dbGetSheet(name) {
  if (!_dbSheets[name]) _dbSheets[name] = _ss().getSheetByName(name);
  return _dbSheets[name];
}

function dbGetHeaders(sheetName) {
  if (!_dbHeaders[sheetName]) {
    var sh = dbGetSheet(sheetName);
    if (!sh || sh.getLastRow() === 0) return [];
    _dbHeaders[sheetName] = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  }
  return _dbHeaders[sheetName];
}

function dbColIdx(sheetName, colName) {
  return dbGetHeaders(sheetName).indexOf(colName);
}

function dbRowToObj(sheetName, row) {
  var hdrs = dbGetHeaders(sheetName);
  var o = {};
  hdrs.forEach(function(h, i) { o[h] = row[i]; });
  return o;
}

function dbObjToRow(sheetName, obj) {
  return dbGetHeaders(sheetName).map(function(h) {
    return obj.hasOwnProperty(h) ? (obj[h] === undefined ? '' : obj[h]) : '';
  });
}

function dbReadAll(sheetName) {
  var sh = dbGetSheet(sheetName);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues()
    .map(function(r) { return dbRowToObj(sheetName, r); });
}

function dbFindRow(sheetName, keyCol, keyValue) {
  var sh = dbGetSheet(sheetName);
  if (!sh || sh.getLastRow() < 2) return -1;
  var ci = dbColIdx(sheetName, keyCol);
  if (ci < 0) return -1;
  var vals = sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(keyValue)) return i + 2;
  }
  return -1;
}

function dbWriteRow(sheetName, rowIdx, data) {
  var sh   = dbGetSheet(sheetName);
  var hdrs = dbGetHeaders(sheetName);
  var rng  = sh.getRange(rowIdx, 1, 1, hdrs.length);
  var cur  = rng.getValues()[0];
  var upd  = cur.slice();
  var dirty = false;
  hdrs.forEach(function(h, i) {
    if (!data.hasOwnProperty(h)) return;
    var v = data[h] === undefined ? '' : data[h];
    if (String(cur[i]) !== String(v)) { upd[i] = v; dirty = true; }
  });
  if (dirty) rng.setValues([upd]);
  return dirty;
}

function dbAppend(sheetName, data) {
  dbGetSheet(sheetName).appendRow(dbObjToRow(sheetName, data));
}

function dbUpsert(sheetName, keyCol, data) {
  var ri = dbFindRow(sheetName, keyCol, data[keyCol]);
  if (ri > 0) dbWriteRow(sheetName, ri, data);
  else        dbAppend(sheetName, data);
}

function dbInvalidate(sheetName) {
  delete _dbSheets[sheetName];
  delete _dbHeaders[sheetName];
}

function dbExists(sheetName) {
  return !!_ss().getSheetByName(sheetName);
}

function dbWithLock(fn) {
  var lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
