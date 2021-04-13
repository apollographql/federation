import {
  ASTKindToNode,
  ASTNode,
  DirectiveNode,
  FieldNode,
  GraphQLCompositeType,
  GraphQLDirective,
  GraphQLField,
  GraphQLInterfaceType,
  GraphQLNullableType,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLType,
  GraphQLUnionType,
  isListType,
  isNonNullType,
  Kind,
  ListTypeNode,
  NamedTypeNode,
  OperationDefinitionNode,
  parse,
  SchemaMetaFieldDef,
  SelectionNode,
  SelectionSetNode,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
  TypeNode,
} from 'graphql';
import { getArgumentValues } from 'graphql/execution/values';
import { assert } from './assert';

/**
 * Not exactly the same as the executor's definition of getFieldDef, in this
 * statically evaluated environment we do not always have an Object type,
 * and need to handle Interface and Union types.
 */
export function getFieldDef(
  schema: GraphQLSchema,
  parentType: GraphQLCompositeType,
  fieldName: string,
): GraphQLField<any, any> | undefined {
  if (
    fieldName === SchemaMetaFieldDef.name &&
    schema.getQueryType() === parentType
  ) {
    return SchemaMetaFieldDef;
  }
  if (
    fieldName === TypeMetaFieldDef.name &&
    schema.getQueryType() === parentType
  ) {
    return TypeMetaFieldDef;
  }
  if (
    fieldName === TypeNameMetaFieldDef.name &&
    (parentType instanceof GraphQLObjectType ||
      parentType instanceof GraphQLInterfaceType ||
      parentType instanceof GraphQLUnionType)
  ) {
    return TypeNameMetaFieldDef;
  }
  if (
    parentType instanceof GraphQLObjectType ||
    parentType instanceof GraphQLInterfaceType
  ) {
    return parentType.getFields()[fieldName];
  }

  return undefined;
}

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

export function parseSelectionSet(source: string): SelectionSetNode {
  return (parse(`query ${source}`)
    .definitions[0] as OperationDefinitionNode).selectionSet;
}

export function parseSelections(source: string): ReadonlyArray<SelectionNode> {
  return (parse(`query { ${source} }`)
    .definitions[0] as OperationDefinitionNode).selectionSet.selections;
}

// Using `getArgumentValues` from `graphql-js` ensures that arguments are of the right type,
// and that required arguments are present.

export function getArgumentValuesForDirective(
  directiveDef: GraphQLDirective,
  node: { directives?: readonly DirectiveNode[] } & ASTNode,
): Record<string, any> | undefined {
  assert(
    !directiveDef.isRepeatable,
    'Use getArgumentValuesForRepeatableDirective for repeatable directives',
  );

  if (!node.directives) return undefined;

  const directiveNode = node.directives.find(
    (directiveNode) => directiveNode.name.value === directiveDef.name,
  );

  if (!directiveNode) return undefined;
  return getArgumentValues(directiveDef, directiveNode);
}

export function getArgumentValuesForRepeatableDirective(
  directiveDef: GraphQLDirective,
  node: { directives?: readonly DirectiveNode[] } & ASTNode,
): Record<string, any>[] {
  if (!node.directives) return [];

  const directiveNodes = node.directives.filter(
    (directiveNode) => directiveNode.name.value === directiveDef.name,
  );

  return directiveNodes.map((directiveNode) =>
    getArgumentValues(directiveDef, directiveNode),
  );
}

export function isASTKind<K extends ASTNode['kind']>(...kinds: K[]) {
  return (node: ASTNode): node is ASTKindToNode[K] =>
    kinds.some((kind) => node.kind === kind);
}
