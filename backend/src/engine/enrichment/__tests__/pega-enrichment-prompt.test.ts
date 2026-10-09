/**
 * SA4E-106 — Unit tests for PEGA_SUMMARY prompt building.
 * Verifies the Pega rule body (steps/Java/params) reaches the LLM prompt.
 */

import { describe, it, expect } from 'vitest';
import { CodeEnrichmentPromptBuilder } from '../CodeEnrichmentPromptBuilder.js';
import type { SymbolContext } from '../types.js';

describe('CodeEnrichmentPromptBuilder PEGA_SUMMARY (SA4E-106)', () => {
  const builder = new CodeEnrichmentPromptBuilder();

  function context(overrides: Partial<SymbolContext> = {}): SymbolContext {
    return {
      name: 'AccelKeyValidate',
      kind: 'pega_activity',
      signature: 'Rule-Obj-Activity:@baseclass:AccelKeyValidate',
      docComment: null,
      bodyText: 'ACTIVITY: @baseclass.AccelKeyValidate\n[RowID: 1] Call(Work.Validate)',
      childMembers: null,
      existingPseudoCode: null,
      pegaClass: '@baseclass',
      pegaRuleset: 'HRAppsV2 01-01-01',
      ...overrides,
    };
  }

  it('includes rule body content in the user prompt', () => {
    const messages = builder.build('PEGA_SUMMARY', context());
    const user = messages.find(m => m.role === 'user');
    expect(user?.content).toContain('Rule Content:');
    expect(user?.content).toContain('[RowID: 1] Call(Work.Validate)');
  });

  it('includes pega class and ruleset when provided', () => {
    const messages = builder.build('PEGA_SUMMARY', context());
    const user = messages.find(m => m.role === 'user')!;
    expect(user.content).toContain('Class: @baseclass');
    expect(user.content).toContain('RuleSet: HRAppsV2 01-01-01');
  });

  it('includes signature and existing pseudo code when present', () => {
    const messages = builder.build('PEGA_SUMMARY', context({
      existingPseudoCode: '1. Validate input\n2. Notify user',
    }));
    const user = messages.find(m => m.role === 'user')!;
    expect(user.content).toContain('Signature: Rule-Obj-Activity:@baseclass:AccelKeyValidate');
    expect(user.content).toContain('Existing Pseudo Code:');
    expect(user.content).toContain('1. Validate input');
  });

  it('truncates large rule bodies to MAX_BODY_TOKENS', () => {
    const bigBody = Array.from({ length: 6000 }, (_, i) => `word${i}`).join(' ');
    const messages = builder.build('PEGA_SUMMARY', context({ bodyText: bigBody }));
    const user = messages.find(m => m.role === 'user')!;
    // MAX_BODY_TOKENS = 4000 words → 6000 words should be truncated with ellipsis
    // The content is wrapped in UNTRUSTED delimiters, so check for truncation inside delimiters
    expect(user.content).toContain('...');
    expect(user.content).toContain('--- END UNTRUSTED RULE CONTENT ---');
  });

  it('system prompt requests summary, pseudo_code and tags', () => {
    const messages = builder.build('PEGA_SUMMARY', context());
    const system = messages.find(m => m.role === 'system')!;
    expect(system.content).toContain('summary');
    expect(system.content).toContain('pseudo_code');
    expect(system.content).toContain('tags');
  });

  it('includes schema context in the user prompt when present (SA4E-338 B2)', () => {
    const messages = builder.build('PEGA_SUMMARY', context({
      schemaContext: '--- BEGIN SCHEMA CONTEXT ---\nRule Type: Activity\n--- END SCHEMA CONTEXT ---',
    }));
    const user = messages.find(m => m.role === 'user')!;
    expect(user.content).toContain('--- BEGIN SCHEMA CONTEXT ---');
    expect(user.content).toContain('Rule Type: Activity');
  });

  it('caps a dense, space-free body so the total prompt stays within the token cap (SA4E-338 B2)', () => {
    // A single space-free blob: word-count estimated this as ~1 token (bug),
    // char-based estimate correctly sees ~250k tokens → must be truncated.
    const dense = 'x'.repeat(1_000_000);
    const messages = builder.build('PEGA_SUMMARY', context({ bodyText: dense }));
    const totalChars = messages.reduce((n, m) => n + m.content.length, 0);
    // Char-based cap: PROMPT_TOKEN_CAP (24000) * 4 chars/token, plus small fixed overhead.
    expect(totalChars).toBeLessThan(24000 * 4 + 2000);
    const user = messages.find(m => m.role === 'user')!;
    expect(user.content).toContain('...');
  });
});