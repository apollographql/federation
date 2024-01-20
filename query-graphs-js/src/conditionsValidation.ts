import { Schema, Selection } from "@apollo/federation-internals";
import {
    ConditionResolution,
  ConditionResolver,
  ExcludedConditions,
  ExcludedDestinations,
  GraphPath,
  OpGraphPath,
  SimultaneousPathsWithLazyIndirectPaths,
  addConditionExclusion,
  advanceOptionsToString,
  advanceSimultaneousPathsWithOperation,
  unsatisfiedConditionsResolution
} from "./graphPath";
import { Edge, QueryGraph } from "./querygraph";
import { PathContext } from "./pathContext";
import { cachingConditionResolver } from "./conditionsCaching";

class ConditionValidationState {
  constructor(
    // Selection that belongs to the condition we're validating.
    readonly selection: Selection,
    // All the possible "simultaneous paths" we could be in the subgraph when we reach this state selection.
    readonly subgraphOptions: SimultaneousPathsWithLazyIndirectPaths[],
  ) {}

  advance(supergraph: Schema): ConditionValidationState[] | null {
    let newOptions: SimultaneousPathsWithLazyIndirectPaths[] = [];
    for (const paths of this.subgraphOptions) {
      const pathsOptions = advanceSimultaneousPathsWithOperation(
        supergraph,
        paths,
        this.selection.element,
        // In this particular case, we're traversing the selections of a
        // FieldSet. By providing _no_ overrides here, it'll ensure that we
        // don't incorrectly validate any cases where overridden fields are in
        // a FieldSet, it's just disallowed completely.
        new Map(),
      );
      if (!pathsOptions) {
        continue;
      }
      newOptions = newOptions.concat(pathsOptions);
    }

    // If we got no options, it means that particular selection of the conditions cannot be satisfied, so the
    // overall condition cannot.
    if (newOptions.length === 0) {
      return null;
    }
    return this.selection.selectionSet ? this.selection.selectionSet.selections().map(
      s => new ConditionValidationState(
        s,
        newOptions,
      )
    ) : [];
  }

  toString(): string {
    return `${this.selection} <=> ${advanceOptionsToString(this.subgraphOptions)}`;
  }
}

/**
 * Creates a `ConditionResolver` that only validates that the condition can be satisfied, but without
 * trying compare/evaluate the potential various ways to validate said conditions. Concretely, the
 * `ConditionResolution` values returned by the create resolver will never contain a `pathTree` (or
 * an `unsatisfiedConditionReason` for that matter) and the cost will always default to 1 if the
 * conditions are satisfied.
 */
export function simpleValidationConditionResolver({
  supergraph,
  queryGraph,
  withCaching,
}: {
  supergraph: Schema,
  queryGraph: QueryGraph,
  withCaching?: boolean,
}): ConditionResolver {
  const resolver = (
    edge: Edge,
    context: PathContext,
    excludedDestinations: ExcludedDestinations,
    excludedConditions: ExcludedConditions,
  ): ConditionResolution => {
    const conditions = edge.conditions!;
    excludedConditions = addConditionExclusion(excludedConditions, conditions);

    const initialPath: OpGraphPath = GraphPath.create(queryGraph, edge.head);
    const initialOptions = [
      new SimultaneousPathsWithLazyIndirectPaths(
        [initialPath],
        context,
        simpleValidationConditionResolver({ supergraph, queryGraph, withCaching }),
        excludedDestinations,
        excludedConditions,
        new Map(),
      )
    ];

    const stack: ConditionValidationState[] = [];
    for (const selection of conditions.selections()) {
      stack.push(
        new ConditionValidationState(
          selection,
          initialOptions,
        ),
      );
    }

    while (stack.length > 0) {
      const state = stack.pop()!;
      const newStates = state.advance(supergraph);
      if (newStates === null) {
        return unsatisfiedConditionsResolution;
      }
      newStates.forEach(s => stack.push(s));
    }
    // If we exhaust the stack, it means we've been able to find "some" path for every possible selection in the condition, so the
    // condition is validated. Note that we use a cost of 1 for all conditions as we don't care about efficiency.
    return { satisfied: true, cost: 1 };
  };
  return withCaching ? cachingConditionResolver(queryGraph, resolver) : resolver;
}
