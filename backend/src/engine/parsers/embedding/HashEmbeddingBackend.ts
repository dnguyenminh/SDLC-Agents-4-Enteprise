import { EMBEDDING_DIMENSIONS, type EmbeddingBackend } from './EmbeddingBackend.js';

/**
 * HashEmbeddingBackend — deterministic sin-hash pseudo-embedding (fallback).
 *
 * NOT semantically meaningful: similar texts do NOT get similar vectors.
 * Retained as a degraded mode so indexing/search pipelines keep working when
 * the ONNX model cannot be loaded; every activation is logged as an error by
 * EmbeddingService (never silent). Vector size: EMBEDDING_DIMENSIONS.
 */
export class HashEmbeddingBackend implements EmbeddingBackend {
  readonly kind = 'hash' as const;
  readonly modelId = 'sin-hash-fallback';

  public async generate(text: string): Promise<number[]> {
    const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    const seed = Math.abs(hash);
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      const x = Math.sin(seed + i * 12.9898) * 43758.5453;
      vector[i] = x - Math.floor(x);
    }
    // Normalize (unit length) so cosine similarity stays well-defined.
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }
}
