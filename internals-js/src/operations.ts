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
  NamedType,
  isUnionType,
} from "./definitions";
import { isInterfaceObjectType } from "./federation";
import { ERRORS } from "./error";
import { isSubtype, sameType, typesCanBeMerged } from "./types";
import { assert, mapKeys, mapValues, MapWithCachedArrays, MultiMap, SetMultiMap } from "./utils";
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
    readonly args?: TArgs,
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
    return isLeafType(this.baseType());
  }

  baseType(): NamedType {
    return baseType(this.definition.type!);
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
    ? first.baseType()
    : first.typeCondition;

  // The followup is useless if it's a fragment (with no directives we would want to preserve) whose type
  // is already that of the first element (or a supertype).
  return !!typeOfFirst
    && followup.kind === 'FragmentElement'
    && !!followup.typeCondition
    && (followup.appliedDirectives.length === 0 || isDirectiveApplicationsSubset(conditionals, followup.appliedDirectives))
    && isSubtype(followup.typeCondition, typeOfFirst);
}

export type RootOperationPath = {
  rootKind: SchemaRootKind,
  path: OperationPath
}

// Computes for every fragment, which other fragments use it (so the reverse of it's dependencies, the other fragment it uses). 
function computeFragmentsDependents(fragments: NamedFragments): SetMultiMap<string, string> {
  const reverseDeps = new SetMultiMap<string, string>();
  for (const fragment of fragments.definitions()) {
    for (const dependency of fragment.fragmentUsages().keys()) {
      reverseDeps.add(dependency, fragment.name);
    }
  }
  return reverseDeps;
}

function clearKeptFragments(
  usages: Map<string, number>,
  fragments: NamedFragments,
  minUsagesToOptimize: number
) {
  // `toCheck` will contain only fragments that we know we want to keep (but haven't handled/removed from `usages` yet).
  let toCheck = Array.from(usages.entries()).filter(([_, count]) => count >= minUsagesToOptimize).map(([name, _]) => name);
  while (toCheck.length > 0) {
    const newToCheck = [];
    for (const name of toCheck) {
      // We "keep" that fragment so clear it.
      usages.delete(name);
      // But as it is used, bump the usage for every fragment it uses.
      const ownUsages = fragments.get(name)!.fragmentUsages();
      for (const [otherName, otherCount] of ownUsages.entries()) {
        const prevCount = usages.get(otherName);
        // We're interested in fragment not in `usages` anymore.
        if (prevCount !== undefined) {
          const newCount = prevCount + otherCount;
          usages.set(otherName, newCount);
          if (prevCount < minUsagesToOptimize && newCount >= minUsagesToOptimize) {
            newToCheck.push(otherName);
          }
        }
      }
    }
    toCheck = newToCheck;
  }
}

// Checks, in `selectionSet`, which fragments (of `fragments`) are used at least `minUsagesToOptimize` times.
// Returns the updated set of fragments containing only the fragment definitions with usage above our threshold,
// and `undefined` or `null` if no such fragment meets said threshold. When this method returns `null`, it
// additionally means that no fragments are use at all in `selectionSet` (and so `undefined` means that
// "some" fragments are used in `selectionSet`, but just none of them is used at least `minUsagesToOptimize`
// times).
function computeFragmentsToKeep(
  selectionSet: SelectionSet,
  fragments: NamedFragments,
  minUsagesToOptimize: number
): NamedFragments | undefined | null {
  // We start by collecting the usages within the selection set.
  const usages = new Map<string, number>();
  selectionSet.collectUsedFragmentNames(usages);

  // If we have no fragment in the selection set, then it's simple, we just don't keep any fragments.
  if (usages.size === 0) {
    return null;
  }

  // We're going to remove fragments from usages as we categorize them as kept or expanded, so we
  // first ensure that it has entries for every fragment, default to 0.
  for (const fragment of fragments.definitions()) {
    if (usages.get(fragment.name) === undefined) {
      usages.set(fragment.name, 0);
    }
  }

  // At this point, `usages` contains the usages of fragments "in the selection". From that, we want
  // to decide which fragment to "keep", and which to re-expand. But there is 2 subtlety:
  // 1. when we decide to keep some fragment F, then we should could it's own usages of other fragments. That
  //  is, if a fragment G is use once in the selection, but also use once in a fragment F that we
  //  keep, then the usages for G is really 2 (but if F is unused, then we don't want to count
  //  it's usage of G for instance).
  // 2. when we decide to expand a fragment, then this also impact the usages of other fragments it
  //  uses, as those gets "inlined" into the selection. But that also mean we have to be careful
  //  of the order in which we pick fragments to expand. Say we have:
  //  ```graphql
  //   query {
  //      ...F1
  //   }
  //
  //   fragment F1 {
  //     a { ...F2 }
  //     b { ...F2 }
  //   }
  //
  //   fragment F2 {
  //      // something
  //   }
  //  ```
  //  then at this point where we've only counted usages in the query selection, `usages` will be
  //  `{ F1: 1, F2: 0 }`. But we do not want to expand _both_ F1 and F2. Instead, we want to expand
  //  F1 first, and then realize that this increases F2 usages to 2, which means we stop there and keep F2.
  //  Generalizing this, it means we want to first pick up fragments to expand that are _not_ used by any
  //  other fragments that may be expanded.
  const reverseDependencies = computeFragmentsDependents(fragments);
  // We'll add to `toExpand` fragment we will definitively expand.
  const toExpand = new Set<string>;
  let shouldContinue = true;
  while (shouldContinue) {
    // We'll do an iteration, but if we make no progress, we won't continue (we don't want to loop forever).
    shouldContinue = false;
    clearKeptFragments(usages, fragments, minUsagesToOptimize);
    for (const name of mapKeys(usages)) {
      // Note that we modify `usages` as we iterate it, so 1) we use `mapKeys` above which copy into a list and 2)
      // we get the `count` manually instead of relying on (possibly outdated) entries.
      const count = usages.get(name)!;
      // A unused fragment is not technically expanded, it is just removed and we can ignore for now (it's count
      // count increase later but ...).
      if (count === 0) {
        continue;
      }

      // If we find a fragment to keep, it means some fragment we expanded earlier in this iteration bump this
      // one count. We unsure `shouldContinue` is set so `clearKeptFragments` is called again, but let that
      // method deal with it otherwise.
      if (count >= minUsagesToOptimize) {
        shouldContinue = true;
        break;
      }

      const fragmentsUsingName = reverseDependencies.get(name);
      if (!fragmentsUsingName || [...fragmentsUsingName].every((fragName) => toExpand.has(fragName) || !usages.get(fragName))) {
        // This fragment is not used enough, and is only used by fragments we keep, so we
        // are guaranteed that expanding another fragment will not increase its usage. So
        // we definitively expand it.
        toExpand.add(name);
        usages.delete(name);

        // We've added to `toExpand`, so it's worth redoing another iteration
        // after that to see if something changes.
        shouldContinue = true;

        // Now that we expand it, we should bump the usage for every fragment it uses.
        const nameUsages = fragments.get(name)!.fragmentUsages();
        for (const [otherName, otherCount] of nameUsages.entries()) {
          const prev = usages.get(otherName);
          // Note that if `otherName` is not part of usages, it means it's a fragment we
          // already decided to keep/expand, so we just ignore it.
          if (prev !== undefined) {
            usages.set(otherName, prev + count * otherCount);
          }
        }
      }
    }
  }

  // Finally, we know that to expand, which is `toExpand` plus whatever remains in `usage` (typically
  // genuinely unused fragments).
  for (const name of usages.keys()) {
    toExpand.add(name);
  }

  return toExpand.size === 0 ? fragments : fragments.filter((f) => !toExpand.has(f.name));
}

// TODO Operations can also have directives
export class Operation {
  constructor(
    readonly schema: Schema,
    readonly rootKind: SchemaRootKind,
    readonly selectionSet: SelectionSet,
    readonly variableDefinitions: VariableDefinitions,
    readonly fragments?: NamedFragments,
    readonly name?: string) {
  }

  // Returns a copy of this operation with the provided updated selection set. Optionally, a new set of fragments
  // can be also provided. If `newFragments` is undefined, then the existing fragments will be reused, but if it
  // `null`, then the new operation will have no fragments.
  private withUpdatedSelectionSet(newSelectionSet: SelectionSet, newFragments?: NamedFragments | null): Operation {
    const fragments = newFragments === undefined ? this.fragments : (newFragments ?? undefined);
    if (this.selectionSet === newSelectionSet && fragments === this.fragments) {
      return this;
    }

    return new Operation(
      this.schema,
      this.rootKind,
      newSelectionSet,
      this.variableDefinitions,
      fragments,
      this.name
    );
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

    const finalFragments = computeFragmentsToKeep(optimizedSelection, fragments, minUsagesToOptimize);

    // If there is fragment usages and we're not keeping all fragments, we need to expand fragments.
    if (finalFragments !== null && finalFragments?.size !== fragments.size) {
      // Note that optimizing all fragments to potentially re-expand some is not entirely optimal, but it's unclear
      // how to do otherwise, and it probably don't matter too much in practice (we only call this optimization
      // on the final computed query plan, so not a very hot path; plus in most cases we won't even reach that
      // point either because there is no fragment, or none will have been optimized away so we'll exit above).
      optimizedSelection = optimizedSelection.expandFragments(finalFragments);

      // Expanding fragments could create some "inefficiencies" that we wouldn't have if we hadn't re-optimized
      // the fragments to de-optimize it later, so we do a final "normalize" pass to remove those.
      optimizedSelection = optimizedSelection.normalize(optimizedSelection.parentType);
    }

    return this.withUpdatedSelectionSet(optimizedSelection, finalFragments);
  }

  expandAllFragments(): Operation {
    // We clear up the fragments since we've expanded all.
    // Also note that expanding fragment usually generate unecessary fragments/inefficient selections, so it
    // basically always make sense to normalize afterwards. Besides, fragment reuse (done by `optimize`) rely
    // on the fact that its input is normalized to work properly, so all the more reason to do it here.
    const expanded = this.selectionSet.expandFragments();
    return this.withUpdatedSelectionSet(expanded.normalize(expanded.parentType), null);
  }

  normalize(): Operation {
    return this.withUpdatedSelectionSet(this.selectionSet.normalize(this.selectionSet.parentType));
  }

  /**
   * Returns this operation but potentially modified so all/some of the @defer applications have been removed.
   *
   * @param labelsToRemove - If provided, then only the `@defer` applications with labels in the provided
   * set will be remove. Other `@defer` applications will be untouched. If `undefined`, then all `@defer`
   * applications are removed.
   */
  withoutDefer(labelsToRemove?: Set<string>): Operation {
    return this.withUpdatedSelectionSet(this.selectionSet.withoutDefer(labelsToRemove));
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
    const normalizer = new DeferNormalizer();
    const { hasDefers, hasNonLabelledOrConditionalDefers } = normalizer.init(this.selectionSet);
    let updatedOperation: Operation = this;
    if (hasNonLabelledOrConditionalDefers) {
      updatedOperation = this.withUpdatedSelectionSet(this.selectionSet.withNormalizedDefer(normalizer));
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
    return this.selectionSet.toOperationString(this.rootKind, this.variableDefinitions, this.fragments, this.name, expandFragments, prettyPrint);
  }
}

export type SelectionSetAtType = { selectionSet: SelectionSet, trimmed?: SelectionSet };

export class NamedFragmentDefinition extends DirectiveTargetElement<NamedFragmentDefinition> {
  private _selectionSet: SelectionSet | undefined;

  // Lazily computed cache of the expanded selection set.
  private _expandedSelectionSet: SelectionSet | undefined;

  private _fragmentUsages: Map<string, number> | undefined;
  private _includedFragmentNames: Set<string> | undefined;

  private readonly expandedSelectionSetsAtTypesCache = new Map<string, SelectionSetAtType>();

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
    // We set the selection set post-construction to simplify the handling of fragments that use other fragments,
    // but let's make sure we've properly used the fragment type condition as parent type of the selection set, as we should.
    assert(selectionSet.parentType === this.typeCondition, `Fragment selection set parent is ${selectionSet.parentType} differs from the fragment condition type ${this.typeCondition}`);
    this._selectionSet = selectionSet;
    return this;
  }

  get selectionSet(): SelectionSet {
    assert(this._selectionSet, () => `Trying to access fragment definition ${this.name} before it is fully built`);
    return this._selectionSet;
  }

  expandedSelectionSet(): SelectionSet {
    if (!this._expandedSelectionSet) {
      this._expandedSelectionSet = this.selectionSet.expandFragments().normalize(this.typeCondition);
    }
    return this._expandedSelectionSet;
  }

  withUpdatedSelectionSet(newSelectionSet: SelectionSet): NamedFragmentDefinition {
    return new NamedFragmentDefinition(this.schema(), this.name, this.typeCondition).setSelectionSet(newSelectionSet);
  }

  fragmentUsages(): ReadonlyMap<string, number> {
    if (!this._fragmentUsages) {
      this._fragmentUsages = new Map();
      this.selectionSet.collectUsedFragmentNames(this._fragmentUsages);
    }
    return this._fragmentUsages;
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    const usages = this.fragmentUsages();
    for (const [name, count] of usages.entries()) {
      const prevCount = collector.get(name);
      collector.set(name, prevCount ? prevCount + count : count);
    }
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
   * Whether this fragment may apply at the provided type, that is if either:
   *  - its type condition is equal to the provided type.
   *  - or the runtime types of the provided type include all of those of the fragment condition. 
   *
   * @param type - the type at which we're looking at applying the fragment
   */
  canApplyAtType(type: CompositeType): boolean {
    if (sameType(type, this.typeCondition)) {
      return true;
    }

    // No point computing runtime types if the condition is an object (it can never cover all of
    // the runtimes of `type` unless it's the same type, which is already covered).
    if (!isAbstractType(this.typeCondition)) {
      return false;
    }

    const conditionRuntimes = possibleRuntimeTypes(this.typeCondition);
    const typeRuntimes = possibleRuntimeTypes(type);

    // The fragment condition must be at least as general as the provided type (so that if we use the fragment
    // inside `type`, then it doesn't add restriction that weren't there without the fragment).
    // Note: the `length` test is technically redundant, but just avoid the more costly sub-set check if we
    // can cheaply show it's unnecessary.
    return conditionRuntimes.length >= typeRuntimes.length
     && typeRuntimes.every((t1) => conditionRuntimes.some((t2) => sameType(t1, t2)));
  }

  /**
   * This methods *assumes* that `this.canApplyAtType(type)` is `true` (and may crash if this is not true), and returns
   * a version fo this named fragment selection set that corresponds to the "expansion" of this named fragment at `type`
   *
   * The overall idea here is that if we have an interface I with 2 implementations T1 and T2, and we have a fragment like:
   * ```graphql
   *  fragment X on I {
   *    ... on T1 {
   *      <stuff>
   *    }
   *    ... on T2 {
   *      <stuff>
   *    }
   *  }
   * ```
   * then if the current type is `T1`, then all we care about matching for this fragment is the `... on T1` part, and this method gives
   * us that part.
   */
  expandedSelectionSetAtType(type: CompositeType): SelectionSetAtType {
    // First, if the candidate condition is an object or is the type passed, then there isn't anyrestriction to do.
    if (sameType(type, this.typeCondition) || isObjectType(this.typeCondition)) {
      return { selectionSet: this.expandedSelectionSet() };
    }

    let cached = this.expandedSelectionSetsAtTypesCache.get(type.name);
    if (!cached) {
      cached = this.computeExpandedSelectionSetAtType(type);
      this.expandedSelectionSetsAtTypesCache.set(type.name, cached);
    }
    return cached;
  }

  private computeExpandedSelectionSetAtType(type: CompositeType): SelectionSetAtType {
    const expandedSelectionSet = this.expandedSelectionSet();
    let selectionSet: SelectionSet;
    // There is 2 case where we can just call `normalize` on `type` directly:
    // 1. if `type` is an object: since `type` is a runtime of `typeCondition` then `typeCondition` is
    //   either an interface of `type` or a union containing it.
    // 2. if `typeCondition` is an union: that's because the only selections on a union are either `__typename`
    //   or some other condition that intersects the union. Both are also guaranteed to be ok for `type`
    //   since `type` intersects union.
    if (isObjectType(type) || isUnionType(this.typeCondition)) {
      // Note that what we want is get any simplification coming from normalizing at `type`, but any such simplication
      // stops as soon as we traverse a field, so no point in being recursive.
      selectionSet = expandedSelectionSet.normalize(type, { recursive: false });
    } else {
      // Otherwise, we just filter any top-level fragment that happens to not intersect with `type` runtimes.
      // Note that `normalize` also do this for the case above, but `normalize` also can sometimes simplify some
      // of the fragment that are kept, which don't apply here. And calling `normalize` would not be valid because
      // one of its effect is to "rebase" on `type` which may be invalid here. Namely, we could have `type === I1`
      // and the fragment be: `fragment X on I2 { f }`, and even having `runtimes(I1)` included in `runtimes(I2)`
      // does not mean that `f` if a valid field for `I1`.
      const typeRuntimes = possibleRuntimeTypes(type);
      const conditionRuntimes = possibleRuntimeTypes(this.typeCondition);
      selectionSet = typeRuntimes.length === conditionRuntimes.length
        ? expandedSelectionSet
        : expandedSelectionSet.filter((s) =>
          s.kind !== 'FragmentSelection' || !s.element.typeCondition || typeRuntimes.some((t) => t.name == s.element.typeCondition?.name)
        );
    }

    const trimmed = expandedSelectionSet.minus(selectionSet);
    return { selectionSet, trimmed : trimmed.isEmpty() ? undefined: trimmed };
  }

  /**
   * Whether this fragment fully includes `otherFragment`.
   * Note that this is slightly different from `this` "using" `otherFragment` in that this essentially checks
   * if the full selection set of `otherFragment` is contained by `this`, so this only look at "top-level" usages.
   *
   * Note that this is guaranteed to return `false` if passed `this` name.
   */
  includes(otherFragment: string): boolean {
    if (this.name === otherFragment) {
      return false;
    }

    if (!this._includedFragmentNames) {
      this._includedFragmentNames = this.computeIncludedFragmentNames();
    }
    return this._includedFragmentNames.has(otherFragment);
  }

  private computeIncludedFragmentNames(): Set<string> {
    const included = new Set<string>();
    for (const selection of this.selectionSet.selections()) {
      if (selection instanceof FragmentSpreadSelection) {
        included.add(selection.namedFragment.name);
      }
    }
    return included;
  }

  toString(indent?: string): string {
    return (indent ?? '') + `fragment ${this.name} on ${this.typeCondition}${this.appliedDirectivesToString()} ${this.selectionSet.toString(false, true, indent)}`;
  }
}


export class NamedFragments {
  private readonly fragments = new MapWithCachedArrays<string, NamedFragmentDefinition>();

  isEmpty(): boolean {
    return this.size === 0;
  }

  get size(): number {
    return this.fragments.size;
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

  /**
   * The mapper is called on every fragment definition (`fragment` argument), but in such a way that if a fragment A uses another fragment B,
   * then the mapper is guaranteed to be called on B _before_ being called on A. Further, the `newFragments` argument is a new `NamedFragments`
   * containing all the previously mapped definition (minus those for which the mapper returned `undefined`). So if A uses B (and the mapper
   * on B do not return undefined), then when mapper is called on A `newFragments` will have the mapped value for B.
   */
  mapInDependencyOrder(
    mapper: (fragment: NamedFragmentDefinition, newFragments: NamedFragments) => NamedFragmentDefinition | undefined
  ): NamedFragments | undefined {
    type FragmentDependencies = {
      fragment: NamedFragmentDefinition,
      dependsOn: string[],
    };
    const fragmentsMap = new Map<string, FragmentDependencies>();
    for (const fragment of this.definitions()) {
      fragmentsMap.set(fragment.name, {
        fragment,
        dependsOn: Array.from(fragment.fragmentUsages().keys()),
      });
    }

    const removedFragments = new Set<string>();
    const mappedFragments = new NamedFragments();
    while (fragmentsMap.size > 0) {
      for (const [name, info] of fragmentsMap) {
        // Note that graphQL specifies that named fragments cannot have cycles (https://spec.graphql.org/draft/#sec-Fragment-spreads-must-not-form-cycles)
        // and so we're guaranteed that on every iteration, at least one element of the map is removed (so the `while` loop will terminate).
        if (info.dependsOn.every((n) => mappedFragments.has(n) || removedFragments.has(n))) {
          const mapped = mapper(info.fragment, mappedFragments);
          fragmentsMap.delete(name);
          if (!mapped) {
            removedFragments.add(name);
          } else {
            mappedFragments.add(mapped);
          }
          // We just deleted from `fragmentsMap` so continuing our current `for` iteration is dangerous,
          // so we break to the `while` loop (besides, there is no reason why continuing the inner iteration
          // would be better than restarting it right away).
          break;
        }
      }
    }

    return mappedFragments.isEmpty() ? undefined : mappedFragments;
  }

  /**
   * This method:
   * - expands all nested fragments,
   * - applies the provided mapper to the selection set of the fragments,
   * - and finally re-fragments the nested fragments.
   */
  mapToExpandedSelectionSets(
    mapper: (selectionSet: SelectionSet) => SelectionSet | undefined,
  ): NamedFragments | undefined {
    return this.mapInDependencyOrder((fragment, newFragments) => {
      const mappedSelectionSet = mapper(fragment.selectionSet.expandFragments().normalize(fragment.typeCondition));
      if (!mappedSelectionSet) {
        return undefined;
      }
      const reoptimizedSelectionSet = mappedSelectionSet.optimize(newFragments);
      return fragment.withUpdatedSelectionSet(reoptimizedSelectionSet);
    });
  }

  rebaseOn(schema: Schema): NamedFragments | undefined {
    return this.mapInDependencyOrder((fragment, newFragments) => {
      const rebasedType = schema.type(fragment.selectionSet.parentType.name);
      try {
        if (!rebasedType || !isCompositeType(rebasedType)) {
          return undefined;
        }

        const rebasedSelection = fragment.selectionSet.rebaseOn(rebasedType, newFragments);
        return new NamedFragmentDefinition(schema, fragment.name, rebasedType).setSelectionSet(rebasedSelection);
      } catch (e) {
        // This means we cannot rebase this selection on the schema and thus cannot reuse that fragment on that
        // particular schema.
        return undefined;
      }
    });
  }

  filter(predicate: (fragment: NamedFragmentDefinition) => boolean): NamedFragments | undefined {
    return this.mapInDependencyOrder((fragment, newFragments) => {
      if (predicate(fragment)) {
        // We want to keep that fragment. But that fragment might use a fragment we remove, and if so,
        // we need to expand that removed fragment. Note that because we're running in
        // dependency order, we know that `newFragments` will have every fragments that should be
        // kept/not expanded.
        const updatedSelectionSet = fragment.selectionSet.expandFragments(newFragments);
        return updatedSelectionSet === fragment.selectionSet
          ? fragment
          : fragment.withUpdatedSelectionSet(updatedSelectionSet);
      } else {
        return undefined;
      }
    });
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

export enum ContainsResult {
  // Note: enum values are numbers in the end, and 0 means false in JS, so we should keep `NOT_CONTAINED` first 
  // so that using the result of `contains` as a boolean works.
  NOT_CONTAINED,
  STRICTLY_CONTAINED,
  EQUAL,
}

export class SelectionSet {
  private readonly _keyedSelections: Map<string, Selection>;
  private readonly _selections: readonly Selection[];

  constructor(
    readonly parentType: CompositeType,
    keyedSelections: Map<string, Selection> = new Map(),
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

  fieldsByResponseName(): MultiMap<string, FieldSelection> {
    const byResponseName = new MultiMap<string, FieldSelection>();
    this.collectFieldsByResponseName(byResponseName);
    return byResponseName;
  }

  private collectFieldsByResponseName(collector: MultiMap<string, FieldSelection>) {
    for (const selection of this.selections()) {
      if (selection.kind === 'FieldSelection') {
        collector.add(selection.element.responseName(), selection);
      } else {
        selection.selectionSet.collectFieldsByResponseName(collector);
      }
    }
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

    // Calling optimizeSelections() will not match a fragment that would have expanded at top-level.
    // That is, say we have the selection set `{ x y }` for a top-level `Query`, and we have a fragment
    // ```
    // fragment F on Query {
    //   x
    //   y
    // }
    // ```
    // then calling `this.optimizeSelections(fragments)` would only apply check if F apply to `x` and
    // then `y`.
    //
    // To ensure the fragment match in this case, we "wrap" the selection into a trivial fragment of
    // the selection parent, so in the example above, we create selection `... on Query { x y}`.
    // With that, `optimizeSelections` will correctly match on the `on Query` fragment; after which
    // we can unpack the final result.
    const wrapped = new InlineFragmentSelection(new FragmentElement(this.parentType, this.parentType), this);
    const optimized = wrapped.optimize(fragments);

    // Now, it's possible we matched a full fragment, in which case `optimized` will be just the named fragment,
    // and in that case we return a singleton selection with just that. Otherwise, it's our wrapping inline fragment
    // with the sub-selections optimized, and we just return that subselection.
    return optimized instanceof FragmentSpreadSelection
      ? selectionSetOf(this.parentType, optimized)
      : optimized.selectionSet;
  }

  // Tries to match fragments inside each selections of this selection set, and this recursively. However, note that this
  // may not match fragments that would apply at top-level, so you should usually use `optimize` instead (this exists mostly
  // for the recursion).
  optimizeSelections(fragments: NamedFragments): SelectionSet {
    return this.lazyMap((selection) => selection.optimize(fragments));
  }

  expandFragments(updatedFragments?: NamedFragments): SelectionSet {
    return this.lazyMap((selection) => selection.expandFragments(updatedFragments));
  }

  /**
   * Applies some normalization rules to this selection set in the context of the provided `parentType`. 
   *
   * Normalization mostly removes unecessary/redundant inline fragments, so that for instance, with
   * schema:
   * ```graphql
   *   type Query {
   *     t1: T1
   *     i: I
   *   }
   *
   *   interface I {
   *     id: ID!
   *   }
   *
   *   type T1 implements I {
   *     id: ID!
   *     v1: Int
   *   }
   *
   *   type T2 implements I {
   *     id: ID!
   *     v2: Int
   *   }
   * ```
   *
   * ```
   * normalize({
   *   t1 {
   *     ... on I {
   *       id
   *     }
   *   }
   *   i {
   *     ... on T1 {
   *       ... on I {
   *          ... on T1 {
   *            v1
   *          }
   *          ... on T2 {
   *            v2
   *          }
   *       }
   *     }
   *     ... on T2 {
   *       ... on I {
   *         id
   *       }
   *     }
   *   }
   * }) === {
   *   t1 {
   *     id
   *   }
   *   i {
   *     ... on T1 {
   *       v1
   *     }
   *     ... on T2 {
   *       id
   *     }
   *   }
   * }
   * ```
   *
   * For this operation to be valid (to not throw), `parentType` must be such this selection set would
   * be valid as a subselection of an inline fragment `... on parentType { <this selection set> }` (and
   * so `this.normalize(this.parentType)` is always valid and useful, but it is possible to pass a `parentType`
   * that is more "restrictive" than the selection current parent type).
   *
   * Passing the option `recursive == false` makes the normalization only apply at the top-level, removing
   * any unecessary top-level inline fragments, possibly multiple layers of them, but we never recurse
   * inside the sub-selection of an selection that is not removed by the normalization.
   */
  normalize(parentType: CompositeType, options?: { recursive? : boolean }): SelectionSet {
    return this.lazyMap((selection) => selection.normalize(parentType, options), { parentType });
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
      parentType?: CompositeType,
    }
  ): SelectionSet {
    const selections = this.selections();
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
      return this;
    }
    return updatedSelections.toSelectionSet(options?.parentType ?? this.parentType);
  }

  withoutDefer(labelsToRemove?: Set<string>): SelectionSet {
    return this.lazyMap((selection) => selection.withoutDefer(labelsToRemove));
  }

  withNormalizedDefer(normalizer: DeferNormalizer): SelectionSet {
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

  rebaseOn(parentType: CompositeType, fragments: NamedFragments | undefined): SelectionSet {
    if (this.parentType === parentType) {
      return this;
    }

    const newSelections = new Map<string, Selection>();
    for (const selection of this.selections()) {
      newSelections.set(selection.key(), selection.rebaseOn(parentType, fragments));
    }

    return new SelectionSet(parentType, newSelections);
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

  contains(that: SelectionSet): ContainsResult {
    if (that._selections.length > this._selections.length) {
      return ContainsResult.NOT_CONTAINED;
    }

    let isEqual = true;
    for (const [key, thatSelection] of that._keyedSelections) {
      const thisSelection = this._keyedSelections.get(key);
      const selectionResult = thisSelection?.contains(thatSelection);
      if (selectionResult === undefined || selectionResult === ContainsResult.NOT_CONTAINED) {
        return ContainsResult.NOT_CONTAINED;
      }
      isEqual &&= selectionResult === ContainsResult.EQUAL;
    }

    return isEqual && that._selections.length === this._selections.length
      ? ContainsResult.EQUAL
      : ContainsResult.STRICTLY_CONTAINED;
  }

  /**
   * Returns a selection set that correspond to this selection set but where any of the selections in the
   * provided selection set have been remove.
   */
  minus(that: SelectionSet): SelectionSet {
    const updated = new SelectionSetUpdates();

    for (const [key, thisSelection] of this._keyedSelections) {
      const thatSelection = that._keyedSelections.get(key);
      if (thatSelection) {
        const remainder = thisSelection.minus(thatSelection);
        if (remainder) {
          updated.add(remainder);
        }
      } else {
        updated.add(thisSelection);
      }
    }
    return updated.toSelectionSet(this.parentType);
  }

  intersectionWith(that: SelectionSet): SelectionSet {
    if (this.isEmpty()) {
      return this;
    }
    if (that.isEmpty()) {
      return that;
    }

    const intersection = new SelectionSetUpdates();
    for (const [key, thisSelection] of this._keyedSelections) {
      const thatSelection = that._keyedSelections.get(key);
      if (thatSelection) {
        const selection = thisSelection.intersectionWith(thatSelection);
        if (selection) {
          intersection.add(selection);
        }
      }
    }

    return intersection.toSelectionSet(this.parentType);
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
    fragments: NamedFragments | undefined,
    operationName?: string,
    expandFragments: boolean = false,
    prettyPrint: boolean = true
  ): string {
    const indent = prettyPrint ? '' : undefined;
    const fragmentsDefinitions = !expandFragments && fragments && !fragments.isEmpty()
      ? fragments.toString(indent) + "\n\n"
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

  toString() {
    return '{\n'
      + [...this.keyedUpdates.entries()].map(([k, updates]) => {
        const updStr = updates.map((upd) =>
        upd instanceof AbstractSelection
          ? upd.toString()
          : `${upd.path} -> ${upd.selections}`
        );
        return ` - ${k}: ${updStr}`;
      }).join('\n')
      +'\n\}'
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

function maybeRebaseOnSchema(toRebase: CompositeType, schema: Schema): CompositeType {
  if (toRebase.schema() === schema) {
    return toRebase;
  }

  const rebased = schema.type(toRebase.name);
  assert(rebased && isCompositeType(rebased), () => `Expected ${toRebase} to exists and be composite in the rebased schema, but got ${rebased?.kind}`);
  return rebased;
}

function isUnecessaryFragment(parentType: CompositeType, fragment: FragmentSelection): boolean {
  return fragment.element.appliedDirectives.length === 0
    && (!fragment.element.typeCondition || isSubtype(maybeRebaseOnSchema(fragment.element.typeCondition, parentType.schema()), parentType));
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
    return first.rebaseOn(parentType, fragments);
  }

  const element = updateElement(first).rebaseOn(parentType);
  const subSelectionParentType = element.kind === 'Field' ? element.baseType() : element.castedType();
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
  return new SelectionSet(parentType, selections);
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

export function selectionSetOf(parentType: CompositeType, selection: Selection): SelectionSet {
  const map = new Map<string, Selection>()
  map.set(selection.key(), selection);
  return new SelectionSet(parentType, map);
}

export function selectionSetOfElement(element: OperationElement, subSelection?: SelectionSet): SelectionSet {
  return selectionSetOf(element.parentType, selectionOfElement(element, subSelection));
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

  abstract rebaseOn(parentType: CompositeType, fragments: NamedFragments | undefined): TOwnType;

  get parentType(): CompositeType {
    return this.element.parentType;
  }

  isTypenameField(): boolean {
    // Overridden where appropriate
    return false;
  }

  collectVariables(collector: VariableCollector) {
    this.element.collectVariables(collector);
    this.selectionSet?.collectVariables(collector)
  }

  collectUsedFragmentNames(collector: Map<string, number>) {
    this.selectionSet?.collectUsedFragmentNames(collector);
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

  abstract expandFragments(updatedFragments: NamedFragments | undefined): TOwnType | readonly Selection[];

  abstract normalize(parentType: CompositeType, options?: { recursive? : boolean }): TOwnType | SelectionSet | undefined;

  isFragmentSpread(): boolean {
    return false;
  }

  minus(that: Selection): TOwnType | undefined {
    // If there is a subset, then we compute the diff of the subset and add that (if not empty).
    // Otherwise, we have no diff.
    if (this.selectionSet && that.selectionSet) {
      const updatedSubSelectionSet = this.selectionSet.minus(that.selectionSet);
      if (!updatedSubSelectionSet.isEmpty()) {
        return this.withUpdatedSelectionSet(updatedSubSelectionSet);
      }
    }
    return undefined;
  }

  intersectionWith(that: Selection): TOwnType | undefined {
    // If there is a subset, then we compute the intersection add that (if not empty).
    // Otherwise, the intersection is this element.
    if (this.selectionSet && that.selectionSet) {
      const subSelectionSetIntersection = this.selectionSet.intersectionWith(that.selectionSet);
      if (subSelectionSetIntersection.isEmpty()) {
        return undefined;
      } else {
        return this.withUpdatedSelectionSet(subSelectionSetIntersection);
      }
    } else {
      return this.us();
    }
  }

  protected tryOptimizeSubselectionWithFragments({
    parentType,
    subSelection,
    fragments,
    canUseFullMatchingFragment,
  }: {
    parentType: CompositeType,
    subSelection: SelectionSet,
    fragments: NamedFragments,
    canUseFullMatchingFragment: (match: NamedFragmentDefinition) => boolean,
  }): SelectionSet | NamedFragmentDefinition {
    let candidates = fragments.maybeApplyingAtType(parentType);

    // First, we check which of the candidates do apply inside `subSelection`, if any.
    // If we find a candidate that applies to the whole `subSelection`, then we stop and only return
    // that one candidate. Otherwise, we cumulate in `applyingFragments` the list of fragments that
    // applies to a subset of `subSelection`.
    const applyingFragments: { fragment: NamedFragmentDefinition, atType: SelectionSetAtType }[] = [];
    for (const candidate of candidates) {
      const atType = candidate.expandedSelectionSetAtType(parentType);
      const selectionSetAtType = atType.selectionSet;
      // It's possible that while the fragment technically applies at `parentType`, it's "rebasing" on
      // `parentType` is empty, or contains only `__typename`. For instance, suppose we have
      // a union `U = A | B | C`, and then a fragment:
      // ```graphql
      //   fragment F on U {
      //     ... on A {
      //       x
      //     }
      //     ... on b {
      //       y
      //     }
      //   }
      // ```
      // It is then possible to apply `F` when the parent type is `C`, but this ends up selecting
      // nothing at all.
      //
      // Using `F` in those cases is, while not 100% incorrect, at least not productive, and so we
      // skip it that case. This is essentially an optimisation.
      if (selectionSetAtType.isEmpty() || (selectionSetAtType.selections().length === 1 && selectionSetAtType.selections()[0].isTypenameField())) {
        continue;
      }

      const res = subSelection.contains(selectionSetAtType);

      if (res === ContainsResult.EQUAL) {
        if (canUseFullMatchingFragment(candidate)) {
          return candidate;
        }
        // If we're not going to replace the full thing, then same reasoning a below.
        if (candidate.appliedDirectives.length === 0) {
          applyingFragments.push({ fragment: candidate, atType});
        }
      // Note that if a fragment applies to only a subset of the subSelection, then we really only can use
      // it if that fragment is defined _without_ directives.
      } else if (res === ContainsResult.STRICTLY_CONTAINED && candidate.appliedDirectives.length === 0) {
        applyingFragments.push({ fragment: candidate, atType });
      }
    }

    if (applyingFragments.length === 0) {
      return subSelection;
    }

    // We have found the list of fragments that applies to some subset of `subSelection`. In general, we
    // want to now produce the selection set with spread for those fragments plus any selection that is not
    // covered by any of the fragments. For instance, suppose that `subselection` is `{ a b c d e }`
    // and we have found that `fragment F1 on X { a b c }` and `fragment F2 on X { c d }` applies, then
    // we will generate `{ ...F1 ...F2 e }`.
    //
    // In that example, `c` is covered by both fragments. And this is fine in this example as it is
    // worth using both fragments in general. A special case of this however is if a fragment is entirely
    // included into another. That is, consider that we now have `fragment F1 on X { a ...F2 }` and
    // `fragment F2 on X { b c }`. In that case, the code above would still match both `F1 and `F2`,
    // but as `F1` includes `F2` already, we really want to only use `F1`. So in practice, we filter
    // away any fragment spread that is known to be included in another one that applies.
    //
    // TODO: note that the logic used for this is theoretically a bit sub-optimial. That is, we only
    // check if one of the fragment happens to directly include a spread for another fragment at
    // top-level as in the example above. We do this because it is cheap to check and is likely the
    // most common case of this kind of inclusion. But in theory, we would have
    // `fragment F1 on X { a b c }` and `fragment F2 on X { b c }`, in which case `F2` is still
    // included in `F1`, but we'd have to work harder to figure this out and it's unclear it's
    // a good tradeoff. And while you could argue that it's on the user to define its fragments
    // a bit more optimally, it's actually a tad more complex because we're looking at fragments
    // in a particular context/parent type. Consider an interface `I` and:
    // ```graphql
    //   fragment F3 on I {
    //     ... on X {
    //       a
    //     }
    //     ... on Y {
    //       b
    //       c
    //     }
    //   }
    //
    //   fragment F4 on I {
    //     ... on Y {
    //       c
    //     }
    //     ... on Z {
    //       d
    //     }
    //   }
    // ```
    // In that case, neither fragment include the other per-se. But what if we have sub-selection
    // `{ b c }` but where parent type is `Y`. In that case, both `F3` and `F4` applies, and in that
    // particular context, `F3` is fully included in `F4`. Long story short, we'll currently
    // return `{ ...F3 ...F4 }` in that case, but it would be technically better to return only `F4`.
    // However, this feels niche, and it might be costly to verify such inclusions, so not doing it
    // for now.
    const filteredApplyingFragments = applyingFragments.filter(({ fragment }) => !applyingFragments.some((o) => o.fragment.includes(fragment.name)))

    let notCoveredByFragments = subSelection;
    const optimized = new SelectionSetUpdates();
    for (const { fragment, atType} of filteredApplyingFragments) {
      const notCovered = subSelection.minus(atType.selectionSet);
      if (atType.trimmed && !selectionSetsDoMerge(notCovered, atType.trimmed)) {
        continue;
      }
      notCoveredByFragments = notCoveredByFragments.intersectionWith(notCovered);
      optimized.add(new FragmentSpreadSelection(parentType, fragments, fragment, []));
    }

    return optimized.add(notCoveredByFragments).toSelectionSet(parentType, fragments)
  }
}

function selectionSetsDoMerge(s1: SelectionSet, s2: SelectionSet): boolean {
  const byResponseName1 = s1.fieldsByResponseName();
  const byResponseName2 = s2.fieldsByResponseName();

  for (const [responseName, selections1] of byResponseName1.entries()) {
    const selections2 = byResponseName2.get(responseName);
    if (!selections2) {
      // No possible conflict on this response name to check.
      continue;
    }

    // We're basically checking [FieldInSetCanMerge](https://spec.graphql.org/draft/#FieldsInSetCanMerge()),
    // but were we know the selections in `selection1` (resp. in `selection2`) do merge together, so
    // we only check for non-merging between a selection of `selection1` and one of `selection2`.
    for (const selection1 of selections1) {
      for (const selection2 of selections2) {
        if (!fieldsCanMerge(selection1, selection2)) {
          return false;
        }
      }
    }
  }
  return true;
}

function fieldsCanMerge(selection1: FieldSelection, selection2: FieldSelection): boolean {
  const f1 = selection1.element;
  const f2 = selection2.element;
  // The `SameResponseShape` test that all fields must pass.
  if (!typesCanBeMerged(f1.definition.type!, f2.definition.type!)) {
    return false;
  }

  // Additional checks of `FieldsInSetCanMerge` when same parent type or one isn't object
  const p1 = f1.parentType;
  const p2 = f2.parentType;
  if (sameType(p1, p2) || !isObjectType(p1) || !isObjectType(p2)) {
    return f1.name === f2.name
      && (f1.args ? !!f2.args && argumentsEquals(f1.args, f2.args) : !f2.args)
      && (!selection1.selectionSet || !selection2.selectionSet || selectionSetsDoMerge(selection1.selectionSet, selection2.selectionSet));
  } else if (selection1.selectionSet && selection2.selectionSet) {
    return sameResponseShape(selection1.selectionSet, selection2.selectionSet);
  } else {
    return true;
  }
}

function sameResponseShape(s1: SelectionSet, s2: SelectionSet): boolean {
  const byResponseName1 = s1.fieldsByResponseName();
  const byResponseName2 = s2.fieldsByResponseName();

  for (const [responseName, selections1] of byResponseName1.entries()) {
    const selections2 = byResponseName2.get(responseName);
    if (!selections2) {
      // No possible conflict on this response name to check.
      continue;
    }

    for (const selection1 of selections1) {
      for (const selection2 of selections2) {
        if (!typesCanBeMerged(selection1.element.definition.type!, selection2.element.definition.type!)
          || (selection1.selectionSet && selection2.selectionSet && !sameResponseShape(selection1.selectionSet, selection2.selectionSet))) {
          return false;
        }
      }
    }
  }
  return true;
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

  isTypenameField(): boolean {
    return this.element.definition.name === typenameFieldName;
  }

  withUpdatedComponents(field: Field<any>, selectionSet: SelectionSet | undefined): FieldSelection {
    if (this.element === field && this.selectionSet === selectionSet) {
      return this;
    }
    return new FieldSelection(field, selectionSet);
  }

  key(): string {
    return this.element.key();
  }

  optimize(fragments: NamedFragments): Selection {
    const fieldBaseType = baseType(this.element.definition.type!);
    if (!isCompositeType(fieldBaseType) || !this.selectionSet) {
      return this;
    }

    // First, see if we can reuse fragments for the selection of this field.
    let optimizedSelection = this.selectionSet;
    if (isCompositeType(fieldBaseType) && this.selectionSet) {
      const optimized = this.tryOptimizeSubselectionWithFragments({
        parentType: fieldBaseType,
        subSelection: this.selectionSet,
        fragments,
        // We can never apply a fragments that has directives on it at the field level.
        canUseFullMatchingFragment: (fragment) => fragment.appliedDirectives.length === 0,
      });

      if (optimized instanceof NamedFragmentDefinition) {
        optimizedSelection = selectionSetOf(fieldBaseType, new FragmentSpreadSelection(fieldBaseType, fragments, optimized, []));
      } else {
        optimizedSelection = optimized;
      }
    }

    // Then, recurse inside the field sub-selection (note that if we matched some fragments above,
    // this recursion will "ignore" those as `FragmentSpreadSelection.optimize()` is a no-op).
    optimizedSelection = optimizedSelection.optimizeSelections(fragments);

    return this.selectionSet === optimizedSelection
      ? this
      : this.withUpdatedSelectionSet(optimizedSelection);
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
  rebaseOn(parentType: CompositeType, fragments: NamedFragments | undefined): FieldSelection {
    if (this.element.parentType === parentType) {
      return this;
    }

    const rebasedElement = this.element.rebaseOn(parentType);
    if (!this.selectionSet) {
      return this.withUpdatedElement(rebasedElement);
    }

    const rebasedBase = rebasedElement.baseType();
    if (rebasedBase === this.selectionSet.parentType) {
      return this.withUpdatedElement(rebasedElement);
    }

    validate(isCompositeType(rebasedBase), () => `Cannot rebase field selection ${this} on ${parentType}: rebased field base return type ${rebasedBase} is not composite`);
    return this.withUpdatedComponents(rebasedElement, this.selectionSet.rebaseOn(rebasedBase, fragments));
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

  normalize(parentType: CompositeType, options?: { recursive? : boolean }): FieldSelection {
    // This could be an interface field, and if we're normalizing on one of the implementation of that
    // interface, we want to make sure we use the field of the implementation, as it may in particular
    // have a more specific type which should propagate to the recursive call to normalize.

    const definition = parentType === this.parentType
      ? this.element.definition
      : parentType.field(this.element.name);
    assert(definition, `Cannot normalize ${this.element} at ${parentType} which does not have that field`)

    const element = this.element.definition === definition ? this.element : this.element.withUpdatedDefinition(definition);
    if (!this.selectionSet) {
      return this.withUpdatedElement(element);
    }

    const base = element.baseType();
    assert(isCompositeType(base), () => `Field ${element} should not have a sub-selection`);
    const normalizedSubSelection = (options?.recursive ?? true) ? this.selectionSet.normalize(base) : this.selectionSet;
    // In rare caes, it's possible that everything in the sub-selection was trimmed away and so the
    // sub-selection is empty. Which suggest something may be wrong with this part of the query
    // intent, but the query was valid while keeping an empty sub-selection isn't. So in that
    // case, we just add some "non-included" __typename field just to keep the query valid.
    if (normalizedSubSelection?.isEmpty()) {
      return this.withUpdatedComponents(
        element,
        selectionSetOfElement(
          new Field(
            base.typenameField()!,
            undefined,
            [new Directive('include', { 'if': false })],
          )
        )
      );
    } else {
      return this.withUpdatedComponents(element, normalizedSubSelection);
    }
  }

  expandFragments(updatedFragments?: NamedFragments): FieldSelection {
    return this.mapToSelectionSet((s) => s.expandFragments(updatedFragments));
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

  contains(that: Selection): ContainsResult {
    if (!(that instanceof FieldSelection) || !this.element.equals(that.element)) {
      return ContainsResult.NOT_CONTAINED;
    }

    if (!this.selectionSet) {
      assert(!that.selectionSet, '`this` and `that` have the same element, so if one does not have a sub-selection, neither should the other one')
      return ContainsResult.EQUAL;
    }
    assert(that.selectionSet, '`this` and `that` have the same element, so if one has sub-selection, the other one should too')
    return this.selectionSet.contains(that.selectionSet);
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

  abstract equals(that: Selection): boolean;

  abstract contains(that: Selection): ContainsResult;
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
    if (fragment === this.element && selectionSet === this.selectionSet) {
      return this;
    }
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

  rebaseOn(parentType: CompositeType, fragments: NamedFragments | undefined): FragmentSelection {
    if (this.parentType === parentType) {
      return this;
    }

    const rebasedFragment = this.element.rebaseOn(parentType);
    const rebasedCastedType = rebasedFragment.castedType();
    if (rebasedCastedType === this.selectionSet.parentType) {
      return this.withUpdatedElement(rebasedFragment);
    }

    return this.withUpdatedComponents(rebasedFragment, this.selectionSet.rebaseOn(rebasedCastedType, fragments));
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
    let optimizedSelection = this.selectionSet;

    // First, see if we can reuse fragments for the selection of this field.
    const typeCondition = this.element.typeCondition;
    if (typeCondition) {
      const optimized = this.tryOptimizeSubselectionWithFragments({
        parentType: typeCondition,
        subSelection: optimizedSelection,
        fragments,
        canUseFullMatchingFragment: (fragment) => {
          // To be able to use a matching fragment, it needs to have either no directives, or if it has
          // some, then:
          //  1. all it's directives should also be on the current element.
          //  2. the directives of this element should be the fragment condition.
          // because if those 2 conditions are true, we can replace the whole current inline fragment
          // with the match spread and directives will still match.
          return fragment.appliedDirectives.length === 0
            || (
              sameType(typeCondition, fragment.typeCondition)
                && fragment.appliedDirectives.every((d) => this.element.appliedDirectives.some((s) => sameDirectiveApplication(d, s)))
            );
        },
      });

      if (optimized instanceof NamedFragmentDefinition) {
        // We're fully matching the sub-selection. If the fragment condition is also this element condition,
        // then we can replace the whole element by the spread (not just the sub-selection).
        if (sameType(typeCondition, optimized.typeCondition)) {
          // Note that `canUseFullMatchingFragment` above guarantees us that this element directives
          // are a superset of the fragment directives. But there can be additional directives, and in
          // that case they should be kept on the spread.
          let spreadDirectives = this.element.appliedDirectives;
          if (optimized.appliedDirectives) {
            spreadDirectives = spreadDirectives.filter(
              (s) => !optimized.appliedDirectives.some((d) => sameDirectiveApplication(d, s))
            );
          }
          return new FragmentSpreadSelection(this.parentType, fragments, optimized, spreadDirectives);
        } else {
          // Otherwise, we keep this element and use a sub-selection with just the spread.
          optimizedSelection = selectionSetOf(typeCondition, new FragmentSpreadSelection(typeCondition, fragments, optimized, []));
        }
      } else {
        optimizedSelection = optimized;
      }
    }

    // Then, recurse inside the field sub-selection (note that if we matched some fragments above,
    // this recursion will "ignore" those as `FragmentSpreadSelection.optimize()` is a no-op).
    optimizedSelection = optimizedSelection.optimizeSelections(fragments);

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

  normalize(parentType: CompositeType, options?: { recursive? : boolean }): FragmentSelection | SelectionSet | undefined {
    const recursive = options?.recursive ?? true;
    const thisCondition = this.element.typeCondition;

    // This method assumes by contract that `currentType` runtimes intersects `this.parentType`'s, but `currentType`
    // runtimes may be a subset. So first check if the selection should not be discarded on that account (that
    // is, we should not keep the selection if its condition runtimes don't intersect at all with those of
    // `currentType` as that would ultimately make an invalid selection set).
    if (thisCondition && parentType !== this.parentType) {
      const conditionRuntimes = possibleRuntimeTypes(thisCondition);
      const typeRuntimes = possibleRuntimeTypes(parentType);
      if (!conditionRuntimes.some((t) => typeRuntimes.includes(t))) {
        return undefined;
      }
    }

    // We know the condition is "valid", but it may not be useful. That said, if the condition has directives,
    // we preserve the fragment no matter what.
    if (this.element.appliedDirectives.length === 0) {
      // There is a number of cases where a fragment is not useful:
      // 1. if there is not conditions (remember it also has no directives).
      // 2. if it's the same type as the current type: it's not restricting types further.
      // 3. if the current type is an object more generally: because in that case too the condition
      //   cannot be restricting things further (it's typically a less precise interface/union).
      if (!thisCondition || parentType === this.element.typeCondition || isObjectType(parentType)) {
        const normalized = this.selectionSet.normalize(parentType, options);
        return normalized.isEmpty() ? undefined : normalized;
      }
    }

    // As we preserve the current fragment, the rest is about recursing. If we don't recurse, we're done
    if (!recursive) {
      return this;
    }

    // In all other cases, we recurse on the sub-selection.
    const normalizedSelectionSet = this.selectionSet.normalize(thisCondition ?? parentType);

    // First, could be that everything was unsatisfiable.
    if (normalizedSelectionSet.isEmpty()) {
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
      assert(!isObjectType(parentType), () => `Should not have got here if ${parentType} is an object type`);
      const currentRuntimes = possibleRuntimeTypes(parentType);
      const liftableSelections: Selection[] = [];
      for (const selection of normalizedSelectionSet.selections()) {
        if (selection.kind === 'FragmentSelection'
          && selection.element.typeCondition
          && isObjectType(selection.element.typeCondition)
          && currentRuntimes.includes(selection.element.typeCondition)
        ) {
          liftableSelections.push(selection);
        }
      }

      // If we can lift all selections, then that just mean we can get rid of the current fragment altogether
      if (liftableSelections.length === normalizedSelectionSet.selections().length) {
        return normalizedSelectionSet;
      }

      // Otherwise, if there is "liftable" selections, we must return a set comprised of those lifted selection,
      // and the current fragment _without_ those lifted selections.
      if (liftableSelections.length > 0) {
        const newSet = new SelectionSetUpdates();
        newSet.add(liftableSelections);
        newSet.add(this.withUpdatedSelectionSet(
          normalizedSelectionSet.filter((s) => !liftableSelections.includes(s)),
        ));
        return newSet.toSelectionSet(this.parentType);
      }
    }

    return this.selectionSet === normalizedSelectionSet ? this : this.withUpdatedSelectionSet(normalizedSelectionSet);
  }

  expandFragments(updatedFragments: NamedFragments | undefined): FragmentSelection {
    return this.mapToSelectionSet((s) => s.expandFragments(updatedFragments));
  }

  equals(that: Selection): boolean {
    if (this === that) {
      return true;
    }

    return (that instanceof FragmentSelection)
      && this.element.equals(that.element)
      && this.selectionSet.equals(that.selectionSet);
  }

  contains(that: Selection): ContainsResult {
    if (!(that instanceof FragmentSelection) || !this.element.equals(that.element)) {
      return ContainsResult.NOT_CONTAINED;
    }

    return this.selectionSet.contains(that.selectionSet);
  }

  toString(expandFragments: boolean = true, indent?: string): string {
    return (indent ?? '') + this.element + ' ' + this.selectionSet.toString(expandFragments, true, indent);
  }
}

class FragmentSpreadSelection extends FragmentSelection {
  private computedKey: string | undefined;

  constructor(
    sourceType: CompositeType,
    private readonly fragments: NamedFragments,
    readonly namedFragment: NamedFragmentDefinition,
    private readonly spreadDirectives: readonly Directive<any>[],
  ) {
    super(new FragmentElement(sourceType, namedFragment.typeCondition, namedFragment.appliedDirectives.concat(spreadDirectives)));
  }

  isFragmentSpread(): boolean {
    return true;
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

  normalize(parentType: CompositeType): FragmentSelection  {
    // We must update the spread parent type if necessary since we're not going deeper,
    // or we'll be fundamentally losing context.
    assert(parentType.schema() === this.parentType.schema(), 'Should not try to normalize using a type from another schema');
    return this.rebaseOn(parentType, this.fragments);
  }

  validate(): void {
    this.validateDeferAndStream();

    validate(
      runtimeTypesIntersects(this.parentType, this.namedFragment.typeCondition),
      () => `Fragment "${this.namedFragment.name}" cannot be spread inside type ${this.parentType} as the runtime types do not intersect ${this.namedFragment.typeCondition}`
    );
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

  rebaseOn(parentType: CompositeType, fragments: NamedFragments | undefined): FragmentSelection {
    // We preserve the parent type here, to make sure we don't lose context, but we actually don't
    // want to expand the spread  as that would compromise the code that optimize subgraph fetches to re-use named
    // fragments.
    //
    // This is a little bit iffy, because the fragment may not apply at this parent type, but we
    // currently leave it to the caller to ensure this is not a mistake. But most of the
    // QP code works on selections with fully expanded fragments, so this code (and that of `canAddTo`
    // on come into play in the code for reusing fragments, and that code calls those methods
    // appropriately.
    if (this.parentType === parentType) {
      return this;
    }

    // If we're rebasing on a _different_ schema, then we *must* have fragments, since reusing
    // `this.fragments` would be incorrect. If we're on the same schema though, we're happy to default
    // to `this.fragments`.
    assert(fragments || this.parentType.schema() === parentType.schema(), `Must provide fragments is rebasing on other schema`);
    const newFragments = fragments ?? this.fragments;
    const namedFragment = newFragments.get(this.namedFragment.name);
    assert(namedFragment, () => `Cannot rebase ${this} if it isn't part of the provided fragments`);
    return new FragmentSpreadSelection(
      parentType,
      newFragments,
      namedFragment,
      this.spreadDirectives,
    );
  }

  canAddTo(_: CompositeType): boolean {
    // Since `rebaseOn` never fail, we copy the logic here and always return `true`. But as
    // mentioned in `rebaseOn`, this leave it a bit to the caller to know what he is doing.
    return true;
  }

  expandFragments(updatedFragments: NamedFragments | undefined): FragmentSelection | readonly Selection[] {
    // Note that this test will always fail if `updatedFragments` is `undefined`, making us expand everything.
    if (updatedFragments?.has(this.namedFragment.name)) {
      // This one is still there, it's not expanded.
      return this;
    }

    const expandedSubSelections = this.selectionSet.expandFragments(updatedFragments);
    return sameType(this.parentType, this.namedFragment.typeCondition) && this.element.appliedDirectives.length === 0
      ? expandedSubSelections.selections()
      : new InlineFragmentSelection(this.element, expandedSubSelections);
  }

  collectUsedFragmentNames(collector: Map<string, number>): void {
    const usageCount = collector.get(this.namedFragment.name);
    collector.set(this.namedFragment.name, usageCount === undefined ? 1 : usageCount + 1);
  }

  withoutDefer(_labelsToRemove?: Set<string>): FragmentSpreadSelection {
    assert(false, 'Unsupported, see `Operation.withAllDeferLabelled`');
  }

  withNormalizedDefer(_normalizer: DeferNormalizer): FragmentSpreadSelection {
    assert(false, 'Unsupported, see `Operation.withAllDeferLabelled`');
  }

  minus(that: Selection): undefined {
    assert(this.equals(that), () => `Invalid operation for ${this.toString(false)} and ${that.toString(false)}`);
    return undefined;
  }

  equals(that: Selection): boolean {
    if (this === that) {
      return true;
    }

    return (that instanceof FragmentSpreadSelection)
      && this.namedFragment.name === that.namedFragment.name
      && sameDirectiveApplications(this.spreadDirectives, that.spreadDirectives);
  }

  contains(that: Selection): ContainsResult {
    if (this.equals(that)) {
      return ContainsResult.EQUAL;
    }

    if (!(that instanceof FragmentSelection) || !this.element.equals(that.element)) {
      return ContainsResult.NOT_CONTAINED;
    }

    return  this.selectionSet.contains(that.selectionSet);
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
  const fragmentsIfAny = fragments.isEmpty() ? undefined : fragments;
  return new Operation(
    schema,
    operation.operation,
    parseSelectionSet({
      parentType: rootType.type,
      source: operation.selectionSet,
      variableDefinitions,
      fragments: fragmentsIfAny,
      validate: validateInput,
    }),
    variableDefinitions,
    fragmentsIfAny,
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
  const fragmentASTs: DefinitionNode[] = operation.fragments
    ? operation.fragments?.toFragmentDefinitionNodes()
    : [];
  return {
    kind: Kind.DOCUMENT,
    definitions: [operationAST as DefinitionNode].concat(fragmentASTs),
  };
}
