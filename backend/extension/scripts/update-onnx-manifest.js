#!/usr/bin/env node
/**
 * update-onnx-manifest.js
 * 
 * After running the build-onnxruntime.yml workflow, download the .sha256 files
 * from the GitHub Release and update release-manifest.json with real hashes and sizes.
 *
 * Usage:
 *   node scripts/update-onnx-manifest.js [version]
 *   node scripts/update-onnx-manifest.js 1.22.0
 *
 * Prerequisites:
 *   - GitHub CLI (gh) installed and authenticated
 *   - Release tag "onnxruntime-node-v{version}" exists with uploaded .tar.gz and .sha256 files
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.resolve(__dirname, '..', 'resources', 'release-manifest.json');
const REPO = 'dnguyenminh/Kiro-SDLC-Agents';
const PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];

function main() {
    const version = process.argv[2] || '1.22.0';
    const tag = `onnxruntime-node-v${version}`;

    console.log(`Updating manifest for ${tag}...`);
    console.log(`Repo: ${REPO}`);

    // Load current manifest
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

    if (!manifest['onnxruntime-node']) {
        console.error('ERROR: No onnxruntime-node section in release-manifest.json');
        process.exit(1);
    }

    // Get release assets info via GitHub CLI
    let assets;
    try {
        const output = execSync(
            `gh release view "${tag}" --repo "${REPO}" --json assets -q ".assets"`,
            { encoding: 'utf-8', timeout: 30000 }
        );
        assets = JSON.parse(output);
    } catch (err) {
        console.error(`ERROR: Cannot fetch release ${tag}. Make sure:`);
        console.error(`  1. GitHub CLI (gh) is installed and authenticated`);
        console.error(`  2. Release "${tag}" exists in ${REPO}`);
        console.error(`  Error: ${err.message}`);
        process.exit(1);
    }

    console.log(`Found ${assets.length} assets in release ${tag}`);

    // Download .sha256 files and parse them
    const tmpDir = path.join(__dirname, '..', '.tmp-onnx-manifest');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    try {
        // Download all .sha256 files
        execSync(
            `gh release download "${tag}" --repo "${REPO}" --pattern "*.sha256" --dir "${tmpDir}" --clobber`,
            { encoding: 'utf-8', timeout: 60000 }
        );
    } catch (err) {
        console.error(`ERROR: Cannot download .sha256 files: ${err.message}`);
        process.exit(1);
    }

    // Parse each platform
    for (const platform of PLATFORMS) {
        const archiveName = `onnxruntime-node-v${version}-${platform}.tar.gz`;
        const sha256File = path.join(tmpDir, `${archiveName}.sha256`);

        if (!fs.existsSync(sha256File)) {
            console.warn(`  WARN: No .sha256 file for ${platform} — skipping`);
            continue;
        }

        // Parse SHA-256 from file (format: "hash  filename" or "hash filename")
        const content = fs.readFileSync(sha256File, 'utf-8').trim();
        const hash = content.split(/\s+/)[0];

        // Get file size from assets
        const asset = assets.find(a => a.name === archiveName);
        const size = asset ? asset.size : 0;

        if (!hash || hash.length !== 64) {
            console.warn(`  WARN: Invalid hash for ${platform}: "${hash}"`);
            continue;
        }

        // Update manifest
        manifest['onnxruntime-node'].binaries[platform] = {
            url: `https://github.com/${REPO}/releases/download/${tag}/${archiveName}`,
            sha256: hash,
            size: size,
        };

        console.log(`  ✅ ${platform}: sha256=${hash.substring(0, 16)}... size=${(size / 1024 / 1024).toFixed(1)} MB`);
    }

    // Update version
    manifest['onnxruntime-node'].version = version;

    // Write updated manifest
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    console.log(`\n✅ Updated ${MANIFEST_PATH}`);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

main();
