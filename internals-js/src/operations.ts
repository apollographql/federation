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
  isNullableType,
  isUnionType,
  ObjectType,
  runtimeTypesIntersects,
  Schema,
  SchemaRootKind,
  VariableCollector,
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
  sameDirectiveApplication,
  isLeafType,
  Variables,
  isObjectType,
} from "./definitions";
import { isInterfaceObjectType } from "./federation";
import { ERRORS } from "./error";
import { isDirectSubtype, sameType } from "./types";
import { assert, mapEntries, mapValues, MapWithCachedArrays, MultiMap, SetMultiMap } from "./utils";
import { argumentsEquals, argumentsFromAST, isValidValue, valueToAST, valueToString } from "./values";
import { v1 as uuidv1 } from 'uuid';

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
    directives?: readonly Directive<any>[],
  ) {
    super(schema, directives);
  }

  collectVariables(collector: VariableCollector) {
    this.collectVariablesInElement(collector);
    this.collectVariablesInAppliedDirectives(collector);
  }

  abstract key(): string;

  abstract asPathElement(): string | undefined;

  abstract rebaseOn(parentType: CompositeType): T;

  abstract withUpdatedDirectives(newDirectives: readonly Directive<any>[]): T;

  protected abstract collectVariablesInElement(collector: VariableCollector): void;

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
    private readonly args?: TArgs,
    directives?: readonly Directive<any>[],
    readonly alias?: string,
  ) {
    super(definition.schema(), directives);
  }

  protected collectVariablesInElement(collector: VariableCollector): void {
    if (this.args) {
      collector.collectInArguments(this.args);
    }
  }

  get name(): string {
    return this.definition.name;
  }

  argumentValue(name: string): any {
    return this.args ? this.args[name] : undefined;
  }

  responseName(): string {
    return this.alias ? this.alias : this.name;
  }

  key(): string {
    return this.responseName();
  }

  asPathElement(): string {
    return this.responseName();
  }

  get parentType(): CompositeType {
    return this.definition.parent;
  }

  isLeafField(): boolean {
    return isLeafType(baseType(this.definition.type!));
  }

  withUpdatedDefinition(newDefinition: FieldDefinition<any>): Field<TArgs> {
    const newField = new Field<TArgs>(
      newDefinition,
      this.args,
      this.appliedDirectives,
      this.alias,
    );
    this.copyAttachementsTo(newField);
    return newField;
  }

  withUpdatedAlias(newAlias: string | undefined): Field<TArgs> {
    const newField = new Field<TArgs>(
      this.definition,
      this.args,
      this.appliedDirectives,
      newAlias,
    );
    this.copyAttachementsTo(newField);
    return newField;
  }

  withUpdatedDirectives(newDirectives: readonly Directive<any>[]): Field<TArgs> {
    const newField = new Field<TArgs>(
      this.definition,
      this.args,
      newDirectives,
      this.alias,
    );
    this.copyAttachementsTo(newField);
    return newField;
  }

  argumentsToNodes(): ArgumentNode[] | undefined {
    if (!this.args) {
      return undefined;
    }

    const entries = Object.entries(this.args);
    if (entries.length === 0) {
      return undefined;
    }

    return entries.map(([n, v]) => {
      return {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: n },
        value: valueToAST(v, this.definition.argument(n)!.type!)!,
      };
    });
  }


  appliesTo(type: ObjectType | InterfaceType): boolean {
    const definition = type.field(this.name);
    return !!definition && this.selects(definition);
  }

  selects(
    definition: FieldDefinition<any>,
    assumeValid: boolean = false,
    variableDefinitions?: VariableDefinitions,
  ): boolean {
    assert(assumeValid || variableDefinitions, 'Must provide variable definitions if validation is needed');

    // We've already validated that the field selects the definition on which it was built.
    if (definition === this.definition) {
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
      const appliedValue = this.argumentValue(argDef.name);
      if (appliedValue === undefined) {
        if (argDef.defaultValue === undefined && !isNullableType(argDef.type!)) {
          return false;
        }
      } else {
        if (!assumeValid && !isValidValue(appliedValue, argDef, variableDefinitions!)) {
          return false;
        }
      }
    }

    // We also make sure the field application does not have non-null values for field that are not part of the definition.
    if (!assumeValid && this.args) {
      for (const [name, value] of Object.entries(this.args)) {
        if (value !== null && definition.argument(name) === undefined) {
          return false
        }
      }
    }
    return true;
  }

  validate(variableDefinitions: VariableDefinitions) {
    validate(this.name === this.definition.name, () => `Field name "${this.name}" cannot select field "${this.definition.coordinate}: name mismatch"`);

    // We need to make sure the field has valid values for every non-optional argument.
    for (const argDef of this.definition.arguments()) {
      const appliedValue = this.argumentValue(argDef.name);
      if (appliedValue === undefined) {
        validate(
          argDef.defaultValue !== undefined || isNullableType(argDef.type!),
          () => `Missing mandatory value for argument "${argDef.name}" of field "${this.definition.coordinate}" in selection "${this}"`);
      } else {
        validate(
          isValidValue(appliedValue, argDef, variableDefinitions),
          () => `Invalid value ${valueToString(appliedValue)} for argument "${argDef.coordinate}" of type ${argDef.type}`)
      }
    }

    // We also make sure the field application does not have non-null values for field that are not part of the definition.
    if (this.args) {
      for (const [name, value] of Object.entries(this.args)) {
        validate(
          value === null || this.definition.argument(name) !== undefined,
          () => `Unknown argument "${name}" in field application of "${this.name}"`);
      }
    }
  }

  rebaseOn(parentType: CompositeType): Field<TArgs> {
    const fieldParent = this.definition.parent;
    if (parentType === fieldParent) {
      return this;
    }

    if (this.name === typenameFieldName) {
      return this.withUpdatedDefinition(parentType.typenameField()!);
    }

    validate(
      this.canRebaseOn(parentType),
      () => `Cannot add selection of field "${this.definition.coordinate}" to selection set of parent type "${parentType}"`
    );
    const fieldDef = parentType.field(this.name);
    validate(fieldDef, () => `Cannot add selection of field "${this.definition.coordinate}" to selection set of parent type "${parentType}" (that does not declare that field)`);
    return this.withUpdatedDefinition(fieldDef);
  }

  private canRebaseOn(parentType: CompositeType) {
    const fieldParentType = this.definition.parent
    // There is 2 valid cases we want to allow:
    //  1. either `selectionParent` and `fieldParent` are the same underlying type (same name) but from different underlying schema. Typically,
    //    happens when we're building subgraph queries but using selections from the original query which is against the supergraph API schema.
    //  2. or they are not the same underlying type, but the field parent type is from an interface (or an interface object, which is the same
    //    here), in which case we may be rebasing an interface field on one of the implementation type, which is ok. Note that we don't verify
    //    that `parentType` is indeed an implementation of `fieldParentType` because it's possible that this implementation relationship exists
    //    in the supergraph, but not in any of the subgraph schema involved here. So we just let it be. Not that `rebaseOn` will complain anyway
    //    if the field name simply does not exists in `parentType`.
    return parentType.name === fieldParentType.name
      || isInterfaceType(fieldParentType)
      || isInterfaceObjectType(fieldParentType);
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
      && (this.args ? that.args && argumentsEquals(this.args, that.args) : !that.args)
      && haveSameDirectives(this, that);
  }

  toString(): string {
    const alias = this.alias ? this.alias + ': ' : '';
    const entries = this.args ? Object.entries(this.args) : [];
    const args = entries.length === 0
      ? ''
      : '(' + entries.map(([n, v]) => `${n}: ${valueToString(v, this.definition.argument(n)?.type)}`).join(', ') + ')';
    return alias + this.name + args + this.appliedDirectivesToString();
  }
}

/**
 * Computes a string key representing a directive application, so that if 2 directive applications have the same key, then they
 * represent the same application.
 *
 * Note that this is mostly just the `toString` representation of the directive, but for 2 subtlety:
 * 1. for a handful of directives (really just `@defer` for now), we never want to consider directive applications the same, no
 *    matter that the arguments of the directive match, and this for the same reason as documented on the `sameDirectiveApplications`
 *    method in `definitions.ts`.
 * 2. we sort the argument (by their name) before converting them to string, since argument order does not matter in graphQL.
 */
function keyForDirective(
  directive: Directive<OperationElement>,
  directivesNeverEqualToThemselves: string[] = [ 'defer' ],
): string {
  if (directivesNeverEqualToThemselves.includes(directive.name)) {
    return uuidv1();
  }
  const entries = Object.entries(directive.arguments()).filter(([_, v]) => v !== undefined);
  entries.sort(([n1], [n2]) => n1.localeCompare(n2));
  const args = entries.length == 0 ? '' : '(' + entries.map(([n, v]) => `${n}: ${valueToString(v, directive.argumentType(n))}`).join(', ') + ')';
  return `@${directive.name}${args}`;
}

export class FragmentElement extends AbstractOperationElement<FragmentElement> {
  readonly kind = 'FragmentElement' as const;
  readonly typeCondition?: CompositeType;
  private computedKey: string | undefined;

  constructor(
    private readonly sourceType: CompositeType,
    typeCondition?: string | CompositeType,
    directives?: readonly Directive<any>[],
  ) {
    // TODO: we should do some validation here (remove the ! with proper error, and ensure we have some intersection between
    // the source type and the type condition)
    super(sourceType.schema(), directives);
    this.typeCondition = typeCondition !== undefined && typeof typeCondition === 'string'
      ? this.schema().type(typeCondition)! as CompositeType
      : typeCondition;
  }

  protected collectVariablesInElement(_: VariableCollector): void {
    // Cannot have variables in fragments
  }

  get parentType(): CompositeType {
    return this.sourceType;
  }

  key(): string {
    if (!this.computedKey) {
      // The key is such that 2 fragments with the same key within a selection set gets merged together. So the type-condition
      // is include, but so are the directives.
      const keyForDirectives = this.appliedDirectives.map((d) => keyForDirective(d)).join(' ');
      this.computedKey = '...' + (this.typeCondition ? ' on ' + this.typeCondition.name : '') + keyForDirectives;
    }
    return this.computedKey;
  }

  castedType(): CompositeType {
    return this.typeCondition ? this.typeCondition : this.sourceType;
  }

  asPathElement(): string | undefined {
    const condition = this.typeCondition;
    return condition ? `... on ${condition}` : undefined;
  }

  withUpdatedSourceType(newSourceType: CompositeType): FragmentElement {
    return this.withUpdatedTypes(newSourceType, this.typeCondition);
  }

  withUpdatedCondition(newCondition: CompositeType | undefined): FragmentElement {
    return this.withUpdatedTypes(this.sourceType, newCondition);
  }

  withUpdatedTypes(newSourceType: CompositeType, newCondition: CompositeType | undefined): FragmentElement {
    // Note that we pass the type-condition name instead of the type itself, to ensure that if `newSourceType` was from a different
    // schema (typically, the supergraph) than `this.sourceType` (typically, a subgraph), then the new condition uses the
    // definition of the proper schema (the supergraph in such cases, instead of the subgraph).
    const newFragment = new FragmentElement(newSourceType, newCondition?.name, this.appliedDirectives);
    this.copyAttachementsTo(newFragment);
    return newFragment;
  }

  withUpdatedDirectives(newDirectives: Directive<OperationElement>[]): FragmentElement {
    const newFragment = new FragmentElement(this.sourceType, this.typeCondition, newDirectives);
    this.copyAttachementsTo(newFragment);
    return newFragment;
  }

  rebaseOn(parentType: CompositeType): FragmentElement {
    const fragmentParent = this.parentType;
    const typeCondition = this.typeCondition;
    if (parentType === fragmentParent) {
      return this;
    }

    // This usually imply that the fragment is not from the same sugraph than then selection. So we need
    // to update the source type of the fragment, but also "rebase" the condition to the selection set
    // schema.
    const { canRebase, rebasedCondition } = this.canRebaseOn(parentType);
    validate(
      canRebase, 
      () => `Cannot add fragment of condition "${typeCondition}" (runtimes: [${possibleRuntimeTypes(typeCondition!)}]) to parent type "${parentType}" (runtimes: ${possibleRuntimeTypes(parentType)})`
    );
    return this.withUpdatedTypes(parentType, rebasedCondition);
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

    const updated = new FragmentElement(this.sourceType, this.typeCondition, updatedDirectives);
    this.copyAttachementsTo(updated);
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

    const deferDirective = this.schema().deferDirective();
    const updatedDirectives = this.appliedDirectives
      .filter((d) => d.name !== deferDirective.name)
      .concat(new Directive<FragmentElement>(deferDirective.name, newDeferArgs));

    const updated = new FragmentElement(this.sourceType, this.typeCondition, updatedDirectives);
    this.copyAttachementsTo(updated);
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
    readonly schema: Schema,
    readonly rootKind: SchemaRootKind,
    readonly selectionSet: SelectionSet,
    readonly variableDefinitions: VariableDefinitions,
    readonly name?: string) {
  }

  optimize(fragments?: NamedFragments, minUsagesToOptimize: number = 2): Operation {
    assert(minUsagesToOptimize >= 1, `Expected 'minUsagesToOptimize' to be at least 1, but got ${minUsagesToOptimize}`)
    if (!fragments || fragments.isEmpty()) {
      return this;
    }

    let optimizedSelection = this.selectionSet.optimize(fragments);
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

    const newFragments = optimizedSelection.fragments?.without(toDeoptimize);
    optimizedSelection = optimizedSelection.expandFragments(toDeoptimize, newFragments);

    return new Operation(this.schema, this.rootKind, optimizedSelection, this.variableDefinitions, this.name);
  }

  expandAllFragments(): Operation {
    const expandedSelections = this.selectionSet.expandAllFragments();
    if (expandedSelections === this.selectionSet) {
      return this;
    }

    return new Operation(
      this.schema,
      this.rootKind,
      expandedSelections,
      this.variableDefinitions,
      this.name
    );
  }

  trimUnsatisfiableBranches(): Operation {
    const trimmedSelections = this.selectionSet.trimUnsatisfiableBranches(this.selectionSet.parentType);
    if (trimmedSelections === this.selectionSet) {
      return this;
    }

    return new Operation(
      this.schema,
      this.rootKind,
      trimmedSelections,
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
      : new Operation(this.schema, this.rootKind, updated, this.variableDefinitions, this.name);
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
      updatedOperation = new Operation(this.schema, this.rootKind, updated, this.variableDefinitions, this.name);
    }
    return {
      operation: updatedOperation,
      hasDefers,
      assignedDeferLabels: normalizer.assignedLabels,
      deferConditions: normalizer.deferConditions,
    };
  }

  collectDefaultedVariableValues(): Record<string, any> {
    const defaultedVariableValues: Record<string, any> = {};
    for (const { variable, defaultValue } of this.variableDefinitions.definitions()) {
      if (defaultValue !== undefined) {
        defaultedVariableValues[variable.name] = defaultValue;
      }
    }
    return defaultedVariableValues;
  }

  toString(expandFragments: boolean = false, prettyPrint: boolean = true): string {
    return this.selectionSet.toOperationString(this.rootKind, this.variableDefinitions, this.name, expandFragments, prettyPrint);
  }
}

export class NamedFragmentDefinition extends DirectiveTargetElement<NamedFragmentDefinition> {
  private _selectionSet: SelectionSet | undefined;

  constructor(
    schema: Schema,
    readonly name: string,
    readonly typeCondition: CompositeType,
    directives?: Directive<NamedFragmentDefinition>[],
  ) {
    super(schema, directives);
  }

  setSelectionSet(selectionSet: SelectionSet): NamedFragmentDefinition {
    assert(!this._selectionSet, 'Attempting to set the selection set of a fragment definition already built')
    this._selectionSet = selectionSet;
    return this;
  }

  get selectionSet(): SelectionSet {
    assert(this._selectionSet, () => `Trying to access fragment definition ${this.name} before it is fully built`);
    return this._selectionSet;
  }

  withUpdatedSelectionSet(newSelectionSet: SelectionSet): NamedFragmentDefinition {
    return new NamedFragmentDefinition(this.schema(), this.name, this.typeCondition).setSelectionSet(newSelectionSet);
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
      this.selectionSet.rebaseOn(typeInSchema);
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

  without(names: string[]): NamedFragments | undefined {
    if (!names.some(n => this.fragments.has(n))) {
      return this;
    }

    const newFragments = new NamedFragments();
    for (const fragment of this.fragments.values()) {
      if (!names.includes(fragment.name)) {
        // We want to keep that fragment. But that fragment might use a fragment we
        // remove, and if so, we need to expand that removed fragment.
        const updatedSelectionSet = fragment.selectionSet.expandFragments(names, newFragments);
        const newFragment = updatedSelectionSet === fragment.selectionSet
          ? fragment
          : fragment.withUpdatedSelectionSet(updatedSelectionSet);
        newFragments.add(newFragment);
      }
    }
    return newFragments.isEmpty() ? undefined : newFragments;
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

  map(mapper: (def: NamedFragmentDefinition) => NamedFragmentDefinition): NamedFragments {
    const mapped = new NamedFragments();
    for (const def of this.fragments.values()) {
      mapped.fragments.set(def.name, mapper(def));
    }
    return mapped;
  }

  validate(variableDefinitions: VariableDefinitions) {
    for (const fragment of this.fragments.values()) {
      fragment.selectionSet.validate(variableDefinitions);
    }
  }

  toFragmentDefinitionNodes() : FragmentDefinitionNode[] {
    return this.definitions().map(f => f.toFragmentDefinitionNode());
  }

  toString(indent?: string) {
    return this.definitions().map(f => f.toString(indent)).join('\n\n');
  }
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
        const deferArgs = selection.element.deferDirectiveArgs();
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

export class SelectionSet {
  private readonly _keyedSelections: Map<string, Selection>;
  private readonly _selections: readonly Selection[];

  constructor(
    readonly parentType: CompositeType,
    keyedSelections: Map<string, Selection> = new Map(),
    readonly fragments?: NamedFragments,
  ) {
    this._keyedSelections = keyedSelections;
    this._selections = mapValues(keyedSelections);
  }

  selectionsInReverseOrder(): readonly Selection[] {
    const length = this._selections.length;
    const reversed = new Array<Selection>(length);
    for (let i = 0; i < length; i++) {
      reversed[i] = this._selections[length - i - 1];
    }
    return reversed;
  }

  selections(): readonly Selection[] {
    return this._selections;
  }

  // Returns whether the selection contains a _non-aliased_ selection of __typename.
  hasTopLevelTypenameField(): boolean {
    return this._keyedSelections.has(typenameFieldName);
  }

  fieldsInSet(): { path: string[], field: FieldSelection }[] {
    const fields = new Array<{ path: string[], field: FieldSelection }>();
    for (const selection of this.selections()) {
      if (selection.kind === 'FieldSelection') {
        fields.push({ path: [], field: selection });
      } else {
        const condition = selection.element.typeCondition;
        const header = condition ? [`... on ${condition}`] : [];
        for (const { path, field } of selection.selectionSet.fieldsInSet()) {
          fields.push({ path: header.concat(path), field});
        }
      }
    }
    return fields;
  }

  usedVariables(): Variables {
    const collector = new VariableCollector();
    this.collectVariables(collector);
    return collector.variables();
  }

  collectVariables(collector: VariableCollector) {
    for (const selection of this.selections()) {
      selection.collectVariables(collector);
    }
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    for (const selection of this.selections()) {
        selection.collectUsedFragmentNames(collector);
    }
  }

  optimize(fragments?: NamedFragments): SelectionSet {
    if (!fragments || fragments.isEmpty()) {
      return this;
    }

    // Handling the case where the selection may alreayd have some fragments adds complexity,
    // not only because we need to deal with merging new and existing fragments, but also because
    // things get weird if some fragment names are in common to both. Since we currently only care
    // about this method when optimizing subgraph fetch selections and those are initially created
    // without any fragments, we don't bother handling this more complex case.
    assert(!this.fragments || this.fragments.isEmpty(), `Should not be called on selection that already has named fragments, but got ${this.fragments}`)

    return this.lazyMap((selection) => selection.optimize(fragments), { fragments });
  }

  expandAllFragments(): SelectionSet {
    return this.lazyMap((selection) => selection.expandAllFragments(), { fragments: null });
  }

  expandFragments(names: string[], updatedFragments: NamedFragments | undefined): SelectionSet {
    if (names.length === 0) {
      return this;
    }

    return this.lazyMap((selection) => selection.expandFragments(names, updatedFragments), { fragments: updatedFragments ?? null });
  }

  trimUnsatisfiableBranches(parentType: CompositeType): SelectionSet {
    return this.lazyMap((selection) => selection.trimUnsatisfiableBranches(parentType), { parentType });
  }

  /**
   * Returns the result of mapping the provided `mapper` to all the selection of this selection set.
   *
   * This method assumes that the `mapper` may often return it's argument directly, meaning that only
   * a small subset of selection actually need any modifications, and will avoid re-creating new
   * objects when that is the case. This does mean that the resulting selection set may be `this`
   * directly, or may alias some of the sub-selection in `this`.
   */
  lazyMap(
    mapper: (selection: Selection) => Selection | readonly Selection[] | SelectionSet | undefined,
    options?: {
      fragments?: NamedFragments | null,
      parentType?: CompositeType,
    }
  ): SelectionSet {
    const selections = this.selections();
    const updatedFragments = options?.fragments;
    const newFragments = updatedFragments === undefined ? this.fragments : (updatedFragments ?? undefined);

    let updatedSelections: SelectionSetUpdates | undefined = undefined;
    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const updated = mapper(selection);
      if (updated !== selection && !updatedSelections) {
        updatedSelections = new SelectionSetUpdates();
        for (let j = 0; j < i; j++) {
          updatedSelections.add(selections[j]);
        }
      }
      if (!!updated && updatedSelections) {
        updatedSelections.add(updated);
      }
    }
    if (!updatedSelections) {
      return this.withUpdatedFragments(newFragments);
    }
    return updatedSelections.toSelectionSet(options?.parentType ?? this.parentType, newFragments);
  }

  private withUpdatedFragments(newFragments: NamedFragments | undefined): SelectionSet {
    return this.fragments === newFragments ? this : new SelectionSet(this.parentType, this._keyedSelections, newFragments);
  }

  withoutDefer(labelsToRemove?: Set<string>): SelectionSet {
    assert(!this.fragments, 'Not yet supported');
    return this.lazyMap((selection) => selection.withoutDefer(labelsToRemove));
  }

  withNormalizedDefer(normalizer: DeferNormalizer): SelectionSet {
    assert(!this.fragments, 'Not yet supported');
    return this.lazyMap((selection) => selection.withNormalizedDefer(normalizer));
  }

  hasDefer(): boolean {
    return this.selections().some((s) => s.hasDefer());
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

  rebaseOn(parentType: CompositeType): SelectionSet {
    if (this.parentType === parentType) {
      return this;
    }

    const newSelections = new Map<string, Selection>();
    for (const selection of this.selections()) {
      newSelections.set(selection.key(), selection.rebaseOn(parentType));
    }

    return new SelectionSet(parentType, newSelections, this.fragments);
  }

  equals(that: SelectionSet): boolean {
    if (this === that) {
      return true;
    }

    if (this._selections.length !== that._selections.length) {
      return false;
    }

    for (const [key, thisSelection] of this._keyedSelections) {
      const thatSelection = that._keyedSelections.get(key);
      if (!thatSelection || !thisSelection.equals(thatSelection)) {
        return false;
      }
    }
    return true;
  }

  contains(that: SelectionSet): boolean {
    if (this._selections.length < that._selections.length) {
      return false;
    }

    for (const [key, thatSelection] of that._keyedSelections) {
      const thisSelection = this._keyedSelections.get(key);
      if (!thisSelection || !thisSelection.contains(thatSelection)) {
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
    const updated = new SelectionSetUpdates();

    for (const [key, thisSelection] of this._keyedSelections) {
      const thatSelection = that._keyedSelections.get(key);
      if (!thatSelection) {
        updated.add(thisSelection);
      } else {
        // If there is a subset, then we compute the diff of the subset and add that (if not empty).
        // Otherwise, we just skip `thisSelection` and do nothing
        if (thisSelection.selectionSet && thatSelection.selectionSet) {
          const updatedSubSelectionSet = thisSelection.selectionSet.minus(thatSelection.selectionSet);
          if (!updatedSubSelectionSet.isEmpty()) {
            updated.add(thisSelection.withUpdatedSelectionSet(updatedSubSelectionSet));
          }
        }
      }
    }
    return updated.toSelectionSet(this.parentType, this.fragments);
  }

  canRebaseOn(parentTypeToTest: CompositeType): boolean {
    return this.selections().every((selection) => selection.canAddTo(parentTypeToTest));
  }

  validate(variableDefinitions: VariableDefinitions) {
    validate(!this.isEmpty(), () => `Invalid empty selection set`);
    for (const selection of this.selections()) {
      selection.validate(variableDefinitions);
    }
  }

  isEmpty(): boolean {
    return this._selections.length === 0;
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
    const isNonAliasedTypenameSelection = (s: Selection) => s.kind === 'FieldSelection' && !s.element.alias && s.element.name === typenameFieldName;
    const typenameSelection = this._selections.find((s) => isNonAliasedTypenameSelection(s));
    if (typenameSelection) {
      return [typenameSelection].concat(this.selections().filter(s => !isNonAliasedTypenameSelection(s)));
    } else {
      return this._selections;
    }
  }

  toOperationPaths(): OperationPath[] {
    return this.toOperationPathsInternal([]);
  }

  private toOperationPathsInternal(parentPaths: OperationPath[]): OperationPath[] {
    return this.selections().flatMap((selection) => {
      const updatedPaths = parentPaths.map(path => path.concat(selection.element));
      return selection.selectionSet
        ? selection.selectionSet.toOperationPathsInternal(updatedPaths)
        : updatedPaths;
    });
  }

  /**
   * Calls the provided callback on all the "elements" (including nested ones) of this selection set.
   * The order of traversal is that of the selection set.
   */
  forEachElement(callback: (elt: OperationElement) => void) {
    // Note: we reverse to preserve ordering (since the stack re-reverse).
    const stack = this.selectionsInReverseOrder().concat();
    while (stack.length > 0) {
      const selection = stack.pop()!;
      callback(selection.element);
      selection.selectionSet?.selectionsInReverseOrder().forEach((s) => stack.push(s));
    }
  }

  /**
   * Returns true if any of the element in this selection set matches the provided predicate.
   */
  some(predicate: (elt: OperationElement) => boolean): boolean {
    for (const selection of this.selections()) {
      if (predicate(selection.element) || (selection.selectionSet && selection.selectionSet.some(predicate))) {
        return true;
      }
    }
    return false;
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
    if (this.isEmpty()) {
      return '{}';
    }

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

type PathBasedUpdate = { path: OperationPath, selections?: Selection | SelectionSet | readonly Selection[] };
type SelectionUpdate = Selection | PathBasedUpdate;

/**
 * Accumulates updates in order to build a new `SelectionSet`.
 */
export class SelectionSetUpdates {
  private readonly keyedUpdates = new MultiMap<string, SelectionUpdate>;

  isEmpty(): boolean {
    return this.keyedUpdates.size === 0;
  }

  /**
   * Adds the provided selections to those updates.
   */
  add(selections: Selection | SelectionSet | readonly Selection[]): SelectionSetUpdates {
    addToKeyedUpdates(this.keyedUpdates, selections);
    return this;
  }

  /**
   * Adds a path, and optional some selections following that path, to those updates.
   *
   * The final selections are optional (for instance, if `path` ends on a leaf field, then no followup selections would
   * make sense), but when some are provided, uncesssary fragments will be automaticaly removed at the junction between
   * the path and those final selections. For instance, suppose that we have:
   *  - a `path` argument that is `a::b::c`, where the type of the last field `c` is some object type `C`.
   *  - a `selections` argument that is `{ ... on C { d } }`.
   * Then the resulting built selection set will be: `{ a { b { c { d } } }`, and in particular the `... on C` fragment
   * will be eliminated since it is unecesasry (since again, `c` is of type `C`).
   */
  addAtPath(path: OperationPath, selections?: Selection | SelectionSet | readonly Selection[]): SelectionSetUpdates {
    if (path.length === 0) {
      if (selections) {
        addToKeyedUpdates(this.keyedUpdates, selections)
      }
    } else {
      if (path.length === 1 && !selections) {
        const element = path[0];
        if (element.kind === 'Field' && element.isLeafField()) {
          // This is a somewhat common case (when we deal with @key "conditions", those are often trivial and end up here),
          // so we unpack it directly instead of creating unecessary temporary objects (not that we only do it for leaf
          // field; for non-leaf ones, we'd have to create an empty sub-selectionSet, and that may have to get merged
          // with other entries of this `SleectionSetUpdates`, so we wouldn't really save work).
          const selection = selectionOfElement(element);
          this.keyedUpdates.add(selection.key(), selection);
          return this;
        }
      }
      // We store the provided update "as is" (we don't convert it to a `Selection` just yet) and process everything
      // when we build the final `SelectionSet`. This is done because multipe different updates can intersect in various
      // ways, and the work to build a `Selection` now could be largely wasted due to followup updates.
      this.keyedUpdates.add(path[0].key(), { path, selections });
    }
    return this;
  }

  clone(): SelectionSetUpdates {
    const cloned = new SelectionSetUpdates();
    for (const [key, values] of this.keyedUpdates.entries()) {
      cloned.keyedUpdates.set(key, Array.from(values));
    }
    return cloned;
  }

  clear() {
    this.keyedUpdates.clear();
  }

  toSelectionSet(parentType: CompositeType, fragments?: NamedFragments): SelectionSet {
    return makeSelectionSet(parentType, this.keyedUpdates, fragments);
  }
}

function addToKeyedUpdates(keyedUpdates: MultiMap<string, SelectionUpdate>, selections: Selection | SelectionSet | readonly Selection[]) {
  if (selections instanceof AbstractSelection) {
    addOneToKeyedUpdates(keyedUpdates, selections);
  } else {
    const toAdd = selections instanceof SelectionSet ? selections.selections() : selections;
    for (const selection of toAdd) {
      addOneToKeyedUpdates(keyedUpdates, selection);
    }
  }
}

function addOneToKeyedUpdates(keyedUpdates: MultiMap<string, SelectionUpdate>, selection: Selection) {
  // Keys are such that for a named fragment, only a selection of the same fragment with same directives can have the same key.
  // But if we end up with multiple spread of the same named fragment, we don't want to try to "merge" the sub-selections of
  // each, as it would expand the fragments and make things harder. So we essentially special case spreads to avoid having
  // to deal with multiple time the exact same one.
  if (selection instanceof FragmentSpreadSelection) {
    keyedUpdates.set(selection.key(), [selection]);
  } else {
    keyedUpdates.add(selection.key(), selection);
  }
}

function isUnecessaryFragment(parentType: CompositeType, fragment: FragmentSelection): boolean {
  return fragment.element.appliedDirectives.length === 0
    && (!fragment.element.typeCondition || sameType(parentType, fragment.element.typeCondition));
}

function withUnecessaryFragmentsRemoved(
  parentType: CompositeType,
  selections: Selection | SelectionSet | readonly Selection[],
): Selection | readonly Selection[] {
  if (selections instanceof AbstractSelection) {
    if (selections.kind !== 'FragmentSelection' || !isUnecessaryFragment(parentType, selections)) {
      return selections;
    }
    return withUnecessaryFragmentsRemoved(parentType, selections.selectionSet);
  }

  const toCheck = selections instanceof SelectionSet ? selections.selections() : selections;
  const filtered: Selection[] = [];
  for (const selection of toCheck) {
    if (selection.kind === 'FragmentSelection' && isUnecessaryFragment(parentType, selection)) {
      const subSelections = withUnecessaryFragmentsRemoved(parentType, selection.selectionSet);
      if (subSelections instanceof AbstractSelection) {
        filtered.push(subSelections);
      } else {
        for (const subSelection of subSelections) {
          filtered.push(subSelection);
        }
      }
    } else {
      filtered.push(selection);
    }
  }
  return filtered;
}

function makeSelection(parentType: CompositeType, updates: SelectionUpdate[], fragments?: NamedFragments): Selection {
  assert(updates.length > 0, 'Should not be called without any updates');
  const first = updates[0];

  // Optimize for the simple case of a single selection, as we don't have to do anything complex to merge the sub-selections.
  if (updates.length === 1 && first instanceof AbstractSelection) {
    return first.rebaseOn(parentType);
  }

  const element = updateElement(first).rebaseOn(parentType);
  const subSelectionParentType = element.kind === 'Field' ? baseType(element.definition.type!) : element.castedType();
  if (!isCompositeType(subSelectionParentType)) {
    // This is a leaf, so all updates should correspond ot the same field and we just use the first.
    return selectionOfElement(element);
  }

  const subSelectionKeyedUpdates = new MultiMap<string, SelectionUpdate>();
  for (const update of updates) {
    if (update instanceof AbstractSelection) {
      if (update.selectionSet) {
        addToKeyedUpdates(subSelectionKeyedUpdates, update.selectionSet);
      }
    } else {
      addSubpathToKeyUpdates(subSelectionKeyedUpdates, subSelectionParentType, update);
    }
  }
  return selectionOfElement(element, makeSelectionSet(subSelectionParentType, subSelectionKeyedUpdates, fragments));
}

function updateElement(update: SelectionUpdate): OperationElement {
  return update instanceof AbstractSelection ? update.element : update.path[0];
}

function addSubpathToKeyUpdates(
  keyedUpdates: MultiMap<string, SelectionUpdate>,
  subSelectionParentType: CompositeType,
  pathUpdate: PathBasedUpdate
) {
  if (pathUpdate.path.length === 1) {
    if (!pathUpdate.selections) {
      return;
    }
    addToKeyedUpdates(keyedUpdates, withUnecessaryFragmentsRemoved(subSelectionParentType, pathUpdate.selections!));
  } else {
    keyedUpdates.add(pathUpdate.path[1].key(), { path: pathUpdate.path.slice(1), selections: pathUpdate.selections });
  }
}

function makeSelectionSet(parentType: CompositeType, keyedUpdates: MultiMap<string, SelectionUpdate>, fragments?: NamedFragments): SelectionSet {
  const selections = new Map<string, Selection>();
  for (const [key, updates] of keyedUpdates.entries()) {
    selections.set(key, makeSelection(parentType, updates, fragments));
  }
  return new SelectionSet(parentType, selections, fragments);
}

/**
 * A simple wrapper over a `SelectionSetUpdates` that allows to conveniently build a selection set, then add some more updates and build it again, etc... 
 */
export class MutableSelectionSet<TMemoizedValue extends { [key: string]: any } = {}> {
  private computed: SelectionSet | undefined;
  private _memoized: TMemoizedValue | undefined;

  private constructor(
    readonly parentType: CompositeType,
    private readonly _updates: SelectionSetUpdates,
    private readonly memoizer: (s: SelectionSet) => TMemoizedValue,
  ) {
  }

  static empty(parentType: CompositeType): MutableSelectionSet {
    return this.emptyWithMemoized(parentType, () => ({}));
  }

  static emptyWithMemoized<TMemoizedValue extends { [key: string]: any }>(
    parentType: CompositeType,
    memoizer: (s: SelectionSet) => TMemoizedValue,
  ): MutableSelectionSet<TMemoizedValue> {
    return new MutableSelectionSet( parentType, new SelectionSetUpdates(), memoizer);
  }


  static of(selectionSet: SelectionSet): MutableSelectionSet {
    return this.ofWithMemoized(selectionSet, () => ({}));
  }

  static ofWithMemoized<TMemoizedValue extends { [key: string]: any }>(
    selectionSet: SelectionSet,
    memoizer: (s: SelectionSet) => TMemoizedValue,
  ): MutableSelectionSet<TMemoizedValue> {
    const s = new MutableSelectionSet(selectionSet.parentType, new SelectionSetUpdates(), memoizer);
    s._updates.add(selectionSet);
    // Avoids needing to re-compute `selectionSet` until there is new updates.
    s.computed = selectionSet;
    return s;
  }

  isEmpty(): boolean {
    return this._updates.isEmpty();
  }

  get(): SelectionSet {
    if (!this.computed) {
      this.computed = this._updates.toSelectionSet(this.parentType);
      // But now, we clear the updates an re-add the selections from computed. Of course, we could also
      // not clear updates at all, but that would mean that the computations going on for merging selections
      // would be re-done every time and that would be a lot less efficient.
      this._updates.clear();
      this._updates.add(this.computed);
    }
    return this.computed;
  }

  updates(): SelectionSetUpdates {
    // We clear our cached version since we're about to add more updates and so this cached version won't
    // represent the mutable set properly anymore.
    this.computed = undefined;
    this._memoized = undefined;
    return this._updates;
  }

  clone(): MutableSelectionSet<TMemoizedValue> {
    const cloned = new MutableSelectionSet(this.parentType, this._updates.clone(), this.memoizer);
    // Until we have more updates, we can share the computed values (if any).
    cloned.computed = this.computed;
    cloned._memoized = this._memoized;
    return cloned;
  }

  rebaseOn(parentType: CompositeType): MutableSelectionSet<TMemoizedValue> {
    const rebased = new MutableSelectionSet(parentType, new SelectionSetUpdates(), this.memoizer);
    // Note that updates are always rebased on their parentType, so we won't have to call `rebaseOn` manually on `this.get()`.
    rebased._updates.add(this.get());
    return rebased;
  }

  memoized(): TMemoizedValue {
    if (!this._memoized) {
      this._memoized = this.memoizer(this.get());
    }
    return this._memoized;
  }

  toString() {
    return this.get().toString();
  }
}

export function allFieldDefinitionsInSelectionSet(selection: SelectionSet): FieldDefinition<CompositeType>[] {
  const stack = Array.from(selection.selections());
  const allFields: FieldDefinition<CompositeType>[] = [];
  while (stack.length > 0) {
    const selection = stack.pop()!;
    if (selection.kind === 'FieldSelection') {
      allFields.push(selection.element.definition);
    }
    if (selection.selectionSet) {
      stack.push(...selection.selectionSet.selections());
    }
  }
  return allFields;
}

export function selectionSetOf(parentType: CompositeType, selection: Selection, fragments?: NamedFragments): SelectionSet {
  const map = new Map<string, Selection>()
  map.set(selection.key(), selection);
  return new SelectionSet(parentType, map, fragments);
}

export function selectionSetOfElement(element: OperationElement, subSelection?: SelectionSet, fragments?: NamedFragments): SelectionSet {
  return selectionSetOf(element.parentType, selectionOfElement(element, subSelection), fragments);
}

export function selectionOfElement(element: OperationElement, subSelection?: SelectionSet): Selection {
  // TODO: validate that the subSelection is ok for the element
  return element.kind === 'Field' ? new FieldSelection(element, subSelection) : new InlineFragmentSelection(element, subSelection!);
}

export type Selection = FieldSelection | FragmentSelection;

abstract class AbstractSelection<TElement extends OperationElement, TIsLeaf extends undefined | never, TOwnType extends AbstractSelection<TElement, TIsLeaf, TOwnType>> {
  constructor(
    readonly element: TElement,
  ) {
    // TODO: we should do validate the type of the selection set matches the element.
  }

  abstract get selectionSet(): SelectionSet | TIsLeaf;

  protected abstract us(): TOwnType;

  abstract key(): string;

  abstract optimize(fragments: NamedFragments): Selection;

  abstract toSelectionNode(): SelectionNode;

  abstract validate(variableDefinitions: VariableDefinitions): void;

  abstract rebaseOn(parentType: CompositeType): TOwnType;

  get parentType(): CompositeType {
    return this.element.parentType;
  }

  collectVariables(collector: VariableCollector) {
    this.element.collectVariables(collector);
    this.selectionSet?.collectVariables(collector)
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    this.selectionSet?.collectUsedFragmentNames(collector);
  }

  namedFragments(): NamedFragments | undefined {
    return this.selectionSet?.fragments;
  }

  abstract withUpdatedComponents(element: TElement, selectionSet: SelectionSet | TIsLeaf): TOwnType;

  withUpdatedSelectionSet(selectionSet: SelectionSet | TIsLeaf): TOwnType {
    return this.withUpdatedComponents(this.element, selectionSet);
  }

  withUpdatedElement(element: TElement): TOwnType {
    return this.withUpdatedComponents(element, this.selectionSet);
  }

  mapToSelectionSet(mapper: (s: SelectionSet) => SelectionSet): TOwnType {
    if (!this.selectionSet) {
      return this.us();
    }

    const updatedSelectionSet = mapper(this.selectionSet);
    return updatedSelectionSet === this.selectionSet
      ? this.us()
      : this.withUpdatedSelectionSet(updatedSelectionSet);
  }

  abstract withoutDefer(labelsToRemove?: Set<string>): TOwnType | SelectionSet;

  abstract withNormalizedDefer(normalizer: DeferNormalizer): TOwnType | SelectionSet;

  abstract hasDefer(): boolean;

  abstract expandAllFragments(): TOwnType | readonly Selection[];

  abstract expandFragments(names: string[], updatedFragments: NamedFragments | undefined): TOwnType | readonly Selection[];

  abstract trimUnsatisfiableBranches(parentType: CompositeType): TOwnType | SelectionSet | undefined;
}

export class FieldSelection extends AbstractSelection<Field<any>, undefined, FieldSelection> {
  readonly kind = 'FieldSelection' as const;

  constructor(
    field: Field<any>,
    private readonly _selectionSet?: SelectionSet,
  ) {
    super(field);
  }

  get selectionSet(): SelectionSet | undefined {
    return this._selectionSet;
  }

  protected us(): FieldSelection {
    return this;
  }

  withUpdatedComponents(field: Field<any>, selectionSet: SelectionSet | undefined): FieldSelection {
    return new FieldSelection(field, selectionSet);
  }

  key(): string {
    return this.element.key();
  }

  optimize(fragments: NamedFragments): Selection {
    const optimizedSelection = this.selectionSet ? this.selectionSet.optimize(fragments) : undefined;
    const fieldBaseType = baseType(this.element.definition.type!);
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
          const fragmentSelection = new FragmentSpreadSelection(fieldBaseType, fragments, candidate, []);
          return new FieldSelection(this.element, selectionSetOf(fieldBaseType, fragmentSelection));
        }
      }
    }

    return this.selectionSet === optimizedSelection
      ? this
      : new FieldSelection(this.element, optimizedSelection);
  }

  filter(predicate: (selection: Selection) => boolean): FieldSelection | undefined {
    if (!this.selectionSet) {
      return predicate(this) ? this : undefined;
    }

    const updatedSelectionSet = this.selectionSet.filter(predicate);
    const thisWithFilteredSelectionSet = this.selectionSet === updatedSelectionSet
      ? this
      : new FieldSelection(this.element, updatedSelectionSet);
    return predicate(thisWithFilteredSelectionSet) ? thisWithFilteredSelectionSet : undefined;
  }

  validate(variableDefinitions: VariableDefinitions) {
    this.element.validate(variableDefinitions);
    // Note that validation is kind of redundant since `this.selectionSet.validate()` will check that it isn't empty. But doing it
    // allow to provide much better error messages.
    validate(
      this.element.isLeafField() || (this.selectionSet && !this.selectionSet.isEmpty()),
      () => `Invalid empty selection set for field "${this.element.definition.coordinate}" of non-leaf type ${this.element.definition.type}`,
      this.element.definition.sourceAST
    );
    this.selectionSet?.validate(variableDefinitions);
  }

  /**
   * Returns a field selection "equivalent" to the one represented by this object, but such that its parent type 
   * is the one provided as argument.
   *
   * Obviously, this operation will only succeed if this selection (both the field itself and its subselections)
   * make sense from the provided parent type. If this is not the case, this method will throw.
   */
  rebaseOn(parentType: CompositeType): FieldSelection {
    if (this.element.parentType === parentType) {
      return this;
    }

    const rebasedElement = this.element.rebaseOn(parentType);
    if (!this.selectionSet) {
      return this.withUpdatedElement(rebasedElement);
    }

    const rebasedBase = baseType(rebasedElement.definition.type!);
    if (rebasedBase === this.selectionSet.parentType) {
      return this.withUpdatedElement(rebasedElement);
    }

    validate(isCompositeType(rebasedBase), () => `Cannot rebase field selection ${this} on ${parentType}: rebased field base return type ${rebasedBase} is not composite`);
    return this.withUpdatedComponents(rebasedElement, this.selectionSet.rebaseOn(rebasedBase));
  }

  /**
   * Essentially checks if `updateForAddingTo` would work on an selecion set of the provide parent type.
   */
  canAddTo(parentType: CompositeType): boolean {
    if (this.element.parentType === parentType) {
      return true;
    }

    const type = this.element.typeIfAddedTo(parentType);
    if (!type) {
      return false;
    }

    const base = baseType(type);
    if (this.selectionSet && this.selectionSet.parentType !== base) {
      assert(isCompositeType(base), () => `${this.element} should have a selection set as it's type is not a composite`);
      return this.selectionSet.selections().every((s) => s.canAddTo(base));
    }
    return true;
  }

  toSelectionNode(): FieldNode {
    const alias: NameNode | undefined = this.element.alias ? { kind: Kind.NAME, value: this.element.alias, } : undefined;
    return {
      kind: Kind.FIELD,
      name: {
        kind: Kind.NAME,
        value: this.element.name,
      },
      alias,
      arguments: this.element.argumentsToNodes(),
      directives: this.element.appliedDirectivesToDirectiveNodes(),
      selectionSet: this.selectionSet?.toSelectionSetNode()
    };
  }

  withoutDefer(labelsToRemove?: Set<string>): FieldSelection {
    return this.mapToSelectionSet((s) => s.withoutDefer(labelsToRemove));
  }

  withNormalizedDefer(normalizer: DeferNormalizer): FieldSelection {
    return this.mapToSelectionSet((s) => s.withNormalizedDefer(normalizer));
  }

  hasDefer(): boolean {
    return !!this.selectionSet?.hasDefer();
  }

  expandAllFragments(): FieldSelection {
    return this.mapToSelectionSet((s) => s.expandAllFragments());
  }

  trimUnsatisfiableBranches(_: CompositeType): FieldSelection {
    if (!this.selectionSet) {
      return this;
    }

    const base = baseType(this.element.definition.type!)
    assert(isCompositeType(base), () => `Field ${this.element} should not have a sub-selection`);
    const trimmed = this.mapToSelectionSet((s) => s.trimUnsatisfiableBranches(base));
    // In rare caes, it's possible that everything in the sub-selection was trimmed away and so the
    // sub-selection is empty. Which suggest something may be wrong with this part of the query
    // intent, but the query was valid while keeping an empty sub-selection isn't. So in that
    // case, we just add some "non-included" __typename field just to keep the query valid.
    if (trimmed.selectionSet?.isEmpty()) {
      return trimmed.withUpdatedSelectionSet(selectionSetOfElement(
        new Field(
          base.typenameField()!,
          undefined,
          [new Directive('include', { 'if': false })],
        )
      ));
    } else {
      return trimmed;
    }
  }

  expandFragments(names: string[], updatedFragments: NamedFragments | undefined): FieldSelection {
    return this.mapToSelectionSet((s) => s.expandFragments(names, updatedFragments));
  }

  equals(that: Selection): boolean {
    if (this === that) {
      return true;
    }

    if (!(that instanceof FieldSelection) || !this.element.equals(that.element)) {
      return false;
    }
    if (!this.selectionSet) {
      return !that.selectionSet;
    }
    return !!that.selectionSet && this.selectionSet.equals(that.selectionSet);
  }

  contains(that: Selection): boolean {
    if (!(that instanceof FieldSelection) || !this.element.equals(that.element)) {
      return false;
    }

    if (!that.selectionSet) {
      return true;
    }
    return !!this.selectionSet && this.selectionSet.contains(that.selectionSet);
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    return (indent ?? '') + this.element + (this.selectionSet ? ' ' + this.selectionSet.toString(expandFragments, true, indent) : '');
  }
}

export abstract class FragmentSelection extends AbstractSelection<FragmentElement, never, FragmentSelection> {
  readonly kind = 'FragmentSelection' as const;

  abstract canAddTo(parentType: CompositeType): boolean;

  protected us(): FragmentSelection {
    return this;
  }

  protected validateDeferAndStream() {
    if (this.element.hasDefer() || this.element.hasStream()) {
      const schemaDef = this.element.schema().schemaDefinition;
      const parentType = this.parentType;
      validate(
        schemaDef.rootType('mutation') !== parentType && schemaDef.rootType('subscription') !== parentType,
        () => `The @defer and @stream directives cannot be used on ${schemaDef.roots().filter((t) => t.type === parentType).pop()?.rootKind} root type "${parentType}"`,
      );
    }
  }
  
  filter(predicate: (selection: Selection) => boolean): FragmentSelection | undefined {
    // Note that we essentially expand all fragments as part of this.
    const selectionSet = this.selectionSet;
    const updatedSelectionSet = selectionSet.filter(predicate);
    const thisWithFilteredSelectionSet = updatedSelectionSet === selectionSet
      ? this
      : new InlineFragmentSelection(this.element, updatedSelectionSet);

    return predicate(thisWithFilteredSelectionSet) ? thisWithFilteredSelectionSet : undefined;
  }
 
  hasDefer(): boolean {
    return this.element.hasDefer() || this.selectionSet.hasDefer();
  }

  equals(that: Selection): boolean {
    if (this === that) {
      return true;
    }
    return (that instanceof FragmentSelection)
      && this.element.equals(that.element)
      && this.selectionSet.equals(that.selectionSet);
  }

  contains(that: Selection): boolean {
    return (that instanceof FragmentSelection)
      && this.element.equals(that.element)
      && this.selectionSet.contains(that.selectionSet);
  }
}

class InlineFragmentSelection extends FragmentSelection {
  constructor(
    fragment: FragmentElement,
    private readonly _selectionSet: SelectionSet,
  ) {
    super(fragment);
  }

  get selectionSet(): SelectionSet {
    return this._selectionSet;
  }

  key(): string {
    return this.element.key();
  }

  withUpdatedComponents(fragment: FragmentElement, selectionSet: SelectionSet): InlineFragmentSelection {
    return new InlineFragmentSelection(fragment, selectionSet);
  }

  validate(variableDefinitions: VariableDefinitions) {
    this.validateDeferAndStream();
    // Note that validation is kind of redundant since `this.selectionSet.validate()` will check that it isn't empty. But doing it
    // allow to provide much better error messages.
    validate(
      !this.selectionSet.isEmpty(),
      () => `Invalid empty selection set for fragment "${this.element}"`
    );
    this.selectionSet.validate(variableDefinitions);
  }

  rebaseOn(parentType: CompositeType): FragmentSelection {
    if (this.parentType === parentType) {
      return this;
    }

    const rebasedFragment = this.element.rebaseOn(parentType);
    const rebasedCastedType = rebasedFragment.castedType();
    if (rebasedCastedType === this.selectionSet.parentType) {
      return this.withUpdatedElement(rebasedFragment);
    }

    return this.withUpdatedComponents(rebasedFragment, this.selectionSet.rebaseOn(rebasedCastedType));
  }

  canAddTo(parentType: CompositeType): boolean {
    if (this.element.parentType === parentType) {
      return true;
    }

    const type = this.element.castedTypeIfAddedTo(parentType);
    if (!type) {
      return false;
    }

    if (this.selectionSet.parentType !== type) {
      return this.selectionSet.selections().every((s) => s.canAddTo(type));
    }
    return true;
  }

  toSelectionNode(): InlineFragmentNode {
    const typeCondition = this.element.typeCondition;
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
      directives: this.element.appliedDirectivesToDirectiveNodes(),
      selectionSet: this.selectionSet.toSelectionSetNode()
    };
  }

  optimize(fragments: NamedFragments): FragmentSelection {
    let optimizedSelection = this.selectionSet.optimize(fragments);
    const typeCondition = this.element.typeCondition;
    if (typeCondition) {
      for (const candidate of fragments.maybeApplyingAtType(typeCondition)) {
        // See comment in `FieldSelection.optimize` about the `equals`: this fully apply here too.
        if (optimizedSelection.equals(candidate.selectionSet)) {
          let spreadDirectives: Directive[] = [];
          if (this.element.appliedDirectives) {
            const { isSubset, difference } = diffDirectives(this.element.appliedDirectives, candidate.appliedDirectives);
            if (!isSubset) {
              // This means that while the named fragments matches the sub-selection, that name fragment also include some
              // directives that are _not_ on our element, so we cannot use it.
              continue;
            }
            spreadDirectives = difference;
          }

          const newSelection = new FragmentSpreadSelection(this.parentType, fragments, candidate, spreadDirectives);
          // We use the fragment when the fragments condition is either the same, or a supertype of our current condition.
          // If it's the same type, then we don't really want to preserve the current condition, it is included in the
          // spread and we can return it directly. But if the fragment condition is a superset, then we should preserve
          // our current condition since it restricts the selection more than the fragment actual does.
          if (sameType(typeCondition, candidate.typeCondition)) {
            return newSelection;
          }

          optimizedSelection = selectionSetOf(this.parentType, newSelection);
          break;
        }
      }
    }
    return this.selectionSet === optimizedSelection
      ? this
      : new InlineFragmentSelection(this.element, optimizedSelection);
  }

  withoutDefer(labelsToRemove?: Set<string>): InlineFragmentSelection | SelectionSet {
    const newSelection = this.selectionSet.withoutDefer(labelsToRemove);
    const deferArgs = this.element.deferDirectiveArgs();
    const hasDeferToRemove = deferArgs && (!labelsToRemove || (deferArgs.label && labelsToRemove.has(deferArgs.label)));
    if (newSelection === this.selectionSet && !hasDeferToRemove) {
      return this;
    }
    const newElement = hasDeferToRemove ? this.element.withoutDefer() : this.element;
    if (!newElement) {
      return newSelection;
    }
    return this.withUpdatedComponents(newElement, newSelection);
  }

  withNormalizedDefer(normalizer: DeferNormalizer): InlineFragmentSelection | SelectionSet {
    const newElement = this.element.withNormalizedDefer(normalizer);
    const newSelection = this.selectionSet.withNormalizedDefer(normalizer)
    if (!newElement) {
      return newSelection;
    }
    return newElement === this.element && newSelection === this.selectionSet
      ? this
      : this.withUpdatedComponents(newElement, newSelection);
  }

  trimUnsatisfiableBranches(currentType: CompositeType): FragmentSelection | SelectionSet | undefined {
    const thisCondition = this.element.typeCondition;
    // Note that if the condition has directives, we preserve the fragment no matter what.
    if (this.element.appliedDirectives.length === 0) {
      if (!thisCondition || currentType === this.element.typeCondition) {
        const trimmed = this.selectionSet.trimUnsatisfiableBranches(currentType);
        return trimmed.isEmpty() ? undefined : trimmed;
      }

      // If the current type is an object, then we never need to keep the current fragment because:
      // - either the fragment is also an object, but we've eliminated the case where the 2 types are the same,
      //   so this is just an unsatisfiable branch.
      // - or it's not an object, but then the current type is more precise and no point in "casting" to a
      //   less precise interface/union. And if the current type is not even a valid runtime of said interface/union,
      //   then we should completely ignore the branch (or, since we're eliminating `thisCondition`, we would be
      //   building an invalid selection). 
      if (isObjectType(currentType)) {
        if (isObjectType(thisCondition) || !possibleRuntimeTypes(thisCondition).includes(currentType)) {
          return undefined;
        } else {
          const trimmed = this.selectionSet.trimUnsatisfiableBranches(currentType);
          return trimmed.isEmpty() ? undefined : trimmed;
        }
      }
    }

    // In all other cases, we first recurse on the sub-selection.
    const trimmedSelectionSet = this.selectionSet.trimUnsatisfiableBranches(this.element.typeCondition ?? this.parentType);

    // First, could be that everything was unsatisfiable.
    if (trimmedSelectionSet.isEmpty()) {
      if (this.element.appliedDirectives.length === 0) {
        return undefined;
      } else {
        return this.withUpdatedSelectionSet(selectionSetOfElement(
          new Field(
            (this.element.typeCondition ?? this.parentType).typenameField()!,
            undefined,
            [new Directive('include', { 'if': false })],
          )
        ));
      }
    }

    // Second, we check if some of the sub-selection fragments can be "lifted" outside of this fragment. This can happen if:
    // 1. the current fragment is an abstract type,
    // 2. the sub-fragment is an object type,
    // 3. the sub-fragment type is a valid runtime of the current type.
    if (this.element.appliedDirectives.length === 0 && isAbstractType(thisCondition!)) {
      assert(!isObjectType(currentType), () => `Should not have got here if ${currentType} is an object type`);
      const currentRuntimes = possibleRuntimeTypes(currentType);
      const liftableSelections: Selection[] = [];
      for (const selection of trimmedSelectionSet.selections()) {
        if (selection.kind === 'FragmentSelection'
          && selection.element.typeCondition
          && isObjectType(selection.element.typeCondition)
          && currentRuntimes.includes(selection.element.typeCondition)
        ) {
          liftableSelections.push(selection);
        }
      }

      // If we can lift all selections, then that just mean we can get rid of the current fragment altogether
      if (liftableSelections.length === trimmedSelectionSet.selections().length) {
        return trimmedSelectionSet;
      }

      // Otherwise, if there is "liftable" selections, we must return a set comprised of those lifted selection,
      // and the current fragment _without_ those lifted selections.
      if (liftableSelections.length > 0) {
        const newSet = new SelectionSetUpdates();
        newSet.add(liftableSelections);
        newSet.add(this.withUpdatedSelectionSet(
          trimmedSelectionSet.filter((s) => !liftableSelections.includes(s)),
        ));
        return newSet.toSelectionSet(this.parentType);
      }
    }

    return this.selectionSet === trimmedSelectionSet ? this : this.withUpdatedSelectionSet(trimmedSelectionSet);
  }

  expandAllFragments(): FragmentSelection {
    return this.mapToSelectionSet((s) => s.expandAllFragments());
  }

  expandFragments(names: string[], updatedFragments: NamedFragments | undefined): FragmentSelection {
    return this.mapToSelectionSet((s) => s.expandFragments(names, updatedFragments));
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    return (indent ?? '') + this.element + ' ' + this.selectionSet.toString(expandFragments, true, indent);
  }
}

function diffDirectives(superset: readonly Directive<any>[], maybeSubset: readonly Directive<any>[]): { isSubset: boolean, difference: Directive[] } {
  if (maybeSubset.every((d) => superset.some((s) => sameDirectiveApplication(d, s)))) {
    return { isSubset: true, difference: superset.filter((s) => !maybeSubset.some((d) => sameDirectiveApplication(d, s))) };
  } else {
    return { isSubset: false, difference: [] };
  }
}

class FragmentSpreadSelection extends FragmentSelection {
  private computedKey: string | undefined;

  constructor(
    sourceType: CompositeType,
    private readonly fragments: NamedFragments,
    private readonly namedFragment: NamedFragmentDefinition,
    private readonly spreadDirectives: readonly Directive<any>[],
  ) {
    super(new FragmentElement(sourceType, namedFragment.typeCondition, namedFragment.appliedDirectives.concat(spreadDirectives)));
  }

  get selectionSet(): SelectionSet {
    return this.namedFragment.selectionSet;
  }

  key(): string {
    if (!this.computedKey) {
      this.computedKey = '...' + this.namedFragment.name + (this.spreadDirectives.length === 0 ? '' : ' ' + this.spreadDirectives.join(' '));
    }
    return this.computedKey;
  }

  withUpdatedComponents(_fragment: FragmentElement, _selectionSet: SelectionSet): InlineFragmentSelection {
    assert(false, `Unsupported`);
  }

  trimUnsatisfiableBranches(_: CompositeType): FragmentSelection  {
    return this;
  }

  namedFragments(): NamedFragments | undefined {
    return this.fragments;
  }

  validate(): void {
    this.validateDeferAndStream();

    // We don't do anything else because fragment definition are validated when created.
  }

  toSelectionNode(): FragmentSpreadNode {
    const directiveNodes = this.spreadDirectives.length === 0
      ? undefined
      : this.spreadDirectives.map(directive => {
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

  rebaseOn(_parentType: CompositeType): FragmentSelection {
    // This is a little bit iffy, because the fragment could link to a schema (typically the supergraph API one)
    // that is different from the one of `_selectionSet` (say, a subgraph fetch selection in which we're trying to
    // reuse a user fragment). But in practice, we expand all fragments when we do query planning and only re-add
    // fragments back at the very end, so this should be fine. Importantly, we don't want this method to mistakenly
    // expand the spread, as that would compromise the code that optimize subgraph fetches to re-use named
    // fragments.
    return this;
  }

  canAddTo(_: CompositeType): boolean {
    // Mimicking the logic of `rebaseOn`.
    return true;
  }

  expandAllFragments(): FragmentSelection | readonly Selection[] {
    const expandedSubSelections = this.selectionSet.expandAllFragments();
    return sameType(this.parentType, this.namedFragment.typeCondition) && this.element.appliedDirectives.length === 0
      ? expandedSubSelections.selections()
      : new InlineFragmentSelection(this.element, expandedSubSelections);
  }

  expandFragments(names: string[], updatedFragments: NamedFragments | undefined): FragmentSelection | readonly Selection[] {
    if (!names.includes(this.namedFragment.name)) {
      return this;
    }

    const expandedSubSelections = this.selectionSet.expandFragments(names, updatedFragments);
    return sameType(this.parentType, this.namedFragment.typeCondition) && this.element.appliedDirectives.length === 0
      ? expandedSubSelections.selections()
      : new InlineFragmentSelection(this.element, expandedSubSelections);
  }

  collectUsedFragmentNames(collector: Map<string, number>): void {
    this.selectionSet.collectUsedFragmentNames(collector);
    const usageCount = collector.get(this.namedFragment.name);
    collector.set(this.namedFragment.name, usageCount === undefined ? 1 : usageCount + 1);
  }

  withoutDefer(_labelsToRemove?: Set<string>): FragmentSpreadSelection {
    assert(false, 'Unsupported, see `Operation.withAllDeferLabelled`');
  }

  withNormalizedDefer(_normalizer: DeferNormalizer): FragmentSpreadSelection {
    assert(false, 'Unsupported, see `Operation.withAllDeferLabelled`');
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    if (expandFragments) {
      return (indent ?? '') + this.element + ' ' + this.selectionSet.toString(true, true, indent);
    } else {
      const directives = this.spreadDirectives;
      const directiveString = directives.length == 0 ? '' : ' ' + directives.join(' ');
      return (indent ?? '') + '...' + this.namedFragment.name + directiveString;
    }
  }
}

function selectionSetOfNode(
  parentType: CompositeType,
  node: SelectionSetNode,
  variableDefinitions: VariableDefinitions,
  fragments: NamedFragments | undefined,
  fieldAccessor: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined = (type, name) => type.field(name)
): SelectionSet {
  if (node.selections.length === 1) {
    return selectionSetOf(
      parentType,
      selectionOfNode(parentType, node.selections[0], variableDefinitions, fragments, fieldAccessor),
      fragments,
    );
  }

  const selections = new SelectionSetUpdates();
  for (const selectionNode of node.selections) {
    selections.add(selectionOfNode(parentType, selectionNode, variableDefinitions, fragments, fieldAccessor));
  }
  return selections.toSelectionSet(parentType, fragments);
}

function directiveOfNode<T extends DirectiveTargetElement<T>>(schema: Schema, node: DirectiveNode): Directive<T> {
  const directiveDef = schema.directive(node.name.value);
  validate(directiveDef, () => `Unknown directive "@${node.name.value}"`)
  return new Directive(directiveDef.name, argumentsFromAST(directiveDef.coordinate, node.arguments, directiveDef));
}

function directivesOfNodes<T extends DirectiveTargetElement<T>>(schema: Schema, nodes: readonly DirectiveNode[] | undefined): Directive<T>[] {
  return nodes?.map((n) => directiveOfNode(schema, n)) ?? [];
}

function selectionOfNode(
  parentType: CompositeType,
  node: SelectionNode,
  variableDefinitions: VariableDefinitions,
  fragments: NamedFragments | undefined,
  fieldAccessor: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined = (type, name) => type.field(name)
): Selection {
  let selection: Selection;
  const directives = directivesOfNodes(parentType.schema(), node.directives);
  switch (node.kind) {
    case Kind.FIELD:
      const definition: FieldDefinition<any> | undefined  = fieldAccessor(parentType, node.name.value);
      validate(definition, () => `Cannot query field "${node.name.value}" on type "${parentType}".`, parentType.sourceAST);
      const type = baseType(definition.type!);
      const selectionSet = node.selectionSet
        ? selectionSetOfNode(type as CompositeType, node.selectionSet, variableDefinitions, fragments, fieldAccessor)
        : undefined;

      selection = new FieldSelection(
        new Field(definition, argumentsFromAST(definition.coordinate, node.arguments, definition), directives, node.alias?.value),
        selectionSet,
      );
      break;
    case Kind.INLINE_FRAGMENT:
      const element = new FragmentElement(parentType, node.typeCondition?.name.value, directives);
      selection = new InlineFragmentSelection(
        element,
        selectionSetOfNode(element.typeCondition ? element.typeCondition : element.parentType, node.selectionSet, variableDefinitions, fragments, fieldAccessor),
      );
      break;
    case Kind.FRAGMENT_SPREAD:
      const fragmentName = node.name.value;
      validate(fragments, () => `Cannot find fragment name "${fragmentName}" (no fragments were provided)`);
      const fragment = fragments.get(fragmentName);
      validate(fragment, () => `Cannot find fragment name "${fragmentName}" (provided fragments are: [${fragments.names().join(', ')}])`);
      selection = new FragmentSpreadSelection(parentType, fragments, fragment, directives);
      break;
  }
  return selection;
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
        fragments.add(new NamedFragmentDefinition(schema, name, typeCondition, directivesOfNodes(schema, definition.directives)));
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
        fragment.setSelectionSet(selectionSetOfNode(fragment.typeCondition, definition.selectionSet, variableDefinitions, fragments));
        break;
    }
  });
  fragments.validate(variableDefinitions);
  return operationFromAST({schema, operation, variableDefinitions, fragments, validateInput: options?.validate});
}

function operationFromAST({
  schema,
  operation,
  variableDefinitions,
  fragments,
  validateInput,
}:{
  schema: Schema,
  operation: OperationDefinitionNode,
  variableDefinitions: VariableDefinitions,
  fragments: NamedFragments,
  validateInput?: boolean,
}) : Operation {
  const rootType = schema.schemaDefinition.root(operation.operation);
  validate(rootType, () => `The schema has no "${operation.operation}" root type defined`);
  return new Operation(
    schema,
    operation.operation,
    parseSelectionSet({
      parentType: rootType.type,
      source: operation.selectionSet,
      variableDefinitions,
      fragments: fragments.isEmpty() ? undefined : fragments,
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
  variableDefinitions = new VariableDefinitions(),
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
  const selectionSet = selectionSetOfNode(parentType, node, variableDefinitions ?? new VariableDefinitions(), fragments, fieldAccessor);
  if (validate)
    selectionSet.validate(variableDefinitions);
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
