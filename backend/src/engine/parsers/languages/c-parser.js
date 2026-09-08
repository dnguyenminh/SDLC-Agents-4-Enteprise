import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const C_NODE_MAP = {
  function: ['function_definition'],
  struct: ['struct_specifier'],
  enum: ['enum_specifier'],
  type: ['typedef'],
  variable: ['init_declarator', 'field_declaration']
};

export default class CParser extends GenericTreeSitterParser {
  constructor(parser, langId) {
    super(parser, langId, C_NODE_MAP);
  }
}
