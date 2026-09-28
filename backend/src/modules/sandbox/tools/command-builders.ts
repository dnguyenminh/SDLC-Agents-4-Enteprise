/**
 * SA4E-6 — Command/config builders for the 5 sandbox tools.
 * Extracted from tool-handlers.ts (SA4E-223 line-count gate, <= 200 lines/file).
 */

import type { ToolResult } from '../../../types/tool.js';
import type { SandboxConfig } from '../../../config/SandboxConfig.js';
import type { SessionCreateConfig } from '../executors/IExecutor.js';
import type { Mount, ResourceLimits } from '../models.js';

export function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false };
}

export function err(code: string, message: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }],
    isError: true,
  };
}

export function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

export function buildSessionConfig(args: Record<string, unknown>, defaults: SandboxConfig): Partial<SessionCreateConfig> {
  const cfg = (args.config as Record<string, unknown>) || {};
  const mode = (args.mode as string) || (cfg.mode as string) || undefined;
  const baseImage = (args.baseImage as string) || (cfg.baseImage as string) || undefined;
  const mountsRaw = (cfg.mounts as Record<string, unknown>[]) || [];
  const mounts: Mount[] = mountsRaw.map((m) => ({
    source: String(m.source),
    target: m.target ? String(m.target) : '/workspace',
    readOnly: m.readOnly === true,
    excludePatterns: Array.isArray(m.excludePatterns) ? (m.excludePatterns as string[]) : undefined,
  }));
  const res = (cfg.resources as Record<string, unknown>) || {};
  const resources: ResourceLimits = {
    memory: (res.memory as string) || '512m',
    cpu: (res.cpu as string) || '1.0',
    disk: (res.disk as string) || '1g',
    pidsLimit: typeof res.pidsLimit === 'number' ? res.pidsLimit : 100,
  };
  return {
    mode: mode as SessionCreateConfig['mode'],
    baseImage,
    mounts,
    resources,
    networkEnabled: cfg.network === true,
    ttl: typeof cfg.ttl === 'number' ? cfg.ttl : defaults.defaultTtl,
    env: asStringRecord(cfg.env) || {},
  };
}

export function buildRunCommand(runtime: string, file: string, args: string[]): string {
  const a = args.join(' ');
  switch (runtime) {
    case 'node':
      return `node ${file} ${a}`.trim();
    case 'python':
      return `python3 ${file} ${a}`.trim();
    case 'tsx':
      return `npx tsx ${file} ${a}`.trim();
    case 'sh':
      return `bash ${file} ${a}`.trim();
    case 'java': {
      if (file.endsWith('.java')) {
        const className = file.replace(/^.*[\\/]/, '').replace(/\.java$/, '');
        return `javac ${file} && java ${className} ${a}`.trim();
      }
      return `gradle run ${a}`.trim();
    }
    default:
      return `node ${file} ${a}`.trim();
  }
}

export function buildInstallCommand(manager: string, packages: string[], flags?: string): string {
  const pkgs = packages.join(' ');
  switch (manager) {
    case 'npm': {
      const npmFlags = flags ? flags + ' ' : '';
      const optimizeFlags = '--no-audit --no-fund ';
      return `npm install ${optimizeFlags}${npmFlags}${pkgs}`.trim();
    }
    case 'pip':
      return `pip install ${pkgs}`.trim();
    case 'apt':
      return `apt-get update && apt-get install -y ${pkgs}`.trim();
    default:
      return `npm install ${pkgs}`.trim();
  }
}

export function buildTestCommand(
  framework: string,
  testPath: string,
  coverage: boolean,
  configFile?: string,
): string {
  const cov = coverage ? '--coverage ' : '';
  const cfg = configFile ? `--config ${configFile} ` : '';
  const tp = testPath ? `${testPath} ` : '';
  switch (framework) {
    case 'vitest':
      return `npx vitest run ${cov}${cfg}${tp}`.trim();
    case 'jest':
      return `npx jest ${cov}${cfg}${tp}`.trim();
    case 'pytest':
      return `python -m pytest ${coverage ? '--cov ' : ''}${tp}`.trim();
    case 'gradle':
      return `gradle test ${testPath ? `--tests ${testPath} ` : ''}`.trim();
    case 'mocha':
      return `npx mocha ${tp}`.trim();
    default:
      return `npx vitest run ${tp}`.trim();
  }
}
