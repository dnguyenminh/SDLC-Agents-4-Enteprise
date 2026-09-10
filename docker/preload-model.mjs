// Pre-downloads Xenova/paraphrase-multilingual-MiniLM-L12-v2 into the HF cache
// so the image works fully offline at runtime.
import { pipeline, env } from '@xenova/transformers';

// Use default cacheDir (.cache/ inside the package dir) so the downloaded
// model is included automatically when node_modules is copied to production.
env.allowLocalModels = false;

console.log('[preload] Downloading Xenova/paraphrase-multilingual-MiniLM-L12-v2 (quantized)...');
const extractor = await pipeline(
  'feature-extraction',
  'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  { quantized: true },
);

console.log('[preload] Running warm-up inference...');
await extractor('warm-up', { pooling: 'mean', normalize: true });

console.log('[preload] Model ready and cached.');
