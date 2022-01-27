import { ASTNode, DirectiveLocation, GraphQLError, StringValueNode } from "graphql";
import { URL } from "url";
import { CoreFeature, Directive, DirectiveDefinition, EnumType, ListType, NamedType, NonNullType, ScalarType, Schema, SchemaDefinition } from "./definitions";
import { sameType } from "./types";
import { err } from '@apollo/core-schema';
import { assert } from './utils';
import { ERRORS } from "./error";

export const coreIdentity = 'https://specs.apollo.dev/core';
export const linkIdentity = 'https://specs.apollo.dev/link';

export const linkDirectiveDefaultName = 'link';

export const ErrCoreCheckFailed = (causes: Error[]) =>
  err('CheckFailed', {
    message: 'one or more checks failed',
    causes
  })

function buildError(message: string): Error {
  // Maybe not the right error for this?
  return new Error(message);
}

export const corePurposes = [
  'SECURITY' as const,
  'EXECUTION' as const,
];

export type CorePurpose = typeof corePurposes[number];

function purposesDescription(purpose: CorePurpose) {
  switch (purpose) {
    case 'SECURITY': return "`SECURITY` features provide metadata necessary to securely resolve fields.";
    case 'EXECUTION': return "`EXECUTION` features provide metadata necessary for operation execution.";
  }
}

export abstract class FeatureDefinition {
  readonly url: FeatureUrl;

  constructor(url: FeatureUrl | string) {
    this.url = typeof url === 'string' ? FeatureUrl.parse(url) : url;
  }

  get identity(): string {
    return this.url.identity;
  }

  get version(): FeatureVersion {
    return this.url.version;
  }

  isSpecType(type: NamedType): boolean {
    const nameInSchema = this.nameInSchema(type.schema());
    return nameInSchema !== undefined && type.name.startsWith(`${nameInSchema}__`);
  }

  isSpecDirective(directive: DirectiveDefinition): boolean {
    const nameInSchema = this.nameInSchema(directive.schema());
    return nameInSchema != undefined && (directive.name === nameInSchema || directive.name.startsWith(`${nameInSchema}__`));
  }

  abstract addElementsToSchema(schema: Schema): void;

  protected nameInSchema(schema: Schema): string | undefined {
    const feature = this.featureInSchema(schema);
    return feature?.nameInSchema;
  }

  protected directiveNameInSchema(schema: Schema, directiveName: string): string | undefined {
    const feature = this.featureInSchema(schema);
    return feature ? feature.directiveNameInSchema(directiveName) : undefined;
  }

  protected typeNameInSchema(schema: Schema, directiveName: string): string | undefined {
    const feature = this.featureInSchema(schema);
    return feature ? feature.typeNameInSchema(directiveName) : undefined;
  }

  protected rootDirective<TApplicationArgs extends {[key: string]: any}>(schema: Schema): DirectiveDefinition<TApplicationArgs> | undefined {
    const name = this.nameInSchema(schema);
    return name ? schema.directive(name) as DirectiveDefinition<TApplicationArgs> | undefined : undefined;
  }

  protected directive<TApplicationArgs extends {[key: string]: any}>(schema: Schema, elementName: string): DirectiveDefinition<TApplicationArgs> | undefined {
    const name = this.directiveNameInSchema(schema, elementName);
    return name ? schema.directive(name) as DirectiveDefinition<TApplicationArgs> | undefined : undefined;
  }

  protected type<T extends NamedType>(schema: Schema, elementName: string): T | undefined {
    const name = this.typeNameInSchema(schema, elementName);
    return name ? schema.type(name) as T : undefined;
  }

  protected addRootDirective(schema: Schema): DirectiveDefinition {
    return schema.addDirectiveDefinition(this.nameInSchema(schema)!);
  }

  protected addDirective(schema: Schema, name: string): DirectiveDefinition {
    return schema.addDirectiveDefinition(this.directiveNameInSchema(schema, name)!);
  }

  protected addScalarType(schema: Schema, name: string): ScalarType {
    return schema.addType(new ScalarType(this.typeNameInSchema(schema, name)!));
  }

  protected addEnumType(schema: Schema, name: string): EnumType {
    return schema.addType(new EnumType(this.typeNameInSchema(schema, name)!));
  }

  protected featureInSchema(schema: Schema): CoreFeature | undefined {
    const features = schema.coreFeatures;
    if (!features) {
      throw buildError(`Schema is not a core schema (add @core first)`);
    }
    return features.getByIdentity(this.identity);
  }

  toString(): string {
    return `${this.identity}/${this.version}`
  }
}

export type CoreDirectiveArgs = {
  url: undefined,
  feature: string,
  as?: string,
  for?: string
}

export type LinkDirectiveArgs = {
  url: string,
  feature: undefined,
  as?: string,
  for?: string,
  import?: (string | CoreImport)[]
}

export type CoreOrLinkDirectiveArgs = CoreDirectiveArgs | LinkDirectiveArgs;

export type CoreImport = {
  name: string,
  as?: string,
};

export function extractCoreFeatureImports(directive: Directive<SchemaDefinition, CoreOrLinkDirectiveArgs>): CoreImport[] {
  const args = directive.arguments();
  if (!('import' in args)) {
    return [];
  }
  const importArg = args.import;
  const imports: CoreImport[] = importArg ? importArg.map((a) => typeof a === 'string' ? { name: a } : a) : [];
  for (const i of imports) {
    if (i.as && i.name.charAt(0) === '@' && i.as.charAt(0) !== '@') {
      throw ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err({
        message: `Invalid @link import renaming: directive ${i.name} imported name should starts with a '@' character, but got "${i.as}"`,
        nodes: directive.sourceAST
      });
    }
  }
  return imports;
}

export function isCoreSpecDirectiveApplication(directive: Directive<SchemaDefinition, any>): directive is Directive<SchemaDefinition, CoreOrLinkDirectiveArgs> {
  const definition = directive.definition;
  if (!definition) {
    return false;
  }
  const asArg = definition.argument('as');
  if (asArg && !sameType(asArg.type!, directive.schema().stringType())) {
    return false;
  }
  if (!definition.repeatable || definition.locations.length !== 1 || definition.locations[0] !== DirectiveLocation.SCHEMA) {
    return false;
  }
  const urlArg = definition.argument('url') ?? definition.argument('feature');
  if (!urlArg || !sameType(urlArg.type!, new NonNullType(directive.schema().stringType()))) {
    return false;
  }

  const args = directive.arguments();
  try {
    const url = FeatureUrl.parse(args[urlArg.name] as string);
    if (url.identity == coreIdentity) {
      return directive.name === (args.as ?? 'core');
    } else {
      return url.identity === linkIdentity &&  directive.name === (args.as ?? linkDirectiveDefaultName);
    }
  } catch (err) {
    return false;
  }
}

export class CoreSpecDefinition extends FeatureDefinition {
  constructor(version: FeatureVersion, identity: string = linkIdentity, name: string = linkDirectiveDefaultName) {
    super(new FeatureUrl(identity, name, version));
  }

  addElementsToSchema(_: Schema): void {
    // Core is special and the @core directive is added in `addToSchema` below
  }

  addToSchema(schema: Schema, as?: string) {
    const existing = schema.coreFeatures;
    if (existing) {
      if (existing.coreItself.url.identity === this.identity) {
        // Already exists with the same version, let it be.
        return;
      } else {
        throw buildError(`Cannot add feature ${this} to the schema, it already uses ${existing.coreItself.url}`);
      }
    }

    const nameInSchema = as ?? this.url.name;
    const core = schema.addDirectiveDefinition(nameInSchema).addLocations(DirectiveLocation.SCHEMA);
    core.repeatable = true;
    core.addArgument(this.urlArgName(), new NonNullType(schema.stringType()));
    core.addArgument('as', schema.stringType());
    if (this.supportPurposes()) {
      const purposeEnum = schema.addType(new EnumType(`${nameInSchema}__Purpose`));
      for (const purpose of corePurposes) {
        purposeEnum.addValue(purpose).description = purposesDescription(purpose);
      }
      core.addArgument('for', purposeEnum);
    }
    if (this.supportImport()) {
      if (schema.type(`${nameInSchema}__Import`)) {
        console.trace();
      }
      const importType = schema.addType(new ScalarType(`${nameInSchema}__Import`));
      core.addArgument('import', new ListType(importType));
    }

    // Note: we don't use `applyFeatureToSchema` because it would complain the schema is not a core schema, which it isn't
    // until the next line.
    const args = { [this.urlArgName()]: this.toString() } as unknown as CoreOrLinkDirectiveArgs;
    if (as) {
      args.as = as;
    }
    schema.schemaDefinition.applyDirective(nameInSchema, args);
  }

  private supportPurposes() {
    return this.version.strictlyGreaterThan(new FeatureVersion(0, 1));
  }

  private supportImport() {
    return this.url.name === linkDirectiveDefaultName;
  }

  private extractFeature(schema: Schema): CoreFeature {
    const features = schema.coreFeatures;
    if (!features) {
      throw buildError(`Schema is not a core schema (add @core first)`);
    }
    if (!features.coreItself.url.version.equals(this.version)) {
      throw buildError(`Cannot use this version of @core (${this.version}), the schema uses version ${features.coreItself.url.version}`);
    }
    return features.coreItself;
  }

  coreDirective(schema: Schema): DirectiveDefinition<CoreOrLinkDirectiveArgs> {
    const feature = this.extractFeature(schema);
    const directive = schema.directive(feature.nameInSchema);
    return directive as DirectiveDefinition<CoreOrLinkDirectiveArgs>;
  }

  coreVersion(schema: Schema): FeatureVersion {
    const feature = this.extractFeature(schema);
    return feature.url.version;
  }

  applyFeatureToSchema(schema: Schema, feature: FeatureDefinition, as?: string, purpose?: CorePurpose) {
    const coreDirective = this.coreDirective(schema);
    const args = {
      [this.urlArgName()]: feature.toString(),
      as,
    } as CoreDirectiveArgs;
    if (this.supportPurposes() && purpose) {
      args.for = purpose;
    }
    schema.schemaDefinition.applyDirective(coreDirective, args);
    feature.addElementsToSchema(schema);
  }

  extractFeatureUrl(args: CoreOrLinkDirectiveArgs): FeatureUrl {
    return FeatureUrl.parse(args[this.urlArgName()]!);
  }

  urlArgName(): 'feature' | 'url' {
    return this.url.name === 'core' ? 'feature' : 'url';
  }
}

export class FeatureDefinitions<T extends FeatureDefinition = FeatureDefinition> {
  // The list of definition corresponding to the known version of the particular feature this object handles,
  // sorted by _decreased_ versions.
  private readonly _definitions: T[] = [];

  constructor(readonly identity: string) {
  }

  add(definition: T): FeatureDefinitions<T> {
    if (definition.identity !== this.identity) {
      throw buildError(`Cannot add definition for ${definition} to the versions of definitions for ${this.identity}`);
    }
    if (this._definitions.find(def => definition.version.equals(def.version))) {
      return this;
    }
    this._definitions.push(definition);
    // We sort by decreased versions (this makes `find` a bit easier, and it feels somewhat natural anyway to have more
    // recent versions first).
    this._definitions.sort((def1, def2) => -def1.version.compareTo(def2.version));
    return this;
  }

  /**
   * Returns the known definition with the greatest version that satisfies the requested version, or undefined if no
   * known version can satisfy this version.
   */
  find(requested: FeatureVersion): T | undefined {
    return this._definitions.find(def => def.version.satisfies(requested));
  }

  versions(): FeatureVersion[] {
    return this._definitions.map(def => def.version);
  }

  latest(): T {
    assert(this._definitions.length > 0, 'Trying to get latest when no definitions exist');
    return this._definitions[0];
  }
}

/**
 * Versions are a (major, minor) number pair.
 */
export class FeatureVersion {
  constructor(public readonly major: number, public readonly minor: number) {}

  /**
   * Parse a version specifier of the form "v(major).(minor)" or throw
   *
   * # Example
   * ```
   * expect(FeatureVersion.parse('v1.0')).toEqual(new FeatureVersion(1, 0))
   * expect(FeatureVersion.parse('v0.1')).toEqual(new FeatureVersion(0, 1))
   * expect(FeatureVersion.parse("v987.65432")).toEqual(new FeatureVersion(987, 65432))
   * ```
   */
  public static parse(input: string): FeatureVersion {
    const match = input.match(this.VERSION_RE)
    if (!match) {
      throw new GraphQLError(`Expected a version string (of the form v1.2), got ${input}`);
    }
    return new this(+match[1], +match[2])
  }

  /**
   * Return true if and only if this FeatureVersion satisfies the `required` version
   *
   * # Example
   * ```
   * expect(new FeatureVersion(1, 0).satisfies(new FeatureVersion(1, 0))).toBe(true)
   * expect(new FeatureVersion(1, 2).satisfies(new FeatureVersion(1, 0))).toBe(true)
   * expect(new FeatureVersion(2, 0).satisfies(new FeatureVersion(1, 9))).toBe(false)
   * expect(new FeatureVersion(0, 9).satisfies(new FeatureVersion(0, 8))).toBe(false)
   * ```
   **/
  public satisfies(required: FeatureVersion): boolean {
    const {major, minor} = this
    const {major: rMajor, minor: rMinor} = required
    return rMajor == major && (
      major == 0
        ? rMinor == minor
        : rMinor <= minor
    )
  }

  /**
   * a string indicating this version's compatibility series. for release versions (>= 1.0), this
   * will be a string like "v1.x", "v2.x", and so on. experimental minor updates carry no expectation
   * of compatibility, so those will just return the same thing as `this.toString()`.
   */
  public get series() {
    const {major} = this
    return major > 0 ? `${major}.x` : String(this)
  }

  /**
   * Compares this version to the provide one, returning 1 if it strictly greater, 0 if they are equals, and -1 if this
    * version is strictly smaller. The underlying ordering is that of major version and then minor versions.
   *
   * Be aware that this ordering does *not* imply compatibility. For example, `FeatureVersion(2, 0) > FeatureVersion(1, 9)`,
    * but an implementation of `FeatureVersion(2, 0)` *cannot* satisfy a request for `FeatureVersion(1, 9)`. To check for
    * version compatibility, use [the `satisfies` method](#satisfies).
   */
  public compareTo(other: FeatureVersion): number {
    if (this.major > other.major) {
      return 1;
    }
    if (this.major < other.major) {
      return -1;
    }
    if (this.minor > other.minor) {
      return 1;
    }
    if (this.minor < other.minor) {
      return -1;
    }
    return 0;
  }

  /**
   * Return true if this FeatureVersion is strictly greater than the provided one,
   * where ordering is meant by major and then minor number.
   *
   * Be aware that this ordering does *not* imply compatibility. For
   * example, `FeatureVersion(2, 0) > FeatureVersion(1, 9)`, but an implementation of `FeatureVersion(2, 0)`
   * *cannot* satisfy a request for `FeatureVersion(1, 9)`. To check for version compatibility,
   * use [the `satisfies` method](#satisfies).
   */
  public strictlyGreaterThan(version: FeatureVersion) {
    return this.compareTo(version) > 0;
  }

  /**
   * return the string version tag, like "v2.9"
   *
   * @returns a version tag
   */
  public toString() {
    return `v${this.major}.${this.minor}`
  }

  /**
   * return true iff this version is exactly equal to the provided version
   *
   * @param other the version to compare
   * @returns true if versions are strictly equal
   */
  public equals(other: FeatureVersion) {
    return this.major === other.major && this.minor === other.minor
  }

  private static VERSION_RE = /^v(\d+)\.(\d+)$/
}


export class FeatureUrl {
  constructor(
    public readonly identity: string,
    public readonly name: string,
    public readonly version: FeatureVersion,
    public readonly element?: string,
  ) {}

  /// Parse a spec URL or throw
  public static parse(input: string, node?: ASTNode): FeatureUrl {
    const url = new URL(input)
    if (!url.pathname || url.pathname === '/') {
      throw new GraphQLError(`Missing path in feature url '${url}'`, node)
    }
    const path = url.pathname.split('/')
    const verStr = path.pop()
    if (!verStr) {
      throw new GraphQLError(`Missing version component in feature url '${url}'`, node)
    }
    const version = FeatureVersion.parse(verStr)
    const name = path[path.length - 1]
    if (!name) {
      throw new GraphQLError(`Missing feature name component in feature url '${url}'`, node)
    }
    const element = url.hash ? url.hash.slice(1): undefined
    url.hash = ''
    url.search = ''
    url.password = ''
    url.username = ''
    url.pathname = path.join('/')
    return new FeatureUrl(url.toString(), name, version, element)
  }

  /// Decode a StringValueNode containing a feature url
  public static decode(node: StringValueNode): FeatureUrl {
    return this.parse(node.value, node)
  }

  /**
   * Return true if and only if this spec satisfies the `requested`
   * spec.
   *
   * @param request
   */
  public satisfies(requested: FeatureUrl): boolean {
    return requested.identity === this.identity &&
           this.version.satisfies(requested.version)
  }

  public equals(other: FeatureUrl) {
    return this.identity === other.identity &&
      this.version.equals(other.version)
  }

  get url() {
    return this.element ?
      `${this.identity}/${this.version}#${this.element}`
      : `${this.identity}/${this.version}`
  }

  get isDirective() {
    return this.element?.startsWith('@')
  }

  get elementName() {
    return this.isDirective ? this.element?.slice(1) : this.element
  }

  get base(): FeatureUrl {
    if (!this.element) return this
    return new FeatureUrl(this.identity, this.name, this.version)
  }

  toString() {
    return this.url
  }
}

export function findCoreSpecVersion(featureUrl: FeatureUrl): CoreSpecDefinition | undefined {
  return featureUrl.name === 'core'
    ? CORE_VERSIONS.find(featureUrl.version)
    : (featureUrl.name === linkDirectiveDefaultName ? LINK_VERSIONS.find(featureUrl.version) : undefined)
}

export const CORE_VERSIONS = new FeatureDefinitions<CoreSpecDefinition>(coreIdentity)
  .add(new CoreSpecDefinition(new FeatureVersion(0, 1), coreIdentity, 'core'))
  .add(new CoreSpecDefinition(new FeatureVersion(0, 2), coreIdentity, 'core'));

export const LINK_VERSIONS = new FeatureDefinitions<CoreSpecDefinition>(linkIdentity)
  .add(new CoreSpecDefinition(new FeatureVersion(1, 0)));

export function removeFeatureElements(schema: Schema, feature: CoreFeature) {
  // Removing directives first, so that when we remove types, the checks that there is no references don't fail due a directive of a the feature
  // actually using the type.
  const featureDirectives = schema.directives().filter(d => feature.isFeatureDefinition(d));
  featureDirectives.forEach(d => d.remove().forEach(application => application.remove()));

  const featureTypes = schema.types().filter(t => feature.isFeatureDefinition(t));
  featureTypes.forEach(type => {
    const references = type.remove();
    if (references.length > 0) {
      throw new GraphQLError(
        `Cannot remove elements of feature ${feature} as feature type ${type} is referenced by elements: ${references.join(', ')}`,
        references.map(r => r.sourceAST).filter(n => n !== undefined) as ASTNode[]
      );
      }
  });
}
