'use strict';
var DB = (function () {
  var _db = null;

  function _open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (res, rej) {
      var req = indexedDB.open('OrenSongBook', 2);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('songs'))
          db.createObjectStore('songs', { keyPath: 'SongID' });
        if (!db.objectStoreNames.contains('queue'))
          db.createObjectStore('queue', { autoIncrement: true });
        if (!db.objectStoreNames.contains('playlists'))
          db.createObjectStore('playlists', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('memos'))
          db.createObjectStore('memos', { keyPath: 'songId' });
      };
      req.onsuccess = function (e) { _db = e.target.result; res(_db); };
      req.onerror   = function (e) { rej(e); };
    });
  }

  function _tx(store, mode, fn) {
    return _open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx  = db.transaction(store, mode);
        var st  = tx.objectStore(store);
        var req = fn(st);
        req.onsuccess = function () { res(req.result); };
        req.onerror   = function (e) { rej(e); };
      });
    });
  }

  function _getAll(store) {
    return _open().then(function (db) {
      return new Promise(function (res, rej) {
        var req = db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = function () { res(req.result || []); };
        req.onerror   = rej;
      });
    });
  }

  // ── Songs ──────────────────────────────────────────────────────────────
  function getAllSongs()  { return _getAll('songs'); }
  function getSong(id)   { return _tx('songs', 'readonly',  function (s) { return s.get(id); }); }
  function saveSong(song){ return _tx('songs', 'readwrite', function (s) { return s.put(song); }); }

  // ── Sync queue ─────────────────────────────────────────────────────────
  function enqueue(op) {
    return _open().then(function (db) {
      return new Promise(function (res, rej) {
        var req = db.transaction('queue', 'readwrite').objectStore('queue').add(op);
        req.onsuccess = function () { res(req.result); };
        req.onerror   = rej;
      });
    });
  }

  function dequeueAll() {
    return _open().then(function (db) {
      return new Promise(function (res, rej) {
        var items = [];
        var req = db.transaction('queue', 'readonly').objectStore('queue').openCursor();
        req.onsuccess = function (e) {
          var c = e.target.result;
          if (c) { items.push({ key: c.key, value: c.value }); c.continue(); }
          else res(items);
        };
        req.onerror = rej;
      });
    });
  }

  function removeQueueItem(key) {
    return _tx('queue', 'readwrite', function (s) { return s.delete(key); });
  }

  // ── Playlists ──────────────────────────────────────────────────────────
  function getAllPlaylists()      { return _getAll('playlists'); }
  function getPlaylist(id)        { return _tx('playlists', 'readonly',  function (s) { return s.get(id); }); }
  function savePlaylist(pl)       { return _tx('playlists', 'readwrite', function (s) { return s.put(pl); }); }
  function deletePlaylist(id)     { return _tx('playlists', 'readwrite', function (s) { return s.delete(id); }); }

  // ── Voice memos ────────────────────────────────────────────────────────
  function getMemo(songId)        { return _tx('memos', 'readonly',  function (s) { return s.get(songId); }); }
  function saveMemo(songId, data) { return _tx('memos', 'readwrite', function (s) { return s.put({ songId: songId, data: data, ts: Date.now() }); }); }
  function deleteMemo(songId)     { return _tx('memos', 'readwrite', function (s) { return s.delete(songId); }); }

  return {
    getAllSongs: getAllSongs, getSong: getSong, saveSong: saveSong,
    enqueue: enqueue, dequeueAll: dequeueAll, removeQueueItem: removeQueueItem,
    getAllPlaylists: getAllPlaylists, getPlaylist: getPlaylist,
    savePlaylist: savePlaylist, deletePlaylist: deletePlaylist,
    getMemo: getMemo, saveMemo: saveMemo, deleteMemo: deleteMemo,
  };
})();
