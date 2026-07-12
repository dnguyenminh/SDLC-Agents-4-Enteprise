/**
 * Manifest data for better-sqlite3 native bindings.
 * Embedded from release-manifest.json.
 */

interface BinaryEntry {
  url: string;
  sha256: string;
  size: number;
}

interface NativeManifest {
  version: string;
  releaseUrl: string;
  binaries: Record<string, BinaryEntry>;
}

const MANIFEST: NativeManifest = {
  version: '12.10.0',
  releaseUrl: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/tag/better-sqlite3-v12.10.0',
  binaries: {
    'node-v20-win32-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v20-win32-x64.node',
      sha256: 'b165e37c93f9a5e2b246ab3feb29ccfc66c221c8368ca744a820be57b0b81055',
      size: 1912832,
    },
    'node-v20-darwin-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v20-darwin-x64.node',
      sha256: '4b62eb165db8d64f67675e68a0ce2ac7fd0faa4da0399fc5bc033cf341adcbca',
      size: 1931184,
    },
    'node-v20-darwin-arm64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v20-darwin-arm64.node',
      sha256: '7748c91a71319897b00b0e1386246980dd06a0d083d906ef633926a4b0e7c4f7',
      size: 1914640,
    },
    'node-v20-linux-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v20-linux-x64.node',
      sha256: '308dc665be61af8faf8a272188ab1ac26710cf3e681fbefc32791ccf2b17ebc0',
      size: 2212536,
    },
    'node-v22-win32-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v22-win32-x64.node',
      sha256: 'b936c55e4d59433fce3e84b6e98ccdc8af0e7eb9243d0c12f1570045da972b9f',
      size: 1918464,
    },
    'node-v22-darwin-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v22-darwin-x64.node',
      sha256: 'd74ae4ac4261c1266fed01da1e8474e001253493db3ce062cfac03720385999d',
      size: 1931472,
    },
    'node-v22-darwin-arm64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v22-darwin-arm64.node',
      sha256: 'd74ae4ac4261c1266fed01da1e8474e001253493db3ce062cfac03720385999d',
      size: 1931472,
    },
    'node-v22-linux-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v22-linux-x64.node',
      sha256: '1ba30ab367585433049007c732f0d83423584697636474ab99b9c64911650bd3',
      size: 2118112,
    },
    'node-v24-win32-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v24-win32-x64.node',
      sha256: 'c045b58a00aeb5939d77d1901df4be384dff49ec452de93fdb02efe8d25fa9f5',
      size: 1918464,
    },
    'node-v24-darwin-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v24-darwin-x64.node',
      sha256: 'cefecba1ccc5912528e86d15bbc1f9080ce2e81f10cd8ba2dd89296ee1e7444a',
      size: 1931856,
    },
    'node-v24-darwin-arm64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v24-darwin-arm64.node',
      sha256: 'cefecba1ccc5912528e86d15bbc1f9080ce2e81f10cd8ba2dd89296ee1e7444a',
      size: 1931856,
    },
    'node-v24-linux-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v24-linux-x64.node',
      sha256: '4a6fdb191fdd1f9c0522e6932accc940f4e2a2f15a3b8c9008e57ad88d24872a',
      size: 2122416,
    },
    'node-v25-win32-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v25-win32-x64.node',
      sha256: '58cb9c693c6174fe96d55c3fe9e0802dcdd9301fa9b07bb5e8fdc35eab44090c',
      size: 1920000,
    },
    'node-v25-darwin-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v25-darwin-x64.node',
      sha256: 'fce741de632e5242334cfdcc6d818414fdb28273b4cbf67b9ac3f38178eff281',
      size: 1932624,
    },
    'node-v25-darwin-arm64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v25-darwin-arm64.node',
      sha256: 'fce741de632e5242334cfdcc6d818414fdb28273b4cbf67b9ac3f38178eff281',
      size: 1932624,
    },
    'node-v25-linux-x64': {
      url: 'https://github.com/dnguyenminh/Kiro-SDLC-Agents/releases/download/better-sqlite3-v12.10.0/better-sqlite3-v12.10.0-node-v25-linux-x64.node',
      sha256: 'c632c95ef5ce07b8f2734da09bc7e549a7aa005c1df1710f61202618374c5545',
      size: 2162440,
    },
  },
};

export { BinaryEntry, NativeManifest, MANIFEST };
