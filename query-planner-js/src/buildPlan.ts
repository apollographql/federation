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
  selectionSetOfPath,
  Type,
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
} from "@apollo/federation-internals";
import {
  advanceSimultaneousPathsWithOperation,
  Edge,
  emptyContext,
  ExcludedEdges,
  FieldCollection,
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
} from "@apollo/query-graphs";
import { stripIgnoredCharacters, print, parse, OperationTypeNode } from "graphql";
import { DeferredNode } from ".";
import { QueryPlannerConfig } from "./config";
import { QueryPlan, ResponsePath, SequenceNode, PlanNode, ParallelNode, FetchNode, trimSelectionNodes } from "./QueryPlan";

const debug = newDebugLogger('plan');

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

  /**
   * For roots, we just switch between with the sequence or parallel computation based on the type of root kind.
   */
  reduceRoots: (roots: number[], rootsAreParallel: boolean) => (
    roots.length === 0
      ? 0
      : (rootsAreParallel ? parallelCost(roots) : sequenceCost(roots))
  )
};

function parallelCost(values: number[]): number {
  return sum(values);
}

function sequenceCost(stages: number[]): number {
  return stages.reduceRight((acc, stage, idx) => (acc + ((idx + 1) * pipeliningCost * stage)), 0);
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
          this.closedBranches.push([option.paths.map(p => terminateWithNonRequestedTypenameField(p))]);
        }
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
        debug.log(`No valid options to advance ${selection} from ${advanceOptionsToString(options)}`);
        throw new Error(`Was not able to find any options for ${selection}: This shouldn't have happened.`);
      } else {
        // We clear both open branches and closed ones as a mean to terminate the plan computation with
        // no plan
        this.stack.splice(0, this.stack.length);
        this.closedBranches.splice(0, this.closedBranches.length);
        return;
      }
    }

    if (selection.selectionSet) {
      for (const branch of mapOptionsToSelections(selection.selectionSet, newOptions)) {
        this.stack.push(branch);
      }
    } else {
      const updated = this.maybeEliminateStrictlyMoreCostlyPaths(newOptions);
      this.closedBranches.push(updated);
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
    return FetchDependencyGraph.create(this.subgraphs, this.startFetchIdGen, rootType);
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

  private computeBestPlanFromClosedBranches() {
    if (this.closedBranches.length === 0) {
      return;
    }

    // We've computed all branches and need to compare all the possible plans to pick the best.
    // Note however that "all the possible plans" is essentially a cartesian product of all
    // the closed branches options, and if a lot of branches have multiple options, this can
    // exponentially explode.
    // So we first look at how many plans we'd have to generate, and if it's "too much", we
    // reduce it to something manageable by arbitrarilly throwing out options. This effectively
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
        this.onNewPlan(initialDependencyGraph, initialTree);
        return;
      }
    }

    const otherTrees = this.closedBranches.slice(0, idxFirstOfLengthOne).map(b => b.map(opt => PathTree.createFromOpPaths(this.subgraphs, this.startVertex, opt)));
    this.generateAllPlans(initialDependencyGraph, initialTree, otherTrees);
  }

  generateAllPlans(initialDependencyGraph: FetchDependencyGraph, initialTree: OpPathTree<RV>, others: OpPathTree<RV>[][]) {
    // Track, for each element, at which index we are
    const eltIndexes = new Array<number>(others.length);
    let totalCombinations = 1;
    for (let i = 0; i < others.length; ++i) {
      const eltSize = others[i].length;
      assert(eltSize > 0, "Got empty option: this shouldn't have happened");
      eltIndexes[i] = 0;
      totalCombinations *= eltSize;
    }

    for (let i = 0; i < totalCombinations; ++i){
      const dependencyGraph = initialDependencyGraph.clone();
      let tree = initialTree;
      for (let j = 0; j < others.length; ++j) {
        const t = others[j][eltIndexes[j]];
        this.updatedDependencyGraph(dependencyGraph, t);
        tree = tree.merge(t);
      }
      this.onNewPlan(dependencyGraph, tree);

      for (let idx = 0; idx < others.length; ++idx) {
        if (eltIndexes[idx] == others[idx].length - 1) {
          eltIndexes[idx] = 0;
        } else {
          eltIndexes[idx] += 1;
          break;
        }
      }
    }
  }

  private cost(dependencyGraph: FetchDependencyGraph): number {
    const { main, deferred } = dependencyGraph.process(this.costFunction);
    const mainCost = this.costFunction.reduceRoots(main, true);
    return deferred.length === 0
      ? mainCost
      : this.costFunction.reduceDefer(mainCost, dependencyGraph.deferTracking.primarySelection!, deferred);
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

  private onNewPlan(dependencyGraph: FetchDependencyGraph, tree: OpPathTree<RV>) {
    const cost = this.cost(dependencyGraph);
    //if (isTopLevel) {
    //  console.log(`[PLAN] cost: ${cost}, path:\n${pathSet.toString('', true)}`);
    //}
    if (!this.bestPlan || cost < this.bestPlan[2]) {
      debug.log(() => this.bestPlan ? `Found better with cost ${cost} (previous had cost ${this.bestPlan[2]}): ${tree}`: `Computed plan with cost ${cost}: ${tree}`);
      this.bestPlan = [dependencyGraph, tree, cost];
    } else {
      debug.log(() => `Ignoring plan with cost ${cost} (a better plan with cost ${this.bestPlan![2]} exists): ${tree}`);
    }
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

/**
 * Represents a subgraph fetch of a query plan, and is a vertex of a `FetchDependencyGraph` (and as such provides links to
 * its parent and children in that dependency graph).
 */
class FetchGroup {
  private readonly _parents: ParentRelation[] = [];
  private readonly _children: FetchGroup[] = [];

  private _id: string | undefined;

  private constructor(
    readonly dependencyGraph: FetchDependencyGraph,
    public index: number,
    readonly subgraphName: string,
    readonly rootKind: SchemaRootKind,
    readonly parentType: CompositeType,
    readonly isEntityFetch: boolean,
    private readonly _selection: LazySelectionSet,
    private readonly _inputs?: LazySelectionSet,
    readonly mergeAt?: ResponsePath,
    readonly deferRef?: string,
  ) {
  }

  static create(
    dependencyGraph: FetchDependencyGraph,
    index: number,
    subgraphName: string,
    rootKind: SchemaRootKind,
    parentType: CompositeType,
    isEntityFetch: boolean,
    mergeAt?: ResponsePath,
    deferRef?: string,
  ): FetchGroup {
    return new FetchGroup(
      dependencyGraph,
      index,
      subgraphName,
      rootKind,
      parentType,
      isEntityFetch,
      new LazySelectionSet(new SelectionSet(parentType)),
      isEntityFetch ? new LazySelectionSet(new SelectionSet(parentType)) : undefined,
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
      this.mergeAt
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

  // It's important that the returned selection is never modified. Use the other modification methods of this method instead!
  get inputs(): SelectionSet | undefined {
    return this._inputs?.forRead();
  }

  clonedInputs(): LazySelectionSet | undefined {
    return this._inputs?.clone();
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
    assert(!this.isChildOf(parent.group), () => `Group ${parent.group} is already a parent of ${this}`);
    assert(!parent.group.isParentOf(this), () => `Group ${parent.group} is already a parent of ${this} (but the child relationship is broken)`);
    assert(!parent.group.isChildOf(this), () => `Group ${parent.group} is a child of ${this}: adding is as parent would create a cycle`);

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

  addInputs(selection: Selection | SelectionSet) {
    assert(this._inputs, "Shouldn't try to add inputs to a root fetch group");
    if (selection instanceof SelectionSet) {
      this._inputs.forWrite().mergeIn(selection);
    } else {
      this._inputs.forWrite().add(selection);
    }
  }

  addSelection(path: OperationPath) {
    this._selection.forWrite().addPath(path);
  }

  addSelections(selection: SelectionSet) {
    this._selection.forWrite().mergeIn(selection);
  }

  canMergeChildIn(child: FetchGroup): boolean {
    return this.deferRef === child.deferRef && !!child.parentRelation(this)?.path;
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
    // We only allow merging sibling on the same subgraph, same "mergeAt" and when our common parent is our only parent:
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
    if (sibling.inputs) {
      this.addInputs(sibling.inputs);
    }
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

    if (other.inputs) {
      this.addInputs(other.inputs);
    }
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
      selectionSet = selectionSetOfPath(path, (endOfPathSet) => {
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
    this.dependencyGraph.remove(merged);
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
      if (parent.group.isParentOf(this)) {
        continue;
      }
      this.addParent(parent);
    }
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

    addTypenameFieldForAbstractTypes(this.selection);

    this.selection.validate();
    const inputs = this._inputs?.forRead();
    if (inputs) {
      inputs.validate();
    }

    const inputNodes = inputs ? inputs.toSelectionSetNode() : undefined;

    const operation = this.isEntityFetch
      ? operationForEntitiesFetch(
          this.dependencyGraph.subgraphSchemas.get(this.subgraphName)!,
          this.selection,
          variableDefinitions,
          fragments,
          operationName,
        )
      : operationForQueryFetch(
          this.rootKind,
          this.selection,
          variableDefinitions,
          fragments,
          operationName,
        );

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
    return this.isTopLevel
      ? `[${this.index}] ${this.subgraphName}[${this._selection}]`
      : `[${this.index}] ${this.subgraphName}@(${this.mergeAt})[${this._inputs} => ${this._selection}]`;
  }
}

class DeferredInfo {
  readonly subselection: SelectionSet;

  constructor(
    readonly label: string,
    readonly responsePath: ResponsePath,
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
        deferredBlock.responsePath,
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
    responsePath,
    parentType,
  }: {
    deferContext: DeferContext,
    deferArgs: DeferDirectiveArgs,
    responsePath: ResponsePath,
    parentType: CompositeType,
  }): void {
    // Having the primary selection undefined means that @defer handling is actually disabled, so save anything costly that we won't be using.
    if (!this.primarySelection) {
      return;
    }

    assert(deferArgs.label, 'All @defer should have be labelled at this point');
    let deferredBlock = this.deferred.get(deferArgs.label);
    if (!deferredBlock) {
      deferredBlock = new DeferredInfo(deferArgs.label, responsePath, parentType);
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
    readonly subgraphSchemas: ReadonlyMap<string, Schema>,
    readonly federatedQueryGraph: QueryGraph,
    readonly startingIdGen: number,
    private readonly rootGroups: MapWithCachedArrays<string, FetchGroup>,
    readonly groups: FetchGroup[],
    readonly deferTracking: DeferTracking,
  ) {
    this.fetchIdGen = startingIdGen;
  }

  static create(federatedQueryGraph: QueryGraph, startingIdGen: number, rootTypeForDefer: CompositeType | undefined) {
    return new FetchDependencyGraph(
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
    const group = this.newFetchGroup({ subgraphName, parentType, isEntityFetch: false, rootKind });
    this.rootGroups.set(subgraphName, group);
    return group;
  }

  private newFetchGroup({
    subgraphName,
    parentType,
    isEntityFetch,
    rootKind, // always "query" for entity fetches
    mergeAt,
    deferRef,
  }: {
    subgraphName: string,
    parentType: CompositeType,
    isEntityFetch: boolean,
    rootKind: SchemaRootKind,
    mergeAt?: ResponsePath,
    deferRef?: string,
  }): FetchGroup {
    this.onModification();
    const newGroup = FetchGroup.create(
      this,
      this.groups.length,
      subgraphName,
      rootKind,
      parentType,
      isEntityFetch,
      mergeAt,
      deferRef,
    );
    this.groups.push(newGroup);
    return newGroup;
  }

  getOrCreateKeyFetchGroup({
    subgraphName,
    mergeAt,
    parent,
    conditionsGroups,
    deferRef,
  }: {
    subgraphName: string,
    mergeAt: ResponsePath,
    parent: ParentRelation,
    conditionsGroups: FetchGroup[],
    deferRef?: string,
  }): FetchGroup {
    // Let's look if we can reuse a group we have, that is an existing child of the parent that:
    // 1. is for the same subgraph
    // 2. has the same mergeAt
    // 3. is not part of our conditions or our conditions ancestors (meaning that we annot reuse a group if it fetches something we take as input).
    for (const existing of parent.group.children()) {
      if (existing.subgraphName === subgraphName
        && existing.mergeAt
        && sameMergeAt(existing.mergeAt, mergeAt)
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
    const newGroup = this.newKeyFetchGroup({ subgraphName, mergeAt, deferRef });
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
    return this.newFetchGroup({ subgraphName, parentType, isEntityFetch: false, rootKind, mergeAt, deferRef });
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
    assert(parentType, () => `Subgraph ${subgraphName} has not entities defined`);
    return this.newFetchGroup({ subgraphName, parentType, isEntityFetch: true, rootKind: 'query', mergeAt, deferRef });
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
      const nodes: TProcessed[] = [processed];

      let nextGroups = children;
      let remainingNext: UnhandledGroups = [];
      const allDeferredGroups = new SetMultiMap<string, FetchGroup>(deferredGroups);
      while (nextGroups.length > 0) {
        const {inParallel, next, unhandled, deferredGroups} = this.processParallelGroups(processor, nextGroups, remainingNext);
        nodes.push(inParallel);
        const [canHandle, newRemaining] = this.mergeRemainings(remainingNext, unhandled);
        remainingNext = newRemaining;
        nextGroups = canHandle.concat(next);
        allDeferredGroups.addAll(deferredGroups);
      }
      return {
        main: processor.reduceSequence(nodes),
        unhandled: remainingNext,
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

  private processParallelGroups<TProcessed, TDeferred>(
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    groups: readonly FetchGroup[],
    remaining: UnhandledGroups
  ): {
    inParallel: TProcessed,
    next: FetchGroup[],
    unhandled: UnhandledGroups,
    deferredGroups: SetMultiMap<string, FetchGroup>,
  } {
    const parallelNodes: TProcessed[] = [];
    const allDeferredGroups = new SetMultiMap<string, FetchGroup>();
    let remainingNext = remaining;
    let toHandleNext: FetchGroup[] = [];
    for (const group of groups) {
      const { main, deferredGroups, unhandled } = this.processGroup(processor, group);
      parallelNodes.push(main);
      allDeferredGroups.addAll(deferredGroups);
      const [canHandle, newRemaining] = this.mergeRemainings(remainingNext, unhandled);
      toHandleNext = toHandleNext.concat(canHandle);
      remainingNext = newRemaining;
    }
    return {
      inParallel: processor.reduceParallel(parallelNodes),
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

  private processRootGroups<TProcessed, TDeferred>(
    processor: FetchGroupProcessor<TProcessed, TDeferred>,
    rootGroups: readonly FetchGroup[],
    currentDeferRef: string | undefined,
  ): {
    main: TProcessed[],
    deferred: TDeferred[],
  } {
    const allMain: TProcessed[] = [];
    const allDeferredGroups = new SetMultiMap<string, FetchGroup>();
    for (const rootGroup of rootGroups.values()) {
      const { main, unhandled, deferredGroups } = this.processGroup(processor, rootGroup);
      assert(unhandled.length == 0, () => `Root group ${rootGroup} should have no remaining groups unhandled, but got ${unhandled}`);
      allMain.push(main);
      allDeferredGroups.addAll(deferredGroups);
    }

    // We iterate on every @defer that are within our "current level" (so at top-level, that's all the non-nested @defer).
    // Note in particular that we may be able to truly defer anything for some of those @defer due the limitations of
    // what can be done at the query planner level. However, we still create `DeferNode` and `DeferredNode` in those case
    // so that the execution can at least defer the sending of the response back (future handling of defer-passthrough will
    // also piggy-back on this).
    const defersInCurrent = this.deferTracking.defersInParent(currentDeferRef);
    const allDeferred: TDeferred[] = [];
    for (const defer of defersInCurrent) {
      const groups = allDeferredGroups.get(defer.label) ?? [];
      const { main, deferred } = this.processRootGroups(processor, Array.from(groups), defer.label);
      const mainReduced = processor.reduceParallel(main);
      const processed = deferred.length === 0
        ? mainReduced
        : processor.reduceDefer(mainReduced, defer.subselection, deferred);
      allDeferred.push(processor.reduceDeferred(defer, processed));
    }
    return { main: allMain, deferred: allDeferred };
  }

  process<TProcessed, TDeferred>(
    processor: FetchGroupProcessor<TProcessed, TDeferred>
  ): {
    main: TProcessed[],
    deferred: TDeferred[],
  } {
    this.reduceAndOptimize();

    return this.processRootGroups(processor, this.rootGroups.values(), undefined);
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
  reduceRoots(roots: TProcessed[], isParallel: boolean): TProcessed,
}

export function computeQueryPlan({
  config,
  supergraphSchema,
  federatedQueryGraph,
  operation,
}: {
  config: Concrete<QueryPlannerConfig>,
  supergraphSchema: Schema,
  federatedQueryGraph: QueryGraph,
  operation: Operation,
}): QueryPlan {
  if (operation.rootKind === 'subscription') {
    throw ERRORS.UNSUPPORTED_FEATURE.err(
      'Query planning does not currently support subscriptions.',
      { nodes: [parse(operation.toString())] },
    );
  }

  const reuseQueryFragments = config.reuseQueryFragments ?? true;
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

  let assignedDeferLabels: Set<string> | undefined = undefined;
  let hasDefers: boolean = false;
  let deferConditions: SetMultiMap<string, string> | undefined = undefined;
  if (config.deferStreamSupport.enableDefer) {
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

  const root = federatedQueryGraph.root(operation.rootKind);
  assert(root, () => `Shouldn't have a ${operation.rootKind} operation if the subgraphs don't have a ${operation.rootKind} root`);
  const processor = fetchGroupToPlanProcessor({
    config,
    variableDefinitions: operation.variableDefinitions,
    fragments,
    operationName: operation.name,
    assignedDeferLabels,
  });


  let rootNode: PlanNode | undefined;
  if (deferConditions && deferConditions.size > 0) {
    assert(hasDefers, 'Should not have defer conditions without @defer');
    rootNode = computePlanForDeferConditionals({
      supergraphSchema,
      federatedQueryGraph,
      operation,
      processor,
      root,
      deferConditions,
    })
  } else {
    rootNode = computePlanInternal({
      supergraphSchema,
      federatedQueryGraph,
      operation,
      processor,
      root,
      hasDefers,
    });
  }

  debug.groupEnd('Query plan computed');
  return { kind: 'QueryPlan', node: rootNode };
}

function computePlanInternal({
  supergraphSchema,
  federatedQueryGraph,
  operation,
  processor,
  root,
  hasDefers,
}: {
  supergraphSchema: Schema,
  federatedQueryGraph: QueryGraph,
  operation: Operation,
  processor: FetchGroupProcessor<PlanNode | undefined, DeferredNode>
  root: RootVertex,
  hasDefers: boolean,
}): PlanNode | undefined {
  if (operation.rootKind === 'mutation') {
    const dependencyGraphs = computeRootSerialDependencyGraph(supergraphSchema, operation, federatedQueryGraph, root, hasDefers);
    let allMain: (PlanNode | undefined)[] = [];
    let allDeferred: DeferredNode[] = [];
    let primarySelection: SelectionSet | undefined = undefined;
    for (const dependencyGraph of dependencyGraphs) {
      const { main, deferred } = dependencyGraph.process(processor);
      allMain = allMain.concat(main);
      allDeferred = allDeferred.concat(deferred);
      const newSelection = dependencyGraph.deferTracking.primarySelection;
      if (newSelection) {
        if (primarySelection) {
          primarySelection.mergeIn(newSelection);
        } else {
          primarySelection = newSelection.clone();
        }
      }
    }
    return processRootNodes({
      processor,
      rootNodes: allMain,
      rootsAreParallel: false,
      primarySelection,
      deferred: allDeferred,
    });
  } else {
    const dependencyGraph =  computeRootParallelDependencyGraph(supergraphSchema, operation, federatedQueryGraph, root, 0, hasDefers);
    const { main, deferred } = dependencyGraph.process(processor);
    return processRootNodes({
      processor,
      rootNodes: main,
      rootsAreParallel: true,
      primarySelection: dependencyGraph.deferTracking.primarySelection,
      deferred,
    });
  }
}

function computePlanForDeferConditionals({
  supergraphSchema,
  federatedQueryGraph,
  operation,
  processor,
  root,
  deferConditions,
}: {
  supergraphSchema: Schema,
  federatedQueryGraph: QueryGraph,
  operation: Operation,
  processor: FetchGroupProcessor<PlanNode | undefined, DeferredNode>
  root: RootVertex,
  deferConditions: SetMultiMap<string, string>,
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


function processRootNodes({
  processor,
  rootNodes,
  rootsAreParallel,
  primarySelection,
  deferred,
}: {
  processor: FetchGroupProcessor<PlanNode | undefined, DeferredNode>,
  rootNodes: (PlanNode | undefined)[],
  rootsAreParallel: boolean,
  primarySelection: SelectionSet | undefined,
  deferred: DeferredNode[],
}): PlanNode | undefined {
  let rootNode = processor.reduceRoots(rootNodes, rootsAreParallel);
  if (deferred.length > 0) {
    assert(primarySelection, 'Should have had a primary selection created');
    rootNode = processor.reduceDefer(rootNode, primarySelection, deferred);
  }
  return rootNode;
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
): FetchDependencyGraph {
  return computeRootParallelBestPlan(
    supergraphSchema,
    operation.selectionSet,
    operation.variableDefinitions,
    federatedQueryGraph,
    root,
    startFetchIdGen,
    hasDefer,
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
): [FetchDependencyGraph, OpPathTree<RootVertex>, number] {
  const planningTraversal = new QueryPlanningTaversal(
    supergraphSchema,
    federatedQueryGraph,
    selection,
    startFetchIdGen,
    hasDefers,
    variables,
    root,
    root.rootKind,
    defaultCostFunction,
    emptyContext
  );
  const plan = planningTraversal.findBestPlan();
  // Getting no plan means the query is essentially unsatisfiable (it's a valid query, but we can prove it will never return a result),
  // so we just return an empty plan.
  return plan ?? createEmptyPlan(federatedQueryGraph, root);
}

function createEmptyPlan(
  federatedQueryGraph: QueryGraph,
  root: RootVertex
): [FetchDependencyGraph, OpPathTree<RootVertex>, number] {
  return [
    FetchDependencyGraph.create(federatedQueryGraph, 0, undefined),
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
): FetchDependencyGraph[] {
  const rootType = hasDefers ? supergraphSchema.schemaDefinition.rootType(root.rootKind) : undefined;
  // We have to serially compute a plan for each top-level selection.
  const splittedRoots = splitTopLevelFields(operation.selectionSet);
  const graphs: FetchDependencyGraph[] = [];
  let startingFetchId: number = 0;
  let [prevDepGraph, prevPaths] = computeRootParallelBestPlan(supergraphSchema, splittedRoots[0], operation.variableDefinitions, federatedQueryGraph, root, startingFetchId, hasDefers);
  let prevSubgraph = onlyRootSubgraph(prevDepGraph);
  for (let i = 1; i < splittedRoots.length; i++) {
    const [newDepGraph, newPaths] = computeRootParallelBestPlan(supergraphSchema, splittedRoots[i], operation.variableDefinitions, federatedQueryGraph, root, prevDepGraph.nextFetchId(), hasDefers);
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
      prevDepGraph = computeRootFetchGroups(FetchDependencyGraph.create(federatedQueryGraph, startingFetchId, rootType), prevPaths, root.rootKind);
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
      path: deferInfo.responsePath,
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
    reduceRoots: (roots: (PlanNode | undefined)[], rootsAreParallel) => flatWrapNodes(rootsAreParallel ? 'Parallel' : 'Sequence', roots),
  };
}

// Wraps the given nodes in a ParallelNode or SequenceNode, unless there's only
// one node, in which case it is returned directly. Any nodes of the same kind
// in the given list have their sub-nodes flattened into the list: ie,
// flatWrapNodes('Sequence', [a, flatWrapNodes('Sequence', b, c), d]) returns a SequenceNode
// with four children.
function flatWrapNodes(
  kind: ParallelNode['kind'] | SequenceNode['kind'],
  nodes: (PlanNode| undefined)[],
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
function addToResponsePath(path: ResponsePath, responseName: string, type: Type) {
  path = path.concat(responseName);
  while (!isNamedType(type)) {
    if (isListType(type)) {
      path.push('@');
    }
    type = type.ofType;
  }
  return path;
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
    computeGroupsForTree(dependencyGraph, child, group, emptyDeferContext);
  }
  return dependencyGraph;
}

function computeNonRootFetchGroups(dependencyGraph: FetchDependencyGraph, pathTree: OpPathTree, rootKind: SchemaRootKind): FetchDependencyGraph {
  const subgraphName = pathTree.vertex.source;
  // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
  const rootType = pathTree.vertex.type;
  assert(isCompositeType(rootType), () => `Should not have condition on non-selectable type ${rootType}`);
  const group = dependencyGraph.getOrCreateRootFetchGroup({ subgraphName, rootKind, parentType: rootType} );
  computeGroupsForTree(dependencyGraph, pathTree, group, emptyDeferContext);
  return dependencyGraph;
}

function wrapEntitySelection(
  type: CompositeType,
  selections: SelectionSet | undefined,
  context: PathContext
): {
  updatedSelection: Selection,
  updatedPath: OperationPath,
}{
  const typeCast = new FragmentElement(type, type.name);
  let updatedSelection = selectionOfElement(typeCast, selections);
  let updatedPath = [typeCast];
  if (context.conditionals.length === 0) {
    return { updatedSelection, updatedPath };
  }

  const schema = type.schema();
  // We add the first include/skip to the current typeCast and then wrap in additional type-casts for the next ones
  // if necessary. Note that we use type-casts (... on <type>), but, outside of the first one, we could well also
  // use fragments with no type-condition. We do the former mostly to preverve older behavior, but doing the latter
  // would technically procude slightly small query plans.
  const [name0, ifs0] = context.conditionals[0];
  typeCast.applyDirective(schema.directive(name0)!, { 'if': ifs0 });

  for (let i = 1; i < context.conditionals.length; i++) {
    const [name, ifs] = context.conditionals[i];
    const fragment = new FragmentElement(type, type.name);
    fragment.applyDirective(schema.directive(name)!, { 'if': ifs });
    updatedSelection = selectionOfElement(fragment, selectionSetOf(type, updatedSelection));
    updatedPath = [fragment].concat(updatedPath);
  }

  return {updatedSelection, updatedPath};
}

function extractPathInParentForKeyFetch(type: CompositeType, path: OperationPath): OperationPath {
  // A "key fetch" (calls to the `_entities` operation) always have to start with some type-cast into
  // the entity fetched (`type` in this function), so we can remove a type-cast into the entity from
  // the parent path if it is the last thing in the past. And doing that removal ensures the code
  // later reuse fetch groups for different entities, as long as they get otherwise merged into the
  // parent at the same place.
  const lastElement = path[path.length - 1];
  return (lastElement && lastElement.kind === 'FragmentElement' && lastElement.typeCondition?.name === type.name)
    ? path.slice(0, path.length - 1)
    : path;
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
  initialDeferContext: DeferContext,
  initialMergeAt: ResponsePath = [],
  initialPath: OperationPath = [],
  initialContext: PathContext = emptyContext,
): FetchGroup[] {
  const stack: {
    tree: OpPathTree,
    group: FetchGroup,
    mergeAt: ResponsePath,
    path: OperationPath,
    context: PathContext,
    deferContext: DeferContext,
  }[] = [{
    tree: pathTree,
    group: startGroup,
    mergeAt: initialMergeAt,
    path: initialPath,
    context: initialContext,
    deferContext: initialDeferContext,
  }];
  const createdGroups = [ ];
  while (stack.length > 0) {
    const { tree, group, mergeAt, path, context, deferContext } = stack.pop()!;
    if (tree.isLeaf()) {
      group.addSelection(path);
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
            const conditionsGroups = computeGroupsForTree(dependencyGraph, conditions, group, deferContextForConditions(deferContext), mergeAt, path);
            createdGroups.push(...conditionsGroups);
            // Then we can "take the edge", creating a new group. That group depends
            // on the condition ones.
            const type = edge.tail.type as CompositeType; // We shouldn't have a key on a non-composite type
            const pathInParent = extractPathInParentForKeyFetch(type, path);
            const updatedDeferContext = deferContextAfterSubgraphJump(deferContext);
            const newGroup = dependencyGraph.getOrCreateKeyFetchGroup({
              subgraphName: edge.tail.source,
              mergeAt,
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
            const inputSelections = newCompositeTypeSelectionSet(type);
            inputSelections.mergeIn(edge.conditions!);

            const {updatedSelection, updatedPath} = wrapEntitySelection(type, inputSelections, newContext);
            newGroup.addInputs(updatedSelection);

            // We also ensure to get the __typename of the current type in the "original" group.
            group.addSelection(path.concat(new Field((edge.head.type as CompositeType).typenameField()!)));

            stack.push({
              tree: child,
              group: newGroup,
              mergeAt,
              path: updatedPath,
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
            // One exception however is if we're at the "top" of the current group (`path.length === 0`, which is a corner
            // case but can happen with @defer when everything in a query is deferred): in that case, there is no
            // point in adding __typename because if we don't add any other selection, the group will be empty
            // and we've rather detect that and remove the group entirely later.
            if (path.length > 0) {
              group.addSelection(path.concat(new Field((edge.head.type as CompositeType).typenameField()!)));
            }

            // We take the edge, creating a new group. Note that we always create a new group because this
            // correspond to jumping subgraph after a field returned the query root type, and we want to
            // preserve this ordering somewhat (debatable, possibly).
            const updatedDeferContext = deferContextAfterSubgraphJump(deferContext);
            const newGroup = dependencyGraph.newRootTypeFetchGroup({
              subgraphName: edge.tail.source,
              rootKind,
              parentType: type,
              mergeAt,
              deferRef: updatedDeferContext.activeDeferRef,
            });
            newGroup.addParent({ group, path });
            const newPath = wrapEntitySelection(type, undefined, newContext).updatedPath;
            stack.push({
              tree: child,
              group: newGroup,
              mergeAt,
              path: newPath,
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
            responsePath: mergeAt,
          });

          // We're now removed any @defer. If the operation contains other directives, we need to preserve those and
          // so we add operation. Otherwise, we just skip it as a minor optimization (it makes the subgraph query
          // slighly smaller and on complex queries, it might also deduplicate similar selections).
          const newPath = updatedOperation && updatedOperation.appliedDirectives.length > 0
            ? path.concat(operation)
            : path;
          stack.push({
            tree: child,
            group,
            mergeAt,
            path: newPath,
            context,
            deferContext: updatedDeferContext,
          });
        } else {
          assert(edge.head.source === edge.tail.source, () => `Collecting edge ${edge} for ${operation} should not change the underlying subgraph`)

          const { updatedOperation, updatedDeferContext } = extractDeferFromOperation({
            dependencyGraph,
            operation,
            deferContext,
            responsePath: mergeAt,
          });
          assert(updatedOperation, `Extracting @defer from ${operation} should not have resulted in no operation`);

          let updated = {
            tree: child,
            group,
            mergeAt,
            path,
            context,
            deferContext: updatedDeferContext
          };
          if (conditions) {
            // We have some @requires.
            const requireResult =  handleRequires(
              dependencyGraph,
              edge,
              conditions,
              group,
              mergeAt,
              path,
              context,
              updatedDeferContext,
            );
            updated.group = requireResult.group;
            updated.mergeAt = requireResult.mergeAt;
            updated.path = requireResult.path;
            createdGroups.push(...requireResult.createdGroups);
          }

          if (updatedOperation.kind === 'Field') {
            updated.mergeAt = addToResponsePath(updated.mergeAt, updatedOperation.responseName(), (edge.transition as FieldCollection).definition.type!);
          }
          updated.path = updated.path.concat(updatedOperation);
          stack.push(updated);
        }
      }
    }
  }
  return createdGroups;
}

function extractDeferFromOperation({
  dependencyGraph,
  operation,
  deferContext,
  responsePath,
}: {
  dependencyGraph: FetchDependencyGraph,
  operation: OperationElement,
  deferContext: DeferContext,
  responsePath: ResponsePath,
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
    responsePath,
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
      addTypenameFieldForAbstractTypes(selection.selectionSet);
    }
  }
}

function withoutTypename(selectionSet: SelectionSet): SelectionSet {
  return selectionSet.filter((selection) => selection.kind !== 'FieldSelection' || selection.element().name === '__typename');
}

function pathHasOnlyFragments(path: OperationPath): boolean {
  return path.every((element) => element.kind === 'FragmentElement');
}

function handleRequires(
  dependencyGraph: FetchDependencyGraph,
  edge: Edge,
  requiresConditions: OpPathTree,
  group: FetchGroup,
  mergeAt: ResponsePath,
  path: OperationPath,
  context: PathContext,
  deferContext: DeferContext,
): {
  group: FetchGroup,
  mergeAt: ResponsePath,
  path: OperationPath,
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
  if (parents.length === 1 && pathHasOnlyFragments(path)) {
    const parent = parents[0];

    // We start by computing the groups for the conditions. We do this using a copy of the current
    // group (with only the inputs) as that allows to modify this copy without modifying `group`.
    const originalInputs = group.clonedInputs()!;
    const newGroup = dependencyGraph.newKeyFetchGroup({ subgraphName: group.subgraphName, mergeAt: group.mergeAt!, deferRef: group.deferRef});
    newGroup.addParent(parent);
    newGroup.addInputs(originalInputs.forRead());
    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, newGroup, deferContextForConditions(deferContext), mergeAt, path);
    if (createdGroups.length == 0) {
      // All conditions were local. Just merge the newly created group back in the current group (we didn't need it)
      // and continue.
      assert(group.canMergeSiblingIn(newGroup), () => `We should be able to merge ${newGroup} into ${group} by construction`);
      group.mergeSiblingIn(newGroup);
      return {group, mergeAt, path, createdGroups: []};
    }

    // We know the @require needs createdGroups. We do want to know however if any of the conditions was
    // fetched from our `newGroup`. If not, then this means that `createdGroup` don't really depend on
    // the current `group`, but can be dependencies of the parent (or even merged into this parent).
    // To know this, we check if `newGroup` inputs contains its inputs (meaning the fetch is
    // useless: we jump to it but didn't get anything new). Not that this isn't perfect because
    // in the case of multiple keys between `newGroup` and its parent, we could theoretically take a
    // different key on the way in that on the way back. In other words, `newGroup` selection may only
    // be fetching a key that happens to not be the one in its inputs, and in that case the code below
    // will not remove `newGroup` even though it would be more efficient to do so. Handling this properly
    // is more complex however and it's sufficiently unlikely to happpen that we ignore that "optimization"
    // for now. If someone run into this and notice, we can optimize then.
    // Note: it is to be sure this test is not poluted by other things in `group` that we created `newGroup`.
    // Note2: `__typename` selections adds a bit of complexity. That is, if `newGroup` selection is not
    // strictly contained in its inputs but only due to the selection of some `__typename`, then we
    // still want to ignore that group, because `__typename` are always trivially queriable from any
    // type in any subgraph and so that `__typename` can always be fetched from the parent. Which is
    // what the `newGroupIsUnneeded` check ignores `__typename` in the selection.
    const newGroupIsUnneeded = newGroup.inputs!.contains(withoutTypename(newGroup.selection)) && parent.path;
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
      group.addInputs(inputsForRequire(dependencyGraph.federatedQueryGraph, entityType, edge, context, false).inputs);
      return { group, mergeAt, path, createdGroups: [] };
    }

    // If we get here, it means that @require needs the information from `unmergedGroups` (plus whatever has
    // been merged before) _and_ those rely on some information from the current `group` (if they hadn't, we
    // would have been able to merge `newGroup` to `group`'s parent). So the group we should return, which
    // is the group where the "post-@require" fields will be add, needs to a be a new group that depends
    // on all those `unmergedGroups`.
    const postRequireGroup = dependencyGraph.newKeyFetchGroup({ subgraphName: group.subgraphName, mergeAt: group.mergeAt!, deferRef: group.deferRef});
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
    const newPath = addPostRequireInputs(
      dependencyGraph,
      entityType,
      edge,
      context,
      parent.group,
      concatOperationPaths(parent.path, path),
      postRequireGroup,
    );
    return {
      group: postRequireGroup,
      mergeAt,
      path: newPath,
      createdGroups: unmergedGroups.concat(postRequireGroup),
    };
  } else {

    // We're in the somewhat simpler case where a @require happens somewhere in the middle of a subgraph query (so, not
    // just after having jumped to that subgraph). In that case, there isn't tons of optimisation we can do: we have to
    // see what satisfying the @require necessitate, and if it needs anything from another subgraph, we have to stop the
    // current subgraph fetch there, get the requirements from other subgraphs, and then resume the query of that particular subgraph.
    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, group, deferContextForConditions(deferContext), mergeAt, path);
    // If we didn't created any group, that means the whole condition was fetched from the current group
    // and we're good.
    if (createdGroups.length == 0) {
      return { group, mergeAt, path, createdGroups: []};
    }
    // We need to create a new group, on the same subgraph `group`, where we resume fetching the field for
    // which we handle the @requires _after_ we've delt with the `requiresConditionsGroups`.
    // Note that we know the conditions will include a key for our group so we can resume properly.
    const newGroup = dependencyGraph.newKeyFetchGroup({ subgraphName: group.subgraphName, mergeAt });
    newGroup.addParents(createdGroups.map((group) => ({ group })));
    const newPath = addPostRequireInputs(
      dependencyGraph,
      entityType,
      edge,
      context,
      group,
      path,
      newGroup,
    );
    return { group: newGroup, mergeAt, path: newPath, createdGroups: createdGroups.concat(newGroup) };
  }
}

function addPostRequireInputs(
  dependencyGraph: FetchDependencyGraph,
  entityType: ObjectType,
  edge: Edge,
  context: PathContext,
  preRequireGroup: FetchGroup,
  requirePath: OperationPath,
  postRequireGroup: FetchGroup,
): OperationPath {
  const { inputs, updatedPath, keyInputs } = inputsForRequire(dependencyGraph.federatedQueryGraph, entityType, edge, context);
  postRequireGroup.addInputs(inputs);
  if (keyInputs) {
    // It could be the key used to resume fetching after the @require is already fetched in the original group, but we cannot
    // guarantee it, so we add it now (and if it was already selected, this is a no-op).
    const addedSelection = selectionSetOfPath(requirePath, (endOfPathSet) => {
      assert(endOfPathSet, () => `Merge path ${requirePath} ends on a non-selectable type`);
      endOfPathSet.addAll(keyInputs.selections());
    });
    preRequireGroup.addSelections(addedSelection);
  }
  return updatedPath;
}

function newCompositeTypeSelectionSet(type: CompositeType): SelectionSet {
  const selectionSet = new SelectionSet(type);
  selectionSet.add(new FieldSelection(new Field(type.typenameField()!)));
  return selectionSet;
}

function inputsForRequire(
  graph: QueryGraph,
  entityType: ObjectType,
  edge: Edge,
  context: PathContext,
  includeKeyInputs: boolean = true
): {
  inputs: Selection,
  updatedPath: OperationPath,
  keyInputs: SelectionSet | undefined,
}{
  const fullSelectionSet = newCompositeTypeSelectionSet(entityType);
  fullSelectionSet.mergeIn(edge.conditions!);
  let keyInputs: SelectionSet | undefined = undefined;
  if (includeKeyInputs) {
    const keyCondition = getLocallySatisfiableKey(graph, edge.head);
    assert(keyCondition, () => `Due to @require, validation should have required a key to be present for ${edge}`);
    fullSelectionSet.mergeIn(keyCondition);
    keyInputs = newCompositeTypeSelectionSet(entityType);
    keyInputs.mergeIn(keyCondition);
  }
  const { updatedSelection, updatedPath } = wrapEntitySelection(entityType, fullSelectionSet, context);
  return {
    inputs: updatedSelection,
    updatedPath,
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
  fragments?: NamedFragments,
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

  return new Operation('query', entitiesCall, variableDefinitions, operationName).optimize(
    fragments,
  );
}

function operationForQueryFetch(
  rootKind: SchemaRootKind,
  selectionSet: SelectionSet,
  allVariableDefinitions: VariableDefinitions,
  fragments?: NamedFragments,
  operationName?: string
): Operation {
  return new Operation(rootKind, selectionSet, allVariableDefinitions.filter(selectionSet.usedVariables()), operationName).optimize(fragments);
}
