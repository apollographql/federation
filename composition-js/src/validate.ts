import {
  assert,
  CompositeType,
  Field,
  FieldDefinition,
  FieldSelection,
  FragmentElement,
  FragmentSelection,
  InputType,
  isLeafType,
  isNullableType,
  Operation,
  operationToAST,
  Schema,
  SchemaRootKind,
  Selection,
  SelectionSet,
  typenameFieldName,
  VariableDefinitions
} from "@apollo/core";
import {
  Edge,
  federatedGraphRootTypeName,
  QueryGraph,
  emptyContext,
  freeTransition,
  GraphPath,
  RootPath,
  advancePathWithTransition,
  Transition,
  OpGraphPath,
  advanceSimultaneousPathsWithOperation,
  ExcludedEdges,
  QueryGraphState,
  SimultaneousPaths,
} from "@apollo/query-graphs";
import { print } from "graphql";

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

function validationError(unsatisfiablePath: RootPath<Transition>, subgraphsPaths: RootPath<Transition>[]): ValidationError {
  const witness = buildWitnessOperation(unsatisfiablePath);

  // TODO: we should build a more detailed error message, not just the unsatisfiable query. Doing that well is likely a tad
  // involved though as there may be a lot of different reason why it doesn't validate. But by looking at the last edge on the
  // supergraph and the subgraphsPath, we should be able to roughly infer what's going on. 
  const message = `Example unsatisfiable query:\n${print(operationToAST(witness))}`;
  return new ValidationError(message, unsatisfiablePath, subgraphsPaths, witness);
}

function buildWitnessOperation(witness: RootPath<Transition>): Operation {
  assert(witness.size > 0, "unsatisfiablePath should contain at least one edge/transition");
  const root = witness.root;
  return new Operation(
    root.rootKind,
    buildWitnessNextStep([...witness.elements()].map(e => e[0]), 0)!,
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
    // in `SelectionSet.toSelectionNode` handles this an prints an elipsis (a '...').
    //
    // Note that, as an alternative, we _could_ generate a random valid witness: while the current type is not terminal
    // we would randomly pick a valid choice (if it's an abstract type, we'd "cast" to any implementation; if it's an
    // object, we'd pick the first field and recurse on its type). However, while this would make sure our "witness"
    // is always a fully valid query, this is probably less user friendly in practice because you'd have to follow
    // the query manually to figure out at which point the query stop being satisfied by subgraphs. Putting the
    // elipsis instead make it immediately clear after which part of the query there is an issue.
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
      selection = new FragmentSelection(
        new FragmentElement(edge.transition.sourceType, type.name),
        subSelection!
      );
      break;
    case 'FieldCollection':
      const field = edge.transition.definition;
      selection = new FieldSelection(buildWitnessField(field), subSelection);
      break
    case 'FreeTransition':
    case 'KeyResolution':
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

export function validateGraphComposition(supergraph: QueryGraph, subgraphs: QueryGraph): {error? : ValidationError} {
  try {
    new ValidationTaversal(supergraph, subgraphs).validate();
    return {};
  } catch (e) {
    if (e instanceof ValidationError) {
      return {error: e};
    }
    throw e;
  }
}

export function computeSubgraphPaths(supergraphPath: RootPath<Transition>, subgraphs: QueryGraph): {traversal?: ValidationState, isComplete?: boolean, error?: ValidationError} {
  try {
    assert(!supergraphPath.hasAnyEdgeConditions(), `A supergraph path should not have edge condition paths (as supergraph edges should not have conditions): ${supergraphPath}`);
    const supergraphSchema = [...supergraphPath.graph.sources.values()][0];
    let initialState = ValidationState.initial(supergraphPath.graph, supergraphPath.root.rootKind, subgraphs);
    const cache = new QueryGraphState<GraphPath<Transition>[]>(subgraphs);
    const conditionsCache = new QueryGraphState<OpGraphPath[]>(subgraphs);
    let state = initialState;
    let isIncomplete = false;
    for (const [edge] of supergraphPath.elements()) {
      const updated = state.validateTransition(supergraphSchema, edge, cache, conditionsCache);
      if (!updated) {
        isIncomplete = true;
        break;
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
  assert(root, `The supergraph shouldn't have a ${kind} root if no subgraphs have one`);
  assert(
    root.type.name == federatedGraphRootTypeName(kind),
    `Unexpected type ${root.type} for subgraphs root type (expected ${federatedGraphRootTypeName(kind)}`);
  const initialState = GraphPath.fromGraphRoot<Transition>(subgraphs, kind)!;
  return subgraphs.outEdges(root).map(e => initialState.add(freeTransition, e));
}

export class ValidationState {
  constructor(
    // Path in the supergraph corresponding to the current state.
    public readonly supergraphPath: RootPath<Transition>,
    // All the possible paths we could be in the subgraph.
    public readonly subgraphPaths: RootPath<Transition>[]
  ) {
    assert(
      subgraphPaths.every(p => p.tail.type.name == this.supergraphPath.tail.type.name),
      () => `Invalid state ${this}: some subgraphs type don't match the supergraph.`);
  }

  static initial(supergraph: QueryGraph, kind: SchemaRootKind, subgraphs: QueryGraph) {
    return new ValidationState(GraphPath.fromGraphRoot(supergraph, kind)!, initialSubgraphPaths(kind, subgraphs));
  }

  // Either throw (we've found a path that cannot be validated), return a new state (we've successfully handled the edge
  // and can continue validation from this new state) or 'undefined' if we can handle that edge by returning no results
  // as it gets us in a (valid) situation where we can guarantee there will be no results (in other words, the edge correspond
  // to a type condition for which there cannot be any runtime types, and so no point in continuing this "branch").
  validateTransition(
    supergraphSchema: Schema,
    supergraphEdge: Edge,
    cache: QueryGraphState<GraphPath<Transition>[]>,
    conditionCache: QueryGraphState<OpGraphPath[]>
  ): ValidationState | undefined {
    assert(!supergraphEdge.conditions, () => `Supergraph edges should not have conditions (${supergraphEdge})`);

    const transition = supergraphEdge.transition;
    const targetType = supergraphEdge.tail.type;
    const newSubgraphPaths = [];
    for (const path of this.subgraphPaths) {
      const options = advancePathWithTransition(
        path,
        transition,
        targetType,
        (conditions, vertex, excluded) => validateConditions(supergraphSchema, conditions, GraphPath.create(path.graph, vertex), conditionCache, excluded),
        cache
      );
      if (!options) {
        continue;
      }
      if (options.length === 0) {
        // This means that the edge is a type condition and that if we follow the path to this subgraph, we're guaranteed that handling that
        // type condition give us no matching results, and so we can handle whatever comes next really.
        return undefined;
      }
      newSubgraphPaths.push(...options);
    }
    const newPath = this.supergraphPath.add(transition, supergraphEdge);
    if (newSubgraphPaths.length === 0) {
      throw validationError(newPath, this.subgraphPaths);
    }
    return new ValidationState(newPath, newSubgraphPaths);
  }

  currentSubgraphs(): string[] {
    const subgraphs: string[] = [];
    for (const path of this.subgraphPaths) {
      const source = path.tail.source;
      if (!subgraphs.includes(source)) {
        subgraphs.push(source);
      }
    }
    return subgraphs;
  }

  hasCycled(): boolean {
    // A state is a configuration that points to a particular type/vertex in the supergraph and to
    // a number of subgraph vertex _for the same type_. So if any of the subgraph state is such that
    // the current vertex (in the subgraph) has already been visited, then we've cycled (in a particular
    // subgraph, but that also imply in the supergraph).
    return this.subgraphPaths.some(p => p.hasJustCycled());
  }

  toString(): string {
    return `${this.supergraphPath} <=> [${this.subgraphPaths.map(s => s.toString()).join(', ')}]`;
  }
}

function isSupersetOrEqual(maybeSuperset: String[], other: String[]): boolean {
  // `maybeSuperset` is a superset (or equal) if it contains all of `other`
  return other.every(v => maybeSuperset.includes(v));
}

class ValidationTaversal {
  private readonly supergraphSchema: Schema;
  // The stack contains all states that aren't terminal.
  private readonly stack: ValidationState[] = [];
  private readonly cache: QueryGraphState<GraphPath<Transition>[]>;
  private readonly conditionsCache: QueryGraphState<OpGraphPath[]>;

  // For each vertex in the supergraph, records if we've already visited that vertex and in which subgraphs we were.
  // For a vertex, we may have multipe "sets of subgraphs", hence the double-array.
  private readonly previousVisits: QueryGraphState<string[][]>;


  constructor(supergraph: QueryGraph, subgraphs: QueryGraph) {
    this.supergraphSchema = [...supergraph.sources.values()][0];
    supergraph.rootKinds().forEach(k => this.stack.push(ValidationState.initial(supergraph, k, subgraphs)));
    this.cache = new QueryGraphState(subgraphs);
    this.conditionsCache = new QueryGraphState(subgraphs);
    this.previousVisits = new QueryGraphState(supergraph);
  }

  //private dumpStack(message?: string) {
  //  if (message) console.log(message);
  //  for (const state of this.stack) {
  //    console.log(` - ${state}`);
  //  }
  //}

  validate() {
    while (this.stack.length > 0) {
      //this.dumpStack("Current State:");
      this.handleState(this.stack.pop()!);
    }
  }

  private handleState(state: ValidationState) {

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
        // There is no point in validing __typename edges: we know we can always get those.
        continue;
      }

      const newState = state.validateTransition(this.supergraphSchema, edge, this.cache, this.conditionsCache);
      // The check for `isTerminal` is not strictly necessary as if we add a terminal
      // state to the stack this method, `handleState`, will do nothing later. But it's
      // worth checking it now and save some memory/cycles.
      if (newState && !newState.supergraphPath.isTerminal() && !newState.hasCycled()) {
        this.stack.push(newState);
      }
    }
  }
}


class ConditionValidationState {
  constructor(
    // Selection that belongs to the condition we're validating.
    readonly selection: Selection,
    // All the possible "simultaneous paths" we could be in the subgraph when we reach this state selection.
    readonly subgraphPaths: SimultaneousPaths[]
  ) {}

  validateCurrentSelection(supergraphSchema: Schema, cache: QueryGraphState<OpGraphPath[]>, excludedEdges: ExcludedEdges): ConditionValidationState[] | null {
    let newPaths: SimultaneousPaths[] = [];
    for (const path of this.subgraphPaths) {
      const pathOptions = advanceSimultaneousPathsWithOperation(
        supergraphSchema,
        path,
        this.selection.element(),
        emptyContext,
        (conditions, vertex, excluded) => validateConditions(supergraphSchema, conditions, GraphPath.create(path[0].graph, vertex), cache, excluded),
        cache,
        excludedEdges
      );
      if (!pathOptions) {
        continue;
      }
      newPaths = newPaths.concat(pathOptions);
    }

    // If we got no paths, it means that particular selection of the conditions cannot be satisfied, so the
    // overall condition cannot.
    if (newPaths.length === 0) {
      return null;
    }
    return this.selection.selectionSet
      ? [...this.selection.selectionSet.selections()].map(s => new ConditionValidationState(s, newPaths))
      : [];
  }

  toString(): string {
    return `${this.selection} <=> [${this.subgraphPaths.map(s => s.toString()).join(', ')}]`;
  }
}

function validateConditions(supergraphSchema: Schema, conditions: SelectionSet, initialPath: OpGraphPath, cache: QueryGraphState<OpGraphPath[]>, excludedEdges: ExcludedEdges): null | undefined {
  const stack: ConditionValidationState[] = [];
  for (const selection of conditions.selections()) {
    stack.push(new ConditionValidationState(selection, [[initialPath]]));
  }

  while (stack.length > 0) {
    const state = stack.pop()!;
    const newStates = state.validateCurrentSelection(supergraphSchema, cache, excludedEdges);
    if (newStates === null) {
      return null;
    }
    newStates.forEach(s => stack.push(s));
  }
  // If we exhaust the stack, it means we've been able to find "some" path for every possible selection in the condition, so the
  // condition is validated.
  return undefined;
}

