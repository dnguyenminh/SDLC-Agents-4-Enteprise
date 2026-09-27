import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { compressPrompt, estimateTokenCount } from './prompt-compressor';
import { preferredVariantForTier, type ModelTier, type PromptVariant } from './model-tier';
import {
  MAX_TEMPLATE_FILE_BYTES,
  PromptTemplateError,
  collectTemplateFiles,
  readTemplateFile,
  validateTemplateName,
  type TemplateFileInfo,
} from './prompt-template-scan';
import { logger } from '../logger';

export { PromptTemplateError } from './prompt-template-scan';

export interface PromptTemplate {
  templateName: string;
  templatePath: string;
  promptContent: string;
  variant?: PromptVariant;
  tokenCount?: number;
  loaded?: boolean;
}

/**
 * SEC-326-01 — workspace-trust gate (mirrors WorkspaceTrustGuard policy:
 * only an explicit `false` is untrusted). When untrusted, workspace-local
 * templates (`.pi/prompts` inside cwd) are SKIPPED — they are a
 * system-prompt-poisoning surface in untrusted repos. agentDir source is kept.
 */
export interface PromptTemplateServiceOptions {
  trusted?: boolean;
}

export class PromptTemplateService {
  private readonly cwd: string;
  private readonly agentDir: string;
  private readonly trusted: boolean;
  private templates: PromptTemplate[] = [];

  constructor(cwd: string, agentDir?: string, options?: PromptTemplateServiceOptions) {
    this.cwd = cwd;
    this.agentDir = agentDir ?? path.join(os.homedir(), '.pi', 'agent');
    this.trusted = options?.trusted !== false; // SEC-326-01: explicit false → untrusted
  }

  private templateSources(): string[] {
    // SEC-326-01: skip workspace-local source when the workspace is untrusted
    const sources = this.trusted ? [path.join(this.cwd, '.pi', 'prompts')] : [];
    sources.push(path.join(this.agentDir, 'prompts'));
    return sources;
  }

  discover(promptsOverride?: PromptTemplate[]): void {
    const discovered: PromptTemplate[] = [];
    for (const source of this.templateSources()) {
      for (const { file, name, variant } of collectTemplateFiles([source])) {
        // SEC-326-02: stat-first size cap before any synchronous read;
        // SEC-326-01: symlink containment against the template's source dir
        const content = readTemplateFile(file, source);
        if (content === null) {
          logger.warn('Template skipped (size cap / symlink containment / unreadable)', { name, file, maxBytes: MAX_TEMPLATE_FILE_BYTES });
          continue;
        }
        logger.debug('Template loaded', { name, variant, bytes: Buffer.byteLength(content, 'utf-8') });
        discovered.push({
          templateName: name,
          templatePath: file,
          promptContent: content,
          variant,
          tokenCount: estimateTokenCount(content),
          loaded: true,
        });
      }
    }

    if (promptsOverride && Array.isArray(promptsOverride)) {
      for (const t of promptsOverride) {
        try {
          validateTemplateName(t.templateName);
          if (!fs.existsSync(t.templatePath)) {
            // skip invalid
            continue;
          }
          discovered.push({ ...t, variant: t.variant ?? 'full', loaded: true });
        } catch {
          logger.debug('Template override skipped', { name: t.templateName });
        }
      }
    }

    // deduplicate by name+variant, override wins
    const map = new Map<string, PromptTemplate>();
    for (const t of discovered) {
      map.set(`${t.templateName}:${t.variant ?? 'full'}`, t);
    }
    this.templates = Array.from(map.values());
  }

  getPrompts(): PromptTemplate[] {
    return this.templates;
  }

  private variantsFor(name: string): PromptTemplate[] {
    return this.templates.filter((t) => t.templateName === name);
  }

  getPrompt(name: string): PromptTemplate {
    validateTemplateName(name);
    const variants = this.variantsFor(name);
    const tpl = variants.find((t) => (t.variant ?? 'full') === 'full') ?? variants[0];
    if (!tpl) {
      throw new PromptTemplateError(`Template '${name}' không tồn tại`);
    }
    return tpl;
  }

  getPromptVariants(name: string): PromptTemplate[] {
    validateTemplateName(name);
    return this.variantsFor(name);
  }

  discoverForTier(tier: ModelTier | null): PromptTemplate[] {
    const byName = new Map<string, PromptTemplate[]>();
    const infos: TemplateFileInfo[] = collectTemplateFiles(this.templateSources());
    for (const { file, name, variant } of infos) {
      const list = byName.get(name) ?? [];
      list.push(this.lazyTemplate(file, name, variant));
      byName.set(name, list);
    }
    return Array.from(byName.values()).map((list) => this.pickTierVariant(list, tier));
  }

  private lazyTemplate(file: string, name: string, variant: PromptVariant): PromptTemplate {
    return {
      templateName: name,
      templatePath: file,
      promptContent: '',
      variant,
      tokenCount: this.fileTokenSize(file),
      loaded: false,
    };
  }

  private pickTierVariant(list: PromptTemplate[], tier: ModelTier | null): PromptTemplate {
    const preferred = preferredVariantForTier(tier);
    return list.find((t) => (t.variant ?? 'full') === preferred) ?? list[0];
  }

  getPromptForTier(name: string, tier: ModelTier | null): PromptTemplate {
    validateTemplateName(name);
    let variants = this.variantsFor(name);
    if (!variants.length) {
      variants = this.discoverForTier(tier).filter((t) => t.templateName === name);
    }
    if (!variants.length) {
      throw new PromptTemplateError(`Template '${name}' không tồn tại`);
    }
    return this.loadPromptContent(this.pickTierVariant(variants, tier));
  }

  private loadPromptContent(tpl: PromptTemplate): PromptTemplate {
    if (tpl.loaded) return tpl;
    // SEC-326-02: stat-first size cap; SEC-326-01: containment vs its own dir
    const content = readTemplateFile(tpl.templatePath, path.dirname(tpl.templatePath));
    if (content === null) {
      throw new PromptTemplateError(`Template '${tpl.templateName}' unreadable (missing, oversized, or outside workspace)`);
    }
    tpl.promptContent = content;
    tpl.tokenCount = estimateTokenCount(content);
    tpl.loaded = true;
    return tpl;
  }

  private fileTokenSize(file: string): number {
    try {
      return Math.ceil(fs.statSync(file).size / 4);
    } catch {
      return 0;
    }
  }

  compress(template: string): string {
    const compressed = compressPrompt(template);
    logger.debug('Prompt compression metrics', {
      originalTokens: estimateTokenCount(template),
      compressedTokens: estimateTokenCount(compressed),
    });
    return compressed;
  }

  validatePath(filePath: string): boolean {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  }
}
