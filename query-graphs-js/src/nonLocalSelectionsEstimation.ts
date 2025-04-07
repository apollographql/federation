import {
  assert,
  assertUnreachable,
  federationMetadata,
  isCompositeType,
  isObjectType,
  OperationElement,
  possibleRuntimeTypes,
  Schema,
  Selection,
  SelectionSet,
  typenameFieldName,
} from '@apollo/federation-internals';
import {
  checkOverrideCondition,
  FEDERATED_GRAPH_ROOT_SOURCE,
  OverrideCondition,
  QueryGraph,
  Vertex,
} from './querygraph';
import { SimultaneousPathsWithLazyIndirectPaths } from './graphPath';

/**
 * Indirect option metadata for the complete digraph for type T. See
 * {@link NonLocalSelectionsMetadata} for more information about how we group
 * indirect options into complete digraphs.
 */
interface IndirectOptionsMetadata {
  /**
   * The members of the complete digraph for type T.
   */
  sameTypeOptions: Set<Vertex>;
  /**
   * Any interface object types I that are reachable for at least one vertex in
   * the complete digraph for type T.
   */
  interfaceObjectOptions: Set<string>;
}

interface FieldTail {
  /**
   * The tail vertex of this field edge.
   */
  tail: Vertex;
  /**
   * The override condition of the field, if it has one.
   */
  overrideCondition?: OverrideCondition;
}

/**
 * Downcasts from normal non-interface-object types, which have regular
 * downcasts to their object type vertices.
 */
interface NonInterfaceObjectDowncasts {
  kind: 'NonInterfaceObject';
  downcasts: Map<string, Vertex>;
};

/**
 * "Fake" downcasts from interface object types to object types that don't
 * really exist in the subgraph schema (and hence have no vertex).
 */
interface InterfaceObjectDowncasts {
  kind: 'InterfaceObject';
  downcasts: Set<string>;
}

/**
 * Downcasts edges to the possible runtime object types of a composite type.
 */
type ObjectTypeDowncasts =
  | NonInterfaceObjectDowncasts
  | InterfaceObjectDowncasts;

export class NonLocalSelectionsMetadata {
  static readonly MAX_NON_LOCAL_SELECTIONS = 100_000;
  /**
   * When a (resolvable) @key exists on a type T in a subgraph, a key resolution
   * edge is created from every subgraph's type T to that subgraph's type T.
   * This similarly holds for root type resolution edges. This means that the
   * vertices of type T with such a @key (or are operation root types) form a
   * complete digraph in the query graph. These indirect options effectively
   * occur as a group in our estimation process, so we track group members here
   * per type name, and precompute units of work relative to these groups.
   * 
   * Interface object types I in a subgraph will only sometimes create a key
   * resolution edge between an implementing type T in a subgraph and that
   * subgraph's type I. This means the vertices of the complete digraph for I
   * are indirect options for such vertices of type T. We track any such types I
   * that are reachable for at least one vertex in the complete digraph for type
   * T here as well.
   */ 
  private readonly typesToIndirectOptions =
    new Map<string, IndirectOptionsMetadata>();
  /**
   * For vertices of a type T that aren't in their complete digraph (due to not
   * having a @key), these remaining vertices will have the complete digraph of
   * T (and any interface object complete digraphs) as indirect options, but
   * these remaining vertices may separately have more indirect options that are
   * not options for the complete digraph of T, specifically if the complete
   * digraph for T has no key resolution edges to an interface object I, but
   * this remaining vertex does. We keep track of such interface object types
   * for those remaining vertices here.
   */
  private readonly remainingVerticesToInterfaceObjectOptions =
    new Map<Vertex, Set<string>>;
  /**
   * A map of field names to the endpoints of field query graph edges with that
   * field name. Note we additionally store the progressive overrides label, if
   * the edge is conditioned on it.
   */
  private readonly fieldsToEndpoints =
    new Map<string, Map<Vertex, FieldTail>>();
  /**
   * A map of type condition names to endpoints of downcast query graph edges
   * with that type condition name, including fake downcasts for interface
   * objects, and a non-existent edge that represents a type condition name 
   * equal to the parent type.
   */
  private readonly inlineFragmentsToEndpoints =
    new Map<string, Map<Vertex, Vertex>>();
  /**
   * A map of composite type vertices to their downcast edges that lead
   * specifically to an object type (i.e., the possible runtime types of the
   * vertex's type).
   */
  private readonly verticesToObjectTypeDowncasts =
    new Map<Vertex, ObjectTypeDowncasts>();
  /**
   * A map of field names to parent vertices whose corresponding type and schema
   * can be rebased on by the field.
   */
  private readonly fieldsToRebaseableParentVertices =
    new Map<string, Set<Vertex>>;
  /**
   * A map of type condition names to parent vertices whose corresponding type
   * and schema can be rebased on by an inline fragment with that type
   * condition.
   */
  private readonly inlineFragmentsToRebaseableParentVertices =
    new Map<string, Set<Vertex>>;

  constructor(graph: QueryGraph) {
    this.precomputeNonLocalSelectionMetadata(graph);
  }

  /**
   * Precompute relevant metadata about the query graph for speeding up the
   * estimation of the count of non-local selections. Note that none of the
   * algorithms used in this function should take any longer algorithmically as
   * the rest of query graph creation (and similarly for query graph memory).
   */
  private precomputeNonLocalSelectionMetadata(graph: QueryGraph) {
    this.precomputeNextVertexMetadata(graph);
    this.precomputeRebasingMetadata(graph);
  }

  private precomputeNextVertexMetadata(graph: QueryGraph) {
    const verticesToInterfaceObjectOptions = new Map<Vertex, Set<string>>();
    for (const edge of graph.allEdges()) {
      switch (edge.transition.kind) {
        case 'FieldCollection': {
          // We skip selections where the tail is a non-composite type, as we'll
          // never need to estimate the next vertices for such selections.
          if (!isCompositeType(edge.tail.type)) {
            continue;
          }
          const fieldName = edge.transition.definition.name;
          let endpointsEntry = this.fieldsToEndpoints.get(fieldName);
          if (!endpointsEntry) {
            endpointsEntry = new Map();
            this.fieldsToEndpoints.set(fieldName, endpointsEntry);
          }
          endpointsEntry.set(edge.head, {
            tail: edge.tail,
            overrideCondition: edge.overrideCondition
          });
          break;
        }
        case 'DownCast': {
          if (isObjectType(edge.transition.castedType)) {
            let downcastsEntry =
              this.verticesToObjectTypeDowncasts.get(edge.head);
            if (!downcastsEntry) {
              downcastsEntry = {
                kind: 'NonInterfaceObject',
                downcasts: new Map(),
              };
              this.verticesToObjectTypeDowncasts.set(edge.head, downcastsEntry);
            }
            assert(
              downcastsEntry.kind === 'NonInterfaceObject',
              () => 'Unexpectedly found interface object with regular object downcasts',
            );
            downcastsEntry.downcasts.set(
              edge.transition.castedType.name,
              edge.tail
            );
          }
          const typeConditionName = edge.transition.castedType.name;
          let endpointsEntry = this.inlineFragmentsToEndpoints
            .get(typeConditionName);
          if (!endpointsEntry) {
            endpointsEntry = new Map();
            this.inlineFragmentsToEndpoints.set(
              typeConditionName,
              endpointsEntry
            );
          }
          endpointsEntry.set(edge.head, edge.tail);
          break;
        }
        case 'InterfaceObjectFakeDownCast': {
          // Note that fake downcasts for interface objects are only created to
          // "fake" object types.
          let downcastsEntry =
            this.verticesToObjectTypeDowncasts.get(edge.head);
          if (!downcastsEntry) {
            downcastsEntry = {
              kind: 'InterfaceObject',
              downcasts: new Set(),
            };
            this.verticesToObjectTypeDowncasts.set(edge.head, downcastsEntry);
          }
          assert(
            downcastsEntry.kind === 'InterfaceObject',
            () => 'Unexpectedly found abstract type with interface object downcasts',
          );
          downcastsEntry.downcasts.add(edge.transition.castedTypeName);
          const typeConditionName = edge.transition.castedTypeName;
          let endpointsEntry = this.inlineFragmentsToEndpoints
            .get(typeConditionName);
          if (!endpointsEntry) {
            endpointsEntry = new Map();
            this.inlineFragmentsToEndpoints.set(
              typeConditionName,
              endpointsEntry
            );
          }
          endpointsEntry.set(edge.head, edge.tail);
          break;
        }
        case 'KeyResolution':
        case 'RootTypeResolution': {
          const headTypeName = edge.head.type.name;
          const tailTypeName = edge.tail.type.name;
          if (headTypeName === tailTypeName) {
            // In this case, we have a non-interface-object key resolution edge
            // or a root type resolution edge. The tail must be part of the
            // complete digraph for the tail's type, so we record the member.
            let indirectOptionsEntry = this.typesToIndirectOptions
              .get(tailTypeName);
            if (!indirectOptionsEntry) {
              indirectOptionsEntry = {
                sameTypeOptions: new Set(),
                interfaceObjectOptions: new Set(),
              };
              this.typesToIndirectOptions.set(
                tailTypeName,
                indirectOptionsEntry,
              );
            }
            indirectOptionsEntry.sameTypeOptions.add(edge.tail);
          } else {
            // Otherwise, this must be an interface object key resolution edge.
            // We don't know the members of the complete digraph for the head's
            // type yet, so we can't set the metadata yet, and instead store the
            // head to interface object type mapping in a temporary map.
            let interfaceObjectOptionsEntry = verticesToInterfaceObjectOptions
              .get(edge.head);
            if (!interfaceObjectOptionsEntry) {
              interfaceObjectOptionsEntry = new Set();
              verticesToInterfaceObjectOptions.set(
                edge.head,
                interfaceObjectOptionsEntry,
              );
            }
            interfaceObjectOptionsEntry.add(tailTypeName);
          }
          break;
        }
        case 'SubgraphEnteringTransition':
          break;
        default:
          assertUnreachable(edge.transition);
      }
    }

    // Now that we've finished computing members of the complete digraphs, we
    // can properly track interface object options.
    for (const [vertex, options] of verticesToInterfaceObjectOptions) {
      const optionsMetadata = this.typesToIndirectOptions.get(vertex.type.name);
      if (optionsMetadata) {
        if (optionsMetadata.sameTypeOptions.has(vertex)) {
          for (const option of options) {
            optionsMetadata.interfaceObjectOptions.add(option);
          }
          continue;
        }
      }
      this.remainingVerticesToInterfaceObjectOptions.set(vertex, options);
    }

    // The interface object options for the complete digraphs are now correct,
    // but we need to subtract these from any interface object options for
    // remaining vertices.
    for (const [vertex, options] of this.remainingVerticesToInterfaceObjectOptions) {
      const indirectOptionsMetadata = this.typesToIndirectOptions
        .get(vertex.type.name);
      if (!indirectOptionsMetadata) {
        continue;
      }
      for (const option of options) {
        if (indirectOptionsMetadata.interfaceObjectOptions.has(option)) {
          options.delete(option);
        }
      }
      // If this subtraction left any interface object option sets empty, we
      // remove them.
      if (options.size === 0) {
        this.remainingVerticesToInterfaceObjectOptions.delete(vertex);
      }
    }

    // For all composite type vertices, we pretend that there's a self-downcast
    // edge for that type, as this simplifies next vertex calculation.
    for (const vertex of graph.allVertices()) {
      if (
        vertex.source === FEDERATED_GRAPH_ROOT_SOURCE
        || !isCompositeType(vertex.type)
      ) {
        continue;
      }
      const typeConditionName = vertex.type.name;
      let endpointsEntry = this.inlineFragmentsToEndpoints
        .get(typeConditionName);
      if (!endpointsEntry) {
        endpointsEntry = new Map();
        this.inlineFragmentsToEndpoints.set(
          typeConditionName,
          endpointsEntry
        );
      }
      endpointsEntry.set(vertex, vertex);
      if (!isObjectType(vertex.type)) {
        continue;
      }
      const metadata = federationMetadata(vertex.type.schema());
      assert(
        metadata,
        () => 'Subgraph schema unexpectedly did not have subgraph metadata',
      );
      if (metadata.isInterfaceObjectType(vertex.type)) {
        continue;
      }
      let downcastsEntry = this.verticesToObjectTypeDowncasts.get(vertex);
      if (!downcastsEntry) {
        downcastsEntry = {
          kind: 'NonInterfaceObject',
          downcasts: new Map(),
        };
        this.verticesToObjectTypeDowncasts.set(vertex, downcastsEntry);
      }
      assert(
        downcastsEntry.kind === 'NonInterfaceObject',
        () => 'Unexpectedly found object type with interface object downcasts in supergraph',
      );
      downcastsEntry.downcasts.set(typeConditionName, vertex);
    }
  }

  private precomputeRebasingMetadata(graph: QueryGraph) {
    // We need composite-types-to-vertices map by source for the federated query
    // graph, so we compute that here.
    const compositeTypesToVerticesBySource =
      new Map<string, Map<string, Set<Vertex>>>();
    for (const vertex of graph.allVertices()) {
      if (
        vertex.source === FEDERATED_GRAPH_ROOT_SOURCE
        || !isCompositeType(vertex.type)
      ) {
        continue;
      }
      let typesToVerticesEntry = compositeTypesToVerticesBySource
        .get(vertex.source);
      if (!typesToVerticesEntry) {
        typesToVerticesEntry = new Map();
        compositeTypesToVerticesBySource.set(
          vertex.source,
          typesToVerticesEntry
        );
      }
      let verticesEntry = typesToVerticesEntry.get(vertex.type.name);
      if (!verticesEntry) {
        verticesEntry = new Set();
        typesToVerticesEntry.set(vertex.type.name, verticesEntry);
      }
      verticesEntry.add(vertex);
    }

    // For each subgraph schema, we iterate through its composite types, so that
    // we can collect metadata relevant to rebasing.
    for (const [source, schema] of graph.sources) {
      if (source === FEDERATED_GRAPH_ROOT_SOURCE) {
        continue;
      }
      // We pass through each composite type, recording whether the field can be
      // rebased on it along with interface implements/union membership
      // relationships.
      const fieldsToRebaseableTypes = new Map<string, Set<string>>();
      const objectTypesToImplementingCompositeTypes =
        new Map<string, Set<string>>();
      const metadata = federationMetadata(schema);
      assert(
        metadata,
        () => 'Subgraph schema unexpectedly did not have subgraph metadata',
      );
      const fromContextDirectiveName = metadata.fromContextDirective().name;
      for (const type of schema.types()) {
        switch (type.kind) {
          case 'ObjectType': {
            // Record fields that don't contain @fromContext as being rebaseable
            // (also including __typename).
            for (const field of type.fields()) {
              if (field.arguments().some((arg) => 
                arg.hasAppliedDirective(fromContextDirectiveName)
              )) {
                continue;
              }
              let rebaseableTypesEntry =
                fieldsToRebaseableTypes.get(field.name);
              if (!rebaseableTypesEntry) {
                rebaseableTypesEntry = new Set();
                fieldsToRebaseableTypes.set(field.name, rebaseableTypesEntry);
              }
              rebaseableTypesEntry.add(type.name);
            }
            let rebaseableTypesEntry =
              fieldsToRebaseableTypes.get(typenameFieldName);  
            if (!rebaseableTypesEntry) {
              rebaseableTypesEntry = new Set();
              fieldsToRebaseableTypes.set(
                typenameFieldName,
                rebaseableTypesEntry
              );
            }
            rebaseableTypesEntry.add(type.name);
            // Record the object type as implementing itself.
            let implementingObjectTypesEntry =
              objectTypesToImplementingCompositeTypes.get(type.name);
            if (!implementingObjectTypesEntry) {
              implementingObjectTypesEntry = new Set();
              objectTypesToImplementingCompositeTypes.set(
                type.name,
                implementingObjectTypesEntry,
              );
            }
            implementingObjectTypesEntry.add(type.name);
            // For each implements, record the interface type as an implementing
            // type.
            for (const interfaceImplementation of type.interfaceImplementations()) {
              implementingObjectTypesEntry.add(
                interfaceImplementation.interface.name
              );
            }
            break;
          }
          case 'InterfaceType': {
            // Record fields that don't contain @fromContext as being rebaseable
            // (also including __typename).
            for (const field of type.fields()) {
              if (field.arguments().some((arg) => 
                arg.hasAppliedDirective(fromContextDirectiveName)
              )) {
                continue;
              }
              let rebaseableTypesEntry =
                fieldsToRebaseableTypes.get(field.name);
              if (!rebaseableTypesEntry) {
                rebaseableTypesEntry = new Set();
                fieldsToRebaseableTypes.set(field.name, rebaseableTypesEntry);
              }
              rebaseableTypesEntry.add(type.name);
            }
            let rebaseableTypesEntry =
              fieldsToRebaseableTypes.get(typenameFieldName);  
            if (!rebaseableTypesEntry) {
              rebaseableTypesEntry = new Set();
              fieldsToRebaseableTypes.set(
                typenameFieldName,
                rebaseableTypesEntry
              );
            }
            rebaseableTypesEntry.add(type.name);
            break;
          }
          case 'UnionType': {
            // Just record the __typename field as being rebaseable.
            let rebaseableTypesEntry =
              fieldsToRebaseableTypes.get(typenameFieldName);  
            if (!rebaseableTypesEntry) {
              rebaseableTypesEntry = new Set();
              fieldsToRebaseableTypes.set(
                typenameFieldName,
                rebaseableTypesEntry
              );
            }
            rebaseableTypesEntry.add(type.name);
            // For each member, record the union type as an implementing type.
            for (const member of type.members()) {
              let implementingObjectTypesEntry =
                objectTypesToImplementingCompositeTypes.get(member.type.name);
              if (!implementingObjectTypesEntry) {
                implementingObjectTypesEntry = new Set();
                objectTypesToImplementingCompositeTypes.set(
                  member.type.name,
                  implementingObjectTypesEntry,
                );
              }
              implementingObjectTypesEntry.add(type.name);
            }
            break;
          }
          case 'ScalarType':
          case 'EnumType':
          case 'InputObjectType':
            break;
          default:
            assertUnreachable(type);
        }
      }

      // With the interface implements/union membership relationships, we can
      // compute which pairs of types have at least one possible runtime type in
      // their intersection, and are thus rebaseable.
      const inlineFragmentsToRebaseableTypes = new Map<string, Set<string>>();
      for (const implementingTypes of objectTypesToImplementingCompositeTypes.values()) {
        for (const typeName of implementingTypes) {
          let rebaseableTypesEntry =
            inlineFragmentsToRebaseableTypes.get(typeName);  
          if (!rebaseableTypesEntry) {
            rebaseableTypesEntry = new Set();
            fieldsToRebaseableTypes.set(typeName, rebaseableTypesEntry);
          }
          for (const implementingType of implementingTypes) {
            rebaseableTypesEntry.add(implementingType);
          }
        }
      }

      // Finally, we can compute the vertices for the rebaseable types, as we'll
      // be working with those instead of types when checking whether an
      // operation element can be rebased.
      const compositeTypesToVertices =
        compositeTypesToVerticesBySource.get(source)
          ?? new Map<string, Set<Vertex>>();
      for (const [fieldName, types] of fieldsToRebaseableTypes) {
        let rebaseableParentVerticesEntry =
          this.fieldsToRebaseableParentVertices.get(fieldName);
        if (!rebaseableParentVerticesEntry) {
          rebaseableParentVerticesEntry = new Set();
          this.fieldsToRebaseableParentVertices.set(
            fieldName,
            rebaseableParentVerticesEntry,
          );
        }
        for (const type of types) {
          const vertices = compositeTypesToVertices.get(type);
          if (vertices) {
            for (const vertex of vertices) {
              rebaseableParentVerticesEntry.add(vertex);
            }
          }
        }
      }
      for (const [typeConditionName, types] of inlineFragmentsToRebaseableTypes) {
        let rebaseableParentVerticesEntry =
        this.inlineFragmentsToRebaseableParentVertices.get(typeConditionName);
        if (!rebaseableParentVerticesEntry) {
          rebaseableParentVerticesEntry = new Set();
          this.inlineFragmentsToRebaseableParentVertices.set(
            typeConditionName,
            rebaseableParentVerticesEntry,
          );
        }
        for (const type of types) {
          const vertices = compositeTypesToVertices.get(type);
          if (vertices) {
            for (const vertex of vertices) {
              rebaseableParentVerticesEntry.add(vertex);
            }
          }
        }
      }
    }
  }

  /**
   * This calls {@link checkNonLocalSelectionsLimitExceeded} for each of the
   * selections in the open branches stack; see that function's doc comment for
   * more information.
   */
  checkNonLocalSelectionsLimitExceededAtRoot(
    stack: [Selection, SimultaneousPathsWithLazyIndirectPaths[]][],
    state: NonLocalSelectionsState,
    supergraphSchema: Schema,
    inconsistentAbstractTypesRuntimes: Set<string>,
    overrideConditions: Map<string, boolean>,
  ): boolean {
    for (const [selection, simultaneousPaths] of stack) {
      const tailVertices = new Set<Vertex>();
      for (const simultaneousPath of simultaneousPaths) {
        for (const path of simultaneousPath.paths) {
          tailVertices.add(path.tail);
        }
      }
      const tailVerticesInfo =
        this.estimateVerticesWithIndirectOptions(tailVertices);

      // Note that top-level selections aren't avoided via fully-local selection
      // set optimization, so we always add them here.
      if (this.updateCount(1, tailVertices.size, state)) {
        return true;
      }

      if (selection.selectionSet) {
        const selectionHasDefer = selection.hasDefer();
        const nextVertices = this.estimateNextVerticesForSelection(
          selection.element,
          tailVerticesInfo,
          state,
          supergraphSchema,
          overrideConditions,
        );
        if (this.checkNonLocalSelectionsLimitExceeded(
          selection.selectionSet,
          nextVertices,
          selectionHasDefer,
          state,
          supergraphSchema,
          inconsistentAbstractTypesRuntimes,
          overrideConditions,
        )) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * When recursing through a selection set to generate options from each
   * element, there is an optimization that allows us to avoid option
   * exploration if a selection set is "fully local" from all the possible
   * vertices we could be at in the query graph.
   *
   * This function computes an approximate upper bound on the number of
   * selections in a selection set that wouldn't be avoided by such an
   * optimization (i.e. the "non-local" selections), and adds it to the given
   * count in the state. Note that the count for a given selection set is scaled
   * by an approximate upper bound on the possible number of tail vertices for
   * paths ending at that selection set. If at any point, the count exceeds
   * `MAX_NON_LOCAL_SELECTIONS`, then this function will return `true`.
   *
   * This function's code is closely related to
   * `selectionIsFullyLocalFromAllVertices()` (which implements the
   * aforementioned optimization). However, when it comes to traversing the
   * query graph, we generally ignore the effects of edge pre-conditions and
   * other optimizations to option generation for efficiency's sake, giving us
   * an upper bound since the extra vertices may fail some of the checks (e.g.
   * the selection set may not rebase on them).
   *
   * Note that this function takes in whether the parent selection of the
   * selection set has @defer, as that affects whether the optimization is
   * disabled for that selection set.
   */
  private checkNonLocalSelectionsLimitExceeded(
    selectionSet: SelectionSet,
    parentVertices: NextVerticesInfo,
    parentSelectionHasDefer: boolean,
    state: NonLocalSelectionsState,
    supergraphSchema: Schema,
    inconsistentAbstractTypesRuntimes: Set<string>,
    overrideConditions: Map<string, boolean>,
  ): boolean {
    // Compute whether the selection set is non-local, and if so, add its
    // selections to the count. Any of the following causes the selection set to
    // be non-local.
    // 1. The selection set's vertices having at least one reachable
    //    cross-subgraph edge.
    // 2. The parent selection having @defer.
    // 3. Any selection in the selection set having @defer.
    // 4. Any selection in the selection set being an inline fragment whose type
    //    condition has inconsistent runtime types across subgraphs.
    // 5. Any selection in the selection set being unable to be rebased on the
    //    selection set's vertices.
    // 6. Any nested selection sets causing the count to be incremented.
    let selectionSetIsNonLocal =
      parentVertices.nextVerticesHaveReachableCrossSubgraphEdges
        || parentSelectionHasDefer;
    for (const selection of selectionSet.selections()) {
      const element = selection.element;
      const selectionHasDefer = element.hasDefer();
      const selectionHasInconsistentRuntimeTypes =
        element.kind === 'FragmentElement'
          && element.typeCondition
          && inconsistentAbstractTypesRuntimes.has(element.typeCondition.name);
      
      const oldCount = state.count;
      if (selection.selectionSet) {
        const nextVertices = this.estimateNextVerticesForSelection(
          element,
          parentVertices,
          state,
          supergraphSchema,
          overrideConditions,
        );
        if (this.checkNonLocalSelectionsLimitExceeded(
          selection.selectionSet,
          nextVertices,
          selectionHasDefer,
          state,
          supergraphSchema,
          inconsistentAbstractTypesRuntimes,
          overrideConditions,
        )) {
          return true;
        }
      }

      selectionSetIsNonLocal ||= selectionHasDefer
        || selectionHasInconsistentRuntimeTypes
        || (oldCount != state.count);
    }
    // Determine whether the selection can be rebased on all selection set
    // vertices (without indirect options). This is more expensive, so we do
    // this last/only if needed. Note that we were originally calling a slightly
    // modified `canAddTo()` to mimic the logic in
    // `selectionIsFullyLocalFromAllVertices()`, but this ended up being rather
    // expensive in practice, so an optimized version using precomputation is
    // used below.
    if (!selectionSetIsNonLocal && parentVertices.nextVertices.size > 0) {
      outer: for (const selection of selectionSet.selections()) {
        switch (selection.kind) {
          case 'FieldSelection': {
            // Note that while the precomputed metadata accounts for
            // @fromContext, it doesn't account for checking whether the
            // operation field's parent type either matches the subgraph
            // schema's parent type name or is an interface type. Given current
            // composition rules, this should always be the case when rebasing
            // supergraph/API schema queries onto one of its subgraph schema, so
            // we avoid the check here for performance.
            const rebaseableParentVertices =
              this.fieldsToRebaseableParentVertices
                .get(selection.element.definition.name);
            if (!rebaseableParentVertices) {
              selectionSetIsNonLocal = true;
              break outer;
            }
            for (const vertex of parentVertices.nextVertices) {
              if (!rebaseableParentVertices.has(vertex)) {
                selectionSetIsNonLocal = true;
                break outer;
              }
            }
            break;
          }
          case 'FragmentSelection': {
            const typeConditionName = selection.element.typeCondition?.name;
            if (!typeConditionName) {
              // Inline fragments without type conditions can always be rebased.
              continue;
            }
            const rebaseableParentVertices =
              this.inlineFragmentsToRebaseableParentVertices
                .get(typeConditionName);
            if (!rebaseableParentVertices) {
              selectionSetIsNonLocal = true;
              break outer;
            }
            for (const vertex of parentVertices.nextVertices) {
              if (!rebaseableParentVertices.has(vertex)) {
                selectionSetIsNonLocal = true;
                break outer;
              }
            }
            break;
          }
          default:
            assertUnreachable(selection);
        }
      }
    }
    return selectionSetIsNonLocal && this.updateCount(
      selectionSet.selections().length,
      parentVertices.nextVertices.size,
      state,
    );
  }

  /**
   * Updates the non-local selection set count in the state, returning true if
   * this causes the count to exceed `MAX_NON_LOCAL_SELECTIONS`.
   */
  private updateCount(
    numSelections: number,
    numParentVertices: number,
    state: NonLocalSelectionsState,
  ): boolean {
    const additional_count = numSelections * numParentVertices;
    const new_count = state.count + additional_count;
    if (new_count > NonLocalSelectionsMetadata.MAX_NON_LOCAL_SELECTIONS) {
      return true;
    }
    state.count = new_count;
    return false;
  }

  /**
   * In `checkNonLocalSelectionsLimitExceeded()`, when handling a given
   * selection for a set of parent vertices (including indirect options), this
   * function can be used to estimate an upper bound on the next vertices after
   * taking the selection (also with indirect options).
   */
  private estimateNextVerticesForSelection(
    element: OperationElement,
    parentVertices: NextVerticesInfo,
    state: NonLocalSelectionsState,
    supergraphSchema: Schema,
    overrideConditions: Map<string, boolean>,
  ): NextVerticesInfo {
    const selectionKey = element.kind === 'Field'
      ? element.definition.name
      : element.typeCondition?.name;
    if (!selectionKey) {
      // For empty type condition, the vertices don't change.
      return parentVertices;
    }
    let cache = state.nextVerticesCache.get(selectionKey);
    if (!cache) {
      cache = {
        typesToNextVertices: new Map(),
        remainingVerticesToNextVertices: new Map(),
      };
      state.nextVerticesCache.set(selectionKey, cache);
    }
    const nextVerticesInfo: NextVerticesInfo = {
      nextVertices: new Set(),
      nextVerticesHaveReachableCrossSubgraphEdges: false,
      nextVerticesWithIndirectOptions: {
        types: new Set(),
        remainingVertices: new Set(),
      }
    }
    for (const typeName of parentVertices.nextVerticesWithIndirectOptions.types) {
      let cacheEntry = cache.typesToNextVertices.get(typeName);
      if (!cacheEntry) {
        const indirectOptions = this.typesToIndirectOptions.get(typeName);
        assert(
          indirectOptions,
          () => 'Unexpectedly missing vertex information for cached type',
        );
        cacheEntry = this.estimateNextVerticesForSelectionWithoutCaching(
          element,
          indirectOptions.sameTypeOptions,
          supergraphSchema,
          overrideConditions,
        );
        cache.typesToNextVertices.set(typeName, cacheEntry);
      }
      this.mergeNextVerticesInfo(cacheEntry, nextVerticesInfo);
    }
    for (const vertex of parentVertices.nextVerticesWithIndirectOptions.remainingVertices) {
      let cacheEntry = cache.remainingVerticesToNextVertices.get(vertex);
      if (!cacheEntry) {
        cacheEntry = this.estimateNextVerticesForSelectionWithoutCaching(
          element,
          [vertex],
          supergraphSchema,
          overrideConditions,
        );
        cache.remainingVerticesToNextVertices.set(vertex, cacheEntry);
      }
      this.mergeNextVerticesInfo(cacheEntry, nextVerticesInfo);
    }
    return nextVerticesInfo;
  }

  private mergeNextVerticesInfo(
    source: NextVerticesInfo,
    target: NextVerticesInfo
  ) {
    for (const vertex of source.nextVertices) {
      target.nextVertices.add(vertex);
    }
    target.nextVerticesHaveReachableCrossSubgraphEdges ||=
      source.nextVerticesHaveReachableCrossSubgraphEdges;
    this.mergeVerticesWithIndirectOptionsInfo(
      source.nextVerticesWithIndirectOptions,
      target.nextVerticesWithIndirectOptions,
    );
  }

  private mergeVerticesWithIndirectOptionsInfo(
    source: VerticesWithIndirectOptionsInfo,
    target: VerticesWithIndirectOptionsInfo,
  ) {
    for (const type of source.types) {
      target.types.add(type);
    }
    for (const vertex of source.remainingVertices) {
      target.remainingVertices.add(vertex);
    }
  }

  /**
   * Estimate an upper bound on the next vertices after taking the selection on
   * the given parent vertices. Because we're just trying for an upper bound, we
   * assume we can always take type-preserving non-collecting transitions, we
   * ignore any conditions on the selection edge, and we always type-explode.
   * (We do account for override conditions, which are relatively
   * straightforward.)
   *
   * Since we're iterating through next vertices in the process, for efficiency
   * sake we also compute whether there are any reachable cross-subgraph edges
   * from the next vertices (without indirect options). This method assumes that
   * inline fragments have type conditions.
   */
  private estimateNextVerticesForSelectionWithoutCaching(
    element: OperationElement,
    parentVertices: Iterable<Vertex>,
    supergraphSchema: Schema,
    overrideConditions: Map<string, boolean>,
  ): NextVerticesInfo {
    const nextVertices = new Set<Vertex>();
    switch (element.kind) {
      case 'Field': {
        const fieldEndpoints = this.fieldsToEndpoints
          .get(element.definition.name);
        const processHeadVertex = (vertex: Vertex) => {
          const fieldTail = fieldEndpoints?.get(vertex);
          if (!fieldTail) {
            return;
          }
          if (fieldTail.overrideCondition) {
            if (checkOverrideCondition(
              fieldTail.overrideCondition,
              overrideConditions,
            )) {
              nextVertices.add(fieldTail.tail);
            }
          } else {
            nextVertices.add(fieldTail.tail);
          }
        };
        for (const vertex of parentVertices) {
          // As an upper bound for efficiency sake, we consider both
          // non-type-exploded and type-exploded options.
          processHeadVertex(vertex);
          const downcasts = this.verticesToObjectTypeDowncasts.get(vertex);
          if (!downcasts) {
            continue;
          }
          // Interface object fake downcasts only go back to the self vertex, so
          // we ignore them.
          if (downcasts.kind === 'NonInterfaceObject') {
            for (const vertex of downcasts.downcasts.values()) {
              processHeadVertex(vertex);
            }
          }
        }
        break;
      }
      case 'FragmentElement': {
        const typeConditionName = element.typeCondition?.name;
        assert(
          typeConditionName,
          () => 'Inline fragment unexpectedly had no type condition',
        );
        const inlineFragmentEndpoints = this.inlineFragmentsToEndpoints
          .get(typeConditionName);
        // If we end up computing runtime types for the type condition, only do
        // it once.
        let runtimeTypes: Set<string> | null = null;
        for (const vertex of parentVertices) {
          // We check whether there's already a (maybe fake) downcast edge for
          // the type condition (note that we've inserted fake downcasts for
          // same-type type conditions into the metadata).
          const nextVertex = inlineFragmentEndpoints?.get(vertex);
          if (nextVertex) {
            nextVertices.add(nextVertex);
            continue;
          }

          // If not, then we need to type explode across the possible runtime
          // types (in the supergraph schema) for the type condition.
          const downcasts = this.verticesToObjectTypeDowncasts.get(vertex);
          if (!downcasts) {
            continue;
          }
          if (!runtimeTypes) {
            const typeInSupergraph = supergraphSchema.type(typeConditionName);
            assert(
              typeInSupergraph && isCompositeType(typeInSupergraph),
              () => 'Type unexpectedly missing or non-composite in supergraph schema',
            );
            runtimeTypes = new Set<string>();
            for (const type of possibleRuntimeTypes(typeInSupergraph)) {
              runtimeTypes.add(type.name);
            }
          }

          switch (downcasts.kind) {
            case 'NonInterfaceObject': {
              for (const [typeName, vertex] of downcasts.downcasts) {
                if (runtimeTypes.has(typeName)) {
                  nextVertices.add(vertex);
                }
              }
              break;
            }
            case 'InterfaceObject': {
              for (const typeName of downcasts.downcasts) {
                if (runtimeTypes.has(typeName)) {
                  // Note that interface object fake downcasts are self edges,
                  // so we're done once we find one.
                  nextVertices.add(vertex);
                  break;
                }
              }
              break;
            }
            default:
              assertUnreachable(downcasts);
          }
        }
        break;
      }
      default:
        assertUnreachable(element);
    }

    return this.estimateVerticesWithIndirectOptions(nextVertices);
  }

  /**
   * Estimate the indirect options for the given next vertices, and add them to
   * the given vertices. As an upper bound for efficiency's sake, we assume we
   * can take any indirect option (i.e. ignore any edge conditions).
   */
  private estimateVerticesWithIndirectOptions(
    nextVertices: Set<Vertex>,
  ): NextVerticesInfo {
    const nextVerticesInfo: NextVerticesInfo = {
      nextVertices,
      nextVerticesHaveReachableCrossSubgraphEdges: false,
      nextVerticesWithIndirectOptions: {
        types: new Set(),
        remainingVertices: new Set(),
      }
    };
    for (const nextVertex of nextVertices) {
      nextVerticesInfo.nextVerticesHaveReachableCrossSubgraphEdges ||=
        nextVertex.hasReachableCrossSubgraphEdges;
      
      const typeName = nextVertex.type.name
      const optionsMetadata = this.typesToIndirectOptions.get(typeName);
      if (optionsMetadata) {
        // If there's an entry in `typesToIndirectOptions` for the type, then
        // the complete digraph for T is non-empty, so we add its type. If it's
        // our first time seeing this type, we also add any of the complete
        // digraph's interface object options.
        if (
          !nextVerticesInfo.nextVerticesWithIndirectOptions.types.has(typeName)
        ) {
          nextVerticesInfo.nextVerticesWithIndirectOptions.types.add(typeName);
          for (const option of optionsMetadata.interfaceObjectOptions) {
            nextVerticesInfo.nextVerticesWithIndirectOptions.types.add(option);
          }
        }
        // If the vertex is a member of the complete digraph, then we don't need
        // to separately add the remaining vertex.
        if (optionsMetadata.sameTypeOptions.has(nextVertex)) {
          continue;
        }
      }
      // We need to add the remaining vertex, and if its our first time seeing
      // it, we also add any of its interface object options.
      if (
        !nextVerticesInfo.nextVerticesWithIndirectOptions.remainingVertices
          .has(nextVertex)
      ) {
        nextVerticesInfo.nextVerticesWithIndirectOptions.remainingVertices
          .add(nextVertex);
        const options = this.remainingVerticesToInterfaceObjectOptions
          .get(nextVertex);
        if (options) {
          for (const option of options) {
            nextVerticesInfo.nextVerticesWithIndirectOptions.types.add(option);
          }
        }
      }
    }

    return nextVerticesInfo;
  }
}

interface NextVerticesCache {
  /**
   * This is the merged next vertex info for selections on the set of vertices
   * in the complete digraph for the given type T. Note that this does not merge
   * in the next vertex info for any interface object options reachable from
   * vertices in that complete digraph for T.
   */
  typesToNextVertices: Map<string, NextVerticesInfo>,
  /**
   * This is the next vertex info for selections on the given vertex. Note that
   * this does not merge in the next vertex info for any interface object
   * options reachable from that vertex.
   */
  remainingVerticesToNextVertices: Map<Vertex, NextVerticesInfo>,
}

interface NextVerticesInfo {
  /**
   * The next vertices after taking the selection.
   */
  nextVertices: Set<Vertex>,
  /**
   * Whether any cross-subgraph edges are reachable from any next vertices.
   */
  nextVerticesHaveReachableCrossSubgraphEdges: boolean,
  /**
   * These are the next vertices along with indirect options, represented
   * succinctly by the types of any complete digraphs along with remaining
   * vertices.
   */
  nextVerticesWithIndirectOptions: VerticesWithIndirectOptionsInfo,
}

interface VerticesWithIndirectOptionsInfo {
  /**
   * For indirect options that are representable as complete digraphs for a type
   * T, these are those types.
   */
  types: Set<string>,
  /**
   * For any vertices of type T that aren't in their complete digraphs for type
   * T, these are those vertices.
   */
  remainingVertices: Set<Vertex>,
}

export class NonLocalSelectionsState {
  /**
   * An estimation of the number of non-local selections for the whole operation
   * (where the count for a given selection set is scaled by the number of tail
   * vertices at that selection set). Note this does not count selections from
   * recursive query planning.
   */
  count = 0;
  /**
   * Whenever we take a selection on a set of vertices with indirect options, we
   * cache the resulting vertices here. The map key for field selections is the
   * field's name and for inline fragment selections is the type condition's
   * name.
   */
  readonly nextVerticesCache = new Map<string, NextVerticesCache>;
}
