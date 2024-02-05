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
  Directive,
  typenameFieldName,
  Field,
  selectionSetOfElement,
  SelectionSetUpdates,
  Supergraph,
  NamedSchemaElement,
  validateSupergraph,
} from '@apollo/federation-internals';
import { inspect } from 'util';
import { DownCast, FieldCollection, subgraphEnteringTransition, SubgraphEnteringTransition, Transition, KeyResolution, RootTypeResolution, InterfaceObjectFakeDownCast } from './transition';
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
  hasReachableCrossSubgraphEdges: boolean = false;
  // @provides works by creating duplicates of the vertex/type involved in the provides and adding the provided
  // edges only to those copy. This means that with @provides, you can have more than one vertex per-type-and-subgraph
  // in a query graph. Which is fined, but this `provideId` allows to distinguish if a vertex was created as part of
  // this @provides duplication or not. The value of this field has no other meaning than to be unique per-@provide,
  // and so all the vertex copied for a given @provides application will have the same `provideId`. Overall, this
  // mostly exists for debugging visualization.
  provideId: number | undefined;

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
    const label = `${this.type}(${this.source})`;
    return this.provideId ? `${label}-${this.provideId}` : label;
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

export interface OverrideCondition {
  label: string;
  condition: boolean;
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
    /**
     * Edges can require that an override condition (provided during query
     * planning) be met in order to be taken. This is used for progressive
     * @override, where (at least) 2 subgraphs can resolve the same field, but
     * one of them has an @override with a label. If the override condition
     * matches the query plan parameters, this edge can be taken.
     */
    public overrideCondition?: OverrideCondition,
  ) {
    this._conditions = conditions;
  }

  get conditions(): SelectionSet | undefined {
    return this._conditions;
  }

  isEdgeForField(name: string): boolean {
    return this.transition.kind === 'FieldCollection' && this.transition.definition.name === name;
  }

  matchesSupergraphTransition(otherTransition: Transition): boolean {
    assert(otherTransition.collectOperationElements, () => `Supergraphs shouldn't have transition that don't collect elements; got ${otherTransition}"`);
    const transition = this.transition;
    switch (transition.kind) {
      case 'FieldCollection': return otherTransition.kind === 'FieldCollection' && transition.definition.name === otherTransition.definition.name;
      case 'DownCast': return otherTransition.kind === 'DownCast' && transition.castedType.name === otherTransition.castedType.name;
      case 'InterfaceObjectFakeDownCast': return otherTransition.kind === 'DownCast' && transition.castedTypeName === otherTransition.castedType.name;
      default: return false;
    }
  }

  changesSubgraph(): boolean {
    return this.head.source !== this.tail.source;
  }

  label(): string {
    if (this.transition instanceof SubgraphEnteringTransition && !this._conditions) {
      return "";
    }

    let conditionsString = (this._conditions ?? '').toString();
    if (this.overrideCondition) {
      if (conditionsString.length) conditionsString += ', ';
      conditionsString += `${this.overrideCondition.label} = ${this.overrideCondition.condition}`;
    }
    // we had at least some condition, add the turnstile and spacing
    if (conditionsString.length) conditionsString += ' ⊢ ';

    return conditionsString + this.transition.toString();
  }

  withNewHead(newHead: Vertex): Edge {
    return new Edge(
      this.index,
      newHead,
      this.tail,
      this.transition,
      this._conditions,
      this.overrideCondition,
    );
  }

  addToConditions(newConditions: SelectionSet) {
    this._conditions = this._conditions
      ? new SelectionSetUpdates().add(this._conditions).add(newConditions).toSelectionSet(this._conditions.parentType)
      : newConditions;
  }

  isKeyOrRootTypeEdgeToSelf(): boolean {
    return this.head === this.tail && (this.transition.kind === 'KeyResolution' || this.transition.kind === 'RootTypeResolution');
  }

  satisfiesOverrideConditions(conditionsToCheck: Map<string, boolean>) {
    if (!this.overrideCondition) return true;
    const { label, condition } = this.overrideCondition;
    return conditionsToCheck.has(label) ? conditionsToCheck.get(label) === condition : false;
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
    * For each vertex, the edges that originate from that array. This array has the same length as `vertices` and `_outEdges[i]`
    * is an array of all the edges starting at vertices[i].
    */
    private readonly _outEdges: Edge[][],
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
    return this._outEdges.reduce((acc, v) => acc + v.length, 0);
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
    const allEdges = this._outEdges[vertex.index];
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
    return this._outEdges[vertex.index].length;
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
    return this._outEdges[vertex.index][edgeIndex];
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
 * @param overrideLabelsByCoordinate - A Map of coordinate -> override label to apply to the query graph.
 *   Additional "virtual" edges will be created for progressively overridden fields in order to ensure that
 *   all possibilities are considered during query planning.
 * @returns the query graph corresponding to `schema` "API" (in the sense that no federation
 *   directives are taken into account by this method in the building of the query graph).
 */
export function buildQueryGraph(name: string, schema: Schema, overrideLabelsByCoordinate?: Map<string, string>): QueryGraph {
  return buildGraphInternal(name, schema, false, undefined, overrideLabelsByCoordinate);
}

function buildGraphInternal(
  name: string,
  schema: Schema,
  addAdditionalAbstractTypeEdges: boolean,
  supergraphSchema?: Schema,
  overrideLabelsByCoordinate?: Map<string, string>,
): QueryGraph {
  const builder = new GraphBuilderFromSchema(
    name,
    schema,
    supergraphSchema ? { apiSchema: supergraphSchema.toAPISchema(), isFed1: isFed1Supergraph(supergraphSchema) } : undefined,
    overrideLabelsByCoordinate,
  );
  for (const rootType of schema.schemaDefinition.roots()) {
    builder.addRecursivelyFromRoot(rootType.rootKind, rootType.type);
  }
  if (builder.isFederatedSubgraph) {
    builder.addInterfaceEntityEdges();
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
export function buildSupergraphAPIQueryGraph(supergraph: Supergraph): QueryGraph {
  const apiSchema = supergraph.apiSchema();

  const overrideLabelsByCoordinate = new Map<string, string>();
  const joinFieldApplications = validateSupergraph(supergraph.schema)[1]
    .fieldDirective(supergraph.schema).applications();
  for (const application of joinFieldApplications) {
    const overrideLabel = application.arguments().overrideLabel;
    if (overrideLabel) {
      overrideLabelsByCoordinate.set(
        (application.parent as FieldDefinition<any>).coordinate,
        overrideLabel
      );
    }
  }
  return buildQueryGraph("supergraph", apiSchema, overrideLabelsByCoordinate);
}

/**
 * Builds a "federated" query graph based on the provided supergraph schema.
 *
 * A "federated" query graph is one that is used to reason about queries made by a
 * gateway/router against a set of federated subgraph services.
 *
 * @see QueryGraph
 *
 * @param supergraph - the supergraph for which to build the query graph.
 * @param forQueryPlanning - whether the build query graph is built for query planning (if
 *   so, it will include some additional edges that don't impact validation but allow
 *   to generate more efficient query plans).
 * @returns the built federated query graph.
 */
export function buildFederatedQueryGraph(supergraph: Supergraph, forQueryPlanning: boolean): QueryGraph {
  const subgraphs = supergraph.subgraphs();
  const graphs = [];
  for (const subgraph of subgraphs) {
    graphs.push(buildGraphInternal(subgraph.name, subgraph.schema, forQueryPlanning, supergraph.schema));
  }
  return federateSubgraphs(supergraph.schema, graphs);
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

function resolvableKeyApplications(
  keyDirective: DirectiveDefinition<{fields: any, resolvable?: boolean}>,
  type: NamedType
): Directive<NamedType, {fields: any, resolvable?: boolean}>[] {
  const applications: Directive<NamedType, {fields: any, resolvable?: boolean}>[] = type.appliedDirectivesOf(keyDirective);
  return applications.filter((application) => application.arguments().resolvable ?? true);
}

function federateSubgraphs(supergraph: Schema, subgraphs: QueryGraph[]): QueryGraph {
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
        for (const keyApplication of resolvableKeyApplications(keyDirective, type)) {
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
          const isInterfaceObject = subgraphMetadata.isInterfaceObjectType(type);
          const conditions = parseFieldSetArgument({ parentType: type, directive: keyApplication });

          // We'll look at adding edges from "other subgraphs" to the current type. So the tail of all the edges
          // we'll build in this branch is always going to be the same.
          const tail = copyPointers[i].copiedVertex(v);
          // Note that each subgraph has a key edge to itself (when i === j below). We usually ignore
          // this edges, but they exists for the special case of @defer, where we technically may have
          // to take such "edge-to-self" as a mean to "re-enter" a subgraph for a deferred section.
          for (const [j, otherSubgraph] of subgraphs.entries()) {
            const otherVertices = otherSubgraph.verticesForType(type.name);
            if (otherVertices.length > 0) {
              // Note that later, when we've handled @provides, this might not be true anymore as @provides may create copy of a
              // certain type. But for now, it's true.
              assert(
                otherVertices.length == 1,
                () => `Subgraph ${j} should have a single vertex for type ${type.name} but got ${otherVertices.length}: ${inspect(otherVertices)}`);

              const otherVertex = otherVertices[0];
              // The edge goes from the otherSubgraph to the current one.
              const head = copyPointers[j].copiedVertex(otherVertex);
              const tail = copyPointers[i].copiedVertex(v);
              builder.addEdge(head, tail, new KeyResolution(), conditions);
            }

            // Additionally, if the key is on an @interfaceObject and this "other" subgraph has some of the implementations
            // of the corresponding interface, then we need an edge from each of those implementations (to the @interfaceObject).
            // This is used when an entity of specific implementation is queried first, but then some of the
            // requested fields are only provided by that @interfaceObject.
            if (isInterfaceObject) {
              const typeInSupergraph = supergraph.type(type.name);
              assert(typeInSupergraph && isInterfaceType(typeInSupergraph), () => `Type ${type} is an interfaceObject in subgraph ${i}; should be an interface in the supergraph`);
              for (const implemTypeInSupergraph of typeInSupergraph.possibleRuntimeTypes()) {
                // That implementation type may or may not exists in "otherSubgraph". If it doesn't, we just have nothing to
                // do for that particular impelmentation. If it does, we'll add the proper edge, but note that we're guaranteed
                // to have at most one vertex for the same reason than mentioned above (only the handling @provides will make it
                // so that there can be more than one vertex per type).
                const implemVertice = otherSubgraph.verticesForType(implemTypeInSupergraph.name)[0];
                if (!implemVertice) {
                  continue;
                }

                const implemHead = copyPointers[j].copiedVertex(implemVertice);
                // The key goes from the implementation type to the @interfaceObject one, so the conditions
                // will be "fetched" on the implementation type, but `conditions` has been parsed on the
                // interface type, so it will use fields from the interface, not the implementation type.
                // So we re-parse the condition using the implementation type: this could fail, but in
                // that case it just mean that key is not usable.
                const implemType = implemVertice.type;
                assert(isCompositeType(implemType), () => `${implemType} should be composite since it implements ${typeInSupergraph} in the supergraph`);
                try {
                  const implConditions = parseFieldSetArgument({ parentType: implemType, directive: keyApplication, validate: false });
                  builder.addEdge(implemHead, tail, new KeyResolution(), implConditions);
                } catch (e) {
                  // Ignored on purpose: it just means the key is not usable on this subgraph.
                }
              }
            }
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

  /**
   * Handling progressive overrides here. For each progressive @override
   * application (with a label), we want to update the edges to the overridden
   * field within the "to" and "from" subgraphs with their respective override
   * condition (the label and a T/F value). The "from" subgraph will have an
   * override condition of `false`, whereas the "to" subgraph will have an
   * override condition of `true`.
   */
  const subgraphsByName = new Map(subgraphs.map((s) => [s.name, s]));
  for (const [i, toSubgraph] of subgraphs.entries()) {
    const subgraphSchema = schemas[i];
    const subgraphMetadata = federationMetadata(subgraphSchema);
    assert(subgraphMetadata, `Subgraph ${i} is not a valid federation subgraph`);

    for (const application of subgraphMetadata.overrideDirective().applications()) {
      const { from, label } = application.arguments();
      if (!label) continue;
      const fromSubgraph = subgraphsByName.get(from);
      assert(fromSubgraph, () => `Subgraph ${from} not found`);

      function updateEdgeWithOverrideCondition(subgraph: QueryGraph, label: string, condition: boolean) {
        const field = application.parent;
        assert(field instanceof NamedSchemaElement, () => `@override should have been on a field, got ${field}`);
        const typeName = field.parent.name;

        const [vertex, ...unexpectedAdditionalVertices] = subgraph.verticesForType(typeName);
        assert(vertex && unexpectedAdditionalVertices.length === 0, () => `Subgraph ${subgraph.name} should have exactly one vertex for type ${typeName}`);

        const subgraphEdges = subgraph.outEdges(vertex);
        for (const edge of subgraphEdges) {
          if (
            edge.transition.kind === "FieldCollection"
            && edge.transition.definition.name === field.name
          ) {
            const head = copyPointers[subgraphs.indexOf(subgraph)].copiedVertex(vertex);
            const copiedEdge = builder.edge(head, edge.index);

            copiedEdge.overrideCondition = {
              label,
              condition,
            };
          }
        }
      }

      updateEdgeWithOverrideCondition(toSubgraph, label, true);
      updateEdgeWithOverrideCondition(fromSubgraph, label, false);
    }
  }

  // Now we handle @provides
  let provideId = 0;
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
            ++provideId;
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
            const copiedTail = builder.makeCopy(tail, provideId);
            builder.updateEdgeTail(copiedEdge, copiedTail);
            addProvidesEdges(subgraphSchema, builder, copiedTail, provided, provideId);
          }
        }
        return true; // Always traverse edges
      }
    );
  }

  // We now need to finish handling @interfaceObject types. More precisely, there is cases where only a/some implementation(s)
  // of a interface are queried, and that could apply to an interface that is an @interfaceObject in some sugraph. Consider
  // the following example:
  // ```graphql
  // type Query {
  //   getIs: [I]
  // }
  //
  // type I @key(fields: "id") @interfaceObject {
  //   id: ID!
  //   x: Int
  // }
  // ```
  // where we suppose that `I` has some implementations say, `A`, `B` and `C`, in some other subgraph.
  // Now, consider query:
  // ```graphql
  // {
  //   getIs {
  //     ... on B {
  //       x
  //     }
  //   }
  // }
  // ```
  // So here, we query `x` which the subgraph provides, but we only do so for one of the impelementation.
  // So in that case, we essentially need to figure out the `__typename` first (of more precisely, we need
  // to know the real __typename "eventually"; we could theoretically query `x` first, and then get the __typename
  // to know if we should keep the result or discard it, and that could be more efficient in certain case,
  // but as we don't know both 1) if `x` is expansive to resolve and 2) what the ratio of results from `getIs`
  // will be `B` versus some other implementation, it is "safer" to get the __typename first and only resolve `x`
  // when we need to).
  //
  // Long story short, to solve this, we create edges from @interfaceObject types to themselves for every implementation
  // types of the interface: those edges will be taken when we try to take a `... on B` condition, and those edge
  // have __typename as a condition, forcing to find __typename in another subgraph first.
  for (const [i, subgraph] of subgraphs.entries()) {
    const subgraphSchema = schemas[i];
    const subgraphMetadata = federationMetadata(subgraphSchema);
    assert(subgraphMetadata, `Subgraph ${i} is not a valid federation subgraph`);
    const interfaceObjectDirective = subgraphMetadata.interfaceObjectDirective();
    for (const application of interfaceObjectDirective.applications()) {
      const type = application.parent;
      assert(isObjectType(type), '@interfaceObject should have been on an object type');
      const vertex = copyPointers[i].copiedVertex(subgraph.verticesForType(type.name)[0]);
      const supergraphItf = supergraph.type(type.name);
      assert(supergraphItf && isInterfaceType(supergraphItf), () => `${type} has @interfaceObject in subgraph but has kind ${supergraphItf?.kind} in supergraph`)
      const condition = selectionSetOfElement(new Field(type.typenameField()!));
      for (const implementation of supergraphItf.possibleRuntimeTypes()) {
        builder.addEdge(vertex, vertex, new InterfaceObjectFakeDownCast(type, implementation.name), condition);
      }
    }
  }

  return builder.build(FEDERATED_GRAPH_ROOT_SOURCE);
}

function addProvidesEdges(schema: Schema, builder: GraphBuilder, from: Vertex, provided: SelectionSet, provideId: number) {
  const stack: [Vertex, SelectionSet][] = [[from, provided]];
  const source = from.source;
  while (stack.length > 0) {
    const [v, selectionSet] = stack.pop()!;
    // We reverse the selections to cancel the reversing that the stack does.
    for (const selection of selectionSet.selectionsInReverseOrder()) {
      const element = selection.element;
      if (element.kind == 'Field') {
        const fieldDef = element.definition;
        const existingEdge = builder.edges(v).find(e => e.transition.kind === 'FieldCollection' && e.transition.definition.name === fieldDef.name);
        if (existingEdge) {
          // If this is a leaf field, then we don't really have anything to do. Otherwise, we need to copy
          // the tail and continue propagating the provides from there.
          if (selection.selectionSet) {
            const copiedTail = builder.makeCopy(existingEdge.tail, provideId);
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
            const copiedTail = existingTail ? builder.makeCopy(existingTail, provideId) : newTail;
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
          const copiedTail = builder.makeCopy(existingEdge.tail, provideId);
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
  private readonly outEdges: Edge[][];
  private readonly inEdges: Edge[][];
  private readonly typesToVertices: MultiMap<string, number> = new MultiMap();
  private readonly rootVertices: MapWithCachedArrays<SchemaRootKind, RootVertex> = new MapWithCachedArrays();
  private readonly sources: Map<string, Schema> = new Map();

  constructor(verticesCount?: number) {
    this.vertices = verticesCount ? new Array(verticesCount) : [];
    this.outEdges = verticesCount ? new Array(verticesCount) : [];
    this.inEdges = verticesCount ? new Array(verticesCount) : [];
  }

  verticesForType(typeName: string): Vertex[] {
    const indexes = this.typesToVertices.get(typeName);
    return indexes == undefined ? [] : indexes.map(i => this.vertices[i]);
  }

  root(kind: SchemaRootKind): Vertex | undefined {
    return this.rootVertices.get(kind);
  }

  addEdge(head: Vertex, tail: Vertex, transition: Transition, conditions?: SelectionSet, overrideCondition?: OverrideCondition) {
    const headOutEdges = this.outEdges[head.index];
    const tailInEdges = this.inEdges[tail.index];
    const edge = new Edge(headOutEdges.length, head, tail, transition, conditions, overrideCondition);
    headOutEdges.push(edge);
    tailInEdges.push(edge);

    if (head.source !== tail.source) {
      this.markInEdgesHasReachingCrossSubgraphEdge(head);
    }
  }

  markInEdgesHasReachingCrossSubgraphEdge(from: Vertex) {
    // When we mark a vertex, we mark all of its "ancestor" vertices, so if we
    // get vertex already marked, there is nothing more to do.
    if (from.hasReachableCrossSubgraphEdges) {
      return;
    }

    const stack = [from];
    while (stack.length > 0) {
      const v = stack.pop()!;
      v.hasReachableCrossSubgraphEdges = true;
      for (const edge of this.inEdges[v.index]) {
        // Again, no point in redoing work as soon as we read an aready marked vertec.
        // We also only follow in-edges within the same subgraph, as vertices on other subgraphs
        // will have been marked with their own cross-subgraph edges.
        if (edge.head.source === edge.tail.source && !edge.head.hasReachableCrossSubgraphEdges) {
          stack.push(edge.head);
        }
      }
    }
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
    this.outEdges[index] = [];
    this.inEdges[index] = [];
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
    const rootEdges = this.outEdges[vertex.index];
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
    return this.outEdges[head.index][index];
  }

  edges(head: Vertex): Edge[] {
    return this.outEdges[head.index];
  }

  /**
   * Creates a new vertex that is a full copy of the provided one, including having the same out-edge, but with no incoming edges.
   *
   * @param vertex - the vertex to copy.
   * @param provideId - if the vertex is copied for the sake of a `@provides`, an id that identify that provide and will be set on
   *   the newly copied vertex.
   * @returns the newly created copy.
   */
  makeCopy(vertex: Vertex, provideId?: number): Vertex {
    const newVertex = this.createNewVertex(vertex.type, vertex.source, this.sources.get(vertex.source)!);
    newVertex.provideId = provideId;
    newVertex.hasReachableCrossSubgraphEdges = vertex.hasReachableCrossSubgraphEdges;
    for (const edge of this.outEdges[vertex.index]) {
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
    const newEdge = new Edge(edge.index, edge.head, newTail, edge.transition, edge.conditions, edge.overrideCondition);
    this.outEdges[edge.head.index][edge.index] = newEdge;
    // For in-edge, we need to remove the edge from the inputs of the previous tail,
    // and add it to the new tail.
    this.inEdges[edge.tail.index] = this.inEdges[edge.tail.index].filter((e) => e !== edge);
    this.inEdges[newTail.index].push(newEdge);
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
      this.outEdges,
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
  readonly isFederatedSubgraph: boolean;

  constructor(
    private readonly name: string,
    private readonly schema: Schema,
    private readonly supergraph?: { apiSchema: Schema, isFed1: boolean },
    private readonly overrideLabelsByCoordinate?: Map<string, string>,
  ) {
    super();
    this.isFederatedSubgraph = !!supergraph && isFederationSubgraphSchema(schema);
  }

  private hasDirective(elt: FieldDefinition<any> | NamedType, directiveFct: (metadata: FederationMetadata) => DirectiveDefinition): boolean {
    const metadata = federationMetadata(this.schema);
    return !!metadata && elt.hasAppliedDirective(directiveFct(metadata));
  }

  private isExternal(field: FieldDefinition<any>): boolean {
    const metadata = federationMetadata(this.schema);
    return !!metadata && metadata.isFieldExternal(field);
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
    const isInterfaceObject = federationMetadata(this.schema)?.isInterfaceObjectType(type) ?? false;

    // We do want all fields, including most built-in. For instance, it's perfectly valid to query __typename manually, so we want
    // to have an edge for it. Also, the fact we handle the _entities field ensure that all entities are part of the graph,
    // even if they are not reachable by any other user operations.
    // We do skip introspection fields however.
    for (const field of type.allFields()) {
      // Note that @interfaceObject types are an exception to the rule of "it's perfectly valid to query __typename". More
      // precisely, a query can ask for the `__typename` of anything, but it shouldn't be answered by an @interfaceObject
      // and so we don't add an edge, ensuring the query planner has to get it from another subgraph (than the one with
      // said @interfaceObject).
      if (field.isSchemaIntrospectionField() || (isInterfaceObject && field.name === typenameFieldName)) {
        continue;
      }

      // Field marked @external only exists to ensure subgraphs schema are valid graphQL, but they don't create actual edges.
      // However, even if we don't add an edge, we still want to add the field type. The reason is that while we don't add
      // a "general" edge for an external field, we may later add path-specific edges for the field due to a `@provides`. When
      // we do so, we need the vertex corresponding to that field type to exists, and in rare cases a type could be only
      // mentioned in this external field, so if we don't add the type here, we'll never do and get an issue later as we
      // add @provides edges.
      if (this.isExternal(field)) {
        this.addTypeRecursively(field.type!)
      } else {
        this.addEdgeForField(field, head);
      }
    }
  }

  private addEdgeForField(field: FieldDefinition<any>, head: Vertex) {
    const tail = this.addTypeRecursively(field.type!);
    const overrideLabel = this.overrideLabelsByCoordinate?.get(field.coordinate);
    if (overrideLabel) {
      this.addEdge(head, tail, new FieldCollection(field), undefined, {
        label: overrideLabel,
        condition: true,
      });
      this.addEdge(head, tail, new FieldCollection(field), undefined, {
        label: overrideLabel,
        condition: false,
      });
    } else {
      this.addEdge(head, tail, new FieldCollection(field));
    }
  }

  private isDirectlyProvidedByType(type: ObjectType, fieldName: string) {
    const field = type.field(fieldName);
    // The field is directly provided if:
    //   1) the type does have it.
    //   2) it is not external.
    //   3) it does not have a @require (essentially, this method is called on type implementations of an interface
    //      to decide if we can avoid type-explosion, but if the field has a @require on an implementation, then we
    //      need to type-explode to make sure we handle that @require).
    return field && !this.isExternal(field) && !this.hasDirective(field, (m) => m.requiresDirective());
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
      if (this.isExternal(field) || localRuntimeTypes.some(t => !this.isDirectlyProvidedByType(t, field.name))) {
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
   * then we currently have no edge between `U` and `I1` whatsoever, so query planning would have
   * to type-explode `U` even though that's not necessary (assuming everything is in the same
   * subgraph, we'd want to send the query "as-is").
   * Same thing for:
   * ```
   * {
   *   i1 {
   *     x
   *     ... on I2 {
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
   * Do note that in practice we only add those edges when we build a query graph for query planning
   * purposes, because not type-exploding is only an optimization but type-exploding will always "work"
   * and for composition validation, we don't care about being optimal, while limiting edges make
   * validation faster by limiting the choices to explore. Also, query planning is careful, as
   * it walk those edges, to compute the actual possible runtime types we could have to avoid
   * later type-exploding in impossible runtime types.
   */
  addAdditionalAbstractTypeEdges() {
    // As mentioned above, we only care about this on subgraphs query graphs and during query planning, and
    // we'll have a supergraph when that happens. But if this ever get called in some other path, ignore this.
    if (!this.supergraph) {
      return;
    }

    // For each abstract type in the schema, it's runtime types.
    type AbstractTypeWithRuntimes = {
      type: AbstractType,
      runtimeTypesInSubgraph: readonly ObjectType[],
      runtimeTypesInSupergraph: readonly ObjectType[],
    }
    const abstractTypesWithTheirRuntimeTypes: AbstractTypeWithRuntimes[] = [];
    for (const type of this.schema.types()) {
      if (isAbstractType(type)) {
        const typeInSupergraph = this.supergraph.apiSchema.type(type.name);
        // All "normal" types from subgraphs should be in the supergraph API, but there is a couple exceptions:
        // - subgraphs have the `_Entity` type, which is not in the supergraph.
        // - inaccessible types also won't be in the supergrah.
        // In all those cases, we don't create any additional edges for those types. For inaccessible type, we
        // could theoretically try to add them, but we would need the full supergraph while we currently only
        // have access to the API schema, and besides, inacessible types can only be part of the query execution in
        // indirect ways, through some @requires for instance, and you'd need pretty weird @requires for the
        // optimization here to ever matter.
        if (!typeInSupergraph) {
          continue;
        }
        assert(isAbstractType(typeInSupergraph), () => `${type} should not be a ${type.kind} in a subgraph but a ${typeInSupergraph.kind} in the supergraph`);
        abstractTypesWithTheirRuntimeTypes.push({
          type,
          runtimeTypesInSubgraph: possibleRuntimeTypes(type),
          runtimeTypesInSupergraph: possibleRuntimeTypes(typeInSupergraph),
        });
      }
    }

    // Check every pair of abstract type that intersect on at least 2 runtime types to see if have
    // edges to add. Note that in practice, we only care about 'Union -> Interface' and 'Interface -> Interface'
    for (let i = 0; i < abstractTypesWithTheirRuntimeTypes.length - 1; i++) {
      const t1 = abstractTypesWithTheirRuntimeTypes[i];
      // Note that in general, t1 is already part of the graph `addTypeRecursively` don't really add anything, it
      // just return the existing vertex. That said, if t1 is returned by no field (at least no field reachable from
      // a root type), the type will not be part of the graph. And in that case, we do add it. And it's actually
      // possible that we don't create any edge to that created vertex, so we may be creating a disconnected subset
      // of the graph, a part that is not reachable from any root. It's not optimal, but it's a bit hard to avoid
      // in the first place (we could also try to purge such subset after this method, but it's probably not worth
      // it in general) and it's not a big deal: it will just use a bit more memory than necessary, and it's probably
      // pretty rare in the first place.
      const t1Vertex = this.addTypeRecursively(t1.type);
      for (let j = i; j < abstractTypesWithTheirRuntimeTypes.length; j++) {
        const t2 = abstractTypesWithTheirRuntimeTypes[j];

        // We ignore the pair if both are interfaces and one implements the other. We'll already have appropriate
        // edges if that's the case.
        if (isInterfaceType(t1.type) && isInterfaceType(t2.type) && (t1.type.implementsInterface(t2.type) || t2.type.implementsInterface(t1.type))) {
          continue;
        }

        let addT1ToT2 = false;
        let addT2ToT1 = false;
        if (t1.type === t2.type) {
          // We always add an edge from a type to itself. This is just saying that if we're type-casting to the type we're already
          // on, it's doing nothing, and in particular it shouldn't force us to type-explode anymore that if we didn't had the
          // cast in the first place. Note that we only set `addT1ToT1` to true, otherwise we'd be adding the same edge twice.
          addT1ToT2 = true;
        } else {
          // Otherwise, there is 2 aspects to take into account:
          // - it's only worth adding an edge between types, meaining that we might save type-exploding into the runtime
          //   types of the "target" one, if the local intersection (of runtime types, in the current subgraph) for the
          //   abstract types is more than 2. If it's just 1 type, then going to that type directly is not less efficient
          //   and is more precise in a sense. And if the intersection is empty, then no point in polluting the query graphs
          //   with edges we'll never take.
          // - _but_ we can only save type-exploding if that local intersection does not exclude any runtime types that
          //   are local to the "source" type, not local to the "target" type, *but* are global to the "taget" type,
          //   because such type should not be excluded and only type-explosion will achieve that (for some concrete
          //   example, see the "merged abstract types handling" tests in `buildPlan.test.ts`).
          //   In other words, we don't want to avoid the type explosion if there is a type in the intersection of
          //   the local "source" runtimes and global "target" runtimes that are not in the purely local runtimes
          //   intersection.

          // Everything comes from the same subgraph schema, using reference equality is fine here.
          const intersectingLocal = t1.runtimeTypesInSubgraph.filter(o1 => t2.runtimeTypesInSubgraph.includes(o1));
          if (intersectingLocal.length >= 2) {
            const isInLocalOtherTypeButNotLocalIntersection = (type: ObjectType, otherType: AbstractTypeWithRuntimes) => (
              otherType.runtimeTypesInSubgraph.some((t) => t.name === type.name)
              && !intersectingLocal.some((t) => t.name === type.name)
            );
            // TODO: we're currently _never_ adding the edge if the "target" is a union. We shouldn't be doing that, this
            // will genuinely make some cases less efficient than they could be (though those cases are admittedly a bit convoluted),
            // but this make sense *until* https://github.com/apollographql/federation/issues/2256 gets fixed. Because until
            // then, we do not properly track unions through composition, and that means there is never a difference (in the query
            // planner) between a local union definition and the supergraph one, even if that different actually exists.
            // And so, never type-exploding in that case is somewhat safer, as not-type-exploding is ultimately an optimisation.
            // Please note that this is *not* a fix for #2256, and most of the issues created by #2256 still needs fixing, but
            // it avoids making it even worth for a few corner cases. We should remove the `isUnionType` below once the
            // fix for #2256 is implemented.
            if (!(isUnionType(t2.type) || t2.runtimeTypesInSupergraph.some((rt) => isInLocalOtherTypeButNotLocalIntersection(rt, t1)))) {
              addT1ToT2 = true;
            }
            if (!(isUnionType(t1.type) ||t1.runtimeTypesInSupergraph.some((rt) => isInLocalOtherTypeButNotLocalIntersection(rt, t2)))) {
              addT2ToT1 = true;
            }
          }
        }

        if (addT1ToT2 || addT2ToT1) {
          // Same remark as for t1 above.
          const t2Vertex = this.addTypeRecursively(t2.type);
          if (addT1ToT2) {
            this.addEdge(t1Vertex, t2Vertex, new DownCast(t1.type, t2.type));
          }
          if (addT2ToT1) {
            this.addEdge(t2Vertex, t1Vertex, new DownCast(t2.type, t1.type));
          }
        }
      }
    }
  }

  /**
   * In a subgraph, all entity object type will be "automatically" reachable (from the query root) because
   * of the `_entities` operation. Indeed, it returns `_Entity`, which is a union of all entity object types,
   * making those reachable.
   *
   * However, we also want entity interface types (interface with a @key) to be reachable in a similar way,
   * because the `_entities` operation is also technically the one resolving them, and not having them
   * reachable would break plenty of code that assume that by traversing a query graph from root, we get to
   * everything that can be queried.
   *
   * But because graphQL unions cannot have interface types, they are not part of the `_Entity` union (and
   * cannot be). This is ok as far as the typing of the schema does, because even when `_entities` is called
   * to resolve an interface type, it technically returns a concrete object, and so, since every
   * implementation of an entity interface is also an entity, this is captured by the `_Entity` union.
   *
   * But it does mean we want to manually add the corresponding edges now for interfaces, or @key on
   * interfaces wouldn't work properly (at least whenthe interface is not otherwise reachable by a use operation
   * in the subgraph).
   */
  addInterfaceEntityEdges() {
    const subgraphMetadata = federationMetadata(this.schema);
    assert(subgraphMetadata, () => `${this.name} does not correspond to a subgraph`);
    const entityType = subgraphMetadata.entityType();
    // We can ignore this case because if the subgraph has an interface with a @key, then we force its
    // implementations to be marked as entity too and so we know that if `_Entity` is undefined, then
    // we have no need for entity edges.
    if (!entityType) {
      return;
    }
    const entityTypeVertex = this.addTypeRecursively(entityType);
    const keyDirective = subgraphMetadata.keyDirective();
    for (const itfType of this.schema.interfaceTypes()) {
      if (resolvableKeyApplications(keyDirective, itfType).length > 0) {
        const itfTypeVertex = this.addTypeRecursively(itfType);
        this.addEdge(entityTypeVertex, itfTypeVertex, new DownCast(entityType, itfType));
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
