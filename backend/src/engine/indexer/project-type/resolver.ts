/**
 * SA4E-108 — IndexingStrategyResolver.
 * Maps DetectionResult to IndexingConfig for async-file-scanner.
 */
import type { DetectionResult, IndexingConfig } from './models.js';

/** Base excludes always applied regardless of project type */
const BASE_EXCLUDES = ['.git', '.svn', '.hg'];

/** Fallback exclude patterns (mirrors config/index.ts DEFAULT_EXCLUDE) */
const FALLBACK_EXCLUDES = [
  'node_modules', '.git', 'dist', 'build', '.gradle',
  '.idea', '.vscode', '__pycache__', '.venv', 'target',
];

/** Fallback extensions (mirrors config/index.ts DEFAULT_EXTENSIONS) */
export const FALLBACK_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.kt', '.java', '.py',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs',
  // ---- SA4E-223: ensure known Salesforce extensions pass Gate 2 (DISC-1) ----
  '.cls', '.trigger', '.apex', '.soql', '.page', '.component', '.cmp', '.app', '.evt', '.intf', '.tokens', '.pega',
  // ---- LWC HTML template support ----
  '.html',
];

/**
 * Resolves a DetectionResult into scanner-ready IndexingConfig.
 * Merges base excludes with type-specific excludes.
 */
export class IndexingStrategyResolver {

  /** Resolve indexing config from detection result */
  resolve(detection: DetectionResult): IndexingConfig {
    return {
      sourceRoots: detection.source_roots,
      excludePatterns: [...BASE_EXCLUDES, ...detection.exclude_patterns],
      includeExtensions: detection.extensions,
      testRoots: detection.test_roots,
      scanOrder: 'source_first',
    };
  }

  /** Fallback config using current hardcoded defaults (backward compat) */
  getFallback(): IndexingConfig {
    return {
      sourceRoots: [],
      excludePatterns: FALLBACK_EXCLUDES,
      includeExtensions: FALLBACK_EXTENSIONS,
      testRoots: [],
      scanOrder: 'default',
    };
  }
}
