/**
 * CJS bundle fix for `import.meta` in bundled @earendil-works/pi-* packages.
 *
 * Root cause (UAT 2026-09-30): esbuild `format: 'cjs'` empties `import.meta`
 * (it becomes `{}`), so pi-coding-agent/dist/config.js:10 ran
 * `fileURLToPath(import.meta.url)` →
 *   The "path" argument must be of type string or an instance of URL. Received undefined
 * at module top level. The throw surfaced in createWorkspaceTools() and the
 * extension loader → every turn shipped tools=0.
 *
 * Fix: prepend a banner declaring helpers from the REAL bundle path (`__filename`,
 * valid in CJS) and `define`-rewrite `import.meta.url` / `import.meta.resolve`
 * to them. `extension/src` itself contains no `import.meta` usage, so the define
 * is safe bundle-wide.
 *
 * resolve helper details (pi loader's `resolveWorkspaceOrImport` fallback):
 * - pi packages export ONLY the `import` condition → CJS-default resolution
 *   fails ("No exports main defined") → resolve with `conditions: import`.
 * - pi-tui/typebox are NESTED under pi-coding-agent/node_modules → not visible
 *   from the bundle's walk-up → second attempt resolves from pi-coding-agent's
 *   package dir (itself resolved via its `import` main → dist/index.js).
 *
 * Alternative (externalize pi + ship node_modules in the vsix) was rejected:
 * deps are hoisted to the monorepo root, outside vsce's package dir.
 */
const piImportMetaBanner = [
  'var __PI_IMPORT_META_URL = require("url").pathToFileURL(__filename).href;',
  'var __PI_IMPORT_META_RESOLVE = (function () {',
  '  var __path = require("path");',
  '  var __toUrl = require("url").pathToFileURL;',
  '  var __cond = new Set(["import", "node", "default"]);',
  '  var __pcaDir;',
  '  return function (s) {',
  '    try { return __toUrl(require.resolve(s, { conditions: __cond })).href; } catch (e) {}',
  '    if (__pcaDir === undefined) {',
  '      __pcaDir = null;',
  '      try {',
  '        var __m = require.resolve("@earendil-works/pi-coding-agent", { conditions: __cond });',
  '        __pcaDir = __path.dirname(__path.dirname(__m));',
  '      } catch (e) {}',
  '    }',
  '    if (__pcaDir) {',
  '      try { return __toUrl(require.resolve(s, { conditions: __cond, paths: [__pcaDir] })).href; } catch (e) {}',
  '    }',
  '    return __toUrl(require.resolve(s, { conditions: __cond })).href;',
  '  };',
  '})();',
].join('\n');

const piImportMetaDefine = {
  'import.meta.url': '__PI_IMPORT_META_URL',
  'import.meta.resolve': '__PI_IMPORT_META_RESOLVE',
};

module.exports = { piImportMetaBanner, piImportMetaDefine };
