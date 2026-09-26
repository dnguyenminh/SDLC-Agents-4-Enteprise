import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PromptTemplateService, PromptTemplateError } from '../prompt-template.service';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

const FULL_CONTENT = 'You are the BA agent. Create the BRD document. Example: {"a":1}\nTip: ask stakeholders.';
const COMPRESSED_CONTENT = 'You are the BA agent. Create the BRD document.';

describe('PromptTemplateService — tier variants (SA4E-326)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-prompt-tier-'));
  const promptsDir = path.join(tmpDir, '.pi', 'prompts');

  beforeEach(() => {
    fs.rmSync(promptsDir, { recursive: true, force: true });
    fs.mkdirSync(promptsDir, { recursive: true });
  });

  const writeTemplate = (name: string, content: string): void => {
    fs.writeFileSync(path.join(promptsDir, name), content);
  };

  it('discovers full and compressed variants as separate templates', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    writeTemplate('brd.compressed.md', COMPRESSED_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    svc.discover();
    const variants = svc.getPromptVariants('brd');
    expect(variants).toHaveLength(2);
    expect(variants.map((v) => v.variant).sort()).toEqual(['compressed', 'full']);
  });

  // STC: TC-001 — Prompt Compression for Small Model (compressed variant returned, smaller than full)
  it('TC-001: small tier returns compressed variant, smaller than full', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    writeTemplate('brd.compressed.md', COMPRESSED_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    svc.discover();
    const compressed = svc.getPromptForTier('brd', 'small');
    expect(compressed.variant).toBe('compressed');
    expect(compressed.promptContent.length).toBeLessThan(svc.getPrompt('brd').promptContent.length);
  });

  // STC: TC-702 — Integration with prompt-template.service.ts (compressed/full variant returned)
  it('TC-702: medium and large tiers return the full variant', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    writeTemplate('brd.compressed.md', COMPRESSED_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    svc.discover();
    expect(svc.getPromptForTier('brd', 'medium').variant).toBe('full');
    expect(svc.getPromptForTier('brd', 'large').variant).toBe('full');
  });

  // STC: TC-403 — Model Tier Detection Failure (tier unknown → fallback to full variant)
  it('TC-403: unknown tier falls back to full variant', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    writeTemplate('brd.compressed.md', COMPRESSED_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    svc.discover();
    expect(svc.getPromptForTier('brd', null).variant).toBe('full');
  });

  it('small tier falls back to full when compressed variant missing (NOT_FOUND → fallback full)', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    svc.discover();
    const tpl = svc.getPromptForTier('brd', 'small');
    expect(tpl.variant).toBe('full');
    expect(tpl.promptContent).toBe(FULL_CONTENT);
  });

  // STC: TC-101 — Prompt Discovery No Preload (content injected on demand)
  it('TC-101: discoverForTier lists metadata without reading content (lazy)', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    const readSpy = vi.mocked(fs.readFileSync);
    readSpy.mockClear();
    const svc = new PromptTemplateService(tmpDir);
    const discovered = svc.discoverForTier('small');
    expect(readSpy).not.toHaveBeenCalled();
    expect(discovered).toHaveLength(1);
    expect(discovered[0].promptContent).toBe('');
    expect(discovered[0].loaded).toBe(false);
    expect(discovered[0].tokenCount).toBeGreaterThan(0);

    const injected = svc.getPromptForTier('brd', 'small');
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(injected.promptContent).toBe(FULL_CONTENT);
    expect(injected.loaded).toBe(true);
  });

  it('getPromptForTier works without prior discover (on-demand discovery)', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    writeTemplate('brd.compressed.md', COMPRESSED_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    const tpl = svc.getPromptForTier('brd', 'small');
    expect(tpl.variant).toBe('compressed');
    expect(tpl.promptContent).toBe(COMPRESSED_CONTENT);
  });

  // STC: TC-301 — Prompt Discovery <500ms (<100 templates)
  it('TC-301: discovery of 100 templates completes <500ms', () => {
    for (let i = 0; i < 100; i++) {
      writeTemplate(`tpl-${String(i).padStart(3, '0')}.md`, FULL_CONTENT);
    }
    const svc = new PromptTemplateService(tmpDir);
    const start = Date.now();
    const discovered = svc.discoverForTier('small');
    const elapsed = Date.now() - start;
    expect(discovered).toHaveLength(100);
    expect(elapsed).toBeLessThan(500);
  });

  // STC: TC-401 — Empty Template Set (graceful empty response)
  it('TC-401: empty template set degrades gracefully', () => {
    const svc = new PromptTemplateService(tmpDir);
    expect(svc.discoverForTier('small')).toEqual([]);
    expect(() => svc.getPromptForTier('brd', 'small')).toThrow(PromptTemplateError);
  });

  it('compress() returns compressed prompt (COMPRESSION_FAIL → original)', () => {
    const svc = new PromptTemplateService(tmpDir);
    const compressed = svc.compress(FULL_CONTENT);
    expect(compressed.length).toBeLessThan(FULL_CONTENT.length);
    expect(svc.compress('Do the task.')).toBe('Do the task.');
    expect(svc.compress('')).toBe('');
  });

  it('tokenCount metadata is attached to discovered templates', () => {
    writeTemplate('brd.md', FULL_CONTENT);
    const svc = new PromptTemplateService(tmpDir);
    svc.discover();
    const tpl = svc.getPrompt('brd');
    expect(tpl.tokenCount).toBe(Math.ceil(FULL_CONTENT.length / 4));
  });
});
