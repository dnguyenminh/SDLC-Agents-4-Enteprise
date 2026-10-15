import pino from 'pino';
import { loadConfig } from '../../../config/index.js';
import type { EmbeddingBackend, EmbeddingBackendKind } from './EmbeddingBackend.js';
import { HashEmbeddingBackend } from './HashEmbeddingBackend.js';
import { OnnxEmbeddingBackend } from './OnnxEmbeddingBackend.js';

/**
 * EmbeddingService — facade over pluggable EmbeddingBackend strategies.
 *
 * SA4E-44 / AD-6: the previous implementation was ONLY the sin-hash fallback
 * (no semantic quality). It now defaults to real ONNX inference
 * (Xenova/paraphrase-multilingual-MiniLM-L12-v2, 384 dims, q8) via
 * transformers.js and degrades to the hash backend ONLY when model loading or
 * inference fails — logged loudly once, never silently. Call sites
 * (TaskWorker, MemoryToolSearchService, ReindexService, LLMInitializer,
 * index.ts tool ingestion) keep the original API.
 *
 * IMPORTANT: vectors from the two backends are NOT comparable. Switching
 * backends invalidates stored vectors — run a full reindex so old (hash) and
 * new (onnx) vectors are never mixed in similarity comparisons. The active
 * backend is exposed to operators via admin config (`embedding.backend`).
 */
export class EmbeddingService {
  private static instance: EmbeddingService;

  private readonly hash = new HashEmbeddingBackend();
  private readonly logger = pino({ name: 'embedding-service' });
  private injectedBackend?: EmbeddingBackend;
  private onnxBackend?: OnnxEmbeddingBackend;
  private onnxFailed = false;

  private constructor() {}

  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Test/DI seam — replaces backend resolution entirely. An injected backend
   * of kind 'onnx' still participates in the fail-over path (see generate).
   */
  public setBackend(backend: EmbeddingBackend): void {
    this.injectedBackend = backend;
  }

  /** Reset singleton state between unit tests (cheap, non-circular). */
  public static resetForTests(): void {
    EmbeddingService.instance = new EmbeddingService();
  }

  /** Active backend kind without triggering model loading. */
  public getBackendKind(): EmbeddingBackendKind {
    if (this.onnxFailed) return 'hash';
    return this.injectedBackend?.kind ?? 'onnx';
  }

  /**
   * Generate an embedding vector for `text`. On ONNX failure, permanently
   * degrades to the hash fallback for this process lifetime (restart to retry)
   * so indexing/search pipelines never crash — the degradation is logged at
   * error level exactly once.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    const backend = this.resolveBackend();
    try {
      return await backend.generate(text);
    } catch (err) {
      if (backend.kind === 'onnx') {
        this.onnxFailed = true;
        this.logger.error(
          { err, modelId: backend.modelId },
          'ONNX embedding backend failed — degrading to sin-hash pseudo-embeddings (semantic quality lost) until restart. Check TRANSFORMERS_CACHE / model availability.',
        );
        return this.hash.generate(text);
      }
      throw err;
    }
  }

  /**
   * Cosine similarity between two equal-length vectors.
   * Throws on dimension mismatch rather than returning a wrong score.
   */
  public cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) throw new Error('Vector dimension mismatch');
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /** Resolution order: failed→hash, injected, lazy ONNX (config-driven). */
  private resolveBackend(): EmbeddingBackend {
    if (this.onnxFailed) return this.hash;
    if (this.injectedBackend) return this.injectedBackend;
    if (!this.onnxBackend) {
      const cfg = loadConfig();
      this.onnxBackend = new OnnxEmbeddingBackend({
        modelId: cfg.embeddingModelId,
        cacheDir: cfg.embeddingCacheDir,
        quantized: cfg.embeddingQuantized,
        logger: this.logger,
      });
    }
    return this.onnxBackend;
  }
}
