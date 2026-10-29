/**
 * SA4E-85 — Webview-side message listener.
 * Receives ExtensionMessage from Extension Host and dispatches
 * to appropriate store update functions. Observer pattern.
 */

import type { ExtensionMessage } from '../chat/types';
import {
  startStream, appendToken, endStream, setStreamError,
  startThinking, appendThinkingToken, endThinking,
} from './stores/chatStore';
import { 
  syncAgents, 
  setSwitchSuccess, 
  setSwitchError, 
  setActiveAgentForTab 
} from './stores/agentStore';
import { 
  updateTabs, 
  setActiveTab 
} from './stores/tabStore';
import { updateContext } from './stores/contextStore';
import {
  addToolCall, appendToolOutput, completeToolCall, failToolCall,
} from './stores/toolStore';
import { updateServiceStatus } from './stores/connectionStore';
import { hydrateChat } from './stores/chatStore';
import { updateDiffCount, setDiffSummary } from './stores/diffTrackerStore';

/** Message handler map — Strategy pattern for inbound message routing */
type HandlerMap = Record<string, (msg: ExtensionMessage) => void>;

/** Build handler map for all Extension → Webview message types */
function buildHandlers(): HandlerMap {
  return {
    STREAM_START: (msg) => {
      if (msg.type === 'STREAM_START') startStream(msg.messageId, msg.agentId);
    },
    STREAM_TOKEN: (msg) => {
      if (msg.type === 'STREAM_TOKEN') appendToken(msg.messageId, msg.token);
    },
    STREAM_END: (msg) => {
      if (msg.type === 'STREAM_END') endStream(msg.messageId);
    },
    STREAM_ERROR: (msg) => {
      if (msg.type === 'STREAM_ERROR') setStreamError(msg.messageId, msg.error.message);
    },
    THINKING_START: (msg) => {
      if (msg.type === 'THINKING_START') startThinking(msg.messageId);
    },
    THINKING_TOKEN: (msg) => {
      if (msg.type === 'THINKING_TOKEN') appendThinkingToken(msg.messageId, msg.token);
    },
    THINKING_END: (msg) => {
      if (msg.type === 'THINKING_END') endThinking(msg.messageId);
    },
    TOOL_CALL_REQUEST: (msg) => {
      if (msg.type === 'TOOL_CALL_REQUEST') {
        addToolCall({
          toolId: msg.toolId,
          name: msg.name,
          args: msg.args,
          toolType: msg.toolType,
          requiresApproval: msg.requiresApproval,
        });
      }
    },
    TOOL_STREAM_OUTPUT: (msg) => {
      if (msg.type === 'TOOL_STREAM_OUTPUT') appendToolOutput(msg.toolId, msg.chunk);
    },
    MCP_TOOL_RESULT: (msg) => {
      if (msg.type === 'MCP_TOOL_RESULT') {
        if (msg.error) failToolCall(msg.toolId, msg.error);
        else completeToolCall(msg.toolId, msg.result.content);
      }
    },
    SYNC_AVAILABLE_AGENTS: (msg) => {
      if (msg.type === 'SYNC_AVAILABLE_AGENTS') syncAgents(msg.agents);
    },
    AGENT_SWITCHED: (msg) => {
      if (msg.type === 'AGENT_SWITCHED') {
        if (msg.success) {
          setSwitchSuccess(msg.tabId, msg.agentId);
          setActiveAgentForTab(msg.tabId, msg.agentId);
        } else {
          setSwitchError(msg.error || 'Agent switch failed');
        }
      }
    },
    'tab:updated': (msg) => {
      if (msg.type === 'tab:updated') {
        updateTabs(msg.payload.tabs, msg.payload.activeTabId);
      }
    },
    'tab:switch': (msg) => {
      if (msg.type === 'tab:switch') {
        setActiveTab(msg.payload.tabId);
      }
    },
    IPC_STATUS: (msg) => {
      if (msg.type === 'IPC_STATUS') updateServiceStatus(msg.service, msg.status, msg.endpoint);
    },
    CONTEXT_UPDATE: (msg) => {
      if (msg.type === 'CONTEXT_UPDATE') updateContext(msg.tokenCount, msg.maxTokens, msg.files);
    },
    SYNC_CHAT_HISTORY: (msg) => {
      if (msg.type === 'SYNC_CHAT_HISTORY') hydrateChat(msg.messages, msg.context);
    },
    DIFF_COUNT_UPDATED: (msg) => {
      if (msg.type === 'DIFF_COUNT_UPDATED') updateDiffCount(msg.count);
    },
    DIFF_SUMMARY_RESPONSE: (msg) => {
      if (msg.type === 'DIFF_SUMMARY_RESPONSE') setDiffSummary(msg.summary);
    },
  };
}

/**
 * Initialize the global message event listener.
 * Called once at webview startup from main.ts.
 */
export function initMessageListener(): void {
  const handlers = buildHandlers();

  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as ExtensionMessage;
    if (!message || !message.type) return;

    const handler = handlers[message.type];
    if (handler) {
      handler(message);
    }
  });
}
