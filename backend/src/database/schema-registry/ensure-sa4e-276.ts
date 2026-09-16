import { getDbAdapter } from '../adapters/index.js';

/**
 * SA4E-276: Ensure Entra SSO config tables exist
 */
export async function ensureSa4e276(): Promise<void> {
  const adapter = getDbAdapter();
  // entra_sso_config table
  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS entra_sso_config (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      secret_ref TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      issuer_url TEXT NOT NULL,
      jwks_url TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      status TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )
  `);
  await adapter.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS idx_entra_config_tenant_client ON entra_sso_config(tenant_id, client_id)`);
  await adapter.execAsync(`CREATE INDEX IF NOT EXISTS idx_entra_config_updated_at ON entra_sso_config(updated_at)`);
  
  // audit_log table (if not exists)
  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      user_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      details TEXT
    )
  `);
  await adapter.execAsync(`CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)`);
  await adapter.execAsync(`CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)`);
}
