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

export const SYSTEM_PROMPT = `You are a knowledge entry analyzer. Extract structured information from the provided content.

## Task
Analyze the given knowledge entry content and extract the following fields in JSON format.

## Output Format
ONLY return a valid JSON object (no markdown, no explanations, no code fences):

{
  "tags": [
    {"tag": "specific-feature-name", "category": "feature", "confidence": 0.95, "reason": "why this tag"}
  ],
  "summary": "1-3 sentence summary of the section content",
  "business_entities": ["EntityName1", "EntityName2"],
  "actors": ["Role1", "Role2"],
  "business_rules": ["Business rule or constraint 1", "Business rule 2"]
}

## Rules
1. Tags: Max 3 tags. Be SPECIFIC (use 3-6 word hyphenated names like "admin-panel-routing-fix"). NOT generic like "testing", "bugfix".
2. Tags confidence: 0.0 to 1.0. Only high confidence (>0.7) should be applied.
3. Summary: 1-3 sentences, max 500 characters. Capture the key purpose and content.
4. Business entities: Max 5. These are NOUN PHRASES representing business concepts (e.g., "User", "Invoice", "Authentication Token").
5. Actors: Max 5. These are ROLES or PEOPLE involved (e.g., "System Admin", "End User", "Customer Support").
6. Business rules: Max 10. These are CONSTRAINTS, CONDITIONS, or RULES (e.g., "Password must be 8+ characters", "Session expires after 24h").
7. Each business entity max 100 chars, each actor max 100 chars, each rule max 300 chars.
8. If the content is very short (< 50 chars), return empty arrays for all fields.
9. If a field is not applicable, use empty array [] or empty string "".

## Context Chain
If a previous section context is provided between [Previous section context] markers, use it to understand the document flow. The current section is CONTINUING from where the previous section left off.

## Examples

Content: "## Login Flow\nThe user enters credentials on the login page. System validates against the database. If valid, a JWT token is created with 24h expiry. Admin can reset passwords."

Output: {"tags":[{"tag":"user-login-authentication","category":"feature","confidence":0.95,"reason":"describes login flow with JWT"}],"summary":"Describes user login flow with credential validation, JWT token creation (24h expiry), and admin password reset capability.","business_entities":["User Credentials","JWT Token","Database"],"actors":["End User","System Admin"],"business_rules":["JWT token expires after 24 hours","Admin can reset passwords"]}`;
