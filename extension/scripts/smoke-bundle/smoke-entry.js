/**
 * Bundle smoke test — guards the exact production failure mode (UAT 2026-09-30):
 * importing @earendil-works/pi-coding-agent inside the CJS bundle threw at
 * module top level (import.meta.url), so every turn shipped 0 tools.
 *
 * Exercises, fully offline: package import → 7 file-tool factories →
 * extension loader (trivial .js + .ts extensions via jiti).
 * Exit 0 = green, non-zero = regression. Wired as `npm run smoke:bundle`.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const failures = [];
  const ok = (label, cond, extra) => {
    console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
    if (!cond) failures.push(label);
  };
  const workspaceRoot = process.argv[2] || process.cwd();

  // 1. Package import (this alone threw before the import.meta shim).
  let m;
  try {
    m = await import('@earendil-works/pi-coding-agent');
    ok('package import', true);
  } catch (err) {
    ok('package import', false, err && err.message);
    console.log(((err && err.stack) || '').split('\n').slice(0, 10).join('\n'));
    throw new Error('smoke failed at import');
  }

  // 2. The 7 file tools — the exact legacy-path call that returned [].
  const cases = [
    ['createReadTool', 'read'],
    ['createWriteTool', 'write'],
    ['createEditTool', 'edit'],
    ['createBashTool', 'bash'],
    ['createGrepTool', 'grep'],
    ['createFindTool', 'find'],
    ['createLsTool', 'ls'],
  ];
  for (const [factory, name] of cases) {
    try {
      const tool = m[factory](workspaceRoot);
      ok(`tool ${name}`, tool && tool.name === name, tool && tool.name);
    } catch (err) {
      ok(`tool ${name}`, false, err && err.message);
    }
  }

  // 3. Extension loader with trivial local extensions (offline, no network).
  // NOTE: entries live under scripts/ (vsix-excluded) so bare imports
  // resolve via normal node_modules walk-up — exactly like real extensions
  // installed under node_modules. Tmpdir entries would NOT resolve.
  // process.argv[2] is the extension dir when run via `npm run smoke:bundle`.
  const repoScripts = path.join(workspaceRoot, 'scripts', 'smoke-tmp');
  fs.mkdirSync(repoScripts, { recursive: true });
  const dir = repoScripts;
  const jsExt = path.join(dir, 'ext-ping.js');
  const tsExt = path.join(dir, 'ext-pong.ts');
  const toolDef = (name, label) =>
    `pi.registerTool({ name: '${name}', label: '${label}', description: 'smoke', parameters: TYPESCHEMA, execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: {} }) });`;
  const jsSrc =
    `const { Type } = require('typebox');\n` +
    `module.exports = (pi) => { ${toolDef('smoke_ping', 'Ping').replace('TYPESCHEMA', 'Type.Object({})')} };`;
  const tsSrc =
    `import { Type } from 'typebox';\n` +
    `export default (pi: any) => { ${toolDef('smoke_ts', 'Ts').replace('TYPESCHEMA', 'Type.Object({})')} };`;
  fs.writeFileSync(jsExt, jsSrc);
  fs.writeFileSync(tsExt, tsSrc);
  try {
    const res = await m.discoverAndLoadExtensions([jsExt, tsExt], workspaceRoot);
    const names = [];
    for (const ext of res.extensions ?? []) {
      for (const n of ext.tools?.keys?.() ?? []) names.push(n);
    }
    ok(
      'loader trivial extensions',
      names.includes('smoke_ping') && names.includes('smoke_ts'),
      names.join(',')
    );
    const errs = (res.errors ?? []).map((e) => e.error);
    ok('loader errors empty', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (err) {
    ok('extension loader', false, err && err.message);
  }

  if (failures.length) {
    console.error(`SMOKE FAILED: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('SMOKE PASSED');
  try {
    fs.rmSync(repoScripts, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup (scripts/ is vsix-excluded anyway).
  }
}

main().catch((e) => {
  console.error('SMOKE FATAL', e);
  process.exit(1);
});
