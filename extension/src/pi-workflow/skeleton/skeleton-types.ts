/**
 * SA4E-360 — Skeleton data contracts (FSD C-360-S1 shapes, TDD §6.2).
 *
 * Session-scoped artifacts only — nothing here is persisted to the index
 * (FSD §4 binding: no new tables). All token numbers are measured with the
 * shipped `estimateTokenCount` (prompt-compressor) — the SAME estimator gate #2
 * uses, so skeleton measurement and gate measurement never diverge (INV-2).
 */

/** Degradation rung used for one file during the skeleton build (FSD §3.4.4). */
export type FallbackMode = 'GRAMMAR' | 'REGEX_SIGNATURES' | 'RAW_HEAD' | 'SKIPPED';

/** Skeleton-loop decision vocabulary (carried verbatim in PI_SKELETON_* events — OI-5). */
export type SkeletonGateDecision = 'PASS' | 'TRUNCATED_PASS' | 'REJECT' | 'DEGRADED_NO_SKELETON';

/** One renderable file slice of the skeleton corpus (TDD §5.2). */
export interface SkeletonPart {
  /** Workspace-relative file path (used as the drop-order tiebreaker). */
  readonly filePath: string;
  /** Module tag used for module-priority truncation (empty string when untagged). */
  readonly module: string;
  /** Rendered outline text for this file (header + symbol lines). */
  readonly content: string;
  /** Kind distinguishes module headers from file parts in drop order (UT-02 step 3). */
  readonly kind?: 'file' | 'module-header';
}

/** Input contract for the skeleton build (FSD C-360-S1 — binding shape). */
export interface SkeletonBuildInput {
  workspaceRoot: string;
  /** 70% share of usable (BR-01/02/03 math) — 19,668 @32k / 40,771 @65k. */
  staticBudget: number;
  /** Module names in KEEP-priority order (first = kept longest; from module metrics). */
  modulePriorityOrder: string[];
}

/** Result contract of the skeleton build (FSD C-360-S1 — binding shape). */
export interface SkeletonBuildResult {
  skeletonContent: string;
  skeletonTokens: number;
  truncationApplied: boolean;
  /** Files served via REGEX_SIGNATURES / RAW_HEAD (UC-360-04 telemetry). */
  fallbackFiles: number;
  /** Files SKIPPED (never fatal — UC-360-01 EF-3, UC-360-04 EF-1/EF-2). */
  skippedFiles: number;
  gateDecision: SkeletonGateDecision;
}

/** Functional-map section carried into gate #2 and tool results (FSD §3.3.4). */
export interface FunctionalMapEntry {
  module: string;
  summary: string;
  keySymbols: string[];
}

export interface FunctionalMapSection {
  entries: FunctionalMapEntry[];
  /** estimateTokenCount of the rendered map section (≤ 1,500 builder default). */
  mapTokens: number;
  /** Rendered map text (the section joined after the layout text). */
  text: string;
}

/** Skeleton + map sections supplied to gate #2 / the injector (TDD §6.2). */
export interface SkeletonSections {
  skeleton: SkeletonBuildResult;
  map?: FunctionalMapSection;
}

/** One located symbol row returned by `code_symbol_locate` (TDD §4.2). */
export interface LocateRow {
  name: string;
  kind: string;
  signature?: string;
  filePath: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  parentSymbol?: string | null;
}

/** Response of SymbolLocator.locate — rows plus optional AF-4 classMethods. */
export interface LocateResponse {
  rows: LocateRow[];
  /** Top 10 indexed method names of the matched class (class matched, method missing). */
  classMethods?: string[];
}

/** Fallback file batch entry sent to `code_extract_signatures` (TDD §4.3). */
export interface FallbackFile {
  /** Workspace-relative OR absolute path (resolved + contained server-side). */
  path: string;
  /** Language detected by the extension's existing language detection. */
  language: string;
}

/** Per-file freshness state from an index stat sweep (FSD §5.5). */
export type FreshnessStatus = 'FRESH' | 'STALE' | 'DEGRADED';

/** Recovery action reported by the freshness checker (PI_SKELETON_INDEX_STALE). */
export type FreshnessAction = 'reindex' | 'degrade' | 'cooldown' | 'none';

/** Result of an index freshness sweep (TDD §5.5). */
export interface FreshnessReport {
  status: FreshnessStatus;
  action: FreshnessAction;
  staleFiles: string[];
  /** Per-file statuses keyed by absolute path (read_method hot path consumes). */
  files: Map<string, FreshnessStatus>;
}

/** Indexed-file descriptor the sweep consumes (no index mtime column — DISC-4). */
export interface IndexedFileInfo {
  relativePath: string;
  /** Index `files.content_hash` when available; undefined ⇒ mtime-change is STALE. */
  contentHash?: string;
}

/** Constant audit value for the OI-5 enriched PI_GATE_DECISION payload. */
export const SKELETON_MEASUREMENT_POINT = 'turn-start gate #2, before createAgentSession';

/** OI-5 enrichment fields added to the shipped PI_GATE_DECISION event. */
export interface SkeletonGateTelemetry {
  decision: string;
  usagePercent: number;
  staticTokens: number;
  escalations: string[];
  skeletonTokens: number;
  truncationApplied: boolean;
  measurementPoint: string;
}
