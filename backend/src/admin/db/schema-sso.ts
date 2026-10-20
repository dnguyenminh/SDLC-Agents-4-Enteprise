/** SSO provider migrations + seeds (BR-18 extraction from schema.ts). */
import type { DatabaseAdapter, DatabaseEngine } from '../../database/adapters/DatabaseAdapter.js';

/** Initialize admin schema tables (idempotent CREATE IF NOT EXISTS). */
export async function migrateUsersSso(db: DatabaseAdapter, engine: DatabaseEngine): Promise<void> {
  try {
    if (engine === 'postgresql') {
      await db.execAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'LOCAL'`);
      await db.execAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_provider TEXT`);
      await db.execAsync(`ALTER TABLE users ADD COLUMN IF NOT EXISTS external_subject_id TEXT`);
      await db.execAsync(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
      await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_external_identity ON users (external_provider, external_subject_id)`);
    } else {
      await migrateUsersSsoSqlite(db);
      await db.execAsync(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_external_identity ON users (external_provider, external_subject_id)`);
    }
  } catch (err) {
    console.debug('[schema] users_sso migration:', (err as Error).message);
  }
}

async function migrateUsersSsoSqlite(db: DatabaseAdapter): Promise<void> {
  try { await db.execAsync(`ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'LOCAL'`); } catch {}
  try { await db.execAsync(`ALTER TABLE users ADD COLUMN external_provider TEXT`); } catch {}
  try { await db.execAsync(`ALTER TABLE users ADD COLUMN external_subject_id TEXT`); } catch {}
  // SQLite cannot ALTER COLUMN nullability; recreate table if password_hash is NOT NULL
  try {
    const info = await db.allAsync(`PRAGMA table_info(users)`);
    const col = (info as any[]).find(c => c.name === 'password_hash');
    if (col && col.notnull === 1) {
      await db.execAsync(`ALTER TABLE users RENAME TO users_old`);
      await db.execAsync(`CREATE TABLE users (
        user_id TEXT PRIMARY KEY,
        username TEXT,
        email TEXT UNIQUE,
        password_hash TEXT,
        status TEXT,
        access_group_id TEXT,
        force_password_change INTEGER,
        created_at TEXT,
        last_login TEXT,
        account_type TEXT NOT NULL DEFAULT 'LOCAL',
        external_provider TEXT,
        external_subject_id TEXT
      )`);
      await db.execAsync(`INSERT INTO users SELECT user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at, last_login, COALESCE(account_type,'LOCAL'), external_provider, external_subject_id FROM users_old`);
      await db.execAsync(`DROP TABLE users_old`);
    }
  } catch {}
}

export async function seedDefaultSsoProviders(db: DatabaseAdapter): Promise<void> {
  try {
    const templates = ssoProviderTemplates();
    const now = new Date().toISOString();
    for (const t of templates) {
      const exists = await db.getAsync('SELECT 1 FROM sso_providers WHERE provider_type = ?', [t.provider_type]);
      if (!exists) {
        const provider_id = `${t.provider_type}-${Date.now()}`;
        // 13 columns → 13 placeholders (fix SA4E-262: was 12 placeholders for 13 values)
        await db.runAsync(`INSERT INTO sso_providers (provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [provider_id, t.provider_type, t.name, t.enabled, '', '', '', '', '', '', t.login_ui_html, now, now]);
      }
    }
  } catch (err) {
    // Non-fatal: seed of default provider templates is optional, but surface the
    // error (console.error, not debug) so a broken INSERT is not swallowed silently.
    console.error('[schema] seedDefaultSsoProviders failed:', (err as Error).message);
  }
}

/** Default provider button templates — login_ui_html holds only the visual (icon + label). */
function ssoProviderTemplates(): Array<{ provider_type: string; name: string; enabled: 0 | 1; login_ui_html: string }> {
  return [
    {
      // Hướng A (SA4E-262): Entra is configured via sso_providers like every
      // other provider (single source of truth), so it must have a seed row too.
      provider_type: 'entra',
      name: 'Microsoft Entra ID',
      enabled: 0,
      login_ui_html: `<span class="sso-btn sso-entra"><svg width="18" height="18" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg> Sign in with Microsoft</span>`,
    },
    {
      provider_type: 'google',
      name: 'Google',
      enabled: 0,
      // login_ui_html holds only the visual (icon + label) — NO navigation URL.
      // The login page wraps it in an anchor built from basePath so it works
      // under sub-path deploys (ui-relative-paths: never embed absolute hrefs).
      login_ui_html: `<span class="sso-btn sso-google"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6s2.5-5.6 5.6-5.6c1.8 0 3 .8 3.7 1.4l2.5-2.4C17 2.9 14.7 1.8 12 1.8 6.8 1.8 2.5 6.1 2.5 11.3S6.8 20.8 12 20.8c5.6 0 9.3-4 9.3-9.3 0-.6 0-1.2-.1-1.8H12z"/></svg> Sign in with Google</span>`,
    },
    {
      provider_type: 'github',
      name: 'GitHub',
      enabled: 0,
      login_ui_html: `<span class="sso-btn sso-github"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.73.08-.73 1.22.09 1.86 1.26 1.86 1.26 1.08 1.86 2.83 1.32 3.52 1.01.11-.79.42-1.32.76-1.62-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.65-5.48 5.95.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.58A12 12 0 0 0 12 .5Z"/></svg> Sign in with GitHub</span>`,
    },
    {
      provider_type: 'x',
      name: 'X',
      enabled: 0,
      login_ui_html: `<span class="sso-btn sso-x">Sign in with X</span>`,
    },
    {
      provider_type: 'facebook',
      name: 'Facebook',
      enabled: 0,
      login_ui_html: `<span class="sso-btn sso-facebook"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.55-4.7 1.31 0 2.68.24 2.68.24v2.95h-1.51c-1.48 0-1.94.92-1.94 1.86v2.24h3.3l-.53 3.49h-2.77V24C19.61 23.1 24 18.1 24 12.07z"/></svg> Sign in with Facebook</span>`,
    },
  ];
}

/**
 * Rewrite legacy login_ui_html that embedded an absolute login URL
 * (`<a href="/auth/{provider}/login">…</a>`) into a URL-less `<span>` so the
 * login page can wrap it in a basePath-aware anchor. Runs outside any
 * transaction (autocommit) — safe to re-run (idempotent on already-migrated rows).
 */
export async function migrateLoginUiHtmlToUrlless(db: DatabaseAdapter): Promise<void> {
  try {
    const rows = await db.allAsync<{ provider_id: string; login_ui_html: string }>(
      "SELECT provider_id, login_ui_html FROM sso_providers WHERE login_ui_html LIKE '%href=%/auth/%/login%'"
    );
    for (const row of rows || []) {
      // Drop the opening <a ...> (keeping inner content) and turn </a> into </span>.
      const migrated = row.login_ui_html
        .replace(/<a\b[^>]*\bhref=["'][^"']*\/auth\/[^"']*\/login["'][^>]*>/i, '<span class="sso-btn">')
        .replace(/<\/a>/i, '</span>');
      await db.runAsync('UPDATE sso_providers SET login_ui_html = ? WHERE provider_id = ?', [migrated, row.provider_id]);
    }
    if (rows && rows.length > 0) {
      console.debug(`[schema] migrated ${rows.length} login_ui_html row(s) to URL-less form`);
    }
  } catch (err) {
    // Non-fatal: surface the error but do not block schema init.
    console.error('[schema] migrateLoginUiHtmlToUrlless failed:', (err as Error).message);
  }
}

export async function seedSsoProvidersFromEnv(db: DatabaseAdapter): Promise<void> {
  try {
    const cnt = await db.getAsync<{count:number}>('SELECT COUNT(*) as count FROM sso_providers');
    if (cnt && cnt.count > 0) return;
    const env = process.env;
    if (!env.SSO_ENABLED || env.SSO_ENABLED !== 'true') return;
    const tenant = env.ENTRA_TENANT_ID || '';
    const clientId = env.ENTRA_CLIENT_ID || '';
    const clientSecret = env.ENTRA_CLIENT_SECRET || '';
    if (!tenant || !clientId) return;
    const now = new Date().toISOString();
    const provider_id = `entra-${Date.now()}`;
    const name = 'Entra ID';
    const enabled = 1;
    const redirect_uri = env.ENTRA_REDIRECT_URI || '';
    const allowed_redirects = env.SSO_ALLOWED_REDIRECTS || '';
    const scopes = env.ENTRA_SCOPES || 'openid profile email offline_access';
    const login_ui_html = `<button class="sso-btn sso-entra">Sign in with Entra ID</button>`;
    // 13 columns → 13 placeholders (fix SA4E-262: was 12 placeholders for 13 values)
    await db.runAsync(`INSERT INTO sso_providers (provider_id, provider_type, name, enabled, client_id, client_secret, tenant_id, redirect_uri, allowed_redirects, scopes, login_ui_html, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [provider_id, 'entra', name, enabled, clientId, clientSecret, tenant, redirect_uri, allowed_redirects, scopes, login_ui_html, now, now]);
    console.debug('[schema] sso_providers seeded from env');
  } catch (err) {
    // Non-fatal, but surface the error so a broken INSERT is not swallowed silently.
    console.error('[schema] seedSsoProvidersFromEnv failed:', (err as Error).message);
  }
}
