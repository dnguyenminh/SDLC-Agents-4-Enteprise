/**
 * SA4E-85 — Stores barrel export.
 * All 5 Svelte stores for the Agentic Chat Webview.
 */

export {
  chatState, messages, isStreaming, chatError,
  startStream, appendToken, endStream, setStreamError,
  addUserMessage, clearChat,
  startThinking, appendThinkingToken, endThinking,
} from './chatStore';
export type { ChatMessageItem } from './chatStore';

export {
  agentState, agents, selectedAgentId, selectedAgent, isAgentLoading,
  syncAgents, selectAgent, resetAgents,
} from './agentStore';

export {
  contextState, usagePercent, contextFiles, tokenCount, pruneSuggestions,
  updateContext, setPruneSuggestions, resetContext,
} from './contextStore';
export type { PruneSuggestion } from './contextStore';

export {
  toolState, activeToolsList, pendingApprovalCount,
  addToolCall, appendToolOutput, completeToolCall, failToolCall,
  addSessionApproval, isSessionApproved,
  addSessionTypeApproval, isSessionTypeApproved, resetTools,
} from './toolStore';
export type { ActiveTool } from './toolStore';

export {
  connectionState, servicesList, hasActiveConnection, allDisconnected,
  updateServiceStatus, removeService, resetConnections,
} from './connectionStore';
export type { ServiceConnection } from './connectionStore';

export {
  diffTrackerState, diffFileCount, diffSummary, isDiffExpanded,
  updateDiffCount, setDiffSummary, toggleDiffPanel, resetDiffTracker,
} from './diffTrackerStore';
export type { DiffSummaryPayload, ChangeEntryPayload } from './diffTrackerStore';

export {
  piWorkflowState, updatePiWorkflowState, setPiSessionId, setPiPhase, setPiProviderStatus,
} from './piWorkflowStore';
export type { PiWorkflowState } from './piWorkflowStore';
