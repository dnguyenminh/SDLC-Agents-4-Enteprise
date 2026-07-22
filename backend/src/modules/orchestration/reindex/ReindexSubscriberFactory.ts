/**
 * SA4E-42 — assembles a ReindexSubscriber from the orchestration collaborators.
 * SA4E-53: DbProvider returns DatabaseAdapter (not raw SQLite handle).
 * The memory adapter is resolved lazily at event time (IR-8): modules initialize in
 * parallel, so the handle must never be captured at construction.
 */
import type { Logger } from 'pino';
import { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import type { ModuleRegistry } from '../../ModuleRegistry.js';
import type { MemoryModule } from '../../memory/MemoryModule.js';
import type { McpClientManager } from '../McpClientManager.js';
import type { DbProvider } from './models/ports.js';
import { ReindexActionMapper } from './ReindexActionMapper.js';
import { PerServerTaskQueue } from './PerServerTaskQueue.js';
import { ReindexService } from './ReindexService.js';
import { ReindexSubscriber } from './ReindexSubscriber.js';

export function createReindexSubscriber(
  clientManager: McpClientManager,
  logger: Logger,
  registry?: ModuleRegistry,
): ReindexSubscriber {
  const child = logger.child({ component: 'ReindexSubscriber' });
  const dbProvider: DbProvider = () => resolveMemoryAdapter(registry);
  const service = new ReindexService(dbProvider, EmbeddingService.getInstance(), clientManager, child);
  const queue = new PerServerTaskQueue(child);
  return new ReindexSubscriber(clientManager, service, queue, new ReindexActionMapper(), child);
}

function resolveMemoryAdapter(registry?: ModuleRegistry) {
  if (!registry) return null;
  const memory = registry.getModule('memory') as MemoryModule | undefined;
  if (!memory || memory.status !== 'ready') return null;
  return memory.getEngine().getAdapter();
}
