# UG.md — SA4E-387

## **Tiêu đề**
Hướng dẫn sử dụng Enrichment với Dynamic Context Budget & Runtime Model Swap

## **Mô tả**
Hướng dẫn sử dụng chức năng enrich LLM cho code symbol trong backend server, hỗ trợ xử lý file/symbol lớn hơn context window của model và phản ánh model swap runtime.

## **Yêu cầu hệ thống**
- Node.js v22.x
- Docker và Docker Compose
- PostgreSQL
- Ollama, Anthropic, hoặc OpenAI API

## **Cài đặt**

### **1. Cài đặt backend**
```bash
# Clone repository
git clone https://github.com/dnguyenminh/SDLC-Agents-4-Enterprise.git
cd SDLC-Agents-4-Enterprise

# Cài đặt dependencies
npm install

# Cài đặt database
npm run db:test:up

# Build backend
npm run build --workspace=backend
```

### **2. Cấu hình Docker**
```bash
# Sử dụng docker-compose để chạy backend
cd backend
docker-compose up -d
```

## **Sử dụng API**

### **1. Enrich code symbol**
```bash
curl -X POST http://localhost:48721/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "function calculateBudget",
    "file_path": "/path/to/file.ts",
    "model": "ollama",
    "budget": 10000
  }'
```

**Trả về**:
```json
{
  "enriched_content": "string",
  "status": "success",
  "model_used": "ollama",
  "budget_used": 10000
}
```

### **2. Swap model runtime**
```bash
curl -X POST http://localhost:48721/model/swap \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic",
    "ticket_id": "SA4E-387"
  }'
```

**Trả về**:
```json
{
  "status": "success",
  "message": "Model swapped successfully"
}
```

## **Ví dụ sử dụng**

### **Ví dụ 1: Enrich file lớn**
```bash
curl -X POST http://localhost:48721/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "main",
    "file_path": "/path/to/large-file.ts",
    "model": "ollama",
    "budget": 20000
  }'
```

### **Ví dụ 2: Swap model và enrich lại**
```bash
# Swap model
curl -X POST http://localhost:48721/model/swap \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic",
    "ticket_id": "SA4E-387"
  }'

# Enrich lại với model mới
curl -X POST http://localhost:48721/enrich \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "main",
    "file_path": "/path/to/large-file.ts",
    "model": "anthropic",
    "budget": 20000
  }'
```

## **Phân tích rủi ro và giải pháp**
| **Rủi ro** | **Giải pháp** |
|------------|------------|
| Model swap runtime gây lỗi cache | Invalidate cache khi swap model.
| Budget động không chính xác | Test với nhiều trường hợp.
| Ollama adapter không tương thích | Kiểm tra và cập nhật API.
| Thời gian enrich quá lâu | Optimize map-reduce.

## **Lịch sử thay đổi**
- **2026-10-28**: Tạo User Guide ban đầu.

---