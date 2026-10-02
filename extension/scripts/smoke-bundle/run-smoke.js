/**
 * Builds smoke-entry.js with the SAME bundling (CJS + import.meta banner/define)
 * as the real extension, then runs it.
 * The bundle is emitted inside the repo (scripts/smoke-bundle/out/, never
 * shipped — scripts/** is vsix-excluded) so runtime `require.resolve` from the
 * bundle (createRequire(import.meta.url) in pi loader) walks up into the
 * monorepo root node_modules, exactly like out/extension.js does in dev.
 * Usage: npm run smoke:bundle [workspaceRoot]
 */
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { piImportMetaBanner, piImportMetaDefine } = require('../esbuild-plugins/pi-import-meta.js');

async function main() {
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'smoke-bundle.js');
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'smoke-entry.js')],
    bundle: true,
    outfile: outFile,
    external: ['vscode', 'onnxruntime-node', '/bundled/*', './mcp/devtools/*', 'filetomarkdown'],
    banner: { js: piImportMetaBanner },
    define: piImportMetaDefine,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'warning',
  });
  const workspaceRoot = process.argv[2] || process.cwd();
  try {
    execFileSync(process.execPath, [outFile, workspaceRoot], { stdio: 'inherit' });
  } finally {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup (scripts/** is vsix-excluded anyway).
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
