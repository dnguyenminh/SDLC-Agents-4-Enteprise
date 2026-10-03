#!/usr/bin/env node
/**
 * SA4E-335 follow-up — Postgres (pg_dump) + SQLite backup for the code-intel backend.
 * Named volumes are destroyed by `docker compose down -v` / `docker volume rm`, and
 * the SA4E-335 incident had NO dump anywhere — so this writes a verifiable
 * `pg_dump -Fc` archive (PGDMP magic checked) plus a copy of SQLite `index.db`.
 *
 * Usage:
 *   node scripts/db/backup-postgres.mjs [--target prod|test] [--keep N]
 *                                        [--out DIR] [--if-running] [--help]
 * Exit codes: 0 = backup written (or PG skipped under --if-running), 1 = failed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_OUT = path.join(BACKEND_ROOT, 'backups');
const DEFAULT_KEEP = 7;

/** Backup targets — container must match the compose stack that owns it. */
export const TARGETS = {
  prod: {
    container: 'sa4e-postgres',
    user: 'sa4e_user',
    db: 'sa4e_db',
    sqlite: path.join(BACKEND_ROOT, '.code-intel', 'index.db'),
  },
  test: {
    container: 'sa4e-postgres-test',
    user: 'sa4e_user',
    db: 'sa4e_db_test',
    sqlite: null,
  },
};

const DUMP_RE = /^sa4e_db_[\d-]+/;
const SQLITE_RE = /^index\.db_[\d-]+/;

/** Run a process and return its spawnSync result (buffers, no throw). */
function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { windowsHide: true, ...opts });
}

function parseArgs(argv) {
  const opts = { target: 'prod', keep: DEFAULT_KEEP, out: DEFAULT_OUT, ifRunning: false, help: false, unknown: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--target') opts.target = argv[i + 1] ?? '';
    else if (a === '--keep') opts.keep = Number(argv[i + 1]);
    else if (a === '--out') opts.out = path.resolve(argv[i + 1] ?? '');
    else if (a === '--if-running') opts.ifRunning = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else opts.unknown = a;
    if (a === '--target' || a === '--keep' || a === '--out') i += 1;
  }
  return opts;
}

function isContainerRunning(container) {
  const r = run('docker', ['inspect', '-f', '{{.State.Running}}', container]);
  return r.status === 0 && String(r.stdout ?? '').trim() === 'true';
}

/** Local-time stamp (YYYY-MM-DD-HH-mm-ss) so dump names match the operator's clock. */
function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/** Dump Postgres with `pg_dump -Fc` and validate the PGDMP magic before writing. */
function dumpPostgres(target, outFile) {
  const r = run(
    'docker',
    ['exec', target.container, 'pg_dump', '-U', target.user, '-F', 'c', target.db],
    { maxBuffer: 512 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    const err = String(r.stderr ?? '').trim() || `exit code ${r.status}`;
    throw new Error(`pg_dump failed for ${target.container}: ${err}`);
  }
  const buf = r.stdout;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new Error('pg_dump produced no output');
  if (buf.subarray(0, 5).toString('latin1') !== 'PGDMP') {
    throw new Error('pg_dump output is not a valid custom-format archive (missing PGDMP magic)');
  }
  fs.writeFileSync(outFile, buf);
  return buf.length;
}

/** Copy the SQLite db + its -wal/-shm sidecars so a restore is crash-consistent. */
function copySqlite(target, outFile) {
  if (!target.sqlite || !fs.existsSync(target.sqlite)) return null;
  fs.copyFileSync(target.sqlite, outFile);
  for (const side of ['-wal', '-shm']) {
    const src = `${target.sqlite}${side}`;
    if (fs.existsSync(src)) fs.copyFileSync(src, `${outFile}${side}`);
  }
  return fs.statSync(outFile).size;
}

/** Delete all but the newest `keep` matches of `re` inside `dir`. */
function prune(dir, re, keep) {
  const victims = fs.readdirSync(dir)
    .filter((f) => re.test(f))
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(keep);
  for (const { f } of victims) fs.rmSync(path.join(dir, f), { force: true });
  return victims.length;
}

/**
 * Write one backup batch. Returns 0 on success/skip, throws on failure.
 * `--ifRunning` skips ONLY the Postgres dump — SQLite copy and pruning still
 * run (returning early used to skip both, so a daily job with the stack down
 * would silently write nothing: exactly what this script exists to prevent).
 * @param {{target?: string, keep?: number, out?: string, ifRunning?: boolean}} opts
 */
export function backup(opts = {}) {
  const o = { target: 'prod', keep: DEFAULT_KEEP, out: DEFAULT_OUT, ifRunning: false, ...opts };
  const target = TARGETS[o.target];
  if (!target) throw new Error(`Unknown --target "${o.target}" (expected: prod | test)`);
  if (!Number.isFinite(o.keep) || o.keep < 1) throw new Error('--keep must be a positive integer');

  let pgSkipped = false;
  if (!isContainerRunning(target.container)) {
    if (!o.ifRunning) {
      throw new Error(`Container ${target.container} is not running (start it, or pass --if-running)`);
    }
    pgSkipped = true;
    console.warn(`[backup] WARNING — container ${target.container} is not running; PG dump SKIPPED`);
  }

  fs.mkdirSync(o.out, { recursive: true });
  const stamp = timestamp();

  let bytes = 0;
  if (!pgSkipped) {
    const dumpFile = path.join(o.out, `${target.db}_${stamp}.dump`);
    bytes = dumpPostgres(target, dumpFile);
    console.log(`[backup] pg_dump -> ${dumpFile} (${bytes} bytes)`);
  }

  let wroteSqlite = false;
  if (target.sqlite) {
    const size = copySqlite(target, path.join(o.out, `index.db_${stamp}`));
    if (size === null) {
      console.log('[backup] sqlite  -> missing (no index.db to copy)');
    } else {
      wroteSqlite = true;
      console.log(`[backup] sqlite  -> index.db_${stamp} (${size} bytes)`);
    }
  }
  const removedDumps = prune(o.out, DUMP_RE, o.keep);
  const removedSqlite = target.sqlite ? prune(o.out, SQLITE_RE, o.keep) : 0;
  if (removedDumps || removedSqlite) {
    console.log(`[backup] pruned ${removedDumps + removedSqlite} old file(s), keeping ${o.keep} batch(es)`);
  }
  if (pgSkipped && !wroteSqlite) {
    // Nothing secured — exit 0 so idempotent `test-compose down` still works, but be loud.
    console.warn('[backup] WARNING — NO backup written this run (PG container down and no SQLite file)');
    return 0;
  }
  if (pgSkipped) {
    console.log(`[backup] PARTIAL — SQLite only (target=${o.target}); no PG dump this run`);
    return 0;
  }
  console.log(`[backup] OK — target=${o.target} container=${target.container} db=${target.db}`);
  return 0;
}

function usage() {
  console.log('Usage: node scripts/db/backup-postgres.mjs [--target prod|test] [--keep N] [--out DIR] [--if-running]');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();
  if (opts.unknown) {
    usage();
    console.error(`Unknown argument: ${opts.unknown}`);
    process.exitCode = 1;
    return;
  }
  try {
    process.exitCode = backup(opts);
  } catch (err) {
    console.error(`[backup] FAILED — ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  ? path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
  : false;
if (invokedDirectly) main();
