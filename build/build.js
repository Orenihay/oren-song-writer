'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const SRC_SERVER = path.join(ROOT, 'src', 'server');
const SRC_CLIENT = path.join(ROOT, 'src', 'client');
const DIST       = path.join(ROOT, 'dist');

const BUDGET_PAGE = 200_000;
const BUDGET_FILE = 900_000;
const BUDGET_LINE =  10_000;

// Server files for Code.gs — order matters (dependencies first)
const CODE_GS = ['Config.gs','Db.gs','Setup.gs','Health.gs','Backup.gs','Songs.gs','Code.gs'];

// Lazy modules (Phase 2+): leave empty for now
const MODULES_GS = [];

// Client JS files — concatenated into Index.html in this order
const CLIENT_JS = ['db.js', 'sync.js', 'undo.js', 'editor.js', 'app.js'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const read  = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };

function fingerprint() {
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const d   = new Date();
  const p2  = n => String(n).padStart(2, '0');
  return `v${pkg.version}-${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}`;
}

function validate(name, content, isPage) {
  const errors = [];
  const limit  = isPage ? BUDGET_PAGE : BUDGET_FILE;
  if (content.length > limit)
    errors.push(`${name}: ${content.length.toLocaleString()} chars > ${limit.toLocaleString()}`);
  content.split('\n').forEach((line, i) => {
    if (line.length > BUDGET_LINE)
      errors.push(`${name}:${i+1}: line ${line.length} chars > ${BUDGET_LINE}`);
  });
  return errors;
}

// ─── Assemblers ───────────────────────────────────────────────────────────────
function buildCodeGs(fp) {
  let out = CODE_GS.map(f => `// === ${f} ===\n${read(path.join(SRC_SERVER, f))}`).join('\n\n');
  return out.replace(/__BUILD_FP__/g, fp);
}

function buildModulesGs() {
  if (!MODULES_GS.length)
    return '// Modules.gs — lazy modules loaded here in Phase 2+\nvar _MODULES_LOADED = {};\n';
  return MODULES_GS
    .map(f => `// === ${f} ===\n${read(path.join(SRC_SERVER, 'modules', f))}`)
    .join('\n\n');
}

function buildIndexHtml(fp) {
  let html = read(path.join(SRC_CLIENT, 'index.html'));
  const js = CLIENT_JS
    .map(f => `// === ${f} ===\n${read(path.join(SRC_CLIENT, f))}`)
    .join('\n\n');
  html = html.replace('// @include app.js', js);
  html = html.replace(/__BUILD_FP__/g, fp).replace(/__APP_VERSION__/g, fp);
  return html;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('Oren Song Writer — build\n');

  const fp = fingerprint();
  console.log('Fingerprint:', fp);

  const codeGs    = buildCodeGs(fp);
  const modulesGs = buildModulesGs();
  const indexHtml = buildIndexHtml(fp);

  const errors = [
    ...validate('Code.gs',    codeGs,    false),
    ...validate('Modules.gs', modulesGs, false),
    ...validate('Index.html', indexHtml, true),
  ];

  if (errors.length) {
    console.error('\n❌ Budget violations:');
    errors.forEach(e => console.error('  ' + e));
    process.exit(1);
  }

  write(path.join(DIST, 'Code.gs'),    codeGs);
  write(path.join(DIST, 'Modules.gs'), modulesGs);
  write(path.join(DIST, 'Index.html'), indexHtml);

  const pct = (n, lim) => Math.round(n / lim * 100);
  console.log('\n✅ Build OK');
  console.log(`  Code.gs    ${codeGs.length.toLocaleString()} / ${BUDGET_FILE.toLocaleString()} chars  (${pct(codeGs.length, BUDGET_FILE)}%)`);
  console.log(`  Modules.gs ${modulesGs.length.toLocaleString()} / ${BUDGET_FILE.toLocaleString()} chars  (${pct(modulesGs.length, BUDGET_FILE)}%)`);
  console.log(`  Index.html ${indexHtml.length.toLocaleString()} / ${BUDGET_PAGE.toLocaleString()} chars  (${pct(indexHtml.length, BUDGET_PAGE)}%)`);
  console.log('\nDeploy: paste dist/ files into Apps Script editor → New version');
}

main();
