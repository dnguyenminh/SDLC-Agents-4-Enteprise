/**
 * Symbol extraction helpers for TypeScript-family grammars.
 * BR-18 facade — class/function members live in ./members/class-members.ts,
 * type-level declarations in ./members/type-declarations.ts.
 */

export {
  extractFunction,
  extractClass,
  extractClassMembers,
  extractMethod,
  extractProperty,
} from './members/class-members.js';

export {
  extractInterface,
  extractTypeAlias,
  extractEnum,
  extractVariableDeclaration,
} from './members/type-declarations.js';
