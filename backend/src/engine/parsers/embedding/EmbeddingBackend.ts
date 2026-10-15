/**
 * EmbeddingBackend.ts — strategy interface for embedding vector generation.
 *
 * SA4E-44 / AD-6: the service previously shipped ONLY a sin-hash pseudo-
 * embedding fallback (deterministic but semantically meaningless). Real
 * inference is provided by OnnxEmbeddingBackend (transformers.js on
 * onnxruntime-node, CPU); the hash backend remains an explicitly-logged
 * degraded fallback so indexing/search pipelines never crash when the model
 * is unavailable.
 */

/** Canonical vector size — pgvector schema and DB blobs assume this dimension. */
export const EMBEDDING_DIMENSIONS = 384;

export type EmbeddingBackendKind = 'onnx' | 'hash';

export interface EmbeddingBackend {
  /** Backend identifier — surfaced via admin config (`embedding.backend`). */
  readonly kind: EmbeddingBackendKind;
  /** Model identifier actually in use (sentinel name for the hash backend). */
  readonly modelId: string;
  /** Generate an EMBEDDING_DIMENSIONS-sized, L2-normalized vector for `text`. */
  generate(text: string): Promise<number[]>;
}
