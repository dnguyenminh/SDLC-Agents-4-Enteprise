import * as fs from 'fs';
import { IWorkspaceRootResolver } from './workspace-root-resolver';
import { IAgentDirResolver } from './agent-dir-resolver';
import { createResourceLoader, reloadResourceLoader, logDiagnostics } from './resource-loader.factory';
import { logger } from '../logger';

export interface PiSdk {
  SessionManager: {
    inMemory(cwd: string): unknown;
  };
  createAgentSession(config: {
    cwd: string;
    sessionManager: unknown;
    resourceLoader?: unknown;
  }): unknown;
}

export interface SessionOrchestratorOptions {
  workspaceResolver: IWorkspaceRootResolver;
  agentDirResolver: IAgentDirResolver;
}

export class SessionOrchestrator {
  constructor(private readonly opts: SessionOrchestratorOptions) {}

  async createSession(sdk: PiSdk): Promise<{
    session: unknown;
    resourceLoader: unknown;
    diagnostics: string[];
  }> {
    let cwd = this.opts.workspaceResolver.resolve();

    // Validate cwd
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      const msg = `Workspace root not found: ${cwd}`;
      logger.warn(msg);
      // Fallback to process.cwd() as per business rule
      const fallback = process.cwd();
      logger.info('Falling back to process.cwd()', { fallback });
      cwd = fallback;
    }

    const agentDir = this.opts.agentDirResolver.getAgentDir();

    // Validate agentDir existence (warning only)
    if (!this.opts.agentDirResolver.isDirectoryExists(agentDir)) {
      logger.warn('agentDir does not exist, discovery may be limited', { agentDir });
    }

    const loader = createResourceLoader({ cwd, agentDir });

    // Reload before session creation
    await reloadResourceLoader(loader);

    // Log diagnostics
    logDiagnostics(loader);

    const sessionManager = sdk.SessionManager.inMemory(cwd);
    const config = {
      cwd,
      sessionManager,
      resourceLoader: loader,
    };

    const session = sdk.createAgentSession(config);

    logger.info('Pi session created with explicit ResourceLoader', {
      cwd,
      agentDir,
      hasLoader: !!loader,
    });

    const diagnostics = typeof loader.getDiagnostics === 'function' ? loader.getDiagnostics() ?? [] : [];

    return {
      session,
      resourceLoader: loader,
      diagnostics,
    };
  }
}
