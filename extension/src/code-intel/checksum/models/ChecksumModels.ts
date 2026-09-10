/**
 * SA4E-241 — Checksum strategy models (NT-2). Model-only file: interfaces + DTOs
 * for the per-source checksum strategies. Kept separate from processing logic
 * (code-standards: models in their own module).
 */

/** Source kinds a checksum strategy can target. */
export type ChecksumSourceKind = "pega-rule" | "code" | "document";

/**
 * Normalized input for a Pega rule checksum (Source A CSV + Source B interpolated).
 * The 3 fields are the basic fields always present on a rule (user-confirmed).
 * ⚠️ Field is `pxUpdateDateTime` (prefix `px`, NOT `pyUpdateDateTime`).
 */
export interface PegaRuleChecksumInput {
  pzInsKey: string;
  pxUpdateDateTime?: string | null;
  pxSaveDateTime?: string | null;
}

/** Input for a file checksum (code non-Pega + document — Source C/D). */
export interface FileChecksumInput {
  /** Workspace-relative path, normalized to forward slashes ("/"). */
  relativePath: string;
  /** File content (UTF-8). */
  content: string;
  /** Absolute path (optional — reserved for future git-state detection). */
  absPath?: string;
}

/**
 * ChecksumStrategy — the per-source checksum contract (NT-2).
 * OCP: adding a new source = adding an implementation, without touching callers.
 */
export interface ChecksumStrategy<TInput> {
  /** @returns lowercase hex digest, deterministic per the source's formula. */
  compute(input: TInput): string;
  /** Source kind (diagnostics / logging). */
  readonly sourceKind: ChecksumSourceKind;
}
