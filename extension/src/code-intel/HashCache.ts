/**
 * HashCache — In-memory file hash store for deduplication.
 * Computes SHA-256 of file content; skips upload if hash unchanged.
 */

import * as crypto from "crypto";
import { IHashCache } from "./models";

export class HashCache implements IHashCache {
  private readonly cache = new Map<string, string>();

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
   * Check if file content has changed compared to cached hash.
   * Returns true if content is new/different; false if unchanged.
   */
  hasChanged(filePath: string, content: string): boolean {
    const newHash = HashCache.computeHash(content);
    const cached = this.cache.get(filePath);
    return cached !== newHash;
  }

  /** Compute SHA-256 hash of content and update cache */
  updateHash(filePath: string, content: string): string {
    const hash = HashCache.computeHash(content);
    this.cache.set(filePath, hash);
    return hash;
  }

  /** Compute SHA-256 hex digest of content */
  static computeHash(content: string): string {
    return crypto.createHash("sha256").update(content, "utf-8").digest("hex");
  }
}
