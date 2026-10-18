/**
 * ProxyMessageHandler — Handles proxy-specific webview messages.
 * Composed by SettingsMessageHandler (delegation pattern).
 * Manages 7 message types for proxy configuration UI.
 */

import * as vscode from "vscode";
import { ProxyConfigService } from "./ProxyConfigService";
import { ProxyDetectionService } from "./ProxyDetectionService";
import { ProxyTestService } from "./ProxyTestService";
import { PowerShellHttpAdapter } from "./PowerShellHttpAdapter";
import { ProxyAgentFactory } from "./ProxyAgentFactory";
import {
  handleDetectSystemProxy,
  invalidateProxyFactory,
} from "./proxy-system-detect";
import type { ProxyMode } from "../models/ProxyModels";

/** All proxy-related message type identifiers */
export const PROXY_MESSAGE_TYPES = [
  "getProxyState",
  "setProxyMode",
  "saveProxy",
  "saveProxyCredentials",
  "clearProxyCredentials",
  "testProxyConnection",
  "detectSystemProxy",
] as const;

/**
 * Handles all proxy webview messages. Composes config, detection,
 * test services and coordinates ProxyAgentFactory invalidation.
 */
export class ProxyMessageHandler {
  private readonly configService: ProxyConfigService;
  private readonly detectionService: ProxyDetectionService;
  private readonly testService: ProxyTestService;

  constructor(
    secrets: vscode.SecretStorage,
    private readonly postMessage: (msg: unknown) => void
  ) {
    this.configService = new ProxyConfigService(secrets);
    this.detectionService = new ProxyDetectionService();
    this.testService = new ProxyTestService(this.detectionService);
  }

  /** Route message to appropriate handler */
  async handle(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case "getProxyState":
        await this.handleGetProxyState();
        break;
      case "setProxyMode":
        await this.handleSetProxyMode(msg.mode as ProxyMode);
        break;
      case "saveProxy":
        await this.handleSaveProxy(msg);
        break;
      case "saveProxyCredentials":
        await this.handleSaveProxyCredentials(msg);
        break;
      case "clearProxyCredentials":
        await this.handleClearProxyCredentials();
        break;
      case "testProxyConnection":
        await this.handleTestProxyConnection(msg);
        break;
      case "detectSystemProxy":
        await this.handleDetectSystemProxy();
        break;
    }
  }

  private async handleGetProxyState(): Promise<void> {
    const detected = this.detectionService.detect();
    const state = await this.configService.getState(
      detected.url,
      detected.bypass
    );
    this.postMessage({ type: "proxyState", ...state });
  }

  private async handleSetProxyMode(mode: ProxyMode): Promise<void> {
    try {
      await this.configService.setMode(mode);
      this.invalidateFactory();
      this.postMessage({ type: "proxyModeChanged", mode, success: true });
      await this.handleGetProxyState();
    } catch (err: unknown) {
      const message = (err as Error).message;
      this.postMessage({
        type: "proxyModeChanged",
        mode,
        success: false,
        error: message,
      });
    }
  }

  private async handleSaveProxy(
    msg: Record<string, unknown>
  ): Promise<void> {
    const host = msg.host as string;
    const port = msg.port as number;
    const bypass = (msg.bypass as string) || "";

    if (!host || host.trim().length === 0) {
      this.postMessage({
        type: "proxySaved",
        success: false,
        error: "Proxy host is required",
      });
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      this.postMessage({
        type: "proxySaved",
        success: false,
        error: "Port must be 1\u201365535",
      });
      return;
    }
    try {
      await this.configService.saveProxy(host.trim(), port, bypass);
      this.invalidateFactory();
      this.postMessage({ type: "proxySaved", success: true });
    } catch (err: unknown) {
      this.postMessage({
        type: "proxySaved",
        success: false,
        error: (err as Error).message,
      });
    }
  }

  private async handleSaveProxyCredentials(
    msg: Record<string, unknown>
  ): Promise<void> {
    const username = msg.username as string;
    const password = msg.password as string;
    if (!username || !password) {
      this.postMessage({
        type: "proxyCredentialsSaved",
        success: false,
        error: "Username and password required",
      });
      return;
    }
    try {
      await this.configService.saveCredentials(username, password);
      this.invalidateFactory();
      this.postMessage({ type: "proxyCredentialsSaved", success: true });
    } catch (err: unknown) {
      this.postMessage({
        type: "proxyCredentialsSaved",
        success: false,
        error: (err as Error).message,
      });
    }
  }

  private async handleClearProxyCredentials(): Promise<void> {
    try {
      await this.configService.clearCredentials();
      this.invalidateFactory();
      this.postMessage({ type: "proxyCredentialsCleared", success: true });
    } catch (err: unknown) {
      this.postMessage({
        type: "proxyCredentialsCleared",
        success: false,
        error: (err as Error).message,
      });
    }
  }

  private async handleTestProxyConnection(
    msg: Record<string, unknown>
  ): Promise<void> {
    const result = await this.testService.testConnection({
      mode: (msg.mode as ProxyMode) || "manual",
      host: (msg.host as string) || "",
      port: (msg.port as number) || 8080,
      username: msg.username as string | undefined,
      password: msg.password as string | undefined,
      testUrl: (msg.testUrl as string) || undefined,
    });
    this.postMessage({ type: "proxyTestResult", ...result });
  }

  private async handleDetectSystemProxy(): Promise<void> {
    return handleDetectSystemProxy(this.detectionService, this.postMessage);
  }

  /** Safely invalidate the proxy agent factory */
  private invalidateFactory(): void {
    invalidateProxyFactory();
  }
}
