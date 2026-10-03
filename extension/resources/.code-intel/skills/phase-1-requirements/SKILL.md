---
name: phase-1-requirements
description: Phase 1 workflow — BA creates BRD with diagrams, glossary extraction, Jira attachment
---

## Prerequisites

- Jira ticket exists
- Jira status: To Do or Docs Review

## Workflow

### Step 1: Transition Jira

```
transition_issue(issue_key: "{TICKET}", transition_name: "Review Docs")
```
→ TO DO → DOCS REVIEW

### Step 2: Update Status

```json
{ "requirements": { "status": "in_progress" } }
```

### Step 2.5: Reference Analysis (MANDATORY for complex features)

**BEFORE BA writes BRD, SM MUST conduct a brief competitive/reference analysis.**

**Trigger:** Feature involves non-trivial patterns (human-in-the-loop, state machines, real-time sync, security gates, plugin systems, distributed coordination, etc.)

**Process:**
1. Identify 2-3 open-source projects that implement similar patterns
2. Web search: `"{pattern name}" site:github.com open source implementation`
3. Extract key architectural decisions from reference projects:
   - What state management approach? (in-memory vs durable)
   - What edge cases handled? (timeout, crash recovery, idempotency)
   - What escalation/fallback patterns?
   - What observability/metrics?
4. Summarize findings in `documents/{TICKET}/REFERENCE-ANALYSIS.md`:

```markdown
# Reference Analysis — {TICKET}

## Pattern: {e.g., "Tool Approval / Human-in-the-Loop"}

### Reference 1: {project name} ({url})
- Architecture: {brief}
- Key patterns: {list}
- Strengths: {list}

### Reference 2: {project name} ({url})
- Architecture: {brief}
- Key patterns: {list}
- Strengths: {list}

### Patterns to adopt in our BRD/TDD:
- [ ] {pattern 1}
- [ ] {pattern 2}
- [ ] {pattern 3}
```

5. Ingest into KB:
```
mem_ingest(
  content: "REFERENCE-ANALYSIS | ticket={TICKET} | pattern={pattern} | refs={project1, project2} | key_patterns={list}",
  type: "ARCHITECTURE",
  source: "reference-analysis/{TICKET}",
  tags: "reference,prior-art,{pattern}",
  scope: "PROJECT"
)
```

6. Pass REFERENCE-ANALYSIS.md to BA when invoking BRD creation (instruct BA to read it).

**Skip condition:** Ticket is simple CRUD, UI tweak, or small bug fix — no reference analysis needed.

### Step 3: Invoke BA Agent

```
task(
  description: "Create BRD for {TICKET}",
  prompt: "Create BRD for {TICKET}. Read REFERENCE-ANALYSIS.md if it exists (documents/{TICKET}/REFERENCE-ANALYSIS.md). MUST create draw.io diagrams (use-case.drawio + business-flow.drawio) and export PNG — load the 'drawio-diagrams' skill via the skill tool. Do not skip Step 7 (Generate Diagrams).",
  subagent_type: "ba-agent"
)
```

### Step 4: Verify Output

1. Check `documents/{TICKET}/BRD.md` exists
2. Check `documents/{TICKET}/diagrams/use-case.drawio` + `.png`
3. Check `documents/{TICKET}/diagrams/business-flow.drawio` + `.png`

If diagrams missing → invoke BA again:
```
task(
  description: "Create draw.io diagrams for BRD {TICKET}",
  prompt: "Create draw.io diagrams for BRD {TICKET}. Only create diagrams, do not recreate BRD. Load the 'drawio-diagrams' skill via the skill tool.",
  subagent_type: "ba-agent"
)
```

### Step 5: Update Status

```json
{ "requirements": { "status": "done", "file": "BRD.md", "version": 1, "completedAt": "..." } }
```

### Step 6: Attach to Jira (MANDATORY)

```
embed_images(file_path="documents/{TICKET}/BRD.md", output_path="documents/{TICKET}/BRD-embedded.md")
export_docx(file_path="documents/{TICKET}/BRD-embedded.md", file_name="BRD-v1-{TICKET}")
jira_update_issue(issue_key: "{TICKET}", fields: "{}", attachments: "documents/{TICKET}/BRD-v1-{TICKET}.docx")
```

Also attach all `.drawio` files from `documents/{TICKET}/diagrams/`.

### Step 7: Report

```
Phase 1 done — BRD.md created & attached to Jira.
Proceed to Phase 2 (Specification)?
```

Wait for user confirmation.

## Quality Gate

| # | Check | If Missing |
|---|-------|------------|
| 1 | BRD.md exists | Re-invoke BA |
| 2 | ≥3 User Stories with Acceptance Criteria | Re-invoke BA |
| 3 | Business Flow Diagram (.drawio + .png) | Invoke BA for diagrams |
| 4 | Use Case Diagram (.drawio + .png) | Invoke BA for diagrams |
| 5 | Dependencies section | Ask BA to add |
| 6 | Non-Functional Requirements | Ask BA to add |
| 7 | REFERENCE-ANALYSIS.md exists (if complex feature) | SM creates before re-invoking BA |

## Step 7.5: Domain Glossary Extraction (MANDATORY)

**After BRD is created and verified, BA MUST extract domain terms into KB as glossary entries.**

### Purpose

Establish consistent terminology across ALL agents. Every agent will `mem_search("glossary {PROJECT}")` before writing documents or code.

### Process

1. BA reads the completed BRD.md
2. Identify key domain terms:
   - Business entities (e.g., "Provider", "Scan", "Integration")
   - Technical concepts specific to the domain
   - Acronyms and abbreviations
   - Terms that could be confused with similar words
3. For EACH term, ingest a glossary entry into KB:

```
mem_ingest(
  content: "GLOSSARY | term={Term} | definition={Definition} | avoid={Bad alternatives to avoid}",
  type: "CONTEXT",
  source: "glossary/{PROJECT}",
  tags: "glossary, domain-model, {project-prefix}",
  scope: "PROJECT"
)
```

### Entry Format

```
GLOSSARY | term=Provider | definition=An external MCP server that exposes tools to the system. | avoid=server, plugin, extension, connector
```

### Rules

- Extract **minimum 5 terms** from each BRD
- Each term MUST have: term name, clear definition, list of terms to AVOID
- Terms should be specific to the project domain (not generic software terms)
- If updating an existing glossary entry, ingest with updated content

### Consumer Pattern (for ALL other agents)

All agents (TA, SA, QA, DEV, DevOps) MUST search glossary before producing output:

```
mem_search("glossary {PROJECT}")
```

Then use correct terms in all documents and code:
- Variable/class names follow glossary terms
- Document text uses glossary definitions
- Avoid using "bad alternatives" listed in glossary entries

### Verification

SM verifies after BA completes glossary extraction:
1. `mem_search("glossary {PROJECT}")` returns ≥5 entries
2. Key business entities from BRD are covered
3. No conflicting definitions

## Agent Data Access

**BA reads:** Jira ticket description, code intelligence
**BA writes:** BRD.md → ingest to KB (FULL content), Glossary entries → KB

## Template

Default: `documents/templates/BRD-TEMPLATE.md`
Override: user provides `template:path/to/custom.md`

Announce template then proceed (do not stop to ask):
```
Template: documents/templates/BRD-TEMPLATE.md (default)
Use a different template? Interrupt and call again with template:path
Continuing BRD creation...
```