# Business Requirements Document (BRD)
**Ticket**: SA4E-124
**Project**: SDLC Agents 4 Enterprise
**Author**: BA-Agent
**Status**: APPROVED
**Date**: 2026-07-11

---

## 1. Executive Summary

In the current ecosystem of the SDLC Agents 4 Enterprise platform, Artificial Intelligence (AI) agents rely on the Model Context Protocol (MCP) to interface with backend services and local resources. A critical bottleneck has been identified when these agents are required to process, generate, or manipulate large files—most notably image files (e.g., PNG diagrams generated via Draw.io tools) or extensive binary datasets. 

Currently, the backend MCP servers transmit these binary files as Base64-encoded strings directly into the LLM's context window. This architecture introduces severe operational and financial risks:
1. **Token Exhaustion**: Base64 strings inflate file sizes by approximately 33%, consuming vast amounts of LLM context tokens.
2. **Financial Drain**: Since AI inference is billed per token, passing megabytes of Base64 text back and forth causes rapid budget depletion.
3. **Cognitive Degradation (Hallucinations)**: LLMs forced to parse or ignore massive blocks of meaningless Base64 characters often lose track of their primary instruction, leading to hallucinations, truncated outputs, or complete task failure.

This document outlines the business requirement to introduce an intelligent, centralized **Tool Payload Proxy** mechanism. This Proxy will intercept Base64 payloads mid-flight, write them to local storage, and present only the physical file paths to the LLM context—dramatically reducing token usage while preserving full functional capabilities.

---

## 2. Business Flow Overview

To illustrate the intended transformation, consider the flow of a user request to generate a diagram.

![Business Requirement Flow](diagrams/brd_business_flow.png)

*Figure 1: The Business Flow diagram demonstrates how the Proxy Interceptor sits between the LLM Context Window and the User Request to offload the heavy data payloads.*

### 2.1. Current State (As-Is)
- The user requests an agent to generate a diagram.
- The agent calls an MCP tool (e.g., `drawio_export_png`).
- The backend processes the request and returns a massive Base64 string.
- The string floods the agent's context window.

### 2.2. Future State (To-Be)
- The user requests an agent to generate a diagram.
- The agent calls the MCP tool using a local file path.
- The Proxy intercepts the path, translates it to Base64 (if necessary for the backend), and forwards the request.
- The backend returns the Base64 response.
- The Proxy intercepts the response, decodes it to a physical file, and returns a lightweight string: `"File saved successfully to: /path/to/file"`.

---

## 3. System Context

The system architecture consists of three primary actors: the AI Agent (running within LangGraph), the VSCode Extension (acting as the Client/Proxy), and the Backend MCP Server (providing the tools).

![System Context](diagrams/brd_system_context.png)

*Figure 2: System Context diagram showing the VSCode Extension acting as the critical middleman (Proxy) between the Agent and the Backend.*

---

## 4. Business Goals & Strategic Value

The implementation of the Tool Payload Proxy aligns with the following strategic business goals:

### 4.1. Massive Cost Reduction
By eliminating Base64 strings from the context window, we project a **90% reduction** in token consumption for file-heavy operations. This directly translates to lowered operational costs for API usage (e.g., OpenAI, Anthropic).

### 4.2. Enhanced System Reliability
By keeping the context window clean and concise, agents will no longer suffer from artificial amnesia (forgetting instructions due to token limits). This increases the success rate of complex, multi-step SDLC pipelines.

### 4.3. Seamless Developer Experience
AI Agents will interact with standard OS-level file paths, mimicking how human developers interact with local workspaces. Backend developers will not need to rewrite their MCP tools; they can continue emitting Base64 payloads, knowing the Proxy will handle the translation transparently.

---

## 5. Success Metrics (KPIs)

To declare this feature a success, the following Key Performance Indicators must be met:
- **Token Optimization**: 100% elimination of `base64` payload strings in the Agent's prompt history/logs.
- **Proxy Transparency**: The `execute_dynamic_tool` bridge successfully resolves file paths to Base64 without requiring the LLM to understand the underlying encoding.
- **Backward Compatibility**: Existing Backend tools (e.g., `drawio_export_png`, `mem_ingest`) must function normally without requiring schema updates or code refactoring.

---

## 6. User Personas

### 6.1. The AI Agent (Primary Actor)
- **Pain Point**: Overwhelmed by unreadable Base64 text; frequently loses track of tasks.
- **Need**: Needs to process file inputs/outputs using standard absolute file paths.

### 6.2. The Backend Developer
- **Pain Point**: Modifying dozens of existing MCP tools to handle local file I/O on the client machine is architecturally incorrect and violates the client-server separation of concerns.
- **Need**: Needs to continue building tools that accept and return standard Base64 payloads over JSON-RPC.

---

## 7. Domain Glossary

| Term | Definition |
|------|------------|
| **MCP** | Model Context Protocol - A standard for connecting AI models to external tools. |
| **Base64** | An encoding scheme used to represent binary data in an ASCII string format. |
| **LLM Context Window** | The maximum amount of text (measured in tokens) an AI model can process in a single inference request. |
| **Proxy** | An intermediary software component that intercepts, inspects, and modifies data payloads between two endpoints. |
| **Interceptor** | A specific software design pattern used to catch and alter payloads mid-flight without changing the core business logic. |
| **Hallucination** | A phenomenon where an AI generates incorrect or nonsensical output, often exacerbated by bloated or confusing context windows. |

---

## 8. Constraints, Assumptions & Risks

### 8.1. Constraints
- **C-01**: The solution MUST NOT break existing tools that legitimately use file paths (e.g., `mem_ingest_file`) where the backend itself handles the local file reading.
- **C-02**: The Proxy MUST be implemented entirely within the VSCode Extension (`mcp-bridge.ts`).

### 8.2. Assumptions
- **A-01**: The Backend MCP server returns file payloads matching a strict JSON schema convention: `{"_base64_file": "...", "_filename": "..."}`.
- **A-02**: The AI Agent is capable of understanding instructions to provide absolute file paths when prompted by the modified tool schemas.

### 8.3. Risks & Mitigations
- **Risk**: The Proxy might accidentally convert strings that happen to contain the word "base64" but are not meant to be files.
- **Mitigation**: Implement strict suffix matching (`_as_path`) and robust try-catch blocks during file I/O to fail gracefully.

---

## 9. Diagram Index

| Diagram | Description | Status |
|---------|-------------|--------|
| `diagrams/brd_business_flow.drawio` | Business requirement flow for the token reduction strategy | DONE |
| `diagrams/brd_system_context.drawio` | Interaction between User, LLM, and Proxy | DONE |
