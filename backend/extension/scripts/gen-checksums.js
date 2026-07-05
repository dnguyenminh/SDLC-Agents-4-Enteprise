/**
 * Generate .sdlc-checksums.json from git committed content (not local files).
 * In CI: checkout is clean, so git HEAD = filesystem = correct.
 * Locally: always uses git HEAD to avoid including uncommitted changes.
 * Usage: node scripts/gen-checksums.js
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const RESOURCE_PATHS = [
    ".kiro/agents/",
    ".kiro/hooks/",
    ".kiro/steering/",
    "documents/templates/",
    ".analysis/code-intelligence/index-config.json"
];

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT = path.resolve(__dirname, "..", "resources", ".sdlc-checksums.json");

function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version;
}

function getCommittedFiles() {
    const args = ["git", "ls-tree", "-r", "--name-only", "HEAD", "--", ...RESOURCE_PATHS];
    const result = execSync(args.join(" "), { cwd: REPO_ROOT, encoding: "utf-8" });
    return result.trim().split("\n").filter(Boolean);
}

function getCommittedFileHash(filePath) {
    const content = execSync(`git show HEAD:${filePath}`, { cwd: REPO_ROOT });
    return crypto.createHash("sha256").update(content).digest("hex");
}

function main() {
    const version = getVersion();
    const now = new Date().toISOString();
    const files = getCommittedFiles();

    const manifest = {
        version,
        generatedAt: now,
        files: {}
    };

    for (const f of files.sort()) {
        try {
            manifest.files[f] = {
                hash: getCommittedFileHash(f),
                version,
                injectedAt: now
            };
        } catch (err) {
            console.warn(`WARN: skipped ${f} — ${err.message}`);
        }
    }

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`Generated ${OUTPUT} — ${Object.keys(manifest.files).length} files, version ${version}`);
}

main();
