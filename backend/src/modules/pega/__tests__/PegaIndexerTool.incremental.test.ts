/**
 * SA4E-88 — Unit tests for PegaIndexerTool incremental mode.
 * Verifies hash-based change detection and cache persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PegaIndexerTool } from '../PegaIndexerTool.js';
import { computeHash, type HashCacheData } from '../PegaHashCache.js';
import {
  FakeGraphWriter,
  ACTIVITY_RULE,
  FLOW_RULE,
  createFakeLogger,
  createTempWorkspace,
} from './PegaIndexerTool.helpers.js';

describe('PegaIndexerTool — Incremental Mode', () => {
  let writer: FakeGraphWriter;
  let logger: any;
  let tool: PegaIndexerTool;
  let workspace: { root: string; rulesDir: string };

  beforeEach(() => {
    writer = new FakeGraphWriter();
    logger = createFakeLogger();
    tool = new PegaIndexerTool(writer, logger);
    workspace = createTempWorkspace();
  });

  afterEach(() => {
    rmSync(workspace.root, { recursive: true, force: true });
  });

  it('skips unchanged files based on hash cache', async () => {
    const content = JSON.stringify(ACTIVITY_RULE);
    const hash = computeHash(content);
    const cacheData: HashCacheData = { version: 1, entries: { 'act.pega.json': hash } };

    writeFileSync(join(workspace.rulesDir, 'act.pega.json'), content);
    writeFileSync(join(workspace.root, '.pega-hash-cache.json'), JSON.stringify(cacheData));

    const result = await tool.execute(
      { mode: 'incremental', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.status).toBe('completed');
    expect(result.stats.filesScanned).toBe(1);
    expect(result.stats.filesChanged).toBe(0);
    expect(result.stats.nodesCreated).toBe(0);
  });

  it('processes new files not in cache', async () => {
    const cacheData: HashCacheData = { version: 1, entries: {} };
    writeFileSync(join(workspace.rulesDir, 'new.pega.json'), JSON.stringify(ACTIVITY_RULE));
    writeFileSync(join(workspace.root, '.pega-hash-cache.json'), JSON.stringify(cacheData));

    const result = await tool.execute(
      { mode: 'incremental', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.stats.filesChanged).toBe(1);
    expect(result.stats.nodesCreated).toBe(1);
  });

  it('processes modified files with stale hash', async () => {
    const cacheData: HashCacheData = { version: 1, entries: { 'rule.pega.json': 'stale' } };
    writeFileSync(join(workspace.rulesDir, 'rule.pega.json'), JSON.stringify(FLOW_RULE));
    writeFileSync(join(workspace.root, '.pega-hash-cache.json'), JSON.stringify(cacheData));

    const result = await tool.execute(
      { mode: 'incremental', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.stats.filesChanged).toBe(1);
    expect(result.stats.nodesCreated).toBe(1);
    expect(result.stats.edgesCreated).toBeGreaterThan(0);
  });

  it('defaults to incremental mode when mode is omitted', async () => {
    writeFileSync(join(workspace.rulesDir, 'r.pega.json'), JSON.stringify(ACTIVITY_RULE));

    const result = await tool.execute({ rules_dir: workspace.rulesDir }, workspace.root);
    expect(result.mode).toBe('incremental');
  });
});
