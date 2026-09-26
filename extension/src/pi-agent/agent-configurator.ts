import { logger } from '../logger';

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
 * Build DefaultResourceLoader options with system prompt and skills overrides based on agent role.
 * For replace mode, appendSystemPromptOverride returns [] to avoid APPEND_SYSTEM.md contamination.
 */
export function buildResourceLoaderOptions(
  base: ResourceLoaderBaseOptions,
  agentRole: string,
  promptMode: string,
  skillsFilter?: 'all' | 'phase'
): ConfiguredResourceLoaderOptions {
  validateAgentRole(agentRole);
  validatePromptMode(promptMode);

  const role = agentRole as AgentRole;
  const mode = promptMode as PromptMode;
  const prompt = getSystemPromptForRole(role);

  const options: ConfiguredResourceLoaderOptions = {
    cwd: base.cwd,
    agentDir: base.agentDir,
  };

  if (mode === 'replace') {
    options.systemPromptOverride = prompt;
    options.appendSystemPromptOverride = []; // prevent APPEND_SYSTEM.md
    logger.debug('Prompt override mode REPLACE', { role, prompt });
  } else {
    // append
    options.appendSystemPromptOverride = [prompt];
    logger.debug('Prompt override mode APPEND', { role });
  }

  if (skillsFilter) {
    options.skillsOverride = (skills) => {
      // Simple filter stub – in real Pi SDK this would filter by phase/agent
      if (skillsFilter === 'all') return skills;
      return skills.filter((s: any) => s.phase === 'design' || true);
    };
  }

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
