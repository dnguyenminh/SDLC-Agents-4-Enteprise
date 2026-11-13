"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DetectionError = void 0;
exports.cacheResult = cacheResult;
exports.getCachedResult = getCachedResult;
exports.invalidateCache = invalidateCache;
exports.clearAllCache = clearAllCache;
exports.listCachedRuns = listCachedRuns;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const types_1 = require("./types");
// Cache file path: <workspace>/.code-intel/design-gate/
const CACHE_DIR = ".code-intel/design-gate";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes per TDD §1.5
// In-memory cache store
const memoryCache = new Map();
/**
 * Get the workspace root path from environment or cwd.
 */
function getWorkspaceRoot() {
    const envRoot = process.env[types_1.EnvConfig.WORKSPACE_ROOT];
    if (envRoot && envRoot.length > 0) {
        return envRoot;
    }
    return process.cwd();
}
/**
 * Get the cache directory path.
 */
function getCacheDir() {
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
function generateCacheKey(sourcePath, mode) {
    const input = sourcePath + ":" + mode;
    return crypto.createHash("sha256").update(input).digest("hex");
}
/**
 * Check if a cache entry is still valid (within TTL).
 *
 * @param entry - The cache entry to check
 * @returns True if the entry is within TTL
 */
function isCacheValid(entry) {
    return Date.now() - entry.timestamp < CACHE_TTL;
}
/**
 * Save a detection result to the cache (both memory and JSON file).
 *
 * @param sourcePath - The source path that was analyzed
 * @param mode - Detection mode that was used
 * @param result - The detection result to cache
 */
function cacheResult(sourcePath, mode, result) {
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
        writeFileSync(filePath, JSON.stringify(cacheEntry, null, 2));
    }
    catch (error) {
        console.error("Failed to cache result: " + error.message);
        // Continue with memory-only cache if file save fails
        try {
            const cacheKey = generateCacheKey(sourcePath, mode);
            memoryCache.set(cacheKey, {
                timestamp: Date.now(),
                result,
            });
        }
        catch (cacheError) {
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
function getCachedResult(sourcePath, mode) {
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
            }
            catch (error) {
                console.error("Failed to parse cache file: " + error.message);
            }
        }
    }
    catch (error) {
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
function readCacheFile(filePath) {
    try {
        return fs.readFileSync(filePath, "utf-8");
    }
    catch (error) {
        throw new Error("Failed to read cache file: " + error.message);
    }
}
/**
 * Invalidate/clear the cache for a specific sourcePath and mode.
 *
 * @param sourcePath - The source path to invalidate
 * @param mode - Detection mode to invalidate (optional, clears all if omitted)
 */
function invalidateCache(sourcePath, mode) {
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
        }
        else {
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
    }
    catch (error) {
        console.error("Failed to invalidate cache: " + error.message);
    }
}
/**
 * Clear all cache entries (full reset).
 * Used for testing or manual cache cleanup.
 */
function clearAllCache() {
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
    }
    catch (error) {
        console.error("Failed to clear all cache: " + error.message);
    }
}
/**
 * Get all cached run IDs with their timestamps.
 * Useful for audit queries per TDD §4.3.
 *
 * @returns Array of { runId, timestamp } objects sorted by createdAt DESC
 */
function listCachedRuns() {
    const runs = [];
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
                    }
                    catch (error) {
                        // Skip malformed files
                    }
                }
            }
        }
    }
    catch (error) {
        console.error("Failed to list cached runs: " + error.message);
    }
    // Sort by timestamp DESC
    return runs.sort((a, b) => b.timestamp - a.timestamp);
}
//# sourceMappingURL=detection.cache.js.map