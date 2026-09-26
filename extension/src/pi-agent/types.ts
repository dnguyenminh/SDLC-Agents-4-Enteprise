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
}

export interface SessionResult {
  session: unknown;
  contextFiles: string[];
}

export interface WorkspaceRootError {
  code: 'WORKSPACE_NOT_FOUND' | 'INVALID_PATH';
  message: string;
}
