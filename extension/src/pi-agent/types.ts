import type { RetrievalResult } from './context-retrieval/types';

export interface WorkspaceFolder {
  uri: {
    fsPath: string;
  };
}

export interface WorkspaceInfo {
  workspaceFolders?: readonly WorkspaceFolder[];
}

export interface SessionConfig {
  cwd: string;
  sessionManager: unknown;
  contextFiles?: string[];
}

export interface SessionResult {
  session: unknown;
  contextFiles: string[];
  context?: RetrievalResult;
}

export interface WorkspaceRootError {
  code: 'WORKSPACE_NOT_FOUND' | 'INVALID_PATH';
  message: string;
}
