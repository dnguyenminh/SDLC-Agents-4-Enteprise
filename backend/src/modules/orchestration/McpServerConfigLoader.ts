/**
 * McpServerConfigLoader — discovers child MCP server configs from orchestration.json and the DB.
 * Extracted from McpClientManager (SA4E-223 line-count gate, <= 200 lines/file).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';
import type { ServerConfig } from './McpConfigService.js';
import { McpServerConfigRepository } from './McpServerConfigRepository.js';

export interface DiscoveredServer {
  name: string;
  config: ServerConfig;
}

export class McpServerConfigLoader {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'McpServerConfigLoader' });
  }

  /** Returns all enabled child servers, file-based entries first, then DB entries. */
  async loadAll(): Promise<DiscoveredServer[]> {
    const [fromFile, fromDb] = await Promise.all([this.loadFileServers(), this.loadDbServers()]);
    return [...fromFile, ...fromDb];
  }

  /** Normalize legacy 'streamable-http' transport type to the current 'httpStream' value. */
  private normalizeTransportType(config: ServerConfig): ServerConfig {
    const type = config.type || config.transportType;
    if (type === 'streamable-http') {
      return { ...config, type: 'httpStream', transportType: 'httpStream' };
    }
    return config;
  }

  private async loadFileServers(): Promise<DiscoveredServer[]> {
    const servers: DiscoveredServer[] = [];
    const workspace = process.env.CODE_INTEL_WORKSPACE || process.cwd();
    const dataDir = process.env.CODE_INTEL_DATA_DIR || '.code-intel';
    const configPath = path.resolve(workspace, dataDir, 'orchestration.json');

    if (!fs.existsSync(configPath)) {
      this.logger.info({ configPath }, 'No orchestration.json found, skipping child servers');
      return servers;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw) as { mcpServers: Record<string, ServerConfig> };
      const entries = Object.entries(config.mcpServers || {});
      this.logger.info({ count: entries.length, source: 'file' }, 'Discovered child MCP servers from orchestration.json');
      for (const [name, serverConfig] of entries) {
        servers.push({ name, config: this.normalizeTransportType(serverConfig) });
      }
    } catch (err) {
      this.logger.error({ err, configPath }, 'Failed to read orchestration.json');
    }
    return servers;
  }

  private async loadDbServers(): Promise<DiscoveredServer[]> {
    const servers: DiscoveredServer[] = [];
    try {
      const dbConfigs = await McpServerConfigRepository.listEnabledServers();
      this.logger.info({ count: dbConfigs.length, source: 'db' }, 'Discovered child MCP servers from DB');
      for (const cfg of dbConfigs) {
        if (cfg.name === 'code-intelligence' || cfg.name === 'code-intel') continue;
        servers.push({ name: cfg.name, config: this.normalizeTransportType(cfg) });
      }
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load DB servers, continuing startup');
    }
    return servers;
  }
}
