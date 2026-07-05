/**
 * ModelRegistry --- KSA-231
 * Fetches and caches available models from Kiro API with 1-hour TTL.
 */

import * as vscode from "vscode";
import { TokenManager } from "./token-manager";
import { AnthropicAdapter } from "./anthropic-adapter";
import { parseModelsResponse, modelsChanged } from "./model-parser";

export interface KiroModel {
  id: string;
  displayName: string;
  provider: string;
  contextWindow: number;
  capabilities: { chat: boolean; code: boolean; vision: boolean };
  maxOutputTokens?: number;
}

interface ModelCache { models: KiroModel[]; fetchedAt: number; etag: string | null; }

const CACHE_TTL_MS = 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export class ModelRegistry implements vscode.Disposable {
  private cache: ModelCache | null = null;
  private backgroundRefreshInProgress = false;
  private readonly adapter = new AnthropicAdapter();
  private readonly _onModelsChanged = new vscode.EventEmitter<KiroModel[]>();
  readonly onModelsChanged: vscode.Event<KiroModel[]> = this._onModelsChanged.event;
  private readonly tokenManager: TokenManager;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(tokenManager: TokenManager, outputChannel: vscode.OutputChannel) {
    this.tokenManager = tokenManager;
    this.outputChannel = outputChannel;
  }

  async getModels(forceRefresh = false): Promise<KiroModel[]> {
    const now = Date.now();
    if (forceRefresh || !this.cache) { return this.fetchModels(); }
    const cacheAge = now - this.cache.fetchedAt;
    if (cacheAge < STALE_THRESHOLD_MS) { return this.cache.models; }
    if (cacheAge < CACHE_TTL_MS) { this.backgroundRefresh(); return this.cache.models; }
    return this.fetchModels();
  }

  getSelectedModel(): string {
    return vscode.workspace.getConfiguration("kiroSdlc").get<string>("kiroModel", "");
  }

  async setSelectedModel(modelId: string): Promise<void> {
    await vscode.workspace.getConfiguration("kiroSdlc").update("kiroModel", modelId, vscode.ConfigurationTarget.Global);
  }

  dispose(): void { this._onModelsChanged.dispose(); }

  private async fetchModels(): Promise<KiroModel[]> {
    try {
      const port = vscode.workspace.getConfiguration("kiroSdlc").get<number>("mcpServerPort", 9181);
      const url = this.adapter.getModelsEndpointUrl(port);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.cache?.etag) { headers["If-None-Match"] = this.cache.etag; }
      const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 304) { this.cache!.fetchedAt = Date.now(); return this.cache!.models; }
      if (!response.ok) { this.log("WARN", `Models gateway returned ${response.status}`); return this.cache?.models || []; }
      const data = await response.json() as { data?: any[]; models?: any[] };
      const models = parseModelsResponse(data);
      const etag = response.headers.get("ETag") || null;
      const previousModels = this.cache?.models || [];
      this.cache = { models, fetchedAt: Date.now(), etag };
      if (modelsChanged(previousModels, models)) {
        this._onModelsChanged.fire(models);
        this.log("INFO", `Models updated: ${models.length} models`);
      }
      const selected = this.getSelectedModel();
      if (!selected && models.length > 0) {
        const defaultModel = models.find(m => m.capabilities.chat) || models[0];
        await this.setSelectedModel(defaultModel.id);
      }
      return models;
    } catch (err) {
      this.log("ERROR", `Failed to fetch models: ${(err as Error).message}`);
      return this.cache?.models || [];
    }
  }

  private backgroundRefresh(): void {
    if (this.backgroundRefreshInProgress) { return; }
    this.backgroundRefreshInProgress = true;
    this.fetchModels().finally(() => { this.backgroundRefreshInProgress = false; });
  }

  private log(level: string, message: string): void {
    this.outputChannel.appendLine(`[${level}] ModelRegistry: ${message}`);
  }
}
