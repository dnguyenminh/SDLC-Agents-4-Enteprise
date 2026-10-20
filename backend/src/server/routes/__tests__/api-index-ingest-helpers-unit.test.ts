import { describe, it, expect, vi } from 'vitest';
import {
  summarizeIngestResult,
  inferTypeFromPath,
  extractTagsFromPath,
  isIngestableFile,
} from '../api-index-ingest';

vi.mock('../../../admin/db/sessions.js', () => ({
  validateSession: vi.fn(),
}));

vi.mock('../../../admin/admin-db.js', () => ({
  getUserPermissions: vi.fn(),
}));

vi.mock('../../middleware/jwt-auth.js', () => ({
  verifyJwtToken: vi.fn(),
  allowedProjectsFromClaims: vi.fn(),
}));

describe('api-index-ingest helpers (SA4E-337)', () => {
  it('inferTypeFromPath maps BRD/FSD/TDD/STP patterns', () => {
    expect(inferTypeFromPath('docs/SA4E-1/BRD.md')).toBe('REQUIREMENT');
    expect(inferTypeFromPath('docs/FSD-embedded.md')).toBe('REQUIREMENT');
    expect(inferTypeFromPath('docs/TDD.md')).toBe('ARCHITECTURE');
    expect(inferTypeFromPath('docs/STP.md')).toBe('PROCEDURE');
    expect(inferTypeFromPath('docs/RUN-LOG.md')).toBe('PROCEDURE');
    expect(inferTypeFromPath('docs/diagram.drawio')).toBe('CONTEXT');
    expect(inferTypeFromPath('docs/notes.txt')).toBe('CONTEXT');
  });

  it('extractTagsFromPath extracts SA4E / feature tags from segments', () => {
    expect(extractTagsFromPath('documents/SA4E-337/BRD.md')).toEqual(expect.arrayContaining(['sa4e', 'sa4e-337']));
    expect(extractTagsFromPath('C:\\ws\\F3\\TDD.md')).toEqual(expect.arrayContaining(['feature', 'f3']));
    expect(extractTagsFromPath('docs/plain.md')).toEqual([]);
  });

  it('summarizeIngestResult classifies ok / Error / isError / unconvertible', () => {
    // Success JSON from handleIngestFile
    expect(summarizeIngestResult({ content: [{ type: 'text', text: '{"status":"ingested"}' }], isError: false }))
      .toEqual({ ok: true, reason: '' });
    // Unconvertible payload (TDD §3.2 failedFiles reason "no-tool")
    expect(summarizeIngestResult({ content: [{ type: 'text', text: '{"status":"unconvertible","reason":"no-tool"}' }], isError: false }))
      .toEqual({ ok: false, reason: 'no-tool' });
    // String error result (handler returned, not thrown)
    expect(summarizeIngestResult({ content: [{ type: 'text', text: 'Error: file not found — /x' }], isError: false }))
      .toEqual({ ok: false, reason: 'file not found — /x' });
    // withErrorHandling wrapped throw → isError envelope
    expect(summarizeIngestResult({ content: [{ type: 'text', text: 'Error: ENOSPC' }], isError: true }))
      .toEqual({ ok: false, reason: 'ENOSPC' });
    // Empty result
    expect(summarizeIngestResult(null).ok).toBe(false);
  });

  // SA4E-337 F3 — fail-open regression: text that LOOKS like JSON but cannot be
  // parsed must be reported as a failure (per-file isolation keeps the run alive).
  it('summarizeIngestResult fails closed on invalid JSON ingest result', () => {
    expect(summarizeIngestResult({ content: [{ type: 'text', text: '{ingested: 3' }], isError: false }))
      .toEqual({ ok: false, reason: 'invalid JSON ingest result' });
    expect(summarizeIngestResult({ content: [{ type: 'text', text: '{"status": "ingested"' }], isError: false }))
      .toEqual({ ok: false, reason: 'invalid JSON ingest result' });
    // Non-JSON free text not starting with '{' is still accepted (backward compat)
    expect(summarizeIngestResult({ content: [{ type: 'text', text: 'Knowledge entry created: id=1' }], isError: false }))
      .toEqual({ ok: true, reason: '' });
  });

  // SA4E-337 F6 — extension check must be case-insensitive (.MD / .TXT / .DRAWIO)
  it('isIngestableFile accepts upper/mixed-case extensions', () => {
    expect(isIngestableFile('README.MD')).toBe(true);
    expect(isIngestableFile('notes.Txt')).toBe(true);
    expect(isIngestableFile('diagram.DRAWIO')).toBe(true);
    expect(isIngestableFile('image.png')).toBe(false);
    expect(isIngestableFile('archive.md.bak')).toBe(false);
  });
});
