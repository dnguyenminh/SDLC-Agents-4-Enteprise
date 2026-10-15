import type { Logger } from 'pino';
import { EMBEDDING_DIMENSIONS, type EmbeddingBackend } from './EmbeddingBackend.js';

/**
 * Minimal structural view of the `@huggingface/transformers` module surface we
 * use. Declared locally (instead of importing library types) so the tsc build
 * does not depend on the library's version-specific type exports. The library
 * is imported DYNAMICALLY in initialize() so process startup and unit tests
 * never pay the native onnxruntime load cost.
 */
interface TransformersModule {
  env: { cacheDir: string; allowLocalModels: boolean };
  pipeline: (
    task: 'feature-extraction',
    modelId: string,
    options: { dtype: string; device: string },
  ) => Promise<FeatureExtractor>;
}

type FeatureExtractor = (
  text: string,
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

export interface OnnxEmbeddingOptions {
  /** HF hub model id — must export EMBEDDING_DIMENSIONS-sized vectors. */
  modelId: string;
  /** Filesystem cache dir (baked image cache or on-first-use download target). */
  cacheDir: string;
  /** Quantized (q8) ONNX weights — ~3x smaller, near-identical quality. */
  quantized: boolean;
  logger: Logger;
}

/**
 * OnnxEmbeddingBackend — real semantic embeddings via transformers.js
 * (onnxruntime-node, CPU, mean pooling + L2 normalization). Initialization is
 * memoized; concurrent callers share a single pipeline promise.
 */
export class OnnxEmbeddingBackend implements EmbeddingBackend {
  readonly kind = 'onnx' as const;
  readonly modelId: string;

  private readonly cacheDir: string;
  private readonly quantized: boolean;
  private readonly logger: Logger;
  private initPromise?: Promise<FeatureExtractor>;

  constructor(options: OnnxEmbeddingOptions) {
    this.modelId = options.modelId;
    this.cacheDir = options.cacheDir;
    this.quantized = options.quantized;
    this.logger = options.logger;
  }

  public async generate(text: string): Promise<number[]> {
    const extractor = await this.loadOnce();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data);
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: model ${this.modelId} returned ${vector.length}, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
    return vector;
  }

  /** Memoized one-time pipeline load (cache-first: no network on cache hit). */
  private loadOnce(): Promise<FeatureExtractor> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  private async initialize(): Promise<FeatureExtractor> {
    // Library boundary cast — see TransformersModule doc comment.
    const mod = (await import('@huggingface/transformers')) as unknown as TransformersModule;
    mod.env.cacheDir = this.cacheDir;
    // Never resolve from the workspace ./models/ dir — the cache (baked into
    // the image or downloaded on first use) is the single source of truth.
    mod.env.allowLocalModels = false;
    this.logger.info(
      { modelId: this.modelId, cacheDir: this.cacheDir, dtype: this.quantized ? 'q8' : 'fp32' },
      'Loading ONNX embedding model',
    );
    return mod.pipeline('feature-extraction', this.modelId, {
      dtype: this.quantized ? 'q8' : 'fp32',
      device: 'cpu',
    });
  }
}
