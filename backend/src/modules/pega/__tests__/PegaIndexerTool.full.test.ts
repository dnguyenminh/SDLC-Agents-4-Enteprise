/**
 * SA4E-88 — Unit tests for PegaIndexerTool full mode + error handling.
 * Verifies full indexing, graph writes, and missing-dir errors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PegaIndexerTool } from '../PegaIndexerTool.js';
import type { HashCacheData } from '../PegaHashCache.js';
import {
  FakeGraphWriter,
  ACTIVITY_RULE,
  FLOW_RULE,
  createFakeLogger,
  createTempWorkspace,
} from './PegaIndexerTool.helpers.js';

describe('PegaIndexerTool — Full Mode', () => {
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

  it('indexes a single activity rule — node + edges', async () => {
    writeFileSync(join(workspace.rulesDir, 'act.pega.json'), JSON.stringify(ACTIVITY_RULE));

    const result = await tool.execute(
      { mode: 'full', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('full');
    expect(result.stats.filesScanned).toBe(1);
    expect(result.stats.nodesCreated).toBe(1);
    expect(result.stats.edgesCreated).toBeGreaterThan(0);
    expect(writer.nodes[0].id).toContain('pega::Activity::Work-Cover-Jira::ResolveTicket');
    expect(writer.nodes[0].type).toBe('FUNCTION');
  });

  it('full mode clears existing nodes before re-index', async () => {
    writer.nodes.push({ id: 'pega::old::node', label: 'Old', type: 'FUNCTION' });
    writeFileSync(join(workspace.rulesDir, 'flow.pega.json'), JSON.stringify(FLOW_RULE));

    const result = await tool.execute(
      { mode: 'full', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.status).toBe('completed');
    expect(writer.removedPrefixes).toContain('pega::');
    expect(writer.nodes.every(n => n.id !== 'pega::old::node')).toBe(true);
  });

  it('handles malformed JSON gracefully as error count', async () => {
    writeFileSync(join(workspace.rulesDir, 'bad.pega.json'), 'not valid json {{{');

    const result = await tool.execute(
      { mode: 'full', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.status).toBe('completed');
    expect(result.stats.errors).toBe(1);
    expect(result.stats.nodesCreated).toBe(0);
  });

  it('persists hash cache after full index', async () => {
    writeFileSync(join(workspace.rulesDir, 'act.pega.json'), JSON.stringify(ACTIVITY_RULE));

    await tool.execute({ mode: 'full', rules_dir: workspace.rulesDir }, workspace.root);

    const cacheRaw = readFileSync(join(workspace.root, '.pega-hash-cache.json'), 'utf-8');
    const cache = JSON.parse(cacheRaw) as HashCacheData;
    expect(cache.version).toBe(1);
    expect(Object.keys(cache.entries)).toHaveLength(1);
  });

  it('discovers nested .pega.json files recursively', async () => {
    mkdirSync(join(workspace.rulesDir, 'sub', 'deep'), { recursive: true });
    writeFileSync(join(workspace.rulesDir, 'sub', 'deep', 'a.pega.json'), JSON.stringify(ACTIVITY_RULE));
    writeFileSync(join(workspace.rulesDir, 'b.pega.json'), JSON.stringify(FLOW_RULE));
    writeFileSync(join(workspace.rulesDir, 'readme.md'), '# not a rule');

    const result = await tool.execute(
      { mode: 'full', rules_dir: workspace.rulesDir }, workspace.root,
    );

    expect(result.stats.filesScanned).toBe(2);
    expect(result.stats.nodesCreated).toBe(2);
  });
});

describe('PegaIndexerTool — Error Handling', () => {
  it('returns error status when rules_dir does not exist', async () => {
    const writer = new FakeGraphWriter();
    const logger = createFakeLogger();
    const tool = new PegaIndexerTool(writer, logger);
    const workspace = createTempWorkspace();

    try {
      const result = await tool.execute(
        { mode: 'full', rules_dir: '/nonexistent/path/xyz' }, workspace.root,
      );
      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
      expect(logger.error).toHaveBeenCalled();
    } finally {
      rmSync(workspace.root, { recursive: true, force: true });
    }
  });
});
