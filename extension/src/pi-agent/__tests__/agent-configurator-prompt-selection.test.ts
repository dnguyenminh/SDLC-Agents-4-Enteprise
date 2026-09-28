import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  selectPrompt,
  appendSystemMd,
  buildResourceLoaderOptions,
  simulateAgentSession,
  DEFAULT_AGENT_PROMPT,
  getSystemPromptForRole,
} from '../agent-configurator';
import { compressPrompt } from '../prompt-compressor';
import { PromptTemplateService } from '../prompt-template.service';

const BA_FULL_TEMPLATE = [
  '# BA Template',
  '',
  'You are the BA agent. Create the BRD document with user stories and acceptance criteria.',
  '',
  'Example:',
  '{"story": 1, "title": "Login"}',
  '{"story": 2, "title": "Logout"}',
  '',
  '## Output',
  'Write to documents/{TICKET}/BRD.md.',
  '',
].join('\n');
const BA_COMPRESSED_TEMPLATE = '# BA Template\nCreate the BRD document with user stories and acceptance criteria.\n## Output\nWrite to documents/{TICKET}/BRD.md.\n';

describe('agent-configurator — prompt selection (SA4E-326)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-agent-sel-'));
  const promptsDir = path.join(tmpDir, '.pi', 'prompts');

  beforeAll(() => {
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, 'ba.md'), BA_FULL_TEMPLATE);
    fs.writeFileSync(path.join(promptsDir, 'ba.compressed.md'), BA_COMPRESSED_TEMPLATE);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(path.join(tmpDir, 'SYSTEM.md'), { force: true });
  });

  describe('selectPrompt', () => {
    // STC: TC-001 — small model receives the compressed prompt
    it('small model + template service returns compressed template variant', () => {
      const templateService = new PromptTemplateService(tmpDir);
      const small = selectPrompt('phi-3-mini', 'BA', { templateService, templateName: 'ba' });
      const large = selectPrompt('claude-3-opus', 'BA', { templateService, templateName: 'ba' });
      expect(small).toContain(BA_COMPRESSED_TEMPLATE.trim());
      expect(small).not.toContain('{"story": 1');
      expect(small.length).toBeLessThan(large.length);
      expect(large).toContain('{"story": 1');
    });

    it('unknown tier + template service returns full template variant', () => {
      const templateService = new PromptTemplateService(tmpDir);
      const prompt = selectPrompt('gpt-4o', 'BA', { templateService, templateName: 'ba' });
      expect(prompt).toContain(BA_FULL_TEMPLATE.trim());
    });

    it('small model applies best-effort compression to bare role prompt', () => {
      const prompt = selectPrompt('phi-3-mini', 'BA');
      expect(prompt).toBe(compressPrompt(getSystemPromptForRole('BA')));
      expect(prompt).toContain('Business Analyst');
    });

    it('large model returns full role prompt', () => {
      expect(selectPrompt('claude-3-opus', 'BA')).toBe(getSystemPromptForRole('BA'));
    });

    // STC: TC-403 — Model Tier Detection Failure → fallback to full variant
    it('unknown model falls back to full role prompt', () => {
      expect(selectPrompt('gpt-4o', 'DEV')).toBe(getSystemPromptForRole('DEV'));
    });

    // STC: TC-402 — Unknown Role → ROLE_MISMATCH → default
    it('unknown role returns default prompt', () => {
      expect(selectPrompt('phi-3-mini', 'HACKER')).toBe(DEFAULT_AGENT_PROMPT);
    });

    // STC: TC-102 — SYSTEM.md Append in Replace Mode
    it('replace mode appends workspace SYSTEM.md', () => {
      fs.writeFileSync(path.join(tmpDir, 'SYSTEM.md'), 'Project context: SDLC pipeline.');
      const prompt = selectPrompt('gpt-4o', 'BA', { promptMode: 'replace', cwd: tmpDir });
      expect(prompt).toContain('Business Analyst');
      expect(prompt).toContain('Project context: SDLC pipeline.');
    });

    it('replace mode without SYSTEM.md keeps role prompt only', () => {
      const prompt = selectPrompt('gpt-4o', 'QA', { promptMode: 'replace', cwd: tmpDir });
      expect(prompt).toBe(getSystemPromptForRole('QA'));
    });

    it('append mode does not append SYSTEM.md', () => {
      fs.writeFileSync(path.join(tmpDir, 'SYSTEM.md'), 'Project context: SDLC pipeline.');
      const prompt = selectPrompt('gpt-4o', 'QA', { promptMode: 'append', cwd: tmpDir });
      expect(prompt).not.toContain('Project context');
    });

    it('missing template degrades to role prompt (graceful)', () => {
      const templateService = new PromptTemplateService(tmpDir);
      const prompt = selectPrompt('phi-3-mini', 'SA', { templateService, templateName: 'nonexistent' });
      expect(prompt).toBe(compressPrompt(getSystemPromptForRole('SA')));
    });
  });

  describe('appendSystemMd', () => {
    it('returns prompt unchanged when SYSTEM.md missing', () => {
      expect(appendSystemMd('prompt', tmpDir)).toBe('prompt');
    });
  });

  describe('buildResourceLoaderOptions — role scope integration', () => {
    const base = { cwd: tmpDir, agentDir: path.join(tmpDir, 'agent') };

    // STC: TC-701 — Integration with agent-configurator.ts (role filter applied)
    it('phase skills filter applies role scope for SM (only BRD skill)', () => {
      const opts = buildResourceLoaderOptions(base, 'SM', 'append', 'phase');
      const skills = [
        { id: 'sdlc-brd-skill' },
        { id: 'sdlc-code-skill' },
        { id: 'sdlc-test-skill' },
      ];
      expect(opts.skillsOverride!(skills)).toEqual([{ id: 'sdlc-brd-skill' }]);
    });

    it('all skills filter keeps every skill', () => {
      const opts = buildResourceLoaderOptions(base, 'SM', 'append', 'all');
      const skills = [{ id: 'sdlc-brd-skill' }, { id: 'other' }];
      expect(opts.skillsOverride!(skills)).toEqual(skills);
    });

    it('small modelId applies compression to system prompt override', () => {
      const opts = buildResourceLoaderOptions(base, 'DEV', 'replace', undefined, 'phi-3-mini');
      expect(opts.systemPromptOverride).toBe(compressPrompt(getSystemPromptForRole('DEV')));
      expect(opts.appendSystemPromptOverride).toEqual([]);
    });

    it('large modelId keeps full prompt', () => {
      const opts = buildResourceLoaderOptions(base, 'DEV', 'replace', undefined, 'claude-3-opus');
      expect(opts.systemPromptOverride).toBe(getSystemPromptForRole('DEV'));
    });

    // STC: TC-704 — Prompt Injection On Demand (prompt present in session, no preload needed)
    it('session receives the configured prompt', () => {
      const opts = buildResourceLoaderOptions(base, 'BA', 'append');
      const session = simulateAgentSession(opts, 'BA');
      expect(session.systemPrompt).toContain('Business Analyst');
    });
  });
});
