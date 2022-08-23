import {
  assert,
  MultiMap,
  InterfaceType,
  isInterfaceType,
  isFed1Supergraph,
  isObjectType,
  isUnionType,
  NamedType,
  ObjectType,
  Schema,
  SchemaRootKind,
  Type,
  UnionType,
  baseType,
  SelectionSet,
  isFederationSubgraphSchema,
  CompositeType,
  extractSubgraphsFromSupergraph,
  FieldDefinition,
  isCompositeType,
  parseFieldSetArgument,
  AbstractType,
  isAbstractType,
  possibleRuntimeTypes,
  MapWithCachedArrays,
  mapKeys,
  firstOf,
  FEDERATION_RESERVED_SUBGRAPH_NAME,
  federationMetadata,
  FederationMetadata,
  DirectiveDefinition,
} from '@apollo/federation-internals';
import { inspect } from 'util';
import { DownCast, FieldCollection, subgraphEnteringTransition, SubgraphEnteringTransition, Transition, KeyResolution, RootTypeResolution } from './transition';
import { preComputeNonTrivialFollowupEdges } from './nonTrivialEdgePrecomputing';

// We use our federation reserved subgraph name to avoid risk of conflict with other subgraph names (wouldn't be a huge
// deal, but safer that way). Using something short like `_` is also on purpose: it makes it stand out in debug messages
// without taking space.
export const FEDERATED_GRAPH_ROOT_SOURCE = FEDERATION_RESERVED_SUBGRAPH_NAME;
const FEDERATED_GRAPH_ROOT_SCHEMA = new Schema();

export function federatedGraphRootTypeName(rootKind: SchemaRootKind): string {
  return `[${rootKind}]`;
}

export function isFederatedGraphRootType(type: NamedType) {
  return type.name.startsWith('[') && type.name.endsWith(']');
}

/**
 * A vertex of a query graph, which points to a type (definition) in a particular graphQL schema (the `source` being
 * an identifier for that schema).
 *
 * @see QueryGraph
 */
export class Vertex {
  constructor(
    /** Index used for this vertex in the query graph it is part of. */
    readonly index: number,
    /** The graphQL type the vertex points to. */
    readonly type: NamedType,
    /**
     * An identifier of the underlying schema containing the `type` this vertex points to.
     * This is mainly used in "federated" query graphs, where the `source` is a subgraph name.
     */
    readonly source : string
  ) {}

  toString(): string {
    return `${this.type}(${this.source})`;
  }
}

/**
 * A "root" `Vertex`, that is a vertex that one of the root of a query graph.
 *
 * @see Vertex
 * @see QueryGraph.roots
 */
export class RootVertex extends Vertex {
  constructor(
    readonly rootKind: SchemaRootKind,
    index: number,
    type: NamedType,
    source : string
  ) {
    super(index, type, source);
  }

  toString(): string {
    return super.toString() + '*';
  }
}

function toRootVertex(vertex: Vertex, rootKind: SchemaRootKind): RootVertex {
  return new RootVertex(rootKind, vertex.index, vertex.type, vertex.source);
}

export function isRootVertex(vertex: Vertex): vertex is RootVertex {
  return vertex instanceof RootVertex;
}

/**
 * An edge of a query graph.
 *
 * Query graphs are directed and an edge goes from its `head` vertex to its `tail` one.
 * Edges also have additional metadata: their `transition` and, optionally, `conditions`.
 */
export class Edge {
  private _conditions?: SelectionSet;

  constructor(
    /**
     * Index used for this edge in the query graph it is part of (note that this index is "scoped" within
     * the head vertex, meaning that if 2 different vertices of the same query graph both have a single
     * out-edge, then both of those edges have index 0, and if a vertex has 3 out-edges, their index will
      * be 0, 1 and 2).
     */
    public readonly index: number,
    /**
     * The vertex from which the edge starts.
     */
    public readonly head: Vertex,
    /**
     * The vertex on which the edge ends.
     */
    public readonly tail: Vertex,
    /**
     * Indicates what kind of edges this is and what the edges does/represents.
     * For instance, if the edge represents a field, the `transition` will be a `FieldCollection` transition
     * and will link to the definition of the field it represents.
     *
     * @see Transition
     */
    public readonly transition: Transition,
    /**
     * Optional conditions on an edge.
     *
     * Conditions are a select of selections (in the graphQL sense) that the traversal of a query graph
     * needs to "collect" (traverse edges with transitions corresponding to those selections) in order
     * to be able to collect that edge.
     *
     * Conditions are primarily used for edges corresponding to @key, in which case they correspond
     * to the fields composing the key. In other words, for a key edges, conditions basically represents
     * the fact that you need the key to be able to use a key edge.
     *
     * Outside of keys, @requires also rely on conditions.
     */
    conditions?: SelectionSet,
  ) {
    // Edges are meant to be immutable once a query graph is fully built. More precisely,
    // the whole query graph must be immutable once constructed since the query planner reuses
    // it for buiding multiple plans.
    // To ensure it/avoid hard-to-find bugs, we freeze the conditions (and because the caller might
    // not expect that this method freezes its input, we clone first), which ensure that if we add
    // them to another selection set during query planning, they will get automatically cloned first
    // (and thus this instance will not be modified). This fixes #1750 in particular and should
    // avoid such issue in the future.
    this._conditions = conditions?.clone()?.freeze();
  }

  get conditions(): SelectionSet | undefined {
    return this._conditions;
  }

  isEdgeForField(name: string): boolean {
    return this.transition.kind === 'FieldCollection' && this.transition.definition.name === name;
  }

  matchesSupergraphTransition(otherTransition: Transition): boolean {
    assert(otherTransition.collectOperationElements, "Supergraphs shouldn't have transition that don't collect elements");
    const transition = this.transition;
    switch (transition.kind) {
      case 'FieldCollection': return otherTransition.kind === 'FieldCollection' && transition.definition.name === otherTransition.definition.name;
      case 'DownCast': return otherTransition.kind === 'DownCast' && transition.castedType.name === otherTransition.castedType.name;
      default: return false;
    }
  }

  label(): string {
    if (this.transition instanceof SubgraphEnteringTransition && !this._conditions) {
      return "";
    }
    return this._conditions ? `${this._conditions} ⊢ ${this.transition}` : this.transition.toString();
  }

  withNewHead(newHead: Vertex): Edge {
    return new Edge(
      this.index,
      newHead,
      this.tail,
      this.transition,
      this._conditions
    );
  }

  addToConditions(newConditions: SelectionSet) {
    // As mentioned in the ctor, we freeze the conditions to avoid unexpected modifications once a query
    // graph has bee fully built (this method is called _during_ the building, so can still mutate the
    // edge freely). Which means we need to clone any existing conditions (so we can modify them), and need
    // to re-freeze the result afterwards.
    this._conditions = this._conditions
      ? this._conditions.clone()
      : new SelectionSet(this.head.type as CompositeType);
    this._conditions.mergeIn(newConditions);
    this._conditions.freeze();
  }

  isKeyOrRootTypeEdgeToSelf(): boolean {
    return this.head === this.tail && (this.transition.kind === 'KeyResolution' || this.transition.kind === 'RootTypeResolution');
  }

  toString(): string {
    return `${this.head} -> ${this.tail} (${this.label()})`;
  }
}

/**
 * An immutable directed graph data structure (built of vertices and edges) that is layered over one or multiple
 * graphQL schema, that aims to facilitate reasoning about queries expressed on the underlying schema.
 *
 * On top of its set of vertices and edges, a query graph exposes:
 *  - its set of "sources": pointers to the graphQL schema on which the query graph was built.
 *  - a set of distinguished vertices called "root" vertices. A query graph has at most one root
 *    vertex per `SchemaRootKind`, and those vertices are usually entry points for traversals of
 *    a query graph.
 *
 * In practice, the code builds 2 "kind" of query graphs:
 *  1. a supergraph query graph, which is built on top of a supergraph API schema (@see buildGraph()),
 *     and is built to reason about user queries (made on the supergraph API). This supergraph query
 *     graph is used to validate composition.
 *  2. a "federated" query graph, which is a single graph built on top of a) a number of subgraph
 *    API schema and b) the additional federation directives on those subgraphs (@see buildFederatedQueryGraph()).
 *    This query graph is used both for validating composition and for query planning.
 *
 * Note that this class handles both cases, but a "supergraph query graph" will, by construction, have
 * a few more invariants than a "federated query graph". Including (but not necessarily limited to):
 *  - edges in a super graph query graph will never have `conditions` or 'key' edges (edges with a `KeyResolution` edges).
 *  - supergraph query graphs will have a single value in `sources` (the supergraph schema).
 *
 * Also note that as query graphs are about reasoning about queries over schema, they only contain vertices
 * that points to "reachable" types (reachable from any kind of operations).
 */
export class QueryGraph {
  /**
   * Given an edge, returns the possible edges that can follow it "productively", that is without creating
   * a trivially inefficient path.
   *
   * More precisely, `nonTrivialFollowupEdges(e)` is equivalent calling `outEdges(e.tail)` and filtering
   * the edges that "never make sense" after `e`, which mainly amounts to avoiding chaining key edges
   * when we know there is guaranteed to be a better option. As an example, suppose we have 3 subgraphs
   * A, B and C which all defined a `@key(fields: "id")` on some entity type `T`. Then it is never
   * interesting to take that key edge from B -> C after A -> B because if we're in A and want to get
   * to C, we can always do A -> C (of course, this is only true because it's the "same" key).
   *
   * See `preComputeNonTrivialFollowupEdges` for more details on which exact edges are filtered.
   *
   * Lastly, note that the main reason for exposing this method is that its result is pre-computed.
   * Which in turn is done for performance reasons: having the same key defined in multiple subgraphs
   * is _the_ most common pattern, and while our later algorithms (composition validation and query
   * planning) would know to not select those trivially inefficient "detour", they might have to redo
   * those checks many times and pre-computing once it is significantly faster (and pretty easy).
   * Fwiw, when originally introduced, this optimization lowered composition validation on a big
   * composition (100+ subgraphs) from ~4 "minutes" to ~10 seconds.
   */
  readonly nonTrivialFollowupEdges: (edge: Edge) => readonly Edge[];

  /**
   * Creates a new query graph.
   *
   * This isn't meant to be be called directly outside of `GraphBuilder.build`.
   */
  constructor(
    /** A name to identify the graph. Mostly for pretty-printing/debugging purpose. */
    readonly name: string,
    /** The vertices of the query graph. The index of each vertex in the array will be the value of its `Vertex.index` value. */
    readonly vertices: Vertex[],
    /**
    * For each vertex, the edges that originate from that array. This array has the same length as `vertices` and `adjacencies[i]`
    * is an array of all the edges starting at vertices[i].
    */
    private readonly adjacencies: Edge[][],
    /**
     * A map that associate type names of the underlying schema on which this query graph was built to each of the vertex
     * (vertex index) that points to a type of that name. Note that in a "supergraph query graph", each type name will only
     * map to a single vertex,
     */
    private readonly typesToVertices: MultiMap<string, number>,
    /** The set of distinguished root vertices (pointers to vertices in `vertices`), keyed by their kind.  */
    private readonly rootVertices: MapWithCachedArrays<SchemaRootKind, RootVertex>,
    /**
     * The sources on which the query graph was built, that is a set (which can be of size 1) of graphQL schema keyed by
     * the name identifying them. Note that the `source` string in the `Vertex` of a query graph is guaranteed to be
     * valid key in this map.
     */
    readonly sources: ReadonlyMap<string, Schema>
  ) {
    this.nonTrivialFollowupEdges = preComputeNonTrivialFollowupEdges(this);
  }

  /** The number of vertices in this query graph. */
  verticesCount(): number {
    return this.vertices.length;
  }

  /** The number of edges in this query graph. */
  edgesCount(): number {
    // We could count edges as we add them and pass it to the ctor. For now though, it's not meant to be
    // on a hot path, so recomputing is probably fine.
    return this.adjacencies.reduce((acc, v) => acc + v.length, 0);
  }

  /**
   * The set of `SchemaRootKind` for which this query graph has a root vertex (for
   * which `root(SchemaRootKind)` will _not_ return `undefined`).
   */
  rootKinds(): readonly SchemaRootKind[] {
    return this.rootVertices.keys();
  }

  /**
   * The set of root vertices in this query graph.
   */
  roots(): readonly RootVertex[] {
    return this.rootVertices.values();
  }

  /**
   * The root vertex corresponding to the provided root kind, if this query graph has one.
   *
   * @param kind - the root kind for which to get the root vertex.
   * @returns the root vertex for `kind` if this query graph has one.
   */
  root(kind: SchemaRootKind): RootVertex | undefined {
    return this.rootVertices.get(kind);
  }

  /**
   * The edges out of the provided vertex.
   *
   * @param vertex - the vertex for which to return out edges. This method _assumes_ that
   *   the provided vertex is a vertex of this query graph (and its behavior is undefined
   *   if it isn't).
   * @param includeKeyAndRootTypeEdgesToSelf - whether key/root type edges that stay on the same
   *  vertex should be included. This default to `false` are those are rarely useful. More
   *   precisely, the only current use of them is for @defer where they may be needed to re-enter
   *   the current subgraph in a deferred section.
   * @returns the list of all the edges out of this vertex.
   */
  outEdges(vertex: Vertex, includeKeyAndRootTypeEdgesToSelf: boolean = false): readonly Edge[] {
    const allEdges = this.adjacencies[vertex.index];
    return includeKeyAndRootTypeEdgesToSelf ? allEdges : allEdges.filter((e) => !e.isKeyOrRootTypeEdgeToSelf())
  }

  /**
   * The number of edges out of the provided vertex.
   *
   * This is a shortcut for `this.outEdges(vertex, true).length`, and the reason it considers
   * edge-to-self by default while `this.outEdges` doesn't is that this method is generally
   * used to size other arrays indexed by edges index, and so we want to consider all edges
   * in general.
   */
  outEdgesCount(vertex: Vertex): number {
    return this.adjacencies[vertex.index].length;
  }

  /**
   * The edge out of the provided vertex at the provided (edge) index.
   *
   * @param vertex - the vertex for which to return the out edge. This method _assumes_ that
   *   the provided vertex is a vertex of this query graph (and its behavior is undefined
   *   if it isn't).
   * @param edgeIndex - the edge index (relative to `vertex`, see `Edge.index`) to retrieve.
   * @returns the `edgeIndex`^th edge out of `vertex`, if such edges exists.
   */
  outEdge(vertex: Vertex, edgeIndex: number): Edge | undefined {
    return this.adjacencies[vertex.index][edgeIndex];
  }

  /**
   * Whether the provided vertex is a terminal one (has no out edges).
   *
   * @param vertex - the vertex to check.
   * @returns whether the provided vertex is terminal.
   */
  isTerminal(vertex: Vertex): boolean {
    return this.outEdgesCount(vertex) === 0;
  }

  /**
   * The set of vertices whose associated type (see `Vertex.type`) is of type `typeName`.
   */
  verticesForType(typeName: string): Vertex[] {
    const indexes = this.typesToVertices.get(typeName);
    return indexes == undefined ? [] : indexes.map(i => this.vertices[i]);
  }
}

/**
 * A utility class that allows to associate state to the vertices and/or edges of a query graph.
 *
 * @param VertexState - the type of the state associated to vertices.
 * @param EdgeState - the type of the state associated to edges. Defaults to `undefined`, which
 *   means that state is only associated to vertices.
 */
export class QueryGraphState<VertexState, EdgeState = undefined> {
  // Store some "user" state for each vertex (accessed by index)
  private readonly verticesStates: (VertexState | undefined)[];
  private readonly adjacenciesStates: (EdgeState | undefined)[][];

  /**
   * Creates a new `QueryGraphState` to associate state to the vertices and/or edges of `graph`.
   */
  constructor(readonly graph: QueryGraph) {
    this.verticesStates = new Array(graph.verticesCount());
    this.adjacenciesStates = new Array(graph.verticesCount());
  }

  /**
   * Associates the provided state to the provided vertex.
   *
   * @param vertex - the vertex to which state should be associated. This method _assumes_
   *    that the provided vertex is a vertex of the query graph against which this
   *    `QueryGraphState` was created (and its behavior is undefined if it isn't).
   * @param state - the state/value to associate to `vertex`.
   */
  setVertexState(vertex: Vertex, state: VertexState) {
    this.verticesStates[vertex.index] = state;
  }

  /**
   * Removes the state associated to the provided vertex (if any is).
   *
   * @param vertex - the vertex for which state should be removed. This method _assumes_
   *    that the provided vertex is a vertex of the query graph against which this
   *    `QueryGraphState` was created (and its behavior is undefined if it isn't).
   */
  removeVertexState(vertex: Vertex) {
    this.verticesStates[vertex.index] = undefined;
  }

  /**
   * Retrieves the state associated to the provided vertex (if any is).
   *
   * @param vertex - the vertex for which state should be retrieved. This method _assumes_
   *    that the provided vertex is a vertex of the query graph against which this
   *    `QueryGraphState` was created (and its behavior is undefined if it isn't).
   * @return the state associated to `vertex`, if any.
   */
  getVertexState(vertex: Vertex): VertexState | undefined {
    return this.verticesStates[vertex.index];
  }

  /**
   * Associates the provided state to the provided edge.
   *
   * @param edge - the edge to which state should be associated. This method _assumes_
   *    that the provided edge is an edge of the query graph against which this
   *    `QueryGraphState` was created (and its behavior is undefined if it isn't).
   * @param state - the state/value to associate to `edge`.
   */
  setEdgeState(edge: Edge, state: EdgeState) {
    if (!this.adjacenciesStates[edge.head.index]) {
      this.adjacenciesStates[edge.head.index] = new Array(this.graph.outEdgesCount(edge.head));
    }
    this.adjacenciesStates[edge.head.index][edge.index] = state;
  }

  /**
   * Removes the state associated to the provided edge (if any is).
   *
   * @param edge - the edge for which state should be removed. This method _assumes_
   *    that the provided edge is an edge of the query graph against which this
   *    `QueryGraphState` was created (and its behavior is undefined if it isn't).
   */
  removeEdgeState(edge: Edge) {
    this.adjacenciesStates[edge.head.index][edge.index] = undefined;
  }

  /**
   * Retrieves the state associated to the provided edge (if any is).
   *
   * @param edge - the edge for which state should be retrieved. This method _assumes_
   *    that the provided vertex is an edge of the query graph against which this
   *    `QueryGraphState` was created (and its behavior is undefined if it isn't).
   * @return the state associated to `edge`, if any.
   */
  getEdgeState(edge: Edge): EdgeState | undefined {
    const forEdge = this.adjacenciesStates[edge.head.index];
    return forEdge ? forEdge[edge.index] : undefined;
  }

  toDebugString(
    vertexMapper: (s: VertexState) => string,
    edgeMapper: (e: EdgeState) => string
  ): string {
    const vs = this.verticesStates.map((state, idx) => ` ${idx}: ${!state ? "<null>" : vertexMapper(state)}`).join("\n");
    const es = this.adjacenciesStates.map((adj, vIdx) => adj.map((state, eIdx) => ` ${vIdx}[${eIdx}]: ${!state ? "<null>" : edgeMapper(state)}`).join("\n")).join("\n");
    return `vertices = {${vs}\n}, edges = {${es}\n}`;
  }
}

/**
 * Builds the query graph corresponding to the provided schema.
 *
 * Note that this method and mainly exported for the sake of testing but should rarely, if
 * ever, be used otherwise. Instead use either `buildSupergraphAPIQueryGraph` or
 * `buildFederatedQueryGraph` which are more explicit.
 *
 * @param name - the name to use for the created graph and as "source" name for the schema.
 * @param schema - the schema for which to build the query graph.
 * @returns the query graph corresponding to `schema` "API" (in the sense that no federation
 *   directives are taken into account by this method in the building of the query graph).
 */
export function buildQueryGraph(name: string, schema: Schema): QueryGraph {
  return buildGraphInternal(name, schema, false);
}

function buildGraphInternal(name: string, schema: Schema, addAdditionalAbstractTypeEdges: boolean, supergraphSchema?: Schema): QueryGraph {
  const builder = new GraphBuilderFromSchema(
    name,
    schema,
    supergraphSchema ? { apiSchema: supergraphSchema.toAPISchema(), isFed1: isFed1Supergraph(supergraphSchema) } : undefined,
  );
  for (const rootType of schema.schemaDefinition.roots()) {
    builder.addRecursivelyFromRoot(rootType.rootKind, rootType.type);
  }
  if (addAdditionalAbstractTypeEdges) {
    builder.addAdditionalAbstractTypeEdges();
  }
  return builder.build();
}

/**
 * Builds a "supergraph API" query graph based on the provided supergraph schema.
 *
 * A "supergraph API" query graph is one that is used to reason about queries against said
 * supergraph API, but @see QueryGraph for more details.
 *
 * @param supergraph - the schema of the supergraph for which to build the query graph.
  *  The provided schema should generally be a "supergraph" as generated by composition merging.
  *  Note however that the query graph built by this method is only based on the supergraph
  *  API and doesn't rely on the join spec directives, so it is valid to also directly
  *  pass a schema that directly corresponds to the supergraph API.
 * @returns the built query graph.
 */
export function buildSupergraphAPIQueryGraph(supergraph: Schema): QueryGraph {
  return buildQueryGraph("supergraph", supergraph.toAPISchema());
}

/**
 * Builds a "federated" query graph based on the provided supergraph schema.
 *
 * A "federated" query graph is one that is used to reason about queries made by a
 * gateway/router against a set of federated subgraph services.
 *
 * @see QueryGraph
 *
 * @param supergraph - the schema of the supergraph for which to build the query graph.
 *   The provided schema _must_ be a "supergraph" as generated by composition merging,
 *   one that includes join spec directives in particular.
 * @param forQueryPlanning - whether the build query graph is built for query planning (if
 *   so, it will include some additional edges that don't impact validation but allow
 *   to generate more efficient query plans).
 * @returns the built federated query graph.
 */
export function buildFederatedQueryGraph(supergraph: Schema, forQueryPlanning: boolean): QueryGraph {
  const subgraphs = extractSubgraphsFromSupergraph(supergraph);
  const graphs = [];
  for (const subgraph of subgraphs) {
    graphs.push(buildGraphInternal(subgraph.name, subgraph.schema, forQueryPlanning, supergraph));
  }
  return federateSubgraphs(graphs);
}

function federatedProperties(subgraphs: QueryGraph[]) : [number, Set<SchemaRootKind>, Schema[]] {
  let vertices = 0;
  const rootKinds = new Set<SchemaRootKind>();
  const schemas: Schema[] = [];
  for (const subgraph of subgraphs) {
    vertices += subgraph.verticesCount();
    subgraph.rootKinds().forEach(k => rootKinds.add(k));
    assert(subgraph.sources.size === 1, () => `Subgraphs should only have one sources, got ${subgraph.sources.size} ([${mapKeys(subgraph.sources).join(', ')}])`);
    schemas.push(firstOf(subgraph.sources.values())!);
  }
  return [vertices + rootKinds.size, rootKinds, schemas];
}

function federateSubgraphs(subgraphs: QueryGraph[]): QueryGraph {
  const [verticesCount, rootKinds, schemas] = federatedProperties(subgraphs);
  const builder = new GraphBuilder(verticesCount);
  rootKinds.forEach(k => builder.createRootVertex(
    k,
    new ObjectType(federatedGraphRootTypeName(k)),
    FEDERATED_GRAPH_ROOT_SOURCE,
    FEDERATED_GRAPH_ROOT_SCHEMA
  ));

  // We first add all the vertices and edges from the subgraphs
  const copyPointers: SubgraphCopyPointer[] = new Array(subgraphs.length);
  for (const [i, subgraph] of subgraphs.entries()) {
    copyPointers[i] = builder.copyGraph(subgraph);
  }

  // We then add the edges from supergraph roots to the subgraph ones.
  // Also, for each root kind, we also add edges from the corresponding root type of each subgraph to the root type of other subgraphs
  // (and for @defer, like for @key, we also add self-link looping on the current subgraph).
  // This essentially encode the fact that if a field return a root type, we can always query any subgraph from that point.
  for (const [i, subgraph] of subgraphs.entries()) {
    const copyPointer = copyPointers[i];
    for (const rootKind of subgraph.rootKinds()) {
      const rootVertex = copyPointer.copiedVertex(subgraph.root(rootKind)!);
      builder.addEdge(builder.root(rootKind)!, rootVertex, subgraphEnteringTransition)

      for (const [j, otherSubgraph] of subgraphs.entries()) {
        const otherRootVertex = otherSubgraph.root(rootKind);
        if (otherRootVertex) {
          const otherCopyPointer = copyPointers[j];
          builder.addEdge(rootVertex, otherCopyPointer.copiedVertex(otherRootVertex), new RootTypeResolution(rootKind));
        }
      }
    }
  }

  // Then we add/update edges for @key and @requires. We do @provides in a second step because its handling requires
  // copying vertex and their edges, and it's easier to reason about this if we know all keys have already been created.
  for (const [i, subgraph] of subgraphs.entries()) {
    const subgraphSchema = schemas[i];
    const subgraphMetadata = federationMetadata(subgraphSchema);
    assert(subgraphMetadata, `Subgraph ${i} is not a valid federation subgraph`);
    const keyDirective = subgraphMetadata.keyDirective();
    const requireDirective = subgraphMetadata.requiresDirective();
    simpleTraversal(
      subgraph,
      v => {
        const type = v.type;
        for (const keyApplication of type.appliedDirectivesOf(keyDirective)) {
          if (!(keyApplication.arguments().resolvable ?? true)) {
            continue;
          }

          // The @key directive creates an edge from every subgraphs (having that type)
          // to the current subgraph. In other words, the fact this subgraph has a @key means
          // that the service of the current subgraph can be queried for the entity (through
          // _entities) as long as "the other side" can provide the proper field values.
          // Note that we only require that "the other side" can gather the key fields (through
          // the path conditions; note that it's possible those conditions are never satisfiable),
          // but don't care that it defines the same key, because it's not a technical
          // requirement (and while we probably don't want to allow in general a type to be an
          // entity in some subgraphs but not other, this is not the place to impose that
          // restriction, and this may be useful at least temporarily to allow convert a type to
          // an entity).
          assert(isInterfaceType(type) || isObjectType(type), () => `Invalid "@key" application on non Object || Interface type "${type}"`);
          const conditions = parseFieldSetArgument({ parentType: type, directive: keyApplication });
          // Note that each subgraph has a key edge to itself (when i === j below). We usually ignore
          // this edges, but they exists for the special case of @defer, where we technically may have
          // to take such "edge-to-self" as a mean to "re-enter" a subgraph for a deferred section.
          for (const [j, otherSubgraph] of subgraphs.entries()) {
            const otherVertices = otherSubgraph.verticesForType(type.name);
            if (otherVertices.length == 0) {
              continue;
            }
            // Note that later, when we've handled @provides, this might not be true anymore a provide may create copy of a
            // certain type. But for now, it's true.
            assert(
              otherVertices.length == 1,
              () => `Subgraph ${j} should have a single vertex for type ${type.name} but got ${otherVertices.length}: ${inspect(otherVertices)}`);

            // The edge goes from the otherSubgraph to the current one.
            const head = copyPointers[j].copiedVertex(otherVertices[0]);
            const tail = copyPointers[i].copiedVertex(v);
            builder.addEdge(head, tail, new KeyResolution(), conditions);
          }
        }
      },
      e => {
        // Handling @requires
        if (e.transition.kind === 'FieldCollection') {
          const type = e.head.type;
          const field = e.transition.definition;
          assert(isCompositeType(type), () => `Non composite type "${type}" should not have field collection edge ${e}`);
          for (const requiresApplication of field.appliedDirectivesOf(requireDirective)) {
            const conditions = parseFieldSetArgument({ parentType: type, directive: requiresApplication });
            const head = copyPointers[i].copiedVertex(e.head);
            // We rely on the fact that the edge indexes will be the same in the copied builder. But there is no real reason for
            // this to not be the case at this point so...
            const copiedEdge = builder.edge(head, e.index);
            copiedEdge.addToConditions(conditions);
          }
        }
        return true; // Always traverse edges
      }
    );
  }
  // Now we handle @provides
  for (const [i, subgraph] of subgraphs.entries()) {
    const subgraphSchema = schemas[i];
    const subgraphMetadata = federationMetadata(subgraphSchema);
    assert(subgraphMetadata, `Subgraph ${i} is not a valid federation subgraph`);
    const providesDirective = subgraphMetadata.providesDirective();
    simpleTraversal(
      subgraph,
      _ => undefined,
      e => {
        // Handling @provides
        if (e.transition.kind === 'FieldCollection') {
          const type = e.head.type;
          const field = e.transition.definition;
          assert(isCompositeType(type), () => `Non composite type "${type}" should not have field collection edge ${e}`);
          for (const providesApplication of field.appliedDirectivesOf(providesDirective)) {
            const fieldType = baseType(field.type!);
            assert(isCompositeType(fieldType), () => `Invalid @provide on field "${field}" whose type "${fieldType}" is not a composite type`)
            const provided = parseFieldSetArgument({ parentType: fieldType, directive: providesApplication });
            const head = copyPointers[i].copiedVertex(e.head);
            const tail = copyPointers[i].copiedVertex(e.tail);
            // We rely on the fact that the edge indexes will be the same in the copied builder. But there is no real reason for
            // this to not be the case at this point so...
            const copiedEdge = builder.edge(head, e.index);
            // We make a copy of the `fieldType` vertex (with all the same edges), and we change this particular edge to point to the
            // new copy. From that, we can add all the provides edges to the copy.
            const copiedTail = builder.makeCopy(tail);
            builder.updateEdgeTail(copiedEdge, copiedTail);
            addProvidesEdges(subgraphSchema, builder, copiedTail, provided);
          }
        }
        return true; // Always traverse edges
      }
    );
  }
  return builder.build(FEDERATED_GRAPH_ROOT_SOURCE);
}

function addProvidesEdges(schema: Schema, builder: GraphBuilder, from: Vertex, provided: SelectionSet) {
  const stack: [Vertex, SelectionSet][] = [[from, provided]];
  const source = from.source;
  while (stack.length > 0) {
    const [v, selectionSet] = stack.pop()!;
    // We reverse the selections to cancel the reversing that the stack does.
    for (const selection of selectionSet.selections(true)) {
      const element = selection.element();
      if (element.kind == 'Field') {
        const fieldDef = element.definition;
        const existingEdge = builder.edges(v).find(e => e.transition.kind === 'FieldCollection' && e.transition.definition.name === fieldDef.name);
        if (existingEdge) {
          // If this is a leaf field, then we don't really have anything to do. Otherwise, we need to copy
          // the tail and continue propagating the provides from there.
          if (selection.selectionSet) {
            const copiedTail = builder.makeCopy(existingEdge.tail);
            builder.updateEdgeTail(existingEdge, copiedTail);
            stack.push([copiedTail, selection.selectionSet]);
          }
        } else {
          // There is no exisiting edges, which means that it's an edge added by the provide.
          // We find the existing vertex it leads to, if it exists and create a new one otherwise.
          const fieldType = baseType(fieldDef.type!);
          const existingTail = builder.verticesForType(fieldType.name).find(v => v.source === source);
          const newTail = existingTail ? existingTail : builder.createNewVertex(fieldType, v.source, schema);
          // If the field is a leaf, then just create the new edge and we're done. Othewise, we
          // should copy the vertex (unless we just created it), add the edge and continue.
          if (selection.selectionSet) {
            const copiedTail = existingTail ? builder.makeCopy(existingTail) : newTail;
            builder.addEdge(v, copiedTail, new FieldCollection(fieldDef, true));
            stack.push([copiedTail, selection.selectionSet]);
          } else {
            builder.addEdge(v, newTail, new FieldCollection(fieldDef, true));
          }
        }
      } else {
        const typeCondition = element.typeCondition;
        if (typeCondition) {
          const existingEdge = builder.edges(v).find(e => e.transition.kind === 'DownCast' && e.transition.castedType.name === typeCondition.name);
          // We always should have an edge: otherwise it would mean we list a type condition for a type that isn't in the subgraph, but the
          // @provides shouldn't have validated in the first place (another way to put it is, contrary to fields, there is no way currently
          // to mark a full type as @external).
          assert(existingEdge, () => `Shouldn't have ${selection} with no corresponding edge on ${v} (edges are: [${builder.edges(v)}])`);
          const copiedTail = builder.makeCopy(existingEdge.tail);
          builder.updateEdgeTail(existingEdge, copiedTail);
          stack.push([copiedTail, selection.selectionSet!]);
        } else {
          // Essentially ignore the condition, it's useless
          stack.push([v, selection.selectionSet!]);
        }
      }
    }
  }
}

interface SubgraphCopyPointer {
  copiedVertex(original: Vertex): Vertex;
}

/**
 * Temporary abstraction used to build a query graph.
 */
class GraphBuilder {
  private readonly vertices: Vertex[];
  private nextIndex: number = 0;
  private readonly adjacencies: Edge[][];
  private readonly typesToVertices: MultiMap<string, number> = new MultiMap();
  private readonly rootVertices: MapWithCachedArrays<SchemaRootKind, RootVertex> = new MapWithCachedArrays();
  private readonly sources: Map<string, Schema> = new Map();

  constructor(verticesCount?: number) {
    this.vertices = verticesCount ? new Array(verticesCount) : [];
    this.adjacencies = verticesCount ? new Array(verticesCount) : [];
  }

  verticesForType(typeName: string): Vertex[] {
    const indexes = this.typesToVertices.get(typeName);
    return indexes == undefined ? [] : indexes.map(i => this.vertices[i]);
  }

  root(kind: SchemaRootKind): Vertex | undefined {
    return this.rootVertices.get(kind);
  }

  addEdge(head: Vertex, tail: Vertex, transition: Transition, conditions?: SelectionSet) {
    const edges = this.adjacencies[head.index];
    const edge = new Edge(edges.length, head, tail, transition, conditions);
    edges.push(edge);
  }

  createNewVertex(type: NamedType, source: string, schema: Schema, index?: number): Vertex {
    if (!index) {
      index = this.nextIndex++;
    }
    const vertex = new Vertex(index, type, source);
    const previous = this.vertices[index];
    assert(!previous, () => `Overriding existing vertex ${previous} with ${vertex}`);
    this.vertices[index] = vertex;
    this.typesToVertices.add(type.name, index);
    this.adjacencies[index] = [];
    if (!this.sources.has(source)) {
      this.sources.set(source, schema);
    }
    return vertex;
  }

  createRootVertex(kind: SchemaRootKind, type: NamedType, source: string, schema: Schema) {
    const vertex = this.createNewVertex(type, source, schema);
    assert(!this.rootVertices.has(kind), () => `Root vertex for ${kind} (${this.rootVertices.get(kind)}) already exists: cannot replace by ${vertex}`);
    this.setAsRoot(kind, vertex.index);
  }

  setAsRoot(kind: SchemaRootKind, index: number) {
    const vertex = this.vertices[index];
    assert(vertex, () => `Cannot set non-existing vertex at index ${index} as root ${kind}`);
    const rootVertex = toRootVertex(vertex, kind);
    this.vertices[vertex.index] = rootVertex;
    this.rootVertices.set(kind, rootVertex);
    const rootEdges = this.adjacencies[vertex.index];
    for (let i = 0; i < rootEdges.length; i++) {
      rootEdges[i] = rootEdges[i].withNewHead(rootVertex);
    }
  }

  copyGraph(graph: QueryGraph): SubgraphCopyPointer {
    const offset = this.nextIndex;
    // Note that we don't use a normal traversal to do the copying because it's possible the provided `graph`
    // has some sub-parts that are not reachable from one of the roots but that we still want to copy those
    // sub-parts. The reason is that, while we don't care about unreachable parts in general, at the time
    // this method is called, we haven't added edges for @provides, and adding those edges may "connect" those
    // currently unreachable parts. And to be connected, they need to exist/have been copied in the first
    // place (note that this means we may copy some unreachable sub-parts that will _not_ be connected later (a subgraph
    // can well have genuinely unreachable definitions), but that's harmless).
    for (const vertex of graph.vertices) {
      const newHead = this.getOrCopyVertex(vertex, offset, graph);
      for (const edge of graph.outEdges(vertex, true)) {
        const newTail = this.getOrCopyVertex(edge.tail, offset, graph);
        this.addEdge(newHead, newTail, edge.transition, edge.conditions);
      }
    }
    this.nextIndex += graph.verticesCount();
    const that = this;
    return {
      copiedVertex(original: Vertex): Vertex {
        const vertex = that.vertices[original.index + offset];
        assert(vertex, () => `Vertex ${original} has no copy for offset ${offset}`);
        return vertex;
      }
    };
  }

  vertex(index: number): Vertex {
    return this.vertices[index];
  }

  edge(head: Vertex, index: number): Edge {
    return this.adjacencies[head.index][index];
  }

  edges(head: Vertex): Edge[] {
    return this.adjacencies[head.index];
  }

  /**
   * Creates a new vertex that is a full copy of the provided one, including having the same out-edge, but with no incoming edges.
   *
   * @param vertex - the vertex to copy.
   * @returns the newly created copy.
   */
  makeCopy(vertex: Vertex): Vertex {
    const newVertex = this.createNewVertex(vertex.type, vertex.source, this.sources.get(vertex.source)!);
    for (const edge of this.adjacencies[vertex.index]) {
      this.addEdge(newVertex, edge.tail, edge.transition, edge.conditions);
    }
    return newVertex;
  }

  /**
   * Replaces the provided edge by a copy but with the provided new tail vertex.
   *
   * @param edge - the edge to replace.
   * @param newTail - the tail to change in `edge`.
   * @returns the newly created edge that, as of this method returning, replaces `edge`.
   */
  updateEdgeTail(edge: Edge, newTail: Vertex): Edge {
    const newEdge = new Edge(edge.index, edge.head, newTail, edge.transition, edge.conditions);
    this.adjacencies[edge.head.index][edge.index] = newEdge;
    return newEdge;
  }

  private getOrCopyVertex(toCopy: Vertex, indexOffset: number, graph: QueryGraph): Vertex {
    const index = toCopy.index + indexOffset;
    let v = this.vertices[index];
    if (!v) {
      v = this.createNewVertex(toCopy.type, toCopy.source, graph.sources.get(toCopy.source)!, index);
    }
    return v;
  }

  build(name: string): QueryGraph {
    return new QueryGraph(
      name,
      this.vertices,
      this.adjacencies,
      this.typesToVertices,
      this.rootVertices,
      this.sources);
  }
}

/**
 * Specialization of `GraphBuilder` for building the parts of a query graph that correspond
 * to a schema API (meaning that it helps building the vertices and edges corresponding to a
 * schema API, but does not handle vertices and edges related to federation).
 */
class GraphBuilderFromSchema extends GraphBuilder {
  private readonly isFederatedSubgraph: boolean;

  constructor(
    private readonly name: string,
    private readonly schema: Schema,
    private readonly supergraph?: { apiSchema: Schema, isFed1: boolean },
  ) {
    super();
    this.isFederatedSubgraph = isFederationSubgraphSchema(schema);
    assert(!this.isFederatedSubgraph || supergraph, `Missing supergraph schema for building the federated subgraph graph`);
  }

  private hasDirective(field: FieldDefinition<any>, directiveFct: (metadata: FederationMetadata) => DirectiveDefinition): boolean {
    const metadata = federationMetadata(this.schema);
    return !!metadata && field.hasAppliedDirective(directiveFct(metadata));
  }

  /**
   * Adds a vertex for the provided root object type (marking that vertex as a root vertex for the
   * provided `kind`) and recursively descend into the type definition to adds the related vertices
   * and edges.
   *
   * In other words, calling this method on, say, the `Query` type of a schema will add vertices
   * and edges for all the type reachable from that `Query` type.
   */
  addRecursivelyFromRoot(kind: SchemaRootKind, root: ObjectType) {
    this.setAsRoot(kind, this.addTypeRecursively(root).index);
  }

  /**
   * Adds in a vertex for the provided type in the in-building query graph, and recursively
   * adds edges and vertices corresponding to the type definition (so for object types, it
   * will add edges for each fields and recursively add vertices for each field type, etc...).
   */
  private addTypeRecursively(type: Type): Vertex {
    const namedType = baseType(type);
    const existing = this.verticesForType(namedType.name);
    if (existing.length > 0) {
      assert(existing.length == 1, () => `Only one vertex should have been created for type ${namedType.name}, got ${existing.length}: ${inspect(this)}`);
      return existing[0];
    }
    const vertex = this.createNewVertex(namedType, this.name, this.schema);
    if (isObjectType(namedType)) {
      this.addObjectTypeEdges(namedType, vertex);
    } else if (isInterfaceType(namedType)) {
      // For interfaces, we generally don't add direct edges for their fields. Because in general, the subgraph where a particular
      // field can be fetched from may depend on the runtime implementation. However, if the subgraph we're currently including
      // "provides" a particular interface field locally *for all the supergraph interfaces implementations* (in other words, we
      // know we can always ask the field to that subgraph directly on the interface and will never miss anything), then we can
      // add a direct edge to the field for the interface in that subgraph (which avoids unnecessary type exploding in practice).
      if (this.isFederatedSubgraph) {
        this.maybeAddInterfaceFieldsEdges(namedType, vertex);
      }
      this.addAbstractTypeEdges(namedType, vertex);
    } else if (isUnionType(namedType)) {
      // Adding the special-case __typename edge for union.
      this.addEdgeForField(namedType.typenameField()!, vertex);
      this.addAbstractTypeEdges(namedType, vertex);
    }
    // Any other case (scalar or enum; inputs at not possible here) is terminal and has no edges to
    // consider.
    return vertex;
  }

  private addObjectTypeEdges(type: ObjectType, head: Vertex) {
    // We do want all fields, including most built-in. For instance, it's perfectly valid to query __typename manually, so we want
    // to have an edge for it. Also, the fact we handle the _entities field ensure that all entities are part of the graph,
    // even if they are not reachable by any other user operations.
    // We do skip introspection fields however.
    for (const field of type.allFields()) {
      if (field.isSchemaIntrospectionField()) {
        continue;
      }

      // Field marked @external only exists to ensure subgraphs schema are valid graphQL, but they don't create actual edges.
      // However, even if we don't add an edge, we still want to add the field type. The reason is that while we don't add
      // a "general" edge for an external field, we may later add path-specific edges for the field due to a `@provides`. When
      // we do so, we need the vertex corresponding to that field type to exists, and in rare cases a type could be only
      // mentioned in this external field, so if we don't add the type here, we'll never do and get an issue later as we
      // add @provides edges.
      if (this.hasDirective(field, (m) => m.externalDirective())) {
        this.addTypeRecursively(field.type!)
      } else {
        this.addEdgeForField(field, head);
      }
    }
  }

  private addEdgeForField(field: FieldDefinition<any>, head: Vertex) {
    const tail = this.addTypeRecursively(field.type!);
    this.addEdge(head, tail, new FieldCollection(field));
  }

  private isDirectlyProvidedByType(type: ObjectType, fieldName: string) {
    const field = type.field(fieldName);
    // The field is directly provided if:
    //   1) the type does have it.
    //   2) it is not external.
    //   3) it does not have a @require (essentially, this method is called on type implementations of an interface
    //      to decide if we can avoid type-explosion, but if the field has a @require on an implementation, then we
    //      need to type-explode to make we handle that @require).
    return field && !this.hasDirective(field, (m) => m.externalDirective()) && !this.hasDirective(field, (m) => m.requiresDirective());
  }

  private maybeAddInterfaceFieldsEdges(type: InterfaceType, head: Vertex) {
    assert(this.supergraph, 'Missing supergraph schema when building a subgraph');
    const supergraphType = this.supergraph.apiSchema.type(type.name);
    // In theory, the interface might have been marked inaccessible and not be in the supergraph. If that's the case,
    // we just don't add direct edges at all (adding interface edges is an optimization and if the interface is inaccessible, it
    // probably doesn't play any role in query planning anyway, so it doesn't matter).
    if (!supergraphType) {
      return;
    }
    const supergraphRuntimeTypes = (supergraphType as InterfaceType).possibleRuntimeTypes().map(t => t.name);
    // Note that it's possible that the current subgraph does not even know some of the possible runtime types of the supergraph.
    // But as edges to interfaces can only come from the current subgraph, it does mean that whatever field led to this
    // interface was resolved in this subgraph and can never return one of those unknown runtime types. So we can ignore them.
    // TODO: We *must* revisit this once we add @key for interfaces as it will invalidate the "edges to interfaces can only
    // come from the current subgraph". Most likely, _if_ an interface has a key, then we should return early from this
    // function (add no field edges at all) if subgraph doesn't know of at least one implementation.
    const localRuntimeTypes = supergraphRuntimeTypes.map(t => this.schema.type(t) as ObjectType).filter(t => t !== undefined);
    // Same as for objects, we want `allFields` so we capture __typename (which will never be external and always provided
    // by all local runtime types, so will always have an edge added, which we want).
    for (const field of type.allFields()) {
      // To include the field, it must not be external itself, and it must be provided on every of the runtime types
      if (this.hasDirective(field, (m) => m.externalDirective()) || localRuntimeTypes.some(t => !this.isDirectlyProvidedByType(t, field.name))) {
        continue;
      }
      this.addEdgeForField(field, head);
    }
  }

  private addAbstractTypeEdges(type: InterfaceType | UnionType, head: Vertex) {
    const implementations = isInterfaceType(type) ? type.possibleRuntimeTypes() : type.types();
    for (const implementationType of implementations) {
      const tail = this.addTypeRecursively(implementationType);
      this.addEdge(head, tail, new DownCast(type, implementationType));
    }
  }

  /*
   * We've added edges that avoid type-explosion _directly_ from an interface, but it means that so far we
   * always type-explode unions to all their implementation types, and always type-explode when we go
   * through 2 unrelated interfaces. For instance, say we have
   * ```
   * type Query {
   *  i1: I1
   *  i2: I2
   *  u: U
   * }
   *
   * interface I1 {
   *   x: Int
   * }
   *
   * interface I2 {
   *   y: Int
   * }
   *
   * type A implements I1 & I2 {
   *   x: Int
   *   y: Int
   * }
   *
   * type B implements I1 & I2 {
   *   x: Int
   *   y: Int
   * }
   *
   * union U = A | B
   * ```
   * If we query:
   * ```
   * {
   *   u {
   *     ... on I1 {
   *       x
   *     }
   *   }
   * }
   * ```
   * the we currently have no edge between `U` and `I1` whatsoever, so query planning would have
   * to type-explode `U` even though that's not necessary (assuming everything is in the same
   * subgraph, we'd want to send the query "as-is").
   * Same thing for:
   * ```
   * {
   *   i1 {
   *     x
   *     ... on U2 {
   *       y
   *     }
   *   }
   * }
   * ```
   * due to not having edges from `I1` to `I2` (granted, in that example, type-exploding is not all
   * that worth, but it gets worth with more implementations/fields).
   *
   * And so this method is about adding such edges. Essentially, every time 2 abstract types have
   * an intersection of runtime types > 1, we add an edge.
   *
   * Do not that in practice we only add those edges when we build a query graph for query planning
   * purposes, because not type-exploding is only an optimization but type-exploding will always "work"
   * and for composition validation, we don't care about being optimal, while limiting edges make
   * validation faster by limiting the choices to explore. Also, query planning is careful, as
   * it walk those edges, to compute the actual possible runtime types we could have to avoid
   * later type-exploding in impossible runtime types.
   */
  addAdditionalAbstractTypeEdges() {
    // For each abstract type in the schema, it's runtime types.
    const abstractTypesWithTheirRuntimeTypes: [AbstractType, readonly ObjectType[]][] = [];
    for (const type of this.schema.types()) {
      if (isAbstractType(type)) {
        abstractTypesWithTheirRuntimeTypes.push([type, possibleRuntimeTypes(type)]);
      }
    }

    // Check every pair of abstract type that intersect on at least 2 runtime types to see if have
    // edges to add. Note that in practice, we only care about 'Union -> Interface' and 'Interface -> Interface'
    for (let i = 0; i < abstractTypesWithTheirRuntimeTypes.length - 1; i++) {
      const [t1, t1Runtimes] = abstractTypesWithTheirRuntimeTypes[i];
      // Note that in general, t1 is already part of the graph `addTypeRecursively` don't really add anything, it
      // just return the existing vertex. That said, if t1 is returned by no field (at least no field reachable from
      // a root type), the type will not be part of the graph. And in that case, we do add it. And it's actually
      // possible that we don't create any edge to that created vertex, so we may be creating a disconnected subset
      // of the graph, a part that is not reachable from any root. It's not optimal, but it's a bit hard to avoid
      // in the first place (we could also try to purge such subset after this method, but it's probably not worth
      // it in general) and it's not a big deal: it will just use a bit more memory than necessary, and it's probably
      // pretty rare in the first place.
      const t1Vertex = this.addTypeRecursively(t1);
      for (let j = i; j < abstractTypesWithTheirRuntimeTypes.length; j++) {
        const [t2, t2Runtimes] = abstractTypesWithTheirRuntimeTypes[j];
        // We ignore the pair if both are interfaces and one implements the other. We'll already have appropriate
        // edges if that's the case.
        if (isInterfaceType(t1) && isInterfaceType(t2) && (t1.implementsInterface(t2) || t2.implementsInterface(t1))) {
          continue;
        }
        // Note that as everything comes from the same subgraph schema, using reference equality is fine.
        const intersecting = t1Runtimes.filter(o1 => t2Runtimes.includes(o1));
        if (intersecting.length >= 2) {
          // Same remark as for t1 above.
          const t2Vertex = this.addTypeRecursively(t2);
          this.addEdge(t1Vertex, t2Vertex, new DownCast(t1, t2));
          this.addEdge(t2Vertex, t1Vertex, new DownCast(t2, t1));
        }
      }
    }
  }

  build(): QueryGraph {
    return super.build(this.name);
  }
}

/**
 * Performs a simple traversal of a query graph that _ignores_ edge conditions.
 *
 * Note that the order of the traversal shouldn't be relied on strongly, only that
 * the provided `onVertex` and `onEdges` will get called (exactly) once for every vertices
 * and edges in the query graph.
 *
 * That said, in practice, this method does `n` traversals, one from each root vertex in the
 * provided query graph (so in practice, `0 < n <= 3`) and each traversal happens to be a
 * depth first traversal (one that stops as soon as it encounters a vertex previously seen).
 *
 * @param graph - the query graph to traverse.
 * @param onVertex - a function called on each vertex traversed the first time it is traversed.
 * @param onEdges - a function called on each edges traversed the first time it is traversed.
 *   When this function is called for an edge, it is guaranteed that `onVertex` has previously
 *   been called on the edge's head vertex (there is no guarantee on the tail vertex in that
 *  `onVertex` may or may not have been called for it).
 */
export function simpleTraversal(
  graph: QueryGraph,
  onVertex: (v: Vertex) => void,
  onEdges: (e: Edge) => boolean
) {
  // A marked vertex (accessed by its index) is one that has already been traversed.
  const marked: boolean[] = new Array(graph.verticesCount());
  // The stack contains vertices that haven't been traversed yet but need to.
  const stack: Vertex[] = [];

  const maybeAdd = function(vertex: Vertex) {
    if (!marked[vertex.index]) {
      stack.push(vertex);
      marked[vertex.index] = true;
    }
  }

  graph.roots().forEach(maybeAdd);
  while (stack.length > 0) {
    const vertex = stack.pop()!;
    onVertex(vertex);
    for (const edge of graph.outEdges(vertex)) {
      const shouldTraverse = onEdges(edge);
      if (shouldTraverse) {
        maybeAdd(edge.tail);
      }
    }
  }
}
