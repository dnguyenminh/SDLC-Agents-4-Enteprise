// StreamHandler --- KSA-231 --- SSE parser for Kiro API streaming responses

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "message_stop"; usage?: { input_tokens: number; output_tokens: number } };


export class StreamHandler {
  async *processStream(
    response: Response,
    signal?: AbortSignal
  ): AsyncGenerator<string> {
    if (!response.body) {
      throw new KiroStreamError("Response has no body for streaming");
    }

    const reader = (response.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;

    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) { break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) { continue; }

          const data = trimmed.slice(6);
          if (data === "[DONE]") { return; }

          try {
            const parsed = JSON.parse(data);
            const text = this.extractTextDelta(parsed);
            if (text) {
              yield text;
              chunkCount++;

              // Backpressure: yield microtask boundary every 100 chunks
              if (chunkCount % 100 === 0) {
                await Promise.resolve();
              }
            }

            // Check for message_stop
            if (parsed.type === "message_stop") { return; }
          } catch {
            // Skip malformed SSE data — continue processing
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async *processStreamWithToolUse(
    response: Response,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    if (!response.body) {
      throw new KiroStreamError("Response has no body for streaming");
    }

    const reader = (response.body as any).getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const decoder = new TextDecoder();
    let buffer = "";
    let chunkCount = 0;

    // Track tool_use blocks being assembled
    const toolBlocks = new Map<number, { id: string; name: string; jsonBuffer: string }>();

    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) { break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) { continue; }

          const data = trimmed.slice(6);
          if (data === "[DONE]") { return; }

          try {
            const parsed = JSON.parse(data);

            // content_block_start for tool_use
            if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
              toolBlocks.set(parsed.index, {
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                jsonBuffer: "",
              });
              continue;
            }

            // content_block_delta for text
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              const text = parsed.delta.text;
              if (text) {
                yield { type: "text", text };
                chunkCount++;
                if (chunkCount % 100 === 0) { await Promise.resolve(); }
              }
              continue;
            }

            // content_block_delta for tool_use input JSON
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
              const block = toolBlocks.get(parsed.index);
              if (block) {
                block.jsonBuffer += parsed.delta.partial_json || "";
              }
              continue;
            }

            // content_block_stop — emit tool_use if we were building one
            if (parsed.type === "content_block_stop") {
              const block = toolBlocks.get(parsed.index);
              if (block) {
                let input: Record<string, unknown> = {};
                try { input = JSON.parse(block.jsonBuffer); } catch { /* empty */ }
                yield { type: "tool_use", id: block.id, name: block.name, input };
                toolBlocks.delete(parsed.index);
              }
              continue;
            }

            // message_delta — contains usage info
            if (parsed.type === "message_delta") {
              // We don't yield this — it comes before message_stop
              continue;
            }

            // message_stop
            if (parsed.type === "message_stop") {
              yield { type: "message_stop", usage: parsed.usage };
              return;
            }
          } catch {
            // Skip malformed SSE data
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }


  private extractTextDelta(parsed: any): string | null {
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      return parsed.delta.text || null;
    }
    return null;
  }
}


export class KiroStreamError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "KiroStreamError";
  }
}
