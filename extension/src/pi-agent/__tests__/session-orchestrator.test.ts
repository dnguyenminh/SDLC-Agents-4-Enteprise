import { describe, it, expect, vi } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator';

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
}));

describe('SessionOrchestrator', () => {
  it('creates session with explicit resource loader', async () => {
    const workspaceResolver = { resolve: vi.fn(() => '/ws') } as any;
    const agentDirResolver = {
      getAgentDir: vi.fn(() => '/agent'),
      isDirectoryExists: vi.fn(() => true),
    } as any;

    const orchestrator = new SessionOrchestrator({ workspaceResolver, agentDirResolver });

    const sdk = {
      SessionManager: {
        inMemory: vi.fn((cwd) => ({ cwd })),
      },
      createAgentSession: vi.fn((cfg) => ({ id: 's1', cfg })),
    };

    const result = await orchestrator.createSession(sdk as any);

    expect(workspaceResolver.resolve).toHaveBeenCalled();
    expect(agentDirResolver.getAgentDir).toHaveBeenCalled();
    expect(sdk.SessionManager.inMemory).toHaveBeenCalledWith('/ws');
    expect(sdk.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/ws',
        sessionManager: { cwd: '/ws' },
        resourceLoader: expect.any(Object),
      })
    );
    expect(result.session).toEqual({ id: 's1', cfg: expect.any(Object) });
    expect(result.resourceLoader).toBeDefined();
  });

  it('aborts on reload failure', async () => {
    const workspaceResolver = { resolve: vi.fn(() => '/ws') } as any;
    const agentDirResolver = {
      getAgentDir: vi.fn(() => '/agent'),
      isDirectoryExists: vi.fn(() => true),
    } as any;

    const orchestrator = new SessionOrchestrator({ workspaceResolver, agentDirResolver });

    // Mock createResourceLoader to return failing loader
    const { createResourceLoader } = await import('../resource-loader.factory');
    const original = createResourceLoader;
    // @ts-ignore
    vi.spyOn(await import('../resource-loader.factory'), 'createResourceLoader').mockReturnValue({
      reload: () => { throw new Error('reload fail'); },
    });

    const sdk = {
      SessionManager: { inMemory: () => ({}) },
      createAgentSession: vi.fn(),
    };

    await expect(orchestrator.createSession(sdk as any)).rejects.toThrow('Resource discovery failed');
  });
});
