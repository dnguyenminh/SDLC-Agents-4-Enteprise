/**
 * KSA-162: Entry Point Detector — Main orchestrator.
 */

import Database from 'better-sqlite3';
import type { EntryPoint, EntryPointFilters, EntryPointQueryResult } from './types.js';
import { PatternRegistry } from './PatternRegistry.js';
import { FrameworkDetector } from './FrameworkDetector.js';
import { EntryPointStore } from './EntryPointStore.js';
import { HTTPHandlerDetector } from './detectors/HTTPHandlerDetector.js';
import { MainDetector } from './detectors/MainDetector.js';
import { CLIDetector } from './detectors/CLIDetector.js';
import { EventDetector } from './detectors/EventDetector.js';

export class EntryPointDetector {
  private registry: PatternRegistry;
  private frameworkDetector: FrameworkDetector;
  private httpDetector: HTTPHandlerDetector;
  private mainDetector: MainDetector;
  private cliDetector: CLIDetector;
  private eventDetector: EventDetector;
  private store: EntryPointStore;
  private db: Database.Database;

  /**
   * @param projectId  SA4E-41 read scope. Undefined ⇒ query() is fail-closed.
   */
  constructor(db: Database.Database, projectId?: string) {
    this.db = db;
    this.registry = new PatternRegistry();
    this.frameworkDetector = new FrameworkDetector(this.registry);
    this.httpDetector = new HTTPHandlerDetector(this.registry);
    this.mainDetector = new MainDetector(this.registry);
    this.cliDetector = new CLIDetector();
    this.eventDetector = new EventDetector();
    this.store = new EntryPointStore(db, projectId);
  }

  /** Detect all entry points in a file. */
  detectFile(filePath: string, source: string, language: string, symbols: Array<{
    id: number; name: string; decorators?: string[]; parentName?: string | null;
    filePath: string; startLine: number;
  }>): EntryPoint[] {
    const allEntryPoints: EntryPoint[] = [];

    // 1. Detect framework
    const framework = this.frameworkDetector.detect(source, language);

    // 2. HTTP handlers (if framework detected)
    if (framework) {
      const httpEntries = this.httpDetector.detectFromSymbols(symbols, framework.name, source);
      allEntryPoints.push(...httpEntries);
    }

    // 3. Main functions
    const mainEntries = this.mainDetector.detect(symbols, source, language);
    allEntryPoints.push(...mainEntries);

    // 4. CLI commands
    const cliEntries = this.cliDetector.detect(symbols, source);
    allEntryPoints.push(...cliEntries);

    // 5. Event handlers
    const eventEntries = this.eventDetector.detect(symbols, source);
    allEntryPoints.push(...eventEntries);

    // Store results
    if (allEntryPoints.length > 0) {
      this.store.upsertBatch(allEntryPoints);
    }

    return allEntryPoints;
  }

  /** Query stored entry points. */
  query(filters: EntryPointFilters): EntryPointQueryResult {
    return this.store.query(filters);
  }
}
