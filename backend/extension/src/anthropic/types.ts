// --- Kiro Q API Response Types ---

export interface KiroQResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: KiroQContentBlock[];
  stop_reason: "tool_use" | "end_turn" | null;
}

export interface KiroQToolUseBlock {
  type: "tool_use";
  id: string;        // The tool_use_id to preserve (BR-1)
  name: string;
  input: Record<string, unknown>;
}

export interface KiroQTextBlock {
  type: "text";
  text: string;
}

export type KiroQContentBlock = KiroQToolUseBlock | KiroQTextBlock;

// --- Anthropic SSE Stream Types ---

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "tool_use" | "text";
    id?: string;       // MUST equal KiroQToolUseBlock.id (BR-2)
    name?: string;
    input?: Record<string, unknown>;
  };
}

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "input_json_delta" | "text_delta";
    partial_json?: string;
    text?: string;
  };
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageStopEvent {
  type: "message_stop";
}

export type SSEEvent =
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageStopEvent;

// --- Conversation History Types ---

export interface ConversationMessage {
  role: "user" | "assistant" | "tool_result";
  content: ContentBlock[];
  turnNumber: number;
}

export interface ToolUseContentBlock {
  type: "tool_use";
  id: string;          // Preserved from API (BR-1)
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: "tool_result";
  toolUseId: string;   // Must match a stored ToolUseContentBlock.id (BR-2)
  content: string;
  isError?: boolean;
}

export interface TextContentBlock {
  type: "text";
  text: string;
}

export type ContentBlock = ToolUseContentBlock | ToolResultContentBlock | TextContentBlock;

// --- Continuation Request Types ---

export interface ContinuationRequest {
  messages: Array<{
    role: string;
    content: string | ContentBlock[];
  }>;
  toolResult?: {
    toolUseId: string;
    content: string;
    isError?: boolean;
  };
}

// --- Error Types ---

export class ToolUseIdMismatchError extends Error {
  constructor(
    public receivedId: string,
    public availableIds: string[],
    public turnNumber: number,
  ) {
    super(`tool_use_id '${receivedId}' not found in history`);
    this.name = 'ToolUseIdMismatchError';
  }
}

export class MalformedApiResponseError extends Error {
  constructor(public reason: string) {
    super(`Malformed API response: ${reason}`);
    this.name = 'MalformedApiResponseError';
  }
}
