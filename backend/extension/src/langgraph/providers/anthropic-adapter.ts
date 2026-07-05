// AnthropicAdapter --- KSA-231 --- Maps between LlmMessage and Kiro API format
import type { LlmMessage, LlmOptions, LlmResponse, LlmToolCall } from "../llm-provider";
import type { McpToolDefinition } from "../tool-registry";


/** Default local kiro-ts gateway port (kiroSdlc.mcpServerPort default). */
const DEFAULT_GATEWAY_PORT = 9181;


export interface KiroRequestBody {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string | any[] }>;
  system?: string;
  stream?: boolean;
  temperature?: number;
  tools?: Array<{ name: string; description: string; input_schema: any }>;
}


export class AnthropicAdapter {
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(defaultModel = "", defaultMaxTokens = 4096) {
    this.defaultModel = defaultModel;
    this.defaultMaxTokens = defaultMaxTokens;
  }

  buildRequestBody(
    messages: LlmMessage[],
    options?: LlmOptions,
    tools?: McpToolDefinition[]
  ): KiroRequestBody {
    const { systemPrompt, userMessages } = this.splitMessages(messages);

    const body: KiroRequestBody = {
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || this.defaultMaxTokens,
      messages: this.formatMessages(userMessages),
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    return body;
  }

  buildRequestHeaders(accessToken: string, modelId: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "X-Model-Id": modelId,
      "Accept": "text/event-stream",
    };
  }

  buildNonStreamHeaders(accessToken: string, modelId: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "X-Model-Id": modelId,
    };
  }

  parseNonStreamResponse(json: any): LlmResponse {
    if (!json.content || !Array.isArray(json.content)) {
      return { type: "text", text: "" };
    }

    // Check for tool_use blocks
    const toolUseBlocks = json.content.filter((block: any) => block.type === "tool_use");
    if (toolUseBlocks.length > 0) {
      const toolCalls: LlmToolCall[] = toolUseBlocks.map((block: any) => ({
        id: block.id,
        name: block.name,
        arguments: block.input || {},
      }));
      return { type: "tool_use", toolCalls };
    }

    // Text response — concatenate all text blocks
    const text = json.content
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text || "")
      .join("");

    return { type: "text", text };
  }

  getEndpointUrl(portOrRegion?: number | string): string {
    const port = typeof portOrRegion === "number" ? portOrRegion : DEFAULT_GATEWAY_PORT;
    return `http://127.0.0.1:${port}/v1/messages`;
  }

  getModelsEndpointUrl(port: number = DEFAULT_GATEWAY_PORT): string {
    return `http://127.0.0.1:${port}/v1/models`;
  }


  private splitMessages(messages: LlmMessage[]): {
    systemPrompt: string | undefined;
    userMessages: LlmMessage[];
  } {
    const systemMsgs = messages.filter(m => m.role === "system");
    const userMessages = messages.filter(m => m.role !== "system");
    const systemPrompt = systemMsgs.length > 0
      ? systemMsgs.map(m => m.content).join("\n\n")
      : undefined;
    return { systemPrompt, userMessages };
  }

  private formatMessages(messages: LlmMessage[]): Array<{ role: string; content: string | any[] }> {
    const formatted: Array<{ role: string; content: string | any[] }> = [];

    for (const msg of messages) {
      if (msg.role === "tool") {
        // Anthropic expects tool results wrapped in a user message
        formatted.push({
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: msg.toolCallId || "unknown",
            content: msg.content,
          }],
        });
      } else if (msg.role === "assistant") {
        // Check if this is a tool_use assistant message (JSON array of tool_use blocks)
        const toolUseBlocks = this.tryParseToolUseBlocks(msg.content);
        if (toolUseBlocks) {
          formatted.push({ role: "assistant", content: toolUseBlocks });
        } else {
          formatted.push({ role: "assistant", content: msg.content });
        }
      } else {
        formatted.push({ role: "user", content: msg.content });
      }
    }

    return formatted;
  }

  private tryParseToolUseBlocks(content: string): any[] | null {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type === "tool_use") {
        return parsed;
      }
    } catch { /* not JSON — regular text content */ }
    return null;
  }
}
