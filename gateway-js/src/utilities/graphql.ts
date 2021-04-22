import {
  ASTNode,
  FieldNode,
  GraphQLNullableType,
  GraphQLType,
  isListType,
  isNonNullType,
  Kind,
  ListTypeNode,
  NamedTypeNode,
  OperationDefinitionNode,
  parse,
  SelectionNode,
  TypeNode,
} from 'graphql';
import { assert } from './assert';

export function getResponseName(node: FieldNode): string {
  return node.alias ? node.alias.value : node.name.value;
}

export function allNodesAreOfSameKind<T extends ASTNode>(
  firstNode: T,
  remainingNodes: ASTNode[],
): remainingNodes is T[] {
  return !remainingNodes.some(node => node.kind !== firstNode.kind);
}

export function astFromType(
  type: GraphQLNullableType,
): NamedTypeNode | ListTypeNode;
export function astFromType(type: GraphQLType): TypeNode {
  if (isListType(type)) {
    return { kind: Kind.LIST_TYPE, type: astFromType(type.ofType) };
  } else if (isNonNullType(type)) {
    return { kind: Kind.NON_NULL_TYPE, type: astFromType(type.ofType) };
  } else {
    return {
      kind: Kind.NAMED_TYPE,
      name: { kind: Kind.NAME, value: type.name },
    };
  }
}

/**
 * For lack of a "home of federation utilities", this function is copy/pasted
 * verbatim across the federation, gateway, and query-planner packages. Any changes
 * made here should be reflected in the other two locations as well.
 *
 * @param source A string representing a FieldSet
 * @returns A parsed FieldSet
 */
export function parseSelections(source: string): ReadonlyArray<SelectionNode> {
  const parsed = parse(`{${source}}`);
  assert(
    parsed.definitions.length === 1,
    `Invalid FieldSet provided: '${source}'. FieldSets may not contain operations within them.`,
  );
  return (parsed.definitions[0] as OperationDefinitionNode).selectionSet
    .selections;
}
