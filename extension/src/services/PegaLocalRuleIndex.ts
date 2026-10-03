/**
 * PegaLocalRuleIndex — local record of Pega rules already downloaded.
 *
 * Requirement: after reading the rule catalog CSV (pzInsKey + checksum), the
 * extension must check LOCALLY whether the rule was downloaded before — keyed
 * by file path + checksum — so unchanged rules are never fetched again.
 *
 * Today the only skip is the backend bulk-check (StateComparer); when that
 * call fails (E-04/BR-15) the comparer degrades to a FULL run and every rule
 * is re-downloaded. This index makes the skip work offline: a rule is skipped
 * only when BOTH hold:
 *   1. its recorded file still exists at that path, and
 *   2. its recorded checksum equals the CSV checksum (rule unchanged).
 *
 * Path: `<root>/.pega-cache/local-rule-index.json`
 */

import * as fs from "fs";
import * as path from "path";
import { computePegaChecksum } from "../code-intel/checksum/PegaRuleChecksumStrategy";

/** One downloaded rule: where it lives locally + the checksum it was saved under. */
export interface LocalRuleIndexEntry {
  file: string;
  checksum: string;
  savedAt: string;
}

type IndexMap = Record<string, LocalRuleIndexEntry>;

/** Debounce for background writes (record() fires thousands of times per run). */
const SAVE_DEBOUNCE_MS = 1_500;

export class PegaLocalRuleIndex {
  private map: IndexMap = {};
  private dirty = false;
  private timer: NodeJS.Timeout | undefined;
  private writes = 0;

  constructor(private readonly root: string) {
    this.load();
  }

  /** Absolute path of the index file (for diagnostics). */
  get location(): string {
    return path.join(this.root, ".pega-cache", "local-rule-index.json");
  }

  /** Number of rules currently tracked. */
  get size(): number {
    return Object.keys(this.map).length;
  }

  /**
   * Decide whether a catalog item can be skipped without any network call.
   * @param insKey - pzInsKey from the CSV (lookup key)
   * @param checksum - checksum the CSV claims for that rule
   * @returns true when the rule was downloaded before AND is still unchanged
   */
  isUnchanged(insKey: string, checksum?: string): boolean {
    if (!checksum) return false;              // no checksum → cannot prove unchanged
    const entry = this.map[insKey];
    if (!entry) return false;                 // never downloaded locally
    if (entry.checksum !== checksum) return false;  // rule changed since last run
    try {
      return fs.existsSync(entry.file);       // file path must still resolve
    } catch {
      return false;
    }
  }

  /** Record a freshly downloaded (or confirmed) rule. */
  record(insKey: string, file: string, checksum: string): void {
    if (!insKey || !file || !checksum) return;
    const prev = this.map[insKey];
    if (prev && prev.checksum === checksum && prev.file === file) return;
    this.map[insKey] = { file, checksum, savedAt: new Date().toISOString() };
    this.scheduleSave();
  }

  /** Drop entries whose files no longer exist (keeps the index honest). */
  prune(): number {
    let removed = 0;
    for (const [insKey, entry] of Object.entries(this.map)) {
      if (!fs.existsSync(entry.file)) {
        delete this.map[insKey];
        removed++;
      }
    }
    if (removed > 0) this.dirty = true;
    return removed;
  }

  /**
   * Seed the index from rules downloaded by PREVIOUS runs (LR-01 backfill).
   *
   * Entries are only written on a successful ingest, so before this scan a fresh
   * install would report `index=0 entries` forever even though `rules/` already
   * holds every rule. Reads each saved `.pega.json` file under `rules/` once,
   * recomputes the checksum from its 3 identity fields (NT-2) and records
   * path + checksum.
   *
   * @param log - Optional progress logger
   * @returns number of files indexed
   */
  backfill(log?: (msg: string) => void): number {
    const rulesDir = path.join(this.root, "rules");
    if (!fs.existsSync(rulesDir)) return 0;
    const started = Date.now();
    let added = 0;
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith(".pega.json")) continue;
        try {
          const rule = JSON.parse(fs.readFileSync(full, "utf-8")) as Record<string, unknown>;
          const insKey = String(rule.pzInsKey ?? rule.insKey ?? "");
          if (!insKey || this.map[insKey]) continue;
          const checksum = computePegaChecksum({
            pzInsKey: insKey,
            pxUpdateDateTime: rule.pxUpdateDateTime as string | undefined,
            pxSaveDateTime: rule.pxSaveDateTime as string | undefined,
          });
          this.map[insKey] = { file: full, checksum, savedAt: new Date().toISOString() };
          added++;
        } catch {
          // Unreadable/corrupt file — simply not indexable; it will be re-fetched.
        }
      }
    };
    walk(rulesDir);
    if (added > 0) {
      this.dirty = true;
      this.flush();
      log?.(`[Catalog] 📁 Local index backfilled from disk: ${added} rule files in ${Date.now() - started}ms`);
    }
    return added;
  }

  /** Persist immediately (call at the end of an index run). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) return;
    this.saveSync();
  }

  /** Load the index; a missing/corrupt file simply means an empty index. */
  private load(): void {
    try {
      const raw = fs.readFileSync(this.location, "utf-8");
      const parsed = JSON.parse(raw) as IndexMap;
      this.map = parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      this.map = {};
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.dirty) this.saveSync();
    }, SAVE_DEBOUNCE_MS);
  }

  private saveSync(): void {
    try {
      fs.mkdirSync(path.dirname(this.location), { recursive: true });
      fs.writeFileSync(this.location, JSON.stringify(this.map, null, 2), "utf-8");
      this.dirty = false;
      this.writes++;
    } catch {
      // A failed write must never break indexing — the next run just re-checks.
    }
  }
}
