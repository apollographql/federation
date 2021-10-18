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
} from "@apollo/core";
import {
  advanceSimultaneousPathsWithOperation,
  Edge,
  emptyContext,
  ExcludedEdges,
  FieldCollection,
  QueryGraph,
  GraphPath,
  QueryGraphState,
  isPathContext,
  isRootPathTree,
  OpGraphPath,
  OpPathTree,
  OpRootPathTree,
  PathContext,
  PathTree,
  requireEdgeAdditionalConditions,
  RootVertex,
  Vertex,
  isRootVertex,
  ExcludedConditions,
  OpIndirectPaths,
  SimultaneousPaths
} from "@apollo/query-graphs";
import { DocumentNode, stripIgnoredCharacters, print, GraphQLError, parse } from "graphql";
import { QueryPlan, ResponsePath, SequenceNode, PlanNode, ParallelNode, FetchNode, trimSelectionNodes } from "./QueryPlan";

const debug = newDebugLogger('plan');

class State<RV extends Vertex> {
  constructor(
    readonly openPaths: [Selection, PathContext, SimultaneousPaths<RV>[]][],
    readonly closedPaths: OpPathTree<RV>
  ) {
  }

  withOpenPaths(newOpenPaths: [Selection, PathContext, SimultaneousPaths<RV>[]][]): State<RV> {
    return new State(this.openPaths.concat(newOpenPaths), this.closedPaths);
  }

  withClosedPaths(options: SimultaneousPaths<RV>[]): State<RV>[] {
    return options.map(path => new State([...this.openPaths], path.reduce((closed, p) => closed.mergePath(p), this.closedPaths)));
  }

  isTerminal(): boolean {
    return this.openPaths.length === 0;
  }

  toString(): string {
    return `OPEN\n${this.openPaths.map(([n, _, p]) => ` > ${n.element()} => ${p}`).join('\n')}\nCLOSED\n${this.closedPaths}`;
  }
}

class QueryPlanningTaversal<RV extends Vertex> {
  // The stack contains all states that aren't terminal.
  private readonly stack: State<RV>[] = [];
  private bestPlan: [FetchDependencyGraph, OpPathTree<RV>, number] | undefined;
  private readonly isTopLevel: boolean;

  constructor(
    readonly supergraphSchema: Schema,
    readonly subgraphs: QueryGraph,
    selectionSet: SelectionSet,
    readonly variableDefinitions: VariableDefinitions,
    startVertex: RV,
    readonly costFunction: CostFunction,
    private readonly cache: QueryGraphState<OpIndirectPaths>,
    private readonly excludedEdges: ExcludedEdges = [],
    private readonly excludedConditions: ExcludedConditions = [],
  ) {
    const initialPath: OpGraphPath<RV> = GraphPath.create(subgraphs, startVertex);
    const initialTree = PathTree.createOp(subgraphs, startVertex);
    const opens: [Selection, PathContext, SimultaneousPaths<RV>[]][] = selectionSet.selections().reverse().map(node => [node, emptyContext, [[initialPath]]]);
    this.stack.push(new State(opens, initialTree));
    this.isTopLevel = isRootVertex(startVertex);
  }

  private debugStack() {
    if (this.isTopLevel && debug.enabled) {
      debug.group('Query planning stack:');
      for (const [i, state] of this.stack.entries()) {
        debug.group(`State ${i}:`);
        debug.groupedValues(state.openPaths, ([n, _, p]) => `${n.element()} => ${p}`, 'OPEN');
        debug.group('CLOSED');
        debug.log(state.closedPaths.toString());
        debug.groupEnd();
        debug.groupEnd();
      }
      debug.groupEnd();
    }
  }

  findBestPlan(): [FetchDependencyGraph, OpPathTree<RV>, number] | undefined {
    while (this.stack.length > 0) {
      this.debugStack();
      this.handleState(this.stack.pop()!);
    }
    return this.bestPlan;
  }

  private handleState(state: State<RV>) {
    const [selection, context, options] = state.openPaths.pop()!;
    const operation = selection.element();
    const updatedContext = context.withContextOf(operation);
    let newOptions: SimultaneousPaths<RV>[] = [];
    for (const option of options) {
      const followupForOption = advanceSimultaneousPathsWithOperation(
        this.supergraphSchema,
        option,
        operation,
        updatedContext,
        (conditions, vertex, excludedEdges, excludedConditions) => this.resolveConditionPlan(conditions, vertex, excludedEdges, excludedConditions),
        this.cache,
        this.excludedEdges,
        this.excludedConditions
      );
      if (!followupForOption) {
        // There is no valid way to advance the current `operation` from this option, so this option is a dead branch
        // that cannot produce a valid query plan. So we simply ignore it and rely on other options.
        continue;
      }
      if (followupForOption.length === 0) {
        // This `operation` is valid from that option but is guarantee to yield no result (it's a type condition that, along
        // with prior condition, has no intersection). Given that (assuming the user do properly resolve all versions of a
        // given field the same way from all subgraphs) all options should return the same results, we know that operation
        // should return no result from all options (even if we can't provide it technically) and it's valid to just
        // ignore the operation (which we've already pop'ed from the state).
        this.onUpdatedState(state);
        return;
      }
      newOptions = newOptions.concat(followupForOption);
    }

    if (newOptions.length === 0) {
      // If we have no options, this state is just a dead-end and we can ignore it.
      return;
    }

    if (!selection.selectionSet) {
      this.onUpdatedStates(state.withClosedPaths(newOptions));
    } else {
      // We reverse the selections because we're going to pop from `openPaths` and this ensure we end up handling things in
      // the query order.
      const newOpenPaths: [Selection, PathContext, SimultaneousPaths<RV>[]][] = 
        selection.selectionSet.selections().reverse().map(node => [node, updatedContext, newOptions]);
      this.onUpdatedState(state.withOpenPaths(newOpenPaths));
    }
  }

  private onUpdatedStates(states: State<RV>[]) {
    states.forEach(s => this.onUpdatedState(s));
  }

  private onUpdatedState(state: State<RV>) {
    if (state.isTerminal()) {
      this.handleFinalPathSet(state.closedPaths);
    } else {
      this.stack.push(state);
    }
  }

  private resolveConditionPlan(conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges, excludedConditions: ExcludedConditions): [OpPathTree, number] | null {
    const bestPlan = new QueryPlanningTaversal(
      this.supergraphSchema,
      this.subgraphs,
      conditions,
      this.variableDefinitions,
      vertex,
      this.costFunction,
      this.cache,
      excludedEdges,
      excludedConditions
    ).findBestPlan();
    // Note that we want to return 'null', not 'undefined', because it's the latter that means "I cannot resolve that
    // condition" within `advanceSimultaneousPathsWithOperation`.
    return bestPlan ? [bestPlan[1], bestPlan[2]] : null;
  }

  private handleFinalPathSet(pathSet: OpPathTree<RV>) {
    const dependencyGraph = isRootPathTree(pathSet)
      ? computeRootFetchGroups(this.subgraphs.sources, pathSet)
      : computeNonRootFetchGroups(this.subgraphs.sources, pathSet);
    const cost = this.costFunction.finalize(dependencyGraph.process(this.costFunction), true);
    //if (isTopLevel) {
    //  console.log(`[PLAN] cost: ${cost}, path:\n${pathSet.toString('', true)}`);
    //}
    if (!this.bestPlan || cost < this.bestPlan[2]) {
      debug.log(() => this.bestPlan ? `Found better with cost ${cost} (previous had cost ${this.bestPlan[2]}): ${pathSet}`: `Computed plan with cost ${cost}: ${pathSet}`);
      this.bestPlan = [dependencyGraph, pathSet, cost];
    } else {
      debug.log(() => `Ignoring plan with cost ${cost} (a better plan with cost ${this.bestPlan![2]} exists): ${pathSet}`);
    }
  }
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

  operation = withoutIntrospection(operation);

  debug.group(() => `Computing plan for\n${operation}`);
  if (operation.selectionSet.isEmpty()) {
    debug.groupEnd('Empty plan');
    return { kind: 'QueryPlan' };
  }

  const root = federatedQueryGraph.root(operation.rootKind);
  assert(root, `Shouldn't have a ${operation.rootKind} operation if the subgraphs don't have a ${operation.rootKind} root`);
  const processor = fetchGroupToPlanProcessor(operation.rootKind, operation.variableDefinitions, operation.selectionSet.fragments);
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
    defaultCostFunction,
    new QueryGraphState<OpIndirectPaths>(federatedQueryGraph)
  );
  const bestPlan = planningTraversal.findBestPlan();
  if (!bestPlan) {
    throw new Error("Wasn't able to compute a valid plan. This shouldn't have happened.");
  }
  return bestPlan;
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
      prevDepGraph = computeRootFetchGroups(federatedQueryGraph.sources, prevPaths);
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
  rootKind: SchemaRootKind,
  variableDefinitions: VariableDefinitions,
  fragments?: NamedFragments
): FetchGroupProcessor<PlanNode, PlanNode, PlanNode | undefined> {
  return {
    onFetchGroup: (group: FetchGroup) => group.toPlanNode(rootKind, variableDefinitions, fragments),
    reduceParallel: (values: PlanNode[]) => flatWrap('Parallel', values),
    reduceSequence: (values: PlanNode[]) => flatWrap('Sequence', values),
    finalize: (roots: PlanNode[], rootsAreParallel) => roots.length == 0 ? undefined : flatWrap(rootsAreParallel ? 'Parallel' : 'Sequence', roots)
  };
}

function addToResponsePath(path: ResponsePath, responseName: string, type: Type) {
  path = [...path, responseName];
  while (!isNamedType(type)) {
    if (isListType(type)) {
      path.push('@');
    }
    type = type.ofType;
  }
  return path;
}

class FetchGroup {
  private readonly _selection: SelectionSet;
  private readonly _inputs?: SelectionSet;

  constructor(
    readonly dependencyGraph: FetchDependencyGraph,
    public index: number,
    readonly subgraphName: string,
    readonly parentType: CompositeType,
    readonly isEntityFetch: boolean,
    readonly mergeAt?: ResponsePath,
  ) {
    this._selection = new SelectionSet(parentType);
    this._inputs = isEntityFetch ? new SelectionSet(parentType) : undefined;
  }

  get isTopLevel(): boolean {
    return !this.mergeAt;
  }

  get selection(): SelectionSet {
    return this._selection;
  }

  get inputs(): SelectionSet | undefined {
    return this._inputs;
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
      this._inputs.mergeIn(selection);
    } else {
      this._inputs.add(selection);
    }
  }

  addSelection(path: OperationPath) {
    this._selection.addPath(path);
  }

  addSelections(selection: SelectionSet) {
    this._selection.mergeIn(selection);
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

    this._selection.mergeIn(selectionSet);
    this.dependencyGraph.onMergedIn(this, toMerge);
  }

  toPlanNode(rootKind: SchemaRootKind, variableDefinitions: VariableDefinitions, fragments?: NamedFragments) : PlanNode {
    addTypenameFieldForAbstractTypes(this.selection);

    this.selection.validate();
    if (this._inputs) {
      this._inputs.validate();
    }

    const inputs = this._inputs ? this._inputs.toSelectionSetNode() : undefined;
    // TODO: Handle internalFragments? (and collect their variables if so)

    const operation = this.isEntityFetch
      ? operationForEntitiesFetch(this.dependencyGraph.subgraphSchemas.get(this.subgraphName)!, this.selection, variableDefinitions, fragments)
      : operationForQueryFetch(rootKind, this.selection, variableDefinitions, fragments);

    const fetchNode: FetchNode = {
      kind: 'Fetch',
      serviceName: this.subgraphName,
      requires: inputs ? trimSelectionNodes(inputs.selections) : undefined,
      variableUsages: this.selection.usedVariables().map(v => v.name),
      operation: stripIgnoredCharacters(print(operation)),
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

function removeInPlace<T>(value: T, array: T[]) {
  const idx = array.indexOf(value);
  if (idx >= 0) {
    array.splice(idx, 1);
  }
}

interface FetchGroupProcessor<G, P, F> {
  onFetchGroup(group: FetchGroup): G;
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
  private readonly rootGroups: Map<string, FetchGroup> = new Map();
  private readonly groups: FetchGroup[] = [];
  private readonly adjacencies: number[][] = [];
  private readonly inEdges: number[][] = [];
  // For each groups, an optional path in its "unique" parent. If a group has more than one parent, then
  // this will be undefined. Even if the group has a unique parent, it's not guaranteed to be set.
  private readonly pathsInParents: (OperationPath | undefined)[] = [];
  private isReduced: boolean = false;

  constructor(readonly subgraphSchemas: ReadonlyMap<String, Schema>) {}

  getOrCreateRootFetchGroup(subgraphName: string, parentType: CompositeType): FetchGroup {
    let group = this.rootGroups.get(subgraphName);
    if (!group) {
      group = this.createRootFetchGroup(subgraphName, parentType);
      this.rootGroups.set(subgraphName, group);
    }
    return group;
  }

  rootSubgraphs(): string[] {
    return [...this.rootGroups.keys()];
  }

  createRootFetchGroup(subgraphName: string, parentType: CompositeType): FetchGroup {
    const group = this.newFetchGroup(subgraphName, parentType, false);
    this.rootGroups.set(subgraphName, group);
    return group;
  }

  private newFetchGroup(
    subgraphName: string,
    parentType: CompositeType,
    isEntityFetch: boolean,
    mergeAt?: ResponsePath,
    directParent?: FetchGroup,
    pathInParent?: OperationPath
  ): FetchGroup {
    this.onModification();
    const newGroup = new FetchGroup(
      this,
      this.groups.length,
      subgraphName,
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
    return this.newFetchGroup(subgraphName, entityType, true, mergeAt, directParent, pathInParent);
  }

  newQueryFetchGroup(
    subgraphName: string,
    parentType: ObjectType,
    mergeAt: ResponsePath,
    directParent: FetchGroup,
    pathInParent: OperationPath,
  ): FetchGroup {
    return this.newFetchGroup(subgraphName, parentType, false, mergeAt, directParent, pathInParent);
  }

  // Returns true if `toCheck` is either part of `conditions`, or is a dependency (potentially recursively) 
  // of one of the gorup of conditions.
  private isDependedOn(toCheck: FetchGroup, conditions: FetchGroup[]): boolean  {
    const stack = [...conditions];
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
    return this.newFetchGroup(subgraphName, entityType, true, mergeAt);
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
            const merged = new FetchGroup(this, g1.index, g1.subgraphName, g1.selection.parentType, g1.isEntityFetch, g1.mergeAt);
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

  private processGroup<G, P, F>(processor: FetchGroupProcessor<G, P, F>, group: FetchGroup): [G, UnhandledGroups] {
    const outGroups = this.outGroups(group);
    const processed = processor.onFetchGroup(group);
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
      const [node, remaining] = this.processGroup(processor, group);
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

    const rootNodes: G[] = [...this.rootGroups.values()].map(rootGroup => {
      const [node, remaining] = this.processGroup(processor, rootGroup);
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
    return [...this.rootGroups.values()].map(g => this.toStringInternal(g, "")).join('\n');
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

function computeRootFetchGroups(subgraphSchemas: ReadonlyMap<string, Schema>, pathTree: OpRootPathTree): FetchDependencyGraph {
  const dependencyGraph = new FetchDependencyGraph(subgraphSchemas);
  // The root of the pathTree is one of the "fake" root of the subgraphs graph, which belongs to no subgraph but points to each ones.
  // So we "unpack" the first level of the tree to find out our top level groups (and initialize our stack).
  // Note that we can safely ignore the triggers of that first level as it will all be free transition, and we know we cannot have conditions.
  for (const [edge, _trigger, _conditions, child] of pathTree.childElements()) {
    assert(edge !== null, `The root edge should not be null`);
    const source = edge.tail.source;
    // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
    const rootType = edge.tail.type as ObjectType;
    const group = dependencyGraph.getOrCreateRootFetchGroup(source, rootType);
    computeGroupsForTree(dependencyGraph, child, group);
  }
  return dependencyGraph;
}

function computeNonRootFetchGroups(subgraphSchemas: ReadonlyMap<string, Schema>, pathTree: OpPathTree): FetchDependencyGraph {
  const dependencyGraph = new FetchDependencyGraph(subgraphSchemas);
  const source = pathTree.vertex.source;
  // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
  const rootType = pathTree.vertex.type;
  assert(isCompositeType(rootType), () => `Should not have condition on non-selectable type ${rootType}`);
  const group = dependencyGraph.getOrCreateRootFetchGroup(source, rootType);
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

  const schema = type.schema()!;
  // We add the first include/skip to the current typeCast and then wrap in additional type-casts for the next ones
  // if necessary. Note that we use type-casts (... on <type>), but, outside of the first one, we could well also
  // use fragments with no type-condition. We do the former mostly to preverve older behavior, but doing the latter
  // would technically procude slightly small query plans.
  const [name0, ifs0] = context.directives[0];
  typeCast.applyDirective(schema.directive(name0)!, { 'if': ifs0 });

  for (let i = 1; i < context.directives.length; i++) {
    let [name, ifs] = context.directives[i];
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
            group.addSelection([...path, new Field((edge.head.type as CompositeType).typenameField()!)]);

            stack.push([child, newGroup, mergeAt, newPath]);
          } else {
            assert(edge.transition.kind === 'QueryResolution', () => `Unexpected non-collecting edge ${edge}`);
            assert(!conditions, () => `Query resolution edge ${edge} should not have conditions`);

            assert(isObjectType(edge.head.type) && isObjectType(edge.tail.type), () => `Expected an objects for the vertices of ${edge}`);
            const type = edge.tail.type;
            assert(type === type.schema()!.schemaDefinition.rootType('query'), () => `Expected ${type} to be the root query type, but that is ${type.schema()!.schemaDefinition.rootType('query')}`);

            // We're querying a field `q` of a subgraph, get the query type, and follow with a query on another
            // subgraph. But that mean that on the original subgraph, we may not have added _any_ selection for
            // type `q` and that make the query to the original subgraph invalid. To avoid this, we request the
            // __typename field.
            group.addSelection([...path, new Field((edge.head.type as CompositeType).typenameField()!)]);

            // We take the edge, creating a new group. Note that we always create a new group because this
            // correspond to jumping subgraph after a field returned the query root type, and we want to
            // preserve this ordering somewhat (debatable, possibly).
            const newGroup = dependencyGraph.newQueryFetchGroup(edge.tail.source, type, mergeAt, group, path);
            const newPath = createNewFetchSelectionContext(type, undefined, operation)[1];
            stack.push([child, newGroup, mergeAt, newPath]);
          }
        } else if (edge === null) {
          // A null edge means that the operation does nothing but may contain directives to preserve.
          // If it does contains directives, we preserve the operation, otherwise, we just skip it
          // as a minor optimization (it makes the query slighly smaller, but on complex queries, it
          // might also deduplicate similar selections).
          const newPath = operation.appliedDirectives.length === 0 ? path : [...path, operation];
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
          stack.push([child, updatedGroup, newMergeAt, [...updatedPath, operation]]);
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
    const originalInputs = group.inputs!.clone();
    const newGroup = dependencyGraph.newKeyFetchGroup(group.subgraphName, group.mergeAt!);
    newGroup.addInputs(originalInputs);

    let createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, newGroup, mergeAt, path);
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
          && originalInputs.contains(created.inputs!)
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
      group.addInputs(inputsForRequire(entityType, edge, false)[0]);
      return [group, mergeAt, path];
    }

    // If we get here, it means the @require needs the information from `createdGroups` _and_ those
    // rely on some information from the current `group`. So we need to create a new group that
    // depends on all the created groups and return that.
    const postRequireGroup = dependencyGraph.newKeyFetchGroup(group.subgraphName, group.mergeAt!);
    postRequireGroup.addDependencyOn(unmergedGroups);
    let [inputs, newPath] = inputsForRequire(entityType, edge);
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
    let [inputs, newPath] = inputsForRequire(entityType, edge);
    newGroup.addInputs(inputs);
    return [newGroup, mergeAt, newPath];
  }
}

function inputsForRequire(entityType: ObjectType, edge: Edge, includeKeyInputs: boolean = true): [Selection, OperationPath] {
  const typeCast = new FragmentElement(entityType, entityType.name);
  const fullSelectionSet = new SelectionSet(entityType);
  fullSelectionSet.add(new FieldSelection(new Field(entityType.typenameField()!)));
  fullSelectionSet.mergeIn(edge.conditions!);
  if (includeKeyInputs) {
    fullSelectionSet.mergeIn(requireEdgeAdditionalConditions(edge));
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
): DocumentNode {
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

  return operationToDocument(new Operation('query', entitiesCall, variableDefinitions).optimize(fragments));
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
): DocumentNode {
  const operation = new Operation(rootKind, selectionSet, allVariableDefinitions.filter(selectionSet.usedVariables())).optimize(fragments);
  return operationToDocument(operation);
}
