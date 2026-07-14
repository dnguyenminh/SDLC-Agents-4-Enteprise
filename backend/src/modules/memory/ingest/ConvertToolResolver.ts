/**
 * ConvertToolResolver — dùng dynamic tool (find_tools + execute_dynamic_tool) để
 * convert file nhị phân sang Markdown. KHÔNG dùng lib convert built-in. (Design R2/R3/R4)
 */
import type { OrchestrationGateway, ToolDescriptor } from './OrchestrationGateway.js';

export type ConvertReason = 'no-tool' | 'convert-failed' | 'empty-result' | 'schema-error' | 'timeout';

export interface ConvertSuccess { ok: true; markdown: string; toolName: string; }
export interface ConvertFailure { ok: false; reason: ConvertReason; detail?: string; }
export type ConvertResult = ConvertSuccess | ConvertFailure;

export interface ConvertRequest {
  filePath: string;   // đường dẫn tuyệt đối
  ext: string;        // '.docx', '.png', ...
  mime?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class ConvertToolResolver {
  constructor(
    private readonly gateway: OrchestrationGateway,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async resolve(req: ConvertRequest): Promise<ConvertResult> {
    const query = buildQuery(req.ext, req.mime);
    let tools: ToolDescriptor[];
    try {
      tools = await this.gateway.findTools(query, { threshold: 0.4, top_k: 5 });
    } catch (err: any) {
      return { ok: false, reason: 'no-tool', detail: err?.message };
    }
    if (!tools || tools.length === 0) { return { ok: false, reason: 'no-tool' }; }

    const tool = selectBestTool(tools, req.ext);
    const args = buildArgs(req);
    if (!args) { return { ok: false, reason: 'schema-error' }; }

    let raw: string;
    try {
      raw = await withTimeout(this.gateway.executeDynamicTool(tool.name, args), this.timeoutMs);
    } catch (err: any) {
      const reason: ConvertReason = err?.message === 'timeout' ? 'timeout' : 'convert-failed';
      return { ok: false, reason, detail: err?.message };
    }

    const markdown = extractMarkdown(raw);
    if (!markdown || markdown.trim().length === 0) { return { ok: false, reason: 'empty-result' }; }
    return { ok: true, markdown, toolName: tool.name };
  }
}

export function buildQuery(ext: string, mime?: string): string {
  const e = ext.replace('.', '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(e) || (mime?.startsWith('image/'))) {
    return 'convert image OCR to markdown';
  }
  if (['xls', 'xlsx', 'ods'].includes(e)) { return 'convert excel spreadsheet to markdown'; }
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) { return 'convert docx word document to markdown'; }
  if (['ppt', 'pptx', 'odp'].includes(e)) { return 'convert powerpoint slides to markdown'; }
  if (e === 'pdf') { return 'convert pdf to markdown'; }
  return `convert ${e} file to markdown`;
}

export function selectBestTool(tools: ToolDescriptor[], ext: string): ToolDescriptor {
  const e = ext.replace('.', '').toLowerCase();
  const match = tools.find(t =>
    (t.name?.toLowerCase().includes(e)) ||
    (t.description?.toLowerCase().includes(e)) ||
    (t.name?.toLowerCase().includes('markdown')) ||
    (t.name?.toLowerCase().includes('convert'))
  );
  return match ?? tools[0];
}

/** Cung cấp cả uri lẫn path để tương thích nhiều schema tool convert khác nhau. */
export function buildArgs(req: ConvertRequest): Record<string, unknown> | null {
  const normalized = req.filePath.replace(/\\/g, '/');
  const uri = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
  return { uri, path: req.filePath, filePath: req.filePath };
}

export function extractMarkdown(raw: string): string {
  if (!raw) { return ''; }
  const trimmed = raw.trim();
  // Nếu tool trả JSON { markdown } / { content }
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      if (typeof obj.markdown === 'string') { return obj.markdown; }
      if (typeof obj.content === 'string') { return obj.content; }
      if (typeof obj.text === 'string') { return obj.text; }
    } catch { /* raw không phải JSON — dùng nguyên văn */ }
  }
  return raw;
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); })
     .catch((e) => { clearTimeout(timer); reject(e); });
  });
}
