/**
 * Message Handler chat/pipeline routing --- KSA-210
 */

import * as vscode from "vscode";
import { debugLog } from "../debug-logger";
import { LangGraphEngine } from "../langgraph/langgraph-engine";
import { ChatExtToWebviewMessage, AutopilotMode } from "./message-protocol";
import { SDLCPhase } from "../langgraph/state";

/** Pattern matching for ticket-based commands */
const TICKET_PATTERN = /^([A-Z]+-\d+)\s+(.+)$/;

/** Direct command patterns */
const DIRECT_COMMANDS: Record<string, string> = { status: "status", resume: "resume", cancel: "cancel" };

/** Phase keywords for ticket commands */
const PHASE_KEYWORDS: Record<string, SDLCPhase> = {
  brd: "requirements", "tao brd": "requirements", fsd: "specification",
  "tao fsd": "specification", tdd: "design", "tao tdd": "design",
  stp: "test_planning", "tao stp": "test_planning", implement: "implementation",
  test: "testing", deploy: "deployment", full: "all",
};

export function parsePhase(action: string): SDLCPhase {
  for (const [keyword, phase] of Object.entries(PHASE_KEYWORDS)) {
    if (action.includes(keyword)) { return phase; }
  }
  return "all";
}

export function buildEnrichedText(text: string, context?: Array<{ type: string; label: string; path?: string; content?: string }>): string {
  if (!context || context.length === 0) return text;
  const sections: string[] = [];
  for (const item of context) {
    if (item.content) { sections.push(`<${item.type} name="${item.label}">\n${item.content}\n</${item.type}>`); }
    else if (item.path) { sections.push(`<${item.type} name="${item.label}" path="${item.path}" />`); }
  }
  if (sections.length > 0) { return `<context>\n${sections.join("\n")}\n</context>\n\n${text}`; }
  return text;
}

export async function routeUserMessage(
  text: string,
  enrichedText: string,
  getEngine: () => LangGraphEngine,
  sendToWebview: (msg: ChatExtToWebviewMessage) => void
): Promise<void> {
  const textTrimmed = text.trim().toLowerCase();

  // Direct commands
  if (DIRECT_COMMANDS[textTrimmed]) {
    debugLog(` handleUserMessage: routed to DIRECT COMMAND "${textTrimmed}"`);
    await handleDirectCommand(DIRECT_COMMANDS[textTrimmed], getEngine, sendToWebview);
    sendToWebview({ type: "chat:workingStatus", working: false });
    return;
  }

  // Agent command prefix
  const agentMatch = text.trim().match(/^\/([a-z][-a-z]*)\s+(.+)$/i);
  if (agentMatch) {
    const [, agentName, agentTask] = agentMatch;
    debugLog(` handleUserMessage: routed to AGENT "${agentName}"`);
    sendToWebview({ type: "chat:workingStatus", working: true, label: `${agentName} --- working...` });
    await getEngine().invokeChat(`[Agent: ${agentName}] ${agentTask}`);
    sendToWebview({ type: "chat:workingStatus", working: false });
    return;
  }

  // Ticket pattern
  const match = text.trim().match(TICKET_PATTERN);
  if (match) {
    const ticketKey = match[1];
    const action = match[2].trim().toLowerCase();
    const phase = parsePhase(action);
    debugLog(` handleUserMessage: routed to SDLC ticket=${ticketKey} phase=${phase}`);
    sendToWebview({ type: "chat:workingStatus", working: true, label: `${ticketKey} --- ${phase}` });
    await getEngine().invoke(ticketKey, phase, enrichedText);
    sendToWebview({ type: "chat:workingStatus", working: false });
    return;
  }

  // All other -> chat
  debugLog(` handleUserMessage: routed to CHAT (invokeChat)`);
  await getEngine().invokeChat(enrichedText);
  debugLog(` handleUserMessage: invokeChat RETURNED`);

  // Fire agentStop hooks
  try { const engine = getEngine(); await engine.hookEngine.fireAgentStop(engine.getStreamHandler()); } catch { /* */ }
  sendToWebview({ type: "chat:workingStatus", working: false });
}

async function handleDirectCommand(command: string, getEngine: () => LangGraphEngine, sendToWebview: (msg: ChatExtToWebviewMessage) => void): Promise<void> {
  switch (command) {
    case "status": {
      const nodes = getEngine().getCurrentNodeStates();
      sendToWebview({ type: "chat:graphUpdate", nodes });
      break;
    }
    case "resume": {
      const pipelines = getEngine().listPersistedPipelines();
      const paused = pipelines.find(p => p.status === "paused");
      if (paused) { await getEngine().resume(paused.threadId); }
      else { sendToWebview({ type: "chat:error", code: "NO_PIPELINE", message: "No paused pipeline to resume.", retryable: false }); }
      break;
    }
    case "cancel":
      getEngine().cancel();
      break;
  }
}
