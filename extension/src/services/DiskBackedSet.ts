/**
 * DiskBackedSet — Exact-membership string set with a bounded in-RAM hot tier and
 * an append-only spill file on disk (EHCache-style overflow-to-disk).
 *
 * Purpose: dedup keys during a large Pega crawl (hundreds of thousands of rules)
 * without letting an in-memory Set grow unbounded. Hot keys stay in RAM; overflow
 * keys are written to a spill file and located via an in-RAM offset index, so a
 * RAM miss reads exactly one record from disk (no full-file scan). Membership is
 * 100% exact — the offset index only locates candidates; the real key is always
 * compared against the bytes read from disk.
 *
 * Lifecycle: create per index run, then call dispose() to delete the spill file.
 */

import { closeSync, openSync, readSync, writeSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Minimal membership contract satisfied by both the native `Set<string>` and
 * `DiskBackedSet`. Callers that only need has()/add() (with side-effect semantics)
 * accept this so either implementation can be injected.
 */
export interface MembershipSet {
  has(key: string): boolean;
  add(key: string): unknown;
}

/** Default in-RAM hot-tier capacity (number of keys) when caller passes none. */
const DEFAULT_MAX_IN_MEMORY = 100_000;

/** 4-byte big-endian length prefix precedes each spilled key's UTF-8 bytes. */
const LEN_PREFIX_BYTES = 4;

/**
 * Exact-membership set backed by a bounded RAM tier plus an offset-indexed
 * append-only disk file. Not safe for concurrent async writers — designed for
 * the serial add/has loop of a crawler.
 */
export class DiskBackedSet {
  /** Hot tier: most-recently-added keys (insertion-ordered → cheap LRU eviction). */
  private readonly hot = new Set<string>();
  /** Maps an 8-byte key hash to the file offsets of records sharing that hash. */
  private readonly spillIndex = new Map<string, number[]>();
  private readonly maxInMemory: number;
  private readonly filePath: string;
  private fd: number | null = null;
  private writeOffset = 0;

  /**
   * @param filePath Absolute path for the spill file (created lazily on first spill).
   * @param maxInMemory Hot-tier capacity; non-positive values fall back to the default.
   */
  constructor(filePath: string, maxInMemory?: number) {
    this.filePath = filePath;
    this.maxInMemory = (typeof maxInMemory === 'number' && Number.isInteger(maxInMemory) && maxInMemory > 0)
      ? maxInMemory
      : DEFAULT_MAX_IN_MEMORY;
  }

  /** Total distinct keys held (hot tier + spilled to disk). */
  public get size(): number {
    let spilled = 0;
    for (const offsets of this.spillIndex.values()) spilled += offsets.length;
    return this.hot.size + spilled;
  }

  /** True if key was previously added. Exact — verifies real bytes on disk hits. */
  public has(key: string): boolean {
    if (this.hot.has(key)) return true;
    const offsets = this.spillIndex.get(hashKey(key));
    if (!offsets) return false;
    for (const offset of offsets) {
      if (this.readKeyAt(offset) === key) return true;
    }
    return false;
  }

  /**
   * Add a key. No-op if already present. When the hot tier overflows, the
   * least-recently-added key is spilled to disk.
   * @returns true if the key was newly added, false if it already existed.
   */
  public add(key: string): boolean {
    if (this.has(key)) return false;
    this.hot.add(key);
    if (this.hot.size > this.maxInMemory) this.evictOldest();
    return true;
  }

  /** Delete the spill file and release all in-memory state. */
  public dispose(): void {
    if (this.fd !== null) {
      try { closeSync(this.fd); } catch { /* already closed */ }
      this.fd = null;
    }
    if (existsSync(this.filePath)) {
      try { rmSync(this.filePath, { force: true }); } catch { /* best-effort cleanup */ }
    }
    this.hot.clear();
    this.spillIndex.clear();
    this.writeOffset = 0;
  }

  /** Evict the oldest hot key and append it to the spill file with an index entry. */
  private evictOldest(): void {
    const oldest = this.hot.values().next().value as string | undefined;
    if (oldest === undefined) return;
    this.hot.delete(oldest);
    const offset = this.appendToSpill(oldest);
    const h = hashKey(oldest);
    const list = this.spillIndex.get(h);
    if (list) list.push(offset);
    else this.spillIndex.set(h, [offset]);
  }

  /** Append a length-prefixed key record; returns the record's start offset. */
  private appendToSpill(key: string): number {
    const fd = this.ensureFd();
    const keyBuf = Buffer.from(key, 'utf-8');
    const record = Buffer.allocUnsafe(LEN_PREFIX_BYTES + keyBuf.length);
    record.writeUInt32BE(keyBuf.length, 0);
    keyBuf.copy(record, LEN_PREFIX_BYTES);
    const startOffset = this.writeOffset;
    writeSync(fd, record, 0, record.length, startOffset);
    this.writeOffset += record.length;
    return startOffset;
  }

  /** Read the key stored at a given record offset (length-prefixed UTF-8). */
  private readKeyAt(offset: number): string {
    const fd = this.ensureFd();
    const lenBuf = Buffer.allocUnsafe(LEN_PREFIX_BYTES);
    readSync(fd, lenBuf, 0, LEN_PREFIX_BYTES, offset);
    const len = lenBuf.readUInt32BE(0);
    const keyBuf = Buffer.allocUnsafe(len);
    readSync(fd, keyBuf, 0, len, offset + LEN_PREFIX_BYTES);
    return keyBuf.toString('utf-8');
  }

  /** Open the spill file (read+write) on first use, creating parent dirs. */
  private ensureFd(): number {
    if (this.fd !== null) return this.fd;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // 'w+' truncates any stale file from a previous run and opens for read+write.
    this.fd = openSync(this.filePath, 'w+');
    this.writeOffset = 0;
    return this.fd;
  }
}

/** 8-byte (16 hex chars) hash used only to locate candidate offsets, not for membership. */
function hashKey(key: string): string {
  return createHash('sha1').update(key).digest('hex').slice(0, 16);
}

/**
 * Factory: create a DiskBackedSet for a Pega crawl dedup, reading the hot-tier
 * cap from the `sdlcAgents.pega.dedupMaxInMemory` VS Code setting and placing the
 * spill file under the workspace's temp area. Kept here (not in the class) so
 * DiskBackedSet stays free of vscode/path-policy concerns and remains unit-testable.
 * @param workspaceRoot Absolute workspace root; the spill file lives in a temp subdir.
 * @param label A short, unique label distinguishing concurrent dedup sets.
 */
export function createPegaDedupSet(workspaceRoot: string, label: string): DiskBackedSet {
  // Lazy requires so the pure class has no static vscode dependency (testability).
  const vscode = require('vscode');
  const path = require('node:path');
  const cap = vscode.workspace
    .getConfiguration('sdlcAgents')
    .get('pega.dedupMaxInMemory') as number | undefined;
  const spillPath = path.join(workspaceRoot, '.pega-cache', `dedup-${label}.bin`);
  return new DiskBackedSet(spillPath, cap);
}
