/**
 * KSA-164: CFG Statement Handlers — Statement processing for CFG construction.
 * Extracted from CFGBuilder to keep each file under 200 lines.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import { BasicBlock } from './BasicBlock.js';
import { ControlFlowGraph } from './ControlFlowGraph.js';

type NewBlockFn = (type: BasicBlock['type']) => BasicBlock;

export function getFunctionBody(node: SyntaxNode, _language: string): SyntaxNode | null {
  const body = node.childForFieldName('body');
  if (body) return body;
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && (child.type === 'statement_block' || child.type === 'block')) {
      return child;
    }
  }
  return null;
}

export function processStatements(blockNode: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  let active: BasicBlock | null = currentBlock;
  for (let i = 0; i < blockNode.namedChildCount; i++) {
    const stmt = blockNode.namedChild(i);
    if (!stmt || !active) break;
    active = processStatement(stmt, active, exitBlock, cfg, newBlock);
  }
  return active;
}

export function processStatement(stmt: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  switch (stmt.type) {
    case 'if_statement': return handleIf(stmt, currentBlock, exitBlock, cfg, newBlock);
    case 'while_statement': case 'do_statement': return handleWhile(stmt, currentBlock, exitBlock, cfg, newBlock);
    case 'for_statement': case 'for_in_statement': return handleFor(stmt, currentBlock, exitBlock, cfg, newBlock);
    case 'try_statement': return handleTryCatch(stmt, currentBlock, exitBlock, cfg, newBlock);
    case 'switch_statement': return handleSwitch(stmt, currentBlock, exitBlock, cfg, newBlock);
    case 'return_statement': case 'throw_statement':
      currentBlock.addStatement(stmt);
      cfg.addEdge(currentBlock, exitBlock, stmt.type === 'return_statement' ? 'return' : 'exception');
      return null;
    case 'break_statement': case 'continue_statement':
      currentBlock.addStatement(stmt);
      return null;
    default:
      currentBlock.addStatement(stmt);
      return currentBlock;
  }
}

export function handleIf(node: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  const condNode = node.childForFieldName('condition');
  if (condNode) currentBlock.addStatement(condNode);
  const mergeBlock = newBlock('normal');
  cfg.addBlock(mergeBlock);
  const consequence = node.childForFieldName('consequence');
  const thenBlock = newBlock('normal');
  cfg.addBlock(thenBlock);
  cfg.addEdge(currentBlock, thenBlock, 'branch-true');
  let thenEnd: BasicBlock | null = thenBlock;
  if (consequence) thenEnd = processBlockOrStatement(consequence, thenBlock, exitBlock, cfg, newBlock);
  if (thenEnd) cfg.addEdge(thenEnd, mergeBlock, 'sequential');
  const alternative = node.childForFieldName('alternative');
  if (alternative) {
    handleElseBranch(alternative, currentBlock, mergeBlock, exitBlock, cfg, newBlock);
  } else {
    cfg.addEdge(currentBlock, mergeBlock, 'branch-false');
  }
  return mergeBlock;
}

function handleElseBranch(alternative: SyntaxNode, currentBlock: BasicBlock, mergeBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): void {
  const elseBlock = newBlock('normal');
  cfg.addBlock(elseBlock);
  cfg.addEdge(currentBlock, elseBlock, 'branch-false');
  const elseBody = alternative.type === 'else_clause' ? alternative.namedChild(0) : alternative;
  let elseEnd: BasicBlock | null = elseBlock;
  if (elseBody) {
    if (elseBody.type === 'if_statement') {
      elseEnd = handleIf(elseBody, elseBlock, exitBlock, cfg, newBlock);
    } else {
      elseEnd = processBlockOrStatement(elseBody, elseBlock, exitBlock, cfg, newBlock);
    }
  }
  if (elseEnd) cfg.addEdge(elseEnd, mergeBlock, 'sequential');
}

export function handleWhile(node: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  const headerBlock = newBlock('loop-header');
  cfg.addBlock(headerBlock);
  cfg.addEdge(currentBlock, headerBlock, 'sequential');
  const condNode = node.childForFieldName('condition');
  if (condNode) headerBlock.addStatement(condNode);
  const postLoop = newBlock('normal');
  cfg.addBlock(postLoop);
  const body = node.childForFieldName('body');
  const bodyBlock = newBlock('normal');
  cfg.addBlock(bodyBlock);
  cfg.addEdge(headerBlock, bodyBlock, 'branch-true');
  cfg.addEdge(headerBlock, postLoop, 'loop-exit');
  let bodyEnd: BasicBlock | null = bodyBlock;
  if (body) bodyEnd = processBlockOrStatement(body, bodyBlock, exitBlock, cfg, newBlock);
  if (bodyEnd) cfg.addEdge(bodyEnd, headerBlock, 'loop-back');
  return postLoop;
}

export function handleFor(node: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  const init = node.childForFieldName('initializer');
  if (init) currentBlock.addStatement(init);
  const headerBlock = newBlock('loop-header');
  cfg.addBlock(headerBlock);
  cfg.addEdge(currentBlock, headerBlock, 'sequential');
  const condNode = node.childForFieldName('condition');
  if (condNode) headerBlock.addStatement(condNode);
  const postLoop = newBlock('normal');
  cfg.addBlock(postLoop);
  const bodyNode = node.childForFieldName('body');
  const bodyBlock = newBlock('normal'); cfg.addBlock(bodyBlock);
  cfg.addEdge(headerBlock, bodyBlock, 'branch-true');
  cfg.addEdge(headerBlock, postLoop, 'loop-exit');
  const bodyEnd = bodyNode ? processBlockOrStatement(bodyNode, bodyBlock, exitBlock, cfg, newBlock) : bodyBlock;
  const inc = node.childForFieldName('increment');
  if (inc && bodyEnd) bodyEnd.addStatement(inc);
  if (bodyEnd) cfg.addEdge(bodyEnd, headerBlock, 'loop-back');
  return postLoop;
}

export function handleTryCatch(node: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  const mergeBlock = newBlock('normal');
  cfg.addBlock(mergeBlock);
  const tryBody = node.childForFieldName('body');
  const tryBlock = newBlock('normal');
  cfg.addBlock(tryBlock);
  cfg.addEdge(currentBlock, tryBlock, 'sequential');
  let tryEnd: BasicBlock | null = tryBlock;
  if (tryBody) tryEnd = processBlockOrStatement(tryBody, tryBlock, exitBlock, cfg, newBlock);
  if (tryEnd) cfg.addEdge(tryEnd, mergeBlock, 'sequential');
  const handler = node.childForFieldName('handler');
  if (handler) handleCatchBlock(handler, tryBlock, mergeBlock, exitBlock, cfg, newBlock);
  const finalizer = node.childForFieldName('finalizer');
  if (finalizer) return handleFinallyBlock(finalizer, mergeBlock, exitBlock, cfg, newBlock);
  return mergeBlock;
}

function handleCatchBlock(handler: SyntaxNode, tryBlock: BasicBlock, mergeBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): void {
  const catchBlock = newBlock('catch');
  cfg.addBlock(catchBlock);
  cfg.addEdge(tryBlock, catchBlock, 'exception');
  const catchBody = handler.childForFieldName('body');
  let catchEnd: BasicBlock | null = catchBlock;
  if (catchBody) catchEnd = processBlockOrStatement(catchBody, catchBlock, exitBlock, cfg, newBlock);
  if (catchEnd) cfg.addEdge(catchEnd, mergeBlock, 'sequential');
}

function handleFinallyBlock(finalizer: SyntaxNode, mergeBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock {
  const finallyBlock = newBlock('normal');
  cfg.addBlock(finallyBlock);
  cfg.addEdge(mergeBlock, finallyBlock, 'sequential');
  const child = finalizer.namedChild(0);
  if (child) processBlockOrStatement(child, finallyBlock, exitBlock, cfg, newBlock);
  return finallyBlock;
}

export function handleSwitch(node: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  const value = node.childForFieldName('value');
  if (value) currentBlock.addStatement(value);
  const mergeBlock = newBlock('normal');
  cfg.addBlock(mergeBlock);
  const body = node.childForFieldName('body');
  if (!body) return mergeBlock;
  for (let i = 0; i < body.namedChildCount; i++) {
    const caseNode = body.namedChild(i);
    if (!caseNode) continue;
    handleSwitchCase(caseNode, currentBlock, exitBlock, cfg, newBlock, mergeBlock);
  }
  return mergeBlock;
}

function handleSwitchCase(caseNode: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn, mergeBlock: BasicBlock): void {
  const caseBlock = newBlock('normal');
  cfg.addBlock(caseBlock);
  cfg.addEdge(currentBlock, caseBlock, 'branch-true');
  let caseEnd: BasicBlock | null = caseBlock;
  for (let j = 0; j < caseNode.namedChildCount; j++) {
    const stmt = caseNode.namedChild(j);
    if (!stmt || !caseEnd) break;
    if (stmt.type === 'switch_case' || stmt.type === 'switch_default') continue;
    caseEnd = processStatement(stmt, caseEnd, exitBlock, cfg, newBlock);
  }
  if (caseEnd) cfg.addEdge(caseEnd, mergeBlock, 'sequential');
}

export function processBlockOrStatement(node: SyntaxNode, currentBlock: BasicBlock, exitBlock: BasicBlock, cfg: ControlFlowGraph, newBlock: NewBlockFn): BasicBlock | null {
  if (node.type === 'statement_block' || node.type === 'block') {
    return processStatements(node, currentBlock, exitBlock, cfg, newBlock);
  }
  return processStatement(node, currentBlock, exitBlock, cfg, newBlock);
}
