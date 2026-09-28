import { describe, it, expect, vi } from 'vitest';
import { PiSessionFactory } from '../session-factory';
import type { ContextRetriever } from '../context-retriever';
import type { RetrievalResult } from '../context-retrieval/types';

function mockSdk() {
  return {
    SessionManager: {
      inMemory: vi.fn((cwd) => ({ cwd })),
    },
    createAgentSession: vi.fn((cfg) => ({ id: 's1', cfg })),
  };
}

function fakeRetriever(result: RetrievalResult, failing = false) {
  return {
    retrieve: vi.fn(async () => {
      if (failing) throw new Error('retrieval down');
      return result;
    }),
  } as unknown as ContextRetriever;
}

describe('PiSessionFactory', () => {
  it('creates session with cwd and sessionManager', async () => {
    const resolver = { resolve: vi.fn(() => '/ws') } as any;
    const sdk = mockSdk();

    const factory = new PiSessionFactory(resolver);
    const result = await factory.createSession(sdk as any);

    expect(sdk.SessionManager.inMemory).toHaveBeenCalledWith('/ws');
    expect(sdk.createAgentSession).toHaveBeenCalledWith({
      cwd: '/ws',
      sessionManager: { cwd: '/ws' },
    });
    expect(result.session).toEqual({ id: 's1', cfg: expect.any(Object) });
  });

  it('TC-801: session works unchanged without context retriever', async () => {
    const resolver = { resolve: vi.fn(() => '/ws') } as any;
    const sdk = mockSdk();

    const factory = new PiSessionFactory(resolver);
    const result = await factory.createSession(sdk as any, { query: 'review auth flow' });

    expect(result.contextFiles).toEqual([]);
    expect(result.context).toBeUndefined();
    expect(sdk.createAgentSession).not.toHaveBeenCalledWith(
      expect.objectContaining({ contextFiles: expect.anything() })
    );
  });

  it('TC-702: session receives contextFiles from retriever', async () => {
    const resolver = { resolve: vi.fn(() => '/ws') } as any;
    const retrieval: RetrievalResult = {
      query: 'review auth flow',
      intent: 'LOCAL',
      contextFiles: [
        { path: 'src/auth.ts', outline: '// auth.ts\nfunction login', tokens: 12, tier: 'symbol' },
      ],
      totalTokens: 12,
      tier: 'symbol',
    };
    const retriever = fakeRetriever(retrieval);
    const sdk = mockSdk();

    const factory = new PiSessionFactory(resolver, retriever);
    const result = await factory.createSession(sdk as any, { query: 'review auth flow', topK: 20 });

    expect(retriever.retrieve).toHaveBeenCalledWith('review auth flow', 20);
    expect(sdk.createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({ contextFiles: ['src/auth.ts'] })
    );
    expect(result.contextFiles).toEqual(['src/auth.ts']);
    expect(result.context).toEqual(retrieval);
  });

  it('continues with empty context when retrieval fails', async () => {
    const resolver = { resolve: vi.fn(() => '/ws') } as any;
    const retriever = fakeRetriever({} as RetrievalResult, true);
    const sdk = mockSdk();

    const factory = new PiSessionFactory(resolver, retriever);
    const result = await factory.createSession(sdk as any, { query: 'anything' });

    expect(result.session).toBeDefined();
    expect(result.contextFiles).toEqual([]);
    expect(result.context).toBeUndefined();
  });
});
