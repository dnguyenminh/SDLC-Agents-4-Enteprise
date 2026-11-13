"use strict";
/**
 * File System Adapter
 *
 * Provides workspace-scoped file system access for static source analysis.
 *
 * SECURITY-REVIEW.md Condition C3:
 * - All paths must resolve against workspaceRoot only
 * - path.normalize(path.join(workspaceRoot, relativePath)) must startWith(workspaceRoot)
 * - Reject paths containing '..' components
 * - Never allow reading files outside the workspace
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
exports.listSourceFiles = listSourceFiles;
exports.readSourceFile = readSourceFile;
exports.getWorkspaceRoot = getWorkspaceRoot;
exports.isPathSafe = isPathSafe;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const types_1 = require("./types");
Object.defineProperty(exports, "DetectionError", { enumerable: true, get: function () { return types_1.DetectionError; } });
// Maximum number of files to read per detection run (from TDD/DPG)
const MAX_FILES = 10000;
/**
 * Validate that a file path is within the workspace root.
 * Per SECURITY-REVIEW.md Condition C3, paths must not escape the workspace.
 *
 * @param filePath - The file path to validate
 * @param workspaceRoot - The workspace root directory
 * @returns True if the path is within the workspace
 * @throws DetectionError.INVALID_PATH if the path escapes the workspace
 */
function validateFilePath(filePath, workspaceRoot) {
    const resolvedPath = path.resolve(workspaceRoot, filePath);
    const normalizedPath = path.normalize(resolvedPath);
    // Check that the normalized path starts with the workspace root
    // Use path.isAbsolute and compare prefixes
    if (!path.isAbsolute(normalizedPath)) {
        return false;
    }
    const workspaceRootNormalized = path.normalize(workspaceRoot);
    if (!normalizedPath.startsWith(workspaceRootNormalized)) {
        return false;
    }
    // Additional check: reject if the relative path contains '..' components
    // This prevents path traversal attacks even if resolve somehow escapes
    const relative = path.relative(workspaceRootNormalized, normalizedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return false;
    }
    return true;
}
/**
 * List source files in a workspace directory, respecting maxFiles limit.
 *
 * @param sourceRoot - Root path for analysis
 * @param options - Additional options
 * @param options.maxFiles - Maximum files to return (default: 10000)
 * @returns Array of relative file paths within the workspace
 * @throws DetectionError.INVALID_PATH if sourceRoot is not within workspace
 */
async function listSourceFiles(sourceRoot, options = { maxFiles: MAX_FILES }) {
    const workspaceRoot = process.env[types_1.EnvConfig.WORKSPACE_ROOT] || process.cwd();
    const maxFiles = options.maxFiles ?? MAX_FILES;
    // Validate sourceRoot is within workspace
    if (!validateFilePath(sourceRoot, workspaceRoot)) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Source path does not exist or escapes workspace root: ${sourceRoot}`);
    }
    if (!fs.existsSync(sourceRoot)) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Source path does not exist: ${sourceRoot}`);
    }
    const files = [];
    try {
        // Read directory synchronously for simplicity in extension context
        const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });
        for (const entry of entries) {
            if (files.length >= maxFiles) {
                break; // Respect maxFiles limit
            }
            const fullPath = path.join(sourceRoot, entry.name);
            if (entry.isDirectory()) {
                // Recursively read subdirectory, but respect maxFiles
                const subFiles = await listFilesRecursive(fullPath, workspaceRoot, maxFiles - files.length);
                files.push(...subFiles);
            }
            else if (entry.isFile()) {
                // Store relative path from workspace root
                const relativePath = path.relative(workspaceRoot, fullPath);
                files.push(relativePath);
            }
        }
    }
    catch (error) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Failed to list source files: ${error.message}`);
    }
    return files.slice(0, maxFiles);
}
/**
 * Recursively list files in a directory up to a depth/limit.
 */
async function listFilesRecursive(dirPath, workspaceRoot, remaining) {
    const files = [];
    if (remaining <= 0) {
        return files;
    }
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (remaining <= 0) {
                break;
            }
            if (entry.isDirectory()) {
                const subDir = path.join(dirPath, entry.name);
                const subFiles = await listFilesRecursive(subDir, workspaceRoot, remaining - 1);
                files.push(...subFiles);
            }
            else if (entry.isFile()) {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(workspaceRoot, fullPath);
                // Validate the relative path is within workspace
                if (relativePath.startsWith("..")) {
                    continue; // Skip files outside workspace
                }
                files.push(relativePath);
                remaining--;
            }
        }
    }
    catch (error) {
        // Silently skip directories that can't be read
    }
    return files;
}
/**
 * Read a source file's content from the workspace.
 * Path is validated against workspace root per Condition C3.
 *
 * @param filePath - Relative path from workspace root
 * @param workspaceRoot - The workspace root directory
 * @returns File content as string, or throws if path is invalid
 */
function readSourceFile(filePath, workspaceRoot) {
    // Validate path is within workspace
    if (!validateFilePath(filePath, workspaceRoot)) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `File path escapes workspace root: ${filePath}`);
    }
    const resolvedPath = path.resolve(workspaceRoot, filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `File does not exist: ${filePath}`);
    }
    // Additional security: ensure the resolved path still starts with workspaceRoot
    const workspaceRootNorm = path.normalize(workspaceRoot);
    const resolvedNorm = path.normalize(resolvedPath);
    if (!resolvedNorm.startsWith(workspaceRootNorm)) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `File path resolution escaped workspace: ${filePath}`);
    }
    try {
        return fs.readFileSync(resolvedPath, "utf-8");
    }
    catch (error) {
        throw (0, types_1.createDetectionError)(types_1.DetectionError.INVALID_PATH, `Failed to read file ${filePath}: ${error.message}`);
    }
}
/**
 * Get the workspace root from environment or default to process.cwd().
 * Per DPG.md, configuration values come from ENV.
 *
 * @returns Workspace root path string
 */
function getWorkspaceRoot() {
    const envRoot = process.env[types_1.EnvConfig.WORKSPACE_ROOT];
    if (envRoot && envRoot.length > 0) {
        return envRoot;
    }
    return process.cwd();
}
/**
 * Check if a file path is safe (within workspace, no traversal).
 * Quick validation for use before file operations.
 *
 * @param filePath - The file path to check
 * @returns True if the path is safe (within workspace)
 */
function isPathSafe(filePath) {
    try {
        const workspaceRoot = getWorkspaceRoot();
        return validateFilePath(filePath, workspaceRoot);
    }
    catch (error) {
        return false;
    }
}
//# sourceMappingURL=fs.adapter.js.map