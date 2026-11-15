---
name: file-writing
description: File writing standards — stream_write_file for large documents, DOCX export
---

## Stream Writing for Large Files
- For files > 50 lines: use `stream_write_file` tool
- First call: `mode="write"` to create the file
- Subsequent calls: `mode="append"` for each section
- Chunk size: ≤ 4000 characters per append call
- NEVER use `write`/`edit` for documents > 50 lines while `stream_write_file` is available

## Fallback
- If `stream_write_file` is unavailable, use `write` + `edit`
- Log a warning when falling back

## DOCX Export Process
1. **Embed images first:** `embed_image(file_path="...", output_path="...-embedded.md")`
   - Creates self-contained markdown with base64 images
   - ALWAYS use file_path, NEVER pass content as parameter
2. **Export to DOCX:** `execute_dynamic_tool(toolName="export_docx", arguments={file_path="...-embedded.md", file_name="{DOC}-v{ver}-{TICKET}", output_path="documents/{TICKET}/{DOC}-v{ver}-{TICKET}.docx"})`
   - `export_docx` is a backend dynamic tool (not in `tools/list`). Discover it once with `find_tools("export docx", top_k=5)`; the wrapper also resolves its schema automatically on first use.
   - The wrapper reads `file_path` and sends `content_base64`; the backend maps it to the converter's `markdown` argument, returns `output_base64`; the wrapper writes the file and returns its path as `file_path`.
   - The same contract applies to `export_pdf`, `export_html`, `export_xlsx`, `export_pptx`, `export_json` (every `export_*` tool).
   - If the backend cannot read an artifact it fails with `ARTIFACT_FETCH_FAILED` (never a bare path) — do not retry by passing a raw path.
   - NEVER pass Markdown content in place of a path - a path string exported as content produces a DOCX containing that literal path
3. **Cleanup:** Delete the temp `-embedded.md` file

## Naming Convention
- `{DOC}-v{MAJOR}-{TICKET}.docx`
- Example: `BRD-v1-CRP-84.docx`, `FSD-v2-CRP-84.docx`
