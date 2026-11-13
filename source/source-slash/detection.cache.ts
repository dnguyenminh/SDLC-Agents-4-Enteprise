/**
 * DetectionCache
 * 
 * Persists detection results between pipeline runs.
 * Uses localStorage in extension context, or JSON file fallback
 * for Node.js environments.
 * 
 * Caching strategy per TDD §1.5:
 * - Cache static detection results < 5 min
 * - Cache key: hash of sourcePath + detection mode
 * - In-memory Map for fast access, JSON file for persistence
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import { DetectionResult, QualityReport, Finding, DetectionConfig, DetectionError, EnvConfig } from "./types";

// Cache file path: <workspace>/.code-intel/design-gate/
const CACHE_DIR = ".code-intel/design-gate";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes per TDD §1.5

// In-memory cache store
const memoryCache = new Map<string, { timestamp: number; result: DetectionResult }>();

/**
 * Get the workspace root path from environment or cwd.
 */
function getWorkspaceRoot(): string {
  const envRoot = process.env[EnvConfig.WORKSPACE_ROOT];
  if (envRoot && envRoot.length > 0) {
    return envRoot;
  }
  return process.cwd();
}

/**
 * Get the cache directory path.
 */
function getCacheDir(): string {
  const workspaceRoot = getWorkspaceRoot();
  return path.join(workspaceRoot, CACHE_DIR);
}

/**
 * Generate a cache key from sourcePath and detection mode.
 * 
 * @param sourcePath - The source path being analyzed
 * @param mode - Detection mode (static/rendered/both)
 * @returns SHA256 hash string used as cache key
 */
function generateCacheKey(sourcePath: string, mode: "static" | "rendered" | "both"): string {
  const input = sourcePath + ":" + mode;
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Check if a cache entry is still valid (within TTL).
 * 
 * @param entry - The cache entry to check
 * @returns True if the entry is within TTL
 */
function isCacheValid(entry: { timestamp: number; result: DetectionResult }): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

/**
 * Save a detection result to the cache (both memory and JSON file).
 * 
 * @param sourcePath - The source path that was analyzed
 * @param mode - Detection mode that was used
 * @param result - The detection result to cache
 */
export function cacheResult(
  sourcePath: string,
  mode: "static" | "rendered" | "both",
  result: DetectionResult
): void {
  try {
    const cacheKey = generateCacheKey(sourcePath, mode);
    const workspaceRoot = getWorkspaceRoot();
    const cacheDir = getCacheDir();

    // Ensure cache directory exists
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Save to memory cache
    memoryCache.set(cacheKey, {
      timestamp: Date.now(),
      result,
    });

    // Save to JSON file for persistence
    const filePath = path.join(cacheDir, cacheKey + ".json");
    const cacheEntry = {
      runId: sourcePath,
      timestamp: Date.now(),
      result,
    };
    fs.writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2));
  } catch (error: any) {
    console.error("Failed to cache result: " + error.message);
    // Continue with memory-only cache if file save fails
    try {
      const cacheKey = generateCacheKey(sourcePath, mode);
      memoryCache.set(cacheKey, {
        timestamp: Date.now(),
        result,
      });
    } catch (cacheError: any) {
      console.error("Memory cache also failed: " + cacheError.message);
    }
  }
}

/**
 * Get a cached detection result if available and within TTL.
 * 
 * @param sourcePath - The source path that was analyzed
 * @param mode - Detection mode that was used
 * @returns Cached DetectionResult if valid cache exists, undefined otherwise
 */
export function getCachedResult(
  sourcePath: string,
  mode: "static" | "rendered" | "both"
): DetectionResult | undefined {
  try {
    const cacheKey = generateCacheKey(sourcePath, mode);

    // Check memory cache first (fastest)
    const memoryEntry = memoryCache.get(cacheKey);
    if (memoryEntry && isCacheValid(memoryEntry)) {
      return memoryEntry.result;
    }

    // Fall back to JSON file cache
    const workspaceRoot = getWorkspaceRoot();
    const cacheDir = getCacheDir();
    const filePath = path.join(cacheDir, cacheKey + ".json");

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = JSON.parse(readCacheFile(filePath));
        if (isCacheValid(fileContent)) {
          // Update memory cache
          memoryCache.set(cacheKey, {
            timestamp: fileContent.timestamp,
            result: fileContent.result,
          });
          return fileContent.result;
        }
      } catch (error: any) {
        console.error("Failed to parse cache file: " + error.message);
      }
    }
  } catch (error: any) {
    console.error("Cache read error: " + error.message);
  }

  return undefined;
}

/**
 * Read a cache file's content.
 * 
 * @param filePath - Path to the cache file
 * @returns File content as string
 */
function readCacheFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error: any) {
    throw new Error("Failed to read cache file: " + error.message);
  }
}

/**
 * Invalidate/clear the cache for a specific sourcePath and mode.
 * 
 * @param sourcePath - The source path to invalidate
 * @param mode - Detection mode to invalidate (optional, clears all if omitted)
 */
export function invalidateCache(
  sourcePath: string,
  mode?: "static" | "rendered" | "both"
): void {
  try {
    const workspaceRoot = getWorkspaceRoot();
    const cacheDir = getCacheDir();

    if (mode) {
      // Invalidate specific mode cache
      const cacheKey = generateCacheKey(sourcePath, mode);
      memoryCache.delete(cacheKey);

      // Delete JSON file if it exists
      const filePath = path.join(cacheDir, cacheKey + ".json");
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } else {
      // Clear entire cache
      memoryCache.clear();

      // Delete all JSON files in cache directory
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            fs.unlinkSync(path.join(cacheDir, file));
          }
        }
      }
    }
  } catch (error: any) {
    console.error("Failed to invalidate cache: " + error.message);
  }
}

/**
 * Clear all cache entries (full reset).
 * Used for testing or manual cache cleanup.
 */
export function clearAllCache(): void {
  try {
    memoryCache.clear();

    const workspaceRoot = getWorkspaceRoot();
    const cacheDir = getWorkspaceRoot();

    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          fs.unlinkSync(path.join(cacheDir, file));
        }
      }
    }
  } catch (error: any) {
    console.error("Failed to clear all cache: " + error.message);
  }
}

/**
 * Get all cached run IDs with their timestamps.
 * Useful for audit queries per TDD §4.3.
 * 
 * @returns Array of { runId, timestamp } objects sorted by createdAt DESC
 */
export function listCachedRuns(): Array<{ runId: string; timestamp: number }> {
  const runs: Array<{ runId: string; timestamp: number }> = [];

  try {
    // Check memory cache entries
    memoryCache.forEach((entry, key) => {
      // Extract runId from cache key (first part before ':')
      const parts = key.split(":");
      if (parts.length > 0) {
        runs.push({ runId: parts[0], timestamp: entry.timestamp });
      }
    });

    // Check JSON files in cache directory
    const workspaceRoot = getWorkspaceRoot();
    const cacheDir = getCacheDir();

    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const filePath = path.join(cacheDir, file);
            const content = JSON.parse(readCacheFile(filePath));
            runs.push({ runId: content.runId || file.replace(".json", ""), timestamp: content.timestamp || 0 });
          } catch (error: any) {
            // Skip malformed files
          }
        }
      }
    }
  } catch (error: any) {
    console.error("Failed to list cached runs: " + error.message);
  }

  // Sort by timestamp DESC
  return runs.sort((a, b) => b.timestamp - a.timestamp);
}

// Export the enum for use in tests
export { DetectionError };