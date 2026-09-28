import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { detectModelTier, type ModelTier } from './model-tier';
import { compressPrompt } from './prompt-compressor';
import { readTemplateFile } from './prompt-template-scan';
import { RoleScopeFilter } from './role-scope';
import type { PromptTemplateService } from './prompt-template.service';

export type AgentRole = 'SM' | 'BA' | 'SA' | 'DEV' | 'QA' | 'DevOps' | 'UI' | 'Security';
export type PromptMode = 'append' | 'replace';

export const ALLOWED_ROLES: AgentRole[] = ['SM', 'BA', 'SA', 'DEV', 'QA', 'DevOps', 'UI', 'Security'];

export const AGENT_PROMPTS: Record<AgentRole, string> = {
  SM: 'SDLC Scrum Master – Business Analyst – coordinate agents and enforce quality gates.',
  BA: 'SDLC BA Agent – Business Analyst – create BRD and FSD.',
  SA: 'SDLC SA Agent – Solution Architect – create TDD and design.',
  DEV: 'SDLC DEV Agent – Developer – implement code and tests.',
  QA: 'SDLC QA Agent – Quality Assurance – create STP/STC and test.',
  DevOps: 'SDLC DevOps Agent – Deployment and CI/CD.',
  UI: 'SDLC UI Agent – User Interface design.',
  Security: 'SDLC Security Agent – Security review and assessment.',
};

export const DEFAULT_AGENT_PROMPT = 'SDLC Agent – complete the assigned SDLC phase task and enforce quality gates.';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateAgentRole(role: unknown): asserts role is AgentRole {
  if (typeof role !== 'string' || !ALLOWED_ROLES.includes(role as AgentRole)) {
    throw new ValidationError(`Invalid agentRole '${role}'. Allowed: ${ALLOWED_ROLES.join(', ')}`);
  }
}

export function validatePromptMode(mode: unknown): asserts mode is PromptMode {
  if (mode !== 'append' && mode !== 'replace') {
    throw new ValidationError(`Invalid promptMode '${mode}'. Must be 'append' or 'replace'`);
  }
}

export interface ResourceLoaderBaseOptions {
  cwd: string;
  agentDir: string;
}

export interface ConfiguredResourceLoaderOptions extends ResourceLoaderBaseOptions {
  systemPromptOverride?: string;
  appendSystemPromptOverride?: string[];
  skillsOverride?: (skills: unknown[]) => unknown[];
}

export function getSystemPromptForRole(role: AgentRole): string {
  return AGENT_PROMPTS[role];
}

/**
 * Append workspace SYSTEM.md content to the prompt (Story 3 — replace mode keeps project context).
 *
 * SEC-326-01 — workspace-trust gate + size cap + symlink containment:
 * - `trusted === false` (untrusted workspace, mirrors WorkspaceTrustGuard
 *   policy) → workspace SYSTEM.md is SKIPPED (prompt-poisoning surface);
 * - SYSTEM.md larger than {@link SYSTEM_MD_MAX_BYTES} → skipped (sync-freeze DoS);
 * - symlink escaping the workspace → skipped;
 * - loaded bytes are audit-logged (provenance).
 */
export const SYSTEM_MD_MAX_BYTES = 65_536; // 64 KB

export function appendSystemMd(prompt: string, cwd: string, trusted = true): string {
  if (trusted === false) return prompt; // SEC-326-01: skip untrusted workspace content
  const content = readTemplateFile(path.join(cwd, 'SYSTEM.md'), cwd, SYSTEM_MD_MAX_BYTES)?.trim();
  if (!content) return prompt;
  logger.debug('SYSTEM.md loaded', { bytes: Buffer.byteLength(content, 'utf-8') });
  return `${prompt}\n\n${content}`;
}

export interface SelectPromptOptions {
  promptMode?: PromptMode;
  cwd?: string;
  /** SEC-326-01 — trusted-workspace flag; `false` skips workspace SYSTEM.md. */
  trusted?: boolean;
  templateService?: Pick<PromptTemplateService, 'getPromptForTier'>;
  templateName?: string;
}

function rolePromptFor(role: string): string {
  if (ALLOWED_ROLES.includes(role as AgentRole)) {
    return getSystemPromptForRole(role as AgentRole);
  }
  logger.warn(`ROLE_MISMATCH '${role}' → default prompt`);
  return DEFAULT_AGENT_PROMPT;
}

function withTierTemplate(prompt: string, tier: ModelTier | null, options?: SelectPromptOptions): string {
  let base = prompt;
  if (tier === 'small') {
    base = compressPrompt(base);
    logger.debug('Compressed role prompt for small model', { tier });
  }
  if (!options?.templateService || !options.templateName) return base;
  try {
    const tpl = options.templateService.getPromptForTier(options.templateName, tier);
    return `${base}\n\n${tpl.promptContent}`;
  } catch {
    return base;
  }
}

/**
 * Select prompt for a model tier + role (FSD 12.2).
 * Small tier → compressed role prompt + compressed template variant;
 * unknown tier → full variant; unknown role → ROLE_MISMATCH → default prompt.
 */
export function selectPrompt(modelId: string, role: string, options?: SelectPromptOptions): string {
  const tier = detectModelTier(modelId);
  let prompt = withTierTemplate(rolePromptFor(role), tier, options);
  if (options?.promptMode === 'replace' && options?.cwd) {
    prompt = appendSystemMd(prompt, options.cwd, options.trusted);
  }
  return prompt;
}

function applyPromptOverride(
  options: ConfiguredResourceLoaderOptions,
  role: AgentRole,
  mode: PromptMode,
  modelId?: string
): void {
  let prompt = getSystemPromptForRole(role);
  const tier = modelId ? detectModelTier(modelId) : null;
  if (tier === 'small') {
    prompt = compressPrompt(prompt);
    logger.debug('Compressed role prompt for small model', { role, modelId });
  }
  if (mode === 'replace') {
    options.systemPromptOverride = prompt;
    options.appendSystemPromptOverride = []; // prevent APPEND_SYSTEM.md
    logger.debug('Prompt override mode REPLACE', { role, prompt });
  } else {
    options.appendSystemPromptOverride = [prompt];
    logger.debug('Prompt override mode APPEND', { role });
  }
}

function applySkillsOverride(
  options: ConfiguredResourceLoaderOptions,
  role: AgentRole,
  skillsFilter?: 'all' | 'phase'
): void {
  if (!skillsFilter) return;
  options.skillsOverride = (skills) => {
    if (skillsFilter === 'all') return skills;
    const scope = new RoleScopeFilter();
    return skills.filter((s: any) => scope.isAllowed(role, String(s?.id ?? '')));
  };
}

/**
 * Build DefaultResourceLoader options with system prompt and skills overrides based on agent role.
 * For replace mode, appendSystemPromptOverride returns [] to avoid APPEND_SYSTEM.md contamination.
 */
export function buildResourceLoaderOptions(
  base: ResourceLoaderBaseOptions,
  agentRole: string,
  promptMode: string,
  skillsFilter?: 'all' | 'phase',
  modelId?: string
): ConfiguredResourceLoaderOptions {
  validateAgentRole(agentRole);
  validatePromptMode(promptMode);

  const options: ConfiguredResourceLoaderOptions = {
    cwd: base.cwd,
    agentDir: base.agentDir,
  };
  applyPromptOverride(options, agentRole as AgentRole, promptMode as PromptMode, modelId);
  applySkillsOverride(options, agentRole as AgentRole, skillsFilter);
  return options;
}

/**
 * Simulate session creation with configured prompt.
 * In production this delegates to Pi SDK createAgentSession.
 */
export function simulateAgentSession(options: ConfiguredResourceLoaderOptions, agentRole: AgentRole) {
  const systemPrompt = options.systemPromptOverride ?? (options.appendSystemPromptOverride?.join('\n') ?? '');
  return {
    systemPrompt,
    resourceLoaderOptions: options,
    agentRole,
  };
}
