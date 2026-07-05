/**
 * Unit Tests — FuzzyFilter, ContextMenuItems, BadgeManager, BadgeRenderer, MessageBridge, ContextMenuController
 * KSA-252 — STC UT-01 through UT-45
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fuzzyMatch, filterItems } from '../context-menu/FuzzyFilter';
import { CONTEXT_MENU_ITEMS } from '../context-menu/ContextMenuItems';

// ============================================================
// 2.1 FuzzyFilter.ts (UT-01 to UT-10)
// ============================================================
describe('UT — FuzzyFilter', () => {
  it('UT-01: exact match returns item', () => {
    const items = [{ label: 'Files' }, { label: 'Spec' }];
    const result = filterItems(items, 'Files');
    expect(result.map(r => r.label)).toContain('Files');
  });

  it('UT-02: partial match (subsequence)', () => {
    const items = [{ label: 'Files' }, { label: 'Folder' }];
    const result = filterItems(items, 'fl');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.map(r => r.label)).toContain('Files');
  });

  it('UT-03: no match returns empty', () => {
    const items = [{ label: 'Files' }, { label: 'Spec' }];
    const result = filterItems(items, 'xyz');
    expect(result).toHaveLength(0);
  });

  it('UT-04: empty query returns all', () => {
    const items = [{ label: 'A' }, { label: 'B' }, { label: 'C' }];
    const result = filterItems(items, '');
    expect(result).toHaveLength(3);
  });

  it('UT-05: case insensitive matching', () => {
    const items = [{ label: 'Git Diff' }];
    const result = filterItems(items, 'git');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Git Diff');
  });

  it('UT-06: special characters handled', () => {
    const items = [{ label: '#File: test.ts' }];
    const result = filterItems(items, '#');
    expect(result).toHaveLength(1);
  });

  it('UT-07: unicode characters', () => {
    const items = [{ label: 'Tep' }, { label: 'Thu muc' }];
    const result = filterItems(items, 'te');
    expect(result.map(r => r.label)).toContain('Tep');
  });

  it('UT-08: score ordering (prefix > mid)', () => {
    const items = [{ label: 'Current File' }, { label: 'Folder' }];
    const result = filterItems(items, 'f');
    // 'Folder' starts with 'f', should score higher
    expect(result[0].label).toBe('Folder');
  });

  it('UT-09: single character query', () => {
    const result = filterItems(CONTEXT_MENU_ITEMS, 'm');
    expect(result.map(r => r.label)).toContain('MCP');
  });

  it('UT-10: very long query (20+ chars) returns empty for short items', () => {
    const items = [{ label: 'Short' }];
    const result = filterItems(items, 'verylongquerythatnevermatches');
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// 2.2 ContextMenuItems.ts (UT-11 to UT-13)
// ============================================================
describe('UT — ContextMenuItems', () => {
  it('UT-11: all 9 items defined', () => {
    expect(CONTEXT_MENU_ITEMS).toHaveLength(9);
  });

  it('UT-12: each item has required fields', () => {
    for (const item of CONTEXT_MENU_ITEMS) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('icon');
      expect(item).toHaveProperty('type');
    }
  });

  it('UT-13: correct types assigned to instant items', () => {
    const instantIds = ['git-diff', 'terminal', 'problems', 'current-file'];
    for (const id of instantIds) {
      const item = CONTEXT_MENU_ITEMS.find(i => i.id === id);
      expect(item).toBeDefined();
      expect(item!.type).toBe('instant');
    }
  });
});
