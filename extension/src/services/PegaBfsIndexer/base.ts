/**
 * PegaBfsIndexerBase — ingester + run-scoped state of the BFS indexer chain.
 */

import * as vscode from "vscode";
import { computePegaChecksum } from "../../code-intel/checksum/PegaRuleChecksumStrategy";
import type { PegaHttpClient } from "../PegaHttpClient";
import type { ISchemaOrchestrator } from "../PegaSchemaOrchestrator";
import { PegaLocalRuleIndex } from "../PegaLocalRuleIndex";
import { PegaStreamIngester } from "../PegaStreamIngester";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";
import type { LogFn } from "./types";

/**
 * BFS-driven indexer: fetches rules from Pega, ingests into backend,
 * and enqueues newly-discovered relatives until queue is empty.
 * SA4E-214: Hooks schema creation on first-encounter rule types + progressive validation.
 */
export class PegaBfsIndexerBase {
  protected readonly ingester: PegaStreamIngester;
  /** SA4E-214: Track rule types already seen this session for schema creation */
  protected readonly seenRuleTypes = new Set<string>();
  /** Local file+checksum index written as rules are successfully ingested. */
  protected localIndex?: PegaLocalRuleIndex;
  /**
   * SA4E-338 B1: Pega application name read once from `pega-project.json` at run
   * start, forwarded with every rule ingest so the backend registers the project
   * under its real app name (not a random rule's class).
   */
  protected appName?: string;
  /** SA4E-362 FR-3: refresh đã chết (IngestAuthError) — kích hoạt shouldStop của pipeline. */
  protected authDead = false;
  /** SA4E-362 BR-6: guard notification/log ⛔ đúng 1 lần per run — reset mỗi run(). */
  protected authNotified = false;

  /**
   * @param resilient - When true, a per-rule 5xx does NOT abort the whole run.
   *   Used by catalog-sourced indexing where the rule list is authoritative and a
   *   single failing rule must not discard the remaining thousands.
   */
  constructor(
    protected readonly pegaClient: PegaHttpClient,
    protected readonly backendUrl: string,
    protected readonly outputChannel: vscode.OutputChannel | undefined,
    protected readonly log: LogFn,
    protected readonly schemaOrchestrator?: ISchemaOrchestrator,
    protected readonly resilient = false,
    protected readonly auth?: IngestAuthProvider,
  ) {
    this.ingester = new PegaStreamIngester(backendUrl, auth);
  }

  /**
   * SA4E-241 — Compute the Pega rule checksum (Source B) from the rule's 3 basic
   * fields using the SHARED formula (computePegaChecksum, NT-2) so a rule fetched
   * outside the catalog gets the SAME content_hash as its catalog checksum (INV-1).
   * ⛔ Do NOT hash the full JSON — that value would never match bulk-check.
   */
  protected computeChecksum(rule: Record<string, unknown>): string {
    return computePegaChecksum({
      pzInsKey: String(rule.pzInsKey ?? ""),
      pxUpdateDateTime: rule.pxUpdateDateTime as string | undefined,
      pxSaveDateTime: rule.pxSaveDateTime as string | undefined,
    });
  }

  /**
   * SA4E-214: Fire-and-forget schema hook.
   * First encounter of a rule type → trigger async schema creation.
   * Subsequent encounters → trigger progressive validation (field discovery).
   * Non-blocking: errors are logged but never propagate to BFS loop (BR-06).
   */
  protected triggerSchemaHook(ruleType: string, ruleJson: Record<string, unknown>): void {
    if (!this.schemaOrchestrator) return;

    if (!this.seenRuleTypes.has(ruleType)) {
      // First encounter → create schema (async, fire-and-forget)
      this.seenRuleTypes.add(ruleType);
      this.schemaOrchestrator.createSchema(ruleType).catch(err =>
        this.log(`[BfsIndexer] ⚠️ Schema creation failed for ${ruleType}: ${err.message}`),
      );
    } else {
      // Subsequent encounter → progressive validation
      this.schemaOrchestrator.validateAndUpdate(ruleType, ruleJson).catch(() => {
        /* non-fatal, silent */
      });
    }
  }
}
