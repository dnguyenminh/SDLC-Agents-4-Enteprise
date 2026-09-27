/**
 * OnnxProvider tests — availability checks, prompt formatting, generation/streaming with mocked model, and disposal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { OnnxProvider } from "../onnx-provider";

const onnxMocks = vi.hoisted(() => {
  class MockTensor {
    data: unknown;
    constructor(_type: string, data: unknown) { this.data = data; }
  }
  const InferenceSession = { create: vi.fn() };
  return { MockTensor, InferenceSession };
});

vi.mock("onnxruntime-node", () => ({
  Tensor: onnxMocks.MockTensor,
  InferenceSession: onnxMocks.InferenceSession,
}));

let tempDirs: string[] = [];

function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onnx-provider-test-"));
  tempDirs.push(dir);
  return dir;
}

function makeModelProvider(modelId = "phi-3-mini"): { dir: string; provider: OnnxProvider } {
  const dir = mkTmp();
  const modelDir = path.join(dir, ".code-intel", "models", "llm", modelId);
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(path.join(modelDir, "model.onnx"), "fake-model");
  fs.writeFileSync(path.join(modelDir, "tokenizer.json"), JSON.stringify({ model: { vocab: { a: 1 } } }));
  return { dir, provider: new OnnxProvider(dir, modelId) };
}

function mockTokenizer(): any {
  return {
    encode: vi.fn().mockReturnValue([1, 2, 3, 4, 5]),
    decode: vi.fn((ids: number[]) => ids.map(() => "tok").join("")),
    eosTokenId: 999,
    vocabSize: 3,
  };
}

const FLAT_LOGITS = () => new Float32Array([1, 1, 1]);

afterEach(() => {
  for (const dir of tempDirs) { fs.rmSync(dir, { recursive: true, force: true }); }
  tempDirs = [];
  vi.restoreAllMocks();
});

describe("OnnxProvider — isAvailable", () => {
  it("reports available when the model file exists on disk", async () => {
    const { provider } = makeModelProvider();
    await expect(provider.isAvailable()).resolves.toBe(true);
  });

  it("reports unavailable when the model file is missing", async () => {
    const dir = mkTmp();
    const provider = new OnnxProvider(dir, "phi-3-mini");
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it("reports unavailable for unknown model ids", async () => {
    const { provider } = makeModelProvider("ghost-model");
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it("reports unavailable when tokenizer.json is missing (SEC-324-02)", async () => {
    const dir = mkTmp();
    const modelDir = path.join(dir, ".code-intel", "models", "llm", "phi-3-mini");
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, "model.onnx"), "fake-model");
    const provider = new OnnxProvider(dir, "phi-3-mini");
    await expect(provider.isAvailable()).resolves.toBe(false);
  });

  it("defaults to a 2048-token context window", () => {
    expect(makeModelProvider().provider.getContextWindow()).toBe(2048);
  });
});

describe("OnnxProvider — SEC-324-02 modelId traversal guard", () => {
  it("rejects path traversal ids at construction", () => {
    const dir = mkTmp();
    expect(() => new OnnxProvider(dir, "../evil")).toThrow(/Invalid modelId/);
    expect(() => new OnnxProvider(dir, "../../.ssh/id_rsa")).toThrow(/Invalid modelId/);
    expect(() => new OnnxProvider(dir, "a/b")).toThrow(/Invalid modelId/);
    expect(() => new OnnxProvider(dir, "/absolute/path")).toThrow(/Invalid modelId/);
  });

  it("rejects empty, uppercase, and separator ids", () => {
    const dir = mkTmp();
    expect(() => new OnnxProvider(dir, "")).not.toThrow(); // empty falls back to default
    expect(() => new OnnxProvider(dir, "Phi-3-Mini")).toThrow(/Invalid modelId/);
    expect(() => new OnnxProvider(dir, "model\\evil")).toThrow(/Invalid modelId/);
    expect(() => new OnnxProvider(dir, "..")).toThrow(/Invalid modelId/);
  });

  it("accepts registry ids with dots, hyphens, underscores", () => {
    const dir = mkTmp();
    expect(() => new OnnxProvider(dir, "phi-3-mini")).not.toThrow();
    expect(() => new OnnxProvider(dir, "smollm2-360m")).not.toThrow();
  });

  it("resolveModelDir contains the model dir under the models base", async () => {
    const { default: pathMod } = await import("path");
    const { resolveModelDir } = await import("../onnx-provider");
    const dir = mkTmp();
    const resolved = resolveModelDir(dir, "phi-3-mini");
    const base = pathMod.resolve(dir, ".code-intel", "models", "llm");
    expect(resolved.startsWith(base + pathMod.sep)).toBe(true);
  });
});

describe("OnnxProvider — prompt formatting", () => {
  it("formats messages with the Phi-3 chat template", () => {
    const { provider } = makeModelProvider();
    const prompt = (provider as any).formatPrompt([
      { role: "system", content: "sys" },
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]);
    expect(prompt).toBe(
      "<|system|>\nsys<|end|>\n<|user|>\nq<|end|>\n<|assistant|>\na<|end|>\n<|assistant|>\n",
    );
  });

  it("passes unexpected roles through as bare content", () => {
    const { provider } = makeModelProvider();
    const prompt = (provider as any).formatPrompt([{ role: "tool", content: "res" }]);
    expect(prompt).toBe("res\n<|assistant|>\n");
  });
});

describe("OnnxProvider — chat generation", () => {
  it("rejects with a clear error for unknown models", async () => {
    const provider = new OnnxProvider(mkTmp(), "ghost-model");
    await expect(provider.chat([{ role: "user", content: "hi" }])).rejects.toThrow("Unknown ONNX model: ghost-model");
  });

  it("uses the mocked tokenizer and session to generate a bounded response", async () => {
    const { provider } = makeModelProvider();
    const tokenizer = mockTokenizer();
    const session = { run: vi.fn().mockResolvedValue({ logits: { data: FLAT_LOGITS() } }) };
    (provider as any).tokenizer = tokenizer;
    (provider as any).session = session;
    vi.spyOn(Math, "random").mockReturnValue(0);

    const out = await provider.chat([{ role: "user", content: "hi" }], { maxTokens: 3 });

    expect(tokenizer.encode).toHaveBeenCalledWith(expect.stringContaining("<|user|>"));
    expect(session.run).toHaveBeenCalledTimes(3);
    expect(out).toBe("toktoktok");
  });

  it("stops generation early when the EOS token is sampled", async () => {
    const { provider } = makeModelProvider();
    const tokenizer = mockTokenizer();
    tokenizer.eosTokenId = 0;
    (provider as any).tokenizer = tokenizer;
    const session = { run: vi.fn().mockResolvedValue({ logits: { data: FLAT_LOGITS() } }) };
    (provider as any).session = session;
    vi.spyOn(Math, "random").mockReturnValue(0);

    const out = await provider.chat([{ role: "user", content: "hi" }], { maxTokens: 10 });

    expect(session.run).toHaveBeenCalledTimes(1);
    expect(out).toBe("");
  });
});

describe("OnnxProvider — chatStream", () => {
  it("yields per-token decoded text chunks", async () => {
    const { provider } = makeModelProvider();
    const tokenizer = mockTokenizer();
    (provider as any).tokenizer = tokenizer;
    (provider as any).session = { run: vi.fn().mockResolvedValue({ logits: { data: FLAT_LOGITS() } }) };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const tokens: string[] = [];
    for await (const token of provider.chatStream([{ role: "user", content: "hi" }], { maxTokens: 2 })) {
      tokens.push(token);
    }
    expect(tokens).toEqual(["tok", "tok"]);
  });

  it("yields nothing when the first sampled token is the EOS token", async () => {
    const { provider } = makeModelProvider();
    const tokenizer = mockTokenizer();
    tokenizer.eosTokenId = 0;
    (provider as any).tokenizer = tokenizer;
    (provider as any).session = { run: vi.fn().mockResolvedValue({ logits: { data: FLAT_LOGITS() } }) };
    vi.spyOn(Math, "random").mockReturnValue(0);

    const tokens: string[] = [];
    for await (const token of provider.chatStream([{ role: "user", content: "hi" }], { maxTokens: 5 })) {
      tokens.push(token);
    }
    expect(tokens).toEqual([]);
  });
});

describe("OnnxProvider — dispose", () => {
  it("releases the session and clears the tokenizer", () => {
    const { provider } = makeModelProvider();
    const release = vi.fn();
    (provider as any).session = { release };
    (provider as any).tokenizer = {};

    provider.dispose();

    expect(release).toHaveBeenCalledTimes(1);
    expect((provider as any).session).toBeNull();
    expect((provider as any).tokenizer).toBeNull();
  });

  it("dispose is safe when nothing is loaded", () => {
    const { provider } = makeModelProvider();
    expect(() => provider.dispose()).not.toThrow();
  });
});