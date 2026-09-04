/**
 * SA4E-241 — DeltaClassifier. Partitions candidates into skip/fetch strictly by
 * CHECKSUM (NT-3). Never inspects pzInsKey/fqn/ref for the comparison.
 *   skip  = { c | c.checksum ∈ existing }
 *   fetch = candidates − skip
 */
import type { DeltaResult, IndexCandidate } from "./models/DeltaModels";

/** Classifies index candidates against the backend's `existing` checksum set. */
export class DeltaClassifier {
  /**
   * Partition candidates by checksum membership in `existing`.
   * Totality: skip ∪ fetch = candidates; skip ∩ fetch = ∅ (PBT-06).
   * @param candidates - Items with a computed checksum
   * @param existing - Set of checksums the backend already has
   */
  classify(candidates: IndexCandidate[], existing: ReadonlySet<string>): DeltaResult<IndexCandidate> {
    const skip: IndexCandidate[] = [];
    const fetch: IndexCandidate[] = [];
    for (const c of candidates) {
      // skip-before-fetch: only `checksum` decides (NT-3) — ref is ignored.
      if (existing.has(c.checksum)) {
        skip.push(c);
      } else {
        fetch.push(c);
      }
    }
    return { skip, fetch };
  }

  /**
   * Detect removed items: checksums present in `previousState` but absent from
   * the current candidate set (BR-11).
   * @param candidates - Current candidates
   * @param previousState - Checksums previously indexed
   * @returns checksums that no longer appear in candidates
   */
  detectRemoved(candidates: IndexCandidate[], previousState: ReadonlySet<string>): string[] {
    const current = new Set(candidates.map((c) => c.checksum));
    const removed: string[] = [];
    for (const prev of previousState) {
      if (!current.has(prev)) { removed.push(prev); }
    }
    return removed;
  }
}
