/**
 * Property-Based Tests — FormatClassifier (Task 9)
 * Properties:
 * 1. classifyFormat always returns a valid IngestFormat
 * 2. markdown extensions always → 'markdown'
 * 3. text extensions always → 'text'
 * 4. normalizeExt always returns lowercase with dot prefix
 */
import { describe, it, expect } from 'vitest';
import { classifyFormat, normalizeExt, type IngestFormat } from '../FormatClassifier.js';

const VALID_FORMATS: IngestFormat[] = ['markdown', 'text', 'binary'];

const MARKDOWN_FILES = ['README.md', 'docs/guide.markdown', 'NOTES.MD', 'file.Markdown'];
const TEXT_FILES = ['data.txt', 'config.json', 'schema.xml', 'app.yaml', 'app.yml', 'data.csv', 'server.log'];
const BINARY_FILES = ['doc.docx', 'sheet.xlsx', 'image.png', 'photo.jpg', 'file.pdf', 'slides.pptx', 'archive.zip'];

describe('FormatClassifier — Property Tests', () => {
  describe('Property: always returns valid IngestFormat', () => {
    const ALL_FILES = [...MARKDOWN_FILES, ...TEXT_FILES, ...BINARY_FILES, 'unknown.xyz', 'noext', '.gitignore'];
    it.each(ALL_FILES)('classifyFormat(%s) ∈ valid formats', (filePath) => {
      const result = classifyFormat({ filePath });
      expect(VALID_FORMATS).toContain(result);
    });
  });

  describe('Property: markdown extensions → markdown', () => {
    it.each(MARKDOWN_FILES)('%s → markdown', (filePath) => {
      expect(classifyFormat({ filePath })).toBe('markdown');
    });
  });

  describe('Property: text extensions → text', () => {
    it.each(TEXT_FILES)('%s → text', (filePath) => {
      expect(classifyFormat({ filePath })).toBe('text');
    });
  });

  describe('Property: binary extensions → binary', () => {
    it.each(BINARY_FILES)('%s → binary', (filePath) => {
      expect(classifyFormat({ filePath })).toBe('binary');
    });
  });

  describe('Property: normalizeExt returns lowercase with dot', () => {
    const cases = [
      ['file.DOCX', '.docx'],
      ['file.Md', '.md'],
      ['file.TXT', '.txt'],
      ['noext', ''],
      ['path/to/file.PDF', '.pdf'],
    ] as const;

    it.each(cases)('normalizeExt(%s) === %s', (input, expected) => {
      const result = normalizeExt(input);
      expect(result).toBe(expected);
      expect(result).toBe(result.toLowerCase());
    });
  });

  describe('Property: mime text/* override → text', () => {
    it('text/html with unknown ext → text', () => {
      expect(classifyFormat({ filePath: 'file.html', mime: 'text/html' })).toBe('text');
    });
    it('text/plain with unknown ext → text', () => {
      expect(classifyFormat({ filePath: 'file.dat', mime: 'text/plain' })).toBe('text');
    });
  });
});
