import { pipeline, env } from '@xenova/transformers';

const cacheDir = process.env.TRANSFORMERS_CACHE ?? '/app/.hf-cache';
env.cacheDir = cacheDir;
env.allowLocalModels = false;

console.log('[preload] Downloading Xenova/paraphrase-multilingual-MiniLM-L12-v2 to', cacheDir);
await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
  quantized: true,
});
console.log('[preload] Done.');
