import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import * as os from 'os';

export function getWorkspacePath(): string {
  // Check CLI arg --workspace first
  const args = process.argv.slice(2);
  const idx = args.indexOf('--workspace');
  if (idx >= 0 && args[idx + 1]) return path.resolve(args[idx + 1]);

  // Check env variable
  const envWs = process.env.CODE_INTEL_WORKSPACE;
  if (envWs) return path.resolve(envWs);

  return process.cwd();
}

const BackendConfigSchema = z.object({
  port: z.number().min(1024).max(65535).default(48721),
  host: z.string().default('0.0.0.0'),
  dataDir: z.string().default('.code-intel'),
  onnxModelPath: z.string().default('models/model.onnx'),
  sqliteDbPath: z.string().default('index.db'),
  orchestrationConfigPath: z.string().default('orchestration.json'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  projectId: z.string().default('default'),
});

export type BackendConfig = z.infer<typeof BackendConfigSchema> & {
  workspace: string;
};

/**
 * Derive projectId with 3-step resolution:
 * 1. Explicit: .code-intel/project.json → projectId field
 * 2. Git remote: sha256(git remote get-url origin).slice(0, 12)
 * 3. Fallback: sha256(userId + folderName).slice(0, 12) — prevents data leak across users
 */
function deriveProjectId(workspace: string, overrides?: Partial<BackendConfig>): string {
  // Priority 0: Explicit override (e.g., from test or CLI)
  if (overrides?.projectId && overrides.projectId !== 'default') return overrides.projectId;
  const envId = process.env.CODE_INTEL_PROJECT_ID;
  if (envId) return envId;

  // Priority 1: .code-intel/project.json
  try {
    const projectJsonPath = path.resolve(workspace, '.code-intel', 'project.json');
    if (fs.existsSync(projectJsonPath)) {
      const content = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
      if (content.projectId && typeof content.projectId === 'string') {
        return content.projectId;
      }
    }
  } catch { /* ignore parse errors */ }

  // Priority 2: Git remote origin URL hash
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: workspace, encoding: 'utf-8', timeout: 3000 }).trim();
    if (remoteUrl) {
      return crypto.createHash('sha256').update(remoteUrl).digest('hex').slice(0, 12);
    }
  } catch { /* no git or no remote */ }

  // Priority 3: Hash of userId + folder name (prevents cross-user data leak)
  const userId = os.userInfo().username || 'unknown';
  const folderName = path.basename(workspace) || 'default';
  return crypto.createHash('sha256').update(`${userId}:${folderName}`).digest('hex').slice(0, 12);
}

export function loadConfig(overrides?: Partial<BackendConfig>): BackendConfig {
  const workspace = overrides?.workspace ?? getWorkspacePath();
  const raw = {
    port: parseInt(process.env.CODE_INTEL_PORT || '48721', 10),
    host: process.env.CODE_INTEL_HOST || '0.0.0.0',
    dataDir: process.env.CODE_INTEL_DATA_DIR || '.code-intel',
    onnxModelPath: process.env.CODE_INTEL_ONNX_MODEL || 'models/model.onnx',
    sqliteDbPath: process.env.CODE_INTEL_DB || 'index.db',
    orchestrationConfigPath: process.env.CODE_INTEL_ORCHESTRATION || 'orchestration.json',
    logLevel: process.env.CODE_INTEL_LOG_LEVEL || 'info',
    projectId: deriveProjectId(workspace, overrides),
    workspace,
    ...overrides,
  };

  return {
    ...BackendConfigSchema.parse(raw),
    workspace: raw.workspace,
  };
}
