/**
 * SA4E-50 — FileMigrationService: One-time migration from database.json to app_config table.
 * On first boot, if database.json exists but app_config is empty, migrates data.
 * After successful migration, renames database.json → database.json.migrated.
 */

import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import type { DatabaseJsonConfig } from './DatabaseConfigService.js';
import type { AppConfigRepository } from './AppConfigRepository.js';
import type { ConfigSerializer } from './ConfigSerializer.js';
import type { EncryptionService } from './EncryptionService.js';

const logger = pino({ name: 'file-migration' });

/**
 * Migrates legacy database.json config file into the app_config DB table.
 * Runs once; renames the file to .migrated afterward to prevent re-runs.
 */
export class FileMigrationService {
  private readonly configPath: string;
  private readonly migratedPath: string;

  constructor(
    private readonly dataDir: string,
    private readonly repo: AppConfigRepository,
    private readonly serializer: ConfigSerializer,
    private readonly encryption: EncryptionService,
  ) {
    this.configPath = path.join(dataDir, 'database.json');
    this.migratedPath = path.join(dataDir, 'database.json.migrated');
  }

  /**
   * Check if migration is needed and perform it.
   * Migration occurs when database.json exists AND app_config has no db.activeEngine.
   * @returns true if migration was performed, false otherwise
   */
  migrateIfNeeded(): boolean {
    if (!this.shouldMigrate()) return false;
    try {
      this.performMigration();
      this.markMigrated();
      logger.info('[migration] database.json → app_config migration complete');
      return true;
    } catch (err) {
      logger.error({ err }, '[migration] Failed to migrate database.json');
      throw err;
    }
  }

  private shouldMigrate(): boolean {
    const fileExists = fs.existsSync(this.configPath);
    if (!fileExists) return false;
    // Only migrate if app_config doesn't already have engine config
    const existing = this.repo.get('db.activeEngine');
    return !existing;
  }

  private performMigration(): void {
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    const fileConfig = JSON.parse(raw) as DatabaseJsonConfig;
    // Decrypt passwords from file format, then re-encrypt for DB storage
    if (fileConfig.engines.postgresql?.password) {
      fileConfig.engines.postgresql.password =
        this.decryptLegacy(fileConfig.engines.postgresql.password);
    }
    if (fileConfig.engines.mysql?.password) {
      fileConfig.engines.mysql.password =
        this.decryptLegacy(fileConfig.engines.mysql.password);
    }
    const entries = this.serializer.serialize(fileConfig);
    this.repo.setMany(entries);
  }

  /** Decrypt using the same key — legacy file used same encryption format */
  private decryptLegacy(value: string): string {
    return this.encryption.decrypt(value);
  }

  private markMigrated(): void {
    fs.renameSync(this.configPath, this.migratedPath);
  }
}
