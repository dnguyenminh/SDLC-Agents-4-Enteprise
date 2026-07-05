/**
 * MessageBridge — postMessage request/response bridge between webview and extension host
 * KSA-252
 */

import type {
  ContextRequest,
  ContextResponse,
  FileTreeNode,
  FolderTreeNode,
  McpResourceItem,
  DiagnosticItem,
} from '../protocol';
import type { PendingRequest, VsCodeApi } from './types';

export class MessageBridge {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestId = 0;
  private defaultTimeout: number;
  private vscodeApi: VsCodeApi;

  constructor(vscodeApi: VsCodeApi, defaultTimeout = 3000) {
    this.vscodeApi = vscodeApi;
    this.defaultTimeout = defaultTimeout;
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as ContextResponse;
    if (!data || !('requestId' in data)) return;
    const pending = this.pendingRequests.get(data.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingRequests.delete(data.requestId);
    if (data.type === 'error') {
      pending.reject(new Error((data as { message: string }).message));
    } else {
      pending.resolve(data);
    }
  }

  async request<T>(message: ContextRequest, timeout?: number): Promise<T> {
    const id = `ctx-${++this.requestId}`;
    const effectiveTimeout = timeout ?? this.defaultTimeout;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout: ${message.type} (${effectiveTimeout}ms)`));
      }, effectiveTimeout);
      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.vscodeApi.postMessage({ ...message, requestId: id });
    });
  }

  async getFileTree(): Promise<FileTreeNode[]> {
    const response = await this.request<{ data: FileTreeNode[] }>({ type: 'getWorkspaceFileTree' });
    return response.data;
  }

  async getSpecList(): Promise<string[]> {
    const response = await this.request<{ data: string[] }>({ type: 'getSpecList' });
    return response.data;
  }

  async getFolderTree(): Promise<FolderTreeNode[]> {
    const response = await this.request<{ data: FolderTreeNode[] }>({ type: 'getWorkspaceFolderTree' });
    return response.data;
  }

  async getSteeringFiles(): Promise<string[]> {
    const response = await this.request<{ data: string[] }>({ type: 'getSteeringFiles' });
    return response.data;
  }

  async getMcpResources(): Promise<McpResourceItem[]> {
    const response = await this.request<{ data: McpResourceItem[] }>({ type: 'getMcpResources' });
    return response.data;
  }

  async getActiveFileName(): Promise<string | null> {
    const response = await this.request<{ data: string | null }>({ type: 'getActiveFileName' });
    return response.data;
  }

  async resolveGitDiff(): Promise<string> {
    const response = await this.request<{ data: string }>({ type: 'resolveGitDiff' }, 5000);
    return response.data;
  }

  async resolveTerminalOutput(lines?: number): Promise<string> {
    const response = await this.request<{ data: string }>({ type: 'resolveTerminalOutput', lines }, 5000);
    return response.data;
  }

  async resolveDiagnostics(): Promise<DiagnosticItem[]> {
    const response = await this.request<{ data: DiagnosticItem[] }>({ type: 'resolveDiagnostics' });
    return response.data;
  }

  dispose(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge disposed'));
    }
    this.pendingRequests.clear();
  }
}
