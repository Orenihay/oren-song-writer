'use strict';
var EDITOR = (function () {
  var _song   = null;
  var _doc    = null;
  var _songs  = [];
  var _screen = 'library';
  var _pickerTarget  = null;
  var _chordDragSrc  = null;
  var _blockDragSrc  = null;
  var _lineDragSrc   = null;
  var _collapsedBlocks = {};
  var _libFilter = 'all';

  // ── Utility ────────────────────────────────────────────────────────────
  function _genId() { return 'b_' + Math.random().toString(36).slice(2, 9); }
  function _docCopy() { return JSON.parse(JSON.stringify(_doc)); }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _blockTypeLabel(type) {
    var m = { intro:'פתיחה', verse:'בית', 'pre-chorus':'מעבר', chorus:'פזמון',
              'post-chorus':'אחרי פזמון', bridge:'גשר', instrumental:'אינסטרומנטל',
              outro:'סיום', custom:'מותאם' };
    return m[type] || type;
  }

  function _blockTypeColor(type) {
    var m = {
      intro:        { bg:'rgba(167,139,250,.12)', col:'#a78bfa' },
      verse:        { bg:'rgba(96,165,250,.12)',  col:'#60a5fa' },
      'pre-chorus': { bg:'rgba(74,222,128,.12)',  col:'#4ade80' },
      chorus:       { bg:'rgba(249,115,22,.14)',  col:'#f97316' },
      'post-chorus':{ bg:'rgba(249,115,22,.09)',  col:'#fb923c' },
      bridge:       { bg:'rgba(244,114,182,.12)', col:'#f472b6' },
      instrumental: { bg:'rgba(148,163,184,.1)',  col:'#94a3b8' },
      outro:        { bg:'rgba(148,163,184,.1)',  col:'#94a3b8' },
      custom:       { bg:'rgba(148,163,184,.1)',  col:'#94a3b8' },
    };
    return m[type] || m['custom'];
  }

  function _arrLabel(blk) {
    var abbr = { intro:'In', verse:'V', 'pre-chorus':'PC', chorus:'C',
                 'post-chorus':'pC', bridge:'B', instrumental:'Ins', outro:'Out', custom:'X' };
    return abbr[blk.type] || blk.type.slice(0,2).toUpperCase();
  }

  function _countOccurrences(blockId) {
    if (!_doc || !_doc.arrangement) return 0;
    return _doc.arrangement.filter(function (id) { return id === blockId; }).length;
  }

  function _relTime(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 2)  return 'עכשיו';
    if (mins < 60) return 'לפני ' + mins + ' דק׳';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24)  return 'לפני ' + hrs + ' שע׳';
    return 'לפני ' + Math.floor(hrs / 24) + ' ימים';
  }

  function _statusInfo(st) {
    var m = { draft:{ cls:'b-draft', lbl:'טיוטה' }, wip:{ cls:'b-wip', lbl:'בכתיבה' }, done:{ cls:'b-done', lbl:'גמור' } };
    return m[st] || m['draft'];
  }

  // ── Segments ───────────────────────────────────────────────────────────
  function _lineToSegments(lyrics, chords) {
    var chars  = Array.from(lyrics || '');
    var sorted = (chords || []).slice().sort(function (a, b) { return a.at - b.at; });
    var segs   = [];
    var prev   = 0;
    for (var i = 0; i < sorted.length; i++) {
      var c  = sorted[i];
      var at = Math.min(c.at, chars.length);
      var nextAt = i + 1 < sorted.length ? Math.min(sorted[i+1].at, chars.length) : chars.length;
      if (at > prev) {
        segs.push({ chord: null, lyr: chars.slice(prev, at).join(''), at: prev });
      }
      segs.push({ chord: c.name, lyr: chars.slice(at, nextAt).join(''), at: at });
      prev = nextAt;
    }
    if (prev < chars.length) {
      segs.push({ chord: null, lyr: chars.slice(prev).join(''), at: prev });
    }
    if (!segs.length) {
      segs.push({ chord: null, lyr: lyrics || '', at: 0 });
    }
    return segs;
  }

  // ── Emblem (inline, small) ─────────────────────────────────────────────
  var _EMBLEM = '<svg width="22" height="22" viewBox="0 0 60 60" aria-hidden="true">' +
    '<circle cx="30" cy="30" r="29" fill="#061510"/>' +
    '<circle cx="30" cy="30" r="27" fill="none" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3.5 2.8"/>' +
    '<line x1="27.5" y1="4" x2="27.5" y2="56" stroke="#f59e0b" stroke-width="1.2" opacity=".7"/>' +
    '<line x1="30" y1="3" x2="30" y2="57" stroke="#f59e0b" stroke-width="1.6" opacity=".85"/>' +
    '<line x1="32.5" y1="4" x2="32.5" y2="56" stroke="#f59e0b" stroke-width="1.2" opacity=".7"/>' +
    '<circle cx="30" cy="30" r="18" fill="none" stroke="#2dd4bf" stroke-width="1.5"/>' +
    '<polygon points="30,14 27,20 33,20" fill="#2dd4bf"/>' +
    '<polygon points="30,18 25.5,25 34.5,25" fill="#2dd4bf"/>' +
    '<polygon points="30,23 23.5,31 36.5,31" fill="#2dd4bf"/>' +
    '<rect x="28.5" y="31" width="3" height="4" rx=".8" fill="#2dd4bf"/>' +
    '</svg>';

  var _EMBLEM_LG = '<svg width="64" height="64" viewBox="0 0 60 60" aria-hidden="true">' +
    '<circle cx="30" cy="30" r="29" fill="#061510"/>' +
    '<circle cx="30" cy="30" r="27" fill="none" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3.5 2.8"/>' +
    '<line x1="27.5" y1="4" x2="27.5" y2="56" stroke="#f59e0b" stroke-width="1.2" opacity=".7"/>' +
    '<line x1="30" y1="3" x2="30" y2="57" stroke="#f59e0b" stroke-width="1.6" opacity=".85"/>' +
    '<line x1="32.5" y1="4" x2="32.5" y2="56" stroke="#f59e0b" stroke-width="1.2" opacity=".7"/>' +
    '<circle cx="30" cy="30" r="18" fill="none" stroke="#2dd4bf" stroke-width="1.5"/>' +
    '<polygon points="30,14 27,20 33,20" fill="#2dd4bf"/>' +
    '<polygon points="30,18 25.5,25 34.5,25" fill="#2dd4bf"/>' +
    '<polygon points="30,23 23.5,31 36.5,31" fill="#2dd4bf"/>' +
    '<rect x="28.5" y="31" width="3" height="4" rx=".8" fill="#2dd4bf"/>' +
    '</svg>';

  // ── Library ────────────────────────────────────────────────────────────
  function renderLibrary(songs, filter) {
    _screen = 'library';
    _songs  = songs || [];
    if (filter !== undefined) _libFilter = filter;

    // Playlists tab → render playlists screen instead
    if (_libFilter === 'playlists') {
      DB.getAllPlaylists().then(function (pls) { renderPlaylists(pls); });
      return;
    }

    // Apply filter
    var filtered = _songs.filter(function (s) {
      if (_libFilter === 'all')    return true;
      if (_libFilter === 'pinned') return s.Pinned === 'true' || s.Pinned === true;
      if (_libFilter.slice(0,4) === 'tag:') {
        var tag = _libFilter.slice(4).toLowerCase();
        return (s.Tags || '').toLowerCase().split(',').some(function (t) { return t.trim() === tag; });
      }
      return (s.Status || 'draft') === _libFilter;
    });

    var pinned = _songs.filter(function (s) { return s.Pinned === 'true' || s.Pinned === true; });
    var list   = filtered.slice().sort(function (a, b) { return (b.UpdatedAt || '').localeCompare(a.UpdatedAt || ''); });

    var pinnedHtml = (_libFilter === 'all' && pinned.length)
      ? '<div class="pin-cards">' + pinned.map(function (s) {
          var si = _statusInfo(s.Status);
          return '<div class="pin-card screen-anim" onclick="APP.openSong(\'' + s.SongID + '\')">' +
            '<div class="pin-card-title">' + _esc(s.Title) + '</div>' +
            '<div class="pin-card-key">' + _esc(s.Key || '—') + '</div>' +
            '<span class="badge ' + si.cls + '">' + si.lbl + '</span>' +
            '</div>';
        }).join('') + '</div>'
      : '';

    var listHtml = list.map(function (s, i) {
      var si   = _statusInfo(s.Status);
      var upd  = _relTime(s.UpdatedAt);
      var tags = s.Tags ? s.Tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : [];
      var tagsHtml = tags.length
        ? '<div class="song-tags">' + tags.map(function (t) { return '<span class="tag-chip">' + _esc(t) + '</span>'; }).join('') + '</div>'
        : '';
      return '<div class="song-item list-anim" style="--i:' + i + '" onclick="APP.openSong(\'' + s.SongID + '\')">' +
        '<div class="song-ico"><svg width="17" height="17" style="color:var(--em-lt)"><use href="#ico-music"/></svg></div>' +
        '<div class="song-info">' +
          '<div class="song-title">' + _esc(s.Title) + '</div>' +
          '<div class="song-meta">' +
            (s.Key ? '<span class="song-key">' + _esc(s.Key) + '</span>' : '') +
            (upd   ? '<span class="song-upd"> · ' + upd + '</span>' : '') +
          '</div>' +
          tagsHtml +
        '</div>' +
        '<span class="badge ' + si.cls + '">' + si.lbl + '</span>' +
        '<div class="song-menu-btn" onclick="APP.openSongCtx(event,\'' + s.SongID + '\')">' +
          '<svg width="14" height="14"><use href="#ico-dots"/></svg>' +
        '</div>' +
        '</div>';
    }).join('');

    var emptyHtml = !list.length
      ? '<div class="empty-state">' +
          '<div class="empty-emblem">' + _EMBLEM_LG + '</div>' +
          '<div class="empty-title">אין שירים עדיין</div>' +
          '<div class="empty-sub">לחץ על "שיר חדש" כדי להתחיל לכתוב</div>' +
          '<div class="empty-create-btn" onclick="APP.newSong()">+ שיר חדש</div>' +
        '</div>'
      : '';

    // Filter tabs
    var tabs = [
      { id:'all',       lbl:'הכל' },
      { id:'pinned',    lbl:'נעוצים' },
      { id:'wip',       lbl:'בכתיבה' },
      { id:'done',      lbl:'גמור' },
      { id:'playlists', lbl:'סטליסטים' },
    ];
    var tabsHtml = '<div class="lib-tabs">' + tabs.map(function (t) {
      return '<div class="lib-tab' + (_libFilter === t.id ? ' on' : '') + '" onclick="APP.setLibFilter(\'' + t.id + '\')">' + t.lbl + '</div>';
    }).join('') + '</div>';

    document.getElementById('root').innerHTML =
      '<div class="app-hdr screen-anim">' +
        '<div class="hdr-icon-btn" title="חיפוש" onclick="APP.openSearch()"><svg width="17" height="17"><use href="#ico-search"/></svg></div>' +
        '<div class="app-logo-inline">' + _EMBLEM +
          '<span class="ali-oren">Oren</span><span class="ali-book">&nbsp;Song Book</span>' +
        '</div>' +
        '<div class="hdr-icon-btn" title="הגדרות" onclick="APP.showToast(\'הגדרות - בקרוב\')"><svg width="17" height="17"><use href="#ico-settings"/></svg></div>' +
      '</div>' +
      tabsHtml +
      (_libFilter === 'all' && pinned.length
        ? '<div class="pinned-section"><div class="section-lbl" style="padding:10px 16px 4px">נעוצים</div>' + pinnedHtml + '</div>'
        : '') +
      '<div class="section-lbl" style="padding:10px 16px 4px">שירים</div>' +
      '<div class="song-list">' + listHtml + emptyHtml + '</div>' +
      '<div class="fab" onclick="APP.newSong()">' +
        '<svg width="14" height="14"><use href="#ico-plus"/></svg> שיר חדש' +
      '</div>';

    _setBottomNav('library');
  }

  // ── Playlists screen ───────────────────────────────────────────────────
  function renderPlaylists(pls) {
    _screen = 'playlists';
    var tabs = [
      { id:'all',lbl:'הכל' },{ id:'pinned',lbl:'נעוצים' },{ id:'wip',lbl:'בכתיבה' },
      { id:'done',lbl:'גמור' },{ id:'playlists',lbl:'סטליסטים' },
    ];
    var tabsHtml = '<div class="lib-tabs">' + tabs.map(function (t) {
      return '<div class="lib-tab' + (t.id === 'playlists' ? ' on' : '') + '" onclick="APP.setLibFilter(\'' + t.id + '\')">' + t.lbl + '</div>';
    }).join('') + '</div>';

    var plsHtml = (pls || []).map(function (pl) {
      var count = (pl.songs || []).length;
      return '<div class="pl-item" onclick="APP.openPlaylist(\'' + pl.id + '\')">' +
        '<div class="pl-ico"><svg width="17" height="17" style="color:var(--em-lt)"><use href="#ico-music"/></svg></div>' +
        '<div class="pl-info">' +
          '<div class="pl-name">' + _esc(pl.name) + '</div>' +
          '<div class="pl-count">' + count + ' שירים</div>' +
        '</div>' +
        '<div class="song-menu-btn" onclick="APP.openPlaylistCtx(event,\'' + pl.id + '\')" style="pointer-events:all">' +
          '<svg width="14" height="14"><use href="#ico-dots"/></svg>' +
        '</div>' +
        '</div>';
    }).join('');

    var emptyHtml = !(pls || []).length
      ? '<div class="empty-state"><div class="empty-title">אין סטליסטים</div>' +
        '<div class="empty-sub">צור סטליסט לניהול שירים להופעה</div>' +
        '<div class="empty-create-btn" onclick="APP.newPlaylist()">+ סטליסט חדש</div></div>'
      : '';

    document.getElementById('root').innerHTML =
      '<div class="app-hdr screen-anim">' +
        '<div class="hdr-icon-btn" title="חיפוש" onclick="APP.openSearch()"><svg width="17" height="17"><use href="#ico-search"/></svg></div>' +
        '<div class="app-logo-inline">' + _EMBLEM +
          '<span class="ali-oren">Oren</span><span class="ali-book">&nbsp;Song Book</span>' +
        '</div>' +
        '<div class="hdr-icon-btn" title="סטליסט חדש" onclick="APP.newPlaylist()"><svg width="17" height="17"><use href="#ico-plus"/></svg></div>' +
      '</div>' +
      tabsHtml +
      '<div class="song-list">' + plsHtml + emptyHtml + '</div>' +
      '<div class="fab" onclick="APP.newPlaylist()">' +
        '<svg width="14" height="14"><use href="#ico-plus"/></svg> סטליסט חדש' +
      '</div>';

    _setBottomNav('library');
  }

  // ── Editor ─────────────────────────────────────────────────────────────
  function renderEditor(song, doc) {
    _screen = 'editor';
    _song   = song;
    _doc    = doc;

    var blocksHtml = (doc.blocks || []).map(function (blk, bi) {
      return _renderBlock(blk, bi);
    }).join('');

    var arrHtml = (doc.arrangement || []).map(function (bid) {
      var blk = (doc.blocks || []).find(function (b) { return b.id === bid; });
      if (!blk) return '';
      var c = _blockTypeColor(blk.type);
      return '<div class="arr-chip" style="border-color:' + c.col + ';color:' + c.col + ';background:' + c.bg + '">' +
        _arrLabel(blk) + '</div>';
    }).join('');

    document.getElementById('root').innerHTML =
      '<div class="song-nav-bar">' +
        '<div class="nav-back" onclick="APP.goBack()"><svg width="18" height="18"><use href="#ico-back"/></svg></div>' +
        '<div class="top-action-grp">' +
          '<div class="top-act-btn" id="undoBtn" onclick="APP.undo()" style="opacity:.35;pointer-events:none" title="ביטול">' +
            '<svg width="14" height="14"><use href="#ico-undo"/></svg>' +
          '</div>' +
        '</div>' +
        '<div class="song-hdr-info">' +
          '<input id="songTitleInput" class="song-title-input" type="text" dir="auto" autocomplete="off"' +
            ' value="' + _esc(song.Title) + '"' +
            ' oninput="APP.updateTitle(this.value)"' +
            ' placeholder="שם השיר">' +
          '<div class="song-hdr-key" onclick="APP.openSongSettings(null)" style="cursor:pointer" title="הגדרות שיר">' +
            _esc(song.Key || '') + (song.TimeSig ? ' · ' + song.TimeSig : '') +
          '</div>' +
        '</div>' +
        '<div class="hdr-icon-btn" id="lyrBtn" onclick="APP.toggleLyrics()" title="תצוגת מילים">' +
          '<svg width="15" height="15"><use href="#ico-eye"/></svg>' +
        '</div>' +
        '<div class="hdr-icon-btn" id="copyBtn" onclick="APP.toggleCopy()" title="העתק">' +
          '<svg width="14" height="14"><use href="#ico-copy"/></svg>' +
        '</div>' +
        '<div class="hdr-icon-btn" id="memoBtn" onclick="APP.openMemoPanel()" title="הקלטה קולית">' +
          '<svg width="14" height="14"><use href="#ico-mic"/></svg>' +
        '</div>' +
        '<span class="collapse-all-btn" id="collapseAllBtn" onclick="EDITOR.collapseAll()">קפל הכל</span>' +
      '</div>' +
      '<div class="sync-row"><span class="sync-dot" id="syncDot"></span><span id="syncStatus">שמור</span></div>' +
      '<div id="memoPanel" style="display:none" class="memo-panel">' +
        '<div class="memo-panel-row">' +
          '<button class="memo-rec-btn" id="memoRecBtn" onclick="APP.toggleMemo()">⏺ הקלט</button>' +
          '<div class="memo-player-wrap" id="memoPlayerWrap" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      '<div class="arr-strip">' + arrHtml + '</div>' +
      '<div class="editor-scroll" id="editorScroll">' + blocksHtml + '</div>' +
      '<div class="copy-menu" id="copyMenu" style="display:none">' +
        '<div class="copy-menu-title">העתק כ...</div>' +
        '<div class="copy-opt" onclick="APP.copyAs(\'chords\')">' +
          '<svg width="13" height="13"><use href="#ico-chord"/></svg>' +
          '<div><div class="copy-opt-title">עם אקורדים</div><div class="copy-opt-desc">שורות אקורד מעל מילים</div></div>' +
        '</div>' +
        '<div class="copy-opt" onclick="APP.copyAs(\'lyrics\')">' +
          '<svg width="13" height="13"><use href="#ico-eye"/></svg>' +
          '<div><div class="copy-opt-title">מילים בלבד</div><div class="copy-opt-desc">ללא אקורדים</div></div>' +
        '</div>' +
        '<div class="copy-opt" onclick="APP.copyAs(\'inline\')">' +
          '<svg width="13" height="13"><use href="#ico-struct"/></svg>' +
          '<div><div class="copy-opt-title">אינליין (Am)מילים</div><div class="copy-opt-desc">פורמט ניתן לעיון</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="chord-picker" id="chordPicker" style="display:none">' +
        '<div class="picker-drag-bar"></div>' +
        '<div class="picker-hdr">' +
          '<span class="picker-title" id="pickerTitle">בחר אקורד</span>' +
          '<div class="picker-remove-btn" id="pickerRemoveBtn" onclick="EDITOR.removeChord()" style="display:none">הסר</div>' +
        '</div>' +
        '<input class="picker-search" id="pickerSearch" dir="ltr" type="text" placeholder="חפש: Am, G7, Cmaj7..." oninput="EDITOR.filterChords(this.value)">' +
        '<div class="picker-sugg" id="pickerSugg"></div>' +
        '<div class="picker-common" id="pickerCommon"></div>' +
        '<div class="picker-kbd" id="pickerKbd"></div>' +
      '</div>';

    _setBottomNav('editor');
    _buildChordPicker();
    _initAllChordDragTouch();
    _initBlockDragTouch();
  }

  function _renderBlock(blk, bi) {
    var c = _blockTypeColor(blk.type);
    var occ = _countOccurrences(blk.id);
    var linesHtml = (blk.lines || []).map(function (ln, li) {
      return _renderLine(ln, bi, li);
    }).join('');
    linesHtml += '<div class="add-line-row" onclick="EDITOR.addLine(' + bi + ')">' +
      '<span style="color:var(--t3);font-size:.82rem">+ שורה</span>' +
      '</div>';

    var isCollapsed = !!_collapsedBlocks[blk.id];
    return '<div class="block' + (isCollapsed ? ' collapsed' : '') + '" data-bi="' + bi + '" data-block-id="' + blk.id + '"' +
      ' style="border-left-color:' + c.col + '"' +
      ' draggable="true"' +
      ' ondragstart="EDITOR.blockDragStart(event,' + bi + ')"' +
      ' ondragend="EDITOR.blockDragEnd(event)"' +
      ' ondragover="EDITOR.blockDragOver(event,' + bi + ')"' +
      ' ondragleave="EDITOR.blockDragLeave(event)"' +
      ' ondrop="EDITOR.blockDrop(event,' + bi + ')">' +
      '<div class="block-hdr">' +
        '<span class="block-drag-handle" title="גרור לסידור מחדש">⠿</span>' +
        '<span class="block-pill" style="background:' + c.bg + ';color:' + c.col + ';cursor:pointer" onclick="APP.openBlockTypePicker(' + bi + ')" title="שנה סוג קטע">' +
          _esc(blk.label || _blockTypeLabel(blk.type)) +
        '</span>' +
        '<span class="dup-btn" onclick="EDITOR.duplicateBlock(' + bi + ')" title="שכפל (Ctrl+D)">' +
          '<svg width="11" height="11"><use href="#ico-dup"/></svg>שכפל' +
        '</span>' +
        (occ > 1 ? '<span class="block-occ">' + occ + 'x</span>' : '') +
        '<span class="block-collapse-btn" onclick="EDITOR.toggleBlockCollapse(\'' + blk.id + '\')" title="קפל/פתח">▼</span>' +
      '</div>' +
      '<div class="lines">' + linesHtml + '</div>' +
      '</div>';
  }

  function _splitWords(lyrics) {
    if (!lyrics) return [];
    var chars = Array.from(lyrics), words = [], i = 0;
    while (i < chars.length) {
      while (i < chars.length && (chars[i] === ' ' || chars[i] === '\t')) i++;
      var start = i;
      while (i < chars.length && chars[i] !== ' ' && chars[i] !== '\t') i++;
      if (i > start) words.push({ text: chars.slice(start, i).join(''), at: start });
    }
    return words;
  }

  function _buildWordChips(ln, bi, li) {
    var words = _splitWords(ln.lyrics);
    if (!words.length) {
      return '<div class="word-chips-row" id="wc_' + bi + '_' + li + '" data-bi="' + bi + '" data-li="' + li + '">' +
        '<span class="word-chip word-chip-ph" onclick="EDITOR.tapWord(event,' + bi + ',' + li + ',0)">' +
          '<div class="word-chord-slot"><span class="chord-add-hint">+</span></div>' +
          '<span class="word-lyr">הקלד...</span>' +
        '</span></div>';
    }
    var chipsHtml = words.map(function (w) {
      var ex = (ln.chords || []).find(function (c) { return c.at === w.at; });
      // draggable is on the chord BADGE only — word text never moves
      var chordDrag = ex
        ? ' draggable="true" ondragstart="EDITOR.chordDragStart(event,' + bi + ',' + li + ',' + w.at + ')" ondragend="EDITOR.chordDragEnd(event)"'
        : '';
      var slotHtml = ex
        ? '<span class="chord"' + chordDrag + '>' + _esc(ex.name) + '</span>'
        : '<span class="chord-add-hint">+</span>';
      return '<span class="word-chip' + (ex ? ' has-chord' : '') + '"' +
        ' data-at="' + w.at + '"' +
        ' ondragover="EDITOR.chordDragOver(event)"' +
        ' ondragleave="EDITOR.chordDragLeave(event)"' +
        ' ondrop="EDITOR.chordDrop(event,' + bi + ',' + li + ',' + w.at + ')"' +
        ' onclick="EDITOR.tapWord(event,' + bi + ',' + li + ',' + w.at + ')">' +
        '<div class="word-chord-slot">' + slotHtml + '</div>' +
        '<span class="word-lyr">' + _esc(w.text) + '</span>' +
        '</span>';
    }).join('');
    return '<div class="word-chips-row" id="wc_' + bi + '_' + li + '" data-bi="' + bi + '" data-li="' + li + '">' + chipsHtml + '</div>';
  }

  function _renderLine(ln, bi, li) {
    return '<div class="line-pair" data-bi="' + bi + '" data-li="' + li + '"' +
      ' draggable="true"' +
      ' ondragstart="EDITOR.lineDragStart(event,' + bi + ',' + li + ')"' +
      ' ondragend="EDITOR.lineDragEnd(event)"' +
      ' ondragover="EDITOR.lineDragOver(event,' + bi + ',' + li + ')"' +
      ' ondragleave="EDITOR.lineDragLeave(event)"' +
      ' ondrop="EDITOR.lineDrop(event,' + bi + ',' + li + ')">' +
      '<span class="line-drag-handle" title="גרור שורה">⠿</span>' +
      _buildWordChips(ln, bi, li) +
      '<div class="line-input-wrap">' +
        '<input type="text" class="lyric-input" dir="rtl" autocomplete="off"' +
          ' value="' + _esc(ln.lyrics || '') + '"' +
          ' oninput="EDITOR.updateLyrics(this,' + bi + ',' + li + ')"' +
          ' onkeydown="EDITOR.handleLineKey(event,' + bi + ',' + li + ')"' +
          ' onfocus="EDITOR.closePicker()"' +
          ' placeholder="הקלד מילים...">' +
        '<div class="line-del-btn" onclick="APP.deleteLine(' + bi + ',' + li + ')" title="מחק שורה">✕</div>' +
      '</div>' +
      '</div>';
  }

  function _segsToHtml(segs, bi, li) {
    return segs.map(function (seg) {
      var chordHtml = seg.chord
        ? '<span class="chord" data-at="' + seg.at + '" onclick="EDITOR.pickChord(event,' + bi + ',' + li + ',' + seg.at + ')">' + _esc(seg.chord) + '</span>'
        : '<span class="chord-ph"></span>';
      return '<span class="seg" data-at="' + seg.at + '" onclick="EDITOR.tapLyric(event,' + bi + ',' + li + ',' + seg.at + ')">' +
        chordHtml + '<span class="lyr">' + _esc(seg.lyr) + '</span>' +
        '</span>';
    }).join('');
  }

  function toggleBlockCollapse(blockId) {
    _collapsedBlocks[blockId] = !_collapsedBlocks[blockId];
    var el = document.querySelector('[data-block-id="' + blockId + '"]');
    if (el) el.classList.toggle('collapsed', !!_collapsedBlocks[blockId]);
  }

  function collapseAll() {
    if (!_doc) return;
    var blocks = _doc.blocks || [];
    var anyExpanded = blocks.some(function (b) { return !_collapsedBlocks[b.id]; });
    blocks.forEach(function (b) { _collapsedBlocks[b.id] = anyExpanded; });
    document.querySelectorAll('.block').forEach(function (el) {
      var id = el.dataset.blockId;
      if (id) el.classList.toggle('collapsed', !!_collapsedBlocks[id]);
    });
    var btn = document.getElementById('collapseAllBtn');
    if (btn) btn.textContent = anyExpanded ? 'פתח הכל' : 'קפל הכל';
  }

  function handleLineKey(e, bi, li) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLine(bi, li);
      setTimeout(function () {
        var row = document.querySelector('[data-bi="' + bi + '"][data-li="' + (li + 1) + '"]');
        var inp = row && row.querySelector('.lyric-input');
        if (inp) inp.focus();
      }, 40);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      duplicateBlock(bi);
    }
  }

  function updateLyrics(input, bi, li) {
    _doc.blocks[bi].lines[li].lyrics = input.value;
    var ln = _doc.blocks[bi].lines[li];
    var wcEl = document.getElementById('wc_' + bi + '_' + li);
    if (wcEl) {
      var tmp = document.createElement('div');
      tmp.innerHTML = _buildWordChips(ln, bi, li);
      var newRow = tmp.firstChild;
      wcEl.parentNode.replaceChild(newRow, wcEl);
      _initChordDragTouch(newRow);
    }
    APP.scheduleAutosave();
  }

  function tapWord(e, bi, li, at) {
    if (e) e.stopPropagation();
    _pickerTarget = { bi: bi, li: li, at: at };
    var existing = (_doc.blocks[bi].lines[li].chords || []).find(function (c) { return c.at === at; });
    var titleEl  = document.getElementById('pickerTitle');
    var removeEl = document.getElementById('pickerRemoveBtn');
    if (titleEl)  titleEl.textContent = existing ? (existing.name + ' — שנה') : 'הוסף אקורד';
    if (removeEl) removeEl.style.display = existing ? 'block' : 'none';
    _buildChordPicker();
    _openPicker();
  }

  // ── Chord drag within a line ────────────────────────────────────────────
  function chordDragStart(e, bi, li, at) {
    _chordDragSrc = { bi: bi, li: li, at: at };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
    // Show only the chord badge as drag ghost (not the whole word-chip)
    var ghost = document.createElement('span');
    ghost.className = 'chord chord-drag-ghost';
    ghost.textContent = e.currentTarget.textContent;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    setTimeout(function () { ghost.remove(); }, 0);
    e.currentTarget.classList.add('chord-src-dragging');
  }

  function chordDragEnd(e) {
    _chordDragSrc = null;
    document.querySelectorAll('.chord-src-dragging,.chord-drag-over').forEach(function (el) {
      el.classList.remove('chord-src-dragging', 'chord-drag-over');
    });
  }

  function chordDragOver(e) {
    if (!_chordDragSrc) return;
    e.preventDefault();
    e.currentTarget.classList.add('chord-drag-over');
  }

  function chordDragLeave(e) {
    e.currentTarget.classList.remove('chord-drag-over');
  }

  function chordDrop(e, bi, li, at) {
    e.stopPropagation();
    e.currentTarget.classList.remove('chord-drag-over');
    var src = _chordDragSrc;
    _chordDragSrc = null;
    if (!src || (src.bi === bi && src.li === li && src.at === at)) return;
    if (src.bi !== bi || src.li !== li) return;
    _moveChord(src.bi, src.li, src.at, at);
  }

  function _moveChord(bi, li, fromAt, toAt) {
    var ln = _doc.blocks[bi].lines[li];
    var chords = ln.chords || [];
    var srcChord = chords.find(function (c) { return c.at === fromAt; });
    if (!srcChord) return;
    UNDO.push({ song: _song, doc: _docCopy() });
    ln.chords = chords.filter(function (c) { return c.at !== fromAt && c.at !== toAt; });
    ln.chords.push({ at: toAt, name: srcChord.name });
    var wcEl = document.getElementById('wc_' + bi + '_' + li);
    if (wcEl) {
      var tmp = document.createElement('div');
      tmp.innerHTML = _buildWordChips(ln, bi, li);
      var newRow = tmp.firstChild;
      wcEl.parentNode.replaceChild(newRow, wcEl);
      _initChordDragTouch(newRow);
    }
    APP.scheduleAutosave();
  }

  function _initChordDragTouch(rowEl) {
    if (!rowEl) return;
    // Listen on the chord badge only — word text should not drag
    var chordBadges = Array.from(rowEl.querySelectorAll('.word-chip.has-chord .chord'));
    chordBadges.forEach(function (badge) {
      var chip = badge.closest('.word-chip');
      var touchSrc = null, touchClone = null, moved = false;
      badge.addEventListener('touchstart', function (e) {
        moved = false;
        touchSrc = { chip: chip, bi: parseInt(rowEl.dataset.bi, 10), li: parseInt(rowEl.dataset.li, 10), at: parseInt(chip.dataset.at, 10) };
        // Clone only the chord badge as the visual ghost
        touchClone = badge.cloneNode(true);
        touchClone.style.cssText = 'position:fixed;opacity:0;pointer-events:none;z-index:999;transition:none;margin:0;';
        document.body.appendChild(touchClone);
      }, { passive: true });
      badge.addEventListener('touchmove', function (e) {
        if (!touchSrc || !touchClone) return;
        moved = true;
        e.preventDefault();
        var t0 = e.touches[0];
        // Show ghost only after first movement
        touchClone.style.opacity = '.8';
        touchClone.style.left = (t0.clientX - touchClone.offsetWidth / 2) + 'px';
        touchClone.style.top  = (t0.clientY - touchClone.offsetHeight - 8) + 'px';
        touchClone.style.display = 'none';
        var el = document.elementFromPoint(t0.clientX, t0.clientY);
        touchClone.style.display = '';
        var target = el && el.closest('.word-chip');
        Array.from(rowEl.querySelectorAll('.word-chip')).forEach(function (c) { c.classList.remove('chord-drag-over'); });
        if (target && target !== chip) target.classList.add('chord-drag-over');
      }, { passive: false });
      badge.addEventListener('touchend', function (e) {
        if (!touchSrc) return;
        if (touchClone) { touchClone.remove(); touchClone = null; }
        badge.classList.remove('chord-src-dragging');
        Array.from(rowEl.querySelectorAll('.word-chip')).forEach(function (c) { c.classList.remove('chord-drag-over'); });
        if (moved) {
          var t0 = e.changedTouches[0];
          var el = document.elementFromPoint(t0.clientX, t0.clientY);
          var target = el && el.closest('.word-chip');
          if (target && target !== chip) {
            var toAt = parseInt(target.dataset.at, 10);
            if (!isNaN(toAt)) _moveChord(touchSrc.bi, touchSrc.li, touchSrc.at, toAt);
          }
        }
        touchSrc = null; moved = false;
      });
    });
  }

  function _initAllChordDragTouch() {
    Array.from(document.querySelectorAll('.word-chips-row')).forEach(function (row) {
      _initChordDragTouch(row);
    });
  }

  // ── Block reorder drag ─────────────────────────────────────────────────
  function blockDragStart(e, bi) {
    // Only start drag when the handle was grabbed
    if (!e.target.closest('.block-drag-handle')) { e.preventDefault(); return; }
    _blockDragSrc = bi;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('block-dragging');
  }

  function blockDragEnd(e) {
    _blockDragSrc = null;
    document.querySelectorAll('.block-dragging,.block-drag-over').forEach(function (el) {
      el.classList.remove('block-dragging', 'block-drag-over');
    });
  }

  function blockDragOver(e, bi) {
    if (_blockDragSrc === null || _blockDragSrc === bi) return;
    e.preventDefault();
    e.currentTarget.classList.add('block-drag-over');
  }

  function blockDragLeave(e) {
    e.currentTarget.classList.remove('block-drag-over');
  }

  function blockDrop(e, bi) {
    e.stopPropagation();
    e.currentTarget.classList.remove('block-drag-over');
    var src = _blockDragSrc;
    _blockDragSrc = null;
    if (src === null || src === bi) return;
    _moveBlock(src, bi);
  }

  function _moveBlock(fromBi, toBi) {
    UNDO.push({ song: _song, doc: _docCopy() });
    var blocks = _doc.blocks;
    var moved = blocks.splice(fromBi, 1)[0];
    blocks.splice(toBi, 0, moved);
    renderEditor(_song, _doc);
    APP.scheduleAutosave();
  }

  function _initBlockDragTouch() {
    Array.from(document.querySelectorAll('.block')).forEach(function (blockEl) {
      var bi = parseInt(blockEl.dataset.bi, 10);
      var handle = blockEl.querySelector('.block-drag-handle');
      if (!handle) return;
      var pressTimer = null, touchClone = null, activeBi = null;

      handle.addEventListener('touchstart', function (e) {
        pressTimer = setTimeout(function () {
          activeBi = bi;
          blockEl.classList.add('block-dragging');
          touchClone = document.createElement('div');
          touchClone.className = 'block-drag-ghost';
          var label = blockEl.querySelector('.block-pill');
          touchClone.textContent = label ? label.textContent : '⠿';
          touchClone.style.cssText = 'position:fixed;opacity:.85;pointer-events:none;z-index:999;padding:4px 10px;border-radius:6px;background:var(--surf);border:1px solid var(--em);color:var(--em);font-size:.8rem;';
          document.body.appendChild(touchClone);
          var t0 = e.touches[0];
          touchClone.style.left = t0.clientX + 12 + 'px';
          touchClone.style.top  = (t0.clientY - 20) + 'px';
        }, 400);
      }, { passive: true });

      handle.addEventListener('touchmove', function (e) {
        clearTimeout(pressTimer); pressTimer = null;
        if (activeBi === null) return;
        e.preventDefault();
        var t0 = e.touches[0];
        if (touchClone) { touchClone.style.left = t0.clientX + 12 + 'px'; touchClone.style.top = (t0.clientY - 20) + 'px'; }
        touchClone && (touchClone.style.display = 'none');
        var el = document.elementFromPoint(t0.clientX, t0.clientY);
        touchClone && (touchClone.style.display = '');
        var targetBlock = el && el.closest('.block');
        document.querySelectorAll('.block-drag-over').forEach(function (b) { b.classList.remove('block-drag-over'); });
        if (targetBlock && targetBlock !== blockEl) targetBlock.classList.add('block-drag-over');
      }, { passive: false });

      handle.addEventListener('touchend', function (e) {
        clearTimeout(pressTimer); pressTimer = null;
        if (touchClone) { touchClone.remove(); touchClone = null; }
        document.querySelectorAll('.block-dragging,.block-drag-over').forEach(function (b) {
          b.classList.remove('block-dragging', 'block-drag-over');
        });
        if (activeBi === null) { activeBi = null; return; }
        var t0 = e.changedTouches[0];
        var el = document.elementFromPoint(t0.clientX, t0.clientY);
        var targetBlock = el && el.closest('.block');
        if (targetBlock && targetBlock !== blockEl) {
          var targetBi = parseInt(targetBlock.dataset.bi, 10);
          if (!isNaN(targetBi)) _moveBlock(activeBi, targetBi);
        }
        activeBi = null;
      });
    });
  }

  // ── Line drag between positions within a block ─────────────────────────
  function lineDragStart(e, bi, li) {
    if (!e.target.closest('.line-drag-handle')) { e.preventDefault(); return; }
    _lineDragSrc = { bi: bi, li: li };
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
    e.currentTarget.classList.add('line-dragging');
  }

  function lineDragEnd(e) {
    _lineDragSrc = null;
    document.querySelectorAll('.line-dragging,.line-drag-over').forEach(function (el) {
      el.classList.remove('line-dragging', 'line-drag-over');
    });
  }

  function lineDragOver(e, bi, li) {
    if (!_lineDragSrc) return;
    if (_lineDragSrc.bi !== bi) return;
    if (_lineDragSrc.li === li) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('line-drag-over');
  }

  function lineDragLeave(e) {
    e.currentTarget.classList.remove('line-drag-over');
  }

  function lineDrop(e, bi, li) {
    e.stopPropagation();
    e.currentTarget.classList.remove('line-drag-over');
    var src = _lineDragSrc;
    _lineDragSrc = null;
    if (!src || src.bi !== bi || src.li === li) return;
    _moveLine(src.bi, src.li, bi, li);
  }

  function _moveLine(fromBi, fromLi, toBi, toLi) {
    UNDO.push({ song: _song, doc: _docCopy() });
    if (fromBi === toBi) {
      var lines = _doc.blocks[fromBi].lines;
      var moved = lines.splice(fromLi, 1)[0];
      lines.splice(toLi > fromLi ? toLi - 1 : toLi, 0, moved);
    } else {
      var movedLine = _doc.blocks[fromBi].lines.splice(fromLi, 1)[0];
      _doc.blocks[toBi].lines.splice(toLi, 0, movedLine);
      if (!_doc.blocks[fromBi].lines.length) {
        _doc.blocks[fromBi].lines.push({ lyrics: '', chords: [] });
      }
    }
    renderEditor(_song, _doc);
    APP.scheduleAutosave();
  }

  // ── Playlist detail screen ─────────────────────────────────────────────
  function renderPlaylistDetail(pl, songs, allSongs) {
    _screen = 'playlists';

    var songsHtml = (songs || []).map(function (s, i) {
      var si = _statusInfo(s.Status);
      return '<div class="song-item list-anim" style="--i:' + i + '">' +
        '<div class="pl-drag-handle" title="גרור">⠿</div>' +
        '<div class="song-ico" onclick="APP.openSong(\'' + s.SongID + '\')">' +
          '<svg width="17" height="17" style="color:var(--em-lt)"><use href="#ico-music"/></svg>' +
        '</div>' +
        '<div class="song-info" onclick="APP.openSong(\'' + s.SongID + '\')">' +
          '<div class="song-title">' + _esc(s.Title) + '</div>' +
          '<div class="song-meta">' + (s.Key ? '<span class="song-key">' + _esc(s.Key) + '</span>' : '') + '</div>' +
        '</div>' +
        '<span class="badge ' + si.cls + '">' + si.lbl + '</span>' +
        '<div class="song-menu-btn" onclick="APP.removeFromPlaylist(\'' + pl.id + '\',\'' + s.SongID + '\')">' +
          '<svg width="13" height="13"><use href="#ico-trash"/></svg>' +
        '</div>' +
        '</div>';
    }).join('');

    var emptyHtml = !(songs || []).length
      ? '<div class="empty-state">' +
        '<div class="empty-title">הסטליסט ריק</div>' +
        '<div class="empty-sub">הוסף שירים מהרשימה למטה</div>' +
        '</div>'
      : '';

    // Add songs section — songs not yet in playlist
    var existingIds = (pl.songs || []);
    var addable = (allSongs || []).filter(function (s) { return existingIds.indexOf(s.SongID) < 0; });
    var addHtml = addable.length
      ? '<div class="section-lbl" style="padding:12px 16px 4px">הוסף שיר:</div>' +
        addable.slice(0, 20).map(function (s) {
          return '<div class="song-item" style="opacity:.7" onclick="APP.addSongToPlaylist(\'' + pl.id + '\',\'' + s.SongID + '\')">' +
            '<div class="song-ico"><svg width="17" height="17" style="color:var(--t2)"><use href="#ico-music"/></svg></div>' +
            '<div class="song-info"><div class="song-title">' + _esc(s.Title) + '</div></div>' +
            '<span style="color:var(--em);font-size:1.1rem;padding-left:8px">+</span>' +
            '</div>';
        }).join('')
      : '';

    // Perf mode button for setlist
    var perfBtn = songs.length
      ? '<div class="fab" style="bottom:72px" onclick="APP.startSetlistPerf(' +
          JSON.stringify(pl).replace(/"/g, '&quot;') + ',' +
          JSON.stringify(songs.map(function(s){return s.SongID;})).replace(/"/g,'&quot;') +
          ',0)"><svg width="14" height="14"><use href="#ico-play"/></svg> הפעל סטליסט</div>'
      : '';

    document.getElementById('root').innerHTML =
      '<div class="app-hdr screen-anim">' +
        '<div class="hdr-icon-btn" onclick="APP.setLibFilter(\'playlists\')">' +
          '<svg width="18" height="18"><use href="#ico-back"/></svg>' +
        '</div>' +
        '<div class="app-logo-inline">' + _esc(pl.name) + '</div>' +
        '<div class="hdr-icon-btn" title="הוסף שיר" onclick="document.getElementById(\'plAddSection\').scrollIntoView({behavior:\'smooth\'})">' +
          '<svg width="17" height="17"><use href="#ico-plus"/></svg>' +
        '</div>' +
      '</div>' +
      '<div class="section-lbl" style="padding:10px 16px 4px">שירים בסטליסט (' + (songs.length) + ')</div>' +
      '<div class="song-list">' + songsHtml + emptyHtml + '</div>' +
      '<div id="plAddSection">' + addHtml + '</div>' +
      perfBtn;

    _setBottomNav('library');
  }

  // ── Chord diagram data & renderer ─────────────────────────────────────
  var _CHORD_SHAPES = {
    'C':    {f:[-1,3,2,0,1,0]},      'D':    {f:[-1,-1,0,2,3,2]},
    'Dm':   {f:[-1,-1,0,2,3,1]},     'D7':   {f:[-1,-1,0,2,1,2]},
    'E':    {f:[0,2,2,1,0,0]},        'Em':   {f:[0,2,2,0,0,0]},
    'E7':   {f:[0,2,0,1,0,0]},        'F':    {f:[1,3,3,2,1,1],b:1},
    'Fm':   {f:[1,3,3,1,1,1],b:1},    'G':    {f:[3,2,0,0,0,3]},
    'G7':   {f:[3,2,0,0,0,1]},        'Am':   {f:[-1,0,2,2,1,0]},
    'A':    {f:[-1,0,2,2,2,0]},       'A7':   {f:[-1,0,2,0,2,0]},
    'Am7':  {f:[-1,0,2,0,1,0]},       'Bb':   {f:[-1,1,3,3,3,1],b:1},
    'Bm':   {f:[-1,2,4,4,3,2],b:2},   'B':    {f:[-1,2,4,4,4,2],b:2},
    'B7':   {f:[-1,2,1,2,0,2]},       'C7':   {f:[-1,3,2,3,1,0]},
    'Cmaj7':{f:[-1,3,2,0,0,0]},       'Fmaj7':{f:[-1,-1,3,2,1,0]},
    'Gmaj7':{f:[3,2,0,0,0,2]},        'Dm7':  {f:[-1,-1,0,2,1,1]},
    'Em7':  {f:[0,2,2,0,3,0]},        'Cm':   {f:[-1,3,5,5,4,3],b:3},
    'Dsus2':{f:[-1,-1,0,2,3,0]},      'Gsus4':{f:[3,3,0,0,1,3]},
    'Asus2':{f:[-1,0,2,2,0,0]},       'Asus4':{f:[-1,0,2,2,3,0]},
  };

  function _drawChordDiagram(name) {
    var sh = _CHORD_SHAPES[name];
    var W=52, FH=10, FY0=15, SX=[4,13,22,31,40,49];
    var H = FY0 + FH*4 + 4;
    if (!sh) {
      return '<div class="cd-wrap"><div class="cd-name">'+_esc(name)+'</div>'+
        '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" class="cd-svg">'+
        '<rect x="2" y="'+FY0+'" width="'+(W-4)+'" height="'+(FH*4)+'" rx="3" fill="none" stroke="var(--bdr)" stroke-width="1.5"/>'+
        '<text x="'+W/2+'" y="'+(FY0+FH*2+4)+'" text-anchor="middle" font-size="12" fill="var(--t2)">?</text>'+
        '</svg></div>';
    }
    var f=sh.f, br=sh.b||0;
    var used=f.filter(function(n){return n>0;});
    var sf=used.length?Math.min.apply(null,used):1;
    if(sf<=2)sf=1;
    var FY=[FY0+FH*0.5,FY0+FH*1.5,FY0+FH*2.5,FY0+FH*3.5];
    var FYL=[FY0,FY0+FH,FY0+FH*2,FY0+FH*3,FY0+FH*4];
    var p=['<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" class="cd-svg">'];
    // Muted/open indicators above nut
    f.forEach(function(fr,i){
      if(fr===-1) p.push('<text x="'+SX[i]+'" y="11" text-anchor="middle" font-size="8" fill="var(--t2)">x</text>');
      else if(fr===0) p.push('<circle cx="'+SX[i]+'" cy="10" r="3" fill="none" stroke="var(--t2)" stroke-width="1.5"/>');
    });
    // Nut line
    if(sf===1) p.push('<rect x="'+SX[0]+'" y="'+FY0+'" width="'+(SX[5]-SX[0])+'" height="2.5" rx="1" fill="var(--text)"/>');
    // Fret lines
    FYL.forEach(function(y){ p.push('<line x1="'+SX[0]+'" y1="'+y+'" x2="'+SX[5]+'" y2="'+y+'" stroke="var(--bdr)" stroke-width="0.8"/>'); });
    // String lines
    SX.forEach(function(x){ p.push('<line x1="'+x+'" y1="'+FY0+'" x2="'+x+'" y2="'+(FY0+FH*4)+'" stroke="var(--bdr)" stroke-width="0.8"/>'); });
    // Barre
    if(br){var ri=br-sf;if(ri>=0&&ri<4){var by=FY[ri];p.push('<rect x="'+(SX[0]-4)+'" y="'+(by-4)+'" width="'+(SX[5]-SX[0]+8)+'" height="8" rx="4" fill="var(--chord)"/>');}}
    // Finger dots
    f.forEach(function(fr,i){
      if(fr>0){var ri=fr-sf;if(ri>=0&&ri<4&&(!br||fr!==br))p.push('<circle cx="'+SX[i]+'" cy="'+FY[ri]+'" r="4" fill="var(--chord)"/>');}
    });
    // Position marker for higher-up chords
    if(sf>1) p.push('<text x="'+(SX[5]+3)+'" y="'+(FY0+8)+'" font-size="7" fill="var(--t2)">'+sf+'fr</text>');
    p.push('</svg>');
    return '<div class="cd-wrap"><div class="cd-name">'+_esc(name)+'</div>'+p.join('')+'</div>';
  }

  // ── Performance mode ───────────────────────────────────────────────────
  function renderPerformance(song, doc, transpose) {
    var title    = document.getElementById('perfTitle');
    var scroll   = document.getElementById('perfScroll');
    var perfDiv  = document.getElementById('perfScreen');
    if (!scroll || !perfDiv) return;
    transpose = transpose || 0;

    if (title) title.textContent = song.Title || 'שיר';

    // Collect unique chords (transposed) for diagram strip
    var uniqueChords = [];
    (doc.blocks || []).forEach(function(blk){
      (blk.lines || []).forEach(function(ln){
        (ln.chords || []).forEach(function(ch){
          var n = transpose ? _transposeChord(ch.name, transpose) : ch.name;
          if (uniqueChords.indexOf(n) < 0) uniqueChords.push(n);
        });
      });
    });

    var chordsBarHtml = uniqueChords.length
      ? '<div class="perf-chord-diagrams">' + uniqueChords.map(_drawChordDiagram).join('') + '</div>'
      : '';

    var html = (doc.blocks || []).map(function (blk) {
      var linesHtml = (blk.lines || []).map(function (ln) {
        var segs = _lineToSegments(ln.lyrics, ln.chords);
        var rowHtml = segs.map(function (seg) {
          var chordName = seg.chord && transpose ? _transposeChord(seg.chord, transpose) : seg.chord;
          var chordPart = chordName
            ? '<span class="perf-chord">' + _esc(chordName) + '</span>'
            : '<span class="perf-chord-ph"></span>';
          return '<span class="perf-seg">' + chordPart + '<span class="perf-lyr">' + _esc(seg.lyr) + '</span></span>';
        }).join('');
        return '<div class="perf-line"><div class="perf-chord-row">' + rowHtml + '</div></div>';
      }).join('');

      return '<div class="perf-block">' +
        '<div class="perf-block-lbl">' + _esc(blk.label || _blockTypeLabel(blk.type)) + '</div>' +
        linesHtml +
        '</div>';
    }).join('');

    scroll.innerHTML = chordsBarHtml + html;
    perfDiv.style.display = 'block';
  }

  // ── Chord Picker ───────────────────────────────────────────────────────
  function _buildChordPicker() {
    var key    = _song && _song.Key ? _song.Key.replace(/m$/, '') : 'C';
    var NOTES  = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
    var idx    = NOTES.indexOf(key);
    var diat   = idx >= 0
      ? [NOTES[idx], NOTES[(idx+2)%12]+'m', NOTES[(idx+4)%12]+'m',
         NOTES[(idx+5)%12], NOTES[(idx+7)%12], NOTES[(idx+9)%12]+'m',
         NOTES[(idx+7)%12]+'7', NOTES[(idx+5)%12]+'maj7']
      : ['C','Am','F','G','Dm','Em','G7','Fmaj7'];
    var COMMON = ['Am','G','C','F','Em','Dm','D','E','A','Bm','Bb','Eb','A7','D7','E7','B7','Cmaj7','Gmaj7'];

    var suggEl   = document.getElementById('pickerSugg');
    var commonEl = document.getElementById('pickerCommon');
    var kbdEl    = document.getElementById('pickerKbd');
    var searchEl = document.getElementById('pickerSearch');
    if (searchEl) searchEl.value = '';

    if (suggEl) {
      suggEl.innerHTML = '<div class="picker-sect-lbl">בסקלה</div>' +
        diat.map(function (c) {
          return '<span class="sugg-chip" onclick="EDITOR.applyChord(\'' + _esc(c) + '\')">' + c + '</span>';
        }).join('');
    }
    if (commonEl) {
      commonEl.innerHTML = '<div class="picker-sect-lbl">נפוצים</div>' +
        COMMON.map(function (c) {
          return '<span class="sugg-chip" onclick="EDITOR.applyChord(\'' + _esc(c) + '\')">' + c + '</span>';
        }).join('');
    }
    if (kbdEl) {
      var MODES = ['','m','7','maj7','m7','sus4','dim','aug','add9'];
      var kbdHtml = '';
      NOTES.forEach(function (n) {
        MODES.forEach(function (mo) {
          kbdHtml += '<div class="kbd-btn' + (mo === '' ? ' root' : '') + '" onclick="EDITOR.applyChord(\'' + _esc(n + mo) + '\')">' + n + mo + '</div>';
        });
      });
      kbdEl.innerHTML = kbdHtml;
    }
  }

  function filterChords(q) {
    var kbdEl = document.getElementById('pickerKbd');
    if (!kbdEl) return;
    var btns = Array.from(kbdEl.querySelectorAll('.kbd-btn'));
    if (!q) { btns.forEach(function (el) { el.style.display = ''; }); return; }
    var ql = q.toLowerCase();
    btns.forEach(function (el) {
      el.style.display = el.textContent.toLowerCase().indexOf(ql) >= 0 ? '' : 'none';
    });
  }

  function pickChord(e, bi, li, at) {
    if (e) e.stopPropagation();
    _pickerTarget = { bi: bi, li: li, at: at };
    var existing = (_doc.blocks[bi].lines[li].chords || []).find(function (c) { return c.at === at; });
    var titleEl  = document.getElementById('pickerTitle');
    var removeEl = document.getElementById('pickerRemoveBtn');
    if (titleEl)  titleEl.textContent = existing ? (existing.name + ' — שנה') : 'הוסף אקורד';
    if (removeEl) removeEl.style.display = existing ? 'block' : 'none';
    _openPicker();
  }

  function tapLyric(e, bi, li, segAt) {
    if (e) e.stopPropagation();
    _pickerTarget = { bi: bi, li: li, at: segAt };
    var titleEl  = document.getElementById('pickerTitle');
    var removeEl = document.getElementById('pickerRemoveBtn');
    if (titleEl)  titleEl.textContent = 'הוסף אקורד';
    if (removeEl) removeEl.style.display = 'none';
    _openPicker();
  }

  function _openPicker() {
    var p  = document.getElementById('chordPicker');
    var cm = document.getElementById('copyMenu');
    if (cm) cm.style.display = 'none';
    if (p)  { p.style.display = 'block'; }
  }

  function closePicker() {
    var p = document.getElementById('chordPicker');
    if (p) p.style.display = 'none';
    _pickerTarget = null;
  }

  function applyChord(name) {
    if (!_pickerTarget) return;
    UNDO.push({ song: _song, doc: _docCopy() });
    var ln = _doc.blocks[_pickerTarget.bi].lines[_pickerTarget.li];
    ln.chords = ln.chords || [];
    var existing = ln.chords.find(function (c) { return c.at === _pickerTarget.at; });
    if (existing) existing.name = name;
    else ln.chords.push({ at: _pickerTarget.at, name: name });
    closePicker();
    renderEditor(_song, _doc);
    APP.scheduleAutosave();
  }

  function removeChord() {
    if (!_pickerTarget) return;
    UNDO.push({ song: _song, doc: _docCopy() });
    var ln = _doc.blocks[_pickerTarget.bi].lines[_pickerTarget.li];
    ln.chords = (ln.chords || []).filter(function (c) { return c.at !== _pickerTarget.at; });
    closePicker();
    renderEditor(_song, _doc);
    APP.scheduleAutosave();
  }

  function addLine(bi, afterLi) {
    UNDO.push({ song: _song, doc: _docCopy() });
    var insertAt = (afterLi !== undefined && afterLi >= 0)
      ? afterLi + 1
      : _doc.blocks[bi].lines.length;
    _doc.blocks[bi].lines.splice(insertAt, 0, { lyrics: '', chords: [] });
    renderEditor(_song, _doc);
    APP.scheduleAutosave();
  }

  function duplicateBlock(bi) {
    UNDO.push({ song: _song, doc: _docCopy() });
    var src = JSON.parse(JSON.stringify(_doc.blocks[bi]));
    src.id = _genId();
    _doc.blocks.splice(bi + 1, 0, src);
    _doc.arrangement.push(src.id);
    renderEditor(_song, _doc);
    APP.scheduleAutosave();
  }

  function copyAs(mode) {
    var text = '';
    (_doc.blocks || []).forEach(function (blk) {
      text += '— ' + (blk.label || _blockTypeLabel(blk.type)) + ' —\n';
      (blk.lines || []).forEach(function (ln) {
        if (mode === 'lyrics') {
          text += (ln.lyrics || '') + '\n';
        } else if (mode === 'chords') {
          var chords = (ln.chords || []).slice().sort(function (a, b) { return a.at - b.at; });
          if (chords.length) {
            var chordLine = '';
            var prev = 0;
            chords.forEach(function (c) {
              var pad = Math.max(1, c.at - prev);
              chordLine += ' '.repeat(pad) + c.name;
              prev = c.at + c.name.length;
            });
            text += chordLine.trim() + '\n';
          }
          text += (ln.lyrics || '') + '\n';
        } else {
          var segs = _lineToSegments(ln.lyrics, ln.chords);
          text += segs.map(function (s) { return (s.chord ? '(' + s.chord + ')' : '') + s.lyr; }).join('') + '\n';
        }
      });
      text += '\n';
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { APP.showToast('הועתק ✓', 'ok'); })
        .catch(function () { APP.showToast('שגיאת העתקה', 'err'); });
    } else {
      APP.showToast('שגיאת העתקה', 'err');
    }
    var cm = document.getElementById('copyMenu');
    if (cm) cm.style.display = 'none';
  }

  // ── Structure ───────────────────────────────────────────────────────────
  function renderStructure(song, doc) {
    _screen = 'structure';
    _song   = song;
    _doc    = doc;

    var nodesHtml = (doc.arrangement || []).map(function (bid, i) {
      var blk = (doc.blocks || []).find(function (b) { return b.id === bid; });
      if (!blk) return '';
      var c = _blockTypeColor(blk.type);
      return '<div class="arr-node" style="border-color:' + c.col + ';color:' + c.col + ';background:' + c.bg + '" data-arr-idx="' + i + '" draggable="true">' +
        '<span class="an-drag">⠿</span>' +
        '<span class="an-label">' + _arrLabel(blk) + '</span>' +
        '</div>';
    }).join('');

    var uniqueIds = [];
    (doc.arrangement || []).forEach(function (id) {
      if (uniqueIds.indexOf(id) < 0) uniqueIds.push(id);
    });

    var rowsHtml = uniqueIds.map(function (bid) {
      var blk = (doc.blocks || []).find(function (b) { return b.id === bid; });
      if (!blk) return '';
      var c    = _blockTypeColor(blk.type);
      var occ  = _countOccurrences(bid);
      var preview = (blk.lines || []).slice(0, 1).map(function (ln) {
        return _esc((ln.lyrics || '').slice(0, 32));
      }).join('');
      var chordNames = [];
      (blk.lines || []).forEach(function (ln) {
        (ln.chords || []).forEach(function (ch) {
          if (chordNames.indexOf(ch.name) < 0) chordNames.push(ch.name);
        });
      });
      return '<div class="bl-row">' +
        '<div class="bl-pill" style="background:' + c.bg + ';color:' + c.col + '">' +
          _esc(blk.label || _blockTypeLabel(blk.type)) +
        '</div>' +
        '<div class="bl-info">' +
          (preview ? '<div class="bl-preview">' + preview + '...</div>' : '') +
          (chordNames.length ? '<div class="bl-chords">' + chordNames.slice(0,8).map(function(n){ return '<span class="ch-tag">' + _esc(n) + '</span>'; }).join('') + '</div>' : '') +
          (occ > 1 ? '<div class="bl-occ"><svg width="10" height="10"><use href="#ico-link"/></svg> ' + occ + ' מופעים</div>' : '') +
        '</div>' +
        '</div>';
    }).join('');

    var totalLines  = (doc.blocks || []).reduce(function (n, b) { return n + (b.lines || []).length; }, 0);
    var allChords   = [];
    (doc.blocks || []).forEach(function (b) {
      (b.lines || []).forEach(function (ln) {
        (ln.chords || []).forEach(function (ch) {
          if (allChords.indexOf(ch.name) < 0) allChords.push(ch.name);
        });
      });
    });

    document.getElementById('root').innerHTML =
      '<div class="song-nav-bar">' +
        '<div class="nav-back" onclick="APP.goToEditor()"><svg width="18" height="18"><use href="#ico-back"/></svg></div>' +
        '<div class="song-hdr-info">' +
          '<div class="song-hdr-name">מבנה השיר</div>' +
          '<div class="song-hdr-key">' + _esc(song.Title) + '</div>' +
        '</div>' +
        '<div class="hdr-icon-btn" onclick="APP.addBlock()"><svg width="16" height="16"><use href="#ico-plus"/></svg></div>' +
      '</div>' +
      '<div class="arr-editor-wrap">' +
        '<div class="arr-ed-label">סדר נגינה — גרור לסידור מחדש</div>' +
        '<div class="arr-flow" id="arrFlow">' + nodesHtml + '</div>' +
      '</div>' +
      '<div class="struct-summary">' +
        '<div class="sum-row"><span>קטעים</span><span>' + uniqueIds.length + '</span></div>' +
        '<div class="sum-row"><span>שורות</span><span>' + totalLines + '</span></div>' +
        '<div class="sum-row"><span>אקורדים</span><span>' + allChords.slice(0,6).join(' · ') + '</span></div>' +
      '</div>' +
      '<div class="block-list">' + rowsHtml + '</div>';

    _setBottomNav('structure');
    _initDrag();
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────
  function _swapArrNodes(src, target) {
    var from = parseInt(src.dataset.arrIdx, 10);
    var to   = parseInt(target.dataset.arrIdx, 10);
    UNDO.push({ song: _song, doc: _docCopy() });
    var item = _doc.arrangement.splice(from, 1)[0];
    _doc.arrangement.splice(to, 0, item);
    renderStructure(_song, _doc);
    APP.scheduleAutosave();
  }

  function _initDrag() {
    var flow = document.getElementById('arrFlow');
    if (!flow) return;
    var nodes = Array.from(flow.querySelectorAll('[data-arr-idx]'));
    var dragSrc    = null;
    var touchSrc   = null;
    var touchClone = null;

    // ── HTML5 drag (desktop) ──
    nodes.forEach(function (node) {
      node.addEventListener('dragstart', function (e) {
        dragSrc = node;
        node.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      node.addEventListener('dragend', function () {
        node.classList.remove('dragging');
        nodes.forEach(function (n) { n.classList.remove('drag-over'); });
      });
      node.addEventListener('dragover', function (e) {
        e.preventDefault();
        if (node !== dragSrc) node.classList.add('drag-over');
      });
      node.addEventListener('dragleave', function () {
        node.classList.remove('drag-over');
      });
      node.addEventListener('drop', function (e) {
        e.stopPropagation();
        if (dragSrc && dragSrc !== node) _swapArrNodes(dragSrc, node);
      });
    });

    // ── Touch drag (mobile) ──
    nodes.forEach(function (node) {
      node.addEventListener('touchstart', function (e) {
        touchSrc = node;
        node.classList.add('dragging');
        touchClone = node.cloneNode(true);
        touchClone.style.cssText = 'position:fixed;opacity:.7;pointer-events:none;z-index:999;transition:none;margin:0;';
        document.body.appendChild(touchClone);
        var t0 = e.touches[0];
        touchClone.style.left = (t0.clientX - node.offsetWidth / 2) + 'px';
        touchClone.style.top  = (t0.clientY - node.offsetHeight / 2) + 'px';
      }, { passive: true });

      node.addEventListener('touchmove', function (e) {
        if (!touchSrc || !touchClone) return;
        e.preventDefault();
        var t0 = e.touches[0];
        touchClone.style.left = (t0.clientX - touchSrc.offsetWidth / 2) + 'px';
        touchClone.style.top  = (t0.clientY - touchSrc.offsetHeight / 2) + 'px';
        touchClone.style.display = 'none';
        var el = document.elementFromPoint(t0.clientX, t0.clientY);
        touchClone.style.display = '';
        var target = el && el.closest('[data-arr-idx]');
        nodes.forEach(function (n) { n.classList.remove('drag-over'); });
        if (target && target !== touchSrc) target.classList.add('drag-over');
      }, { passive: false });

      node.addEventListener('touchend', function (e) {
        if (!touchSrc || !touchClone) return;
        var t0 = e.changedTouches[0];
        touchClone.remove();
        touchClone = null;
        touchSrc.classList.remove('dragging');
        nodes.forEach(function (n) { n.classList.remove('drag-over'); });
        var el = document.elementFromPoint(t0.clientX, t0.clientY);
        var target = el && el.closest('[data-arr-idx]');
        if (target && target !== touchSrc) _swapArrNodes(touchSrc, target);
        touchSrc = null;
      });
    });
  }

  // ── Bottom Nav ─────────────────────────────────────────────────────────
  function _setBottomNav(screen) {
    var el = document.getElementById('bottomNav');
    if (!el) return;
    var btns = {
      library:   [
        { ico:'#ico-home',   lbl:'בית',         on:true,  act:'' },
        { ico:'#ico-music',  lbl:'שירים',        on:false, act:'APP.goHome()' },
        { ico:'#ico-list',   lbl:'רשימות',       on:false, act:'' },
        { ico:'#ico-more',   lbl:'עוד',          on:false, act:'' },
      ],
      editor:    [
        { ico:'#ico-chord',  lbl:'עריכה',        on:true,  act:'' },
        { ico:'#ico-struct', lbl:'מבנה',         on:false, act:'APP.goToStructure()' },
        { ico:'#ico-play',   lbl:'נגינה',        on:false, act:'APP.goToPerformance()' },
        { ico:'#ico-settings',lbl:'הגדרות',      on:false, act:'APP.openSongSettings(null)' },
      ],
      structure: [
        { ico:'#ico-chord',  lbl:'עורך',         on:false, act:'APP.goToEditor()' },
        { ico:'#ico-struct', lbl:'מבנה',         on:true,  act:'' },
        { ico:'#ico-undo',   lbl:'ביטול',        on:false, act:'APP.undo()' },
        { ico:'#ico-more',   lbl:'עוד',          on:false, act:'' },
      ],
    }[screen] || [];

    el.innerHTML = btns.map(function (b) {
      return '<div class="nav-btn' + (b.on ? ' on' : '') + '"' + (b.act ? ' onclick="' + b.act + '"' : '') + '>' +
        '<svg class="nav-ico"><use href="' + b.ico + '"/></svg>' +
        '<span class="nav-lbl">' + b.lbl + '</span>' +
        '</div>';
    }).join('');
  }

  return {
    renderLibrary:   renderLibrary,
    renderEditor:    renderEditor,
    renderStructure: renderStructure,
    renderPerformance: renderPerformance,
    tapWord:         tapWord,
    pickChord:       pickChord,
    tapLyric:        tapLyric,
    closePicker:     closePicker,
    applyChord:      applyChord,
    removeChord:     removeChord,
    filterChords:    filterChords,
    addLine:         addLine,
    updateLyrics:    updateLyrics,
    duplicateBlock:  duplicateBlock,
    handleLineKey:   handleLineKey,
    copyAs:          copyAs,
    chordDragStart:  chordDragStart,
    chordDragEnd:    chordDragEnd,
    chordDragOver:   chordDragOver,
    chordDragLeave:  chordDragLeave,
    chordDrop:       chordDrop,
    blockDragStart:      blockDragStart,
    blockDragEnd:        blockDragEnd,
    blockDragOver:       blockDragOver,
    blockDragLeave:      blockDragLeave,
    blockDrop:           blockDrop,
    toggleBlockCollapse: toggleBlockCollapse,
    collapseAll:         collapseAll,
    lineDragStart:       lineDragStart,
    lineDragEnd:         lineDragEnd,
    lineDragOver:        lineDragOver,
    lineDragLeave:       lineDragLeave,
    lineDrop:            lineDrop,
    renderPlaylists:     renderPlaylists,
    renderPlaylistDetail: renderPlaylistDetail,
    getScreen:       function () { return _screen; },
    getCurrentDoc:   function () { return _doc; },
    getCurrentSong:  function () { return _song; },
    getSongs:        function () { return _songs; },
    getLibFilter:    function () { return _libFilter; },
  };
})();
