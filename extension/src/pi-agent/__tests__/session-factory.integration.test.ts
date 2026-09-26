import { describe, it, expect } from 'vitest';
import { WorkspaceRootResolver } from '../workspace-root-resolver';
import { PiSessionFactory } from '../session-factory';

describe('PiSessionFactory integration', () => {
  it('uses resolver output as cwd', () => {
    const resolver = { resolve: () => '/fallback' } as any;
    const factory = new PiSessionFactory(resolver);

    const sdk = {
      SessionManager: {
        inMemory: (cwd: string) => ({ type: 'inMemory', cwd }),
      },
      createAgentSession: (cfg: any) => ({ sessionId: 'test', cfg }),
    };

    const result = factory.createSession(sdk as any);
    expect(result.session.sessionId).toBe('test');
    expect(result.session.cfg.cwd).toBe('/fallback');
  });
});
