import {
  ConstArgumentNode,
  ASTNode,
  buildASTSchema as buildGraphqlSchemaFromAST,
  DirectiveLocation,
  ConstDirectiveNode,
  ConstValueNode,
  DocumentNode,
  GraphQLError,
  GraphQLSchema,
  Kind,
  ListTypeNode,
  NamedTypeNode,
  parse,
  TypeNode,
  VariableDefinitionNode,
  VariableNode,
  SchemaDefinitionNode,
  TypeDefinitionNode,
  DefinitionNode,
  DirectiveDefinitionNode,
  DirectiveNode,
} from "graphql";
import {
  CoreImport,
  CoreOrLinkDirectiveArgs,
  CoreSpecDefinition,
  extractCoreFeatureImports,
  FeatureUrl,
  FeatureVersion,
  findCoreSpecVersion,
  isCoreSpecDirectiveApplication,
  removeAllCoreFeatures,
} from "./specs/coreSpec";
import { assert, mapValues, MapWithCachedArrays, removeArrayElement } from "./utils";
import {
  withDefaultValues,
  valueEquals,
  valueToString,
  valueToAST,
  valueFromAST,
  valueNodeToConstValueNode,
  argumentsEquals,
  collectVariablesInValue
} from "./values";
import { removeInaccessibleElements } from "./specs/inaccessibleSpec";
import { printDirectiveDefinition, printSchema } from './print';
import { sameType } from './types';
import { addIntrospectionFields, introspectionFieldNames, isIntrospectionName } from "./introspection";
import { validateSDL } from "graphql/validation/validate";
import { SDLValidationRule } from "graphql/validation/ValidationContext";
import { specifiedSDLRules } from "graphql/validation/specifiedRules";
import { validateSchema } from "./validate";
import { createDirectiveSpecification, createScalarTypeSpecification, DirectiveSpecification, TypeSpecification } from "./directiveAndTypeSpecification";
import { didYouMean, suggestionList } from "./suggestions";
import { aggregateError, ERRORS, withModifiedErrorMessage } from "./error";
import { coreFeatureDefinitionIfKnown } from "./knownCoreFeatures";

const validationErrorCode = 'GraphQLValidationFailed';
const DEFAULT_VALIDATION_ERROR_MESSAGE = 'The schema is not a valid GraphQL schema.';

const EMPTY_SET = new Set<never>();

export const ErrGraphQLValidationFailed = (causes: GraphQLError[], message: string = DEFAULT_VALIDATION_ERROR_MESSAGE) =>
  aggregateError(validationErrorCode, message, causes);

const apiSchemaValidationErrorCode = 'GraphQLAPISchemaValidationFailed';

export const ErrGraphQLAPISchemaValidationFailed = (causes: GraphQLError[]) =>
  aggregateError(apiSchemaValidationErrorCode, 'The supergraph schema failed to produce a valid API schema', causes);

export const typenameFieldName = '__typename';

export type QueryRootKind = 'query';
export type MutationRootKind = 'mutation';
export type SubscriptionRootKind = 'subscription';
export type SchemaRootKind = QueryRootKind | MutationRootKind | SubscriptionRootKind;

export const allSchemaRootKinds: SchemaRootKind[] = ['query', 'mutation', 'subscription'];

export function defaultRootName(rootKind: SchemaRootKind): string {
  return rootKind.charAt(0).toUpperCase() + rootKind.slice(1);
}

function checkDefaultSchemaRoot(type: NamedType): SchemaRootKind | undefined {
  if (type.kind !== 'ObjectType') {
    return undefined;
  }
  switch (type.name) {
    case 'Query': return 'query';
    case 'Mutation': return 'mutation';
    case 'Subscription': return 'subscription';
    default: return undefined;
  }
}

export function isSchemaRootType(type: NamedType): boolean {
  return isObjectType(type) && type.isRootType();
}

export type Type = NamedType | WrapperType;
export type NamedType = ScalarType | ObjectType | InterfaceType | UnionType | EnumType | InputObjectType;
export type OutputType = ScalarType | ObjectType | InterfaceType | UnionType | EnumType | ListType<any> | NonNullType<any>;
export type InputType = ScalarType | EnumType | InputObjectType | ListType<any> | NonNullType<any>;
export type WrapperType = ListType<any> | NonNullType<any>;
export type AbstractType = InterfaceType | UnionType;
export type CompositeType = ObjectType | InterfaceType | UnionType;

export type OutputTypeReferencer = FieldDefinition<any>;
export type InputTypeReferencer = InputFieldDefinition | ArgumentDefinition<any>;
export type ObjectTypeReferencer = OutputTypeReferencer | UnionType | SchemaDefinition;
export type InterfaceTypeReferencer = OutputTypeReferencer | ObjectType | InterfaceType;

export type NullableType = NamedType | ListType<any>;

export type NamedTypeKind = NamedType['kind'];

export function isNamedType(type: Type): type is NamedType {
  return type instanceof BaseNamedType;
}

export function isWrapperType(type: Type): type is WrapperType {
  return isListType(type) || isNonNullType(type);
}

export function isListType(type: Type): type is ListType<any> {
  return type.kind == 'ListType';
}

export function isNonNullType(type: Type): type is NonNullType<any> {
  return type.kind == 'NonNullType';
}

export function isScalarType(type: Type): type is ScalarType {
  return type.kind == 'ScalarType';
}

export function isCustomScalarType(type: Type): boolean {
  return isScalarType(type) && !graphQLBuiltInTypes.includes(type.name);
}

export function isIntType(type: Type): boolean {
  return type === type.schema().intType();
}

export function isStringType(type: Type): boolean {
  return type === type.schema().stringType();
}

export function isFloatType(type: Type): boolean {
  return type === type.schema().floatType();
}

export function isBooleanType(type: Type): boolean {
  return type === type.schema().booleanType();
}

export function isIDType(type: Type): boolean {
  return type === type.schema().idType();
}

export function isObjectType(type: Type): type is ObjectType {
  return type.kind == 'ObjectType';
}

export function isInterfaceType(type: Type): type is InterfaceType {
  return type.kind == 'InterfaceType';
}

export function isEnumType(type: Type): type is EnumType {
  return type.kind == 'EnumType';
}

export function isUnionType(type: Type): type is UnionType {
  return type.kind == 'UnionType';
}

export function isInputObjectType(type: Type): type is InputObjectType {
  return type.kind == 'InputObjectType';
}

export function isOutputType(type: Type): type is OutputType {
  switch (baseType(type).kind) {
    case 'ScalarType':
    case 'ObjectType':
    case 'UnionType':
    case 'EnumType':
    case 'InterfaceType':
      return true;
    default:
      return false;
  }
}

export function isInputType(type: Type): type is InputType {
  switch (baseType(type).kind) {
    case 'ScalarType':
    case 'EnumType':
    case 'InputObjectType':
      return true;
    default:
      return false;
  }
}

export function isTypeOfKind<T extends Type>(type: Type, kind: T['kind']): type is T {
  return type.kind === kind;
}

export function filterTypesOfKind<T extends Type>(types: readonly Type[], kind: T['kind']): T[] {
  return types.reduce(
    (acc: T[], type: Type) => {
      if (isTypeOfKind(type, kind)) {
        acc.push(type);
      }
      return acc;
    },
    [],
  );
}

export function baseType(type: Type): NamedType {
  return isWrapperType(type) ? type.baseType() : type;
}

export function isNullableType(type: Type): boolean {
  return !isNonNullType(type);
}

export function isAbstractType(type: Type): type is AbstractType {
  return isInterfaceType(type) || isUnionType(type);
}

export function isCompositeType(type: Type): type is CompositeType {
  return isObjectType(type) || isInterfaceType(type) || isUnionType(type);
}

export function possibleRuntimeTypes(type: CompositeType): readonly ObjectType[] {
  switch (type.kind) {
    case 'InterfaceType': return type.possibleRuntimeTypes();
    case 'UnionType': return type.types();
    case 'ObjectType': return [type];
  }
}

export function runtimeTypesIntersects(t1: CompositeType, t2: CompositeType): boolean {
  if (t1 === t2) {
    return true;
  }

  const rt1 = possibleRuntimeTypes(t1);
  const rt2 = possibleRuntimeTypes(t2);
  for (const obj1 of rt1) {
    if (rt2.some(obj2 => obj1.name === obj2.name)) {
      return true;
    }
  }
  return false;
}

export function supertypes(type: CompositeType): readonly CompositeType[] {
  switch (type.kind) {
    case 'InterfaceType': return type.interfaces();
    case 'UnionType': return [];
    case 'ObjectType': return (type.interfaces() as CompositeType[]).concat(type.unionsWhereMember());
  }
}

export function isConditionalDirective(directive: Directive<any, any> | DirectiveDefinition<any>): boolean {
  return ['include', 'skip'].includes(directive.name);
}

export const executableDirectiveLocations: DirectiveLocation[] = [
  DirectiveLocation.QUERY,
  DirectiveLocation.MUTATION,
  DirectiveLocation.SUBSCRIPTION,
  DirectiveLocation.FIELD,
  DirectiveLocation.FRAGMENT_DEFINITION,
  DirectiveLocation.FRAGMENT_SPREAD,
  DirectiveLocation.INLINE_FRAGMENT,
  DirectiveLocation.VARIABLE_DEFINITION,
];

const executableDirectiveLocationsSet = new Set(executableDirectiveLocations);

export function isExecutableDirectiveLocation(loc: DirectiveLocation): boolean {
  return executableDirectiveLocationsSet.has(loc);
}

export const typeSystemDirectiveLocations: DirectiveLocation[] = [
  DirectiveLocation.SCHEMA,
  DirectiveLocation.SCALAR,
  DirectiveLocation.OBJECT,
  DirectiveLocation.FIELD_DEFINITION,
  DirectiveLocation.ARGUMENT_DEFINITION,
  DirectiveLocation.INTERFACE,
  DirectiveLocation.UNION,
  DirectiveLocation.ENUM,
  DirectiveLocation.ENUM_VALUE,
  DirectiveLocation.INPUT_OBJECT,
  DirectiveLocation.INPUT_FIELD_DEFINITION,
];

const typeSystemDirectiveLocationsSet = new Set(typeSystemDirectiveLocations);

export function isTypeSystemDirectiveLocation(loc: DirectiveLocation): boolean {
  return typeSystemDirectiveLocationsSet.has(loc);
}

/**
 * Converts a type to an AST of a "reference" to that type, one corresponding to the type `toString()` (and thus never a type definition).
 *
 * To print a type definition, see the `printTypeDefinitionAndExtensions` method.
 */
export function typeToAST(type: Type): TypeNode {
  switch (type.kind) {
    case 'ListType':
      return {
        kind: Kind.LIST_TYPE,
        type: typeToAST(type.ofType)
      };
    case 'NonNullType':
      return {
        kind: Kind.NON_NULL_TYPE,
        type: typeToAST(type.ofType) as NamedTypeNode | ListTypeNode
      };
    default:
      return {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: type.name }
      };
  }
}

export function typeFromAST(schema: Schema, node: TypeNode): Type {
  switch (node.kind) {
    case Kind.LIST_TYPE:
      return new ListType(typeFromAST(schema, node.type));
    case Kind.NON_NULL_TYPE:
      return new NonNullType(typeFromAST(schema, node.type) as NullableType);
    default:
      const type = schema.type(node.name.value);
      if (!type) {
        throw ERRORS.INVALID_GRAPHQL.err(`Unknown type "${node.name.value}"`, { nodes: node });
      }
      return type;
  }
}

export type LeafType = ScalarType | EnumType;

export function isLeafType(type: Type): type is LeafType {
  return isScalarType(type) || isEnumType(type);
}

export interface Named {
  readonly name: string;
}

export type ExtendableElement = SchemaDefinition | NamedType;

export class DirectiveTargetElement<T extends DirectiveTargetElement<T>> {
  readonly appliedDirectives: Directive<T>[];

  constructor(
    private readonly _schema: Schema,
    directives: readonly Directive<any>[] = [],
  ) {
    this.appliedDirectives = directives.map((d) => this.attachDirective(d));
  }

  schema(): Schema {
    return this._schema;
  }

  private attachDirective(directive: Directive<any>): Directive<T> {
    // if the directive is not attached, we can assume we're fine just attaching it to use. Otherwise, we're "copying" it.
    const toAdd = directive.isAttached()
      ? new Directive(directive.name, directive.arguments())
      : directive;

    Element.prototype['setParent'].call(toAdd, this);
    return toAdd;
  }

  appliedDirectivesOf<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}>(nameOrDefinition: string | DirectiveDefinition<TApplicationArgs>): Directive<T, TApplicationArgs>[] {
    const directiveName = typeof nameOrDefinition === 'string' ? nameOrDefinition : nameOrDefinition.name;
    return this.appliedDirectives.filter(d => d.name == directiveName) as Directive<T, TApplicationArgs>[];
  }

  hasAppliedDirective(nameOrDefinition: string | DirectiveDefinition): boolean {
    const directiveName = typeof nameOrDefinition === 'string' ? nameOrDefinition : nameOrDefinition.name;
    return this.appliedDirectives.some(d => d.name == directiveName);
  }

  appliedDirectivesToDirectiveNodes() : ConstDirectiveNode[] | undefined {
    return directivesToDirectiveNodes(this.appliedDirectives);
  }

  appliedDirectivesToString(): string {
    return directivesToString(this.appliedDirectives);
  }

  collectVariablesInAppliedDirectives(collector: VariableCollector) {
    for (const applied of this.appliedDirectives) {
      collector.collectInArguments(applied.arguments());
    }
  }
}

export function sourceASTs<TNode extends ASTNode = ASTNode>(...elts: ({ sourceAST?: TNode } | undefined)[]): TNode[] {
  return elts.map(elt => elt?.sourceAST).filter((elt): elt is TNode => elt !== undefined);
}

// Not exposed: mostly about avoid code duplication between SchemaElement and Directive (which is not a SchemaElement as it can't
// have applied directives or a description
abstract class Element<TParent extends SchemaElement<any, any> | Schema | DirectiveTargetElement<any>> {
  protected _parent?: TParent;
  sourceAST?: ASTNode;

  schema(): Schema {
    const schema = this.schemaInternal();
    assert(schema, 'requested schema does not exist. Probably because the element is unattached');
    return schema;
  }

  // this function exists because sometimes we can have an element that will be attached soon even though the current state is unattached
  // (mainly for callbacks). Sometimes these intermediate states need to get the schema if it exists, but it may not.
  // all external clients should use schema()
  protected schemaInternal(): Schema | undefined {
    if (!this._parent) {
      return undefined;
    } else if (this._parent instanceof Schema) {
      // Note: at the time of this writing, it seems like typescript type-checking breaks a bit around generics.
      // At this point of the code, `this._parent` is typed as 'TParent & Schema', but for some reason this is
      // "not assignable to type 'Schema | undefined'" (which sounds wrong: if my type theory is not too broken,
      // 'A & B' should always be assignable to both 'A' and 'B').
      return this._parent as any;
    } else if (this._parent instanceof SchemaElement) {
      return this._parent.schemaInternal();
    } else if (this._parent instanceof DirectiveTargetElement) {
      return this._parent.schema();
    }
    assert(false, 'unreachable code. parent is of unknown type');
  }

  get parent(): TParent {
    assert(this._parent, 'trying to access non-existent parent');
    return this._parent;
  }

  isAttached(): boolean {
    return !!this._parent;
  }

  // Accessed only through Element.prototype['setParent'] (so we don't mark it protected as an override wouldn't be properly called).
  private setParent(parent: TParent) {
    assert(!this._parent, "Cannot set parent of an already attached element");
    this._parent = parent;
    this.onAttached();
  }

  protected onAttached() {
    // Nothing by default, but can be overriden.
  }

  protected checkUpdate() {
    // Allowing to add element to a detached element would get hairy. Because that would mean that when you do attach an element,
    // you have to recurse within that element to all children elements to check whether they are attached or not and to which
    // schema. And if they aren't attached, attaching them as side-effect could be surprising (think that adding a single field
    // to a schema could bring a whole hierarchy of types and directives for instance). If they are attached, it only work if
    // it's to the same schema, but you have to check.
    // Overall, it's simpler to force attaching elements before you add other elements to them.
    assert(this.isAttached(), () => `Cannot modify detached element ${this}`);
  }
}

export class Extension<TElement extends ExtendableElement> {
  protected _extendedElement?: TElement;
  sourceAST?: ASTNode;

  get extendedElement(): TElement | undefined {
    return this._extendedElement;
  }

  private setExtendedElement(element: TElement) {
    assert(!this._extendedElement, "Cannot attached already attached extension");
    this._extendedElement = element;
  }
}

type UnappliedDirective = {
  nameOrDef: DirectiveDefinition<Record<string, any>> | string,
  args: Record<string, any>,
  extension?: Extension<any>,
  directive: DirectiveNode,
};

// TODO: ideally, we should hide the ctor of this class as we rely in places on the fact the no-one external defines new implementations.
export abstract class SchemaElement<TOwnType extends SchemaElement<any, TParent>, TParent extends SchemaElement<any, any> | Schema> extends Element<TParent> {
  protected _appliedDirectives: Directive<TOwnType>[] | undefined;
  protected _unappliedDirectives: UnappliedDirective[] | undefined;
  description?: string;

  addUnappliedDirective({ nameOrDef, args, extension, directive }: UnappliedDirective) {
    const toAdd = {
      nameOrDef,
      args: args ?? {},
      extension,
      directive,
    };
    if (this._unappliedDirectives) {
      this._unappliedDirectives.push(toAdd);
    } else {
      this._unappliedDirectives = [toAdd];
    }
  }

  processUnappliedDirectives() {
    for (const { nameOrDef, args, extension, directive } of this._unappliedDirectives ?? []) {
      const d = this.applyDirective(nameOrDef, args);
      d.setOfExtension(extension);
      d.sourceAST = directive;
    }
    this._unappliedDirectives = undefined;
  }

  get appliedDirectives(): readonly Directive<TOwnType>[] {
    return this._appliedDirectives ?? [];
  }

  appliedDirectivesOf<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}>(nameOrDefinition: string | DirectiveDefinition<TApplicationArgs>): Directive<TOwnType, TApplicationArgs>[] {
    const directiveName = typeof nameOrDefinition === 'string' ? nameOrDefinition : nameOrDefinition.name;
    return this.appliedDirectives.filter(d => d.name == directiveName) as Directive<TOwnType, TApplicationArgs>[];
  }

  hasAppliedDirective(nameOrDefinition: string | DirectiveDefinition<any>): boolean {
    // From the type-system point of view, there is no `appliedDirectivesOf(_: string | DirectiveDefinition)` function, but rather 2 overloads, neither of
    // which can take 'string | DirectiveDefinition', hence the need for this surprisingly looking code. And we don't really want to remove the overloading
    // on `appliedDirectivesOf` because that would lose us the type-checking of arguments in the case where we pass a definition (or rather, we could
    // preserve it, but it would make is a bit too easy to mess up calls with the 'string' argument).
    return (typeof nameOrDefinition === 'string'
      ? this.appliedDirectivesOf(nameOrDefinition)
      : this.appliedDirectivesOf(nameOrDefinition)
    ).length !== 0;
  }

  applyDirective<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}>(
    nameOrDef: DirectiveDefinition<TApplicationArgs> | string,
    args?: TApplicationArgs,
    asFirstDirective: boolean = false,
  ): Directive<TOwnType, TApplicationArgs> {
    let toAdd: Directive<TOwnType, TApplicationArgs>;
    if (typeof nameOrDef === 'string') {
      this.checkUpdate();
      toAdd = new Directive<TOwnType, TApplicationArgs>(nameOrDef, args ?? Object.create(null));
      const def = this.schema().directive(nameOrDef) ?? this.schema().blueprint.onMissingDirectiveDefinition(this.schema(), toAdd);
      if (!def) {
        throw this.schema().blueprint.onGraphQLJSValidationError(
          this.schema(),
           ERRORS.INVALID_GRAPHQL.err(`Unknown directive "@${nameOrDef}".`)
        );
      }
      if (Array.isArray(def)) {
        throw ErrGraphQLValidationFailed(def);
      }
    } else {
      this.checkUpdate(nameOrDef);
      toAdd = new Directive<TOwnType, TApplicationArgs>(nameOrDef.name, args ?? Object.create(null));
    }
    Element.prototype['setParent'].call(toAdd, this);
    // TODO: we should typecheck arguments or our TApplicationArgs business is just a lie.
    if (this._appliedDirectives) {
      if (asFirstDirective) {
        this._appliedDirectives.unshift(toAdd);
      } else {
        this._appliedDirectives.push(toAdd);
      }
    } else {
      this._appliedDirectives = [toAdd];
    }
    DirectiveDefinition.prototype['addReferencer'].call(toAdd.definition!, toAdd);
    this.onModification();
    return toAdd;
  }

  protected removeAppliedDirectives() {
    // We copy the array because this._appliedDirectives is modified in-place by `directive.remove()`
    if (!this._appliedDirectives) {
      return;
    }
    const applied = this._appliedDirectives.concat();
    applied.forEach(d => d.remove());
  }

  protected onModification() {
    const schema = this.schemaInternal();
    if (schema) {
      Schema.prototype['onModification'].call(schema);
    }
  }

  protected isElementBuiltIn(): boolean {
    return false;
  }

  protected removeTypeReferenceInternal(type: BaseNamedType<any, any>) {
    // This method is a bit of a hack: we don't want to expose it and we call it from an other class, so we call it though
    // `SchemaElement.prototype`, but we also want this to abstract as it can only be implemented by each concrete subclass.
    // As we can't have both at the same time, this method just delegate to `remoteTypeReference` which is genuinely
    // abstract. This also allow to work around the typing issue that the type checker cannot tell that every BaseNamedType
    // is a NamedType (because in theory, someone could extend BaseNamedType without listing it in NamedType; but as
    // BaseNamedType is not exported and we don't plan to make that mistake ...).
    this.removeTypeReference(type as any);
  }

  protected abstract removeTypeReference(type: NamedType): void;

  protected checkRemoval() {
    assert(!this.isElementBuiltIn() || Schema.prototype['canModifyBuiltIn'].call(this.schema()), () => `Cannot modify built-in ${this}`);
    // We allow removals even on detached element because that doesn't particularly create issues (and we happen to do such
    // removals on detached internally; though of course we could refactor the code if we wanted).
  }

  protected checkUpdate(addedElement?: { schema(): Schema, isAttached(): boolean }) {
    super.checkUpdate();
    if (!Schema.prototype['canModifyBuiltIn'].call(this.schema())) {
      // Ensure this element (the modified one), is not a built-in, or part of one.
      let thisElement: SchemaElement<TOwnType, any> | Schema | undefined = this;
      while (thisElement && thisElement instanceof SchemaElement) {
        assert(!thisElement.isElementBuiltIn(), () => `Cannot modify built-in (or part of built-in) ${this}`);
        thisElement = thisElement.parent;
      }
    }
    if (addedElement && addedElement.isAttached()) {
      const thatSchema = addedElement.schema();
      assert(!thatSchema || thatSchema === this.schema(), () => `Cannot add element ${addedElement} to ${this} as it is attached to another schema`);
    }
  }
}

// TODO: ideally, we should hide the ctor of this class as we rely in places on the fact the no-one external defines new implementations.
export abstract class NamedSchemaElement<TOwnType extends NamedSchemaElement<TOwnType, TParent, TReferencer>, TParent extends NamedSchemaElement<any, any, any> | Schema, TReferencer> extends SchemaElement<TOwnType, TParent> implements Named {
  // We want to be able to rename some elements, but we prefer offering that through a `rename`
  // method rather than exposing a name setter, as this feel more explicit (but that's arguably debatable).
  // We also currently only offer renames on types (because that's the only one we currently need),
  // though we could expand that.
  protected _name: string;

  constructor(name: string) {
    super();
    this._name = name;
  }

  get name(): string {
    return this._name;
  }

  abstract coordinate: string;

  abstract remove(): TReferencer[];
}

abstract class BaseNamedType<TReferencer, TOwnType extends NamedType & NamedSchemaElement<TOwnType, Schema, TReferencer>> extends NamedSchemaElement<TOwnType, Schema, TReferencer> {
  protected _referencers?: Set<TReferencer>;
  protected _extensions?: Extension<TOwnType>[];
  public preserveEmptyDefinition: boolean = false;

  constructor(name: string, readonly isBuiltIn: boolean = false) {
    super(name);
  }

  private addReferencer(referencer: TReferencer) {
    this._referencers ??= new Set();
    this._referencers.add(referencer);
  }

  private removeReferencer(referencer: TReferencer) {
    this._referencers?.delete(referencer)
  }

  get coordinate(): string {
    return this.name;
  }

  *allChildElements(): Generator<NamedSchemaElement<any, TOwnType, any>, void, undefined> {
    // Overriden by those types that do have children
  }

  extensions(): readonly Extension<TOwnType>[] {
    return this._extensions ?? [];
  }

  hasExtension(extension: Extension<any>): boolean {
    return this._extensions?.includes(extension) ?? false;
  }

  newExtension(): Extension<TOwnType> {
    return this.addExtension(new Extension<TOwnType>());
  }

  addExtension(extension: Extension<TOwnType>): Extension<TOwnType> {
    this.checkUpdate();
    // Let's be nice and not complaint if we add an extension already added.
    if (this.hasExtension(extension)) {
      return extension;
    }
    assert(!extension.extendedElement, () => `Cannot add extension to type ${this}: it is already added to another type`);
    if (this._extensions) {
      this._extensions.push(extension);
    } else {
      this._extensions = [ extension ];
    }
    Extension.prototype['setExtendedElement'].call(extension, this);
    this.onModification();
    return extension;
  }

  removeExtensions() {
    if (!this._extensions) {
      return;
    }

    this._extensions = undefined;
    for (const directive of this.appliedDirectives) {
      directive.removeOfExtension();
    }
    this.removeInnerElementsExtensions();
  }

  isIntrospectionType(): boolean {
    return isIntrospectionName(this.name);
  }

  hasExtensionElements(): boolean {
    return !!this._extensions;
  }

  hasNonExtensionElements(): boolean {
    return this.preserveEmptyDefinition
      || this.appliedDirectives.some(d => d.ofExtension() === undefined)
      || this.hasNonExtensionInnerElements();
  }

  protected abstract hasNonExtensionInnerElements(): boolean;
  protected abstract removeInnerElementsExtensions(): void;

  protected isElementBuiltIn(): boolean {
    return this.isBuiltIn;
  }

  rename(newName: string) {
    // Mostly called to ensure we don't rename built-in types. It does mean we can't renamed detached
    // types while this wouldn't be dangerous, but it's probably not a big deal (the API is designed
    // in such a way that you probably should avoid reusing detached elements).
    this.checkUpdate();
    const oldName = this._name;
    this._name = newName;
    Schema.prototype['renameTypeInternal'].call(this._parent, oldName, newName);
    this.onModification();
  }

  /**
   * Removes this type definition from its parent schema.
   *
   * After calling this method, this type will be "detached": it will have no parent, schema, fields,
   * values, directives, etc...
   *
   * Note that it is always allowed to remove a type, but this may make a valid schema
   * invalid, and in particular any element that references this type will, after this call, have an undefined
   * reference.
   *
   * @returns an array of all the elements in the schema of this type (before the removal) that were
   * referencing this type (and have thus now an undefined reference).
   */
  remove(): TReferencer[] {
    if (!this._parent) {
      return [];
    }
    this.checkRemoval();
    this.onModification();
    // Remove this type's children.
    this.sourceAST = undefined;
    this.removeAppliedDirectives();
    this.removeInnerElements();
    // Remove this type's references.
    const toReturn: TReferencer[] = [];
    this._referencers?.forEach(r => {
      SchemaElement.prototype['removeTypeReferenceInternal'].call(r, this);
      toReturn.push(r);
    });
    this._referencers = undefined;
    // Remove this type from its parent schema.
    Schema.prototype['removeTypeInternal'].call(this._parent, this);
    this._parent = undefined;
    return toReturn;
  }

  /**
   * Removes this this definition _and_, recursively, any other elements that references this type and would be invalid
   * after the removal.
   *
   * Note that contrarily to `remove()` (which this method essentially call recursively), this method leaves the schema
   * valid (assuming it was valid beforehand) _unless_ all the schema ends up being removed through recursion (in which
   * case this leaves an empty schema, and that is not technically valid).
   *
   * Also note that this method does _not_ necessarily remove all the elements that reference this type: for instance,
   * if this type is an interface, objects implementing it will _not_ be removed, they will simply stop implementing
   * the interface. In practice, this method mainly remove fields that were using the removed type (in either argument or
   * return type), but it can also remove object/input object/interface if through such field removal some type ends up
   * empty, and it can remove unions if through that removal process and union becomes empty.
   */
  removeRecursive(): void {
    this.remove().forEach(ref => this.removeReferenceRecursive(ref));
  }

  protected abstract removeReferenceRecursive(ref: TReferencer): void;

  referencers(): ReadonlySet<TReferencer> {
    return this._referencers ?? EMPTY_SET;
  }

  isReferenced(): boolean {
    return !!this._referencers;
  }

  protected abstract removeInnerElements(): void;

  toString(): string {
    return this.name;
  }
}

// TODO: ideally, we should hide the ctor of this class as we rely in places on the fact the no-one external defines new implementations.
export abstract class NamedSchemaElementWithType<TType extends Type, TOwnType extends NamedSchemaElementWithType<TType, TOwnType, P, Referencer>, P extends NamedSchemaElement<any, any, any> | Schema, Referencer> extends NamedSchemaElement<TOwnType, P, Referencer> {
  private _type?: TType;

  get type(): TType | undefined {
    return this._type;
  }

  set type(type: TType | undefined) {
    if (type) {
      this.checkUpdate(type);
    } else {
      this.checkRemoval();
    }
    if (this._type) {
      removeReferenceToType(this, this._type);
    }
    this._type = type;
    if (type) {
      addReferenceToType(this, type);
    }
  }

  protected removeTypeReference(type: NamedType) {
    // We shouldn't have been listed as a reference if we're not one, so make it sure.
    assert(this._type && baseType(this._type) === type, () => `Cannot remove reference to type ${type} on ${this} as its type is ${this._type}`);
    this._type = undefined;
  }
}

abstract class BaseExtensionMember<TExtended extends ExtendableElement> extends Element<TExtended> {
  private _extension?: Extension<TExtended>;

  ofExtension(): Extension<TExtended> | undefined {
    return this._extension;
  }

  removeOfExtension() {
    this._extension = undefined;
  }

  setOfExtension(extension: Extension<TExtended> | undefined) {
    this.checkUpdate();
    assert(!extension || this._parent?.hasExtension(extension), () => `Cannot set object as part of the provided extension: it is not an extension of parent ${this.parent}`);
    this._extension = extension;
  }

  remove() {
    this.removeInner();
    Schema.prototype['onModification'].call(this.schema());
    this._extension = undefined;
    this._parent = undefined;
  }

  protected abstract removeInner(): void;
}

export class SchemaBlueprint {
  onMissingDirectiveDefinition(_schema: Schema, _directive: Directive): DirectiveDefinition | GraphQLError[] | undefined {
    // No-op by default, but used for federation.
    return undefined;
  }

  onDirectiveDefinitionAndSchemaParsed(_: Schema): GraphQLError[] {
    // No-op by default, but used for federation.
    return [];
  }

  ignoreParsedField(_type: NamedType, _fieldName: string): boolean {
    // No-op by default, but used for federation.
    return false;
  }

  onConstructed(_: Schema) {
    // No-op by default, but used for federation.
  }

  onAddedCoreFeature(_schema: Schema, _feature: CoreFeature) {
    // No-op by default, but used for federation.
  }

  onInvalidation(_: Schema) {
    // No-op by default, but used for federation.
  }

  onValidation(_schema: Schema): GraphQLError[] {
    // No-op by default, but used for federation.
    return []
  }

  validationRules(): readonly SDLValidationRule[] {
    return specifiedSDLRules;
  }

  /**
   * Allows to intercept some graphQL-js error messages when we can provide additional guidance to users.
   */
  onGraphQLJSValidationError(schema: Schema, error: GraphQLError): GraphQLError {
    // For now, the main additional guidance we provide is around directives, where we could provide additional help in 2 main ways:
    // - if a directive name is likely misspelled (somehow, graphQL-js has methods to offer suggestions on likely mispelling, but don't use this (at the
    //   time of this writting) for directive names).
    // - for fed 2 schema, if a federation directive is refered under it's "default" naming but is not properly imported (not enforced
    //   in the method but rather in the `FederationBlueprint`).
    //
    // Note that intercepting/parsing error messages to modify them is never ideal, but pragmatically, it's probably better than rewriting the relevant
    // rules entirely (in that later case, our "copied" rule would stop getting any potential graphQL-js made improvements for instance). And while such
    // parsing is fragile, in that it'll break if the original message change, we have unit tests to surface any such breakage so it's not really a risk.
    const matcher = /^Unknown directive "@(?<directive>[_A-Za-z][_0-9A-Za-z]*)"\.$/.exec(error.message);
    const name = matcher?.groups?.directive;
    if (!name) {
      return error;
    }

    const allDefinedDirectiveNames = schema.allDirectives().map((d) => d.name);
    const suggestions = suggestionList(name, allDefinedDirectiveNames);
    if (suggestions.length === 0) {
      return this.onUnknownDirectiveValidationError(schema, name, error);
    } else {
      return withModifiedErrorMessage(error, `${error.message}${didYouMean(suggestions.map((s) => '@' + s))}`);
    }
  }

  onUnknownDirectiveValidationError(_schema: Schema, _unknownDirectiveName: string, error: GraphQLError): GraphQLError {
    return error;
  }

  applyDirectivesAfterParsing() {
    return false;
  }
}

export const defaultSchemaBlueprint = new SchemaBlueprint();

export class CoreFeature {
  constructor(
    readonly url: FeatureUrl,
    readonly nameInSchema: string,
    readonly directive: Directive<SchemaDefinition>,
    readonly imports: CoreImport[],
    readonly purpose?: string,
  ) {
  }

  isFeatureDefinition(element: NamedType | DirectiveDefinition): boolean {
    const importName = element.kind === 'DirectiveDefinition'
      ? '@' + element.name
      : element.name;
    return element.name.startsWith(this.nameInSchema + '__')
      || (element.kind === 'DirectiveDefinition' && element.name === this.nameInSchema)
      || !!this.imports.find((i) => importName === (i.as ?? i.name));
  }

  directiveNameInSchema(name: string): string {
    return CoreFeature.directiveNameInSchemaForCoreArguments(
      this.url,
      this.nameInSchema,
      this.imports,
      name,
    );
  }

  static directiveNameInSchemaForCoreArguments(
    specUrl: FeatureUrl,
    specNameInSchema: string,
    imports: CoreImport[],
    directiveNameInSpec: string,
  ): string {
    const elementImport = imports.find((i) =>
      i.name.charAt(0) === '@' && i.name.slice(1) === directiveNameInSpec
    );
    return elementImport
      ? (elementImport.as?.slice(1) ?? directiveNameInSpec)
      : (directiveNameInSpec === specUrl.name
        ? specNameInSchema
        : specNameInSchema + '__' + directiveNameInSpec
      );
  }

  typeNameInSchema(name: string): string {
    const elementImport = this.imports.find((i) => i.name === name);
    return elementImport ? (elementImport.as ?? name) : this.nameInSchema + '__' + name;
  }

  minimumFederationVersion(): FeatureVersion | undefined {
    return coreFeatureDefinitionIfKnown(this.url)?.minimumFederationVersion;
  }
}

export class CoreFeatures {
  readonly coreDefinition: CoreSpecDefinition;
  private readonly byAlias: Map<string, CoreFeature> = new Map();
  private readonly byIdentity: Map<string, CoreFeature> = new Map();

  constructor(readonly coreItself: CoreFeature) {
    this.add(coreItself);
    const coreDef = findCoreSpecVersion(coreItself.url);
    if (!coreDef) {
      throw ERRORS.UNKNOWN_LINK_VERSION.err(`Schema uses unknown version ${coreItself.url.version} of the ${coreItself.url.name} spec`);
    }
    this.coreDefinition = coreDef;
  }

  getByIdentity(identity: string): CoreFeature | undefined {
    return this.byIdentity.get(identity);
  }

  allFeatures(): IterableIterator<CoreFeature> {
    return this.byIdentity.values();
  }

  private removeFeature(featureIdentity: string) {
    const feature = this.byIdentity.get(featureIdentity);
    if (feature) {
      this.byIdentity.delete(featureIdentity);
      this.byAlias.delete(feature.nameInSchema);
    }
  }

  private maybeAddFeature(directive: Directive<SchemaDefinition>): CoreFeature | undefined {
    if (directive.definition?.name !== this.coreItself.nameInSchema) {
      return undefined;
    }
    const typedDirective = directive as Directive<SchemaDefinition, CoreOrLinkDirectiveArgs>
    const args = typedDirective.arguments();
    const url = this.coreDefinition.extractFeatureUrl(args);
    const existing = this.byIdentity.get(url.identity);
    if (existing) {
      // TODO: we may want to lossen that limitation at some point. Including the same feature for 2 different major versions should be ok.
      throw ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(`Duplicate inclusion of feature ${url.identity}`);
    }
    const imports = extractCoreFeatureImports(url, typedDirective);
    const feature = new CoreFeature(url, args.as ?? url.name, directive, imports, args.for);
    this.add(feature);
    directive.schema().blueprint.onAddedCoreFeature(directive.schema(), feature);
    return feature;
  }

  private add(feature: CoreFeature) {
    this.byAlias.set(feature.nameInSchema, feature);
    this.byIdentity.set(feature.url.identity, feature);
  }

  sourceFeature(element: DirectiveDefinition | Directive | NamedType): { feature: CoreFeature, nameInFeature: string, isImported: boolean } | undefined {
    const isDirective = element instanceof DirectiveDefinition || element instanceof Directive;
    const splitted = element.name.split('__');
    if (splitted.length > 1) {
      const feature = this.byAlias.get(splitted[0]);
      return feature ? {
        feature,
        nameInFeature: splitted.slice(1).join('__'),
        isImported: false,
      } : undefined;
    } else {
      // Let's first see if it's an import, as this would take precedence over directive implicitely named like their feature.
      const importName = isDirective ? '@' + element.name : element.name;
      const allFeatures = [this.coreItself, ...this.byIdentity.values()];
      for (const feature of allFeatures) {
        for (const { as, name } of feature.imports) {
          if ((as ?? name) === importName) {
            return {
              feature,
              nameInFeature: isDirective ? name.slice(1) : name,
              isImported: true,
            };
          }
        }
      }

      // Otherwise, this may be the special directive having the same name as its feature.
      const directFeature = this.byAlias.get(element.name);
      if (directFeature && isDirective) {
        return {
          feature: directFeature,
          nameInFeature: element.name,
          isImported: false,
        };
      }

      return undefined;
    }
  }
}

const graphQLBuiltInTypes: readonly string[] = [ 'Int', 'Float', 'String', 'Boolean', 'ID' ];
const graphQLBuiltInTypesSpecifications: readonly TypeSpecification[] = graphQLBuiltInTypes.map((name) => createScalarTypeSpecification({ name }));

const graphQLBuiltInDirectivesSpecifications: readonly DirectiveSpecification[] = [
  createDirectiveSpecification({
    name: 'include',
    locations: [DirectiveLocation.FIELD, DirectiveLocation.FRAGMENT_SPREAD, DirectiveLocation.INLINE_FRAGMENT],
    args: [{ name: 'if', type: (schema) => new NonNullType(schema.booleanType()) }],
  }),
  createDirectiveSpecification({
    name: 'skip',
    locations: [DirectiveLocation.FIELD, DirectiveLocation.FRAGMENT_SPREAD, DirectiveLocation.INLINE_FRAGMENT],
    args: [{ name: 'if', type: (schema) => new NonNullType(schema.booleanType()) }],
  }),
  createDirectiveSpecification({
    name: 'deprecated',
    locations: [DirectiveLocation.FIELD_DEFINITION, DirectiveLocation.ENUM_VALUE, DirectiveLocation.ARGUMENT_DEFINITION, DirectiveLocation.INPUT_FIELD_DEFINITION],
    args: [{ name: 'reason', type: (schema) => schema.stringType(), defaultValue: 'No longer supported' }],
  }),
  createDirectiveSpecification({
    name: 'specifiedBy',
    locations: [DirectiveLocation.SCALAR],
    args: [{ name: 'url', type: (schema) => new NonNullType(schema.stringType()) }],
  }),
  // Note that @defer and @stream are unconditionally added to `Schema` even if they are technically "optional" built-in. _But_,
  // the `Schema#toGraphQLJSSchema` method has an option to decide if @defer/@stream should be included or not in the resulting
  // schema, which is how the gateway and router can, at runtime, decide to include or not include them based on actual support.
  createDirectiveSpecification({
    name: 'defer',
    locations: [DirectiveLocation.FRAGMENT_SPREAD, DirectiveLocation.INLINE_FRAGMENT],
    args: [
      { name: 'label', type: (schema) => schema.stringType() },
      { name: 'if', type: (schema) => new NonNullType(schema.booleanType()), defaultValue: true },
    ],
  }),
  // Adding @stream too so that it's know and we don't error out if it is queries. It feels like it would be weird to do so for @stream but not
  // @defer when both are defined in the same spec. That said, that does *not* mean we currently _implement_ @stream, we don't, and so putting
  // it in a query will be a no-op at the moment (which technically is valid according to the spec so ...).
  createDirectiveSpecification({
    name: 'stream',
    locations: [DirectiveLocation.FIELD],
    args: [
      { name: 'label', type: (schema) => schema.stringType() },
      { name: 'initialCount', type: (schema) => schema.intType(), defaultValue: 0 },
      { name: 'if', type: (schema) => new NonNullType(schema.booleanType()), defaultValue: true },
    ],
  }),
];

export type DeferDirectiveArgs = {
  label?: string,
  if?: boolean | Variable,
}

export type StreamDirectiveArgs = {
  label?: string,
  initialCount: number,
  if?: boolean,
}


// A coordinate is up to 3 "graphQL name" ([_A-Za-z][_0-9A-Za-z]*).
const coordinateRegexp = /^@?[_A-Za-z][_0-9A-Za-z]*(\.[_A-Za-z][_0-9A-Za-z]*)?(\([_A-Za-z][_0-9A-Za-z]*:\))?$/;

export type SchemaConfig = {
  cacheAST?: boolean,
}

export class Schema {
  private _schemaDefinition: SchemaDefinition;
  private readonly _builtInTypes = new MapWithCachedArrays<string, NamedType>();
  private readonly _types = new MapWithCachedArrays<string, NamedType>();
  private readonly _builtInDirectives = new MapWithCachedArrays<string, DirectiveDefinition>();
  private readonly _directives = new MapWithCachedArrays<string, DirectiveDefinition>();
  private _coreFeatures?: CoreFeatures;
  private isConstructed: boolean = false;
  public isValidated: boolean = false;

  private cachedDocument?: DocumentNode;
  private apiSchema?: Schema;

  constructor(
    readonly blueprint: SchemaBlueprint = defaultSchemaBlueprint,
    readonly config: SchemaConfig = {},
  ) {
    this._schemaDefinition = new SchemaDefinition();
    Element.prototype['setParent'].call(this._schemaDefinition, this);
    graphQLBuiltInTypesSpecifications.forEach((spec) => spec.checkOrAdd(this, undefined, true));
    graphQLBuiltInDirectivesSpecifications.forEach((spec) => spec.checkOrAdd(this, undefined, true));
    blueprint.onConstructed(this);
    this.isConstructed = true;
  }

  private canModifyBuiltIn(): boolean {
    return !this.isConstructed;
  }

  private runWithBuiltInModificationAllowed(fct: () => void) {
    const wasConstructed = this.isConstructed;
    this.isConstructed = false;
    fct();
    this.isConstructed = wasConstructed;
  }

  private renameTypeInternal(oldName: string, newName: string) {
    this._types.set(newName, this._types.get(oldName)!);
    this._types.delete(oldName);
  }

  private removeTypeInternal(type: BaseNamedType<any, any>) {
    this._types.delete(type.name);
  }

  private removeDirectiveInternal(definition: DirectiveDefinition) {
    this._directives.delete(definition.name);
  }

  private markAsCoreSchema(coreItself: CoreFeature) {
    this._coreFeatures = new CoreFeatures(coreItself);
  }

  private unmarkAsCoreSchema() {
    this._coreFeatures = undefined;
  }

  private onModification() {
    // The only stuffs that are added while !isConstructed are built-in, and those shouldn't invalidate everything.
    if (this.isConstructed) {
      this.invalidate();
      this.cachedDocument = undefined;
      this.apiSchema = undefined;
    }
  }

  isCoreSchema(): boolean {
    return this.coreFeatures !== undefined;
  }

  get coreFeatures(): CoreFeatures | undefined {
    return this._coreFeatures;
  }

  toAST(): DocumentNode {
    if (!this.cachedDocument) {
      // As we're not building the document from a file, having locations info might be more confusing that not.
      const ast = parse(printSchema(this), { noLocation: true });
      const shouldCache = this.config.cacheAST ?? false;
      if (!shouldCache) {
        return ast;
      }
      this.cachedDocument = ast;
    }
    return this.cachedDocument!;
  }

  toAPISchema(): Schema {
    if (!this.apiSchema) {
      this.validate();

      const apiSchema = this.clone(undefined, false);

      // As we compute the API schema of a supergraph, we want to ignore explicit definitions of `@defer` and `@stream` because
      // those correspond to the merging of potential definitions from the subgraphs, but whether the supergraph API schema
      // supports defer or not is unrelated to the subgraph capacity. As far as gateway/router support goes, whether the defer/stream
      // definitions end up being provided or not will depend on the runtime `config` argument of the `toGraphQLJSSchema` that
      // is the called on the API schema (the schema resulting from that method).
      for (const toRemoveIfCustom of ['defer', 'stream']) {
        const directive = apiSchema.directive(toRemoveIfCustom);
        if (directive && !directive.isBuiltIn) {
          directive.removeRecursive();
        }
      }

      removeInaccessibleElements(apiSchema);
      removeAllCoreFeatures(apiSchema);
      assert(!apiSchema.isCoreSchema(), "The API schema shouldn't be a core schema")
      apiSchema.validate();
      this.apiSchema = apiSchema;
    }
    return this.apiSchema;
  }

  private emptyASTDefinitionsForExtensionsWithoutDefinition(): DefinitionNode[] {
    const nodes = [];
    if (this.schemaDefinition.hasExtensionElements() && !this.schemaDefinition.hasNonExtensionElements()) {
      const node: SchemaDefinitionNode = { kind: Kind.SCHEMA_DEFINITION, operationTypes: [] };
      nodes.push(node);
    }
    for (const type of this.types()) {
      if (type.hasExtensionElements() && !type.hasNonExtensionElements()) {
        const node: TypeDefinitionNode = {
          kind: type.astDefinitionKind,
          name: { kind: Kind.NAME, value: type.name },
        };
        nodes.push(node);
      }
    }
    return nodes;
  }

  toGraphQLJSSchema(config?: { includeDefer?: boolean, includeStream?: boolean }): GraphQLSchema {
    const includeDefer = config?.includeDefer ?? false;
    const includeStream = config?.includeStream ?? false;

    let ast = this.toAST();

    // Note that AST generated by `this.toAST()` may not be fully graphQL valid because, in federation subgraphs, we accept
    // extensions that have no corresponding definitions. This won't fly however if we try to build a `GraphQLSchema`, so
    // we need to "fix" that problem. For that, we add empty definitions for every element that has extensions without
    // definitions (which is also what `fed1` was effectively doing).
    const additionalNodes = this.emptyASTDefinitionsForExtensionsWithoutDefinition();
    if (includeDefer) {
      additionalNodes.push(this.deferDirective().toAST());
    }
    if (includeStream) {
      additionalNodes.push(this.streamDirective().toAST());
    }
    if (additionalNodes.length > 0) {
      ast = {
        kind: Kind.DOCUMENT,
        definitions: ast.definitions.concat(additionalNodes),
      }
    }

    const graphQLSchema = buildGraphqlSchemaFromAST(ast);
    if (additionalNodes.length > 0) {
      // As mentionned, if we have extensions without definition, we _have_ to add an empty definition to be able to
      // build a `GraphQLSchema` object. But that also mean that we lose the information doing so, as we cannot
      // distinguish anymore that we have no definition. A method like `graphQLSchemaToAST` for instance, would
      // include a definition in particular, and that could a bit surprised (and could lead to an hard-to-find bug
      // in the worst case if you were expecting it that something like `graphQLSchemaToAST(buildSchema(defs).toGraphQLJSSchema())`
      // gives you back the original `defs`).
      // So to avoid this, we manually delete the definition `astNode` post-construction on the created schema if
      // we had not definition. This should break users of the resulting schema since `astNode` is allowed to be `undefined`,
      // but it allows `graphQLSchemaToAST` to make the proper distinction in general.
      for (const node of additionalNodes) {
        switch (node.kind) {
          case Kind.SCHEMA_DEFINITION:
            graphQLSchema.astNode = undefined;
            break;
          case Kind.SCALAR_TYPE_DEFINITION:
          case Kind.OBJECT_TYPE_DEFINITION:
          case Kind.INTERFACE_TYPE_DEFINITION:
          case Kind.ENUM_TYPE_DEFINITION:
          case Kind.UNION_TYPE_DEFINITION:
          case Kind.INPUT_OBJECT_TYPE_DEFINITION:
            const type = graphQLSchema.getType(node.name.value);
            if (type) {
              type.astNode = undefined;
            }
        }
      }
    }
    return graphQLSchema;
  }

  get schemaDefinition(): SchemaDefinition {
    return this._schemaDefinition;
  }

  /**
   * All the types defined on this schema, excluding the built-in types.
   */
  types(): readonly NamedType[] {
    return this._types.values();
  }

  interfaceTypes(): readonly InterfaceType[] {
    return filterTypesOfKind<InterfaceType>(this.types(), 'InterfaceType');
  }

  objectTypes(): readonly ObjectType[] {
    return filterTypesOfKind<ObjectType>(this.types(), 'ObjectType');
  }

  unionTypes(): readonly UnionType[] {
    return filterTypesOfKind<UnionType>(this.types(), 'UnionType');
  }

  scalarTypes(): readonly ScalarType[] {
    return filterTypesOfKind<ScalarType>(this.types(), 'ScalarType');
  }

  inputTypes(): readonly InputObjectType[] {
    return filterTypesOfKind<InputObjectType>(this.types(), 'InputObjectType');
  }

  enumTypes(): readonly EnumType[] {
    return filterTypesOfKind<EnumType>(this.types(), 'EnumType');
  }

  /**
   * All the built-in types for this schema (those that are not displayed when printing the schema).
   */
  builtInTypes(includeShadowed: boolean = false): readonly NamedType[] {
    const allBuiltIns = this._builtInTypes.values();
    return includeShadowed
      ? allBuiltIns
      : allBuiltIns.filter(t => !this.isShadowedBuiltInType(t));
  }

  private isShadowedBuiltInType(type: NamedType) {
    return type.isBuiltIn && this._types.has(type.name);
  }

  /**
    * All the types, including the built-in ones.
    */
  allTypes(): readonly NamedType[] {
    return this.builtInTypes().concat(this.types());
  }

  /**
   * The type of the provide name in this schema if one is defined or if it is the name of a built-in.
   */
  type(name: string): NamedType | undefined {
    const type = this._types.get(name);
    return type ? type : this._builtInTypes.get(name);
  }

  typeOfKind<T extends NamedType>(name: string, kind: T['kind']): T | undefined {
    const type = this.type(name);
    return type && type.kind === kind ? type as T : undefined;
  }

  intType(): ScalarType {
    return this._builtInTypes.get('Int')! as ScalarType;
  }

  floatType(): ScalarType {
    return this._builtInTypes.get('Float')! as ScalarType;
  }

  stringType(): ScalarType {
    return this._builtInTypes.get('String')! as ScalarType;
  }

  booleanType(): ScalarType {
    return this._builtInTypes.get('Boolean')! as ScalarType;
  }

  idType(): ScalarType {
    return this._builtInTypes.get('ID')! as ScalarType;
  }

  builtInScalarTypes(): ScalarType[] {
    return [
      this.intType(),
      this.floatType(),
      this.stringType(),
      this.booleanType(),
      this.idType(),
    ];
  }

  addType<T extends NamedType>(type: T): T {
    const existing = this.type(type.name);
    if (existing) {
      // Like for directive, we let user shadow built-in types, but the definition must be valid.
      assert(existing.isBuiltIn, () => `Type ${type} already exists in this schema`);
    }
    if (type.isAttached()) {
      // For convenience, let's not error out on adding an already added type.
      assert(type.parent == this, () => `Cannot add type ${type} to this schema; it is already attached to another schema`);
      return type;
    }
    if (type.isBuiltIn) {
      assert(!this.isConstructed, `Cannot add built-in ${type} to this schema (built-ins can only be added at schema construction time)`);
      this._builtInTypes.set(type.name, type);
    } else {
      this._types.set(type.name, type);
    }
    Element.prototype['setParent'].call(type, this);
    // If a type is the default name of a root, it "becomes" that root automatically,
    // unless some other root has already been set.
    const defaultSchemaRoot = checkDefaultSchemaRoot(type);
    if (defaultSchemaRoot && !this.schemaDefinition.root(defaultSchemaRoot)) {
      // Note that checkDefaultSchemaRoot guarantees us type is an ObjectType
      this.schemaDefinition.setRoot(defaultSchemaRoot, type as ObjectType);
    }
    this.onModification();
    return type;
  }

  /**
   * All the directive defined on this schema, excluding the built-in directives.
   */
  directives(): readonly DirectiveDefinition[] {
    return this._directives.values();
  }

  /**
   * All the built-in directives for this schema (those that are not displayed when printing the schema).
   */
  builtInDirectives(includeShadowed: boolean = false): readonly DirectiveDefinition[] {
    return includeShadowed
      ? this._builtInDirectives.values()
      : this._builtInDirectives.values().filter(d => !this.isShadowedBuiltInDirective(d));
  }

  allDirectives(): readonly DirectiveDefinition[] {
    return this.builtInDirectives().concat(this.directives());
  }

  private isShadowedBuiltInDirective(directive: DirectiveDefinition) {
    return directive.isBuiltIn && this._directives.has(directive.name);
  }

  directive(name: string): DirectiveDefinition | undefined {
    const directive = this._directives.get(name);
    return directive ? directive : this.builtInDirective(name);
  }

  builtInDirective(name: string): DirectiveDefinition | undefined {
    return this._builtInDirectives.get(name);
  }

  *allNamedSchemaElement(): Generator<NamedSchemaElement<any, any, any>, void, undefined> {
    for (const type of this.types()) {
      yield type;
      yield* type.allChildElements();
    }
    for (const directive of this.directives()) {
      yield directive;
      yield* directive.arguments();
    }
  }

  *allSchemaElement(): Generator<SchemaElement<any, any>, void, undefined> {
    yield this._schemaDefinition;
    yield* this.allNamedSchemaElement();
  }

  addDirectiveDefinition(name: string): DirectiveDefinition;
  addDirectiveDefinition(directive: DirectiveDefinition): DirectiveDefinition;
  addDirectiveDefinition(directiveOrName: string | DirectiveDefinition): DirectiveDefinition {
    const definition = typeof directiveOrName === 'string' ? new DirectiveDefinition(directiveOrName) : directiveOrName;
    const existing = this.directive(definition.name);
    // Note that we allow the schema to define a built-in manually (and the manual definition will shadow the
    // built-in one). It's just that validation will ensure the definition ends up the one expected.
    assert(!existing || existing.isBuiltIn, () => `Directive ${definition} already exists in this schema`);
    if (definition.isAttached()) {
      // For convenience, let's not error out on adding an already added directive.
      assert(definition.parent == this, () => `Cannot add directive ${definition} to this schema; it is already attached to another schema`);
      return definition;
    }
    if (definition.isBuiltIn) {
      assert(!this.isConstructed, () => `Cannot add built-in ${definition} to this schema (built-ins can only be added at schema construction time)`);
      this._builtInDirectives.set(definition.name, definition);
    } else {
      this._directives.set(definition.name, definition);
    }
    Element.prototype['setParent'].call(definition, this);
    this.onModification();
    return definition;
  }

  invalidate() {
    if (this.isValidated) {
      this.blueprint.onInvalidation(this);
    }
    this.isValidated = false;
  }

  /**
   * Marks the schema as validated _without running actual validation_.
   * Should obviously only be called when we know the built schema must be valid.
   *
   * Note that if `validate` is called after this, then it will exit immediately without validation as
   * the schema will have been marked as validated. However, if this schema is further modified, then
   * `invalidate` will be called, after which `validate` would run validation again.
   */
  assumeValid() {
    this.runWithBuiltInModificationAllowed(() => {
      addIntrospectionFields(this);
    });

    this.isValidated = true;
  }

  validate() {
    if (this.isValidated) {
      return;
    }

    this.runWithBuiltInModificationAllowed(() => {
      addIntrospectionFields(this);
    });

    // TODO: we check that all types are properly set (aren't undefined) in `validateSchema`, but `validateSDL` will error out beforehand. We should
    // probably extract that part of `validateSchema` and run `validateSDL` conditionally on that first check.
    let errors = validateSDL(this.toAST(), undefined, this.blueprint.validationRules()).map((e) => this.blueprint.onGraphQLJSValidationError(this, e));
    errors = errors.concat(validateSchema(this));

    // We avoid adding federation-specific validations if the base schema is not proper graphQL as the later can easily trigger
    // the former (for instance, someone mistyping the 'fields' argument name of a @key).
    if (errors.length === 0) {
      this.runWithBuiltInModificationAllowed(() => {
        errors = this.blueprint.onValidation(this);
      });
    }

    if (errors.length > 0) {
      throw ErrGraphQLValidationFailed(errors as GraphQLError[]);
    }

    this.isValidated = true;
  }

  clone(builtIns?: SchemaBlueprint, cloneJoinDirectives: boolean = true): Schema {
    const cloned = new Schema(builtIns ?? this.blueprint);
    copy(this, cloned, cloneJoinDirectives);
    if (this.isValidated) {
      cloned.assumeValid();
    }
    return cloned;
  }

  private getBuiltInDirective<TApplicationArgs extends {[key: string]: any}>(
    name: string
  ): DirectiveDefinition<TApplicationArgs> {
    const directive = this.directive(name);
    assert(directive, `The provided schema has not be built with the ${name} directive built-in`);
    return directive as DirectiveDefinition<TApplicationArgs>;
  }

  includeDirective(): DirectiveDefinition<{if: boolean | Variable}> {
    return this.getBuiltInDirective('include');
  }

  skipDirective(): DirectiveDefinition<{if: boolean | Variable}> {
    return this.getBuiltInDirective('skip');
  }

  deprecatedDirective(): DirectiveDefinition<{reason?: string}> {
    return this.getBuiltInDirective('deprecated');
  }

  specifiedByDirective(): DirectiveDefinition<{url: string}> {
    return this.getBuiltInDirective('specifiedBy');
  }

  deferDirective(): DirectiveDefinition<DeferDirectiveArgs> {
    return this.getBuiltInDirective('defer');
  }

  streamDirective(): DirectiveDefinition<StreamDirectiveArgs> {
    return this.getBuiltInDirective('stream');
  }

  /**
   * Gets an element of the schema given its "schema coordinate".
   *
   * Note that the syntax for schema coordinates is the one from the upcoming GraphQL spec: https://github.com/graphql/graphql-spec/pull/794.
   */
  elementByCoordinate(coordinate: string): NamedSchemaElement<any, any, any> | undefined {
    if (!coordinate.match(coordinateRegexp)) {
      // To be fair, graphQL coordinate is not yet officially part of the spec but well...
      throw ERRORS.INVALID_GRAPHQL.err(`Invalid argument "${coordinate}: it is not a syntactically valid graphQL coordinate."`);
    }

    const argStartIdx = coordinate.indexOf('(');
    const start = argStartIdx < 0 ? coordinate : coordinate.slice(0, argStartIdx);
    // Argument syntax is `foo(argName:)`, so the arg name start after the open parenthesis and go until the final ':)'.
    const argName = argStartIdx < 0 ? undefined : coordinate.slice(argStartIdx + 1, coordinate.length - 2);
    const splittedStart = start.split('.');
    const typeOrDirectiveName = splittedStart[0];
    const fieldOrEnumName = splittedStart[1];
    const isDirective = typeOrDirectiveName.startsWith('@');
    if (isDirective) {
      if (fieldOrEnumName) {
        throw ERRORS.INVALID_GRAPHQL.err(`Invalid argument "${coordinate}: it is not a syntactically valid graphQL coordinate."`);
      }
      const directive = this.directive(typeOrDirectiveName.slice(1));
      return argName ? directive?.argument(argName) : directive;
    } else {
      const type = this.type(typeOrDirectiveName);
      if (!type || !fieldOrEnumName) {
        return type;
      }
      switch (type.kind) {
        case 'ObjectType':
        case 'InterfaceType':
          const field = type.field(fieldOrEnumName);
          return argName ? field?.argument(argName) : field;
        case 'InputObjectType':
          if (argName) {
            throw ERRORS.INVALID_GRAPHQL.err(`Invalid argument "${coordinate}: it is not a syntactically valid graphQL coordinate."`);
          }
          return type.field(fieldOrEnumName);
        case 'EnumType':
          if (argName) {
            throw ERRORS.INVALID_GRAPHQL.err(`Invalid argument "${coordinate}: it is not a syntactically valid graphQL coordinate."`);
          }
          return type.value(fieldOrEnumName);
        default:
          throw ERRORS.INVALID_GRAPHQL.err(`Invalid argument "${coordinate}: it is not a syntactically valid graphQL coordinate."`);
      }
    }
  }
}

export class RootType extends BaseExtensionMember<SchemaDefinition> {
  constructor(readonly rootKind: SchemaRootKind, readonly type: ObjectType) {
    super();
  }

  isDefaultRootName() {
    return defaultRootName(this.rootKind) == this.type.name;
  }

  protected removeInner() {
    SchemaDefinition.prototype['removeRootType'].call(this._parent, this);
  }
}

export class SchemaDefinition extends SchemaElement<SchemaDefinition, Schema>  {
  readonly kind = 'SchemaDefinition' as const;
  protected readonly _roots = new MapWithCachedArrays<SchemaRootKind, RootType>();
  protected _extensions: Extension<SchemaDefinition>[] | undefined;
  public preserveEmptyDefinition: boolean = false;

  roots(): readonly RootType[] {
    return this._roots.values();
  }

  applyDirective<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}>(
    nameOrDef: DirectiveDefinition<TApplicationArgs> | string,
    args?: TApplicationArgs,
    asFirstDirective: boolean = false,
  ): Directive<SchemaDefinition, TApplicationArgs> {
    const applied = super.applyDirective(nameOrDef, args, asFirstDirective) as Directive<SchemaDefinition, TApplicationArgs>;
    const schema = this.schema();
    const coreFeatures = schema.coreFeatures;
    if (isCoreSpecDirectiveApplication(applied)) {
      if (coreFeatures) {
        throw ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(`Invalid duplicate application of @core/@link`);
      }
      const schemaDirective = applied as Directive<SchemaDefinition, CoreOrLinkDirectiveArgs>;
      const args = schemaDirective.arguments();
      const url = FeatureUrl.parse((args.url ?? args.feature)!);
      const imports = extractCoreFeatureImports(url, schemaDirective);
      const core = new CoreFeature(url, args.as ?? url.name, schemaDirective, imports, args.for);
      Schema.prototype['markAsCoreSchema'].call(schema, core);
      // We also any core features that may have been added before we saw the @link for link itself
      this.appliedDirectives
        .filter((a) => a !== applied)
        .forEach((other) => CoreFeatures.prototype['maybeAddFeature'].call(schema.coreFeatures, other));
    } else if (coreFeatures) {
      CoreFeatures.prototype['maybeAddFeature'].call(coreFeatures, applied);
    }
    this.onModification();
    return applied;
  }

  root(rootKind: SchemaRootKind): RootType | undefined {
    return this._roots.get(rootKind);
  }

  rootType(rootKind: SchemaRootKind): ObjectType | undefined {
    return this.root(rootKind)?.type;
  }

  setRoot(rootKind: SchemaRootKind, nameOrType: ObjectType | string): RootType {
    let toSet: RootType;
    if (typeof nameOrType === 'string') {
      this.checkUpdate();
      const obj = this.schema().type(nameOrType);
      if (!obj) {
        throw ERRORS.INVALID_GRAPHQL.err(`Cannot set schema ${rootKind} root to unknown type ${nameOrType}`);
      } else if (obj.kind != 'ObjectType') {
        throw ERRORS.INVALID_GRAPHQL.err(`${defaultRootName(rootKind)} root type must be an Object type${rootKind === 'query' ? '' : ' if provided'}, it cannot be set to ${nameOrType} (an ${obj.kind}).`);
      }
      toSet = new RootType(rootKind, obj);
    } else {
      this.checkUpdate(nameOrType);
      toSet = new RootType(rootKind, nameOrType);
    }
    const prevRoot = this._roots.get(rootKind);
    if (prevRoot) {
      removeReferenceToType(this, prevRoot.type);
    }
    this._roots.set(rootKind, toSet);
    Element.prototype['setParent'].call(toSet, this);
    addReferenceToType(this, toSet.type);
    this.onModification();
    return toSet;
  }

  extensions(): Extension<SchemaDefinition>[] {
    return this._extensions ?? [];
  }

  hasExtension(extension: Extension<any>): boolean {
    return this._extensions?.includes(extension) ?? false;
  }

  newExtension(): Extension<SchemaDefinition> {
    return this.addExtension(new Extension());
  }

  addExtension(extension: Extension<SchemaDefinition>): Extension<SchemaDefinition> {
    this.checkUpdate();
    // Let's be nice and not complaint if we add an extension already added.
    if (this.hasExtension(extension)) {
      return extension;
    }
    assert(!extension.extendedElement, 'Cannot add extension to this schema: extension is already added to another schema');
    if (this._extensions) {
      this._extensions.push(extension);
    } else {
      this._extensions = [extension];
    }
    Extension.prototype['setExtendedElement'].call(extension, this);
    this.onModification();
    return extension;
  }

  hasExtensionElements(): boolean {
    return !!this._extensions;
  }

  hasNonExtensionElements(): boolean {
    return this.preserveEmptyDefinition
      || this.appliedDirectives.some((d) => d.ofExtension() === undefined)
      || this.roots().some((r) => r.ofExtension() === undefined);
  }

  private removeRootType(rootType: RootType) {
    this._roots.delete(rootType.rootKind);
    removeReferenceToType(this, rootType.type);
  }

  protected removeTypeReference(toRemove: NamedType) {
    for (const rootType of this.roots()) {
      if (rootType.type == toRemove) {
        this._roots.delete(rootType.rootKind);
      }
    }
  }

  toString() {
    return `schema[${this._roots.keys().join(', ')}]`;
  }
}

export class ScalarType extends BaseNamedType<OutputTypeReferencer | InputTypeReferencer, ScalarType> {
  readonly kind = 'ScalarType' as const;
  readonly astDefinitionKind = Kind.SCALAR_TYPE_DEFINITION;

  protected removeTypeReference(type: NamedType) {
    assert(false, `Scalar type ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  protected hasNonExtensionInnerElements(): boolean {
    return false; // No inner elements
  }

  protected removeInnerElementsExtensions(): void {
    // No inner elements
  }

  protected removeInnerElements(): void {
    // No inner elements
  }

  protected removeReferenceRecursive(ref: OutputTypeReferencer | InputTypeReferencer): void {
    ref.remove();
  }
}

export class InterfaceImplementation<T extends ObjectType | InterfaceType> extends BaseExtensionMember<T> {
  readonly interface: InterfaceType

  // Note: typescript complains if a parameter is named 'interface'. This is why we don't just declare the `readonly interface`
  // field within the constructor.
  constructor(itf: InterfaceType) {
    super();
    this.interface = itf;
  }

  protected removeInner() {
    FieldBasedType.prototype['removeInterfaceImplementation'].call(this._parent, this.interface);
  }

  toString() {
    return `'implements ${this.interface}'`;
  }
}

// Abstract class for ObjectType and InterfaceType as they share most of their structure. Note that UnionType also
// technically has one field (__typename), but because it's only one, it is special cased and UnionType is not a
// subclass of this class.
abstract class FieldBasedType<T extends (ObjectType | InterfaceType) & NamedSchemaElement<T, Schema, R>, R> extends BaseNamedType<R, T> {
  // Note that we only keep one InterfaceImplementation per interface name, and so each `implements X` belong
  // either to the main type definition _or_ to a single extension. In theory, a document could have `implements X`
  // in both of those places (or on 2 distinct extensions). We don't preserve that level of detail, but this
  // feels like a very minor limitation with little practical impact, and it avoids additional complexity.
  private _interfaceImplementations: MapWithCachedArrays<string, InterfaceImplementation<T>> | undefined;
  private readonly _fields: MapWithCachedArrays<string, FieldDefinition<T>> = new MapWithCachedArrays();
  private _cachedNonBuiltInFields?: readonly FieldDefinition<T>[];

  protected onAttached() {
    // Note that we can only add the __typename built-in field when we're attached, because we need access to the
    // schema string type. Also, we're effectively modifying a built-in (to add the type), so we
    // need to let the schema accept it.
    Schema.prototype['runWithBuiltInModificationAllowed'].call(this.schema(), () => {
      this.addField(new FieldDefinition(typenameFieldName, true), new NonNullType(this.schema().stringType()));
    });
  }

  private removeFieldInternal(field: FieldDefinition<T>) {
    this._fields.delete(field.name);
    this._cachedNonBuiltInFields = undefined;
  }

  interfaceImplementations(): readonly InterfaceImplementation<T>[] {
    return this._interfaceImplementations?.values() ?? [];
  }

  interfaceImplementation(type: string | InterfaceType): InterfaceImplementation<T> | undefined {
    return this._interfaceImplementations ? this._interfaceImplementations.get(typeof type === 'string' ? type : type.name) : undefined;
  }

  interfaces(): readonly InterfaceType[] {
    return this.interfaceImplementations().map(impl => impl.interface);
  }

  implementsInterface(type: string | InterfaceType): boolean {
    return this._interfaceImplementations?.has(typeof type === 'string' ? type : type.name) ?? false;
  }

  addImplementedInterface(nameOrItfOrItfImpl: InterfaceImplementation<T> | InterfaceType | string): InterfaceImplementation<T> {
    let toAdd: InterfaceImplementation<T>;
    if (nameOrItfOrItfImpl instanceof InterfaceImplementation) {
      this.checkUpdate(nameOrItfOrItfImpl);
      toAdd = nameOrItfOrItfImpl;
    } else {
      let itf: InterfaceType;
      if (typeof nameOrItfOrItfImpl === 'string') {
        this.checkUpdate();
        const maybeItf = this.schema().type(nameOrItfOrItfImpl);
        if (!maybeItf) {
          throw ERRORS.INVALID_GRAPHQL.err(`Cannot implement unknown type ${nameOrItfOrItfImpl}`);
        } else if (maybeItf.kind != 'InterfaceType') {
          throw ERRORS.INVALID_GRAPHQL.err(`Cannot implement non-interface type ${nameOrItfOrItfImpl} (of type ${maybeItf.kind})`);
        }
        itf = maybeItf;
      } else {
        itf = nameOrItfOrItfImpl;
      }
      toAdd = new InterfaceImplementation<T>(itf);
    }
    const existing = this._interfaceImplementations?.get(toAdd.interface.name);
    if (!existing) {
      if (!this._interfaceImplementations) {
        this._interfaceImplementations = new MapWithCachedArrays();
      }
      this._interfaceImplementations.set(toAdd.interface.name, toAdd);
      addReferenceToType(this, toAdd.interface);
      Element.prototype['setParent'].call(toAdd, this);
      this.onModification();
      return toAdd;
    } else {
      return existing;
    }
  }

  /**
   * All the fields of this type, excluding the built-in ones.
   */
  fields(): readonly FieldDefinition<T>[] {
    if (!this._cachedNonBuiltInFields) {
      this._cachedNonBuiltInFields = this._fields.values().filter(f => !f.isBuiltIn);
    }
    return this._cachedNonBuiltInFields;
  }

  hasFields(): boolean {
    return this.fields().length > 0;
  }

  /**
   * All the built-in fields for this type (those that are not displayed when printing the schema).
   */
  builtInFields(): FieldDefinition<T>[] {
    return this.allFields().filter(f => f.isBuiltIn);
  }

  /**
    * All the fields of this type, including the built-in ones.
    */
  allFields(): readonly FieldDefinition<T>[] {
    return this._fields.values();
  }

  field(name: string): FieldDefinition<T> | undefined {
    return this._fields.get(name);
  }

  /**
   * A shortcut to access the __typename field.
   *
   * Note that an _attached_ (field-based) type will always have this field, but _detached_ types won't, so this method
   * will only return `undefined` on detached objects.
   */
  typenameField(): FieldDefinition<T> | undefined {
    return this.field(typenameFieldName);
  }

  addField(nameOrField: string | FieldDefinition<T>, type?: Type): FieldDefinition<T> {
    let toAdd: FieldDefinition<T>;
    if (typeof nameOrField === 'string') {
      this.checkUpdate();
      toAdd = new FieldDefinition<T>(nameOrField);
    } else {
      this.checkUpdate(nameOrField);
      toAdd = nameOrField;
    }
    if (this.field(toAdd.name)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Field ${toAdd.name} already exists on ${this}`);
    }
    if (type && !isOutputType(type)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Invalid input type ${type} for field ${toAdd.name}: object and interface field types should be output types.`);
    }
    this._fields.set(toAdd.name, toAdd);
    this._cachedNonBuiltInFields = undefined;
    Element.prototype['setParent'].call(toAdd, this);
    // Note that we need to wait we have attached the field to set the type.
    if (type) {
      toAdd.type = type;
    }
    this.onModification();
    return toAdd;
  }

  *allChildElements(): Generator<NamedSchemaElement<any, any, any>, void, undefined> {
    for (const field of this._fields.values()) {
      yield field;
      yield* field.arguments();
    }
  }

  private removeInterfaceImplementation(itf: InterfaceType) {
    this._interfaceImplementations?.delete(itf.name);
    removeReferenceToType(this, itf);
  }

  protected removeTypeReference(type: NamedType) {
    this._interfaceImplementations?.delete(type.name);
  }

  protected removeInnerElements(): void {
    for (const interfaceImpl of this.interfaceImplementations()) {
      interfaceImpl.remove();
    }
    for (const field of this.allFields()) {
      if (field.isBuiltIn) {
        // Calling remove on a built-in (think _typename) throws, with reason (we don't want
        // to allow removing _typename from a type in general). So all we do for built-in is
        // detach the parent.
        FieldDefinition.prototype['removeParent'].call(field);
      } else {
        field.remove();
      }
    }
  }

  protected hasNonExtensionInnerElements(): boolean {
    return this.interfaceImplementations().some(itf => itf.ofExtension() === undefined)
      || this.fields().some(f => f.ofExtension() === undefined);
  }

  protected removeInnerElementsExtensions(): void {
    this.interfaceImplementations().forEach(itf => itf.removeOfExtension());
    this.fields().forEach(f => f.removeOfExtension());
  }
}

export class ObjectType extends FieldBasedType<ObjectType, ObjectTypeReferencer> {
  readonly kind = 'ObjectType' as const;
  readonly astDefinitionKind = Kind.OBJECT_TYPE_DEFINITION;

  /**
   *  Whether this type is one of the schema root type (will return false if the type is detached).
   */
  isRootType(): boolean {
    const schema = this.schema();
    return schema.schemaDefinition.roots().some(rt => rt.type == this);
  }

  /**
   *  Whether this type is the "query" root type of the schema (will return false if the type is detached).
   */
  isQueryRootType(): boolean {
    const schema = this.schema();
    return schema.schemaDefinition.root('query')?.type === this;
  }

  /**
   *  Whether this type is the "subscription" root type of the schema (will return false if the type is detached).
   */
  isSubscriptionRootType(): boolean {
    const schema = this.schema();
    return schema.schemaDefinition.root('subscription')?.type === this;
  }

  protected removeReferenceRecursive(ref: ObjectTypeReferencer): void {
    // Note that the ref can also be a`SchemaDefinition`, but don't have anything to do then.
    switch (ref.kind) {
      case 'FieldDefinition':
        ref.removeRecursive();
        break;
      case 'UnionType':
        if (ref.membersCount() === 0) {
          ref.removeRecursive();
        }
        break;
    }
  }

  unionsWhereMember(): readonly UnionType[] {
    const unions: UnionType[] = [];
    this._referencers?.forEach((r) => {
      if (r instanceof BaseNamedType && isUnionType(r)) {
        unions.push(r);
      }
    });
    return unions;
  }
}

export class InterfaceType extends FieldBasedType<InterfaceType, InterfaceTypeReferencer> {
  readonly kind = 'InterfaceType' as const;
  readonly astDefinitionKind = Kind.INTERFACE_TYPE_DEFINITION;

  allImplementations(): (ObjectType | InterfaceType)[] {
    const implementations: (ObjectType | InterfaceType)[] = [];
    this.referencers().forEach(ref => {
      if (ref.kind === 'ObjectType' || ref.kind === 'InterfaceType') {
        implementations.push(ref);
      }
    });
    return implementations;
  }

  possibleRuntimeTypes(): readonly ObjectType[] {
    // Note that object types in GraphQL needs to reference directly all the interfaces they implement, and cannot rely on transitivity.
    return this.allImplementations().filter(impl => impl.kind === 'ObjectType') as ObjectType[];
  }

  isPossibleRuntimeType(type: string | NamedType): boolean {
    const typeName = typeof type === 'string' ? type : type.name;
    return this.possibleRuntimeTypes().some(t => t.name == typeName);
  }

  protected removeReferenceRecursive(ref: InterfaceTypeReferencer): void {
    // Note that an interface can be referenced by an object/interface that implements it, but after remove(), said object/interface
    // will simply not implement "this" anymore and we have nothing more to do.
    if (ref.kind === 'FieldDefinition') {
      ref.removeRecursive();
    }
  }
}

export class UnionMember extends BaseExtensionMember<UnionType> {
  constructor(readonly type: ObjectType) {
    super();
  }

  protected removeInner() {
    UnionType.prototype['removeMember'].call(this._parent, this.type);
  }
}

export class UnionType extends BaseNamedType<OutputTypeReferencer, UnionType> {
  readonly kind = 'UnionType' as const;
  readonly astDefinitionKind = Kind.UNION_TYPE_DEFINITION;
  protected readonly _members: MapWithCachedArrays<string, UnionMember> = new MapWithCachedArrays();
  private _typenameField?: FieldDefinition<UnionType>;

  protected onAttached() {
    // Note that we can only create the __typename built-in field when we're attached, because we need access to the
    // schema string type. Also, we're effectively modifying a built-in (to add the type), so we
    // need to let the schema accept it.
    Schema.prototype['runWithBuiltInModificationAllowed'].call(this.schema(), () => {
      this._typenameField = new FieldDefinition(typenameFieldName, true);
      Element.prototype['setParent'].call(this._typenameField, this);
      this._typenameField.type = new NonNullType(this.schema().stringType());
    });
  }

  types(): ObjectType[] {
    return this.members().map(m => m.type);
  }

  members(): readonly UnionMember[] {
    return this._members.values();
  }

  membersCount(): number {
    return this._members.size;
  }

  hasTypeMember(type: string | ObjectType) {
    return this._members.has(typeof type === 'string' ? type : type.name);
  }

  addType(nameOrTypeOrMember: ObjectType | string | UnionMember): UnionMember {
    let toAdd: UnionMember;
    if (nameOrTypeOrMember instanceof UnionMember) {
      this.checkUpdate(nameOrTypeOrMember);
      toAdd = nameOrTypeOrMember;
    } else {
      let obj: ObjectType;
      if (typeof nameOrTypeOrMember === 'string') {
        this.checkUpdate();
        const maybeObj = this.schema().type(nameOrTypeOrMember);
        if (!maybeObj) {
          throw ERRORS.INVALID_GRAPHQL.err(`Cannot add unknown type ${nameOrTypeOrMember} as member of union type ${this.name}`);
        } else if (maybeObj.kind != 'ObjectType') {
          throw ERRORS.INVALID_GRAPHQL.err(`Cannot add non-object type ${nameOrTypeOrMember} (of type ${maybeObj.kind}) as member of union type ${this.name}`);
        }
        obj = maybeObj;
      } else {
        this.checkUpdate(nameOrTypeOrMember);
        obj = nameOrTypeOrMember;
      }
      toAdd = new UnionMember(obj);
    }
    const existing = this._members.get(toAdd.type.name);
    if (!existing) {
      this._members.set(toAdd.type.name, toAdd);
      Element.prototype['setParent'].call(toAdd, this);
      addReferenceToType(this, toAdd.type);
      this.onModification();
      return toAdd;
    } else {
      return existing;
    }
  }

  clearTypes() {
    for (const type of this.types()) {
      this.removeMember(type);
    }
    this.onModification();
  }

  /**
   * Access a field of the union by name.
   * As the only field that can be accessed on an union is the __typename one, this method will always return undefined unless called
   * on "__typename". However, this exists to allow code working on CompositeType to be more generic.
   */
  field(name: string): FieldDefinition<UnionType> | undefined {
    if (name === typenameFieldName && this._typenameField) {
      return this._typenameField;
    }
    return undefined;
  }

  /**
   * The __typename field (and only field of a union).
   *
   * Note that _attached_ unions always have this field, so this method will only return `undefined` on detached objects.
   */
  typenameField(): FieldDefinition<UnionType> | undefined {
    return this._typenameField;
  }

  private removeMember(type: ObjectType) {
    this._members.delete(type.name);
    removeReferenceToType(this, type);
  }

  protected removeTypeReference(type: NamedType) {
    this._members.delete(type.name);
  }

  protected removeInnerElements(): void {
    for (const member of this.members()) {
      member.remove();
    }
  }

  protected hasNonExtensionInnerElements(): boolean {
    return this.members().some(m => m.ofExtension() === undefined);
  }

  protected removeReferenceRecursive(ref: OutputTypeReferencer): void {
    ref.removeRecursive();
  }

  protected removeInnerElementsExtensions(): void {
    this.members().forEach(m => m.removeOfExtension());
  }
}

export class EnumType extends BaseNamedType<OutputTypeReferencer, EnumType> {
  readonly kind = 'EnumType' as const;
  readonly astDefinitionKind = Kind.ENUM_TYPE_DEFINITION;
  private _values = new Map<string, EnumValue>();

  get values(): readonly EnumValue[] {
    // Because our abstractions are mutable, and removal is done by calling
    // `remove()` on the element to remove, it's not unlikely someone mauy
    // try to iterate on the result of this method and call `remove()` on
    // some of the return value based on some condition. But this will break
    // in an error-prone way if we don't copy, so we do.
    return Array.from(this._values.values());
  }
  
  value(name: string): EnumValue | undefined {
    return this._values.get(name);
  }

  addValue(value: EnumValue): EnumValue;
  addValue(name: string): EnumValue;
  addValue(nameOrValue: EnumValue | string): EnumValue {
    let toAdd: EnumValue;
    if (typeof nameOrValue === 'string') {
      this.checkUpdate();
      toAdd = new EnumValue(nameOrValue);
    } else {
      this.checkUpdate(nameOrValue);
      toAdd = nameOrValue;
    }
    const existing = this.value(toAdd.name);
    if (!existing) {
      this._values.set(toAdd.name, toAdd);
      Element.prototype['setParent'].call(toAdd, this);
      this.onModification();
      return toAdd;
    } else {
      return existing;
    }
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Eum type ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  private removeValueInternal(value: EnumValue) {
    this._values.delete(value.name);
  }

  protected removeInnerElements(): void {
    // Make a copy (indirectly), since EnumValue.remove() will modify this._values.
    const values = this.values;
    for (const value of values) {
      value.remove();
    }
  }

  protected hasNonExtensionInnerElements(): boolean {
    return Array.from(this._values.values()).some(v => v.ofExtension() === undefined);
  }

  protected removeReferenceRecursive(ref: OutputTypeReferencer): void {
    ref.removeRecursive();
  }

  protected removeInnerElementsExtensions(): void {
    for (const v of this._values.values()) {
      v.removeOfExtension();
    }
  }
}

export class InputObjectType extends BaseNamedType<InputTypeReferencer, InputObjectType> {
  readonly kind = 'InputObjectType' as const;
  readonly astDefinitionKind = Kind.INPUT_OBJECT_TYPE_DEFINITION;
  private readonly _fields: Map<string, InputFieldDefinition> = new Map();
  private _cachedFieldsArray?: InputFieldDefinition[];

  /**
   * All the fields of this input type.
   */
  fields(): InputFieldDefinition[] {
    if (!this._cachedFieldsArray) {
      this._cachedFieldsArray = mapValues(this._fields);
    }
    return this._cachedFieldsArray;
  }

  field(name: string): InputFieldDefinition | undefined {
    return this._fields.get(name);
  }

  addField(field: InputFieldDefinition): InputFieldDefinition;
  addField(name: string, type?: Type): InputFieldDefinition;
  addField(nameOrField: string | InputFieldDefinition, type?: Type): InputFieldDefinition {
    const toAdd = typeof nameOrField === 'string' ? new InputFieldDefinition(nameOrField) : nameOrField;
    this.checkUpdate(toAdd);
    if (this.field(toAdd.name)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Field ${toAdd.name} already exists on ${this}`);
    }
    if (type && !isInputType(type)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Invalid output type ${type} for field ${toAdd.name}: input field types should be input types.`);
    }
    this._fields.set(toAdd.name, toAdd);
    this._cachedFieldsArray = undefined;
    Element.prototype['setParent'].call(toAdd, this);
    // Note that we need to wait we have attached the field to set the type.
    if (typeof nameOrField === 'string' && type) {
      toAdd.type = type;
    }
    this.onModification();
    return toAdd;
  }

  hasFields(): boolean {
    return this._fields.size > 0;
  }

  *allChildElements(): Generator<NamedSchemaElement<any, any, any>, void, undefined> {
    yield* this._fields.values();
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Input Object type ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  protected removeInnerElements(): void {
    // Not that we modify the type during iteration, but the reference we get from `this.fields()` will not change
    for (const field of this.fields()) {
      field.remove();
    }
  }

  private removeFieldInternal(field: InputFieldDefinition) {
    this._fields.delete(field.name);
    this._cachedFieldsArray = undefined;
  }

  protected hasNonExtensionInnerElements(): boolean {
    return this.fields().some(f => f.ofExtension() === undefined);
  }

  protected removeReferenceRecursive(ref: InputTypeReferencer): void {
    if (ref.kind === 'ArgumentDefinition') {
      // Not only do we want to remove the argument, but we want to remove its parent. Technically, only removing the argument would
      // leave the schema in a valid state so it would be an option, but this feel a bit too weird of a behaviour in practice for a
      // method calling `removeRecursive`. And in particular, it would mean that if the argument is a directive definition one,
      // we'd also have to update each of the directive application to remove the correspond argument. Removing the full directive
      // definition (and all its applications) feels a bit more predictable.
      ref.parent().removeRecursive();
    } else {
      ref.removeRecursive();
    }
  }

  protected removeInnerElementsExtensions(): void {
    this.fields().forEach(f => f.removeOfExtension());
  }
}

class BaseWrapperType<T extends Type> {
  protected constructor(protected _type: T) {
    assert(this._type, 'Cannot wrap an undefined/null type');
  }

  schema(): Schema {
    return this.baseType().schema();
  }

  isAttached(): boolean {
    return this.baseType().isAttached();
  }

  get ofType(): T {
    return this._type;
  }

  baseType(): NamedType {
    return baseType(this._type);
  }
}

export class ListType<T extends Type> extends BaseWrapperType<T> {
  readonly kind = 'ListType' as const;

  constructor(type: T) {
    super(type);
  }

  toString(): string {
    return `[${this.ofType}]`;
  }
}

export class NonNullType<T extends NullableType> extends BaseWrapperType<T> {
  readonly kind = 'NonNullType' as const;

  constructor(type: T) {
    super(type);
  }

  toString(): string {
    return `${this.ofType}!`;
  }
}

export class FieldDefinition<TParent extends CompositeType> extends NamedSchemaElementWithType<OutputType, FieldDefinition<TParent>, TParent, never> {
  readonly kind = 'FieldDefinition' as const;
  private _args: MapWithCachedArrays<string, ArgumentDefinition<FieldDefinition<TParent>>> | undefined;
  private _extension?: Extension<TParent>;

  constructor(name: string, readonly isBuiltIn: boolean = false) {
    super(name);
  }

  protected isElementBuiltIn(): boolean {
    return this.isBuiltIn;
  }

  get coordinate(): string {
    const parent = this._parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}.${this.name}`;
  }

  hasArguments(): boolean {
    return !!this._args && this._args.size > 0;
  }

  arguments(): readonly ArgumentDefinition<FieldDefinition<TParent>>[] {
    return this._args?.values() ?? [];
  }

  argument(name: string): ArgumentDefinition<FieldDefinition<TParent>> | undefined {
    return this._args?.get(name);
  }

  addArgument(arg: ArgumentDefinition<FieldDefinition<TParent>>): ArgumentDefinition<FieldDefinition<TParent>>;
  addArgument(name: string, type?: Type, defaultValue?: any): ArgumentDefinition<FieldDefinition<TParent>>;
  addArgument(nameOrArg: string | ArgumentDefinition<FieldDefinition<TParent>>, type?: Type, defaultValue?: any): ArgumentDefinition<FieldDefinition<TParent>> {
    let toAdd: ArgumentDefinition<FieldDefinition<TParent>>;
    if (typeof nameOrArg === 'string') {
      this.checkUpdate();
      toAdd = new ArgumentDefinition<FieldDefinition<TParent>>(nameOrArg);
      toAdd.defaultValue = defaultValue;
    } else {
      this.checkUpdate(nameOrArg);
      toAdd = nameOrArg;
    }
    const existing = this.argument(toAdd.name);
    if (existing) {
      // For some reason (bad codegen, maybe?), some users have field where a arg is defined more than one. And this doesn't seem rejected by
      // graphQL (?). So we accept it, but ensure the types/default values are the same.
      if (type && existing.type && !sameType(type, existing.type)) {
        throw ERRORS.INVALID_GRAPHQL.err(`Argument ${toAdd.name} already exists on field ${this.name} with a different type (${existing.type})`);
      }
      if (defaultValue && (!existing.defaultValue || !valueEquals(defaultValue, existing.defaultValue))) {
        throw ERRORS.INVALID_GRAPHQL.err(`Argument ${toAdd.name} already exists on field ${this.name} with a different default value (${valueToString(existing.defaultValue)})`);
      }
      return existing;
    }
    if (type && !isInputType(type)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Invalid output type ${type} for argument ${toAdd.name} of ${this}: arguments should be input types.`);
    }
    if (!this._args) {
      this._args = new MapWithCachedArrays();
    }
    this._args.set(toAdd.name, toAdd);
    Element.prototype['setParent'].call(toAdd, this);
    if (typeof nameOrArg === 'string') {
      toAdd.type = type;
    }
    this.onModification();
    return toAdd;
  }

  ofExtension(): Extension<TParent> | undefined {
    return this._extension;
  }

  removeOfExtension() {
    this._extension = undefined;
  }

  setOfExtension(extension: Extension<TParent> | undefined) {
    this.checkUpdate();
    assert(
      !extension || this._parent?.hasExtension(extension),
      () => `Cannot mark field ${this.name} as part of the provided extension: it is not an extension of field parent type ${this.parent}`
    );
    this._extension = extension;
    this.onModification();
  }

  isIntrospectionField(): boolean {
    return isIntrospectionName(this.name);
  }

  isSchemaIntrospectionField(): boolean {
    return introspectionFieldNames.includes(this.name);
  }

  private removeArgumentInternal(name: string) {
    if (this._args) {
      this._args.delete(name);
    }
  }

  // Only called through the prototype from FieldBasedType.removeInnerElements because we don't want to expose it.
  private removeParent() {
    this._parent = undefined;
  }

  isDeprecated(): boolean {
    return this.hasAppliedDirective('deprecated');
  }

  /**
   * Removes this field definition from its parent type.
   *
   * After calling this method, this field definition will be "detached": it will have no parent, schema, type,
   * arguments, or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    this.checkRemoval();
    this.onModification();
    // Remove this field's children.
    this.sourceAST = undefined;
    this.type = undefined;
    this.removeAppliedDirectives();
    for (const arg of this.arguments()) {
      arg.remove();
    }
    // Note that we don't track field references outside of parents, so no
    // removal needed there.
    //
    // TODO: One could consider interface fields as references to implementing
    //   object/interface fields, in the sense that removing an implementing
    //   object/interface field breaks the validity of the implementing
    //   interface field. Being aware that an object/interface field is being
    //   referenced in such a way would be useful for understanding breakages
    //   that need to be resolved as a consequence of removal.
    //
    // Remove this field from its parent object/interface type.
    FieldBasedType.prototype['removeFieldInternal'].call(this._parent, this);
    this._parent = undefined;
    this._extension = undefined;
    return [];
  }

  /**
   * Like `remove()`, but if this field was the last field of its parent type, the parent type is removed through its `removeRecursive` method.
   */
  removeRecursive(): void {
    const parent = this._parent;
    this.remove();
    // Note that we exclude the union type here because it doesn't have the `fields()` method, but the only field unions can have is the __typename
    // one and it cannot be removed, so remove() above will actually throw in practice before reaching this.
    if (parent && !isUnionType(parent) && parent.fields().length === 0) {
      parent.removeRecursive();
    }
  }

  toString(): string {
    const args = this.hasArguments()
      ? '(' + this.arguments().map(arg => arg.toString()).join(', ') + ')'
      : "";
    return `${this.name}${args}: ${this.type}`;
  }
}

export class InputFieldDefinition extends NamedSchemaElementWithType<InputType, InputFieldDefinition, InputObjectType, never> {
  readonly kind = 'InputFieldDefinition' as const;
  private _extension?: Extension<InputObjectType>;
  defaultValue?: any

  get coordinate(): string {
    const parent = this._parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}.${this.name}`;
  }

  isRequired(): boolean {
    return isNonNullType(this.type!) && this.defaultValue === undefined;
  }

  ofExtension(): Extension<InputObjectType> | undefined {
    return this._extension;
  }

  removeOfExtension() {
    this._extension = undefined;
  }

  setOfExtension(extension: Extension<InputObjectType> | undefined) {
    this.checkUpdate();
    assert(
      !extension || this._parent?.hasExtension(extension),
      () => `Cannot mark field ${this.name} as part of the provided extension: it is not an extension of field parent type ${this.parent}`,
    );
    this._extension = extension;
    this.onModification();
  }

  isDeprecated(): boolean {
    return this.hasAppliedDirective('deprecated');
  }

  /**
   * Removes this input field definition from its parent type.
   *
   * After calling this method, this input field definition will be "detached": it will have no parent, schema,
   * type, default value, or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    this.checkRemoval();
    this.onModification();
    // Remove this input field's children.
    this.sourceAST = undefined;
    this.type = undefined;
    this.defaultValue = undefined;
    this.removeAppliedDirectives();
    // Note that we don't track input field references outside of parents, so no
    // removal needed there.
    //
    // TODO: One could consider default values (in field arguments, input
    //   fields, or directive definitions) as references to input fields they
    //   use, in the sense that removing the input field breaks the validity of
    //   the default value. Being aware that an input field is being referenced
    //   in such a way would be useful for understanding breakages that need to
    //   be resolved as a consequence of removal. (The reference is indirect
    //   though, as input field usages are currently represented as strings
    //   within GraphQL values).
    //
    // Remove this input field from its parent input object type.
    InputObjectType.prototype['removeFieldInternal'].call(this._parent, this);
    this._parent = undefined;
    this._extension = undefined;
    return [];
  }

  /**
   * Like `remove()`, but if this field was the last field of its parent type, the parent type is removed through its `removeRecursive` method.
   */
  removeRecursive(): void {
    const parent = this._parent;
    this.remove();
    if (parent && parent.fields().length === 0) {
      parent.removeRecursive();
    }
  }

  toString(): string {
    const defaultStr = this.defaultValue === undefined ? "" : ` = ${valueToString(this.defaultValue, this.type)}`;
    return `${this.name}: ${this.type}${defaultStr}`;
  }
}

export class ArgumentDefinition<TParent extends FieldDefinition<any> | DirectiveDefinition> extends NamedSchemaElementWithType<InputType, ArgumentDefinition<TParent>, TParent, never> {
  readonly kind = 'ArgumentDefinition' as const;
  defaultValue?: any

  constructor(name: string) {
    super(name);
  }

  get coordinate(): string {
    const parent = this._parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}(${this.name}:)`;
  }

  isRequired(): boolean {
    return isNonNullType(this.type!) && this.defaultValue === undefined;
  }

  isDeprecated(): boolean {
    return this.hasAppliedDirective('deprecated');
  }

  /**
   * Removes this argument definition from its parent element (field or directive).
   *
   * After calling this method, this argument definition will be "detached": it will have no parent, schema, type,
   * default value, or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    this.checkRemoval();
    this.onModification();
    // Remove this argument's children.
    this.sourceAST = undefined;
    this.type = undefined;
    this.defaultValue = undefined;
    this.removeAppliedDirectives();
    // Note that we don't track argument references outside of parents, so no
    // removal needed there.
    //
    // TODO: One could consider the arguments of directive applications as
    //   references to the arguments of directive definitions, in the sense that
    //   removing a directive definition argument can break the validity of the
    //   directive application. Being aware that a directive definition argument
    //   is being referenced in such a way would be useful for understanding
    //   breakages that need to be resolved as a consequence of removal. (You
    //   could make a similar claim about interface field arguments being
    //   references to object field arguments.)
    //
    // Remove this argument from its parent field or directive definition.
    if (this._parent instanceof FieldDefinition) {
      FieldDefinition.prototype['removeArgumentInternal'].call(this._parent, this.name);
    } else {
      DirectiveDefinition.prototype['removeArgumentInternal'].call(this._parent, this.name);
    }
    this._parent = undefined;
    return [];
  }

  toString() {
    const defaultStr = this.defaultValue === undefined ? "" : ` = ${valueToString(this.defaultValue, this.type)}`;
    return `${this.name}: ${this.type}${defaultStr}`;
  }
}

export class EnumValue extends NamedSchemaElement<EnumValue, EnumType, never> {
  readonly kind = 'EnumValue' as const;
  private _extension?: Extension<EnumType>;

  get coordinate(): string {
    const parent = this._parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}.${this.name}`;
  }

  ofExtension(): Extension<EnumType> | undefined {
    return this._extension;
  }

  removeOfExtension() {
    this._extension = undefined;
  }

  setOfExtension(extension: Extension<EnumType> | undefined) {
    this.checkUpdate();
    assert(
      !extension || this._parent?.hasExtension(extension),
      () => `Cannot mark field ${this.name} as part of the provided extension: it is not an extension of enum value parent type ${this.parent}`,
    );
    this._extension = extension;
    this.onModification();
  }

  isDeprecated(): boolean {
    return this.hasAppliedDirective('deprecated');
  }

  /**
   * Removes this enum value definition from its parent type.
   *
   * After calling this method, this enum value definition will be "detached": it will have no parent, schema, type,
   * arguments, or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    this.checkRemoval();
    this.onModification();
    // Remove this enum value's children.
    this.sourceAST = undefined;
    this.removeAppliedDirectives();
    // Note that we don't track enum value references outside of parents, so no
    // removal needed there.
    //
    // TODO: One could consider default values (in field arguments, input
    //   fields, or directive definitions) as references to enum values they
    //   use, in the sense that removing the enum value breaks the validity of
    //   the default value. Being aware that an enum value is being referenced
    //   in such a way would be useful for understanding breakages that need to
    //   be resolved as a consequence of removal. (The reference is indirect
    //   though, as enum value usages are currently represented as strings
    //   within GraphQL values).
    //
    // Remove this enum value from its parent enum type.
    EnumType.prototype['removeValueInternal'].call(this._parent, this);
    this._parent = undefined;
    this._extension = undefined;
    return [];
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Enum value ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  toString(): string {
    return `${this.name}`;
  }
}

export class DirectiveDefinition<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}> extends NamedSchemaElement<DirectiveDefinition<TApplicationArgs>, Schema, Directive> {
  readonly kind = 'DirectiveDefinition' as const;

  private _args?: MapWithCachedArrays<string, ArgumentDefinition<DirectiveDefinition>>;
  repeatable: boolean = false;
  private readonly _locations: DirectiveLocation[] = [];
  private _referencers?: Set<Directive<SchemaElement<any, any>, TApplicationArgs>>;

  constructor(name: string, readonly isBuiltIn: boolean = false) {
    super(name);
  }

  get coordinate(): string {
    return `@${this.name}`;
  }

  arguments(): readonly ArgumentDefinition<DirectiveDefinition>[] {
    return this._args?.values() ?? [];
  }

  argument(name: string): ArgumentDefinition<DirectiveDefinition> | undefined {
    return this._args?.get(name);
  }

  addArgument(arg: ArgumentDefinition<DirectiveDefinition>): ArgumentDefinition<DirectiveDefinition>;
  addArgument(name: string, type?: InputType, defaultValue?: any): ArgumentDefinition<DirectiveDefinition>;
  addArgument(nameOrArg: string | ArgumentDefinition<DirectiveDefinition>, type?: InputType, defaultValue?: any): ArgumentDefinition<DirectiveDefinition> {
    let toAdd: ArgumentDefinition<DirectiveDefinition>;
    if (typeof nameOrArg === 'string') {
      this.checkUpdate();
      toAdd = new ArgumentDefinition<DirectiveDefinition>(nameOrArg);
      toAdd.defaultValue = defaultValue;
    } else {
      this.checkUpdate(nameOrArg);
      toAdd = nameOrArg;
    }
    if (this.argument(toAdd.name)) {
      throw ERRORS.INVALID_GRAPHQL.err(`Argument ${toAdd.name} already exists on field ${this.name}`);
    }
    if (!this._args) {
      this._args = new MapWithCachedArrays();
    }
    this._args.set(toAdd.name, toAdd);
    Element.prototype['setParent'].call(toAdd, this);
    if (typeof nameOrArg === 'string') {
      toAdd.type = type;
    }
    this.onModification();
    return toAdd;
  }

  private removeArgumentInternal(name: string) {
    this._args?.delete(name);
  }

  get locations(): readonly DirectiveLocation[] {
    return this._locations;
  }

  addLocations(...locations: DirectiveLocation[]): DirectiveDefinition {
    let modified = false;
    for (const location of locations) {
      if (!this._locations.includes(location)) {
        this._locations.push(location);
        modified = true;
      }
    }
    if (modified) {
      this.onModification();
    }
    return this;
  }

  addAllLocations(): DirectiveDefinition {
    return this.addLocations(...Object.values(DirectiveLocation));
  }

  /**
  * Adds the subset of type system locations that correspond to type definitions.
  */
  addAllTypeLocations(): DirectiveDefinition {
    return this.addLocations(
      DirectiveLocation.SCALAR,
      DirectiveLocation.OBJECT,
      DirectiveLocation.INTERFACE,
      DirectiveLocation.UNION,
      DirectiveLocation.ENUM,
      DirectiveLocation.INPUT_OBJECT,
    );
  }

  removeLocations(...locations: DirectiveLocation[]): DirectiveDefinition {
    let modified = false;
    for (const location of locations) {
      modified ||= removeArrayElement(location, this._locations);
    }
    if (modified) {
      this.onModification();
    }
    return this;
  }

  hasExecutableLocations(): boolean {
    return this.locations.some((loc) => isExecutableDirectiveLocation(loc));
  }

  hasTypeSystemLocations(): boolean {
    return this.locations.some((loc) => isTypeSystemDirectiveLocation(loc));
  }

  applications(): ReadonlySet<Directive<SchemaElement<any, any>, TApplicationArgs>> {
    this._referencers ??= new Set();
    return this._referencers;
  }

  private addReferencer(referencer: Directive<SchemaElement<any, any>, TApplicationArgs>) {
    assert(referencer, 'Referencer should exists');
    this._referencers ??= new Set();
    this._referencers.add(referencer);
  }

  private removeReferencer(referencer: Directive<SchemaElement<any, any>, TApplicationArgs>) {
    this._referencers?.delete(referencer);
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Directive definition ${this} can't reference other types (it's arguments can); shouldn't be asked to remove reference to ${type}`);
  }

  /**
   * Removes this directive definition from its parent schema.
   *
   * After calling this method, this directive definition will be "detached": it will have no parent, schema, or
   * arguments.
   */
  remove(): Directive[] {
    if (!this._parent) {
      return [];
    }
    this.checkRemoval();
    this.onModification();
    // Remove this directive definition's children.
    this.sourceAST = undefined;
    assert(!this._appliedDirectives || this._appliedDirectives.length === 0, "Directive definition should not have directive applied to it");
    for (const arg of this.arguments()) {
      arg.remove();
    }
    // Remove this directive definition's references.
    //
    // Note that while a directive application references its definition, it
    // doesn't store a link to that definition. Instead, we fetch the definition
    // from the schema when requested. So we don't have to do anything on the
    // referencers other than clear them (and return the pre-cleared set).
    const toReturn = Array.from(this._referencers ?? []);
    this._referencers = undefined;
    // Remove this directive definition from its parent schema.
    Schema.prototype['removeDirectiveInternal'].call(this._parent, this);
    this._parent = undefined;
    return toReturn;
  }

  /**
   * Removes this this directive definition _and_ all its applications.
   */
  removeRecursive(): void {
    this.remove().forEach(ref => ref.remove());
  }

  toAST(): DirectiveDefinitionNode {
    const doc = parse(printDirectiveDefinition(this));
    return doc.definitions[0] as DirectiveDefinitionNode;
  }

  toString(): string {
    return `@${this.name}`;
  }
}

export class Directive<
  TParent extends SchemaElement<any, any> | DirectiveTargetElement<any> = SchemaElement<any, any>,
  TArgs extends {[key: string]: any} = {[key: string]: any}
> extends Element<TParent> implements Named {
  // Note that _extension will only be set for directive directly applied to an extendable element. Meaning that if a directive is
  // applied to a field that is part of an extension, the field will have its extension set, but not the underlying directive.
  private _extension?: Extension<any>;

  constructor(readonly name: string, private _args: TArgs = Object.create(null)) {
    super();
  }

  schema(): Schema {
    return this.parent.schema();
  }

  get definition(): DirectiveDefinition | undefined {
    if (!this.isAttached()) {
      return undefined;
    }
    const doc = this.schema();
    return doc.directive(this.name);
  }

  arguments(includeDefaultValues: boolean = false) : Readonly<TArgs> {
    if (!includeDefaultValues) {
      return this._args;
    }
    const definition = this.definition;
    assert(definition, () => `Cannot include default values for arguments: cannot find directive definition for ${this.name}`);
    const updated = Object.create(null);
    for (const argDef of definition.arguments()) {
      const argValue = withDefaultValues(this._args[argDef.name], argDef);
      // Note that argValue could be '0' or something falsy here, so we must explicitly check === undefined
      if (argValue !== undefined) {
        updated[argDef.name] = argValue;
      }
    }
    return updated;
  }

  private onModification() {
    if (this.isAttachedToSchemaElement()) {
      Schema.prototype['onModification'].call(this.schema());
    }
  }

  private isAttachedToSchemaElement(): boolean {
    return this.isAttached();
  }

  setArguments(args: TArgs) {
    this._args = args;
    this.onModification();
  }

  argumentType(name: string): InputType | undefined {
    return this.definition?.argument(name)?.type;
  }

  matchArguments(expectedArgs: Record<string, any>): boolean {
    const entries = Object.entries(this._args);
    if (entries.length !== Object.keys(expectedArgs).length) {
      return false;
    }
    for (const [key, val] of entries) {
      if (!(key in expectedArgs)) {
        return false;
      }
      const expectedVal = expectedArgs[key];
      if (!valueEquals(expectedVal, val)) {
        return false;
      }
    }
    return true;
  }

  ofExtension(): Extension<any> | undefined {
    return this._extension;
  }

  removeOfExtension() {
    this._extension = undefined;
  }

  setOfExtension(extension: Extension<any> | undefined) {
    this.checkUpdate();
    if (extension) {
      const parent = this.parent;
      assert(
        parent instanceof SchemaDefinition || parent instanceof BaseNamedType,
        'Can only mark directive parts of extensions when directly apply to type or schema definition.'
      );
      assert(parent.hasExtension(extension), () => `Cannot mark directive ${this.name} as part of the provided extension: it is not an extension of parent ${parent}`);
    }
    this._extension = extension;
    this.onModification();
  }

  argumentsToAST(): ConstArgumentNode[] | undefined {
    const entries = Object.entries(this._args);
    if (entries.length === 0) {
      return undefined;
    }

    const definition = this.definition;
    assert(definition, () => `Cannot convert arguments of detached directive ${this}`);
    return entries.map(([n, v]) => {
      return {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: n },
        value: valueToAST(v, definition.argument(n)!.type!)! as ConstValueNode,
      };
    });
  }

  /**
   * Removes this directive application from its parent type.
   *
   * @returns whether the directive was actually removed, that is whether it had a parent.
   */
  remove(): boolean {
    if (!this._parent) {
      return false;
    }
    this.onModification();
    const coreFeatures = this.schema().coreFeatures;
    if (coreFeatures && this.name === coreFeatures.coreItself.nameInSchema) {
      // We're removing a @core/@link directive application, so we remove it from the list of core features. And
      // if it is @core itself, we clean all features (to avoid having things too inconsistent).
      const url = FeatureUrl.parse(this._args[coreFeatures.coreDefinition.urlArgName()]!);
      if (url.identity === coreFeatures.coreItself.url.identity) {
        // Note that we unmark first because the loop after that will nuke our parent.
        Schema.prototype['unmarkAsCoreSchema'].call(this.schema());
        for (const d of this.schema().schemaDefinition.appliedDirectivesOf(coreFeatures.coreItself.nameInSchema)) {
          d.removeInternal();
        }
        // The loop above will already have call removeInternal on this instance, so we can return
        return true;
      } else {
        CoreFeatures.prototype['removeFeature'].call(coreFeatures, url.identity);
      }
    }
    return this.removeInternal();
  }

  private removeInternal(): boolean {
    if (!this._parent) {
      return false;
    }
    // Remove this directive application's reference to its definition.
    const definition = this.definition;
    if (definition && this.isAttachedToSchemaElement()) {
      DirectiveDefinition.prototype['removeReferencer'].call(definition, this as Directive<SchemaElement<any, any>>);
    }
    // Remove this directive application from its parent schema element.
    const parentDirectives = this._parent.appliedDirectives as Directive<TParent>[];
    const removed = removeArrayElement(this, parentDirectives);
    assert(removed, () => `Directive ${this} lists ${this._parent} as parent, but that parent doesn't list it as applied directive`);
    this._parent = undefined;
    this._extension = undefined;
    return true;
  }

  toString(): string {
    const entries = Object.entries(this._args).filter(([_, v]) => v !== undefined);
    const args = entries.length == 0 ? '' : '(' + entries.map(([n, v]) => `${n}: ${valueToString(v, this.argumentType(n))}`).join(', ') + ')';
    return `@${this.name}${args}`;
  }
}

/**
 * Formats a Directive array as a string (with a leading space, if present).
 */
export function directivesToString(directives?: readonly Directive<any>[])
  : string
{
  return (!directives || directives.length == 0)
        ? ''
        : ' ' + directives.join(' ');
}

/**
 * Converts a Directive array into DirectiveNode array.
 */
export function directivesToDirectiveNodes(directives?: readonly Directive<any>[])
  : ConstDirectiveNode[] | undefined
{
  return (!directives || directives.length === 0)
    ? undefined
    : directives.map(directive => {
      return {
        kind: Kind.DIRECTIVE,
        name: {
          kind: Kind.NAME,
          value: directive.name,
        },
        arguments: directive.argumentsToAST()
      };
    });
}

/**
 * Checks if 2 directive applications should be considered equal.
 *
 * By default, 2 directive applications are considered equal if they are for the same directive and are passed the same values to
 * the same arguments. However, some special directive can be excluded so that no 2 applications are ever consider equal. By default,
 * this is the case of @defer, as never want to merge @defer applications so that each create its own "deferred block".
 */
export function sameDirectiveApplication(
  application1: Directive<any, any>,
  application2: Directive<any, any>,
  directivesNeverEqualToThemselves: string[] = [ 'defer' ],
): boolean {
  // Note: we check name equality first because this method is most often called with directive that are simply not the same
  // name and this ensure we exit cheaply more often than not.
  return application1.name === application2.name
    && !directivesNeverEqualToThemselves.includes(application1.name)
    && !directivesNeverEqualToThemselves.includes(application2.name)
    && argumentsEquals(application1.arguments(), application2.arguments());
}

/**
 * Checks whether the 2 provided "set" of directive applications are the same (same applications, regardless or order).
 */
export function sameDirectiveApplications(
  applications1: readonly Directive<any, any>[],
  applications2: readonly Directive<any, any>[],
  directivesNeverEqualToThemselves: string[] = [ 'defer' ],
): boolean {
  if (applications1.length !== applications2.length) {
    return false;
  }

  for (const directive1 of applications1) {
    if (!applications2.some(directive2 => sameDirectiveApplication(directive1, directive2, directivesNeverEqualToThemselves))) {
      return false;
    }
  }
  return true;
}

/**
 * Checks whether a given array of directive applications (`maybeSubset`) is a sub-set of another array of directive applications (`applications`).
 *
 * Sub-set here means that all of the applications in `maybeSubset` appears in `applications`.
 */
export function isDirectiveApplicationsSubset(applications: readonly Directive<any, any>[], maybeSubset: readonly Directive<any, any>[]): boolean {
  if (maybeSubset.length > applications.length) {
    return false;
  }

  for (const directive1 of maybeSubset) {
    if (!applications.some(directive2 => sameDirectiveApplication(directive1, directive2))) {
      return false;
    }
  }
  return true;
}

/**
 * Computes the difference between the set of directives applications `baseApplications` and the `toRemove` one.
 */
export function directiveApplicationsSubstraction(baseApplications: readonly Directive<any, any>[], toRemove: readonly Directive<any, any>[]): Directive<any, any>[] {
  return baseApplications.filter((application) => !toRemove.some((other) => sameDirectiveApplication(application, other)));
}

export class Variable {
  constructor(readonly name: string) {}

  toVariableNode(): VariableNode {
    return {
      kind: Kind.VARIABLE,
      name: { kind: Kind.NAME, value: this.name },
    }
  }

  toString(): string {
    return '$' + this.name;
  }
}

export type Variables = readonly Variable[];

export class VariableCollector {
  private readonly _variables = new Map<string, Variable>();

  add(variable: Variable) {
    this._variables.set(variable.name, variable);
  }

  addAll(variables: Variables) {
    for (const variable of variables) {
      this.add(variable);
    }
  }

  collectInArguments(args: {[key: string]: any}) {
    for (const value of Object.values(args)) {
      collectVariablesInValue(value, this);
    }
  }

  variables() {
    return mapValues(this._variables);
  }

  toString(): string {
    return this.variables().toString();
  }
}

export function isVariable(v: any): v is Variable {
  return v instanceof Variable;
}

export class VariableDefinition extends DirectiveTargetElement<VariableDefinition> {
  constructor(
    schema: Schema,
    readonly variable: Variable,
    readonly type: InputType,
    readonly defaultValue?: any,
  ) {
    super(schema);
  }

  toVariableDefinitionNode(): VariableDefinitionNode {
    const ast = valueToAST(this.defaultValue, this.type);

    return {
      kind: Kind.VARIABLE_DEFINITION,
      variable: this.variable.toVariableNode(),
      type: typeToAST(this.type),
      defaultValue: (ast !== undefined) ? valueNodeToConstValueNode(ast) : undefined,
      directives: this.appliedDirectivesToDirectiveNodes(),
    }
  }

  toString() {
    let base = this.variable + ': ' + this.type;
    if (this.defaultValue !== undefined) {
      base = base + ' = ' + valueToString(this.defaultValue, this.type);
    }
    return base + this.appliedDirectivesToString();
  }
}

export class VariableDefinitions {
  private readonly _definitions: MapWithCachedArrays<string, VariableDefinition> = new MapWithCachedArrays();

  add(definition: VariableDefinition): boolean {
    if (this._definitions.has(definition.variable.name)) {
      return false;
    }
    this._definitions.set(definition.variable.name, definition);
    return true;
  }

  addAll(definitions: VariableDefinitions) {
    for (const definition of definitions._definitions.values()) {
      this.add(definition);
    }
  }

  definition(variable: Variable | string): VariableDefinition | undefined {
    const varName = typeof variable === 'string' ? variable : variable.name;
    return this._definitions.get(varName);
  }

  isEmpty(): boolean {
    return this._definitions.size === 0;
  }

  definitions(): readonly VariableDefinition[] {
    return this._definitions.values();
  }

  filter(variables: Variables): VariableDefinitions {
    if (variables.length === 0) {
      return new VariableDefinitions();
    }

    const newDefs = new VariableDefinitions();
    for (const variable of variables) {
      const def = this.definition(variable);
      if (!def) {
        throw new Error(`Cannot find variable ${variable} in definitions ${this}`);
      }
      newDefs.add(def);
    }
    return newDefs;
  }

  toVariableDefinitionNodes(): readonly VariableDefinitionNode[] | undefined {
    if (this._definitions.size === 0) {
      return undefined;
    }

    return this.definitions().map(def => def.toVariableDefinitionNode());
  }

  toString() {
    return '(' + this.definitions().join(', ') + ')';
  }
}

export function variableDefinitionsFromAST(schema: Schema, definitionNodes: readonly VariableDefinitionNode[]): VariableDefinitions {
  const definitions = new VariableDefinitions();
  for (const definitionNode of definitionNodes) {
    if (!definitions.add(variableDefinitionFromAST(schema, definitionNode))) {
      const name = definitionNode.variable.name.value;
      throw ERRORS.INVALID_GRAPHQL.err(`Duplicate definition for variable ${name}`, { nodes: definitionNodes.filter(n => n.variable.name.value === name) });
    }
  }
  return definitions;
}

export function variableDefinitionFromAST(schema: Schema, definitionNode: VariableDefinitionNode): VariableDefinition {
  const variable = new Variable(definitionNode.variable.name.value);
  const type = typeFromAST(schema, definitionNode.type);
  if (!isInputType(type)) {
    throw ERRORS.INVALID_GRAPHQL.err(`Invalid type "${type}" for variable $${variable}: not an input type`, { nodes: definitionNode.type });
  }
  const def = new VariableDefinition(
    schema,
    variable,
    type,
    definitionNode.defaultValue ? valueFromAST(definitionNode.defaultValue, type) : undefined
  );
  return def;
}

function addReferenceToType(referencer: SchemaElement<any, any>, type: Type) {
  switch (type.kind) {
    case 'ListType':
      addReferenceToType(referencer, type.baseType());
      break;
    case 'NonNullType':
      addReferenceToType(referencer, type.baseType());
      break;
    default:
      BaseNamedType.prototype['addReferencer'].call(type, referencer);
      break;
  }
}

function removeReferenceToType(referencer: SchemaElement<any, any>, type: Type) {
  switch (type.kind) {
    case 'ListType':
      removeReferenceToType(referencer, type.baseType());
      break;
    case 'NonNullType':
      removeReferenceToType(referencer, type.baseType());
      break;
    default:
      BaseNamedType.prototype['removeReferencer'].call(type, referencer);
      break;
  }
}

export function newNamedType(kind: NamedTypeKind, name: string): NamedType {
  switch (kind) {
    case 'ScalarType':
      return new ScalarType(name);
    case 'ObjectType':
      return new ObjectType(name);
    case 'InterfaceType':
      return new InterfaceType(name);
    case 'UnionType':
      return new UnionType(name);
    case 'EnumType':
      return new EnumType(name);
    case 'InputObjectType':
      return new InputObjectType(name);
    default:
      assert(false, `Unhandled kind ${kind} for type ${name}`);
  }
}

function *typesToCopy(source: Schema, dest: Schema): Generator<NamedType, void, undefined>  {
  for (const type of source.builtInTypes()) {
    if (!type.isIntrospectionType() && !dest.type(type.name)?.isBuiltIn) {
      yield type;
    }
  }
  yield* source.types();
}

function *directivesToCopy(source: Schema, dest: Schema): Generator<DirectiveDefinition, void, undefined>  {
  for (const directive of source.builtInDirectives()) {
    if (!dest.directive(directive.name)?.isBuiltIn) {
      yield directive;
    }
  }
  yield* source.directives();
}

/**
 * Creates, in the provided schema, a directive definition equivalent to the provided one.
 *
 * Note that this method assumes that:
 *  - the provided schema does not already have a directive with the name of the definition to copy.
 *  - if the copied definition has arguments, then the provided schema has existing types with
 *    names matching any type used in copied definition.
 */
export function copyDirectiveDefinitionToSchema({
  definition,
  schema,
  copyDirectiveApplicationsInArguments = true,
  locationFilter,
}: {
  definition: DirectiveDefinition,
  schema: Schema,
  copyDirectiveApplicationsInArguments: boolean,
  locationFilter?: (loc: DirectiveLocation) => boolean,
}
) {
  copyDirectiveDefinitionInner(
    definition,
    schema.addDirectiveDefinition(definition.name),
    copyDirectiveApplicationsInArguments,
    locationFilter,
  );
}

function copy(source: Schema, dest: Schema, cloneJoinDirectives: boolean) {
  // We shallow copy types first so any future reference to any of them can be dereferenced.
  for (const type of typesToCopy(source, dest)) {
    dest.addType(newNamedType(type.kind, type.name));
  }
  // Directives can use other directives in their arguments. So, like types, we first shallow copy
  // directives so future references to any of them can be dereferenced. We'll copy the actual
  // definition later after all directives are defined.
  for (const directive of directivesToCopy(source, dest)) {
    dest.addDirectiveDefinition(directive.name);
  }
  for (const directive of directivesToCopy(source, dest)) {
    copyDirectiveDefinitionInner(directive, dest.directive(directive.name)!);
  }

  copySchemaDefinitionInner(source.schemaDefinition, dest.schemaDefinition);
  for (const type of typesToCopy(source, dest)) {
    copyNamedTypeInner(type, dest.type(type.name)!, cloneJoinDirectives);
  }
}

function copyExtensions<T extends ExtendableElement>(source: T, dest: T): Map<Extension<T>, Extension<T>> {
  const extensionMap = new Map<Extension<T>, Extension<T>>();
  for (const sourceExtension of source.extensions()) {
    const destExtension = new Extension<T>();
    dest.addExtension(destExtension as any);
    extensionMap.set(sourceExtension as any, destExtension);
  }
  return extensionMap;
}

function copyOfExtension<T extends ExtendableElement>(
  extensionsMap: Map<Extension<T>, Extension<T>>,
  source: { ofExtension(): Extension<T> | undefined },
  dest: { setOfExtension(ext: Extension<T> | undefined):any }
) {
  const toCopy = source.ofExtension();
  if (toCopy) {
    dest.setOfExtension(extensionsMap.get(toCopy));
  }
}

function copySchemaDefinitionInner(source: SchemaDefinition, dest: SchemaDefinition) {
  dest.preserveEmptyDefinition = source.preserveEmptyDefinition;
  const extensionsMap = copyExtensions(source, dest);
  for (const rootType of source.roots()) {
    copyOfExtension(extensionsMap, rootType, dest.setRoot(rootType.rootKind, rootType.type.name));
  }
  // Same as copyAppliedDirectives, but as the directive applies to the schema definition, we need to remember if the application
  // is for the extension or not.
  for (const directive of source.appliedDirectives) {
    copyOfExtension(extensionsMap, directive, copyAppliedDirective(directive, dest));
  }
  dest.description = source.description;
  dest.sourceAST = source.sourceAST;
}

function copyNamedTypeInner(source: NamedType, dest: NamedType, cloneJoinDirectives: boolean) {
  dest.preserveEmptyDefinition = source.preserveEmptyDefinition;
  const extensionsMap = copyExtensions(source, dest);
  // Same as copyAppliedDirectives, but as the directive applies to the type, we need to remember if the application
  // is for the extension or not.
  for (const directive of source.appliedDirectives) {
    copyOfExtension(extensionsMap, directive, copyAppliedDirective(directive, dest));
  }
  dest.description = source.description;
  dest.sourceAST = source.sourceAST;
  switch (source.kind) {
    case 'ObjectType':
    case 'InterfaceType':
      const destFieldBasedType = dest as FieldBasedType<any, any>;
      for (const sourceField of source.fields()) {
        const destField = destFieldBasedType.addField(new FieldDefinition(sourceField.name));
        copyOfExtension(extensionsMap, sourceField, destField);
        copyFieldDefinitionInner(sourceField, destField, cloneJoinDirectives);
      }
      for (const sourceImpl of source.interfaceImplementations()) {
        const destImpl = destFieldBasedType.addImplementedInterface(sourceImpl.interface.name);
        copyOfExtension(extensionsMap, sourceImpl, destImpl);
      }
      break;
    case 'UnionType':
      const destUnionType = dest as UnionType;
      for (const sourceType of source.members()) {
        const destType = destUnionType.addType(sourceType.type.name);
        copyOfExtension(extensionsMap, sourceType, destType);
      }
      break;
    case 'EnumType':
      const destEnumType = dest as EnumType;
      for (const sourceValue of source.values) {
        const destValue = destEnumType.addValue(sourceValue.name);
        destValue.description = sourceValue.description;
        copyOfExtension(extensionsMap, sourceValue, destValue);
        copyAppliedDirectives(sourceValue, destValue, cloneJoinDirectives);
      }
      break
    case 'InputObjectType':
      const destInputType = dest as InputObjectType;
      for (const sourceField of source.fields()) {
        const destField = destInputType.addField(new InputFieldDefinition(sourceField.name));
        copyOfExtension(extensionsMap, sourceField, destField);
        copyInputFieldDefinitionInner(sourceField, destField, cloneJoinDirectives);
      }
  }
}

function copyAppliedDirectives(source: SchemaElement<any, any>, dest: SchemaElement<any, any>, cloneJoinDirectives: boolean) {
  source.appliedDirectives.filter(d => cloneJoinDirectives || !d.name.startsWith('join__')).forEach((d) => copyAppliedDirective(d, dest));
}

function copyAppliedDirective(source: Directive<any, any>, dest: SchemaElement<any, any>): Directive<any, any> {
  const res = dest.applyDirective(source.name, { ...source.arguments() });
  res.sourceAST = source.sourceAST
  return res;
}

function copyFieldDefinitionInner<P extends ObjectType | InterfaceType>(source: FieldDefinition<P>, dest: FieldDefinition<P>, cloneJoinDirectives: boolean) {
  const type = copyWrapperTypeOrTypeRef(source.type, dest.schema()) as OutputType;
  dest.type = type;
  for (const arg of source.arguments()) {
    const argType = copyWrapperTypeOrTypeRef(arg.type, dest.schema());
    copyArgumentDefinitionInner({
      source: arg, 
      dest: dest.addArgument(arg.name, argType as InputType),
      cloneJoinDirectives,
    });
  }
  copyAppliedDirectives(source, dest, cloneJoinDirectives);
  dest.description = source.description;
  dest.sourceAST = source.sourceAST;
}

function copyInputFieldDefinitionInner(source: InputFieldDefinition, dest: InputFieldDefinition, cloneJoinDirectives: boolean) {
  const type = copyWrapperTypeOrTypeRef(source.type, dest.schema()) as InputType;
  dest.type = type;
  dest.defaultValue = source.defaultValue;
  copyAppliedDirectives(source, dest, cloneJoinDirectives);
  dest.description = source.description;
  dest.sourceAST = source.sourceAST;
}

function copyWrapperTypeOrTypeRef(source: Type | undefined, destParent: Schema): Type | undefined {
  if (!source) {
    return undefined;
  }
  switch (source.kind) {
    case 'ListType':
      return new ListType(copyWrapperTypeOrTypeRef(source.ofType, destParent)!);
    case 'NonNullType':
      return new NonNullType(copyWrapperTypeOrTypeRef(source.ofType, destParent)! as NullableType);
    default:
      return destParent.type(source.name)!;
  }
}

function copyArgumentDefinitionInner<P extends FieldDefinition<any> | DirectiveDefinition>({
  source,
  dest,
  copyDirectiveApplications = true,
  cloneJoinDirectives,
}: {
  source: ArgumentDefinition<P>,
  dest: ArgumentDefinition<P>,
  copyDirectiveApplications?: boolean,
  cloneJoinDirectives: boolean,
}) {
  const type = copyWrapperTypeOrTypeRef(source.type, dest.schema()) as InputType;
  dest.type = type;
  dest.defaultValue = source.defaultValue;
  if (copyDirectiveApplications) {
    copyAppliedDirectives(source, dest, cloneJoinDirectives);
  }
  dest.description = source.description;
  dest.sourceAST = source.sourceAST;
}

function copyDirectiveDefinitionInner(
  source: DirectiveDefinition,
  dest: DirectiveDefinition,
  copyDirectiveApplicationsInArguments: boolean = true,
  locationFilter?: (loc: DirectiveLocation) => boolean,
) {
  let locations = source.locations;
  if (locationFilter) {
    locations = locations.filter((loc) => locationFilter(loc));
  }
  if (locations.length === 0) {
    return;
  }

  for (const arg of source.arguments()) {
    const type = copyWrapperTypeOrTypeRef(arg.type, dest.schema());
    copyArgumentDefinitionInner({
      source: arg,
      dest: dest.addArgument(arg.name, type as InputType),
      copyDirectiveApplications: copyDirectiveApplicationsInArguments,
      cloneJoinDirectives: true,
    });
  }
  dest.repeatable = source.repeatable;
  dest.addLocations(...locations);
  dest.sourceAST = source.sourceAST;
  dest.description = source.description;
}

export function isFieldDefinition(elem: SchemaElement<any, any>): elem is FieldDefinition<any> {
  return elem instanceof FieldDefinition;
}
