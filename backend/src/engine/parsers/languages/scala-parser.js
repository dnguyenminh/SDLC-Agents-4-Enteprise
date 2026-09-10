import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const SCALA_NODE_MAP = {
  function: ['function_definition'],
  class: ['class_definition', 'class'],
  trait: ['trait_definition', 'trait'],
  object: ['object_definition', 'object'],
  enum: ['enum_definition', 'enum'],
  type: ['type_definition', 'type'],
  variable: ['val_definition', 'var_definition'],
  property: ['val_definition', 'var_definition']
};

export default class ScalaParser extends GenericTreeSitterParser {
  constructor(parser, langId, nodeMap, skipScopeNodes) {
    super(parser, langId, SCALA_NODE_MAP, skipScopeNodes);
  }
}
