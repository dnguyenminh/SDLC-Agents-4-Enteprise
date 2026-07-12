# GAPS.md — Conversion Gap Analysis

## 1. Hook Event Gaps

### fileEdited — NOT SUPPORTED on any platform

| Hook | Purpose | Workaround |
|------|---------|------------|
| code-index-edit.json | Incremental index on source edit | PostToolUse with write/edit matcher |
| validate-drawio-edit.kiro.hook | Validate .drawio XML on edit | PostToolUse with write/edit matcher |
| validate-drawio-docs.kiro.hook | Check no mermaid in docs | PostToolUse with write/edit matcher |
| mem-sync-code-edit.json | mem_sync_code on source edit | PostToolUse with write/edit matcher |

### fileCreated — NOT SUPPORTED

| Hook | Purpose | Workaround |
|------|---------|------------|
| code-index-create.json | Index new source file | PostToolUse with create matcher |
| check-drawio-layout.kiro.hook | Auto-layout on .drawio creation | PostToolUse with create matcher |
| validate-drawio-xml.kiro.hook | Validate .drawio on creation | PostToolUse with create matcher |

### fileDeleted — NOT SUPPORTED

| Hook | Purpose | Workaround |
|------|---------|------------|
| code-index-delete.json | Remove from index | Periodic full re-index |

### runTool — NOT SUPPORTED

| Hook | Purpose | Workaround |
|------|---------|------------|
| mem-sync-code-edit.json | Invoke mem_sync_code directly | Echo reminder in PostToolUse |

## 2. Workaround: External File Watcher

```bash
npx chokidar '**/*.kt' '**/*.ts' '**/*.drawio' -c 'npx ts-node .analysis/code-intelligence/scripts/src/incremental-indexer.ts --files {path}'
```

## 3. askAgent → command Limitation

All platforms only support `command` hooks. Kiro's `askAgent` (re-invoke AI with prompt) converted to echo statements as reminders.

Affected: stream-user-prompt, stream-agent-response, validate-drawio-*, check-drawio-layout, drawio-kb-lookup, code-index-full

## 4. Conditional Steering

| Platform | Mechanism | Support |
|----------|-----------|---------|
| Claude Code | paths: frontmatter | ✅ Full |
| GitHub Copilot | applyTo: frontmatter | ✅ Full |
| Antigravity | N/A (all in GEMINI.md) | ⚠️ Always-on only |

## 5. Manual Activation

Kiro's `inclusion: manual` has no equivalent. All manual steering merged into always-on files.

## 6. Summary Table

| Feature | Claude | Copilot | Antigravity | Codex |
|---------|--------|---------|-------------|-------|
| Always-on steering | ✅ | ✅ | ✅ | ✅ |
| Conditional steering | ✅ | ✅ | ⚠️ | ✅ |
| preToolUse hooks | ✅ | ✅ | ✅ | ❌ |
| postToolUse hooks | ✅ | ✅ | ✅ | ❌ |
| promptSubmit hooks | ✅ | ✅ | ✅ | ❌ |
| agentStop hooks | ✅ | ✅ | ✅ | ❌ |
| fileEdited hooks | ❌ | ❌ | ❌ | ❌ |
| fileCreated hooks | ❌ | ❌ | ❌ | ❌ |
| fileDeleted hooks | ❌ | ❌ | ❌ | ❌ |
| askAgent type | ⚠️ echo | ⚠️ echo | ⚠️ echo | ❌ |
| runTool type | ❌ | ❌ | ❌ | ❌ |
| Manual activation | ❌ always-on | ❌ always-on | ❌ always-on | ❌ always-on |
