**TÀI LIỆU NÂNG CẤP MODULE BACKEND**  
**SDLC-Agents-4-Enteprise + Evolver (GEP Self-Evolution)**

**Phiên bản:** 1.0  
**Ngày:** 14/07/2026  
**Tác giả:** Grok (dựa trên review repo EvoMap/evolver)  
**Mục đích:** Hướng dẫn chi tiết nâng cấp backend thành **self-evolving SDLC orchestration layer**.

---

### 1. Giới thiệu

Repo **EvoMap/evolver** cung cấp engine tự tiến hóa cho AI agents sử dụng **GEP (Genome Evolution Protocol)** với **Genes** (chiến lược compact), **Capsules** (fix đã validate), và **EvolutionEvents** (audit trail).  

Backend hiện tại của **SDLC-Agents-4-Enteprise** (Node.js/TS, Hono, LangGraph, SQLite+ONNX KB, MCP tools) rất phù hợp để tích hợp, biến hệ thống từ “multi-agent pipeline” thành **self-improving enterprise SDLC platform**.

**Mục tiêu nâng cấp**:
- Tự động extract lessons từ runs → Genes/Capsules.
- Auditable evolution + rollback.
- Giảm token usage, tăng success rate qua reusable assets.
- Tích hợp sâu với Kiro/extension hiện có.

---

### 2. Phân tích hiện trạng & Gap

**Điểm mạnh hiện tại**:
- Pipeline data-driven (v1.5.0).
- KB mạnh (memory tools, code intel, masking).
- Orchestration, web tools, admin portal.
- Multi-IDE support.

**Gap so với Evolver**:
- Evolution còn ad-hoc (steering files, guardrails).
- Chưa có cơ chế compact reusable “genes”.
- Audit trail chưa tập trung.
- Chưa tự động prompt optimization dựa trên runtime signals.

---

### 3. Kiến trúc mục tiêu sau nâng cấp

```
backend/
├── src/
│   ├── evolution/              # Mới: GEP engine
│   │   ├── GeneStore.ts
│   │   ├── CapsuleStore.ts
│   │   ├── EvolutionOrchestrator.ts
│   │   ├── gep-protocol.ts
│   │   └── events/
│   ├── modules/memory/         # Mở rộng
│   ├── pipeline/               # Inject GEP prompts
│   ├── api/routes/evolution.ts # Endpoints mới
│   └── ...
├── memory/                     # Evolver-style
├── .code-intel/evolution/      # Genes, Capsules, Events
├── evolver-integration.md      # Hướng dẫn CLI
```

**Công nghệ bổ sung**:
- `@evomap/evolver` (CLI hoặc source).
- child_process / proxy cho integration.
- Zod schemas cho GEP.
- Optional: EvoMap hub connection.

---

### 4. Các bước triển khai (Roadmap)

#### **Phase 1: Integration cơ bản (1-2 ngày)**
1. Cài evolver: `npm install -g @evomap/evolver`
2. Setup hooks: `evolver setup-hooks --platform=kiro`
3. Tạo folder `memory/` và config `.env`
4. Thêm MCP tool: `evolver_run`, `evolver_review`
5. Trigger sau mỗi pipeline phase/failure trong LangGraph.

#### **Phase 2: Native GEP Layer (3-5 ngày)**
- Triển khai `GeneStore` & `CapsuleStore` trong SQLite.
- `EvolutionOrchestrator`:
  - Scan logs/signals.
  - Select/generate Gene.
  - Emit GEP prompt → inject vào agent context.
  - Ghi `EvolutionEvent`.
- Strategy presets (balanced, repair-only…).
- Mutation & PersonalityState.

#### **Phase 3: Advanced Features (1 tuần)**
- Evolution Dashboard trong Admin Portal.
- Gene sharing nội bộ / EvoMap network.
- Auto-consolidate successful patterns → Gene.
- Guardrails + circuit breaker nâng cao.
- Testing: Evolution sandbox.

#### **Phase 4: Production & Monitoring**
- Git integration cho rollback.
- Metrics: token savings, success rate before/after genes.
- Documentation & changelog.

---

### 5. Chi tiết Module Mới

**EvolutionOrchestrator** (core):
- `scanSignals()`: Từ KB + logs.
- `selectGene(context)`: Similarity search (ONNX).
- `generateGEPPrompt(gene)`: Protocol-bound.
- `applyToPipeline(phase)`: Inject vào LangGraph state.
- `recordEvent(outcome)`.

**API Endpoints mới**:
- `POST /api/evolve` — Trigger manual/ background.
- `GET /api/evolution/history`
- `GET /api/genes`
- `POST /api/capsules/apply`

**Memory Extensions**:
- `mem_promote_to_gene`
- `mem_evolution_graph`

---

### 6. Lợi ích & Metrics đo lường

- **Performance**: Tăng success rate (theo evolver research: +9-10% trên tasks phức tạp).
- **Cost**: Giảm token qua gene reuse (có thể >60% theo benchmarks).
- **Maintainability**: Audit trail đầy đủ, dễ rollback.
- **Scalability**: Share Genes giữa teams/projects.
- **Enterprise Ready**: Compliance, governance, traceable changes.

**KPIs**:
- Số Genes/Capsules created per week.
- Avg token per pipeline before/after.
- Evolution success rate.

---

### 7. Rủi ro & Mitigation

- **Overhead**: Bật/tắt qua env `EVOLUTION_ENABLED`.
- **Dependency**: Giữ evolver CLI optional, fallback native.
- **Security**: Validate GEP inputs, giữ localhost.
- **Complexity**: Bắt đầu nhỏ, incremental.

---

### 8. Hành động tiếp theo & Checklist

- [ ] Clone & test evolver trong repo.
- [ ] Tạo branch `feature/gep-evolution`.
- [ ] Implement Phase 1.
- [ ] Update package.json dependencies.
- [ ] Thêm tests cho evolution module.
- [ ] Update README root + backend/README.md.
- [ ] Document Gene examples cho SDLC phases (BA, DEV, QA…).

**Tài liệu tham khảo**:
- https://github.com/EvoMap/evolver
- https://evomap.ai/wiki (GEP Protocol)
- Paper: arXiv:2604.15097

---

**File này nên lưu tại**: `backend/docs/UPGRADE-GEP-EVOLVER.md`

Bạn muốn tôi xuất file Markdown hoàn chỉnh, thêm diagram (text-based hoặc gợi ý draw.io), hoặc viết code mẫu cho một module cụ thể (ví dụ: EvolutionOrchestrator.ts)? Hãy cho biết để tôi hỗ trợ tiếp!