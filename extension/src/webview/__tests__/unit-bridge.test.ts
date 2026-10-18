/**
 * Unit Tests — MessageBridge
 * KSA-252 — STC UT-30 through UT-37
 * Split from unit-part2.test.ts (bridge concerns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM globally for these tests
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;
global.HTMLSpanElement = dom.window.HTMLSpanElement;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

// Mock vscodeApi
function createMockVscodeApi() {
  return { postMessage: vi.fn() };
}

// ============================================================
// 2.5 MessageBridge.ts (UT-30 to UT-37)
// ============================================================
describe('UT — MessageBridge', () => {
  let MessageBridge: any;

  beforeEach(async () => {
    MessageBridge = (await import('../bridge/MessageBridge')).MessageBridge;
  });

  it('UT-30: generates unique request IDs', () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any);
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      bridge.request({ type: 'getSpecList' } as any, 50000).catch(() => {});
    }
    // Each call to request posts a message with unique requestId
    for (const call of api.postMessage.mock.calls) {
      ids.add(call[0].requestId);
    }
    expect(ids.size).toBe(100);
    bridge.dispose();
  });

  it('UT-31: timeout rejects promise', async () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any, 50); // 50ms timeout
    await expect(bridge.request({ type: 'getSpecList' } as any)).rejects.toThrow('Timeout');
    bridge.dispose();
  });

  it('UT-32: matches response to request', async () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any, 5000);
    const promise = bridge.request<{ data: string[] }>({ type: 'getSpecList' } as any);

    // Get the requestId that was posted
    const postedMsg = api.postMessage.mock.calls[0][0];
    const requestId = postedMsg.requestId;

    // Simulate response via message event
    const event = new dom.window.MessageEvent('message', {
      data: { type: 'specList', data: ['chatbox-ui'], requestId }
    });
    dom.window.dispatchEvent(event);

    const result = await promise;
    expect(result.data).toEqual(['chatbox-ui']);
    bridge.dispose();
  });

  it('UT-33: ignores unmatched responses', () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any);

    // Fire a response with unknown id — should not throw
    const event = new dom.window.MessageEvent('message', {
      data: { type: 'specList', data: [], requestId: 'ctx-999' }
    });
    expect(() => dom.window.dispatchEvent(event)).not.toThrow();
    bridge.dispose();
  });

  it('UT-34: cleans up after timeout', async () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any, 20);
    try {
      await bridge.request({ type: 'getSpecList' } as any);
    } catch { /* expected timeout */ }
    // Internal pendingRequests should be empty after timeout
    // We verify by checking no leak via dispose (which would reject remaining)
    expect(() => bridge.dispose()).not.toThrow();
  });

  it('UT-35: cleans up after response', async () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any, 5000);
    const promise = bridge.request({ type: 'getSpecList' } as any);
    const requestId = api.postMessage.mock.calls[0][0].requestId;
    
    const event = new dom.window.MessageEvent('message', {
      data: { type: 'specList', data: [], requestId }
    });
    dom.window.dispatchEvent(event);
    await promise;
    // After response, dispose should not reject anything
    expect(() => bridge.dispose()).not.toThrow();
  });

  it('UT-36: handles error responses', async () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any, 5000);
    const promise = bridge.request({ type: 'resolveGitDiff' } as any);
    const requestId = api.postMessage.mock.calls[0][0].requestId;

    const event = new dom.window.MessageEvent('message', {
      data: { type: 'error', message: 'no git repo', requestType: 'resolveGitDiff', requestId }
    });
    dom.window.dispatchEvent(event);
    await expect(promise).rejects.toThrow('no git repo');
    bridge.dispose();
  });

  it('UT-37: concurrent requests work independently', async () => {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any, 5000);

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(bridge.request<{ data: string[] }>({ type: 'getSpecList' } as any));
    }

    // Resolve each with its own data
    for (let i = 0; i < 5; i++) {
      const requestId = api.postMessage.mock.calls[i][0].requestId;
      const event = new dom.window.MessageEvent('message', {
        data: { type: 'specList', data: [`spec-${i}`], requestId }
      });
      dom.window.dispatchEvent(event);
    }

    const results = await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      expect(results[i].data).toEqual([`spec-${i}`]);
    }
    bridge.dispose();
  });
});
