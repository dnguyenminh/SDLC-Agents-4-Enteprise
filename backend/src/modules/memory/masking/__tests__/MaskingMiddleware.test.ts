import { describe, it, expect } from 'vitest';
import { MaskingMiddleware } from '../MaskingMiddleware.js';
import { AllowlistService } from '../services/AllowlistService.js';
import { AuditService } from '../services/AuditService.js';
import { ConfigCacheService } from '../services/ConfigCacheService.js';
import { KnowledgeEntry } from '../../models.js';

function makeEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 1, content: 'Clean content', summary: 'Summary',
    type: 'CONTEXT', tier: 'core', scope: 'USER',
    user_id: null, project_id: null, source: null, source_ref: null,
    tags: '', confidence: 1, access_count: 0,
    created_at: '', updated_at: '', last_accessed_at: null,
    expires_at: null, pinned: 0, pin_order: 0,
    structured_map: '', quality_score: null, archived: 0,
    agent_name: null, owner: null, ...overrides,
  };
}

describe('MaskingMiddleware', () => {
  const config = new ConfigCacheService();
  const allowlist = new AllowlistService();
  const audit = new AuditService();
  const mw = new MaskingMiddleware(config, allowlist, audit);

  it('passes clean content unchanged', () => {
    const entry = makeEntry({ content: 'No sensitive data here' });
    const r = mw.applyMasking([entry], 'DEVELOPER', 'user-1');
    expect(r[0].content).toBe('No sensitive data here');
    expect(r[0].masking_applied).toBe(false);
  });

  it('masks email for non-admin', () => {
    const entry = makeEntry({ content: 'Contact user@example.com' });
    const r = mw.applyMasking([entry], 'DEVELOPER', 'user-1');
    expect(r[0].content).not.toContain('user@example.com');
    expect(r[0].masking_applied).toBe(true);
  });

  it('does NOT mask email for admin', () => {
    const entry = makeEntry({ content: 'Contact user@example.com' });
    const r = mw.applyMasking([entry], 'ADMIN', 'admin-1');
    expect(r[0].content).toContain('user@example.com');
  });

  it('always masks credentials for admin (no reveal)', () => {
    const entry = makeEntry({ content: 'sk-abc123xyz789abcdefghijklm' });
    const r = mw.applyMasking([entry], 'ADMIN', 'admin-1');
    expect(r[0].content).not.toContain('sk-abc123xyz789abcdefghijklm');
  });

  it('reveals credentials for admin with reveal=true', () => {
    const entry = makeEntry({ content: 'sk-abc123xyz789abcdefghijklm' });
    const r = mw.applyMasking([entry], 'ADMIN', 'a', { reveal: true });
    expect(r[0].content).toContain('sk-abc123xyz789abcdefghijklm');
  });

  it('hides RESTRICTED for non-admin', () => {
    const entry = makeEntry({ content: 'sk-abc123xyz789abcdefghijklm' });
    const r = mw.applyMasking([entry], 'DEVELOPER', 'dev-1');
    expect(r.length).toBe(0);
  });

  it('skips masking for allowlisted entry', () => {
    const al = new AllowlistService();
    al.updateRules([{ id: 1, rule_type: 'entry_id', rule_value: '42',
      description: null, created_by: null, created_at: '' }]);
    const mw2 = new MaskingMiddleware(config, al, audit);
    const entry = makeEntry({ id: 42, content: 'user@example.com' });
    const r = mw2.applyMasking([entry], 'DEVELOPER', 'dev-1');
    expect(r[0].content).toContain('user@example.com');
  });
});
