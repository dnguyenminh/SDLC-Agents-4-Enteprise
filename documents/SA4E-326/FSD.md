
<!-- TA enrichment -->

## 12. Technical Enrichment (TA)

### 12.1 Technology Choices
- **Stack**: TypeScript, `extension/src/pi-agent/agent-configurator.ts`, `prompt-template.service.ts`
- **Template storage**: `.pi/prompts/*.md` full & compressed variants
- **Selection logic**: model tier detection → template variant → role filter

### 12.2 API Contracts (Detailed)
| Component | Method | Input | Output | Errors |
|-----------|--------|-------|--------|--------|
| PromptTemplateService | discover(modelTier) | tier: small|medium|large | templatePath:string | NOT_FOUND → fallback full |
| PromptTemplateService | compress(template) | template:string | compressed:string | COMPRESSION_FAIL → return original |
| AgentConfigurator | selectPrompt(modelId, role) | modelId, role | prompt:string | ROLE_MISMATCH → default |

Example:
```json
{
  "modelId": "phi-3-mini",
  "modelTier": "small",
  "role": "developer",
  "promptVariant": "compressed"
}
```

### 12.3 Data Model Details
- Prompt metadata: modelTier, roleScope, variant {full, compressed}, tokenCount
- Role-scoped skill list per phase: array of skillIds
- No DB; files on disk, loaded on startup

### 12.4 Integration Specifications
- **agent-configurator.ts** → PromptTemplateService
- **Skill Registry**: filter by phase & model tier
- Lazy loading: templates loaded on /template call, <500ms discovery
- Logging: prompt size metrics to diagnostics

### 12.5 Non-Functional Requirements (Quantified)
- Prompt discovery <500ms p95
- Compressed prompt ≤60% size of full
- Memory footprint <5MB for templates

### 12.6 Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Compressed prompt loses context | A/B test quality, fallback to full |
| Role filter too aggressive | Configurable allowlist per role |

### 12.7 Open Issues
- OI-326-01: Define compression algorithm (remove examples vs summarise) — Owner: TA, Due: 2026-10-15
