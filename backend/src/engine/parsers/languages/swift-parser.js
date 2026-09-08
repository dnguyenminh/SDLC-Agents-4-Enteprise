import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const SWIFT_NODE_MAP = {
  function: ['function_declaration', 'func'],
  class: ['class_declaration', 'class'],
  struct: ['struct_declaration', 'struct'],
  enum: ['enum_declaration', 'enum'],
  protocol: ['protocol_declaration', 'protocol'],
  variable: ['variable_declaration']
};

export default class SwiftParser extends GenericTreeSitterParser {
  constructor(parser, langId) {
    super(parser, langId, SWIFT_NODE_MAP);
  }
}
