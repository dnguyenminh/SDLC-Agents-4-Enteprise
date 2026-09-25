# SA4E-261 User Guide — Unified Extension Indexing

## Overview
Indexer now supports non-Java source artifacts (JSP/XML/SQL/config) via unified extension whitelist and Tier B full-text indexing.

## Configuration
Unified extensions defined in:
- Backend: `backend/src/config/unified-extensions.ts`
- Extension: `extension/src/services/unified-extensions.ts`

List: ts,tsx,js,jsx,kt,java,py,go,rs,c,cpp,h,hpp,cs,php,rb,scala,swift,cls,trigger,apex,soql,page,component,cmp,app,evt,intf,tokens,pega,html,jsp,xml,sql,properties,yml,yaml,css

## Usage
1. Trigger index from VS Code command palette → Code Intelligence: Index Workspace
2. Extension discovers files using unified glob `**/*.{...}`
3. Backend validates extension against unified list, rejects unsupported extensions
4. Tier A files parsed via tree-sitter → symbol graph
5. Tier B files stored as full-text in Knowledge Base for BM25 search

## API
POST /api/index/source
Headers: Authorization: Bearer <token>, X-Project-Id: <id>
Body: { files: [{ path, content }] }
Response: { written, skipped, rejected, projectId }

## Error Codes
401 Unauthorized, 400 Bad Request, 429 Server busy, 400 X-Project-Id required

## Troubleshooting
- Files silently skipped → check extension is in unified list
- Parse errors → file stored as full-text Tier B
- Contract test failure → extension/backend extension lists diverge
