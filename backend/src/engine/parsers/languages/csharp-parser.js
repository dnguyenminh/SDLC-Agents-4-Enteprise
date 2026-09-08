import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const CSHARP_NODE_MAP = {
  function: ['method_declaration', 'function_declaration'],
  class: ['class_declaration'],
  interface: ['interface_declaration'],
  enum: ['enum_declaration'],
  type: ['type_declaration'],
  variable: ['variable_declaration']
};

export default class CsharpParser extends GenericTreeSitterParser {
  constructor(parser, langId) {
    super(parser, langId, CSHARP_NODE_MAP);
  }
}
