// === Config.gs ===
var CONFIG = {
  APP_NAME: 'Oren Song Writer',
  VERSION: '0.1.0',
  SCHEMA_VERSION: 1,

  SHEETS: {
    SONGS:          'Songs',
    SONG_DOCS:      'SongDocs',
    VERSIONS:       'Versions',
    PLAYLISTS:      'Playlists',
    PLAYLIST_SONGS: 'PlaylistSongs',
    TEMPLATES:      'Templates',
    SETTINGS:       'Settings',
    LISTS:          'Lists',
    ERRORS:         'Errors',
  },
};

var SHEET_COLS = {
  Songs:         ['SongID','Title','Writers','Status','Key','Capo','BPM','TimeSig','Language','Tags','Pinned','PinOrder','Rev','CreatedAt','UpdatedAt','DeletedAt','Notes','Preview'],
  SongDocs:      ['SongID','Part','Content','Rev','UpdatedAt'],
  Versions:      ['SongID','Rev','VersionName','Reason','CreatedAt','Content'],
  Playlists:     ['PlaylistID','Name','Description','Color','Private','SongOrder'],
  PlaylistSongs: ['PlaylistID','SongID','Position','DateAdded'],
  Templates:     ['TemplateID','Name','Structure','ChordProgression','IsBuiltIn','CreatedAt'],
  Settings:      ['Key','Value','UpdatedAt'],
  Lists:         ['Type','Value','Label','Order'],
  Errors:        ['Timestamp','Context','Error','Data','UserId'],
};

var SECTION_TYPES = [
  { type: 'intro',        label: 'פתיחה',       shortLabel: 'In',  color: '#a78bfa' },
  { type: 'verse',        label: 'בית',          shortLabel: 'V',   color: '#60a5fa' },
  { type: 'pre-chorus',   label: 'טרום-פזמון',   shortLabel: 'PC',  color: '#34d399' },
  { type: 'chorus',       label: 'פזמון',        shortLabel: 'C',   color: '#f97316' },
  { type: 'post-chorus',  label: 'הוק',          shortLabel: 'H',   color: '#fbbf24' },
  { type: 'bridge',       label: 'גשר',          shortLabel: 'B',   color: '#f472b6' },
  { type: 'instrumental', label: 'מעבר',         shortLabel: 'I',   color: '#94a3b8' },
  { type: 'outro',        label: 'סיום',         shortLabel: 'Out', color: '#a3e635' },
  { type: 'custom',       label: 'מותאם',        shortLabel: '',    color: '#e2e8f0' },
];

var SONG_STATUSES = ['draft', 'writing', 'done', 'archive'];

var FONTS_LYRICS  = ['Rubik','Heebo','Assistant','Noto Sans Hebrew','IBM Plex Sans Hebrew','Frank Ruhl Libre','Alef','Varela Round'];
var FONTS_CHORDS  = ['JetBrains Mono','IBM Plex Mono','Roboto Mono'];

var TEMPLATES_BUILTIN = [
  { id: 'tpl-vc',    name: 'Verse-Chorus',   structure: ['verse','chorus','verse','chorus','bridge','chorus'] },
  { id: 'tpl-pop',   name: 'Pop',            structure: ['verse','pre-chorus','chorus','verse','pre-chorus','chorus','bridge','chorus'] },
  { id: 'tpl-aaba',  name: 'AABA',           structure: ['verse','verse','bridge','verse'] },
  { id: 'tpl-12b',   name: 'בלוז 12 תיבות', structure: ['verse','verse','verse'] },
  { id: 'tpl-empty', name: 'ריק',            structure: [] },
];


// === Db.gs ===
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


// === Setup.gs ===
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


// === Health.gs ===
var BUILD_FP = 'v0.1.0-20261115T1915';

function healthLogError(context, err, data) {
  try {
    var sh = dbGetSheet(CONFIG.SHEETS.ERRORS);
    if (!sh) return;
    var msg    = (err instanceof Error) ? err.message : String(err);
    var userId = '';
    try { userId = Session.getActiveUser().getEmail(); } catch (e) {}
    sh.appendRow([
      new Date().toISOString(),
      context,
      msg,
      data ? JSON.stringify(data).substring(0, 2000) : '',
      userId,
    ]);
  } catch (e) {}
}

function apiCheckFingerprint(clientFp) {
  return { match: clientFp === BUILD_FP, server: BUILD_FP };
}

function apiHealth() {
  var out = { ok: true, version: CONFIG.VERSION, fp: BUILD_FP };
  try { out.setup = getSetupStatus(); } catch (e) { out.ok = false; out.error = e.message; }
  return out;
}

function apiGetStatus() {
  return { ok: true, setup: getSetupStatus(), version: CONFIG.VERSION, fp: BUILD_FP };
}

function apiGetSwitches() {
  try {
    var rows = dbReadAll(CONFIG.SHEETS.SETTINGS);
    var sw = {};
    rows.filter(function(r) { return String(r.Key).indexOf('switch.') === 0; })
      .forEach(function(r) { sw[r.Key.substring(7)] = r.Value === 'true' || r.Value === true; });
    return sw;
  } catch (e) { return {}; }
}


// === Backup.gs ===
function apiBackupNow() {
  try {
    return dbWithLock(function() {
      var ts   = new Date().toISOString();
      var name = CONFIG.APP_NAME + ' — Backup ' + ts.substring(0, 10);
      var copy = SpreadsheetApp.getActiveSpreadsheet().copy(name);
      return { ok: true, name: name, id: copy.getId(), ts: ts };
    });
  } catch (e) {
    healthLogError('backup', e);
    return { ok: false, error: e.message };
  }
}

function apiListBackups() {
  try {
    var prefix = CONFIG.APP_NAME + ' — Backup';
    var it     = DriveApp.searchFiles('title contains "' + prefix + '" and trashed = false');
    var list   = [];
    while (it.hasNext()) {
      var f = it.next();
      list.push({ id: f.getId(), name: f.getName(), ts: f.getDateCreated().toISOString() });
    }
    list.sort(function(a, b) { return b.ts.localeCompare(a.ts); });
    return { ok: true, backups: list };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


// === Songs.gs ===
function apiGetSongs() {
  try {
    if (!isSetupDone()) return { ok: false, error: 'setup_required' };
    var rows = dbReadAll(CONFIG.SHEETS.SONGS).filter(function(r) { return !r.DeletedAt; });
    return { ok: true, songs: rows };
  } catch (e) {
    healthLogError('apiGetSongs', e);
    return { ok: false, error: e.message };
  }
}

function apiGetSong(songId) {
  try {
    if (!isSetupDone()) return { ok: false, error: 'setup_required' };
    var ri = dbFindRow(CONFIG.SHEETS.SONGS, 'SongID', songId);
    if (ri < 0) return { ok: false, error: 'not_found' };

    var sh  = dbGetSheet(CONFIG.SHEETS.SONGS);
    var row = dbRowToObj(CONFIG.SHEETS.SONGS, sh.getRange(ri, 1, 1, sh.getLastColumn()).getValues()[0]);
    if (row.DeletedAt) return { ok: false, error: 'not_found' };

    var parts = dbReadAll(CONFIG.SHEETS.SONG_DOCS)
      .filter(function(r) { return r.SongID === songId; })
      .sort(function(a, b) { return a.Part - b.Part; });

    var json = parts.map(function(r) { return r.Content; }).join('');
    var doc  = json ? JSON.parse(json) : null;

    return { ok: true, song: row, doc: doc };
  } catch (e) {
    healthLogError('apiGetSong', e, { songId: songId });
    return { ok: false, error: e.message };
  }
}

function apiSaveSong(payload) {
  if (!isSetupDone())             return { ok: false, error: 'setup_required' };
  if (!payload || !payload.song)  return { ok: false, error: 'missing_data' };

  return dbWithLock(function() {
    try {
      var song    = payload.song;
      var doc     = payload.doc || null;
      var baseRev = payload.baseRev || 0;
      var now     = new Date().toISOString();

      // Conflict detection
      if (song.SongID) {
        var ri = dbFindRow(CONFIG.SHEETS.SONGS, 'SongID', song.SongID);
        if (ri > 0) {
          var sh  = dbGetSheet(CONFIG.SHEETS.SONGS);
          var cur = dbRowToObj(CONFIG.SHEETS.SONGS, sh.getRange(ri, 1, 1, sh.getLastColumn()).getValues()[0]);
          var srv = parseInt(cur.Rev || '0', 10);
          if (srv > baseRev) return { ok: false, error: 'conflict', serverRev: srv };
        }
      }

      var newRev     = (parseInt(baseRev, 10) || 0) + 1;
      song.Rev       = newRev;
      song.UpdatedAt = now;
      if (!song.CreatedAt) song.CreatedAt = now;
      if (!song.SongID)    song.SongID    = _genId();
      if (doc)             song.Preview   = _docToPreview(doc);

      dbUpsert(CONFIG.SHEETS.SONGS, 'SongID', song);
      if (doc !== null) _saveSongDoc(song.SongID, doc, newRev, now);

      return { ok: true, songId: song.SongID, rev: newRev };
    } catch (e) {
      healthLogError('apiSaveSong', e);
      return { ok: false, error: e.message };
    }
  });
}

function apiDeleteSong(songId) {
  if (!isSetupDone()) return { ok: false, error: 'setup_required' };
  if (!songId)        return { ok: false, error: 'missing_id' };
  return dbWithLock(function() {
    var ri = dbFindRow(CONFIG.SHEETS.SONGS, 'SongID', songId);
    if (ri < 0) return { ok: false, error: 'not_found' };
    dbWriteRow(CONFIG.SHEETS.SONGS, ri, { DeletedAt: new Date().toISOString() });
    return { ok: true };
  });
}

function _saveSongDoc(songId, doc, rev, now) {
  var json  = JSON.stringify(doc);
  var CHUNK = 40000;
  var parts = Math.ceil(json.length / CHUNK) || 1;
  var sh    = dbGetSheet(CONFIG.SHEETS.SONG_DOCS);

  // Remove existing parts in reverse order to preserve indices
  var existingRows = [];
  for (var i = sh.getLastRow(); i >= 2; i--) {
    var v = sh.getRange(i, dbColIdx(CONFIG.SHEETS.SONG_DOCS, 'SongID') + 1).getValue();
    if (String(v) === String(songId)) existingRows.push(i);
  }
  existingRows.sort(function(a, b) { return b - a; }).forEach(function(r) { sh.deleteRow(r); });
  dbInvalidate(CONFIG.SHEETS.SONG_DOCS);

  for (var p = 0; p < parts; p++) {
    dbAppend(CONFIG.SHEETS.SONG_DOCS, {
      SongID: songId, Part: p,
      Content: json.substring(p * CHUNK, (p + 1) * CHUNK),
      Rev: rev, UpdatedAt: now,
    });
  }
}

function _docToPreview(doc) {
  if (!doc || !doc.blocks) return '';
  var lines = [];
  Object.keys(doc.blocks).forEach(function(k) {
    var blk = doc.blocks[k];
    if (!blk.lines) return;
    blk.lines.forEach(function(ln) {
      if (typeof ln === 'string') { lines.push(ln); return; }
      var text = ln.text || '';
      if (!ln.chords || !ln.chords.length) { lines.push(text); return; }
      var cl = '';
      ln.chords.slice().sort(function(a, b) { return a.at - b.at; }).forEach(function(c) {
        while (cl.length < c.at) cl += ' ';
        cl += c.sym + ' ';
      });
      lines.push(cl.trimEnd());
      lines.push(text);
    });
  });
  return lines.join('\n').substring(0, 1000);
}

function _genId() {
  var c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var s = '';
  for (var i = 0; i < 12; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}


// === Code.gs ===
function doGet(e) {
  try {
    var out = HtmlService.createHtmlOutputFromFile('Index');
    out.setTitle(CONFIG.APP_NAME);
    out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return out;
  } catch (err) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:20px">שגיאה: ' + err.message + '</p>'
    );
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(CONFIG.APP_NAME)
    .addItem('פתח אפליקציה', 'menuOpenApp')
    .addSeparator()
    .addItem('הקמת מערכת', 'menuSetup')
    .addItem('בריאות המערכת', 'menuHealth')
    .addSeparator()
    .addItem('גיבוי עכשיו', 'menuBackup')
    .addToUi();
}

function menuOpenApp() {
  var url  = ScriptApp.getService().getUrl();
  var html = HtmlService.createHtmlOutput(
    '<script>window.open("' + url + '");google.script.host.close();<\/script>'
  );
  SpreadsheetApp.getUi().showModalDialog(html, 'פותח אפליקציה...');
}

function menuSetup() {
  var r = setupSpreadsheet();
  SpreadsheetApp.getUi().alert(r.ok ? 'ההקמה הושלמה בהצלחה!' : 'שגיאה: ' + r.error);
}

function menuHealth() {
  var s   = apiHealth();
  var msg = 'גרסה: ' + s.version + '\n' +
            'הקמה: ' + (s.setup && s.setup.setupDone ? 'בוצעה' : 'לא בוצעה') + '\n' +
            'סכמה: ' + (s.setup ? s.setup.schemaVersion : '?') + '\n' +
            'FP: ' + s.fp;
  SpreadsheetApp.getUi().alert('בריאות המערכת', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function menuBackup() {
  var r = apiBackupNow();
  SpreadsheetApp.getUi().alert(r.ok ? 'גיבוי נוצר: ' + r.name : 'שגיאה: ' + r.error);
}

function apiSetup() { return setupSpreadsheet(); }
