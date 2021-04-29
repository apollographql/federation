import {
  ASTNode,
  Kind,
  SelectionNode as GraphQLJSSelectionNode,
  visit,
} from 'graphql';
import prettyFormat from 'pretty-format';
import { queryPlanSerializer, astSerializer } from './snapshotSerializers';

export type ResponsePath = (string | number)[];

export interface QueryPlan {
  kind: 'QueryPlan';
  node?: PlanNode;
}

export type PlanNode = SequenceNode | ParallelNode | FetchNode | FlattenNode;

export interface SequenceNode {
  kind: 'Sequence';
  nodes: PlanNode[];
}

export interface ParallelNode {
  kind: 'Parallel';
  nodes: PlanNode[];
}

export interface FetchNode {
  kind: 'Fetch';
  serviceName: string;
  variableUsages?: string[];
  requires?: QueryPlanSelectionNode[];
  operation: string;
}

export interface FlattenNode {
  kind: 'Flatten';
  path: ResponsePath;
  node: PlanNode;
}

/**
 * SelectionNodes from GraphQL-js _can_ have a FragmentSpreadNode
 * but this SelectionNode is specifically typing the `requires` key
 * in a built query plan, where there can't be FragmentSpreadNodes
 * since that info is contained in the `FetchNode.operation`
 */
export type QueryPlanSelectionNode = QueryPlanFieldNode | QueryPlanInlineFragmentNode;

export interface QueryPlanFieldNode {
  readonly kind: 'Field';
  readonly alias?: string;
  readonly name: string;
  readonly selections?: QueryPlanSelectionNode[];
}

export interface QueryPlanInlineFragmentNode {
  readonly kind: 'InlineFragment';
  readonly typeCondition?: string;
  readonly selections: QueryPlanSelectionNode[];
}

export function serializeQueryPlan(queryPlan: QueryPlan) {
  return prettyFormat(queryPlan, {
    plugins: [queryPlanSerializer, astSerializer],
  });
}

export function getResponseName(node: QueryPlanFieldNode): string {
  return node.alias ? node.alias : node.name;
}

/**
 * Converts a GraphQL-js SelectionNode to our newly defined SelectionNode
 *
 * This function is used to remove the unneeded pieces of a SelectionSet's
 * `.selections`. It is only ever called on a query plan's `requires` field,
 * so we can guarantee there won't be any FragmentSpreads passed in. That's why
 * we can ignore the case where `selection.kind === Kind.FRAGMENT_SPREAD`
 */
export const trimSelectionNodes = (
  selections: readonly GraphQLJSSelectionNode[],
): QueryPlanSelectionNode[] => {
  /**
   * Using an array to push to instead of returning value from `selections.map`
   * because TypeScript thinks we can encounter a `Kind.FRAGMENT_SPREAD` here,
   * so if we mapped the array directly to the return, we'd have to `return undefined`
   * from one branch of the map and then `.filter(Boolean)` on that returned
   * array
   */
  const remapped: QueryPlanSelectionNode[] = [];

  selections.forEach((selection) => {
    if (selection.kind === Kind.FIELD) {
      remapped.push({
        kind: Kind.FIELD,
        name: selection.name.value,
        selections:
          selection.selectionSet &&
          trimSelectionNodes(selection.selectionSet.selections),
      });
    }
    if (selection.kind === Kind.INLINE_FRAGMENT) {
      remapped.push({
        kind: Kind.INLINE_FRAGMENT,
        typeCondition: selection.typeCondition?.name.value,
        selections: trimSelectionNodes(selection.selectionSet.selections),
      });
    }
  });

  return remapped;
};

/**
 * This function converts potential InlineFragmentNodes that WE created
 * (defined in ../QueryPlan, not graphql-js) to GraphQL-js compliant AST nodes
 * for the graphql-js printer to work with
 *
 * The arg type here SHOULD be (node: AstNode | SelectionNode (from ../QueryPlan)),
 * but that breaks the graphql-js visitor, as it won't allow our redefined
 * SelectionNode to be passed in.
 *
 * Since our SelectionNode still has a `kind`, this will still functionally work
 * at runtime to call the InlineFragment visitor defined below
 *
 * We have to cast the `fragmentNode as unknown` and then to an InlineFragmentNode
 * at the bottom though, since there's no way to cast it appropriately to an
 * `InlineFragmentNode` as defined in ../QueryPlan.ts. TypeScript will complain
 * about there not being overlapping fields
 */
 export function remapInlineFragmentNodes(node: ASTNode): ASTNode {
  return visit(node, {
    InlineFragment: (fragmentNode) => {
      // if the fragmentNode is already a proper graphql AST Node, return it
      if (fragmentNode.selectionSet) return fragmentNode;

      /**
       * Since the above check wasn't hit, we _know_ that fragmentNode is an
       * InlineFragmentNode from ../QueryPlan, but we can't actually type that
       * without causing ourselves a lot of headache, so we cast to unknown and
       * then to InlineFragmentNode (from ../QueryPlan) below
       */

      // if the fragmentNode is a QueryPlan InlineFragmentNode, convert it to graphql-js node
      return {
        kind: Kind.INLINE_FRAGMENT,
        typeCondition: fragmentNode.typeCondition
          ? {
              kind: Kind.NAMED_TYPE,
              name: {
                kind: Kind.NAME,
                value: fragmentNode.typeCondition,
              },
            }
          : undefined,
        selectionSet: {
          kind: Kind.SELECTION_SET,
          // we have to recursively rebuild the selectionSet using selections
          selections: remapSelections(
            ((fragmentNode as unknown) as QueryPlanInlineFragmentNode).selections,
          ),
        },
      };
    },
  });
}

export function remapSelections(
  selections: QueryPlanSelectionNode[],
): readonly GraphQLJSSelectionNode[] {
  return selections.map((selection) => {
    switch (selection.kind) {
      case Kind.FIELD:
        return {
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: selection.name,
          },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: remapSelections(selection.selections || []),
          },
        };
      case Kind.INLINE_FRAGMENT:
        return {
          kind: Kind.INLINE_FRAGMENT,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: remapSelections(selection.selections || []),
          },
          typeCondition: selection.typeCondition
            ? {
                kind: Kind.NAMED_TYPE,
                name: {
                  kind: Kind.NAME,
                  value: selection.typeCondition,
                },
              }
            : undefined,
        };
    }
  });
}
