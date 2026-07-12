export type TaintSourceType =
  | 'http_param' | 'http_body' | 'http_header' | 'http_cookie'
  | 'url_param' | 'file_read' | 'env_var' | 'db_result'
  | 'user_input' | 'cli_arg' | 'websocket';

export type TaintSinkType =
  | 'sql_query' | 'shell_exec' | 'file_write' | 'file_path'
  | 'html_output' | 'eval' | 'deserialize' | 'ldap_query'
  | 'xml_parse' | 'url_fetch' | 'redirect' | 'log_output';

export interface TaintSource {
  variable: string;
  type: TaintSourceType;
  line: number;
  expression: string;
}

export interface TaintSink {
  function: string;
  type: TaintSinkType;
  line: number;
  expression: string;
  paramIndex: number;
}

export interface TaintStep {
  variable: string;
  line: number;
  action: 'assign' | 'concat' | 'template_literal' | 'format_string'
    | 'function_call' | 'collection_add' | 'destructure' | 'sanitize' | 'pass_through';
  expression: string;
}

export interface TaintPath {
  source: TaintSource;
  sink: TaintSink;
  chain: TaintStep[];
  sanitized: boolean;
  length: number;
}

export interface TaintResult {
  paths: TaintPath[];
  sources: TaintSource[];
  sinks: TaintSink[];
  sanitizers: Array<{ function: string; line: number; sinkTypes: TaintSinkType[] }>;
}

export interface TaintOptions {
  maxPathLength?: number;
  includeSanitized?: boolean;
  sinkTypes?: TaintSinkType[];
  sourceTypes?: TaintSourceType[];
}
