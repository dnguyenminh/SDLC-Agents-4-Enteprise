## Mục tiêu
Đồng bộ tất cả agent files dưới `conversions/` với source `.kiro/agents/*.md` (Kiro agent chuẩn).

## Tình trạng hiện tại (đã verify)

| Platform | Pattern | Sync vs source | Hành động |
|---|---|---|---|
| claude-code | YAML FM + full body | ✅ IDENTICAL (realDiff=0) | Không đụng |
| github-copilot | YAML FM + full body | ✅ IDENTICAL (realDiff=0) | Không đụng |
| antigravity | YAML FM + full body | ✅ IDENTICAL (realDiff=0) | Không đụng |
| **codex-openai** | Markdown wrapper + body **rút gọn** (~80-124 dòng) | ❌ LỆCH — body tự biên soạn, thiếu security phases | **Chuyển sang full-body** |
| **opencode** | YAML FM (`prompt: \|`) + body **rút gọn** (~50-77 dòng) | ❌ LỆCH — body tự biên soạn, thiếu security phases | **Chuyển sang full-body** |

Source `.kiro/agents/` mới chỉ `sm-agent.md` thay đổi (+Role Separation, +phases 3.7/4.5/5.7/6.3/6.7), nhưng codex/opencode dùng body rút gọn tự biên soạn nên **lệch toàn bộ 9 agents** — không chỉ sm.

## Phạm vi thay đổi: 18 files (9 agents × 2 platforms)

### 1. Codex-openai (9 files: `conversions/codex-openai/agents/*.md`)
Pattern mới — markdown wrapper (giữ native style của Codex vì không hỗ trợ subagent) + **full body Kiro**:
```markdown
# {Agent Display Name} ({ABBREV})

## Description

{description từ .kiro/agents/*.json — source of truth}

## Tools

- {tools từ JSON}
- MCP: find_tools, execute_dynamic_tool, mem_search, mem_ingest, stream_write_file, agent_log

---

## Prompt

{FULL BODY từ .kiro/agents/{ag}.md — strip frontmatter, giữ nguyên 100%}
```

### 2. Opencode (9 files: `conversions/opencode/.opencode/agents/*.md`)
Pattern mới — YAML frontmatter + **body trực tiếp sau `---`** (bỏ `prompt: |` block scalar vì body quá dài 504-1498 dòng):
```markdown
---
description: {description từ .kiro/agents/*.json — source of truth}
mode: subagent
permission:
  edit: allow
  bash: allow
  read: allow
  glob: allow
  grep: allow
  websearch: allow
  webfetch: allow
---

{FULL BODY từ .kiro/agents/{ag}.md — strip frontmatter, giữ nguyên 100%}
```

## Nguồn dữ liệu
- **Body**: strip YAML frontmatter từ `.kiro/agents/{ag}.md` (giữ body 100% nguyên vẹn — đã verify pattern này là chuẩn claude/copilot/antigravity dùng).
- **Description**: từ `.kiro/agents/*.json` (single source of truth, đồng nhất với 3 platforms kia).
- **Tools**: từ `.kiro/agents/*.json`.

Mapping agent → display name / abbrev:
| Agent | Display | Abbrev |
|---|---|---|
| sm-agent | Scrum Master Agent | SM |
| ba-agent | Business Analyst Agent | BA |
| ta-agent | Technical Architect Agent | TA |
| sa-agent | Solution Architect Agent | SA |
| qa-agent | QA Engineer Agent | QA |
| dev-agent | Developer Agent | DEV |
| devops-agent | DevOps Engineer Agent | DevOps |
| ui-agent | UI/UX Designer Agent | UI |
| security-agent | Security Expert Agent | Security |

## Thứ tự thực hiện
1. Codex-openai: 9 files (sm → ba → ta → sa → qa → dev → devops → ui → security)
2. Opencode: 9 files (cùng thứ tự)

Mỗi file: đọc `.kiro/agents/{ag}.md` + `.kiro/agents/{ag}.json` → strip FM → build file mới theo pattern platform → ghi đè.

## Không thay đổi
- 3 platforms claude-code/copilot/antigravity (đã sync, user xác nhận để nguyên whitespace).
- `conversions/codex-openai/agents/AGENTS.md` và `conversions/codex-openai/AGENTS.md` (root index — có bảng SDLC Phases riêng, sẽ được cập nhật bảng phases trong bước phụ nếu cần).
- `conversions/opencode/AGENTS.md` (root index).

## Verify sau khi hoàn thành
- Script PowerShell: strip FM từng file codex/opencode → so body với `.kiro/agents/{ag}.md` → kỳ vọng realDiff=0 cho cả 18 files.
- Kiểm tra frontmatter parse hợp lệ (YAML cho opencode, markdown headings cho codex).