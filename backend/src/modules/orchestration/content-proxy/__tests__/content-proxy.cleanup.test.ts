/**
 * Content proxy — local cleanup suite (SA4E-380 STC §2.9 addendum, TDD §9.1).
 * UT-44/45/46 + the F-01 confinement contract for `readLocalFile`.
 * Split from content-proxy.test.ts to honour the 200-line file gate.
 */

import { describe, it, expect, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { detectCapability } from '../detect.js';
import { adaptInvocation } from '../invocation-adapter.js';
import { adaptResult } from '../result-adapter.js';
import { resolveArtifact, resolveContentBlock } from '../artifact-source.js';
import type { ToolDefinition } from '../../../../types/tool.js';

// ESM namespaces are not spy-able — route unlinkSync through a mutable ref so
// the UT-45 failure case can simulate an undeletable (locked) artifact.
const unlinkRef = vi.hoisted(() => ({ impl: null as null | (() => never) }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const real = actual.unlinkSync.bind(actual);
  const unlinkSync = ((filePath: Parameters<typeof real>[0]) => {
    if (unlinkRef.impl) return unlinkRef.impl(filePath);
    return real(filePath);
  }) as typeof actual.unlinkSync;
  return { ...actual, unlinkSync };
});

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'content-proxy-cleanup-'));
const PREVIOUS_ROOTS = process.env['ARTIFACT_OUTPUT_ROOTS'];
process.env['ARTIFACT_OUTPUT_ROOTS'] = TMP;
afterAll(() => {
  unlinkRef.impl = null;
  if (PREVIOUS_ROOTS === undefined) delete process.env['ARTIFACT_OUTPUT_ROOTS'];
  else process.env['ARTIFACT_OUTPUT_ROOTS'] = PREVIOUS_ROOTS;
  fs.rmSync(TMP, { recursive: true, force: true });
});

const EXPORT_DOCX: ToolDefinition = {
  name: 'export_docx',
  description: 'Export a Markdown file to DOCX.',
  category: 'orchestration',
  inputSchema: { type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] },
};

const wrapperInvocation = () => adaptInvocation(detectCapability(EXPORT_DOCX)!, {
  content_base64: Buffer.from('# x').toString('base64'),
});

describe('content proxy — local cleanup (OI-14)', () => {
  // STC: UT-44 — immediate cleanup: local artifact deleted after successful inline
  it('deletes the local artifact after its bytes are inlined (stat → ENOENT)', async () => {
    const file = path.join(TMP, 'out.docx');
    fs.writeFileSync(file, Buffer.from('DOCX-BYTES'));

    const fetched = await resolveArtifact({ path: file, name: 'out.docx' }, {});

    expect(fetched?.buffer.toString()).toBe('DOCX-BYTES');
    expect(fs.existsSync(file)).toBe(false);
  });

  // STC: UT-44 step 3 — a file: URI read inherits deletion via readLocalFile
  it('deletes artifacts read through a file: URI as well', async () => {
    const file = path.join(TMP, 'cleanup-uri.docx');
    fs.writeFileSync(file, Buffer.from('URI-BYTES'));

    const fetched = await resolveArtifact({ uri: pathToFileURL(file).href, name: 'cleanup-uri.docx' }, {});

    expect(fetched?.buffer.toString()).toBe('URI-BYTES');
    expect(fs.existsSync(file)).toBe(false);
  });

  // STC: UT-45 — cleanup failure never fails the tool call; basename-only warning
  it('keeps the bytes and warns (basename only) when unlink fails', async () => {
    const file = path.join(TMP, 'locked.docx');
    fs.writeFileSync(file, Buffer.from('LOCKED-BYTES'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    unlinkRef.impl = () => {
      throw Object.assign(new Error('EBUSY: resource busy'), { code: 'EBUSY' });
    };
    try {
      const fetched = await resolveArtifact({ path: file, name: 'locked.docx' }, {});

      expect(fetched?.buffer.toString()).toBe('LOCKED-BYTES');
      expect(fs.existsSync(file)).toBe(true);
      const logged = (warn.mock.calls.at(-1) ?? []).map((arg) => JSON.stringify(arg)).join(' ');
      expect(logged).toContain('locked.docx');
      expect(logged).not.toContain(TMP); // I-3: no host path in logs
    } finally {
      unlinkRef.impl = null;
      warn.mockRestore();
      fs.rmSync(file, { force: true });
    }
  });

  // STC: UT-45 step 2 — a failed read never deletes anything
  it('never deletes when the read fails (out-of-root or oversized)', async () => {
    const outside = path.join(os.tmpdir(), `content-proxy-refused-${Date.now()}.docx`);
    fs.writeFileSync(outside, Buffer.from('SECRET'));
    const oversized = path.join(TMP, 'huge.docx');
    fs.writeFileSync(oversized, Buffer.alloc(26 * 1024 * 1024, 'x'));
    try {
      await resolveArtifact({ path: outside, name: 'secret.docx' }, {});
      await resolveArtifact({ path: oversized, name: 'huge.docx' }, {});
      expect(fs.existsSync(outside)).toBe(true);
      expect(fs.existsSync(oversized)).toBe(true);
    } finally {
      fs.rmSync(outside, { force: true });
      fs.rmSync(oversized, { force: true });
    }
  });

  // STC: UT-46 — resource/URL/blob-resolved artifacts are never deleted (OI-14 scope)
  it('never deletes artifacts resolved via resources/read, URLs or content blocks', async () => {
    const cleanup = vi.fn();
    const readResource = async (uri: string) => (uri === 'artifact://job-7/UG.docx' ? Buffer.from('REMOTE-DOCX') : null);
    const fetchUrl = async () => Buffer.from('HTTP-DOCX');

    await resolveArtifact({ uri: 'artifact://job-7/UG.docx', name: 'UG.docx' }, { cleanup, readResource });
    await resolveArtifact({ url: 'https://files.example/UG.docx', name: 'UG.docx' }, { cleanup, fetchUrl });
    await resolveContentBlock(
      { type: 'resource', resource: { uri: 'file:///srv/UG.docx', blob: Buffer.from('BLOB-DOCX').toString('base64') } },
      { cleanup },
    );

    expect(cleanup).not.toHaveBeenCalled();
  });

  // Dep contract behind the McpClientManager wiring: local reads call cleanup with the pre-read stat.
  it('invokes the injected cleanup hook only for local reads', async () => {
    const cleanup = vi.fn();
    const file = path.join(TMP, 'hooked.docx');
    fs.writeFileSync(file, Buffer.from('HOOKED-BYTES'));

    await resolveArtifact({ path: file, name: 'hooked.docx' }, { cleanup });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(file, expect.objectContaining({ size: 12 }));
  });

  // SECURITY-REVIEW F-01 (High, binding): outside ARTIFACT_OUTPUT_ROOTS → no read, no delete, loud failure.
  it('refuses out-of-root local paths and fails loudly as ARTIFACT_FETCH_FAILED', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'content-proxy-outside-'));
    try {
      const file = path.join(outside, 'secret.docx');
      fs.writeFileSync(file, Buffer.from('SECRET'));
      const result = {
        content: [{ type: 'text', text: JSON.stringify({ success: true, artifacts: [{ path: file, name: 'secret.docx', size: 6 }] }) }],
        isError: false,
      };

      const fetched = await resolveArtifact({ path: file, name: 'secret.docx' }, {});
      const adapted = await adaptResult(wrapperInvocation(), result, { serverName: 'local-exporter' });

      expect(fetched).toBeNull(); // never read
      expect(fs.existsSync(file)).toBe(true); // never deleted
      expect(adapted.isError).toBe(true);
      expect(adapted.content[0].text).toMatch(/ARTIFACT_FETCH_FAILED/);
      expect(adapted.content[0].text).not.toContain(outside); // no host path leak
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
