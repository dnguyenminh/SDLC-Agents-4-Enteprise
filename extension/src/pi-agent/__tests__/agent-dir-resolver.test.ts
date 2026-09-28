import { describe, it, expect } from 'vitest';
import { DefaultAgentDirResolver } from '../agent-dir-resolver';
import * as os from 'os';
import * as path from 'path';

describe('DefaultAgentDirResolver', () => {
  it('returns default agent dir when none provided', () => {
    const resolver = new DefaultAgentDirResolver();
    const dir = resolver.getAgentDir();
    expect(dir).toBe(path.join(os.homedir(), '.pi', 'agent'));
  });

  it('returns custom agent dir', () => {
    const custom = '/custom/agent';
    const resolver = new DefaultAgentDirResolver(custom);
    expect(resolver.getAgentDir()).toBe(path.normalize(custom));
  });

  it('expands ~ to home dir', () => {
    const resolver = new DefaultAgentDirResolver('~/.pi/agent');
    expect(resolver.getAgentDir()).toBe(path.join(os.homedir(), '.pi', 'agent'));
  });

  it('isDirectoryExists returns false for non-existent path', () => {
    const resolver = new DefaultAgentDirResolver();
    expect(resolver.isDirectoryExists('/definitely/not/exist/12345')).toBe(false);
  });
});
