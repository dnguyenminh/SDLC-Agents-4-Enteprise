/**
 * Copy distributable resources from workspace root into extension resources/.
 * Runs as part of build pipeline (before compile/package).
 * Usage: node scripts/copy-resources.js
 */

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const RESOURCES_DIR = path.resolve(__dirname, "..", "resources");

const MAPPINGS = [
    { src: ".kiro/agents", dst: ".kiro/agents" },
    { src: ".kiro/hooks", dst: ".kiro/hooks" },
    { src: ".kiro/steering", dst: ".kiro/steering" },
    { src: "documents/templates", dst: "documents/templates" },
    { src: "kiro-sdlc-agents/webview-assets/chat", dst: "webview-assets/chat" },
    { src: "kiro-sdlc-agents/webview-assets/settings", dst: "webview-assets/settings" },
    { src: ".analysis/code-intelligence/index-config.json", dst: ".analysis/code-intelligence/index-config.json" },
    { src: ".analysis/code-intelligence/scripts/python", dst: ".analysis/code-intelligence/scripts/python" },
    { src: ".analysis/code-intelligence/scripts/java", dst: ".analysis/code-intelligence/scripts/java" },
    { src: ".analysis/code-intelligence/scripts/powershell", dst: ".analysis/code-intelligence/scripts/powershell" },
    { src: ".analysis/code-intelligence/scripts/bash", dst: ".analysis/code-intelligence/scripts/bash" },
    { src: ".analysis/code-intelligence/scripts/nodejs/src", dst: ".analysis/code-intelligence/scripts/nodejs/src" },
    { src: ".analysis/code-intelligence/scripts/nodejs/package.json", dst: ".analysis/code-intelligence/scripts/nodejs/package.json" },
    { src: ".analysis/code-intelligence/scripts/nodejs/tsconfig.json", dst: ".analysis/code-intelligence/scripts/nodejs/tsconfig.json" }
];

const SKIP_DIRS = ["node_modules", "__pycache__", "out", "dist", ".git", "settings"];
const SKIP_FILES = ["mcp.json", "mcp.json,bk"];

function shouldSkip(name) {
    return SKIP_DIRS.includes(name);
}

function copyRecursive(src, dst) {
    if (!fs.existsSync(src)) { return 0; }

    const stat = fs.statSync(src);
    if (stat.isFile()) {
        if (SKIP_FILES.includes(path.basename(src))) { return 0; }
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        return 1;
    }

    let count = 0;
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.isDirectory() && shouldSkip(entry.name)) { continue; }
        if (entry.isFile() && SKIP_FILES.includes(entry.name)) { continue; }
        count += copyRecursive(
            path.join(src, entry.name),
            path.join(dst, entry.name)
        );
    }
    return count;
}

function main() {
    let total = 0;
    for (const mapping of MAPPINGS) {
        const src = path.join(WORKSPACE_ROOT, mapping.src);
        const dst = path.join(RESOURCES_DIR, mapping.dst);
        const count = copyRecursive(src, dst);
        if (count > 0) {
            console.log(`  ${mapping.src} → resources/${mapping.dst} (${count} files)`);
        }
        total += count;
    }
    console.log(`\nCopied ${total} files into resources/`);
}

main();
