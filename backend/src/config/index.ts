import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import * as os from 'os';
import pino from 'pino';

const logger = pino({ name: 'app-config' });

const DEFAULT_EXCLUDE = [
  'node_modules', '.git', 'dist', 'build', '.gradle',
  '.idea', '.vscode', '__pycache__', '.venv', 'target',
  '.code-intel', 'coverage', '.next', '.nuxt',
];

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.kt', '.java', '.py',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.scala', '.sql', '.sh',
  '.yaml', '.yml', '.json', '.toml', '.gradle.kts',
  '.cls', '.trigger',
];

const UnifiedConfigSchema = z.object({
  port: z.number().min(1024).max(65535).default(48721),
  host: z.string().default('0.0.0.0'),
  onnxModelPath: z.string().default('models/model.onnx'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  viewerPort: z.number().default(3202),
  watchEnabled: z.boolean().default(true),
  watchDebounceMs: z.number().default(500),
  ollamaUrl: z.string().nullable().default(null),
  ollamaModel: z.string().default('nomic-embed-text'),
  maxFileSize: z.number().default(512_000),
  projectId: z.string().default('default'),
  workspace: z.string(),
  dbPath: z.string(),
  configPath: z.string(),
  dataDir: z.string(),
  sqliteDbPath: z.string(),
  orchestrationConfigPath: z.string(),
  excludePatterns: z.array(z.string()),
  includeExtensions: z.array(z.string()),
});

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;
export type AppConfig = UnifiedConfig;
export type BackendConfig = UnifiedConfig;

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

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function deriveProjectId(workspace: string, overrides?: Partial<UnifiedConfig>): string {
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
  } catch { /* ignore */ }
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: workspace, encoding: 'utf-8', timeout: 3000 }).trim();
    if (remoteUrl) {
      return crypto.createHash('sha256').update(remoteUrl).digest('hex').slice(0, 12);
    }
  } catch { /* no git or no remote */ }
  const userId = os.userInfo().username || 'unknown';
  const folderName = path.basename(workspace) || 'default';
  return crypto.createHash('sha256').update(`${userId}:${folderName}`).digest('hex').slice(0, 12);
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
    port: parseInt(process.env.CODE_INTEL_PORT || '48721', 10),
    host: process.env.CODE_INTEL_HOST || '0.0.0.0',
    onnxModelPath: process.env.CODE_INTEL_ONNX_MODEL || 'models/model.onnx',
    logLevel: (process.env.CODE_INTEL_LOG_LEVEL || 'info') as any,
    viewerPort: resolveViewerPort(),
    watchEnabled: envBool('CODE_INTEL_WATCH', fileConfig.watchEnabled ?? true),
    watchDebounceMs: envInt('CODE_INTEL_DEBOUNCE', fileConfig.watchDebounceMs ?? 500),
    ollamaUrl: process.env['OLLAMA_URL'] ?? fileConfig.ollamaUrl ?? null,
    ollamaModel: process.env['OLLAMA_MODEL'] ?? fileConfig.ollamaModel ?? 'nomic-embed-text',
    maxFileSize: fileConfig.maxFileSize ?? 512_000,
    projectId: deriveProjectId(workspace, overrides),
    workspace,
    dbPath,
    configPath,
    dataDir: envDataDir,
    sqliteDbPath: process.env.CODE_INTEL_DB || 'index.db',
    orchestrationConfigPath: process.env.CODE_INTEL_ORCHESTRATION || 'orchestration.json',
    excludePatterns: fileConfig.excludePatterns ?? DEFAULT_EXCLUDE,
    includeExtensions: fileConfig.includeExtensions ?? DEFAULT_EXTENSIONS,
    ...overrides,
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
  } catch {
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
