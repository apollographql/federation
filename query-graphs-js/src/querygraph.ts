import {
  ArgumentDefinition,
  assert,
  MultiMap,
  InterfaceType,
  isInterfaceType,
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
  federationBuiltIns,
  parseSelectionSet,
  DirectiveDefinition,
  isFederationSubgraphSchema,
  FieldDefinition,
  SelectableType
} from '@apollo/core';
import { inspect } from 'util';
import { DownCast, FieldCollection, freeTransition, FreeTransition, Transition, KeyResolution } from './transition';
import { isStructuralFieldSubtype } from './structuralSubtyping';

const FEDERATED_GRAPH_ROOT_SOURCE = "federated_subgraphs";
const FEDERATED_GRAPH_ROOT_SCHEMA = new Schema();

export function federatedGraphRootTypeName(rootKind: SchemaRootKind): string {
  return `[${rootKind}]`;
}

export function isFederatedGraphRootType(type: NamedType) {
  return type.name.startsWith('[') && type.name.endsWith(']');
}

export class Vertex {
  constructor(
    readonly index: number,
    readonly type: NamedType,
    readonly source : string
  ) {}

  toString(): string {
    return `${this.type}[${this.index}](${this.source})`;
  }
}

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

export class FieldSpec {
  readonly args: ReadonlyMap<string, ArgumentDefinition<any>>;

  constructor(readonly name: string, args: ArgumentDefinition<any>[] = []) {
    const m = new Map<string, ArgumentDefinition<any>>();
    for (const arg of args) {
      m.set(arg.name, arg);
    }
    this.args = m;
  }

  toString(): string {
    let str = this.name;
    if (this.args.size > 0) {
      str = str + '(' + [...this.args.values()].map(arg => `${arg.name}: ${arg.type}`) + ')';
    }
    return str;
  }
}

export class Edge {
  private _conditions?: SelectionSet;

  constructor(
    public readonly index: number,
    public readonly head: Vertex,
    public readonly tail: Vertex,
    public readonly transition: Transition,
    conditions?: SelectionSet,
  ) {
    this._conditions = conditions;
  }

  get conditions(): SelectionSet | undefined {
    return this._conditions;
  }

  matchesTransition(otherTransition: Transition): boolean {
    const transition = this.transition;
    switch (transition.kind) {
      case 'FieldCollection':
        if (otherTransition.kind === 'FieldCollection') {
          return isStructuralFieldSubtype(transition.definition, otherTransition.definition);
        } else {
          return false;
        }
      case 'DownCast':
        return otherTransition.kind === 'DownCast' && transition.castedType.name === otherTransition.castedType.name;
      default:
        return transition.kind === otherTransition.kind;
    }
  }

  label(): string {
    if (this.transition instanceof FreeTransition && !this._conditions) {
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
    if (!this._conditions) {
      this._conditions = new SelectionSet(this.head.type as SelectableType);
    }
    this._conditions.mergeIn(newConditions);
  }

  toString(): string {
    return `${this.head} -> ${this.tail} (${this.label()})[${this.index}]`;
  }
}

export class Graph {
  constructor(
    readonly name: string,
    private readonly vertices: Vertex[],
    private readonly adjacencies: Edge[][],
    private readonly typesToVertices: MultiMap<string, number>,
    private readonly rootVertices: Map<SchemaRootKind, RootVertex>,
    readonly sources: ReadonlyMap<string, Schema>
  ) {
  }

  verticesCount(): number {
    return this.vertices.length;
  }

  rootKinds(): readonly SchemaRootKind[] {
    return [...this.rootVertices.keys()];
  }

  roots(): readonly RootVertex[] {
    return [...this.rootVertices.values()];
  }

  root(kind: SchemaRootKind): RootVertex | undefined {
    return this.rootVertices.get(kind);
  }

  /**
   * The edges out of the provided vertex.
   *
   * @param vertex - the vertex for which to return out edges.
   * @returns the list of all the edges out of this vertex.
   */
  outEdges(vertex: Vertex): readonly Edge[] {
    return this.adjacencies[vertex.index];
  }

  outEdge(vertex: Vertex, edgeIndex: number): Edge {
    return this.adjacencies[vertex.index][edgeIndex];
  }

  /**
   * Whether the provided vertex is a terminal one (has no out edges).
   *
   * @param vertex - the vertex to check.
   * @returns whether the provided vertex is terminal.
   */
  isTerminal(vertex: Vertex): boolean {
    return this.outEdges(vertex).length == 0;
  }

  verticesForType(typeName: string): Vertex[] {
    const indexes = this.typesToVertices.get(typeName);
    return indexes == undefined ? [] : indexes.map(i => this.vertices[i]);
  }
}

export class GraphState<VertexState, EdgeState> {
  // Store some "user" state for each vertex (accessed by index)
  private readonly verticesStates: (VertexState | null)[];
  private readonly adjacenciesStates: (EdgeState | null)[][];

  constructor(readonly graph: Graph) {
    this.verticesStates = new Array(graph.verticesCount());
    this.adjacenciesStates = new Array(graph.verticesCount());
  }

  setVertexState(vertex: Vertex, state: VertexState) {
    this.verticesStates[vertex.index] = state;
  }

  //merge(vertex: Vertex, state: State, merger: (s1: State, s2: State) => State) {
  //  const current = this.states[vertex.index];
  //  const merged = !current ? state : merger(current, state);
  //  this.states[vertex.index] =  merged;
  //}

  removeVertexState(vertex: Vertex) {
    this.verticesStates[vertex.index] = null;
  }

  getVertexState(vertex: Vertex): VertexState | null {
    return this.verticesStates[vertex.index];
  }

  setEdgeState(edge: Edge, state: EdgeState) {
    if (!this.adjacenciesStates[edge.head.index]) {
      this.adjacenciesStates[edge.head.index] = new Array(this.graph.outEdges(edge.head).length);
    }
    this.adjacenciesStates[edge.head.index][edge.index] = state;
  }

  removeEdgeState(edge: Edge) {
    this.adjacenciesStates[edge.head.index][edge.index] = null;
  }

  getEdgeState(edge: Edge): EdgeState | null {
    return this.adjacenciesStates[edge.head.index][edge.index];
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

export function buildGraph(name: string, schema: Schema): Graph {
  return buildGraphInternal(name, schema);
}

export function buildGraphInternal(name: string, schema: Schema, supergraphSchema?: Schema): Graph {
  const builder = new GraphBuilderFromSchema(name, schema, supergraphSchema);
  for (const rootType of schema.schemaDefinition.roots()) {
    builder.addRecursivelyFromRoot(rootType.rootKind, rootType.type);
  }
  return builder.build();
}

export function buildSubgraphsFederation(supergraph: Schema, subgraphs: Map<string, Schema>): Graph {
  let graphs = [];
  for (let [name, subgraph] of subgraphs) {
    graphs.push(buildGraphInternal(name, subgraph, supergraph));;
  }
  return federateSubgraphs(graphs);
}

function federatedProperties(subgraphs: Graph[]) : [number, Set<SchemaRootKind>, Schema[]] {
  let vertices = 0;
  const rootKinds = new Set<SchemaRootKind>();
  const schemas: Schema[] = [];
  for (let subgraph of subgraphs) {
    vertices += subgraph.verticesCount();
    subgraph.rootKinds().forEach(k => rootKinds.add(k));
    assert(subgraph.sources.size === 1, `Subgraphs should only have one sources, got ${subgraph.sources.size} ([...${subgraph.sources.keys}])`);
    schemas.push([...subgraph.sources.values()][0]);
  }
  return [vertices + rootKinds.size, rootKinds, schemas];
}

function federateSubgraphs(subgraphs: Graph[]): Graph {
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
  for (let [i, subgraph] of subgraphs.entries()) {
    copyPointers[i] = builder.copyGraph(subgraph);
  }

  // We then add the edges from supergraph roots to the subgraph ones.
  for (let [i, subgraph] of subgraphs.entries()) {
    const copyPointer = copyPointers[i];
    subgraph.rootKinds().forEach(k => builder.addEdge(builder.root(k)!, copyPointer.copiedVertex(subgraph.root(k)!), freeTransition));
  }

  // Then we add/update edges for @key and @requires. We do @provides in a second step because its handling requires
  // copying vertex and their edges, and it's easier to reason about this if we know all keys have already been created.
  for (let [i, subgraph] of subgraphs.entries()) {
    const subgraphSchema = schemas[i];
    const keyDirective = federationBuiltIns.keyDirective(subgraphSchema);
    const requireDirective = federationBuiltIns.requiresDirective(subgraphSchema);
    depthFirstTraversal(
      subgraph,
      v => {
        const type = v.type;
        for (const keyApplication of type.appliedDirectivesOf(keyDirective)) {
          // The @key directive creates an edge from every other subgraphs (having that type)
          // to the current subgraph. In other words, the fact this subgraph has a @key means
          // that the service of the current sugraph can be queried for the entity (through
          // _entities) as long as "the other side" can provide the proper field values.
          // Note that we only require that "the other side" can gather the key fields (through
          // the path conditions; note that it's possible those conditions are never satisfiable),
          // but don't care that it defines the same key, because it's not a technical
          // requirement (and while we probably don't want to allow in general a type to be an
          // entity in some subgraphs but not other, this is not the place to impose that
          // restriction, and this may be useful at least temporarily to allow convert a type to
          // an entity).
          assert(isInterfaceType(type) || isObjectType(type), `Invalid "@key" application on non Object || Interface type "${type}"`);
          const conditions = parseSelectionSet(type, keyApplication.arguments().fields);
          for (let [j, otherSubgraph] of subgraphs.entries()) {
            if (i == j) {
              continue;
            }
            const otherVertices = otherSubgraph.verticesForType(type.name);
            if (otherVertices.length == 0) {
              continue;
            }
            // Note that later, when we've handled @provides, this might not be true anymore a provide may create copy of a
            // certain type. But for now, it's true.
            assert(
              otherVertices.length == 1,
              `Subgraph ${j} should have a single vertex for type ${type.name} but got ${otherVertices.length}: ${inspect(otherVertices)}`);

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
          assert(isInterfaceType(type) || isObjectType(type), `Non-field-based type "${type}" should not have field collection edge ${e}`);
          for (const requiresApplication of field.appliedDirectivesOf(requireDirective)) {
            const conditions = parseSelectionSet(type, requiresApplication.arguments().fields);
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
  for (let [i, subgraph] of subgraphs.entries()) {
    const subgraphSchema = schemas[i];
    const providesDirective = federationBuiltIns.providesDirective(subgraphSchema);
    depthFirstTraversal(
      subgraph,
      _ => {},
      e => {
        // Handling @provides
        if (e.transition.kind === 'FieldCollection') {
          const type = e.head.type;
          const field = e.transition.definition;
          assert(isInterfaceType(type) || isObjectType(type), `Non-field-based type "${type}" should not have field collection edge ${e}`);
          for (const providesApplication of field.appliedDirectivesOf(providesDirective)) {
            const fieldType = field.type!;
            assert(isInterfaceType(fieldType) || isObjectType(fieldType), `Invalid @provide on field "${field}" whose type "${fieldType}" is not an object or interface`)
            const provided = parseSelectionSet(fieldType, providesApplication.arguments().fields);
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
    for (const selection of selectionSet.selections()) {
      const element = selection.element();
      if (element.kind == 'Field') {
        const fieldDef = element.definition;
        const fieldType = baseType(fieldDef.type!);
        if (selection.selectionSet) {
          // We should create a brand new vertex, not reuse the existing one because we're still in
          // the middle of the provide and only a subset of `fieldType` (and in fact, even if all
          // of the fields `fieldType` are provided, maybe only a subset of _those_ field is
          // provided..
          const newVertex = builder.createNewVertex(fieldType, source, schema);
          builder.addEdge(v, newVertex, new FieldCollection(fieldDef));
          stack.push([newVertex, selection.selectionSet]);
        } else {
          // this is a leaf type, we can just reuse the (probably) existing vertex for that leaf type.
          const existing = builder.verticesForType(fieldType.name).find(v => v.source === source);
          const vertex = existing ? existing : builder.createNewVertex(fieldType, v.source, schema);
          builder.addEdge(v, vertex, new FieldCollection(fieldDef));
        }
      } else {
        const typeCondition = element.typeCondition;
        let newVertex = v;
        if (typeCondition) {
          newVertex = builder.createNewVertex(typeCondition, source, schema);
          builder.addEdge(v, newVertex, new DownCast(element.parentType, typeCondition));
        }
        stack.push([newVertex, selection.selectionSet!]);
      }
    }
  }
}

interface SubgraphCopyPointer {
  copiedVertex(original: Vertex): Vertex;
}

class GraphBuilder {
  private readonly vertices: Vertex[];
  private nextIndex: number = 0;
  private readonly adjacencies: Edge[][];
  private readonly typesToVertices: MultiMap<string, number> = new MultiMap();
  private readonly rootVertices: Map<SchemaRootKind, RootVertex> = new Map();
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
    assert(!this.vertices[index], `Overriding existing vertex ${this.vertices[index]} with ${vertex}`);
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
    assert(!this.rootVertices.has(kind), `Root vertex for ${kind} (${this.rootVertices.get(kind)}) already exists: cannot replace by ${vertex}`);
    this.setAsRoot(kind, vertex.index);
  }

  setAsRoot(kind: SchemaRootKind, index: number) {
    const vertex = this.vertices[index];
    assert(vertex, `Cannot set non-existing vertex at index ${index} as root ${kind}`);
    const rootVertex = toRootVertex(vertex, kind);
    this.vertices[vertex.index] = rootVertex;
    this.rootVertices.set(kind, rootVertex);
    const rootEdges = this.adjacencies[vertex.index];
    for (let i = 0; i < rootEdges.length; i++) {
      rootEdges[i] = rootEdges[i].withNewHead(rootVertex);
    }
  }

  copyGraph(graph: Graph): SubgraphCopyPointer {
    const offset = this.nextIndex;
    depthFirstTraversal(
      graph,
      v => {
        this.getOrCopyVertex(v, offset, graph);
      },
      e => {
        const newHead = this.getOrCopyVertex(e.head, offset, graph);
        const newTail = this.getOrCopyVertex(e.tail, offset, graph);
        this.addEdge(newHead, newTail, e.transition, e.conditions);
        return true; // Always traverse edges
      }
    );
    this.nextIndex += graph.verticesCount();
    const that = this;
    return {
      copiedVertex(original: Vertex): Vertex {
        const vertex = that.vertices[original.index + offset];
        assert(vertex, `Vertex ${original} has no copy for offset ${offset}`);
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
   * Replaces the provided edge by an exact copy except for the tail that is said to the provide `newTail` vertex. 
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

  private getOrCopyVertex(toCopy: Vertex, indexOffset: number, graph: Graph): Vertex {
    const index = toCopy.index + indexOffset;
    let v = this.vertices[index];
    if (!v) {
      v = this.createNewVertex(toCopy.type, toCopy.source, graph.sources.get(toCopy.source)!, index);
    }
    return v;
  }

  build(name: string): Graph {
    return new Graph(
      name,
      this.vertices,
      this.adjacencies,
      this.typesToVertices,
      this.rootVertices,
      this.sources);
  }
}

class GraphBuilderFromSchema extends GraphBuilder {
  private readonly isFederatedSubgraph: boolean;
  private readonly externalDirective?: DirectiveDefinition<{}>;

  constructor(
    private readonly name: string,
    private readonly schema: Schema,
    private readonly supergraphSchema?: Schema
  ) {
    super();
    this.isFederatedSubgraph = isFederationSubgraphSchema(schema); 
    this.externalDirective = this.isFederatedSubgraph ? federationBuiltIns.externalDirective(schema) : undefined; 
    assert(!this.isFederatedSubgraph || supergraphSchema, `Missing supergraph schema for building the federated subgraph graph`);
  }

  addRecursivelyFromRoot(kind: SchemaRootKind, root: ObjectType) {
    this.setAsRoot(kind, this.addTypeRecursively(root).index);
  }

  private addTypeRecursively(type: Type): Vertex {
    const namedType = baseType(type);
    const existing = this.verticesForType(namedType.name);
    if (existing.length > 0) {
      assert(existing.length == 1, `Only one vertex should have been created for type ${namedType.name}, got ${existing.length}: ${inspect(this)}`);
      return existing[0];
    }
    const vertex = this.createNewVertex(namedType, this.name, this.schema);
    if (isObjectType(namedType)) {
      this.addObjectTypeEdges(namedType, vertex);
    } else {
      // For interfaces, we generally don't add direct edges for their fields. Because in general, where a particular field can be
      // fetched from may depend on the runtime implementation. However, if the subgraph we're currently including "provides" a
      // particular interface field locally *for all the supergraph interfaces implementations* (in other words, we know we can
      // always ask the field to that subgraph directly on the interface and will never miss anything), then we can add a direct
      // edge to the field for the interface in that subgraph (which avoids unecessary type explosing in practice).
      if (this.isFederatedSubgraph && isInterfaceType(namedType)) {
        this.maybeAddInterfaceFieldsEdges(namedType, vertex);
      }
      if (isInterfaceType(namedType) || isUnionType(namedType)) {
        this.addAbstractTypeEdges(namedType, vertex);
      }
    }
    // Any other case (scalar or enum; inputs at not possible here) is terminal and has no edges to
    // consider.
    return vertex;
  }

  private isExternal(field: FieldDefinition<any>): boolean {
    return this.externalDirective !== undefined && field.hasAppliedDirective(this.externalDirective);
  }

  private addObjectTypeEdges(type: ObjectType, head: Vertex) {
    for (const field of type.fields.values()) {
      // Field marked @external only exists to ensure subgraphs schema are valid graphQL, but they don't really exist as far as federation goes.
      if (this.isExternal(field)) {
        continue;
      }
      const tail = this.addTypeRecursively(field.type!);
      this.addEdge(head, tail, new FieldCollection(field));
    }
  }

  private isProvidedByType(type: ObjectType, fieldName: string) {
    const field = type.field(fieldName);
    return field && !this.isExternal(field);
  }

  private maybeAddInterfaceFieldsEdges(type: InterfaceType, head: Vertex) {
    assert(this.supergraphSchema, 'Missing supergraph schema when building a subgraph');
    const supergraphType = this.supergraphSchema.type(type.name);
    // In theory, the interface might have been marked inaccessible and not be in the supergraph. If that's the case,
    // we just don't add direct edges at all (adding interface edges is an optimization and if the interface is inacessible, it
    // probably doesn't play any role in query planning anyway, so it doesn't matter).
    if (!supergraphType) {
      return;
    }
    const supergraphRuntimeTypes = (supergraphType as InterfaceType).possibleRuntimeTypes().map(t => t.name);
    // Note that it's possible that the current subgraph does not even know some of the possible runtime types of the supergraph.
    // But as edges to interfaces can only come from the current subgraph, it does mean that whatever field led to this
    // interface was resolved in this subgraph and can never return one of those unknonw runtime types. So we can ignore them.
    // TODO: We *must* revisit this once we add @key for interfaces as it will invalidate the "edges to interfaces can only
    // come from the current subgraph". Most likely, _if_ an interface has a key, then we should return early from this
    // function (add no field edges at all) if subgraph don't know of at least one implementation.
    const localRuntimeTypes = supergraphRuntimeTypes.map(t => this.schema.type(t) as ObjectType).filter(t => t !== undefined);
    for (const field of type.fields.values()) {
      // To include the field, it must not be external himself, and it must be present (and non-external) on every of the runtime types
      if (this.isExternal(field) || localRuntimeTypes.some(t => !this.isProvidedByType(t, field.name))) {
        continue;
      }
      const tail = this.addTypeRecursively(field.type!);
      this.addEdge(head, tail, new FieldCollection(field));
    }
  }

  private addAbstractTypeEdges(type: InterfaceType | UnionType, head: Vertex) {
    const implementations = isInterfaceType(type) ? type.possibleRuntimeTypes() : type.types();
    for (const implementationType of implementations) {
      const tail = this.addTypeRecursively(implementationType);
      this.addEdge(head, tail, new DownCast(type, implementationType));
    }
  }

  build(): Graph {
    return super.build(this.name);
  }
}

// A simple depth first traversal of the graph that _ignores_ edge conditions.
export function depthFirstTraversal(
  graph: Graph,
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
