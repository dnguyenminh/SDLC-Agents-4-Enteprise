# User Guide (UG)

## SA4E-326: Pi Prompt Compression + Role-scoped prompts per model tier

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-326 |
| Title | Pi Prompt Compression + Role-scoped prompts per model tier |
| Author | DEV Agent |
| Version | 1.0 |
| Date | 2026-09-26 |
| Status | Draft |
| Related | BRD.md, FSD.md, TDD.md, STC.md (documents/SA4E-326/) |

---

## 1. Tính năng (Features)

1. **Prompt compression** — cung cấp 2 biến thể prompt: `full` và `compressed`. Với model tier `small`, hệ thống tự chọn biến thể compressed (≤60% kích thước full) để tiết kiệm context.
2. **Model tier detection** — tự phân loại model (`small` / `medium` / `large`) theo modelId (vd: `phi-3-mini` → small, `claude-3-opus` → large). Model không xác định → fallback full variant.
3. **Role-scoped skills** — mỗi role (SM, BA, SA, DEV, QA, DevOps, UI, Security) chỉ thấy các skill liên quan (vd: SM thấy skill BRD, DEV thấy skill code, QA thấy skill test). Role không hợp lệ → fallback mặc định (không lọc).
4. **Lazy prompt loading** — discovery chỉ liệt kê metadata (<500ms với 100 templates), nội dung template chỉ đọc khi được yêu cầu (`/template` call).
5. **SYSTEM.md append (replace mode)** — khi `promptMode = 'replace'`, nội dung `SYSTEM.md` của workspace được append vào role prompt để giữ project context.

## 2. Cách dùng (Usage)

### 2.1 Đặt template prompts

```
.pi/prompts/
├── brd.md                 # biến thể FULL
├── brd.compressed.md      # biến thể COMPRESSED (small model)
└── ...
```

- Quy ước đặt tên: `{name}.md` (full), `{name}.compressed.md` (compressed). `name` chỉ gồm chữ thường, số, hyphen.
- Nguồn discovery: `.pi/prompts/` trong workspace + `~/.pi/agent/prompts/`.

### 2.2 Chọn prompt theo model tier + role

```ts
import { selectPrompt } from './pi-agent/agent-configurator';
import { PromptTemplateService } from './pi-agent/prompt-template.service';

const templateService = new PromptTemplateService(workspaceRoot);
templateService.discover();

// Small model → role prompt (compressed) + compressed template variant
const prompt = selectPrompt('phi-3-mini', 'BA', {
  templateService,
  templateName: 'ba',
  promptMode: 'replace',
  cwd: workspaceRoot,
});
```

- `selectPrompt(modelId, role, options?)`:
  - Small tier → compressed; medium/large/unknown → full.
  - Role không hợp lệ → `DEFAULT_AGENT_PROMPT` (ROLE_MISMATCH → default).
  - `promptMode: 'replace'` + `cwd` → append `SYSTEM.md`.
  - Template không tồn tại → degraded gracefully về role prompt.

### 2.3 Discovery & lazy load

```ts
const svc = new PromptTemplateService(workspaceRoot);
svc.discoverForTier('small');        // metadata only, không đọc content (no preload)
const tpl = svc.getPromptForTier('brd', 'small');  // content đọc on-demand tại đây
```

### 2.4 Role-scoped skills khi build session

```ts
import { buildResourceLoaderOptions } from './pi-agent/agent-configurator';

// skillsFilter = 'phase' → lọc skill theo role allowlist; 'all' → không lọc
const opts = buildResourceLoaderOptions({ cwd, agentDir }, 'SM', 'append', 'phase', 'phi-3-mini');
```

### 2.5 Compression API

```ts
import { compressPrompt, estimateTokenCount } from './pi-agent/prompt-compressor';

const compressed = compressPrompt(template);  // lỗi → trả về bản gốc
```

## 3. Cấu hình (Configuration)

| Item | Giá trị | Mô tả |
|------|---------|-------|
| Compression max ratio | `0.6` | Biến thể compressed ≤60% kích thước full (`COMPRESSION_MAX_RATIO`) |
| Template directories | `.pi/prompts`, `~/.pi/agent/prompts` | Nguồn discovery |
| Role allowlist | `ROLE_SKILL_IDS` (`role-scope.ts`) | Map role → skill id tokens (segment match) |
| Discovery budget | <500ms / <100 templates | BR-1 |
| Token estimate | `ceil(chars / 4)` | Heuristic `estimateTokenCount` |

### Compression algorithm (OI-326-01)

Deterministic, không dùng LLM: bỏ HTML comments → bỏ fenced example blocks (\`\`\`example) → bỏ sections "Example:" → bỏ dòng "Tip:/Note:/Hint:/See also:" → collapse whitespace. Nếu kết quả rỗng/không nhỏ hơn → trả về bản gốc (COMPRESSION_FAIL → original).

## 4. Troubleshooting

| Hiện tượng | Nguyên nhân | Xử lý |
|------------|-------------|-------|
| Luôn nhận full variant với small model | Thiếu file `.compressed.md` | Tạo `{name}.compressed.md` (NOT_FOUND → fallback full) |
| `PromptTemplateError: Invalid template name` | Tên có ký tự không hợp lệ | Chỉ dùng `[a-z0-9-]` |
| Skill biến mất | Skill id không khớp allowlist của role | Kiểm tra `ROLE_SKILL_IDS`, id match theo segment (vd `sdlc-brd-skill` → `brd`) |
| Prompt không nén nhỏ hơn | Template đã terse | Compression là best-effort; không nhỏ hơn → giữ nguyên |
