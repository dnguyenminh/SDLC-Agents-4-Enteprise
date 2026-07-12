import type { SyntaxNode, ExtractedRelationship } from '../../types.js';
import { getNodeText, findNodes } from '../../ast-utils.js';
import { hasVisibilityModifier } from './helpers.js';

interface UsePath {
  fullPath: string;
  alias: string | null;
  glob: boolean;
}

export function extractUseDeclarations(
  root: SyntaxNode, source: string, filePath: string,
  relationships: ExtractedRelationship[],
): void {
  const useDecls = findNodes(root, 'use_declaration');
  for (const decl of useDecls) {
    const isPublic = hasVisibilityModifier(decl);
    const argument = decl.childForFieldName('argument');
    if (!argument) continue;
    const paths = expandUsePath(argument, source, '');
    for (const usePath of paths) {
      relationships.push({
        sourceSymbol: filePath, targetSymbol: usePath.fullPath,
        kind: 'imports', filePath, line: decl.startPosition.row + 1,
        metadata: {
          alias: usePath.alias, pub_use: isPublic,
          glob: usePath.glob, module: usePath.fullPath,
        },
      });
    }
  }
}

function expandUsePath(node: SyntaxNode, source: string, prefix: string): UsePath[] {
  const text = getNodeText(node, source);
  switch (node.type) {
    case 'scoped_identifier':
    case 'identifier':
    case 'crate':
    case 'self':
    case 'super':
      return [{ fullPath: prefix + text, alias: null, glob: false }];
    case 'use_as_clause': {
      const pathNode = node.childForFieldName('path');
      const aliasNode = node.childForFieldName('alias');
      const path = pathNode ? getNodeText(pathNode, source) : text;
      const alias = aliasNode ? getNodeText(aliasNode, source) : null;
      return [{ fullPath: prefix + path, alias, glob: false }];
    }
    case 'use_wildcard':
      return [{ fullPath: prefix + '*', alias: null, glob: true }];
    case 'use_list': {
      const results: UsePath[] = [];
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) results.push(...expandUsePath(child, source, prefix));
      }
      return results;
    }
    case 'scoped_use_list': {
      const scopePath = node.childForFieldName('path');
      const list = node.childForFieldName('list');
      const newPrefix = scopePath ? prefix + getNodeText(scopePath, source) + '::' : prefix;
      if (list) return expandUsePath(list, source, newPrefix);
      return [{ fullPath: newPrefix.replace(/::$/, ''), alias: null, glob: false }];
    }
    default:
      return [{ fullPath: prefix + text, alias: null, glob: false }];
  }
}
