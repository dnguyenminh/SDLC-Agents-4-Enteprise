/**
 * ProxyConfigService — Proxy configuration CRUD.
 * Reads/writes proxy settings from VS Code config + SecretStorage.
 * Credentials stored securely — NEVER exposed to webview.
 */

import * as vscode from "vscode";
import type { ProxyConfig, ProxyCredentials, ProxyMode, ProxyState } from "../models/ProxyModels";

const CONFIG_SECTION = "sdlcAgents";
const SECRET_USERNAME = "sdlcAgents.proxy.username";
const SECRET_PASSWORD = "sdlcAgents.proxy.password";
/** Pre-rename proxy secret keys — READ-ONLY migration/fallback sources. */
const LEGACY_SECRET_USERNAME = "kiroSdlc.proxy.username";
const LEGACY_SECRET_PASSWORD = "kiroSdlc.proxy.password";

/**
 * Manages proxy configuration persistence.
 * Uses VS Code settings for non-sensitive config and SecretStorage for credentials.
 */
export class ProxyConfigService {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Read current proxy config from VS Code global settings */
  getConfig(): ProxyConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
      mode: config.get<string>("proxy.mode", "system") as ProxyMode,
      host: config.get<string>("proxy.host", ""),
      port: config.get<number>("proxy.port", 8080),
      bypass: config.get<string>("proxy.bypass", "localhost,127.0.0.1,::1"),
    };
  }

  /** Read credentials from SecretStorage (returns null if not set) */
  async getCredentials(): Promise<ProxyCredentials | null> {
    const username = await this.readMigratedSecret(SECRET_USERNAME, LEGACY_SECRET_USERNAME);
    const password = await this.readMigratedSecret(SECRET_PASSWORD, LEGACY_SECRET_PASSWORD);
    if (!username || !password) { return null; }
    return { username, password };
  }

  /**
   * Read a secret from the new key, migrating a legacy value on read.
   * When the new key is empty but a pre-rename `kiroSdlc.*` value exists, the
   * value is copied to the new key and returned. A store failure is logged, not
   * thrown, so a credential read never breaks proxy state load.
   * @param newKey Current `sdlcAgents.*` secret key.
   * @param legacyKey Pre-rename `kiroSdlc.*` fallback key.
   * @returns The stored secret, or undefined when neither key is set.
   */
  private async readMigratedSecret(newKey: string, legacyKey: string): Promise<string | undefined> {
    const current = await this.secrets.get(newKey);
    if (current) { return current; }
    const legacy = await this.secrets.get(legacyKey);
    if (!legacy) { return undefined; }
    try { await this.secrets.store(newKey, legacy); }
    catch (err) { console.warn(`Failed to migrate secret ${newKey}:`, (err as Error).message); }
    return legacy;
  }

  /**
   * Build full ProxyState for webview rendering.
   * Password is NEVER included — only hasCredentials boolean.
   */
  async getState(
    detectedUrl: string | null,
    detectedBypass: string | null
  ): Promise<ProxyState> {
    const config = this.getConfig();
    const creds = await this.getCredentials();
    return {
      mode: config.mode,
      host: config.host,
      port: config.port,
      bypass: config.bypass,
      hasCredentials: creds !== null,
      username: creds?.username ?? "",
      detectedProxyUrl: detectedUrl,
      detectedBypass: detectedBypass,
    };
  }

  /** Update proxy mode setting (workspace-scoped) */
  async setMode(mode: ProxyMode): Promise<void> {
    await vscode.workspace.getConfiguration(CONFIG_SECTION)
      .update("proxy.mode", mode, vscode.ConfigurationTarget.Workspace);
  }

  /** Save proxy host, port, bypass settings (workspace-scoped — mỗi project có config riêng) */
  async saveProxy(host: string, port: number, bypass: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update("proxy.host", host, vscode.ConfigurationTarget.Workspace);
    await config.update("proxy.port", port, vscode.ConfigurationTarget.Workspace);
    await config.update("proxy.bypass", bypass, vscode.ConfigurationTarget.Workspace);
  }

  /** Store credentials securely in SecretStorage */
  async saveCredentials(username: string, password: string): Promise<void> {
    await this.secrets.store(SECRET_USERNAME, username);
    await this.secrets.store(SECRET_PASSWORD, password);
  }

  /** Delete credentials from SecretStorage (new + legacy keys) */
  async clearCredentials(): Promise<void> {
    await this.secrets.delete(SECRET_USERNAME);
    await this.secrets.delete(SECRET_PASSWORD);
    await this.secrets.delete(LEGACY_SECRET_USERNAME);
    await this.secrets.delete(LEGACY_SECRET_PASSWORD);
  }
}
