/**
 * ProxyAgentFactory — Singleton factory for undici ProxyAgent.
 * Creates dispatcher based on current proxy configuration.
 * Invalidated and rebuilt on config change (BR-13: no restart needed).
 */

import { ProxyAgent } from "undici";
import type { Dispatcher } from "undici";
import type { ProxyConfig, ProxyCredentials } from "../models/ProxyModels";
import type { ProxyConfigService } from "./ProxyConfigService";
import type { ProxyDetectionService } from "./ProxyDetectionService";
import { VscodeProxyResolverService } from "./VscodeProxyResolverService";

/** Module-level singleton instance */
let instance: ProxyAgentFactory | null = null;

/**
 * Manages undici ProxyAgent lifecycle. Ensures all HttpClient instances
 * share the same agent and supports instant reconfiguration.
 * Proxy resolution is per-URL (supports PAC/WPAD routing via VS Code).
 */
export class ProxyAgentFactory {
  private readonly resolver: VscodeProxyResolverService;
  private readonly agentCache = new Map<string, ProxyAgent>();
  private currentAgent: ProxyAgent | null = null;
  private currentUri: string | null = null;

  private constructor(
    private readonly configService: ProxyConfigService,
    private readonly detectionService: ProxyDetectionService
  ) {
    this.resolver = new VscodeProxyResolverService(detectionService);
  }

  /** Initialize singleton (called at extension activation) */
  static initialize(
    configService: ProxyConfigService,
    detectionService: ProxyDetectionService
  ): void {
    instance = new ProxyAgentFactory(configService, detectionService);
  }

  /** Get the singleton instance */
  static getInstance(): ProxyAgentFactory {
    if (!instance) {
      throw new Error("ProxyAgentFactory not initialized");
    }
    return instance;
  }

  /** Expose config for bypass checking by HttpClient */
  getConfig(): ProxyConfig {
    return this.configService.getConfig();
  }

  /**
   * Get the current dispatcher for fetch() calls.
   * Resolves proxy per-URL (system mode) to support PAC/WPAD routing.
   * Returns ProxyAgent if proxied, undefined for direct connection.
   * @param targetUrl - Absolute URL the request is going to
   */
  async getDispatcher(targetUrl: string): Promise<Dispatcher | undefined> {
    const config = this.configService.getConfig();
    if (config.mode === "none") { return undefined; }
    // Curl mode bypasses undici entirely — HttpClient uses CurlTransport directly
    if (config.mode === "curl") { return undefined; }
    // PowerShell mode bypasses undici entirely — HttpClient uses PowerShellTransport directly
    if (config.mode === "powershell") { return undefined; }

    let proxyUrl: string | null;
    if (config.mode === "manual") {
      if (!config.host) { return undefined; }
      proxyUrl = `http://${config.host}:${config.port}`;
    } else {
      // mode === "system" — resolve via VS Code's own proxy resolution (per-URL)
      const resolved = await this.resolver.resolveByUrl(targetUrl);
      proxyUrl = resolved.url ?? null;
    }
    if (!proxyUrl) { return undefined; }

    // Cache one agent per resolved proxy URL (PAC/WPAD may return different
    // proxies for different targets).
    let agent = this.agentCache.get(proxyUrl);
    if (!agent) {
      agent = await this.buildAgent(proxyUrl);
      this.agentCache.set(proxyUrl, agent);
    }
    this.currentAgent = agent;
    this.currentUri = proxyUrl;
    return agent;
  }

  /**
   * Check if a target URL should bypass the proxy.
   * Supports wildcards: *.domain.com matches sub.domain.com
   */
  shouldBypass(targetUrl: string, bypassList: string): boolean {
    if (!bypassList || !targetUrl) { return false; }
    try {
      const hostname = new URL(targetUrl).hostname.toLowerCase();
      const entries = bypassList.split(",").map((e) => e.trim().toLowerCase());
      return entries.some((entry) => this.matchBypassEntry(hostname, entry));
    } catch {
      return false;
    }
  }

  /** Invalidate cached agents (called after config save) */
  invalidate(): void {
    for (const agent of this.agentCache.values()) {
      agent.close();
    }
    this.agentCache.clear();
    this.currentAgent?.close();
    this.currentAgent = null;
    this.currentUri = null;
  }

  /** Create a temporary ProxyAgent for testing (not cached) */
  createTemporaryAgent(
    proxyUrl: string,
    credentials?: ProxyCredentials
  ): ProxyAgent {
    const opts: Record<string, unknown> = {
      uri: proxyUrl,
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
      connectTimeout: 15_000,
    };
    if (credentials) {
      opts.token = this.buildBasicToken(credentials);
    }
    return new ProxyAgent(opts as unknown as ConstructorParameters<typeof ProxyAgent>[0]);
  }

  /** Reset singleton (for testing) */
  static reset(): void {
    instance?.invalidate();
    instance = null;
  }

  private async buildAgent(proxyUrl: string): Promise<ProxyAgent> {
    const creds = await this.configService.getCredentials();
    const opts: Record<string, unknown> = {
      uri: proxyUrl,
      // Aligned with the OpenAI SDK 10-minute timeout so proxied LLM requests
      // are not aborted by undici before the SDK's own timeout elapses (SA4E-339).
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
      connectTimeout: 15_000,
    };
    if (creds) {
      opts.token = this.buildBasicToken(creds);
    }
    return new ProxyAgent(
      opts as unknown as ConstructorParameters<typeof ProxyAgent>[0]
    );
  }

  private buildBasicToken(creds: ProxyCredentials): string {
    const encoded = Buffer.from(
      `${creds.username}:${creds.password}`
    ).toString("base64");
    return `Basic ${encoded}`;
  }

  private matchBypassEntry(hostname: string, entry: string): boolean {
    if (entry === hostname) { return true; }
    // Wildcard: *.domain.com or .domain.com
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // .domain.com
      return hostname.endsWith(suffix);
    }
    if (entry.startsWith(".")) {
      return hostname.endsWith(entry);
    }
    return false;
  }
}
