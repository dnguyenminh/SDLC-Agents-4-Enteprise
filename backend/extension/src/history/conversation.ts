import {
  KiroQResponse,
  ConversationMessage,
  ToolUseContentBlock,
  ContentBlock,
} from '../anthropic/types';

/**
 * In-memory conversation history store.
 * Thread-safe for Node.js single-threaded event loop (no mutex needed).
 *
 * Uses Map<string, ToolUseContentBlock> for O(1) lookup on continuation (BR-2, BR-4).
 */
export class ConversationHistory {
  private messages: ConversationMessage[] = [];
  private toolUseIndex: Map<string, ToolUseContentBlock> = new Map();
  private turnCounter = 0;

  /**
   * Store assistant message, indexing all tool_use_ids for O(1) lookup.
   * CRITICAL (BR-2): IDs stored here MUST be the same as streamed to client.
   */
  addAssistantMessage(response: KiroQResponse): void {
    this.turnCounter++;
    const blocks: ContentBlock[] = response.content.map(block => {
      if (block.type === 'tool_use') {
        const toolBlock: ToolUseContentBlock = {
          type: 'tool_use',
          id: block.id,      // SAME id from API (BR-1, BR-2)
          name: block.name,
          input: block.input,
        };
        // Index for fast lookup on continuation
        this.toolUseIndex.set(block.id, toolBlock);
        return toolBlock;
      }
      return { type: 'text' as const, text: block.text };
    });

    this.messages.push({
      role: 'assistant',
      content: blocks,
      turnNumber: this.turnCounter,
    });
  }

  /**
   * Find a tool_use by ID. Returns null if not found (triggers UC-2).
   */
  findToolUse(toolUseId: string): ToolUseContentBlock | null {
    return this.toolUseIndex.get(toolUseId) ?? null;
  }

  /**
   * Get all stored tool_use_ids for diagnostic output (BR-7).
   */
  getAllToolUseIds(): string[] {
    return Array.from(this.toolUseIndex.keys());
  }

  /**
   * Store tool result, correlating with the original tool_use.
   */
  addToolResult(toolUseId: string, content: string, isError: boolean): void {
    this.turnCounter++;
    this.messages.push({
      role: 'tool_result',
      content: [{
        type: 'tool_result',
        toolUseId,
        content,
        isError,
      }],
      turnNumber: this.turnCounter,
    });
  }

  getCurrentTurn(): number {
    return this.turnCounter;
  }

  getMessages(): ConversationMessage[] {
    return [...this.messages];
  }

  clear(): void {
    this.messages = [];
    this.toolUseIndex.clear();
    this.turnCounter = 0;
  }
}
