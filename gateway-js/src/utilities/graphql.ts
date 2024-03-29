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
  TypeNode,
} from 'graphql';

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
