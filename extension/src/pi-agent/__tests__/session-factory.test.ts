import { describe, it, expect, vi } from 'vitest';
import { PiSessionFactory } from '../session-factory';
import { WorkspaceRootResolver } from '../workspace-root-resolver';

describe('PiSessionFactory', () => {
  it('creates session with cwd and sessionManager', () => {
    const resolver = { resolve: vi.fn(() => '/ws') } as any;
    const mockSdk = {
      SessionManager: {
        inMemory: vi.fn((cwd) => ({ cwd })),
      },
      createAgentSession: vi.fn((cfg) => ({ id: 's1', cfg })),
    };

    const factory = new PiSessionFactory(resolver);
    const result = factory.createSession(mockSdk as any);

    expect(mockSdk.SessionManager.inMemory).toHaveBeenCalledWith('/ws');
    expect(mockSdk.createAgentSession).toHaveBeenCalledWith({
      cwd: '/ws',
      sessionManager: { cwd: '/ws' },
    });
    expect(result.session).toEqual({ id: 's1', cfg: expect.any(Object) });
  });
});
