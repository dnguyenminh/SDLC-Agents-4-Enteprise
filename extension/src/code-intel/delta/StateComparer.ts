/**
 * SA4E-241 — StateComparer. Orchestrates bulk-check → classify. On a bulk-check
 * failure it degrades fail-SAFE (E-04/BR-15): treats `existing` as ∅ so every
 * candidate is re-fetched (a full run) rather than skipping — never a false
 * negative. The failure is surfaced to the caller via the returned warning.
 */
import type { DeltaResult, IndexCandidate } from "./models/DeltaModels";
import { DeltaClassifier } from "./DeltaClassifier";
import { BulkCheckClient } from "./BulkCheckClient";

/** Outcome of a state comparison, including any fail-safe warning to show the user. */
export interface CompareOutcome {
  result: DeltaResult<IndexCandidate>;
  /** Non-null when bulk-check failed and a full run was used (E-04). */
  warning: string | null;
}

/** Compares client candidates against backend state via bulk-check. */
export class StateComparer {
  private readonly classifier = new DeltaClassifier();

  constructor(private readonly bulk: BulkCheckClient) {}

  /**
   * Fetch existing checksums, then classify. Fail-safe on bulk-check error.
   * @param projectId - Authenticated project identity
   * @param candidates - Items with computed checksums
   */
  async compare(projectId: string, candidates: IndexCandidate[]): Promise<CompareOutcome> {
    const checksums = candidates.map((c) => c.checksum);
    try {
      const existing = await this.bulk.fetchExisting(projectId, checksums);
      return { result: this.classifier.classify(candidates, existing), warning: null };
    } catch (err) {
      // E-04/BR-15: bulk-check failed → existing = ∅ → full run (no false negative).
      const message = err instanceof Error ? err.message : String(err);
      return {
        result: this.classifier.classify(candidates, new Set<string>()),
        warning: `Bulk-check failed (${message}) — running a full index this time (state preserved).`,
      };
    }
  }
}
