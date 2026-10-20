import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as os from 'os';
import pino from 'pino';
import { loadEntraConfig, type EntraSurface } from './EntraConfig.js';
import { UnifiedConfigSchema, DEFAULT_EXCLUDE, DEFAULT_EXTENSIONS, envBool, envInt, type UnifiedConfig } from './schema.js';

// BR-18 split: schema, constants and env helpers live in ./schema.ts.
// Re-exported here so every existing `from '../config/index.js'` import
// keeps resolving to the same public symbols.
export { DEFAULT_EXCLUDE, DEFAULT_EXTENSIONS, envBool, envInt, UnifiedConfigSchema } from './schema.js';
export type { UnifiedConfig, AppConfig, BackendConfig } from './schema.js';

const logger = pino({ name: 'app-config' });

/**
 * Load the Entra surface for the startup config snapshot WITHOUT throwing.
 * loadEntraConfig() fail-fasts when SSO_ENABLED=true but ENTRA_* env vars are
 * missing. Under Hướng A the real config lives in the sso_providers table
 * (read at runtime via loadEntraConfigAsync), so a missing env set here is
 * expected and must NOT crash loadConfig() and every caller of it.
 */
function loadEntraSurfaceSafe(): EntraSurface {
  try {
    return loadEntraConfig(process.env);
  } catch (err) {
    logger.warn({ err: (err as Error).message },
      'Entra env config unavailable at startup — SSO config resolved from DB at runtime');
    return { ssoEnabled: false, config: null };
  }
}

export function getWorkspacePath(): string {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--workspace');
  if (idx >= 0 && args[idx + 1]) return path.resolve(args[idx + 1]);
  const envWs = process.env.CODE_INTEL_WORKSPACE;
  if (envWs) return path.resolve(envWs);
  return process.cwd();
}

function resolveViewerPort(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--viewer-port');
  if (idx >= 0 && args[idx + 1]) return parseInt(args[idx + 1], 10);
  const envPort = process.env['CODE_INTEL_VIEWER_PORT'];
  if (envPort) return parseInt(envPort, 10);
  return 3202;
}

function resolvePort(): number {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--port');
  if (idx >= 0 && args[idx + 1]) return parseInt(args[idx + 1], 10);
  const envPort = process.env['CODE_INTEL_PORT'];
  if (envPort) return parseInt(envPort, 10);
  return 48721;
}

function loadFileConfig(configPath: string): Record<string, any> {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    logger.error({ err }, `[config] Failed to read ${configPath}:`);
  }
  return {};
}

function deriveProjectId(workspace: string, overrides?: Partial<UnifiedConfig>): string {
  // Project identity is NEVER inferred by the backend. The backend is multi-tenant and
  // does not own a project; per-request identity arrives via X-Project-Id / JWT. This
  // config value only serves EXPLICIT standalone/CLI configuration and the single-tenant
  // boot file-watcher. Accept only explicit sources — never guess from git/user/folder:
  //   1. loadConfig override (programmatic)
  //   2. CODE_INTEL_PROJECT_ID env (operator-set)
  //   3. .code-intel/project.json in the boot workspace (client-written, standalone only)
  // No explicit source → 'default' sentinel; downstream write paths fail closed
  // (requireProjectId) rather than operating under a guessed/mis-scoped identity.
  if (overrides?.projectId && overrides.projectId !== 'default') return overrides.projectId;
  const envId = process.env.CODE_INTEL_PROJECT_ID;
  if (envId) return envId;
  try {
    const projectJsonPath = path.resolve(workspace, '.code-intel', 'project.json');
    if (fs.existsSync(projectJsonPath)) {
      const content = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
      if (content.projectId && typeof content.projectId === 'string') {
        return content.projectId;
      }
    }
  } catch (err) { logger.debug({ err }, '[index] project.json unreadable — not inferring identity'); }
  return 'default';
}

export function loadConfig(overrides?: Partial<UnifiedConfig>): UnifiedConfig {
  const workspace = overrides?.workspace ?? getWorkspacePath();
  const envDataDir = process.env['CODE_INTEL_DATA_DIR'] || '.code-intel';
  const codeIntelDir = path.isAbsolute(envDataDir) ? envDataDir : path.join(workspace, envDataDir);
  const configPath = path.join(codeIntelDir, 'config.json');
  const fileConfig = loadFileConfig(configPath);

  const envDb = process.env['CODE_INTEL_DB'] || 'index.db';
  const dbPath = path.isAbsolute(envDb) ? envDb : path.join(codeIntelDir, envDb);

  const raw = {
    port: resolvePort(),
    host: process.env.CODE_INTEL_HOST || '0.0.0.0',
    onnxModelPath: process.env.CODE_INTEL_ONNX_MODEL || 'models/model.onnx',
    // SA4E-44 / AD-6 — ONNX embedding config (EmbeddingService/OnnxEmbeddingBackend).
    // TRANSFORMERS_CACHE is the HF-standard env var; the Dockerfile bakes the
    // model there at build time so the runtime image works fully offline.
    embeddingModelId: process.env.CODE_INTEL_EMBEDDING_MODEL
      || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    embeddingCacheDir: process.env.TRANSFORMERS_CACHE
      || path.join(codeIntelDir, 'models-cache'),
    embeddingQuantized: envBool('CODE_INTEL_EMBEDDING_QUANTIZED', true),
    logLevel: (process.env.CODE_INTEL_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
    viewerPort: resolveViewerPort(),
    watchEnabled: envBool('CODE_INTEL_WATCH', fileConfig.watchEnabled ?? true),
    watchDebounceMs: envInt('CODE_INTEL_DEBOUNCE', fileConfig.watchDebounceMs ?? 500),
    ollamaUrl: process.env['OLLAMA_URL'] ?? fileConfig.ollamaUrl ?? null,
    ollamaModel: process.env['OLLAMA_MODEL'] ?? fileConfig.ollamaModel ?? 'nomic-embed-text',
    maxFileSize: fileConfig.maxFileSize ?? 512_000,
    projectId: deriveProjectId(workspace, overrides),
    workspace,
    indexTempDir: process.env.CODE_INTEL_INDEX_TEMP_DIR || path.join(os.tmpdir(), 'CodeIntel'),
    dbPath,
    configPath,
    dataDir: envDataDir,
    sqliteDbPath: process.env.CODE_INTEL_DB || 'index.db',
    orchestrationConfigPath: process.env.CODE_INTEL_ORCHESTRATION || 'orchestration.json',
    excludePatterns: fileConfig.excludePatterns ?? DEFAULT_EXCLUDE,
    includeExtensions: fileConfig.includeExtensions ?? DEFAULT_EXTENSIONS,
    sandbox: fileConfig.sandbox ?? {},
    ...overrides,
    // SA4E-264 / Hướng A — Entra config snapshot. Runtime SSO now reads the
    // effective config from the sso_providers table via loadEntraConfigAsync
    // (single source of truth), so this synchronous env-only load MUST NOT throw
    // and bring down every loadConfig() caller (e.g. GET /api/admin/config) when
    // SSO is enabled but the ENTRA_* env vars are absent (config lives in DB).
    // Degrade to a disabled surface instead of failing hard.
    entra: loadEntraSurfaceSafe(),
  };

  return UnifiedConfigSchema.parse(raw) as UnifiedConfig;
}

export function setWorkspace(config: UnifiedConfig, rootUri: string | null): UnifiedConfig {
  if (resolveWorkspaceFromCli() || process.env['CODE_INTEL_WORKSPACE']) {
    return config;
  }
  const workspace = resolveWorkspaceFromRoots(rootUri);
  return buildConfig(workspace);
}

export function fileUriToPath(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch (err) {
    console.debug('[config] Non-file URI, falling back to raw path:', (err as Error).message);
    return uri.replace(/^file:\/\/\//, process.platform === 'win32' ? '' : '/');
  }
}

export function resolveOrchestrationConfigPath(): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--config');
  if (idx >= 0 && args[idx + 1]) return path.resolve(args[idx + 1]);
  return null;
}

function resolveWorkspaceFromCli(): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--workspace');
  if (idx >= 0 && args[idx + 1]) return path.resolve(args[idx + 1]);
  return null;
}

function resolveWorkspaceFromRoots(rootUri: string | null): string {
  const envWs = process.env['CODE_INTEL_WORKSPACE'];
  if (envWs) return path.resolve(envWs);
  if (rootUri) return path.resolve(fileUriToPath(rootUri));
  return process.cwd();
}

function buildConfig(workspace: string): UnifiedConfig {
  return loadConfig({ workspace });
}
