import {
  FieldNode,
  getNamedType,
  GraphQLCompositeType,
  GraphQLField,
  isCompositeType,
  Kind,
  SelectionNode,
  SelectionSetNode,
  GraphQLObjectType,
  DirectiveNode,
} from 'graphql';
import { getResponseName } from './utilities/graphql';
import { partition, groupBy } from './utilities/array';

export interface Field<
  TParent extends GraphQLCompositeType = GraphQLCompositeType
> {
  scope: Scope<TParent>;
  fieldNode: FieldNode;
  fieldDef: GraphQLField<any, any>;
}

/**
 * Provides a string representation of a field suitable for debugging.
 *
 * The format looks like '(a: Int)<A [A1, A2]>' where 'a' is the field name, 'Int' is its type, and '<...>' is its
 * scope (@see debugScope for details).
 *
 * @param field - the field object to convert.
 * @return a string representation of the field.
 */
export function debugPrintField(field: Field) : string {
  const def = field.fieldDef;
  return `(${def.name}: ${def.type})${debugPrintScope(field.scope)}`;
}

export interface Scope<TParent extends GraphQLCompositeType> {
  parentType: TParent;
  possibleTypes: ReadonlyArray<GraphQLObjectType>;
  directives?: ReadonlyArray<DirectiveNode>
  enclosingScope?: Scope<GraphQLCompositeType>;
}

/**
 * Provides a string representation of a field suitable for debugging.
 *
 * The format looks like '<A [A1, A2]>' where 'A' is the scope 'parentType' and '[A1, A2]' are the 'possibleTypes'.
 *
 * @param scope - the scope object to convert.
 * @param deepDebug - whether to also display enclosed scopes.
 * @return a string representation of the scope.
 */
export function debugPrintScope<TParent extends GraphQLCompositeType>(
  scope: Scope<TParent>, deepDebug: boolean = false) : string {
  let enclosingStr = '';
  if (scope.enclosingScope) {
    if (deepDebug) {
      enclosingStr = ' -> ' + debugPrintScope(scope.enclosingScope);
    } else {
      enclosingStr = ' ⋯'; // show an elipsis so we know there is an enclosing scope, but it's just not displayed.
    }
  }
  return`<${scope.parentType} [${scope.possibleTypes}]${enclosingStr}>`;
}

export type FieldSet = Field[];
export type NonemptyFieldSet = [Field, ...FieldSet];

export function printFields(fields?: FieldSet) {
  if (!fields) return '[]';
  return (
    '[' +
    fields
      .map(field => `"${field.scope.parentType.name}.${field.fieldDef.name}"`)
      .join(', ') +
    ']'
  );
}

/**
 * Provides a string representation of a field set for debugging.
 *
 * The format is the list of fields as displayed by `debugField` within square brackets.
 *
 * @param fields - the field set object to convert.
 * @return a string representation of the field.
 */
export function debugPrintFields(fields?: FieldSet) : string {
  if (!fields) return '[]';
  return '[' + fields.map(debugPrintField).join(', ') + ']'
}

export function matchesField(field: Field) {
  // TODO: Compare parent type and arguments
  return (otherField: Field) => {
    return field.fieldDef.name === otherField.fieldDef.name;
  };
}

export const groupByResponseName = groupBy<Field, string>(field =>
  getResponseName(field.fieldNode)
);

export const groupByParentType = groupBy<Field, GraphQLCompositeType>(
  field => field.scope.parentType,
);

// FIXME This function should probably take in a NonEmptyFieldSet because
// selection sets aren't allowed to have no selections. (Or perhaps we should
// keep going until we can just make `type FieldSet = [Field, ...Field[]]`.) But
// trying this exposes a bunch of hard for me to follow logic around whether or
// not FetchGroup.fields always ends up non-empty by certain points in the
// logic. There might be some real bugs masked there, or maybe not.
export function selectionSetFromFieldSet(
  fields: FieldSet,
  parentType?: GraphQLCompositeType,
): SelectionSetNode {
  return {
    kind: Kind.SELECTION_SET,
    selections: Array.from(groupByParentType(fields)).flatMap(
      ([typeCondition, fieldsByParentType]) => {
        const directives = fieldsByParentType[0].scope.directives;

        return wrapInInlineFragmentIfNeeded(
          Array.from(groupByResponseName(fieldsByParentType).values()).map(
            (fieldsByResponseName) => {
              return combineFields(fieldsByResponseName).fieldNode;
            },
          ),
          typeCondition,
          parentType,
          directives,
        );
      },
    ),
  };
}

function wrapInInlineFragmentIfNeeded(
  selections: SelectionNode[],
  typeCondition: GraphQLCompositeType,
  parentType?: GraphQLCompositeType,
  directives?: ReadonlyArray<DirectiveNode>
): SelectionNode[] {
  return typeCondition === parentType
    ? selections
    : [
        {
          kind: Kind.INLINE_FRAGMENT,
          typeCondition: {
            kind: Kind.NAMED_TYPE,
            name: {
              kind: Kind.NAME,
              value: typeCondition.name,
            },
          },
        selectionSet: { kind: Kind.SELECTION_SET, selections },
        directives
        },
      ];
}

function combineFields(
  fields: NonemptyFieldSet,
): Field {
  const { scope, fieldNode, fieldDef } = fields[0];
  const returnType = getNamedType(fieldDef.type);

  if (isCompositeType(returnType)) {
    return {
      scope,
      fieldNode: {
        ...fieldNode,
        selectionSet: mergeSelectionSets(fields.map(field => field.fieldNode)),
      },
      fieldDef,
    };
  } else {
    return { scope, fieldNode, fieldDef };
  }
}

function mergeSelectionSets(fieldNodes: FieldNode[]): SelectionSetNode {
  const selections: SelectionNode[] = [];

  for (const fieldNode of fieldNodes) {
    if (!fieldNode.selectionSet) continue;

    selections.push(...fieldNode.selectionSet.selections);
  }

  return {
    kind: 'SelectionSet',
    selections: mergeFieldNodeSelectionSets(selections),
  };
}

function mergeFieldNodeSelectionSets(
  selectionNodes: SelectionNode[],
): SelectionNode[] {
  const [fieldNodes, fragmentNodes] = partition(
    selectionNodes,
    (node): node is FieldNode => node.kind === Kind.FIELD,
  );

  const mergedFieldNodes = Array.from(
    groupBy((node: FieldNode) => node.alias?.value ?? node.name.value)(
      fieldNodes,
    ).values(),
  ).map((nodesWithSameResponseName) => {
    const node = { ...nodesWithSameResponseName[0] };
    if (node.selectionSet) {
      node.selectionSet = {
        ...node.selectionSet,
        selections: mergeFieldNodeSelectionSets(
          nodesWithSameResponseName.flatMap(
            (node) => node.selectionSet?.selections || [],
          ),
        ),
      };
    }
    return node;
  });

  return [...mergedFieldNodes, ...fragmentNodes];
}
