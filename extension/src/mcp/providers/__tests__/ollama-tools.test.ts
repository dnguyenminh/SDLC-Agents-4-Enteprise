/**
 * Ollama tool-calling adapter tests — request shaping, tool call mapping, and error handling.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaChatWithTools } from "../ollama-tools";

function jsonResponse(body: unknown, status = 200): any {
  return { ok: status >= 200 && status < 400, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

function stubFetch(impl: (url: string, init: any) => any): ReturnType<typeof vi.fn> {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("ollamaChatWithTools", () => {
  it("shapes the /api/chat request with tools and passes messages through formatMessages", async () => {
    const fetchMock = stubFetch(async (url: string, init: any) => {
      expect(url).toBe("http://localhost:11434/api/chat");
      const body = JSON.parse(init.body);
      expect(body.model).toBe("llama3.2");
      expect(body.stream).toBe(false);
      expect(body.tools).toEqual([
        { type: "function", function: { name: "search", description: "Search", parameters: { type: "object" } } },
      ]);
      expect(body.messages).toEqual([{ role: "user", content: "find docs" }]);
      expect(body.options).toEqual({ temperature: 0.3 });
      return jsonResponse({ message: { content: "here" } });
    });

    const res = await ollamaChatWithTools(
      "http://localhost:11434",
      "llama3.1",
      [{ role: "user", content: "find docs" }],
      [{ name: "search", description: "Search", inputSchema: { type: "object" } }],
      { model: "llama3.2", temperature: 0.3 },
      (msgs) => msgs.map(m => ({ role: m.role, content: m.content })),
    );

    expect(res).toEqual({ type: "text", text: "here" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeUndefined();
  });

  it("maps message.tool_calls into LlmToolCalls with generated ids", async () => {
    stubFetch(async () => jsonResponse({
      message: {
        content: "",
        tool_calls: [
          { function: { name: "f1", arguments: { a: 1 } } },
          { function: { name: "f2", arguments: {} } },
        ],
      },
    }));

    const res = await ollamaChatWithTools("http://localhost:11434", "m", [], []);
    expect(res.type).toBe("tool_use");
    expect(res.toolCalls).toHaveLength(2);
    expect(res.toolCalls?.[0]).toMatchObject({ name: "f1", arguments: { a: 1 } });
    expect(res.toolCalls?.[0]?.id).toMatch(/^ollama-tc-\d+-\d+$/);
    expect(res.toolCalls?.[1]?.name).toBe("f2");
  });

  it("returns a text response when the model makes no tool calls", async () => {
    stubFetch(async () => jsonResponse({ message: { content: "plain answer" } }));
    const res = await ollamaChatWithTools("http://localhost:11434", "m", [{ role: "user", content: "q" }], []);
    expect(res).toEqual({ type: "text", text: "plain answer" });
  });

  it("falls back to a basic role/content mapping when no formatMessages is supplied", async () => {
    const fetchMock = stubFetch(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      expect(body.messages).toEqual([
        { role: "user", content: "q" },
        { role: "tool", content: "res" },
      ]);
      return jsonResponse({ message: { content: "ok" } });
    });

    await ollamaChatWithTools("http://localhost:11434", "m", [
      { role: "user", content: "q" },
      { role: "tool", content: "res", toolCallId: "call-1" },
    ], []);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a descriptive error on HTTP failures", async () => {
    stubFetch(async () => ({ ok: false, status: 500, text: async () => "server error", json: async () => ({}) }));
    await expect(ollamaChatWithTools("http://localhost:11434", "m", [], [])).rejects.toThrow(
      "Ollama API error 500: server error",
    );
  });

  it("defaults to the provided default model when no model option is given", async () => {
    const fetchMock = stubFetch(async (_url: string, init: any) => {
      expect(JSON.parse(init.body).model).toBe("llama3.1");
      return jsonResponse({ message: { content: "ok" } });
    });
    await ollamaChatWithTools("http://localhost:11434", "llama3.1", [{ role: "user", content: "q" }], []);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});