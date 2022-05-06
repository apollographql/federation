import {
  ArgumentNode,
  ASTNode,
  DefinitionNode,
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  GraphQLError,
  InlineFragmentNode,
  Kind,
  OperationDefinitionNode,
  parse,
  SelectionNode,
  SelectionSetNode,
  OperationTypeNode,
  NameNode,
} from "graphql";
import {
  baseType,
  Directive,
  DirectiveTargetElement,
  FieldDefinition,
  InterfaceType,
  isCompositeType,
  isInterfaceType,
  isLeafType,
  isNullableType,
  isObjectType,
  isUnionType,
  ObjectType,
  runtimeTypesIntersects,
  Schema,
  SchemaRootKind,
  mergeVariables,
  Variables,
  variablesInArguments,
  VariableDefinitions,
  variableDefinitionsFromAST,
  CompositeType,
  typenameFieldName,
  NamedType,
  sameDirectiveApplications,
} from "./definitions";
import { sameType } from "./types";
import { assert, mapEntries, MapWithCachedArrays, MultiMap } from "./utils";
import { argumentsEquals, argumentsFromAST, isValidValue, valueToAST, valueToString } from "./values";

function validate(condition: any, message: () => string, sourceAST?: ASTNode): asserts condition {
  if (!condition) {
    throw new GraphQLError(message(), sourceAST);
  }
}

function haveSameDirectives<TElement extends OperationElement>(op1: TElement, op2: TElement): boolean {
  return sameDirectiveApplications(op1.appliedDirectives, op2.appliedDirectives);
}

abstract class AbstractOperationElement<T extends AbstractOperationElement<T>> extends DirectiveTargetElement<T> {
  constructor(
    schema: Schema,
    private readonly variablesInElement: Variables
  ) {
    super(schema);
  }

  variables(): Variables {
    return mergeVariables(this.variablesInElement, this.variablesInAppliedDirectives());
  }

  abstract updateForAddingTo(selection: SelectionSet): T;
}

export class Field<TArgs extends {[key: string]: any} = {[key: string]: any}> extends AbstractOperationElement<Field<TArgs>> {
  readonly kind = 'Field' as const;

  constructor(
    readonly definition: FieldDefinition<CompositeType>,
    readonly args: TArgs = Object.create(null),
    readonly variableDefinitions: VariableDefinitions = new VariableDefinitions(),
    readonly alias?: string
  ) {
    super(definition.schema(), variablesInArguments(args));
    this.validate();
  }

  get name(): string {
    return this.definition.name;
  }

  responseName(): string {
    return this.alias ? this.alias : this.name;
  }

  get parentType(): CompositeType {
    return this.definition.parent;
  }

  withUpdatedDefinition(newDefinition: FieldDefinition<any>): Field<TArgs> {
    const newField = new Field<TArgs>(newDefinition, this.args, this.variableDefinitions, this.alias);
    for (const directive of this.appliedDirectives) {
      newField.applyDirective(directive.definition!, directive.arguments());
    }
    return newField;
  }

  appliesTo(type: ObjectType | InterfaceType): boolean {
    const definition = type.field(this.name);
    return !!definition && this.selects(definition);
  }

  selects(definition: FieldDefinition<any>, assumeValid: boolean = false): boolean {
    // We've already validated that the field selects the definition on which it was built.
    if (definition == this.definition) {
      return true;
    }

    // This code largely mirrors validate, so we could generalize that and return false on exception, but this
    // method is called fairly often and that has been shown to impact performance quite a lot. So a little
    // bit of code duplication is ok.
    if (this.name !== definition.name) {
      return false;
    }

    // We need to make sure the field has valid values for every non-optional argument.
    for (const argDef of definition.arguments()) {
      const appliedValue = this.args[argDef.name];
      if (appliedValue === undefined) {
        if (argDef.defaultValue === undefined && !isNullableType(argDef.type!)) {
          return false;
        }
      } else {
        if (!assumeValid && !isValidValue(appliedValue, argDef, this.variableDefinitions)) {
          return false;
        }
      }
    }

    // We also make sure the field application does not have non-null values for field that are not part of the definition.
    if (!assumeValid) {
      for (const [name, value] of Object.entries(this.args)) {
        if (value !== null && definition.argument(name) === undefined) {
          return false
        }
      }
    }
    return true;
  }

  private validate() {
    validate(this.name === this.definition.name, () => `Field name "${this.name}" cannot select field "${this.definition.coordinate}: name mismatch"`);

    // We need to make sure the field has valid values for every non-optional argument.
    for (const argDef of this.definition.arguments()) {
      const appliedValue = this.args[argDef.name];
      if (appliedValue === undefined) {
        validate(
          argDef.defaultValue !== undefined || isNullableType(argDef.type!),
          () => `Missing mandatory value "${argDef.name}" in field selection "${this}"`);
      } else {
        validate(
          isValidValue(appliedValue, argDef, this.variableDefinitions),
          () => `Invalid value ${valueToString(appliedValue)} for argument "${argDef.coordinate}" of type ${argDef.type}`)
      }
    }

    // We also make sure the field application does not have non-null values for field that are not part of the definition.
    for (const [name, value] of Object.entries(this.args)) {
      validate(
        value === null || this.definition.argument(name) !== undefined,
        () => `Unknown argument "${name}" in field application of "${this.name}"`);
    }
  }

  updateForAddingTo(selectionSet: SelectionSet): Field<TArgs> {
    const selectionParent = selectionSet.parentType;
    const fieldParent = this.definition.parent;
    if (selectionParent.name !== fieldParent.name) {
      if (this.name === typenameFieldName) {
        return this.withUpdatedDefinition(selectionParent.typenameField()!);
      }

      // We accept adding a selection of an interface field to a selection of one of its subtype. But otherwise, it's invalid.
      // Do note that the field might come from a supergraph while the selection is on a subgraph, so we avoid relying on isDirectSubtype (because
      // isDirectSubtype relies on the subtype knowing which interface it implements, but the one of the subgraph might not declare implementing
      // the supergraph interface, even if it does in the subgraph).
      validate(
        !isUnionType(selectionParent)
        && (
          (isInterfaceType(fieldParent) && fieldParent.allImplementations().some(i => i.name == selectionParent.name))
          || (isObjectType(fieldParent) && fieldParent.name == selectionParent.name)
        ),
        () => `Cannot add selection of field "${this.definition.coordinate}" to selection set of parent type "${selectionSet.parentType}"`
      );
      const fieldDef = selectionParent.field(this.name);
      validate(fieldDef, () => `Cannot add selection of field "${this.definition.coordinate}" to selection set of parent type "${selectionParent} (that does not declare that type)"`);
      return this.withUpdatedDefinition(fieldDef);
    }
    return this;
  }

  equals(that: OperationElement): boolean {
    if (this === that) {
      return true;
    }
    return that.kind === 'Field'
      && this.name === that.name
      && this.alias === that.alias
      && argumentsEquals(this.args, that.args)
      && haveSameDirectives(this, that);
  }

  toString(): string {
    const alias = this.alias ? this.alias + ': ' : '';
    const entries = Object.entries(this.args);
    const args = entries.length == 0
      ? ''
      : '(' + entries.map(([n, v]) => `${n}: ${valueToString(v, this.definition.argument(n)?.type)}`).join(', ') + ')';
    return alias + this.name + args + this.appliedDirectivesToString();
  }
}

export class FragmentElement extends AbstractOperationElement<FragmentElement> {
  readonly kind = 'FragmentElement' as const;
  readonly typeCondition?: CompositeType;

  constructor(
    private readonly sourceType: CompositeType,
    typeCondition?: string | CompositeType,
  ) {
    // TODO: we should do some validation here (remove the ! with proper error, and ensure we have some intersection between
    // the source type and the type condition)
    super(sourceType.schema(), []);
    this.typeCondition = typeCondition !== undefined && typeof typeCondition === 'string'
      ? this.schema().type(typeCondition)! as CompositeType
      : typeCondition;
  }

  get parentType(): CompositeType {
    return this.sourceType;
  }

  withUpdatedSourceType(newSourceType: CompositeType): FragmentElement {
    const newFragment = new FragmentElement(newSourceType, this.typeCondition);
    for (const directive of this.appliedDirectives) {
      newFragment.applyDirective(directive.definition!, directive.arguments());
    }
    return newFragment;
  }

  updateForAddingTo(selectionSet: SelectionSet): FragmentElement {
    const selectionParent = selectionSet.parentType;
    const fragmentParent = this.parentType;
    const typeCondition = this.typeCondition;
    if (selectionParent != fragmentParent) {
      // As long as there an intersection between the type we cast into and the selection parent, it's ok.
      validate(
        !typeCondition || runtimeTypesIntersects(selectionParent, typeCondition),
        () => `Cannot add fragment of parent type "${this.parentType}" to selection set of parent type "${selectionSet.parentType}"`
      );
      return this.withUpdatedSourceType(selectionParent);
    }
    return this;
  }

  equals(that: OperationElement): boolean {
    if (this === that) {
      return true;
    }
    return that.kind === 'FragmentElement'
      && this.typeCondition?.name === that.typeCondition?.name
      && haveSameDirectives(this, that);
  }

  toString(): string {
    return '...' + (this.typeCondition ? ' on ' + this.typeCondition : '') + this.appliedDirectivesToString();
  }
}

export type OperationElement = Field<any> | FragmentElement;

export type OperationPath = OperationElement[];

export function sameOperationPaths(p1: OperationPath, p2: OperationPath): boolean {
  if (p1 === p2) {
    return true;
  }

  if (p1.length !== p2.length) {
    return false;
  }
  for (let i = 0; i < p1.length; i++) {
    if (!p1[i].equals(p2[i])) {
      return false;
    }
  }
  return true;
}

export function concatOperationPaths(head: OperationPath, tail: OperationPath): OperationPath {
  // While this is mainly a simple array concatenation, we optimize slightly by recognizing if the
  // tail path starts by a fragment selection that is useless given the end of the head path.
  if (head.length === 0) {
    return tail;
  }
  if (tail.length === 0) {
    return head;
  }
  const lastOfHead = head[head.length - 1];
  const firstOfTail = tail[0];
  if (isUselessFollowupElement(lastOfHead, firstOfTail)) {
    tail = tail.slice(1);
  }
  return head.concat(tail);
}

function isUselessFollowupElement(first: OperationElement, followup: OperationElement): boolean {
  const typeOfFirst = first.kind === 'Field'
    ? baseType(first.definition.type!)
    : first.typeCondition;

  // The followup is useless if it's a fragment (with no directives we would want to preserve) whose type
  // is already that of the first element.
  return !!typeOfFirst
    && followup.kind === 'FragmentElement'
    && !!followup.typeCondition
    && followup.appliedDirectives.length === 0
    && sameType(typeOfFirst, followup.typeCondition);
}

export type RootOperationPath = {
  rootKind: SchemaRootKind,
  path: OperationPath
}

// TODO Operations can also have directives
export class Operation {
  constructor(
    readonly rootKind: SchemaRootKind,
    readonly selectionSet: SelectionSet,
    readonly variableDefinitions: VariableDefinitions,
    readonly name?: string) {
  }

  optimize(fragments?: NamedFragments, minUsagesToOptimize: number = 2): Operation {
    if (!fragments) {
      return this;
    }
    let optimizedSelection = this.selectionSet.optimize(fragments);
    if (optimizedSelection === this.selectionSet) {
      return this;
    }

    // Optimizing fragments away, and then de-optimizing if it's used less than we want, feels a bit wasteful,
    // but it's simple and probably don't matter too much in practice (we only call this optimization on the
    // final compted query plan, so not a very hot path; plus in most case we won't even reach that point
    // either because there is no fragment, or none will have been optimized away and we'll exit above). We
    // can optimize later if this show up in profiling though.
    if (minUsagesToOptimize > 1) {
      const usages = new Map<string, number>();
      optimizedSelection.collectUsedFragmentNames(usages);
      for (const fragment of fragments.names()) {
        if (!usages.has(fragment)) {
          usages.set(fragment, 0);
        }
      }
      const toDeoptimize = mapEntries(usages).filter(([_, count]) => count < minUsagesToOptimize).map(([name]) => name);
      optimizedSelection = optimizedSelection.expandFragments(toDeoptimize);
    }
    return new Operation(this.rootKind, optimizedSelection, this.variableDefinitions, this.name);
  }

  expandAllFragments(): Operation {
    const expandedSelections = this.selectionSet.expandFragments();
    if (expandedSelections === this.selectionSet) {
      return this;
    }

    return new Operation(
      this.rootKind,
      expandedSelections,
      this.variableDefinitions,
      this.name
    );
  }

  toString(expandFragments: boolean = false, prettyPrint: boolean = true): string {
    return this.selectionSet.toOperationString(this.rootKind, this.variableDefinitions, this.name, expandFragments, prettyPrint);
  }
}

function addDirectiveNodesToElement(directiveNodes: readonly DirectiveNode[] | undefined, element: DirectiveTargetElement<any>) {
  if (!directiveNodes) {
    return;
  }
  const schema = element.schema();
  for (const node of directiveNodes) {
    const directiveDef = schema.directive(node.name.value);
    validate(directiveDef, () => `Unknown directive "@${node.name.value}" in selection`)
    element.applyDirective(directiveDef, argumentsFromAST(directiveDef.coordinate, node.arguments, directiveDef));
  }
}

export function selectionSetOf(parentType: CompositeType, selection: Selection): SelectionSet {
  const selectionSet = new SelectionSet(parentType);
  selectionSet.add(selection);
  return selectionSet;
}

export class NamedFragmentDefinition extends DirectiveTargetElement<NamedFragmentDefinition> {
  constructor(
    schema: Schema,
    readonly name: string,
    readonly typeCondition: CompositeType,
    readonly selectionSet: SelectionSet
  ) {
    super(schema);
  }

  variables(): Variables {
    return mergeVariables(this.variablesInAppliedDirectives(), this.selectionSet.usedVariables());
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    this.selectionSet.collectUsedFragmentNames(collector);
  }

  toFragmentDefinitionNode() : FragmentDefinitionNode {
    return {
      kind: Kind.FRAGMENT_DEFINITION,
      name: {
        kind: Kind.NAME,
        value: this.name
      },
      typeCondition: {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: this.typeCondition.name
        }
      },
      selectionSet: this.selectionSet.toSelectionSetNode()
    };
  }

  toString(indent?: string): string {
    return (indent ?? '') + `fragment ${this.name} on ${this.typeCondition}${this.appliedDirectivesToString()} ${this.selectionSet.toString(false, true, indent)}`;
  }
}

export class NamedFragments {
  private readonly fragments = new MapWithCachedArrays<string, NamedFragmentDefinition>();

  isEmpty(): boolean {
    return this.fragments.size === 0;
  }

  variables(): Variables {
    let variables: Variables = [];
    for (const fragment of this.fragments.values()) {
      variables = mergeVariables(variables, fragment.variables());
    }
    return variables;
  }

  names(): readonly string[] {
    return this.fragments.keys();
  }

  add(fragment: NamedFragmentDefinition) {
    if (this.fragments.has(fragment.name)) {
      throw new GraphQLError(`Duplicate fragment name '${fragment}'`);
    }
    this.fragments.set(fragment.name, fragment);
  }

  addIfNotExist(fragment: NamedFragmentDefinition) {
    if (!this.fragments.has(fragment.name)) {
      this.fragments.set(fragment.name, fragment);
    }
  }

  onType(type: NamedType): NamedFragmentDefinition[] {
    return this.fragments.values().filter(f => f.typeCondition.name === type.name);
  }

  without(names: string[]): NamedFragments {
    if (!names.some(n => this.fragments.has(n))) {
      return this;
    }

    const newFragments = new NamedFragments();
    for (const fragment of this.fragments.values()) {
      if (!names.includes(fragment.name)) {
        // We want to keep that fragment. But that fragment might use a fragment we
        // remove, and if so, we need to expand that removed fragment.
        const updatedSelection = fragment.selectionSet.expandFragments(names, false);
        const newFragment = updatedSelection === fragment.selectionSet
          ? fragment
          : new NamedFragmentDefinition(fragment.schema(), fragment.name, fragment.typeCondition, updatedSelection);
        newFragments.add(newFragment);
      }
    }
    return newFragments;
  }

  get(name: string): NamedFragmentDefinition | undefined {
    return this.fragments.get(name);
  }

  definitions(): readonly NamedFragmentDefinition[] {
    return this.fragments.values();
  }

  validate() {
    for (const fragment of this.fragments.values()) {
      fragment.selectionSet.validate();
    }
  }

  toFragmentDefinitionNodes() : FragmentDefinitionNode[] {
    return this.definitions().map(f => f.toFragmentDefinitionNode());
  }

  toString(indent?: string) {
    return this.definitions().map(f => f.toString(indent)).join('\n\n');
  }
}

abstract class Freezable<T> {
  private _isFrozen: boolean = false;

  protected abstract us(): T;

  /**
   * Freezes this selection/selection set, making it immutable after that point (that is, attempts to modify it will error out).
   *
   * This method should be used when a selection/selection set should not be modified. It ensures both that:
   *  1. direct attempts to modify the selection afterward fails (at runtime, but the goal is to fetch bugs early and easily).
   *  2. if this selection/selection set is "added" to another non-frozen selection (say, if this is input to `anotherSet.mergeIn(this)`),
   *   then it is automatically cloned first (thus ensuring this copy is not modified). Note that this properly is not guaranteed for
   *   non frozen selections. Meaning that if one does `s1.mergeIn(s2)` and `s2` is not frozen, then `s1` may (or may not) reference
   *   `s2` directly (without cloning) and thus later modifications to `s1` may (or may not) modify `s2`. This
   *   do-not-defensively-clone-by-default behaviour is done for performance reasons.
   *
   * Note that freezing is a "deep" operation, in that the whole structure of the selection/selection set is frozen by this method
   * (and so this is not an excessively cheap operation).
   *
   * @return this selection/selection set (for convenience, to allow method chaining).
   */
  freeze(): T {
    if (!this.isFrozen()) {
      this.freezeInternals();
      this._isFrozen = true;
    }
    return this.us();
  }

  protected abstract freezeInternals(): void;

  /**
   * Whether this selection/selection set is frozen. See `freeze` for details.
   */
  isFrozen(): boolean {
    return this._isFrozen;
  }

  /**
   * A shortcut for returning a mutable version of this selection/selection set by cloning it if it is frozen, but returning this set directly
   * if it is not frozen.
   */
  cloneIfFrozen(): T {
    return this.isFrozen() ? this.clone() : this.us();
  }

  abstract clone(): T;
}

export class SelectionSet extends Freezable<SelectionSet> {
  // The argument is either the responseName (for fields), or the type name (for fragments), with the empty string being used as a special
  // case for a fragment with no type condition.
  private readonly _selections = new MultiMap<string, Selection>();
  private _selectionCount = 0;
  private _cachedSelections?: readonly Selection[];

  constructor(
    readonly parentType: CompositeType,
    readonly fragments?: NamedFragments
  ) {
    super();
    validate(!isLeafType(parentType), () => `Cannot have selection on non-leaf type ${parentType}`);
  }

  protected us(): SelectionSet {
    return this;
  }

  selections(reversedOrder: boolean = false): readonly Selection[] {
    if (!this._cachedSelections) {
      const selections = new Array(this._selectionCount);
      let idx = 0;
      for (const byResponseName of this._selections.values()) {
        for (const selection of byResponseName) {
          selections[idx++] = selection;
        }
      }
      this._cachedSelections = selections;
    }
    assert(this._cachedSelections, 'Cache should have been populated');
    if (reversedOrder) {
      const reversed = new Array(this._selectionCount);
      for (let i = 0; i < this._selectionCount; i++) {
        reversed[i] = this._cachedSelections[this._selectionCount - i - 1];
      }
      return reversed;
    }
    return this._cachedSelections;
  }

  usedVariables(): Variables {
    let variables: Variables = [];
    for (const byResponseName of this._selections.values()) {
      for (const selection of byResponseName) {
        variables = mergeVariables(variables, selection.usedVariables());
      }
    }
    if (this.fragments) {
      variables = mergeVariables(variables, this.fragments.variables());
    }
    return variables;
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    if (!this.fragments) {
      return;
    }

    for (const byResponseName of this._selections.values()) {
      for (const selection of byResponseName) {
        selection.collectUsedFragmentNames(collector);
      }
    }
  }

  optimize(fragments?: NamedFragments): SelectionSet {
    if (!fragments || fragments.isEmpty()) {
      return this;
    }

    // If any of the existing fragments of the selection set is also a name in the provided one,
    // we bail out of optimizing anything. Not ideal, but dealing with it properly complicate things
    // and we probably don't care for now as we'll call `optimize` mainly on result sets that have
    // no named fragments in the first place.
    if (this.fragments && this.fragments.definitions().some(def => fragments.get(def.name))) {
      return this;
    }

    const optimized = new SelectionSet(this.parentType, fragments);
    for (const selection of this.selections()) {
      optimized.add(selection.optimize(fragments));
    }
    return optimized;
  }

  expandFragments(names?: string[], updateSelectionSetFragments: boolean = true): SelectionSet {
    if (!this.fragments) {
      return this;
    }

    if (names && names.length === 0) {
      return this;
    }

    const newFragments = updateSelectionSetFragments
      ? (names ? this.fragments?.without(names) : undefined)
      : this.fragments;
    const withExpanded = new SelectionSet(this.parentType, newFragments);
    for (const selection of this.selections()) {
      withExpanded.add(selection.expandFragments(names, updateSelectionSetFragments));
    }
    return withExpanded;
  }

  /**
   * Returns the selection select from filtering out any selection that does not match the provided predicate.
   *
   * Please that this method will expand *ALL* fragments as the result of applying it's filtering. You should
   * call `optimize` on the result if you want to re-apply some fragments.
   */
  filter(predicate: (selection: Selection) => boolean): SelectionSet {
    const filtered = new SelectionSet(this.parentType, this.fragments);
    for (const selection of this.selections()) {
      const filteredSelection = selection.filter(predicate);
      if (filteredSelection) {
        filtered.add(filteredSelection);
      }
    }
    return filtered;
  }

  protected freezeInternals(): void {
    for (const selection of this.selections()) {
      selection.freeze();
    }
  }

  /**
   * Adds the selections of the provided selection set to this selection, merging common selection as necessary.
   *
   * Please note that by default, the selection from the input may (or may not) be directly referenced by this selection
   * set after this method return. That is, future modification of this selection set may end up modifying the input
   * set due to direct aliasing. If direct aliasing should be prevented, the input selection set should be frozen (see
   * `freeze` for details).
   */
  mergeIn(selectionSet: SelectionSet) {
    for (const selection of selectionSet.selections()) {
      this.add(selection);
    }
  }

  /**
   * Adds the provided selections to this selection, merging common selection as necessary.
   *
   * This is very similar to `mergeIn` except that it takes a direct array of selection, and the direct aliasing
   * remarks from `mergeInd` applies here too.
   */
  addAll(selections: Selection[]): SelectionSet {
    selections.forEach(s => this.add(s));
    return this;
  }

  /**
   * Adds the provided selection to this selection, merging it to any existing selection of this set as appropriate.
   *
   * Please note that by default, the input selection may (or may not) be directly referenced by this selection
   * set after this method return. That is, future modification of this selection set may end up modifying the input
   * selection due to direct aliasing. If direct aliasing should be prevented, the input selection should be frozen
   * (see `freeze` for details).
   */
  add(selection: Selection): Selection {
    // It's a bug to try to add to a frozen selection set
    assert(!this.isFrozen(), () => `Cannot add to frozen selection: ${this}`);

    const toAdd = selection.updateForAddingTo(this);
    const key = toAdd.key();
    const existing: Selection[] | undefined = this._selections.get(key);
    if (existing) {
      for (const existingSelection of existing) {
        if (existingSelection.kind === toAdd.kind && haveSameDirectives(existingSelection.element(), toAdd.element())) {
          if (toAdd.selectionSet) {
            existingSelection.selectionSet!.mergeIn(toAdd.selectionSet);
          }
          return existingSelection;
        }
      }
    }
    this._selections.add(key, toAdd);
    ++this._selectionCount;
    this._cachedSelections = undefined;
    return selection;
  }

  addPath(path: OperationPath) {
    let previousSelections: SelectionSet = this;
    let currentSelections: SelectionSet | undefined = this;
    for (const element of path) {
      validate(currentSelections, () => `Cannot apply selection ${element} to non-selectable parent type "${previousSelections.parentType}"`);
      const mergedSelection: Selection = currentSelections.add(selectionOfElement(element));
      previousSelections = currentSelections;
      currentSelections = mergedSelection.selectionSet;
    }
  }

  addSelectionSetNode(
    node: SelectionSetNode | undefined,
    variableDefinitions: VariableDefinitions,
    fieldAccessor: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined = (type, name) => type.field(name)
  ) {
    if (!node) {
      return;
    }
    for (const selectionNode of node.selections) {
      this.addSelectionNode(selectionNode, variableDefinitions, fieldAccessor);
    }
  }

  addSelectionNode(
    node: SelectionNode,
    variableDefinitions: VariableDefinitions,
    fieldAccessor: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined = (type, name) => type.field(name)
  ) {
    this.add(this.nodeToSelection(node, variableDefinitions, fieldAccessor));
  }

  private nodeToSelection(
    node: SelectionNode,
    variableDefinitions: VariableDefinitions,
    fieldAccessor: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined
  ): Selection {
    let selection: Selection;
    switch (node.kind) {
      case Kind.FIELD:
        const definition: FieldDefinition<any> | undefined  = fieldAccessor(this.parentType, node.name.value);
        validate(definition, () => `Cannot query field "${node.name.value}" on type "${this.parentType}".`, this.parentType.sourceAST);
        const type = baseType(definition.type!);
        selection = new FieldSelection(
          new Field(definition, argumentsFromAST(definition.coordinate, node.arguments, definition), variableDefinitions, node.alias?.value),
          isLeafType(type) ? undefined : new SelectionSet(type as CompositeType, this.fragments)
        );
        if (node.selectionSet) {
          validate(selection.selectionSet, () => `Unexpected selection set on leaf field "${selection.element()}"`, selection.element().definition.sourceAST);
          selection.selectionSet.addSelectionSetNode(node.selectionSet, variableDefinitions, fieldAccessor);
        }
        break;
      case Kind.INLINE_FRAGMENT:
        const element = new FragmentElement(this.parentType, node.typeCondition?.name.value);
        selection = new InlineFragmentSelection(
          element,
          new SelectionSet(element.typeCondition ? element.typeCondition : element.parentType, this.fragments)
        );
        selection.selectionSet.addSelectionSetNode(node.selectionSet, variableDefinitions, fieldAccessor);
        break;
      case Kind.FRAGMENT_SPREAD:
        const fragmentName = node.name.value;
        validate(this.fragments, () => `Cannot find fragment name "${fragmentName}" (no fragments were provided)`);
        selection = new FragmentSpreadSelection(this.parentType, this.fragments, fragmentName);
        break;
    }
    addDirectiveNodesToElement(node.directives, selection.element());
    return selection;
  }

  equals(that: SelectionSet): boolean {
    if (this === that) {
      return true;
    }

    if (this._selections.size !== that._selections.size) {
      return false;
    }

    for (const [key, thisSelections] of this._selections) {
      const thatSelections = that._selections.get(key);
      if (!thatSelections
        || thisSelections.length !== thatSelections.length
        || !thisSelections.every(thisSelection => thatSelections.some(thatSelection => thisSelection.equals(thatSelection)))
      ) {
        return false
      }
    }
    return true;
  }

  contains(that: SelectionSet): boolean {
    if (this._selections.size < that._selections.size) {
      return false;
    }

    for (const [key, thatSelections] of that._selections) {
      const thisSelections = this._selections.get(key);
      if (!thisSelections
        || (thisSelections.length < thatSelections.length
        || !thatSelections.every(thatSelection => thisSelections.some(thisSelection => thisSelection.contains(thatSelection))))
      ) {
        return false
      }
    }
    return true;
  }

  validate() {
    validate(!this.isEmpty(), () => `Invalid empty selection set`);
    for (const selection of this.selections()) {
      selection.validate();
      const selectionFragments = selection.namedFragments();
      // We make this an assertion because this is a programming error. But validate is a convenient place for this in practice.
      assert(!selectionFragments || selectionFragments === this.fragments, () => `Selection fragments (${selectionFragments}) for ${selection} does not match selection set one (${this.fragments})`);
    }
  }

  isEmpty(): boolean {
    return this._selections.size === 0;
  }

  toSelectionSetNode(): SelectionSetNode {
    // In theory, for valid operations, we shouldn't have empty selection sets (field selections whose type is a leaf will
    // have an undefined selection set, not an empty one). We do "abuse" this a bit however when create query "witness"
    // during composition validation where, to make it easier for users to locate the issue, we want the created witness
    // query to stop where the validation problem lies, even if we're not on a leaf type. To make this look nice and
    // explicit, we handle that case by create a fake selection set that just contains an ellipsis, indicate there is
    // supposed to be more but we elided it for clarity. And yes, the whole thing is a bit of a hack, albeit a convenient
    // one.
    if (this.isEmpty()) {
      return {
        kind: Kind.SELECTION_SET,
        selections: [{
          kind: Kind.FIELD,
          name: {
            kind: Kind.NAME,
            value: '...',
          },
        }]
      }
    }
    return {
      kind: Kind.SELECTION_SET,
      selections: Array.from(this.selectionsInPrintOrder(), s => s.toSelectionNode())
    }
  }

  private selectionsInPrintOrder(): readonly Selection[] {
    // By default, we will print the selection the order in which things were added to it.
    // If __typename is selected however, we put it first. It's a detail but as __typename is a bit special it looks better,
    // and it happens to mimic prior behavior on the query plan side so it saves us from changing tests for no good reasons.
    const typenameSelection = this._selections.get(typenameFieldName);
    if (typenameSelection) {
      return typenameSelection.concat(this.selections().filter(s => s.kind != 'FieldSelection' || s.field.name !== typenameFieldName));
    } else {
      return this.selections();
    }
  }

  toOperationPaths(): OperationPath[] {
    return this.toOperationPathsInternal([]);
  }

  private toOperationPathsInternal(parentPaths: OperationPath[]): OperationPath[] {
    return this.selections().flatMap((selection) => {
      const updatedPaths = parentPaths.map(path => path.concat(selection.element()));
      return selection.selectionSet
        ? selection.selectionSet.toOperationPathsInternal(updatedPaths)
        : updatedPaths;
    });
  }

  clone(): SelectionSet {
    const cloned = new SelectionSet(this.parentType);
    for (const selection of this.selections()) {
      cloned.add(selection.clone());
    }
    return cloned;
  }

  toOperationString(
    rootKind: SchemaRootKind,
    variableDefinitions: VariableDefinitions,
    operationName?: string,
    expandFragments: boolean = false,
    prettyPrint: boolean = true
  ): string {
    const indent = prettyPrint ? '' : undefined;
    const fragmentsDefinitions = !expandFragments && this.fragments && !this.fragments.isEmpty()
      ? this.fragments.toString(indent) + "\n\n"
      : "";
    if (rootKind == "query" && !operationName && variableDefinitions.isEmpty()) {
      return fragmentsDefinitions + this.toString(expandFragments, true, indent);
    }
    const nameAndVariables = operationName
      ? " " + (operationName + (variableDefinitions.isEmpty() ? "" : variableDefinitions.toString()))
      : (variableDefinitions.isEmpty() ? "" : " " + variableDefinitions.toString());
    return fragmentsDefinitions + rootKind + nameAndVariables + " " + this.toString(expandFragments, true, indent);
  }

  /**
   * The string representation of this selection set.
   *
   * By default, this expand all fragments so that the returned string is self-contained. You can
   * use the `expandFragments` boolean to force fragments to not be expanded but the fragments
   * definitions will _not_ be included in the returned string. If you want a representation of
   * this selection set with fragments definitions included, use `toOperationString` instead.
   */
  toString(
    expandFragments: boolean = true,
    includeExternalBrackets: boolean = true,
    indent?: string
  ): string {
    if (indent === undefined) {
      const selectionsToString = this.selections().map(s => s.toString(expandFragments)).join(' ');
      return includeExternalBrackets ?  '{ ' + selectionsToString  + ' }' : selectionsToString;
    } else {
      const selectionIndent = includeExternalBrackets ? indent + "  " : indent;
      const selectionsToString = this.selections().map(s => s.toString(expandFragments, selectionIndent)).join('\n');
      return includeExternalBrackets
        ? '{\n' + selectionsToString  + '\n' + indent + '}'
        : selectionsToString;
    }
  }
}

export function allFieldDefinitionsInSelectionSet(selection: SelectionSet): FieldDefinition<CompositeType>[] {
  const stack = Array.from(selection.selections());
  const allFields: FieldDefinition<CompositeType>[] = [];
  while (stack.length > 0) {
    const selection = stack.pop()!;
    if (selection.kind === 'FieldSelection') {
      allFields.push(selection.field.definition);
    }
    if (selection.selectionSet) {
      stack.push(...selection.selectionSet.selections());
    }
  }
  return allFields;
}

export function selectionSetOfElement(element: OperationElement, subSelection?: SelectionSet): SelectionSet {
  const selectionSet = new SelectionSet(element.parentType);
  selectionSet.add(selectionOfElement(element, subSelection));
  return selectionSet;
}

export function selectionOfElement(element: OperationElement, subSelection?: SelectionSet): Selection {
  return element.kind === 'Field' ? new FieldSelection(element, subSelection) : new InlineFragmentSelection(element, subSelection);
}

export function selectionSetOfPath(path: OperationPath, onPathEnd?: (finalSelectionSet: SelectionSet | undefined) => void): SelectionSet {
  validate(path.length > 0, () => `Cannot create a selection set from an empty path`);
  const last = selectionSetOfElement(path[path.length - 1]);
  let current = last;
  for (let i = path.length - 2; i >= 0; i--) {
    current = selectionSetOfElement(path[i], current);
  }
  if (onPathEnd) {
    onPathEnd(last.selections()[0].selectionSet);
  }
  return current;
}

export type Selection = FieldSelection | FragmentSelection;

export class FieldSelection extends Freezable<FieldSelection> {
  readonly kind = 'FieldSelection' as const;
  readonly selectionSet?: SelectionSet;

  constructor(
    readonly field: Field<any>,
    initialSelectionSet? : SelectionSet
  ) {
    super();
    const type = baseType(field.definition.type!);
    // Field types are output type, and a named typethat is an output one and isn't a leaf is guaranteed to be selectable.
    this.selectionSet = isLeafType(type) ? undefined : (initialSelectionSet ? initialSelectionSet.cloneIfFrozen() : new SelectionSet(type as CompositeType));
  }

  protected us(): FieldSelection {
    return this;
  }

  key(): string {
    return this.element().responseName();
  }

  element(): Field<any> {
    return this.field;
  }

  usedVariables(): Variables {
    return mergeVariables(this.element().variables(), this.selectionSet?.usedVariables() ?? []);
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    if (this.selectionSet) {
      this.selectionSet.collectUsedFragmentNames(collector);
    }
  }

  optimize(fragments: NamedFragments): FieldSelection {
    const optimizedSelection = this.selectionSet ? this.selectionSet.optimize(fragments) : undefined;
    return this.selectionSet === optimizedSelection
      ? this
      : new FieldSelection(this.field, optimizedSelection);
  }

  filter(predicate: (selection: Selection) => boolean): FieldSelection | undefined {
    if (!predicate(this)) {
      return undefined;
    }
    if (!this.selectionSet) {
      return this;
    }
    return new FieldSelection(this.field, this.selectionSet.filter(predicate));
  }

  protected freezeInternals(): void {
    this.selectionSet?.freeze();
  }

  expandFragments(names?: string[], updateSelectionSetFragments: boolean = true): FieldSelection {
    const expandedSelection = this.selectionSet ? this.selectionSet.expandFragments(names, updateSelectionSetFragments) : undefined;
    return this.selectionSet === expandedSelection
      ? this
      : new FieldSelection(this.field, expandedSelection);
  }

  private fieldArgumentsToAST(): ArgumentNode[] | undefined {
    const entries = Object.entries(this.field.args);
    if (entries.length === 0) {
      return undefined;
    }

    return entries.map(([n, v]) => {
      return {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: n },
        value: valueToAST(v, this.field.definition.argument(n)!.type!)!,
      };
    });
  }

  validate() {
    // Note that validation is kind of redundant since `this.selectionSet.validate()` will check that it isn't empty. But doing it
    // allow to provide much better error messages.
    validate(
      !(this.selectionSet && this.selectionSet.isEmpty()),
      () => `Invalid empty selection set for field "${this.field.definition.coordinate}" of non-leaf type ${this.field.definition.type}`,
      this.field.definition.sourceAST
    );
    this.selectionSet?.validate();
  }

  updateForAddingTo(selectionSet: SelectionSet): FieldSelection {
    const updatedField = this.field.updateForAddingTo(selectionSet);
    return this.field === updatedField
      ? this.cloneIfFrozen()
      : new FieldSelection(updatedField, this.selectionSet?.cloneIfFrozen());
  }

  toSelectionNode(): FieldNode {
    const alias: NameNode | undefined = this.field.alias ? { kind: Kind.NAME, value: this.field.alias, } : undefined;
    return {
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        value: this.field.name,
      },
      alias,
      arguments: this.fieldArgumentsToAST(),
      directives: this.element().appliedDirectivesToDirectiveNodes(),
      selectionSet: this.selectionSet?.toSelectionSetNode()
    };
  }

  equals(that: Selection): boolean {
    if (this === that) {
      return true;
    }

    if (!(that instanceof FieldSelection) || !this.field.equals(that.field)) {
      return false;
    }
    if (!this.selectionSet) {
      return !that.selectionSet;
    }
    return !!that.selectionSet && this.selectionSet.equals(that.selectionSet);
  }

  contains(that: Selection): boolean {
    if (!(that instanceof FieldSelection) || !this.field.equals(that.field)) {
      return false;
    }

    if (!that.selectionSet) {
      return true;
    }
    return !!this.selectionSet && this.selectionSet.contains(that.selectionSet);
  }

  namedFragments(): NamedFragments | undefined {
    return this.selectionSet?.fragments;
  }

  clone(): FieldSelection {
    if (!this.selectionSet) {
      return this;
    }
    return new FieldSelection(this.field, this.selectionSet.clone());
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    return (indent ?? '') + this.field + (this.selectionSet ? ' ' + this.selectionSet.toString(expandFragments, true, indent) : '');
  }
}

export abstract class FragmentSelection extends Freezable<FragmentSelection> {
  readonly kind = 'FragmentSelection' as const;

  abstract key(): string;

  abstract element(): FragmentElement;

  abstract get selectionSet(): SelectionSet;

  abstract collectUsedFragmentNames(collector: Map<string, number>): void;

  abstract namedFragments(): NamedFragments | undefined;

  abstract optimize(fragments: NamedFragments): FragmentSelection;

  abstract expandFragments(names?: string[]): FragmentSelection;

  abstract toSelectionNode(): SelectionNode;

  abstract validate(): void;

  protected us(): FragmentSelection {
    return this;
  }

  usedVariables(): Variables {
    return mergeVariables(this.element().variables(), this.selectionSet.usedVariables());
  }

  updateForAddingTo(selectionSet: SelectionSet): FragmentSelection {
    const updatedFragment = this.element().updateForAddingTo(selectionSet);
    return this.element() === updatedFragment
      ? this.cloneIfFrozen()
      : new InlineFragmentSelection(updatedFragment, this.selectionSet.cloneIfFrozen());
  }

  filter(predicate: (selection: Selection) => boolean): InlineFragmentSelection | undefined {
    if (!predicate(this)) {
      return undefined;
    }
    // Note that we essentially expand all fragments as part of this.
    return new InlineFragmentSelection(this.element(), this.selectionSet.filter(predicate));
  }

  protected freezeInternals() {
    this.selectionSet.freeze();
  }

  equals(that: Selection): boolean {
    if (this === that) {
      return true;
    }
    return (that instanceof FragmentSelection)
      && this.element().equals(that.element())
      && this.selectionSet.equals(that.selectionSet);
  }

  contains(that: Selection): boolean {
    return (that instanceof FragmentSelection)
      && this.element().equals(that.element())
      && this.selectionSet.contains(that.selectionSet);
  }

  clone(): FragmentSelection {
    return new InlineFragmentSelection(this.element(), this.selectionSet.clone());
  }
}

class InlineFragmentSelection extends FragmentSelection {
  private readonly _selectionSet: SelectionSet;

  constructor(
    private readonly fragmentElement: FragmentElement,
    initialSelectionSet?: SelectionSet
  ) {
    super();
    // TODO: we should do validate the type of the initial selection set.
    this._selectionSet = initialSelectionSet
      ? initialSelectionSet.cloneIfFrozen()
      : new SelectionSet(fragmentElement.typeCondition ? fragmentElement.typeCondition : fragmentElement.parentType);
  }

  key(): string {
    return this.element().typeCondition?.name ?? '';
  }

  validate() {
    // Note that validation is kind of redundant since `this.selectionSet.validate()` will check that it isn't empty. But doing it
    // allow to provide much better error messages.
    validate(
      !this.selectionSet.isEmpty(),
      () => `Invalid empty selection set for fragment "${this.element()}"`
    );
    this.selectionSet.validate();
  }


  get selectionSet(): SelectionSet {
    return this._selectionSet;
  }

  namedFragments(): NamedFragments | undefined {
    return this.selectionSet.fragments;
  }

  element(): FragmentElement {
    return this.fragmentElement;
  }

  toSelectionNode(): InlineFragmentNode {
    const typeCondition = this.element().typeCondition;
    return {
      kind: Kind.INLINE_FRAGMENT,
      typeCondition: typeCondition
        ? {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: typeCondition.name,
          },
        }
        : undefined,
      directives: this.element().appliedDirectivesToDirectiveNodes(),
      selectionSet: this.selectionSet.toSelectionSetNode()
    };
  }

  optimize(fragments: NamedFragments): FragmentSelection {
    const optimizedSelection = this.selectionSet.optimize(fragments);
    const typeCondition = this.element().typeCondition;
    if (typeCondition) {
      for (const candidate of fragments.onType(typeCondition)) {
        if (candidate.selectionSet.equals(optimizedSelection)) {
          fragments.addIfNotExist(candidate);
          return new FragmentSpreadSelection(this.element().parentType, fragments, candidate.name);
        }
      }
    }
    return this.selectionSet === optimizedSelection
      ? this
      : new InlineFragmentSelection(this.fragmentElement, optimizedSelection);
  }

  expandFragments(names?: string[], updateSelectionSetFragments: boolean = true): FragmentSelection {
    const expandedSelection = this.selectionSet.expandFragments(names, updateSelectionSetFragments);
    return this.selectionSet === expandedSelection
      ? this
      : new InlineFragmentSelection(this.element(), expandedSelection);
  }

  collectUsedFragmentNames(collector: Map<string, number>): void {
    this.selectionSet.collectUsedFragmentNames(collector);
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    return (indent ?? '') + this.fragmentElement + ' ' + this.selectionSet.toString(expandFragments, true, indent);
  }
}

class FragmentSpreadSelection extends FragmentSelection {
  private readonly namedFragment: NamedFragmentDefinition;
  // Note that the named fragment directives are copied on this element and appear first (the spreadDirectives
  // method rely on this to be able to extract the directives that are specific to the spread itself).
  private readonly _element : FragmentElement;

  constructor(
    sourceType: CompositeType,
    private readonly fragments: NamedFragments,
    fragmentName: string
  ) {
    super();
    const fragmentDefinition = fragments.get(fragmentName);
    validate(fragmentDefinition, () => `Unknown fragment "...${fragmentName}"`);
    this.namedFragment = fragmentDefinition;
    this._element = new FragmentElement(sourceType, fragmentDefinition.typeCondition);
    for (const directive of fragmentDefinition.appliedDirectives) {
      this._element.applyDirective(directive.definition!, directive.arguments());
    }
  }

  key(): string {
    return '...' + this.namedFragment.name;
  }

  element(): FragmentElement {
    return this._element;
  }

  namedFragments(): NamedFragments | undefined {
    return this.fragments;
  }

  get selectionSet(): SelectionSet {
    return this.namedFragment.selectionSet;
  }

  validate(): void {
    // We don't do anything because fragment definition are validated when created.
  }

  toSelectionNode(): FragmentSpreadNode {
    const spreadDirectives = this.spreadDirectives();
    const directiveNodes = spreadDirectives.length === 0
      ? undefined
      : spreadDirectives.map(directive => {
        return {
          kind: Kind.DIRECTIVE,
          name: {
            kind: Kind.NAME,
            value: directive.name,
          },
          arguments: directive.argumentsToAST()
        } as DirectiveNode;
      });
    return {
      kind: Kind.FRAGMENT_SPREAD,
      name: { kind: Kind.NAME, value: this.namedFragment.name },
      directives: directiveNodes,
    };
  }

  optimize(_: NamedFragments): FragmentSelection {
    return this;
  }

  expandFragments(names?: string[], updateSelectionSetFragments: boolean = true): FragmentSelection {
    if (names && !names.includes(this.namedFragment.name)) {
      return this;
    }
    return new InlineFragmentSelection(this._element, this.selectionSet.expandFragments(names, updateSelectionSetFragments));
  }

  collectUsedFragmentNames(collector: Map<string, number>): void {
    this.selectionSet.collectUsedFragmentNames(collector);
    const usageCount = collector.get(this.namedFragment.name);
    collector.set(this.namedFragment.name, usageCount === undefined ? 1 : usageCount + 1);
  }

  private spreadDirectives(): Directive<FragmentElement>[] {
    return this._element.appliedDirectives.slice(this.namedFragment.appliedDirectives.length);
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    if (expandFragments) {
      return (indent ?? '') + this._element + ' ' + this.selectionSet.toString(true, true, indent);
    } else {
      const directives = this.spreadDirectives();
      const directiveString = directives.length == 0 ? '' : ' ' + directives.join(' ');
      return (indent ?? '') + '...' + this.namedFragment.name + directiveString;
    }
  }
}

export function operationFromDocument(
  schema: Schema,
  document: DocumentNode,
  operationName?: string,
) : Operation {
  let operation: OperationDefinitionNode | undefined;
  const fragments = new NamedFragments();
  // We do a first pass to collect the operation, and create all named fragment, but without their selection set yet.
  // This allow later to be able to access any fragment regardless of the order in which the fragments are defined.
  document.definitions.forEach(definition => {
    switch (definition.kind) {
      case Kind.OPERATION_DEFINITION:
        validate(!operation || operationName, () => 'Must provide operation name if query contains multiple operations.');
        if (!operationName || (definition.name && definition.name.value === operationName)) {
          operation = definition;
        }
        break;
      case Kind.FRAGMENT_DEFINITION:
        const name = definition.name.value;
        const typeName = definition.typeCondition.name.value;
        const typeCondition = schema.type(typeName);
        if (!typeCondition) {
          throw new GraphQLError(`Unknown type "${typeName}" for fragment "${name}"`, definition);
        }
        if (!isCompositeType(typeCondition)) {
          throw new GraphQLError(`Invalid fragment "${name}" on non-composite type "${typeName}"`, definition);
        }
        const fragment = new NamedFragmentDefinition(schema, name, typeCondition, new SelectionSet(typeCondition, fragments));
        addDirectiveNodesToElement(definition.directives, fragment);
        fragments.add(fragment);
        break;
    }
  });

  validate(operation, () => operationName ? `Unknown operation named "${operationName}"` : 'No operation found in provided document.');
  // Note that we need the variables to handle the fragments, as they can be used there.
  const variableDefinitions = operation.variableDefinitions
    ? variableDefinitionsFromAST(schema, operation.variableDefinitions)
    : new VariableDefinitions();

  // We can now parse all fragments.
  document.definitions.forEach(definition => {
    switch (definition.kind) {
      case Kind.FRAGMENT_DEFINITION:
        const fragment = fragments.get(definition.name.value)!;
        fragment.selectionSet.addSelectionSetNode(definition.selectionSet, variableDefinitions);
        break;
    }
  });
  fragments.validate();
  return operationFromAST(schema, operation, fragments);
}

function operationFromAST(
  schema: Schema,
  operation: OperationDefinitionNode,
  fragments: NamedFragments
) : Operation {
  const rootType = schema.schemaDefinition.root(operation.operation);
  validate(rootType, () => `The schema has no "${operation.operation}" root type defined`);
  const variableDefinitions = operation.variableDefinitions ? variableDefinitionsFromAST(schema, operation.variableDefinitions) : new VariableDefinitions();
  return new Operation(
    operation.operation,
    parseSelectionSet({
      parentType: rootType.type,
      source: operation.selectionSet,
      variableDefinitions,
      fragments,
    }),
    variableDefinitions,
    operation.name?.value
  );
}

export function parseOperation(schema: Schema, operation: string, operationName?: string): Operation {
  return operationFromDocument(schema, parse(operation), operationName);
}

export function parseSelectionSet({
  parentType,
  source,
  variableDefinitions,
  fragments,
  fieldAccessor,
  validate = true,
}: {
  parentType: CompositeType,
  source: string | SelectionSetNode,
  variableDefinitions?: VariableDefinitions,
  fragments?: NamedFragments,
  fieldAccessor?: (type: CompositeType, fieldName: string) => (FieldDefinition<any> | undefined),
  validate?: boolean,
}): SelectionSet {
  // TODO: we should maybe allow the selection, when a string, to contain fragment definitions?
  const node = typeof source === 'string'
    ? parseOperationAST(source.trim().startsWith('{') ? source : `{${source}}`).selectionSet
    : source;
  const selectionSet = new SelectionSet(parentType, fragments);
  selectionSet.addSelectionSetNode(node, variableDefinitions ?? new VariableDefinitions(), fieldAccessor);
  if (validate)
    selectionSet.validate();
  return selectionSet;
}

function parseOperationAST(source: string): OperationDefinitionNode {
  const parsed = parse(source);
  validate(parsed.definitions.length === 1, () => 'Selections should contain a single definitions, found ' + parsed.definitions.length);
  const def = parsed.definitions[0];
  validate(def.kind === Kind.OPERATION_DEFINITION, () => 'Expected an operation definition but got a ' + def.kind);
  return def;
}

export function operationToDocument(operation: Operation): DocumentNode {
  const operationAST: OperationDefinitionNode = {
    kind: Kind.OPERATION_DEFINITION,
    operation: operation.rootKind as OperationTypeNode,
    name: operation.name ? { kind: Kind.NAME, value: operation.name } : undefined,
    selectionSet: operation.selectionSet.toSelectionSetNode(),
    variableDefinitions: operation.variableDefinitions.toVariableDefinitionNodes(),
  };
  const fragmentASTs: DefinitionNode[] = operation.selectionSet.fragments
    ? operation.selectionSet.fragments?.toFragmentDefinitionNodes()
    : [];
  return {
    kind: Kind.DOCUMENT,
    definitions: [operationAST as DefinitionNode].concat(fragmentASTs),
  };
}
