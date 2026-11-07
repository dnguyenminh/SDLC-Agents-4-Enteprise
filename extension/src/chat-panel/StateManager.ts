/**
 * StateManager — File-based state persistence using globalStorageUri.
 * Replaces workspaceState for large chat history (avoids 3MB limit).
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ChatState {
  tabs: Array<{
    id: string;
    name: string;
    messages: unknown[];
    tokenCount: number;
    maxTokens: number;
  }>;
  activeTabId: string;
  messageHistory?: string[];
}

export class StateManager {
  private readonly filePath: string | undefined;

  constructor(context: vscode.ExtensionContext | undefined) {
    // globalStorageUri: persistent across workspace reloads, no 3MB limit.
    // Context may be absent (tests / legacy harnesses) → persistence disabled.
    const dir = context?.globalStorageUri?.fsPath;
    if (!dir) {
      this.filePath = undefined;
      return;
    }
    this.filePath = path.join(dir, 'chat-state.json');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!this.filePath) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async load(): Promise<ChatState | undefined> {
    if (!this.filePath) return undefined;
    try {
      if (fs.existsSync(this.filePath)) {
        const content = await fs.promises.readFile(this.filePath, 'utf8');
        return JSON.parse(content) as ChatState;
      }
    } catch (e) {
      console.warn('[StateManager] Failed to load state:', e);
    }
    return undefined;
  }

  async save(state: ChatState): Promise<void> {
    if (!this.filePath) return;
    this.ensureDir();
    await fs.promises.writeFile(this.filePath, JSON.stringify(state), 'utf8');
  }

  /** One-time migration from workspaceState to file storage. */
  async migrateFromWorkspaceState(workspaceState: vscode.Memento): Promise<boolean> {
    if (!this.filePath) return false;
    try {
      const existing = await this.load();
      if (existing) return false; // already migrated

      const tabs = workspaceState.get<any[]>('chat.tabs');
      const activeTabId = workspaceState.get<string>('chat.activeTabId');
      const messageHistory = workspaceState.get<string[]>('chat.messageHistory');

      if (tabs && tabs.length > 0) {
        const state: any = {
          tabs,
          activeTabId: activeTabId || '',
          messageHistory: messageHistory || [],
        };
        await this.save(state);
        // Clear old keys to free memory
        await workspaceState.update('chat.tabs', undefined);
        await workspaceState.update('chat.activeTabId', undefined);
        await workspaceState.update('chat.messageHistory', undefined);
        return true;
      }
    } catch (e) {
      console.warn('[StateManager] Migration failed:', e);
    }
    return false;
  }
}