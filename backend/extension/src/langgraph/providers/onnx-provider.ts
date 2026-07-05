/**
 * OnnxProvider --- KSA-223
 * CPU-only local LLM provider using ONNX Runtime.
 * Extends BaseLlmProvider; overrides isAvailable() directly (file-based, not HTTP).
 */
import * as path from "path";
import type { LlmMessage, LlmOptions } from "../llm-provider";
import { BaseLlmProvider } from "./BaseLlmProvider";
import { OnnxTokenizer } from "./onnx-tokenizer";

const DEFAULT_MODEL_ID = "phi-3-mini";
const MAX_CONTEXT_TOKENS = 2048;
const MAX_NEW_TOKENS = 512;

export interface OnnxModelConfig {
  id: string;
  displayName: string;
  files: string[];
  tokenizerFile: string;
  modelFile: string;
  contextLength: number;
}

export const ONNX_MODEL_REGISTRY: OnnxModelConfig[] = [
  { id: "phi-3-mini", displayName: "Phi-3 Mini (3.8B, Q4)", files: ["model.onnx", "model.onnx.data", "tokenizer.json", "tokenizer_config.json"], tokenizerFile: "tokenizer.json", modelFile: "model.onnx", contextLength: 2048 },
  { id: "smollm2-360m", displayName: "SmolLM2 (360M, FP16)", files: ["model.onnx", "tokenizer.json", "tokenizer_config.json"], tokenizerFile: "tokenizer.json", modelFile: "model.onnx", contextLength: 2048 },
];

export class OnnxProvider extends BaseLlmProvider {
  readonly type = "ollama" as const; // kept for backward compat
  private session: any = null;
  private tokenizer: OnnxTokenizer | null = null;
  private readonly modelDir: string;
  private readonly modelId: string;

  constructor(workspaceRoot: string, modelId?: string) {
    super();
    this.modelId = modelId || DEFAULT_MODEL_ID;
    this.modelDir = path.join(workspaceRoot, ".code-intel", "models", "llm", this.modelId);
    this.contextWindowTokens = MAX_CONTEXT_TOKENS;
  }

  async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
    await this.ensureLoaded();
    const prompt = this.formatPrompt(messages);
    const inputIds = this.tokenizer!.encode(prompt);
    const truncated = inputIds.slice(-Math.min(inputIds.length, MAX_CONTEXT_TOKENS));
    const generated = await this.generate(truncated, options?.maxTokens || MAX_NEW_TOKENS, options?.temperature ?? 0.7);
    return this.tokenizer!.decode(generated);
  }

  async *chatStream(messages: LlmMessage[], options?: LlmOptions): AsyncGenerator<string> {
    await this.ensureLoaded();
    const prompt = this.formatPrompt(messages);
    const inputIds = this.tokenizer!.encode(prompt);
    const truncated = inputIds.slice(-Math.min(inputIds.length, MAX_CONTEXT_TOKENS));
    let currentIds = [...truncated];
    const maxTokens = options?.maxTokens || MAX_NEW_TOKENS;
    for (let i = 0; i < maxTokens; i++) {
      const nextToken = await this.predictNext(currentIds, options?.temperature ?? 0.7);
      if (nextToken === this.tokenizer!.eosTokenId) break;
      currentIds.push(nextToken);
      const text = this.tokenizer!.decode([nextToken]);
      if (text) yield text;
    }
  }

  /** Override isAvailable directly — file-based check, not HTTP */
  async isAvailable(): Promise<boolean> {
    try {
      const fs = await import("fs");
      const modelConfig = ONNX_MODEL_REGISTRY.find(m => m.id === this.modelId);
      if (!modelConfig) return false;
      return fs.existsSync(path.join(this.modelDir, modelConfig.modelFile));
    } catch { return false; }
  }

  dispose(): void {
    if (this.session) { this.session.release?.(); this.session = null; }
    this.tokenizer = null;
  }

  // --- Abstract stubs (unused because isAvailable is overridden) ---
  protected async isConfigured(): Promise<boolean> { return true; }
  protected getHealthCheckUrl(): string { return ""; }

  // --- Private helpers ---

  private async ensureLoaded(): Promise<void> {
    if (this.session && this.tokenizer) return;
    const modelConfig = ONNX_MODEL_REGISTRY.find(m => m.id === this.modelId);
    if (!modelConfig) { throw new Error(`Unknown ONNX model: ${this.modelId}`); }
    this.tokenizer = await OnnxTokenizer.load(path.join(this.modelDir, modelConfig.tokenizerFile));
    const ort = await import("onnxruntime-node" as string).catch(() => null);
    if (!ort) { throw new Error("onnxruntime-node not available"); }
    this.session = await ort.InferenceSession.create(
      path.join(this.modelDir, modelConfig.modelFile),
      { executionProviders: ["cpu"], graphOptimizationLevel: "all" },
    );
  }

  private async generate(inputIds: number[], maxNewTokens: number, temperature: number): Promise<number[]> {
    const generated: number[] = [];
    let currentIds = [...inputIds];
    for (let i = 0; i < maxNewTokens; i++) {
      const nextToken = await this.predictNext(currentIds, temperature);
      if (nextToken === this.tokenizer!.eosTokenId) break;
      generated.push(nextToken);
      currentIds.push(nextToken);
    }
    return generated;
  }

  private async predictNext(inputIds: number[], temperature: number): Promise<number> {
    const ort = await import("onnxruntime-node" as string);
    const inputTensor = new ort.Tensor("int64", BigInt64Array.from(inputIds.map(id => BigInt(id))), [1, inputIds.length]);
    const attentionMask = new ort.Tensor("int64", BigInt64Array.from(inputIds.map(() => 1n)), [1, inputIds.length]);
    const results = await this.session.run({ input_ids: inputTensor, attention_mask: attentionMask });
    const logits = results.logits?.data || results[Object.keys(results)[0]]?.data;
    if (!logits) throw new Error("ONNX model did not return logits");
    const lastTokenLogits = Array.from(logits).slice(-this.tokenizer!.vocabSize) as number[];
    return this.sample(lastTokenLogits, temperature);
  }

  private sample(logits: number[], temperature: number): number {
    if (temperature <= 0.01) return logits.indexOf(Math.max(...logits));
    const scaled = logits.map(l => l / temperature);
    const maxLogit = Math.max(...scaled);
    const exps = scaled.map(l => Math.exp(l - maxLogit));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map(e => e / sumExps);
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (rand < cumulative) return i;
    }
    return probs.length - 1;
  }

  private formatPrompt(messages: LlmMessage[]): string {
    return messages.map(m => {
      switch (m.role) {
        case "system": return `<|system|>\n${m.content}<|end|>`;
        case "user": return `<|user|>\n${m.content}<|end|>`;
        case "assistant": return `<|assistant|>\n${m.content}<|end|>`;
        default: return m.content;
      }
    }).join("\n") + "\n<|assistant|>\n";
  }
}
