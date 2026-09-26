import { IWorkspaceRootResolver } from './workspace-root-resolver';
import { SessionConfig, SessionResult } from './types';
import { logger } from '../logger';

export interface PiSdk {
  SessionManager: {
    inMemory(cwd: string): unknown;
  };
  createAgentSession(config: SessionConfig): unknown;
}

export interface ISessionFactory {
  createSession(sdk: PiSdk): SessionResult;
}

export class PiSessionFactory implements ISessionFactory {
  constructor(private readonly resolver: IWorkspaceRootResolver) {}

  createSession(sdk: PiSdk): SessionResult {
    const cwd = this.resolver.resolve();
    logger.info(`Creating Pi session with cwd: ${cwd}`);

    const sessionManager = sdk.SessionManager.inMemory(cwd);
    const config: SessionConfig = { cwd, sessionManager };
    const session = sdk.createAgentSession(config);

    return {
      session,
      contextFiles: [],
    };
  }
}
