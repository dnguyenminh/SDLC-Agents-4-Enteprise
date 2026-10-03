#!/usr/bin/env node
/**
 * Test-stack compose driver — ALWAYS runs under compose project `sa4e-test`.
 *
 * Data-safety (SA4E-335): `down -v` deletes every volume declared in the merged
 * config. Scoping the run to its own project guarantees those deletions resolve
 * to `sa4e-test_*` volumes and can never reach `backend_postgres_data` /
 * `backend_code_intel_data`. Never call `docker compose down -v` against the
 * default `backend` project — use this driver instead.
 *
 * Usage:
 *   node scripts/db/test-compose.mjs up [--build]
 *   node scripts/db/test-compose.mjs down [--keep-volumes] [--no-backup] [--force]
 *   node scripts/db/test-compose.mjs config [--quiet]
 *
 * `down` runs a Postgres backup first and ABORTS before removing volumes when
 * that backup fails (pass --force to override, --no-backup to skip entirely).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { backup } from './backup-postgres.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..', '..');
export const TEST_PROJECT = 'sa4e-test';
const COMPOSE_FILES = ['-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml'];

/** Run `docker compose -p sa4e-test -f ... <args>` from backend/. Returns exit code. */
export function compose(args) {
  const r = spawnSync('docker', ['compose', '-p', TEST_PROJECT, ...COMPOSE_FILES, ...args], {
    stdio: 'inherit',
    cwd: BACKEND_ROOT,
    windowsHide: true,
  });
  if (r.error) {
    console.error(`[test-compose] docker unavailable: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

function backupTestDb() {
  try {
    backup({ target: 'test', ifRunning: true });
    return true;
  } catch (err) {
    console.error(`[test-compose] backup FAILED — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function runCommand(cmd) {
  const flags = cmd.flags;
  if (cmd.name === 'config') {
    return compose(['config', ...(flags.quiet ? ['--quiet'] : [])]);
  }
  if (cmd.name === 'up') {
    return compose(['up', '-d', ...(flags.build ? ['--build'] : [])]);
  }
  // down
  if (!flags.noBackup && !backupTestDb()) {
    if (!flags.force) {
      console.error('[test-compose] ABORTED — refusing to tear down volumes without a backup (use --force to override)');
      return 1;
    }
    console.warn('[test-compose] proceeding despite backup failure (--force)');
  }
  const downArgs = ['down'];
  if (!flags.keepVolumes) downArgs.push('-v');
  return compose(downArgs);
}

function parse(argv) {
  const cmd = argv[0];
  const flags = { build: false, quiet: false, keepVolumes: false, noBackup: false, force: false };
  for (const a of argv.slice(1)) {
    if (a === '--build') flags.build = true;
    else if (a === '--quiet' || a === '-q') flags.quiet = true;
    else if (a === '--keep-volumes') flags.keepVolumes = true;
    else if (a === '--no-backup') flags.noBackup = true;
    else if (a === '--force') flags.force = true;
    else return { error: a };
  }
  const known = ['up', 'down', 'config'];
  if (!known.includes(cmd)) return { error: cmd ?? '(missing command)' };
  return { name: cmd, flags };
}

function usage() {
  console.log([
    'Usage:',
    '  node scripts/db/test-compose.mjs up [--build]',
    '  node scripts/db/test-compose.mjs down [--keep-volumes] [--no-backup] [--force]',
    '  node scripts/db/test-compose.mjs config [--quiet]',
    `Always targets compose project "${TEST_PROJECT}" (isolated volumes).`,
  ].join('\n'));
}

function main() {
  const parsed = parse(process.argv.slice(2));
  if (parsed.error !== undefined) {
    usage();
    console.error(`Unknown argument: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = runCommand(parsed);
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
  : false;
if (invokedDirectly) main();
