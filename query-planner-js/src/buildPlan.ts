import {
  assert,
  arrayEquals,
  baseType,
  CompositeType,
  Field,
  FieldSelection,
  FragmentElement,
  isAbstractType,
  isCompositeType,
  isListType,
  isObjectType,
  isNamedType,
  ListType,
  NonNullType,
  ObjectType,
  Operation,
  OperationPath,
  sameOperationPaths,
  Schema,
  SchemaRootKind,
  Selection,
  SelectionSet,
  selectionSetOf,
  Variable,
  VariableDefinition,
  VariableDefinitions,
  newDebugLogger,
  selectionOfElement,
  selectionSetOfElement,
  NamedFragments,
  operationToDocument,
  MapWithCachedArrays,
  sameType,
  FederationMetadata,
  federationMetadata,
  entitiesFieldName,
  concatOperationPaths,
  Directive,
  directiveApplicationsSubstraction,
  conditionalDirectivesInOperationPath,
  SetMultiMap,
  ERRORS,
  OperationElement,
  Concrete,
  DeferDirectiveArgs,
  setValues,
  MultiMap,
  NamedFragmentDefinition,
  typenameFieldName,
  mapKeys,
  operationPathToStringPath,
  mapValues,
  isInterfaceObjectType,
  isInterfaceType,
  isNonNullType,
  Type,
  FragmentSelection,
  InterfaceType,
} from "@apollo/federation-internals";
import {
  advanceSimultaneousPathsWithOperation,
  Edge,
  emptyContext,
  ExcludedEdges,
  QueryGraph,
  GraphPath,
  isPathContext,
  isRootPathTree,
  OpGraphPath,
  OpPathTree,
  OpRootPathTree,
  PathContext,
  PathTree,
  RootVertex,
  Vertex,
  isRootVertex,
  ExcludedConditions,
  advanceOptionsToString,
  ConditionResolution,
  unsatisfiedConditionsResolution,
  cachingConditionResolver,
  ConditionResolver,
  addConditionExclusion,
  SimultaneousPathsWithLazyIndirectPaths,
  simultaneousPathsToString,
  SimultaneousPaths,
  terminateWithNonRequestedTypenameField,
  getLocallySatisfiableKey,
  createInitialOptions,
  buildFederatedQueryGraph,
} from "@apollo/query-graphs";
import { stripIgnoredCharacters, print, parse, OperationTypeNode, SelectionSetNode, Kind } from "graphql";
import { DeferredNode, FetchDataInputRewrite, FetchDataOutputRewrite } from ".";
import { enforceQueryPlannerConfigDefaults, QueryPlannerConfig } from "./config";
import { generateAllPlansAndFindBest } from "./generateAllPlans";
import { QueryPlan, ResponsePath, SequenceNode, PlanNode, ParallelNode, FetchNode, trimSelectionNodes } from "./QueryPlan";

const debug = newDebugLogger('plan');

// Somewhat random string used to optimise handling __typename in some cases. See usage for details. The concrete value
// has no particular significance.
const SIBLING_TYPENAME_KEY = 'sibling_typename';

// If a query can be resolved by more than this number of plans, we'll try to reduce the possible options we'll look
// at to get it below this number to void query planning running forever.
// Note that this number is a tad arbitrary: it's a nice round number that, on my laptop, ensure query planning don't
// take more than a handful of seconds.
// Note: exported so we can have a test that explicitly requires more than this number.
export const MAX_COMPUTED_PLANS = 10000;

type CostFunction = FetchGroupProcessor<number, number>;

/**
 * Constant used during query plan cost computation to account for the base cost of doing a fetch, that is the
 * fact any fetch imply some networking cost, request serialization/deserialization, validation, ...
 *
 * The number is a little bit arbitrary, but insofar as we roughly assign a cost of 1 to a single field queried
 * (see `selectionCost` method), this can be though of as saying that resolving a single field is in general
 * a tiny fraction of the actual cost of doing a subgraph fetch.
 */
const fetchCost = 1000;

/**
 * Constant used during query plan cost computation as a multiplier to the cost of fetches made in sequences.
 *
 * This means that if 3 fetches are done in sequence, the cost of 1nd one is multiplied by this number, the
 * 2nd by twice this number, and the 3rd one by thrice this number. The goal is to heavily favor query plans
 * with the least amount of sequences, since this affect overall latency directly. The exact number is a tad
 * arbitrary however.
 */
const pipeliningCost = 100;

/**
 * Computes the cost of a Plan.
 *
 * A plan is essentially some mix of sequences and parallels of fetches. And the plan cost
 * is about minimizing both:
 *  1. The expected total latency of executing the plan. Typically, doing 2 fetches in
 *    parallel will most likely have much better latency then executing those exact same
 *    fetches in sequence, and so the cost of the latter must be greater than that of
 *    the former.
 *  2. The underlying use of resources. For instance, if we query 2 fields and we have
 *    the choice between getting those 2 fields from a single subgraph in 1 fetch, or
 *    get each from a different subgraph with 2 fetches in parallel, then we want to
 *    favor the former as just doing a fetch in and of itself has a cost in terms of
 *    resources consumed.
 *
 * Do note that at the moment, this cost is solely based on the "shape" of the plan and has
 * to make some conservative assumption regarding concrete runtime behaviour. In particular,
 * it assumes that:
 *  - all fields have the same cost (all resolvers take the same time).
 *  - that field cost is relative small compare to actually doing a subgraph fetch. That is,
 *    it assumes that the networking and other query processing costs are much higher than
 *    the cost of resolving a single field. Or to put it more concretely, it assumes that
 *    a fetch of 5 fields is probably not too different from than of 2 fields.
 */
const defaultCostFunction: CostFunction = {
  /**
   * The cost of a fetch roughly proportional to how many fields it fetches (but see `selectionCost` for more details)
   * plus some constant "premium" to account for the fact than doing each fetch is costly (and that fetch cost often
   * dwarfted the actual cost of fields resolution).
   */
  onFetchGroup: (group: FetchGroup) => (fetchCost + selectionCost(group.selection)),

  /**
   * We sum the cost of fetch groups in parallel. Note that if we were only concerned about expected latency,
   * we could instead take the `max` of the values, but as we also try to minimize general resource usage, we
   * want 2 parallel fetches with cost 1000 to be more costly than one with cost 1000 and one with cost 10,
   * so suming is a simple option.
   */
  reduceParallel: (values: number[]) => parallelCost(values),

  /**
   * For sequences, we want to heavily favor "shorter" pipelines of fetches as this directly impact the
   * expected latency of the overall plan.
   *
   * To do so, each "stage" of a sequence/pipeline gets an additional multiplier on the intrinsic cost
   * of that stage.
   */
  reduceSequence: (values: number[]) => sequenceCost(values),

  /**
   * This method exists so we can inject the necessary information for deferred block when
   * genuinely creating plan nodes. It's irrelevant to cost computation however and we just
   * return the cost of the block unchanged.
   */
  reduceDeferred(_: DeferredInfo, value: number): number {
    return value;
  },

  /**
   * It is unfortunately a bit difficult to properly compute costs for defers because in theory
   * some of the deferred blocks (the costs in `deferredValues`) can be started _before_ the full
   * `nonDeferred` part finishes (more precisely, the "structure" of query plans express the fact
   * that there is a non-deferred part and other deferred parts, but the complete dependency of
   * when a deferred part can be start is expressed through the `FetchNode.id` field, and as
   * this cost function is currently mainly based on the "structure" of query plans, we don't
   * have easy access to this info).
   *
   * Anyway, the approximation we make here is that all the deferred starts strictly after the
   * non-deferred one, and that all the deferred parts can be done in parallel.
   */
  reduceDefer(nonDeferred: number, _: SelectionSet, deferredValues: number[]): number {
    return sequenceCost([nonDeferred, parallelCost(deferredValues)]);
  },
};

function parallelCost(values: number[]): number {
  return sum(values);
}

function sequenceCost(stages: number[]): number {
  return stages.reduceRight((acc, stage, idx) => (acc + (Math.max(1, idx * pipeliningCost) * stage)), 0);
}

class QueryPlanningTaversal<RV extends Vertex> {
  // The stack contains all states that aren't terminal.
  private bestPlan: [FetchDependencyGraph, OpPathTree<RV>, number] | undefined;
  private readonly isTopLevel: boolean;
  private conditionResolver: ConditionResolver;

  private stack: [Selection, SimultaneousPathsWithLazyIndirectPaths<RV>[]][];
  private readonly closedBranches: SimultaneousPaths<RV>[][] = [];

  constructor(
    readonly supergraphSchema: Schema,
    readonly subgraphs: QueryGraph,
    selectionSet: SelectionSet,
    readonly startFetchIdGen: number,
    readonly hasDefers: boolean,
    readonly variableDefinitions: VariableDefinitions,
    private readonly statistics: PlanningStatistics | undefined,
    private readonly startVertex: RV,
    private readonly rootKind: SchemaRootKind,
    readonly costFunction: CostFunction,
    initialContext: PathContext,
    excludedEdges: ExcludedEdges = [],
    excludedConditions: ExcludedConditions = [],
  ) {
    this.isTopLevel = isRootVertex(startVertex);
    this.conditionResolver = cachingConditionResolver(
      subgraphs,
      (edge, context, excludedEdges, excludedConditions) => this.resolveConditionPlan(edge, context, excludedEdges, excludedConditions),
    );

    const initialPath: OpGraphPath<RV> = GraphPath.create(subgraphs, startVertex);
    const initialOptions = createInitialOptions(
      initialPath,
      initialContext,
      this.conditionResolver,
      excludedEdges,
      excludedConditions,
    );
    this.stack = mapOptionsToSelections(selectionSet, initialOptions);
  }

  private debugStack() {
    if (this.isTopLevel && debug.enabled) {
      debug.group('Query planning open branches:');
      for (const [selection, options] of this.stack) {
        debug.groupedValues(options, opt => `${simultaneousPathsToString(opt)}`, `${selection}:`);
      }
      debug.groupEnd();
    }
  }

  findBestPlan(): [FetchDependencyGraph, OpPathTree<RV>, number] | undefined {
    while (this.stack.length > 0) {
      this.debugStack();
      const [selection, options] = this.stack.pop()!;
      this.handleOpenBranch(selection, options);
    }
    this.computeBestPlanFromClosedBranches();
    return this.bestPlan;
  }

  private handleOpenBranch(selection: Selection, options: SimultaneousPathsWithLazyIndirectPaths<RV>[]) {
    const operation = selection.element();
    debug.group(() => `Handling open branch: ${operation}`);
    let newOptions: SimultaneousPathsWithLazyIndirectPaths<RV>[] = [];
    for (const option of options) {
      const followupForOption = advanceSimultaneousPathsWithOperation(this.supergraphSchema, option, operation);
      if (!followupForOption) {
        // There is no valid way to advance the current `operation` from this option, so this option is a dead branch
        // that cannot produce a valid query plan. So we simply ignore it and rely on other options.
        continue;
      }
      if (followupForOption.length === 0) {
        // This `operation` is valid from that option but is guarantee to yield no result (it's a type condition that, along
        // with prior condition, has no intersection). Given that (assuming the user do properly resolve all versions of a
        // given field the same way from all subgraphs) all options should return the same results, we know that operation
        // should return no result from all options (even if we can't provide it technically).
        // More concretely, this usually means the current operation is a type condition that has no intersection with the possible
        // current runtime types at this point, and this means whatever fields the type condition sub-selection selects, they
        // will never be part of the results. That said, we cannot completely ignore the type-condition/fragment or we'd end
        // up with the wrong results. Consider the example a sub-part of the query is :
        //   {
        //     foo {
        //       ... on Bar {
        //         field
        //       }
        //     }
        //   }
        // and suppose that `... on Bar` can never match a concrete runtime type at this point. Because that's the only sub-selection
        // of `foo`, if we completely ignore it, we'll end up not querying this at all. Which means that, during execution,
        // we'd either return (for that sub-part of the query) `{ foo: null }` if `foo` happens to be nullable, or just `null` for
        // the whole sub-part otherwise. But what we *should* return (assuming foo doesn't actually return `null`) is `{ foo: {} }`.
        // Meaning, we have queried `foo` and it returned something, but it's simply not a `Bar` and so nothing was included.
        // Long story short, to avoid that situation, we replace the whole `... on Bar` section that can never match the runtime
        // type by simply getting the `__typename` of `foo`. This ensure we do query `foo` but don't end up including condiditions
        // that may not even make sense to the subgraph we're querying.
        // Do note that we'll only need that `__typename` if there is no other selections inside `foo`, and so we might include
        // it unecessarally in practice: it's a very minor inefficiency though.
        if (operation.kind === 'FragmentElement') {
          this.closedBranches.push(options.map((o) => o.paths.map(p => terminateWithNonRequestedTypenameField(p))));
        }
        debug.groupEnd(() => `Terminating branch with no possible results`);
        return;
      }
      newOptions = newOptions.concat(followupForOption);
    }

    if (newOptions.length === 0) {
      // If we have no options, it means there is no way to build a plan for that branch, and
      // that means the whole query planning has no plan.
      // This should never happen for a top-level query planning (unless the supergraph has *not* been
      // validated), but can happen when computing sub-plans for a key condition.
      if (this.isTopLevel) {
        debug.groupEnd(() => `No valid options to advance ${selection} from ${advanceOptionsToString(options)}`);
        throw new Error(`Was not able to find any options for ${selection}: This shouldn't have happened.`);
      } else {
        // We clear both open branches and closed ones as a mean to terminate the plan computation with
        // no plan
        this.stack.splice(0, this.stack.length);
        this.closedBranches.splice(0, this.closedBranches.length);
        debug.groupEnd(() => `No possible plan for ${selection} from ${advanceOptionsToString(options)}; terminating condition`);
        return;
      }
    }

    if (selection.selectionSet) {
      for (const branch of mapOptionsToSelections(selection.selectionSet, newOptions)) {
        this.stack.push(branch);
      }
      debug.groupEnd();
    } else {
      const updated = this.maybeEliminateStrictlyMoreCostlyPaths(newOptions);
      this.closedBranches.push(updated);
      debug.groupEnd(() => `Branch finished with ${updated.length} options`);
    }
  }

  // This method should be applied to "final" paths, that is when the tail of the paths is a leaf field.
  // TODO: this method was added for cases where we had the following options:
  //   1) _ -[f1]-> T1(A) -[f2]-> T2(A) -[f3]-> T3(A) -[f4]-> Int(A)
  //   2) _ -[f1]-> T1(A) -[f2]-> T2(A) -[key]-> T2(B) -[f3]-> T3(B) -[f4] -> Int(B)
  // where clearly the 2nd option is not necessary (we're in A up to T2 in both case, so staying in A is never
  // going to be more expensive that going to B; note that if _other_ branches do jump to B after T2(A) for
  // other fieleds, the option 2 might well lead to a plan _as_ efficient as with option 1, but it will
  // not be _more_ efficient).
  // Anyway, while the implementation does handle this case, I believe it's a bit over-generic and can
  // eliminiate options we could want to keep. Double-check that and fix.
  private maybeEliminateStrictlyMoreCostlyPaths(options: SimultaneousPathsWithLazyIndirectPaths<RV>[]): SimultaneousPaths<RV>[] {
    if (options.length === 1) {
      return [options[0].paths];
    }

    const singlePathOptions = options.filter(opt => opt.paths.length === 1);
    if (singlePathOptions.length === 0) {
      // we can't easily compare multi-path options
      return options.map(opt => opt.paths);
    }

    let minJumps = Number.MAX_SAFE_INTEGER;
    let withMinJumps: SimultaneousPaths<RV>[] = [];
    for (const option of singlePathOptions) {
      const jumps = option.paths[0].subgraphJumps();
      if (jumps < minJumps) {
        minJumps = jumps;
        withMinJumps = [option.paths];
      } else if (jumps === minJumps) {
        withMinJumps.push(option.paths);
      }
    }

    // We then look at multi-path options. We can exclude those if the path with the least amount of jumps is
    // more than our minJumps
    for (const option of singlePathOptions.filter(opt => opt.paths.length > 1)) {
      const jumps = option.paths.reduce((acc, p) => Math.min(acc, p.subgraphJumps()), Number.MAX_SAFE_INTEGER);
      if (jumps <= minJumps) {
        withMinJumps.push(option.paths);
      }
    }
    return withMinJumps;
  }

  private newDependencyGraph(): FetchDependencyGraph {
    const rootType = this.isTopLevel && this.hasDefers ? this.supergraphSchema.schemaDefinition.rootType(this.rootKind) : undefined;
    return FetchDependencyGraph.create(this.supergraphSchema, this.subgraphs, this.startFetchIdGen, rootType);
  }

  // Moves the first closed branch to after any branch having more options.
  // This method assumes that closed branches are sorted by decreasing number of options _except_ for the first element
  // which may be out of order, and this method restore that order.
  private reorderFirstBranch() {
    const firstBranch = this.closedBranches[0];
    let i = 1;
    while (i < this.closedBranches.length && this.closedBranches[i].length > firstBranch.length) {
      i++;
    }
    // `i` is the smallest index of an element having the same number or less options than the first one,
    // so we switch that first branch with the element "before" `i` (which has more elements).
    this.closedBranches[0] = this.closedBranches[i - 1];
    this.closedBranches[i - 1] = firstBranch;
  }

  private pruneClosedBranches() {
    for (let i = 0; i < this.closedBranches.length; i++) {
      const branch = this.closedBranches[i];
      if (branch.length <= 1) {
        continue;
      }

      const pruned: SimultaneousPaths<RV>[] = [];
      for (const toCheck of branch) {
        if (!this.optionIsOverriden(toCheck, branch)) {
          pruned.push(toCheck);
        }
      }
      this.closedBranches[i] = pruned;
    }
  }

  private optionIsOverriden(toCheck: SimultaneousPaths<RV>, allOptions: SimultaneousPaths<RV>[]): boolean {
    for (const option of allOptions) {
      if (toCheck === option) {
        continue;
      }
      if (toCheck.every((p) => option.some((o) => p.isOverriddenBy(o)))) {
        return true;
      }
    }
    return false;
  }

  private computeBestPlanFromClosedBranches() {
    if (this.closedBranches.length === 0) {
      return;
    }

    // We've computed all branches and need to compare all the possible plans to pick the best.
    // Note however that "all the possible plans" is essentially a cartesian product of all
    // the closed branches options, and if a lot of branches have multiple options, this can
    // exponentially explode.
    // So first, we check if we can preemptively prune some branches based on those branches having options
    // that are known to be overriden by other ones.
    this.pruneClosedBranches();

    // We're out of smart ideas for now, so we look at how many plans we'd have to generate, and if it's
    // "too much", we reduce it to something manageable by arbitrarilly throwing out options. This effectively
    // means that when a query has too many options, we give up on always finding the "best"
    // query plan in favor of an "ok" query plan.
    // TODO: currently, when we need to reduce options, we do so somewhat arbitrarilly. More
    // precisely, we reduce the branches with the most options first and then drop the last
    // option of the branch, repeating until we have a reasonable number of plans to consider.
    // However, there is likely ways to drop options in a more "intelligent" way.

    // We sort branches by those that have the most options first.
    this.closedBranches.sort((b1, b2) => b1.length > b2.length ? -1 : (b1.length < b2.length ? 1 : 0));
    let planCount = possiblePlans(this.closedBranches);
    debug.log(() => `Query has ${planCount} possible plans`);

    let firstBranch = this.closedBranches[0];
    while (planCount > MAX_COMPUTED_PLANS && firstBranch.length > 1) {
      // we remove the right-most option of the first branch, and them move that branch to it's new place.
      const prevSize = firstBranch.length;
      firstBranch.pop();
      planCount -= planCount / prevSize;
      this.reorderFirstBranch();
      // Note that if firstBranch is our only branch, it's fine, we'll continue to remove options from
      // it (but that is beyond unlikely).
      firstBranch = this.closedBranches[0];
      debug.log(() => `Reduced plans to consider to ${planCount} plans`);
    }

    if (this.statistics) {
      this.statistics.evaluatedPlanCount += planCount;
    }

    debug.log(() => `All branches:${this.closedBranches.map((opts, i) => `\n${i}:${opts.map((opt => `\n - ${simultaneousPathsToString(opt)}`))}`)}`);

    // Note that usually, we'll have a majority of branches with just one option. We can group them in
    // a PathTree first with no fuss. When then need to do a cartesian product between this created
    // tree an other branches however to build the possible plans and chose.
    let idxFirstOfLengthOne = 0;
    while (idxFirstOfLengthOne < this.closedBranches.length && this.closedBranches[idxFirstOfLengthOne].length > 1) {
      idxFirstOfLengthOne++;
    }

    let initialTree: OpPathTree<RV>;
    let initialDependencyGraph: FetchDependencyGraph;
    if (idxFirstOfLengthOne === this.closedBranches.length) {
      initialTree = PathTree.createOp(this.subgraphs, this.startVertex);
      initialDependencyGraph = this.newDependencyGraph();
    } else {
      initialTree = PathTree.createFromOpPaths(this.subgraphs, this.startVertex, this.closedBranches.slice(idxFirstOfLengthOne).flat(2));
      initialDependencyGraph = this.updatedDependencyGraph(this.newDependencyGraph(), initialTree);
      if (idxFirstOfLengthOne === 0) {
        // Well, we have the only possible plan; it's also the best.
        this.bestPlan = [initialDependencyGraph, initialTree, this.cost(initialDependencyGraph)];
        return;
      }
    }

    const otherTrees = this.closedBranches.slice(0, idxFirstOfLengthOne).map(b => b.map(opt => PathTree.createFromOpPaths(this.subgraphs, this.startVertex, opt)));
    const { best, cost} = generateAllPlansAndFindBest({
      initial: { graph: initialDependencyGraph, tree: initialTree },
      toAdd: otherTrees,
      addFct: (p, t) => {
        const updatedDependencyGraph = p.graph.clone();
        this.updatedDependencyGraph(updatedDependencyGraph, t);
        const updatedTree = p.tree.merge(t);
        return { graph: updatedDependencyGraph, tree: updatedTree };
      },
      costFct: (p) => this.cost(p.graph),
      onPlan: (p, cost, prevCost) => {
        debug.log(() => {
          if (!prevCost) {
            return `Computed plan with cost ${cost}: ${p.tree}`;
          } else if (cost > prevCost) {
            return `Found better with cost ${cost} (previous had cost ${prevCost}: ${p.tree}`;
          } else {
            return `Ignoring plan with cost ${cost} (a better plan with cost ${prevCost} exists): ${p.tree}`
          }
        });
      },
    });
    this.bestPlan = [best.graph, best.tree, cost];
  }

  private cost(dependencyGraph: FetchDependencyGraph): number {
    const { main, deferred } = dependencyGraph.process(this.costFunction, this.rootKind);
    return deferred.length === 0
      ? main
      : this.costFunction.reduceDefer(main, dependencyGraph.deferTracking.primarySelection!, deferred);
  }

  private updatedDependencyGraph(dependencyGraph: FetchDependencyGraph, tree: OpPathTree<RV>): FetchDependencyGraph {
    return isRootPathTree(tree)
      ? computeRootFetchGroups(dependencyGraph, tree, this.rootKind)
      : computeNonRootFetchGroups(dependencyGraph, tree, this.rootKind);
  }

  private resolveConditionPlan(edge: Edge, context: PathContext, excludedEdges: ExcludedEdges, excludedConditions: ExcludedConditions): ConditionResolution {
    const bestPlan = new QueryPlanningTaversal(
      this.supergraphSchema,
      this.subgraphs,
      edge.conditions!,
      0,
      false,
      this.variableDefinitions,
      undefined,
      edge.head,
      'query',
      this.costFunction,
      context,
      excludedEdges,
      addConditionExclusion(excludedConditions, edge.conditions)
    ).findBestPlan();
    // Note that we want to return 'null', not 'undefined', because it's the latter that means "I cannot resolve that
    // condition" within `advanceSimultaneousPathsWithOperation`.
    return bestPlan ? { satisfied: true, cost: bestPlan[2], pathTree: bestPlan[1] } : unsatisfiedConditionsResolution;
  }
}

type UnhandledGroups = [FetchGroup, UnhandledParentRelations][];
type UnhandledParentRelations = ParentRelation[];

class LazySelectionSet {
  constructor(
    private _computed?: SelectionSet,
    private readonly _toCloneOnWrite?: SelectionSet
  ) {
    assert(_computed || _toCloneOnWrite, 'Should have one of the argument');
  }

  parentType(): CompositeType {
    return this.forRead().parentType;
  }

  forRead(): SelectionSet {
    return this._computed ? this._computed : this._toCloneOnWrite!;
  }

  forWrite(): SelectionSet {
    if (!this._computed) {
      this._computed = this._toCloneOnWrite!.clone();
    }
    return this._computed;
  }

  clone(): LazySelectionSet {
    if (this._computed) {
      return new LazySelectionSet(undefined, this._computed);
    } else {
      return this;
    }
  }

  toString() {
    return this.forRead().toString();
  }
}

/**
 * Used in `FetchDependencyGraph` to store, for a given group, information about one of its parent.
 * Namely, this structure stores:
 *  1. the actual parent group, and
 *  2. the path of the group for which this is a "parent relation" into said parent (`group`). This information
 *   is maintained for the case where we want/need to merge groups into each other. One can roughly think of
 *   this as similar to a `mergeAt`, but that is relative to the start of `group`. It can be `undefined`, which
 *   either mean we don't know that path or that this simply doesn't make sense (there is case where a child `mergeAt` can
 *   be shorter than its parent's, in which case the `path`, which is essentially `child-mergeAt - parent-mergeAt`, does
 *   not make sense (or rather, it's negative, which we cannot represent)). Tl;dr, `undefined` for the `path` means that
 *   should make no assumption and bail on any merging that uses said path.
 */
type ParentRelation = {
  group: FetchGroup,
  path?: OperationPath,
}

class GroupInputs {
  private readonly perType = new Map<string, LazySelectionSet>();

  constructor(
    readonly supergraphSchema: Schema,
  ) {
  }

  add(selection: Selection | SelectionSet) {
    assert(selection.parentType.schema() === this.supergraphSchema, 'Inputs selections must be based on the supergraph schema');

    const typeName = selection.parentType.name;
    let typeSelection = this.perType.get(typeName);
    if (!typeSelection) {
      typeSelection = new LazySelectionSet(new SelectionSet(selection.parentType));
      this.perType.set(typeName, typeSelection);
    }

    if (selection instanceof SelectionSet) {
      typeSelection.forWrite().mergeIn(selection);
    } else {
      typeSelection.forWrite().add(selection);
    }
  }

  addAll(other: GroupInputs, clone: boolean) {
    for (const otherSelection of other.perType.values()) {
      this.add(clone ? otherSelection.forRead().clone() : otherSelection.forRead());
    }
  }

  selectionSets(): SelectionSet[] {
    return mapValues(this.perType).map((s) => s.forRead());
  }

  toSelectionSetNode(): SelectionSetNode {
    const selectionSets = mapValues(this.perType).map((s) => s.forRead());
    // Making sure we're not generating something invalid.
    selectionSets.forEach((s) => s.validate());
    const selections = selectionSets.flatMap((sSet) => sSet.selections().map((s) => s.toSelectionNode()));
    return {
      kind: Kind.SELECTION_SET,
      selections,
    }
  }

  contains(other: GroupInputs): boolean {
    for (const [type, otherSelection] of other.perType) {
      const thisSelection = this.perType.get(type);
      if (!thisSelection || !thisSelection.forRead().contains(otherSelection.forRead())) {
        return false;
      }
    }
    return true;
  }

  equals(other: GroupInputs): boolean {
    if (this.perType.size !== other.perType.size) {
      return false;
    }

    for (const [type, thisSelection] of this.perType) {
      const otherSelection = other.perType.get(type);
      if (!otherSelection || !thisSelection.forRead().equals(otherSelection.forRead())) {
        return false;
      }
    }
    return true;
  }

  clone(): GroupInputs {
    const cloned = new GroupInputs(this.supergraphSchema);
    for (const [type, selection] of this.perType.entries()) {
      cloned.perType.set(type, selection.clone());
    }
    return cloned;
  }
}

/**
 * Represents a subgraph fetch of a query plan, and is a vertex of a `FetchDependencyGraph` (and as such provides links to
 * its parent and children in that dependency graph).
 */
class FetchGroup {
  private readonly _parents: ParentRelation[] = [];
  private readonly _children: FetchGroup[] = [];

  private _id: string | undefined;

  // Set in some code-path to indicate that the selection of the group not be optimized away even if it "looks" useless.
  mustPreserveSelection: boolean = false;

  private readonly inputRewrites: FetchDataInputRewrite[] = [];

  private constructor(
    readonly dependencyGraph: FetchDependencyGraph,
    public index: number,
    readonly subgraphName: string,
    readonly rootKind: SchemaRootKind,
    readonly parentType: CompositeType,
    readonly isEntityFetch: boolean,
    private _selection: LazySelectionSet,
    private _inputs?: GroupInputs,
    readonly mergeAt?: ResponsePath,
    readonly deferRef?: string,
  ) {
  }

  static create({
    dependencyGraph,
    index,
    subgraphName,
    rootKind,
    parentType,
    hasInputs,
    mergeAt,
    deferRef,
  }: {
    dependencyGraph: FetchDependencyGraph,
    index: number,
    subgraphName: string,
    rootKind: SchemaRootKind,
    parentType: CompositeType,
    hasInputs: boolean,
    mergeAt?: ResponsePath,
    deferRef?: string,
  }): FetchGroup {
    // Sanity checks that the selection parent type belongs to the schema of the subgraph we're querying.
    assert(parentType.schema() === dependencyGraph.subgraphSchemas.get(subgraphName), `Expected parent type ${parentType} to belong to ${subgraphName}`);
    return new FetchGroup(
      dependencyGraph,
      index,
      subgraphName,
      rootKind,
      parentType,
      hasInputs,
      new LazySelectionSet(new SelectionSet(parentType)),
      hasInputs ? new GroupInputs(dependencyGraph.supergraphSchema) : undefined,
      mergeAt,
      deferRef,
    );
  }

  cloneShallow(newDependencyGraph: FetchDependencyGraph): FetchGroup {
    return new FetchGroup(
      newDependencyGraph,
      this.index,
      this.subgraphName,
      this.rootKind,
      this.parentType,
      this.isEntityFetch,
      this._selection.clone(),
      this._inputs?.clone(),
      this.mergeAt,
      this.deferRef,
    );
  }

  set id(id: string | undefined) {
    assert(!this._id, () => `The id for fetch group ${this} is already set`);
    this._id = id;
  }

  get id(): string | undefined {
    return this._id;
  }

  get isTopLevel(): boolean {
    return !this.mergeAt;
  }

  // It's important that the returned selection is never modified. Use the other modification methods of this method instead!
  get selection(): SelectionSet {
    return this._selection.forRead();
  }

  get inputs(): GroupInputs | undefined {
    return this._inputs;
  }

  addParents(parents: readonly ParentRelation[]) {
    for (const parent of parents) {
      this.addParent(parent);
    }
  }

  /**
   * Adds another group as a parent of this one (meaning that this fetch should happen after the provided one).
   */
  addParent(parent: ParentRelation) {
    if (this.isChildOf(parent.group)) {
      // Due to how we handle the building of multiple query plans when there is choices, it's possible that we re-traverse
      // key edges we've already traversed before, and that can means hitting this condition. While we could try to filter
      // "already-children" before calling this method, it's easier to just make this a no-op.
      return;
    }

    assert(!parent.group.isParentOf(this), () => `Group ${parent.group} is a parent of ${this}, but the child relationship is broken`);
    assert(!parent.group.isChildOf(this), () => `Group ${parent.group} is a child of ${this}: adding it as parent would create a cycle`);

    this.dependencyGraph.onModification();
    this._parents.push(parent);
    parent.group._children.push(this);
  }

  removeChild(child: FetchGroup) {
    if (!this.isParentOf(child)) {
      return;
    }

    this.dependencyGraph.onModification();
    findAndRemoveInPlace((g) => g === child, this._children);
    findAndRemoveInPlace((p) => p.group === this, child._parents);
  }

  isParentOf(maybeChild: FetchGroup): boolean {
    return this._children.includes(maybeChild);
  }

  isChildOf(maybeParent: FetchGroup): boolean {
    return !!this.parentRelation(maybeParent);
  }

  isDescendantOf(maybeAncestor: FetchGroup): boolean {
    const children = Array.from(maybeAncestor.children());
    while (children.length > 0) {
      const child = children.pop()!;
      if (child === this) {
        return true;
      }
      child.children().forEach((c) => children.push(c));
    }
    return false;
  }

  /**
   * Returns whether this group is both a child of `maybeParent` but also if we can show that the
   * dependency between the group is "artificial" in the sense that this group inputs do not truly
   * depend on anything `maybeParent` fetches.
   */
  isChildOfWithArtificialDependency(maybeParent: FetchGroup): boolean {
    const relation =  this.parentRelation(maybeParent);
    // To be a child with an artificial dependency, it needs to be a child first,
    // and the "path in parent" should be know to be empty (which essentially
    // means the groups are on the same entity at the same level).
    if (!relation || relation.path?.length !== 0) {
      return false;
    }
    // If we have no inputs, we don't really care about what `maybeParent` fetches.
    if (!this.inputs) {
      return true;
    }

    // In theory, the most general test we could have here is to check if `this.inputs` "intersects"
    // `maybeParent.selection. As if it doesn't, we know our inputs don't depend on anything the
    // parent fetches. However, selection set intersection is a bit tricky to implement (due to fragments,
    // it would be a bit of code to do not-too-inefficiently, but both fragments and alias makes the
    // definition of what the intersection we'd need here fairly subtle), and getting it wrong could
    // make us generate incorrect query plans. Adding to that, the current know cases for this method
    // being useful happens to be when `this.inputs` and `maybeParent.inputs` are the same. Now, checking
    // inputs is a bit weaker, in the sense that the input could be different and yet the child group
    // not depend on anything the parent fetches, but it is "sufficient", in that if the inputs of the
    // parent includes entirely the child inputs, then we know nothing the child needs can be fetched
    // by the parent (or rather, if it does, it's useless). Anyway, checking inputs inclusion is easier
    // to do so we rely on this for now. If we run into examples where this happens to general non-optimal
    // query plan, we can decide then to optimize further and implement a proper intersections.
    return !!maybeParent.inputs && maybeParent.inputs.contains(this.inputs);
  }

  parentRelation(maybeParent: FetchGroup): ParentRelation | undefined {
    return this._parents.find(({ group }) => maybeParent === group);
  }

  parents(): readonly ParentRelation[] {
    return this._parents;
  }

  parentGroups(): readonly FetchGroup[] {
    return this.parents().map((p) => p.group);
  }

  children(): readonly FetchGroup[] {
    return this._children;
  }

  addInputs(selection: Selection | SelectionSet, rewrites?: FetchDataInputRewrite[]) {
    assert(this._inputs, "Shouldn't try to add inputs to a root fetch group");

    this._inputs.add(selection);

    if (rewrites) {
      rewrites.forEach((r) => this.inputRewrites.push(r));
    }
  }

  copyInputsOf(other: FetchGroup, clone: boolean = false) {
    if (other.inputs) {
      this.inputs?.addAll(other.inputs, clone);

      if (other.inputRewrites) {
        other.inputRewrites.forEach((r) => this.inputRewrites.push(r));
      }
    }
  }

  addSelection(path: OperationPath, onPathEnd?: (finalSelectionSet: SelectionSet | undefined) => void) {
    this._selection.forWrite().addPath(path, onPathEnd);
  }

  addSelections(selection: SelectionSet) {
    this._selection.forWrite().mergeIn(selection);
  }

  canMergeChildIn(child: FetchGroup): boolean {
    return this.deferRef === child.deferRef && !!child.parentRelation(this)?.path;
  }

  removeInputsFromSelection() {
    const inputs = this.inputs;
    if (inputs) {
      const updated = inputs.selectionSets().reduce((prev, value) => prev.minus(value), this.selection);
      this._selection = new LazySelectionSet(updated);
    }
  }

  // If a group is such that everything is fetches is already included in the inputs, then
  // this group does useless fetches.
  isUseless(): boolean {
    if (!this.inputs || this.mustPreserveSelection) {
      return false;
    }

    // For groups that fetches from an @interfaceObject, we can sometimes have something like
    //   { ... on Book { id } } => { ... on Product { id } }
    // where `Book` is an implementation of interface `Product`.
    // And that is because while only "books" are concerned by this fetch, the `Book` type is unknown
    // of the queried subgraph (in that example, it defines `Product` as an @interfaceObject) and
    // so we have to "cast" into `Product` instead of `Book`.
    // But the fetch above _is_ useless, it does only fetch its inputs, and we wouldn't catch this
    // if we do a raw inclusion check of `selection` into `inputs`
    //
    // We only care about this problem at the top-level of the selections however, so we does that
    // top-level check manually (instead of just calling `this.inputs.contains(this.selection)`)
    // but fallback on `contains` for anything deeper.

    const conditionInSupergraphIfInterfaceObject = (selection: Selection): InterfaceType | undefined => {
      if (selection.kind === 'FragmentSelection') {
        const condition = selection.element().typeCondition;
        if (condition && isObjectType(condition)) {
          const conditionInSupergraph = this.dependencyGraph.supergraphSchema.type(condition.name);
          // Note that we're checking the true supergraph, not the API schema, so even @inaccessible types will be found.
          assert(conditionInSupergraph, () => `Type ${condition.name} should exists in the supergraph`)
          if (isInterfaceType(conditionInSupergraph)) {
            return conditionInSupergraph;
          }
        }
      }
      return undefined;
    }

    const inputSelections = this.inputs.selectionSets().flatMap((s) => s.selections());
    // Checks that every selection is contained in the input selections.
    return this.selection.selections().every((selection) => {
      const conditionInSupergraph = conditionInSupergraphIfInterfaceObject(selection);
      if (!conditionInSupergraph) {
        // We're not in the @interfaceObject case described above. We just check that an input selection contains the
        // one we check.
        return inputSelections.some((input) => input.contains(selection));
      }

      const implemTypeNames = conditionInSupergraph.possibleRuntimeTypes().map((t) => t.name);
      // Find all the input selections that selects object for this interface, that is selection on
      // either the interface directly or on one of it's implementation type (we keep both kind separate).
      const interfaceInputSelections: FragmentSelection[] = [];
      const implementationInputSelections: FragmentSelection[] = [];
      for (const inputSelection of inputSelections) {
        // We know that fetch inputs are wrapped in fragments whose condition is an entity type:
        // that's how we build them and we couldn't select inputs correctly otherwise.
        assert(inputSelection.kind === 'FragmentSelection', () => `Unexpecting input selection ${inputSelection} on ${this}`);
        const inputCondition = inputSelection.element().typeCondition;
        assert(inputCondition, () => `Unexpecting input selection ${inputSelection} on ${this} (missing condition)`);
        if (inputCondition.name == conditionInSupergraph.name) {
          interfaceInputSelections.push(inputSelection);
        } else if (implemTypeNames.includes(inputCondition.name)) {
          implementationInputSelections.push(inputSelection);
        }
      }

      const subSelectionSet = selection.selectionSet;
      // we're only here if `conditionInSupergraphIfInterfaceObject` returned something, we imply that selection is a fragment
      // selection and so has a sub-selectionSet.
      assert(subSelectionSet, () => `Should not be here for ${selection}`);

      // If there is some selections on the interface, then the selection needs to be contained in those.
      // Otherwise, if there is implementation selections, it must be contained in _each_ of them (we
      // shouldn't have the case where there is neither interface nor implementation selections, but
      // we just return false if that's the case as a "safe" default).
      if (interfaceInputSelections.length > 0) {
        return interfaceInputSelections.some((input) => input.selectionSet.contains(subSelectionSet));
      }
      return implementationInputSelections.length > 0 
        && implementationInputSelections.every((input) => input.selectionSet.contains(subSelectionSet));
    });
  }

  /**
   * Merges a child of `this` group into it.
   *
   * Note that it is up to the caller to know that doing such merging is reasonable in the first place, which
   * generally means knowing that 1) `child.inputs` are included in `this.inputs` and 2) all of `child.selection`
   * can safely be queried on the `this.subgraphName` subgraph.
   *
   * @param child - a group that must be a `child` of this, and for which the 'path in parent' (for `this`) is
   *   known. The `canMergeChildIn` method can be used to ensure that `child` meets those requirement.
   */
  mergeChildIn(child: FetchGroup) {
    const relationToChild = child.parentRelation(this);
    assert(relationToChild, () => `Cannot merge ${child} into ${this}: the former is not a child of the latter`);
    const childPathInThis = relationToChild.path;
    assert(childPathInThis, () => `Cannot merge ${child} into ${this}: the path of the former into the later is unknown`);
    this.mergeInInternal(child, childPathInThis);
  }

  canMergeSiblingIn(sibling: FetchGroup): boolean {
    // We only allow merging sibling on the same subgraph, same "mergeAt" and when the common parent is their only parent:
    // - there is no reason merging siblings of different subgraphs could ever make sense.
    // - ensuring the same "mergeAt" makes so we can merge the inputs and selections without having to worry about those
    //   not being at the same level (hence the empty path in the call to `mergeInInternal` below). In theory, we could
    //   relax this when we have the "path in parent" for both sibling, and if `siblingToMerge` is "deeper" than `this`,
    //   we could still merge it in using the appropriate path. We don't use this yet, but if this get in the way of
    //   some query plan optimisation, we may have to do so.
    // - only handling a single parent could be expanded on later, but we don't need it yet so we focus on the simpler case.
    const ownParents = this.parents();
    const siblingParents = sibling.parents();
    return this.deferRef === sibling.deferRef
      && this.subgraphName === sibling.subgraphName
      && sameMergeAt(this.mergeAt, sibling.mergeAt)
      && ownParents.length === 1
      && siblingParents.length === 1
      && ownParents[0].group === siblingParents[0].group;
  }

  /**
   * Merges the provided sibling (shares a common parent) of `this` group into it.
   *
   * Callers _must_ ensures that such merging is possible by calling `canMergeSiblingIn`.
   *
   * @param sibling - a sibling group of `this`. Both `this` and `sibling` must share a parent but it should also be
   * their _only_ parent. Further `this` and `sibling` must be on the same subgraph and have the same `mergeAt`.
   */
  mergeSiblingIn(sibling: FetchGroup) {
    this.copyInputsOf(sibling);
    this.mergeInInternal(sibling, []);
  }

  canMergeGrandChildIn(grandChild: FetchGroup): boolean {
    const gcParents = grandChild.parents();
    if (gcParents.length !== 1) {
      return false;
    }
    return this.deferRef === grandChild.deferRef && !!gcParents[0].path && !!gcParents[0].group.parentRelation(this)?.path;
  }

  /**
   * Merges a grand child of `this` group into it.
   *
   * Note that it is up to the caller to know that doing such merging is reasonable in the first place, which
   * generally means knowing that 1) `grandChild.inputs` are included in `this.inputs` and 2) all of `grandChild.selection`
   * can safely be queried on the `this.subgraphName` subgraph (the later of which is trivially true if `this` and
   * `grandChild` are on the same subgraph and same mergeAt).
   *
   * @param grandChild - a group that must be a "grand child" (a child of a child) of `this`, and for which the
   *   'path in parent' is know for _both_ the grand child to tis parent and that parent to `this`. The `canMergeGrandChildIn`
  *     method can be used to ensure that `grandChild` meets those requirement.
   */
  mergeGrandChildIn(grandChild: FetchGroup) {
    const gcParents = grandChild.parents();
    assert(gcParents.length === 1, () => `Cannot merge ${grandChild} as it has multiple parents ([${gcParents}])`);
    const gcParent = gcParents[0];
    const gcGrandParent = gcParent.group.parentRelation(this);
    assert(gcGrandParent, () => `Cannot merge ${grandChild} into ${this}: the former parent (${gcParent.group}) is not a child of the latter`);
    assert(gcParent.path && gcGrandParent.path, () => `Cannot merge ${grandChild} into ${this}: some paths in parents are unknown`);
    this.mergeInInternal(grandChild, concatOperationPaths(gcGrandParent.path, gcParent.path));
  }

  /**
   * Merges another group into `this` group, without knowing the dependencies between those 2 groups.
   *
   * Note that it is up to the caller to know if such merging is desirable. In particular, if both group have completely
   * different inputs, merging them, which also merges their dependencies, might not be judicious for the optimality of
   * the query plan.
   *
   * @param other - another group to merge into `this`. Both `this` and `other` must be on the same subgraph and have the same
   *   `mergeAt`.
   */
  mergeInWithAllDependencies(other: FetchGroup) {
    assert(this.deferRef === other.deferRef, () => `Can only merge unrelated groups within the same @defer block: cannot merge ${this} and ${other}`);
    assert(this.subgraphName === other.subgraphName, () => `Can only merge unrelated groups to the same subraphs: cannot merge ${this} and ${other}`);
    assert(sameMergeAt(this.mergeAt, other.mergeAt), () => `Can only merge unrelated groups at the same "mergeAt": ${this} has mergeAt=${this.mergeAt}, but ${other} has mergeAt=${other.mergeAt}`);

    this.copyInputsOf(other);
    this.mergeInInternal(other, [], true);
  }

  private mergeInInternal(merged: FetchGroup, path: OperationPath, mergeParentDependencies: boolean = false) {
    assert(!merged.isTopLevel, "Shouldn't remove top level groups");

    // We merge the selection of `merged` into our own selection, but need to "rebase" it according to `path` first. As we do,
    // we ignore redundant fragments. Typically, `merged` selection will always start by a type-cast into the entity type because
    // that's what `_entities()` require, but that cast is probably useless when merging.
    const mergePathConditionalDirectives = conditionalDirectivesInOperationPath(path);
    let selectionSet: SelectionSet;
    if (path.length === 0) {
      selectionSet = merged.selection;
    } else {
      selectionSet = new SelectionSet(this.selection.parentType);
      selectionSet.addPath(path, (endOfPathSet) => {
        assert(endOfPathSet, () => `Merge path ${path} ends on a non-selectable type`);
        for (const selection of merged.selection.selections()) {
          const withoutUneededFragments = removeRedundantFragments(selection, endOfPathSet.parentType, mergePathConditionalDirectives);
          addSelectionOrSelectionSet(endOfPathSet, withoutUneededFragments);
        }
      });
    }
    this._selection.forWrite().mergeIn(selectionSet);

    this.dependencyGraph.onModification();
    this.relocateChildrenOnMergedIn(merged, path);
    if (mergeParentDependencies) {
      this.relocateParentsOnMergedIn(merged);
    }

    if (merged.mustPreserveSelection) {
      this.mustPreserveSelection = true;
    }
    this.dependencyGraph.remove(merged);
  }

  removeUselessChild(child: FetchGroup) {
    const relationToChild = child.parentRelation(this);
    assert(relationToChild, () => `Cannot remove useless ${child} of ${this}: the former is not a child of the latter`);
    const childPathInThis = relationToChild.path;
    assert(childPathInThis, () => `Cannot remove useless ${child} of ${this}: the path of the former into the later is unknown`);

    this.dependencyGraph.onModification();
    // Removing the child means atttaching all it's children to the parent, so it's the same relocation than on a "mergeIn".
    this.relocateChildrenOnMergedIn(child, childPathInThis);
    this.dependencyGraph.remove(child);
  }

  private relocateChildrenOnMergedIn(merged: FetchGroup, pathInThis: OperationPath) {
    for (const child of merged.children()) {
      // This could already be a child of `this`. Typically, we can have case where we have:
      //     1
      //   /  \
      // 0     3
      //   \  /
      //     2
      // and we can merge siblings 2 into 1.
      if (this.isParentOf(child)) {
        continue;
      }
      const pathInMerged = child.parentRelation(merged)?.path;
      child.addParent({ group: this, path: concatPathsInParents(pathInThis, pathInMerged) });
    }
  }

  private relocateParentsOnMergedIn(merged: FetchGroup) {
    for (const parent of merged.parents()) {
      // If the parent of the merged is already a parent of ours, don't re-create the already existing relationship.
      if (parent.group.isParentOf(this)) {
        continue;
      }

      // Further, if the parent is a descendant of `this`, we also should ignore that relationship, becuase
      // adding it a parent of `this` would create a cycle. And assuming this method is called properly,
      // that when `merged` can genuinely be safely merged into `this`, then this just mean the `parent` -> `merged`
      // relationship was unecessary after all (which can happen given how groups are generated).
      if (parent.group.isDescendantOf(this)) {
        continue;
      }
      this.addParent(parent);
    }
  }

  private finalizeSelection(): FetchDataOutputRewrite[] {
    // Finalizing the selection involves the following:
    // 1. we add __typename to all abstract types. This is because any follow-up fetch may need to select some of the entities fetched by this
    //   group, and so we need to have the __typename of those.
    // 2. we check if some selection violates `https://spec.graphql.org/draft/#FieldsInSetCanMerge()`: while the original query we plan for will
    //   never violate this, because the planner adds some additional fields to the query (due to @key and @requires) and because type-explosion
    //   changes the query, we could have violation of this. If that is the case, we introduce aliases to the selection to make it valid, and
    //   then generate a rewrite on the output of the fetch so that data aliased this way is rewritten back to the original/proper response name.

    addTypenameFieldForAbstractTypes(this.selection);

    const rewrites: FetchDataOutputRewrite[] = [];
    addAliasesForNonMergingFields([{ path: [], selections: this.selection }], rewrites);

    this.selection.validate();
    return rewrites;
  }

  toPlanNode(
    queryPlannerConfig: QueryPlannerConfig,
    variableDefinitions: VariableDefinitions,
    fragments?: NamedFragments,
    operationName?: string
  ) : PlanNode | undefined {
    if (this.selection.isEmpty()) {
      return undefined;
    }

    const outputRewrites = this.finalizeSelection();

    const inputNodes = this._inputs ? this._inputs.toSelectionSetNode() : undefined;

    const subgraphSchema = this.dependencyGraph.subgraphSchemas.get(this.subgraphName)!;
    let operation = this.isEntityFetch
      ? operationForEntitiesFetch(
          subgraphSchema,
          this.selection,
          variableDefinitions,
          operationName,
        )
      : operationForQueryFetch(
          subgraphSchema,
          this.rootKind,
          this.selection,
          variableDefinitions,
          operationName,
        );

    operation = operation.optimize(fragments, { autoFragmetize: queryPlannerConfig.experimental_autoFragmentQuery} );

    const operationDocument = operationToDocument(operation);
    const fetchNode: FetchNode = {
      kind: 'Fetch',
      id: this.id,
      serviceName: this.subgraphName,
      requires: inputNodes ? trimSelectionNodes(inputNodes.selections) : undefined,
      variableUsages: this.selection.usedVariables().map(v => v.name),
      operation: stripIgnoredCharacters(print(operationDocument)),
      operationKind: schemaRootKindToOperationKind(operation.rootKind),
      operationName: operation.name,
      operationDocumentNode: queryPlannerConfig.exposeDocumentNodeInFetchNode ? operationDocument : undefined,
      inputRewrites: this.inputRewrites.length === 0 ? undefined : this.inputRewrites,
      outputRewrites: outputRewrites.length === 0 ? undefined : outputRewrites,
    };

    return this.isTopLevel
      ? fetchNode
      : {
        kind: 'Flatten',
        path: this.mergeAt!,
        node: fetchNode,
      };
  }

  toString(): string {
    const base = `[${this.index}]${this.deferRef ? '(deferred)' : ''}${this._id ? `{id: ${this._id}}` : ''} ${this.subgraphName}`;
    return this.isTopLevel
      ? `${base}[${this._selection}]`
      : `${base}@(${this.mergeAt})[${this._inputs} => ${this._selection}]`;
  }
}

function genAliasName(baseName: string, unavailableNames: Map<string, any>): string {
  let counter = 0;
  let candidate = `${baseName}__alias_${counter}`;
  while (unavailableNames.has(candidate)) {
    candidate = `${baseName}__alias_${++counter}`;
  }
  return candidate;
}

function typesCanBeMerged(t1: Type, t2: Type): boolean {
  // This essentially follows the beginning of https://spec.graphql.org/draft/#SameResponseShape().
  // That is, the types cannot be merged unless:
  // - they have the same nullability and "list-ability", potentially recursively.
  // - their base type is either both composite, or are the same type.
  if (isNonNullType(t1)) {
    return isNonNullType(t2) ? typesCanBeMerged(t1.ofType, t2.ofType) : false;
  }
  if (isListType(t1)) {
    return isListType(t2) ? typesCanBeMerged(t1.ofType, t2.ofType) : false;
  }
  if (isCompositeType(t1)) {
    return isCompositeType(t2);
  }
  return sameType(t1, t2);
}

type SelectionSetAtPath = {
  path: string[],
  selections: SelectionSet,
}

function addAliasesForNonMergingFields(selections: SelectionSetAtPath[], rewriteCollector: FetchDataOutputRewrite[]) {
  const seenResponseNames = new Map<string, { fieldName: string, fieldType: Type, selections?: SelectionSetAtPath[] }>();
  const rebasedFieldsInSet = (s: SelectionSetAtPath) => (
    s.selections.fieldsInSet().map(({ path, field, directParent }) => ({ fieldPath: s.path.concat(path), field, directParent }))
  );
  for (const { fieldPath, field, directParent } of selections.map((s) => rebasedFieldsInSet(s)).flat()) {
    const fieldName = field.element().name;
    const responseName = field.element().responseName();
    const fieldType = field.element().definition.type!;
    const previous = seenResponseNames.get(responseName);
    if (previous) {
      if (previous.fieldName === fieldName && typesCanBeMerged(previous.fieldType, fieldType)) {
        // If the type is non-composite, then we're all set. But if it is composite, we need to record the sub-selection to that response name
        // as we need to "recurse" on the merged of both the previous and this new field.
        if (isCompositeType(baseType(fieldType))) {
          assert(previous.selections, () => `Should have added selections for ${previous.fieldType}`);
          const selections = previous.selections.concat({ path: fieldPath.concat(responseName), selections: field.selectionSet! });
          seenResponseNames.set(responseName, { ...previous, selections });
        }
      } else {
        // We need to alias the new occurence.
        const alias = genAliasName(responseName, seenResponseNames);
        // Given how we generate aliases, it's is very unlikely that the generated alias will conflict with any of the other response name
        // at the level, but it's theoretically possible. By adding the alias to the seen names, we ensure that in the remote change that
        // this ever happen, we'll avoid the conflict by giving another alias to the followup occurence.
        const selections = field.selectionSet ? [{ path: fieldPath.concat(alias), selections: field.selectionSet }] : undefined;
        seenResponseNames.set(alias, { fieldName, fieldType, selections });
        const wasRemoved = directParent.removeTopLevelField(responseName);
        assert(wasRemoved, () => `Should have found and removed ${responseName} from ${directParent}`);
        directParent.add(field.withUpdatedField(field.element().withUpdatedAlias(alias)));
        // Lastly, we record that the added alias need to be rewritten back to the proper response name post query.
        rewriteCollector.push({
          kind: 'KeyRenamer',
          path: fieldPath.concat(alias),
          renameKeyTo: responseName,
        });
      }
    } else {
      const selections = field.selectionSet ? [{ path: fieldPath.concat(responseName), selections: field.selectionSet }] : undefined;
      seenResponseNames.set(responseName, { fieldName, fieldType, selections });
    }
  }
  for (const selections of seenResponseNames.values()) {
    if (!selections.selections) {
      continue;
    }
    addAliasesForNonMergingFields(selections.selections, rewriteCollector);
  }
}

class DeferredInfo {
  readonly subselection: SelectionSet;

  constructor(
    readonly label: string,
    readonly path: GroupPath,
    readonly parentType: CompositeType,
    readonly deferred = new Set<string>(),
    readonly dependencies = new Set<string>(),
  ) {
    this.subselection = new SelectionSet(parentType);
  }
}

type DeferContext = {
  currentDeferRef: string | undefined,
  pathToDeferParent: OperationPath,
  activeDeferRef: string | undefined,
  isPartOfQuery: boolean,
}

const emptyDeferContext: DeferContext = {
  currentDeferRef: undefined,
  pathToDeferParent: [],
  activeDeferRef: undefined,
  isPartOfQuery: true,
}

function deferContextForConditions(baseContext: DeferContext): DeferContext {
  return {
    ...baseContext,
    isPartOfQuery: false,
    currentDeferRef: baseContext.activeDeferRef,
  };
}

function deferContextAfterSubgraphJump(baseContext: DeferContext): DeferContext {
  return baseContext.currentDeferRef === baseContext.activeDeferRef
    ? baseContext
    : {
      ...baseContext,
      activeDeferRef: baseContext.currentDeferRef,
    };
}

class GroupPath {
  private constructor(
    private readonly fullPath: OperationPath,
    private readonly pathInGroup: OperationPath,
    private readonly responsePath: ResponsePath,
  ) {
  }

  static empty(): GroupPath {
    return new GroupPath([], [], []);
  }

  inGroup(): OperationPath {
    return this.pathInGroup;
  }

  full(): OperationPath {
    return this.fullPath;
  }

  inResponse(): ResponsePath {
    return this.responsePath;
  }

  forNewKeyFetch(newGroupContext: OperationPath): GroupPath {
    return new GroupPath(
      this.fullPath,
      newGroupContext,
      this.responsePath,
    );
  }

  forParentOfGroup(pathOfGroupInParent: OperationPath): GroupPath {
    return new GroupPath(
      this.fullPath,
      concatOperationPaths(pathOfGroupInParent, this.pathInGroup),
      this.responsePath,
    );
  }

  private updatedResponsePath(element: OperationElement) {
    if (element.kind !== 'Field') {
      return this.responsePath;
    }

    let type = element.definition.type!;
    const newPath = this.responsePath.concat(element.responseName());
    while (!isNamedType(type)) {
      if (isListType(type)) {
        newPath.push('@');
      }
      type = type.ofType;
    }
    return newPath;
  }

  add(element: OperationElement): GroupPath {
    return new GroupPath(
      this.fullPath.concat(element),
      this.pathInGroup.concat(element),
      this.updatedResponsePath(element),
    );
  }

  toString() {
    return `[${this.fullPath}]:[${this.pathInGroup}]`;
  }
}

class DeferTracking {
  private readonly topLevelDeferred = new Set<string>();
  readonly primarySelection: SelectionSet | undefined;
  private readonly deferred = new MapWithCachedArrays<string, DeferredInfo>();

  constructor(rootType: CompositeType | undefined) {
    this.primarySelection = rootType ? new SelectionSet(rootType) : undefined;
  }

  clone(): DeferTracking {
    const cloned = new DeferTracking(this.primarySelection?.parentType);
    this.topLevelDeferred.forEach((label) => cloned.topLevelDeferred.add(label));
    if (this.primarySelection) {
      cloned.primarySelection?.mergeIn(this.primarySelection.clone());
    }
    for (const deferredBlock of this.deferred.values()) {
      const clonedInfo = new DeferredInfo(
        deferredBlock.label,
        deferredBlock.path,
        deferredBlock.parentType,
        new Set(deferredBlock.deferred),
      );
      clonedInfo.subselection.mergeIn(deferredBlock.subselection.clone());
      cloned.deferred.set(deferredBlock.label, clonedInfo);
    }
    return cloned;
  }

  registerDefer({
    deferContext,
    deferArgs,
    path,
    parentType,
  }: {
    deferContext: DeferContext,
    deferArgs: DeferDirectiveArgs,
    path: GroupPath,
    parentType: CompositeType,
  }): void {
    // Having the primary selection undefined means that @defer handling is actually disabled, so save anything costly that we won't be using.
    if (!this.primarySelection) {
      return;
    }

    assert(deferArgs.label, 'All @defer should have be labelled at this point');
    let deferredBlock = this.deferred.get(deferArgs.label);
    if (!deferredBlock) {
      deferredBlock = new DeferredInfo(deferArgs.label, path, parentType);
      this.deferred.set(deferArgs.label, deferredBlock);
    }

    const parentRef = deferContext.currentDeferRef;
    if (!parentRef) {
      this.topLevelDeferred.add(deferArgs.label);
      this.primarySelection.addPath(deferContext.pathToDeferParent);
    } else {
      const parentInfo = this.deferred.get(parentRef);
      assert(parentInfo, `Cannot find info for parent ${parentRef} or ${deferArgs.label}`);
      parentInfo.deferred.add(deferArgs.label);
      parentInfo.subselection.addPath(deferContext.pathToDeferParent);
    }
  }

  updateSubselection(deferContext: DeferContext): void {
    if (!this.primarySelection || !deferContext.isPartOfQuery) {
      return;
    }

    const parentRef = deferContext.currentDeferRef;
    if (parentRef) {
      const info = this.deferred.get(parentRef);
      assert(info, () => `Cannot find info for label ${parentRef}`);
      info.subselection.addPath(deferContext.pathToDeferParent);
    } else {
      this.primarySelection.addPath(deferContext.pathToDeferParent);
    }
  }

  getBlock(label: string): DeferredInfo | undefined {
    return  this.deferred.get(label);
  }

  addDependency(label: string, idDependency: string): void {
    const info = this.deferred.get(label);
    assert(info, () => `Cannot find info for label ${label}`);
    info.dependencies.add(idDependency);
  }

  defersInParent(parentRef: string | undefined): readonly DeferredInfo[] {
    const labels = parentRef ? this.deferred.get(parentRef)?.deferred : this.topLevelDeferred;
    return labels
      ? setValues(labels).map((label) => {
        const info = this.deferred.get(label);
        assert(info, () => `Should not have referenced ${label} without an existing info`);
        return info;
      })
      : [];
  }
}

/**
 * A Directed Acyclic Graph (DAG) of `FetchGroup` and their dependencies.
 *
 * In the graph, 2 groups are connected if one of them (the parent) must be performed strictly before the other one (the child).
 */
class FetchDependencyGraph {
  private isReduced: boolean = false;
  private isOptimized: boolean = false;

  private fetchIdGen: number;

  private constructor(
    readonly supergraphSchema: Schema,
    readonly subgraphSchemas: ReadonlyMap<string, Schema>,
    readonly federatedQueryGraph: QueryGraph,
    readonly startingIdGen: number,
    private readonly rootGroups: MapWithCachedArrays<string, FetchGroup>,
    readonly groups: FetchGroup[],
    readonly deferTracking: DeferTracking,
  ) {
    this.fetchIdGen = startingIdGen;
  }

  static create(supergraphSchema: Schema, federatedQueryGraph: QueryGraph, startingIdGen: number, rootTypeForDefer: CompositeType | undefined) {
    return new FetchDependencyGraph(
      supergraphSchema,
      federatedQueryGraph.sources,
      federatedQueryGraph,
      startingIdGen,
      new MapWithCachedArrays(),
      [],
      new DeferTracking(rootTypeForDefer),
    );
  }

  private federationMetadata(subgraphName: string): FederationMetadata {
    const schema = this.subgraphSchemas.get(subgraphName);
    assert(schema, () => `Unknown schema ${subgraphName}`)
    const metadata = federationMetadata(schema);
    assert(metadata, () => `Schema ${subgraphName} should be a federation subgraph`);
    return metadata;
  }

  nextFetchId(): number {
    return this.fetchIdGen;
  }

  clone(): FetchDependencyGraph {
    const cloned = new FetchDependencyGraph(
      this.supergraphSchema,
      this.subgraphSchemas,
      this.federatedQueryGraph,
      this.startingIdGen,
      new MapWithCachedArrays<string, FetchGroup>(),
      new Array(this.groups.length),
      this.deferTracking.clone(),
    );

    for (const group of this.groups) {
      cloned.groups[group.index] = group.cloneShallow(cloned);
    }

    for (const root of this.rootGroups.values()) {
      cloned.rootGroups.set(root.subgraphName, cloned.groups[root.index]);
    }

    for (const group of this.groups) {
      const clonedGroup = cloned.groups[group.index];
      // Note that `addParent` makes sure to set both the parent link in
      // `clonedGroup` but also the corresponding child link in `parent`.
      for (const parent of group.parents()) {
        clonedGroup.addParent({
          group: cloned.groups[parent.group.index],
          path: parent.path
        });
      }
    }

    return cloned;
  }

  getOrCreateRootFetchGroup({
    subgraphName,
    rootKind,
    parentType,
  }: {
    subgraphName: string,
    rootKind: SchemaRootKind,
    parentType: CompositeType,
  }): FetchGroup {
    let group = this.rootGroups.get(subgraphName);
    if (!group) {
      group = this.createRootFetchGroup({ subgraphName, rootKind, parentType });
      this.rootGroups.set(subgraphName, group);
    }
    return group;
  }

  rootSubgraphs(): readonly string[] {
    return this.rootGroups.keys();
  }

  isRootGroup(group: FetchGroup): boolean {
    return group === this.rootGroups.get(group.subgraphName);
  }

  createRootFetchGroup({
    subgraphName,
    rootKind,
    parentType,
  }: {
    subgraphName: string,
    rootKind: SchemaRootKind,
    parentType: CompositeType,
  }): FetchGroup {
    const group = this.newFetchGroup({ subgraphName, parentType, rootKind, hasInputs: false });
    this.rootGroups.set(subgraphName, group);
    return group;
  }

  private newFetchGroup({
    subgraphName,
    parentType,
    hasInputs,
    rootKind, // always "query" for entity fetches
    mergeAt,
    deferRef,
  }: {
    subgraphName: string,
    parentType: CompositeType,
    hasInputs: boolean,
    rootKind: SchemaRootKind,
    mergeAt?: ResponsePath,
    deferRef?: string,
  }): FetchGroup {
    this.onModification();
    const newGroup = FetchGroup.create({
      dependencyGraph: this,
      index: this.groups.length,
      subgraphName,
      rootKind,
      parentType,
      hasInputs,
      mergeAt,
      deferRef,
    });
    this.groups.push(newGroup);
    return newGroup;
  }

  getOrCreateKeyFetchGroup({
    subgraphName,
    mergeAt,
    type,
    parent,
    conditionsGroups,
    deferRef,
  }: {
    subgraphName: string,
    mergeAt: ResponsePath,
    type: CompositeType,
    parent: ParentRelation,
    conditionsGroups: FetchGroup[],
    deferRef?: string,
  }): FetchGroup {
    // Let's look if we can reuse a group we have, that is an existing child of the parent that:
    // 1. is for the same subgraph
    // 2. has the same mergeAt
    // 3. is for the same entity type (we don't reuse groups for different entities just yet, as this can create unecessary dependencies that
    //   gets in the way of some optimizations; the final optimizations in `reduceAndOptimize` will however later merge groups on the same subgraph
    //   and mergeAt when possibleA).
    // 4. is not part of our conditions or our conditions ancestors (meaning that we annot reuse a group if it fetches something we take as input).
    for (const existing of parent.group.children()) {
      if (existing.subgraphName === subgraphName
        && existing.mergeAt
        && sameMergeAt(existing.mergeAt, mergeAt)
        && existing.selection.selections().every((s) => s.kind === 'FragmentSelection' && s.element().castedType() === type)
        && !this.isInGroupsOrTheirAncestors(existing, conditionsGroups)
        && existing.deferRef === deferRef
      ) {
        const existingPathInParent = existing.parentRelation(parent.group)?.path;
        if (!samePathsInParents(existingPathInParent, parent.path)) {
          // We're at the same "mergeAt", so the 'path in parent' should mostly be the same, but it's not guaranteed to
          // be the exact same, in particular due to fragments with conditions (@skip/@include) that may be present in
          // one case but not the other. This is fine, and we still want to reuse the group in those case, but we should
          // erase the 'path in parent' in that case so we don't end up merging this group to another one "the wrong way"
          // later on.
          this.removePathInParent(parent.group, existing);
        }
        return existing;
      }
    }
    const newGroup = this.newKeyFetchGroup({
      subgraphName,
      mergeAt,
      deferRef
    });
    newGroup.addParent(parent);
    return newGroup
  }

  private removePathInParent(parent: FetchGroup, child: FetchGroup) {
    // Simplest option is to remove the parent edge and re-add it without a path.
    parent.removeChild(child);
    child.addParent({ group: parent });
  }

  newRootTypeFetchGroup({
    subgraphName,
    rootKind,
    parentType,
    mergeAt,
    deferRef,
  }: {
    subgraphName: string,
    rootKind: SchemaRootKind,
    parentType: ObjectType,
    mergeAt: ResponsePath,
    deferRef?: string,
  }): FetchGroup {
    return this.newFetchGroup({
      subgraphName,
      parentType,
      rootKind,
      hasInputs: false,
      mergeAt,
      deferRef
    });
  }

  // Returns true if `toCheck` is either part of `conditions`, or is one of their ancestors (potentially recursively).
  private isInGroupsOrTheirAncestors(toCheck: FetchGroup, conditions: FetchGroup[]): boolean  {
    const stack = conditions.concat();
    while (stack.length > 0) {
      const group = stack.pop()!;
      if (toCheck === group) {
        return true;
      }
      stack.push(...group.parentGroups());
    }
    return false;
  }

  typeForFetchInputs(name: string): CompositeType {
    const type = this.supergraphSchema.type(name);
    assert(type, `Type ${name} should exist in the supergraph`)
    assert(isCompositeType(type), `Type ${type} should be a composite, but got ${type.kind}`);
    return type;
  }

  newKeyFetchGroup({
    subgraphName,
    mergeAt,
    deferRef,
  }: {
    subgraphName: string,
    mergeAt: ResponsePath,
    deferRef?: string,
  }): FetchGroup {
    const parentType = this.federationMetadata(subgraphName).entityType();
    assert(parentType, () => `Subgraph ${subgraphName} has no entities defined`);
    return this.newFetchGroup({
      subgraphName,
      parentType,
      hasInputs: true,
      rootKind: 'query',
      mergeAt,
      deferRef
    });
  }

  remove(toRemove: FetchGroup) {
    this.onModification();

    // We copy the initial children and parents since we're going to modify them and wand to avoid issue with
    // modifying the list we're iterating one.
    const children = toRemove.children().concat();
    const parents = toRemove.parents().concat();
    // We remove any relationship from the removed group to it's children.
    for (const child of children) {
      // At the point where we call this, any potential child of the removed group should have been "dealt with": on
      // merge, the children should have relocated to whichever group we merged into, and if we remove some useless
      // group, then its child should have other parents, or we would be breaking our graph (leaving those child groups
      // unreachable). So this is our sanity check to ensure we haven't forgotten some step.
      assert(child.parents().length > 1, () => `Cannot remove ${toRemove} as it is the *only* parent of ${child}`);
      toRemove.removeChild(child);
    }

    // and then any parent relationship to the removed group.
    for (const parent of parents) {
      parent.group.removeChild(toRemove);
    }

    // We can now remove the entries for the removed group itself since it shouldn't be referenced anymore.
    this.groups.splice(toRemove.index, 1);

    // But as our group indexes index into arrays, we need to keep all existing group indexes contiguous, and as
    // we just removed `toRemove.index`, we need to "fixup" every index of groups with a higher index (decrementing
    // said index).
    for (let i = toRemove.index; i < this.groups.length; i++) {
      --this.groups[i].index;
    }
  }

  /**
   * Must be called every time the "shape" of the graph is modified to know that the graph may not be minimal/optimized anymore.
   *
   * This is not private due to the fact that the graph is implemented through the inter-connection of this class and the
   * `FetchGroup` one and so `FetchGroup` needs to call this. But this has no reason to be called from any other place.
   */
  onModification() {
    this.isReduced = false;
    this.isOptimized = false;
  }

  // Do a transitive reduction (https://en.wikipedia.org/wiki/Transitive_reduction) of the graph
  // We keep it simple and do a DFS from each vertex. The complexity is not amazing, but dependency
  // graphs between fetch groups will almost surely never be huge and query planning performance
  // is not paramount so this is almost surely "good enough".
  reduce() {
    if (this.isReduced) {
      return;
    }

    for (const group of this.groups) {
      this.dfsRemoveRedundantEdges(group);
    }

    this.isReduced = true;
  }

  // Reduce the graph (see `reduce`) and then do a some additional traversals to optimize for:
  //  1) fetches with no selection: this can happen when we have a require if the only field requested
  //     was the one with the require and that forced some dependencies. Those fetch should have
  //     no dependents and we can just remove them.
  //  2) fetches that are made in parallel to the same subgraph and the same path, and merge those.
  private reduceAndOptimize() {
    if (this.isOptimized) {
      return;
    }

    this.reduce();

    for (const group of this.rootGroups.values()) {
      this.removeEmptyGroups(group);
    }

    for (const group of this.rootGroups.values()) {
      this.removeUselessGroups(group);
    }

    for (const group of this.rootGroups.values()) {
      this.mergeChildFetchesForSameSubgraphAndPath(group);
    }

    this.mergeFetchesToSameSubgraphAndSameInputs();

    this.isOptimized = true;
  }

  private removeEmptyGroups(group: FetchGroup) {
    const children = group.children().concat();
    // Note: usually, empty groups are due to temporary groups created during the handling of @require
    // and note needed. There is a special case with @defer however whereby everything in a query is
    // deferred (not very useful in practice, but not disallowed by the spec), and in that case we will
    // end up with an empty root group. In that case, we don't remove that group, but instead will
    // recognize that case when processing groups later.
    if (group.selection.isEmpty() && !this.isRootGroup(group)) {
      this.remove(group);
    }
    for (const g of children) {
      this.removeEmptyGroups(g);
    }
  }

  private removeUselessGroups(group: FetchGroup) {
    // Recursing first, this makes it a bit easier to reason about.
    for (const child of group.children()) {
      this.removeUselessGroups(child);
    }

    if (group.isUseless()) {
      // In general, removing a group is a bit tricky because we need to deal with the fact
      // that the group can have multiple parents and children and no break the "path in parent"
      // in all those cases. To keep thing relatively easily, we only handle the following
      // cases (other cases will remain non-optimal, but hopefully this handle all the cases
      // we care about in practice):
      //   1. if the group has no children. In which case we can just remove it with no ceremony.
      //   2. if the group has only a single parent and we have a path to that parent.
      if (group.children().length === 0) {
        this.remove(group);
      } else {
        const parents = group.parents();
        const parent = parents[0];
        if (parents.length === 1 && parent.path) {
          parent.group.removeUselessChild(group);
        }
      }
    }
  }

  private mergeChildFetchesForSameSubgraphAndPath(group: FetchGroup) {
    const children = group.children();
    if (children.length > 1) {
      // We iterate on all pairs of children and merge those siblings that can be merged together. Note
      // that when we merged, we effectively modify the array we're iterating over, so we use indexes
      // and re-test against `children.length` every time to ensure we don't miss elements as we do so.
      for (let i = 0; i < children.length; i++) {
        const gi = children[i];
        let j = i + 1;
        while (j < children.length) {
          const gj = children[j];
          if (gi.canMergeSiblingIn(gj)) {
            // In theory, we can merge gi into gj, or gj into gi, it shouldn't matter. But we
            // merge gi into gj so our iteration can continue properly.
            gi.mergeSiblingIn(gj);

            // We're working on a minimal graph (we've done a transitive reduction beforehand) and we need to keep the graph
            // minimal as post-reduce steps (the `process` method) rely on it. But merging 2 groups _can_ break minimality.
            // Say we have:
            //   0 ------
            //            \
            //             4
            //   1 -- 3 --/
            // and we merge groups 0 and 1 (and let's call 2 the result), then we now have:
            //      ------
            //     /       \
            //   0 <-- 3 -- 4
            // which is not minimal.
            //
            // So to fix it, we just re-run our dfs removal from that merged edge (which is probably a tad overkill in theory,
            // but for the reasons mentioned on `reduce`, this is most likely a non-issue in practice).
            //
            // Note that this DFS can only affect the descendants of gi (its children and recursively so), so it does not
            // affect our current iteration.
            this.dfsRemoveRedundantEdges(gi);

            // The merging removed `gj`, so we shouldn't bump `j`, it's already on the next group.
          } else {
            ++j;
          }
        }
      }
    }

    // Now recurse to the sub-groups.
    for (const g of children) {
      this.mergeChildFetchesForSameSubgraphAndPath(g);
    }
  }

  private mergeFetchesToSameSubgraphAndSameInputs() {
    // Sometimes, the query will directly query some fields that are also requirements for some other queried fields, and because there
    // is complex dependencies involved, we won't be able to easily realize that we're doing the same fetch to a subgraph twice in 2
    // different places (once for the user query, once for the require). For an example of this happening, see the test called 'handles
    // diamond-shaped dependencies' in `buildPlan.test.ts` Of course, doing so is always inefficient and so this method ensures we
    // merge such fetches.
    // In practice, this method merges any 2 fetches that are to the same subgraph and same mergeAt, and have the exact same inputs.

    // To find which groups are to the same subgraph and mergeAt somewhat efficient, we generate a simple string key from each
    // group subgraph name and mergeAt. We do "sanitize" subgraph name, but have no worries for `mergeAt` since it contains either
    // number of field names, and the later is restricted by graphQL so as to not be an issue.
    const makeKey = (g: FetchGroup): string => `${toValidGraphQLName(g.subgraphName)}-${g.mergeAt?.join('::') ?? ''}`;
    const bySubgraphs = new MultiMap<string, FetchGroup>();
    for (const group of this.groups) {
      // we exclude groups without inputs because that's what we look for. In practice, this mostly just exclude
      // root groups, which we don't really want to bother with anyway.
      if (group.inputs) {
        bySubgraphs.add(makeKey(group), group);
      }
    }
    for (const groups of bySubgraphs.values()) {
      // In the vast majority of cases `groups` is going be a single element, so optimize that trival case away.
      if (groups.length <= 1) {
        continue;
      }

      // An array where each entry is a "bucket" of groups that can all be merge together.
      const toMergeBuckets: FetchGroup[][] = [];
      while (groups.length > 1) {
        const group = groups.pop()!;
        const bucket: FetchGroup[] = [ group ];
        // Bit of a hand-rolled loop here, but we're removing some elements, so this feel clearer overall
        let i = 0;
        while (i < groups.length) {
          const current = groups[i];
          if (group.deferRef === current.deferRef && group.inputs!.equals(current.inputs!)) {
            bucket.push(current);
            groups.splice(i, 1);
            // Note that we don't change `i` since we just removed the element at that index and so the new
            // element at that index is the next one we need to check.
          } else {
            ++i;
          }
        }
        // The bucket always has at leat the initial group, but there is only merging to be done if there is at least one more
        if (bucket.length > 1) {
          toMergeBuckets.push(bucket);
        }
      }

      for (const bucket of toMergeBuckets) {
        // We pick one fo the group and merge all other into it. Note that which group we choose shouldn't matter since
        // the merging preserves all the dependencies of each group (both parents and children).
        const group = bucket.pop()!;
        for (const other of bucket) {
          group.mergeInWithAllDependencies(other);
        }
      }
    }

    // We may have merged groups and broke the graph miminality in doing so, so we re-reduce to make sure. Note
    // that if we did no modification to the graph, calling `reduce` is cheap (the `isReduced` variable will still be `true`).
    this.reduce();
  }

  private dfsRemoveRedundantEdges(from: FetchGroup) {
    for (const startVertex of from.children()) {
      const stack = startVertex.children().concat();
      while (stack.length > 0) {
        const v = stack.pop()!;
        // Note that we rely on `removeChild` to be a no-op if there is not parent-child relation.
        from.removeChild(v);
        stack.push(...v.children());
      }
    }
  }

  private extractChildrenAndDeferredDependencies(
    group: FetchGroup
  ): {
    children: FetchGroup[],
    deferredGroups: SetMultiMap<string, FetchGroup>,
  } {
    const children: FetchGroup[] = [];
    const deferredGroups = new SetMultiMap<string, FetchGroup>();
    for (const child of group.children()) {
      if (group.deferRef === child.deferRef) {
        children.push(child);
      } else {
        assert(child.deferRef, () => `${group} has deferRef "${group.deferRef}", so its child ${child} cannot have a top-level deferRef`);
        // In general, we want to mark the group as a dependency for its deferred children. An exception is where this group
        // is empty, in which case it won't be included in the plan, and so we don't want to indicate a "broken" dependency
        // in the resulting plan. Note that in practice this only happen for a case where everything in a query is deferred,
        // and so the "primary" part of the `DeferNode` will be empyt, so having an empty set of dependencies for the deferred
        // part is harmless (basically, it says "wait for everyting in the primary part" but there is nothing in the primary
        // part so there is not actualy "wait").
        if (!group.selection.isEmpty()) {
          if (!group.id) {
            group.id = String(this.fetchIdGen++);
          }
          this.deferTracking.addDependency(child.deferRef, group.id);
        }
        deferredGroups.add(child.deferRef, child);
      }
    }
    return { children, deferredGroups };
  }

  private processGroup<TProcessed, TDeferred>(
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    group: FetchGroup,
  ): {
    main: TProcessed,
    unhandled: UnhandledGroups,
    deferredGroups: SetMultiMap<string, FetchGroup>,
  } {
    const { children, deferredGroups } = this.extractChildrenAndDeferredDependencies(group);
    const processed = processor.onFetchGroup(group);
    if (children.length == 0) {
      return { main: processed, unhandled: [], deferredGroups };
    }

    const groupIsOnlyParentOfAllChildren = children.every(g => g.parents().length === 1);
    if (groupIsOnlyParentOfAllChildren) {
      // We process the children as if they were parallel roots (they are from `processed`
      // in a way), and then just add process at the beginning of the sequence.
      const {
        mainSequence,
        unhandled,
        deferredGroups: allDeferredGroups,
      } = this.processRootMainGroups({
        processor,
        rootGroups: children,
        rootsAreParallel: true,
        initialDeferredGroups: deferredGroups,
      });
      return {
        main: processor.reduceSequence([processed].concat(mainSequence)),
        unhandled,
        deferredGroups: allDeferredGroups,
      };
    } else {
      // We return just the group, with all other groups to be handled after, but remembering that
      // this group edge has been handled.
      return {
        main: processed,
        unhandled: children.map(g => [g, g.parents().filter((p) => p.group !== group)]),
        deferredGroups,
      };
    }
  }

  private processGroups<TProcessed, TDeferred>(
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    groups: readonly FetchGroup[],
    processInParallel: boolean,
    remaining: UnhandledGroups
  ): {
    processed: TProcessed,
    next: FetchGroup[],
    unhandled: UnhandledGroups,
    deferredGroups: SetMultiMap<string, FetchGroup>,
  } {
    const processedNodes: TProcessed[] = [];
    const allDeferredGroups = new SetMultiMap<string, FetchGroup>();
    let remainingNext = remaining;
    let toHandleNext: FetchGroup[] = [];
    for (const group of groups) {
      const { main, deferredGroups, unhandled } = this.processGroup(processor, group);
      processedNodes.push(main);
      allDeferredGroups.addAll(deferredGroups);
      const [canHandle, newRemaining] = this.mergeRemainings(remainingNext, unhandled);
      toHandleNext = toHandleNext.concat(canHandle);
      remainingNext = newRemaining;
    }
    return {
      processed: processInParallel ? processor.reduceParallel(processedNodes) : processor.reduceSequence(processedNodes),
      next: toHandleNext,
      unhandled: remainingNext,
      deferredGroups: allDeferredGroups,
    };
  }

  private mergeRemainings(r1: UnhandledGroups, r2: UnhandledGroups): [FetchGroup[], UnhandledGroups] {
    const unhandled: UnhandledGroups = [];
    const toHandle: FetchGroup[] = [];
    for (const [g, edges] of r1) {
      const newEdges = this.mergeRemaingsAndRemoveIfFound(g, edges, r2);
      if (newEdges.length == 0) {
        toHandle.push(g);
      } else {
        unhandled.push([g, newEdges])
      }
    }
    unhandled.push(...r2);
    return [toHandle, unhandled];
  }

  private mergeRemaingsAndRemoveIfFound(group: FetchGroup, inEdges: UnhandledParentRelations, otherGroups: UnhandledGroups): UnhandledParentRelations {
    const idx = otherGroups.findIndex(g => g[0] === group);
    if (idx < 0) {
      return inEdges;
    } else {
      const otherEdges = otherGroups[idx][1];
      otherGroups.splice(idx, 1);
      // The uhandled are the one that are unhandled on both side.
      return inEdges.filter(e => otherEdges.includes(e))
    }
  }

  /**
   * Process the "main" (non-deferred) groups starting at the provided roots. The deferred groups are collected
   * by this method but not otherwise processed.
   */
  private processRootMainGroups<TProcessed, TDeferred>({
    processor,
    rootGroups,
    rootsAreParallel,
    initialDeferredGroups,
  }: {
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    rootGroups: readonly FetchGroup[]
    rootsAreParallel: boolean,
    initialDeferredGroups?: SetMultiMap<string, FetchGroup>,
  }): {
    mainSequence: TProcessed[],
    unhandled: UnhandledGroups,
    deferredGroups: SetMultiMap<string, FetchGroup>,
  } {
    let nextGroups = rootGroups;
    let remainingNext: UnhandledGroups = [];
    const mainSequence: TProcessed[] = [];
    const allDeferredGroups = initialDeferredGroups
      ? new SetMultiMap<string, FetchGroup>(initialDeferredGroups)
      : new SetMultiMap<string, FetchGroup>();
    let processInParallel = rootsAreParallel;
    while (nextGroups.length > 0) {
      const { processed, next, unhandled, deferredGroups } = this.processGroups(processor, nextGroups, processInParallel, remainingNext);
      // After the root groups, handled on the first iteration, we can process everything in parallel.
      processInParallel = true;
      mainSequence.push(processed);
      const [canHandle, newRemaining] = this.mergeRemainings(remainingNext, unhandled);
      remainingNext = newRemaining;
      nextGroups = canHandle.concat(next);
      allDeferredGroups.addAll(deferredGroups);
    }
    return {
      mainSequence,
      unhandled: remainingNext,
      deferredGroups: allDeferredGroups,
    };
  }

  private processRootGroups<TProcessed, TDeferred>({
    processor,
    rootGroups,
    rootsAreParallel = true,
    currentDeferRef,
    otherDeferGroups = undefined,
  }: {
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    rootGroups: readonly FetchGroup[],
    rootsAreParallel: boolean,
    unhandledGroups?: UnhandledGroups,
    currentDeferRef?: string,
    otherDeferGroups?: SetMultiMap<string, FetchGroup>,
  }): {
    mainSequence: TProcessed[],
    deferred: TDeferred[],
  } {
    const {
      mainSequence,
      unhandled,
      deferredGroups,
    } = this.processRootMainGroups({ processor, rootsAreParallel, rootGroups });
    assert(unhandled.length == 0, () => `Root groups ${rootGroups} should have no remaining groups unhandled, but got ${unhandled}`);
    const allDeferredGroups = new SetMultiMap<string, FetchGroup>();
    if (otherDeferGroups) {
      allDeferredGroups.addAll(otherDeferGroups);
    }
    allDeferredGroups.addAll(deferredGroups);

    // We're going to handled all @defer at our "current level" (so at top-level, that's all the non-nested @defer),
    // and the "starting" group for those defers, if any, are in `allDeferredGroups`. However, `allDeferredGroups`
    // can actually contains defer groups that are for "deeper" level of @defer-nestedness, and that is because
    // sometimes the key we need to resume a nested @defer is the same than for the current @defer (or put another way,
    // a @defer B may be nested inside @defer A "in the query", but be such that we don't need anything fetched within
    // the deferred part of A to start the deferred part of B).
    // Long story short, we first collect the groups from `allDeferredGroups` that are _not_ in our current level, if
    // any, and pass those to recursion call below so they can be use a their proper level of nestedness.
    const defersInCurrent = this.deferTracking.defersInParent(currentDeferRef);
    const handledDefersInCurrent = new Set(defersInCurrent.map((d) => d.label));
    const unhandledDefersInCurrent = mapKeys(allDeferredGroups).filter((label) => !handledDefersInCurrent.has(label));
    let unhandledDeferGroups: SetMultiMap<string, FetchGroup> | undefined = undefined;
    if (unhandledDefersInCurrent.length > 0) {
      unhandledDeferGroups = new SetMultiMap();
      for (const label of unhandledDefersInCurrent) {
        unhandledDeferGroups.set(label, allDeferredGroups.get(label)!);
      }
    }

    // We now iterate on every @defer of said "current level". Note in particular that we may not be able to truly defer
    // anything for some of those @defer due the limitations of what can be done at the query planner level. However, we
    // still create `DeferNode` and `DeferredNode` in those case so that the execution can at least defer the sending of
    // the response back (future handling of defer-passthrough will also piggy-back on this).
    const allDeferred: TDeferred[] = [];
    for (const defer of defersInCurrent) {
      const groups = allDeferredGroups.get(defer.label) ?? [];
      const { mainSequence: mainSequenceOfDefer, deferred: deferredOfDefer } = this.processRootGroups({
        processor,
        rootGroups: Array.from(groups),
        rootsAreParallel: true,
        currentDeferRef: defer.label,
        otherDeferGroups: unhandledDeferGroups,
      });
      const mainReduced = processor.reduceSequence(mainSequenceOfDefer);
      const processed = deferredOfDefer.length === 0
        ? mainReduced
        : processor.reduceDefer(mainReduced, defer.subselection, deferredOfDefer);
      allDeferred.push(processor.reduceDeferred(defer, processed));
    }
    return { mainSequence, deferred: allDeferred };
  }

  /**
   * Processes the "plan" represented by this dependency graph using the provided `processor`.
   *
   * @return both a "main" (non-deferred) part and a (potentially empty) deferred part.
   */
  process<TProcessed, TDeferred>(
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    rootKind: SchemaRootKind,
  ): {
    main: TProcessed,
    deferred: TDeferred[],
  } {
    this.reduceAndOptimize();

    const { mainSequence, deferred } = this.processRootGroups({
      processor,
      rootGroups: this.rootGroups.values(),
      rootsAreParallel: rootKind === 'query',
    });
    // Note that the return of `processRootGroups` should always be reduced as a sequence, regardless of `rootKind`.
    // For queries, it just happens in that the majority of cases, `mainSequence` will be an array of a single element
    // and that single element will be a parallel node of the actual roots. But there is some special cases where some
    // while the roots are started in parallel, the overall plan shape is something like:
    //   Root1 \
    //          -> Other
    //   Root2 /
    // And so it is a sequence, even if the roots will be queried in parallel.
    return {
      main: processor.reduceSequence(mainSequence),
      deferred,
    };
  }

  dumpOnConsole(msg?: string) {
    if (msg) {
      console.log(msg);
    }
    console.log('Groups:');
    for (const group of this.groups) {
      console.log(`  ${group}`);
    }
    console.log('Children relationships:');
    for (const group of this.groups) {
      const children = group.children();
      if (children.length === 1) {
        console.log(`  [${group.index}] => [ ${children[0]} ]`);
      } else if (children.length !== 0) {
        console.log(`  [${group.index}] => [\n    ${children.join('\n    ')}\n  ]`);
      }
    }
    console.log('Parent relationships:');
    const printParentRelation = (rel: ParentRelation) => (
      rel.path ? `${rel.group} (path: [${rel.path.join(', ')}])` : rel.group.toString()
    );
    for (const group of this.groups) {
      const parents = group.parents();
      if (parents.length === 1) {
        console.log(`  [${group.index}] => [ ${printParentRelation(parents[0])} ]`);
      } else if (parents.length !== 0) {
        console.log(`  [${group.index}] => [\n    ${parents.map(printParentRelation).join('\n    ')}\n  ]`);
      }
    }
    console.log('--------');
  }

  toString() : string {
    return this.rootGroups.values().map(g => this.toStringInternal(g, "")).join('\n');
  }

  toStringInternal(group: FetchGroup, indent: string): string {
    const children = group.children();
    return [indent + group.subgraphName + ' <- ' + children.map((child) => child.subgraphName).join(', ')]
      .concat(children
        .flatMap(g => g.children().length == 0
          ? []
          : this.toStringInternal(g, indent + "  ")))
      .join('\n');
  }
}

/**
 * Generic interface for "processing" a (reduced) dependency graph of fetch groups (a `FetchDependencyGraph`).
 *
 * The processor methods will be called in a way that "respects" the dependency graph. More precisely, a
 * reduced fetch group dependency graph can be expressed as an alternance of parallel branches and sequences
 * of groups (the roots needing to be either parallel or sequential depending on whether we represent a `query`
 * or a `mutation`), and the processor will be called on groups in such a way.
 */
interface FetchGroupProcessor<TProcessed, TDeferred> {
  onFetchGroup(group: FetchGroup): TProcessed;
  reduceParallel(values: TProcessed[]): TProcessed;
  reduceSequence(values: TProcessed[]): TProcessed;
  reduceDeferred(deferInfo: DeferredInfo, value: TProcessed): TDeferred;
  reduceDefer(main: TProcessed, subSelection: SelectionSet, deferredBlocks: TDeferred[]): TProcessed,
}

export type PlanningStatistics = {
  evaluatedPlanCount: number,
}

export class QueryPlanner {
  private readonly config: Concrete<QueryPlannerConfig>;
  private readonly federatedQueryGraph: QueryGraph;
  private _lastGeneratedPlanStatistics: PlanningStatistics | undefined;

  // A set of the names of interface types for which at least one subgraph use an @interfaceObject to abstract
  // that interface.
  private readonly interfaceTypesWithInterfaceObjects = new Set<string>();

  constructor(
    public readonly supergraphSchema: Schema,
    config?: QueryPlannerConfig
  ) {
    this.config = enforceQueryPlannerConfigDefaults(config);
    this.federatedQueryGraph = buildFederatedQueryGraph(supergraphSchema, true);
    this.collectInterfaceTypesWithInterfaceObjects();
  }

  private collectInterfaceTypesWithInterfaceObjects() {
    const isInterfaceObject = (name: string, schema: Schema) => {
      const typeInSchema = schema.type(name);
      return !!typeInSchema && isInterfaceObjectType(typeInSchema);
    }

    for (const itfType of this.supergraphSchema.interfaceTypes()) {
      if (mapValues(this.federatedQueryGraph.sources).some((s) => isInterfaceObject(itfType.name, s))) {
        this.interfaceTypesWithInterfaceObjects.add(itfType.name);
      }
    }
  }

  buildQueryPlan(operation: Operation): QueryPlan {
    if (operation.selectionSet.isEmpty()) {
      return { kind: 'QueryPlan' };
    }

    if (operation.rootKind === 'subscription') {
      throw ERRORS.UNSUPPORTED_FEATURE.err(
        'Query planning does not currently support subscriptions.',
        { nodes: [parse(operation.toString())] },
      );
    }

    const statistics: PlanningStatistics = {
      evaluatedPlanCount: 0,
    };
    this._lastGeneratedPlanStatistics = statistics;

    const reuseQueryFragments = this.config.reuseQueryFragments ?? true;
    let fragments = operation.selectionSet.fragments
    if (fragments && reuseQueryFragments) {
      // For all subgraph fetches we query `__typename` on every abstract types (see `FetchGroup.toPlanNode`) so if we want
      // to have a chance to reuse fragments, we should make sure those fragments also query `__typename` for every abstract type.
      fragments = addTypenameFieldForAbstractTypesInNamedFragments(fragments)
    } else {
      fragments = undefined;
    }

    // We expand all fragments. This might merge a number of common branches and save us some work, and we're
    // going to expand everything during the algorithm anyway. We'll re-optimize subgraph fetches with fragments
    // later if possible (which is why we saved them above before expansion).
    operation = operation.expandAllFragments();
    operation = withoutIntrospection(operation);
    operation = this.withSiblingTypenameOptimizedAway(operation);

    let assignedDeferLabels: Set<string> | undefined = undefined;
    let hasDefers: boolean = false;
    let deferConditions: SetMultiMap<string, string> | undefined = undefined;
    if (this.config.incrementalDelivery.enableDefer) {
      ({ operation, hasDefers, assignedDeferLabels, deferConditions } = operation.withNormalizedDefer());
    } else {
      // If defer is not enabled, we remove all @defer from the query. This feels cleaner do this once here than
      // having to guard all the code dealing with defer later, and is probably less error prone too (less likely
      // to end up passing through a @defer to a subgraph by mistake).
      operation = operation.withoutDefer();
    }

    debug.group(() => `Computing plan for\n${operation}`);
    if (operation.selectionSet.isEmpty()) {
      debug.groupEnd('Empty plan');
      return { kind: 'QueryPlan' };
    }

    const root = this.federatedQueryGraph.root(operation.rootKind);
    assert(root, () => `Shouldn't have a ${operation.rootKind} operation if the subgraphs don't have a ${operation.rootKind} root`);
    const processor = fetchGroupToPlanProcessor({
      config: this.config,
      variableDefinitions: operation.variableDefinitions,
      fragments,
      operationName: operation.name,
      assignedDeferLabels,
    });


    let rootNode: PlanNode | undefined;
    if (deferConditions && deferConditions.size > 0) {
      assert(hasDefers, 'Should not have defer conditions without @defer');
      rootNode = computePlanForDeferConditionals({
        supergraphSchema: this.supergraphSchema,
        federatedQueryGraph: this.federatedQueryGraph,
        operation,
        processor,
        root,
        deferConditions,
        statistics,
      })
    } else {
      rootNode = computePlanInternal({
        supergraphSchema: this.supergraphSchema,
        federatedQueryGraph: this.federatedQueryGraph,
        operation,
        processor,
        root,
        hasDefers,
        statistics,
      });
    }

    debug.groupEnd('Query plan computed');

    return { kind: 'QueryPlan', node: rootNode };
  }

  /**
   * Modifies the provided selection set to optimize the handling of __typename selection for query planning.
   *
   * Explicit querying of __typename can create some inefficiency for the query planning process if not
   * handled specially. More precisely, query planning performance is directly proportional to how many possible
   * plans a query has, since it compute all those options to compare them. Further, the number of possible
   * plans double for every field for which there is a choice, so miminizing the number of field for which we
   * have choices is paramount.
   *
   * And for a given type, __typename can always be provided by any subgraph having that type (it works as a
   * kind of "always @shareable" field), so it often creates theoretical choices. In practice it doesn't
   * matter which subgraph we use for __typename: we're happy to use whichever subgraph we're using for
   * the "other" fields queried for the type. But the default query planning algorithm does not know how
   * to do that.
   *
   * Let's note that this isn't an issue in most cases, because the query planning algorithm knows not to
   * consider "obviously" inefficient paths. Typically, querying the __typename of an entity is generally
   * ok because when looking at a path, the query planning algorithm always favor getting a field "locally"
   * if it can (which it always can for __typename) and ignore alternative that would jump subgraphs.
   *
   * But this can still be a performance issue when a __typename is queried after a @shareable field: in
   * that case, the algorithm would consider getting the __typename from each version of the @shareable
   * field and this would add to the options to consider. But as, again, __typename can always be fetched
   * from any subgraph, it's more efficient to ignore those options and simply get __typename from whichever
   * subgraph we get any other of the other field requested (on the type on which we request __typename).
   *
   * It is unclear how to do this cleanly with the current planning algorithm however, so this method
   * implements an alternative: to avoid the query planning spending time of exploring options for
   * __typename, we "remove" the __typename selections from the operation. But of course, we still
   * need to ensure that __typename is effectively queried, so as we do that removal, we also "tag"
   * one of the "sibling" selection (using `addAttachement`) to remember that __typename needs to
   * be added back eventually. The core query planning algorithm will ignore that tag, and because
   * __typename has been otherwise removed, we'll save any related work. But as we build the final
   * query plan, we'll check back for those "tags" (see `getAttachement` in `computeGroupsForTree`),
   * and when we fine one, we'll add back the request to __typename. As this only happen after the 
   * query planning algorithm has computed all choices, we achieve our goal of not considering useless 
   * choices due to __typename. Do note that if __typename is the "only" selection of some selection
   * set, then we leave it untouched, and let the query planning algorithm treat it as any other
   * field. We have no other choice in that case, and that's actually what we want.
   */
  private optimizeSiblingTypenames(selectionSet: SelectionSet): SelectionSet {
    const selections = selectionSet.selections();
    const parentType = selectionSet.parentType;
    const parentMaybeInterfaceObject = this.interfaceTypesWithInterfaceObjects.has(parentType.name);
    let updatedSelections: Selection[] | undefined = undefined;
    let typenameSelection: Selection | undefined = undefined;
    // We remember the first non-__typename field selection found. This is the one we'll "tag" if we do find a __typename
    // occurrence that we want to remove. We only use for _field_ selections because at the stage where this is applied,
    // we cannot be sure the selection set is "minimized" and so some of the inline fragments may end up being eliminated
    // (for instance, the fragment condition could be "less precise" than the parent type, in which case query planning
    // will ignore it) and tagging those could lose the tagging.
    let firstFieldSelection: FieldSelection | undefined = undefined;
    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      let updated: Selection | undefined;
      if (
        !typenameSelection
        && selection.kind === 'FieldSelection'
        && selection.field.name === typenameFieldName
        && !parentMaybeInterfaceObject
      ) {
        // The reason we check for `!typenameSelection` is that due to aliasing, there can be more than one __typename selection
        // in theory, and so this will only kick in on the first one. This is fine in practice: it only means that if there _is_ 
        // 2 selection of __typename, then we won't optimise things as much as we could, but there is no practical reason
        // whatsoever to have 2 selection of __typename in the first place, so not being optimal is moot.
        //
        // Also note that we do not remove __typename if on (interface) types that are implemented by 
        // an @interfaceObject in some subgraph: the reason is that those types are an exception to the rule
        // that __typename can be resolved from _any_ subgraph, as the __typename of @interfaceObject is not
        // one we should return externally and so cannot fulfill the user query.
        updated = undefined;
        typenameSelection = selection;
      } else {
        const updatedSubSelection = selection.selectionSet ? this.optimizeSiblingTypenames(selection.selectionSet) : undefined;
        if (updatedSubSelection === selection.selectionSet) {
          updated = selection;
        } else {
          updated = selection.withUpdatedSubSelection(updatedSubSelection);
        }
        if (!firstFieldSelection && updated.kind === 'FieldSelection') {
          firstFieldSelection = updated;
        }
      }

      // As soon as we find a selection that is discarded or modified, we need to create new selection set so we
      // first copy everything up to this selection.
      if (updated !== selection && !updatedSelections) {
        updatedSelections = [];
        for (let j = 0; j < i; j++) {
          updatedSelections.push(selections[j]);
        }
      }
      // Record the (potentially updated) selection if we're creating a new selection set, and said selection is not discarded.
      if (updatedSelections && !!updated) {
        updatedSelections.push(updated);
      }
    }

    if (!updatedSelections || updatedSelections.length === 0) {
      // No selection was modified at all, or there is no other field selection than __typename one.
      // In both case, we just return the current selectionSet unmodified.
      return selectionSet;
    }

    // If we have some __typename selection that was removed but need to be "remembered" for later,
    // "tag" whichever first field selection is still part of the operation.
    if (typenameSelection) {
      if (firstFieldSelection) {
        // Note that as we tag the element, we also record the alias used if any since that needs to be preserved.
        firstFieldSelection.element().addAttachement(SIBLING_TYPENAME_KEY, typenameSelection.field.alias ? typenameSelection.field.alias : '');
      } else {
        // If we have no other field selection, then we can't optimize __typename and we need to add
        // it back to the updated subselections (we add it first because that's usually where we
        // put __typename by convention).
        updatedSelections = [typenameSelection as Selection].concat(updatedSelections);
      }
    }
    return new SelectionSet(selectionSet.parentType, selectionSet.fragments).addAll(updatedSelections)
  }

  /**
   * Applies `optimizeSiblingTypenames` to the provided operation selection set.
   */
  private withSiblingTypenameOptimizedAway(operation: Operation): Operation {
    const updatedSelectionSet = this.optimizeSiblingTypenames(operation.selectionSet);
    if (updatedSelectionSet === operation.selectionSet) {
      return operation;
    }
    return new Operation(
      operation.schema,
      operation.rootKind,
      updatedSelectionSet,
      operation.variableDefinitions,
      operation.name
    );
  }

  lastGeneratedPlanStatistics(): PlanningStatistics | undefined {
    return this._lastGeneratedPlanStatistics;
  }
}

function computePlanInternal({
  supergraphSchema,
  federatedQueryGraph,
  operation,
  processor,
  root,
  hasDefers,
  statistics,
}: {
  supergraphSchema: Schema,
  federatedQueryGraph: QueryGraph,
  operation: Operation,
  processor: FetchGroupProcessor<PlanNode | undefined, DeferredNode>
  root: RootVertex,
  hasDefers: boolean,
  statistics: PlanningStatistics,
}): PlanNode | undefined {
  let main: PlanNode | undefined = undefined;
  let primarySelection: SelectionSet | undefined = undefined;
  let deferred: DeferredNode[] = [];

  if (operation.rootKind === 'mutation') {
    const dependencyGraphs = computeRootSerialDependencyGraph(supergraphSchema, operation, federatedQueryGraph, root, hasDefers, statistics);
    for (const dependencyGraph of dependencyGraphs) {
      const { main: localMain, deferred: localDeferred } = dependencyGraph.process(processor, operation.rootKind);
      // Note that `reduceSequence` "flatten" sequence if needs be.
      main = main ? processor.reduceSequence([main, localMain]) : localMain;
      deferred = deferred.concat(localDeferred);
      const newSelection = dependencyGraph.deferTracking.primarySelection;
      if (newSelection) {
        if (primarySelection) {
          primarySelection.mergeIn(newSelection);
        } else {
          primarySelection = newSelection.clone();
        }
      }
    }
  } else {
    const dependencyGraph =  computeRootParallelDependencyGraph(supergraphSchema, operation, federatedQueryGraph, root, 0, hasDefers, statistics);
    ({ main, deferred } = dependencyGraph.process(processor, operation.rootKind));
    primarySelection = dependencyGraph.deferTracking.primarySelection;

  }
  if (deferred.length > 0) {
    assert(primarySelection, 'Should have had a primary selection created');
    return processor.reduceDefer(main, primarySelection, deferred);
  }
  return main;
}

function computePlanForDeferConditionals({
  supergraphSchema,
  federatedQueryGraph,
  operation,
  processor,
  root,
  deferConditions,
  statistics,
}: {
  supergraphSchema: Schema,
  federatedQueryGraph: QueryGraph,
  operation: Operation,
  processor: FetchGroupProcessor<PlanNode | undefined, DeferredNode>
  root: RootVertex,
  deferConditions: SetMultiMap<string, string>,
  statistics: PlanningStatistics,
}): PlanNode | undefined {
  return generateConditionNodes(
    operation,
    Array.from(deferConditions.entries()),
    0,
    (op) => computePlanInternal({
      supergraphSchema,
      federatedQueryGraph,
      operation: op,
      processor,
      root,
      hasDefers: true,
      statistics,
    }),
  );
}

function generateConditionNodes(
  operation: Operation,
  conditions: [string, Set<string>][],
  idx: number,
  onFinalOperation: (operation: Operation) => PlanNode | undefined,
): PlanNode | undefined {
  if (idx >= conditions.length) {
    return onFinalOperation(operation);
  }

  const [variable, labels] = conditions[idx];
  const ifOperation = operation;
  const elseOperation = operation.withoutDefer(labels);
  return {
    kind: 'Condition',
    condition: variable,
    // Note: for the `<variable>: true` case, we don't modify the operation at all. In theory, it would be cleaner to
    // modify the operation to remove the `if` condition on all the `@defer` from `labels` (or modify it to hard-coded 'true'),
    // to make it clear those @defer are "enabled" on that branch. In practice though, the rest of the query planning
    // completely ignores the `if` argument, so leaving it in untouched ends up equivalent and that saves us a few cyclesf.
    ifClause: generateConditionNodes(ifOperation, conditions, idx+1, onFinalOperation),
    elseClause: generateConditionNodes(elseOperation, conditions, idx+1, onFinalOperation),
  };
}

function isIntrospectionSelection(selection: Selection): boolean {
  return selection.kind == 'FieldSelection' && selection.element().definition.isIntrospectionField();
}

function mapOptionsToSelections<RV extends Vertex>(
  selectionSet: SelectionSet,
  options: SimultaneousPathsWithLazyIndirectPaths<RV>[]
): [Selection, SimultaneousPathsWithLazyIndirectPaths<RV>[]][]  {
  // We reverse the selections because we're going to pop from `openPaths` and this ensure we end up handling things in the query order.
  return selectionSet.selections(true).map(node => [node, options]);
}

function possiblePlans(closedBranches: SimultaneousPaths<any>[][]): number {
  let totalCombinations = 1;
  for (let i = 0; i < closedBranches.length; ++i){
    const eltSize = closedBranches[i].length;
    if (eltSize === 0) {
      // This would correspond to not being to find *any* path for a particular queried field, which means we have no plan
      // for the overall query. Now, this shouldn't happen in practice if composition validation has been run successfully
      // (and is not buggy), since the goal of composition validation is exactly to ensure we can never run into this path.
      // In any case, we will throw later if that happens, but let's just return the proper result here, which is no plan at all.
      return 0;
    }
    totalCombinations *= eltSize;
  }
  return totalCombinations;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function selectionCost(selection?: SelectionSet, depth: number = 1): number {
  // The cost is essentially the number of elements in the selection, but we make deeped element cost a tiny bit more, mostly to make things a tad more
  // deterministic (typically, if we have an interface with a single implementation, then we can have a choice between a query plan that type-explode a
  // field of the interface and one that doesn't, and both will be almost identical, except that the type-exploded field will be a different depth; by
  // favoring lesser depth in that case, we favor not type-expoding).
  return selection ? selection.selections().reduce((prev, curr) => prev + depth + selectionCost(curr.selectionSet, depth + 1), 0) : 0;
}

function withoutIntrospection(operation: Operation): Operation {
  // Note that, because we only apply this to the top-level selections, we skip all introspection, including
  // __typename. In general, we don't want o ignore __typename during query plans, but at top-level, we
  // can let the gateway execution deal with it rather than querying some service for that.
  if (!operation.selectionSet.selections().some(isIntrospectionSelection)) {
    return operation
  }

  const newSelections = operation.selectionSet.selections().filter(s => !isIntrospectionSelection(s));
  return new Operation(
    operation.schema,
    operation.rootKind,
    new SelectionSet(operation.selectionSet.parentType).addAll(newSelections),
    operation.variableDefinitions,
    operation.name
  );
}

function computeRootParallelDependencyGraph(
  supergraphSchema: Schema,
  operation: Operation,
  federatedQueryGraph: QueryGraph,
  root: RootVertex,
  startFetchIdGen: number,
  hasDefer: boolean,
  statistics: PlanningStatistics,
): FetchDependencyGraph {
  return computeRootParallelBestPlan(
    supergraphSchema,
    operation.selectionSet,
    operation.variableDefinitions,
    federatedQueryGraph,
    root,
    startFetchIdGen,
    hasDefer,
    statistics,
  )[0];
}

function computeRootParallelBestPlan(
  supergraphSchema: Schema,
  selection: SelectionSet,
  variables: VariableDefinitions,
  federatedQueryGraph: QueryGraph,
  root: RootVertex,
  startFetchIdGen: number,
  hasDefers: boolean,
  statistics: PlanningStatistics,
): [FetchDependencyGraph, OpPathTree<RootVertex>, number] {
  const planningTraversal = new QueryPlanningTaversal(
    supergraphSchema,
    federatedQueryGraph,
    selection,
    startFetchIdGen,
    hasDefers,
    variables,
    statistics,
    root,
    root.rootKind,
    defaultCostFunction,
    emptyContext,
  );
  const plan = planningTraversal.findBestPlan();
  // Getting no plan means the query is essentially unsatisfiable (it's a valid query, but we can prove it will never return a result),
  // so we just return an empty plan.
  return plan ?? createEmptyPlan(supergraphSchema, federatedQueryGraph, root);
}

function createEmptyPlan(
  supergraphSchema: Schema,
  federatedQueryGraph: QueryGraph,
  root: RootVertex
): [FetchDependencyGraph, OpPathTree<RootVertex>, number] {
  return [
    FetchDependencyGraph.create(supergraphSchema, federatedQueryGraph, 0, undefined),
    PathTree.createOp(federatedQueryGraph, root),
    0
  ];
}

function onlyRootSubgraph(graph: FetchDependencyGraph): string {
  const subgraphs = graph.rootSubgraphs();
  assert(subgraphs.length === 1, () => `${graph} should have only one root, but has [${graph.rootSubgraphs()}]`);
  return subgraphs[0];
}

function computeRootSerialDependencyGraph(
  supergraphSchema: Schema,
  operation: Operation,
  federatedQueryGraph: QueryGraph,
  root: RootVertex,
  hasDefers: boolean,
  statistics: PlanningStatistics,
): FetchDependencyGraph[] {
  const rootType = hasDefers ? supergraphSchema.schemaDefinition.rootType(root.rootKind) : undefined;
  // We have to serially compute a plan for each top-level selection.
  const splittedRoots = splitTopLevelFields(operation.selectionSet);
  const graphs: FetchDependencyGraph[] = [];
  let startingFetchId: number = 0;
  let [prevDepGraph, prevPaths] = computeRootParallelBestPlan(supergraphSchema, splittedRoots[0], operation.variableDefinitions, federatedQueryGraph, root, startingFetchId, hasDefers, statistics);
  let prevSubgraph = onlyRootSubgraph(prevDepGraph);
  for (let i = 1; i < splittedRoots.length; i++) {
    const [newDepGraph, newPaths] = computeRootParallelBestPlan(supergraphSchema, splittedRoots[i], operation.variableDefinitions, federatedQueryGraph, root, prevDepGraph.nextFetchId(), hasDefers, statistics);
    const newSubgraph = onlyRootSubgraph(newDepGraph);
    if (prevSubgraph === newSubgraph) {
      // The new operation (think 'mutation' operation) is on the same subgraph than the previous one, so we can concat them in a single fetch
      // and rely on the subgraph to enforce seriability. Do note that we need to `concat()` and not `merge()` because if we have
      // mutation Mut {
      //    mut1 {...}
      //    mut2 {...}
      //    mut1 {...}
      // }
      // then we should _not_ merge the 2 `mut1` fields (contrarily to what happens on queried fields).
      prevPaths = prevPaths.concat(newPaths);
      prevDepGraph = computeRootFetchGroups(FetchDependencyGraph.create(supergraphSchema, federatedQueryGraph, startingFetchId, rootType), prevPaths, root.rootKind);
    } else {
      startingFetchId = prevDepGraph.nextFetchId();
      graphs.push(prevDepGraph);
      [prevDepGraph, prevPaths, prevSubgraph] = [newDepGraph, newPaths, newSubgraph];
    }
  }
  graphs.push(prevDepGraph);
  return graphs;
}

function splitTopLevelFields(selectionSet: SelectionSet): SelectionSet[] {
  return selectionSet.selections().flatMap(selection => {
    if (selection.kind === 'FieldSelection') {
      return [selectionSetOf(selectionSet.parentType, selection)];
    } else {
      return splitTopLevelFields(selection.selectionSet).map(s => selectionSetOfElement(selection.element(), s));
    }
  });
}

function toValidGraphQLName(subgraphName: string): string {
  // We have almost no limitations on subgraph names, so we cannot use them inside query names
  // without some cleaning up. GraphQL names can only be: [_A-Za-z][_0-9A-Za-z]*.
  // To do so, we:
  //  1. replace '-' by '_' because the former is not allowed but it's probably pretty
  //   common and using the later should be fairly readable.
  //  2. remove any character in what remains that is not allowed.
  //  3. Unsure the first character is not a number, and if it is, add a leading `_`.
  // Note that this could theoretically lead to substantial changes to the name but should
  // work well in practice (and if it's a huge problem for someone, we can change it).
  const sanitized = subgraphName
    .replace(/-/ig, '_')
    .replace(/[^_0-9A-Za-z]/ig, '');
  return sanitized.match(/^[0-9].*/i) ? '_' + sanitized : sanitized;
}

function sanitizeAndPrintSubselection(subSelection: SelectionSet): string | undefined {
  return subSelection.withoutEmptyBranches()?.toString();
}

function fetchGroupToPlanProcessor({
  config,
  variableDefinitions,
  fragments,
  operationName,
  assignedDeferLabels,
}: {
  config: QueryPlannerConfig,
  variableDefinitions: VariableDefinitions,
  fragments?: NamedFragments,
  operationName?: string,
  assignedDeferLabels?: Set<string>,
}): FetchGroupProcessor<PlanNode | undefined, DeferredNode> {
  let counter = 0;
  return {
    onFetchGroup: (group: FetchGroup) => group.toPlanNode(config, variableDefinitions, fragments, operationName ? `${operationName}__${toValidGraphQLName(group.subgraphName)}__${counter++}` : undefined),
    reduceParallel: (values: (PlanNode | undefined)[]) => flatWrapNodes('Parallel', values),
    reduceSequence: (values: (PlanNode | undefined)[]) => flatWrapNodes('Sequence', values),
    reduceDeferred: (deferInfo: DeferredInfo, value: PlanNode | undefined): DeferredNode => ({
      depends: [...deferInfo.dependencies].map((id) => ({ id })),
      label: assignedDeferLabels?.has(deferInfo.label) ? undefined : deferInfo.label,
      queryPath: operationPathToStringPath(deferInfo.path.full()),
      // Note that if the deferred block has nested @defer, then the `value` is going to be a `DeferNode` and we'll
      // use it's own `subselection`, so we don't need it here.
      subselection: deferInfo.deferred.size === 0 ? sanitizeAndPrintSubselection(deferInfo.subselection) : undefined,
      node: value,
    }),
    reduceDefer: (main: PlanNode | undefined, subselection: SelectionSet, deferredBlocks: DeferredNode[]) => ({
      kind: 'Defer',
      primary: {
        subselection: sanitizeAndPrintSubselection(subselection),
        node: main,
      },
      deferred: deferredBlocks,
    }),
  };
}

// Wraps the given nodes in a ParallelNode or SequenceNode, unless there's only
// one node, in which case it is returned directly. Any nodes of the same kind
// in the given list have their sub-nodes flattened into the list: ie,
// flatWrapNodes('Sequence', [a, flatWrapNodes('Sequence', b, c), d]) returns a SequenceNode
// with four children.
function flatWrapNodes(
  kind: ParallelNode['kind'] | SequenceNode['kind'],
  nodes: (PlanNode | undefined)[],
): PlanNode | undefined {
  const filteredNodes = nodes.filter((n) => !!n) as PlanNode[];
  if (filteredNodes.length === 0) {
    return undefined;
  }
  if (filteredNodes.length === 1) {
    return filteredNodes[0];
  }
  return {
    kind,
    nodes: filteredNodes.flatMap((n) => n.kind === kind ? n.nodes : [n]),
  };
}

function addTypenameFieldForAbstractTypesInNamedFragments(fragments: NamedFragments): NamedFragments {
  // This method is a bit tricky due to potentially nested fragments. More precisely, suppose that
  // we have:
  //   fragment MyFragment on T {
  //     a {
  //       b {
  //         ...InnerB
  //       }
  //     }
  //   }
  //
  //   fragment InnerB on B {
  //     __typename
  //     x
  //     y
  //   }
  // then if we were to "naively" add `__typename`, the first fragment would end up being:
  //   fragment MyFragment on T {
  //     a {
  //       __typename
  //       b {
  //         __typename
  //         ...InnerX
  //       }
  //     }
  //   }
  // but that's not ideal because the inner-most `__typename` is already within `InnerX`. And that
  // gets in the way to re-adding fragments (the `SelectionSet.optimize` method) because if we start
  // with:
  //   {
  //     a {
  //       __typename
  //       b {
  //         __typename
  //         x
  //         y
  //       }
  //     }
  //   }
  // and add `InnerB` first, we get:
  //   {
  //     a {
  //       __typename
  //       b {
  //         ...InnerB
  //       }
  //     }
  //   }
  // and it becomes tricky to recognize the "updated-with-typename" version of `MyFragment` now (we "seem"
  // to miss a `__typename`).
  //
  // Anyway, to avoid this issue, what we do is that for every fragment, we:
  //  1. expand any nested fragments in its selection.
  //  2. add `__typename` where we should in that expanded selection.
  //  3. re-optimize all fragments (using the "updated-with-typename" versions).
  // which ends up getting us what we need. However, doing so requires us to deal with fragments in order
  // of dependencies (first the ones with no nested fragments, then the one with only nested fragments of
  // that first group, etc...), and that's why this method is a bit longer that one could have expected.
  type FragmentInfo = {
    original: NamedFragmentDefinition,
    expandedSelectionSet: SelectionSet,
    dependentsOn: string[],
  };
  const fragmentsMap = new Map<string, FragmentInfo>();

  for (const fragment of fragments.definitions()) {
    const expandedSelectionSet = fragment.selectionSet.expandFragments();
    addTypenameFieldForAbstractTypes(expandedSelectionSet);
    const otherFragmentsUsages = new Map<string, number>();
    fragment.collectUsedFragmentNames(otherFragmentsUsages);
    fragmentsMap.set(fragment.name, {
      original: fragment,
      expandedSelectionSet,
      dependentsOn: Array.from(otherFragmentsUsages.keys()),
    });
  }

  const optimizedFragments = new NamedFragments();
  while (fragmentsMap.size > 0) {
    for (const [name, info] of fragmentsMap) {
      // Note that graphQL specifies that named fragments cannot have cycles (https://spec.graphql.org/draft/#sec-Fragment-spreads-must-not-form-cycles)
      // and so we guaranteed that on every ieration, at least element of the map is removed and thus that the
      // overall `while` loops terminate.
      if (info.dependentsOn.every((n) => optimizedFragments.has(n))) {
        const reoptimizedSelectionSet = info.expandedSelectionSet.optimize(optimizedFragments);
        optimizedFragments.add(info.original.withUpdatedSelectionSet(reoptimizedSelectionSet));
        fragmentsMap.delete(name);
      }
    }
  }

  return optimizedFragments;
}

function addSelectionOrSelectionSet(selectionSet: SelectionSet, toAdd: Selection | SelectionSet) {
  if (toAdd instanceof SelectionSet) {
    selectionSet.mergeIn(toAdd);
  } else {
    selectionSet.add(toAdd);
  }
}

/**
 * Given a selection select (`selectionSet`) starting on a given type (`type`) and given a set of directive applications
 * that can be eliminated (`unneededDirectives`; in practice those are conditionals (@skip and @include) already accounted
 * for), returns an equivalent selection set but with unecessary "starting" fragments removed (if any can).
 * Note that this very similar to the optimisation done in `operation.ts#concatOperationPaths`, but applied to the "concatenation"
 * of selection sets.
 */
function removeRedundantFragmentsOfSet(
  selectionSet: SelectionSet,
  type: CompositeType,
  unneededDirectives: Directive<any, any>[],
): SelectionSet {
  let newSet: SelectionSet | undefined = undefined;
  const selections = selectionSet.selections();
  for (let i = 0; i < selections.length; i++) {
    const selection = selections[i];
    const updated = removeRedundantFragments(selection, type, unneededDirectives);
    if (newSet) {
      addSelectionOrSelectionSet(newSet, updated);
    } else if (selection !== updated) {
      // We've found the firs selection that is changed. Create `newSet`
      // and add any previous selection (which we now is unchanged).
      newSet = new SelectionSet(type);
      for (let j = 0; j < i; j++) {
        newSet.add(selections[j]);
      }
      // and add the new one.
      addSelectionOrSelectionSet(newSet, updated);
    } // else, we just move on
  }
  return newSet ? newSet : selectionSet;
}

function removeRedundantFragments(
  selection: Selection,
  type: CompositeType,
  unneededDirectives: Directive<any, any>[],
): Selection | SelectionSet {
  if (selection.kind !== 'FragmentSelection') {
    return selection;
  }

  const fragment = selection.element();
  const fragmentType = fragment.typeCondition;
  if (!fragmentType) {
    return selection;
  }

  let neededDirectives: Directive[] = [];
  if (fragment.appliedDirectives.length > 0) {
    neededDirectives = directiveApplicationsSubstraction(fragment.appliedDirectives, unneededDirectives);
  }

  if (sameType(type, fragmentType) && neededDirectives.length === 0) {
    // we can completely skip this fragment and recurse.
    return removeRedundantFragmentsOfSet(selection.selectionSet, type, unneededDirectives);
  } else if (neededDirectives.length === fragment.appliedDirectives.length) {
    // This means we need all of the directives of the fragment, and so just return it.
    return selection;
  } else {
    // We need the fragment, but we can skip some of its directive.
    const updatedFragment = new FragmentElement(type, fragment.typeCondition);
    neededDirectives.forEach((d) => updatedFragment.applyDirective(d.definition!, d.arguments()));
    return selectionSetOfElement(updatedFragment, selection.selectionSet);
  }
}

function schemaRootKindToOperationKind(operation: SchemaRootKind): OperationTypeNode {
  switch(operation) {
    case "query": return OperationTypeNode.QUERY;
    case "mutation": return OperationTypeNode.MUTATION;
    case "subscription": return  OperationTypeNode.SUBSCRIPTION;
  }
}

function findAndRemoveInPlace<T>(predicate: (v: T) => boolean, array: T[]): number {
  const idx = array.findIndex((v) => predicate(v));
  if (idx >= 0) {
    array.splice(idx, 1);
  }
  return idx;
}

function sameMergeAt(m1: ResponsePath | undefined, m2: ResponsePath | undefined): boolean {
  if (!m1) {
    return !m2;
  }
  if (!m2) {
    return false;
  }
  return arrayEquals(m1, m2);
}

function concatPathsInParents(first: OperationPath | undefined, second: OperationPath | undefined): OperationPath | undefined  {
  return first && second ? concatOperationPaths(first, second) : undefined;
}

function samePathsInParents(first: OperationPath | undefined, second: OperationPath | undefined): boolean  {
  if (!first) {
    return !second;
  }
  return !!second && sameOperationPaths(first, second);
}

function computeRootFetchGroups(dependencyGraph: FetchDependencyGraph, pathTree: OpRootPathTree, rootKind: SchemaRootKind): FetchDependencyGraph {
  // The root of the pathTree is one of the "fake" root of the subgraphs graph, which belongs to no subgraph but points to each ones.
  // So we "unpack" the first level of the tree to find out our top level groups (and initialize our stack).
  // Note that we can safely ignore the triggers of that first level as it will all be free transition, and we know we cannot have conditions.
  for (const [edge, _trigger, _conditions, child] of pathTree.childElements()) {
    assert(edge !== null, `The root edge should not be null`);
    const subgraphName = edge.tail.source;
    // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
    const rootType = edge.tail.type as ObjectType;
    const group = dependencyGraph.getOrCreateRootFetchGroup({ subgraphName, rootKind, parentType: rootType });
    computeGroupsForTree(dependencyGraph, child, group, GroupPath.empty(), emptyDeferContext);
  }
  return dependencyGraph;
}

function computeNonRootFetchGroups(dependencyGraph: FetchDependencyGraph, pathTree: OpPathTree, rootKind: SchemaRootKind): FetchDependencyGraph {
  const subgraphName = pathTree.vertex.source;
  // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
  const rootType = pathTree.vertex.type;
  assert(isCompositeType(rootType), () => `Should not have condition on non-selectable type ${rootType}`);
  const group = dependencyGraph.getOrCreateRootFetchGroup({ subgraphName, rootKind, parentType: rootType} );
  computeGroupsForTree(dependencyGraph, pathTree, group, GroupPath.empty(), emptyDeferContext);
  return dependencyGraph;
}

function wrapInputsSelections(
  wrappingType: CompositeType,
  selections: SelectionSet,
  context: PathContext
): SelectionSet {
  return wrapSelectionWithTypeAndConditions<SelectionSet>(
    wrappingType,
    selections,
    (fragment, currentSeletions) => selectionSetOf(fragment.parentType, selectionOfElement(fragment, currentSeletions)),
    context
  );
}

function createFetchInitialPath(wrappingType: CompositeType, context: PathContext): OperationPath {
  return wrapSelectionWithTypeAndConditions<OperationPath>(
    wrappingType,
    [],
    (fragment, path) => [fragment as OperationElement].concat(path),
    context,
  );
}

function wrapSelectionWithTypeAndConditions<TSelection>(
  wrappingType: CompositeType,
  initialSelection: TSelection,
  wrapInFragment: (fragment: FragmentElement, current: TSelection) => TSelection,
  context: PathContext
): TSelection {
  const typeCast = new FragmentElement(wrappingType, wrappingType.name);
  let updatedSelection = wrapInFragment(typeCast, initialSelection);
  if (context.conditionals.length === 0) {
    return updatedSelection;
  }

  const schema = wrappingType.schema();
  // We add the first include/skip to the current typeCast and then wrap in additional type-casts for the next ones
  // if necessary. Note that we use type-casts (... on <type>), but, outside of the first one, we could well also
  // use fragments with no type-condition. We do the former mostly to preverve older behavior, but doing the latter
  // would technically produce slightly small query plans.
  const [name0, ifs0] = context.conditionals[0];
  typeCast.applyDirective(schema.directive(name0)!, { 'if': ifs0 });

  for (let i = 1; i < context.conditionals.length; i++) {
    const [name, ifs] = context.conditionals[i];
    const fragment = new FragmentElement(wrappingType, wrappingType.name);
    fragment.applyDirective(schema.directive(name)!, { 'if': ifs });
    updatedSelection = wrapInFragment(fragment, updatedSelection);
  }

  return updatedSelection;
}

function extractPathInParentForKeyFetch(type: CompositeType, path: GroupPath): OperationPath {
  // A "key fetch" (calls to the `_entities` operation) always have to start with some type-cast into
  // the entity fetched (`type` in this function), so we can remove a type-cast into the entity from
  // the parent path if it is the last thing in the past. And doing that removal ensures the code
  // later reuse fetch groups for different entities, as long as they get otherwise merged into the
  // parent at the same place.
  const inGroup = path.inGroup();
  const lastElement = inGroup[inGroup.length - 1];
  return (lastElement && lastElement.kind === 'FragmentElement' && lastElement.typeCondition?.name === type.name)
    ? inGroup.slice(0, inGroup.length - 1)
    : inGroup;
}

/**
 * If `maybePrefix` is a prefix of `basePath`, then return the path corresponding to the end of `basePath` after `maybePrefix` (which may
 * be empty if those are the same path). Otherwise, if `maybePrefix` is not a proper prefix, return `undefined`.
 */
function maybeSubstratPathPrefix(basePath: OperationPath, maybePrefix: OperationPath): OperationPath | undefined {
  if (maybePrefix.length <= basePath.length && sameOperationPaths(maybePrefix,  basePath.slice(0, maybePrefix.length))) {
    return basePath.slice(maybePrefix.length);
  }
  return undefined;
}

function computeGroupsForTree(
  dependencyGraph: FetchDependencyGraph,
  pathTree: OpPathTree<any>,
  startGroup: FetchGroup,
  initialGroupPath: GroupPath,
  initialDeferContext: DeferContext,
  initialContext: PathContext = emptyContext,
): FetchGroup[] {
  const stack: {
    tree: OpPathTree,
    group: FetchGroup,
    path: GroupPath,
    context: PathContext,
    deferContext: DeferContext,
  }[] = [{
    tree: pathTree,
    group: startGroup,
    path: initialGroupPath,
    context: initialContext,
    deferContext: initialDeferContext,
  }];
  const createdGroups = [ ];
  while (stack.length > 0) {
    const { tree, group, path, context, deferContext } = stack.pop()!;
    if (tree.isLeaf()) {
      group.addSelection(path.inGroup());
      dependencyGraph.deferTracking.updateSubselection(deferContext);
    } else {
      // We want to preserve the order of the elements in the child, but the stack will reverse everything, so we iterate
      // in reverse order to counter-balance it.
      for (const [edge, operation, conditions, child] of tree.childElements(true)) {
        if (isPathContext(operation)) {
          const newContext = operation;
          // The only 3 cases where we can take edge not "driven" by an operation is either when we resolve a key, resolve
          // a query (switch subgraphs because the query root type is the type of a field), or at the root of subgraph graph.
          // The latter case has already be handled the beginning of `computeFetchGroups` so only the 2 former remains.
          assert(edge !== null, () => `Unexpected 'null' edge with no trigger at ${path}`);
          if (edge.transition.kind === 'KeyResolution') {
            assert(conditions, () => `Key edge ${edge} should have some conditions paths`);
            // First, we need to ensure we fetch the conditions from the current group.
            const conditionsGroups = computeGroupsForTree(dependencyGraph, conditions, group, path, deferContextForConditions(deferContext));
            createdGroups.push(...conditionsGroups);
            // Then we can "take the edge", creating a new group. That group depends
            // on the condition ones.
            const sourceType = edge.head.type as CompositeType; // We shouldn't have a key on a non-composite type
            const destType = edge.tail.type as CompositeType; // We shouldn't have a key on a non-composite type
            const pathInParent = extractPathInParentForKeyFetch(sourceType, path);
            const updatedDeferContext = deferContextAfterSubgraphJump(deferContext);
            // Note that we use the name of `destType` for the inputs parent type, which can seem strange, but the reason is that we
            // 2 kind of cases:
            //  - either sourceType == destType, which is the case for an object entity key, or for a key from an @interfaceObject
            //    to an interface key.
            //  - or sourceType !== destType, and that means the source is an implementation type X of some interface I, and
            //    destType is an @interfaceObject corresponding to I. But in that case, using I as base for the inputs is a
            //    bit more flexible as it ensure that if the query uses multiple such key for multiple implementations (so,
            //    key from X to I, and then Y to I), then the same fetch is properly reused. Note that it is ok to do so
            //    since 1) inputs are based on the supergraph schema, so I is going to exist there and 2) we wrap the input
            //    selection properly against `sourceType` below anyway.
            const newGroup = dependencyGraph.getOrCreateKeyFetchGroup({
              subgraphName: edge.tail.source,
              mergeAt: path.inResponse(),
              type: destType,
              parent: { group, path: pathInParent },
              conditionsGroups,
              deferRef: updatedDeferContext.activeDeferRef,
            });
            createdGroups.push(newGroup);
            newGroup.addParents(conditionsGroups.map((conditionGroup) => {
              // If `conditionGroup` parent is `group`, that is the same as `newGroup` current parent, then we can infer the path of `newGroup` into
              // that condition `group` by looking at the paths of each to their common parent. But otherwise, we cannot have a proper
              // "path in parent".
              const conditionGroupParents = conditionGroup.parents();
              let path: OperationPath | undefined = undefined;
              if (conditionGroupParents.length === 1 && conditionGroupParents[0].group === group && conditionGroupParents[0].path) {
                path = maybeSubstratPathPrefix(conditionGroupParents[0].path, pathInParent);
              }
              return { group: conditionGroup, path };
            }));
            // Note that inputs must be based on the supergraph schema, not any particular subgraph, since sometimes key conditions
            // are fetched from multiple subgraphs (and so no one subgraph has a type definition with all the proper fields, only
            // the supergraph does).
            const inputType = dependencyGraph.typeForFetchInputs(sourceType.name);
            const inputSelections = newCompositeTypeSelectionSet(inputType);
            inputSelections.mergeIn(edge.conditions!);
            newGroup.addInputs(
              wrapInputsSelections(inputType, inputSelections, newContext),
              computeInputRewritesOnKeyFetch(inputType.name, destType),
            );

            // We also ensure to get the __typename of the current type in the "original" group.
            group.addSelection(path.inGroup().concat(new Field(sourceType.typenameField()!)));

            stack.push({
              tree: child,
              group: newGroup,
              path: path.forNewKeyFetch(createFetchInitialPath(edge.tail.type as CompositeType, newContext)),
              context: newContext,
              deferContext: updatedDeferContext,
            });
          } else {
            assert(edge.transition.kind === 'RootTypeResolution', () => `Unexpected non-collecting edge ${edge}`);
            const rootKind = edge.transition.rootKind;
            assert(!conditions, () => `Root type resolution edge ${edge} should not have conditions`);

            assert(isObjectType(edge.head.type) && isObjectType(edge.tail.type), () => `Expected an objects for the vertices of ${edge}`);
            const type = edge.tail.type;
            assert(type === type.schema().schemaDefinition.rootType(rootKind), () => `Expected ${type} to be the root ${rootKind} type, but that is ${type.schema().schemaDefinition.rootType(rootKind)}`);

            // Usually, we get here because a field (say `q`) has query root type as type, and the field queried for that root
            // type is on another subgraph. When that happens, it means that on the original subgraph we may not have
            // added _any_ subselection for type `q` and that would make the query to the original subgraph invalid.
            // To avoid this, we request the __typename field.
            // One exception however is if we're at the "top" of the current group (`pathInGroup.length === 0`, which is a corner
            // case but can happen with @defer when everything in a query is deferred): in that case, there is no
            // point in adding __typename because if we don't add any other selection, the group will be empty
            // and we've rather detect that and remove the group entirely later.
            if (path.inGroup().length > 0) {
              group.addSelection(path.inGroup().concat(new Field((edge.head.type as CompositeType).typenameField()!)));
            }

            // We take the edge, creating a new group. Note that we always create a new group because this
            // correspond to jumping subgraph after a field returned the query root type, and we want to
            // preserve this ordering somewhat (debatable, possibly).
            const updatedDeferContext = deferContextAfterSubgraphJump(deferContext);
            const newGroup = dependencyGraph.newRootTypeFetchGroup({
              subgraphName: edge.tail.source,
              rootKind,
              parentType: type,
              mergeAt: path.inResponse(),
              deferRef: updatedDeferContext.activeDeferRef,
            });
            newGroup.addParent({ group, path: path.inGroup() });
            stack.push({
              tree: child,
              group: newGroup,
              path: path.forNewKeyFetch(createFetchInitialPath(type, newContext)),
              context: newContext,
              deferContext: updatedDeferContext,
            });
          }
        } else if (edge === null) {
          // A null edge means that the operation does nothing but may contain directives to preserve.
          // If it does contains directives, we look for @defer in particular. If we find it, this
          // means that we should change our current group to one for the defer in question.

          const { updatedOperation, updatedDeferContext } = extractDeferFromOperation({
            dependencyGraph,
            operation,
            deferContext,
            path,
          });

          // We're now removed any @defer. If the operation contains other directives or a non-trivial
          // type condition, we need to preserve it and so we add operation. Otherwise, we just skip it as a minor optimization (it makes the subgraph query
          // slighly smaller and on complex queries, it might also deduplicate similar selections).
          let newPath = path;
          if (updatedOperation && updatedOperation.appliedDirectives.length > 0) {
            newPath = path.add(updatedOperation)
          }
          stack.push({
            tree: child,
            group,
            path: newPath,
            context,
            deferContext: updatedDeferContext,
          });
        } else {
          assert(edge.head.source === edge.tail.source, () => `Collecting edge ${edge} for ${operation} should not change the underlying subgraph`)

          // We have a operation element, field or inline fragment. We first check if it's been "tagged" to remember that __typename
          // must be queried. See the comment on the `optimizeSiblingTypenames()` method to see why this exists.
          const typenameAttachment = operation.getAttachement(SIBLING_TYPENAME_KEY);
          if (typenameAttachment !== undefined) {
            // We need to add the query __typename for the current type in the current group.
            // Note that the value of the "attachement" is the alias or '' if there is no alias
            const alias = typenameAttachment === '' ? undefined : typenameAttachment;
            const typenameField = new Field(operation.parentType.typenameField()!, {}, new VariableDefinitions(), alias);
            group.addSelection(path.inGroup().concat(typenameField));
            dependencyGraph.deferTracking.updateSubselection({
              ...deferContext,
              pathToDeferParent: deferContext.pathToDeferParent.concat(typenameField),
            });
          }

          const { updatedOperation, updatedDeferContext } = extractDeferFromOperation({
            dependencyGraph,
            operation,
            deferContext,
            path,
          });
          assert(updatedOperation, `Extracting @defer from ${operation} should not have resulted in no operation`);

          let updated = {
            tree: child,
            group,
            path,
            context,
            deferContext: updatedDeferContext
          };
          if (conditions) {
            // We have some @requires.
            const requireResult = handleRequires(
              dependencyGraph,
              edge,
              conditions,
              group,
              path,
              context,
              updatedDeferContext,
            );
            updated.group = requireResult.group;
            updated.path = requireResult.path;
            createdGroups.push(...requireResult.createdGroups);
          }

          if (updatedOperation.kind === 'Field' && updatedOperation.name === typenameFieldName) {
            // Because of the optimization done in `QueryPlanner.optimizeSiblingTypenames`, we will rarely get an explicit `__typename`
            // edge here. But one case where it can happen is where an @interfaceObject was involved, and we had to force jumping to
            // another subgraph for getting the "true" `__typename`. However, this case can sometimes lead to fetch group that only
            // exists for that `__typename` resolution and that "look" useless. That, we could have a fetch group that looks like:
            //   Fetch(service: "Subgraph2") {
            //     {
            //       ... on I {
            //         __typename
            //         id
            //       }
            //     } =>
            //     {
            //       ... on I {
            //         __typename
            //       }
            //     }
            //   }
            // but the trick is that the `__typename` in the input will be the name of the interface itself (`I` in this case)
            // but the one return after the fetch will the name of the actual implementation (some implementation of `I`). 
            // *But* we later have optimizations that would remove such a group, on the group that the output is included
            // in the input, which is in general the right thing to do (and genuinely ensure that some useless groups created when
            // handling complex @require gets eliminated). So we "protect" the group in this case to ensure that later
            // optimization doesn't kick in in this case.
            updated.group.mustPreserveSelection = true
          }

          if (edge.transition.kind === 'InterfaceObjectFakeDownCast') {
            // We shouldn't add the operation "as is" as it's a down-cast but we're "faking it". However,
            // if the operation has directives, we should preserve that.
            assert(updatedOperation.kind === 'FragmentElement', () => `Unexpected operation ${updatedOperation} for edge ${edge}`);
            if (updatedOperation.appliedDirectives.length > 0) {
              // We want to keep the directives, but we clear the condition since it's to a type that doesn't exists in the
              // subgraph we're currently in.
              updated.path = updated.path.add(updatedOperation.withUpdatedCondition(undefined));
            }
          } else {
            updated.path = updated.path.add(updatedOperation);
          }

          stack.push(updated);
        }
      }
    }
  }
  return createdGroups;
}

function computeInputRewritesOnKeyFetch(inputTypeName: string, destType: CompositeType): FetchDataInputRewrite[] | undefined {
  if (isInterfaceObjectType(destType)) {
    return [{
      kind: 'ValueSetter',
      path: [ `... on ${inputTypeName}`, typenameFieldName ],
      setValueTo: destType.name,
    }];
  }
  return undefined;
}

function extractDeferFromOperation({
  dependencyGraph,
  operation,
  deferContext,
  path,
}: {
  dependencyGraph: FetchDependencyGraph,
  operation: OperationElement,
  deferContext: DeferContext,
  path: GroupPath,
}): {
  updatedOperation: OperationElement | undefined,
  updatedDeferContext: DeferContext,
}{
  const deferArgs = operation.deferDirectiveArgs();
  if (!deferArgs) {
    return {
      updatedOperation: operation,
      updatedDeferContext: {
        ...deferContext,
        pathToDeferParent: deferContext.pathToDeferParent.concat(operation),
      }
    };
  }

  assert(deferArgs.label, 'All defers should have a lalel at this point');
  const updatedDeferRef = deferArgs.label;
  const updatedOperation = operation.withoutDefer();
  const updatedPathToDeferParent = updatedOperation ? [ updatedOperation ] : [];

  dependencyGraph.deferTracking.registerDefer({
    deferContext,
    deferArgs,
    path,
    parentType: operation.parentType,
  });

  return {
    updatedOperation,
    updatedDeferContext: {
      ...deferContext,
      currentDeferRef: updatedDeferRef,
      pathToDeferParent: updatedPathToDeferParent,
    },
  };
}

function addTypenameFieldForAbstractTypes(selectionSet: SelectionSet) {
  for (const selection of selectionSet.selections()) {
    if (selection.kind == 'FieldSelection') {
      const fieldBaseType = baseType(selection.field.definition.type!);
      if (isAbstractType(fieldBaseType)) {
        selection.selectionSet!.add(new FieldSelection(new Field(fieldBaseType.typenameField()!)));
      }
      if (selection.selectionSet) {
        addTypenameFieldForAbstractTypes(selection.selectionSet);
      }
    } else {
      const conditionType = selection.element().typeCondition;
      if (conditionType && isAbstractType(conditionType)) {
        selection.selectionSet!.add(new FieldSelection(new Field(conditionType.typenameField()!)));
      }
      addTypenameFieldForAbstractTypes(selection.selectionSet);
    }
  }
}

function pathHasOnlyFragments(path: OperationPath): boolean {
  return path.every((element) => element.kind === 'FragmentElement');
}

function typeAtPath(parentType: CompositeType, path: OperationPath): CompositeType {
  let type = parentType;
  for (const element of path) {
    if (element.kind === 'Field') {
      const fieldType = baseType(type.field(element.name)?.type!);
      assert(isCompositeType(fieldType), () => `Invalid call fro ${path} starting at ${parentType}: ${element.definition.coordinate} is not composite`);
      type = fieldType;
    } else if (element.typeCondition) {
      const rebasedType = parentType.schema().type(element.typeCondition.name);
      assert(rebasedType && isCompositeType(rebasedType), () => `Type condition of ${element} should be composite`);
      type = rebasedType;
    }
  }
  return type;
}

function handleRequires(
  dependencyGraph: FetchDependencyGraph,
  edge: Edge,
  requiresConditions: OpPathTree,
  group: FetchGroup,
  path: GroupPath,
  context: PathContext,
  deferContext: DeferContext,
): {
  group: FetchGroup,
  path: GroupPath,
  createdGroups: FetchGroup[],
} {
  // @requires should be on an entity type, and we only support object types right now
  const entityType = edge.head.type as ObjectType;

  // In many case, we can optimize requires by merging the requirement to previously existing groups. However,
  // we only do this when the current group has only a single parent (it's hard to reason about it otherwise).
  // But the current could have multiple parents due to the graph lacking minimimality, and we don't want that
  // to needlessly prevent us from this optimization. So we do a graph reduction first (which effectively
  // just eliminate unecessary edges). To illustrate, we could be in a case like:
  //     1
  //   /  \
  // 0 --- 2
  // with current group 2. And while the group currently has 2 parents, the `reduce` step will ensure
  // the edge `0 --- 2` is removed (since the dependency of 2 on 0 is already provide transitively through 1).
  dependencyGraph.reduce();

  const parents = group.parents();
  // In general, we should do like for an edge, and create a new group _for the current subgraph_
  // that depends on the createdGroups and have the created groups depend on the current one.
  // However, we can be more efficient in general (and this is expected by the user) because
  // required fields will usually come just after a key edge (at the top of a fetch group).
  // In that case (when the path is only typeCasts), we can put the created groups directly
  // as dependency of the current group, avoiding to create a new one. Additionally, if the
  // group we're coming from is our "direct parent", we can merge it to said direct parent (which
  // effectively means that the parent group will collect the provides before taking the edge
  // to our current group).
  if (parents.length === 1 && pathHasOnlyFragments(path.inGroup())) {
    const parent = parents[0];

    // We start by computing the groups for the conditions. We do this using a copy of the current
    // group (with only the inputs) as that allows to modify this copy without modifying `group`.
    const newGroup = dependencyGraph.newKeyFetchGroup({
      subgraphName: group.subgraphName,
      mergeAt: group.mergeAt!,
      deferRef: group.deferRef
    });
    newGroup.addParent(parent);
    newGroup.copyInputsOf(group, true);
    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, newGroup, path, deferContextForConditions(deferContext));
    if (createdGroups.length == 0) {
      // All conditions were local. Just merge the newly created group back in the current group (we didn't need it)
      // and continue.
      assert(group.canMergeSiblingIn(newGroup), () => `We should be able to merge ${newGroup} into ${group} by construction`);
      group.mergeSiblingIn(newGroup);
      return {group, path, createdGroups: []};
    }

    // We know the @require needs createdGroups. We do want to know however if any of the conditions was
    // fetched from our `newGroup`. If not, then this means that the `createdGroups` don't really depend on
    // the current `group` and can be dependencies of the parent (or even merged into this parent).
    //
    // So we want to know if anything in `newGroup` selection cannot be fetched directly from the parent.
    // For that, we first remove any of `newGroup` inputs from its selection: in most case, `newGroup`
    // will just contain the key needed to jump back to its parent, and those would usually be the same
    // as the inputs. And since by definition we know `newGroup`'s inputs are already fetched, we
    // know they are not things that we need. Then, we check if what remains (often empty) can be
    // directly fetched from the parent. If it can, then we can just merge `newGroup` into that parent.
    // Otherwise, we will have to "keep it".
    // Note: it is to be sure this test is not poluted by other things in `group` that we created `newGroup`.
    newGroup.removeInputsFromSelection();
    let newGroupIsUnneeded = parent.path && newGroup.selection.canRebaseOn(typeAtPath(parent.group.selection.parentType, parent.path));
    const unmergedGroups = [];

    if (newGroupIsUnneeded) {
      // Up to this point, `newGroup` had no parent, so let's first merge `newGroup` to the parent, thus "rooting"
      // it's children to it. Note that we just checked that `newGroup` selection was just its inputs, so
      // we know that merging it to the parent is mostly a no-op from that POV, except maybe for requesting
      // a few addition `__typename` we didn't before (due to the exclusion of `__typename` in the `newGroupIsUnneeded` check)
      parent.group.mergeChildIn(newGroup);

      // Now, all created groups are going to be descendant of `parentGroup`. But some of them may actually be
      // mergeable into it.
      for (const created of createdGroups) {
        // Note that `created` may not be a direct child of `parent.group`, but `canMergeChildIn` just return `false` in
        // that case, yielding the behaviour we want (not trying to merge it in).
        if (created.subgraphName === parent.group.subgraphName && parent.group.canMergeChildIn(created)) {
          parent.group.mergeChildIn(created);
        } else {
          unmergedGroups.push(created);
          // `created` cannot be merged into `parent.group`, which may typically be because they are not to the same
          // subgraph. However, while `created` currently depend on `parent.group` (directly or indirectly), that
          // dependency just come from the fact that `parent.group` is the parent of the group whose @require we're
          // dealing with. And in practice, it could well be that some of the fetches needed for that require don't
          // really depend on anything that parent fetches and could be done in parallel with it. If we detect that
          // this is the case for `created`, we can move it "up the chain of dependency".
          let currentParent: ParentRelation | undefined = parent;
          while (currentParent
            && !currentParent.group.isTopLevel
            && created.isChildOfWithArtificialDependency(currentParent.group)
          ) {
            currentParent.group.removeChild(created);
            const grandParents = currentParent.group.parents();
            assert(grandParents.length > 0, `${currentParent.group} is not top-level, so it should have parents`);
            for (const grandParent of grandParents) {
              created.addParent({
                group: grandParent.group,
                path: concatPathsInParents(grandParent.path, currentParent.path),
              });
            }
            // If we have more that 1 "grand parent", let's stop there as it would get more complicated
            // and that's probably not needed. Otherwise, we can check if `created` may be able to move even
            // further up.
            currentParent = grandParents.length === 1 ? grandParents[0] : undefined;
          }
        }
      }
    } else {
      // We cannot merge `newGroup` to the parent, either because there it fetches some things necessary to the
      // @require, or because we had more than one parent and don't know how to handle this (unsure if the later
      // can actually happen at this point tbh (?)). Bu not reason not to merge `newGroup` back to `group` so
      // we do that first.
      assert(group.canMergeSiblingIn(newGroup), () => `We should be able to merge ${newGroup} into ${group} by construction`);
      group.mergeSiblingIn(newGroup);

      // The created group depend on `group` and the dependency cannot be moved to the parent in
      // this case. However, we might still be able to merge some created group directly in the
      // parent. But for this to be true, we should essentially make sure that the dependency
      // on `group` is not a "true" dependency. That is, if the created group inputs are the same
      // as `group` inputs (and said created group is the same subgraph than the parent of
      // `group`, then it means we're only depending on values that are already in the parent and
      // can merge the group).
      if (parent.path) {
        for (const created of createdGroups) {
          if (created.subgraphName === parent.group.subgraphName
            && parent.group.canMergeGrandChildIn(created)
            && sameMergeAt(created.mergeAt, group.mergeAt)
            && group.inputs!.contains(created.inputs!)
          ) {
            parent.group.mergeGrandChildIn(created);
          } else {
            unmergedGroups.push(created);
          }
        }
      }
    }

    // If we've merged all the created groups, then all the "requires" are handled _before_ we get to the
    // current group, so we can "continue" with the current group.
    if (unmergedGroups.length == 0) {
      // We still need to add the stuffs we require though (but `group` already has a key in its inputs,
      // we don't need one).
      group.addInputs(inputsForRequire(dependencyGraph, entityType, edge, context, false).inputs);
      return { group, path, createdGroups: [] };
    }

    // If we get here, it means that @require needs the information from `unmergedGroups` (plus whatever has
    // been merged before) _and_ those rely on some information from the current `group` (if they hadn't, we
    // would have been able to merge `newGroup` to `group`'s parent). So the group we should return, which
    // is the group where the "post-@require" fields will be added, needs to a be a new group that depends
    // on all those `unmergedGroups`.
    const postRequireGroup = dependencyGraph.newKeyFetchGroup({
      subgraphName: group.subgraphName,
      mergeAt: group.mergeAt!,
      deferRef: group.deferRef
    });
    // Note that `postRequireGroup` cannot generally be merged in any of the `unmergedGroup` and we don't provide a `path`.
    postRequireGroup.addParents(unmergedGroups.map((group) => ({ group })));
    // That group also need, in general, to depend on the current `group`. That said, if we detected that the @require
    // didn't need anything of said `group` (if `newGroupIsUnneeded`), then we can depend on the parent instead.
    if (newGroupIsUnneeded) {
      postRequireGroup.addParent(parent);
    } else {
      postRequireGroup.addParent({ group, path: []});
    }

    // Note(Sylvain): I'm not 100% sure about this assert in the sense that while I cannot think of a case where `parent.path` wouldn't
    // exist, the code paths are complex enough that I'm not able to prove this easily and could easily be missing something. That said,
    // we need the path here, so this will have to do for now, and if this ever breaks in practice, we'll at least have an example to
    // guide us toward improving/fixing.
    assert(parent.path, `Missing path-in-parent for @require on ${edge} with group ${group} and parent ${parent}`);
    addPostRequireInputs(
      dependencyGraph,
      path.forParentOfGroup(parent.path),
      entityType,
      edge,
      context,
      parent.group,
      postRequireGroup,
    );
    return {
      group: postRequireGroup,
      path: path.forNewKeyFetch(createFetchInitialPath(entityType, context)),
      createdGroups: unmergedGroups.concat(postRequireGroup),
    };
  } else {
    // We're in the somewhat simpler case where a @require happens somewhere in the middle of a subgraph query (so, not
    // just after having jumped to that subgraph). In that case, there isn't tons of optimisation we can do: we have to
    // see what satisfying the @require necessitate, and if it needs anything from another subgraph, we have to stop the
    // current subgraph fetch there, get the requirements from other subgraphs, and then resume the query of that particular subgraph.
    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, group, path, deferContextForConditions(deferContext));
    // If we didn't created any group, that means the whole condition was fetched from the current group
    // and we're good.
    if (createdGroups.length == 0) {
      return { group, path, createdGroups: []};
    }

    // We need to create a new group, on the same subgraph `group`, where we resume fetching the field for
    // which we handle the @requires _after_ we've delt with the `requiresConditionsGroups`.
    // Note that we know the conditions will include a key for our group so we can resume properly.
    const newGroup = dependencyGraph.newKeyFetchGroup({
      subgraphName: group.subgraphName,
      mergeAt: path.inResponse(),
    });
    newGroup.addParents(createdGroups.map((group) => ({ group })));
    addPostRequireInputs(
      dependencyGraph,
      path,
      entityType,
      edge,
      context,
      group,
      newGroup,
    );
    return {
      group: newGroup,
      path: path.forNewKeyFetch(createFetchInitialPath(entityType, context)),
      createdGroups: createdGroups.concat(newGroup),
    };
  }
}

function addPostRequireInputs(
  dependencyGraph: FetchDependencyGraph,
  requirePath: GroupPath,
  entityType: ObjectType,
  edge: Edge,
  context: PathContext,
  preRequireGroup: FetchGroup,
  postRequireGroup: FetchGroup,
) {
  const { inputs, keyInputs } = inputsForRequire(dependencyGraph, entityType, edge, context);
  let rewrites: FetchDataInputRewrite[] | undefined = undefined;
  // This method is used both for "normal" user @requires, but also to handle the internally injected requirement for interface objects
  // when the "true" __typename needs to be retrieved. In those case, the post-require group is basically resuming fetch on the
  // @interfaceObject subgraph after we found the real __typename of objects of that interface. But that also mean we need to make
  // sure to rewrite that "real" __typename into the interface object name for that fetch (as we do for normal key edge toward an
  // interface object).
  if (edge.transition.kind === 'InterfaceObjectFakeDownCast') {
    rewrites = computeInputRewritesOnKeyFetch(edge.transition.castedTypeName, entityType);
  }
  postRequireGroup.addInputs(inputs, rewrites);
  if (keyInputs) {
    // It could be the key used to resume fetching after the @require is already fetched in the original group, but we cannot
    // guarantee it, so we add it now (and if it was already selected, this is a no-op).
    preRequireGroup.addSelection(requirePath.inGroup(), (endOfPathSet) => {
      assert(endOfPathSet, () => `Merge path ${requirePath} ends on a non-selectable type`);
      endOfPathSet.addAll(keyInputs.selections());
    });
  }
}

function newCompositeTypeSelectionSet(type: CompositeType): SelectionSet {
  const selectionSet = new SelectionSet(type);
  selectionSet.add(new FieldSelection(new Field(type.typenameField()!)));
  return selectionSet;
}

function inputsForRequire(
  dependencyGraph: FetchDependencyGraph,
  entityType: ObjectType,
  edge: Edge,
  context: PathContext,
  includeKeyInputs: boolean = true
): {
  inputs: SelectionSet,
  keyInputs: SelectionSet | undefined,
}{
  // This method is actually called for to handle conditions of @requires, but also to fetch `__typename` in the
  // case of "fake downcast on an @interfaceObject". In that later case, once we're fetched that `__typename`,
  // we want to wrap the input into the "downcasted" type, not the @interfaceObject one, so that we don't end
  // up querying some fields in the @interfaceObject subgraph for entities that we know won't match a type
  // condition of the query.
  const isInterfaceObjectDownCast = edge.transition.kind === 'InterfaceObjectFakeDownCast';
  const inputTypeName = isInterfaceObjectDownCast ? edge.transition.castedTypeName : entityType.name;
  const inputType = dependencyGraph.supergraphSchema.type(inputTypeName);
  assert(inputType && isCompositeType(inputType), () => `Type ${inputTypeName} should exist in the supergraph and be a composite type`);

  const fullSelectionSet = newCompositeTypeSelectionSet(inputType);
  fullSelectionSet.mergeIn(edge.conditions!);
  let keyInputs: SelectionSet | undefined = undefined;
  if (includeKeyInputs) {
    const keyCondition = getLocallySatisfiableKey(dependencyGraph.federatedQueryGraph, edge.head);
    assert(keyCondition, () => `Due to @require, validation should have required a key to be present for ${edge}`);
    let keyConditionAsInput = keyCondition;
    if (isInterfaceObjectDownCast) {
      // This means that conditions parents are on the @interfaceObject type, but we actually want to select only the
      // `inputTypeName` implementation, the `mergeIn` below will try to add fields from the interface to one of the
      // implementationt type. Which `mergeIn` usually let us do as that's safe, but because `keyCondition` are on
      // the @interfaceObject subgraph, the type there is not an interface. To work around this, we "rebase" the
      // condition on the supergraph type (which is an interface) first, which lets the `mergeIn` work.
      const supergraphItfType = dependencyGraph.supergraphSchema.type(entityType.name);
      assert(supergraphItfType && isInterfaceType(supergraphItfType), () => `Type ${entityType} should be an interface in the supergraph`);
      const rebasedKeyCondition = new SelectionSet(supergraphItfType);
      rebasedKeyCondition.mergeIn(keyConditionAsInput);
      keyConditionAsInput = rebasedKeyCondition;
    }
    fullSelectionSet.mergeIn(keyConditionAsInput);

    // Note that `keyInputs` are used to ensure those input are fetch on the original group, the one having `edge`. In
    // the case of an @interfaceObject downcast, that's the subgraph with said @interfaceObject, so in that case we
    // should just use `entityType` (that @interfaceObject type), not input type which will be an implementation the
    // subgraph does not know in that particular case.
    keyInputs = newCompositeTypeSelectionSet(entityType);
    keyInputs.mergeIn(keyCondition);
  }
  return {
    inputs: wrapInputsSelections(inputType, fullSelectionSet, context),
    keyInputs,
  };
}

const representationsVariable = new Variable('representations');
function representationsVariableDefinition(schema: Schema): VariableDefinition {
  const metadata = federationMetadata(schema);
  assert(metadata, 'Expected schema to be a federation subgraph')
  const representationsType = new NonNullType(new ListType(new NonNullType(metadata.anyType())));
  return new VariableDefinition(schema, representationsVariable, representationsType);
}

function operationForEntitiesFetch(
  subgraphSchema: Schema,
  selectionSet: SelectionSet,
  allVariableDefinitions: VariableDefinitions,
  operationName?: string
): Operation {
  const variableDefinitions = new VariableDefinitions();
  variableDefinitions.add(representationsVariableDefinition(subgraphSchema));
  variableDefinitions.addAll(
    allVariableDefinitions.filter(selectionSet.usedVariables()),
  );

  const queryType = subgraphSchema.schemaDefinition.rootType('query');
  assert(
    queryType,
    `Subgraphs should always have a query root (they should at least provides _entities)`,
  );

  const entities = queryType.field(entitiesFieldName);
  assert(entities, `Subgraphs should always have the _entities field`);

  const entitiesCall: SelectionSet = new SelectionSet(queryType);
  entitiesCall.add(
    new FieldSelection(
      new Field(
        entities,
        { representations: representationsVariable },
        variableDefinitions,
      ),
      selectionSet,
    ),
  );

  return new Operation(subgraphSchema, 'query', entitiesCall, variableDefinitions, operationName);
}

function operationForQueryFetch(
  subgraphSchema: Schema,
  rootKind: SchemaRootKind,
  selectionSet: SelectionSet,
  allVariableDefinitions: VariableDefinitions,
  operationName?: string
): Operation {
  return new Operation(subgraphSchema, rootKind, selectionSet, allVariableDefinitions.filter(selectionSet.usedVariables()), operationName);
}
