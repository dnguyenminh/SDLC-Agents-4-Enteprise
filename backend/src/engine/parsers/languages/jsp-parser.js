import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

export default class JspParser extends GenericTreeSitterParser {
  parse(source, filePath) {
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    const jspPageName = fileName.replace(/\.jsp$/i, '');
    const symbols = [{
      name: jspPageName,
      kind: 'jsp_page',
      filePath,
      startLine: 1,
      endLine: 1,
      startColumn: 0,
      endColumn: 0,
      signature: ''
    }];
    const relationships = [];
    try {
      const tree = this.parser.parse(source);
      const root = tree.rootNode;
      if (!root) {
        return { symbols, relationships, errors: [] };
      }
      const javaSnippets = [];
      const tagUsages = [];
      const walk = (node) => {
        if (!node) return;
        const type = node.type;
        try {
          if (type === 'scriptlet' || type === 'expression' || type === 'declaration' || type === 'jsp_scriptlet') {
            const text = source.substring(node.startIndex, node.endIndex);
            javaSnippets.push(text);
          }
          if (type === 'jsp_element' || type === 'tag' || type === 'element') {
            let name = null;
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child && (child.type === 'tag_name' || child.type === 'name')) {
                name = source.substring(child.startIndex, child.endIndex);
                break;
              }
            }
            if (name) {
              tagUsages.push({ name, node });
            }
          }
          if (type === 'directive') {
            const dirText = source.substring(node.startIndex, node.endIndex);
            const m = /<%@\s*(\w+)/.exec(dirText);
            if (m) {
              symbols.push({
                name: m[1],
                kind: 'tag',
                filePath,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                startColumn: node.startPosition.column,
                endColumn: node.endPosition.column,
                signature: ''
              });
            }
          }
          for (let i = 0; i < node.childCount; i++) {
            walk(node.child(i));
          }
        } catch { /* ignore: snippet extraction is best-effort */ }
      };
      walk(root);
      const javaCode = javaSnippets.join('\n');
      if (javaCode.trim()) {
        const classRegex = /class\s+([A-Za-z_]\w*)/g;
        let m;
        while ((m = classRegex.exec(javaCode)) !== null) {
          symbols.push({
            name: m[1],
            kind: 'class',
            filePath,
            startLine: 1,
            endLine: 1,
            startColumn: 0,
            endColumn: 0,
            signature: ''
          });
        }
        const methodRegex = /(public|private|protected)?\s*(static)?\s*[\w<>[\]]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g;
        while ((m = methodRegex.exec(javaCode)) !== null) {
          symbols.push({
            name: m[3],
            kind: 'method',
            filePath,
            startLine: 1,
            endLine: 1,
            startColumn: 0,
            endColumn: 0,
            signature: ''
          });
        }
      }
      for (const t of tagUsages) {
        symbols.push({
          name: t.name,
          kind: 'tag',
          filePath,
          startLine: t.node.startPosition.row + 1,
          endLine: t.node.endPosition.row + 1,
          startColumn: t.node.startPosition.column,
          endColumn: t.node.endPosition.column,
          signature: ''
        });
      }
      const formActionRegex = /action\s*=\s*"([^"]+)"/gi;
      let m;
      while ((m = formActionRegex.exec(source)) !== null) {
        const url = m[1];
        const controllerName = url.replace(/^[/?]+/, '').split('?')[0].split('/')[0] || url;
        relationships.push({
          sourceSymbol: jspPageName,
          targetSymbol: controllerName,
          kind: 'uses',
          filePath,
          line: 1
        });
      }
      const hrefRegex = /href\s*=\s*"\/([^"?#]+)"/gi;
      while ((m = hrefRegex.exec(source)) !== null) {
        const url = m[1];
        const controllerName = url.split('/')[0] || url;
        relationships.push({
          sourceSymbol: jspPageName,
          targetSymbol: controllerName,
          kind: 'uses',
          filePath,
          line: 1
        });
      }
      return { symbols, relationships, errors: [] };
    } catch (e) {
      // Regex fallback when tree-sitter is unavailable (wasmPath null):
      // extract <%@ directives as tags + form/href links as uses-relationships.
      const lineOf = (idx) => source.slice(0, idx).split('\n').length;
      const existingTags = new Set(symbols.filter(s => s.kind === 'tag').map(s => s.name));
      const dirRegex = /<%@\s*(\w+)/g;
      let dm;
      while ((dm = dirRegex.exec(source)) !== null) {
        if (existingTags.has(dm[1])) continue;
        existingTags.add(dm[1]);
        const ln = lineOf(dm.index);
        symbols.push({ name: dm[1], kind: 'tag', filePath, startLine: ln, endLine: ln, startColumn: 0, endColumn: 0, signature: '' });
      }
      const formActionRegex2 = /action\s*=\s*"([^"]+)"/gi;
      let fm;
      while ((fm = formActionRegex2.exec(source)) !== null) {
        const url = fm[1];
        const controllerName = url.replace(/^[/?]+/, '').split('?')[0].split('/')[0] || url;
        relationships.push({ sourceSymbol: jspPageName, targetSymbol: controllerName, kind: 'uses', filePath, line: lineOf(fm.index) });
      }
      const hrefRegex2 = /href\s*=\s*"\/([^"?#]+)"/gi;
      let hm;
      while ((hm = hrefRegex2.exec(source)) !== null) {
        const url = hm[1];
        const controllerName = url.split('/')[0] || url;
        relationships.push({ sourceSymbol: jspPageName, targetSymbol: controllerName, kind: 'uses', filePath, line: lineOf(hm.index) });
      }
      return { symbols, relationships, errors: [{ message: String(e) }] };
    }
  }
}
