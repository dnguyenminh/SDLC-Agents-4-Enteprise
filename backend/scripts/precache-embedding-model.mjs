/**
 * precache-embedding-model.mjs — AD-6 (SA4E-44) build-time model pre-cache.
 *
 * Downloads the ONNX embedding model into TRANSFORMERS_CACHE so the runtime
 * image serves real semantic embeddings fully offline (EmbeddingService reads
 * the same cache dir at runtime). Runs inside the Docker `build` stage only —
 * node_modules and network are available there, never at runtime.
 *
 * Usage (Dockerfile):
 *   TRANSFORMERS_CACHE=/app/models-cache node scripts/precache-embedding-model.mjs
 *
 * Fails the build on error: a "baked" image must genuinely contain the model
 * (fail-fast, no silent empty cache).
 */
import { pipeline, env } from '@huggingface/transformers';

const modelId = process.env.CODE_INTEL_EMBEDDING_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const cacheDir = process.env.TRANSFORMERS_CACHE || '/app/models-cache';

env.cacheDir = cacheDir;
// The cache populated here is the single source of truth for the runtime.
env.allowLocalModels = false;

console.log(`[precache] model=${modelId} cache=${cacheDir} (q8, cpu)`);
const extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8', device: 'cpu' });
const output = await extractor('embedding model pre-cache smoke test', { pooling: 'mean', normalize: true });
console.log(`[precache] OK — dims=${output.data.length}`);
