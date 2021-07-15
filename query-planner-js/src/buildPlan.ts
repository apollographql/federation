import { assert, FragmentElement, FragmentSelection, isListType, isNamedType, isSelectableType, ObjectType, Operation, OperationPath, Schema, SelectableType, Selection, SelectionSet, selectionSetOfPath, Type } from "@apollo/core";
import { advanceSimultaneousPathsWithOperation, Edge, ExcludedEdges, FieldCollection, Graph, GraphPath, isRootVertex, OpGraphPath, OpPathTree, PathTree, requireEdgeAdditionalConditions, Vertex } from "@apollo/query-graphs";
import deepEqual from "deep-equal";
import { SelectionSetNode, Kind, DocumentNode, VariableDefinitionNode, OperationTypeNode, stripIgnoredCharacters, print } from "graphql";
import { QueryPlan, ResponsePath, SequenceNode, PlanNode, ParallelNode, FetchNode, trimSelectionNodes } from "./QueryPlan";

class State<RV extends Vertex> {
  constructor(
    readonly openPaths: [Selection, OpGraphPath<RV>[]][],
    readonly closedPaths: OpPathTree<RV>
  ) {
  }

  addPaths(selections: SelectionSet | undefined, paths: OpGraphPath<RV>[]): State<RV> {
    if (!selections) {
      const newState = new State([...this.openPaths], paths.reduce((closed, p) => closed.mergePath(p), this.closedPaths));
      return newState;
    } else {
      const newOpenPaths: [Selection, OpGraphPath<RV>[]][] = [...selections.selections()].map(node => [node, paths]);
      const newState = new State(this.openPaths.concat(newOpenPaths), this.closedPaths);
      return newState;
    }
  }

  isTerminal(): boolean {
    return this.openPaths.length === 0;
  }

  toString(indent: string = ""): string {
    return `open: [${this.openPaths.map(([n, p]) => `${n.element()} => ${p}`)}]\n${indent}closed: [${this.closedPaths.toString(indent + '    ')}]`;
  }
}

class QueryPlanningTaversal<RV extends Vertex> {
  // The stack contains all states that aren't terminal.
  private readonly stack: State<RV>[] = [];
  private bestPlan: [FetchDependencyGraph, OpPathTree<RV>, number] | undefined;

  constructor(
    readonly supergraphSchema: Schema,
    readonly subgraphs: Graph,
    selectionSet: SelectionSet,
    startVertex: RV,
    readonly costFunction: CostFunction,
    readonly rootGroupsAreParallel: boolean,
    private readonly excludedEdges: ExcludedEdges = [],
    readonly isTopLevel: boolean = true
  ) {
    const initialPath: OpGraphPath<RV> = GraphPath.create(subgraphs, startVertex);
    const initialTree = PathTree.createOp(subgraphs, startVertex);
    const opens: [Selection, OpGraphPath<RV>[]][] = [...selectionSet.selections()].map(node => [node, [initialPath]]);
    this.stack.push(new State(opens, initialTree));
  }

  //private dumpStack(message?: string) {
  //  if (!this.isTopLevel) {
  //    return;
  //  }
  //  if (message) console.log(message);
  //  for (const state of this.stack) {
  //    console.log(` - ${state.toString('   ')}`);
  //  }
  //}

  findBestPlan(): [FetchDependencyGraph, OpPathTree<RV>, number] | undefined {
    //this.dumpStack("Initial state");
    while (this.stack.length > 0) {
      //this.dumpStack("Current State:");
      this.handleState(this.stack.pop()!);
    }
    return this.bestPlan;
  }

  private handleState(state: State<RV>) {
    const [selection, path] = state.openPaths.pop()!;
    const trigger = selection.element();
    const newPaths = advanceSimultaneousPathsWithOperation(
      this.supergraphSchema,
      path,
      trigger,
      (conditions, vertex, excluded) => this.resolveConditionPlan(conditions, vertex, excluded),
      this.excludedEdges
    );
    for (const possiblePath of newPaths) {
      const updatedState = state.addPaths(selection.selectionSet, possiblePath);
      if (updatedState.isTerminal()) {
        this.handleFinalPathSet(updatedState.closedPaths);
      } else {
        this.stack.push(updatedState);
      }
    }
  }

  private resolveConditionPlan(conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges): OpPathTree | null {
    const bestPlan = new QueryPlanningTaversal(this.supergraphSchema, this.subgraphs, conditions, vertex, this.costFunction, true, excludedEdges, false).findBestPlan();
    // Note that we want to return 'null', not 'undefined', because it's the latter that means "I cannot resolve that
    // condition" within `advanceSimultaneousPathsWithOperation`.
    return bestPlan ? bestPlan[1] : null;
  }

  private handleFinalPathSet(pathSet: OpPathTree<RV>) {
    const dependencyGraph = computeFetchGroups(pathSet);
    const cost =  dependencyGraph.process(this.costFunction, this.rootGroupsAreParallel);
    //if (isRootVertex(pathSet.vertex)) {
    //  console.log(`[PLAN] cost: ${cost}, path: ${pathSet}`);
    //}
    if (!this.bestPlan || cost < this.bestPlan[2]) {
      this.bestPlan = [dependencyGraph, pathSet, cost];
    }
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

type CostFunction = FetchGroupProcessor<number, number[]>;

const fetchCost = 1000;
const pipeliningCost = 10;

const defaultCostFunction: CostFunction = {
  onFetchGroup: (_group: FetchGroup) => 1,
  reduceParallel: (values: number[]) => values,
  // That math goes the following way:
  // - we add the costs in a sequence (the `acc + ...`)
  // - within a stage of the sequence, the groups are done in parallel, hence the `Math.max(...)`
  // - but each group in a stage require a fetch, so we add a cost proportional to how many we have
  // - each group within a stage has its own cost plus a flat cost associated to doing that fetch (`fetchCost + s`).
  // - lastly, we also want to minimize the number of steps in the pipeline, so later stages are more costly (`idx * pipelineCost`)
  reduceSequence: (values: (number[] | number)[]) => values.reduceRight(
    (acc: number, value, idx) => {
      const valueArray = Array.isArray(value) ? value : [value];
      return acc + (idx * pipeliningCost) * (fetchCost * valueArray.length) *  Math.max(...valueArray)
    },
    0
  ),
  finalize: (roots: number[], rootsAreParallel: boolean) => rootsAreParallel ? Math.max(...roots) : sum(roots)
};

export function computeQueryPlan(supergraphSchema: Schema, subgraphs: Graph, operation: Operation): QueryPlan {
  const root = subgraphs.root(operation.rootKind);
  assert(root, `Shouldn't have a ${operation.rootKind} operation if the subgraphs don't have a ${operation.rootKind} root`);
  const planningTraversal = new QueryPlanningTaversal(
    supergraphSchema,
    subgraphs,
    operation.selectionSet,
    root,
    defaultCostFunction,
    operation.rootKind !== 'mutation'
  );
  const bestPlan = planningTraversal.findBestPlan();
  if (!bestPlan) {
    throw new Error("Wasn't able to compute a valid plan. This shouldn't have happened.");
  }
  const dependencyGraph: FetchDependencyGraph = bestPlan[0];
  return toQueryPlan(operation.rootKind, dependencyGraph);
}

function fetchGroupToPlanProcessor(operationKind: OperationTypeNode): FetchGroupProcessor<PlanNode, PlanNode> {
  return {
    onFetchGroup: (group: FetchGroup) => group.toPlanNode(operationKind),
    reduceParallel: (values: PlanNode[]) => flatWrap('Parallel', values),
    reduceSequence: (values: PlanNode[]) => flatWrap('Sequence', values),
    finalize: (roots: PlanNode[], rootsAreParallel) => flatWrap(rootsAreParallel ? 'Parallel' : 'Sequence', roots)
  };
}

function toQueryPlan(operationKind: OperationTypeNode, dependencyGraph: FetchDependencyGraph): QueryPlan {
  const rootNode = dependencyGraph.process(fetchGroupToPlanProcessor(operationKind), operationKind !== 'mutation');
  return { kind: 'QueryPlan', node: rootNode };
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
    readonly parentType: SelectableType,
    readonly mergeAt?: ResponsePath,
    readonly directParent?: FetchGroup,
    readonly pathInParent?: OperationPath
  ) {
    assert(
      ((mergeAt === undefined) === (directParent === undefined)) && ((directParent === undefined) === (pathInParent === undefined)),
      `mergeAt, directParent and pathInParent should all be provided for non-root fetch groups, got [${mergeAt}, ${directParent}, ${pathInParent}]`);
    this._selection = new SelectionSet(parentType);
    this._inputs = mergeAt ? new SelectionSet(parentType) : undefined;
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

  mergeIn(toMerge: FetchGroup, mergePath: OperationPath) {
    assert(!toMerge.isTopLevel, `Shouldn't merge top level group ${toMerge} into ${this}`);
    // Note that because toMerge is not top-level, the first "level" of it's selection is going to be a typeCast into the entity type
    // used to get to the group (because the entities() operation, which is called, returns the _Entity and _needs_ type-casting).
    // But when we merge-in, the type cast can be skipped.
    const selectionSet = selectionSetOfPath(mergePath, endOfPathSet => {
      assert(endOfPathSet, `Merge path ${mergePath} ends on a non-selectable type`);
      for (const typeCastSel of toMerge.selection.selections()) {
        assert(typeCastSel instanceof FragmentSelection, `Unexpected field selection ${typeCastSel} at top-level of ${toMerge} selection.`);
        endOfPathSet.mergeIn(typeCastSel.selectionSet);
      }
    });

    this._selection.mergeIn(selectionSet);
    this.dependencyGraph.onMergedIn(this, toMerge);
  }

  toPlanNode(operationKind: OperationTypeNode) : PlanNode {
    const selections = this._selection.toSelectionSetNode();
    const inputs = this._inputs ? this._inputs.toSelectionSetNode() : undefined;
    // TODO: handle variable usages.
    //const variableUsages = context.getVariableUsages(
    //  selectionSet,
    //  internalFragments,
    //);

    const operation = this.isTopLevel
      ? operationForRootFetch(selections, operationKind)
      : operationForEntitiesFetch(selections);

    const fetchNode: FetchNode = {
      kind: 'Fetch',
      serviceName: this.subgraphName,
      requires: inputs ? trimSelectionNodes(inputs.selections) : undefined,
      //variableUsages: Object.keys(variableUsages),
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

function removeInPlace(value: number, array: number[]) {
  const idx = array.indexOf(value);
  if (idx >= 0) {
    array.splice(idx, 1);
  }
}

interface FetchGroupProcessor<G, P> {
  onFetchGroup(group: FetchGroup): G;
  reduceParallel(values: G[]): P;
  reduceSequence(values: (G | P)[]): G;
  finalize(roots: G[], isParallel: boolean): G
}

type UnhandledGroups = [FetchGroup, UnhandledInEdges][];
type UnhandledInEdges = number[];

class FetchDependencyGraph {
  private readonly rootGroups: Map<string, FetchGroup> = new Map();
  private readonly groups: FetchGroup[] = [];
  private readonly adjacencies: number[][] = [];
  private readonly inEdges: number[][] = []

  constructor() {}

  getOrCreateRootFetchGroup(subgraphName: string, parentType: SelectableType): FetchGroup {
    let group = this.rootGroups.get(subgraphName);
    if (!group) {
      group = this.newFetchGroup(subgraphName, parentType);
      this.rootGroups.set(subgraphName, group);
    }
    return group;
  }

  newFetchGroup(
    subgraphName: string,
    parentType: SelectableType,
    mergeAt?: ResponsePath,
    directParent?: FetchGroup,
    pathInParent?: OperationPath
  ): FetchGroup {
    const newGroup = new FetchGroup(
      this,
      this.groups.length,
      subgraphName,
      parentType,
      mergeAt,
      directParent,
      pathInParent
    );
    this.groups.push(newGroup);
    this.adjacencies.push([]);
    this.inEdges.push([]);
    if (directParent) {
      this.addEdge(directParent.index, newGroup.index);
    }
    return newGroup;
  }

  addDependency(dependentGroup: FetchGroup, dependentOn: FetchGroup | FetchGroup[]) {
    const groups = Array.isArray(dependentOn) ? dependentOn : [ dependentOn ];
    for (const group of groups) {
      this.addEdge(group.index, dependentGroup.index);
    }
  }

  private addEdge(from: number, to: number) {
    if (!this.adjacencies[from].includes(to)) {
      this.adjacencies[from].push(to);
      this.inEdges[to].push(from);
    }
  }

  onMergedIn(mergedInto: FetchGroup, merged: FetchGroup) {
    assert(!merged.isTopLevel, "Shouldn't remove top level groups");
    // First, we relocale the removed groups dependents. That is, every group that depended on
    // `merged` will now depend on `mergedInto`. 
    for (const dependentIdx of this.adjacencies[merged.index]) {
      this.addEdge(mergedInto.index, dependentIdx);
      // While at it, we also remove the in-edge of the dependent to `merged` if it exists.
      const idxInIns = this.inEdges[dependentIdx].indexOf(merged.index);
      if (idxInIns >= 0) {
        this.inEdges[dependentIdx].splice(idxInIns, 1);
      }
    }
    // We also remove `merged` from any it depends on 
    for (const dependedIdx of this.inEdges[merged.index]) {
      const idxInAdj = this.adjacencies[dependedIdx].indexOf(merged.index);
      this.adjacencies[dependedIdx].splice(idxInAdj, 1);
    }
    // We then remove the entries for the merged group from our arrays.
    this.groups.splice(merged.index, 1);
    this.adjacencies.splice(merged.index, 1);
    this.inEdges.splice(merged.index, 1);

    // But now, every group index above `merge.index` is one-off.
    this.groups.forEach(g => {
      if (g.index > merged.index) {
        --g.index;
      }
    });
    this.adjacencies.forEach(adj => { adj.forEach((v, i) => { 
      if (v > merged.index) {
        adj[i] = v - 1;
      }
    })});
    this.inEdges.forEach(ins => { ins.forEach((v, i) => { 
      if (v > merged.index) {
        ins[i] = v - 1;
      }
    })});
  }

  // Do a transitive reduction (https://en.wikipedia.org/wiki/Transitive_reduction) of the graph
  // We keep it simple and do a DFS from each vertex. The complexity is not amazing, but dependency
  // graphs between fetch groups will almost surely never be huge and query planning performance
  // is not paramount so this is almost surely "good enough".
  reduce() {
    for (const group of this.groups) {
      for (const adjacent of this.adjacencies[group.index]) {
        this.dfsRemoveRedundantEdges(group.index, adjacent);
      }
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

  private processGroup<G, P>(processor: FetchGroupProcessor<G, P>, group: FetchGroup): [G, UnhandledGroups] {
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

  private processParallelGroups<G, P>(
    processor: FetchGroupProcessor<G, P>,
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

  process<G, P>(processor: FetchGroupProcessor<G, P>, rootsAreParallel: boolean): G {
    this.reduce();

    const rootNodes: G[] = [...this.rootGroups.values()].map(rootGroup => {
      const [node, remaining] = this.processGroup(processor, rootGroup);
      assert(remaining.length == 0, `A root group should have no remaining groups unhandled`);
      return node;
    });

    return processor.finalize(rootNodes, rootsAreParallel);
  }

  dumpOnConsole() {
    console.log(`Groups: [${this.groups.join(', ')}]`);
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

function computeFetchGroups<RV extends Vertex>(pathTree: OpPathTree<RV>): FetchDependencyGraph {
  const dependencyGraph = new FetchDependencyGraph();
  if (isRootVertex(pathTree.vertex)) {
    // The root of the pathTree is one of the "fake" root of the subgraphs graph, which belongs to no subgraph but points to each ones.
    // So we "unpack" the first level of the tree to find out our top level groups (and initialize our stack).
    // Note that we can safely ignore the triggers of that first level as it will all be free transition, and we know we cannot have conditions.
    for (const [edge, _trigger, _conditions, child] of pathTree.childElements()) {
      assert(edge !== null, `The root edge should not be null`);
      const source = edge.tail.source;
      // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
      const rootType = edge.tail.type as ObjectType;
      let group = dependencyGraph.getOrCreateRootFetchGroup(source, rootType);
      computeGroupsForTree(dependencyGraph, child, group);
    }
  } else {
    const source = pathTree.vertex.source;
    // The edge tail type is one of the subgraph root type, so it has to be an ObjectType.
    const rootType = pathTree.vertex.type;
    assert(isSelectableType(rootType), `Should not have condition on non-selectable type ${rootType}`);
    let group = dependencyGraph.getOrCreateRootFetchGroup(source, rootType);
    computeGroupsForTree(dependencyGraph, pathTree, group);
  }
  return dependencyGraph;
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
      for (const [edge, operation, conditions, child] of tree.childElements()) {
        if (operation === null) {
          // The only 2 cases where we can take edge not "driven" by an operation is either when we resolve a key, or
          // at the root of subgraph graph, but we've already handled the later at the beginning of `computeFetchGroups`
          // so it must be a key resolution.
          assert(edge !== null, `Unexpected 'null' edge with no trigger at ${path}`);
          assert(edge.transition.kind === 'KeyResolution', `Unexpected non-collecting edge ${edge}`);
          assert(conditions, `Key edge ${edge} should have some conditions paths`);
          assert(edge.head.source !== edge.tail.source, `Key edge ${edge} should change the underlying subgraph`);
          // First, we need to ensure we fetch the conditions from the current group.
          const groupsForConditions = computeGroupsForTree(dependencyGraph, conditions, group, mergeAt, path);
          // Then we can "take the edge", creating a new group. That group depends
          // on the condition ones.
          const type = edge.tail.type as SelectableType; // We shouldn't have a key on a non-selectable type
          const newGroup = dependencyGraph.newFetchGroup(edge.tail.source, type, mergeAt, group, path);
          createdGroups.push(newGroup);
          // The new group depends on the current group but 'newFetchGroup' already handled that.
          newGroup.addDependencyOn(groupsForConditions);
          const typeCast = new FragmentElement(type, type.name);
          newGroup.addInputs(new FragmentSelection(typeCast, edge.conditions!));
          stack.push([child, newGroup, mergeAt, [typeCast]]);
        } else if (edge === null) {
          // The only case that should yield no edge right now is a fragment with no type condition.
          assert(operation.kind === 'FragmentElement' && !operation.typeCondition, `Unexpected null edge for operation ${operation}`);
          // The fragment only matters for the sake of the directives it may have on it, but doesn't change anything else.
          stack.push([child, group, mergeAt, [...path, operation]]);
        } else {
          assert(edge.head.source === edge.tail.source, `Collecting edge ${edge} for ${operation} should not change the underlying subgraph`)
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
  // that depends on the createdGroups. However, we can be more efficient in general (and this is
  // expected by the user) because required fields will usually come just after a key edge (at
  // the top of a fetch group).
  // In that case (when the path is exactly 1 typeCast), we can put the created groups directly
  // as depdency of the current group, avoiding to created a new one. Additionally, if the
  // group we're coming from is our "direct parent", we can merge it to said direct parent (which
  // effectively means that the parent group will collect the provides before taking the edge
  // to our current group).
  if (!group.isTopLevel && path.length == 1 && path[0].kind === 'FragmentElement') {
    const newGroup = dependencyGraph.newFetchGroup(group.subgraphName, entityType, group.mergeAt, group.directParent, group.pathInParent);
    newGroup.addInputs(group.inputs!.clone());

    const createdGroups = computeGroupsForTree(dependencyGraph, requiresConditions, newGroup, mergeAt, path);
    if (createdGroups.length == 0) {
      // All conditions were local. Just merge the newly created group back in the current group and continue.
      group.mergeIn(newGroup, path);
      return [group, mergeAt, path];
    }
    const typeCast = new FragmentElement(entityType, entityType.name);
    group.addInputs(new FragmentSelection(typeCast, edge.conditions));
    group.addDependencyOn(newGroup);

    const parent = newGroup.directParent!;
    for (const created of createdGroups) {
      // We can merge the created group into our parent only if 1) it's a group for the same subgraph but also 2)
      // the group starts at the same level we are currently. Basically, this means that our requires needed
      // fields coming from our parent field, so we can get those directly from said parent field _before_
      // getting to our own group.
      if (created.subgraphName === parent.subgraphName && deepEqual(created.mergeAt, group.mergeAt)) {
        parent.mergeIn(created, newGroup.pathInParent!);
        // When we do so, it's possible that the requires that can be done directly in the parent where
        // our only @requires. If so, `newGroup` will be a useless step. Namely, we'll jump from the
        // `newGroup` to immediately jump back to the parent. We recognize that situation when
        //   1) `newGroup` only depends on the parent and
        //   2) `newGroup` inputs are equal to its selection (meaning, we got some key as input and
        //       we're reusing the exact same key to jump back). That later condition is not perfect
        //       because in the present of multiple keys between `newGroup` and its parent, we could
        //       theoretically take a different key on the way in that on the way back, and we could
        //       still remove `newGroup` but we won't: but this would more complex to check and it's
        //       sufficiently unlikely to happpen that we ignore that "optimization" for now. If
        //       someone run into this and notice, we can optimize then.
        // Note that a group will at least depend on it's direct parent, so we just check that it has
        // only one dependency.
        if (dependencyGraph.dependencies(newGroup).length == 1 && newGroup.selection.equals(newGroup.inputs!)) {
          // As far as updating the dependency graph, merging newGroup into its parent is the same as removing it.
          dependencyGraph.onMergedIn(parent, newGroup);
        }
      } else {
        group.addDependencyOn(created);
      }
    }
    return [group, mergeAt, path];
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
    const newGroup = dependencyGraph.newFetchGroup(group.subgraphName, entityType, mergeAt, group, path);
    newGroup.addDependencyOn(createdGroups);
    const typeCast = new FragmentElement(entityType, entityType.name);
    const fullSelectionSet = new SelectionSet(entityType);
    fullSelectionSet.mergeIn(edge.conditions!);
    fullSelectionSet.mergeIn(requireEdgeAdditionalConditions(edge));
    newGroup.addInputs(new FragmentSelection(typeCast, fullSelectionSet));
    return [newGroup, mergeAt, [typeCast]];
  }
}

function operationForEntitiesFetch(
  selectionSet: SelectionSetNode,
  //variableUsages: VariableUsages
  //internalFragments: Set<FragmentDefinitionNode>,
): DocumentNode {
  const representationsVariable = {
    kind: Kind.VARIABLE,
    name: { kind: Kind.NAME, value: 'representations' },
  };

  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation: 'query',
        variableDefinitions: ([
          {
            kind: Kind.VARIABLE_DEFINITION,
            variable: representationsVariable,
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.LIST_TYPE,
                type: {
                  kind: Kind.NON_NULL_TYPE,
                  type: {
                    kind: Kind.NAMED_TYPE,
                    name: { kind: Kind.NAME, value: '_Any' },
                  },
                },
              },
            },
          },
        ] as VariableDefinitionNode[]),
        //.concat(
        //  mapFetchNodeToVariableDefinitions(variableUsages),
        //),
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [
            {
              kind: Kind.FIELD,
              name: { kind: Kind.NAME, value: '_entities' },
              arguments: [
                {
                  kind: Kind.ARGUMENT,
                  name: {
                    kind: Kind.NAME,
                    value: representationsVariable.name.value,
                  },
                  value: representationsVariable,
                },
              ],
              selectionSet,
            },
          ],
        },
      },
      //...internalFragments,
    ],
  };
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

function operationForRootFetch(
  selectionSet: SelectionSetNode,
  //variableUsages: VariableUsages
  //internalFragments: Set<FragmentDefinitionNode>,
  operation: OperationTypeNode
): DocumentNode {
  return {
    kind: Kind.DOCUMENT,
    definitions: [
      {
        kind: Kind.OPERATION_DEFINITION,
        operation,
        selectionSet,
        //variableDefinitions: mapFetchNodeToVariableDefinitions(variableUsages),
      },
      //...internalFragments,
    ],
  };
}
