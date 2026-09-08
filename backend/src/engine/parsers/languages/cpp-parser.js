import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const CPP_NODE_MAP = {
  function: ['function_definition'],
  method: ['function_definition'],
  class: ['class_specifier'],
  struct: ['struct_specifier'],
  enum: ['enum_specifier'],
  type: ['type_alias_declaration'],
  variable: ['init_declarator', 'field_declaration'],
  property: ['field_declaration']
};

export default class CppParser extends GenericTreeSitterParser {
  constructor(parser, langId) {
    super(parser, langId, CPP_NODE_MAP);
  }
}
