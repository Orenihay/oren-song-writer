function setupSpreadsheet() {
  return dbWithLock(function() {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var props = PropertiesService.getScriptProperties();
    var curV  = parseInt(props.getProperty('schemaVersion') || '0', 10);

    // Create tabs and write headers (additive only)
    Object.keys(SHEET_COLS).forEach(function(name) {
      var sh = ss.getSheetByName(name);
      if (!sh) { sh = ss.insertSheet(name); dbInvalidate(name); }

      var hdrs = SHEET_COLS[name];
      if (!sh.getRange(1, 1).getValue() || sh.getRange(1, 1).getValue() !== hdrs[0]) {
        sh.clearContents();
        sh.getRange(1, 1, 1, hdrs.length).setValues([hdrs])
          .setFontWeight('bold').setBackground('#f0f4ff');
        sh.setFrozenRows(1);
        dbInvalidate(name);
      }
    });

    // Record owner once
    if (!props.getProperty('ownerEmail')) {
      try { props.setProperty('ownerEmail', Session.getActiveUser().getEmail()); } catch (e) {}
    }

    // Additive schema migrations
    if (curV < CONFIG.SCHEMA_VERSION) {
      _migrateSchema(curV, CONFIG.SCHEMA_VERSION);
    }

    props.setProperty('schemaVersion', String(CONFIG.SCHEMA_VERSION));
    props.setProperty('setupDone', 'true');

    return { ok: true, schemaVersion: CONFIG.SCHEMA_VERSION };
  });
}

function _migrateSchema(fromV, toV) {
  // v0 → v1: initial setup — tabs already created above, nothing else needed
  healthLogError('migration', 'schema migrated', { from: fromV, to: toV });
}

function isSetupDone() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('setupDone') !== 'true') return false;
  return Object.keys(SHEET_COLS).every(function(n) { return dbExists(n); });
}

function getSetupStatus() {
  var props = PropertiesService.getScriptProperties();
  var sheets = {};
  Object.keys(SHEET_COLS).forEach(function(n) { sheets[n] = dbExists(n); });
  return {
    setupDone:     props.getProperty('setupDone') === 'true',
    schemaVersion: parseInt(props.getProperty('schemaVersion') || '0', 10),
    ownerSet:      !!props.getProperty('ownerEmail'),
    sheets:        sheets,
  };
}
