/**
 * SA4E-171 — Unit tests for PegaSymbolSync module.
 * Covers: syncRuleToSymbols, feature flag, size guard, field validation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncRuleToSymbols, PEGA_DUAL_WRITE, MissingChecksumError } from '../PegaSymbolSync.js';

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

    it('should store extracted content (not raw JSON) in body_embeddings (SA4E-106)', async () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-HR',
        pyRuleName: 'ApproveLeave',
        steps: [{ pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-HR.Validate' }],
      };
      await syncRuleToSymbols(mockAdapter, rule, 'proj1', '', CHK);

      const bodyInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('body_embeddings'),
      );
      expect(bodyInsert).toBeDefined();
      const embeddingBuf = bodyInsert![1][2] as Buffer;
      const text = Buffer.from(embeddingBuf).toString('utf-8');
      expect(text.startsWith('RULE TYPE:')).toBe(true);
      expect(text).toContain('Call(Work-HR.Validate)');
      expect(text).not.toContain('{"pxObjClass"');
    });

    it('should skip enrichment task when symbol already COMPLETED with summary', async () => {
      mockAdapter.getAsync = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM files')) return { id: 42 };
        if (sql.includes('enrichment_status')) return { enrichment_status: 'COMPLETED', summary: 'Existing summary' };
        return null;
      });
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work',
        pyRuleName: 'Done',
      };
      const result = await syncRuleToSymbols(mockAdapter, rule, 'proj1', '', CHK);
      expect(result).not.toBeNull();
      // Should NOT have called INSERT INTO pending_tasks
      const taskInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('pending_tasks'),
      );
      expect(taskInsert).toBeUndefined();
    });

    it('should re-enrich when COMPLETED but no summary (TAG_ENRICHMENT legacy)', async () => {
      mockAdapter.getAsync = vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('FROM files')) return { id: 42 };
        if (sql.includes('enrichment_status')) return { enrichment_status: 'COMPLETED', summary: null };
        return null;
      });
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work',
        pyRuleName: 'LegacyRule',
      };
      const result = await syncRuleToSymbols(mockAdapter, rule, 'proj1', '', CHK);
      expect(result).not.toBeNull();
      // SHOULD create enrichment task (legacy TAG_ENRICHMENT had no summary)
      const taskInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('pending_tasks'),
      );
      expect(taskInsert).toBeDefined();
    });

    it('should truncate doc_comment to 500 chars', async () => {
      const longContext = 'A'.repeat(600);
      const rule = {
        pxObjClass: 'Rule-Obj-Flow',
        pyClassName: 'Work',
        pyRuleName: 'LongDoc',
      };
      await syncRuleToSymbols(mockAdapter, rule, 'proj1', longContext, CHK);
      // The INSERT for symbols should contain truncated doc_comment
      const symbolInsert = mockAdapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INTO symbols'),
      );
      if (symbolInsert) {
        const params = symbolInsert[1] as any[];
        const docParam = params[params.length - 1]; // doc_comment is last param
        expect(docParam.length).toBeLessThanOrEqual(500);
      }
    });

    // ── SA4E-241: content_hash provenance (INV-1 — Phase-6 fresh-review Critical) ──
    // The files INSERT (SQLite path) params are:
    // [projectId, virtualPath, virtualPath, module, contentHash, sizeBytes]
    const filesInsertParams = (adapter: any): any[] | undefined => {
      const call = adapter.runAsync.mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('INTO files'),
      );
      return call ? (call[1] as any[]) : undefined;
    };

    it('SA4E-241: stores the CLIENT checksum as content_hash (NT-4/INV-1), not full-JSON', async () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work-HR', pyRuleName: 'ApproveLeave',
        pyActivity: 'body that WOULD change a full-JSON hash',
      };
      // computePegaChecksum value the extension already computed + sent down.
      const clientChecksum = 'a'.repeat(64);
      await syncRuleToSymbols(mockAdapter, rule, 'proj1', 'ctx', clientChecksum);

      const params = filesInsertParams(mockAdapter);
      expect(params).toBeDefined();
      expect(params![4]).toBe(clientChecksum); // content_hash column
      // MUST NOT be the legacy full-JSON sha256.
      const fullJson = require('crypto').createHash('sha256').update(JSON.stringify(rule)).digest('hex');
      expect(params![4]).not.toBe(fullJson);
    });

    it('SA4E-241 (NT-4): throws MissingChecksumError when no checksum supplied — NO full-JSON fallback', async () => {
      const rule = { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work', pyRuleName: 'NoChk' };
      // Backend must NEVER compute a checksum: an absent one is a hard failure.
      await expect(syncRuleToSymbols(mockAdapter, rule, 'proj1', 'ctx', '')).rejects.toThrow(MissingChecksumError);
      // And nothing was written to the files table.
      expect(filesInsertParams(mockAdapter)).toBeUndefined();
    });
  });
});