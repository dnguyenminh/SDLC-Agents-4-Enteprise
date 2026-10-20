/**
 * SA4E-369 — session tools peer_list / peer_send / peer_status (D4), built in
 * the SA4E-360 custom-tool shape (create-host customTools pool). Handlers wrap
 * every failure into the pi-a2a error envelope { error: { code, message } }.
 * Message content is NEVER logged (§7.3).
 */
import { Type } from 'typebox';
import { PEER_MESSAGE_MAX_CHARS } from './constants.js';
import type { PeerBus } from './bus.js';
import type { PeerError, PeerErrorEnvelope, SendResult } from './types.js';

/** pi-coding-agent ToolDefinition structural shape (avoids import weight). */
export interface PeerToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute: (toolCallId: string, params: unknown) => Promise<unknown>;
}

function textResult(result: unknown): unknown {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: result };
}

/** Wraps bus rejections into the pi-a2a error envelope (D4 §3.5). */
function envelopeOf(err: unknown): PeerErrorEnvelope {
  const peer = err as Partial<PeerError>;
  if (peer && typeof peer.code === 'string' && peer.code.startsWith('PEER_')) {
    return { error: { code: peer.code as PeerError['code'], message: peer.message ?? 'Peer error', details: peer.details } };
  }
  return { error: { code: 'PEER_003', message: err instanceof Error ? err.message : String(err) } };
}

export function buildPeerListTool(callerTabId: string, bus: PeerBus): PeerToolDefinition {
  return {
    name: 'peer_list',
    label: 'Peer list',
    description: 'List the other chat tabs (peers) available for agent-to-agent messaging in this window.',
    parameters: Type.Object({}),
    promptSnippet: 'Peer tabs available for agent-to-agent messaging',
    promptGuidelines: ['Call peer_list first to discover target tabIds before peer_send.'],
    execute: async () => textResult(bus.list(callerTabId)),
  };
}

export function buildPeerSendTool(callerTabId: string, bus: PeerBus): PeerToolDefinition {
  return {
    name: 'peer_send',
    label: 'Peer send',
    description:
      'Send a task message to another chat tab. Blocking mode waits for the peer reply; ' +
      `async mode returns a taskId to poll with peer_status. Max ${PEER_MESSAGE_MAX_CHARS} chars.`,
    parameters: Type.Object({
      tabId: Type.String({ description: 'Target tab id from peer_list.' }),
      message: Type.String({ description: 'Task message for the peer agent.' }),
      async: Type.Optional(Type.Boolean({ description: 'true = fire-and-poll, false = wait for reply.' })),
    }),
    promptSnippet: 'Send an agent-to-agent task to another tab',
    promptGuidelines: ['Use peer_status to poll async tasks.'],
    execute: async (_id: string, params: unknown) => {
      const p = (params ?? {}) as { tabId?: string; message?: string; async?: boolean };
      if (typeof p.tabId !== 'string' || p.tabId.length === 0 || typeof p.message !== 'string' || p.message.trim().length === 0) {
        return textResult({ error: { code: 'PEER_010', message: 'peer_send requires a non-empty tabId and message.' } });
      }
      try {
        const result: SendResult = await bus.send(callerTabId, p.tabId, p.message, p.async ? 'async' : 'blocking', 'agent');
        return textResult(result.error ? { error: result.error } : result);
      } catch (err) {
        return textResult(envelopeOf(err));
      }
    },
  };
}

export function buildPeerStatusTool(callerTabId: string, bus: PeerBus): PeerToolDefinition {
  return {
    name: 'peer_status',
    label: 'Peer status',
    description: 'Poll the state of a peer task returned by peer_send (async mode). Side-effect free.',
    parameters: Type.Object({ taskId: Type.String({ description: 'Task id from peer_send.' }) }),
    promptSnippet: 'Poll a peer task state',
    promptGuidelines: ['Poll until state is completed, failed or cancelled.'],
    execute: async (_id: string, params: unknown) => {
      const taskId = (params as { taskId?: string } | undefined)?.taskId ?? '';
      try {
        return textResult(bus.status(taskId, callerTabId));
      } catch (err) {
        return textResult(envelopeOf(err));
      }
    },
  };
}

/** The 3 tools bound to one calling tab (registration point: create-host). */
export function buildPeerTools(callerTabId: string, bus: PeerBus): PeerToolDefinition[] {
  return [
    buildPeerListTool(callerTabId, bus),
    buildPeerSendTool(callerTabId, bus),
    buildPeerStatusTool(callerTabId, bus),
  ];
}
