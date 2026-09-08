import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const CPP_NODE_MAP = {
  function: ['function_definition', 'function_declarator'],
  class: ['class_specifier', 'class_declaration'],
  struct: ['struct_specifier'],
  enum: ['enum_specifier'],
  type: ['type_alias_declaration'],
  variable: ['init_declarator']
};

export default class CppParser extends GenericTreeSitterParser {
  constructor(parser, langId) {
    super(parser, langId, CPP_NODE_MAP);
  }
}
