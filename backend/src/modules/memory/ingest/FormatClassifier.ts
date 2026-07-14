/**
 * FormatClassifier — phân loại file theo extension để quyết định luồng ingest.
 * (Design R5/R6) markdown/text → Direct Ingest; còn lại → binary (qua ConvertToolResolver).
 */
import * as path from 'path';

export type IngestFormat = 'markdown' | 'text' | 'binary';

export interface ClassifyInput {
  filePath: string;
  ext?: string;   // optional; nếu không có sẽ suy ra từ filePath
  mime?: string;
}

const MARKDOWN_EXTS = new Set(['.md', '.markdown']);
const TEXT_EXTS = new Set(['.txt', '.csv', '.json', '.xml', '.yaml', '.yml', '.log']);

/** Trả về extension lowercase có dấu chấm, ví dụ '.docx'. */
export function normalizeExt(filePath: string, ext?: string): string {
  const raw = ext ?? path.extname(filePath);
  return raw.toLowerCase();
}

export function classifyFormat(input: ClassifyInput): IngestFormat {
  const ext = normalizeExt(input.filePath, input.ext);
  if (MARKDOWN_EXTS.has(ext)) { return 'markdown'; }
  if (TEXT_EXTS.has(ext)) { return 'text'; }
  if (input.mime && input.mime.startsWith('text/')) { return 'text'; }
  return 'binary';
}
