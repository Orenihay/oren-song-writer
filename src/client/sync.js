'use strict';
var SYNC = (function () {
  var _timer  = null;
  var _active = false;

  function schedule() {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(_flush, 1500);
    _setStatus('pending');
  }

  function _flush() {
    if (_active) return;
    _active = true;
    DB.dequeueAll().then(function (items) {
      if (!items.length) { _active = false; _setStatus('ok'); return; }
      var item = items[0];
      srv('apiSaveSong', item.value)
        .then(function (r) {
          if (r && r.ok) {
            return DB.removeQueueItem(item.key).then(function () {
              _active = false;
              _flush();
            });
          } else if (r && r.error === 'conflict') {
            _active = false;
            _setStatus('conflict');
            if (typeof APP !== 'undefined') APP.onConflict(r, item.value);
          } else {
            _active = false;
            _setStatus('error');
          }
        })
        .catch(function () { _active = false; _setStatus('error'); });
    });
  }

  function _setStatus(state) {
    var el = document.getElementById('syncStatus');
    if (!el) return;
    var msgs = { pending: 'שומר...', ok: 'שמור', error: 'שגיאת שמירה', conflict: 'עדכן לגרסה חדשה' };
    el.textContent = msgs[state] || state;
    el.dataset.state = state;
  }

  return { schedule: schedule };
})();
