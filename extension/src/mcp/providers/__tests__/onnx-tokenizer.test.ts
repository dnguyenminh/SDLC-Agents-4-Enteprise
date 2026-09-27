/**
 * OnnxTokenizer tests — vocab loading from tokenizer.json, encode/decode, and EOS token resolution.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { OnnxTokenizer } from "../onnx-tokenizer";

let tempDir: string;

function writeTokenizer(config: unknown): string {
  const file = path.join(tempDir, `tokenizer-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}

beforeEach(() => { tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "onnx-tokenizer-test-")); });
afterEach(() => { fs.rmSync(tempDir, { recursive: true, force: true }); });

describe("OnnxTokenizer.load", () => {
  it("loads a vocab map from the model.vocab section", async () => {
    const file = writeTokenizer({
      model: { type: "BPE", vocab: { "hello": 1, "world": 2, "<|end|>": 3, " ": 8 } },
    });
    const tokenizer = await OnnxTokenizer.load(file);
    expect(tokenizer.vocabSize).toBe(4);
    expect(tokenizer.eosTokenId).toBe(3);
  });

  it("loads vocab from added_tokens when model.vocab is absent", async () => {
    const file = writeTokenizer({
      added_tokens: [
        { content: "<|system|>", id: 100 },
        { content: "<|end|>", id: 101 },
      ],
    });
    const tokenizer = await OnnxTokenizer.load(file);
    expect(tokenizer.vocabSize).toBe(2);
    expect(tokenizer.eosTokenId).toBe(101);
  });

  it("falls back to </s> and <|endoftext|> for the EOS id", async () => {
    const fallbacks = await OnnxTokenizer.load(writeTokenizer({ model: { vocab: { "</s>": 5 } } }));
    expect(fallbacks.eosTokenId).toBe(5);

    const boot = await OnnxTokenizer.load(writeTokenizer({ model: { vocab: { "<|endoftext|>": 7 } } }));
    expect(boot.eosTokenId).toBe(7);

    const none = await OnnxTokenizer.load(writeTokenizer({ model: { vocab: { "hi": 1 } } }));
    expect(none.eosTokenId).toBe(0);
  });

  it("SEC-324-02: rejects missing tokenizer files instead of leaking raw ENOENT", async () => {
    await expect(
      OnnxTokenizer.load(path.join(tempDir, "no-such-tokenizer.json")),
    ).rejects.toThrow();
  });

  it("SEC-324-02: rejects null-byte paths", async () => {
    await expect(OnnxTokenizer.load("tok\0enizer.json")).rejects.toThrow(/Invalid tokenizer path/);
  });
});

describe("OnnxTokenizer encode/decode", () => {
  it("round-trips known whitespace-delimited tokens", async () => {
    const tokenizer = await OnnxTokenizer.load(writeTokenizer({
      model: { vocab: { "hello": 1, "world": 2, " ": 8, "<|end|>": 3 } },
    }));
    expect(tokenizer.encode("hello world")).toEqual([1, 8, 2]);
    expect(tokenizer.decode([1, 8, 2])).toBe("hello world");
  });

  it("counts tokens on a sample sentence", async () => {
    const tokenizer = await OnnxTokenizer.load(writeTokenizer({
      model: { vocab: { "The": 0, "quick": 1, "brown": 2, "fox": 3, " ": 4, ".": 5, "<|end|>": 6 } },
    }));
    const ids = tokenizer.encode("The quick brown fox .");
    expect(ids).toEqual([0, 4, 1, 4, 2, 4, 3, 4, 5]);
    expect(ids.length).toBe(9);
  });

  it("falls back to character-level encoding with id 0 for out-of-vocab tokens", async () => {
    const tokenizer = await OnnxTokenizer.load(writeTokenizer({
      model: { vocab: { "known": 1, "x": 2, "y": 3, " ": 4, "<|end|>": 5 } },
    }));
    expect(tokenizer.encode("xyz")).toEqual([2, 3, 0]);
    expect(tokenizer.encode("unknown xyz")).toEqual([0, 0, 0, 0, 0, 0, 0, 4, 2, 3, 0]);
  });

  it("preserves whitespace runs in input", async () => {
    const tokenizer = await OnnxTokenizer.load(writeTokenizer({
      model: { vocab: { "a": 1, "b": 2, " ": 3, "<|end|>": 4 } },
    }));
    expect(tokenizer.encode("a  b")).toEqual([1, 3, 3, 2]);
  });

  it("decodes unknown ids as empty strings", async () => {
    const tokenizer = await OnnxTokenizer.load(writeTokenizer({
      model: { vocab: { "<|end|>": 3 } },
    }));
    expect(tokenizer.decode([3, 99, 4])).toBe("<|end|>");
  });
});