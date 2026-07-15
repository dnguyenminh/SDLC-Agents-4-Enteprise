/**
 * OutcomeService — CRUD for entry outcomes + Bayesian factor calculation.
 * Formula: (successes + 1) / (total + 2) — Laplace smoothing.
 */

import type Database from 'better-sqlite3';
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
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  record(
    entryId: number,
    outcome: string,
    agentName?: string,
    context?: string,
  ): RecordResult {
    this.validateEntry(entryId);
    this.validateOutcome(outcome);

    this.insertOutcome(entryId, outcome as Outcome, agentName, context);

    if (outcome === 'success') {
      this.boostConfidence(entryId);
    }

    const factor = this.getFactorForEntry(entryId);
    const stats = this.getStats(entryId);
    return { recorded: true, new_outcome_factor: factor, total_outcomes: stats.total };
  }

  getStats(entryId: number): OutcomeStats {
    const rows = this.db.prepare(
      `SELECT outcome, COUNT(*) as cnt FROM entry_outcomes WHERE entry_id = ? GROUP BY outcome`,
    ).all(entryId) as Array<{ outcome: string; cnt: number }>;

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

  getFactorForEntry(entryId: number): number {
    const stats = this.getStats(entryId);
    if (stats.total === 0) return 0.5;
    return (stats.successes + 1) / (stats.total + 2);
  }

  private validateEntry(entryId: number): void {
    const row = this.db.prepare(
      'SELECT id FROM knowledge_entries WHERE id = ?',
    ).get(entryId);
    if (!row) throw new Error('ENTRY_NOT_FOUND');
  }

  private validateOutcome(outcome: string): void {
    if (!VALID_OUTCOMES.includes(outcome as Outcome)) {
      throw new Error('INVALID_OUTCOME');
    }
  }

  private insertOutcome(
    entryId: number,
    outcome: Outcome,
    agentName?: string,
    context?: string,
  ): void {
    this.db.prepare(
      `INSERT INTO entry_outcomes (entry_id, outcome, agent_name, context) VALUES (?, ?, ?, ?)`,
    ).run(entryId, outcome, agentName ?? null, context ?? null);
  }

  private boostConfidence(entryId: number): void {
    this.db.prepare(
      `UPDATE knowledge_entries SET confidence = MIN(confidence * 1.1, 1.0), updated_at = datetime('now') WHERE id = ?`,
    ).run(entryId);
  }
}
