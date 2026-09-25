/**
 * SA4E-6 — MCP tool handlers (Facade) for the 5 sandbox tools.
 * Each handler is wrapped with withErrorHandling; results are serialized as a JSON
 * string inside content[0].text (CRITICAL pitfall, TDD §5.7). Business/SandboxError
 * codes are surfaced via a structured error object.
 */

import type { Logger } from 'pino';
import type { ToolHandler, ToolResult } from '../../../types/tool.js';
import { withErrorHandling } from '../../../tool-router/ToolHandlerDecorators.js';
import type { SandboxConfig } from '../../../config/SandboxConfig.js';
import type { ExecutionManager } from '../ExecutionManager.js';
import type { SessionCreateConfig } from '../executors/IExecutor.js';
import { sessionIdValid, type Mount, type ResourceLimits } from '../models.js';
import { SandboxError } from '../errors.js';
import { parseTestResult } from '../parsers/TestResultParser.js';

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false };
}

function err(code: string, message: string): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }],
    isError: true,
  };
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function buildSessionConfig(args: Record<string, unknown>, defaults: SandboxConfig): Partial<SessionCreateConfig> {
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

function buildRunCommand(runtime: string, file: string, args: string[]): string {
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

function buildInstallCommand(manager: string, packages: string[], flags?: string): string {
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

function buildTestCommand(
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

export function createSandboxHandlers(
  manager: ExecutionManager,
  config: SandboxConfig,
  logger: Logger,
): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set(
    'sandbox_session',
    withErrorHandling(logger, 'sandbox_session')(async (args): Promise<ToolResult> => {
      const action = String(args.action || '');
      try {
        if (action === 'create') {
          const session = await manager.createSession(buildSessionConfig(args, config));
          return ok({
            sessionId: session.sessionId,
            mode: session.mode,
            status: session.status,
            baseImage: session.baseImage,
            createdAt: session.createdAt.toISOString(),
            ttl: session.ttl,
          });
        }
        if (action === 'list') {
          return ok({ sessions: manager.listSessions() });
        }
        if (action === 'destroy') {
          const id = String(args.sessionId || '');
          if (!sessionIdValid(id)) return err('SESSION_NOT_FOUND', `Invalid or missing sessionId: ${id}`);
          await manager.destroySession(id);
          return ok({ sessionId: id, destroyed: true });
        }
        return err('INVALID_ACTION', `Unknown action: ${action}`);
      } catch (e) {
        if (e instanceof SandboxError) return err(e.code, e.message);
        return err('INTERNAL_ERROR', (e as Error).message);
      }
    }),
  );

  handlers.set(
    'sandbox_exec',
    withErrorHandling(logger, 'sandbox_exec')(async (args): Promise<ToolResult> => {
      const command = String(args.command || '');
      if (!command) return err('INVALID_ARGUMENT', 'command is required');
      try {
        const result = await manager.execute(
          args.sessionId ? String(args.sessionId) : undefined,
          command,
          {
            workdir: args.workdir ? String(args.workdir) : undefined,
            timeout: typeof args.timeout === 'number' ? args.timeout : config.commandTimeoutDefault,
            env: asStringRecord(args.env),
          },
        );
        return ok(result);
      } catch (e) {
        if (e instanceof SandboxError) return err(e.code, e.message);
        return err('INTERNAL_ERROR', (e as Error).message);
      }
    }),
  );

  handlers.set(
    'sandbox_run',
    withErrorHandling(logger, 'sandbox_run')(async (args): Promise<ToolResult> => {
      const file = String(args.file || '');
      const runtime = String(args.runtime || '');
      const sessionId = String(args.sessionId || '');
      if (!file || !runtime) return err('INVALID_ARGUMENT', 'file and runtime are required');
      if (!sessionIdValid(sessionId)) return err('SESSION_NOT_FOUND', `Invalid or missing sessionId: ${sessionId}`);
      const command = buildRunCommand(runtime, file, Array.isArray(args.args) ? (args.args as string[]) : []);
      try {
        const result = await manager.execute(sessionId, command, {
          timeout: typeof args.timeout === 'number' ? args.timeout : config.commandTimeoutDefault,
        });
        return ok(result);
      } catch (e) {
        if (e instanceof SandboxError) return err(e.code, e.message);
        return err('INTERNAL_ERROR', (e as Error).message);
      }
    }),
  );

  handlers.set(
    'sandbox_install',
    withErrorHandling(logger, 'sandbox_install')(async (args): Promise<ToolResult> => {
      const managerName = String(args.manager || '');
      const packages = Array.isArray(args.packages) ? (args.packages as string[]) : [];
      const sessionId = String(args.sessionId || '');
      if (!['npm', 'pip', 'apt'].includes(managerName)) return err('INVALID_ARGUMENT', `Unsupported manager: ${managerName}`);
      if (packages.length === 0) return err('INVALID_ARGUMENT', 'packages must be a non-empty array');
      if (!sessionIdValid(sessionId)) return err('SESSION_NOT_FOUND', `Invalid or missing sessionId: ${sessionId}`);
      const command = buildInstallCommand(managerName, packages, args.flags ? String(args.flags) : undefined);
      try {
        const result = await manager.execute(sessionId, command, {
          timeout: config.commandTimeoutDefault * 2,
        });
        return ok(result);
      } catch (e) {
        if (e instanceof SandboxError) return err(e.code, e.message);
        return err('INTERNAL_ERROR', (e as Error).message);
      }
    }),
  );

  handlers.set(
    'sandbox_test',
    withErrorHandling(logger, 'sandbox_test')(async (args): Promise<ToolResult> => {
      const framework = String(args.framework || '');
      const sessionId = String(args.sessionId || '');
      if (!['vitest', 'jest', 'pytest', 'gradle', 'mocha'].includes(framework)) {
        return err('INVALID_ARGUMENT', `Unsupported framework: ${framework}`);
      }
      if (!sessionIdValid(sessionId)) return err('SESSION_NOT_FOUND', `Invalid or missing sessionId: ${sessionId}`);
      const command = buildTestCommand(
        framework,
        args.testPath ? String(args.testPath) : '',
        args.coverage === true,
        args.configFile ? String(args.configFile) : undefined,
      );
      try {
        const result = await manager.execute(sessionId, command, {
          timeout: config.commandTimeoutDefault * 2,
        });
        return ok(parseTestResult(framework, result));
      } catch (e) {
        if (e instanceof SandboxError) return err(e.code, e.message);
        return err('INTERNAL_ERROR', (e as Error).message);
      }
    }),
  );

  return handlers;
}
