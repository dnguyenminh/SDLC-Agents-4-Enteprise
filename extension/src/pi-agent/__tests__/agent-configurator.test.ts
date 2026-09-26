import { describe, it, expect } from 'vitest';
import {
  validateAgentRole,
  validatePromptMode,
  buildResourceLoaderOptions,
  getSystemPromptForRole,
  ALLOWED_ROLES,
  simulateAgentSession,
  ValidationError,
} from '../agent-configurator';

describe('agent-configurator', () => {
  describe('validateAgentRole', () => {
    it('accepts valid roles', () => {
      ALLOWED_ROLES.forEach((role) => {
        expect(() => validateAgentRole(role)).not.toThrow();
      });
    });

    it('rejects invalid role', () => {
      expect(() => validateAgentRole('INVALID_ROLE')).toThrow(ValidationError);
    });

    it('rejects empty role', () => {
      expect(() => validateAgentRole('')).toThrow();
    });
  });

  describe('validatePromptMode', () => {
    it('accepts append and replace', () => {
      expect(() => validatePromptMode('append')).not.toThrow();
      expect(() => validatePromptMode('replace')).not.toThrow();
    });

    it('rejects unknown mode', () => {
      expect(() => validatePromptMode('unknown')).toThrow(ValidationError);
    });
  });

  describe('getSystemPromptForRole', () => {
    it('returns prompt containing role name', () => {
      const prompt = getSystemPromptForRole('BA');
      expect(prompt).toContain('Business Analyst');
    });
  });

  describe('buildResourceLoaderOptions', () => {
    const base = { cwd: '/tmp', agentDir: '/agent' };

    it('TC-001: Configure System Prompt Append Mode with Valid Agent Role', () => {
      const opts = buildResourceLoaderOptions(base, 'BA', 'append');
      expect(opts.appendSystemPromptOverride).toBeDefined();
      expect(opts.appendSystemPromptOverride?.[0]).toContain('Business Analyst');
      expect(opts.systemPromptOverride).toBeUndefined();

      const session = simulateAgentSession(opts, 'BA');
      expect(session.systemPrompt).toContain('Business Analyst');
    });

    it('TC-002: Configure System Prompt Replace Mode with Valid Agent Role', () => {
      const opts = buildResourceLoaderOptions(base, 'DEV', 'replace');
      expect(opts.systemPromptOverride).toBeDefined();
      expect(opts.systemPromptOverride).toContain('Developer');
      expect(opts.appendSystemPromptOverride).toEqual([]);

      const session = simulateAgentSession(opts, 'DEV');
      expect(session.systemPrompt).toContain('Developer');
      expect(session.systemPrompt).not.toContain('APPEND_SYSTEM');
    });

    it('TC-003: Load Project Skills via loader.getSkills()', () => {
      const opts = buildResourceLoaderOptions(base, 'BA', 'append', 'all');
      expect(opts.skillsOverride).toBeDefined();
      const dummySkills = [{ id: 'sdlc-ba' }, { id: 'other' }];
      const filtered = opts.skillsOverride!(dummySkills);
      expect(filtered).toContainEqual({ id: 'sdlc-ba' });
    });

    it('TC-004: Verify Prompt Replace Mode Does Not Append APPEND_SYSTEM.md', () => {
      const opts = buildResourceLoaderOptions(base, 'BA', 'replace');
      expect(opts.appendSystemPromptOverride).toEqual([]);
    });

    it('TC-101: Configure Prompt for Different Agent Roles', () => {
      const opts = buildResourceLoaderOptions(base, 'SA', 'append');
      expect(opts.appendSystemPromptOverride?.[0]).toContain('Solution Architect');
    });

    it('TC-201: Invalid Agent Role Returns Validation Error', () => {
      expect(() => buildResourceLoaderOptions(base, 'INVALID_ROLE', 'append')).toThrow(ValidationError);
    });

    it('TC-202: Invalid PromptMode Returns Validation Error', () => {
      expect(() => buildResourceLoaderOptions(base, 'BA', 'unknown' as any)).toThrow(ValidationError);
    });

    it('TC-301: BR-1 Agent Role Must Be From Defined List', () => {
      expect(() => validateAgentRole('SM')).not.toThrow();
      expect(() => validateAgentRole('X')).toThrow();
    });

    it('TC-302: BR-2 PromptMode Must Be Append Or Replace', () => {
      expect(() => validatePromptMode('append')).not.toThrow();
      expect(() => validatePromptMode('replace')).not.toThrow();
      expect(() => validatePromptMode('other' as any)).toThrow();
    });

    it('TC-303: BR-6 Replace Mode Returns Empty Append List', () => {
      const opts = buildResourceLoaderOptions(base, 'QA', 'replace');
      expect(opts.appendSystemPromptOverride).toEqual([]);
    });

    it('TC-401: Empty Agent Role', () => {
      expect(() => buildResourceLoaderOptions(base, '', 'append')).toThrow();
    });

    it('TC-402: PromptMode Null', () => {
      expect(() => buildResourceLoaderOptions(base, 'BA', null as any)).toThrow();
    });
  });
});
