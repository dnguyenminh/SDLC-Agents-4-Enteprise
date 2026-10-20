/** Effective admin config assembly (BR-18 extraction from config.ts). */
import { loadConfig } from '../../../config/index.js';
import { loadPersistedLLMConfig, getLatestConfigValue } from '../../../admin/admin-db.js';
import type { AdminContext } from './context.js';
import { authRuntimeOverrides } from '../../../config/EntraConfig.js';
import { EmbeddingService } from '../../../engine/parsers/embedding/EmbeddingService.js';
import { EMBEDDING_DIMENSIONS } from '../../../engine/parsers/embedding/EmbeddingBackend.js';

export async function getEffectiveConfig(ctx: AdminContext): Promise<Record<string, Record<string, any>>> {
  const base = await buildBaseConfig();

  // Merge DB-persisted LLM config on top of env defaults (Admin UI changes)
  try {
    await mergeLlmOverrides(base);
  } catch (err) { ctx.logger.debug({ err, context: 'llm-config' }, 'DB not ready for LLM config — using env defaults'); }

  try { await mergeTaskWorkerOverrides(base); } catch (err) { ctx.logger.debug({ err, context: 'taskworker-config' }, 'DB not ready for taskWorker config — using env defaults'); }
  try { await mergeServerOverrides(base); } catch (err) { ctx.logger.debug({ err, context: 'server-config' }, 'DB not ready for server config — using env defaults'); }
  try { await mergeRateLimitOverrides(base); } catch (err) { ctx.logger.debug({ err, context: 'ratelimit-config' }, 'DB not ready for rateLimit config — using env defaults'); }
  try { await mergeIndexLimitOverrides(base); } catch (err) { ctx.logger.debug({ err, context: 'indexlimit-config' }, 'DB not ready for indexLimit config — using env defaults'); }
  try { await mergeAuthOverrides(base); } catch (err) { ctx.logger.debug({ err, context: 'auth-config' }, 'DB not ready for auth config — using env defaults'); }

  // Runtime in-memory overrides (from PATCH calls in current session) always win
  for (const [section, keys] of Object.entries(ctx.configOverrides)) {
    if (!base[section]) base[section] = {};
    for (const [key, val] of Object.entries(keys)) base[section][key] = val;
  }
  return base;
}

async function mergeLlmOverrides(base: Record<string, Record<string, any>>): Promise<void> {
  const llmOverrides = await loadPersistedLLMConfig();
  if (llmOverrides.provider) base.llm.provider = llmOverrides.provider;
  if (llmOverrides.model) base.llm.model = llmOverrides.model;
  if (llmOverrides.baseUrl) base.llm.baseUrl = llmOverrides.baseUrl;
  if (llmOverrides.apiKey && llmOverrides.apiKey !== '***') base.llm.apiKey = '***';
  if (llmOverrides.temperature !== undefined) base.llm.temperature = llmOverrides.temperature;
  if (llmOverrides.maxTokens !== undefined) base.llm.maxTokens = llmOverrides.maxTokens;
  if (llmOverrides.tagAnalysisEnabled !== undefined) base.llm.tagAnalysisEnabled = llmOverrides.tagAnalysisEnabled;
  if (llmOverrides.tagConfidenceThreshold !== undefined) base.llm.tagConfidenceThreshold = llmOverrides.tagConfidenceThreshold;
}

async function mergeTaskWorkerOverrides(base: Record<string, Record<string, any>>): Promise<void> {
  const twKeys = ['concurrency', 'baseInterval', 'maxInterval'] as const;
  for (const key of twKeys) {
    const val = await getLatestConfigValue('taskWorker', key);
    if (val !== undefined) {
      const n = parseInt(val, 10);
      if (!isNaN(n)) base.taskWorker[key] = n;
    }
  }
}

async function mergeServerOverrides(base: Record<string, Record<string, any>>): Promise<void> {
  const serverKeys = ['indexTempDir'] as const;
  for (const key of serverKeys) {
    const val = await getLatestConfigValue('server', key);
    if (val !== undefined && val.trim()) base.server[key] = val;
  }
}

async function mergeRateLimitOverrides(base: Record<string, Record<string, any>>): Promise<void> {
  const val = await getLatestConfigValue('rateLimit', 'maxRpm');
  if (val !== undefined) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) base.rateLimit.maxRpm = n;
  }
}

async function mergeIndexLimitOverrides(base: Record<string, Record<string, any>>): Promise<void> {
  const val = await getLatestConfigValue('indexLimit', 'maxConcurrent');
  if (val !== undefined) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) base.indexLimit.maxConcurrent = n;
  }
}

async function mergeAuthOverrides(base: Record<string, Record<string, any>>): Promise<void> {
  const authKeys = ['ssoEnabled','entraTenantId','entraClientId','entraClientSecret','entraRedirectUri','ssoAllowedRedirects'] as const;
  const envKeyMap: Record<string, string> = {
    ssoEnabled: 'SSO_ENABLED',
    entraTenantId: 'ENTRA_TENANT_ID',
    entraClientId: 'ENTRA_CLIENT_ID',
    entraClientSecret: 'ENTRA_CLIENT_SECRET',
    entraRedirectUri: 'ENTRA_REDIRECT_URI',
    ssoAllowedRedirects: 'SSO_ALLOWED_REDIRECTS',
  };
  for (const key of authKeys) {
    const val = await getLatestConfigValue('auth', key);
    if (val !== undefined) {
      if (key === 'ssoEnabled') base.auth.ssoEnabled = val === 'true';
      else if (key === 'entraClientSecret') base.auth.entraClientSecret = val ? '***' : '';
      else base.auth[key] = val;
      // Sync to Entra runtime overrides so EntraConfig reads from DB
      const envKey = envKeyMap[key];
      if (envKey) authRuntimeOverrides.set(envKey, String(val));
    }
  }
}

async function buildBaseConfig(): Promise<Record<string, Record<string, any>>> {
  const cfg = loadConfig();
  const os = await import('os');
  const path = await import('path');
  const defaultIndexTempDir = path.join(os.tmpdir(), 'CodeIntel');
  return {
    server: { port: cfg.port, host: cfg.host, logLevel: cfg.logLevel, indexTempDir: (cfg as any).indexTempDir || defaultIndexTempDir },
    // SA4E-44 / AD-6: model + backend are now REAL (ONNX inference via
    // EmbeddingService). `backend` reports what will actually be used; the
    // legacy onnxModelPath is kept only for backward-compatible output.
    embedding: {
      model: cfg.embeddingModelId,
      dimensions: EMBEDDING_DIMENSIONS,
      backend: EmbeddingService.getInstance().getBackendKind(),
      cacheDir: cfg.embeddingCacheDir,
      quantized: cfg.embeddingQuantized,
      legacyOnnxModelPath: cfg.onnxModelPath,
    },
    auth: {
      ssoEnabled: process.env.SSO_ENABLED === 'true',
      entraTenantId: process.env.ENTRA_TENANT_ID || '',
      entraClientId: process.env.ENTRA_CLIENT_ID || '',
      entraClientSecret: process.env.ENTRA_CLIENT_SECRET ? '***' : '',
      entraRedirectUri: process.env.ENTRA_REDIRECT_URI || `http://localhost:${cfg.port}/auth/entra/callback`,
      ssoAllowedRedirects: process.env.SSO_ALLOWED_REDIRECTS || `http://localhost:${cfg.port}`
    },
    llm: {
      provider: process.env.LLM_PROVIDER || 'ollama',
      model: process.env.LLM_MODEL || 'qwen2.5:7b-instruct-q4_K_M',
      baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434',
      apiKey: process.env.LLM_API_KEY ? '***' : '',
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '800', 10),
      tagAnalysisEnabled: process.env.TAG_ANALYSIS_ENABLED !== 'false',
      tagConfidenceThreshold: parseFloat(process.env.TAG_CONFIDENCE_THRESHOLD || '0.7'),
    },
    kb: { maxEntries: 100000, sqliteDbPath: cfg.sqliteDbPath, dataDir: cfg.dataDir },
    mcp: { orchestrationConfigPath: cfg.orchestrationConfigPath },
    taskWorker: {
      concurrency: parseInt(process.env.TASK_WORKER_CONCURRENCY || '6', 10),
      baseInterval: parseInt(process.env.TASK_WORKER_BASE_INTERVAL || '2000', 10),
      maxInterval: parseInt(process.env.TASK_WORKER_MAX_INTERVAL || '30000', 10),
    },
    rateLimit: {
      // Server hard cap (rpm) per IP. Clients may request up to (never above) this.
      maxRpm: parseInt(process.env.RATE_LIMIT_MAX_RPM || (process.env.NODE_ENV === 'production' ? '6000' : '10000'), 10),
    },
    indexLimit: {
      // SA4E-99 backpressure: max concurrent /api/index/source upload requests.
      // Hot-reloaded via INDEX_LIMIT_CONFIG_CHANGED — no restart needed.
      maxConcurrent: parseInt(process.env.INDEX_CONCURRENCY_LIMIT || '3', 10),
    },
  };
}
