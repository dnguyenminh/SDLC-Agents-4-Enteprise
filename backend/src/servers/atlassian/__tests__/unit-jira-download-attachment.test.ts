import { describe, it, expect } from 'vitest';
import { DownloadAttachmentSchema } from '../models/jira-schemas.js';

describe('UT-21: DownloadAttachmentSchema — validates input', () => {
  it('accepts attachment_id only', () => {
    const result = DownloadAttachmentSchema.safeParse({ attachment_id: '12345' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachment_id).toBe('12345');
    }
  });

  it('accepts attachment_url only', () => {
    const result = DownloadAttachmentSchema.safeParse({ attachment_url: 'https://jira.example.com/secure/attachment/123/file.pdf' });
    expect(result.success).toBe(true);
  });

  it('accepts both attachment_id and attachment_url', () => {
    const result = DownloadAttachmentSchema.safeParse({ attachment_id: '123', attachment_url: 'https://example.com/file.pdf' });
    expect(result.success).toBe(true);
  });

  it('rejects missing both fields', () => {
    const result = DownloadAttachmentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = DownloadAttachmentSchema.safeParse({ attachment_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects empty attachment_id', () => {
    const result = DownloadAttachmentSchema.safeParse({ attachment_id: '' });
    expect(result.success).toBe(false);
  });
});
