/**
 * OutcomeService — CRUD for entry outcomes + Bayesian factor calculation.
 * Formula: (successes + 1) / (total + 2) — Laplace smoothing.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import pino from 'pino';

const logger = pino({ name: 'outcome-service' });

const VALID_OUTCOMES = ['success', 'fail', 'partial'] as const;
type Outcome = typeof VALID_OUTCOMES[number];

interface OutcomeStats {
  successes: number;
  failures: number;
  total: number;
}

interface RecordResult {
  recorded: boolean;
  new_outcome_factor: number;
  total_outcomes: number;
}

export class OutcomeService {
  private readonly adapter: DatabaseAdapter;
  private readonly dialect: DialectHelper;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
  }

  async record(
    entryId: number,
    outcome: string,
    agentName?: string,
    context?: string,
  ): Promise<RecordResult> {
    await this.validateEntry(entryId);
    this.validateOutcome(outcome);

    await this.insertOutcome(entryId, outcome as Outcome, agentName, context);

    if (outcome === 'success') {
      await this.boostConfidence(entryId);
    }

    const factor = await this.getFactorForEntry(entryId);
    const stats = await this.getStats(entryId);
    return { recorded: true, new_outcome_factor: factor, total_outcomes: stats.total };
  }

  async getStats(entryId: number): Promise<OutcomeStats> {
    const rows = await this.adapter.allAsync<{ outcome: string; cnt: number }>(
      `SELECT outcome, COUNT(*) as cnt FROM entry_outcomes WHERE entry_id = ? GROUP BY outcome`,
      [entryId],
    );

    let successes = 0;
    let failures = 0;
    let total = 0;

    for (const row of rows) {
      total += row.cnt;
      if (row.outcome === 'success') successes += row.cnt;
      else if (row.outcome === 'fail') failures += row.cnt;
      else if (row.outcome === 'partial') successes += row.cnt * 0.5;
    }

    return { successes, failures, total };
  }

  async getFactorForEntry(entryId: number): Promise<number> {
    const stats = await this.getStats(entryId);
    if (stats.total === 0) return 0.5;
    return (stats.successes + 1) / (stats.total + 2);
  }

  private async validateEntry(entryId: number): Promise<void> {
    const row = await this.adapter.getAsync<{ id: number }>(
      'SELECT id FROM knowledge_entries WHERE id = ?',
      [entryId],
    );
    if (!row) throw new Error('ENTRY_NOT_FOUND');
  }

  private validateOutcome(outcome: string): void {
    if (!VALID_OUTCOMES.includes(outcome as Outcome)) {
      throw new Error('INVALID_OUTCOME');
    }
  }

  private async insertOutcome(
    entryId: number,
    outcome: Outcome,
    agentName?: string,
    context?: string,
  ): Promise<void> {
    await this.adapter.runAsync(
      `INSERT INTO entry_outcomes (entry_id, outcome, agent_name, context) VALUES (?, ?, ?, ?)`,
      [entryId, outcome, agentName ?? null, context ?? null],
    );
  }

  private async boostConfidence(entryId: number): Promise<void> {
    await this.adapter.runAsync(
      `UPDATE knowledge_entries SET confidence = MIN(confidence * 1.1, 1.0), updated_at = ${this.dialect.now()} WHERE id = ?`,
      [entryId],
    );
  }
}
