/**
 * PiExtensionsConfig — SA4E-334 Phase 2.
 * Central record of pi.dev extensions wired via PiExtensionRuntime.
 * Versions pinned to extension/package.json (exact, no ^).
 */
export interface PiExtensionEntry {
  package: string;
  version: string;
  provides: string;
  notes: string;
}

export const PI_EXTENSIONS_CONFIG: PiExtensionEntry[] = [
  {
    package: '@earendil-works/pi-coding-agent',
    version: '0.99.1',
    provides: 'read/write/edit/powershell(win32)|bash(non-win32)/grep/find/ls (built-ins, cwd=workspaceRoot)',
    notes: 'SA4E-336: bumped 0.80.10 → 0.99.1 for native createPowerShellTool on Windows (retires Git-Bash shellPath workaround). Composed from single-tool factories in pi-coding-tools.ts.',
  },
  {
    package: '@cortexkit/aft-pi',
    version: '0.57.2',
    provides: 'Rust read/write/edit/grep + aft_delete/move/outline/zoom/search/callgraph/conflicts/import/safety/ast_grep/lsp',
    notes: 'hoist_builtin_tools=true by default (extension wins on name conflict). Binary auto-downloads to ~/.cache/aft. Config: ~/.config/cortexkit/aft.jsonc, <project>/.cortexkit/aft.jsonc, tool_surface minimal|recommended|all.',
  },
  {
    package: 'billion-context-pi',
    version: '0.1.82',
    provides: 'compress/decompress/search_context/acp_status/acp_cache (+acp_delegate*)',
    notes: 'Sole-context-manager mode needs AgentSession context event (future). Now: tools available model-driven. Keep exactly one compression plugin. Config: ~/.pi/acp.json, <project>/.pi/acp.json.',
  },
  {
    package: 'pi-web-access',
    version: '0.33.0',
    provides: 'web search/fetch, GitHub clone, PDF/YouTube extraction',
    notes: 'Provider keys via env/settings; see package README for 20+ search providers.',
  },
  {
    package: '@juicesharp/rpiv-todo',
    version: '2.11.0',
    provides: 'todo list overlay (survives reload/compaction)',
    notes: 'Needs ctx.ui stub — notify works, interactive overlay limited in webview.',
  },
  {
    package: '@juicesharp/rpiv-ask-user-question',
    version: '2.11.0',
    provides: 'ask-user questionnaire (sole ask tool)',
    notes: 'Single ask-user source. The raidou fork was removed: peer pi-coding-agent>=0.85 incompatible + duplicate ask_user_question tool made models ask instead of act.',
  },
  {
    package: 'pi-subagents',
    version: '0.73.1',
    provides: 'single-agent delegation + scripted multi-agent workflows',
    notes: 'Background runs surface via webview notify; full fleet widget is TUI-only.',
  },
];
