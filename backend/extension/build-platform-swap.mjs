import esbuild from '../node_modules/esbuild/lib/main.js';
import { mkdirSync } from 'fs';

mkdirSync('out/platform-swap', { recursive: true });

await esbuild.build({
  entryPoints: ['src/platform-swap/index.ts'],
  bundle: true,
  outfile: 'out/platform-swap/index.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
});
console.log('platform-swap built successfully');
