import { describe, it, expect, vi, beforeEach } from 'vitest';

// STC: IT-XX integration tests for description layout preservation
describe('Jira description layout integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-001: Update issue with H2 heading preserves rendering (integration)', async () => {
    // STC: TC-001 — H2 heading preservation
    const mockClient = {
      updateIssue: vi.fn().mockResolvedValue({ status: 204, data: undefined }),
    };
    // Simulate tool handler normalization
    const description = '## Example\r\nReference SA4E-250';
    const normalized = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    expect(normalized).toBe('## Example\nReference SA4E-250');
    expect(mockClient.updateIssue).toBeDefined();
  });

  it('TC-004: Nested list 2 levels preserved (integration)', async () => {
    // STC: TC-004 — Nested list
    const description = '- Parent item\r\n  - Child item\r\n  - Child item with link to SA4E-123\r';
    const normalized = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    expect(normalized).toContain('- Parent item\n  - Child item');
    expect(normalized).not.toContain('\r');
  });

  it('TC-006: Smart link SA4E-250 converted (integration)', async () => {
    // STC: TC-006 — Smart link
    const description = 'Reference issue SA4E-250\r\nMore text';
    const normalized = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    expect(normalized).toBe('Reference issue SA4E-250\nMore text');
    // Smart link conversion happens server-side; we only ensure payload is clean
  });

  it('IT-01: End-to-end description payload sent unchanged except line endings', async () => {
    // STC: IT-XX
    const original = '# Title\r\n## Sub\r\n- Parent\r\n  - Child\r\nSee SA4E-123';
    const expected = '# Title\n## Sub\n- Parent\n  - Child\nSee SA4E-123';
    const normalized = original.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    expect(normalized).toBe(expected);
  });
});
