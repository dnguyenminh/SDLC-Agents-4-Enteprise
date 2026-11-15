

# Pega Knowledge Base Search Cascade

## Purpose

Pega rules (1,349+ nodes) are stored across TWO data layers:
1. **Memory KB** — text entries with BM25 search (tags: `pega,rule`, `pega,data`, `pega,schema`, `pega,ast`)
2. **Graph DB** — nodes with label/type/tier + edges (relationships between rules)

Using only `mem_search` misses graph-structured data. This cascade ensures ALL agents find Pega knowledge.

> Tool IDs are prefixed by the MCP server name the user configured in `opencode.json`. Use the actual ID from the current session; never hardcode the server name.


## When to Use

- Searching for Pega rule definitions (Activity, Flow, Data Transform, Decision Table)
- Exploring class hierarchy (`Work-`, `Data-`, `Rule-Obj-`)
- Finding relationships between rules (who calls whom, inheritance)
- Investigating Flow steps, connectors, or schema/field definitions

Do NOT use for: general project KB, code intelligence, or non-Pega searches.

---

## ⚠️ Current Limitation: Graph Edges = 0

**As of now, graph nodes exist but edges (relationships) have NOT been populated yet.**
- `mem_graph(action: "neighbors")` will return empty until Edge Population (KB-02) is complete.
- Until then, use Step 4 (grep) as the primary relationship discovery method.
- After KB-02 completes, Step 3 will become functional.

---

## Quick Path — `get_curated_context`

For simple queries where you need a fast answer combining text + graph:

```
get_curated_context(query: "GetActionsListForWorkList activity", max_tokens: 4000)
```

This searches code symbols + KB + graph in one call. Use this FIRST for simple lookups.
Only use the full 4-step cascade when `get_curated_context` returns insufficient results.

---

## 4-Step Cascade

### Step 1: Text Search — `mem_search` (Direct)

```
mem_search(query: "ProcessClaim", limit: 10)
```

> ⛔ Do NOT use `type: "PEGA_RULE"` — this type does not exist in the schema.
> Valid types: DECISION, ERROR_PATTERN, ARCHITECTURE, API_DESIGN, REQUIREMENT, LESSON_LEARNED, PROCEDURE, CONTEXT.
> For Pega rules, omit `type` or use tags-based filtering in results.

If 0 results or insufficient → Step 2.

### Step 2: Graph Label Search — `kb_graph_query` (via execute_dynamic_tool)

```
execute_dynamic_tool(
  toolName: "kb_graph_query",
  arguments: { "query": "ProcessClaim", "type": "FUNCTION", "limit": 20 }
)
```

> ⛔ Note: argument key is `toolName` (camelCase), NOT `tool_name`.

**Node type mapping:**

| Pega Artifact | Graph Type |
|---------------|------------|
| Activity / Flow / DT / Data Transform | `ACTIVITY` or `FUNCTION` |
| Class (Work-/Data-) | `CLASS` |
| Property | `PROPERTY` |
| Schema/Field docs | `DOCUMENT` |

If nodes found → note the node `id` (string format like `pega:Rule-Obj-Activity:Assign-:GetActionsListForWorkList`).
If 0 nodes → Step 4.

### Step 3: Expand Neighbors — `mem_graph` (Direct)

> ⚠️ **CURRENTLY NON-FUNCTIONAL** — edges=0. Skip to Step 4 until KB-02 (Edge Population) is complete.

```
mem_graph(action: "neighbors", node_id: <numeric_integer_id>)
```

> Note: `mem_graph` requires a NUMERIC node_id (integer), not the string ID from kb_graph_query.

### Step 4: Fallback — File Search (PRIMARY for relationships until KB-02)

```
grep(pattern: "ProcessClaim", path: "rules", include: "**/*.pega.json")
```

**To find callers of an Activity:**
```
grep(pattern: "MyActivityName", path: "rules/Rule-Obj-Flow", include: "*.pega.json")
```

**To find what an Activity references:**
Read the Activity's own `.pega.json` file → parse `pxRuleReferences[]` array.

---

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| `mem_search` returns 0 | Rule not in text KB | Continue to Step 2 |
| `kb_graph_query` returns 0 nodes | Rule not indexed in graph | Continue to Step 4 |
| `mem_graph` returns empty neighbors | edges=0 (KB-02 pending) | Use Step 4 (grep) |
| `execute_dynamic_tool` → "Unknown tool" | Tool not discovered | Run `find_tools("kb_graph")` first |
| `grep` returns 0 | Rule not in local workspace | Check if rule is OOTB (platform-only) |

---

## Tool Discovery Prerequisite

Before using nested tools, verify availability:

```
find_tools(query: "kb_graph", threshold: 0.3, top_k: 5)
```

If `kb_graph_query` NOT found → Orchestrator may need restart. Check:
```
orchestration_status()
```

---

## Common Query Examples

### Find Activity by Name

```
get_curated_context(query: "GetActionsListForWorkList activity Assign")
mem_search(query: "GetActionsListForWorkList", limit: 5)
execute_dynamic_tool(toolName: "kb_graph_query", arguments: { "query": "GetActionsListForWorkList" })
grep(pattern: "GetActionsListForWorkList", path: "rules/Rule-Obj-Flow", include: "*.pega.json")
```

### Find Class Hierarchy

```
execute_dynamic_tool(toolName: "kb_graph_query", arguments: { "query": "Work-Claim", "type": "CLASS" })
grep(pattern: "pyDerivesFrom", path: "rules/Rule-Obj-Class", include: "Work-Claim*.pega.json")
```

---

## Edge Types (functional after KB-02)

| Edge Type | Meaning | Source → Target |
|-----------|---------|-----------------|
| CALLS | Flow invokes Activity | Flow → Activity |
| USES | Rule references Property | Activity → Property |
| INHERITS | Class extends Class | Child Class → Parent Class |
| BELONGS_TO | Rule is owned by Class | Activity → Class |
| REFERENCES | Generic reference | Activity → Class/Property |

---

## Tool Reference

| Tool | Callable | Purpose |
|------|----------|---------|
| `mem_search` | Direct | Text/BM25 search across KB entries |
| `mem_graph` | Direct | Navigate graph edges (needs numeric node_id) |
| `get_curated_context` | Direct | Combined search: code + KB + graph |
| `kb_graph_query` | `execute_dynamic_tool` | Fuzzy label search on graph nodes |
| `kb_graph_add_edge` | `execute_dynamic_tool` | Add relationship between nodes |
| `code_search` | Direct | Search source code symbols |
| `grep` | Direct | Regex search on raw rule JSON files |
| `find_tools` | Direct | Discover nested tool names |

---

## Rules for All Agents

1. **Try `get_curated_context` first** for simple lookups
2. **ALWAYS start cascade with `mem_search`** — fastest text search
3. **NEVER stop at Step 1 if 0 results** — graph has 1,349+ nodes
4. **Use `toolName` (camelCase)** in `execute_dynamic_tool`
5. **Step 3 is non-functional until KB-02** — use grep for relationships
6. **Verify tools exist** with `find_tools("kb_graph")` before first use
7. **Ingest new knowledge** when discovered:
   ```
   mem_ingest(content: "...", type: "CONTEXT", tags: "pega,rule,{class}")
   ```

