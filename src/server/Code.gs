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
