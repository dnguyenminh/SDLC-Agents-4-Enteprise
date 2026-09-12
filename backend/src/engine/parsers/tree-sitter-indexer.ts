import * as fs from 'fs';
import * as path from 'path';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { GrammarRegistry } from './grammar-registry.js';
import { extractSymbols } from './signature-extractor.js';
import type { ParseResult, IndexResult } from './types.js';
import { storeResults, storeRegexResults, extractAndStoreBodies } from './indexer/storage.js';
import { DependencyResolver } from './dependency-resolver.js';
import { DEFAULT_PARSER_CONFIG } from './grammars/grammar-config-loader.js';
import pino from 'pino';

const logger = pino({ name: 'tree-sitter-indexer' });

/**
 * F-02 — Race a promise against a timeout. Resolves with the promise value, or
 * rejects (so callers can degrade gracefully) if it does not settle in `ms`.
 * Used to enforce `timeoutPerFile` on parser invocations as defense-in-depth
 * against slow/hanging parse paths.
 */
export async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`parse-timeout:${label}`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class TreeSitterIndexer {
  private registry: GrammarRegistry;
  private adapter: DatabaseAdapter;
  private maxFileSize: number;
  private depResolver: DependencyResolver;
  private workspace: string;
  private timeoutPerFile: number;

  constructor(
    registry: GrammarRegistry,
    adapter: DatabaseAdapter,
    maxFileSize: number = 1_048_576,
    workspace: string = '',
    timeoutPerFile: number = DEFAULT_PARSER_CONFIG.timeoutPerFile,
  ) {
    this.registry = registry;
    this.adapter = adapter;
    this.maxFileSize = maxFileSize;
    this.depResolver = new DependencyResolver();
    this.workspace = workspace;
    this.timeoutPerFile = timeoutPerFile;
  }

  private readonly TIER_B_EXTENSIONS = new Set(['xml','sql','properties','yml','yaml','html','css']);

  async indexFile(filePath: string, relativePath: string, projectId: string): Promise<IndexResult> {
    const startTime = Date.now();
    let source: string;
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > this.maxFileSize) return await this.fullTextFallback(filePath, relativePath, projectId, startTime);
      source = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return { filePath: relativePath, symbolCount: 0, relationshipCount: 0, parseErrors: 1, duration: Date.now() - startTime, method: 'regex-fallback', dependencies: [] };
    }
    const ext = path.extname(filePath).toLowerCase().slice(1);
    if (this.TIER_B_EXTENSIONS.has(ext)) {
      return await this.fullTextFallback(filePath, relativePath, projectId, startTime, source);
    }
    const parser = await this.registry.getParser(filePath);
    let result: ParseResult;
    let method: 'tree-sitter' | 'regex-fallback' | 'timeout-degraded';
    if (parser) {
      // F-02: enforce timeoutPerFile on the (potentially heavy) parse path.
      try {
        const parsePromise = Promise.resolve().then(() => parser.parse(source, relativePath));
        result = await withTimeout(parsePromise, this.timeoutPerFile, relativePath);
        method = 'tree-sitter';
      } catch (err) {
        logger.warn({ err, relativePath }, '[indexer] parse failed/timeout — fallback to full-text');
        return await this.fullTextFallback(filePath, relativePath, projectId, startTime, source);
      }
    } else {
      return await this.regexFallback(filePath, relativePath, projectId, startTime);
    }
    if (ext === 'java') {
      result = this.reclassifyJavaSymbols(source, result);
    }
    const symbolIds = await storeResults(this.adapter, relativePath, result, projectId);
    await extractAndStoreBodies(this.adapter, relativePath, source, result, symbolIds, projectId);
    const dependencies = this.depResolver.resolve(source, relativePath, this.workspace);
    return { filePath: relativePath, symbolCount: result.symbols.length, relationshipCount: result.relationships.length, parseErrors: result.errors.length, duration: Date.now() - startTime, method, dependencies };
  }

  async indexFiles(files: { absolutePath: string; relativePath: string }[], projectId: string): Promise<IndexResult[]> {
    const results: IndexResult[] = [];
    for (const file of files) {
      results.push(await this.indexFile(file.absolutePath, file.relativePath, projectId));
    }
    return results;
  }

  private async regexFallback(filePath: string, relativePath: string, projectId: string, startTime: number): Promise<IndexResult> {
    try {
      const source = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();
      const language = this.extToLanguage(ext);
      const symbols = extractSymbols(source, language);
      if (symbols.length > 0) await storeRegexResults(this.adapter, relativePath, symbols, projectId);
      const dependencies = this.depResolver.resolve(source, relativePath, this.workspace);
      return { filePath: relativePath, symbolCount: symbols.length, relationshipCount: 0, parseErrors: 0, duration: Date.now() - startTime, method: 'regex-fallback', dependencies };
    } catch {
      return { filePath: relativePath, symbolCount: 0, relationshipCount: 0, parseErrors: 1, duration: Date.now() - startTime, method: 'regex-fallback', dependencies: [] };
    }
  }

  private async fullTextFallback(filePath: string, relativePath: string, projectId: string, startTime: number, source?: string): Promise<IndexResult> {
    try {
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const content = source ?? fs.readFileSync(filePath, 'utf-8');
      // Store full-text in knowledge_entries for Tier B searchability (SA4E-261)
      await this.adapter.runAsync(
        `INSERT INTO knowledge_entries (content, summary, type, tier, scope, project_id, source, tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source, project_id) DO UPDATE SET content = excluded.content, summary = excluded.summary, updated_at = CURRENT_TIMESTAMP`,
        [content, relativePath, 'CONTEXT', 'WORKING', 'PROJECT', projectId, relativePath, `code,source,${ext}`]
      );
      // SA4E-261 stretch: ensure Tier B files appear in graph as SOURCE nodes
      const fileRow = await this.adapter.getAsync<{ id: number }>(
        'SELECT id FROM files WHERE relative_path = ? AND project_id = ?',
        [relativePath, projectId]
      );
      if (fileRow?.id) {
        const fileName = path.basename(relativePath);
        const insertSymSql = 'INSERT OR REPLACE INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        await this.adapter.runAsync(insertSymSql, [
          projectId, fileRow.id, fileName, 'file', ext, 1, 1, null, null, null
        ]);
      }
      return { filePath: relativePath, symbolCount: 1, relationshipCount: 0, parseErrors: 0, duration: Date.now() - startTime, method: 'regex-fallback', dependencies: [] };
    } catch (err) {
      logger.warn({ err, relativePath }, '[tree-sitter-indexer] full-text fallback failed');
      return { filePath: relativePath, symbolCount: 0, relationshipCount: 0, parseErrors: 1, duration: Date.now() - startTime, method: 'regex-fallback', dependencies: [] };
    }
  }

  private reclassifyJavaSymbols(source: string, result: ParseResult): ParseResult {
    const classAnnotationMap: Record<string, string[]> = {
      rest_controller: ['@RestController'],
      controller_advice: ['@ControllerAdvice'],
      controller: ['@Controller'],
      service: ['@Service'],
      repository: ['@Repository'],
      component: ['@Component'],
      configuration: ['@Configuration'],
      entity: ['@Entity', '@Table'],
    };
    const methodAnnotationMap: Record<string, string[]> = {
      transactional: ['@Transactional'],
      http_get: ['@GetMapping', '@RequestMapping'],
      http_post: ['@PostMapping'],
      http_put: ['@PutMapping'],
      http_delete: ['@DeleteMapping'],
      http_patch: ['@PatchMapping'],
      security: ['@PreAuthorize', '@Secured', '@RolesAllowed', '@PostAuthorize'],
    };
    const classSymbols = result.symbols.filter(s => s.kind === 'class');
    for (const sym of classSymbols) {
      const idx = source.indexOf(sym.name);
      if (idx === -1) continue;
      const snippet = source.substring(Math.max(0, idx - 600), idx);
      for (const [kind, anns] of Object.entries(classAnnotationMap)) {
        if (anns.some(a => snippet.includes(a))) {
          sym.kind = kind as any;
          break;
        }
      }
    }
    const methodSymbols = result.symbols.filter(s => s.kind === 'method');
    for (const sym of methodSymbols) {
      const idx = source.indexOf(sym.name);
      if (idx === -1) continue;
      const snippet = source.substring(Math.max(0, idx - 400), idx);
      for (const [kind, anns] of Object.entries(methodAnnotationMap)) {
        if (anns.some(a => snippet.includes(a))) {
          sym.kind = kind as any;
          break;
        }
      }
    }
    return result;
  }

  private extToLanguage(ext: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.kt': 'kotlin', '.kts': 'kotlin', '.java': 'java', '.go': 'go', '.rs': 'rust',
      '.cls': 'apex', '.trigger': 'apex',
      '.jsp': 'java',
      // ── NEW language routing (SA4E-225) ──
      '.scala': 'scala',
      '.c': 'c', '.h': 'c',
      '.cpp': 'cpp', '.hpp': 'cpp',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.sh': 'bash',
      '.ps1': 'powershell',
    };
    return map[ext] ?? 'generic';
  }
}
