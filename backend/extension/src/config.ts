/**
 * Extension configuration — component definitions, paths, and MCP variants.
 */

export interface Component {
    id: string;
    label: string;
    description: string;
    sourcePath: string;
    targetPath: string;
    filter?: string[];
}

export type McpDelivery = "registry" | "download";

export interface McpVariant {
    id: string;
    label: string;
    description: string;
    delivery: McpDelivery;
    config: McpServerConfig;
    downloadUrl?: string;
    downloadAsset?: string;
}

export interface McpServerConfig {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    transportType?: string;
}

/** Where downloaded MCP servers are stored (per-workspace). */
export const MCP_SERVERS_DIR = ".code-intel/servers";

/** GitHub repo for release downloads. */
export const GITHUB_RELEASE_REPO = "dnguyenminh/Kiro-SDLC-Agents";

export const CORE_COMPONENTS: Component[] = [
    {
        id: "agents",
        label: "Agents (BA, SA, QA, DEV, DevOps, UI, Security, SM, TA)",
        description: "Multi-agent SDLC pipeline with prompts",
        sourcePath: ".kiro/agents",
        targetPath: ".kiro/agents"
    },
    {
        id: "steering",
        label: "Steering Rules",
        description: "Code standards, self-learning, file-writing, drawio, jira-workflow",
        sourcePath: ".kiro/steering",
        targetPath: ".kiro/steering"
    },
    {
        id: "hooks",
        label: "Hooks (Code Index + Drawio Validation)",
        description: "Auto-trigger hooks for file events",
        sourcePath: ".kiro/hooks",
        targetPath: ".kiro/hooks"
    },
    {
        id: "templates",
        label: "Document Templates (BRD, FSD, TDD, STP, STC, DPG, RLN, UG)",
        description: "Templates for all SDLC documents",
        sourcePath: "documents/templates",
        targetPath: "documents/templates"
    }
];

export const MCP_VARIANTS: McpVariant[] = [
    {
        id: "python",
        label: "Python (recommended — zero install)",
        description: "uvx auto-downloads from PyPI. Python 3.11+",
        delivery: "registry",
        config: {
            command: "uvx",
            args: ["mcp-code-intelligence@latest", "--config", "${workspaceFolder}/.code-intel/orchestration.json"],
            cwd: "${workspaceFolder}"
        }
    },
    {
        id: "nodejs",
        label: "Node.js (full-featured — zero install)",
        description: "npx auto-downloads from npm. Node.js 20+",
        delivery: "registry",
        config: {
            command: "npx",
            args: ["mcp-code-intelligence@latest", "--config", "${workspaceFolder}/.code-intel/orchestration.json"],
            cwd: "${workspaceFolder}"
        }
    },
    {
        id: "kotlin",
        label: "Kotlin/JVM (enterprise)",
        description: "Downloads JAR from GitHub Release. JDK 21+",
        delivery: "download",
        downloadAsset: "mcp-code-intelligence-latest.jar",
        config: {
            command: "java",
            args: ["-jar", "${mcpServersDir}/mcp-code-intelligence-latest.jar", "--config", "${workspaceFolder}/.code-intel/orchestration.json"],
            cwd: "${workspaceFolder}"
        }
    }
];
