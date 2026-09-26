import * as vscode from 'vscode';
import { WorkspaceInfo, WorkspaceRootError } from './types';
import { logger } from '../logger';

export interface IWorkspaceRootResolver {
  resolve(): string;
  resolveWithInfo(info: WorkspaceInfo): string;
}

export class WorkspaceRootResolver implements IWorkspaceRootResolver {
  private readonly fallbackCwd: string;

  constructor(fallbackCwd: string = process.cwd()) {
    this.fallbackCwd = fallbackCwd;
  }

  resolve(): string {
    const info: WorkspaceInfo = { workspaceFolders: vscode.workspace.workspaceFolders };
    return this.resolveWithInfo(info);
  }

  resolveWithInfo(info: WorkspaceInfo): string {
    const folders = info.workspaceFolders;
    if (!folders || folders.length === 0) {
      logger.warn('Workspace not detected, using fallback directory');
      return this.fallbackCwd;
    }
    const cwdCandidate = folders[0].uri.fsPath;
    if (!this.isAbsolutePath(cwdCandidate)) {
      const err: WorkspaceRootError = {
        code: 'INVALID_PATH',
        message: 'Invalid workspace path',
      };
      logger.error(err.message);
      throw new Error(err.message);
    }
    return cwdCandidate;
  }

  private isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[a-zA-Z]:\\/.test(path);
  }
}
