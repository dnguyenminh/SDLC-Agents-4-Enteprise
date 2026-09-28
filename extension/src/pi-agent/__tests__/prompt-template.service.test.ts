import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PromptTemplateService, PromptTemplateError } from '../prompt-template.service';

describe('PromptTemplateService', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-prompt-'));
  const cwd = tmpDir;
  const promptsDir = path.join(cwd, '.pi', 'prompts');
  fs.mkdirSync(promptsDir, { recursive: true });

  beforeEach(() => {
    // clean
    fs.readdirSync(promptsDir).forEach(f => fs.unlinkSync(path.join(promptsDir, f)));
  });

  it('discovers templates from cwd', () => {
    const file = path.join(promptsDir, 'brd.md');
    fs.writeFileSync(file, 'Create BRD');
    const svc = new PromptTemplateService(cwd);
    svc.discover();
    const prompts = svc.getPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].templateName).toBe('brd');
    expect(prompts[0].promptContent).toBe('Create BRD');
  });

  it('validates template name BR-1', () => {
    expect(() => {
      const svc = new PromptTemplateService(cwd);
      // Force invalid name
      // @ts-ignore
      svc['discover']?.();
    }).not.toThrow();
    // Direct validation via getPrompt
    const svc = new PromptTemplateService(cwd);
    svc.discover();
    expect(() => svc.getPrompt('INVALID_NAME')).toThrow(PromptTemplateError);
  });

  it('template not found error message', () => {
    const svc = new PromptTemplateService(cwd);
    svc.discover();
    try {
      svc.getPrompt('nonexist');
    } catch (e: any) {
      expect(e.message).toContain("Template 'nonexist' không tồn tại");
    }
  });

  it('promptsOverride merges additional templates', () => {
    const svc = new PromptTemplateService(cwd);
    const override = [{
      templateName: 'deploy',
      templatePath: path.join(promptsDir, 'deploy.md'),
      promptContent: 'Deploy steps',
    }];
    fs.writeFileSync(path.join(promptsDir, 'deploy.md'), 'Deploy steps');
    svc.discover(override);
    const names = svc.getPrompts().map(p => p.templateName);
    expect(names).toContain('deploy');
  });

  it('validatePath returns true for existing file', () => {
    const file = path.join(promptsDir, 'fsd.md');
    fs.writeFileSync(file, 'FSD');
    const svc = new PromptTemplateService(cwd);
    expect(svc.validatePath(file)).toBe(true);
    expect(svc.validatePath('/no/file')).toBe(false);
  });
});
