/**
 * McpConfigService — CRUD operations for child MCP server configs.
 * Persists to .code-intel/orchestration.json with atomic writes.
 * NOT an MCP tool — exposed via REST API only.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from 'pino';

export interface ServerConfig {
  name?: string;
  url?: string;
  type?: string;
  transportType?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
}

export interface ServerInfo {
  name: string;
  status: 'connected' | 'disconnected' | 'disabled';
  tools: number;
  transport: string;
  url?: string;
  command?: string;
}

interface OrchestrationConfig {
  mcpServers: Record<string, ServerConfig>;
}

export interface ValidationError {
  field: string;
  message: string;
}

const RESERVED_NAME = 'code-intelligence';

export class McpConfigService {
  private configPath: string;
  private logger?: Logger;

  constructor(
    private workspace: string,
    private dataDir: string,
    logger?: Logger
  ) {
    this.configPath = path.resolve(workspace, dataDir, 'orchestration.json');
    this.logger = logger;
  }

  listServers(): ServerConfig[] {
    const config = this.readConfig();
    return Object.entries(config.mcpServers).map(([name, cfg]) => ({
      ...cfg, name,
    }));
  }

  getServer(name: string): ServerConfig | null {
    const config = this.readConfig();
    const server = config.mcpServers[name];
    return server ? { ...server, name } : null;
  }

  addServer(name: string, serverConfig: ServerConfig): void {
    if (name === RESERVED_NAME) {
      throw new ConfigError(403, 'Cannot modify reserved server: code-intelligence');
    }
    const config = this.readConfig();
    if (config.mcpServers[name]) {
      throw new ConfigError(409, `Server "${name}" already exists`);
    }
    const errors = this.validateConfig(serverConfig);
    if (errors.length > 0) {
      throw new ConfigError(400, 'Validation failed', errors);
    }
    config.mcpServers[name] = this.cleanConfig(serverConfig);
    this.writeConfig(config);
    this.logger?.info({ name }, 'MCP server config added');
  }

  updateServer(name: string, serverConfig: Partial<ServerConfig>): void {
    if (name === RESERVED_NAME) {
      throw new ConfigError(403, 'Cannot modify reserved server: code-intelligence');
    }
    const config = this.readConfig();
    if (!config.mcpServers[name]) {
      throw new ConfigError(404, `Server "${name}" not found`);
    }
    const merged = { ...config.mcpServers[name], ...serverConfig };
    const errors = this.validateConfig(merged);
    if (errors.length > 0) {
      throw new ConfigError(400, 'Validation failed', errors);
    }
    config.mcpServers[name] = this.cleanConfig(merged);
    this.writeConfig(config);
    this.logger?.info({ name }, 'MCP server config updated');
  }

  removeServer(name: string): void {
    if (name === RESERVED_NAME) {
      throw new ConfigError(403, 'Cannot modify reserved server: code-intelligence');
    }
    const config = this.readConfig();
    if (!config.mcpServers[name]) {
      throw new ConfigError(404, `Server "${name}" not found`);
    }
    delete config.mcpServers[name];
    this.writeConfig(config);
    this.logger?.info({ name }, 'MCP server config removed');
  }

  private readConfig(): OrchestrationConfig {
    if (!fs.existsSync(this.configPath)) {
      return { mcpServers: {} };
    }
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    return JSON.parse(raw) as OrchestrationConfig;
  }

  private writeConfig(config: OrchestrationConfig): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(config, null, 2);
    const tmpPath = this.configPath + '.tmp';
    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, this.configPath);
  }

  private validateConfig(config: ServerConfig): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!config.url && !config.command) {
      errors.push({ field: 'url/command', message: 'Either url or command is required' });
    }
    // type is optional — inferred: command present = stdio, url present = httpStream
    return errors;
  }

  private cleanConfig(config: ServerConfig): ServerConfig {
    const { name: _, ...rest } = config;
    return rest;
  }
}

export class ConfigError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly validationErrors?: ValidationError[]
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}
