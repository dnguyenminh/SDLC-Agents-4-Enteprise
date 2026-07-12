/**
 * KSA-164: Taint Registry — Configuration of taint sources, sinks, and sanitizers.
 */

import type { TaintSourceType, TaintSinkType } from '../types/index.js';

export interface SourcePattern {
  type: TaintSourceType;
  patterns: string[];
  language?: string;
}

export interface SinkPattern {
  type: TaintSinkType;
  functions: string[];
  paramIndex: number;
  language?: string;
}

export interface SanitizerPattern {
  function: string;
  sanitizes: TaintSinkType[];
  language?: string;
}

export class TaintRegistry {
  private sources: SourcePattern[] = [];
  private sinks: SinkPattern[] = [];
  private sanitizers: SanitizerPattern[] = [];

  constructor() {
    this.loadDefaults();
  }

  /** Check if an expression matches a taint source pattern. */
  matchSource(expression: string, language?: string): { type: TaintSourceType } | null {
    for (const source of this.sources) {
      if (source.language && language && source.language !== language) continue;
      for (const pattern of source.patterns) {
        if (expression.includes(pattern)) {
          return { type: source.type };
        }
      }
    }
    return null;
  }

  /** Check if a function call matches a taint sink. */
  matchSink(functionName: string, language?: string): SinkPattern | null {
    for (const sink of this.sinks) {
      if (sink.language && language && sink.language !== language) continue;
      for (const fn of sink.functions) {
        if (functionName.includes(fn)) return sink;
      }
    }
    return null;
  }

  /** Check if a function is a sanitizer for a given sink type. */
  isSanitizer(functionName: string, sinkType: TaintSinkType, language?: string): boolean {
    for (const san of this.sanitizers) {
      if (san.language && language && san.language !== language) continue;
      if (functionName.includes(san.function) && san.sanitizes.includes(sinkType)) {
        return true;
      }
    }
    return false;
  }

  /** Get all registered source types. */
  getSources(): SourcePattern[] { return this.sources; }

  /** Get all registered sink types. */
  getSinks(): SinkPattern[] { return this.sinks; }

  /** Get all registered sanitizers. */
  getSanitizers(): SanitizerPattern[] { return this.sanitizers; }

  /** Add custom source pattern. */
  addSource(source: SourcePattern): void { this.sources.push(source); }

  /** Add custom sink pattern. */
  addSink(sink: SinkPattern): void { this.sinks.push(sink); }

  /** Add custom sanitizer. */
  addSanitizer(sanitizer: SanitizerPattern): void { this.sanitizers.push(sanitizer); }

  private loadDefaults(): void {
    // HTTP sources (common across frameworks)
    this.sources = [
      { type: 'http_param', patterns: ['req.query', 'req.params', 'request.args', 'request.GET', 'request.POST', 'ctx.query', 'ctx.params'] },
      { type: 'http_body', patterns: ['req.body', 'request.json', 'request.form', 'request.data', 'ctx.request.body'] },
      { type: 'http_header', patterns: ['req.headers', 'req.get(', 'request.headers', 'ctx.headers'] },
      { type: 'http_cookie', patterns: ['req.cookies', 'request.cookies', 'ctx.cookies'] },
      { type: 'url_param', patterns: ['req.url', 'req.originalUrl', 'request.url', 'window.location'] },
      { type: 'file_read', patterns: ['fs.readFile', 'readFileSync', 'open(', 'fread'] },
      { type: 'env_var', patterns: ['process.env', 'os.environ', 'getenv'] },
      { type: 'user_input', patterns: ['prompt(', 'readline', 'input(', 'stdin'] },
      { type: 'cli_arg', patterns: ['process.argv', 'sys.argv', 'args['] },
      { type: 'db_result', patterns: ['.query(', '.findOne(', '.find(', '.execute('] },
      { type: 'websocket', patterns: ['ws.on(', 'socket.on(', 'message.data'] },
    ];

    // Sinks
    this.sinks = [
      { type: 'sql_query', functions: ['query(', 'execute(', 'raw(', 'sequelize.query', 'knex.raw', 'db.run(', 'cursor.execute'], paramIndex: 0 },
      { type: 'shell_exec', functions: ['exec(', 'execSync(', 'spawn(', 'system(', 'popen(', 'subprocess.run', 'child_process'], paramIndex: 0 },
      { type: 'file_write', functions: ['writeFile(', 'writeFileSync(', 'createWriteStream(', 'fwrite'], paramIndex: 1 },
      { type: 'file_path', functions: ['readFile(', 'readFileSync(', 'open(', 'path.join(', 'path.resolve('], paramIndex: 0 },
      { type: 'html_output', functions: ['innerHTML', 'outerHTML', 'document.write(', 'res.send(', 'render(', 'dangerouslySetInnerHTML'], paramIndex: 0 },
      { type: 'eval', functions: ['eval(', 'Function(', 'setTimeout(', 'setInterval(', 'vm.runInContext'], paramIndex: 0 },
      { type: 'deserialize', functions: ['unserialize(', 'pickle.loads(', 'yaml.load(', 'JSON.parse('], paramIndex: 0 },
      { type: 'ldap_query', functions: ['ldap.search(', 'ldap.bind(', 'ldapjs.search'], paramIndex: 0 },
      { type: 'xml_parse', functions: ['parseXML(', 'DOMParser', 'xml2js.parse', 'libxml.parse', 'etree.fromstring'], paramIndex: 0 },
      { type: 'url_fetch', functions: ['fetch(', 'axios(', 'axios.get(', 'axios.post(', 'http.get(', 'request(', 'urllib.request', 'requests.get'], paramIndex: 0 },
      { type: 'redirect', functions: ['res.redirect(', 'response.redirect(', 'window.location', 'location.href'], paramIndex: 0 },
      { type: 'log_output', functions: ['console.log(', 'logger.info(', 'logger.error(', 'logging.info'], paramIndex: 0 },
    ];

    // Sanitizers
    this.sanitizers = [
      { function: 'escape', sanitizes: ['html_output', 'sql_query'] },
      { function: 'sanitize', sanitizes: ['html_output', 'sql_query', 'shell_exec'] },
      { function: 'encodeURI', sanitizes: ['url_fetch', 'redirect'] },
      { function: 'encodeURIComponent', sanitizes: ['url_fetch', 'redirect', 'html_output'] },
      { function: 'parseInt', sanitizes: ['sql_query', 'shell_exec', 'file_path'] },
      { function: 'Number(', sanitizes: ['sql_query', 'shell_exec'] },
      { function: 'validator.', sanitizes: ['sql_query', 'html_output', 'shell_exec'] },
      { function: 'DOMPurify', sanitizes: ['html_output'] },
      { function: 'xss(', sanitizes: ['html_output'] },
      { function: 'sqlstring.escape', sanitizes: ['sql_query'] },
      { function: 'parameterize', sanitizes: ['sql_query'] },
      { function: 'shellescape', sanitizes: ['shell_exec'] },
      { function: 'path.basename', sanitizes: ['file_path'] },
      { function: 'path.normalize', sanitizes: ['file_path'] },
      { function: 'new URL(', sanitizes: ['url_fetch', 'redirect'] },
    ];
  }
}