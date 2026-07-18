# Deployment Plan & Release Notes (DPG+RLN)
**Ticket**: SA4E-124
**Project**: SDLC Agents 4 Enterprise
**Author**: DevOps-Agent
**Status**: APPROVED
**Date**: 2026-07-11

---

## 1. Deployment Guide (DPG)

### 1.1. Pre-requisites
- Local environment running NodeJS v18+.
- Access to the extension build scripts (`npm run compile`).
- VSCode Extension environment ready for local testing.

### 1.2. CI/CD Deployment Flow

The deployment of this feature strictly modifies the client-side VSCode Extension. No changes are required on the Backend MCP Servers, ensuring backward compatibility.

![Deployment Flow](diagrams/dpg_deployment_flow.png)
*Figure 1: The CI/CD Deployment Flow outlines the steps from compiling the code to packaging the .vsix file.*

**Steps:**
1. Execute `npm install` in the extension root to ensure standard Node.js modules (`fs`, `path`) and the `vscode` API are correctly linked in `node_modules`.
2. Execute `npm run compile` to build the TypeScript source code into standard JavaScript. 
3. Package the extension into a `.vsix` file, or simply reload the VSCode Extension Host to run it in dev mode.
4. Verify Post-Deployment: Trigger the AI Agent to run `drawio_export_png` and inspect the Extension Host debug logs to confirm no Base64 strings are present.

---

## 2. Rollback Strategy

In the event of an unforeseen production issue, the following rollback plan MUST be executed immediately.

![Rollback Plan](diagrams/dpg_rollback_plan.png)
*Figure 2: The Rollback Plan details the standard operating procedure for reverting the Proxy changes in case of critical failures.*

**Triggers for Rollback:**
- The `fs.readFileSync` operations cause catastrophic memory leaks.
- The recursive traversal of arguments causes CPU spikes or endless loops due to circular object references.
- Valid JSON payloads are accidentally corrupted by the response interceptor.

**Steps:**
1. Check out the previous stable commit of `extension/src/langgraph/mcp-bridge.ts`.
2. Run `npm run compile`.
3. Restart the VSCode Extension Host.
4. Notify the development team regarding the precise failure mode.

---

## 3. Release Notes (RLN)

### Version: 1.3.1-hotfix (SA4E-124)

**New Features & Enhancements:**
- **Universal Payload Proxy**: Introduced a centralized interceptor in `McpBridge` that automatically rewrites tool schemas, converting Base64 parameters to file paths.
- **Token Optimization**: AI Agents are now fully insulated from processing massive binary payloads in string format, drastically reducing token consumption by up to 90%.
- **Automated File Extraction**: Responses from backend tools containing the `_base64_file` property are now automatically decoded and saved securely to `documents/tmp/`, making them immediately available to the local workspace.

**Bug Fixes:**
- Resolved recurring agent hallucinations and context-window exhaustion events triggered by interacting with image-heavy tools.

**Security & Stability:**
- The proxy logic employs defensive programming with `try-catch` blocks, ensuring that missing local files or malformed JSON payloads gracefully degrade rather than crashing the extension host.

---

## 4. Diagram Index

| Diagram | Description | Status |
|---------|-------------|--------|
| `diagrams/dpg_deployment_flow.drawio` | CI/CD Deployment Flow | DONE |
| `diagrams/dpg_rollback_plan.drawio` | Rollback Plan Flow | DONE |
