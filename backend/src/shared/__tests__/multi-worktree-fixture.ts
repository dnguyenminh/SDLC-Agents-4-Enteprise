/**
 * SA4E-394 — shared test fixture (STC §11 "Test Data Setup Scripts").
 * Creates the pre-seeded worktree layout:
 *   {TMP}/main   — legacy pinned root (documents/SA4E-394/BRD.md, notes.txt)
 *   {TMP}/wt-a   — registered worktree (docs/plan.md, diag/flow.drawio, img/logo.png)
 *   {TMP}/wt-b   — registered worktree (tmp/, documents/SA4E-394/BRD.md, diag/, script.py)
 *   {TMP}/wt-unreg — NOT in the allowlist (secret.txt)
 *   {TMP}/outside  — containment escape target (evil.txt)
 *   {TMP}/plainfile.txt — a FILE registered as a root (BR-06 fixture)
 *   wt-ghost — registered in the allowlist but NEVER created on disk (FS_ERROR fixture)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import pino from 'pino';

export interface MultiWorktreeFixture {
  root: string;
  main: string;
  wtA: string;
  wtB: string;
  wtUnreg: string;
  outside: string;
  plainFile: string;
  wtGhost: string;
  /** Allowlist env value covering main + wt-a + wt-b + ghost + plainfile. */
  allowlistEnv: string;
  logger: ReturnType<typeof pino>;
  cleanup(): void;
}

export function createWorktreeFixture(): MultiWorktreeFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e394-'));
  const mkroot = (name: string): string => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const main = mkroot('main');
  fs.mkdirSync(path.join(main, 'documents', 'SA4E-394'), { recursive: true });
  fs.writeFileSync(path.join(main, 'documents', 'SA4E-394', 'BRD.md'), '# BRD sample\n');
  fs.writeFileSync(path.join(main, 'notes.txt'), 'legacy note\n');

  const wtA = mkroot('wt-a');
  for (const sub of ['docs', 'diag', 'img']) fs.mkdirSync(path.join(wtA, sub), { recursive: true });
  fs.writeFileSync(path.join(wtA, 'docs', 'plan.md'), '# plan\n');
  fs.writeFileSync(path.join(wtA, 'diag', 'flow.drawio'), '<mxGraphModel></mxGraphModel>');
  fs.writeFileSync(path.join(wtA, 'img', 'logo.png'), 'png-bytes');

  const wtB = mkroot('wt-b');
  for (const sub of ['tmp', path.join('documents', 'SA4E-394'), 'diag']) {
    fs.mkdirSync(path.join(wtB, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(wtB, 'documents', 'SA4E-394', 'BRD.md'), '# BRD wt-b\n');
  fs.writeFileSync(path.join(wtB, 'diag', 'flow.drawio'), '<mxGraphModel></mxGraphModel>');
  fs.writeFileSync(path.join(wtB, 'script.py'), 'print("hi")\n');

  const wtUnreg = mkroot('wt-unreg');
  fs.writeFileSync(path.join(wtUnreg, 'secret.txt'), 'secret\n');

  const outside = mkroot('outside');
  fs.writeFileSync(path.join(outside, 'evil.txt'), 'evil\n');

  const plainFile = path.join(root, 'plainfile.txt');
  fs.writeFileSync(plainFile, 'not a directory\n');

  const wtGhost = path.join(root, 'wt-ghost'); // intentionally NOT created

  const allowlistEnv = [main, wtA, wtB, wtGhost, plainFile].join(path.delimiter);
  return {
    root, main, wtA, wtB, wtUnreg, outside, plainFile, wtGhost, allowlistEnv,
    logger: pino({ level: 'silent' }),
    cleanup: () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } },
  };
}
