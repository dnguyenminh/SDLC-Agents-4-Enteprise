# User Guide — SA4E-50: Database Configuration in app_config Table

## Overview

Database configuration is now stored in the `app_config` SQLite table instead of the legacy `database.json` file. This provides a single source of truth inside the database itself, eliminating file-based config drift.

## How It Works

### Boot Sequence

1. SQLite DB is opened/created (`index.db`)
2. Schema initialization creates `app_config` table (if not exists)
3. Default config seeded: `db.activeEngine = 'sqlite'`, `db.sqlite.dbPath = 'index.db'`
4. If a legacy `database.json` file exists, its contents are migrated into `app_config` and the file is renamed to `database.json.migrated`

### Configuration Keys

| Key | Description | Default |
|-----|-------------|---------|
| `db.activeEngine` | Active database engine | `sqlite` |
| `db.sqlite.dbPath` | SQLite file name | `index.db` |
| `db.postgresql.host` | PostgreSQL host | — |
| `db.postgresql.port` | PostgreSQL port | `5432` |
| `db.postgresql.username` | PostgreSQL user | — |
| `db.postgresql.password` | Encrypted password | — |
| `db.postgresql.database` | Database name | — |
| `db.postgresql.ssl` | Enable SSL | `false` |
| `db.postgresql.pool.min` | Min pool connections | `2` |
| `db.postgresql.pool.max` | Max pool connections | `10` |
| `db.mysql.*` | Same pattern as postgresql | — |
| `db.migration.lastMigration` | Timestamp of last migration | `null` |
| `db.migration.backupSqlitePaths` | JSON array of backup paths | `[]` |

### Encryption

Password fields (`db.postgresql.password`, `db.mysql.password`) are encrypted with AES-256-GCM before storage. The encryption key lives in `.dbkey` file (auto-generated on first use). **Do not delete `.dbkey`** — passwords cannot be recovered without it.

## Migration from database.json

Migration is automatic and transparent:

1. On first boot after upgrade, if `database.json` exists and `app_config` table is empty
2. All settings are read from the file, passwords decrypted, then re-encrypted into DB
3. File renamed to `database.json.migrated` (kept as backup, never deleted)
4. Subsequent boots read exclusively from `app_config` table

No manual action required.

## API Endpoints (unchanged)

The admin API endpoints remain the same:

- `GET /api/admin/database/status` — current engine status
- `POST /api/admin/database/test-connection` — test remote DB connection
- `POST /api/admin/database/switch` — switch active engine
- `POST /api/admin/database/switch-to-sqlite` — revert to SQLite
- `POST /api/admin/database/migrate` — SSE-streaming data migration
- `POST /api/admin/database/migrate/cancel` — cancel active migration

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Config not loading after upgrade | Check `app_config` table has rows: `SELECT * FROM app_config WHERE key LIKE 'db.%'` |
| `database.json` still exists after upgrade | Ensure the process has write permission to rename the file |
| Password decryption fails | Verify `.dbkey` file is present and unchanged from when passwords were encrypted |
| Migration didn't happen | Check if `app_config` already has `db.activeEngine` row (migration only runs when table is empty) |

## File Structure

```
backend/src/database/config/
├── DatabaseConfigService.ts   — Facade: load/save/getActiveConfig/setActiveEngine
├── AppConfigRepository.ts     — Repository: CRUD for app_config table
├── EncryptionService.ts       — AES-256-GCM encrypt/decrypt using .dbkey
├── ConfigSerializer.ts        — Serialize/deserialize config ↔ flat key-value map
└── FileMigrationService.ts    — One-time migration from database.json → app_config
```
