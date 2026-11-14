'use strict';
var DB = (function () {
  var _db = null;

  function _open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (res, rej) {
      var req = indexedDB.open('OrenSongBook', 1);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('songs'))
          db.createObjectStore('songs', { keyPath: 'SongID' });
        if (!db.objectStoreNames.contains('queue'))
          db.createObjectStore('queue', { autoIncrement: true });
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

  function getAllSongs() {
    return _open().then(function (db) {
      return new Promise(function (res, rej) {
        var req = db.transaction('songs', 'readonly').objectStore('songs').getAll();
        req.onsuccess = function () { res(req.result || []); };
        req.onerror   = rej;
      });
    });
  }

  function getSong(id) {
    return _tx('songs', 'readonly', function (s) { return s.get(id); });
  }

  function saveSong(song) {
    return _tx('songs', 'readwrite', function (s) { return s.put(song); });
  }

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

  return {
    getAllSongs: getAllSongs, getSong: getSong, saveSong: saveSong,
    enqueue: enqueue, dequeueAll: dequeueAll, removeQueueItem: removeQueueItem
  };
})();
