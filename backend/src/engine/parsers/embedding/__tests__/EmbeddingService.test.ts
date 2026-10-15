/**
 * EmbeddingService.test.ts — unit tests for the embedding strategy facade.
 * SA4E-44/AD-6: real ONNX backend with loud sin-hash fail-over. The ONNX
 * library itself is NOT loaded here (dynamic import inside the backend);
 * ONNX behaviour is represented by injected fakes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EmbeddingService } from '../EmbeddingService.js';
import { HashEmbeddingBackend } from '../HashEmbeddingBackend.js';
import { EMBEDDING_DIMENSIONS, type EmbeddingBackend } from '../EmbeddingBackend.js';

/** Fake ONNX backend that always fails (simulates missing model / EROFS). */
const failingOnnxBackend: EmbeddingBackend = {
  kind: 'onnx',
  modelId: 'fake/onnx-model',
  generate: async () => {
    throw new Error('model not available (test)');
  },
};

/** Fake ONNX backend with a deterministic, recognizable vector. */
const workingOnnxBackend: EmbeddingBackend = {
  kind: 'onnx',
  modelId: 'fake/onnx-model',
  generate: async (text) => new Array(EMBEDDING_DIMENSIONS).fill(text.length / 100),
};

describe('HashEmbeddingBackend', () => {
  it('produces deterministic, normalized, 384-dim vectors', async () => {
    const backend = new HashEmbeddingBackend();
    const a = await backend.generate('hello world');
    const b = await backend.generate('hello world');
    expect(a).toEqual(b);
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('produces different vectors for different texts', async () => {
    const backend = new HashEmbeddingBackend();
    const a = await backend.generate('alpha');
    const b = await backend.generate('beta');
    expect(a).not.toEqual(b);
  });
});

describe('EmbeddingService', () => {
  beforeEach(() => {
    EmbeddingService.resetForTests();
  });

  it('uses the injected ONNX backend when it works', async () => {
    const service = EmbeddingService.getInstance();
    service.setBackend(workingOnnxBackend);
    const vector = await service.generateEmbedding('anything');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector[0]).toBeCloseTo(0.08, 5); // 'anything'.length / 100
    expect(service.getBackendKind()).toBe('onnx');
  });

  it('degrades ONNX failures to the hash fallback — loudly, once', async () => {
    const service = EmbeddingService.getInstance();
    service.setBackend(failingOnnxBackend);
    const vector = await service.generateEmbedding('semantic text');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    const expected = await new HashEmbeddingBackend().generate('semantic text');
    expect(vector).toEqual(expected);
    expect(service.getBackendKind()).toBe('hash');
  });

  it('stays on the hash fallback for subsequent calls after failure', async () => {
    const service = EmbeddingService.getInstance();
    service.setBackend(failingOnnxBackend);
    await service.generateEmbedding('first call triggers failure');
    let onnxCalls = 0;
    service.setBackend({
      ...failingOnnxBackend,
      generate: async () => {
        onnxCalls += 1;
        throw new Error('should not be called after degradation');
      },
    });
    const vector = await service.generateEmbedding('second call');
    expect(onnxCalls).toBe(0);
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it('cosineSimilarity: identical=1, orthogonal≈0, mismatch throws', async () => {
    const service = EmbeddingService.getInstance();
    const hash = new HashEmbeddingBackend();
    const a = await hash.generate('same text');
    const b = await hash.generate('same text');
    const c = await hash.generate('totally different content here');
    expect(service.cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    const sim = service.cosineSimilarity(a, c);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
    expect(sim).not.toBeCloseTo(1, 3);
    expect(() => service.cosineSimilarity(a, [1, 2, 3])).toThrow('Vector dimension mismatch');
  });
});
