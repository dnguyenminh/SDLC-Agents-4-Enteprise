'use strict';

const up = async function(knex) {
  // Table: model_configs
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS model_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name VARCHAR(50) UNIQUE,
      context_window INT,
      max_tokens INT,
      provider VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table: enrichment_logs
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS enrichment_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id VARCHAR(50),
      symbol_name VARCHAR(255),
      file_path VARCHAR(255),
      model_used VARCHAR(50),
      budget_used INT,
      status VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Table: cache_invalidation_logs
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS cache_invalidation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_name VARCHAR(50),
      invalidated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add indexes for performance
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_model_configs_name ON model_configs(model_name)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_enrichment_logs_ticket ON enrichment_logs(ticket_id)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_enrichment_logs_model ON enrichment_logs(model_used)`);
  await knex.raw(`CREATE INDEX IF NOT EXISTS idx_cache_invalidation_model ON cache_invalidation_logs(model_name)`);
};

const down = async function(knex) {
  await knex.raw(`DROP TABLE IF EXISTS cache_invalidation_logs`);
  await knex.raw(`DROP TABLE IF EXISTS enrichment_logs`);
  await knex.raw(`DROP TABLE IF EXISTS model_configs`);
};

module.exports = { up, down };