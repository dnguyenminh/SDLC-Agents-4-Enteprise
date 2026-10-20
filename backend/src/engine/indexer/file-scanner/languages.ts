/**
 * Language detection for the file scanner (extension maps + compound suffixes).
 * Extracted from file-scanner.ts (BR-18) — no behavior change.
 */

import * as path from 'path';

export const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.java': 'java',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sql': 'sql',
  '.sh': 'bash',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.json': 'json',
  '.toml': 'toml',
  '.cls': 'apex',
  '.trigger': 'apex',
  // ---- SA4E-223: new Salesforce simple extensions ----
  '.apex': 'apex',
  '.soql': 'apex',
  '.page': 'visualforce',
  '.component': 'visualforce',
  '.cmp': 'aura',
  '.app': 'aura',
  '.evt': 'aura',
  '.intf': 'aura',
  '.tokens': 'aura',
  // ---- SA4E-... LWC HTML template support ----
  '.html': 'lwc-html',
  // ---- SA4E-261: Tier B extensions for unified whitelist ----
  '.jsp': 'jsp',
  '.xml': 'xml',
  '.properties': 'properties',
  '.css': 'css',
  '.ps1': 'powershell',
};

/**
 * SA4E-223 — Single source of truth for Salesforce `*-meta.xml` compound suffixes.
 * Used by detectLanguage() so *.xml files are routed to the `salesforce-meta` parser.
 * (Compound-suffix files have ext === '.xml' which is NOT in includeExtensions, but
 * processFile/async-file-scanner exempt `language === 'salesforce-meta'`.)
 */
export const SALESFORCE_META_SUFFIXES: string[] = [
  '.flow-meta.xml', '.object-meta.xml', '.field-meta.xml', '.js-meta.xml', '.component-meta.xml',
  '.flexipage-meta.xml', '.permissionset-meta.xml', '.profile-meta.xml', '.labels-meta.xml',
  '.tab-meta.xml', '.layout-meta.xml', '.report-meta.xml', '.dashboard-meta.xml',
  '.site-meta.xml', '.resource-meta.xml', '.email-meta.xml', '.testsuite-meta.xml',
];

/** Detect language from file extension — supports compound extensions. */
export function detectLanguage(filePath: string): string | null {
  // Check compound extensions first (Salesforce metadata)
  const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');
  if (SALESFORCE_META_SUFFIXES.some(s => lowerPath.endsWith(s))) {
    return 'salesforce-meta';
  }

  const ext = getExtension(filePath);
  return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

export function getExtension(filePath: string): string {
  if (filePath.endsWith('.gradle.kts')) return '.kts';
  return path.extname(filePath).toLowerCase();
}
