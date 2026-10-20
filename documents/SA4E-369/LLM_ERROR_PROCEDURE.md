# LLM Error Handling Procedure — SA4E-369

## Lesson Learned from ide_launch Failed Attempts

### 1. Extract schema params BEFORE calling tool
- Use `find_tools(query="ide launch tool")` to get full tool schema
- Extract `ide_launch` inputSchema properties: `ide`, `ideBinaryPath`, `userDataDir`, `remoteDebuggingPort`, `timeoutSeconds`
- **Never assume** tool parameters from description alone

### 2. Format JSON body EXACTLY per schema
- Required: none (all optional in ide_launch schema)
- `ide`: enum `["code","kiro","antigravity","kilo"]`
- `ideBinaryPath`: string path (fail-fast if missing per BR-01)
- `userDataDir`: optional string for isolated profile
- `remoteDebuggingPort`: integer 1024-65535
- `timeoutSeconds`: integer 1-300, default 60

### 3. Clarify tool scope (CRITICAL)
- `ide_launch` runs in **agent sandbox**, NOT remote-control user's machine
- **Do not** assume can remote-control Kiro on user's machine
- Tool returns `sessionId + cdpEndpoint` for agent interaction only

### 4. If fail, report immediately
- Do NOT retry multiple formats (wasted ~30-40 min)
- **Immediately** report error with:
  - Tool name: `ide_launch`
  - Error: 400 Bad Request
  - What was attempted
  - What was learned
- Then stop and reassess

### 5. Procedural memo for future LLM sessions
- **Before** any tool call: `find_tools(query)` → extract schema → format body → attempt
- **If** 400 error: report error + lesson, **do not** retry multiple formats
- **Lesson stored** in KB `mem_ingest` or `mem_ingest_file` for future retrieval

### Tags
SA4E-369, LLM, error-handling, ide_launch, MCP, procedure, SDLC

## Retrieval cue for future sessions
```
mem_ingest(content="SA4E-369 LLM error handling procedure", type="PROCEDURE", tags="SA4E-369,LLM,error-handling,ide_launch")
```