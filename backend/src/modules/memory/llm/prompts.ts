export const DEFAULT_TAXONOMY: Record<string, string[]> = {
  'business-domain': [
    'authentication', 'payment', 'notification', 'reporting',
    'user-management', 'scheduling', 'integration', 'messaging',
    'configuration', 'admin-portal', 'knowledge-base', 'search',
  ],
  'technical': [
    'architecture', 'api-design', 'database', 'security',
    'performance', 'testing', 'caching', 'logging', 'monitoring',
    'mcp', 'llm', 'embedding', 'onnx', 'vector-search', 'graph',
    'websocket', 'sse', 'streaming', 'docker', 'ci-cd',
  ],
  'sdlc-phase': [
    'requirements', 'design', 'implementation', 'testing', 'deployment',
    'code-review', 'documentation', 'planning', 'retrospective',
  ],
  'document-type': [
    'decision', 'error-pattern', 'procedure', 'architecture-note',
    'meeting-note', 'tutorial', 'configuration', 'bugfix',
    'feature-spec', 'api-contract', 'user-guide', 'release-note',
  ],
  'agent-workflow': [
    'multi-agent', 'orchestration', 'pipeline', 'tool-call',
    'prompt-engineering', 'context-management', 'memory-kb',
    'jira', 'workflow', 'state-machine', 'transition',
  ],
  'code-pattern': [
    'refactoring', 'design-pattern', 'anti-pattern', 'migration',
    'dependency', 'module-structure', 'interface-design',
    'error-handling', 'validation', 'serialization',
  ],
  'priority': ['critical', 'high', 'medium', 'low'],
};

export const KNOWN_KEYWORDS: Record<string, string> = {
  'auth': 'authentication', 'jwt': 'authentication', 'oauth': 'authentication',
  'login': 'authentication', 'session': 'authentication', 'token': 'authentication',
  'payment': 'payment', 'billing': 'payment', 'invoice': 'payment',
  'api': 'api-design', 'rest': 'api-design', 'graphql': 'api-design', 'endpoint': 'api-design',
  'database': 'database', 'sql': 'database', 'migration': 'database', 'sqlite': 'database',
  'cache': 'caching', 'redis': 'caching', 'memcached': 'caching',
  'security': 'security', 'vulnerability': 'security', 'xss': 'security',
  'test': 'testing', 'unit test': 'testing', 'integration test': 'testing', 'e2e': 'testing',
  'deploy': 'deployment', 'ci/cd': 'ci-cd', 'docker': 'docker', 'pipeline': 'pipeline',
  'performance': 'performance', 'latency': 'performance', 'throughput': 'performance',
  'mcp': 'mcp', 'model context protocol': 'mcp', 'tool call': 'tool-call',
  'llm': 'llm', 'embedding': 'embedding', 'vector': 'vector-search',
  'jira': 'jira', 'ticket': 'jira', 'sprint': 'planning',
  'agent': 'multi-agent', 'orchestrat': 'orchestration', 'workflow': 'workflow',
  'langgraph': 'orchestration', 'state machine': 'state-machine',
  'architecture': 'architecture', 'design pattern': 'design-pattern',
  'refactor': 'refactoring', 'bug': 'error-pattern', 'fix': 'bugfix',
  'config': 'configuration', 'setting': 'configuration',
};

export const SYSTEM_PROMPT = `You tag knowledge entries with SPECIFIC feature names. Output ONLY JSON.

WRONG (too generic): "testing", "api-design", "configuration", "architecture", "llm", "bugfix"
RIGHT (specific features): "admin-panel-routing-fix", "llm-config-ui-dropdown", "kb-entry-auto-tagging", "jira-ticket-comment-sync"

Examples:
Content: "Fixed admin page routing where sidebar items show wrong page"
Output: {"tags":[{"tag":"admin-panel-page-routing","category":"feature","confidence":0.95,"reason":"fixes page navigation bug"}]}

Content: "Added provider dropdown and model selector to LLM configuration page"
Output: {"tags":[{"tag":"llm-config-ui","category":"feature","confidence":0.9,"reason":"new UI for LLM settings"},{"tag":"admin-portal-settings","category":"component","confidence":0.85,"reason":"part of admin portal"}]}

Content: "User asked about how ingest pipeline uses LLM for tag analysis"
Output: {"tags":[{"tag":"kb-llm-tag-analysis","category":"feature","confidence":0.9,"reason":"about auto-tagging feature"}]}

Rules: max 3 tags, lowercase-hyphenated, 3-6 words each, confidence 0-1. Return ONLY {"tags":[...]}`;
