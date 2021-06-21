import {
  ASTNode,
  DirectiveLocation,
  DirectiveLocationEnum,
  GraphQLError
} from "graphql";
import { assert } from "./utils";
import deepEqual from 'deep-equal';

export type QueryRoot = 'query';
export type MutationRoot = 'mutation';
export type SubscriptionRoot = 'subscription';
export type SchemaRoot = QueryRoot | MutationRoot | SubscriptionRoot;

export type Type = NamedType | WrapperType;
export type NamedType = ScalarType | ObjectType | InterfaceType | UnionType | EnumType | InputObjectType;
export type OutputType = ScalarType | ObjectType | InterfaceType | UnionType | EnumType | ListType<any> | NonNullType<any>;
export type InputType = ScalarType | EnumType | InputObjectType | ListType<any> | NonNullType<any>;
export type WrapperType = ListType<any> | NonNullType<any>;

export type OutputTypeReferencer = FieldDefinition<any>;
export type InputTypeReferencer = InputFieldDefinition | ArgumentDefinition<any>;
export type ObjectTypeReferencer = OutputTypeReferencer | UnionType | SchemaDefinition;
export type InterfaceTypeReferencer = OutputTypeReferencer | ObjectType | InterfaceType;

export type NullableType = NamedType | ListType<any>;

export type NamedTypeKind = NamedType['kind'];

export function defaultRootTypeName(root: SchemaRoot) {
  return root.charAt(0).toUpperCase() + root.slice(1);
}

export function isNamedType(type: Type): type is NamedType {
  return type instanceof BaseNamedType;
}

export function isWrapperType(type: Type): type is WrapperType {
  return type.kind == 'ListType' || type.kind == 'NonNullType';
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

export function ensureOutputType(type: Type): OutputType {
  if (isOutputType(type)) {
    return type;
  } else {
    throw new Error(`Type ${type} (${type.kind}) is not an output type`);
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

export function ensureInputType(type: Type): InputType {
  if (isInputType(type)) {
    return type;
  } else {
    throw new Error(`Type ${type} (${type.kind}) is not an input type`);
  }
}

export function baseType(type: Type): NamedType {
  return isWrapperType(type) ? type.baseType() : type;
}

export interface Named {
  readonly name: string;
}

// Note exposed: mostly about avoid code duplication between SchemaElement and Directive (which is not a SchemaElement as it can't
// have applied directives or a description
abstract class Element<TParent extends SchemaElement<any> | Schema> {
  protected _parent?: TParent;
  sourceAST?: ASTNode;

  schema(): Schema | undefined {
    if (!this._parent) {
      return undefined;
    } else if (this._parent instanceof Schema) {
      // Note: at the time of this writing, it seems like typescript type-checking breaks a bit around generics. 
      // At this point of the code, `this._parent` is typed as 'TParent & Schema', but for some reason this is
      // "not assignable to type 'Schema | undefined'" (which sounds wrong: if my type theory is not too broken,
      // 'A & B' should always be assignable to both 'A' and 'B').
      return this._parent as any;
    } else {
      return (this._parent as SchemaElement<any>).schema();
    }
  }

  get parent(): TParent | undefined {
    return this._parent;
  }

  protected setParent(parent: TParent) {
    assert(!this._parent, "Cannot set parent of a non-detached element");
    this._parent = parent;
  }
}

export abstract class SchemaElement<TParent extends SchemaElement<any> | Schema> extends Element<TParent> {
  protected readonly _appliedDirectives: Directive[] = [];
  description?: string;

  get appliedDirectives(): readonly Directive[] {
    return this._appliedDirectives;
  }

  appliedDirectivesOf(name: string): Directive[];
  appliedDirectivesOf<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}>(definition: DirectiveDefinition<TApplicationArgs>): Directive<TApplicationArgs>[];
  appliedDirectivesOf(nameOrDefinition: string | DirectiveDefinition): Directive[] {
    const directiveName = typeof nameOrDefinition === 'string' ? nameOrDefinition : nameOrDefinition.name;
    return this._appliedDirectives.filter(d => d.name == directiveName);
  }

  applyDirective<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}>(
    nameOrDefOrDirective: Directive<TApplicationArgs> | DirectiveDefinition<TApplicationArgs> | string,
    args?: TApplicationArgs
  ): Directive<TApplicationArgs> {
    let toAdd: Directive<TApplicationArgs>;
    if (nameOrDefOrDirective instanceof Directive) {
      this.checkUpdate(nameOrDefOrDirective);
      toAdd = nameOrDefOrDirective;
      if (args) {
        toAdd.setArguments(args);
      }
    } else {
      let name: string;
      if (typeof nameOrDefOrDirective === 'string') {
        this.checkUpdate();
        const def = this.schema()!.directive(nameOrDefOrDirective);
        if (!def) {
          throw new GraphQLError(`Cannot apply unkown directive ${nameOrDefOrDirective}`);
        }
        name = nameOrDefOrDirective;
      } else {
        this.checkUpdate(nameOrDefOrDirective);
        name = nameOrDefOrDirective.name;
      }
      toAdd = new Directive<TApplicationArgs>(name, args ?? Object.create(null));
      Element.prototype['setParent'].call(toAdd, this);
    }
    // TODO: we should typecheck arguments or our TApplicationArgs business is just a lie.
    this._appliedDirectives.push(toAdd);
    DirectiveDefinition.prototype['addReferencer'].call(toAdd.definition!, toAdd);
    return toAdd;
  }

  protected isElementBuiltIn(): boolean {
    return false;
  }

  protected removeTypeReferenceInternal(type: BaseNamedType<any>) {
    // This method is a bit of a hack: we don't want to expose it and we call it from an other class, so we call it though
    // `SchemaElement.prototype`, but we also want this to abstract as it can only be impemented by each concrete subclass.
    // As we can't have both at the same time, this method just delegate to `remoteTypeReference` which is genuinely
    // abstract. This also allow to work around the typing issue that the type checker cannot tell that every BaseNamedType
    // is a NamedType (because in theory, someone could extend BaseNamedType without listing it in NamedType; but as
    // BaseNamedType is not exported and we don't plan to make that mistake ...).
    this.removeTypeReference(type as any);
  }

  protected abstract removeTypeReference(type: NamedType): void;

  protected checkRemoval() {
    if (this.isElementBuiltIn() && !Schema.prototype['canModifyBuiltIn'].call(this.schema()!)) {
      throw buildError(`Cannot modify built-in ${this}`);
    }
    // We allow removals even on detached element because that doesn't particularly create issues (and we happen to do such
    // removals on detached internally; though of course we could refactor the code if we wanted).
  }

  protected checkUpdate(addedElement?: { schema(): Schema | undefined }) {
    if (this.isElementBuiltIn() && !Schema.prototype['canModifyBuiltIn'].call(this.schema()!)) {
      throw buildError(`Cannot modify built-in ${this}`);
    }
    // Allowing to add element to a detached element would get hairy. Because that would mean that when you do attach an element,
    // you have to recurse within that element to all children elements to check whether they are attached or not and to which
    // schema. And if they aren't attached, attaching them as side-effect could be surprising (think that adding a single field
    // to a schema could bring a whole hierachy of types and directives for instance). If they are attached, it only work if
    // it's to the same schema, but you have to check.
    // Overall, it's simpler to force attaching elements before you add other elements to them.
    if (!this.schema()) {
      throw buildError(`Cannot modify detached element ${this}`);
    }
    if (addedElement) {
      const thatSchema = addedElement.schema();
      if (thatSchema && thatSchema != this.schema()) {
        throw buildError(`Cannot add element ${addedElement} to ${this} as its is attached another schema`);
      }
    }
  }
}

export abstract class NamedSchemaElement<TParent extends NamedSchemaElement<any, any> | Schema, TReferencer> extends SchemaElement<TParent> implements Named {
  constructor(readonly name: string) {
    super();
  }

  abstract coordinate: string;

  abstract remove(): TReferencer[];
}

abstract class BaseNamedType<TReferencer> extends NamedSchemaElement<Schema, TReferencer> {
  protected readonly _referencers: Set<TReferencer> = new Set();

  constructor(name: string, readonly isBuiltIn: boolean = false) {
    super(name);
  }

  private addReferencer(referencer: TReferencer) {
    this._referencers.add(referencer);
  }

  private removeReferencer(referencer: TReferencer) {
    this._referencers.delete(referencer);
  }

  get coordinate(): string {
    return this.name;
  }

  *allChildElements(): Generator<NamedSchemaElement<any, any>, void, undefined> {
    // Overriden by those types that do have chidrens
  }

  protected isElementBuiltIn(): boolean {
    return this.isBuiltIn;
  }

  /**
   * Removes this type definition from its parent schema.
   *
   * After calling this method, this type will be "detached": it wil have no parent, schema, fields,
   * values, directives, etc...
   *
   * Note that it is always allowed to remove a type, but this may make a valid schema
   * invalid, and in particular any element that references this type will, after this call, have an undefined
   * reference.
   *
   * @returns an array of all the elements in the schema of this type (before the removal) that were
   * referening this type (and have thus now an undefined reference).
   */
  remove(): TReferencer[] {
    if (!this._parent) {
      return [];
    }
    Schema.prototype['removeTypeInternal'].call(this._parent, this);
    this._parent = undefined;
    for (const directive of this._appliedDirectives) {
      directive.remove();
    }
    this.sourceAST = undefined;
    this.removeInnerElements();
    const toReturn = [... this._referencers].map(r => {
      SchemaElement.prototype['removeTypeReferenceInternal'].call(r, this);
      return r;
    });
    this._referencers.clear();
    return toReturn;
  }

  protected abstract removeInnerElements(): void;

  toString(): string {
    return this.name;
  }
}

abstract class BaseNamedElementWithType<TType extends Type, P extends NamedSchemaElement<any, any> | Schema, Referencer> extends NamedSchemaElement<P, Referencer> {
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
    assert(this._type && baseType(this._type) === type, `Cannot remove reference to type ${type} on ${this} as its type is ${this._type}`);
    this._type = undefined;
  }
}

function buildError(message: string): Error {
  // Maybe not the right error for this?
  return new GraphQLError(message);
}

export class BuiltIns {
  private readonly defaultGraphQLBuiltInTypes: readonly string[] = [ 'Int', 'Float', 'String', 'Boolean', 'ID' ];

  addBuiltInTypes(schema: Schema) {
    this.defaultGraphQLBuiltInTypes.forEach(t => this.addBuiltInScalar(schema, t));
  }

  addBuiltInDirectives(schema: Schema) {
    for (const name of ['include', 'skip']) {
      this.addBuiltInDirective(schema, name)
        .addLocations('FIELD', 'FRAGMENT_SPREAD', 'FRAGMENT_DEFINITION')
        .addArgument('if', new NonNullType(schema.booleanType()));
    }
    this.addBuiltInDirective(schema, 'deprecated')
      .addLocations('FIELD_DEFINITION', 'ENUM_VALUE')
      .addArgument('reason', schema.stringType(), 'No Longer Supported');
    this.addBuiltInDirective(schema, 'specifiedBy')
      .addLocations('SCALAR')
      .addArgument('url', new NonNullType(schema.stringType()));
  }

  protected addBuiltInScalar(schema: Schema, name: string): ScalarType {
    return schema.addType(new ScalarType(name, true));
  }

  protected addBuiltInObject(schema: Schema, name: string): ObjectType {
    return schema.addType(new ObjectType(name, true));
  }

  protected addBuiltInUnion(schema: Schema, name: string): UnionType {
    return schema.addType(new UnionType(name, true));
  }

  protected addBuiltInDirective(schema: Schema, name: string): DirectiveDefinition {
    return schema.addDirectiveDefinition(new DirectiveDefinition(name, true));
  }

  protected getTypedDirective<TApplicationArgs extends {[key: string]: any}>(
    schema: Schema,
    name: string
  ): DirectiveDefinition<TApplicationArgs> {
    const directive = schema.directive(name);
    if (!directive) {
      throw new Error(`The provided schema has not be built with the ${name} directive built-in`);
    }
    return directive as DirectiveDefinition<TApplicationArgs>;
  }

  includeDirective(schema: Schema): DirectiveDefinition<{if: boolean}> {
    return this.getTypedDirective(schema, 'include');
  }

  skipDirective(schema: Schema): DirectiveDefinition<{if: boolean}> {
    return this.getTypedDirective(schema, 'skip');
  }

  deprecatedDirective(schema: Schema): DirectiveDefinition<{reason?: string}> {
    return this.getTypedDirective(schema, 'deprecated');
  }

  specifiedByDirective(schema: Schema): DirectiveDefinition<{url: string}> {
    return this.getTypedDirective(schema, 'specifiedBy');
  }
}

export class Schema {
  private _schemaDefinition: SchemaDefinition;
  private readonly _builtInTypes: Map<string, NamedType> = new Map();
  private readonly _types: Map<string, NamedType> = new Map();
  private readonly _builtInDirectives: Map<string, DirectiveDefinition> = new Map();
  private readonly _directives: Map<string, DirectiveDefinition> = new Map();
  private readonly isConstructed: boolean;

  constructor(private readonly builtIns: BuiltIns = graphQLBuiltIns) {
    this._schemaDefinition = new SchemaDefinition();
    Element.prototype['setParent'].call(this._schemaDefinition, this);
    builtIns.addBuiltInTypes(this);
    builtIns.addBuiltInDirectives(this);
    this.isConstructed = true;
  }

  private canModifyBuiltIn(): boolean {
    return !this.isConstructed;
  }

  private removeTypeInternal(type: BaseNamedType<any>) {
    this._types.delete(type.name);
  }

  private removeDirectiveInternal(definition: DirectiveDefinition) {
    this._directives.delete(definition.name);
  }

  get schemaDefinition(): SchemaDefinition {
    return this._schemaDefinition;
  }

  /**
   * All the types defined on this schema _excluding_ the built-in types, unless explicitly requested.
   */
  *types(includeBuiltIns: boolean = false): Generator<NamedType, void, undefined> {
    if (includeBuiltIns) {
      yield* this._builtInTypes.values();
    }
    yield* this._types.values();
  }

  /**
   * All the built-in types for this schema (those that are not displayed when printing the schema).
   */
  builtInTypes(): IterableIterator<NamedType> {
    return this._builtInTypes.values();
  }

  /**
   * The type of the provide name in this schema if one is defined or if it is the name of a built-in.
   */
  type(name: string): NamedType | undefined {
    const type = this._types.get(name);
    return type ? type : this._builtInTypes.get(name);
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

  addType<T extends NamedType>(type: T): T {
    if (this.type(type.name)) {
      throw buildError(`Type ${type} already exists in this schema`);
    }
    if (type.parent) {
      // For convenience, let's not error out on adding an already added type.
      if (type.parent == this) {
        return type;
      }
      throw buildError(`Cannot add type ${type} to this schema; it is already attached to another schema`);
    }
    if (type.isBuiltIn) {
      if (!this.isConstructed) {
        this._builtInTypes.set(type.name, type);
      } else {
        throw buildError(`Cannot add built-in ${type} to this schema (built-ins can only be added at schema construction time)`);
      }
    } else {
      this._types.set(type.name, type);
    }
    Element.prototype['setParent'].call(type, this);
    return type;
  }

  /**
   * All the directive defined on this schema _excluding_ the built-in directives, unless explicitly requested.
   */
  *directives(includeBuiltIns: boolean = false): Generator<DirectiveDefinition, void, undefined> {
    if (includeBuiltIns) {
      yield* this._builtInDirectives.values();
    }
    yield* this._directives.values();
  }

  /**
   * All the built-in directives for this schema (those that are not displayed when printing the schema).
   */
  builtInDirectives(): IterableIterator<DirectiveDefinition> {
    return this._builtInDirectives.values();
  }

  directive(name: string): DirectiveDefinition | undefined {
    const directive = this._directives.get(name);
    return directive ? directive : this._builtInDirectives.get(name);
  }

  *allNamedSchemaElement(): Generator<NamedSchemaElement<any, any>, void, undefined> {
    for (const type of this.types()) {
      yield type;
      yield* type.allChildElements();
    }
    for (const directive of this.directives()) {
      yield directive;
      yield* directive.arguments();
    }
  }

  *allSchemaElement(): Generator<SchemaElement<any>, void, undefined> {
    yield this._schemaDefinition;
    yield* this.allNamedSchemaElement();
  }

  addDirectiveDefinition(name: string): DirectiveDefinition;
  addDirectiveDefinition(directive: DirectiveDefinition): DirectiveDefinition; addDirectiveDefinition(directiveOrName: string | DirectiveDefinition): DirectiveDefinition {
    const definition = typeof directiveOrName === 'string' ? new DirectiveDefinition(directiveOrName) : directiveOrName;
    if (this.directive(definition.name)) {
      throw buildError(`Directive ${definition} already exists in this schema`);
    }
    if (definition.parent) {
      // For convenience, let's not error out on adding an already added directive.
      if (definition.parent == this) {
        return definition;
      }
      throw buildError(`Cannot add directive ${definition} to this schema; it is already attached to another schema`);
    }
    if (definition.isBuiltIn) {
      if (!this.isConstructed) {
        this._builtInDirectives.set(definition.name, definition);
      } else {
        throw buildError(`Cannot add built-in ${definition} to this schema (built-ins can only be added at schema construction time)`);
      }
    } else {
      this._directives.set(definition.name, definition);
    }
    Element.prototype['setParent'].call(definition, this);
    return definition;
  }

  clone(builtIns?: BuiltIns): Schema {
    const cloned = new Schema(builtIns ?? this.builtIns);
    copy(this, cloned);
    return cloned;
  }
}

export class SchemaDefinition extends SchemaElement<Schema>  {
  readonly kind = 'SchemaDefinition' as const;
  protected readonly _roots: Map<SchemaRoot, ObjectType> = new Map();

  get roots(): ReadonlyMap<SchemaRoot, ObjectType> {
    return this._roots;
  }

  root(rootType: SchemaRoot): ObjectType | undefined {
    return this._roots.get(rootType);
  }

  setRoot(rootType: SchemaRoot, nameOrType: ObjectType | string): ObjectType {
    let toSet: ObjectType;
    if (typeof nameOrType === 'string') {
      this.checkUpdate();
      const obj = this.schema()!.type(nameOrType);
      if (!obj) {
        throw new GraphQLError(`Cannot set schema ${rootType} root to unknown type ${nameOrType}`);
      } else if (obj.kind != 'ObjectType') {
        throw new GraphQLError(`Cannot set schema ${rootType} root to non-object type ${nameOrType} (of type ${obj.kind})`);
      }
      toSet = obj;
    } else {
      this.checkUpdate(nameOrType);
      toSet = nameOrType;
    }
    this._roots.set(rootType, toSet);
    addReferenceToType(this, toSet);
    return toSet;
  }

  protected removeTypeReference(toRemove: NamedType) {
    for (const [root, type] of this._roots) {
      if (type == toRemove) {
        this._roots.delete(root);
      }
    }
  }

  toString() {
    return `schema[${[...this._roots.keys()].join(', ')}]`;
  }
}

export class ScalarType extends BaseNamedType<OutputTypeReferencer | InputTypeReferencer> {
  readonly kind = 'ScalarType' as const;

  protected removeTypeReference(type: NamedType) {
    assert(false, `Scalar type ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  protected removeInnerElements(): void {
    // No inner elements
  }
}

abstract class FieldBasedType<T extends ObjectType | InterfaceType, R> extends BaseNamedType<R> {
  protected readonly _interfaces: InterfaceType[] = [];
  protected readonly _fields: Map<string, FieldDefinition<T>> = new Map();

  private removeFieldInternal(field: FieldDefinition<T>) {
    this._fields.delete(field.name);
  }

  get interfaces(): readonly InterfaceType[] {
    return this._interfaces;
  }

  implementsInterface(name: string): boolean {
    return this._interfaces.some(i => i.name == name);
  }

  addImplementedInterface(nameOrItf: InterfaceType | string): InterfaceType {
    let toAdd: InterfaceType;
    if (typeof nameOrItf === 'string') {
      this.checkUpdate();
      const itf = this.schema()!.type(nameOrItf);
      if (!itf) {
        throw new GraphQLError(`Cannot implement unkown type ${nameOrItf}`);
      } else if (itf.kind != 'InterfaceType') {
        throw new GraphQLError(`Cannot implement non-interface type ${nameOrItf} (of type ${itf.kind})`);
      }
      toAdd = itf;
    } else {
      this.checkUpdate(nameOrItf);
      toAdd = nameOrItf;
    }
    if (!this._interfaces.includes(toAdd)) {
      this._interfaces.push(toAdd);
      addReferenceToType(this, toAdd);
    }
    return toAdd;
  }

  get fields(): ReadonlyMap<string, FieldDefinition<T>> {
    return this._fields;
  }

  field(name: string): FieldDefinition<T> | undefined {
    return this._fields.get(name);
  }

  addField(nameOrField: string | FieldDefinition<T>, type?: OutputType): FieldDefinition<T> {
    let toAdd: FieldDefinition<T>;
    if (typeof nameOrField === 'string') {
      this.checkUpdate();
      toAdd = new FieldDefinition<T>(nameOrField);
    } else {
      this.checkUpdate(nameOrField);
      toAdd = nameOrField;
    }
    if (this.field(toAdd.name)) {
      throw buildError(`Field ${toAdd.name} already exists on ${this}`);
    }
    this._fields.set(toAdd.name, toAdd);
    Element.prototype['setParent'].call(toAdd, this);
    // Note that we need to wait we have attached the field to set the type.
    if (type) {
      toAdd.type = type;
    }
    return toAdd;
  }

  *allChildElements(): Generator<NamedSchemaElement<any, any>, void, undefined> {
    for (const field of this._fields.values()) {
      yield field;
      yield* field.arguments.values();
    }
  }

  protected removeTypeReference(type: NamedType) {
    const index = this._interfaces.indexOf(type as InterfaceType);
    if (index >= 0) {
      this._interfaces.splice(index, 1);
    }
  }

  protected removeInnerElements(): void {
    this._interfaces.splice(0, this._interfaces.length);
    for (const field of this._fields.values()) {
      field.remove();
    }
  }
}

export class ObjectType extends FieldBasedType<ObjectType, ObjectTypeReferencer> {
  readonly kind = 'ObjectType' as const;
}

export class InterfaceType extends FieldBasedType<InterfaceType, InterfaceTypeReferencer> {
  readonly kind = 'InterfaceType' as const;

  allImplementations(): (ObjectType | InterfaceType)[] {
    return [...this._referencers].filter(ref => ref.kind === 'ObjectType' || ref.kind === 'InterfaceType') as (ObjectType | InterfaceType)[];
  }

  possibleRuntimeTypes(): readonly ObjectType[] {
    // Note that object types in GraphQL needs to reference directly all the interfaces they implement, and cannot rely on transitivity.
    return this.allImplementations().filter(impl => impl.kind === 'ObjectType') as ObjectType[];
  }
}

export class UnionType extends BaseNamedType<OutputTypeReferencer> {
  readonly kind = 'UnionType' as const;
  protected readonly _types: ObjectType[] = [];

  get types(): readonly ObjectType[] {
    return this._types;
  }

  addType(nameOrType: ObjectType | string): ObjectType {
    let toAdd: ObjectType;
    if (typeof nameOrType === 'string') {
      this.checkUpdate();
      const obj = this.schema()!.type(nameOrType);
      if (!obj) {
        throw new GraphQLError(`Cannot implement unkown type ${nameOrType}`);
      } else if (obj.kind != 'ObjectType') {
        throw new GraphQLError(`Cannot implement non-object type ${nameOrType} (of type ${obj.kind})`);
      }
      toAdd = obj;
    } else {
      this.checkUpdate(nameOrType);
      toAdd = nameOrType;
    }
    if (!this._types.includes(toAdd)) {
      this._types.push(toAdd);
      addReferenceToType(this, toAdd);
    }
    return toAdd;
  }

  protected removeTypeReference(type: NamedType) {
    const index = this._types.indexOf(type as ObjectType);
    if (index >= 0) {
      this._types.splice(index, 1);
    }
  }

  protected removeInnerElements(): void {
    this._types.splice(0, this._types.length);
  }
}

export class EnumType extends BaseNamedType<OutputTypeReferencer> {
  readonly kind = 'EnumType' as const;
  protected readonly _values: EnumValue[] = [];

  get values(): readonly EnumValue[] {
    return this._values;
  }

  value(name: string): EnumValue | undefined {
    return this._values.find(v => v.name == name);
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
    if (!this._values.includes(toAdd)) {
      this._values.push(toAdd);
    }
    return toAdd;
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Eum type ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  private removeValueInternal(value: EnumValue) {
    const index = this._values.indexOf(value);
    if (index >= 0) {
      this._values.splice(index, 1);
    }
  }

  protected removeInnerElements(): void {
    this._values.splice(0, this._values.length);
  }
}

export class InputObjectType extends BaseNamedType<InputTypeReferencer> {
  readonly kind = 'InputObjectType' as const;
  private readonly _fields: Map<string, InputFieldDefinition> = new Map();

  get fields(): ReadonlyMap<string, InputFieldDefinition> {
    return this._fields;
  }

  field(name: string): InputFieldDefinition | undefined {
    return this._fields.get(name);
  }

  addField(field: InputFieldDefinition): InputFieldDefinition;
  addField(name: string, type?: InputType): InputFieldDefinition;
  addField(nameOrField: string | InputFieldDefinition, type?: InputType): InputFieldDefinition {
    const toAdd = typeof nameOrField === 'string' ? new InputFieldDefinition(nameOrField) : nameOrField;
    this.checkUpdate(toAdd);
    if (this.field(toAdd.name)) {
      throw buildError(`Field ${toAdd.name} already exists on ${this}`);
    }
    this._fields.set(toAdd.name, toAdd);
    Element.prototype['setParent'].call(toAdd, this);
    // Note that we need to wait we have attached the field to set the type.
    if (typeof nameOrField === 'string') {
      toAdd.type = type;
    }
    return toAdd;
  }

  *allChildElements(): Generator<NamedSchemaElement<any, any>, void, undefined> {
    yield* this._fields.values();
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Input Object type ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  protected removeInnerElements(): void {
    for (const field of this._fields.values()) {
      field.remove();
    }
  }

  private removeFieldInternal(field: InputFieldDefinition) {
    this._fields.delete(field.name);
  }
}

class BaseWrapperType<T extends Type> {
  protected constructor(protected _type: T) {}

  schema(): Schema | undefined {
    return this.baseType().schema();
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

export class FieldDefinition<TParent extends ObjectType | InterfaceType> extends BaseNamedElementWithType<OutputType, TParent, never> {
  readonly kind = 'FieldDefinition' as const;
  private readonly _args: Map<string, ArgumentDefinition<FieldDefinition<TParent>>> = new Map();

  get coordinate(): string {
    const parent = this.parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}.${this.name}`;
  }

  get arguments(): ReadonlyMap<string, ArgumentDefinition<FieldDefinition<TParent>>> {
    return this._args;
  }

  argument(name: string): ArgumentDefinition<FieldDefinition<TParent>> | undefined {
    return this._args.get(name);
  }

  addArgument(arg: ArgumentDefinition<FieldDefinition<TParent>>): ArgumentDefinition<FieldDefinition<TParent>>;
  addArgument(name: string, type?: InputType, defaultValue?: any): ArgumentDefinition<FieldDefinition<TParent>>;
  addArgument(nameOrArg: string | ArgumentDefinition<FieldDefinition<TParent>>, type?: InputType, defaultValue?: any): ArgumentDefinition<FieldDefinition<TParent>> {
    let toAdd: ArgumentDefinition<FieldDefinition<TParent>>;
    if (typeof nameOrArg === 'string') {
      this.checkUpdate();
      toAdd = new ArgumentDefinition<FieldDefinition<TParent>>(nameOrArg);
      toAdd.defaultValue = defaultValue;
    } else {
      this.checkUpdate(nameOrArg);
      toAdd = nameOrArg;
    }
    if (this.argument(toAdd.name)) {
      throw buildError(`Argument ${toAdd.name} already exists on field ${this.name}`);
    }
    this._args.set(toAdd.name, toAdd);
    Element.prototype['setParent'].call(toAdd, this);
    if (typeof nameOrArg === 'string') {
      toAdd.type = type;
    }
    return toAdd;
  }

  /**
   * Removes this field definition from its parent type.
   *
   * After calling this method, this field definition will be "detached": it wil have no parent, schema, type,
   * arguments or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    FieldBasedType.prototype['removeFieldInternal'].call(this._parent, this);
    this._parent = undefined;
    this.type = undefined;
    for (const arg of this._args.values()) {
      arg.remove();
    }
    // Fields have nothing that can reference them outside of their parents
    return [];
  }

  toString(): string {
    const args = this._args.size == 0
      ? "" 
      : '(' + [...this._args.values()].map(arg => arg.toString()).join(', ') + ')';
    return `${this.name}${args}: ${this.type}`;
  }
}

export class InputFieldDefinition extends BaseNamedElementWithType<InputType, InputObjectType, never> {
  readonly kind = 'InputFieldDefinition' as const;

  get coordinate(): string {
    const parent = this.parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}.${this.name}`;
  }

  /**
   * Removes this field definition from its parent type.
   *
   * After calling this method, this field definition will be "detached": it wil have no parent, schema, type,
   * arguments or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    InputObjectType.prototype['removeFieldInternal'].call(this._parent, this);
    this._parent = undefined;
    this.type = undefined;
    // Fields have nothing that can reference them outside of their parents
    return [];
  }

  toString(): string {
    return `${this.name}: ${this.type}`;
  }
}

export class ArgumentDefinition<TParent extends FieldDefinition<any> | DirectiveDefinition> extends BaseNamedElementWithType<InputType, TParent, never> {
  readonly kind = 'ArgumentDefinition' as const;
  defaultValue?: any

  constructor(name: string) {
    super(name);
  }

  get coordinate(): string {
    const parent = this.parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}(${this.name}:)`;
  }

  /**
   * Removes this argument definition from its parent element (field or directive).
   *
   * After calling this method, this argument definition will be "detached": it wil have no parent, schema, type,
   * default value or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    (this._parent.arguments as Map<string, any>).delete(this.name);
    this._parent = undefined;
    this.type = undefined;
    this.defaultValue = undefined;
    return [];
  }

  toString() {
    const defaultStr = this.defaultValue == undefined ? "" : ` = ${valueToString(this.defaultValue)}`;
    return `${this.name}: ${this.type}${defaultStr}`;
  }
}

export class EnumValue extends NamedSchemaElement<EnumType, never> {
  readonly kind = 'EnumValue' as const;

  get coordinate(): string {
    const parent = this.parent;
    return `${parent == undefined ? '<detached>' : parent.coordinate}.${this.name}`;
  }

  /**
   * Removes this field definition from its parent type.
   *
   * After calling this method, this field definition will be "detached": it wil have no parent, schema, type,
   * arguments or directives.
   */
  remove(): never[] {
    if (!this._parent) {
      return [];
    }
    EnumType.prototype['removeValueInternal'].call(this._parent, this);
    this._parent = undefined;
    // Enum values have nothing that can reference them outside of their parents
    // TODO: that's actually not true if you include arguments (both default value in definition and concrete directive application).
    return [];
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Enum value ${this} can't reference other types; shouldn't be asked to remove reference to ${type}`);
  }

  toString(): string {
    return `${this.name}$`;
  }
}

export class DirectiveDefinition<TApplicationArgs extends {[key: string]: any} = {[key: string]: any}> extends NamedSchemaElement<Schema, Directive> {
  readonly kind = 'DirectiveDefinition' as const;

  private readonly _args: Map<string, ArgumentDefinition<DirectiveDefinition>> = new Map();
  repeatable: boolean = false;
  private readonly _locations: DirectiveLocationEnum[] = [];
  private readonly _referencers: Set<Directive<TApplicationArgs>> = new Set();

  constructor(name: string, readonly isBuiltIn: boolean = false) {
    super(name);
  }

  get coordinate(): string {
    return `@{this.name}`;
  }

  arguments(): IterableIterator<ArgumentDefinition<DirectiveDefinition>> {
    return this._args.values();
  }

  argument(name: string): ArgumentDefinition<DirectiveDefinition> | undefined {
    return this._args.get(name);
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
      throw buildError(`Argument ${toAdd.name} already exists on field ${this.name}`);
    }
    this._args.set(toAdd.name, toAdd);
    Element.prototype['setParent'].call(toAdd, this);
    if (typeof nameOrArg === 'string') {
      toAdd.type = type;
    }
    return toAdd;
  }

  get locations(): readonly DirectiveLocationEnum[] {
    return this._locations;
  }

  addLocations(...locations: DirectiveLocationEnum[]): DirectiveDefinition {
    for (const location of locations) {
      if (!this._locations.includes(location)) {
        this._locations.push(location);
      }
    }
    return this;
  }

  addAllLocations(): DirectiveDefinition {
    return this.addLocations(...Object.values(DirectiveLocation));
  }

  addAllTypeLocations(): DirectiveDefinition {
    return this.addLocations('SCALAR', 'OBJECT', 'INTERFACE', 'UNION', 'ENUM', 'INPUT_OBJECT');
  }

  removeLocations(...locations: DirectiveLocationEnum[]): DirectiveDefinition {
    for (const location of locations) {
      const index = this._locations.indexOf(location);
      if (index >= 0) {
        this._locations.splice(index, 1);
      }
    }
    return this;
  }

  private addReferencer(referencer: Directive<TApplicationArgs>) {
    assert(referencer, 'Referencer should exists');
    this._referencers.add(referencer);
  }

  protected removeTypeReference(type: NamedType) {
    assert(false, `Directive definition ${this} can't reference other types (it's arguments can); shouldn't be asked to remove reference to ${type}`);
  }

  remove(): Directive[] {
    if (!this._parent) {
      return [];
    }
    Schema.prototype['removeDirectiveInternal'].call(this._parent, this);
    this._parent = undefined;
    for (const directive of this._appliedDirectives) {
      directive.remove();
    }
    for (const arg of this._args.values()) {
      arg.remove();
    }
    // Note that directive applications don't link directly to their definitions. Instead, we fetch
    // their definition from the schema when requested. So we don't have to do anything on the referencers
    // other than return them.
    const toReturn = [... this._referencers];
    this._referencers.clear();
    return toReturn;
  }

  toString(): string {
    return this.name;
  }
}

// TODO: How do we deal with default values? It feels like it would make some sense to have `argument('x')` return the default
// value if `x` has one and wasn't explicitly set in the application. This would make code usage more pleasant. Should
// `arguments()` also return those though? Maybe have an option to both method to say if it should include them or not.
// (The question stands for matchArguments() as well though).
export class Directive<TArgs extends {[key: string]: any} = {[key: string]: any}> extends Element<SchemaElement<any>> implements Named {
  constructor(readonly name: string, private _args: TArgs) {
    super();
  }

  schema(): Schema | undefined {
    return this._parent?.schema();
  }

  get definition(): DirectiveDefinition | undefined {
    const doc = this.schema();
    return doc?.directive(this.name);
  }

  arguments() : TArgs {
    return this._args;
  }

  setArguments(args: TArgs) {
    this._args = args;
  }

  matchArguments(expectedArgs: Record<string, any>): boolean {
    const entries = Object.entries(this._args);
    if (entries.length !== Object.keys(expectedArgs).length) {
      return false;
    }
    for (var [key, val] of entries) {
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

  /**
   * Removes this directive application from its parent type.
   *
   * @returns whether the directive was actually removed, that is whether it had a parent.
   */
  remove(): boolean {
    if (!this._parent) {
      return false;
    }
    const parentDirectives = this._parent.appliedDirectives as Directive[];
    const index = parentDirectives.indexOf(this);
    assert(index >= 0, `Directive ${this} lists ${this._parent} as parent, but that parent doesn't list it as applied directive`);
    parentDirectives.splice(index, 1);
    this._parent = undefined;
    return true;
  }

  toString(): string {
    const entries = Object.entries(this._args);
    const args = entries.length == 0 ? '' : '(' + entries.map(([n, v]) => `${n}: ${valueToString(v)}`).join(', ') + ')';
    return `@${this.name}${args}`;
  }
}

export const graphQLBuiltIns = new BuiltIns();

function valueToString(v: any): string {
  return JSON.stringify(v);
}

function valueEquals(a: any, b: any): boolean {
  return deepEqual(a, b);
}

function addReferenceToType(referencer: SchemaElement<any>, type: Type) {
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

function removeReferenceToType(referencer: SchemaElement<any>, type: Type) {
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
  }
}

function *typesToCopy(source: Schema, dest: Schema): Generator<NamedType, void, undefined>  {
  for (const type of source.builtInTypes()) {
    if (!dest.type(type.name)?.isBuiltIn) {
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

function copy(source: Schema, dest: Schema) {
  // We shallow copy types and directives (which we can actually fully copy directly) first so any future reference to any of them can be dereferenced.
  for (const type of typesToCopy(source, dest)) {
    dest.addType(newNamedType(type.kind, type.name));
  }
  for (const directive of directivesToCopy(source, dest)) {
    copyDirectiveDefinitionInner(directive, dest.addDirectiveDefinition(directive.name));
  }
  copySchemaDefinitionInner(source.schemaDefinition, dest.schemaDefinition);
  for (const type of typesToCopy(source, dest)) {
    copyNamedTypeInner(type, dest.type(type.name)!);
  }
}

function copySchemaDefinitionInner(source: SchemaDefinition, dest: SchemaDefinition) {
  for (const [root, type] of source.roots.entries()) {
    dest.setRoot(root, type.name);
  }
  copyAppliedDirectives(source, dest);
  dest.sourceAST = source.sourceAST;
}

function copyAppliedDirectives(source: SchemaElement<any>, dest: SchemaElement<any>) {
  for (const directive of source.appliedDirectives) {
    dest.applyDirective(directive.name, { ...directive.arguments});
  }
}

function copyNamedTypeInner(source: NamedType, dest: NamedType) {
  copyAppliedDirectives(source, dest);
  dest.sourceAST = source.sourceAST;
  switch (source.kind) {
    case 'ObjectType':
      const destObjectType = dest as ObjectType;
      for (const field of source.fields.values()) {
        copyFieldDefinitionInner(field, destObjectType.addField(new FieldDefinition(field.name)));
      }
      for (const itf of source.interfaces) {
        destObjectType.addImplementedInterface(itf.name);
      }
      break;
    case 'InterfaceType':
      const destInterfaceType = dest as InterfaceType;
      for (const field of source.fields.values()) {
        copyFieldDefinitionInner(field, destInterfaceType.addField(new FieldDefinition(field.name)));
      }
      for (const itf of source.interfaces) {
        destInterfaceType.addImplementedInterface(itf.name);
      }
      break;
    case 'UnionType':
      const destUnionType = dest as UnionType;
      for (const type of source.types) {
        destUnionType.addType(type.name);
      }
      break;
    case 'EnumType':
      const destEnumType = dest as EnumType;
      for (const value of source.values) {
        destEnumType.addValue(value.name);
      }
      break
    case 'InputObjectType':
      const destInputType = dest as InputObjectType;
      for (const field of source.fields.values()) {
        copyInputFieldDefinitionInner(field, destInputType.addField(new InputFieldDefinition(field.name)));
      }
  }
}

function copyFieldDefinitionInner<P extends ObjectType | InterfaceType>(source: FieldDefinition<P>, dest: FieldDefinition<P>) {
  const type = copyWrapperTypeOrTypeRef(source.type, dest.schema()!) as OutputType;
  dest.type = type;
  for (const arg of source.arguments.values()) {
    const argType = copyWrapperTypeOrTypeRef(arg.type, dest.schema()!);
    copyArgumentDefinitionInner(arg, dest.addArgument(arg.name, argType as InputType));
  }
  copyAppliedDirectives(source, dest);
  dest.sourceAST = source.sourceAST;
}

function copyInputFieldDefinitionInner(source: InputFieldDefinition, dest: InputFieldDefinition) {
  const type = copyWrapperTypeOrTypeRef(source.type, dest.schema()!) as InputType;
  dest.type = type;
  copyAppliedDirectives(source, dest);
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

function copyArgumentDefinitionInner<P extends FieldDefinition<any> | DirectiveDefinition>(source: ArgumentDefinition<P>, dest: ArgumentDefinition<P>) {
  const type = copyWrapperTypeOrTypeRef(source.type, dest.schema()!) as InputType;
  dest.type = type;
  copyAppliedDirectives(source, dest);
  dest.sourceAST = source.sourceAST;
}

function copyDirectiveDefinitionInner(source: DirectiveDefinition, dest: DirectiveDefinition) {
  for (const arg of source.arguments()) {
    const type = copyWrapperTypeOrTypeRef(arg.type, dest.schema()!);
    copyArgumentDefinitionInner(arg, dest.addArgument(arg.name, type as InputType));
  }
  dest.repeatable = source.repeatable;
  dest.addLocations(...source.locations);
}
