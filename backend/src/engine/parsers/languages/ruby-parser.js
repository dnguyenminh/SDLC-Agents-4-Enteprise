import { GenericTreeSitterParser } from './generic-tree-sitter-parser.js';

const RUBY_NODE_MAP = {
  function: ['method'],
  class: ['class'],
  module: ['module'],
  enum: ['enum'],
  type: ['type'],
  variable: ['assignment']
};

export default class RubyParser extends GenericTreeSitterParser {
  constructor(parser, langId, nodeMap, skipScopeNodes) {
    super(parser, langId, RUBY_NODE_MAP, skipScopeNodes);
  }
}
