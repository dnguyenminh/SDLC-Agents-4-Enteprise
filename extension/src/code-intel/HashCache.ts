/**
 * SA4E-241 — HashCache. In-memory per-file checksum store for incremental
 * indexing of code/document (Source C/D).
 *
 * Root-cause change (No-Workaround): the delta checksum is now computed via a
 * ChecksumStrategy (git-blob when the repo is git, else path-inclusive sha256
 * fallback) instead of a plain sha256(content). This makes code/document deltas
 * consistent with the chosen model (NT-2) and lets a file's identity include its
 * path (two identical files at different paths get different checksums).
 *
 * `computeHash` (static, sha256(content)) is RETAINED for the unrelated symbol
 * content-hash used by CodeIntelScanner — that is not a delta checksum.
 */

import * as crypto from "crypto";
import { IHashCache } from "./models";
import type { ChecksumStrategy, FileChecksumInput } from "./checksum/models/ChecksumModels";
import { ChecksumStrategyFactory } from "./checksum/ChecksumStrategyFactory";

export class HashCache implements IHashCache {
  private readonly cache = new Map<string, string>();
  private readonly strategy: ChecksumStrategy<FileChecksumInput>;

  /**
   * @param strategy - File checksum strategy (NT-2). Defaults to git-blob for
   *   code; callers in a non-git workspace pass a fallback strategy via the
   *   factory (ChecksumStrategyFactory.forFile(kind, hasGit)).
   */
  constructor(strategy?: ChecksumStrategy<FileChecksumInput>) {
    this.strategy = strategy ?? ChecksumStrategyFactory.forFile("code", true);
  }

  get(filePath: string): string | undefined {
    return this.cache.get(filePath);
  }

  set(filePath: string, hash: string): void {
    this.cache.set(filePath, hash);
  }

  has(filePath: string): boolean {
    return this.cache.has(filePath);
  }

  delete(filePath: string): void {
    this.cache.delete(filePath);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /**
   * Check if file content has changed compared to the cached checksum.
   * @param filePath - Workspace-relative path (used as the checksum path input)
   * @param content - Current file content (UTF-8)
   * @returns true if new/changed; false if unchanged
   */
  hasChanged(filePath: string, content: string): boolean {
    const newHash = this.computeChecksum(filePath, content);
    return this.cache.get(filePath) !== newHash;
  }

  /**
   * Compute the delta checksum for a file and update the cache.
   * @returns the stored checksum
   */
  updateHash(filePath: string, content: string): string {
    const hash = this.computeChecksum(filePath, content);
    this.cache.set(filePath, hash);
    return hash;
  }

  /** Delta checksum via the configured strategy (git-blob or path+content fallback). */
  private computeChecksum(filePath: string, content: string): string {
    // filePath from the watcher is already workspace-relative; normalize to "/".
    const relativePath = filePath.replace(/\\/g, "/");
    return this.strategy.compute({ relativePath, content });
  }

  /**
   * Legacy sha256(content) digest — RETAINED for CodeIntelScanner's symbol
   * content hash (NOT a delta checksum). Do not use for incremental delta.
   */
  static computeHash(content: string): string {
    return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
  }
}
