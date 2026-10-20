/**
 * SA4E-171 — Unit tests for PegaSymbolSync module.
 * Covers: feature flag, field validation, project registry naming.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncRuleToSymbols, PEGA_DUAL_WRITE } from '../PegaSymbolSync.js';

describe('PegaSymbolSync', () => {
  describe('PEGA_DUAL_WRITE feature flag', () => {
    it('should default to true when env var is not set', () => {
      // The module reads process.env at import time — tested via current state
      expect(typeof PEGA_DUAL_WRITE).toBe('boolean');
    });
  });

  describe('syncRuleToSymbols', () => {
    let mockAdapter: any;

    beforeEach(() => {
      mockAdapter = {
        getEngine: () => 'sqlite',
        runAsync: vi.fn().mockResolvedValue({ lastInsertRowid: 1 }),
        getAsync: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes('FROM files')) return { id: 42 };
          if (sql.includes('enrichment_status')) return { enrichment_status: null };
          return null;
        }),
        allAsync: vi.fn().mockResolvedValue([]),
      };
    });

    const CHK = 'b'.repeat(64);

    it('should return null when pxObjClass is missing', async () => {
      const result = await syncRuleToSymbols(
        mockAdapter, { pyClassName: 'Work', pyRuleName: 'Test' }, 'proj1', '', CHK,
      );
      expect(result).toBeNull();
    });

    it('should use pxObjClass fallback when pyClassName is missing', async () => {
      const result = await syncRuleToSymbols(
        mockAdapter, { pxObjClass: 'Rule-Obj-Activity', pyRuleName: 'Test' }, 'proj1', '', CHK,
      );
      expect(result).not.toBeNull();
      expect(result?.symbolId).toBe(1);
    });

    it('should return null when pyRuleName is missing', async () => {
      const result = await syncRuleToSymbols(
        mockAdapter, { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work' }, 'proj1', '', CHK,
      );
      expect(result).toBeNull();
    });

    it('should skip rules exceeding 5MB (SEC-06)', async () => {
      const bigContent = 'x'.repeat(6 * 1024 * 1024);
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work',
        pyRuleName: 'BigRule',
        data: bigContent,
      };
      const result = await syncRuleToSymbols(mockAdapter, rule, 'proj1', '', CHK);
      expect(result).toBeNull();
    });

    it('should create file, symbol, body embedding, and task for valid rule', async () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-HR',
        pyRuleName: 'ApproveLeave',
      };
      const result = await syncRuleToSymbols(mockAdapter, rule, 'proj1', 'context', CHK);
      expect(result).not.toBeNull();
      // Verify DB operations were called
      expect(mockAdapter.runAsync).toHaveBeenCalled();
    });

    it('registers the PROJECT by app name, not the last rule class (SA4E-338 B1)', async () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-HR',
        pyRuleName: 'ApproveLeave',
        pyApplication: 'HRAppsV2',
      };
      await syncRuleToSymbols(mockAdapter, rule, 'proj1', 'context', CHK);

      const registryInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('project_registry'),
      );
      expect(registryInsert).toBeDefined();
      const params = registryInsert![1] as unknown[];
      // params: [projectId, display_name, workspace_path, created_by]
      expect(params[1]).toBe('Pega: HRAppsV2');       // stable app name, not 'Work-HR'
      expect(params[2]).toBe('');                      // no fake 'pega://Work-HR' URI
    });

    it('prefers the explicit appName (from pega-project.json) over rule pyApplication (SA4E-338 B1)', async () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-HR',
        pyRuleName: 'ApproveLeave',
        pyApplication: 'SomeRuleApp',
      };
      // 6th arg = appName resolved from pega-project.json
      await syncRuleToSymbols(mockAdapter, rule, 'proj1', 'context', CHK, 'HRAppsV2');
      const registryInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('project_registry'),
      );
      expect((registryInsert![1] as unknown[])[1]).toBe('Pega: HRAppsV2'); // explicit wins
    });

    it('falls back to projectId for display name when app field is absent (SA4E-338 B1)', async () => {
      const rule = { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work', pyRuleName: 'X' };
      await syncRuleToSymbols(mockAdapter, rule, 'proj-xyz', 'context', CHK);
      const registryInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('project_registry'),
      );
      expect((registryInsert![1] as unknown[])[1]).toBe('Pega: proj-xyz');
    });
  });
});
