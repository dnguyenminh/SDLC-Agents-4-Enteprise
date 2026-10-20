// Shared test setup for PegaMetaModelCompiler test split (verbatim from original suite).
import path from 'path';
import { fileURLToPath } from 'url';
import { PegaMetaModelLoader, PegaMetaModelRegistry, PegaMetaModelCompiler } from '../../metamodel/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const schemasDir = path.resolve(__dirname, '../../schemas');

export async function setupMetaModel(): Promise<{
  loader: PegaMetaModelLoader;
  metaRegistry: PegaMetaModelRegistry;
  compiler: PegaMetaModelCompiler;
}> {
  const loader = new PegaMetaModelLoader();
  await loader.loadSchemaDirectory(schemasDir);

  const metaRegistry = PegaMetaModelRegistry.getInstance();
  // Ensure fresh state
  await metaRegistry.initialize(schemasDir);

  const compiler = new PegaMetaModelCompiler(metaRegistry);

  return { loader, metaRegistry, compiler };
}
