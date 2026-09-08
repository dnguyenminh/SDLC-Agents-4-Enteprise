export class GenericTreeSitterParser {
  constructor(parser, langId, nodeMap) {
    this.parser = parser;
    this.langId = langId;
    this.nodeMap = nodeMap || this.defaultNodeMap();
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
    // Try named child 'name' or 'identifier'
    const nameChild = node.namedChild ? (() => {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child && (child.type === 'name' || child.type === 'identifier')) {
          return child;
        }
      }
      return null;
    })() : null;
    if (nameChild) {
      return source.substring(nameChild.startIndex, nameChild.endIndex);
    }
    // fallback to first named child
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
            const name = this.getNodeName(node, source);
            if (name) {
              symbols.push({
                name,
                kind,
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
    return { symbols, relationships, errors };
  }
}
