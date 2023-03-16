import {
  ArgumentNode,
  ASTNode,
  DefinitionNode,
  DirectiveNode,
  DocumentNode,
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
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
  sameDirectiveApplications,
  isConditionalDirective,
  isDirectiveApplicationsSubset,
  isAbstractType,
  DeferDirectiveArgs,
  Variable,
  possibleRuntimeTypes,
  Type,
} from "./definitions";
import { ERRORS } from "./error";
import { isDirectSubtype, sameType } from "./types";
import { assert, mapEntries, MapWithCachedArrays, MultiMap, SetMultiMap } from "./utils";
import { argumentsEquals, argumentsFromAST, isValidValue, valueToAST, valueToString } from "./values";
import { createHash } from '@apollo/utils.createhash';

export interface OptimizeOptions {
  minUsagesToOptimize?: number
  autoFragmetize?: boolean
  schema?: Schema
}

function validate(condition: any, message: () => string, sourceAST?: ASTNode): asserts condition {
  if (!condition) {
    throw ERRORS.INVALID_GRAPHQL.err(message(), { nodes: sourceAST });
  }
}

function haveSameDirectives<TElement extends OperationElement>(op1: TElement, op2: TElement): boolean {
  return sameDirectiveApplications(op1.appliedDirectives, op2.appliedDirectives);
}

abstract class AbstractOperationElement<T extends AbstractOperationElement<T>> extends DirectiveTargetElement<T> {
  private attachements?: Map<string, string>;

  constructor(
    schema: Schema,
    private readonly variablesInElement: Variables
  ) {
    super(schema);
  }

  variables(): Variables {
    return mergeVariables(this.variablesInElement, this.variablesInAppliedDirectives());
  }

  /**
   * See `FielSelection.updateForAddingTo` for a discussion of why this method exists and what it does.
   */
  abstract updateForAddingTo(selection: SelectionSet): T;

  addAttachement(key: string, value: string) {
    if (!this.attachements) {
      this.attachements = new Map();
    }
    this.attachements.set(key, value);
  }

  getAttachement(key: string): string | undefined {
    return this.attachements?.get(key);
  }

  protected copyAttachementsTo(elt: AbstractOperationElement<any>) {
    if (this.attachements) {
      for (const [k, v] of this.attachements.entries()) {
        elt.addAttachement(k, v);
      }
    }
  }
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
    this.copyAttachementsTo(newField);
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

  validate() {
    validate(this.name === this.definition.name, () => `Field name "${this.name}" cannot select field "${this.definition.coordinate}: name mismatch"`);

    // We need to make sure the field has valid values for every non-optional argument.
    for (const argDef of this.definition.arguments()) {
      const appliedValue = this.args[argDef.name];
      if (appliedValue === undefined) {
        validate(
          argDef.defaultValue !== undefined || isNullableType(argDef.type!),
          () => `Missing mandatory value for argument "${argDef.name}" of field "${this.definition.coordinate}" in selection "${this}"`);
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

  /**
   * See `FielSelection.updateForAddingTo` for a discussion of why this method exists and what it does.
   */
  updateForAddingTo(selectionSet: SelectionSet): Field<TArgs> {
    const selectionParent = selectionSet.parentType;
    const fieldParent = this.definition.parent;
    if (selectionParent === fieldParent) {
      return this;
    }

    if (this.name === typenameFieldName) {
      return this.withUpdatedDefinition(selectionParent.typenameField()!);
    }

    validate(
      this.canRebaseOn(selectionParent),
      () => `Cannot add selection of field "${this.definition.coordinate}" to selection set of parent type "${selectionParent}"`
    );
    const fieldDef = selectionParent.field(this.name);
    validate(fieldDef, () => `Cannot add selection of field "${this.definition.coordinate}" to selection set of parent type "${selectionParent}" (that does not declare that field)`);
    return this.withUpdatedDefinition(fieldDef);
  }

  private canRebaseOn(parentType: CompositeType) {
    // There is 2 valid cases we want to allow:
    //  1. either `selectionParent` and `fieldParent` are the same underlying type (same name) but from different underlying schema. Typically,
    //    happens when we're building subgraph queries but using selections from the original query which is against the supergraph API schema.
    //  2. or they are not the same underlying type, and we only accept this if we're adding an interface field to a selection of one of its
    //    subtype, and this for convenience. Note that in that case too, `selectinParent` and `fieldParent` may or may be from the same exact
    //    underlying schema, and so we avoid relying on `isDirectSubtype` in the check. 
    // In both cases, we just get the field from `selectionParent`, ensuring the return field parent _is_ `selectionParent`.
    const fieldParentType = this.definition.parent
    return parentType.name === fieldParentType.name
      || (isInterfaceType(fieldParentType) && fieldParentType.allImplementations().some(i => i.name === parentType.name));
  }

  typeIfAddedTo(parentType: CompositeType): Type | undefined {
    const fieldParentType = this.definition.parent;
    if (parentType == fieldParentType) {
      return this.definition.type;
    }

    if (this.name === typenameFieldName) {
      return parentType.typenameField()?.type;
    }

    return this.canRebaseOn(parentType)
      ? parentType.field(this.name)?.type
      : undefined;
  }

  hasDefer(): boolean {
    // @defer cannot be on field at the moment
    return false;
  }

  deferDirectiveArgs(): undefined {
    // @defer cannot be on field at the moment (but exists so we can call this method on any `OperationElement` conveniently)
    return undefined;
  }

  withoutDefer(): Field<TArgs> {
    // @defer cannot be on field at the moment
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

  castedType(): CompositeType {
    return this.typeCondition ? this.typeCondition : this.sourceType;
  }

  withUpdatedSourceType(newSourceType: CompositeType): FragmentElement {
    return this.withUpdatedTypes(newSourceType, this.typeCondition);
  }

  withUpdatedTypes(newSourceType: CompositeType, newCondition: CompositeType | undefined): FragmentElement {
    // Note that we pass the type-condition name instead of the type itself, to ensure that if `newSourceType` was from a different
    // schema (typically, the supergraph) than `this.sourceType` (typically, a subgraph), then the new condition uses the
    // definition of the proper schema (the supergraph in such cases, instead of the subgraph).
    const newFragment = new FragmentElement(newSourceType, newCondition?.name);
    for (const directive of this.appliedDirectives) {
      newFragment.applyDirective(directive.definition!, directive.arguments());
    }
    this.copyAttachementsTo(newFragment);
    return newFragment;
  }

  /**
   * See `FielSelection.updateForAddingTo` for a discussion of why this method exists and what it does.
   */
  updateForAddingTo(selectionSet: SelectionSet): FragmentElement {
    const selectionParent = selectionSet.parentType;
    const fragmentParent = this.parentType;
    const typeCondition = this.typeCondition;
    if (selectionParent === fragmentParent) {
      return this;
    }

    // This usually imply that the fragment is not from the same sugraph than then selection. So we need
    // to update the source type of the fragment, but also "rebase" the condition to the selection set
    // schema.
    const { canRebase, rebasedCondition } = this.canRebaseOn(selectionParent);
    validate(
      canRebase, 
      () => `Cannot add fragment of condition "${typeCondition}" (runtimes: [${possibleRuntimeTypes(typeCondition!)}]) to selection set of parent type "${selectionParent}" (runtimes: ${possibleRuntimeTypes(selectionParent)})`
    );
    return this.withUpdatedTypes(selectionParent, rebasedCondition);
  }

  private canRebaseOn(parentType: CompositeType): { canRebase: boolean, rebasedCondition?: CompositeType } {
    if (!this.typeCondition) {
      return { canRebase: true, rebasedCondition: undefined };
    }

    const rebasedCondition = parentType.schema().type(this.typeCondition.name);
    if (!rebasedCondition || !isCompositeType(rebasedCondition) || !runtimeTypesIntersects(parentType, rebasedCondition)) {
      return { canRebase: false };
    }

    return { canRebase: true, rebasedCondition };
  }

  castedTypeIfAddedTo(parentType: CompositeType): CompositeType | undefined {
    if (parentType == this.parentType) {
      return this.castedType();
    }

    const { canRebase, rebasedCondition } = this.canRebaseOn(parentType);
    return canRebase ? (rebasedCondition ? rebasedCondition : parentType) : undefined;
  }

  hasDefer(): boolean {
    return this.hasAppliedDirective('defer');
  }

  hasStream(): boolean {
    return this.hasAppliedDirective('stream');
  }

  deferDirectiveArgs(): DeferDirectiveArgs | undefined {
    // Note: @defer is not repeatable, so the return array below is either empty, or has a single value.
    return this.appliedDirectivesOf(this.schema().deferDirective())[0]?.arguments();
  }

  /**
   * Returns this fragment element but with any @defer directive on it removed.
   *
   * This method will return `undefined` if, upon removing @defer, the fragment has no conditions nor
   * any remaining applied directives (meaning that it carries no information whatsoever and can be
   * ignored).
   */
  withoutDefer(): FragmentElement | undefined {
    const deferName = this.schema().deferDirective().name;
    const updatedDirectives = this.appliedDirectives.filter((d) => d.name !== deferName);
    if (!this.typeCondition && updatedDirectives.length === 0) {
      return undefined;
    }

    if (updatedDirectives.length === this.appliedDirectives.length) {
      return this;
    }

    const updated = new FragmentElement(this.sourceType, this.typeCondition);
    this.copyAttachementsTo(updated);
    updatedDirectives.forEach((d) => updated.applyDirective(d.definition!, d.arguments()));
    return updated;
  }

  /**
   * Returns this fragment element, but it is has a @defer directive, the element is returned with
   * the @defer "normalized".
   *
   * See `Operation.withNormalizedDefer` for details on our so-called @defer normalization.
   */
  withNormalizedDefer(normalizer: DeferNormalizer): FragmentElement | undefined {
    const deferArgs = this.deferDirectiveArgs();
    if (!deferArgs) {
      return this;
    }

    let newDeferArgs: DeferDirectiveArgs | undefined = undefined;
    let conditionVariable: Variable | undefined = undefined;
    if (deferArgs.if !== undefined) {
      if (typeof deferArgs.if === 'boolean') {
        if (deferArgs.if) {
          // Harcoded `if: true`, remove the `if`
          newDeferArgs = {
            ...deferArgs,
            if: undefined,
          }
        } else {
          // Harcoded `if: false`, remove the @defer altogether
          return this.withoutDefer();
        }
      } else {
        // `if` on a variable
        conditionVariable = deferArgs.if;
      }
    }

    let label = deferArgs.label;
    if (!label) {
      label = normalizer.newLabel();
      if (newDeferArgs) {
        newDeferArgs.label = label;
      } else {
        newDeferArgs = {
          ...deferArgs,
          label,
        }
      }
    }

    // Now that we are sure to have a label, if we had a (non-trivial) condition,
    // associate it to that label.
    if (conditionVariable) {
      normalizer.registerCondition(label, conditionVariable);
    }

    if (!newDeferArgs) {
      return this;
    }

    const updated = new FragmentElement(this.sourceType, this.typeCondition);
    this.copyAttachementsTo(updated);
    const deferDirective = this.schema().deferDirective();
    // Re-apply all the non-defer directives
    this.appliedDirectives.filter((d) => d.name !== deferDirective.name).forEach((d) => updated.applyDirective(d.definition!, d.arguments()));
    // And then re-apply the @defer with the new label.
    updated.applyDirective(this.schema().deferDirective(), newDeferArgs);
    return updated;
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

export function operationPathToStringPath(path: OperationPath): string[] {
  return path
    .filter((p) => !(p.kind === 'FragmentElement' && !p.typeCondition))
    .map((p) => p.kind === 'Field' ? p.responseName() : `... on ${p.typeCondition?.coordinate}`);
}

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

/**
 * Returns all the "conditional" directive applications (`@skip` and `@include`) in the provided path.
 */
export function conditionalDirectivesInOperationPath(path: OperationPath): Directive<any, any>[] {
  return path.map((e) => e.appliedDirectives).flat().filter((d) => isConditionalDirective(d));
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
  const conditionals = conditionalDirectivesInOperationPath(head);
  let firstOfTail = tail[0];
  // Note that in practice, we may be able to eliminate a few elements at the beginning of the path
  // due do conditionals ('@skip' and '@include'). Indeed, a (tail) path crossing multiple conditions
  // may start with: [ ... on X @include(if: $c1), ... on X @ksip(if: $c2), (...)], but if `head`
  // already ends on type `X` _and_ both the conditions on `$c1` and `$c2` are alredy found on `head`,
  // then we can remove both fragments in `tail`.
  while (firstOfTail && isUselessFollowupElement(lastOfHead, firstOfTail, conditionals)) {
    tail = tail.slice(1);
    firstOfTail = tail[0];
  }
  return head.concat(tail);
}

function isUselessFollowupElement(first: OperationElement, followup: OperationElement, conditionals: Directive<any, any>[]): boolean {
  const typeOfFirst = first.kind === 'Field'
    ? baseType(first.definition.type!)
    : first.typeCondition;

  // The followup is useless if it's a fragment (with no directives we would want to preserve) whose type
  // is already that of the first element.
  return !!typeOfFirst
    && followup.kind === 'FragmentElement'
    && !!followup.typeCondition
    && (followup.appliedDirectives.length === 0 || isDirectiveApplicationsSubset(conditionals, followup.appliedDirectives))
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

  optimize(fragments?: NamedFragments, options: OptimizeOptions = {}, minUsagesToOptimize: number = 2): Operation {
    assert(minUsagesToOptimize >= 1, `Expected 'minUsagesToOptimize' to be at least 1, but got ${minUsagesToOptimize}`)
    if (!fragments || (!options.autoFragmetize && fragments.isEmpty())){
      return this;
    }

    let optimizedSelection = this.selectionSet.optimize(fragments,
      { ...options,
        schema: options.autoFragmetize? this.schema : undefined
      });

    if (optimizedSelection === this.selectionSet) {
      return this;
    }

    const usages = new Map<string, number>();
    optimizedSelection.collectUsedFragmentNames(usages);
    for (const fragment of fragments.names()) {
      if (!usages.has(fragment)) {
        usages.set(fragment, 0);
      }
    }

    // We re-expand any fragments that is used less than our minimum. Optimizing all fragments to potentially
    // re-expand some is not entirely optimal, but it's simple and probably don't matter too much in practice
    // (we only call this optimization on the final computed query plan, so not a very hot path; plus in most
    // cases we won't even reach that point either because there is no fragment, or none will have been
    // optimized away so we'll exit above). We can optimize later if this show up in profiling though.
    //
    // Also note `toDeoptimize` will always contains the unused fragments, which will allow `expandFragments`
    // to remove them from the listed fragments in `optimizedSelection` (here again, this could make use call
    // `expandFragments` on _only_ unused fragments and that case could be dealt with more efficiently, but
    // probably not noticeable in practice so ...).
    const toDeoptimize = mapEntries(usages).filter(([_, count]) => count < minUsagesToOptimize).map(([name]) => name);
    optimizedSelection = optimizedSelection.expandFragments(toDeoptimize);

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

  /**
   * Returns this operation but potentially modified so all/some of the @defer applications have been removed.
   *
   * @param labelsToRemove - If provided, then only the `@defer` applications with labels in the provided
   * set will be remove. Other `@defer` applications will be untouched. If `undefined`, then all `@defer`
   * applications are removed.
   */
  withoutDefer(labelsToRemove?: Set<string>): Operation {
    // If we have named fragments, we should be looking inside those and either expand those having @defer or,
    // probably better, replace them with a verison without @defer. But as we currently only call this method
    // after `expandAllFragments`, we'll implement this when/if we need it.
    assert(!this.selectionSet.fragments || this.selectionSet.fragments.isEmpty(), 'Removing @defer currently only work on "expanded" selections (no named fragments)');
    const updated = this.selectionSet.withoutDefer(labelsToRemove);
    return updated == this.selectionSet
      ? this
      : new Operation(this.rootKind, updated, this.variableDefinitions, this.name);
  }

  /**
   * Returns this operation but modified to "normalize" all the @defer applications.
   *
   * "Normalized" in this context means that all the `@defer` application in the
   * resulting operation will:
   *  - have a (unique) label. Which imply that this method generates label for
   *    any `@defer` not having a label.
   *  - have a non-trivial `if` condition, if any. By non-trivial, we mean that
   *    the condition will be a variable and not an hard-coded `true` or `false`.
   *    To do this, this method will remove the condition of any `@defer` that
   *    has `if: true`, and will completely remove any `@defer` application that
   *    has `if: false`.
   */
  withNormalizedDefer(): {
    operation: Operation,
    hasDefers: boolean,
    assignedDeferLabels: Set<string>,
    deferConditions: SetMultiMap<string, string>,
  } {
    // Similar comment than in `withoutDefer`
    assert(!this.selectionSet.fragments || this.selectionSet.fragments.isEmpty(), 'Assigning @defer lables currently only work on "expanded" selections (no named fragments)');

    const normalizer = new DeferNormalizer();
    const { hasDefers, hasNonLabelledOrConditionalDefers } = normalizer.init(this.selectionSet);
    let updatedOperation: Operation = this;
    if (hasNonLabelledOrConditionalDefers) {
      const updated = this.selectionSet.withNormalizedDefer(normalizer);
      updatedOperation = new Operation(this.rootKind, updated, this.variableDefinitions, this.name);
    }
    return {
      operation: updatedOperation,
      hasDefers,
      assignedDeferLabels: normalizer.assignedLabels,
      deferConditions: normalizer.deferConditions,
    };
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

  withUpdatedSelectionSet(newSelectionSet: SelectionSet): NamedFragmentDefinition {
    return new NamedFragmentDefinition(this.schema(), this.name, this.typeCondition, newSelectionSet);
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

  /**
   * Whether this fragment may apply at the provided type, that is if its type condition matches the type
   * or is a supertype of it.
   *
   * @param type - the type at which we're looking at applying the fragment
   */
  canApplyAtType(type: CompositeType): boolean {
    const applyAtType =
      sameType(this.typeCondition, type)
      || (isAbstractType(this.typeCondition) && !isUnionType(type) && isDirectSubtype(this.typeCondition, type));
    return applyAtType
      && this.validForSchema(type.schema());
  }

  // Checks whether this named fragment can be applied to the provided schema, which might be different
  // from the one the named fragment originate from.
  private validForSchema(schema: Schema): boolean {
    if (schema === this.schema()) {
      return true;
    }

    const typeInSchema = schema.type(this.typeCondition.name);
    if (!typeInSchema || !isCompositeType(typeInSchema)) {
      return false;
    }

    // We try "rebasing" the selection into the provided schema and checks if that succeed.
    try {
      const rebasedSelection = new SelectionSet(typeInSchema);
      rebasedSelection.mergeIn(this.selectionSet);
      // If this succeed, it means the fragment could be applied to that schema and be valid.
      return true;
    } catch (e) {
      // We don't really care what kind of error was triggered; only that it doesn't work.
      return false;
    }
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
      throw ERRORS.INVALID_GRAPHQL.err(`Duplicate fragment name '${fragment}'`);
    }
    this.fragments.set(fragment.name, fragment);
  }

  addIfNotExist(fragment: NamedFragmentDefinition) {
    if (!this.fragments.has(fragment.name)) {
      this.fragments.set(fragment.name, fragment);
    }
  }

  maybeApplyingAtType(type: CompositeType): NamedFragmentDefinition[] {
    return this.fragments.values().filter(f => f.canApplyAtType(type));
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

  has(name: string): boolean {
    return this.fragments.has(name);
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

/**
 * Utility class used to handle "normalizing" the @defer in an operation.
 *
 * See `Operation.withNormalizedDefer` for details on what we mean by normalizing in
 * this context.
 */
class DeferNormalizer {
  private index = 0;
  readonly assignedLabels = new Set<string>();
  readonly deferConditions = new SetMultiMap<string, string>();
  private readonly usedLabels = new Set<string>();

  /**
   * Initializes the "labeller" with all the labels used in the provided selections set.
   *
   * @return - whether `selectionSet` has any non-labeled @defer.
   */
  init(selectionSet: SelectionSet): { hasDefers: boolean, hasNonLabelledOrConditionalDefers: boolean }  {
    let hasNonLabelledOrConditionalDefers = false;
    let hasDefers = false;
    const stack: Selection[] = selectionSet.selections().concat();
    while (stack.length > 0) {
      const selection = stack.pop()!;
      if (selection.kind === 'FragmentSelection') {
        const deferArgs = selection.element().deferDirectiveArgs();
        if (deferArgs) {
          hasDefers = true;
          if (!deferArgs.label || deferArgs.if !== undefined) {
            hasNonLabelledOrConditionalDefers = true;
          }
          if (deferArgs.label) {
            this.usedLabels.add(deferArgs.label);
          }
        }
      }
      if (selection.selectionSet) {
        selection.selectionSet.selections().forEach((s) => stack.push(s));
      }
    }
    return { hasDefers, hasNonLabelledOrConditionalDefers };
  }

  private nextLabel(): string {
    return `qp__${this.index++}`;
  }

  newLabel(): string {
    let candidate = this.nextLabel();
    // It's unlikely that auto-generated label would conflict an existing one, but
    // not taking any chances.
    while (this.usedLabels.has(candidate)) {
      candidate = this.nextLabel();
    }
    this.assignedLabels.add(candidate);
    return candidate;
  }

  registerCondition(label: string, condition: Variable): void {
    this.deferConditions.add(condition.name, label);
  }
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
    if (reversedOrder && this._cachedSelections.length > 1) {
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
    for (const byResponseName of this._selections.values()) {
      for (const selection of byResponseName) {
        selection.collectUsedFragmentNames(collector);
      }
    }
  }

  optimize(fragments?: NamedFragments, options: OptimizeOptions = {}): SelectionSet {
    if (!fragments || (!options.autoFragmetize && fragments.isEmpty())) {
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
      optimized.add(selection.optimize(fragments, options));
    }
    return optimized;
  }

  expandFragments(names?: string[], updateSelectionSetFragments: boolean = true): SelectionSet {
    if (names && names.length === 0) {
      return this;
    }
    const newFragments = updateSelectionSetFragments
      ? (names ? this.fragments?.without(names) : undefined)
      : this.fragments;
    const withExpanded = new SelectionSet(this.parentType, newFragments);
    for (const selection of this.selections()) {
      const expanded = selection.expandFragments(names, updateSelectionSetFragments);
      if (Array.isArray(expanded)) {
        withExpanded.addAll(expanded);
      } else {
        withExpanded.add(expanded as Selection);
      }
    }
    return withExpanded;
  }

  /**
   * Returns the result of mapping the provided `mapper` to all the selection of this selection set.
   *
   * This method assumes that the `mapper` may often return it's argument directly, meaning that only
   * a small subset of selection actually need any modifications, and will avoid re-creating new
   * objects when that is the case. This does mean that the resulting selection set may be `this`
   * directly, or may alias some of the sub-selection in `this`.
   */
  private lazyMap(mapper: (selection: Selection) => Selection | SelectionSet | undefined): SelectionSet {
    let updatedSelections: Selection[] | undefined = undefined;
    const selections = this.selections();
    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const updated = mapper(selection);
      if (updated !== selection && !updatedSelections) {
        updatedSelections = [];
        for (let j = 0; j < i; j++) {
          updatedSelections.push(selections[j]);
        }
      }
      if (!!updated && updatedSelections) {
        if (updated instanceof SelectionSet) {
          updated.selections().forEach((s) => updatedSelections!.push(s));
        } else {
          updatedSelections.push(updated);
        }
      }
    }
    if (!updatedSelections) {
      return this;
    }
    return new SelectionSet(this.parentType, this.fragments).addAll(updatedSelections)
  }

  withoutDefer(labelsToRemove?: Set<string>): SelectionSet {
    assert(!this.fragments, 'Not yet supported');
    return this.lazyMap((selection) => selection.withoutDefer(labelsToRemove));
  }

  withNormalizedDefer(normalizer: DeferNormalizer): SelectionSet {
    assert(!this.fragments, 'Not yet supported');
    return this.lazyMap((selection) => selection.withNormalizedDefer(normalizer));
  }

  /**
   * Returns the selection select from filtering out any selection that does not match the provided predicate.
   *
   * Please that this method will expand *ALL* fragments as the result of applying it's filtering. You should
   * call `optimize` on the result if you want to re-apply some fragments.
   */
  filter(predicate: (selection: Selection) => boolean): SelectionSet {
    return this.lazyMap((selection) => selection.filter(predicate));
  }

  withoutEmptyBranches(): SelectionSet | undefined {
    const updated = this.filter((selection) => selection.selectionSet?.isEmpty() !== true);
    return updated.isEmpty() ? undefined : updated;
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
  addAll(selections: readonly Selection[]): SelectionSet {
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
    return toAdd;
  }

  addPath(path: OperationPath, onPathEnd?: (finalSelectionSet: SelectionSet | undefined) => void) {
    let previousSelections: SelectionSet = this;
    let currentSelections: SelectionSet | undefined = this;
    for (const element of path) {
      validate(currentSelections, () => `Cannot apply selection ${element} to non-selectable parent type "${previousSelections.parentType}"`);
      const mergedSelection: Selection = currentSelections.add(selectionOfElement(element));
      previousSelections = currentSelections;
      currentSelections = mergedSelection.selectionSet;
    }
    if (onPathEnd) {
      onPathEnd(currentSelections);
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

  /**
   * Returns a selection set that correspond to this selection set but where any of the selections in the
   * provided selection set have been remove.
   */
  minus(that: SelectionSet): SelectionSet {
    const updated = new SelectionSet(this.parentType, this.fragments);
    for (const [key, thisSelections] of this._selections) {
      const thatSelections = that._selections.get(key);
      if (!thatSelections) {
        updated._selections.set(key, thisSelections);
      } else {
        for (const thisSelection  of thisSelections) {
          const thatSelection = thatSelections.find((s) => thisSelection.element().equals(s.element()));
          if (thatSelection) {
            // If there is a subset, then we compute the diff of the subset and add that (if not empty).
            // Otherwise, we just skip `thisSelection` and do nothing
            if (thisSelection.selectionSet && thatSelection.selectionSet) {
              const updatedSubSelectionSet = thisSelection.selectionSet.minus(thatSelection.selectionSet);
              if (!updatedSubSelectionSet.isEmpty()) {
                updated._selections.add(key, thisSelection.withUpdatedSubSelection(updatedSubSelectionSet));
              }
            }
          } else {
            updated._selections.add(key, thisSelection);
          }
        }
      }
    }
    return updated;
  }

  canRebaseOn(parentTypeToTest: CompositeType): boolean {
    return this.selections().every((selection) => selection.canAddTo(parentTypeToTest));
  }

  validate() {
    validate(!this.isEmpty(), () => `Invalid empty selection set`);
    for (const selection of this.selections()) {
      selection.validate();
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
    const isNonAliasedTypenameSelection =
      (s: Selection) => s.kind === 'FieldSelection' && !s.field.alias && s.field.name === typenameFieldName;
    if (typenameSelection) {
      return typenameSelection.concat(this.selections().filter(s => !isNonAliasedTypenameSelection(s)));
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

  /**
   * Calls the provided callback on all the "elements" (including nested ones) of this selection set.
   * The specific order of traversal should not be relied on.
   */
  forEachElement(callback: (elt: OperationElement) => void) {
    const stack = this.selections().concat();
    while (stack.length > 0) {
      const selection = stack.pop()!;
      callback(selection.element());
      // Note: we reserve to preserver ordering (since the stack re-reverse). Not a big cost in general
      // and make output a bit more intuitive.
      selection.selectionSet?.selections(true).forEach((s) => stack.push(s));
    }
  }

  clone(): SelectionSet {
    const cloned = new SelectionSet(this.parentType);
    for (const selection of this.selections()) {
      const clonedSelection = selection.clone();
      // Note: while we could used cloned.add() directly, this does some checks (in `updatedForAddingTo` in particular)
      // which we can skip when we clone (since we know the inputs have already gone through that).
      cloned._selections.add(clonedSelection.key(), clonedSelection);
      ++cloned._selectionCount;
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

  optimize(fragments: NamedFragments, options: OptimizeOptions = {}): Selection {
    const optimizedSelection = this.selectionSet ? this.selectionSet.optimize(fragments, options) : undefined;
    const fieldBaseType = baseType(this.field.definition.type!);
    if (isCompositeType(fieldBaseType) && optimizedSelection) {
      for (const candidate of fragments.maybeApplyingAtType(fieldBaseType)) {
        // TODO: Checking `equals` here is very simple, but somewhat restrictive in theory. That is, if a query
        // is:
        //   {
        //     t {
        //       a
        //       b
        //       c
        //     }
        //   }
        // and we have:
        //   fragment X on T {
        //     t {
        //       a
        //       b
        //     }
        //   }
        // then the current code will not use the fragment because `c` is not in the fragment, but in relatity,
        // we could use it and make the result be:
        //   {
        //     ...X
        //     t {
        //       c
        //     }
        //   }
        // To do that, we can change that `equals` to `contains`, but then we should also "extract" the remainder
        // of `optimizedSelection` that isn't covered by the fragment, and that is the part slighly more involved.
        if (optimizedSelection.equals(candidate.selectionSet)) {
          const fragmentSelection = new FragmentSpreadSelection(fieldBaseType, fragments, candidate.name);
          return new FieldSelection(this.field, selectionSetOf(fieldBaseType, fragmentSelection));
        }
      }
      // Create a new named fragment with exact selection set.
      // Incase we see this same pattern in another part of the query,
      // this will help reduce query expansion when sending requests to subgraphs.
      // If we don't see the same pattern the final pass of optimizer will re-expand it.
      const schema = options?.schema;
      if(options?.autoFragmetize && schema && optimizedSelection.selections().length > 1) {
        const hash = createHash('sha256').update(optimizedSelection.toString()).digest('hex');
        const newFragment = new NamedFragmentDefinition(schema, fieldBaseType + hash, fieldBaseType, optimizedSelection);
        fragments.addIfNotExist(newFragment);
        const newFragmentSelection = new FragmentSpreadSelection(fieldBaseType, fragments, newFragment.name);
        return new FieldSelection(this.field, selectionSetOf(fieldBaseType, newFragmentSelection));
      }
    }

    return this.selectionSet === optimizedSelection
      ? this
      : new FieldSelection(this.field, optimizedSelection);
  }

  filter(predicate: (selection: Selection) => boolean): FieldSelection | undefined {
    if (!this.selectionSet) {
      return predicate(this) ? this : undefined;
    }

    const updatedSelectionSet = this.selectionSet.filter(predicate);
    const thisWithFilteredSelectionSet = this.selectionSet === updatedSelectionSet
      ? this
      : new FieldSelection(this.field, updatedSelectionSet);
    return predicate(thisWithFilteredSelectionSet) ? thisWithFilteredSelectionSet : undefined;
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
    this.field.validate();
    // Note that validation is kind of redundant since `this.selectionSet.validate()` will check that it isn't empty. But doing it
    // allow to provide much better error messages.
    validate(
      !(this.selectionSet && this.selectionSet.isEmpty()),
      () => `Invalid empty selection set for field "${this.field.definition.coordinate}" of non-leaf type ${this.field.definition.type}`,
      this.field.definition.sourceAST
    );
    this.selectionSet?.validate();
  }

  /**
   * Returns a field selection "equivalent" to the one represented by this object, but such that:
   *  1. its parent type is the exact one of the provided selection set (same type of same schema object).
   *  2. it is not frozen (which might involve cloning).
   *
   * This method assumes that such a thing is possible, meaning that the parent type of the provided
   * selection set does have a field that correspond to this selection (which can support any sub-selection).
   * If that is not the case, an assertion will be thrown.
   *
   * Note that in the simple cases where this selection parent type is already the one of the provide
   * `selectionSet`, then this method is mostly a no-op, except for the potential cloning if this selection
   * is frozen. But this method mostly exists to make working with multiple "similar" schema easier.
   * That is, `Selection` and `SelectionSet` are intrinsically linked to a particular `Schema` object since
   * their underlying `OperationElement` points to fields and types of a particular `Schema`. And we want to
   * make sure that _everything_ within a particular `SelectionSet` does link to the same `Schema` object,
   * or things could get really confusing (nor would it make much sense; a selection set is that of a particular
   * schema fundamentally). In many cases, when we work with a single schema (when we parse an operation string
   * against a given schema for instance), this problem is moot, but as we do query planning for instance, we
   * end up building queries over subgraphs _based_ on some selections from the supergraph API schema, and so
   * we need to deal with the fact that the code can easily mix selection from different schema. One option
   * could be to simply hard-reject such mixing, meaning that `SelectionSet.add(Selection)` could error out
   * if the provided selection is not of the same schema of that of the selection set we add to, thus forcing
   * the caller to first ensure the selection is properly "rebased" on the same schema. But this would be a
   * bit inconvenient and so this this method instead provide a sort of "automatic rebasing": that is, it
   * allows `this` selection not be of the same schema as the provided `selectionSet` as long as both are
   * "compatible", and as long as it's the case, it return an equivalent selection that is suitable to be
   * added to `selectionSet` (it's against the same fundamental schema).
   */
  updateForAddingTo(selectionSet: SelectionSet): FieldSelection {
    const updatedField = this.field.updateForAddingTo(selectionSet);
    if (this.field === updatedField) {
      return this.cloneIfFrozen();
    }

    // We create a new selection that not only uses the updated field, but also ensures
    // the underlying selection set uses the updated field type as parent type.
    const updatedBaseType = baseType(updatedField.definition.type!);
    let updatedSelectionSet : SelectionSet | undefined;
    if (this.selectionSet && this.selectionSet.parentType !== updatedBaseType) {
      assert(isCompositeType(updatedBaseType), `Expected ${updatedBaseType.coordinate} to be composite but ${updatedBaseType.kind}`);
      updatedSelectionSet = new SelectionSet(updatedBaseType);
      // Note that re-adding every selection ensures that anything frozen will be cloned as needed, on top of handling any knock-down
      // effect of the type change.
      for (const selection of this.selectionSet.selections()) {
        updatedSelectionSet.add(selection);
      }
    } else {
      updatedSelectionSet = this.selectionSet?.cloneIfFrozen();
    }

    return new FieldSelection(updatedField, updatedSelectionSet);
  }

  /**
   * Essentially checks if `updateForAddingTo` would work on an selecion set of the provide parent type.
   */
  canAddTo(parentType: CompositeType): boolean {
    if (this.field.parentType === parentType) {
      return true;
    }

    const type = this.field.typeIfAddedTo(parentType);
    if (!type) {
      return false;
    }

    const base = baseType(type);
    if (this.selectionSet && this.selectionSet.parentType !== base) {
      assert(isCompositeType(base), () => `${this.field} should have a selection set as it's type is not a composite`);
      return this.selectionSet.selections().every((s) => s.canAddTo(base));
    }
    return true;
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

  withUpdatedSubSelection(newSubSelection: SelectionSet | undefined): FieldSelection {
    return new FieldSelection(this.field, newSubSelection);
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

  withoutDefer(labelsToRemove?: Set<string>): FieldSelection {
    const updatedSubSelections = this.selectionSet?.withoutDefer(labelsToRemove);
    return updatedSubSelections === this.selectionSet
      ? this
      : new FieldSelection(this.field, updatedSubSelections);
  }

  withNormalizedDefer(normalizer: DeferNormalizer): FieldSelection {
    const updatedSubSelections = this.selectionSet?.withNormalizedDefer(normalizer);
    return updatedSubSelections === this.selectionSet
      ? this
      : new FieldSelection(this.field, updatedSubSelections);
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

  abstract expandFragments(names?: string[]): Selection | readonly Selection[];

  abstract toSelectionNode(): SelectionNode;

  abstract validate(): void;

  abstract withoutDefer(labelsToRemove?: Set<string>): FragmentSelection | SelectionSet;

  abstract withNormalizedDefer(normalizer: DeferNormalizer): FragmentSelection | SelectionSet;

  /**
   * See `FielSelection.updateForAddingTo` for a discussion of why this method exists and what it does.
   */
  abstract updateForAddingTo(selectionSet: SelectionSet): FragmentSelection;

  abstract canAddTo(parentType: CompositeType): boolean;

  abstract withUpdatedSubSelection(newSubSelection: SelectionSet | undefined): FragmentSelection;

  protected us(): FragmentSelection {
    return this;
  }

  protected validateDeferAndStream() {
    if (this.element().hasDefer() || this.element().hasStream()) {
      const schemaDef = this.element().schema().schemaDefinition;
      const parentType = this.element().parentType;
      validate(
        schemaDef.rootType('mutation') !== parentType && schemaDef.rootType('subscription') !== parentType,
        () => `The @defer and @stream directives cannot be used on ${schemaDef.roots().filter((t) => t.type === parentType).pop()?.rootKind} root type "${parentType}"`,
      );
    }
  }

  usedVariables(): Variables {
    return mergeVariables(this.element().variables(), this.selectionSet.usedVariables());
  }

  filter(predicate: (selection: Selection) => boolean): FragmentSelection | undefined {
    // Note that we essentially expand all fragments as part of this.
    const selectionSet = this.selectionSet;
    const updatedSelectionSet = selectionSet.filter(predicate);
    const thisWithFilteredSelectionSet = updatedSelectionSet === selectionSet
      ? this
      : new InlineFragmentSelection(this.element(), updatedSelectionSet);

    return predicate(thisWithFilteredSelectionSet) ? thisWithFilteredSelectionSet : undefined;
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
    this.validateDeferAndStream();
    // Note that validation is kind of redundant since `this.selectionSet.validate()` will check that it isn't empty. But doing it
    // allow to provide much better error messages.
    validate(
      !this.selectionSet.isEmpty(),
      () => `Invalid empty selection set for fragment "${this.element()}"`
    );
    this.selectionSet.validate();
  }

  updateForAddingTo(selectionSet: SelectionSet): FragmentSelection {
    const updatedFragment = this.element().updateForAddingTo(selectionSet);
    if (this.element() === updatedFragment) {
      return this.cloneIfFrozen();
    }

    // Like for fields, we create a new selection that not only uses the updated fragment, but also ensures
    // the underlying selection set uses the updated type as parent type.
    const updatedCastedType = updatedFragment.castedType();
    let updatedSelectionSet : SelectionSet | undefined;
    if (this.selectionSet.parentType !== updatedCastedType) {
      updatedSelectionSet = new SelectionSet(updatedCastedType);
      // Note that re-adding every selection ensures that anything frozen will be cloned as needed, on top of handling any knock-down
      // effect of the type change.
      for (const selection of this.selectionSet.selections()) {
        updatedSelectionSet.add(selection);
      }
    } else {
      updatedSelectionSet = this.selectionSet?.cloneIfFrozen();
    }

    return new InlineFragmentSelection(updatedFragment, updatedSelectionSet);
  }

  canAddTo(parentType: CompositeType): boolean {
    if (this.element().parentType === parentType) {
      return true;
    }

    const type = this.element().castedTypeIfAddedTo(parentType);
    if (!type) {
      return false;
    }

    if (this.selectionSet.parentType !== type) {
      return this.selectionSet.selections().every((s) => s.canAddTo(type));
    }
    return true;
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

  optimize(fragments: NamedFragments, options: OptimizeOptions ={}): FragmentSelection {
    let optimizedSelection = this.selectionSet.optimize(fragments, options);
    const typeCondition = this.element().typeCondition;
    if (typeCondition) {
      for (const candidate of fragments.maybeApplyingAtType(typeCondition)) {
        // See comment in `FieldSelection.optimize` about the `equals`: this fully apply here too.
        if (optimizedSelection.equals(candidate.selectionSet)) {
          const spread = new FragmentSpreadSelection(this.element().parentType, fragments, candidate.name);
          // We use the fragment when the fragments condition is either the same, or a supertype of our current condition.
          // If it's the same type, then we don't really want to preserve the current condition, it is included in the
          // spread and we can return it directly. But if the fragment condition is a superset, then we should preserve
          // our current condition since it restricts the selection more than the fragment actual does.
          if (sameType(typeCondition, candidate.typeCondition)) {
            // If we ignore the current condition, then we need to ensure any directive applied to it are preserved.
            this.fragmentElement.appliedDirectives.forEach((directive) => {
              spread.element().applyDirective(directive.definition!, directive.arguments());
            })
            return spread;
          }
          optimizedSelection = selectionSetOf(spread.element().parentType, spread);
          break;
        }
      }
      // Create a new named fragment with exact selection set.
      // Incase we see this same pattern in another part of the query,
      // this will help reduce query expansion when sending requests to subgraphs.
      // If we don't see the same pattern the final pass of optimizer will re-expand it.
      const schema = options?.schema;
      if (options?.autoFragmetize && schema && optimizedSelection.selections().length > 1) {
        const hash = createHash('sha256').update(optimizedSelection.toString()).digest('hex');
        const newFragment = new NamedFragmentDefinition(schema, typeCondition + hash, typeCondition, optimizedSelection);
        fragments.addIfNotExist(newFragment);
        return new FragmentSpreadSelection(this.element().parentType, fragments, newFragment.name);
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

  withoutDefer(labelsToRemove?: Set<string>): FragmentSelection | SelectionSet {
    const updatedSubSelections = this.selectionSet.withoutDefer(labelsToRemove);
    const deferArgs = this.fragmentElement.deferDirectiveArgs();
    const hasDeferToRemove = deferArgs && (!labelsToRemove || (deferArgs.label && labelsToRemove.has(deferArgs.label)));
    if (updatedSubSelections === this.selectionSet && !hasDeferToRemove) {
      return this;
    }
    const newFragment = hasDeferToRemove ? this.fragmentElement.withoutDefer() : this.fragmentElement;
    if (!newFragment) {
      return updatedSubSelections;
    }
    return new InlineFragmentSelection(newFragment, updatedSubSelections);
  }

  withNormalizedDefer(normalizer: DeferNormalizer): InlineFragmentSelection | SelectionSet {
    const newFragment = this.fragmentElement.withNormalizedDefer(normalizer);
    const updatedSubSelections = this.selectionSet.withNormalizedDefer(normalizer);
    if (!newFragment) {
      return updatedSubSelections;
    }
    return newFragment === this.fragmentElement && updatedSubSelections === this.selectionSet
      ? this
      : new InlineFragmentSelection(newFragment, updatedSubSelections);
  }

  withUpdatedSubSelection(newSubSelection: SelectionSet | undefined): InlineFragmentSelection {
    return new InlineFragmentSelection(this.fragmentElement, newSubSelection);
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
    this.validateDeferAndStream();

    // We don't do anything else because fragment definition are validated when created.
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

  optimize(_: NamedFragments, _options: OptimizeOptions = {}): FragmentSelection {
    return this;
  }

  updateForAddingTo(_selectionSet: SelectionSet): FragmentSelection {
    // This is a little bit iffy, because the fragment could link to a schema (typically the supergraph API one)
    // that is different from the one of `_selectionSet` (say, a subgraph fetch selection in which we're trying to
    // reuse a user fragment). But in practice, we expand all fragments when we do query planning and only re-add
    // fragments back at the very end, so this should be fine. Importantly, we don't want this method to mistakenly
    // expand the spread, as that would compromise the code that optimize subgraph fetches to re-use named
    // fragments.
    return this;
  }

  canAddTo(_: CompositeType): boolean {
    // Mimicking the logic of `updateForAddingTo`.
    return true;
  }

  expandFragments(names?: string[], updateSelectionSetFragments: boolean = true): FragmentSelection | readonly Selection[] {
    if (names && !names.includes(this.namedFragment.name)) {
      return this;
    }

    const expandedSubSelections = this.selectionSet.expandFragments(names, updateSelectionSetFragments);
    return sameType(this._element.parentType, this.namedFragment.typeCondition) && this._element.appliedDirectives.length === 0
      ? expandedSubSelections.selections()
      : new InlineFragmentSelection(this._element, expandedSubSelections);
  }

  collectUsedFragmentNames(collector: Map<string, number>): void {
    this.selectionSet.collectUsedFragmentNames(collector);
    const usageCount = collector.get(this.namedFragment.name);
    collector.set(this.namedFragment.name, usageCount === undefined ? 1 : usageCount + 1);
  }

  withoutDefer(_labelsToRemove?: Set<string>): FragmentSelection {
    assert(false, 'Unsupported, see `Operation.withoutDefer`');
  }

  withNormalizedDefer(_normalizezr: DeferNormalizer): FragmentSelection {
    assert(false, 'Unsupported, see `Operation.withAllDeferLabelled`');
  }

  private spreadDirectives(): Directive<FragmentElement>[] {
    return this._element.appliedDirectives.slice(this.namedFragment.appliedDirectives.length);
  }

  withUpdatedSubSelection(_: SelectionSet | undefined): InlineFragmentSelection {
    assert(false, `Unssupported`);
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
  options?: {
    operationName?: string,
    validate?: boolean,
  }
) : Operation {
  let operation: OperationDefinitionNode | undefined;
  const operationName = options?.operationName;
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
          throw ERRORS.INVALID_GRAPHQL.err(`Unknown type "${typeName}" for fragment "${name}"`, { nodes: definition });
        }
        if (!isCompositeType(typeCondition)) {
          throw ERRORS.INVALID_GRAPHQL.err(`Invalid fragment "${name}" on non-composite type "${typeName}"`, { nodes: definition });
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
  return operationFromAST({schema, operation, fragments, validateInput: options?.validate});
}

function operationFromAST({
  schema,
  operation,
  fragments,
  validateInput,
}:{
  schema: Schema,
  operation: OperationDefinitionNode,
  fragments: NamedFragments,
  validateInput?: boolean,
}) : Operation {
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
      validate: validateInput,
    }),
    variableDefinitions,
    operation.name?.value
  );
}

export function parseOperation(
  schema: Schema,
  operation: string,
  options?: {
    operationName?: string,
    validate?: boolean,
  },
): Operation {
  return operationFromDocument(schema, parse(operation), options);
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
