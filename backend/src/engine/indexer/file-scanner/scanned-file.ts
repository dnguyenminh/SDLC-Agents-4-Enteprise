/**
 * ScannedFile shape shared across the file scanner modules.
 * Extracted from file-scanner.ts (BR-18) — no behavior change.
 */

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
