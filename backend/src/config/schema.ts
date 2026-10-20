/**
 * Unified config schema + shared config constants (BR-18 split from index.ts).
 * The Zod schema is the single source of truth for the backend config shape;
 * index.ts assembles the raw object and parses it through this schema.
 */

import { z } from 'zod';
import { SandboxConfigSchema } from './SandboxConfig.js';
import { EntraSurfaceSchema } from './EntraConfig.js';

export const DEFAULT_EXCLUDE = [
  'node_modules', '.git', 'dist', 'build', '.gradle',
  '.idea', '.vscode', '__pycache__', '.venv', 'target',
  '.code-intel', 'coverage', '.next', '.nuxt',
  'rules',
  '.pega-cache',
];

export const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.kt', '.java', '.py',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.scala', '.sql', '.sh',
  '.yaml', '.yml', '.json', '.toml', '.gradle.kts',
  '.cls', '.trigger',
  // ---- SA4E-223: new Salesforce simple extensions (Gate 2) ----
  '.apex', '.soql', '.page', '.component', '.cmp', '.app', '.evt', '.intf', '.tokens',
  // ---- SA4E-225: un-skip PowerShell ----
  '.ps1',
];

export const UnifiedConfigSchema = z.object({
  port: z.number().min(1024).max(65535).default(48721),
  host: z.string().default('0.0.0.0'),
  // Legacy/deprecated — nothing loads a bare .onnx file anymore; kept for
  // backward-compatible admin config output. See embeddingModelId below.
  onnxModelPath: z.string().default('models/model.onnx'),
  // SA4E-44 / AD-6 — real ONNX embeddings via transformers.js (EmbeddingService).
  embeddingModelId: z.string().default('Xenova/paraphrase-multilingual-MiniLM-L12-v2'),
  embeddingCacheDir: z.string(),
  embeddingQuantized: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  viewerPort: z.number().default(3202),
  watchEnabled: z.boolean().default(true),
  watchDebounceMs: z.number().default(500),
  ollamaUrl: z.string().nullable().default(null),
  ollamaModel: z.string().default('nomic-embed-text'),
  maxFileSize: z.number().default(512_000),
  projectId: z.string().default('default'),
  workspace: z.string(),
  indexTempDir: z.string(),
  dbPath: z.string(),
  configPath: z.string(),
  dataDir: z.string(),
  sqliteDbPath: z.string(),
  orchestrationConfigPath: z.string(),
  excludePatterns: z.array(z.string()),
  includeExtensions: z.array(z.string()),
  sandbox: SandboxConfigSchema,
  entra: EntraSurfaceSchema, // SA4E-264 — Entra ID SSO surface (gate: SSO_ENABLED)
});

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;
export type AppConfig = UnifiedConfig;
export type BackendConfig = UnifiedConfig;

export function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

export function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}
