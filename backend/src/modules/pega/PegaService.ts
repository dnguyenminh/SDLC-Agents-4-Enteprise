/**
 * PegaService — Logic nghiệp vụ cho Pega Rule & Data Indexing & Schema Storage.
 * SA4E-171 (cutover): rules are indexed into symbols (via PegaIndexer/PegaSymbolSync);
 * syncIndexedRulesToKb only projects code graph nodes. No knowledge_entries PEGA_* rows.
 */
import type { MemoryEngine } from '../memory/engine/core.js';
import { buildFqn, parseFqn } from './pega-mapping.js';
import type {
  PegaCheckRuleRequest,
  PegaCheckRuleResponse,
  PegaIngestRuleRequest,
  PegaIngestRuleResponse,
} from './models.js';
import { PegaParser } from './PegaParser.js';
import { PegaSchemaLoader } from './PegaSchemaLoader.js';
import type { PegaRuleKbSchema } from './strategies/KbDrivenPegaParserStrategy.js';
import { PegaDeclarativeEngine } from './PegaDeclarativeEngine.js';
import { PegaRuleAstParser } from './PegaRuleAstParser.js';
import { indexRule, type IndexRuleResult } from './PegaIndexer.js';
import { syncAllIndexedRules, type SyncBatchResult } from './PegaKbSync.js';
import {
  PegaServiceDiscovery, PegaCodeIntelClient,
  type ServiceDiscoveryOptions, type ServiceDiscoveryReport,
} from './discovery/index.js';
import pino from 'pino';

const logger = pino({ name: 'pega-service' });

export class PegaService {
  private parser: PegaParser;
  private declarativeEngine: PegaDeclarativeEngine;
  private astParser: PegaRuleAstParser;

  constructor(private memoryEngine: MemoryEngine) {
    this.parser = new PegaParser();
    this.declarativeEngine = new PegaDeclarativeEngine();
    this.astParser = new PegaRuleAstParser();
    this.initSchemasInDb().catch((err) => { logger.debug({ err }, '[PegaService] Schema init failed (non-fatal)'); });
  }

  public getDeclarativeEngine(): PegaDeclarativeEngine { return this.declarativeEngine; }

  private async initSchemasInDb(): Promise<void> {
    const schemas = await this.getSchemasFromDb();
    if (schemas.length > 0) return;
    try {
      const allSchemas = PegaSchemaLoader.loadAllSchemas();
      for (const item of allSchemas) {
        await this.upsertSchemaInDb(item);
      }
    } catch (err) { logger.debug({ err }, '[PegaService] Failed to load schemas into DB (non-fatal)'); }
  }

  public async getSchemasFromDb(): Promise<PegaRuleKbSchema[]> {
    const adapter = this.memoryEngine.getAdapter();
    const rows = await adapter.allAsync<{ content: string }>(
      "SELECT content FROM knowledge_entries WHERE type = 'PEGA_SCHEMA'",
      [],
    );
    return rows.map((r) => {
      try { return JSON.parse(r.content) as PegaRuleKbSchema; }
      catch (err) { logger.debug({ err }, '[PegaService] Failed to parse PEGA_SCHEMA entry'); return null; }
    }).filter((s): s is PegaRuleKbSchema => s !== null);
  }

  public async upsertSchemaInDb(schema: PegaRuleKbSchema): Promise<void> {
    const adapter = this.memoryEngine.getAdapter();
    const sourceKey = `pega-schema:${schema.targetClass}`;
    await adapter.runAsync("DELETE FROM knowledge_entries WHERE source = $1 AND type = 'PEGA_SCHEMA'", [sourceKey]);
    await this.memoryEngine.insert({
      content: JSON.stringify(schema),
      summary: `Pega Rule Schema: ${schema.targetClass}`,
      type: 'PEGA_SCHEMA',
      tier: 'SEMANTIC',
      scope: 'SHARED',
      project_id: 'SYSTEM',
      source: sourceKey,
      tags: 'pega,schema',
    });
  }

  public async checkRule(req: PegaCheckRuleRequest): Promise<PegaCheckRuleResponse> {
    const adapter = this.memoryEngine.getAdapter();
    // Signature is 5-part (type:class:name:ruleset:version). If the caller knows
    // ruleset+version, match the exact rule; otherwise match on the first 3 identity
    // parts (type:class:name) with a prefix so any ruleset/version variant is found.
    let row;
    if (req.ruleset || req.version) {
      const fqn = buildFqn(req.ruleType, req.className, req.ruleName, req.ruleset, req.version);
      row = await adapter.getAsync<{ id: number; name: string; signature: string }>(
        `SELECT s.id, s.name, s.signature FROM symbols s
         WHERE s.signature = $1 AND s.project_id = $2 AND s.kind LIKE 'pega_%' LIMIT 1`,
        [fqn, req.projectId],
      );
    } else {
      const prefix = `${req.ruleType}:${req.className}:${req.ruleName}:%`;
      row = await adapter.getAsync<{ id: number; name: string; signature: string }>(
        `SELECT s.id, s.name, s.signature FROM symbols s
         WHERE s.signature LIKE $1 AND s.project_id = $2 AND s.kind LIKE 'pega_%' LIMIT 1`,
        [prefix, req.projectId],
      );
    }
    if (!row) return { cached: false };
    const parsed = parseFqn(row.signature);
    return {
      cached: true,
      ruleId: row.id,
      content: {
        pyRuleName: row.name,
        pyActivityName: row.name,
        pyClassName: parsed.pyClassName || req.className,
        pxObjClass: parsed.pxObjClass || req.ruleType,
      } as Record<string, unknown>,
    };
  }

  public parseRuleToSymbol(ruleJson: Record<string, unknown>): { fqn: string; isRule: boolean } | null {
    try {
      return this.parser.parseSymbol(ruleJson);
    } catch {
      return null;
    }
  }

  public getAstParser(): PegaRuleAstParser { return this.astParser; }
  public parseRuleToAst(ruleJson: Record<string, unknown>) { return this.astParser.parse(ruleJson); }
  public ruleToPromptContext(ruleJson: Record<string, unknown>): string {
    const ast = this.parseRuleToAst(ruleJson);
    return this.astParser.toPromptContext(ast);
  }

  /**
   * SA4E-158 Phase 1: Index rule — parse + dedup + store into symbols table.
   * No knowledge_entries writes (PEGA_INDEX/PEGA_RULE/PEGA_DATA/PEGA_AST removed).
   */
  public async indexRuleOnly(req: PegaIngestRuleRequest): Promise<IndexRuleResult> {
    // Auto-register Declare Expressions into Declarative Engine (was Phase 2 duty)
    const deps = this.parser.extractDependencies(req.ruleJson);
    const pxObjClass = (req.ruleJson as any)?.pxObjClass || '';
    if (pxObjClass === 'Rule-Declare-Expressions') {
      const targetProp = (req.ruleJson as any)?.pyTargetProperty || (req.ruleJson as any)?.pyPropertyName || '';
      const formula = (req.ruleJson as any)?.pyExpression || '';
      const inputs = deps.map(d => d.ruleName);
      if (targetProp) {
        this.declarativeEngine.registerExpression(targetProp, formula, inputs);
      }
    }
    return indexRule(this.memoryEngine, this.parser, this.astParser, req);
  }

  /**
   * SA4E-158 Phase 2: Sync all indexed rules for a project.
   * SA4E-171: enriches symbols already written by Phase 1 and projects
   * Pega code graph nodes. No knowledge_entries writes.
   */
  public async syncIndexedRulesToKb(projectId: string): Promise<SyncBatchResult> {
    return syncAllIndexedRules(this.memoryEngine, this.parser, this.declarativeEngine, projectId);
  }

  /** SA4E-158: Expose parser for route-level access. */
  public getParser(): PegaParser { return this.parser; }

  /** SA4E-158: Expose memoryEngine for route-level access. */
  public getMemoryEngine(): MemoryEngine { return this.memoryEngine; }

  /**
   * Discover a Pega application's service surface via the custom CodeIntelligence
   * data-page API: Access Groups -> Service Packages -> Service Methods -> linked
   * Activities. Discovered methods are indexed into symbols; links are reported.
   */
  public async discoverServices(opts: ServiceDiscoveryOptions): Promise<ServiceDiscoveryReport> {
    const client = new PegaCodeIntelClient(opts.codeIntelBase, opts.authHeader);
    const discovery = new PegaServiceDiscovery(
      {
        downloadRule: async (insKey: string) => {
          const json = await client.getRule(insKey);
          return json ? { ruleJson: json } : null;
        },
        indexRule: async (ruleJson: Record<string, unknown>) =>
          this.indexRuleOnly({ projectId: opts.projectId, ruleJson }),
      },
      opts.codeIntelBase,
      opts.authHeader,
    );
    return discovery.run(opts);
  }

  /**
   * Legacy ingestRule — backward compatible single-rule ingest.
   * Writes to symbols table only (no knowledge_entries PEGA_* rows).
   * @deprecated Use indexRuleOnly + syncIndexedRulesToKb for SRP separation.
   */
  public async ingestRule(req: PegaIngestRuleRequest): Promise<PegaIngestRuleResponse> {
    // Auto-register Declare Expressions into Declarative Engine
    const deps = this.parser.extractDependencies(req.ruleJson);
    const pxObjClass = (req.ruleJson as any)?.pxObjClass || '';
    if (pxObjClass === 'Rule-Declare-Expressions') {
      const targetProp = (req.ruleJson as any)?.pyTargetProperty || (req.ruleJson as any)?.pyPropertyName || '';
      const formula = (req.ruleJson as any)?.pyExpression || '';
      const inputs = deps.map(d => d.ruleName);
      if (targetProp) {
        this.declarativeEngine.registerExpression(targetProp, formula, inputs);
      }
    }

    const result = await indexRule(this.memoryEngine, this.parser, this.astParser, req);
    return {
      status: 'success',
      ruleId: result.ruleId,
      unresolvedDependencies: result.dependencies,
      reason: result.status === 'skipped' ? result.reason : undefined,
    };
  }
}
