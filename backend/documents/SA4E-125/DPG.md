# DPG — Deployment & CI/CD Guide

**Ticket:** SA4E-125 | **Author:** DevOps Agent | **Version:** 1.0

---

## 1. Tổng quan Release

Triển khai kiến trúc pipeline v2→v6 cho LangGraph engine: thay hardcoded routing bằng data-driven VM với `currentPhaseIndex` và `pipelineDefinition`.

**Modules ảnh hưởng:** `pipeline/edges.ts`, `pipeline/sdlc-graph.ts`, `core/state.ts`, `core/state-types.ts`, `agents/registry.ts`, `agents/pipeline-extractor.ts`, `engine/langgraph-engine.ts`, `agents/approval-node.ts`.

**Backward compatibility:** v2→v5 là subset của v6.

---

## 2. CI/CD Pipeline Changes

### Build

```powershell
npm run build
```

Không có dependency mới. `zod` đã được dùng.

### Test Phases

| Phase | Command | Scope |
|-------|---------|-------|
| Unit | `npm run test:unit` | Pure functions: `resolvePhaseIndex`, `routeFromSm`, `routeAfterAdvance` |
| Integration | `npm run test:integration` | Graph routing end-to-end |
| E2E | `npm run test:e2e` | Full pipeline scenarios với mock state |

### GitHub Actions Workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on: { pull_request: { branches: [main] }, push: { branches: [main] } }
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run lint
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run test:unit
  test-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run test:integration
  build:
    needs: [lint, test-unit, test-integration]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
  test-e2e:
    needs: [build]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run test:e2e
```

**Sequence:** lint → test:unit → test:integration → build → (optional) test:e2e

---

## 3. Deployment Steps

### Merge & Version

```powershell
npm version patch          # v1.x.x → v1.y.z
git push origin main --tags
```

### Tag Release

```powershell
git tag v1.y.z && git push origin v1.y.z
```

### Publish VS Code Extension

```powershell
npm install -g @vscode/vsce
vsce package                # Tạo .vsix
vsce publish                # Public lên marketplace
```

**Extension ID:** `kiro-sdlc-pipeline`

### Post-deploy Verification

1. **Sanity check** — Start pipeline mới, verify normal flow (v2)
2. **Hot-swap test** — Sửa `.kiro/agents/*.md`, verify sandbox validation
3. **Orphan test** — Xoá phase hiện tại, verify pause + skip
4. **Barrier test** — Skip orphan phase, verify barrier trong `chatHistory`

---

## 4. Rollback Plan

### Immediate Rollback

```powershell
git revert <commit-sha> && git push origin main
```

### State Compatibility

Checkpoints v6 **không** forward-compatible với v5. Rollback cần xoá checkpoints:

```powershell
Remove-Item -Recurse -Force .kiro/checkpoints/
```

### Feature Flag

Thêm `.kiro/config.json` để toggle giữa v5 và v6:

```json
{ "pipelineVersion": "v6" }
```

Mặc định `v6`. Set `"v5"` để quay về routing cũ.

---

## 5. Monitoring & Alerting

### Logging

Log `resolvePhaseIndex()` ở mức `info`:

```typescript
logger.info(`resolvePhaseIndex: idx=${idx}, realigned=${realigned}, orphan=${idx === -1}`);
```

### Metrics

| Metric | Type | Mô tả |
|--------|------|-------|
| `pipeline_pause_count` | Counter | Số lần pipeline pause vì orphan |
| `hot_swap_success_rate` | Gauge | Tỷ lệ hot-swap thành công |
| `barrier_injection_count` | Counter | Số lần barrier được inject |

### Alerts

Không cần alert mới. Pipeline failure alerts hiện tại覆盖 v2→v6.

---

## 6. Configuration Changes

**Không breaking changes.** File `.kiro/agents/*.md` hiện tại hoạt động bình thường.

Optional config mới trong `.kiro/config.json`:

```json
{ "pipelineVersion": "v6" }
```

Default `"v6"`. Nếu không có config, pipeline vẫn chạy v6.

---

## 7. Database / State Migration

**Không database changes.** State in-memory + filesystem checkpoints.

Old checkpoints (với string-based `currentPhase`) được read-compatible: `resolvePhaseIndex()` tự động fallback bằng `findIndex()` khi `phase.id` không khớp.
