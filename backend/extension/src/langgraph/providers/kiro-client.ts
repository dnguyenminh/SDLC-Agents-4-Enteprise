/**
 * KiroClient — KSA-231
 * Main LlmProvider implementation for the Kiro API.
 * Orchestrates TokenManager, AnthropicAdapter, StreamHandler, and ModelRegistry.
 */

import * as vscode from "vscode";
import type { LlmProvider, LlmMessage, LlmOptions, LlmResponse, LlmToolCall } from "../llm-provider";
import type { McpToolDefinition } from "../tool-registry";
import { TokenManager, KiroCredentialError } from "./token-manager";
import { AnthropicAdapter } from "./anthropic-adapter";
import { StreamHandler, KiroStreamError } from "./stream-handler";
import { ModelRegistry } from "./model-registry";
import { sendRequestWithRetry } from "./kiro-http-helpers";
import type { LlmProviderType } from "../llm-provider";

const DEFAULT_MAX_TOKENS = 4096;

export class KiroClient implements LlmProvider {
  readonly type: LlmProviderType = "kiro" as LlmProviderType;

  private readonly tokenManager: TokenManager;
  private readonly adapter: AnthropicAdapter;
  private readonly streamHandler: StreamHandler;
  private readonly modelRegistry: ModelRegistry;
  private readonly outputChannel: vscode.OutputChannel;
  private initialized = false;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
    this.tokenManager = new TokenManager(outputChannel);
    this.adapter = new AnthropicAdapter();
    this.streamHandler = new StreamHandler();
    this.modelRegistry = new ModelRegistry(this.tokenManager, outputChannel);
  }

  async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
    await this.ensureInitialized();
    const result: string[] = [];
    for await (const chunk of this.chatStream(messages, options)) { result.push(chunk); }
    return result.join("");
  }

  async *chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string> {
    await this.ensureInitialized();
    const model = await this.resolveModel(options?.model);
    const region = this.tokenManager.getRegion();
    if (!region) { throw new KiroApiError("No region available."); }

    const requestBody = this.adapter.buildRequestBody(messages, { ...options, model });
    requestBody.stream = true;

    const response = await this.sendRequest(region, model, requestBody, options?.signal);
    this.log("INFO", `Chat request: model=${model}, messages=${messages.length}, stream=true`);

    const startTime = Date.now();
    let tokenCount = 0;
    for await (const chunk of this.streamHandler.processStream(response, options?.signal)) {
      yield chunk;
      tokenCount++;
    }
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    this.log("INFO", `Stream complete: ~${tokenCount} chunks in ${duration}s`);
  }

  async chatWithTools(
    messages: LlmMessage[], tools: McpToolDefinition[], options?: LlmOptions
  ): Promise<LlmResponse> {
    await this.ensureInitialized();
    const model = await this.resolveModel(options?.model);
    const region = this.tokenManager.getRegion();
    if (!region) { throw new KiroApiError("No region available."); }

    const requestBody = this.adapter.buildRequestBody(messages, { ...options, model }, tools);
    requestBody.stream = true;

    const response = await this.sendRequest(region, model, requestBody, options?.signal);
    this.log("INFO", `Chat request (tools+stream): model=${model}, tools=${tools.length}`);

    let textBuffer = "";
    const toolCalls: LlmToolCall[] = [];
    for await (const event of this.streamHandler.processStreamWithToolUse(response, options?.signal)) {
      if (event.type === "text") { textBuffer += event.text; }
      else if (event.type === "tool_use") {
        toolCalls.push({ id: event.id, name: event.name, arguments: event.input });
      }
    }
    if (toolCalls.length > 0) { return { type: "tool_use", toolCalls }; }
    return { type: "text", text: textBuffer };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const status = this.tokenManager.getStatus();
      return status === "active" || status === "refreshing";
    } catch { return false; }
  }

  dispose(): void {
    this.tokenManager.dispose();
    this.modelRegistry.dispose();
    this.outputChannel.appendLine("[INFO] KiroClient: disposed");
  }

  getModelRegistry(): ModelRegistry { return this.modelRegistry; }
  getTokenManager(): TokenManager { return this.tokenManager; }

  getContextWindow(): number {
    // Kiro API uses Claude models — 200K context. Future: read from ModelRegistry per selected model.
    return 200000;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) { return; }
    this.initialized = true;
    await this.tokenManager.initialize();
  }

  private async resolveModel(explicitModel?: string): Promise<string> {
    if (explicitModel) { return explicitModel; }
    const settingsModel = this.modelRegistry.getSelectedModel();
    if (settingsModel) { return settingsModel; }
    const models = await this.modelRegistry.getModels();
    if (models.length > 0) {
      const chatModel = models.find(m => m.capabilities.chat) || models[0];
      return chatModel.id;
    }
    return "";
  }

  private async sendRequest(region: string, model: string, body: any, signal?: AbortSignal): Promise<Response> {
    const port = vscode.workspace.getConfiguration("kiroSdlc").get<number>("mcpServerPort", 9181);
    const url = this.adapter.getEndpointUrl(port);
    return sendRequestWithRetry(
      url, body, model, this.tokenManager, this.adapter, signal,
      (level, msg) => this.log(level, msg)
    );
  }

  private log(level: string, message: string): void {
    this.outputChannel.appendLine(`[${level}] KiroClient: ${message}`);
  }
}

export class KiroApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KiroApiError";
  }
}
