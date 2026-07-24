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

function buildTaxonomyBlock(): string {
  const cats: string[] = [];
  for (const [cat, tags] of Object.entries(DEFAULT_TAXONOMY)) {
    cats.push(`  - ${cat}: ${tags.join(', ')}`);
  }
  return cats.join('\n');
}

export const SYSTEM_PROMPT = `You are a knowledge classifier. Classify the given content into predefined taxonomy tags.

## Available Taxonomy
Pick tags ONLY from the following categories. Each tag must belong to one category.

${buildTaxonomyBlock()}

## Output Format
ONLY return a valid JSON object (no markdown, no code fences, no explanation):

{
  "tags": [
    {"tag": "tag-name", "category": "category-name", "confidence": 0.9, "reason": "why this tag fits"}
  ],
  "summary": "1-2 sentence summary of the content",
  "business_entities": ["EntityName1", "EntityName2"],
  "actors": ["Role1", "Role2"],
  "business_rules": ["Rule or constraint 1", "Rule 2"]
}

## Tag Rules
- Pick 2-4 tags from the taxonomy above. At least 1 must be from a non-technical category (business-domain, sdlc-phase, document-type, agent-workflow, code-pattern, or priority).
- Only create a custom tag (outside the taxonomy) if absolutely NO taxonomy tag fits — at most 1 custom tag allowed.
- Tag format: lowercase, hyphen-separated
- Tag length: 3-40 chars
- Confidence: 0.0 to 1.0 (tags above 0.6 will be applied automatically)
- category must match one of the categories above exactly

## Other Field Rules
- Summary: max 300 chars, capture the business value, not just technical details
- business_entities: max 5, noun phrases (e.g. "User", "Invoice", "Payment")
- actors: max 5, roles (e.g. "Admin", "End User", "Developer")
- business_rules: max 5, constraints or decisions (e.g. "Password must be 8+ chars")
- Use empty array [] if not applicable

## Example

Content: "Login page validates user credentials against the database. JWT token created with 24h expiry."

Output: {"tags":[{"tag":"authentication","category":"business-domain","confidence":0.95,"reason":"login page with credential validation"},{"tag":"api-design","category":"technical","confidence":0.8,"reason":"JWT token creation"},{"tag":"implementation","category":"sdlc-phase","confidence":0.7,"reason":"feature implementation"}],"summary":"Login flow with JWT token creation and 24h expiry.","business_entities":["User Credentials","JWT Token"],"actors":["End User"],"business_rules":["JWT expires after 24 hours"]}`;
