import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const PHP_NODE_MAP = {
  function: ['function_definition'],
  class: ['class_declaration'],
  interface: ['interface_declaration'],
  enum: ['enum_declaration'],
  type: ['type_alias_declaration'],
  variable: ['variable_name'],
  property: ['property_declaration']
};

export default class PhpParser extends GenericTreeSitterParser {
  constructor(parser, langId, nodeMap, skipScopeNodes) {
    super(parser, langId, PHP_NODE_MAP, skipScopeNodes);
  }
}
