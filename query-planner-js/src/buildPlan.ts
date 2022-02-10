import {
  assert,
  arrayEquals,
  baseType,
  CompositeType,
  entityTypeName,
  Field,
  FieldSelection,
  FragmentElement,
  FragmentSelection,
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
  UnionType,
  Variable,
  VariableDefinition,
  VariableDefinitions,
  newDebugLogger,
  selectionOfElement,
  selectionSetOfElement,
  NamedFragments,
  operationToDocument,
  MapWithCachedArrays,
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
} from "@apollo/query-graphs";
import { stripIgnoredCharacters, print, GraphQLError, parse, OperationTypeNode } from "graphql";
import { QueryPlan, ResponsePath, SequenceNode, PlanNode, ParallelNode, FetchNode, trimSelectionNodes } from "./QueryPlan";

const debug = newDebugLogger('plan');

// If a query can be resolved by more than this number of plans, we'll try to reduce the possible options we'll look
// at to get it below this number to void query planning running forever.
// Note that this number is a tad arbitrary: it's a nice round number that, on my laptop, ensure query planning don't
// take more than a handful of seconds.
// Note: exported so we can have a test that explicitly requires more than this number.
export const MAX_COMPUTED_PLANS = 10000;

function mapOptionsToSelections<RV extends Vertex>(
  selectionSet: SelectionSet,
  options: SimultaneousPathsWithLazyIndirectPaths<RV>[]
): [Selection, SimultaneousPathsWithLazyIndirectPaths<RV>[]][]  {
  // We reverse the selections because we're going to pop from `openPaths` and this ensure we end up handling things in the query order.
  return selectionSet.selections(true).map(node => [node, options]);
}

class QueryPlanningTaversal<RV extends Vertex> {
  // The stack contains all states that aren't terminal.
  private bestPlan: [FetchDependencyGraph, OpPathTree<RV>, number] | undefined;
  private readonly isTopLevel: boolean;
  private conditionResolver: ConditionResolver;

  private stack: [Selection, SimultaneousPathsWithLazyIndirectPaths<RV>[]][];
  private readonly closedBranches: SimultaneousPaths<RV>[][] = [];

  constructor(
    readonly supergraphSchema: Schema, readonly subgraphs: QueryGraph, selectionSet: SelectionSet,
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
    const initialOptions = [ new SimultaneousPathsWithLazyIndirectPaths([initialPath], initialContext, this.conditionResolver, excludedEdges, excludedConditions)];
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
    return FetchDependencyGraph.create(this.subgraphs);
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
      assert(eltSize, "Got empty option: this shouldn't have happened");
      if(!eltSize) {
        totalCombinations = 0;
        break;
      }
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
    return this.costFunction.finalize(dependencyGraph.process(this.costFunction), true);
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

function possiblePlans(closedBranches: SimultaneousPaths<any>[][]): number {
  let totalCombinations = 1;
  for (let i = 0; i < closedBranches.length; ++i){
    const eltSize = closedBranches[i].length;
    if(!eltSize) {
      totalCombinations = 0;
      break;
    }
    totalCombinations *= eltSize;
  }
  return totalCombinations;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

type CostFunction = FetchGroupProcessor<number, number[], number>;

const fetchCost = 10000;
const pipeliningCost = 100;
const sameLevelFetchCost = 100;

function selectionCost(selection?: SelectionSet, depth: number = 1): number {
  // The cost is essentially the number of elements in the selection, but we make deeped element cost a tiny bit more, mostly to make things a tad more
  // deterministic (typically, if we have an interface with a single implementation, then we can have a choice between a query plan that type-explode a
  // field of the interface and one that doesn't, and both will be almost identical, except that the type-exploded field will be a different depth; by
  // favoring lesser depth in that case, we favor not type-expoding).
  return selection ? selection.selections().reduce((prev, curr) => prev + depth + selectionCost(curr.selectionSet, depth + 1), 0) : 0;
}

const defaultCostFunction: CostFunction = {
  onFetchGroup: (group: FetchGroup) =>  selectionCost(group.selection),
  reduceParallel: (values: number[]) => values,
  // That math goes the following way:
  // - we add the costs in a sequence (the `acc + ...`)
  // - within a stage of the sequence, the groups are done in parallel, hence the `Math.max(...)` (but still, we prefer querying less services if
  //   we can help it, hence the `+ (valueArray.length - 1) * sameLevelFetchCost`).
  // - but each group in a stage require a fetch, so we add a cost proportional to how many we have
  // - each group within a stage has its own cost plus a flat cost associated to doing that fetch (`fetchCost + s`).
  // - lastly, we also want to minimize the number of steps in the pipeline, so later stages are more costly (`idx * pipelineCost`)
  reduceSequence: (values: (number[] | number)[]) =>
    values.reduceRight(
      (acc: number, value, idx) => {
        const valueArray = Array.isArray(value) ? value : [value];
        return acc + ((idx + 1) * pipeliningCost) * (fetchCost * valueArray.length) * (Math.max(...valueArray) + (valueArray.length - 1) * sameLevelFetchCost)
      },
      0
    ),
  finalize: (roots: number[], rootsAreParallel: boolean) => roots.length === 0 ? 0 : (rootsAreParallel ? (Math.max(...roots) + (roots.length - 1) * sameLevelFetchCost) : sum(roots))
};

function isIntrospectionSelection(selection: Selection): boolean {
  return selection.kind == 'FieldSelection' && selection.element().definition.isIntrospectionField();
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

export function computeQueryPlan(supergraphSchema: Schema, federatedQueryGraph: QueryGraph, operation: Operation): QueryPlan {
  if (operation.rootKind === 'subscription') {
    throw new GraphQLError(
      'Query planning does not support subscriptions for now.',
      [parse(operation.toString())],
    );
  }
  // We expand all fragments. This might merge a number of common branches and save us
  // some work, and we're going to expand everything during the algorithm anyway.
  operation = operation.expandAllFragments();
  operation = withoutIntrospection(operation);

  debug.group(() => `Computing plan for\n${operation}`);
  if (operation.selectionSet.isEmpty()) {
    debug.groupEnd('Empty plan');
    return { kind: 'QueryPlan' };
  }

  const root = federatedQueryGraph.root(operation.rootKind);
  assert(root, () => `Shouldn't have a ${operation.rootKind} operation if the subgraphs don't have a ${operation.rootKind} root`);
  const processor = fetchGroupToPlanProcessor(operation.variableDefinitions, operation.selectionSet.fragments);
  if (operation.rootKind === 'mutation') {
    const dependencyGraphs = computeRootSerialDependencyGraph(supergraphSchema, operation, federatedQueryGraph, root);
    const rootNode = processor.finalize(dependencyGraphs.flatMap(g => g.process(processor)), false);
    debug.groupEnd('Mutation plan computed');
    return { kind: 'QueryPlan', node: rootNode };
  } else {
    const dependencyGraph =  computeRootParallelDependencyGraph(supergraphSchema, operation, federatedQueryGraph, root);
    const rootNode = processor.finalize(dependencyGraph.process(processor), true);
    debug.groupEnd('Query plan computed');
    return { kind: 'QueryPlan', node: rootNode };
  }
}

function computeRootParallelDependencyGraph(
  supergraphSchema: Schema,
  operation: Operation,
  federatedQueryGraph: QueryGraph,
  root: RootVertex
): FetchDependencyGraph {
  return computeRootParallelBestPlan(supergraphSchema, operation.selectionSet, operation.variableDefinitions, federatedQueryGraph, root)[0];
}

function computeRootParallelBestPlan(
  supergraphSchema: Schema,
  selection: SelectionSet,
  variables: VariableDefinitions,
  federatedQueryGraph: QueryGraph,
  root: RootVertex
): [FetchDependencyGraph, OpPathTree<RootVertex>, number] {
  const planningTraversal = new QueryPlanningTaversal(
    supergraphSchema,
    federatedQueryGraph,
    selection,
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
    FetchDependencyGraph.create(federatedQueryGraph),
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
  root: RootVertex
): FetchDependencyGraph[] {
  // We have to serially compute a plan for each top-level selection.
  const splittedRoots = splitTopLevelFields(operation.selectionSet);
  const graphs: FetchDependencyGraph[] = [];
  let [prevDepGraph, prevPaths] = computeRootParallelBestPlan(supergraphSchema, splittedRoots[0], operation.variableDefinitions, federatedQueryGraph, root);
  let prevSubgraph = onlyRootSubgraph(prevDepGraph);
  for (let i = 1; i < splittedRoots.length; i++) {
    const [newDepGraph, newPaths] = computeRootParallelBestPlan(supergraphSchema, splittedRoots[i], operation.variableDefinitions, federatedQueryGraph, root);
    const newSubgraph = onlyRootSubgraph(newDepGraph);
    if (prevSubgraph === newSubgraph) {
      // The new operation (think 'mutation' operation) is on the same subgraph than the previous one, so we can conat them in a single fetch
      // and rely on the subgraph to enforce seriability. Do note that we need to `concat()` and not `merge()` because if we have
      // mutation Mut {
      //    mut1 {...}
      //    mut2 {...}
      //    mut1 {...}
      // }
      // then we should _not_ merge the 2 `mut1` fields (contrarily to what happens on queried fields).
      prevPaths = prevPaths.concat(newPaths);
      prevDepGraph = computeRootFetchGroups(FetchDependencyGraph.create(federatedQueryGraph), prevPaths, root.rootKind);
    } else {
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

function fetchGroupToPlanProcessor(
  variableDefinitions: VariableDefinitions,
  fragments?: NamedFragments
): FetchGroupProcessor<PlanNode, PlanNode, PlanNode | undefined> {
  return {
    onFetchGroup: (group: FetchGroup) => group.toPlanNode(variableDefinitions, fragments),
    reduceParallel: (values: PlanNode[]) => flatWrap('Parallel', values),
    reduceSequence: (values: PlanNode[]) => flatWrap('Sequence', values),
    finalize: (roots: PlanNode[], rootsAreParallel) => roots.length == 0 ? undefined : flatWrap(rootsAreParallel ? 'Parallel' : 'Sequence', roots)
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

class FetchGroup {
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
      mergeAt
    );
  }

  clone(newDependencyGraph: FetchDependencyGraph): FetchGroup {
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

  addDependencyOn(groups: FetchGroup | FetchGroup[]) {
    this.dependencyGraph.addDependency(this, groups);
  }

  removeDependencyOn(groups: FetchGroup | FetchGroup[]) {
    this.dependencyGraph.removeDependency(this, groups);
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

  mergeIn(toMerge: FetchGroup, mergePath: OperationPath) {
    assert(!toMerge.isTopLevel, () => `Shouldn't merge top level group ${toMerge} into ${this}`);
    // Note that because toMerge is not top-level, the first "level" of it's selection is going to be a typeCast into the entity type
    // used to get to the group (because the entities() operation, which is called, returns the _Entity and _needs_ type-casting).
    // But when we merge-in, the type cast can be skipped.
    const selectionSet = selectionSetOfPath(mergePath, endOfPathSet => {
      assert(endOfPathSet, () => `Merge path ${mergePath} ends on a non-selectable type`);
      for (const typeCastSel of toMerge.selection.selections()) {
        assert(typeCastSel instanceof FragmentSelection, () => `Unexpected field selection ${typeCastSel} at top-level of ${toMerge} selection.`);
        endOfPathSet.mergeIn(typeCastSel.selectionSet);
      }
    });

    this._selection.forWrite().mergeIn(selectionSet);
    this.dependencyGraph.onMergedIn(this, toMerge);
  }

  toPlanNode(variableDefinitions: VariableDefinitions, fragments?: NamedFragments) : PlanNode {
    addTypenameFieldForAbstractTypes(this.selection);

    this.selection.validate();
    const inputs = this._inputs?.forRead();
    if (inputs) {
      inputs.validate();
    }

    const inputNodes = inputs ? inputs.toSelectionSetNode() : undefined;

    const operation = this.isEntityFetch
      ? operationForEntitiesFetch(this.dependencyGraph.subgraphSchemas.get(this.subgraphName)!, this.selection, variableDefinitions, fragments)
      : operationForQueryFetch(this.rootKind, this.selection, variableDefinitions, fragments);

    const fetchNode: FetchNode = {
      kind: 'Fetch',
      serviceName: this.subgraphName,
      requires: inputNodes ? trimSelectionNodes(inputNodes.selections) : undefined,
      variableUsages: this.selection.usedVariables().map(v => v.name),
      operation: stripIgnoredCharacters(print(operationToDocument(operation))),
      operationKind:schemaRootKindToOperationKind(operation.rootKind),
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
      ? `[${this.index}]${this.subgraphName}[${this._selection}]`
      : `[${this.index}]${this.subgraphName}@(${this.mergeAt})[${this._inputs} => ${this._selection}]`;
  }
}

function schemaRootKindToOperationKind(operation: SchemaRootKind): OperationTypeNode {
  switch(operation) {
    case "query": return OperationTypeNode.QUERY;
    case "mutation": return OperationTypeNode.MUTATION;
    case "subscription": return  OperationTypeNode.SUBSCRIPTION;
  }
}

function removeInPlace<T>(value: T, array: T[]) {
  const idx = array.indexOf(value);
  if (idx >= 0) {
    array.splice(idx, 1);
  }
}

interface FetchGroupProcessor<G, P, F> {
  onFetchGroup(group: FetchGroup, isRootGroup: boolean): G;
  reduceParallel(values: G[]): P;
  reduceSequence(values: (G | P)[]): G;
  finalize(roots: G[], isParallel: boolean): F
}

type UnhandledGroups = [FetchGroup, UnhandledInEdges][];
type UnhandledInEdges = number[];

function sameMergeAt(m1: ResponsePath | undefined, m2: ResponsePath | undefined): boolean {
  if (!m1) {
    return !m2;
  }
  if (!m2) {
    return false;
  }
  return arrayEquals(m1, m2);
}

class FetchDependencyGraph {
  private isReduced: boolean = false;

  private constructor(
    readonly subgraphSchemas: ReadonlyMap<string, Schema>,
    readonly federatedQueryGraph: QueryGraph,
    private readonly rootGroups: MapWithCachedArrays<string, FetchGroup>,
    private readonly groups: FetchGroup[],
    private readonly adjacencies: number[][],
    private readonly inEdges: number[][],
    // For each groups, an optional path in its "unique" parent. If a group has more than one parent, then
    // this will be undefined. Even if the group has a unique parent, it's not guaranteed to be set.
    private readonly pathsInParents: (OperationPath | undefined)[]
  ) {}

  static create(federatedQueryGraph: QueryGraph) {
    return new FetchDependencyGraph(
      federatedQueryGraph.sources,
      federatedQueryGraph,
      new MapWithCachedArrays(),
      [],
      [],
      [],
      []
    );
  }

  clone(): FetchDependencyGraph {
    const cloned = new FetchDependencyGraph(
      this.subgraphSchemas,
      this.federatedQueryGraph,
      new MapWithCachedArrays<string, FetchGroup>(),
      new Array(this.groups.length),
      this.adjacencies.map(a => a.concat()),
      this.inEdges.map(a => a.concat()),
      this.pathsInParents.concat()
    );

    for (let i = 0; i < this.groups.length; i++) {
      cloned.groups[i] = this.groups[i].clone(cloned);
    }
    for (const group of this.rootGroups.values()) {
      cloned.rootGroups.set(group.subgraphName, cloned.groups[group.index]);
    }
    return cloned;
  }

  getOrCreateRootFetchGroup(subgraphName: string, rootKind: SchemaRootKind, parentType: CompositeType): FetchGroup {
    let group = this.rootGroups.get(subgraphName);
    if (!group) {
      group = this.createRootFetchGroup(subgraphName, rootKind, parentType);
      this.rootGroups.set(subgraphName, group);
    }
    return group;
  }

  rootSubgraphs(): readonly string[] {
    return this.rootGroups.keys();
  }

  createRootFetchGroup(subgraphName: string, rootKind: SchemaRootKind, parentType: CompositeType): FetchGroup {
    const group = this.newFetchGroup(subgraphName, parentType, false, rootKind);
    this.rootGroups.set(subgraphName, group);
    return group;
  }

  private newFetchGroup(
    subgraphName: string,
    parentType: CompositeType,
    isEntityFetch: boolean,
    rootKind: SchemaRootKind, // always "query" for entity fetches
    mergeAt?: ResponsePath,
    directParent?: FetchGroup,
    pathInParent?: OperationPath
  ): FetchGroup {
    this.onModification();
    const newGroup = FetchGroup.create(
      this,
      this.groups.length,
      subgraphName,
      rootKind,
      parentType,
      isEntityFetch,
      mergeAt,
    );
    this.groups.push(newGroup);
    this.adjacencies.push([]);
    this.inEdges.push([]);
    if (directParent) {
      this.addEdge(directParent.index, newGroup.index, pathInParent);
    }
    return newGroup;
  }

  getOrCreateKeyFetchGroup(
    subgraphName: string,
    mergeAt: ResponsePath,
    directParent: FetchGroup,
    pathInParent: OperationPath,
    conditionsGroups: FetchGroup[]
  ): FetchGroup {
    // Let's look if we can reuse a group we have, that is an existing dependent of the parent for
    // the same subgraph and same mergeAt and that is not part of our condition dependencies (the latter
    // meaning that we cannot reuse a group that fetched something we actually as input.
    for (const existing of this.dependents(directParent)) {
      if (existing.subgraphName === subgraphName
        && existing.mergeAt
        && sameMergeAt(existing.mergeAt, mergeAt)
        && !this.isDependedOn(existing, conditionsGroups)
      ) {
        const existingPathInParent = this.pathInParent(existing);
        if (pathInParent && existingPathInParent && !sameOperationPaths(existingPathInParent, pathInParent)) {
          this.pathsInParents[existing.index] = undefined;
        }
        return existing;
      }
    }
    const entityType = this.subgraphSchemas.get(subgraphName)!.type(entityTypeName)! as UnionType;
    return this.newFetchGroup(subgraphName, entityType, true, 'query', mergeAt, directParent, pathInParent);
  }

  newRootTypeFetchGroup(
    subgraphName: string,
    rootKind: SchemaRootKind,
    parentType: ObjectType,
    mergeAt: ResponsePath,
    directParent: FetchGroup,
    pathInParent: OperationPath,
  ): FetchGroup {
    return this.newFetchGroup(subgraphName, parentType, false, rootKind, mergeAt, directParent, pathInParent);
  }

  // Returns true if `toCheck` is either part of `conditions`, or is a dependency (potentially recursively)
  // of one of the gorup of conditions.
  private isDependedOn(toCheck: FetchGroup, conditions: FetchGroup[]): boolean  {
    const stack = conditions.concat();
    while (stack.length > 0) {
      const group = stack.pop()!;
      if (toCheck.index === group.index) {
        return true;
      }
      stack.push(...this.dependencies(group));
    }
    return false;
  }

  newKeyFetchGroup(
    subgraphName: string,
    mergeAt: ResponsePath,
  ): FetchGroup {
    const entityType = this.subgraphSchemas.get(subgraphName)!.type(entityTypeName)! as UnionType;
    return this.newFetchGroup(subgraphName, entityType, true, 'query', mergeAt);
  }

  addDependency(dependentGroup: FetchGroup, dependentOn: FetchGroup | FetchGroup[]) {
    this.onModification();
    const groups = Array.isArray(dependentOn) ? dependentOn : [ dependentOn ];
    for (const group of groups) {
      this.addEdge(group.index, dependentGroup.index);
    }
  }

  removeDependency(dependentGroup: FetchGroup, dependentOn: FetchGroup | FetchGroup[]) {
    this.onModification();
    const groups = Array.isArray(dependentOn) ? dependentOn : [ dependentOn ];
    for (const group of groups) {
      this.removeEdge(group.index, dependentGroup.index);
    }
  }

  pathInParent(group: FetchGroup): OperationPath | undefined {
    return this.pathsInParents[group.index];
  }

  private addEdge(from: number, to: number, pathInFrom?: OperationPath) {
    if (!this.adjacencies[from].includes(to)) {
      this.adjacencies[from].push(to);
      this.inEdges[to].push(from);
      const parentsCount = this.inEdges[to].length;
      if (pathInFrom && parentsCount === 1) {
        this.pathsInParents[to] = pathInFrom;
      } else if (parentsCount > 1) {
        this.pathsInParents[to] = undefined;
      }
    }
  }

  private removeEdge(from: number, to: number) {
    if (this.adjacencies[from].includes(to)) {
      removeInPlace(to, this.adjacencies[from]);
      removeInPlace(from, this.inEdges[to]);
      // If this was the only edge, we should erase the path. If it wasn't, we shouldn't have add a path in the
      // first place, so setting to undefined is harmless.
      this.pathsInParents[to] = undefined;
    }
  }

  onMergedIn(mergedInto: FetchGroup, merged: FetchGroup) {
    assert(!merged.isTopLevel, "Shouldn't remove top level groups");
    this.onModification();
    this.relocateDependentsOnMergedIn(mergedInto, merged.index);
    this.removeInternal(merged.index);
  }

  private relocateDependentsOnMergedIn(mergedInto: FetchGroup, mergedIndex: number) {
    for (const dependentIdx of this.adjacencies[mergedIndex]) {
      this.addEdge(mergedInto.index, dependentIdx);
      // While at it, we also remove the in-edge of the dependent to `merged` if it exists.
      const idxInIns = this.inEdges[dependentIdx].indexOf(mergedIndex);
      if (idxInIns >= 0) {
        this.inEdges[dependentIdx].splice(idxInIns, 1);
      }
    }
  }

  remove(group: FetchGroup) {
    this.onModification();
    const dependents = this.dependents(group);
    const dependencies = this.dependencies(group);
    assert(dependents.length === 0, () => `Cannot remove group ${group} with dependents [${dependents}]`);
    assert(dependencies.length <= 1, () => `Cannot remove group ${group} with more/less than one dependency: [${dependencies}]`);
    this.removeInternal(group.index);
  }

  private removeInternal(mergedIndex: number) {
    // We remove `merged` from any it depends on
    for (const dependedIdx of this.inEdges[mergedIndex]) {
      const idxInAdj = this.adjacencies[dependedIdx].indexOf(mergedIndex);
      this.adjacencies[dependedIdx].splice(idxInAdj, 1);
    }

    // We then remove the entries for the merged group.
    this.groups.splice(mergedIndex, 1);
    this.adjacencies.splice(mergedIndex, 1);
    this.inEdges.splice(mergedIndex, 1);

    // But now, every group index above `merge.index` is one-off.
    this.groups.forEach(g => {
      if (g.index > mergedIndex) {
        --g.index;
      }
    });
    this.adjacencies.forEach(adj => { adj.forEach((v, i) => {
      if (v > mergedIndex) {
        adj[i] = v - 1;
      }
    })});
    this.inEdges.forEach(ins => { ins.forEach((v, i) => {
      if (v > mergedIndex) {
        ins[i] = v - 1;
      }
    })});
  }

  private onModification() {
    this.isReduced = false;
  }

  // Do a transitive reduction (https://en.wikipedia.org/wiki/Transitive_reduction) of the graph
  // We keep it simple and do a DFS from each vertex. The complexity is not amazing, but dependency
  // graphs between fetch groups will almost surely never be huge and query planning performance
  // is not paramount so this is almost surely "good enough".
  // After the transitive reduction, we also do an additional traversals to check for:
  //  1) fetches with no selection: this can happen when we have a require if the only field requested
  //     was the one with the require and that forced some dependencies. Those fetch should have
  //     no dependents and we can just remove them.
  //  2) fetches that are made in parallel to the same subgraph and the same path, and merge those.
  private reduce() {
    if (this.isReduced) {
      return;
    }
    for (const group of this.groups) {
      for (const adjacent of this.adjacencies[group.index]) {
        this.dfsRemoveRedundantEdges(group.index, adjacent);
      }
    }

    for (const group of this.rootGroups.values()) {
      this.removeEmptyGroups(group);
    }

    for (const group of this.rootGroups.values()) {
      this.mergeDependentFetchesForSameSubgraphAndPath(group);
    }

    this.isReduced = true;
  }

  private removeEmptyGroups(group: FetchGroup) {
    const dependents = this.dependents(group);
    if (group.selection.isEmpty()) {
      assert(dependents.length === 0, () => `Empty group ${group} has dependents: ${dependents}`);
      this.remove(group);
    }
    for (const g of dependents) {
      this.removeEmptyGroups(g);
    }
  }

  private mergeDependentFetchesForSameSubgraphAndPath(group: FetchGroup) {
    const dependents = this.dependents(group);
    if (dependents.length > 1) {
      for (const g1 of dependents) {
        for (const g2 of dependents) {
          if (g1.index !== g2.index
            && g1.subgraphName === g2.subgraphName
            && sameMergeAt(g1.mergeAt, g2.mergeAt)
            && this.dependencies(g1).length === 1
            && this.dependencies(g2).length === 1
          ) {
            // We replace g1 by a new group that is the same except (possibly) for it's parentType ...
            // (that's why we don't use `newKeyFetchGroup`, it assigns the index while we reuse g1's one here)
            const merged = FetchGroup.create(this, g1.index, g1.subgraphName, g1.rootKind, g1.selection.parentType, g1.isEntityFetch, g1.mergeAt);
            // Erase the pathsInParents as it's now potentially invalid (we won't really use it from that point on, but better
            // safe than sorry).
            this.pathsInParents[g1.index] = undefined;
            if (g1.inputs) {
              merged.addInputs(g1.inputs);
            }
            merged.addSelections(g1.selection);
            this.groups[merged.index] = merged;

            // ... and then merge g2 into that.
            if (g2.inputs) {
              merged.addInputs(g2.inputs);
            }
            merged.addSelections(g2.selection);
            this.onMergedIn(merged, g2);
            // As we've just changed the dependency graph, our current iterations are kind of invalid anymore. So
            // we simply call ourselves back on the current group, which will retry the newly modified dependencies.
            this.mergeDependentFetchesForSameSubgraphAndPath(group);
            return;
          }
        }
      }
    }

    // Now recurse to the sub-groups.
    for (const g of dependents) {
      this.mergeDependentFetchesForSameSubgraphAndPath(g);
    }
  }

  dependencies(group: FetchGroup): FetchGroup[] {
    return this.inEdges[group.index].map(i => this.groups[i]);
  }

  dependents(group: FetchGroup): FetchGroup[] {
    return this.adjacencies[group.index].map(i => this.groups[i]);
  }

  private dfsRemoveRedundantEdges(parentVertex: number, startVertex: number) {
    const parentAdjacencies = this.adjacencies[parentVertex];
    const stack = [ ...this.adjacencies[startVertex] ];
    while (stack.length > 0) {
      const v = stack.pop()!;
      removeInPlace(v, parentAdjacencies);
      removeInPlace(parentVertex, this.inEdges[v]);
      stack.push(...this.adjacencies[v]);
    }
  }

  private outGroups(group: FetchGroup): FetchGroup[] {
    return this.adjacencies[group.index].map(i => this.groups[i]);
  }

  private inGroups(group: FetchGroup): FetchGroup[] {
    return this.inEdges[group.index].map(i => this.groups[i]);
  }

  private processGroup<G, P, F>(
    processor: FetchGroupProcessor<G, P, F>,
    group: FetchGroup,
    isRootGroup: boolean
  ): [G, UnhandledGroups] {
    const outGroups = this.outGroups(group);
    const processed = processor.onFetchGroup(group, isRootGroup);
    if (outGroups.length == 0) {
      return [processed, []];
    }

    const allOutGroupsHaveThisAsIn = outGroups.every(g => this.inGroups(g).length === 1);
    if (allOutGroupsHaveThisAsIn) {
      const nodes: (G | P)[] = [processed];

      let nextNodes = outGroups;
      let remainingNext: UnhandledGroups = [];
      while (nextNodes.length > 0) {
        const [node, toHandle, remaining] = this.processParallelGroups(processor, nextNodes, remainingNext);
        nodes.push(node);
        const [canHandle, newRemaining] = this.mergeRemainings(remainingNext, remaining);
        remainingNext = newRemaining;
        nextNodes = canHandle.concat(toHandle);
      }
      return [processor.reduceSequence(nodes), remainingNext];
    } else {
      // We return just the group, with all other groups to be handled after, but remembering that
      // this group edge has been handled.
      return [processed, outGroups.map(g => [g, this.inEdges[g.index].filter(e => e !== group.index)])];
    }
  }

  private processParallelGroups<G, P, F>(
    processor: FetchGroupProcessor<G, P, F>,
    groups: FetchGroup[],
    remaining: UnhandledGroups
  ): [P, FetchGroup[], UnhandledGroups] {
    const parallelNodes: G[] = [];
    let remainingNext = remaining;
    const toHandleNext: FetchGroup[] = [];
    for (const group of groups) {
      const [node, remaining] = this.processGroup(processor, group, false);
      parallelNodes.push(node);
      const [canHandle, newRemaining] = this.mergeRemainings(remainingNext, remaining);
      toHandleNext.push(...canHandle);
      remainingNext = newRemaining;
    }
    return [
      processor.reduceParallel(parallelNodes),
      toHandleNext,
      remainingNext
    ];
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

  private mergeRemaingsAndRemoveIfFound(group: FetchGroup, inEdges: UnhandledInEdges, otherGroups: UnhandledGroups): UnhandledInEdges {
    const idx = otherGroups.findIndex(g => g[0].index === group.index);
    if (idx < 0) {
      return inEdges;
    } else {
      const otherEdges = otherGroups[idx][1];
      otherGroups.splice(idx, 1);
      // The uhandled are the one that are unhandled on both side.
      return inEdges.filter(e => otherEdges.includes(e))
    }
  }

  process<G, P>(processor: FetchGroupProcessor<G, P, any>): G[] {
    this.reduce();

    const rootNodes: G[] = this.rootGroups.values().map(rootGroup => {
      const [node, remaining] = this.processGroup(processor, rootGroup, true);
      assert(remaining.length == 0, `A root group should have no remaining groups unhandled`);
      return node;
    });
    return rootNodes;
  }

  dumpOnConsole() {
    console.log('Groups:');
    for (const group of this.groups) {
      console.log(`  ${group}`);
    }
    console.log('Adjacencies:');
    for (const [i, adj] of this.adjacencies.entries()) {
      console.log(`  ${i} => [${adj.join(', ')}]`);
    }
    console.log('In-Edges:');
    for (const [i, ins] of this.inEdges.entries()) {
      console.log(`  ${i} => [${ins.join(', ')}]`);
    }
  }

  toString() : string {
    return this.rootGroups.values().map(g => this.toStringInternal(g, "")).join('\n');
  }

  toStringInternal(group: FetchGroup, indent: string): string {
    const groupDependents = this.adjacencies[group.index];
    return [indent + group.subgraphName + ' <- ' + groupDependents.map(i => this.groups[i].subgraphName).join(', ')]
      .concat(groupDependents
        .flatMap(g => this.adjacencies[g].length == 0
          ? []
          : this.toStringInternal(this.groups[g], indent + "  ")))
      .join('\n');
  }
}

function computeRootFetchGroups(dependencyGraph: FetchDependencyGraph, pathTree: OpRootPathTree, rootKind: SchemaRootKind): FetchDependencyGraph {
  // The root of the pathTree is one of the "fake" root of the subgraphs graph, which belongs to no subgraph but points to each ones.
  // So we "unpack" the first level of the tree to find out our top level groups (and initialize our stack).
  // Note that we can safely ignore the triggers of that first level as it will all be free transition, and we know we cannot have conditions.
  for (const [edge, _trigger, _conditions, child] of pathTree.childElements()) {
    assert(edge !== null, `The root edge should not be null`);
    const source = edge.tail.source;
    // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
    const rootType = edge.tail.type as ObjectType;
    const group = dependencyGraph.getOrCreateRootFetchGroup(source, rootKind, rootType);
    computeGroupsForTree(dependencyGraph, child, group);
  }
  return dependencyGraph;
}

function computeNonRootFetchGroups(dependencyGraph: FetchDependencyGraph, pathTree: OpPathTree, rootKind: SchemaRootKind): FetchDependencyGraph {
  const source = pathTree.vertex.source;
  // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
  const rootType = pathTree.vertex.type;
  assert(isCompositeType(rootType), () => `Should not have condition on non-selectable type ${rootType}`);
  const group = dependencyGraph.getOrCreateRootFetchGroup(source, rootKind, rootType);
  computeGroupsForTree(dependencyGraph, pathTree, group);
  return dependencyGraph;
}

function createNewFetchSelectionContext(type: CompositeType, selections: SelectionSet | undefined, context: PathContext): [Selection, OperationPath] {
  const typeCast = new FragmentElement(type, type.name);
  let inputSelection = selectionOfElement(typeCast, selections);
  let path = [typeCast];
  if (context.isEmpty()) {
    return [inputSelection, path];
  }

  const schema = type.schema();
  // We add the first include/skip to the current typeCast and then wrap in additional type-casts for the next ones
  // if necessary. Note that we use type-casts (... on <type>), but, outside of the first one, we could well also
  // use fragments with no type-condition. We do the former mostly to preverve older behavior, but doing the latter
  // would technically procude slightly small query plans.
  const [name0, ifs0] = context.directives[0];
  typeCast.applyDirective(schema.directive(name0)!, { 'if': ifs0 });

  for (let i = 1; i < context.directives.length; i++) {
    const [name, ifs] = context.directives[i];
    const fragment = new FragmentElement(type, type.name);
    fragment.applyDirective(schema.directive(name)!, { 'if': ifs });
    inputSelection = selectionOfElement(fragment, selectionSetOf(type, inputSelection));
    path = [fragment].concat(path);
  }

  return [inputSelection, path];
}

function computeGroupsForTree(
  dependencyGraph: FetchDependencyGraph,
  pathTree: OpPathTree<any>,
  startGroup: FetchGroup,
  initialMergeAt: ResponsePath = [],
  initialPath: OperationPath = [],
): FetchGroup[] {
  const stack: [OpPathTree, FetchGroup, ResponsePath, OperationPath][] = [[pathTree, startGroup, initialMergeAt, initialPath]];
  const createdGroups = [ ];
  while (stack.length > 0) {
    const [tree, group, mergeAt, path] = stack.pop()!;
    if (tree.isLeaf()) {
      group.addSelection(path);
    } else {
      // We want to preserve the order of the elements in the child, but the stack will reverse everything, so we iterate
      // in reverse order to counter-balance it.
      for (const [edge, operation, conditions, child] of tree.childElements(true)) {
        if (isPathContext(operation)) {
          // The only 3 cases where we can take edge not "driven" by an operation is either when we resolve a key, resolve
          // a query (switch subgraphs because the query root type is the type of a field), or at the root of subgraph graph.
          // The latter case has already be handled the beginning of `computeFetchGroups` so only the 2 former remains.
          assert(edge !== null, () => `Unexpected 'null' edge with no trigger at ${path}`);
          assert(edge.head.source !== edge.tail.source, () => `Key/Query edge ${edge} should change the underlying subgraph`);
          if (edge.transition.kind === 'KeyResolution') {
            assert(conditions, () => `Key edge ${edge} should have some conditions paths`);
            // First, we need to ensure we fetch the conditions from the current group.
            const groupsForConditions = computeGroupsForTree(dependencyGraph, conditions, group, mergeAt, path);
            // Then we can "take the edge", creating a new group. That group depends
            // on the condition ones.
            const newGroup = dependencyGraph.getOrCreateKeyFetchGroup(edge.tail.source, mergeAt, group, path, groupsForConditions);
            createdGroups.push(newGroup);
            // The new group depends on the current group but 'newKeyFetchGroup' already handled that.
            newGroup.addDependencyOn(groupsForConditions);
            const type = edge.tail.type as CompositeType; // We shouldn't have a key on a non-composite type
            const inputSelections = new SelectionSet(type);
            inputSelections.add(new FieldSelection(new Field(type.typenameField()!)));
            inputSelections.mergeIn(edge.conditions!);

            const [inputs, newPath] = createNewFetchSelectionContext(type, inputSelections, operation);
            newGroup.addInputs(inputs);

            // We also ensure to get the __typename of the current type in the "original" group.
            group.addSelection(path.concat(new Field((edge.head.type as CompositeType).typenameField()!)));

            stack.push([child, newGroup, mergeAt, newPath]);
          } else {
            assert(edge.transition.kind === 'RootTypeResolution', () => `Unexpected non-collecting edge ${edge}`);
            const rootKind = edge.transition.rootKind;
            assert(!conditions, () => `Root type resolution edge ${edge} should not have conditions`);

            assert(isObjectType(edge.head.type) && isObjectType(edge.tail.type), () => `Expected an objects for the vertices of ${edge}`);
            const type = edge.tail.type;
            assert(type === type.schema().schemaDefinition.rootType(rootKind), () => `Expected ${type} to be the root ${rootKind} type, but that is ${type.schema().schemaDefinition.rootType(rootKind)}`);

            // We're querying a field `q` of a subgraph, get one of the root type, and follow with a query on another
            // subgraph. But that mean that on the original subgraph, we may not have added _any_ selection for
            // type `q` and that make the query to the original subgraph invalid. To avoid this, we request the
            // __typename field.
            group.addSelection(path.concat(new Field((edge.head.type as CompositeType).typenameField()!)));

            // We take the edge, creating a new group. Note that we always create a new group because this
            // correspond to jumping subgraph after a field returned the query root type, and we want to
            // preserve this ordering somewhat (debatable, possibly).
            const newGroup = dependencyGraph.newRootTypeFetchGroup(edge.tail.source, rootKind, type, mergeAt, group, path);
            const newPath = createNewFetchSelectionContext(type, undefined, operation)[1];
            stack.push([child, newGroup, mergeAt, newPath]);
          }
        } else if (edge === null) {
          // A null edge means that the operation does nothing but may contain directives to preserve.
          // If it does contains directives, we preserve the operation, otherwise, we just skip it
          // as a minor optimization (it makes the query slighly smaller, but on complex queries, it
          // might also deduplicate similar selections).
          const newPath = operation.appliedDirectives.length === 0 ? path : path.concat(operation);
          stack.push([child, group, mergeAt, newPath]);
        } else {
          assert(edge.head.source === edge.tail.source, () => `Collecting edge ${edge} for ${operation} should not change the underlying subgraph`)
          let updatedGroup = group;
          let updatedMergeAt = mergeAt;
          let updatedPath = path;
          if (conditions) {
            // We have some @requires.
            [updatedGroup, updatedMergeAt, updatedPath] =  handleRequires(
              dependencyGraph,
              edge,
              conditions,
              group,
              mergeAt,
              path
            );
          }

          const newMergeAt = operation.kind === 'Field'
            ? addToResponsePath(updatedMergeAt, operation.responseName(), (edge.transition as FieldCollection).definition.type!)
            : updatedMergeAt;
          stack.push([child, updatedGroup, newMergeAt, updatedPath.concat(operation)]);
        }
      }
    }
  }
  return createdGroups;
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

function handleRequires(
  dependencyGraph: FetchDependencyGraph,
  edge: Edge,
  requiresConditions: OpPathTree,
  group: FetchGroup,
  mergeAt: ResponsePath,
  path: OperationPath
): [FetchGroup, ResponsePath, OperationPath] {
  // @requires should be on an entity type, and we only support object types right now
  const entityType = edge.head.type as ObjectType;

  // In general, we should do like for an edge, and create a new group _for the current subgraph_
  // that depends on the createdGroups and have the created groups depend on the current one.
  // However, we can be more efficient in general (and this is expected by the user) because
  // required fields will usually come just after a key edge (at the top of a fetch group).
  // In that case (when the path is exactly 1 typeCast), we can put the created groups directly
  // as dependency of the current group, avoiding to create a new one. Additionally, if the
  // group we're coming from is our "direct parent", we can merge it to said direct parent (which
  // effectively means that the parent group will collect the provides before taking the edge
  // to our current group).
  if (!group.isTopLevel && path.length == 1 && path[0].kind === 'FragmentElement') {
    // We start by computing the groups for the conditions. We do this using a copy of the current
    // group (with only the inputs) as that allows to modify this copy without modifying `group`.
    const originalInputs = group.clonedInputs()!;
    const newGroup = dependencyGraph.newKeyFetchGroup(group.subgraphName, group.mergeAt!);
    newGroup.addInputs(originalInputs.forRead());

    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, newGroup, mergeAt, path);
    if (createdGroups.length == 0) {
      // All conditions were local. Just merge the newly created group back in the current group (we didn't need it)
      // and continue.
      group.mergeIn(newGroup, path);
      return [group, mergeAt, path];
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
    const newGroupIsUseless = newGroup.inputs!.contains(newGroup.selection);
    const parents = dependencyGraph.dependencies(group);
    const pathInParent = dependencyGraph.pathInParent(group);
    const unmergedGroups = [];
    if (newGroupIsUseless) {
      // We can remove `newGroup` and attach `createdGroups` as dependencies of `group`'s parents. That said,
      // as we do so, we check if one/some of the created groups can be "merged" into the parent
      // directly (assuming we have only 1 parent, it's the same subgraph/mergeAt and we known the path in this parent).
      // If it can, that essentially means that the requires could have been fetched directly from the parent,
      // and that will likely be common.
      for (const created of createdGroups) {
        // Note that pathInParent != undefined implies that parents is of size 1
        if (pathInParent
          && created.subgraphName === parents[0].subgraphName
          && sameMergeAt(created.mergeAt, group.mergeAt)
        ) {
          parents[0].mergeIn(created, pathInParent);
        } else {
          // We move created from depending on `newGroup` to depend on all of `group`'s parents.
          created.removeDependencyOn(newGroup);
          created.addDependencyOn(parents);
          unmergedGroups.push(created);
        }
      }

      // We know newGroup is useless and nothing should depend on it anymore, we can remove it.
      dependencyGraph.remove(newGroup);
    } else {
      // There is things in `newGroup`, let's merge them in `group` (no reason not to). This will
      // make the created groups depend on `group`, which we want.
      group.mergeIn(newGroup, path);

      // The created group depend on `group` and the dependency cannot be moved to the parent in
      // this case. However, we might still be able to merge some created group directly in the
      // parent. But for this to be true, we should essentially make sure that the dependency
      // on `group` is not a "true" dependency. That is, if the created group inputs are the same
      // as `group` inputs (and said created group is the same subgraph than then parent of
      // `group`, then it means we're only depending on value that are already in the parent and
      // we merge the group).
      for (const created of createdGroups) {
        // Note that pathInParent != undefined implies that parents is of size 1
        if (pathInParent
          && created.subgraphName === parents[0].subgraphName
          && sameMergeAt(created.mergeAt, group.mergeAt)
          && originalInputs.forRead().contains(created.inputs!)
        ) {
          parents[0].mergeIn(created, pathInParent);
        } else {
          unmergedGroups.push(created);
        }
      }
    }

    // If we've merged all the created groups, the all provides are handled _before_ we get to the
    // current group, so we can "continue" with the current group (and we remove the useless `newGroup`).
    if (unmergedGroups.length == 0) {
      // We still need to add the stuffs we require though (but `group` already has a key in its inputs,
      // we don't need one).
      group.addInputs(inputsForRequire(dependencyGraph.federatedQueryGraph, entityType, edge, false)[0]);
      return [group, mergeAt, path];
    }

    // If we get here, it means the @require needs the information from `createdGroups` _and_ those
    // rely on some information from the current `group`. So we need to create a new group that
    // depends on all the created groups and return that.
    const postRequireGroup = dependencyGraph.newKeyFetchGroup(group.subgraphName, group.mergeAt!);
    postRequireGroup.addDependencyOn(unmergedGroups);
    const [inputs, newPath] = inputsForRequire(dependencyGraph.federatedQueryGraph, entityType, edge);
    // The post-require group needs both the inputs from `group` (the key to `group` subgraph essentially, and the additional requires conditions)
    postRequireGroup.addInputs(inputs);
    return [postRequireGroup, mergeAt, newPath];
  } else {
    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, group, mergeAt, path);
    // If we didn't created any group, that means the whole condition was fetched from the current group
    // and we're good.
    if (createdGroups.length == 0) {
      return [group, mergeAt, path];
    }
    // We need to create a new group, on the same subgraph `group`, where we resume fetching the field for
    // which we handle the @requires _after_ we've delt with the `requiresConditionsGroups`.
    // Note that we know the conditions will include a key for our group so we can resume properly.
    const newGroup = dependencyGraph.newKeyFetchGroup(group.subgraphName, mergeAt);
    newGroup.addDependencyOn(createdGroups);
    const [inputs, newPath] = inputsForRequire(dependencyGraph.federatedQueryGraph, entityType, edge);
    debug.log(`Trying to add ${inputs} to ${newGroup}`);
    newGroup.addInputs(inputs);
    return [newGroup, mergeAt, newPath];
  }
}

function inputsForRequire(graph: QueryGraph, entityType: ObjectType, edge: Edge, includeKeyInputs: boolean = true): [Selection, OperationPath] {
  const typeCast = new FragmentElement(entityType, entityType.name);
  const fullSelectionSet = new SelectionSet(entityType);
  fullSelectionSet.add(new FieldSelection(new Field(entityType.typenameField()!)));
  fullSelectionSet.mergeIn(edge.conditions!);
  if (includeKeyInputs) {
    const keyCondition = getLocallySatisfiableKey(graph, edge.head);
    assert(keyCondition, () => `Due to @require, validation should have required a key to be present for ${edge}`);
    fullSelectionSet.mergeIn(keyCondition);
  }
  return [selectionOfElement(typeCast, fullSelectionSet), [typeCast]];
}

const representationsVariable = new Variable('representations');
function representationsVariableDefinition(schema: Schema): VariableDefinition {
  const anyType = schema.type('_Any');
  assert(anyType, `Cannot find _Any type in schema`);
  const representationsType = new NonNullType(new ListType(new NonNullType(anyType)));
  return new VariableDefinition(schema, representationsVariable, representationsType);
}

function operationForEntitiesFetch(
  subgraphSchema: Schema,
  selectionSet: SelectionSet,
  allVariableDefinitions: VariableDefinitions,
  fragments?: NamedFragments
): Operation {
  const variableDefinitions = new VariableDefinitions();
  variableDefinitions.add(representationsVariableDefinition(subgraphSchema));
  variableDefinitions.addAll(allVariableDefinitions.filter(selectionSet.usedVariables()));

  const queryType = subgraphSchema.schemaDefinition.rootType('query');
  assert(queryType, `Subgraphs should always have a query root (they should at least provides _entities)`);

  const entities = queryType.field('_entities');
  assert(entities, `Subgraphs should always have the _entities field`);

  const entitiesCall: SelectionSet = new SelectionSet(queryType);
  entitiesCall.add(new FieldSelection(
    new Field(entities, { 'representations': representationsVariable }, variableDefinitions),
    selectionSet
  ));

  return new Operation('query', entitiesCall, variableDefinitions).optimize(fragments);
}

// Wraps the given nodes in a ParallelNode or SequenceNode, unless there's only
// one node, in which case it is returned directly. Any nodes of the same kind
// in the given list have their sub-nodes flattened into the list: ie,
// flatWrap('Sequence', [a, flatWrap('Sequence', b, c), d]) returns a SequenceNode
// with four children.
function flatWrap(
  kind: ParallelNode['kind'] | SequenceNode['kind'],
  nodes: PlanNode[],
): PlanNode {
  assert(nodes.length !== 0, 'programming error: should always be called with nodes');
  if (nodes.length === 1) {
    return nodes[0];
  }
  return {
    kind,
    nodes: nodes.flatMap(n => (n.kind === kind ? n.nodes : [n])),
  };
}

function operationForQueryFetch(
  rootKind: SchemaRootKind,
  selectionSet: SelectionSet,
  allVariableDefinitions: VariableDefinitions,
  fragments?: NamedFragments
): Operation {
  return new Operation(rootKind, selectionSet, allVariableDefinitions.filter(selectionSet.usedVariables())).optimize(fragments);
}
