import {
  Kind,
  SelectionNode as GraphQLJSSelectionNode,
  OperationTypeNode,
  DocumentNode,
} from 'graphql';
import prettyFormat from 'pretty-format';
import { queryPlanSerializer, astSerializer } from './snapshotSerializers';

export type ResponsePath = (string | number)[];

export interface QueryPlan {
  kind: 'QueryPlan';
  node?: PlanNode | SubscriptionNode;
}

export type PlanNode = SequenceNode | ParallelNode | FetchNode | FlattenNode | DeferNode | ConditionNode;

export interface SequenceNode {
  kind: 'Sequence';
  nodes: PlanNode[];
}

export interface ParallelNode {
  kind: 'Parallel';
  nodes: PlanNode[];
}

export interface SubscriptionNode {
  kind: 'Subscription';
  primary: FetchNode;
  rest?: PlanNode;
}

export interface FetchNode {
  kind: 'Fetch';
  serviceName: string;
  // Optional identifier for the fetch for defer support. All fetches of a given plan will be guaranteed to have a unique `id`.
  id?: string,
  // If QP defer support is enabled _and_ the `serviceName` subgraph support defer, then whether `operation` contains some @defer. Unset otherwise.
  hasDefers?: boolean,
  variableUsages?: string[];
  requires?: QueryPlanSelectionNode[];
  operation: string;
  operationName: string | undefined;
  operationKind: OperationTypeNode;
  operationDocumentNode?: DocumentNode;
  // Optionally describe a number of "rewrites" that query plan executors should apply to the data that is sent as input of this fetch.
  // Note that such rewrites should only impact the inputs of the fetch they are applied to (meaning that, as those inputs are collected 
  // from the current in-memory result, the rewrite should _not_ impact said in-memory results, only what is sent in the fetch).
  inputRewrites?: FetchDataRewrite[];
  // Similar, but for optional "rewrites" to apply to the data that received from a fetch (and before it is applied to the current in-memory results).
  outputRewrites?: FetchDataRewrite[];
}

/**
 * The type of rewrites currently supported on the input/output data of fetches.
 *
 * A rewrite usually identifies some subpart of thedata and some action to perform on that subpart.
 */
export type FetchDataRewrite = FetchDataValueSetter | FetchDataKeyRenamer;

/**
 * A rewrite that sets a value at the provided path of the data it is applied to.
 */
export interface FetchDataValueSetter {
  kind: 'ValueSetter',
  // Path to the key that is set by this "rewrite". It is of the form `[ 'x', '... on A', 'y' ]`, where fragments
  // means that the path should only match for objects whose `__typename` is he provided type.
  // If the path does not match in the data this is applied to, then this setter should not rewrite the data.
  // The path starts at the top of the data it is applied to. So for instance, for fetch data inputs, the path
  // start at the root of the object representing those inputs.
  path: string[],
  // The value to set at `path`.
  setValueTo: any,
}

export interface FetchDataKeyRenamer {
  kind: 'KeyRenamer'
  // Same format as in `FetchDataValueSetter`, but this renames the key at the very end of this path to the
  // name from `renameKeyTo`.
  path: string[],
  renameKeyTo: string,
}

export interface FlattenNode {
  kind: 'Flatten';
  path: ResponsePath;
  node: PlanNode;
}

/**
 * A `DeferNode` corresponds to one or more @defer at the same level of "nestedness" in the planned query.
 *
 * It contains a "primary block" and an array of "deferred blocks". The "primary block represents the part of
 * the query that is _not_ deferred (so the part of the query up until we reach the @defer(s) this handle),
 * while each "deferred block" correspond to the deferred part of one of the @defer handle by the node.
 *
 * Note that `DeferNode` are only generated if defer support is enabled for the query planner. Also note that
 * if said support is enabled, then `DeferNode` are always generated if the query has a @defer, even if in some
 * case the generated plan may not "truly" defer the underlying fetches (in cases where `defered[*].node`
 * are all undefined; this currently happens because some specific case of defer cannot be handled, but could
 * later also happen if we implement more advanced server-side heuristic to decide if deferring is judicious or
 * not). This allow the executor of the plan to consistely send a defer-abiding multipart response to the client.
 */
export interface DeferNode {
  kind: 'Defer',
  // The "primary" part of a defer, that is the non-deferred part (though could be deferred itself for a nested defer).
  primary: {
    // The part of the original query that "selects" the data to send in that primary response (once the plan in `node` completes).
    // Note that if this `DeferNode` is nested, then it must come inside the `DeferredNode` in which it is nested, and in that
    // case this subselection will start that that parent `DeferredNode.path`.
    // Note: this can be undefined in the rare case where everything in the original query is deferred (which is not very
    // useful in practice, but not disallowed by the @defer spec at the moment).
    subselection?: string,
    // The plan to get all the data for that primary part. Same as for subselection: usually defined, but can be undefined
    // in some corner cases where nothing is to be done in the primary part.
    node?: PlanNode,
  },
  // The "deferred" parts of the defer (note that it's an array). Each of those deferred elements will correspond to
  // a different chunk of the response to the client (after the initial non-deferred one that is).
  deferred: DeferredNode[],
}

// Note that `DeferredNode` is not a "full" node in the sense that it is not part of the `PlanNode`
// type union, because it never appears alone, it is a sub-part of `DeferNode`. It is nonetheless
// useful to extract it as a named type for use in the code generating plans.
export interface DeferredNode {
  // References one or more fetch node(s) (by `id`) within `primary.node`. The plan of this deferred part should not be started before all those fetches returns.
  depends: {
    id: string,
    // If `FetchNode` pointed by `id` has `hasDefers=true` and this value is set (to the label of one of the defer of the pointed fetch), then this deferred "block"
    // .
    deferLabel?: string,
  }[],
  // The optional defer label.
  label?: string,
  // Path, in the query, to the @defer this corresponds to. The `subselection` starts at that `queryPath`.
  // This look like: `[ 'products', '... on Book', 'reviews' ]`
  queryPath: string[],
  // The part of the original query that "selects" the data to send in that deferred response (once the plan in `node` completes). Will be set _unless_ `node` is a `DeferNode` itself.
  subselection?: string,
  // The plan to get all the data for that deferred part. Usually set, but can be undefined for a `@defer` where everything has been fetched in the "primary block", that is when
  // this deferred only exists to expose what should be send to the upstream client in a deferred response, but without declaring additional fetches (which happens for @defer that
  // cannot be handled through query planner and where the defer cannot be passed through to the subgraph).
  node?: PlanNode,
}

export interface ConditionNode {
  kind: 'Condition',
  condition: string,
  ifClause?: PlanNode,
  elseClause?: PlanNode,
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

export const isPlanNode = (node: PlanNode | SubscriptionNode | undefined): node is PlanNode => {
  return !!node && node.kind !== 'Subscription';
}
