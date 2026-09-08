import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const SCALA_NODE_MAP = {
  function: ['def'],
  class: ['class_declaration', 'class'],
  trait: ['trait_declaration', 'trait'],
  object: ['object_declaration', 'object'],
  enum: ['enum_declaration', 'enum'],
  type: ['type_definition', 'type'],
  variable: ['val_declaration', 'var_declaration'],
  property: ['val_declaration', 'var_declaration']
};

export default class ScalaParser extends GenericTreeSitterParser {
  constructor(parser, langId, nodeMap, skipScopeNodes) {
    super(parser, langId, SCALA_NODE_MAP, skipScopeNodes);
  }
}
