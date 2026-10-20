/**
 * Pega API routes — shared route context (BR-18 extraction from pega-api.ts).
 * Hono env + lazy PegaService/ChecksumStore resolvers shared by all Pega route groups.
 */
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../../modules/ModuleRegistry.js';
import { PegaService } from '../../modules/pega/PegaService.js';
import { ChecksumStore } from '../../modules/pega/ChecksumStore.js';
import { PegaEvaluationCache } from '../../modules/pega/deploy/PegaEvaluationCache.js';

/** Hono env — SA4E-241: jwtAuth injects the authenticated project identity here. */
export type PegaEnv = { Variables: { projectContext?: { projectId?: string; userId?: string } } };

/** Shared collaborators handed to every Pega route registration group. */
export interface PegaRouteContext {
  registry: ModuleRegistry;
  logger: Logger;
  /** Lazy PegaService resolved from the ready memory module (null when not ready). */
  getPegaService: () => PegaService | null;
  /** SA4E-241: ChecksumStore over the SAME adapter PegaService uses (single DB). */
  getChecksumStore: (service: PegaService) => ChecksumStore;
  /** SA4E-230/L3-L4: shared evaluation cache for expression endpoints. */
  evalCache: PegaEvaluationCache;
}

export function createPegaRouteContext(registry: ModuleRegistry, logger: Logger): PegaRouteContext {
  let pegaService: PegaService | null = null;
  const getPegaService = (): PegaService | null => {
    const memModule = registry.getModule('memory') as any;
    if (!memModule || memModule.status !== 'ready') return null;
    if (!pegaService) pegaService = new PegaService(memModule.getEngine());
    return pegaService;
  };

  return {
    registry,
    logger,
    getPegaService,
    /** SA4E-241: ChecksumStore over the SAME adapter PegaService uses (single DB). */
    getChecksumStore: (service: PegaService): ChecksumStore =>
      new ChecksumStore((service as any).memoryEngine.getAdapter()),
    evalCache: new PegaEvaluationCache(),
  };
}
