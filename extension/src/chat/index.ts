/**
 * SA4E-85 — Chat module barrel export.
 * Public API for the Agentic Chat feature.
 */

export { MessageRouter } from './router';
export type { IMessageRouter, MessageHandler } from './router';
export { isValidMessageType } from './router';

export { PostMessageBridge, TokenBuffer } from './bridge';
export type { IPostMessageBridge } from './bridge';

export { ChatWebviewProvider } from './webview/ChatWebviewProvider';

export { IdeContextManager } from './context';
export type { IContextManager, ContextState } from './context';
export { suggestPrune, computeFreedThreshold } from './context';
export type { PrunableFile, PruneCandidate, ContextFile as ContextFileData } from './context';

export { IpcBridge, JsonRpcClient, ServiceDiscoveryWatcher, isLocalhostEndpoint } from './ipc';
export type { IIpcBridge, ServiceDiscovery, StatusChangeEvent, DiscoveryListener } from './ipc';

export { DiagramRenderer, LruCache, buildSkinnedSource } from './diagram';
export type { IDiagramRenderer, DiagramBlock, DiagramType } from './diagram';

export {
  TelemetryService,
  logDiffAction, logToolExec, logContextPrune,
  logStreamError, logPermissionDecision,
} from './telemetry';
export type {
  ITelemetryService, TelemetryEntry,
  DiffActionEntry, ToolExecEntry, ContextPruneEntry,
  StreamErrorEntry, PermissionDecisionEntry,
} from './telemetry';

export {
  ChatEngineAdapter,
  StreamProtocolAdapter,
  SessionManager,
} from './engine';
export type {
  IChatEngineAdapter,
  ChatEngineAdapterDeps,
  IStreamProtocolAdapter,
  ISessionManager,
  SessionData,
} from './engine';

export type {
  ExtensionMessage,
  WebviewMessage,
  MessageType,
  AgentMeta,
  ContextFile,
  ServiceStatus,
  StreamError,
  ToolType,
  ToolResult,
} from './types';
