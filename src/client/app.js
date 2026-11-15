'use strict';

// Build-time values replaced by build.js
var BUILD_FP    = '__BUILD_FP__';
var APP_VERSION = '0.1.0';

// ── GAS bridge ────────────────────────────────────────────────────────────────
var _gas = typeof google !== 'undefined' && google.script;

function srv(method) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function (res, rej) {
    if (!_gas) {
      var stubs = {
        apiGetStatus: { ok:true, setup:{ setupDone:true, schemaVersion:1 }, fp: BUILD_FP },
        apiGetSongs:  { ok:true, songs:[] },
        apiGetSong:   { ok:false, error:'no-gas' },
        apiSaveSong:  { ok:true },
      };
      return setTimeout(function () { res(stubs[method] || { ok:true }); }, 180);
    }
    var runner = google.script.run
      .withSuccessHandler(res)
      .withFailureHandler(function (e) { rej(new Error(e.message || String(e))); });
    runner[method].apply(runner, args);
  });
}

// ── Transpose helpers ─────────────────────────────────────────────────────────
var _NOTES = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
var _NOTE_ALIASES = { 'Db':'C#','D#':'Eb','E#':'F','Fb':'E','G#':'Ab','A#':'Bb','B#':'C','Cb':'B' };

function _transposeNote(root, semitones) {
  var r = _NOTE_ALIASES[root] || root;
  var i = _NOTES.indexOf(r);
  if (i < 0) return root;
  return _NOTES[((i + semitones) % 12 + 12) % 12];
}

function _transposeChord(chord, semitones) {
  if (!chord || semitones === 0) return chord;
  var m = chord.match(/^([A-G][#b]?)(.*)/);
  if (!m) return chord;
  return _transposeNote(m[1], semitones) + m[2];
}

function _transposeDoc(doc, semitones) {
  var d = JSON.parse(JSON.stringify(doc));
  (d.blocks || []).forEach(function (blk) {
    (blk.lines || []).forEach(function (ln) {
      (ln.chords || []).forEach(function (ch) {
        ch.name = _transposeChord(ch.name, semitones);
      });
    });
  });
  return d;
}

function _keyToSemitone(key) {
  var root = (key || 'C').replace(/m$/, '');
  var r = _NOTE_ALIASES[root] || root;
  var i = _NOTES.indexOf(r);
  return i >= 0 ? i : 0;
}

// ── State ─────────────────────────────────────────────────────────────────────
var _lyricsMode  = false;
var _currentId   = null;
var _sheetState  = {};   // working copy while song sheet is open
var _sheetSongId = null;
var _blockPickerBi = -1;
var _perfLyricsOnly = false;
var _confirmCb   = null;
var _perfTranspose = 0;
var _perfScrollRaf = null;
var _perfScrollActive = false;
var _perfScrollSpeed  = 2.5; // px per frame

// ── App object ────────────────────────────────────────────────────────────────
var APP = {

  // ── Boot ───────────────────────────────────────────────────────────────
  boot: function () {
    var _done = false;
    function _render(songs) {
      if (_done) return;
      _done = true;
      APP._hideSplash();
      try { EDITOR.renderLibrary(songs || []); } catch(e) {}
    }

    // Fallback: if still on spinner after 3s, render empty library
    setTimeout(function () { _render([]); }, 3000);

    DB.getAllSongs().then(function (local) {
      if (local.length) _render(local);
    }).catch(function () {});

    srv('apiGetStatus').then(function (status) {
      if (!status.ok || !status.setup || !status.setup.setupDone) {
        return srv('apiSetup').then(function () { return srv('apiGetSongs'); });
      }
      return srv('apiGetSongs');
    }).then(function (r) {
      _render(r.songs || []);
      (r.songs || []).forEach(function (s) { DB.saveSong(s).catch(function(){}); });
    }).catch(function () {
      DB.getAllSongs().then(function (local) {
        _render(local);
        if (!local.length) APP.showToast('שגיאת חיבור לשרת', 'err');
      }).catch(function () { _render([]); });
    });
  },

  _hideSplash: function () {
    var el = document.getElementById('splash');
    if (!el) return;
    el.style.opacity = '0';
    el.style.transition = 'opacity .6s ease';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
  },

  // ── Navigation ─────────────────────────────────────────────────────────
  openSong: function (songId) {
    _currentId = songId;
    APP.closeCtx();

    DB.getSong(songId).then(function (local) {
      if (local) {
        var doc = _parseDoc(local._doc);
        EDITOR.renderEditor(local, doc);
        UNDO.clear();
      }
    }).catch(function(){});

    srv('apiGetSong', songId).then(function (r) {
      if (r && r.song) {
        var merged = Object.assign({}, r.song, { _doc: r.doc });
        DB.saveSong(merged).catch(function(){});
        if (_currentId === songId) {
          var doc = _parseDoc(r.doc);
          EDITOR.renderEditor(merged, doc);
          UNDO.clear();
        }
      }
    }).catch(function(){});
  },

  goHome: function () {
    _currentId = null;
    DB.getAllSongs().then(function (local) { EDITOR.renderLibrary(local); });
    srv('apiGetSongs').then(function (r) {
      var songs = r.songs || [];
      songs.forEach(function (s) { DB.saveSong(s).catch(function(){}); });
      EDITOR.renderLibrary(songs);
    }).catch(function(){});
  },

  goBack:        function () { APP.goHome(); },
  goToEditor:    function () { var s = EDITOR.getCurrentSong(), d = EDITOR.getCurrentDoc(); if (s && d) EDITOR.renderEditor(s, d); },
  goToStructure: function () { var s = EDITOR.getCurrentSong(), d = EDITOR.getCurrentDoc(); if (s && d) EDITOR.renderStructure(s, d); },

  // ── New song modal ──────────────────────────────────────────────────────
  newSong: function () {
    var modal = document.getElementById('newSongModal');
    var input = document.getElementById('newSongInput');
    if (!modal) return;
    modal.style.display = 'flex';
    if (input) { input.value = ''; input.style.borderColor = ''; setTimeout(function () { input.focus(); }, 60); }
  },

  confirmNewSong: function () {
    var modal = document.getElementById('newSongModal');
    var input = document.getElementById('newSongInput');
    var title = (input ? input.value : '').trim();
    if (!title) { if (input) { input.style.borderColor = '#f87171'; input.focus(); } return; }
    if (modal) modal.style.display = 'none';
    var id  = 'song_' + Date.now().toString(36);
    var now = new Date().toISOString();
    var firstBlock = { id: 'b_' + Math.random().toString(36).slice(2,8), type:'verse', label:'בית 1', lines:[{ lyrics:'', chords:[] }] };
    var song = { SongID:id, Title:title, Status:'draft', Key:'C', TimeSig:'4/4', BPM:0, Capo:0, Rev:0, CreatedAt:now, UpdatedAt:now, Pinned:'false' };
    var doc  = { blocks:[firstBlock], arrangement:[firstBlock.id] };
    song._doc = JSON.stringify(doc);
    DB.saveSong(song).then(function () {
      srv('apiSaveSong', { song:song, doc:JSON.stringify(doc), baseRev:0 }).catch(function(){});
      APP.openSong(id);
    });
  },

  cancelNewSong: function () {
    var modal = document.getElementById('newSongModal');
    if (modal) modal.style.display = 'none';
  },

  updateTitle: function (val) {
    var song = EDITOR.getCurrentSong();
    if (!song) return;
    song.Title = val;
    APP.scheduleAutosave();
  },

  addBlock: function () {
    var doc  = EDITOR.getCurrentDoc();
    var song = EDITOR.getCurrentSong();
    if (!doc || !song) return;
    UNDO.push({ song:song, doc:JSON.parse(JSON.stringify(doc)) });
    var id = 'b_' + Math.random().toString(36).slice(2,9);
    var verseCount = (doc.blocks || []).filter(function(b){ return b.type === 'verse'; }).length;
    var label = verseCount > 0 ? 'בית ' + (verseCount + 1) : 'בית';
    doc.blocks.push({ id:id, type:'verse', label:label, lines:[{ lyrics:'', chords:[] }] });
    doc.arrangement.push(id);
    EDITOR.renderEditor(song, doc);
    APP.scheduleAutosave();
  },

  // ── Library: search + filter ────────────────────────────────────────────
  openSearch: function () {
    var ov = document.getElementById('searchOverlay');
    var inp = document.getElementById('searchInput');
    if (!ov) return;
    ov.style.display = 'block';
    if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 60); }
    APP.filterSongs('');
  },

  closeSearch: function () {
    var ov = document.getElementById('searchOverlay');
    if (ov) ov.style.display = 'none';
  },

  filterSongs: function (query) {
    var songs  = EDITOR.getSongs();
    var q      = (query || '').trim().toLowerCase();
    var list   = q
      ? songs.filter(function (s) { return (s.Title || '').toLowerCase().indexOf(q) >= 0 || (s.Key || '').toLowerCase().indexOf(q) >= 0; })
      : songs;

    var el = document.getElementById('searchResults');
    if (!el) return;

    if (!list.length) {
      el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--t2)">לא נמצאו שירים</div>';
      return;
    }

    el.innerHTML = list.map(function (s, i) {
      var status = { draft:{ cls:'b-draft', lbl:'טיוטה' }, wip:{ cls:'b-wip', lbl:'בכתיבה' }, done:{ cls:'b-done', lbl:'גמור' } };
      var st = status[s.Status] || status['draft'];
      return '<div class="song-item list-anim" style="--i:' + i + '" onclick="APP.closeSearch();APP.openSong(\'' + s.SongID + '\')">' +
        '<div class="song-ico"><svg width="17" height="17" style="color:var(--em-lt)"><use href="#ico-music"/></svg></div>' +
        '<div class="song-info">' +
          '<div class="song-title">' + _esc(s.Title) + '</div>' +
          '<div class="song-meta">' + (s.Key ? '<span class="song-key">' + _esc(s.Key) + '</span>' : '') + '</div>' +
        '</div>' +
        '<span class="badge ' + st.cls + '">' + st.lbl + '</span>' +
        '</div>';
    }).join('');
  },

  setLibFilter: function (tab) {
    EDITOR.renderLibrary(EDITOR.getSongs(), tab);
  },

  // ── Song context menu ───────────────────────────────────────────────────
  openSongCtx: function (e, songId) {
    if (e) e.stopPropagation();
    APP.closeCtx();
    var rect = (e && e.currentTarget ? e.currentTarget : (e && e.target ? e.target : null));
    var r    = rect ? rect.getBoundingClientRect() : { bottom: 100, left: 100 };
    var popup = document.createElement('div');
    popup.id = 'songCtxPopup';
    popup.className = 'ctx-popup';
    var top  = Math.min(r.bottom + 4, window.innerHeight - 160);
    var left = Math.max(4, Math.min(r.left - 120, window.innerWidth - 180));
    popup.style.cssText = 'top:' + top + 'px;left:' + left + 'px';
    popup.innerHTML =
      '<div class="ctx-item" onclick="APP.openSongSettings(\'' + songId + '\');APP.closeCtx()">' +
        '<svg width="13" height="13"><use href="#ico-settings"/></svg> הגדרות' +
      '</div>' +
      '<div class="ctx-item" onclick="APP.togglePin(\'' + songId + '\');APP.closeCtx()">' +
        '<svg width="13" height="13"><use href="#ico-pin"/></svg> נעץ / הסר נעיצה' +
      '</div>' +
      '<div class="ctx-item danger" onclick="APP.confirmDeleteSongById(\'' + songId + '\');APP.closeCtx()">' +
        '<svg width="13" height="13"><use href="#ico-trash"/></svg> מחק שיר' +
      '</div>';
    document.body.appendChild(popup);
    setTimeout(function () {
      document.addEventListener('click', APP.closeCtx, { once: true });
    }, 50);
  },

  closeCtx: function () {
    var p = document.getElementById('songCtxPopup');
    if (p && p.parentNode) p.parentNode.removeChild(p);
  },

  // ── Playlist management ─────────────────────────────────────────────────
  newPlaylist: function () {
    var modal = document.getElementById('newPlaylistModal');
    var input = document.getElementById('newPlaylistInput');
    if (!modal) {
      // Create modal dynamically if not in DOM
      var m = document.createElement('div');
      m.id = 'newPlaylistModal';
      m.className = 'modal-overlay';
      m.innerHTML =
        '<div class="modal-box">' +
          '<div class="modal-title">סטליסט חדש</div>' +
          '<input id="newPlaylistInput" class="modal-input" type="text" dir="rtl" placeholder="שם הסטליסט..." autocomplete="off">' +
          '<div class="modal-btns">' +
            '<div class="modal-btn-sec" onclick="APP.cancelNewPlaylist()">ביטול</div>' +
            '<div class="modal-btn-pri" onclick="APP.confirmNewPlaylist()">צור</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(m);
      modal = m;
      input = document.getElementById('newPlaylistInput');
      m.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') APP.confirmNewPlaylist();
        if (e.key === 'Escape') APP.cancelNewPlaylist();
      });
    }
    modal.style.display = 'flex';
    if (input) { input.value = ''; input.style.borderColor = ''; setTimeout(function () { input.focus(); }, 60); }
  },

  cancelNewPlaylist: function () {
    var modal = document.getElementById('newPlaylistModal');
    if (modal) modal.style.display = 'none';
  },

  confirmNewPlaylist: function () {
    var modal = document.getElementById('newPlaylistModal');
    var input = document.getElementById('newPlaylistInput');
    var name  = (input ? input.value : '').trim();
    if (!name) { if (input) { input.style.borderColor = '#f87171'; input.focus(); } return; }
    if (modal) modal.style.display = 'none';
    var pl = { id: 'pl_' + Date.now().toString(36), name: name, songs: [], createdAt: new Date().toISOString() };
    DB.savePlaylist(pl).then(function () {
      APP.showToast('סטליסט נוצר ✓', 'ok');
      DB.getAllPlaylists().then(function (pls) { EDITOR.renderPlaylists(pls); });
    });
  },

  openPlaylist: function (plId) {
    DB.getPlaylist(plId).then(function (pl) {
      if (!pl) return;
      var allSongs = EDITOR.getSongs();
      var plSongs  = (pl.songs || []).map(function (sid) {
        return allSongs.find(function (s) { return s.SongID === sid; });
      }).filter(Boolean);
      EDITOR.renderPlaylistDetail(pl, plSongs, allSongs);
    });
  },

  openPlaylistCtx: function (e, plId) {
    if (e) e.stopPropagation();
    APP.closeCtx();
    var popup = document.createElement('div');
    popup.id = 'songCtxPopup';
    popup.className = 'ctx-popup';
    var r = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : { bottom: 100, left: 100 };
    var top  = Math.min(r.bottom + 4, window.innerHeight - 160);
    var left = Math.max(4, Math.min(r.left - 120, window.innerWidth - 180));
    popup.style.cssText = 'top:' + top + 'px;left:' + left + 'px';
    popup.innerHTML =
      '<div class="ctx-item" onclick="APP.renamePlaylist(\'' + plId + '\');APP.closeCtx()">' +
        '<svg width="13" height="13"><use href="#ico-settings"/></svg> שנה שם' +
      '</div>' +
      '<div class="ctx-item danger" onclick="APP.deletePlaylist(\'' + plId + '\');APP.closeCtx()">' +
        '<svg width="13" height="13"><use href="#ico-trash"/></svg> מחק סטליסט' +
      '</div>';
    document.body.appendChild(popup);
    setTimeout(function () { document.addEventListener('click', APP.closeCtx, { once: true }); }, 50);
  },

  renamePlaylist: function (plId) {
    DB.getPlaylist(plId).then(function (pl) {
      if (!pl) return;
      var newName = window.prompt ? window.prompt('שם חדש:', pl.name) : null;
      if (!newName || !newName.trim()) return;
      pl.name = newName.trim();
      DB.savePlaylist(pl).then(function () {
        APP.showToast('שם עודכן ✓', 'ok');
        DB.getAllPlaylists().then(function (pls) { EDITOR.renderPlaylists(pls); });
      });
    });
  },

  deletePlaylist: function (plId) {
    DB.deletePlaylist(plId).then(function () {
      APP.showToast('סטליסט נמחק', 'ok');
      DB.getAllPlaylists().then(function (pls) { EDITOR.renderPlaylists(pls); });
    });
  },

  addSongToPlaylist: function (plId, songId) {
    DB.getPlaylist(plId).then(function (pl) {
      if (!pl) return;
      if ((pl.songs || []).indexOf(songId) >= 0) { APP.showToast('השיר כבר בסטליסט', 'err'); return; }
      pl.songs = (pl.songs || []).concat([songId]);
      DB.savePlaylist(pl).then(function () {
        APP.showToast('נוסף ✓', 'ok');
        APP.openPlaylist(plId);
      });
    });
  },

  removeFromPlaylist: function (plId, songId) {
    DB.getPlaylist(plId).then(function (pl) {
      if (!pl) return;
      pl.songs = (pl.songs || []).filter(function (s) { return s !== songId; });
      DB.savePlaylist(pl).then(function () {
        APP.showToast('הוסר ✓', 'ok');
        APP.openPlaylist(plId);
      });
    });
  },

  openAddToPlaylistPicker: function (songId) {
    DB.getAllPlaylists().then(function (pls) {
      APP.closeCtx();
      if (!pls.length) {
        APP.showToast('אין סטליסטים — צור קודם', 'err');
        return;
      }
      var popup = document.createElement('div');
      popup.id = 'songCtxPopup';
      popup.className = 'ctx-popup';
      popup.style.cssText = 'top:120px;right:12px;left:auto;min-width:160px';
      popup.innerHTML = '<div class="ctx-item" style="font-size:.75rem;color:var(--t2);cursor:default">הוסף לסטליסט:</div>' +
        pls.map(function (pl) {
          return '<div class="ctx-item" onclick="APP.addSongToPlaylist(\'' + pl.id + '\',\'' + songId + '\');APP.closeCtx()">' +
            '<svg width="13" height="13"><use href="#ico-music"/></svg> ' + pl.name + '</div>';
        }).join('');
      document.body.appendChild(popup);
      setTimeout(function () { document.addEventListener('click', APP.closeCtx, { once: true }); }, 50);
    });
  },

  // ── Setlist performance navigation ──────────────────────────────────────
  _perfPlaylist:    null,
  _perfPlaylistIdx: 0,

  startSetlistPerf: function (pl, songs, idx) {
    APP._perfPlaylist    = { pl: pl, songs: songs };
    APP._perfPlaylistIdx = idx || 0;
    APP._loadSetlistSong(APP._perfPlaylistIdx);
  },

  _loadSetlistSong: function (idx) {
    var pld = APP._perfPlaylist;
    if (!pld || !pld.songs[idx]) return;
    var song = pld.songs[idx];
    var doc  = _parseDoc(song._doc);
    _perfTranspose = 0;
    APP.stopAutoScroll();
    EDITOR.renderPerformance(song, doc, 0);
    var prev = document.getElementById('perfPrevBtn');
    var next = document.getElementById('perfNextBtn');
    if (prev) prev.style.display = idx > 0 ? '' : 'none';
    if (next) next.style.display = idx < pld.songs.length - 1 ? '' : 'none';
    var tpVal = document.getElementById('perfTransposeVal');
    if (tpVal) tpVal.textContent = '0';
  },

  setlistNext: function () {
    if (!APP._perfPlaylist) return;
    var newIdx = APP._perfPlaylistIdx + 1;
    if (newIdx >= APP._perfPlaylist.songs.length) return;
    APP._perfPlaylistIdx = newIdx;
    APP._loadSetlistSong(newIdx);
  },

  setlistPrev: function () {
    if (!APP._perfPlaylist) return;
    var newIdx = APP._perfPlaylistIdx - 1;
    if (newIdx < 0) return;
    APP._perfPlaylistIdx = newIdx;
    APP._loadSetlistSong(newIdx);
  },

  // ── Voice memo ───────────────────────────────────────────────────────────
  _memoRecorder:   null,
  _memoChunks:     [],
  _memoIsRecording: false,

  toggleMemo: function () {
    if (APP._memoIsRecording) {
      APP.stopMemo();
    } else {
      APP.startMemo();
    }
  },

  startMemo: function () {
    var song = EDITOR.getCurrentSong();
    if (!song) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      APP.showToast('מיקרופון לא נתמך', 'err'); return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      APP._memoChunks = [];
      var options = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {};
      APP._memoRecorder = new MediaRecorder(stream, options);
      APP._memoRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) APP._memoChunks.push(e.data);
      };
      APP._memoRecorder.onstop = function () {
        var blob = new Blob(APP._memoChunks, { type: APP._memoRecorder.mimeType || 'audio/webm' });
        var reader = new FileReader();
        reader.onload = function () {
          var songId = EDITOR.getCurrentSong() && EDITOR.getCurrentSong().SongID;
          if (songId) {
            DB.saveMemo(songId, reader.result).then(function () {
              APP.showToast('הקלטה נשמרה ✓', 'ok');
              APP._refreshMemoPlayer(songId);
            });
          }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(function (t) { t.stop(); });
      };
      APP._memoRecorder.start(1000);
      APP._memoIsRecording = true;
      APP._refreshMemoBtn(true);
      APP.showToast('מקליט...', 'ok');
    }).catch(function () {
      APP.showToast('לא ניתן לגשת למיקרופון', 'err');
    });
  },

  stopMemo: function () {
    if (APP._memoRecorder && APP._memoIsRecording) {
      APP._memoRecorder.stop();
      APP._memoIsRecording = false;
      APP._refreshMemoBtn(false);
    }
  },

  _refreshMemoBtn: function (recording) {
    var btn = document.getElementById('memoBtn');
    if (!btn) return;
    btn.classList.toggle('recording', recording);
    btn.title = recording ? 'עצור הקלטה' : 'הקלטה קולית';
  },

  _refreshMemoPlayer: function (songId) {
    DB.getMemo(songId).then(function (memo) {
      var wrap = document.getElementById('memoPlayerWrap');
      if (!wrap) return;
      if (memo && memo.data) {
        wrap.innerHTML =
          '<audio class="memo-audio" controls src="' + memo.data + '"></audio>' +
          '<div class="memo-del-btn" onclick="APP.deleteMemo()" title="מחק הקלטה">🗑</div>';
        wrap.style.display = 'flex';
      } else {
        wrap.innerHTML = '';
        wrap.style.display = 'none';
      }
    });
  },

  deleteMemo: function () {
    var song = EDITOR.getCurrentSong();
    if (!song) return;
    DB.deleteMemo(song.SongID).then(function () {
      APP.showToast('הקלטה נמחקה', 'ok');
      APP._refreshMemoPlayer(song.SongID);
    });
  },

  openMemoPanel: function () {
    var song = EDITOR.getCurrentSong();
    if (!song) return;
    var panel = document.getElementById('memoPanel');
    if (!panel) return;
    var open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    if (!open) APP._refreshMemoPlayer(song.SongID);
  },

  // ── Song settings sheet ─────────────────────────────────────────────────
  openSongSettings: function (songIdOrNull) {
    var song = songIdOrNull
      ? EDITOR.getSongs().find(function (s) { return s.SongID === songIdOrNull; })
      : EDITOR.getCurrentSong();
    if (!song) return;

    _sheetSongId = song.SongID;
    _sheetState  = {
      Key:      song.Key    || 'C',
      Status:   song.Status || 'draft',
      BPM:      parseInt(song.BPM  || 0, 10),
      Capo:     parseInt(song.Capo || 0, 10),
      Pinned:   song.Pinned === 'true' || song.Pinned === true,
      Writer:   song.Writer   || '',
      Composer: song.Composer || '',
      Tags:     song.Tags     || '',
    };

    var titleEl = document.getElementById('sheetSongTitle');
    if (titleEl) titleEl.textContent = song.Title || 'הגדרות שיר';

    APP._refreshSongSheet();

    var writerEl   = document.getElementById('sheetWriter');
    var composerEl = document.getElementById('sheetComposer');
    var tagsEl     = document.getElementById('sheetTags');
    if (writerEl)   writerEl.value   = _sheetState.Writer;
    if (composerEl) composerEl.value = _sheetState.Composer;
    if (tagsEl)     tagsEl.value     = _sheetState.Tags;

    var el = document.getElementById('songSheet');
    if (el) el.style.display = 'block';
  },

  _refreshSongSheet: function () {
    // Key grid
    var keyGrid = document.getElementById('keyGrid');
    if (keyGrid) {
      var KEYS = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B',
                  'Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','Abm','Am','Bbm','Bm'];
      keyGrid.innerHTML = KEYS.map(function (k) {
        return '<div class="key-btn' + (k === _sheetState.Key ? ' on' : '') + '" onclick="APP.setSheetKey(\'' + k + '\')">' + k + '</div>';
      }).join('');
    }

    // Status
    ['draft','wip','done'].forEach(function (st) {
      var el = document.getElementById('st-' + st);
      if (el) el.className = 'status-btn' + (_sheetState.Status === st ? ' on' : '');
    });

    // BPM + Capo
    var bpmEl = document.getElementById('bpmVal');
    var capoEl = document.getElementById('capoVal');
    if (bpmEl)  bpmEl.textContent  = _sheetState.BPM  || '—';
    if (capoEl) capoEl.textContent = _sheetState.Capo || '0';

    // Pin
    var pinEl = document.getElementById('pinToggleIco');
    if (pinEl) pinEl.textContent = _sheetState.Pinned ? '★' : '☆';
  },

  setSheetKey: function (key) {
    _sheetState.Key = key;
    APP._refreshSongSheet();
  },

  setSheetStatus: function (st) {
    _sheetState.Status = st;
    APP._refreshSongSheet();
  },

  adjustBpm: function (delta) {
    _sheetState.BPM = Math.max(0, Math.min(300, (_sheetState.BPM || 0) + delta));
    var el = document.getElementById('bpmVal');
    if (el) el.textContent = _sheetState.BPM || '—';
  },

  adjustCapo: function (delta) {
    _sheetState.Capo = Math.max(0, Math.min(11, (_sheetState.Capo || 0) + delta));
    var el = document.getElementById('capoVal');
    if (el) el.textContent = _sheetState.Capo;
  },

  togglePinInSheet: function () {
    _sheetState.Pinned = !_sheetState.Pinned;
    var el = document.getElementById('pinToggleIco');
    if (el) el.textContent = _sheetState.Pinned ? '★' : '☆';
  },

  saveSongSheet: function () {
    var targetSong = _sheetSongId === _currentId ? EDITOR.getCurrentSong() : null;

    // Read text fields from DOM before apply
    var writerEl   = document.getElementById('sheetWriter');
    var composerEl = document.getElementById('sheetComposer');
    var tagsEl     = document.getElementById('sheetTags');
    if (writerEl)   _sheetState.Writer   = writerEl.value.trim();
    if (composerEl) _sheetState.Composer = composerEl.value.trim();
    if (tagsEl)     _sheetState.Tags     = tagsEl.value.trim();

    // Find the song in DB if not current
    var apply = function (song) {
      var oldKey = song.Key || 'C';
      var newKey = _sheetState.Key;

      song.Key      = newKey;
      song.Status   = _sheetState.Status;
      song.BPM      = _sheetState.BPM;
      song.Capo     = _sheetState.Capo;
      song.Pinned   = String(_sheetState.Pinned);
      song.Writer   = _sheetState.Writer;
      song.Composer = _sheetState.Composer;
      song.Tags     = _sheetState.Tags;
      song.UpdatedAt = new Date().toISOString();

      // Transpose chords if key changed and this is the current song
      if (oldKey !== newKey && _sheetSongId === _currentId) {
        var doc = EDITOR.getCurrentDoc();
        if (doc) {
          var semitones = _keyToSemitone(newKey) - _keyToSemitone(oldKey);
          var newDoc = _transposeDoc(doc, semitones);
          song._doc = JSON.stringify(newDoc);
          DB.saveSong(song).then(function () {
            var d = _parseDoc(song._doc);
            EDITOR.renderEditor(song, d);
          });
        } else {
          DB.saveSong(song);
        }
      } else {
        DB.saveSong(song);
        if (_sheetSongId === _currentId) {
          var s = EDITOR.getCurrentSong();
          var d = EDITOR.getCurrentDoc();
          if (s && d) EDITOR.renderEditor(s, d);
        }
      }

      APP.scheduleAutosave();
      APP.closeSongSheet();
      APP.showToast('נשמר ✓', 'ok');
    };

    if (targetSong) {
      apply(targetSong);
    } else {
      DB.getSong(_sheetSongId).then(function (song) {
        if (song) {
          apply(song);
          DB.getAllSongs().then(function (songs) { EDITOR.renderLibrary(songs); });
        }
      });
    }
  },

  closeSongSheet: function () {
    var el = document.getElementById('songSheet');
    if (el) el.style.display = 'none';
  },

  // ── Pin / Unpin ──────────────────────────────────────────────────────────
  togglePin: function (songId) {
    DB.getSong(songId).then(function (song) {
      if (!song) return;
      song.Pinned = (song.Pinned === 'true' || song.Pinned === true) ? 'false' : 'true';
      song.UpdatedAt = new Date().toISOString();
      DB.saveSong(song).then(function () {
        APP.scheduleAutosave();
        DB.getAllSongs().then(function (songs) { EDITOR.renderLibrary(songs); });
        APP.showToast(song.Pinned === 'true' ? 'נעוץ ✓' : 'הוסרה נעיצה', 'ok');
      });
    });
  },

  // ── Delete song ──────────────────────────────────────────────────────────
  confirmDeleteSongById: function (songId) {
    _confirmCb = function () {
      APP.closeConfirm();
      APP._doDeleteSong(songId);
    };
    var msg = document.getElementById('confirmMsg');
    if (msg) msg.textContent = 'למחוק את השיר? לא ניתן לשחזר.';
    var yesBtn = document.getElementById('confirmYesBtn');
    if (yesBtn) yesBtn.onclick = _confirmCb;
    var el = document.getElementById('confirmSheet');
    if (el) el.style.display = 'block';
  },

  confirmDeleteFromSheet: function () {
    APP.closeSongSheet();
    if (_sheetSongId) APP.confirmDeleteSongById(_sheetSongId);
  },

  _doDeleteSong: function (songId) {
    DB.getSong(songId).then(function (song) {
      if (!song) return;
      song.Deleted = 'true';
      DB.saveSong(song).then(function () {
        srv('apiSaveSong', { song:song, doc:song._doc, baseRev:parseInt(song.Rev||'0',10) }).catch(function(){});
        if (_currentId === songId) {
          _currentId = null;
          APP.goHome();
        } else {
          DB.getAllSongs().then(function (all) {
            var visible = all.filter(function (s) { return s.Deleted !== 'true'; });
            EDITOR.renderLibrary(visible);
          });
        }
        APP.showToast('השיר נמחק', 'ok');
      });
    });
  },

  closeConfirm: function () {
    var el = document.getElementById('confirmSheet');
    if (el) el.style.display = 'none';
    _confirmCb = null;
  },

  // ── Block type picker ───────────────────────────────────────────────────
  openBlockTypePicker: function (bi) {
    _blockPickerBi = bi;
    var doc  = EDITOR.getCurrentDoc();
    if (!doc || !doc.blocks[bi]) return;
    var curType = doc.blocks[bi].type;

    var TYPES = [
      { type:'intro',         lbl:'פתיחה' },
      { type:'verse',         lbl:'בית' },
      { type:'pre-chorus',    lbl:'מעבר' },
      { type:'chorus',        lbl:'פזמון' },
      { type:'post-chorus',   lbl:'אחרי פזמון' },
      { type:'bridge',        lbl:'גשר' },
      { type:'instrumental',  lbl:'אינסטרומנטל' },
      { type:'outro',         lbl:'סיום' },
      { type:'custom',        lbl:'מותאם' },
    ];
    var COLORS = {
      intro:'#a78bfa', verse:'#60a5fa', 'pre-chorus':'#4ade80', chorus:'#f97316',
      'post-chorus':'#fb923c', bridge:'#f472b6', instrumental:'#94a3b8',
      outro:'#94a3b8', custom:'#94a3b8',
    };
    var BG = {
      intro:'rgba(167,139,250,.12)', verse:'rgba(96,165,250,.12)', 'pre-chorus':'rgba(74,222,128,.12)',
      chorus:'rgba(249,115,22,.14)', 'post-chorus':'rgba(249,115,22,.09)', bridge:'rgba(244,114,182,.12)',
      instrumental:'rgba(148,163,184,.1)', outro:'rgba(148,163,184,.1)', custom:'rgba(148,163,184,.1)',
    };

    var grid = document.getElementById('typeGrid');
    if (grid) {
      grid.innerHTML = TYPES.map(function (t) {
        return '<div class="type-btn' + (t.type === curType ? ' on' : '') + '"' +
          ' style="background:' + (BG[t.type]||BG.custom) + ';color:' + (COLORS[t.type]||COLORS.custom) + ';border-color:' + (COLORS[t.type]||COLORS.custom) + '"' +
          ' onclick="APP.setBlockType(' + bi + ',\'' + t.type + '\')">' +
          t.lbl +
        '</div>';
      }).join('');
    }

    var el = document.getElementById('blockTypeSheet');
    if (el) el.style.display = 'block';
  },

  setBlockType: function (bi, type) {
    var doc  = EDITOR.getCurrentDoc();
    var song = EDITOR.getCurrentSong();
    if (!doc || !song || !doc.blocks[bi]) return;
    UNDO.push({ song:song, doc:JSON.parse(JSON.stringify(doc)) });
    doc.blocks[bi].type  = type;
    doc.blocks[bi].label = { intro:'פתיחה', verse:'בית', 'pre-chorus':'מעבר', chorus:'פזמון',
      'post-chorus':'אחרי פזמון', bridge:'גשר', instrumental:'אינסטרומנטל', outro:'סיום', custom:'מותאם' }[type] || type;
    APP.closeBlockTypeSheet();
    EDITOR.renderEditor(song, doc);
    APP.scheduleAutosave();
  },

  closeBlockTypeSheet: function () {
    var el = document.getElementById('blockTypeSheet');
    if (el) el.style.display = 'none';
  },

  // ── Delete line ──────────────────────────────────────────────────────────
  deleteLine: function (bi, li) {
    var doc  = EDITOR.getCurrentDoc();
    var song = EDITOR.getCurrentSong();
    if (!doc || !song || !doc.blocks[bi]) return;
    if (doc.blocks[bi].lines.length <= 1) {
      APP.showToast('לא ניתן למחוק שורה אחרונה', 'err');
      return;
    }
    UNDO.push({ song:song, doc:JSON.parse(JSON.stringify(doc)) });
    doc.blocks[bi].lines.splice(li, 1);
    EDITOR.renderEditor(song, doc);
    APP.scheduleAutosave();
  },

  // ── Performance mode ─────────────────────────────────────────────────────
  goToPerformance: function () {
    var song = EDITOR.getCurrentSong();
    var doc  = EDITOR.getCurrentDoc();
    if (!song || !doc) return;
    _perfLyricsOnly = false;
    _perfTranspose  = 0;
    APP.stopAutoScroll();
    EDITOR.renderPerformance(song, doc, 0);
    var lyrBtn = document.getElementById('perfLyrBtn');
    if (lyrBtn) lyrBtn.classList.remove('perf-lyrbtn-on');
    var tpVal = document.getElementById('perfTransposeVal');
    if (tpVal) tpVal.textContent = '0';
  },

  closePerformance: function () {
    APP.stopAutoScroll();
    var el = document.getElementById('perfScreen');
    if (el) el.style.display = 'none';
  },

  togglePerfLyrics: function () {
    _perfLyricsOnly = !_perfLyricsOnly;
    var scroll = document.getElementById('perfScroll');
    var btn    = document.getElementById('perfLyrBtn');
    if (scroll) scroll.classList.toggle('perf-lyrics-only', _perfLyricsOnly);
    if (btn) {
      btn.classList.toggle('perf-lyrbtn-on', _perfLyricsOnly);
      var use = btn.querySelector('use');
      if (use) use.setAttribute('href', _perfLyricsOnly ? '#ico-eye-off' : '#ico-eye');
    }
  },

  perfTransposeUp: function () {
    _perfTranspose = _perfTranspose >= 6 ? -5 : _perfTranspose + 1;
    APP._refreshPerfTranspose();
  },

  perfTransposeDown: function () {
    _perfTranspose = _perfTranspose <= -6 ? 5 : _perfTranspose - 1;
    APP._refreshPerfTranspose();
  },

  _refreshPerfTranspose: function () {
    var song = EDITOR.getCurrentSong();
    var doc  = EDITOR.getCurrentDoc();
    if (!song || !doc) return;
    var scrollTop = (document.getElementById('perfScroll') || {}).scrollTop || 0;
    EDITOR.renderPerformance(song, doc, _perfTranspose);
    var tpVal = document.getElementById('perfTransposeVal');
    if (tpVal) tpVal.textContent = _perfTranspose > 0 ? '+' + _perfTranspose : String(_perfTranspose);
    var scroll = document.getElementById('perfScroll');
    if (scroll) {
      scroll.scrollTop = scrollTop;
      scroll.classList.toggle('perf-lyrics-only', _perfLyricsOnly);
    }
  },

  toggleAutoScroll: function () {
    if (_perfScrollActive) { APP.stopAutoScroll(); } else { APP._startAutoScroll(); }
  },

  _startAutoScroll: function () {
    _perfScrollActive = true;
    var btn = document.getElementById('perfScrollBtn');
    if (btn) btn.classList.add('perf-scroll-on');
    function tick() {
      if (!_perfScrollActive) return;
      var scroll = document.getElementById('perfScroll');
      if (scroll) {
        scroll.scrollTop += _perfScrollSpeed;
        if (scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight) {
          APP.stopAutoScroll(); return;
        }
      }
      _perfScrollRaf = requestAnimationFrame(tick);
    }
    _perfScrollRaf = requestAnimationFrame(tick);
  },

  stopAutoScroll: function () {
    _perfScrollActive = false;
    if (_perfScrollRaf) { cancelAnimationFrame(_perfScrollRaf); _perfScrollRaf = null; }
    var btn = document.getElementById('perfScrollBtn');
    if (btn) btn.classList.remove('perf-scroll-on');
  },

  adjustScrollSpeed: function (delta) {
    _perfScrollSpeed = Math.max(0.5, Math.min(8, _perfScrollSpeed + delta));
  },

  // ── Undo ───────────────────────────────────────────────────────────────
  undo: function () {
    var snap = UNDO.pop();
    if (!snap) return;
    EDITOR.renderEditor(snap.song, snap.doc);
    APP.scheduleAutosave();
  },

  // ── Autosave ───────────────────────────────────────────────────────────
  scheduleAutosave: function () {
    var song = EDITOR.getCurrentSong();
    var doc  = EDITOR.getCurrentDoc();
    if (!song || !doc) return;
    var docStr  = JSON.stringify(doc);
    var payload = { song:song, doc:docStr, baseRev:parseInt(song.Rev || '0', 10) };
    DB.saveSong(Object.assign({}, song, { _doc: docStr })).catch(function(){});
    DB.enqueue(payload).then(function () { SYNC.schedule(); }).catch(function(){});

    var dot = document.getElementById('syncDot');
    if (dot) { dot.classList.add('sync-dot-pulse'); setTimeout(function () { dot.classList.remove('sync-dot-pulse'); }, 2000); }
  },

  // ── Conflict ───────────────────────────────────────────────────────────
  onConflict: function (r, payload) {
    APP.showToast('עדכון חדש זמין — טוען מחדש', 'err');
    if (payload && payload.song && payload.song.SongID) {
      APP.openSong(payload.song.SongID);
    }
  },

  // ── Lyrics toggle ──────────────────────────────────────────────────────
  toggleLyrics: function () {
    _lyricsMode = !_lyricsMode;
    var sc  = document.getElementById('editorScroll');
    var btn = document.getElementById('lyrBtn');
    if (sc)  sc.classList.toggle('lyrics-mode', _lyricsMode);
    if (btn) {
      btn.classList.toggle('active', _lyricsMode);
      var use = btn.querySelector('use');
      if (use) use.setAttribute('href', _lyricsMode ? '#ico-eye-off' : '#ico-eye');
    }
  },

  // ── Copy toggle ────────────────────────────────────────────────────────
  toggleCopy: function () {
    var m = document.getElementById('copyMenu');
    if (!m) return;
    var open = m.style.display !== 'none';
    m.style.display = open ? 'none' : 'block';
    var btn = document.getElementById('copyBtn');
    if (btn) btn.classList.toggle('active', !open);
    if (!open) {
      var p = document.getElementById('chordPicker');
      if (p) p.style.display = 'none';
    }
  },

  copyAs: function (mode) { EDITOR.copyAs(mode); },

  // ── Toast ──────────────────────────────────────────────────────────────
  showToast: function (msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(function () { t.className = 'toast'; }, 2800);
  },
};

// ── Keyboard shortcut ──────────────────────────────────────────────────────────
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    APP.undo();
  }
  if (e.key === 'Escape') {
    APP.closeCtx();
    APP.closeSongSheet();
    APP.closeBlockTypeSheet();
    APP.closeConfirm();
    APP.closeSearch();
    APP.closePerformance();
  }
});

// ── Close pickers on outside tap ──────────────────────────────────────────────
document.addEventListener('click', function (e) {
  var picker = document.getElementById('chordPicker');
  var copyMenu = document.getElementById('copyMenu');
  if (picker && picker.style.display !== 'none' && !picker.contains(e.target)) {
    EDITOR.closePicker();
  }
  if (copyMenu && copyMenu.style.display !== 'none') {
    var copyBtn = document.getElementById('copyBtn');
    if (!copyMenu.contains(e.target) && (!copyBtn || !copyBtn.contains(e.target))) {
      copyMenu.style.display = 'none';
      if (copyBtn) copyBtn.classList.remove('active');
    }
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
function _parseDoc(raw) {
  if (!raw) return { blocks:[], arrangement:[] };
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (e) { return { blocks:[], arrangement:[] }; }
}

function _esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', APP.boot);
} else {
  APP.boot();
}

// ── iOS keyboard: lift #root above keyboard when it appears ──────────────────
(function () {
  if (!window.visualViewport) return;
  var _raf = 0;
  function _adjust() {
    var root = document.getElementById('root');
    if (!root) return;
    var kbH = window.innerHeight - window.visualViewport.height;
    root.style.bottom = kbH > 60 ? kbH + 'px' : '';
  }
  window.visualViewport.addEventListener('resize', function () {
    cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_adjust);
  });
})();

// ── Scroll focused lyric inputs into view after keyboard opens ───────────────
document.addEventListener('focusin', function (e) {
  if (!e.target) return;
  var cls = e.target.className || '';
  if (cls.indexOf('lyric-input') < 0 && cls.indexOf('sheet-text-input') < 0) return;
  setTimeout(function () {
    e.target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 320);
}, true);
