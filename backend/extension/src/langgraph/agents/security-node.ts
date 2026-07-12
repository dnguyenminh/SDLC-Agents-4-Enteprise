/**
 * SecurityNode — KSA-210, KSA-242
 * Security review agent node. Performs security analysis on
 * design documents, dependencies, code patterns, and configuration.
 * Supports scan type specialization for security-audit subgraph.
 */

import { BaseNode } from "../core/base-node";
import { PipelineState, AgentOutput } from "../core/state";

/** Scan type for specialized security audit subgraph */
type SecurityScanType = "generic" | "dependency" | "code_pattern" | "config";

/** Template path for Security Report */
const SECURITY_REPORT_TEMPLATE = "documents/templates/SECURITY-REPORT-TEMPLATE.md";

const SECURITY_SYSTEM_PROMPT_FALLBACK = `You are a Security Engineer agent for an SDLC pipeline.
Your role is to review designs and code for security vulnerabilities.

Review areas:
- Authentication and authorization design
- Input validation and sanitization
- SQL injection, XSS, CSRF prevention
- Secrets management (no hardcoded credentials)
- API security (rate limiting, CORS, JWT handling)
- Data encryption (at rest and in transit)
- Dependency vulnerabilities (known CVEs)
- OWASP Top 10 compliance
- Least privilege principle
- Secure error handling (no information leakage)

Report findings with severity (Critical/High/Medium/Low) and remediation steps.
Follow the provided Security Report template structure.`;

export class SecurityNode extends BaseNode {
  private readonly scanType: SecurityScanType;

  constructor(
    nodeId: string,
    mcpBridge: import("../core/mcp-bridge").McpBridge,
    streamHandler: import("../core/stream-handler").StreamHandler,
    llmProvider?: import("../core/llm-provider").LlmProvider,
    scanType: SecurityScanType = "generic"
  ) {
    super(nodeId, mcpBridge, streamHandler, llmProvider);
    this.scanType = scanType;
  }

  async execute(state: PipelineState): Promise<Partial<PipelineState>> {
    this.streamHandler.emitToken(
      this.nodeId,
      `[Security] Reviewing security for ${state.ticketKey} (scope: ${this.scanType})...`,
      state.currentStreamId
    );

    const llmAvailable = await this.isLlmAvailable();
    let result: string;

    if (llmAvailable) {
      const userPrompt = this.buildPrompt(state);
      const systemPrompt = await this.loadSystemPromptWithSteering("security-agent", SECURITY_SYSTEM_PROMPT_FALLBACK);
      result = await this.callLlmStreamFull(systemPrompt, userPrompt, state);
    } else {
      result = await this.callMcp("invoke_sub_agent", {
        name: "security-agent",
        prompt: `Security review cho ${state.ticketKey}. Scope: ${this.scanType}. Template: ${SECURITY_REPORT_TEMPLATE}`,
      });
    }

    const output: AgentOutput = {
      nodeId: this.nodeId,
      content: result,
      timestamp: new Date().toISOString(),
      metadata: { phase: state.currentPhase, action: "security_review", scanType: this.scanType, usedLlm: llmAvailable },
    };

    return { agentOutputs: [output] };
  }

  private buildPrompt(state: PipelineState): string {
    switch (this.scanType) {
      case "dependency":
        return this.buildDependencyPrompt(state);
      case "code_pattern":
        return this.buildCodePatternPrompt(state);
      case "config":
        return this.buildConfigPrompt(state);
      default:
        return this.buildGenericPrompt(state);
    }
  }

  private buildDependencyPrompt(state: PipelineState): string {
    return `Perform DEPENDENCY VULNERABILITY SCAN for ${state.ticketKey}.

1. Search for dependency manifest files: package.json, pom.xml, build.gradle, requirements.txt, go.mod, Cargo.toml, etc.
2. Check each dependency for known CVEs (Common Vulnerabilities and Exposures)
3. Flag outdated packages with security patches available
4. Check for transitive dependency vulnerabilities
5. Verify dependency integrity (no tampered packages)
6. Report findings with CVE IDs and remediation (update to version X)

TEMPLATE: ${SECURITY_REPORT_TEMPLATE}

Focus ONLY on dependency vulnerabilities. Do NOT review code or config in this scan.`;
  }

  private buildCodePatternPrompt(state: PipelineState): string {
    return `Perform CODE SECURITY PATTERN SCAN for ${state.ticketKey}.

Search code for these anti-patterns:
1. SQL injection: string concatenation in queries, unsanitized input to DB
2. XSS: unescaped user input in HTML/JS output, innerHTML usage
3. Hardcoded secrets: passwords, API keys, tokens in source code
4. Command injection: exec(), spawn() with user input
5. Path traversal: unsanitized file paths
6. Insecure deserialization: eval(), unsafe JSON parsing
7. Missing input validation: no sanitization on user input
8. Weak cryptography: MD5, SHA1, hardcoded IVs
9. Insecure randomness: Math.random() for security purposes
10. Race conditions: shared state without synchronization

TEMPLATE: ${SECURITY_REPORT_TEMPLATE}

Focus ONLY on code-level anti-patterns. Report file path and line where possible.`;
  }

  private buildConfigPrompt(state: PipelineState): string {
    return `Perform CONFIGURATION SECURITY SCAN for ${state.ticketKey}.

Check:
1. Dockerfiles: root user, exposed ports, COPY --from integrity
2. CI/CD configs: secret injection, pipeline permissions
3. Environment files: .env, secrets storage, encryption at rest
4. Web server config: CORS settings, CSP headers, HSTS
5. TLS/SSL: certificate validity, protocol versions
6. Database config: authentication, encryption, network exposure
7. Cloud infra: IAM roles, security groups, bucket policies
8. API gateway: rate limiting, authentication, WAF rules
9. Logging config: PII in logs, log retention
10. Dependency lockfiles: integrity verification

TEMPLATE: ${SECURITY_REPORT_TEMPLATE}

Focus ONLY on configuration and infrastructure security.`;
  }

  private buildGenericPrompt(state: PipelineState): string {
    return `Perform security review for ${state.ticketKey}.

TEMPLATE: ${SECURITY_REPORT_TEMPLATE}

TDD: ${state.documents.tdd?.path || "documents/" + state.ticketKey + "/TDD.md"}
FSD: ${state.documents.fsd?.path || "documents/" + state.ticketKey + "/FSD.md"}

Review the design for:
1. Authentication/Authorization gaps
2. Input validation completeness
3. Injection vulnerabilities (SQL, XSS, command)
4. Secrets management approach
5. API security (rate limits, CORS, tokens)
6. Data protection (encryption, PII handling)
7. Error handling (no info leakage)
8. Dependency security

Report each finding with:
- Severity: Critical/High/Medium/Low
- Location: which section/component
- Description: what the issue is
- Remediation: how to fix`;
  }
}
