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
