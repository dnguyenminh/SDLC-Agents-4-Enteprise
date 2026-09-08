export class GenericTreeSitterParser {
  constructor(parser, langId, nodeMap) {
    this.parser = parser;
    this.langId = langId;
    this.nodeMap = nodeMap || this.defaultNodeMap();
  }

  getAncestor(node, types, skipTypes = []) {
    let cur = node.parent;
    while (cur) {
      if (skipTypes.includes(cur.type)) {
        cur = cur.parent;
        continue;
      }
      if (types.includes(cur.type)) return cur;
      cur = cur.parent;
    }
    return null;
  }

  defaultNodeMap() {
    return {
      function: ['function_definition', 'method_definition', 'function_declaration'],
      class: ['class_declaration', 'struct_specifier', 'struct_declaration', 'class_specifier'],
      interface: ['interface_declaration', 'interface_specifier'],
      enum: ['enum_specifier', 'enum_declaration'],
      type: ['type_alias_declaration', 'typedef'],
      variable: ['variable_declaration'],
      module: ['module_declaration']
    };
  }

  getNodeName(node, source) {
    const findIdentifier = (n) => {
      if (!n) return null;
      if (n.type === 'identifier' || n.type === 'field_identifier' || n.type === 'name') {
        return n;
      }
      for (let i = 0; i < n.namedChildCount; i++) {
        const child = n.namedChild(i);
        const found = findIdentifier(child);
        if (found) return found;
      }
      return null;
    };
    const nameNode = findIdentifier(node);
    if (nameNode) {
      return source.substring(nameNode.startIndex, nameNode.endIndex);
    }
    // fallback to first named child text to avoid null
    if (node.namedChildCount > 0) {
      const child = node.namedChild(0);
      return source.substring(child.startIndex, child.endIndex);
    }
    return null;
  }

  parse(source, filePath) {
    const symbols = [];
    const relationships = [];
    const errors = [];
    if (!this.parser) {
      return { symbols, relationships, errors };
    }
    try {
      const tree = this.parser.parse(source);
      const root = tree.rootNode;
      if (root && root.hasError) {
        // collect errors
        const walk = (node) => {
          if (node.type === 'ERROR') {
            errors.push({
              message: 'Parse error',
              line: node.startPosition.row + 1,
              column: node.startPosition.column
            });
          }
          for (let i = 0; i < node.childCount; i++) {
            walk(node.child(i));
          }
        };
        walk(root);
        if (errors.length > 10) errors.length = 10;
      }
      // walk tree
      const stack = [root];
      while (stack.length) {
        const node = stack.pop();
        if (!node) continue;
        // check if node matches any kind
        for (const [kind, types] of Object.entries(this.nodeMap)) {
          if (types.includes(node.type)) {
            let finalKind = kind;
            // Promote function to method if inside class/struct, skip namespace and scope nodes
            if (kind === 'function' && node.type.includes('function')) {
              const anc = this.getAncestor(
                node,
                ['class_specifier','class_declaration','struct_specifier','struct_declaration'],
                ['namespace_definition','declaration_list','translation_unit']
              );
              if (anc) finalKind = 'method';
            }
            const name = this.getNodeName(node, source);
            if (name) {
              symbols.push({
                name,
                kind: finalKind,
                filePath,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                startColumn: node.startPosition.column,
                endColumn: node.endPosition.column
              });
            }
          }
        }
        for (let i = node.childCount - 1; i >= 0; i--) {
          const child = node.child(i);
          if (child) stack.push(child);
        }
      }
    } catch (e) {
      errors.push({ message: String(e), line: 0, column: 0 });
    }
    // Deduplicate by name+kind+startLine
    const seen = new Set();
    const deduped = [];
    for (const s of symbols) {
      const key = `${s.name}|${s.kind}|${s.startLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }
    return { symbols: deduped, relationships, errors };
  }
}
