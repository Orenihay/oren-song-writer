'use strict';
const fs   = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
let fails  = 0;

function ok(cond, msg) {
  if (cond) { console.log('✅', msg); }
  else       { console.error('❌ FAIL:', msg); fails++; }
}

// ── 1. dist files exist ──────────────────────────────────────────────────────
['Code.gs','Modules.gs','Index.html'].forEach(f => {
  ok(fs.existsSync(path.join(DIST, f)), `dist/${f} exists`);
});

const code    = fs.existsSync(path.join(DIST,'Code.gs'))    ? fs.readFileSync(path.join(DIST,'Code.gs'),'utf8')    : '';
const html    = fs.existsSync(path.join(DIST,'Index.html')) ? fs.readFileSync(path.join(DIST,'Index.html'),'utf8') : '';
const modules = fs.existsSync(path.join(DIST,'Modules.gs')) ? fs.readFileSync(path.join(DIST,'Modules.gs'),'utf8') : '';

// ── 2. No unresolved placeholders ────────────────────────────────────────────
ok(!code.includes('__BUILD_FP__'),     'Code.gs: no __BUILD_FP__ placeholder');
ok(!html.includes('__BUILD_FP__'),     'Index.html: no __BUILD_FP__ placeholder');
ok(!html.includes('__APP_VERSION__'),  'Index.html: no __APP_VERSION__ placeholder');
ok(!html.includes('// @include app.js'), 'Index.html: app.js inlined');

// ── 3. Fingerprint consistency ───────────────────────────────────────────────
const fpCode = (code.match(/var BUILD_FP = '([^']+)'/) || [])[1];
const fpHtml = (html.match(/var BUILD_FP\s*=\s*'([^']+)'/) || [])[1];
ok(!!fpCode, `Code.gs has BUILD_FP: ${fpCode || '(missing)'}`);
ok(!!fpHtml, `Index.html has BUILD_FP: ${fpHtml || '(missing)'}`);
if (fpCode && fpHtml) ok(fpCode === fpHtml, `Fingerprints match: ${fpCode}`);

// ── 4. Size budgets ──────────────────────────────────────────────────────────
const BUDGET_PAGE = 200_000;
const BUDGET_FILE = 900_000;
const BUDGET_LINE =  10_000;
ok(code.length <= BUDGET_FILE, `Code.gs size ${code.length.toLocaleString()} <= ${BUDGET_FILE.toLocaleString()}`);
ok(html.length <= BUDGET_PAGE, `Index.html size ${html.length.toLocaleString()} <= ${BUDGET_PAGE.toLocaleString()}`);

const longLinesCode = code.split('\n').filter(l => l.length > BUDGET_LINE);
const longLinesHtml = html.split('\n').filter(l => l.length > BUDGET_LINE);
ok(longLinesCode.length === 0, `Code.gs: no lines > ${BUDGET_LINE} chars (${longLinesCode.length} found)`);
ok(longLinesHtml.length === 0, `Index.html: no lines > ${BUDGET_LINE} chars (${longLinesHtml.length} found)`);

// ── 5. Required functions in Code.gs ─────────────────────────────────────────
['function doGet','function onOpen','function setupSpreadsheet','function isSetupDone',
 'function dbGetSheet','function dbWithLock','function healthLogError',
 'function apiGetSongs','function apiSaveSong','function apiGetStatus',
 'function apiCheckFingerprint'].forEach(fn => {
  ok(code.includes(fn), `Code.gs: ${fn}`);
});

// ── 6. Sheet names defined ───────────────────────────────────────────────────
['Songs','SongDocs','Versions','Playlists','PlaylistSongs','Templates','Settings','Lists','Errors'].forEach(s => {
  ok(code.includes(`'${s}'`), `Config: sheet '${s}'`);
});

// ── 7. SHEET_COLS defined ─────────────────────────────────────────────────────
ok(code.includes('var SHEET_COLS'), 'SHEET_COLS defined in Code.gs');

// ── 8. No bare https:// in string literals ────────────────────────────────────
const dangerousLines = code.split('\n').filter(l => {
  if (l.trim().startsWith('//')) return false;
  return /['"].*https?:\/\//.test(l);
});
ok(dangerousLines.length === 0, `Code.gs: no bare https:// in strings (${dangerousLines.length} found)`);

// ── 9. HTML structure ─────────────────────────────────────────────────────────
ok(html.includes('<html dir="rtl"'),    'Index.html: RTL direction set');
ok(html.includes('lang="he"'),          'Index.html: Hebrew lang attribute');
ok(html.includes('id="root"'),          'Index.html: #root element');
ok(html.includes('id="bottomNav"'),     'Index.html: #bottomNav element');
ok(html.includes('id="toast"'),         'Index.html: #toast element');
ok(html.includes('id="newSongModal"'),  'Index.html: #newSongModal element');
ok(html.includes('<title>'),            'Index.html: has <title>');

// ── 10. Phase 3 overlay elements ─────────────────────────────────────────────
ok(html.includes('id="searchOverlay"'),   'Index.html: #searchOverlay exists');
ok(html.includes('id="songSheet"'),       'Index.html: #songSheet exists');
ok(html.includes('id="blockTypeSheet"'),  'Index.html: #blockTypeSheet exists');
ok(html.includes('id="confirmSheet"'),    'Index.html: #confirmSheet exists');
ok(html.includes('id="perfScreen"'),      'Index.html: #perfScreen exists');
ok(html.includes('id="keyGrid"'),         'Index.html: #keyGrid exists');
ok(html.includes('id="typeGrid"'),        'Index.html: #typeGrid exists');

// ── 11. CSS tokens and theme ─────────────────────────────────────────────────
ok(html.includes('--bg:'),              'Index.html: --bg token defined');
ok(html.includes('--em:'),              'Index.html: --em token defined');
ok(html.includes('--chord:'),           'Index.html: --chord token defined');
ok(html.includes('prefers-color-scheme: light'), 'Index.html: light theme media query');
ok(html.includes('data-theme="light"'), 'Index.html: explicit light theme selector');

// ── 12. Phase 3 CSS classes ──────────────────────────────────────────────────
ok(html.includes('.lib-tabs'),          'Index.html: .lib-tabs CSS');
ok(html.includes('.sheet-ov'),          'Index.html: .sheet-ov CSS');
ok(html.includes('.sheet-pn'),          'Index.html: .sheet-pn CSS');
ok(html.includes('.key-btn'),           'Index.html: .key-btn CSS');
ok(html.includes('.type-btn'),          'Index.html: .type-btn CSS');
ok(html.includes('.perf-screen'),       'Index.html: .perf-screen CSS');
ok(html.includes('.search-overlay'),    'Index.html: .search-overlay CSS');
ok(html.includes('.empty-state'),       'Index.html: .empty-state CSS');
ok(html.includes('.line-del-btn'),      'Index.html: .line-del-btn CSS');
ok(html.includes('.ctx-popup'),         'Index.html: .ctx-popup CSS');
ok(html.includes('.list-anim'),         'Index.html: .list-anim CSS');
ok(html.includes('.screen-anim'),       'Index.html: .screen-anim CSS');

// ── 13. Client JS functions present ──────────────────────────────────────────
ok(html.includes('renderLibrary'),      'Index.html: renderLibrary JS');
ok(html.includes('renderEditor'),       'Index.html: renderEditor JS');
ok(html.includes('renderStructure'),    'Index.html: renderStructure JS');
ok(html.includes('renderPerformance'),  'Index.html: renderPerformance JS');
ok(html.includes('openSearch'),         'Index.html: openSearch JS');
ok(html.includes('filterSongs'),        'Index.html: filterSongs JS');
ok(html.includes('setLibFilter'),       'Index.html: setLibFilter JS');
ok(html.includes('openSongCtx'),        'Index.html: openSongCtx JS');
ok(html.includes('openSongSettings'),   'Index.html: openSongSettings JS');
ok(html.includes('saveSongSheet'),      'Index.html: saveSongSheet JS');
ok(html.includes('togglePin'),          'Index.html: togglePin JS');
ok(html.includes('openBlockTypePicker'),'Index.html: openBlockTypePicker JS');
ok(html.includes('setBlockType'),       'Index.html: setBlockType JS');
ok(html.includes('deleteLine'),         'Index.html: deleteLine JS');
ok(html.includes('goToPerformance'),    'Index.html: goToPerformance JS');
ok(html.includes('closePerformance'),   'Index.html: closePerformance JS');
ok(html.includes('togglePerfLyrics'),   'Index.html: togglePerfLyrics JS');
ok(html.includes('_transposeChord'),    'Index.html: _transposeChord JS');
ok(html.includes('_transposeDoc'),      'Index.html: _transposeDoc JS');
ok(html.includes('confirmDeleteSongById'), 'Index.html: confirmDeleteSongById JS');
ok(html.includes('adjustBpm'),          'Index.html: adjustBpm JS');
ok(html.includes('adjustCapo'),         'Index.html: adjustCapo JS');

// ── 14. SVG icons ────────────────────────────────────────────────────────────
['ico-home','ico-music','ico-search','ico-settings','ico-back','ico-plus',
 'ico-chord','ico-struct','ico-play','ico-eye','ico-copy','ico-dup','ico-undo',
 'ico-pin','ico-dots'].forEach(id => {
  ok(html.includes(`id="${id}"`), `Index.html: SVG icon ${id}`);
});

// ── 15. Fonts loaded ─────────────────────────────────────────────────────────
ok(html.includes('Rubik'),              'Index.html: Rubik font loaded');
ok(html.includes('JetBrains Mono'),     'Index.html: JetBrains Mono font loaded');

// ── 16. Fingerprint check script ─────────────────────────────────────────────
ok(html.includes('apiCheckFingerprint'), 'Index.html: fingerprint check script');
ok(html.includes('stale-banner'),        'Index.html: stale-banner element');

// ── Result ────────────────────────────────────────────────────────────────────
const total = fails + (process.stdout.write.toString().match(/✅/g) || []).length;
console.log('\n── Summary ──────────────────────');
if (fails > 0) {
  console.error(`❌ ${fails} test(s) FAILED`);
  process.exit(1);
} else {
  console.log('✅ All tests passed');
}
