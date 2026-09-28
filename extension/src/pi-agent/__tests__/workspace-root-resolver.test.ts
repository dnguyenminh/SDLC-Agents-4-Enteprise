import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceRootResolver } from '../workspace-root-resolver';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined,
  },
}));

describe('WorkspaceRootResolver', () => {
  const fallback = '/fallback';
  let resolver: WorkspaceRootResolver;

  beforeEach(() => {
    resolver = new WorkspaceRootResolver(fallback);
  });

  it('returns workspace root when available', () => {
    const info = {
      workspaceFolders: [{ uri: { fsPath: '/my/workspace' } }],
    };
    const result = resolver.resolveWithInfo(info as any);
    expect(result).toBe('/my/workspace');
  });

  it('falls back when workspaceFolders undefined', () => {
    const info = { workspaceFolders: undefined };
    const result = resolver.resolveWithInfo(info as any);
    expect(result).toBe(fallback);
  });

  it('falls back when workspaceFolders empty', () => {
    const info = { workspaceFolders: [] };
    const result = resolver.resolveWithInfo(info as any);
    expect(result).toBe(fallback);
  });

  it('throws on relative path', () => {
    const info = {
      workspaceFolders: [{ uri: { fsPath: 'relative/path' } }],
    };
    expect(() => resolver.resolveWithInfo(info as any)).toThrow('Invalid workspace path');
  });

  it('handles Windows absolute path', () => {
    const info = {
      workspaceFolders: [{ uri: { fsPath: 'C:\\Users\\test' } }],
    };
    const result = resolver.resolveWithInfo(info as any);
    expect(result).toBe('C:\\Users\\test');
  });
});
