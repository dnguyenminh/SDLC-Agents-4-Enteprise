import { z } from 'zod';
import * as path from 'path';

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
});

export type BackendConfig = z.infer<typeof BackendConfigSchema> & {
  workspace: string;
};

export function loadConfig(overrides?: Partial<BackendConfig>): BackendConfig {
  const raw = {
    port: parseInt(process.env.CODE_INTEL_PORT || '48721', 10),
    host: process.env.CODE_INTEL_HOST || '0.0.0.0',
    dataDir: process.env.CODE_INTEL_DATA_DIR || '.code-intel',
    onnxModelPath: process.env.CODE_INTEL_ONNX_MODEL || 'models/model.onnx',
    sqliteDbPath: process.env.CODE_INTEL_DB || 'index.db',
    orchestrationConfigPath: process.env.CODE_INTEL_ORCHESTRATION || 'orchestration.json',
    logLevel: process.env.CODE_INTEL_LOG_LEVEL || 'info',
    workspace: getWorkspacePath(),
    ...overrides,
  };

  return {
    ...BackendConfigSchema.parse(raw),
    workspace: raw.workspace,
  };
}
