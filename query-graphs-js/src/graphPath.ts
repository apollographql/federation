import { assert, Field, FragmentElement, InterfaceType, NamedType, OperationElement, possibleRuntimeTypes, Schema, SchemaRootKind, SelectionSet, isLeafType, baseType, parseSelectionSet, CompositeType, isAbstractType } from "@apollo/core";
import { OpPathTree, traversePathTree } from "./pathTree";
import { Vertex, QueryGraph, Edge, RootVertex, isRootVertex, isFederatedGraphRootType, QueryGraphState } from "./querygraph";
import { Transition } from "./transition";

/**
 * An immutable path in a query graph.
 *
 * Path is mostly understood in the graph theoretical sense of the term, that is as "a connnected series of edges"
 * and a `GraphPath` is generated by traversing a graph query.
 * However, as query graph edges may have conditions, a `GraphPath` also records, for reach edges it is composed of,
 * the set of paths (an `OpPathTree` in practice) that were taken to fullfill the edge conditions (when the edge has
 * one).
 *
 * Additionally, for each edge of the path, a `GraphPath` records the "trigger" that made the traversal take that
 * edge. In practice, the "trigger" can be seen as a way to decorate a path with some additional metadata for each
 * elements of the path. In practice, that trigger is used in 2 main ways (corresponding to our 2 main query graph
 * traversals):
 *  - for composition validation, the traversal of the federated query graph is driven by other transitions into the
 *    supergraph API query graphs (essentially, composition validation is aboud finding, for every supergraph API
 *    query graph path, a "matching" traversal of the federated query graph). In that case, for the graph paths
 *    we build on the federated query graph, the "trigger" will be one of the `Transition` from the supergraph
 *    API graph (which, granted, will be fairly similar to the one of the edge we're taking in the federated query
 *    graph; in practice, triggers are more useful in the query planning case).
 *  - for query planning, the traversal of the federated query graph is driven by the elements of the query we are
 *    planning. Which means that the "trigger" for taking an edge in this case will be an `OperationElement`
 *    (or null). See the specialized `OpGraphPath` that is defined for this use case.
 *
 * Lastly, some `GraphPath` can actually encode "null" edges: this is used during query planning in the (rare)
 * case where the query we plan for has fragment spread without type condition (or a "useless" one, on that doesn't
 * restrict the possible types anymore than they already were) but with some directives. In that case, we want
 * to preserve the information about the directive (to properly rebuild query plans later) but it doesn't correspond
 * to taking any edges, so we add a "null" edge and use the trigger to store the fragment spread.
 *
 * @param TTrigger - the type of the paths "triggers", metadata that can associated to each element of the path (see
 *   above for more details).
 * @param RV - the type of the vertex starting the path. This simply default to `Vertex` but is used in `RootPath`/`OpRootPath`
 *   to easily distinguish those paths that starts from a root of a query graph.
 * @param TNullEdge - typing information to indicate whether the path can have "null" edges or not. Either `null` (
 *   meaning that the path may have null edges) or `never` (the path cannot have null edges).
 */
export class GraphPath<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never> {
  private constructor(
    /** The query graph of which this is a path. */
    readonly graph: QueryGraph,
    /** The vertex at which the path starts (the head vertex of the first edge in path, aliased here for convenience). */
    readonly root: RV,
    /** The vertex at which the path stops (the tail vertex of the last edge in path, aliased here for convenience). */
    readonly tail: Vertex,
    /** The triggers associated to each edges in the paths (see `GraphPath` for more details on triggers). */
    private readonly edgeTriggers: readonly TTrigger[],
    /** The edges (stored by edge index) composing the path. */
    private readonly edgeIndexes: readonly (number | TNullEdge)[],
    /**
     * For each edge in the path, if the edge has conditions, the set of paths that fullfill that condition.
     * Note that no matter which kind of traversal we are doing, fullfilling the conditions is always driven by
     * the conditions themselves, and as conditions are a graphQL result set, the resulting set of paths are
     * `OpGraphPath` (and as they are all rooted at the edge head vertex, we use the `OpPathTree` representation
     * for that set of paths).
     */
    private readonly edgeConditions: readonly (OpPathTree | null)[],
  ) {
  }

  /**
   * Creates a new (empty) path starting at the provided vertex.
   */
  static create<TTrigger, RV extends Vertex = Vertex, TNullEdge extends null | never = never>(
    graph: QueryGraph,
    root: RV
  ): GraphPath<TTrigger, RV, TNullEdge> {
    return new GraphPath(graph, root, root, [], [], []);
  }

  /**
   * Creates a new (empty) path starting from the root vertex in `graph` corresponding to the provide `rootKind`.
   */
  static fromGraphRoot<TTrigger, TNullEdge extends null | never = never>(
    graph: QueryGraph,
    rootKind: SchemaRootKind
  ): RootPath<TTrigger, TNullEdge> | undefined {
    const root = graph.root(rootKind);
    return root ? this.create(graph, root) : undefined;
  }

  /**
   * The size of the path, that is the number of edges composing it.
   *
   * Note that this only the "main" edges composing the path: some of those edges may have conditions for which the
   * path will also store the "sub-paths" necessary to fullfill said conditions, but the edges of those sub-paths are
   * _not_ counted here.
   */
  get size(): number {
    return this.edgeIndexes.length;
  }

  /**
   * The elements of the path, that is its edges accompagnied by the edge trigger and potential conditions paths.
   */
  *elements(): Generator<[Edge | TNullEdge, TTrigger, OpPathTree | null], void, undefined> {
    let vertex: Vertex = this.root;
    for (let i = 0; i < this.size; i++) {
      const edge = this.edgeAt(i, vertex);
      yield [edge, this.edgeTriggers[i], this.edgeConditions[i]];
      if (edge) {
        vertex = edge.tail;
      }
    }
  }

  /**
   * The last edge in the path (if it isn't empty).
   */
  lastEdge(): Edge | TNullEdge | undefined {
    let vertex: Vertex = this.root;
    let edge = undefined;
    for (let i = 0; i < this.size; i++) {
      edge = this.edgeAt(i, vertex);
      if (edge) {
        vertex = edge.tail;
      }
    }
    return edge;
  }

  /**
   * Creates the new path corresponding to appending to this path the provided `edge`.
   *
   * @param trigger - the trigger for taking the edge in the created path.
   * @param edge - the edge to add (which may be 'null' if this type of path allows it, but if it isn't should be an out-edge
   *   for `s.tail`).
   * @param conditions - Paths necessary to fullfill `edge` conditions, if `edge` has conditions. Note that this is optional, both
   *   because not all edges have conditions, but also because we allow building a path that don't callect it's condition paths.
   *   This is the case during composition validation for instance, where we do validate that the condition can be fullfill, but
   *   don't bother collecting the corresponding paths as it is not used later).
   * @returns the newly created path.
   */
  add(trigger: TTrigger, edge: Edge | TNullEdge, conditions?: OpPathTree): GraphPath<TTrigger, RV, TNullEdge> {
    assert(!edge || this.tail.index === edge.head.index, () => `Cannot add edge ${edge} to path ending at ${this.tail}`);
    assert(!edge || edge.conditions || !conditions, () => `Shouldn't have conditions paths (got ${conditions}) for edge without conditions (edge: ${edge})`);
    return new GraphPath(
      this.graph,
      this.root,
      edge ? edge.tail : this.tail,
      [...this.edgeTriggers, trigger],
      [...this.edgeIndexes, (edge ? edge.index : null) as number | TNullEdge],
      [...this.edgeConditions, conditions ?? null]
    );
  }

  /**
   * Creates a new path corresponding to concatenating the provide path _after_ this path.
   *
   * @param tailPath - the path to concatenate at the end of this path. That path must start on the vertex at which
   *   this path ends.
   * @returns the newly created path.
   */
  concat(tailPath: GraphPath<TTrigger, Vertex, TNullEdge>): GraphPath<TTrigger, RV, TNullEdge> {
    assert(this.tail.index === tailPath.root.index, () => `Cannot concat ${tailPath} after ${this}`);
    return new GraphPath(
      this.graph,
      this.root,
      tailPath.tail,
      this.edgeTriggers.concat(tailPath.edgeTriggers),
      this.edgeIndexes.concat(tailPath.edgeIndexes),
      this.edgeConditions.concat(tailPath.edgeConditions)
    );
  }

  /**
   * The set of edges that may legally continue this path.
   */
  nextEdges(): readonly Edge[] {
    return this.graph.outEdges(this.tail);
  }

  /**
   * Whether the path is terminal, that is ends on a terminal vertex.
   */
  isTerminal() {
    return this.graph.isTerminal(this.tail);
  }

  /**
   * Whether this path is a `RootPath`, that is one whose starting vertex is one of the underlying query graph root.
   */
  isRootPath(): this is RootPath<TTrigger, TNullEdge> {
    return isRootVertex(this.root);
  }

  mapMainPath<T>(mapper: (e: Edge | TNullEdge, pathIdx: number) => T): T[] {
    const result = new Array(this.size);
    let v: Vertex = this.root;
    for (let i = 0; i < this.size; i++) {
      const edge = this.edgeAt(i, v);
      result[i] = mapper(edge, i);
      if (edge) {
        v = edge.tail;
      }
    }
    return result;
  }

  private edgeAt(index: number, v: Vertex): Edge | TNullEdge {
    const edgeIdx = this.edgeIndexes[index];
    return (edgeIdx !== null ? this.graph.outEdge(v, edgeIdx) : null) as Edge | TNullEdge;
  }

  reduceMainPath<T>(reducer: (accumulator: T, edge: Edge | TNullEdge, pathIdx: number) => T, initialValue: T): T {
    let value = initialValue;
    let v: Vertex = this.root;
    for (let i = 0; i < this.size; i++) {
      const edge = this.edgeAt(i, v);
      value = reducer(value, edge, i);
      if (edge) {
        v = edge.tail;
      }
    }
    return value;
  }

  /**
   * Whether the path forms a cycle on the its end vertex, that is if the end vertex of this path has already been encountered earlier in the path.
   */
  hasJustCycled(): boolean {
    if (this.root.index == this.tail.index) {
      return true;
    }
    let v: Vertex = this.root;
    // We ignore the last edge since it's the one leading to the current vertex.
    for (let i = 0; i < this.size - 1; i++) {
      const edge = this.edgeAt(i, v);
      if (!edge) {
        continue;
      }
      v = edge.tail;
      if (v.index == this.tail.index) {
        return true;
      }
    }
    return false;
  }

  /**
   * Whether any of the edge in the path has associated conditions paths.
   */
  hasAnyEdgeConditions(): boolean {
    return this.edgeConditions.some(c => c !== null);
  }

  toString(): string {
    const pathStr = this.mapMainPath(edge => edge ? ` --[${edge.label()}](${edge.index})--> ${edge.tail}` : ' -- <null> ').join('');
    return `${this.root}${pathStr}`;
  }
}

/**
 * A `GraphPath` that starts on a vertex that is a root vertex (of the query graph of which this is a path).
 */
export type RootPath<TTrigger, TNullEdge extends null | never = never> = GraphPath<TTrigger, RootVertex, TNullEdge>;

/**
 * A `GraphPath` whose triggers are `OperationElement` (essentially meaning that the path has been guided by a graphQL query).
 */
export type OpGraphPath<RV extends Vertex = Vertex> = GraphPath<OperationElement | null, RV, null>;

/**
 * An `OpGraphPath` that starts on a vertex that is a root vertex (of the query graph of which this is a path).
 */
export type OpRootPath = OpGraphPath<RootVertex>;

export function traversePath(
  path: GraphPath<any>,
  onEdges: (edge: Edge) => void
){
  for (const [edge, _, conditions] of path.elements()) {
    if (conditions) {
      traversePathTree(conditions, onEdges);
    }
    onEdges(edge);
  }
}

// Note: conditions resolver should return `null` if the condition cannot be satisfied. If it is satisfied, it has the choice of computing
// the actual tree, which we need for query planning, or simply returning "undefined" which means "The condition can be satisfied but I didn't
// bother computing a tree for it", which we use for simple validation.


// Returns undefined if there is no way to advance the path with this transition. Otherwise, it returns a list of options (paths) we can be in after advancing the transition.
// The lists of options can be empty, which has the special meaning that the transition is guaranteed to have no results (it corresponds to unsatisfiable conditions),
// meaning that as far as composition validation goes, we can ignore that transition (and anything that follows) and otherwise continue.
export function advancePathWithTransition<V extends Vertex>(
  subgraphPath: GraphPath<Transition, V>,
  transition: Transition,
  targetType: NamedType,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  cache: QueryGraphState<GraphPath<Transition>[]>,
  excludedNonCollectingEdges: ExcludedEdges = []
) : GraphPath<Transition, V>[] | undefined {
  // The `transition` comes from the supergraph. Now, it is possible that a transition can be expressed on the supergraph, but correspond
  // to an 'unsatisfiable' condition on the subgraph. Let's consider:
  // - Subgraph A:
  //    type Query {
  //       get: [I]
  //    }
  //
  //    interface I {
  //      k: Int
  //    }
  //
  //    type T1 implements I @key(fields: "k") {
  //      k: Int
  //      a: String
  //    }
  //
  //    type T2 implements I @key(fields: "k") {
  //      k: Int
  //      b: String
  //    }
  //
  // - Subgraph B:
  //    interface I {
  //      k: Int
  //    }
  //
  //    type T1 implements I @key(fields: "k") {
  //      k: Int
  //      myself: I
  //    }
  //
  // On the resulting supergraph, we will have a path for:
  //   {
  //     get {
  //       ... on T1 {
  //         myself {
  //           ... on T2 {
  //             b
  //           }
  //         }
  //       }
  //     }
  //   }
  //
  // However, as we compute possible subgraph paths, the `myself` field will get us
  // in subgraph `B` through `T1`'s key. But then, as we look at transition `... on T2`
  // from subgraph `B`, we have no such type/transition. But this does not mean that
  // the subgraphs shouldn't compose. What it really means is that the corresponding
  // query above can be done, but is guaranteed to never return anything (essentially,
  // we can query subgraph 'B' but will never get a `T2` so the result of the query
  // should be empty).
  //
  // So we need to handle this case and we do this first. Note that the only kind of
  // transition that can give use this is a 'DownCast' transition.
  if (transition.kind === 'DownCast') {
    // If we consider a 'downcast' transition, it means that the target of that cast is composite, but also that the
    // last type of the subgraph path also is (that type is essentially the "source" of the cast).
    const supergraphRuntimeTypes = possibleRuntimeTypes(targetType as CompositeType);
    const subgraphRuntimeTypes = possibleRuntimeTypes(subgraphPath.tail.type as CompositeType);
    const intersection = supergraphRuntimeTypes.filter(t1 => subgraphRuntimeTypes.some(t2 => t1.name === t2.name)).map(t => t.name);
    // if we intersection is empty, it means whatever field got us here can never resolve into an object of the type we're casting
    // into. Essentially, we're good building a plan for this transition and whatever comes next: it'll just return nothing.
    if (intersection.length === 0) {
      return [];
    }
  }

  let options = advancePathWithDirectTransition(subgraphPath, transition, targetType.name, conditionResolver);
  // If we can fullfill the transition directly (without taking an edge) and the target type is "terminal", then there is
  // no point in computing all the options.
  if (options.length > 0 && isLeafType(targetType)) {
    return options;
  }
  // Otherwise, let's try non-collecting edges and see if we can find some (more) options there.
  const pathsWithNonCollecting = advancePathWithNonCollectingAndTypePreservingTransitions(subgraphPath, conditionResolver, excludedNonCollectingEdges, t => t, cache);
  if (pathsWithNonCollecting.length > 0) {
    options = options.concat(pathsWithNonCollecting.flatMap(p => advancePathWithDirectTransition(p, transition, targetType.name, conditionResolver)));
  }
  return options.length === 0 ? undefined : options;
}

// A set of excluded edges, that is a pair of a head vertex index and an edge index (since edge indexes are relative to their vertex).
export type ExcludedEdges = readonly [number, number][];

function isExcluded(edge: Edge, excluded: ExcludedEdges): boolean {
  return excluded.some(([vIdx, eIdx]) => edge.head.index === vIdx && edge.index === eIdx);
}

function addExclusion(excluded: ExcludedEdges, newExclusion: Edge): ExcludedEdges {
  return [...excluded, [newExclusion.head.index, newExclusion.index]];
}

function isPathExcluded<TTrigger, V extends Vertex, TNullEdge extends null | never = never>(
  path: GraphPath<TTrigger, V, TNullEdge>,
  excluded: ExcludedEdges
): boolean {
  for (const [e] of path.elements()) {
    if (e && isExcluded(e, excluded)) {
      return true;
    }
  }
  return false;
}

function popMin<TTrigger, V extends Vertex, TNullEdge extends null | never = never>(
  paths: GraphPath<TTrigger, V, TNullEdge>[]
): GraphPath<TTrigger, V, TNullEdge> {
  let minIdx = 0;
  let minSize = paths[0].size;
  for (let i = 1; i < paths.length; i++) {
    if (paths[i].size < minSize) {
      minSize = paths[i].size;
      minIdx = i;
    }
  }
  const min = paths[minIdx];
  paths.splice(minIdx, 1);
  return min;
}

function advancePathWithNonCollectingAndTypePreservingTransitions<TTrigger, V extends Vertex, TNullEdge extends null | never = never>(
  path: GraphPath<TTrigger, V, TNullEdge>,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  excludedEdges: ExcludedEdges,
  convertTransitionWithCondition: (transition: Transition) => TTrigger,
  cache: QueryGraphState<GraphPath<TTrigger, Vertex, TNullEdge>[]>,
): GraphPath<TTrigger, V, TNullEdge>[] {
  let cachedPaths = cache.getVertexState(path.tail);
  if (!cachedPaths) {
    // We only cache where there was no excluded edges.
    if (excludedEdges.length !== 0) {
      return advancePathWithNonCollectingAndTypePreservingTransitionsNoCache(
        path,
        conditionResolver,
        excludedEdges,
        convertTransitionWithCondition
      );
    }

    cachedPaths = advancePathWithNonCollectingAndTypePreservingTransitionsNoCache(
      GraphPath.create(path.graph, path.tail),
      conditionResolver,
      excludedEdges,
      convertTransitionWithCondition
    );
    cache.setVertexState(path.tail, cachedPaths);
  }
  if (excludedEdges.length > 0) {
    cachedPaths = cachedPaths.filter(p => isPathExcluded(p, excludedEdges));
  }
  return cachedPaths.map(p => path.concat(p));
}

function advancePathWithNonCollectingAndTypePreservingTransitionsNoCache<TTrigger, V extends Vertex, TNullEdge extends null | never = never>(
  path: GraphPath<TTrigger, V, TNullEdge>,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  excludedEdges: ExcludedEdges,
  convertTransitionWithCondition: (transition: Transition) => TTrigger,
): GraphPath<TTrigger, V, TNullEdge>[] {
  const updatedPaths = [ ];
  const typeName = isFederatedGraphRootType(path.tail.type) ? undefined : path.tail.type.name;
  const sources = [ path.tail.source ];
  const toTry = [ path ];
  let excluded = excludedEdges;
  while (toTry.length > 0) {
    // Note that through `excluded` we avoid taking the same edge from multiple options. But that means it's important we try
    // the smallest paths first. That is, if we could in theory have path A -> B and A -> C -> B, and we can do B -> D,
    // then we want to keep A -> B -> D, not A -> C -> B -> D.
    const toAdvance = popMin(toTry);
    const nextEdges =  toAdvance.nextEdges().filter(e => !e.transition.collectOperationElements);
    for (const edge of nextEdges) {
      if (isExcluded(edge, excluded)) {
        continue;
      }
      excluded = addExclusion(excluded, edge);
      // We can only take a non-collecting transition that preserves the current type (typically,
      // jumping subgraphs through a key), with the exception of the federated graph roots, where
      // the type is fake and jumping to any given subgraph is ok and desirable.
      // Also, there is no point in taking an edge that bring up to a subgraph we also reached
      // though a previous (and likely shorter) path
      if ((typeName && typeName != edge.tail.type.name) || sources.includes(edge.tail.source)) {
        continue;
      }
      sources.push(edge.tail.source);
      const [isSatisfied, conditionTree] = canSatisfyConditions(toAdvance, edge, conditionResolver, excluded);
      if (isSatisfied) {
        const updatedPath = toAdvance.add(convertTransitionWithCondition(edge.transition), edge, conditionTree);
        updatedPaths.push(updatedPath);
        toTry.push(updatedPath);
      }
    }
  }
  return updatedPaths;
}

function advancePathWithDirectTransition<V extends Vertex>(
  path: GraphPath<Transition, V>,
  transition: Transition,
  targetTypeName: string,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined
) : GraphPath<Transition, V>[] {
  return path.nextEdges().filter(e => e.matchesTransition(transition)).flatMap(edge => {
    // The edge must get us to the target type.
    if (edge.tail.type.name != targetTypeName) {
      return [];
    }
    // Additionaly, we can only take an edge if we can satisfy its conditions.
    const [isSatisfied, conditionTree] = canSatisfyConditions(path, edge, conditionResolver, []);
    return isSatisfied ? [ path.add(transition, edge, conditionTree) ] : [];
  });
}

export function requireEdgeAdditionalConditions(edge: Edge): SelectionSet {
  // We need to add _one_ of the current entity key as condition. We pick the first one we find,
  // which is not perfect, as maybe we can't satisfy that key but we could another, but this ensure
  // query planning later knows which keys to use. We'd have to communicate that somehow otherwise.
  const type = edge.head.type as CompositeType;
  const keyDirectives = type.appliedDirectivesOf('key');
  assert(keyDirectives.length > 0, () => `We should have a require on ${edge} if ${type} has no key directive`);
  return parseSelectionSet(type, keyDirectives[0].arguments()['fields']);
}

function canSatisfyConditions<TTrigger, V extends Vertex, TNullEdge extends null | never = never>(
  path: GraphPath<TTrigger, V, TNullEdge>,
  edge: Edge,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  excludedEdges: ExcludedEdges
): [boolean, OpPathTree | undefined] {
  const conditions = edge.conditions;
  if (!conditions) {
    return [true, undefined];
  }
  let pathTree = conditionResolver(conditions, path.tail, excludedEdges);
  if (pathTree === null) {
    return [false, undefined];
  }
  const lastEdge = path.lastEdge();
  if (edge.transition.kind === 'FieldCollection'
    && lastEdge !== null
    && lastEdge?.transition.kind !== 'KeyResolution'
    && (!pathTree || pathTree.isAllInSameSubgraph())) {
    // We need to add _one_ of the current entity key as condition. We pick the first one we find,
    // which is not perfect, as maybe we can't satisfy that key but we could another, but this ensure
    // query planning later knows which keys to use ("always the first one"). We'd have to communicate
    // that somehow otherwise.
    const additionalConditions = requireEdgeAdditionalConditions(edge);
    const additionalPathTree = conditionResolver(additionalConditions, path.tail, excludedEdges);
    if (additionalPathTree === null) {
      return [false, undefined];
    }
    if (pathTree) {
      pathTree = pathTree.merge(additionalPathTree!);
    }
  }
  return [true, pathTree];
}

function isTerminalOperation(operation: OperationElement): boolean {
  return operation.kind === 'Field' && isLeafType(baseType(operation.definition.type!));
}

export type SimultaneousPaths<V extends Vertex = Vertex> = OpGraphPath<V>[];

// Returns undefined if the operation cannot be dealt with/advanced. Otherwise, it returns a list of options we can be in after advancing the operation, each option
// being a set of simultaneous paths in the subgraphs (a single path in the simple case, but type explosing may make us explore multiple paths simultaneously).
// The lists of options can be empty, which has the special meaning that the operation is guaranteed to have no results (it corresponds to unsatisfiable conditions),
// meaning that as far as query planning goes, we can just ignore the operation but otherwise continue.
export function advanceSimultaneousPathsWithOperation<V extends Vertex>(
  supergraphSchema: Schema,
  subgraphSimultaneousPaths: SimultaneousPaths<V>,
  operation: OperationElement,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  cache: QueryGraphState<OpGraphPath[]>,
  excludedNonCollectingEdges: ExcludedEdges = []
) : SimultaneousPaths<V>[] | undefined {
  let options = advanceWithOperation(supergraphSchema, subgraphSimultaneousPaths, operation, conditionResolver, cache);
  // Like with transitions, if we can find a terminal field with a direct edge, there is no point in trying to
  // take indirect paths (this is not true for non-terminal, because for those, the direct paths may be dead ends,
  // but for terminal, we're at the end so ...).
  // Similarly, if we gets options but an empty set, it means the operation correspond to unsatisfiable conditions and we
  // can essentially ignore it. So no point in trying to take non-collecting edges.
  if (options && (options.length === 0 || isTerminalOperation(operation))) {
    return options;
  }
  // If there was not valid direct path, that's ok, we'll just try with non-collecting edges.
  options = options ?? [];
  // Then adds whatever options can be obtained by taking some non-collecting edges first.
  const pathsWithNonCollecting = advanceAllWithNonCollectingAndTypePreservingTransitions(subgraphSimultaneousPaths, conditionResolver, excludedNonCollectingEdges, cache);
  for (const pathWithNonCollecting of pathsWithNonCollecting) {
    const pathWithOperation = advanceWithOperation(supergraphSchema, pathWithNonCollecting, operation, conditionResolver, cache);
    // If we can't advance the operation after that path, ignore it, it's just not an option.
    if (!pathWithOperation) {
      continue;
    }
    // advancedWithOperation can return an empty list only if the operation if a fragment with a condition that, on top of the "current" type
    // is unsatisfiable. But as we've only taken type preserving transitions, we cannot get an empty results at this point if we haven't
    // had one when testing direct transitions above (in which case we have exited the method early).
    assert(pathWithOperation.length > 0, () => `Unexpected empty options after non-collecting path ${pathWithNonCollecting} for ${operation}`);
    options = options.concat(pathWithOperation);
  }
  // At this point, if options is empty, it means we found no ways to advance the operation, so we should return undefined.
  return options.length === 0 ? undefined : options;
}

function advanceAllWithNonCollectingAndTypePreservingTransitions<V extends Vertex>(
  paths: SimultaneousPaths<V>,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  excludedEdges: ExcludedEdges,
  cache: QueryGraphState<OpGraphPath[]>,
): SimultaneousPaths<V>[] {
  const optionsForEachPaths = paths.map(p => 
    advancePathWithNonCollectingAndTypePreservingTransitions(
      p,
      conditionResolver,
      excludedEdges,
      // the transition taken by this function are non collecting transitions, so we use null as trigger.
      _t => null,
      cache
    )
  );
  // optionsForEachPaths[i] is all the possible paths we could go from paths[i]. As each paths[i] is a set of "simultaneous" paths,
  // we need to compute the cartesien product of all those results.
  return cartesianProduct(optionsForEachPaths);
}


// The result has the same meaning than in advanceSimultaneousPathsWithOperation.
function advanceWithOperation<V extends Vertex>(
  supergraphSchema: Schema,
  simultaneousPaths: SimultaneousPaths<V>,
  operation: OperationElement,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  cache: QueryGraphState<OpGraphPath[]>
): SimultaneousPaths<V>[] | undefined {
  const newPaths: SimultaneousPaths<V>[][] = [];
  for (const path of simultaneousPaths) {
    const updated = advanceOneWithOperation(supergraphSchema, path, operation, conditionResolver, cache);
    // We must be able to apply the operation on all the simultaneous paths, otherwise the whole set of simultaneous paths cannot fullfill
    // the operation and we can abort early.
    if (!updated) {
      return undefined;
    }
    if (updated.length > 0) {
      newPaths.push(updated);
    }
  }
  // Each entry of newPaths is all the options for 1 of our simultaneous path. So what we want to return is all the options
  // composed of taking one of each element of newPaths. In other words, we want the cartesian product.
  return cartesianProduct(newPaths).map(v => v.flat());
}

function cartesianProduct<V>(arr:V[][]): V[][] {
  if (arr.length === 0) {
    return [];
  }
  const first: V[] = arr[0];
  const initialAcc: V[][] = first.map(v => [v]);
  const remainder: V[][] = arr.slice(1);
  return remainder.reduce(
    (acc: V[][], val: V[]) => acc.flatMap((prod: V[]) => val.map((elt: V) => [prod, elt].flat() as V[])),
    initialAcc
  );
}

// The result has the same meaning than in advanceSimultaneousPathsWithOperation.
// We also actually need to return a set of options of simultaneous paths. Cause when we type explode, we create simultaneous paths, but
// as a field might be resolve by multiple subgraphs, we may have options created.
function advanceOneWithOperation<V extends Vertex>(
  supergraphSchema: Schema,
  path: OpGraphPath<V>,
  operation: OperationElement,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined,
  cache: QueryGraphState<OpGraphPath[]>
) : SimultaneousPaths<V>[] | undefined {
  const currentType = path.tail.type;
  if (operation.kind === 'Field') {
    switch (currentType.kind) {
      case 'ObjectType':
        // Just take the edge corresponding to the field, if it exists and can be used.
        const edge = edgeForField(path, operation);
        if (!edge) {
          return undefined;
        }
        return addFieldEdge(path, operation, edge, conditionResolver);
      case 'InterfaceType':
        // First, we check if there is a direct edge from the interface (which only happens if we're in a subgraph that knows all of the
        // implementations of that interface globally). If there is one, we always favor that (it's just always more efficient that
        // type-exploding in practice).
        const itfEdge = edgeForField(path, operation);
        if (itfEdge) {
          return addFieldEdge(path, operation, itfEdge, conditionResolver);
        }
        // Otherwise, that means we need to type explode and descend into every possible implementations (on the supergraph!)
        // and try to advance the field (which may require taking a key...).
        const supergraphType = supergraphSchema.type(currentType.name) as InterfaceType;
        const implementations = supergraphType.possibleRuntimeTypes();
        // For all implementations, We need to call advanceSimultaneousPathsWithOperation on a made-up Fragment. If any
        // gives use empty options, we bail.
        const optionsByImplems: OpGraphPath<V>[][][] = [];
        for (const implemType of implementations) {
          const castOp = new FragmentElement(supergraphType, implemType.name);
          const implemOptions = advanceSimultaneousPathsWithOperation(
            supergraphSchema,
            [path],
            castOp,
            conditionResolver,
            cache
          );
          if (!implemOptions) {
            return undefined;
          }
          // If the new fragment makes it so that we're on an unsatisfiable branch, we just ignore that implementation.
          if (implemOptions.length === 0) {
            continue;
          }
          // For each option, we call advanceSimultaneousPathsWithOperation again on our own operation (the field),
          // which gives us some options (or not and we bail).
          let withField: SimultaneousPaths<V>[] = [];
          for (const optPaths of implemOptions) {
            const withFieldOptions = advanceSimultaneousPathsWithOperation(
              supergraphSchema,
              optPaths,
              operation,
              conditionResolver,
              cache
            );
            if (!withFieldOptions) {
              continue;
            }
            // Advancing a field should never get us into an unsatisfiable condition. Only fragments can.
            assert(withFieldOptions.length > 0, () => `Unexpected unsatisfiable path after ${optPaths} for ${operation}`);
            withField = withField.concat(withFieldOptions);
          }
          // If we find no option to advance that implementation, we bail (as we need to simultaneously advance all
          // implementations).
          if (withField.length === 0) {
            return undefined;
          }
          optionsByImplems.push(withField);
        }
        return cartesianProduct(optionsByImplems).map(opt => opt.flat());
      default:
        // Only object and interfaces have fields so the query should have been flagged invalid if a field was selected on something else.
        assert(false, `Unexpected ${currentType.kind} type ${currentType} from ${path.tail} given operation ${operation}`);
    }
  } else {
    assert(operation.kind === 'FragmentElement', "Unhandled operation kind: " + operation.kind);
    if (!operation.typeCondition || currentType.name === operation.typeCondition.name) {
      // If there is no typename (or the condition is the type we're already one), it means we're essentially
      // just applying some directives (could be a @skip/@include for instance). This doesn't make us take any
      // edge, we just record the operation.
      return [[ path.add(operation, null) ]];
    }
    const typeName = operation.typeCondition.name;
    switch (currentType.kind) {
      case 'InterfaceType':
      case 'UnionType':
        // First, check if the type casted into is a runtime type of the interface/union. If so, just take
        // that edge.
        const edge = edgeForTypeCast(path, typeName);
        if (edge) {
          assert(!edge.conditions, "TypeCast collecting edges shouldn't have conditions");
          return [[path.add(operation, edge)]];
        }
        // Otherwise, checks what is the intersection between the possible runtime types of the current type
        // and the ones of the cast. We need to be able to go into all those types simultaneously.
        const supergraphCurrentType = supergraphSchema.type(currentType.name) as CompositeType;
        const parentTypes = possibleRuntimeTypes(currentType);
        const castedTypes = possibleRuntimeTypes(supergraphSchema.type(typeName) as CompositeType);
        const intersection = parentTypes.filter(t1 => castedTypes.some(t2 => t1.name === t2.name)).map(t => t.name);
        const optionsByImplems: OpGraphPath<V>[][][] = [];
        for (const tName of intersection) {
          const castOp = new FragmentElement(supergraphCurrentType, tName);
          const implemOptions = advanceSimultaneousPathsWithOperation(
            supergraphSchema,
            [path],
            castOp,
            conditionResolver,
            cache
          );
          if (!implemOptions) {
            return undefined;
          }
          // If the new fragment makes it so that we're on an unsatisfiable branch, we just ignore that implementation.
          if (implemOptions.length === 0) {
            continue;
          }
          optionsByImplems.push(implemOptions);
        }
        return cartesianProduct(optionsByImplems).map(opt => opt.flat());
      case 'ObjectType':
        // We've already handled the case of a fragment whose condition is this type. But the fragment might
        // be for either:
        // - a super-type of the current type: in which case, we're pretty much in the same case than if there
        //   were no particular condition.
        // - another, incompatible type. This can happen for a type that intersects a super-type of the
        //   current type (since graphQL allows a fragment as long as there is an intersection). In that
        //   case, the whole operation simply cannot ever return anything.
        const conditionType = supergraphSchema.type(typeName)!;
        if (isAbstractType(conditionType) && possibleRuntimeTypes(conditionType).some(t => t.name == currentType.name)) {
          return [[ path.add(operation, null) ]];
        }
        // The operation we're dealing with can never return results (the type conditions applies have no intersection).
        // This means we _can_ fullfill this operation (by doing nothing and returning an empty result), which we indicate
        // by return an empty list of options.
        return [];
      default:
        // We shouldn't have a fragment on a non-selectable type
        assert(false, `Unexpected ${currentType.kind} type ${currentType} from ${path.tail} given operation ${operation}`);
    }
  }
}

function addFieldEdge<V extends Vertex>(
  path: OpGraphPath<V>,
  fieldOperation: Field<any>,
  edge: Edge,
  conditionResolver: (conditions: SelectionSet, vertex: Vertex, excludedEdges: ExcludedEdges) => null | OpPathTree | undefined
): OpGraphPath<V>[][] {
  const [isSatisfied, conditionTree] = canSatisfyConditions(path, edge, conditionResolver, []);
  return isSatisfied ? [[ path.add(fieldOperation, edge, conditionTree) ]] : [];
}

function edgeForField<V extends Vertex>(
  path: OpGraphPath<V>,
  field: Field<any>
): Edge | undefined {
  const candidates = path.nextEdges().filter(e => e.transition.kind === 'FieldCollection' && field.selects(e.transition.definition, true));
  assert(candidates.length <= 1, () => `Vertex ${path.tail} has multiple edges matching ${field} (${candidates})`);
  return candidates.length === 0 ? undefined : candidates[0];
}

function edgeForTypeCast<V extends Vertex>(
  path: OpGraphPath<V>,
  typeName: string
): Edge | undefined {
  const candidates = path.nextEdges().filter(e => e.transition.kind === 'DownCast' && typeName === e.transition.castedType.name);
  assert(candidates.length <= 1, () => `Vertex ${path.tail} has multiple edges matching ${typeName} (${candidates})`);
  return candidates.length === 0 ? undefined : candidates[0];
}
