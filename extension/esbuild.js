const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode', 'onnxruntime-node', '/bundled/*', './mcp/devtools/*', 'filetomarkdown'],
  alias: {
    // Native optional module from @vscode/proxy-agent — unused by us (CA cert
    // loading disabled). Stubbed so the bundle stays self-contained at runtime.
    '@vscode/windows-ca-certs': './src/proxy/stubs/windows-ca-certs.ts',
  },
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  metafile: production,
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    const result = await esbuild.build(buildOptions);
    if (production && result.metafile) {
      const analysis = await esbuild.analyzeMetafile(result.metafile);
      console.log(analysis);
    }
    console.log('[esbuild] build complete');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
