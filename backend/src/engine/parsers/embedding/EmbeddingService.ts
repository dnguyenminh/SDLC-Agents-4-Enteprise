import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';

// Point cache to pre-baked model directory (set via TRANSFORMERS_CACHE in Dockerfile)
if (process.env.TRANSFORMERS_CACHE) {
  (env as any).cacheDir = process.env.TRANSFORMERS_CACHE;
}
(env as any).allowLocalModels = false;

export class EmbeddingService {
  private static instance: EmbeddingService;
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
  private readonly modelName = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

  private constructor() {}

  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Initialize the pipeline. This downloads the model on first run.
   */
  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.extractorPromise = pipeline('feature-extraction', this.modelName, {
        quantized: true, // Use quantized model for performance
      }) as Promise<FeatureExtractionPipeline>;
    }
    return this.extractorPromise;
  }

  /**
   * Generates a dense vector embedding for the given text.
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    const extractor = await this.getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    
    // Output tensor data is Float32Array
    const data = output.data;
    const array = new Array(data.length);
    for (let i = 0; i < data.length; i++) {
      array[i] = data[i];
    }
    return array;
  }

  /**
   * Calculates cosine similarity between two vectors.
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
}
