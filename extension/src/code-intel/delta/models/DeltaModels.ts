/**
 * SA4E-241 — Delta classification models (NT-3: compare by CHECKSUM only).
 * Model-only file (code-standards). The classifier never uses pzInsKey/fqn to
 * compare — the single comparison key is `checksum`.
 */

/** Result of delta classification — keyed by CHECKSUM (NT-3). */
export interface DeltaResult<TItem> {
  /** checksum ∈ existing → skip (already indexed). */
  skip: TItem[];
  /** checksum ∉ existing → fetch (new/changed). */
  fetch: TItem[];
}

/** A candidate to index, carrying its computed checksum (the only compare key). */
export interface IndexCandidate {
  /** The UNIQUE comparison key (unique-in-project, NT-3). */
  checksum: string;
  /** Reference used ONLY to fetch details later (insKey / path) — never compared. */
  ref: unknown;
}
