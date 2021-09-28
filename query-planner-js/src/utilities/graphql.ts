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
  SchemaMetaFieldDef,
  TokenKind,
  TypeMetaFieldDef,
  TypeNameMetaFieldDef,
  TypeNode,
  visit,
} from 'graphql';
import { getArgumentValues } from 'graphql/execution/values';
import { Parser } from 'graphql/language/parser';
import { FieldSet } from '../composedSchema';
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

/**
 * For lack of a "home of federation utilities", this function is copy/pasted
 * verbatim across the federation and query-planner packages. Any changes
 * made here should be reflected in the other location as well.
 *
 * @param source A string representing a FieldSet
 * @returns A parsed FieldSet
 */
 export function parseFieldSet(source: string): FieldSet {
  const parser = new Parser(`{${source}}`);

  parser.expectToken(TokenKind.SOF)
  const selectionSet = parser.parseSelectionSet();
  try {
    parser.expectToken(TokenKind.EOF);
  } catch {
    throw new Error(`Invalid FieldSet provided: '${source}'. FieldSets may not contain operations within them.`);
  }
  const selections = selectionSet.selections;
  // I'm not sure this case is possible - an empty string will first throw a
  // graphql syntax error. Can you get 0 selections any other way?
  assert(selections.length > 0, `Field sets may not be empty`);

  visit(selectionSet, {
    FragmentSpread() {
      throw Error(
        `Field sets may not contain fragment spreads, but found: "${source}"`,
      );
    },
  });

  // This cast is asserted above by the visitor, ensuring that both `selections`
  // and any recursive `selections` are not `FragmentSpreadNode`s
  return selections as FieldSet;
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
