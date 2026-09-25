/**
 * SA4E-108 — IndexingStrategyResolver.
 * Maps DetectionResult to IndexingConfig for async-file-scanner.
 */
import type { DetectionResult, IndexingConfig } from './models.js';
import { UNIFIED_EXTENSIONS_WITH_DOT } from '../../../config/unified-extensions.js';

/** Base excludes always applied regardless of project type */
const BASE_EXCLUDES = ['.git', '.svn', '.hg'];

/** Fallback exclude patterns (mirrors config/index.ts DEFAULT_EXCLUDE) */
const FALLBACK_EXCLUDES = [
  'node_modules', '.git', 'dist', 'build', '.gradle',
  '.idea', '.vscode', '__pycache__', '.venv', 'target',
];

/** Fallback extensions aligned with unified whitelist (SA4E-261) */
export const FALLBACK_EXTENSIONS = [...UNIFIED_EXTENSIONS_WITH_DOT];

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
