import type { SyntaxNode, ExtractedRelationship } from '../../types.js';
import { getNodeText, getNamedChild, findNodes } from '../../ast-utils.js';
import { getBaseTypeName, resolveCallTarget } from '../common.js';
import { inferSObjectFromDML } from './helpers.js';

export function extractApexDML(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const dmlNodes = findNodes(body, 'dml_expression');
  for (const dml of dmlNodes) {
    const dmlType = dml.child(0);
    if (!dmlType) continue;
    const operation = getNodeText(dmlType, source).toUpperCase();
    const targetExpr = dml.child(1);
    if (!targetExpr) continue;
    const targetText = getNodeText(targetExpr, source);
    const sobject = inferSObjectFromDML(targetText);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: sobject || targetText,
      kind: 'dml' as any, filePath, line: dml.startPosition.row + 1,
      metadata: { operation },
    });
  }
}

export function extractApexSOQL(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const soqlNodes = findNodes(body, 'soql_expression');
  for (const soql of soqlNodes) {
    const soqlText = getNodeText(soql, source);
    const fromMatch = soqlText.match(/FROM\s+(\w+)/i);
    if (!fromMatch) continue;
    const sobject = fromMatch[1];
    const fieldsMatch = soqlText.match(/SELECT\s+(.+?)\s+FROM/i);
    const fields = fieldsMatch ? fieldsMatch[1].split(',').map(f => f.trim()) : [];
    relationships.push({
      sourceSymbol: callerName, targetSymbol: sobject,
      kind: 'soql' as any, filePath, line: soql.startPosition.row + 1,
      metadata: { fields },
    });
  }
}

export function extractApexCalls(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const seen = new Set<string>();
  const methodCalls = findNodes(body, 'method_invocation');
  for (const call of methodCalls) {
    const target = resolveCallTarget(call, source);
    if (!target) continue;
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: target,
      kind: 'calls', filePath, line: call.startPosition.row + 1,
    });
  }
  const creations = findNodes(body, 'object_creation_expression');
  for (const creation of creations) {
    const typeNode = getNamedChild(creation, 'type_identifier')
      ?? getNamedChild(creation, 'scoped_type_identifier')
      ?? getNamedChild(creation, 'generic_type');
    if (!typeNode) continue;
    const typeName = getBaseTypeName(typeNode, source);
    const target = `${typeName}.constructor`;
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: target,
      kind: 'calls', filePath, line: creation.startPosition.row + 1,
      metadata: { constructor: true },
    });
  }
}

export function extractApexInheritance(
  node: SyntaxNode, source: string, filePath: string,
  className: string, relationships: ExtractedRelationship[],
): void {
  const superclass = getNamedChild(node, 'superclass');
  if (superclass) {
    const typeId = getNamedChild(superclass, 'type_identifier')
      ?? getNamedChild(superclass, 'scoped_type_identifier')
      ?? getNamedChild(superclass, 'generic_type');
    if (typeId) {
      relationships.push({
        sourceSymbol: className, targetSymbol: getBaseTypeName(typeId, source),
        kind: 'inherits', filePath, line: typeId.startPosition.row + 1,
      });
    }
  }
  const interfaces = getNamedChild(node, 'super_interfaces');
  if (interfaces) {
    const typeList = getNamedChild(interfaces, 'type_list');
    if (typeList) {
      for (let i = 0; i < typeList.namedChildCount; i++) {
        const typeNode = typeList.namedChild(i);
        if (!typeNode) continue;
        relationships.push({
          sourceSymbol: className, targetSymbol: getBaseTypeName(typeNode, source),
          kind: 'implements', filePath, line: typeNode.startPosition.row + 1,
        });
      }
    }
  }
}
