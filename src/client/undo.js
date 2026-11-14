'use strict';
var UNDO = (function () {
  var _stack = [];
  var MAX    = 25;

  function push(snapshot) {
    _stack.push(JSON.stringify(snapshot));
    if (_stack.length > MAX) _stack.shift();
    _updateButtons();
  }

  function pop() {
    if (!_stack.length) return null;
    var s = _stack.pop();
    _updateButtons();
    return JSON.parse(s);
  }

  function canUndo() { return _stack.length > 0; }
  function clear()   { _stack = []; _updateButtons(); }

  function _updateButtons() {
    var on = canUndo();
    ['undoBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.opacity      = on ? '1' : '0.35';
        el.style.pointerEvents = on ? 'auto' : 'none';
      }
    });
  }

  return { push: push, pop: pop, canUndo: canUndo, clear: clear };
})();
