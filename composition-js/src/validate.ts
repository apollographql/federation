import {
  addSubgraphToASTNode,
  assert,
  CompositeType,
  DirectiveDefinition,
  ERRORS,
  Field,
  FieldDefinition,
  FieldSelection,
  FragmentElement,
  InputType,
  isAbstractType,
  isCompositeType,
  isDefined,
  isLeafType,
  isNullableType,
  isObjectType,
  joinStrings,
  MultiMap,
  newDebugLogger,
  Operation,
  operationToDocument,
  printHumanReadableList,
  printSubgraphNames,
  Schema,
  SchemaRootKind,
  Selection,
  selectionOfElement,
  SelectionSet,
  SubgraphASTNode,
  selectionSetOf,
  typenameFieldName,
  validateSupergraph,
  VariableDefinitions,
  isOutputType,
  JoinFieldDirectiveArguments,
} from "@apollo/federation-internals";
import {
  Edge,
  federatedGraphRootTypeName,
  QueryGraph,
  subgraphEnteringTransition,
  GraphPath,
  RootPath,
  advancePathWithTransition,
  Transition,
  QueryGraphState,
  Unadvanceables,
  isUnadvanceable,
  Unadvanceable,
  noConditionsResolution,
  TransitionPathWithLazyIndirectPaths,
  RootVertex,
  simpleValidationConditionResolver,
  ConditionResolver,
} from "@apollo/query-graphs";
import { CompositionHint, HINTS } from "./hints";
import { ASTNode, GraphQLError, print } from "graphql";

const debug = newDebugLogger('validation');

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly supergraphUnsatisfiablePath: RootPath<Transition>,
    readonly subgraphsPaths: RootPath<Transition>[],
    readonly witness: Operation
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

function satisfiabilityError(
  unsatisfiablePath: RootPath<Transition>,
  subgraphsPaths: RootPath<Transition>[],
  subgraphsPathsUnadvanceables: Unadvanceables[]
): GraphQLError {
  const witness = buildWitnessOperation(unsatisfiablePath);
  const operation = print(operationToDocument(witness));
  const message = `The following supergraph API query:\n${operation}\n`
    + 'cannot be satisfied by the subgraphs because:\n'
    + displayReasons(subgraphsPathsUnadvanceables);
  const error = new ValidationError(message, unsatisfiablePath, subgraphsPaths, witness);
  return ERRORS.SATISFIABILITY_ERROR.err(error.message, {
    originalError: error,
  });
}

function subgraphNodes(state: ValidationState, extractNode: (schema: Schema) => ASTNode | undefined): SubgraphASTNode[] {
  return state.currentSubgraphs().map(({name, schema}) => {
    const node = extractNode(schema);
    return node ? addSubgraphToASTNode(node, name) : undefined;
  }).filter(isDefined);
}

function shareableFieldNonIntersectingRuntimeTypesError(
  invalidState: ValidationState,
  field: FieldDefinition<CompositeType>,
  runtimeTypesToSubgraphs: MultiMap<string, string>,
): GraphQLError {
  const witness = buildWitnessOperation(invalidState.supergraphPath);
  const operation = print(operationToDocument(witness));
  const typeStrings = [...runtimeTypesToSubgraphs].map(([ts, subgraphs]) => ` - in ${printSubgraphNames(subgraphs)}, ${ts}`);
  const message = `For the following supergraph API query:\n${operation}`
    + `\nShared field "${field.coordinate}" return type "${field.type}" has a non-intersecting set of possible runtime types across subgraphs. Runtime types in subgraphs are:`
    + `\n${typeStrings.join(';\n')}.`
    + `\nThis is not allowed as shared fields must resolve the same way in all subgraphs, and that imply at least some common runtime types between the subgraphs.`;
  const error = new ValidationError(message, invalidState.supergraphPath, invalidState.subgraphPaths.map((p) => p.path), witness);
  return ERRORS.SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES.err(error.message, {
    nodes: subgraphNodes(invalidState, (s) => (s.type(field.parent.name) as CompositeType | undefined)?.field(field.name)?.sourceAST),
  });
}

function shareableFieldMismatchedRuntimeTypesHint(
  state: ValidationState,
  field: FieldDefinition<CompositeType>,
  commonRuntimeTypes: string[],
  runtimeTypesPerSubgraphs: MultiMap<string, string>,
): CompositionHint {
  const witness = buildWitnessOperation(state.supergraphPath);
  const operation = print(operationToDocument(witness));
  const allSubgraphs = state.currentSubgraphNames();
  const printTypes = (ts: string[]) => printHumanReadableList(
    ts.map((t) => '"' + t + '"'),
    {
      prefix: 'type',
      prefixPlural: 'types'
    }
  );
  const subgraphsWithTypeNotInIntersectionString = allSubgraphs.map((s) => {
    const typesToNotImplement = runtimeTypesPerSubgraphs.get(s)!.filter((t) => !commonRuntimeTypes.includes(t));
    if (typesToNotImplement.length === 0) {
      return undefined;
    }
    return ` - subgraph "${s}" should never resolve "${field.coordinate}" to an object of ${printTypes(typesToNotImplement)}`;

  }).filter(isDefined);
  const message = `For the following supergraph API query:\n${operation}`
    + `\nShared field "${field.coordinate}" return type "${field.type}" has different sets of possible runtime types across subgraphs.`
    + `\nSince a shared field must be resolved the same way in all subgraphs, make sure that ${printSubgraphNames(allSubgraphs)} only resolve "${field.coordinate}" to objects of ${printTypes(commonRuntimeTypes)}. In particular:`
    + `\n${subgraphsWithTypeNotInIntersectionString.join(';\n')}.`
    + `\nOtherwise the @shareable contract will be broken.`;
  return new CompositionHint(
    HINTS.INCONSISTENT_RUNTIME_TYPES_FOR_SHAREABLE_RETURN,
    message,
    field,
    subgraphNodes(state, (s) => (s.type(field.parent.name) as CompositeType | undefined)?.field(field.name)?.sourceAST),
  );
}

function displayReasons(reasons: Unadvanceables[]): string {
  const bySubgraph = new MultiMap<string, Unadvanceable>();
  for (const reason of reasons) {
    for (const unadvanceable of reason.reasons) {
      bySubgraph.add(unadvanceable.sourceSubgraph, unadvanceable);
    }
  }
  return [...bySubgraph.entries()].map(([subgraph, reasons]) => {
    let msg = `- from subgraph "${subgraph}":`;
    if (reasons.length === 1) {
      msg += ' ' + reasons[0].details + '.';
    } else {
      // We put all the reasons into a set because it's possible multiple paths of the algorithm
      // had the same "dead end". Typically, without this, there is cases where we end up with
      // multiple "cannot find field x" messages (for the same "x").
      const allDetails = new Set(reasons.map((r) => r.details));
      for (const details of allDetails) {
        msg += '\n  - ' + details + '.';
      }
    }
    return msg;
  }).join('\n');
}

function buildWitnessOperation(witness: RootPath<Transition>): Operation {
  assert(witness.size > 0, "unsatisfiablePath should contain at least one edge/transition");
  const root = witness.root;
  const schema = witness.graph.sources.get(root.source)!;
  return new Operation(
    schema,
    root.rootKind,
    buildWitnessNextStep([...witness].map(e => e[0]), 0)!,
    new VariableDefinitions(),
  );
}

function buildWitnessNextStep(edges: Edge[], index: number): SelectionSet | undefined  {
  if (index >= edges.length) {
    // We're at the end of our counter-example, meaning that we're at a point of traversing the supergraph where we know
    // there is no valid equivalent subgraph traversals.
    // That said, we may well not be on a terminal vertex (the type may not be a leaf), meaning that returning 'undefined'
    // may be invalid.
    // In that case, we instead return an empty SelectionSet. This is, strictly speaking, equally invalid, but we use
    // this as a convention to means "there is supposed to be a selection but we don't have it" and the code
    // in `SelectionSet.toSelectionNode` handles this an prints an ellipsis (a '...').
    //
    // Note that, as an alternative, we _could_ generate a random valid witness: while the current type is not terminal
    // we would randomly pick a valid choice (if it's an abstract type, we'd "cast" to any implementation; if it's an
    // object, we'd pick the first field and recurse on its type). However, while this would make sure our "witness"
    // is always a fully valid query, this is probably less user friendly in practice because you'd have to follow
    // the query manually to figure out at which point the query stop being satisfied by subgraphs. Putting the
    // ellipsis instead make it immediately clear after which part of the query there is an issue.
    const lastType = edges[edges.length -1].tail.type;
    // Note that vertex types are named type and output ones, so if it's not a leaf it is guaranteed to be selectable.
    assert(isOutputType(lastType), 'Should not have input types as vertex types');
    return isLeafType(lastType) ? undefined : new SelectionSet(lastType);
  }

  const edge = edges[index];
  let selection: Selection;
  const subSelection = buildWitnessNextStep(edges, index + 1);
  switch (edge.transition.kind) {
    case 'DownCast':
      const type = edge.transition.castedType;
      selection = selectionOfElement(
        new FragmentElement(edge.transition.sourceType, type.name),
        subSelection!
      );
      break;
    case 'FieldCollection':
      const field = edge.transition.definition;
      selection = new FieldSelection(buildWitnessField(field), subSelection);
      break
    case 'SubgraphEnteringTransition':
    case 'KeyResolution':
    case 'RootTypeResolution':
    case 'InterfaceObjectFakeDownCast':
      // Witnesses are build from a path on the supergraph, so we shouldn't have any of those edges.
      assert(false, `Invalid edge ${edge} found in supergraph path`);
  }
  // If we get here, the edge is either a downcast or a field, so the edge head must be selectable.
  return selectionSetOf(edge.head.type as CompositeType, selection);
}

function buildWitnessField(definition: FieldDefinition<any>): Field {
  if (definition.arguments().length === 0) {
    return new Field(definition);
  }

  const args = Object.create(null);
  for (const argDef of definition.arguments()) {
    args[argDef.name] = generateWitnessValue(argDef.type!);
  }
  return new Field(definition, args);
}

function generateWitnessValue(type: InputType): any {
  switch (type.kind) {
    case 'ScalarType':
      switch (type.name) {
        case 'Int':
          return 0;
        case 'Float':
          return 3.14;
        case 'Boolean':
          return true;
        case 'String':
          return 'A string value';
        case 'ID':
          // Users probably expect a particular format of ID at any particular place, but we have zero info on
          // the context, so we just throw a string that hopefully make things clear.
          return '<any id>';
        default:
          // It's a custom scalar, but we don't know anything about that scalar so providing some random string. This
          // will technically probably not be a valid value for that scalar, but hopefully that won't be enough to
          // throw users off.
          return '<some value>';
      }
    case 'EnumType':
      return type.values[0].name;
    case 'InputObjectType':
      const obj = Object.create(null);
      for (const field of type.fields()) {
        // We don't bother with non-mandatory fields.
        if (field.defaultValue || isNullableType(field.type!)) {
          continue;
        }
        obj[field.name] = generateWitnessValue(field.type!);
      }
      return obj;
    case 'ListType':
      return [];
    case 'NonNullType':
      // None of our generated witness values are null so...
      return generateWitnessValue(type.ofType);
    default:
      assert(false, `Unhandled input type ${type}`);
  }
}

/**
 * Validates that all the queries expressible on the API schema resulting of the composition of the provided subgraphs can be executed
 * on those subgraphs.
 *
 * @param supergraphSchema the schema of the supergraph that composing `subgraphs` generated. Note this *must* be the full supergraph, not
 *   just it's API schema (because it may be used to find the definition of elements that are marked `@inaccessible`). Note that this _not_
 *   the same schema that the one reference inside `supergraphAPI` in particular.
 * @param supergraphAPI the `QueryGraph` corresponding to the `supergraphSchema` API schema.
 * @param federatedQueryGraph the (federated) `QueryGraph` corresponding the subgraphs having been composed to obtain `supergraphSchema`.
 */
export function validateGraphComposition(
  supergraphSchema: Schema,
  supergraphAPI: QueryGraph,
  federatedQueryGraph: QueryGraph,
): {
  errors? : GraphQLError[],
  hints? : CompositionHint[],
} {
  const { errors, hints } = new ValidationTraversal(supergraphSchema, supergraphAPI, federatedQueryGraph).validate();
  return errors.length > 0 ? { errors, hints } : { hints };
}

// TODO: we don't use this anywhere, can we just remove it?
export function computeSubgraphPaths(
  supergraphSchema: Schema,
  supergraphPath: RootPath<Transition>,
  federatedQueryGraph: QueryGraph,
  overrideConditions: Map<string, boolean>,
): {
  traversal?: ValidationState,
  isComplete?: boolean,
  error?: GraphQLError
} {
  try {
    assert(!supergraphPath.hasAnyEdgeConditions(), () => `A supergraph path should not have edge condition paths (as supergraph edges should not have conditions): ${supergraphPath}`);
    const conditionResolver = simpleValidationConditionResolver({ supergraph: supergraphSchema, queryGraph: federatedQueryGraph, withCaching: true });
    const initialState = ValidationState.initial({ supergraphAPI: supergraphPath.graph, kind: supergraphPath.root.rootKind, federatedQueryGraph, conditionResolver, overrideConditions });
    const context = new ValidationContext(supergraphSchema);
    let state = initialState;
    let isIncomplete = false;
    for (const [edge] of supergraphPath) {
      const { state: updated, error } = state.validateTransition(context, edge);
      if (error) {
        throw error;
      }
      if (!updated) {
        isIncomplete = true;
        break;
      }
      state = updated;
    }
    return {traversal: state, isComplete: !isIncomplete};
  } catch (error) {
    if (error instanceof GraphQLError) {
      return {error};
    }
    throw error;
  }
}

function initialSubgraphPaths(kind: SchemaRootKind, subgraphs: QueryGraph): RootPath<Transition>[] {
  const root = subgraphs.root(kind);
  assert(root, () => `The supergraph shouldn't have a ${kind} root if no subgraphs have one`);
  assert(
    root.type.name == federatedGraphRootTypeName(kind),
    () => `Unexpected type ${root.type} for subgraphs root type (expected ${federatedGraphRootTypeName(kind)}`);
  const initialState = GraphPath.fromGraphRoot<Transition>(subgraphs, kind)!;
  return subgraphs.outEdges(root).map(e => initialState.add(subgraphEnteringTransition, e, noConditionsResolution));
}

function possibleRuntimeTypeNamesSorted(path: RootPath<Transition>): string[] {
  const types = path.tailPossibleRuntimeTypes().map((o) => o.name);
  types.sort((a, b) => a.localeCompare(b));
  return types;
}

export function extractValidationError(error: any): ValidationError | undefined {
  if (!(error instanceof GraphQLError) || !(error.originalError instanceof ValidationError)) {
    return undefined;
  }
  return error.originalError;
}

export class ValidationContext {
  private readonly joinTypeDirective: DirectiveDefinition;
  private readonly joinFieldDirective: DirectiveDefinition<JoinFieldDirectiveArguments>;

  constructor(
    readonly supergraphSchema: Schema,
  ) {
    const [_, joinSpec] = validateSupergraph(supergraphSchema);
    this.joinTypeDirective = joinSpec.typeDirective(supergraphSchema);
    this.joinFieldDirective = joinSpec.fieldDirective(supergraphSchema);
  }

  isShareable(field: FieldDefinition<CompositeType>): boolean {
    const typeInSupergraph = this.supergraphSchema.type(field.parent.name);
    assert(typeInSupergraph && isCompositeType(typeInSupergraph), () => `${field.parent.name} should exists in the supergraph and be a composite`);
    if (!isObjectType(typeInSupergraph)) {
      return false;
    }

    const fieldInSupergraph = typeInSupergraph.field(field.name);
    assert(fieldInSupergraph, () => `${field.coordinate} should exists in the supergraph`);
    const joinFieldApplications = fieldInSupergraph.appliedDirectivesOf(this.joinFieldDirective);
    // A field is shareable if either:
    // 1) there is not join__field, but multiple join__type
    // 2) there is more than one join__field where the field is neither external nor overriden.
    return joinFieldApplications.length === 0
      ? typeInSupergraph.appliedDirectivesOf(this.joinTypeDirective).length > 1
      : (joinFieldApplications.filter((application) => {
        const args = application.arguments();
        return !args.external && !args.usedOverridden;
      }).length > 1);
  }
}

export class ValidationState {
  constructor(
    // Path in the supergraph corresponding to the current state.
    public readonly supergraphPath: RootPath<Transition>,
    // All the possible paths we could be in the subgraph.
    public readonly subgraphPaths: TransitionPathWithLazyIndirectPaths<RootVertex>[],
    // When we encounter an `@override`n field with a label condition, we record
    // its value (T/F) as we traverse the graph. This allows us to ignore paths
    // that can never be taken by the query planner (i.e. a path where the
    // condition is T in one case and F in another).
    public selectedOverrideConditions: Map<string, boolean> = new Map(),
  ) {
  }

  static initial({
    supergraphAPI,
    kind,
    federatedQueryGraph,
    conditionResolver,
    overrideConditions,
  }: {
    supergraphAPI: QueryGraph,
    kind: SchemaRootKind,
    federatedQueryGraph: QueryGraph,
    conditionResolver: ConditionResolver,
    overrideConditions: Map<string, boolean>,
  }) {
    return new ValidationState(
      GraphPath.fromGraphRoot(supergraphAPI, kind)!,
      initialSubgraphPaths(kind, federatedQueryGraph).map((p) =>
        TransitionPathWithLazyIndirectPaths.initial(
          p,
          conditionResolver,
          overrideConditions,
        ),
      ),
    );
  }

  /**
   * Validates that the current state can always be advanced for the provided supergraph edge, and returns the updated state if
   * so.
   *
   * @param supergraphEdge - the edge to try to advance from the current state.
   * @return an object with `error` set if the state _cannot_ be properly advanced (and if so, `state` and `hint` will be `undefined`).
   *  If the state can be successfully advanced, then `state` contains the updated new state. This *can* be `undefined` to signal
   *  that the state _can_ be successfully advanced (no error) but is guaranteed to yield no results (in other words, the edge corresponds
   *  to a type condition for which there cannot be any runtime types), in which case not further validation is necessary "from that branch".
   *  Additionally, when the state can be successfully advanced, an `hint` can be optionally returned.
   */
  validateTransition(context: ValidationContext, supergraphEdge: Edge): {
    state?: ValidationState,
    error?: GraphQLError,
    hint?: CompositionHint,
  } {
    assert(!supergraphEdge.conditions, () => `Supergraph edges should not have conditions (${supergraphEdge})`);

    const transition = supergraphEdge.transition;
    const targetType = supergraphEdge.tail.type;
    const newSubgraphPaths: TransitionPathWithLazyIndirectPaths<RootVertex>[] = [];
    const deadEnds: Unadvanceables[] = [];
    // If the edge has an override condition, we should capture it in the state so
    // that we can ignore later edges that don't satisfy the condition.
    const newOverrideConditions = new Map([...this.selectedOverrideConditions]);
    if (supergraphEdge.overrideCondition) {
      newOverrideConditions.set(
        supergraphEdge.overrideCondition.label,
        supergraphEdge.overrideCondition.condition
      );
    }

    for (const path of this.subgraphPaths) {
      const options = advancePathWithTransition(
        path,
        transition,
        targetType,
        newOverrideConditions,
      );
      if (isUnadvanceable(options)) {
        deadEnds.push(options);
        continue;
      }
      if (options.length === 0) {
        // This means that the edge is a type condition and that if we follow the path to this subgraph, we're guaranteed that handling that
        // type condition give us no matching results, and so we can handle whatever comes next really.
        return { state: undefined };
      }
      newSubgraphPaths.push(...options);
    }
    const newPath = this.supergraphPath.add(transition, supergraphEdge, noConditionsResolution);
    if (newSubgraphPaths.length === 0) {
      return { error: satisfiabilityError(newPath, this.subgraphPaths.map((p) => p.path), deadEnds) };
    }

    const updatedState = new ValidationState(
      newPath,
      newSubgraphPaths,
      newOverrideConditions,
    );

    // When handling a @shareable field, we also compare the set of runtime types for each subgraphs involved.
    // If there is no common intersection between those sets, then we record an error: a @shareable field should resolve
    // the same way in all the subgraphs in which it is resolved, and there is no way this can be true if each subgraph
    // returns runtime objects that we know can never be the same.
    //
    // Additionally, if those sets of runtime types are not the same, we let it compose, but we log a warning. Indeed,
    // having different runtime types is a red flag: it would be incorrect for a subgraph to resolve to an object of a
    // type that the other subgraph cannot possible return, so having some subgraph having types that the other
    // don't know feels like something is worth double checking on the user side. Of course, as long as there is
    // some runtime types intersection and the field resolvers only return objects of that intersection, then this
    // could be a valid implementation. And this case can in particular happen temporarily as subgraphs evolve (potentially
    // independently), but it is well worth warning in general.

    // Note that we ignore any path when the type is not an abstract type, because in practice this means an @interfaceObject
    // and this should not be considered as an implementation type. Besides @interfaceObject always "stand-in" for every
    // implementations so they never are a problem for this check and can be ignored.
    let hint: CompositionHint | undefined = undefined;
    if (
      newSubgraphPaths.length > 1
      && transition.kind === 'FieldCollection'
      && isAbstractType(newPath.tail.type)
      && context.isShareable(transition.definition)
    ) {
      const filteredPaths = newSubgraphPaths.map((p) => p.path).filter((p) => isAbstractType(p.tail.type));
      if (filteredPaths.length > 1) {
        // We start our intersection by using all the supergraph types, both because it's a convenient "max" set to start our intersection,
        // but also because that means we will ignore @inaccessible types in our checks (which is probably not very important because
        // I believe the rules of @inacessible kind of exclude having some here, but if that ever change, it makes more sense this way).
        const allRuntimeTypes = possibleRuntimeTypeNamesSorted(newPath);
        let intersection = allRuntimeTypes;

        const runtimeTypesToSubgraphs = new MultiMap<string, string>();
        const runtimeTypesPerSubgraphs = new MultiMap<string, string>();
        let hasAllEmpty = true;
        for (const path of newSubgraphPaths) {
          const subgraph = path.path.tail.source;
          const typeNames = possibleRuntimeTypeNamesSorted(path.path);
          runtimeTypesPerSubgraphs.set(subgraph, typeNames);
          // Note: we're formatting the elements in `runtimeTYpesToSubgraphs` because we're going to use it if we display an error. This doesn't
          // impact our set equality though since the formatting is consistent betweeen elements and type names syntax is sufficiently restricted
          // in graphQL to not create issues (no quote or weird character to escape in particular).
          let typeNamesStr = 'no runtime type is defined';
          if (typeNames.length > 0) {
            typeNamesStr = (typeNames.length > 1 ? 'types ' : 'type ') + joinStrings(typeNames.map((n) => `"${n}"`));
            hasAllEmpty = false;
          }
          runtimeTypesToSubgraphs.add(typeNamesStr, subgraph);
          intersection = intersection.filter((t) => typeNames.includes(t));
        }

        // If `hasAllEmpty`, then it means that none of the subgraph defines any runtime types. Typically, all subgraphs defines a given interface,
        // but none have implementations. In that case, the intersection will be empty but it's actually fine (which is why we special case). In
        // fact, assuming valid graphQL subgraph servers (and it's not the place to sniff for non-compliant subgraph servers), the only value to
        // which each subgraph can resolve is `null` and so that essentially guaranttes that all subgraph do resolve the same way.
        if (!hasAllEmpty) {
          if (intersection.length === 0) {
            return { error: shareableFieldNonIntersectingRuntimeTypesError(updatedState, transition.definition, runtimeTypesToSubgraphs) };
          }

          // As said, we accept it if there is an intersection, but if the runtime types are not all the same, we still emit a warning to make it clear that
          // the fields should not resolve any of the types not in the intersection.
          if (runtimeTypesToSubgraphs.size > 1) {
            hint = shareableFieldMismatchedRuntimeTypesHint(updatedState, transition.definition, intersection, runtimeTypesPerSubgraphs);
          }
        }
      }
    }

    return { state: updatedState, hint };
  }

  currentSubgraphNames(): string[] {
    const subgraphs: string[] = [];
    for (const path of this.subgraphPaths) {
      const source = path.path.tail.source;
      if (!subgraphs.includes(source)) {
        subgraphs.push(source);
      }
    }
    return subgraphs;
  }

  currentSubgraphs(): { name: string, schema: Schema }[] {
    if (this.subgraphPaths.length === 0) {
      return [];
    }
    const sources = this.subgraphPaths[0].path.graph.sources;
    return this.currentSubgraphNames().map((name) => ({ name, schema: sources.get(name)!}));
  }

  toString(): string {
    return `${this.supergraphPath} <=> [${this.subgraphPaths.map(s => s.toString()).join(', ')}]`;
  }
}

// `maybeSuperset` is a superset (or equal) if it contains all of `other`'s
// subgraphs and all of `other`'s labels (with matching conditions).
function isSupersetOrEqual(maybeSuperset: VertexVisit, other: VertexVisit): boolean {
  const includesAllSubgraphs = other.subgraphs.every((s) => maybeSuperset.subgraphs.includes(s));
  const includesAllOverrideConditions = [...other.overrideConditions.entries()].every(([label, value]) =>
    maybeSuperset.overrideConditions.get(label) === value
  );

  return includesAllSubgraphs && includesAllOverrideConditions;
}

interface VertexVisit {
  subgraphs: string[];
  overrideConditions: Map<string, boolean>;
}

class ValidationTraversal {
  private readonly conditionResolver: ConditionResolver;
  // The stack contains all states that aren't terminal.
  private readonly stack: ValidationState[] = [];

  // For each vertex in the supergraph, records if we've already visited that vertex and in which subgraphs we were.
  // For a vertex, we may have multiple "sets of subgraphs", hence the double-array.
  private readonly previousVisits: QueryGraphState<VertexVisit[]>;

  private readonly validationErrors: GraphQLError[] = [];
  private readonly validationHints: CompositionHint[] = [];

  private readonly context: ValidationContext;

  constructor(
    supergraphSchema: Schema,
    supergraphAPI: QueryGraph,
    federatedQueryGraph: QueryGraph,
  ) {
    this.conditionResolver = simpleValidationConditionResolver({
      supergraph: supergraphSchema,
      queryGraph: federatedQueryGraph,
      withCaching: true,
    });
    supergraphAPI.rootKinds().forEach((kind) => this.stack.push(ValidationState.initial({
      supergraphAPI,
      kind,
      federatedQueryGraph,
      conditionResolver: this.conditionResolver,
      overrideConditions: new Map(),
    })));
    this.previousVisits = new QueryGraphState(supergraphAPI);
    this.context = new ValidationContext(supergraphSchema);
  }

  validate(): {
    errors: GraphQLError[],
    hints: CompositionHint[],
  } {
    while (this.stack.length > 0) {
      this.handleState(this.stack.pop()!);
    }
    return { errors: this.validationErrors, hints: this.validationHints };
  }

  private handleState(state: ValidationState) {
    debug.group(() => `Validation: ${this.stack.length + 1} open states. Validating ${state}`);
    const vertex = state.supergraphPath.tail;

    const currentVertexVisit: VertexVisit = {
      subgraphs: state.currentSubgraphNames(),
      overrideConditions: state.selectedOverrideConditions
    };
    const previousVisitsForVertex = this.previousVisits.getVertexState(vertex);
    if (previousVisitsForVertex) {
      for (const previousVisit of previousVisitsForVertex) {
        if (isSupersetOrEqual(currentVertexVisit, previousVisit)) {
          // This means that we've already seen the type we're currently on in the supergraph, and when saw it we could be in
          // one of `previousSources`, and we validated that we could reach anything from there. We're now on the same
          // type, and have strictly more options regarding subgraphs. So whatever comes next, we can handle in the exact
          // same way we did previously, and there is thus no way to bother.
          debug.groupEnd(`Has already validated this vertex.`);
          return;
        }
      }
      // We're gonna have to validate, but we can save the new set of sources here to hopefully save work later.
      previousVisitsForVertex.push(currentVertexVisit);
    } else {
      // We save the current sources but do validate.
      this.previousVisits.setVertexState(vertex, [currentVertexVisit]);
    }

    // Note that if supergraphPath is terminal, this method is a no-op, which is expected/desired as
    // it means we've successfully "validate" a path to its end.
    for (const edge of state.supergraphPath.nextEdges()) {
      if (edge.isEdgeForField(typenameFieldName)) {
        // There is no point in validating __typename edges: we know we can always get those.
        continue;
      }

      // `state.selectedOverrideConditions` indicates the labels (and their
      // respective conditions) that we've selected so far in our traversal
      // (i.e. "foo" -> true). There's no need to validate edges that share the
      // same label with the opposite condition since they're unreachable during
      // query planning.
      if (
        edge.overrideCondition
        && state.selectedOverrideConditions.has(edge.overrideCondition.label)
        && !edge.satisfiesOverrideConditions(state.selectedOverrideConditions)
      ) {
        debug.groupEnd(`Edge ${edge} doesn't satisfy label condition: ${edge.overrideCondition?.label}(${state.selectedOverrideConditions.get(edge.overrideCondition?.label ?? "")}), no need to validate further`);
        continue;
      }


      debug.group(() => `Validating supergraph edge ${edge}`);
      const { state: newState, error, hint } = state.validateTransition(this.context, edge);
      if (error) {
        debug.groupEnd(`Validation error!`);
        this.validationErrors.push(error);
        continue;
      }
      if (hint) {
        this.validationHints.push(hint);
      }

      // The check for `isTerminal` is not strictly necessary as if we add a terminal
      // state to the stack this method, `handleState`, will do nothing later. But it's
      // worth checking it now and save some memory/cycles.
      if (newState && !newState.supergraphPath.isTerminal()) {
        this.stack.push(newState);
        debug.groupEnd(() => `Reached new state ${newState}`);
      } else {
        debug.groupEnd(`Reached terminal vertex/cycle`);
      }
    }
    debug.groupEnd();
  }
}
