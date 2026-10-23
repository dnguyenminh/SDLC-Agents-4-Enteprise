/**
 * Test-parity verifier: for each deleted (split) test file, extract every
 * it()/test() title from its git-HEAD version and check each title still
 * exists in the CURRENT test files of the same directory.
 * Usage: node .analysis/verify-test-parity.mjs
 */
import { execSync } from 'child_process';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = process.cwd();
const GIT = (p) => execSync(`git show "HEAD:${p.split('\\').join('/')}"`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const TITLE_RE = /^\s*(?:it|test)(?:\.each|\.skip|\.only|\.todo)?\s*\(\s*[`'"]([^`'"]+)[`'"]/;

function extractTitles(src) {
  const titles = [];
  let rawCount = 0;
  for (const line of src.split(/\r?\n/)) {
    if (/^\s*(?:it|test)\s*\(/.test(line)) rawCount++;
    const m = line.match(TITLE_RE);
    if (m) titles.push(m[1].trim());
  }
  return { titles, rawCount };
}

const FILES = [
  'extension/src/__tests__/chat/chat.pbt.test.ts',
  'extension/src/__tests__/wrapper-server.test.ts',
  'extension/src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts',
  'extension/src/chat/engine/__tests__/ToolApprovalGate.test.ts',
  'extension/src/mcp/__tests__/mcp-bridge.test.ts',
  'extension/src/mcp/atlassian/__tests__/jira-download-attachment.test.ts',
  'extension/src/mcp/providers/__tests__/anthropic-provider.test.ts',
  'extension/src/mcp/providers/__tests__/openai-provider.test.ts',
  'extension/src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts',
  'extension/src/pi-workflow/__tests__/bridge-wiring-legacy.test.ts',
  'extension/src/webview/__tests__/additional-todos.test.ts',
  'extension/src/webview/__tests__/integration.test.ts',
  'extension/src/webview/__tests__/options.integration.test.ts',
  'extension/src/webview/__tests__/options.pbt.test.ts',
  'extension/src/webview/__tests__/options.unit.test.ts',
  'extension/src/webview/__tests__/pbt.test.ts',
  'extension/src/webview/__tests__/slash-menu.integration.test.ts',
  'extension/src/webview/__tests__/slash-menu.pbt.test.ts',
  'extension/src/webview/__tests__/slash-menu.unit.test.ts',
  'extension/src/webview/__tests__/spinner.integration.test.ts',
  'extension/src/webview/__tests__/spinner.unit.test.ts',
  'extension/src/webview/__tests__/unit-part2.test.ts',
  'extension/src/webview/graph/lod/__tests__/lod.test.ts',
];

let allOk = true;
const report = [];

for (const f of FILES) {
  const head = GIT(f);
  const { titles: origTitles, rawCount: origRaw } = extractTitles(head);
  const dir = dirname(f);

  // Current test files in the same directory (split targets live there by design)
  const currentFiles = existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir)).filter((n) => /\.test\.ts$/.test(n)).map((n) => join(dir, n))
    : [];

  const currentTitles = new Set();
  let currentRaw = 0;
  const perFile = [];
  for (const cf of currentFiles) {
    const src = readFileSync(join(ROOT, cf), 'utf8');
    const { titles, rawCount } = extractTitles(src);
    titles.forEach((t) => currentTitles.add(t));
    currentRaw += rawCount;
    if (titles.length > 0) perFile.push(`${cf.split('\\').pop()} (${titles.length})`);
  }

  const missing = origTitles.filter((t) => !currentTitles.has(t));
  const ok = missing.length === 0;
  if (!ok) allOk = false;

  report.push({
    file: f,
    origTitles: origTitles.length,
    origRaw,
    currentFiles: currentFiles.length,
    currentRaw,
    ok,
    missing: missing.slice(0, 8),
    perFile: perFile.join(', '),
  });
}

for (const r of report) {
  console.log(`${r.ok ? 'OK  ' : 'MISS'} ${r.file}`);
  console.log(`     HEAD: ${r.origTitles} titled its (${r.origRaw} raw)  ->  dir now: ${r.currentFiles} test files, ${r.currentRaw} raw its`);
  console.log(`     files: ${r.perFile}`);
  if (!r.ok) console.log(`     MISSING TITLES (${r.missing.length}+): ${JSON.stringify(r.missing)}`);
}
console.log(`\n==== RESULT: ${report.filter(r => r.ok).length}/${report.length} files fully covered, ${report.filter(r => !r.ok).length} with missing titles ====`);
