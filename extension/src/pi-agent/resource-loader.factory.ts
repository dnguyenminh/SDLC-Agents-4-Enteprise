import { logger } from '../logger';

export interface ResourceLoaderOptions {
  cwd: string;
  agentDir: string;
}

export interface IResourceLoader {
  reload(): void | Promise<void>;
  getDiagnostics?(): string[];
  getSkills?(): unknown[];
  getPrompts?(): unknown[];
  getAgentsFiles?(): unknown[];
}

/**
 * Factory for DefaultResourceLoader from Pi SDK.
 * Falls back to a mock implementation when SDK is unavailable (e.g., in tests).
 */
export function createResourceLoader(options: ResourceLoaderOptions): IResourceLoader {
  try {
    // Dynamic import to avoid hard dependency at compile time
    // @ts-ignore - SDK types may be missing in dev environment
    const { DefaultResourceLoader } = require('@earendil-works/pi-coding-agent');
    const loader = new DefaultResourceLoader(options);
    logger.info('DefaultResourceLoader instantiated', { cwd: options.cwd, agentDir: options.agentDir });
    return loader as unknown as IResourceLoader;
  } catch (err) {
    logger.warn('Pi SDK not available, using mock ResourceLoader', { error: (err as Error).message });
    // Mock implementation for tests / environments without SDK
    return {
      reload() {
        logger.debug('Mock ResourceLoader.reload() called');
      },
      getDiagnostics() {
        return [];
      },
      getSkills() {
        return [];
      },
      getPrompts() {
        return [];
      },
      getAgentsFiles() {
        return [];
      },
    };
  }
}

export async function reloadResourceLoader(loader: IResourceLoader): Promise<void> {
  try {
    await Promise.resolve(loader.reload());
    logger.info('ResourceLoader reload completed');
  } catch (err) {
    const msg = `Resource discovery failed: ${(err as Error).message}`;
    logger.error(msg, { error: err });
    throw new Error(msg);
  }
}

export function logDiagnostics(loader: IResourceLoader): void {
  const diagnostics = typeof loader.getDiagnostics === 'function' ? loader.getDiagnostics() : undefined;
  if (diagnostics && diagnostics.length > 0) {
    diagnostics.forEach((d) => logger.warn('ResourceLoader diagnostic', { diagnostic: d }));
  } else {
    logger.debug('ResourceLoader diagnostics empty');
  }
}
