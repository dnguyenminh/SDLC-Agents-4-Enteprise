/**
 * Shared types for webview <-> extension host communication
 * KSA-252: Context Menu ("#" Trigger)
 * KSA-255: Spinner + Working Indicator
 * KSA-259: Interactive Options
 */

export type ContextSourceType =
  | 'files'
  | 'spec'
  | 'git-diff'
  | 'terminal'
  | 'problems'
  | 'folder'
  | 'current-file'
  | 'steering'
  | 'mcp';

export interface ContextMetadata {
  filePaths?: string[];
  specName?: string;
  folderPath?: string;
  steeringFile?: string;
  mcpServer?: string;
  mcpResource?: string;
  activeFileName?: string;
}

export interface ContextTagBadge {
  id: string;
  type: ContextSourceType;
  label: string;
  icon: string;
  metadata: ContextMetadata;
  resolvedContent?: string;
}

export interface ContextMenuItem {
  id: ContextSourceType;
  label: string;
  icon: string;
  type: 'instant' | 'picker' | 'submenu';
  subLabel?: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

export interface FolderTreeNode {
  name: string;
  path: string;
  children?: FolderTreeNode[];
}

export interface McpResourceItem {
  server: string;
  name: string;
  type: 'tool' | 'resource' | 'prompt';
  description?: string;
}

export interface DiagnosticItem {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
}

// KSA-255: Processing state signal (Extension Host -> Webview)
export interface ChatProcessingSignal {
  type: 'chat:processing';
  state: 'start' | 'stop';
  reason?: 'complete' | 'cancelled' | 'error' | 'timeout';
}

// KSA-259: Interactive Options signal (Extension Host -> Webview)
export interface ChatOptionsSignal {
  type: 'chat:options';
  options: string[];
  question?: string;
}

// KSA-259: Chat response (Webview -> Extension Host)
export interface ChatResponseMessage {
  type: 'chat:response';
  text: string;
  source: 'option-click' | 'text-input';
}

// Webview -> Extension Host (Requests)
export type ContextRequest =
  | { type: 'getWorkspaceFileTree'; requestId?: string }
  | { type: 'getSpecList'; requestId?: string }
  | { type: 'getWorkspaceFolderTree'; requestId?: string }
  | { type: 'getSteeringFiles'; requestId?: string }
  | { type: 'getMcpResources'; requestId?: string }
  | { type: 'getActiveFileName'; requestId?: string }
  | { type: 'resolveGitDiff'; requestId?: string }
  | { type: 'resolveTerminalOutput'; lines?: number; requestId?: string }
  | { type: 'resolveDiagnostics'; requestId?: string }
  | { type: 'resolveFileContent'; paths: string[]; requestId?: string }
  | { type: 'resolveSpecContent'; specName: string; requestId?: string }
  | { type: 'resolveSteeringContent'; fileName: string; requestId?: string }
  | { type: 'resolveMcpResource'; server: string; resource: string; requestId?: string }
  | { type: 'resolveFolderListing'; folderPath: string; requestId?: string };

// Extension Host -> Webview (Responses)
export type ContextResponse =
  | { type: 'workspaceFileTree'; data: FileTreeNode[]; requestId: string }
  | { type: 'specList'; data: string[]; requestId: string }
  | { type: 'workspaceFolderTree'; data: FolderTreeNode[]; requestId: string }
  | { type: 'steeringFiles'; data: string[]; requestId: string }
  | { type: 'mcpResources'; data: McpResourceItem[]; requestId: string }
  | { type: 'activeFileName'; data: string | null; requestId: string }
  | { type: 'gitDiff'; data: string; requestId: string }
  | { type: 'terminalOutput'; data: string; requestId: string }
  | { type: 'diagnostics'; data: DiagnosticItem[]; requestId: string }
  | { type: 'fileContent'; data: { path: string; content: string }[]; requestId: string }
  | { type: 'specContent'; data: { requirements: string; design: string; tasks: string }; requestId: string }
  | { type: 'steeringContent'; data: string; requestId: string }
  | { type: 'mcpResourceContent'; data: string; requestId: string }
  | { type: 'folderListing'; data: string[]; requestId: string }
  | { type: 'error'; message: string; requestType: string; requestId: string };

export interface ResolvedContext {
  type: ContextSourceType;
  label: string;
  content: string;
}
