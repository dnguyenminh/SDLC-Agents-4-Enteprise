/**
 * KSA-152: Grammar Configuration Loader.
 * Loads per-language JSON grammar configs and provides a LanguageRegistry.
 */

import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

const logger = pino({ name: 'grammar-config-loader' });

export interface EntityConfig {
  nodeTypes: string[];
  nameField: string;
  bodyField?: string;
  kind: string;
  extractParams?: boolean;
  extractReturnType?: boolean;
  extractModifiers?: boolean;
}

export interface RelationshipConfig {
  nodeTypes: string[];
  kind: string;
  sourceField?: string;
  targetField?: string;
}

export interface ScopingConfig {
  classContainers: string[];
  namespaceContainers: string[];
}

export interface ParserConfig {
  includePrivate: boolean;
  includeTests: boolean;
  parseDocs: boolean;
  maxFileSize: number;
  maxFunctionSize: number;
  timeoutPerFile: number;
}

export interface GrammarConfig {
  schemaVersion: string;
  language: string;
  displayName: string;
  extensions: string[];
  grammarWasm: string;
  parserConfig: ParserConfig;
  entities: Record<string, EntityConfig>;
  relationships: Record<string, RelationshipConfig>;
  scoping: ScopingConfig;
}

const DEFAULT_PARSER_CONFIG: ParserConfig = {
  includePrivate: false,
  includeTests: false,
  parseDocs: true,
  maxFileSize: 1_048_576,
  maxFunctionSize: 10_000,
  timeoutPerFile: 5000,
};

export class LanguageRegistry {
  private extMap: Map<string, GrammarConfig> = new Map();
  private languages: Map<string, GrammarConfig> = new Map();

  register(config: GrammarConfig): void {
    this.languages.set(config.language, config);
    for (const ext of config.extensions) {
      this.extMap.set(ext, config);
    }
  }

  getByExtension(ext: string): GrammarConfig | null {
    return this.extMap.get(ext) ?? null;
  }

  getByName(name: string): GrammarConfig | null {
    return this.languages.get(name) ?? null;
  }

  listLanguages(): { language: string; displayName: string; extensions: string[] }[] {
    return Array.from(this.languages.values()).map(c => ({
      language: c.language,
      displayName: c.displayName,
      extensions: c.extensions,
    }));
  }

  get size(): number {
    return this.languages.size;
  }
}

export function loadGrammarConfigs(configDir: string): LanguageRegistry {
  const registry = new LanguageRegistry();

  if (!fs.existsSync(configDir)) {
    logger.error(`[grammar-config] Config directory not found: ${configDir}`);
    return registry;
  }

  const files = fs.readdirSync(configDir).filter(
    f => f.endsWith('.grammar.json')
  );

  for (const file of files) {
    try {
      const filePath = path.join(configDir, file);
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const config = parseGrammarConfig(raw);
      if (config) {
        registry.register(config);
        logger.error(`[grammar-config] Loaded: ${config.language} (${config.extensions.join(', ')})`);
      }
    } catch (err) {
      logger.error({ err }, `[grammar-config] Failed to load ${file}:`);
    }
  }

  return registry;
}

function parseGrammarConfig(raw: Record<string, unknown>): GrammarConfig | null {
  if (!raw.language || !raw.extensions || !raw.grammar_wasm || !raw.entities) {
    return null;
  }

  const entities: Record<string, EntityConfig> = {};
  if (typeof raw.entities === 'object' && raw.entities) {
    for (const [key, val] of Object.entries(raw.entities as Record<string, any>)) {
      entities[key] = {
        nodeTypes: val.node_types ?? [],
        nameField: val.name_field ?? 'identifier',
        bodyField: val.body_field,
        kind: val.kind ?? key,
        extractParams: val.extract_params ?? false,
        extractReturnType: val.extract_return_type ?? false,
        extractModifiers: val.extract_modifiers ?? false,
      };
    }
  }

  const relationships: Record<string, RelationshipConfig> = {};
  if (typeof raw.relationships === 'object' && raw.relationships) {
    for (const [key, val] of Object.entries(raw.relationships as Record<string, any>)) {
      relationships[key] = {
        nodeTypes: val.node_types ?? [],
        kind: val.kind ?? key,
        sourceField: val.source_field,
        targetField: val.target_field,
      };
    }
  }

  const scopingRaw = raw.scoping as Record<string, any> | undefined;
  const scoping: ScopingConfig = {
    classContainers: scopingRaw?.class_containers ?? ['class_declaration'],
    namespaceContainers: scopingRaw?.namespace_containers ?? ['module', 'namespace_declaration'],
  };

  const parserRaw = raw.parser_config as Record<string, any> | undefined;
  const parserConfig: ParserConfig = {
    ...DEFAULT_PARSER_CONFIG,
    ...(parserRaw ? {
      includePrivate: parserRaw.include_private ?? DEFAULT_PARSER_CONFIG.includePrivate,
      includeTests: parserRaw.include_tests ?? DEFAULT_PARSER_CONFIG.includeTests,
      parseDocs: parserRaw.parse_docs ?? DEFAULT_PARSER_CONFIG.parseDocs,
      maxFileSize: parserRaw.max_file_size ?? DEFAULT_PARSER_CONFIG.maxFileSize,
      maxFunctionSize: parserRaw.max_function_size ?? DEFAULT_PARSER_CONFIG.maxFunctionSize,
      timeoutPerFile: parserRaw.timeout_per_file ?? DEFAULT_PARSER_CONFIG.timeoutPerFile,
    } : {}),
  };

  return {
    schemaVersion: String(raw.schema_version ?? '1.0'),
    language: String(raw.language),
    displayName: String(raw.display_name ?? raw.language),
    extensions: raw.extensions as string[],
    grammarWasm: String(raw.grammar_wasm),
    parserConfig,
    entities,
    relationships,
    scoping,
  };
}

export function resolveParserConfig(
  globalConfig: ParserConfig,
  languageConfig?: Partial<ParserConfig>
): ParserConfig {
  if (!languageConfig) return globalConfig;
  return { ...globalConfig, ...languageConfig };
}
