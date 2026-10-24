/**
 * SA4E-369 round-5 UAT — peer_list comprehensibility: the registry identity
 * must never degrade to a raw tabId UUID ("không thể hiểu được, nó là tab
 * nào"). Locks the identity lifecycle:
 *   named register wins · nameless bootstrap never stomps · named upgrades a
 *   UUID fallback · agent-driven identity is protected · rename follows the
 *   display name for agent-less tabs only.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerPeerTabIdentity, renamePeerTabIdentity } from '../lifecycle.js';
import { initPeerRuntime, peekPeerRuntime, resetPeerRuntime } from '../runtime.js';

describe('peer tab identity — comprehensible names (round-5 UAT)', () => {
  beforeEach(() => {
    resetPeerRuntime();
    initPeerRuntime();
  });

  it('ID-01: a nameless re-register (tab:switch) never stomps a real name back to the UUID', () => {
    registerPeerTabIdentity('tab-1', '/ws', 'Chat 3');
    // The tab:switch handler bootstraps WITHOUT a name — historically this
    // rewrote agentName to the raw tabId.
    registerPeerTabIdentity('tab-1', '/ws');
    expect(peekPeerRuntime()!.registry.getEntry('tab-1')?.agentName).toBe('Chat 3');
  });

  it('ID-02: a NAMED registration upgrades a UUID fallback identity', () => {
    registerPeerTabIdentity('tab-1', '/ws'); // no name yet → UUID fallback
    expect(peekPeerRuntime()!.registry.getEntry('tab-1')?.agentName).toBe('tab-1');
    registerPeerTabIdentity('tab-1', '/ws', 'Chat 3'); // onTabCreated arrives late
    expect(peekPeerRuntime()!.registry.getEntry('tab-1')?.agentName).toBe('Chat 3');
  });

  it('ID-03: an agent-driven identity is protected from later name bootstraps', () => {
    registerPeerTabIdentity('tab-1', '/ws', 'Chat 3');
    // Host creation upgrade (ensurePeerIdentity path): agent metadata lands.
    peekPeerRuntime()!.registry.register('tab-1', {
      workspaceRoot: '/ws', providerId: 'lmstudio', configuredModelId: '', activeAgentId: 'sm-agent',
      agentName: 'sm-agent', role: 'sm-agent', capabilities: [], model: 'auto', status: 'idle',
    });
    registerPeerTabIdentity('tab-1', '/ws', 'Chat 3'); // switch bootstrap arrives late
    expect(peekPeerRuntime()!.registry.getEntry('tab-1')?.agentName).toBe('sm-agent');
  });

  it('ID-04: rename follows the display name for agent-LESS tabs; agent tabs keep their agent', () => {
    registerPeerTabIdentity('tab-1', '/ws', 'Chat 3');
    renamePeerTabIdentity('tab-1', 'Reviewer Tab');
    expect(peekPeerRuntime()!.registry.getEntry('tab-1')?.agentName).toBe('Reviewer Tab');

    peekPeerRuntime()!.registry.register('tab-2', {
      workspaceRoot: '/ws', providerId: 'lmstudio', configuredModelId: '', activeAgentId: 'qa-agent',
      agentName: 'qa-agent', role: 'qa-agent', capabilities: [], model: 'auto', status: 'idle',
    });
    renamePeerTabIdentity('tab-2', 'Renamed anyway');
    expect(peekPeerRuntime()!.registry.getEntry('tab-2')?.agentName).toBe('qa-agent');
  });

  it('ID-05: rename caps the display name at 30 chars (ConversationManager max)', () => {
    registerPeerTabIdentity('tab-1', '/ws', 'Chat 3');
    renamePeerTabIdentity('tab-1', 'X'.repeat(50));
    expect(peekPeerRuntime()!.registry.getEntry('tab-1')?.agentName).toHaveLength(30);
  });
});
