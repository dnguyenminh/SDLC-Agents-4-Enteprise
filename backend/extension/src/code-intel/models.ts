/**
 * Shared types for Code Intelligence module.
 * Maps to backend code_intel_upload tool API contract.
 */

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "variable" | "method" | "property";
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
}

export interface ImportInfo {
  source: string;
  names: string[];
  importType: "named" | "default" | "namespace";
}

export interface ExportInfo {
  name: string;
  kind: string;
  isDefault: boolean;
}

export interface CallSiteInfo {
  callerName: string;
  calleeName: string;
  line: number;
  calleeSource?: string;
}

export interface FileUploadPayload {
  filePath: string;
  language: string;
  hash: string;
  timestamp: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  callSites?: CallSiteInfo[];
}

export interface UploadResult {
  accepted: number;
  skipped: number;
  errors: string[];
}

export interface ITimestampResolver {
  resolve(filePath: string, workspaceRoot: string): Promise<string>;
}

export interface IHashCache {
  get(filePath: string): string | undefined;
  set(filePath: string, hash: string): void;
  has(filePath: string): boolean;
  delete(filePath: string): void;
  clear(): void;
}

export interface ICodeIntelScanner {
  scanFile(filePath: string, content: string): FileUploadPayload | null;
}

export interface ICodeIntelUploader {
  uploadBatch(files: FileUploadPayload[]): Promise<UploadResult>;
}

export interface IOfflineQueue {
  enqueue(files: FileUploadPayload[]): void;
  drain(): Promise<void>;
  readonly pending: number;
}

/** Supported languages and their file extensions */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: [".ts", ".tsx"],
  javascript: [".js", ".jsx"],
  kotlin: [".kt", ".kts"],
  python: [".py"],
};
