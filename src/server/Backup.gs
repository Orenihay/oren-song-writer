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
