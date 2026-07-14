Dưới đây là tài liệu thiết kế nâng cấp chi tiết, **đã được hiệu chỉnh** để loại bỏ hoàn toàn các đề xuất hardcode agent, thay vào đó là giải pháp tích hợp động, xuyên suốt dựa trên kiến trúc **Phase-based** hiện có của bạn.

---

# TÀI LIỆU THIẾT KẾ NÂNG CẤP HỆ THỐNG
## Tích hợp Self-Evolution Engine (GEP - Genome Evolution Protocol) 
## Cho Backend của SDLC-Agents-4-Enterprise

**Phiên bản:** 2.0 (Dynamic Integration)  
**Ngày:** 14/07/2026  
**Tác giả:** Solution Architect

---

### 1. Mục tiêu chiến lược

Nâng cấp backend từ một hệ thống **pipeline tĩnh (configuration-driven)** lên một **hệ thống tự tiến hóa (self-evolving)** bằng cách tích hợp **GEP (Genome Evolution Protocol)** từ dự án [Evolver](https://github.com/EvoMap/evolver).

**Lợi ích cốt lõi:**
- 🧠 **Tự học từ kinh nghiệm**: Agent cải thiện chất lượng đầu ra sau mỗi lần chạy dựa trên phản hồi (thành công/thất bại).
- 💰 **Tối ưu Token Cost**: Reasoning dài được "nén" thành các **Gene** và **Capsule** tái sử dụng, giúp giảm chi phí về lâu dài.
- 📊 **Khả năng kiểm toán**: Toàn bộ quá trình tiến hóa được ghi lại dưới dạng sự kiện (Events).
- 🔧 **Không phá vỡ kiến trúc hiện tại**: Giữ nguyên cơ chế `index-based routing` và `dynamic pipeline`.

---

### 2. Nguyên tắc thiết kế (Design Principles)

Để đảm bảo tính tương thích và linh hoạt, dự án nâng cấp tuân thủ các nguyên tắc sau:

1.  **Không hardcode Agent**: Tuyệt đối **không** tạo các thư mục cứng như `BA/`, `SA/`, `DEV/`. Agent vẫn là các thực thể được cấu hình động trong Database/Config.
2.  **Gắn Gene với Phase ID**: Gene (bộ gene tiến hóa) sẽ được lưu trữ và tra cứu dựa trên `Phase ID` (hoặc `Agent Config ID`) của pipeline, không gắn với tên class.
3.  **Tính xuyên suốt (Cross-cutting)**: Module Evolution hoạt động như một Service độc lập, được inject vào `PipelineEngine` thay vì nhúng sâu vào từng agent.
4.  **Mở rộng Tool Router**: Các chức năng tiến hóa được expose dưới dạng các MCP Tools mới trong module `tool-router` hoặc `memory`, cho phép bất kỳ phase nào cũng có thể gọi.

---

### 3. Kiến trúc tổng thể (Proposed Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT / UI                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API GATEWAY (Hono)                          │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE ENGINE                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │    PhaseExecutor (SỬA ĐỔI)                              │  │
│  │  1. Lấy phase config (dynamic)                         │  │
│  │  2. [MỚI] Inject Gene từ Evolution Service             │  │
│  │  3. Chạy Agent Runtime với context đã được cải tiến    │  │
│  │  4. [MỚI] Ghi nhận kết quả cho Evolution               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│   TOOL ROUTER   │  │  MCP SERVER     │  │  EVOLUTION SERVICE   │
│  (60+ tools)    │  │  (Code-Intel)   │  │      [MỚI]          │
└─────────────────┘  └─────────────────┘  └──────────────────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER (SQLite)                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │  Pipelines    │  │  Checkpoints  │  │  Genes & Capsules │  │
│  │  (Configs)    │  │  (States)     │  │     [MỚI]         │  │
│  └───────────────┘  └───────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. Chi tiết kỹ thuật (Technical Specifications)

#### 4.1. Tạo Module Evolution (Độc lập)

Tạo thư mục mới `backend/src/evolution/` với các thành phần:

```typescript
// backend/src/evolution/types.ts
export interface IGene {
  id: string;
  phaseId: string;          // Khóa chính để tra cứu
  version: number;
  compressedPatterns: string; // JSON chứa knowledge đã được distill
  capsuleRef: string | null;  // Tham chiếu tới Capsule
  performanceScore: number;
  createdAt: Date;
  parentGeneId: string | null;
}

export interface IEvolutionEvent {
  id: string;
  phaseId: string;
  action: 'EVOLVE' | 'PROMOTE' | 'ROLLBACK';
  beforeScore: number;
  afterScore: number;
  metadata: Record<string, any>;
}
```

#### 4.2. Lưu trữ (Database Schema)

Thêm vào SQLite (WAL mode) các bảng sau:

```sql
-- Bảng lưu Gene
CREATE TABLE genes (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,          -- Gắn với phase cụ thể
  version INTEGER DEFAULT 1,
  compressed_patterns TEXT NOT NULL, -- Gene data (JSON)
  capsule_ref TEXT,
  performance_score REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  parent_gene_id TEXT,
  FOREIGN KEY (parent_gene_id) REFERENCES genes(id)
);
CREATE INDEX idx_genes_phase ON genes(phase_id);

-- Bảng lưu lịch sử tiến hóa (Audit Trail)
CREATE TABLE evolution_events (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL,
  action TEXT NOT NULL,            -- EVOLVE, PROMOTE, ROLLBACK
  before_score REAL,
  after_score REAL,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_phase ON evolution_events(phase_id);
```

#### 4.3. Sửa đổi PipelineEngine (Điểm tích hợp chính)

Sửa file `backend/src/engine/PipelineEngine.ts` (hoặc `PhaseExecutor`) để inject Gene:

```typescript
// backend/src/engine/PhaseExecutor.ts (SỬA ĐỔI)
import { EvolutionService } from '../evolution/EvolutionService';

export class PhaseExecutor {
  constructor(
    private evolutionService: EvolutionService,
    private toolRouter: ToolRouter
  ) {}

  async execute(phaseIndex: number) {
    // 1. Lấy config phase (vẫn là cấu hình động, không hardcode)
    const phaseConfig = await this.pipelineRepo.getPhaseByIndex(phaseIndex);
    
    // 2. [MỚI] Lấy Gene tiến hóa cho phase này (nếu có)
    const gene = await this.evolutionService.getActiveGene(phaseConfig.id);
    
    // 3. Xây dựng Context mở rộng
    const enhancedContext = {
      ...phaseConfig.defaultContext,
      // Nếu có Gene, nó sẽ bổ sung/distill prompt templates
      evolvedInstructions: gene?.compressed_patterns || null,
      capsuleKnowledge: gene?.capsuleRef ? await this.capsuleStore.get(gene.capsuleRef) : null
    };

    // 4. Thực thi Agent (vẫn dùng tool router linh hoạt)
    const result = await this.agentRuntime.execute(
      phaseConfig.agentConfig, // Vẫn là config cũ
      enhancedContext
    );

    // 5. [MỚI] Gửi kết quả về Evolution Service để đánh giá
    await this.evolutionService.recordOutcome(phaseConfig.id, {
      success: result.success,
      metrics: result.metrics,
      tokensUsed: result.tokensUsed
    });

    return result;
  }
}
```

#### 4.4. Mở rộng Tool Router (Thay vì tạo Agent mới)

Thay vì hardcode tool cho từng agent, chúng ta đăng ký các **MCP Tools mới** vào `tool-router` để mọi phase đều có thể truy xuất:

```typescript
// backend/src/tool-router/evolution.tools.ts
export const evolutionToolDefinitions = [
  {
    name: 'gene_get_current',
    description: 'Lấy gene tiến hóa hiện tại của phase đang chạy',
    inputSchema: { phaseId: 'string' },
    handler: async ({ phaseId }) => {
      return await evolutionService.getActiveGene(phaseId);
    }
  },
  {
    name: 'capsule_promote',
    description: 'Promote gene hiện tại lên capsule để dùng cho toàn bộ pipeline (chỉ khi đạt hiệu suất cao)',
    inputSchema: { phaseId: 'string', reason: 'string' },
    handler: async ({ phaseId, reason }) => {
      return await evolutionService.promoteToCapsule(phaseId, reason);
    }
  },
  {
    name: 'gene_rollback',
    description: 'Rollback về gene phiên bản trước nếu performance giảm',
    inputSchema: { phaseId: 'string' },
    handler: async ({ phaseId }) => {
      return await evolutionService.rollback(phaseId);
    }
  }
];
```

*(Lưu ý: Các tool này được đăng ký động, không thuộc sở hữu của riêng "BA" hay "DEV")*

---

### 5. Luồng hoạt động (Workflow)

1. **Khởi tạo**: Pipeline bắt đầu với phase 0.
2. **Tra cứu Gene**: `PhaseExecutor` hỏi `EvolutionService` xem có Gene nào cho `phase_0` không. (Lần đầu chạy, chưa có -> dùng config gốc).
3. **Thực thi**: Agent chạy, sinh ra kết quả (code, requirement, test...).
4. **Đánh giá**: Sau khi phase kết thúc, `EvolutionService` tính điểm `performance_score` (dựa trên success rate, code coverage, hoặc human feedback).
5. **Tiến hóa**: Nếu điểm hiện tại thấp hơn điểm trung bình lịch sử, GEP Engine sẽ tạo ra **Gene mới** (compressed patterns) dựa trên context và lỗi sai.
6. **Lưu trữ**: Gene mới được lưu vào bảng `genes` với `phase_id` tương ứng. Các lần chạy sau sẽ dùng Gene này.
7. **Promotion (Tùy chọn)**: Nếu sau N lần tiến hóa, điểm số vượt ngưỡng, Capsule sẽ được tạo và có thể áp dụng cho các phase khác có cấu hình tương tự.

---

### 6. Lộ trình triển khai (Roadmap)

| Giai đoạn | Thời gian | Công việc chính | Kiểm thử |
| :--- | :--- | :--- | :--- |
| **Phase 1: Foundation** | Tuần 1 | - Cài đặt `@evomap/gep-sdk`<br>- Tạo bảng `genes`, `evolution_events`<br>- Xây dựng `GeneStore` cơ bản | Unit test cho CRUD gene |
| **Phase 2: Integration** | Tuần 2-3 | - Sửa `PhaseExecutor` để inject gene<br>- Tích hợp `EvolutionService`<br>- Viết adapter để chuyển đổi prompt context ↔ gene | Integration test với pipeline mock |
| **Phase 3: Tooling** | Tuần 4 | - Đăng ký MCP Tools (gene_get, promote, rollback)<br>- Cập nhật `memory` module để index gene | E2E test với tool router |
| **Phase 4: Optimization** | Tuần 5 | - Điều chỉnh tham số GEP (mutation rate, crossover)<br>- Xây dựng dashboard evolution (viewer)<br>- Monitoring token cost | A/B Testing so sánh với baseline |

---

### 7. Quản lý rủi ro (Risks & Mitigations)

| Rủi ro | Mức độ | Giải pháp |
| :--- | :--- | :--- |
| **Node.js >= 22.12** (Evolver yêu cầu) | Cao | Nâng cấp Node.js lên phiên bản LTS mới nhất. Chạy kiểm thử toàn bộ suite để đảm bảo không break module cũ. |
| **Chi phí Token tăng ban đầu** (Hiệu ứng "tokens rise then fall") | Trung bình | Bật chế độ `dry-run` cho evolution trong tuần đầu. Đặt ngưỡng `max_tokens` cho quá trình distill gene. |
| **Sai lệch kết quả** (Gene xấu làm giảm chất lượng) | Cao | Luôn lưu `parent_gene_id`. Tự động rollback về gene gốc nếu `performance_score` giảm > 15% so với baseline. |
| **Xung đột với Index-based Routing** | Thấp | Evolution Service chỉ đọc/ghi dựa trên `phaseId`, không can thiệp vào logic `currentPhaseIndex`. |

---

### 8. Kết luận

Tài liệu này đề xuất một chiến lược nâng cấp **không xâm lấn (non-invasive)**, tận dụng tối đa sức mạnh của **GEP** (tự tiến hóa) mà **không làm thay đổi cấu trúc tổ chức agent hiện tại**. Bằng cách gắn Gene với `Phase ID` và mở rộng Tool Router, hệ thống sẽ trở nên "thông minh hơn" theo thời gian mà vẫn giữ được sự linh hoạt, dễ dàng cấu hình lại pipeline khi cần.

---
*Tài liệu này có thể được cập nhật trong quá trình triển khai để phù hợp với các yêu cầu cụ thể của từng module.*