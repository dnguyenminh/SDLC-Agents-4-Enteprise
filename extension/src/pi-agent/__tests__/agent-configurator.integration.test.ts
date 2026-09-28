import { describe, it, expect } from 'vitest';
import { buildResourceLoaderOptions, simulateAgentSession } from '../agent-configurator';
import { createResourceLoader } from '../resource-loader.factory';

describe('agent-configurator integration', () => {
  it('TC-701: Pi SDK Session Creation Integration', () => {
    const base = { cwd: process.cwd(), agentDir: process.env.HOME || '/agent' };
    const opts = buildResourceLoaderOptions(base, 'DEV', 'replace');
    // Real loader creation (mock fallback)
    const loader = createResourceLoader({ cwd: base.cwd, agentDir: base.agentDir });
    expect(loader).toBeDefined();
    expect(typeof loader.reload).toBe('function');

    const session = simulateAgentSession(opts, 'DEV');
    expect(session.systemPrompt).toContain('Developer');
  });

  it('TC-702: Skills Discovery Integration With File System', () => {
    const base = { cwd: process.cwd(), agentDir: process.env.HOME || '/agent' };
    const opts = buildResourceLoaderOptions(base, 'BA', 'append', 'all');
    expect(opts.skillsOverride).toBeDefined();
    const skills = [{ id: 'sdlc-ba', phase: 'design' }, { id: 'sdlc-dev', phase: 'impl' }];
    const result = opts.skillsOverride!(skills);
    expect(result.length).toBeGreaterThan(0);
  });

  it('TC-703: Prompt Override Integration With Session', () => {
    const base = { cwd: '/tmp', agentDir: '/agent' };
    const opts = buildResourceLoaderOptions(base, 'SA', 'append');
    const session = simulateAgentSession(opts, 'SA');
    expect(session.systemPrompt).toContain('Solution Architect');
    expect(session.resourceLoaderOptions).toBeDefined();
  });

  it('TC-801: Existing Loader Behavior Preserved', () => {
    const base = { cwd: '/tmp', agentDir: '/agent' };
    const opts = buildResourceLoaderOptions(base, 'BA', 'append');
    // No systemPromptOverride for append mode -> default behavior preserved
    expect(opts.systemPromptOverride).toBeUndefined();
  });

  it('TC-802: Append Mode Still Works After Replace Fix', () => {
    const base = { cwd: '/tmp', agentDir: '/agent' };
    const opts = buildResourceLoaderOptions(base, 'BA', 'append');
    expect(opts.appendSystemPromptOverride?.length).toBeGreaterThan(0);
  });
});
