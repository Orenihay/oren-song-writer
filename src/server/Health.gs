var BUILD_FP = '__BUILD_FP__';

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
