/**
 * NativeAddonResolver — Resolves better-sqlite3 native binding for standalone MCP server.
 *
 * Modes:
 * 1. Extension mode: BETTER_SQLITE3_BINDING env var set → use that path directly
 * 2. Standalone mode: auto-detect platform, check cache, download if needed
 * 3. Fallback: if download fails → try require("better-sqlite3") (npm-installed)
 *
 * Cache: ~/.code-intel/native-addons/better-sqlite3/v{version}/node-v{major}-{platform}-{arch}/better_sqlite3.node
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pino from 'pino';
import { validateBinding } from './validation.js';
import { downloadBinary } from './download.js';
import { MANIFEST } from './manifest.js';

const logger = pino({ name: 'native-addon-resolver' });

async function tryExtensionBinding(): Promise<string | undefined> {
  const envBinding = process.env.BETTER_SQLITE3_BINDING;
  if (!envBinding) return undefined;

  logger.error(`[native-addon] Extension mode: using ${envBinding}`);
  if (await validateBinding(envBinding)) {
    return envBinding;
  }

  logger.error(`[native-addon] ⚠️ Extension-provided binding failed to load (MODULE_VERSION mismatch?)`);
  logger.error(`[native-addon] Falling back to self-resolve for runtime Node v${getNodeMajorVersion()}`);
  return undefined;
}

async function checkCacheBinding(bindingFile: string): Promise<boolean> {
  if (!fs.existsSync(bindingFile) || fs.statSync(bindingFile).size === 0) return false;
  if (await validateBinding(bindingFile)) return true;
  logger.error(`[native-addon] ⚠️ Cached binary MODULE_VERSION mismatch. Deleting: ${bindingFile}`);
  try { fs.unlinkSync(bindingFile); } catch { /* ignore */ }
  return false;
}

async function downloadWithFallback(
  cacheKey: string,
  cachePath: string,
  bindingFile: string,
): Promise<string | undefined> {
  try {
    await downloadBinary(cacheKey, cachePath, bindingFile);
    logger.error(`[native-addon] Downloaded and verified: ${bindingFile}`);
    return bindingFile;
  } catch (err: any) {
    logger.error({ err }, `[native-addon] Download failed:`);
    logger.error('[native-addon] Falling back to npm-installed better-sqlite3');
    return undefined;
  }
}

async function resolveFromCacheOrDownload(
  cacheKey: string,
  cachePath: string,
  bindingFile: string,
): Promise<string | undefined> {
  if (await checkCacheBinding(bindingFile)) {
    logger.error(`[native-addon] Cache hit (validated): ${bindingFile}`);
    return bindingFile;
  }
  return downloadWithFallback(cacheKey, cachePath, bindingFile);
}

/**
 * Resolve the native binding path. Must be called (and awaited) before creating Database instances.
 * Returns the path to better_sqlite3.node, or undefined if fallback to npm-installed should be used.
 *
 * KSA-112: If cached binary has wrong NODE_MODULE_VERSION, auto-delete and re-download.
 */
export async function resolveNativeBinding(): Promise<string | undefined> {
  const extResult = await tryExtensionBinding();
  if (extResult !== undefined) return extResult;

  logger.error('[native-addon] Standalone mode: resolving prebuilt binary...');
  const cacheKey = getCacheKey();
  if (!cacheKey) {
    logger.error('[native-addon] Unsupported platform, falling back to npm-installed');
    return undefined;
  }

  const cachePath = getCachePath(cacheKey);
  const bindingFile = path.join(cachePath, 'better_sqlite3.node');
  return resolveFromCacheOrDownload(cacheKey, cachePath, bindingFile);
}

/**
 * Synchronous resolve — returns cached path or undefined.
 * Use after resolveNativeBinding() has been called at startup.
 */
export function resolveNativeBindingSync(): string | undefined {
  const envBinding = process.env.BETTER_SQLITE3_BINDING;
  if (envBinding) return envBinding;

  const cacheKey = getCacheKey();
  if (!cacheKey) return undefined;

  const bindingFile = path.join(getCachePath(cacheKey), 'better_sqlite3.node');
  if (fs.existsSync(bindingFile) && fs.statSync(bindingFile).size > 0) {
    return bindingFile;
  }
  return undefined;
}

function getNodeMajorVersion(): string {
  return process.versions.node.split('.')[0];
}

function getCacheKey(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  const major = getNodeMajorVersion();
  const exactKey = `node-v${major}-${platform}-${arch}`;
  if (exactKey in MANIFEST.binaries) return exactKey;

  const runtimeMajor = parseInt(major, 10);
  const candidates = Object.keys(MANIFEST.binaries)
    .filter(k => k.startsWith('node-v') && k.endsWith(`-${platform}-${arch}`))
    .map(k => ({ key: k, major: parseInt(k.match(/node-v(\d+)/)?.[1] || '0', 10) }))
    .filter(c => c.major <= runtimeMajor)
    .sort((a, b) => b.major - a.major);

  if (candidates.length > 0) {
    logger.error(`[native-addon] Node v${major}, using compatible binary: ${candidates[0].key}`);
    return candidates[0].key;
  }
  return null;
}

function getCachePath(cacheKey: string): string {
  const homeDir = os.homedir();
  return path.join(
    homeDir,
    '.code-intel',
    'native-addons',
    'better-sqlite3',
    `v${MANIFEST.version}`,
    cacheKey
  );
}

export { getCacheKey, getCachePath, getNodeMajorVersion };
