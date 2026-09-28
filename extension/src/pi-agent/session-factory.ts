import { IWorkspaceRootResolver } from './workspace-root-resolver';
import { SessionConfig, SessionResult } from './types';
import { logger } from '../logger';
import type { ContextRetriever } from './context-retriever';
import type { RetrievalResult } from './context-retrieval/types';

export interface PiSdk {
  SessionManager: {
    inMemory(cwd: string): unknown;
  };
  createAgentSession(config: SessionConfig): unknown;
}

export interface SessionCreationOptions {
  query?: string;
  topK?: number;
}

export interface ISessionFactory {
  createSession(sdk: PiSdk, options?: SessionCreationOptions): Promise<SessionResult>;
}

export class PiSessionFactory implements ISessionFactory {
  constructor(
    private readonly resolver: IWorkspaceRootResolver,
    private readonly contextRetriever?: ContextRetriever
  ) {}

  async createSession(sdk: PiSdk, options: SessionCreationOptions = {}): Promise<SessionResult> {
    const cwd = this.resolver.resolve();
    logger.info(`Creating Pi session with cwd: ${cwd}`);

    const context = await this.retrieveContext(options);
    const sessionManager = sdk.SessionManager.inMemory(cwd);
    const config: SessionConfig = context
      ? { cwd, sessionManager, contextFiles: context.contextFiles.map((file) => file.path) }
      : { cwd, sessionManager };
    const session = sdk.createAgentSession(config);

    return {
      session,
      contextFiles: config.contextFiles ?? [],
      context,
    };
  }

  private async retrieveContext(options: SessionCreationOptions): Promise<RetrievalResult | undefined> {
    if (!this.contextRetriever || !options.query) return undefined;
    try {
      return await this.contextRetriever.retrieve(options.query, options.topK);
    } catch (err) {
      logger.warn('Context retrieval failed, continuing without context', {
        error: (err as Error).message,
      });
      return undefined;
    }
  }
}
