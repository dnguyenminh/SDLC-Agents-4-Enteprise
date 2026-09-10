/**
 * SA4E — Ingest crawled Pega docs (raw2/*.txt) into knowledge_entries.
 *
 * Reverse-maps the crawl slug filename back to its docs.pega.com URL, summarizes
 * the page text via the local LLM (paraphrase ONLY, source attribution per NFR-5),
 * and stores it into the KB with structured tags: pega-doc, concept:{area}, lang:en.
 *
 * Reuses PegaDocsIngestor's store contract (INSERT into knowledge_entries) so the
 * output is identical to the out-of-band ingest path. Runs a bounded worker pool
 * with resume support (skip already-ingested URLs via ingest-done.txt).
 *
 * Usage:
 *   tsx scripts/ingest-raw2-pega-docs.ts [--raw-dir DIR] [--db-path PATH]
 *       [--limit N] [--concurrency M] [--provider P] [--model M]
 *       [--max-chars N] [--words N] [--timeout-ms N]
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseAdapterFactory } from '../src/database/factory/DatabaseAdapterFactory.js';
import { LLMService } from '../src/modules/memory/llm/LLMService.js';
import { TABLES } from '../src/modules/memory/schema/tables.js';
import pino from 'pino';

const logger = pino({ name: 'ingest-raw2-pega-docs' });

const KE_ONLY = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  summary TEXT NOT NULL,
  type TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'WORKING',
  scope TEXT NOT NULL DEFAULT 'USER',
  user_id TEXT DEFAULT NULL,
  project_id TEXT DEFAULT NULL,
  source TEXT,
  source_ref TEXT,
  tags TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1.0,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT,
  expires_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  pin_order INTEGER NOT NULL DEFAULT 0,
  structured_map TEXT NOT NULL DEFAULT '{}',
  quality_score INTEGER DEFAULT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  agent_name TEXT DEFAULT NULL,
  owner TEXT DEFAULT NULL
);`;

interface Args {
  rawDir: string;
  dbPath: string;
  limit: number;
  concurrency: number;
  provider: string;
  model?: string;
  maxChars: number;
  words: number;
  timeoutMs: number;
  maxTokens: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string, dflt: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const has = (flag: string) => argv.includes(flag);
  const limitIdx = argv.indexOf('--limit');
  const concIdx = argv.indexOf('--concurrency');
  return {
    rawDir: get('--raw-dir', path.resolve(process.cwd(), '..', '.opencode', 'kb', 'pega', 'raw2')),
    dbPath: get('--db-path', path.resolve(process.cwd(), 'data', 'agent.db')),
    limit: limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Number.MAX_SAFE_INTEGER,
    concurrency: concIdx >= 0 ? Number(argv[concIdx + 1]) : 4,
    provider: get('--provider', 'ollama'),
    model: has('--model') ? get('--model', '') || undefined : undefined,
    maxChars: Number(get('--max-chars', '6000')),
    words: Number(get('--words', '200')),
    timeoutMs: Number(get('--timeout-ms', '180000')),
    maxTokens: Number(get('--max-tokens', '4096')),
  };
}

/** Reverse the crawl slug back to the original docs.pega.com URL. */
function slugToUrl(fileBase: string): string {
  // fileBase = docs.pega.com__bundle__platform__page__platform__area__...__html
  return 'https://' + fileBase.replace(/__/g, '/');
}

function deriveTitle(url: string): string {
  const seg = url.split('/').pop() || 'Pega Document';
  const clean = seg.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  return clean
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function deriveConcept(url: string): string {
  const m = url.match(/\/page\/platform\/([^/]+)\//);
  if (m) return m[1].replace(/[-_]+/g, '-');
  return 'general';
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function ensureSchema(adapter: any): Promise<void> {
  try {
    adapter.exec(TABLES);
  } catch (err) {
    logger.warn({ err }, 'full TABLES DDL failed; falling back to base knowledge_entries only');
    adapter.exec(KE_ONLY);
  }
  try {
    adapter.exec('ALTER TABLE knowledge_entries ADD COLUMN enrichment_status TEXT');
  } catch {
    /* column already exists */
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  logger.info({ args }, '[ingest-raw2] starting');

  const rawDir = args.rawDir;
  if (!fs.existsSync(rawDir)) {
    throw new Error(`raw2 dir not found: ${rawDir}`);
  }
  const doneFile = path.join(rawDir, 'ingest-done.txt');
  const failFile = path.join(rawDir, 'ingest-fail.txt');

  // Resume set
  const doneSet = new Set<string>();
  if (fs.existsSync(doneFile)) {
    for (const line of fs.readFileSync(doneFile, 'utf8').split('\n')) {
      const u = line.trim();
      if (u) doneSet.add(u);
    }
  }
  const doneBuffer: string[] = [];
  let flushing = false;
  const flushDone = () => {
    if (flushing || doneBuffer.length === 0) return;
    flushing = true;
    const batch = doneBuffer.splice(0, doneBuffer.length);
    fs.appendFileSync(doneFile, batch.join('\n') + '\n');
    flushing = false;
  };
  const flushTimer = setInterval(flushDone, 5000);

  // DB
  const adapter = DatabaseAdapterFactory.create({
    engine: (process.env.DB_ENGINE as any) || 'sqlite',
    dbPath: args.dbPath,
  });
  await adapter.connect();
  await ensureSchema(adapter);

  // LLM
  const modelDefaults: Record<string, string> = {
    ollama: 'qwen2.5:7b-instruct-q4_K_M',
    lmstudio: 'qwen-text',
  };
  const llm = new LLMService({
    provider: args.provider as any,
    model: args.model || modelDefaults[args.provider] || undefined,
    maxTokens: args.maxTokens,
  });
  logger.info({ config: llm.getConfig() }, '[ingest-raw2] LLM configured');

  // Build page list
  const files = fs
    .readdirSync(rawDir)
    .filter((f) => f.endsWith('.txt') && !f.endsWith('.tmp'))
    .map((f) => path.join(rawDir, f));

  let pending = 0;
  const pages: { url: string; title: string; concept: string; content: string; file: string }[] = [];
  for (const file of files) {
    if (pages.length >= args.limit) break;
    const slug = path.basename(file, '.txt');
    const url = slugToUrl(slug);
    if (doneSet.has(url)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.trim().length < 300) continue; // skip near-empty
    pages.push({
      url,
      title: deriveTitle(url),
      concept: deriveConcept(url),
      content: raw.length > args.maxChars ? raw.slice(0, args.maxChars) : raw,
      file,
    });
    pending++;
  }
  logger.info(
    { total: files.length, pending, skippedDone: doneSet.size, willProcess: pages.length },
    '[ingest-raw2] plan',
  );

  let ingested = 0;
  let failed = 0;
  const fails: string[] = [];
  let idx = 0;
  const start = Date.now();
  let lastReport = Date.now();

  const store = async (entry: { content: string; summary: string; source: string; tags: string }) => {
    const now = new Date().toISOString();
    await adapter.runAsync(
      `INSERT INTO knowledge_entries (content, summary, type, source, tags, scope, tier, created_at, enrichment_status)
       VALUES (?, ?, 'PEGA_DOC', ?, ?, 'PROJECT', 'SEMANTIC', ?, 'done')`,
      [entry.content, entry.summary, entry.source, entry.tags, now],
    );
  };

  const worker = async () => {
    while (true) {
      const cur = idx++;
      if (cur >= pages.length) break;
      const page = pages[cur];
      try {
        const prompt = `Summarize the following Pega Platform documentation page for an engineer who builds Pega rules. Produce a concise paraphrase (max ${args.words} words) covering key concepts and how they affect rule authoring. Do NOT copy verbatim. No citations.\n\nTitle: ${page.title}\n\n${page.content}`;
        const summary = (
          await withTimeout(
            llm.ask(prompt, 'You are a senior Pega Platform architect.'),
            args.timeoutMs,
            page.url,
          )
        ).trim();
        if (!summary) throw new Error('empty summary');

        const tags = ['pega-doc', `concept:${page.concept}`, 'lang:en'].join(',');
        await store({
          content: `${summary}\n\nSource: ${page.url}`,
          summary: page.title,
          source: page.url,
          tags,
        });
        ingested++;
        doneSet.add(page.url);
        doneBuffer.push(page.url);
      } catch (err) {
        failed++;
        fails.push(page.url);
        logger.warn({ err, url: page.url }, '[ingest-raw2] failed page');
      }

      const now = Date.now();
      if (now - lastReport >= 5000) {
        const secs = (now - start) / 1000;
        const done = ingested + failed;
        const rate = done > 0 ? done / secs : 0;
        logger.info(
          { ingested, failed, remaining: pages.length - (ingested + failed), ratePerSec: +rate.toFixed(2) },
          '[ingest-raw2] progress',
        );
        lastReport = now;
      }
    }
  };

  const n = Math.max(1, Math.min(args.concurrency, pages.length));
  await Promise.all(Array.from({ length: n }, () => worker()));

  clearInterval(flushTimer);
  flushDone();

  if (fails.length) {
    fs.writeFileSync(failFile, fails.join('\n') + '\n');
  }

  const secs = (Date.now() - start) / 1000;
  logger.info(
    { ingested, failed, totalFiles: files.length, elapsedSec: +secs.toFixed(1), failLog: failFile },
    '[ingest-raw2] COMPLETED',
  );
  await adapter.disconnect();
}

main().catch((err) => {
  logger.error({ err }, '[ingest-raw2] failed');
  process.exit(1);
});
