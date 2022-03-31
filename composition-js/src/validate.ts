import {
  assert,
  CompositeType,
  Field,
  FieldDefinition,
  FieldSelection,
  firstOf,
  FragmentElement,
  InputType,
  isLeafType,
  isNullableType,
  MultiMap,
  newDebugLogger,
  Operation,
  operationToDocument,
  Schema,
  SchemaRootKind,
  Selection,
  selectionOfElement,
  SelectionSet,
  typenameFieldName,
  VariableDefinitions
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
  OpGraphPath,
  advanceSimultaneousPathsWithOperation,
  ExcludedEdges,
  QueryGraphState,
  ExcludedConditions,
  Unadvanceables,
  isUnadvanceable,
  Unadvanceable,
  noConditionsResolution,
  ConditionResolution,
  unsatisfiedConditionsResolution,
  ConditionResolver,
  cachingConditionResolver,
  PathContext,
  addConditionExclusion,
  SimultaneousPathsWithLazyIndirectPaths,
  advanceOptionsToString,
  TransitionPathWithLazyIndirectPaths,
  RootVertex,
} from "@apollo/query-graphs";
import { print } from "graphql";

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

function validationError(
  unsatisfiablePath: RootPath<Transition>,
  subgraphsPaths: RootPath<Transition>[],
  subgraphsPathsUnadvanceables: Unadvanceables[]
): ValidationError {
  const witness = buildWitnessOperation(unsatisfiablePath);

  // TODO: we should build a more detailed error message, not just the unsatisfiable query. Doing that well is likely a tad
  // involved though as there may be a lot of different reason why it doesn't validate. But by looking at the last edge on the
  // supergraph and the subgraphsPath, we should be able to roughly infer what's going on.
  const operation = print(operationToDocument(witness));
  const message = `The following supergraph API query:\n${operation}\n`
    + 'cannot be satisfied by the subgraphs because:\n'
    + displayReasons(subgraphsPathsUnadvanceables);
  return new ValidationError(message, unsatisfiablePath, subgraphsPaths, witness);
}

function isValidationError(e: any): e is ValidationError {
  return e instanceof ValidationError;
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
      for (const reason of reasons) {
        msg += '\n  - ' + reason.details + '.';
      }
    }
    return msg;
  }).join('\n');
}

function buildWitnessOperation(witness: RootPath<Transition>): Operation {
  assert(witness.size > 0, "unsatisfiablePath should contain at least one edge/transition");
  const root = witness.root;
  return new Operation(
    root.rootKind,
    buildWitnessNextStep([...witness].map(e => e[0]), 0)!,
    new VariableDefinitions()
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
    return isLeafType(lastType) ? undefined : new SelectionSet(lastType as CompositeType);
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
      return subSelection;
  }
  // If we get here, the edge is either a downcast or a field, so the edge head must be selectable.
  const selectionSet = new SelectionSet(edge.head.type as CompositeType);
  selectionSet.add(selection);
  return selectionSet;
}

function buildWitnessField(definition: FieldDefinition<any>): Field {
  const args = Object.create(null);
  for (const argDef of definition.arguments()) {
    args[argDef.name] = generateWitnessValue(argDef.type!);
  }
  return new Field(definition, args, new VariableDefinitions());
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

export function validateGraphComposition(supergraph: QueryGraph, subgraphs: QueryGraph): {errors? : ValidationError[]} {
  const errors = new ValidationTraversal(supergraph, subgraphs).validate();
  return errors.length > 0 ? {errors} : {};
}

export function computeSubgraphPaths(supergraphPath: RootPath<Transition>, subgraphs: QueryGraph): {traversal?: ValidationState, isComplete?: boolean, error?: ValidationError} {
  try {
    assert(!supergraphPath.hasAnyEdgeConditions(), () => `A supergraph path should not have edge condition paths (as supergraph edges should not have conditions): ${supergraphPath}`);
    const supergraphSchema = firstOf(supergraphPath.graph.sources.values())!;
    const conditionResolver = new ConditionValidationResolver(supergraphSchema, subgraphs);
    const initialState = ValidationState.initial({supergraph: supergraphPath.graph, supergraphSchema, kind: supergraphPath.root.rootKind, subgraphs, conditionResolver});
    let state = initialState;
    let isIncomplete = false;
    for (const [edge] of supergraphPath) {
      const updated = state.validateTransition(supergraphSchema, edge);
      if (!updated) {
        isIncomplete = true;
        break;
      }
      if (isValidationError(updated)) {
        throw updated;
      }
      state = updated;
    }
    return {traversal: state, isComplete: !isIncomplete};
  } catch (error) {
    if (error instanceof ValidationError) {
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

export class ValidationState {
  constructor(
    // Path in the supergraph corresponding to the current state.
    public readonly supergraphPath: RootPath<Transition>,
    // All the possible paths we could be in the subgraph.
    public readonly subgraphPaths: TransitionPathWithLazyIndirectPaths<RootVertex>[]
  ) {
  }

  static initial({
    supergraph,
    supergraphSchema,
    kind,
    subgraphs,
    conditionResolver,
  }: {
    supergraph: QueryGraph,
    supergraphSchema: Schema,
    kind: SchemaRootKind,
    subgraphs: QueryGraph,
    conditionResolver: ConditionValidationResolver,
  }) {
    return new ValidationState(
      GraphPath.fromGraphRoot(supergraph, kind)!,
      initialSubgraphPaths(kind, subgraphs).map((p) => TransitionPathWithLazyIndirectPaths.initial(supergraphSchema, p, conditionResolver.resolver)),
    );
  }

  // Either return an error (we've found a path that cannot be validated), a new state (we've successfully handled the edge
  // and can continue validation from this new state) or 'undefined' if we can handle that edge by returning no results
  // as it gets us in a (valid) situation where we can guarantee there will be no results (in other words, the edge correspond
  // to a type condition for which there cannot be any runtime types, and so no point in continuing this "branch").
  validateTransition(
    supergraphSchema: Schema,
    supergraphEdge: Edge,
  ): ValidationState | undefined | ValidationError {
    assert(!supergraphEdge.conditions, () => `Supergraph edges should not have conditions (${supergraphEdge})`);

    const transition = supergraphEdge.transition;
    const targetType = supergraphEdge.tail.type;
    const newSubgraphPaths = [];
    const deadEnds: Unadvanceables[] = [];
    for (const path of this.subgraphPaths) {
      const options = advancePathWithTransition(
        supergraphSchema,
        path,
        transition,
        targetType,
      );
      if (isUnadvanceable(options)) {
        deadEnds.push(options);
        continue;
      }
      if (options.length === 0) {
        // This means that the edge is a type condition and that if we follow the path to this subgraph, we're guaranteed that handling that
        // type condition give us no matching results, and so we can handle whatever comes next really.
        return undefined;
      }
      newSubgraphPaths.push(...options);
    }
    const newPath = this.supergraphPath.add(transition, supergraphEdge, noConditionsResolution);
    if (newSubgraphPaths.length === 0) {
      return validationError(newPath, this.subgraphPaths.map((p) => p.path), deadEnds);
    }
    return new ValidationState(newPath, newSubgraphPaths);
  }

  currentSubgraphs(): string[] {
    const subgraphs: string[] = [];
    for (const path of this.subgraphPaths) {
      const source = path.path.tail.source;
      if (!subgraphs.includes(source)) {
        subgraphs.push(source);
      }
    }
    return subgraphs;
  }

  toString(): string {
    return `${this.supergraphPath} <=> [${this.subgraphPaths.map(s => s.toString()).join(', ')}]`;
  }
}

function isSupersetOrEqual(maybeSuperset: string[], other: string[]): boolean {
  // `maybeSuperset` is a superset (or equal) if it contains all of `other`
  return other.every(v => maybeSuperset.includes(v));
}

class ValidationTraversal {
  private readonly supergraphSchema: Schema;
  private readonly conditionResolver: ConditionValidationResolver;
  // The stack contains all states that aren't terminal.
  private readonly stack: ValidationState[] = [];

  // For each vertex in the supergraph, records if we've already visited that vertex and in which subgraphs we were.
  // For a vertex, we may have multiple "sets of subgraphs", hence the double-array.
  private readonly previousVisits: QueryGraphState<string[][]>;

  private readonly validationErrors: ValidationError[] = [];

  constructor(supergraph: QueryGraph, subgraphs: QueryGraph) {
    this.supergraphSchema = firstOf(supergraph.sources.values())!;
    this.conditionResolver = new ConditionValidationResolver(this.supergraphSchema, subgraphs);
    supergraph.rootKinds().forEach((kind) => this.stack.push(ValidationState.initial({
      supergraph,
      supergraphSchema: this.supergraphSchema,
      kind,
      subgraphs,
      conditionResolver: this.conditionResolver
    })));
    this.previousVisits = new QueryGraphState(supergraph);
  }

  validate(): ValidationError[] {
    while (this.stack.length > 0) {
      this.handleState(this.stack.pop()!);
    }
    return this.validationErrors;
  }

  private handleState(state: ValidationState) {
    debug.group(() => `Validation: ${this.stack.length + 1} open states. Validating ${state}`);
    const vertex = state.supergraphPath.tail;
    const currentSources = state.currentSubgraphs();
    const previousSeenSources = this.previousVisits.getVertexState(vertex);
    if (previousSeenSources) {
      for (const previousSources of previousSeenSources) {
        if (isSupersetOrEqual(currentSources, previousSources)) {
          // This means that we've already seen the type we're currently on in the supergraph, and when saw it we could be in
          // one of `previousSources`, and we validated that we could reach anything from there. We're now on the same
          // type, and have strictly more options regarding subgraphs. So whatever comes next, we can handle in the exact
          // same way we did previously, and there is thus no way to bother.
          debug.groupEnd(`Has already validated this vertex.`);
          return;
        }
      }
      // We're gonna have to validate, but we can save the new set of sources here to hopefully save work later.
      previousSeenSources.push(currentSources);
    } else {
      // We save the current sources but do validate.
      this.previousVisits.setVertexState(vertex, [currentSources]);
    }

    // Note that if supergraphPath is terminal, this method is a no-op, which is expected/desired as
    // it means we've successfully "validate" a path to its end.
    for (const edge of state.supergraphPath.nextEdges()) {
      if (edge.isEdgeForField(typenameFieldName)) {
        // There is no point in validating __typename edges: we know we can always get those.
        continue;
      }

      debug.group(() => `Validating supergraph edge ${edge}`);
      const newState = state.validateTransition(this.supergraphSchema, edge);
      if (isValidationError(newState)) {
        debug.groupEnd(`Validation error!`);
        this.validationErrors.push(newState);
        continue;
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

class ConditionValidationState {
  constructor(
    // Selection that belongs to the condition we're validating.
    readonly selection: Selection,
    // All the possible "simultaneous paths" we could be in the subgraph when we reach this state selection.
    readonly subgraphOptions: SimultaneousPathsWithLazyIndirectPaths[]
  ) {}

  toString(): string {
    return `${this.selection} <=> ${advanceOptionsToString(this.subgraphOptions)}`;
  }
}

class ConditionValidationResolver {
  readonly resolver: ConditionResolver;

  constructor(
    private readonly supergraphSchema: Schema,
    private readonly federatedQueryGraph: QueryGraph
  ) {
    this.resolver = cachingConditionResolver(
      federatedQueryGraph,
      (
        edge: Edge,
        context: PathContext,
        excludedEdges: ExcludedEdges,
        excludedConditions: ExcludedConditions
      ) => this.validateConditions(edge, context, excludedEdges, excludedConditions)
    );
  }

  private validateConditions(
    edge: Edge,
    context: PathContext,
    excludedEdges: ExcludedEdges,
    excludedConditions: ExcludedConditions
  ): ConditionResolution {
    const conditions = edge.conditions!;
    excludedConditions = addConditionExclusion(excludedConditions, conditions);

    const initialPath: OpGraphPath = GraphPath.create(this.federatedQueryGraph, edge.head);
    const initialOptions = [new SimultaneousPathsWithLazyIndirectPaths([initialPath], context, this.resolver, excludedEdges, excludedConditions)];

    const stack: ConditionValidationState[] = [];
    for (const selection of conditions.selections()) {
      stack.push(new ConditionValidationState(selection, initialOptions));
    }

    while (stack.length > 0) {
      const state = stack.pop()!;
      const newStates = this.advanceState(state);
      if (newStates === null) {
        return unsatisfiedConditionsResolution;
      }
      newStates.forEach(s => stack.push(s));
    }
    // If we exhaust the stack, it means we've been able to find "some" path for every possible selection in the condition, so the
    // condition is validated. Note that we use a cost of 1 for all conditions as we don't care about efficiency.
    return { satisfied: true, cost: 1 };
  }

  private advanceState(state: ConditionValidationState): ConditionValidationState[] | null {
    let newOptions: SimultaneousPathsWithLazyIndirectPaths[] = [];
    for (const paths of state.subgraphOptions) {
      const pathsOptions = advanceSimultaneousPathsWithOperation(
        this.supergraphSchema,
        paths,
        state.selection.element(),
      );
      if (!pathsOptions) {
        continue;
      }
      newOptions = newOptions.concat(pathsOptions);
    }

    // If we got no options, it means that particular selection of the conditions cannot be satisfied, so the
    // overall condition cannot.
    if (newOptions.length === 0) {
      return null;
    }
    return state.selection.selectionSet ? state.selection.selectionSet.selections().map(s => new ConditionValidationState(s, newOptions)) : [];
  }
}
