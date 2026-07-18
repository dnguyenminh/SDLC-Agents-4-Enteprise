/**
 * File Scanner — Traverses workspace, respects .gitignore, detects language.
 * Produces a list of scannable files with metadata.
 * KSA-191: Added Salesforce extensions + compound extension detection.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AppConfig } from '../config.js';
import { createIgnoreParser, IgnoreParser } from '../parsers/ignore/index.js';

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  language: string;
  contentHash: string;
  sizeBytes: number;
  lineCount: number;
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.java': 'java',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sql': 'sql',
  '.sh': 'bash',
  '.ps1': 'powershell',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.cls': 'apex',
  '.trigger': 'apex',
};

/** Scan workspace and return list of indexable files. */
export function scanWorkspace(config: AppConfig): ScannedFile[] {
  const results: ScannedFile[] = [];
  const ignoreParser = createIgnoreParser(config.workspace);
  traverseDirectory(config.workspace, config, ignoreParser, results);
  return results;
}

/** Scan a single file and return metadata. */
export function scanSingleFile(filePath: string, workspace: string): ScannedFile | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(workspace, filePath).replace(/\\/g, '/');
    const language = detectLanguage(filePath);
    if (!language) return null;

    return {
      absolutePath: filePath,
      relativePath,
      language,
      contentHash: hashContent(content),
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
      lineCount: content.split('\n').length,
    };
  } catch {
    return null;
  }
}

/** Detect language from file extension — supports compound extensions. */
export function detectLanguage(filePath: string): string | null {
  // Check compound extensions first (Salesforce metadata)
  const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');
  if (lowerPath.endsWith('.flow-meta.xml') ||
      lowerPath.endsWith('.object-meta.xml') ||
      lowerPath.endsWith('.field-meta.xml') ||
      lowerPath.endsWith('.js-meta.xml') ||
      lowerPath.endsWith('.component-meta.xml')) {
    return 'salesforce-meta';
  }

  const ext = getExtension(filePath);
  return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

function getExtension(filePath: string): string {
  if (filePath.endsWith('.gradle.kts')) return '.kts';
  return path.extname(filePath).toLowerCase();
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function traverseDirectory(
  dir: string,
  config: AppConfig,
  ignoreParser: IgnoreParser,
  results: ScannedFile[]
): void {
  const entries = safeReadDir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(config.workspace, fullPath).replace(/\\/g, '/');

    if (shouldExclude(relPath, entry.name, config.excludePatterns, ignoreParser)) continue;

    if (entry.isDirectory()) {
      traverseDirectory(fullPath, config, ignoreParser, results);
    } else if (entry.isFile()) {
      const file = processFile(fullPath, relPath, config);
      if (file) results.push(file);
    }
  }
}

function processFile(fullPath: string, relPath: string, config: AppConfig): ScannedFile | null {
  const language = detectLanguage(fullPath);
  if (!language) return null;

  const ext = getExtension(fullPath);
  // Allow through if simple extension matches OR if compound extension detected (salesforce-meta)
  if (!config.includeExtensions.includes(ext) && ext !== '.kts' && language !== 'salesforce-meta') return null;

  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > config.maxFileSize) return null;

    const content = fs.readFileSync(fullPath, 'utf-8');
    if (isBinary(content)) return null;

    return {
      absolutePath: fullPath,
      relativePath: relPath,
      language,
      contentHash: hashContent(content),
      sizeBytes: stat.size,
      lineCount: content.split('\n').length,
    };
  } catch {
    return null;
  }
}

function shouldExclude(
  relPath: string, name: string, excludes: string[], ignoreParser: IgnoreParser
): boolean {
  if (name.startsWith('.') && name !== '.') return true;
  for (const pattern of excludes) {
    if (relPath.includes(pattern) || name === pattern) return true;
  }
  return ignoreParser.shouldIgnore(relPath);
}

function isBinary(content: string): boolean {
  const sample = content.slice(0, 1024);
  const nullCount = (sample.match(/\0/g) || []).length;
  return nullCount > 2;
}

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export interface FileMetaEntry {
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;
}

/**
 * Load file metadata from the .code-intel/file-meta.json sidecar.
 * Returns a map from relative file path → metadata entry.
 */
export function loadFileMetadata(
  workspace: string,
): Record<string, FileMetaEntry> {
  const metaPath = path.join(workspace, '.code-intel', 'file-meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    return JSON.parse(raw) as Record<string, FileMetaEntry>;
  } catch {
    return {};
  }
}
