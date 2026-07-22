/**
 * FileChangeWatcher — Watches file saves/creates/deletes and
 * triggers incremental re-index with 1s debounce.
 */

import * as vscode from "vscode";
import * as path from "path";
import { CodeIntelScanner } from "./CodeIntelScanner";
import { CodeIntelUploader } from "./CodeIntelUploader";
import { HashCache } from "./HashCache";
import { TimestampResolver } from "./TimestampResolver";
import { OfflineQueue } from "./OfflineQueue";
import { LANGUAGE_EXTENSIONS, FileUploadPayload } from "./models";

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 1000;

export class FileChangeWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private allExtensions: Set<string>;

  constructor(
    private readonly workspaceRoot: string,
    private readonly scanner: CodeIntelScanner,
    private readonly uploader: CodeIntelUploader,
    private readonly hashCache: HashCache,
    private readonly timestampResolver: TimestampResolver,
    private readonly offlineQueue: OfflineQueue,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    this.allExtensions = this.buildExtensionSet();
  }

  /** Start watching for file changes */
  activate(context: vscode.ExtensionContext): void {
    const onSave = vscode.workspace.onDidSaveTextDocument(
      (doc) => this.onFileChange(doc.uri)
    );
    const onCreate = vscode.workspace.onDidCreateFiles(
      (e) => e.files.forEach((uri) => this.onFileChange(uri))
    );
    const onDelete = vscode.workspace.onDidDeleteFiles(
      (e) => e.files.forEach((uri) => this.onFileDelete(uri))
    );
    this.disposables.push(onSave, onCreate, onDelete);
    context.subscriptions.push(this);
  }

  /** Handle file change with debounce */
  private onFileChange(uri: vscode.Uri): void {
    const filePath = this.getRelativePath(uri);
    if (!filePath || !this.isSupportedFile(filePath)) { return; }
    this.debounce(filePath, () => this.processFile(filePath));
  }

  /** Handle file deletion — notify backend */
  private onFileDelete(uri: vscode.Uri): void {
    const filePath = this.getRelativePath(uri);
    if (!filePath) { return; }
    this.hashCache.delete(filePath);
  }

  /** Process a single file: hash check → scan → upload */
  private async processFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.workspaceRoot, filePath);
      const fs = await import("fs/promises");
      const content = await fs.readFile(fullPath, "utf-8");

      if (!this.hashCache.hasChanged(filePath, content)) { return; }

      const payload = this.scanner.scanFile(filePath, content);
      if (!payload) { return; }

      payload.timestamp = await this.timestampResolver.resolve(filePath, this.workspaceRoot);
      this.hashCache.updateHash(filePath, content);
      await this.uploadOrQueue([payload]);
    } catch (err: any) {
      this.outputChannel.appendLine(`[CodeIntel] Error processing ${filePath}: ${err.message}`);
    }
  }

  /** Upload files or queue them if backend unreachable */
  private async uploadOrQueue(files: FileUploadPayload[]): Promise<void> {
    try {
      await this.uploader.uploadBatch(files);
    } catch (err) {
      console.debug(`[FileChangeWatcher] upload failed, queuing for offline: ${(err as Error).message}`);
      this.offlineQueue.enqueue(files);
    }
  }

  /** Debounce file processing by 1 second */
  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) { clearTimeout(existing); }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, DEBOUNCE_MS);
    this.debounceTimers.set(key, timer);
  }

  /** Get relative path from workspace root */
  private getRelativePath(uri: vscode.Uri): string | null {
    const full = uri.fsPath;
    if (!full.startsWith(this.workspaceRoot)) { return null; }
    return path.relative(this.workspaceRoot, full).replace(/\\/g, "/");
  }

  /** Check if file extension is supported for indexing */
  private isSupportedFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.allExtensions.has(ext);
  }

  /** Build set of all supported extensions */
  private buildExtensionSet(): Set<string> {
    const exts = new Set<string>();
    for (const arr of Object.values(LANGUAGE_EXTENSIONS)) {
      arr.forEach((e) => exts.add(e));
    }
    return exts;
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) { clearTimeout(timer); }
    this.debounceTimers.clear();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

