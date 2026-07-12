/**
 * KSA-145: Grammar Registry — Manages tree-sitter WASM grammar loading and caching.
 * Maps file extensions to language parsers, lazy-loads grammars on first use.
 * KSA-191: Added null wasmPath support + compound extension matching.
 */

import { Parser, Language } from 'web-tree-sitter';
import type { Node } from 'web-tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import type { ILanguageParser } from './types.js';

const logger = pino({ name: 'grammar-registry' });

export interface LanguageConfig {
  id: string;
  extensions: string[];
  wasmPath: string | null;
  parserModule: string;
}

export interface GrammarRegistryConfig {
  languages: LanguageConfig[];
  grammarDir: string;
}

export class GrammarRegistry {
  private config: GrammarRegistryConfig;
  private parsers: Map<string, any> = new Map();
  private languageParsers: Map<string, ILanguageParser> = new Map();
  private extensionMap: Map<string, string> = new Map();
  private unavailable: Set<string> = new Set();
  private initialized = false;
  private ParserClass: typeof Parser | null = null;

  constructor(config: GrammarRegistryConfig) {
    this.config = config;
    this.buildExtensionMap();
  }

  /** Initialize web-tree-sitter WASM runtime. Must be called before parsing. */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Parser.init();
    this.ParserClass = Parser;
    this.initialized = true;
    logger.error('[grammar-registry] Tree-sitter WASM runtime initialized');
  }

  /** Get a parser for a file path based on extension. Returns null if unsupported. */
  async getParser(filePath: string): Promise<ILanguageParser | null> {
    if (!this.initialized) await this.initialize();

    const langId = this.getLanguageId(filePath);
    if (!langId || this.unavailable.has(langId)) return null;

    if (this.languageParsers.has(langId)) {
      return this.languageParsers.get(langId)!;
    }

    return this.loadParser(langId);
  }

  /** Get language ID for a file — supports compound extensions (longest match wins). */
  getLanguageId(filePath: string): string | null {
    const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');

    // Try compound extensions first (longest match wins)
    for (const [ext, langId] of this.extensionMap.entries()) {
      // Compound extensions have multiple dots (e.g., .flow-meta.xml)
      if (ext.split('.').length > 2 && lowerPath.endsWith(ext)) {
        return langId;
      }
    }

    // Fall back to simple extension
    const ext = path.extname(lowerPath);
    return this.extensionMap.get(ext) ?? null;
  }

  /** List all registered languages. */
  listLanguages(): { id: string; extensions: string[]; available: boolean }[] {
    return this.config.languages.map(lang => ({
      id: lang.id,
      extensions: lang.extensions,
      available: !this.unavailable.has(lang.id),
    }));
  }

  /** Check if a language grammar is available. */
  isAvailable(langId: string): boolean {
    return !this.unavailable.has(langId) &&
      this.config.languages.some(l => l.id === langId);
  }

  private async loadParser(langId: string): Promise<ILanguageParser | null> {
    const langConfig = this.config.languages.find(c => c.id === langId);
    if (!langConfig) return null;

    try {
      let parser: any = null;

      if (langConfig.wasmPath) {
        // Standard tree-sitter path (existing behavior)
        const wasmPath = path.resolve(this.config.grammarDir, langConfig.wasmPath);

        if (!fs.existsSync(wasmPath)) {
          logger.error(`[grammar-registry] WASM not found: ${wasmPath}`);
          this.unavailable.add(langId);
          return null;
        }

        parser = new Parser();
        const language = await Language.load(wasmPath);
        parser.setLanguage(language);
        this.parsers.set(langId, parser);
      }
      // If wasmPath is null, parser stays null — passed to constructor as-is

      // Dynamically import the language parser module
      const modulePath = langConfig.parserModule;
      const imported = await import(modulePath);
      // Handle both ESM default export and CJS module.exports.default
      const LangParserClass = imported.default?.default ?? imported.default ?? imported;
      if (typeof LangParserClass !== 'function') {
        throw new TypeError(`LangParserClass is not a constructor (got ${typeof LangParserClass})`);
      }
      const langParser: ILanguageParser = new LangParserClass(parser, langId);
      this.languageParsers.set(langId, langParser);

      logger.error(`[grammar-registry] Loaded grammar: ${langId}`);
      return langParser;
    } catch (error) {
      logger.error({ error }, `[grammar-registry] Failed to load ${langId}:`);
      this.unavailable.add(langId);
      return null;
    }
  }

  private buildExtensionMap(): void {
    // Sort languages so compound extensions (longer) are registered first
    const sorted = [...this.config.languages].sort((a, b) => {
      const maxA = Math.max(...a.extensions.map(e => e.length));
      const maxB = Math.max(...b.extensions.map(e => e.length));
      return maxB - maxA; // Longer extensions first
    });

    for (const lang of sorted) {
      for (const ext of lang.extensions) {
        this.extensionMap.set(ext, lang.id);
      }
    }
  }
}

/** Load grammar registry config from JSON file. */
export function loadGrammarConfig(configPath: string): GrammarRegistryConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const data = JSON.parse(raw);
  return {
    languages: data.languages ?? [],
    grammarDir: path.dirname(configPath),
  };
}
