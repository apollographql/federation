import { ASTNode, DirectiveLocation, GraphQLError, StringValueNode } from "graphql";
import { URL } from "url";
import { CoreFeature, Directive, DirectiveDefinition, EnumType, ErrGraphQLAPISchemaValidationFailed, ErrGraphQLValidationFailed, InputType, ListType, NamedType, NonNullType, ScalarType, Schema, SchemaDefinition, SchemaElement, sourceASTs } from "../definitions";
import { sameType } from "../types";
import { assert, findLast, firstOf, MapWithCachedArrays } from '../utils';
import { aggregateError, ERRORS } from "../error";
import { valueToString } from "../values";
import { coreFeatureDefinitionIfKnown, registerKnownFeature } from "../knownCoreFeatures";
import { didYouMean, suggestionList } from "../suggestions";
import { ArgumentSpecification, createDirectiveSpecification, createEnumTypeSpecification, createScalarTypeSpecification, DirectiveCompositionSpecification, DirectiveSpecification, TypeSpecification } from "../directiveAndTypeSpecification";

export const coreIdentity = 'https://specs.apollo.dev/core';
export const linkIdentity = 'https://specs.apollo.dev/link';

export const linkDirectiveDefaultName = 'link';

export const ErrCoreCheckFailed = (causes: GraphQLError[]) => aggregateError('CheckFailed', 'one or more checks failed', causes);

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

  private readonly _directiveSpecs = new MapWithCachedArrays<string, DirectiveSpecification>();
  private readonly _typeSpecs = new MapWithCachedArrays<string, TypeSpecification>();

  // A minimumFederationVersion that's undefined would mean that we won't produce that version in the supergraph SDL.
  constructor(url: FeatureUrl | string, readonly minimumFederationVersion?: FeatureVersion) {
    this.url = typeof url === 'string' ? FeatureUrl.parse(url) : url;
  }

  protected registerDirective(spec: DirectiveSpecification) {
    this._directiveSpecs.set(spec.name, spec);
  }

  protected registerType(spec: TypeSpecification) {
    this._typeSpecs.set(spec.name, spec);
  }

  protected registerSubFeature(subFeature: FeatureDefinition) {
    for (const typeSpec of subFeature.typeSpecs()) {
      this.registerType(typeSpec);
    }
    for (const directiveSpec of subFeature.directiveSpecs()) {
      this.registerDirective(directiveSpec);
    }
  }

  directiveSpecs(): readonly DirectiveSpecification[] {
    return this._directiveSpecs.values();
  }

  directiveSpec(name: string): DirectiveSpecification | undefined {
    return this._directiveSpecs.get(name);
  }

  typeSpecs(): readonly TypeSpecification[] {
    return this._typeSpecs.values();
  }

  typeSpec(name: string): TypeSpecification | undefined {
    return this._typeSpecs.get(name);
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

  addElementsToSchema(schema: Schema): GraphQLError[] {
    const feature = this.featureInSchema(schema);
    assert(feature, () => `The ${this.url} specification should have been added to the schema before this is called`);

    let errors: GraphQLError[] = [];
    for (const type of this.typeSpecs()) {
      errors = errors.concat(type.checkOrAdd(schema, feature));
    }

    for (const directive of this.directiveSpecs()) {
      errors = errors.concat(directive.checkOrAdd(schema, feature));
    }
    return errors;
  }

  allElementNames(): string[] {
    return this.directiveSpecs().map((spec) => `@${spec.name}`)
      .concat(this.typeSpecs().map((spec) => spec.name));
  }

  // No-op implementation that can be overridden by subclasses.
  validateSubgraphSchema(_schema: Schema): GraphQLError[] {
    return [];
  }

  protected nameInSchema(schema: Schema): string | undefined {
    const feature = this.featureInSchema(schema);
    return feature?.nameInSchema;
  }

  protected directiveNameInSchema(schema: Schema, directiveName: string): string | undefined {
    const feature = this.featureInSchema(schema);
    return feature ? feature.directiveNameInSchema(directiveName) : undefined;
  }

  protected typeNameInSchema(schema: Schema, typeName: string): string | undefined {
    const feature = this.featureInSchema(schema);
    return feature ? feature.typeNameInSchema(typeName) : undefined;
  }

  protected rootDirective<TApplicationArgs extends { [key: string]: any }>(schema: Schema): DirectiveDefinition<TApplicationArgs> | undefined {
    const name = this.nameInSchema(schema);
    return name ? schema.directive(name) as DirectiveDefinition<TApplicationArgs> | undefined : undefined;
  }

  protected directive<TApplicationArgs extends { [key: string]: any }>(schema: Schema, elementName: string): DirectiveDefinition<TApplicationArgs> | undefined {
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
      throw buildError(`Schema is not a core schema (add @link first)`);
    }
    return features.getByIdentity(this.identity);
  }

  get defaultCorePurpose(): CorePurpose | undefined {
    return undefined;
  }

  compositionSpecification(directiveNameInFeature: string): DirectiveCompositionSpecification | undefined {
    const spec = this._directiveSpecs.get(directiveNameInFeature);
    return spec?.composition;
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

export function extractCoreFeatureImports(url: FeatureUrl, directive: Directive<SchemaDefinition, CoreOrLinkDirectiveArgs>): CoreImport[] {
  // Note: up to this point, we've kind of cheated with typing and force-casted the arguments to `CoreOrLinkDirectiveArgs`, and while this
  // graphQL type validations ensure this is "mostly" true, the `import' arg is an exception becuse it uses the `link__Import` scalar,
  // and so there is no fine-grained graphQL-side validation of the values. So we'll need to double-check that the values are indeed
  // either a string or a valid `CoreImport` value.
  const args = directive.arguments();
  if (!('import' in args) || !args.import) {
    return [];
  }
  const importArgValue = args.import;
  const definition = coreFeatureDefinitionIfKnown(url);
  const knownElements = definition?.allElementNames();
  const errors: GraphQLError[] = [];
  const imports: CoreImport[] = [];

  importArgLoop:
  for (const elt of importArgValue) {
    if (typeof elt === 'string') {
      imports.push({ name: elt });
      validateImportedName(elt, knownElements, errors, directive);
      continue;
    }
    if (typeof elt !== 'object') {
      errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
        `Invalid sub-value ${valueToString(elt)} for @link(import:) argument: values should be either strings or input object values of the form { name: "<importedElement>", as: "<alias>" }.`,
        { nodes: directive.sourceAST },
      ));
      continue;
    }
    let name: string | undefined;
    for (const [key, value] of Object.entries(elt)) {
      switch (key) {
        case 'name':
          if (typeof value !== 'string') {
            errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
              `Invalid value for the "name" field for sub-value ${valueToString(elt)} of @link(import:) argument: must be a string.`,
              { nodes: directive.sourceAST },
            ));
            continue importArgLoop;
          }
          name = value;
          break;
        case 'as':
          if (typeof value !== 'string') {
            errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
              `Invalid value for the "as" field for sub-value ${valueToString(elt)} of @link(import:) argument: must be a string.`,
              { nodes: directive.sourceAST },
            ));
            continue importArgLoop;
          }
          break;
        default:
          errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
            `Unknown field "${key}" for sub-value ${valueToString(elt)} of @link(import:) argument.`,
            { nodes: directive.sourceAST },
          ));
          continue importArgLoop;
      }
    }
    if (name) {
      const i = elt as CoreImport;
      imports.push(i);
      if (i.as) {
        if (i.name.charAt(0) === '@' && i.as.charAt(0) !== '@') {
          errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
            `Invalid @link import renaming: directive "${i.name}" imported name should start with a '@' character, but got "${i.as}".`,
            { nodes: directive.sourceAST },
          ));
        }
        else if (i.name.charAt(0) !== '@' && i.as.charAt(0) === '@') {
          errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
            `Invalid @link import renaming: type "${i.name}" imported name should not start with a '@' character, but got "${i.as}" (or, if @${i.name} is a directive, then it should be referred to with a '@').`,
            { nodes: directive.sourceAST },
          ));
        }
      }
      validateImportedName(name, knownElements, errors, directive);
    } else {
      errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
        `Invalid sub-value ${valueToString(elt)} for @link(import:) argument: missing mandatory "name" field.`,
        { nodes: directive.sourceAST },
      ));
    }
  }

  if (errors.length > 0) {
    throw ErrGraphQLValidationFailed(errors);
  }
  return imports;
}

function validateImportedName(name: string, knownElements: string[] | undefined, errors: GraphQLError[], directive: Directive<SchemaDefinition>) {
  if (knownElements && !knownElements.includes(name)) {
    let details = '';
    if (!name.startsWith('@') && knownElements.includes('@' + name)) {
      details = ` Did you mean directive "@${name}"?`;
    } else {
      const suggestions = suggestionList(name, knownElements);
      if (suggestions) {
        details = didYouMean(suggestions);
      }
    }
    errors.push(ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
      `Cannot import unknown element "${name}".${details}`,
      { nodes: directive.sourceAST },
    ));
  }
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
  if (!urlArg || !isValidUrlArgumentType(urlArg.type!, directive.schema())) {
    return false;
  }

  const args = directive.arguments();
  try {
    const url = FeatureUrl.parse(args[urlArg.name] as string);
    if (url.identity === coreIdentity) {
      return directive.name === (args.as ?? 'core');
    } else {
      return url.identity === linkIdentity && directive.name === (args.as ?? linkDirectiveDefaultName);
    }
  } catch (err) {
    return false;
  }
}

function isValidUrlArgumentType(type: InputType, schema: Schema): boolean {
  // Note that the 'url' arg is defined as nullable (mostly for future proofing reasons) but we allow use to provide a definition
  // where it's non-nullable (and in practice, @core (which we never generate anymore, but recognize) definition technically uses
  // with a non-nullable argument, and some fed2 previews did if for @link, so this ensure we handle reading schema generated
  // by those versions just fine).
  return sameType(type, schema.stringType())
    || sameType(type, new NonNullType(schema.stringType()));
}

const linkPurposeTypeSpec = createEnumTypeSpecification({
  name: 'Purpose',
  values: corePurposes.map((name) => ({ name, description: purposesDescription(name) }))
});

const linkImportTypeSpec = createScalarTypeSpecification({ name: 'Import' });

export class CoreSpecDefinition extends FeatureDefinition {
  private readonly directiveDefinitionSpec: DirectiveSpecification;

  constructor(version: FeatureVersion, minimumFederationVersion?: FeatureVersion, identity: string = linkIdentity, name: string = linkDirectiveDefaultName) {
    super(new FeatureUrl(identity, name, version), minimumFederationVersion);
    this.directiveDefinitionSpec = createDirectiveSpecification({
      name,
      locations: [DirectiveLocation.SCHEMA],
      repeatable: true,
      args: this.createDefinitionArgumentSpecifications(),
    });
    this.registerDirective(this.directiveDefinitionSpec);
  }

  private createDefinitionArgumentSpecifications(): ArgumentSpecification[] {
    const args: ArgumentSpecification[] = [
      { name: this.urlArgName(), type: (schema) => schema.stringType() },
      { name: 'as', type: (schema) => schema.stringType() },
    ];
    if (this.supportPurposes()) {
      args.push({
        name: 'for',
        type: (schema, feature) => {
          assert(feature, "Shouldn't be added without being attached to a @link spec");
          return schema.type(feature.typeNameInSchema(linkPurposeTypeSpec.name)) as InputType;
        },
      });
    }
    if (this.supportImport()) {
      args.push({
        name: 'import',
        type: (schema, feature) => {
          assert(feature, "Shouldn't be added without being attached to a @link spec");
          return new ListType(schema.type(feature.typeNameInSchema(linkImportTypeSpec.name))!);
        }
      });
    }
    return args;
  }

  addElementsToSchema(_: Schema): GraphQLError[] {
    // Core is special and the @core directive is added in `addToSchema` below
    return [];
  }

  // TODO: we may want to allow some `import` as argument to this method. When we do, we need to watch for imports of
  // `Purpose` and `Import` and add the types under their imported name.
  addToSchema(schema: Schema, alias?: string): GraphQLError[] {
    const errors = this.addDefinitionsToSchema(schema, alias);
    if (errors.length > 0) {
      return errors;
    }

    // Note: we don't use `applyFeatureToSchema` because it would complain the schema is not a core schema, which it isn't
    // until the next line.
    const args = { [this.urlArgName()]: this.toString() } as unknown as CoreOrLinkDirectiveArgs;
    if (alias) {
      args.as = alias;
    }

    // This adds `@link(url: "https://specs.apollo.dev/link/v1.0")` to the "schema" definition. And we have
    // a choice to add it either the main definition, or to an `extend schema`.
    //
    // In theory, always adding it to the main definition should be safe since even if some root operations
    // can be defined in extensions, you shouldn't have an extension without a definition, and so we should
    // never be in a case where _all_ root operations are defined in extensions (which would be a problem
    // for printing the definition itsef since it's syntactically invalid to have a schema definition with
    // no operations).
    //
    // In practice however, graphQL-js has historically accepted extensions without definition for schema,
    // and we even abuse this a bit with federation out of convenience, so we could end up in the situation
    // where if we put the directive on the definition, it cannot be printed properly due to the user having
    // defined all its root operations in an extension.
    //
    // We could always add the directive to an extension, and that could kind of work but:
    // 1. the core/link spec says that the link-to-link application should be the first `@link` of the
    //   schema, but if user put some `@link` on their schema definition but we always put the link-to-link
    //   on an extension, then we're kind of not respecting our own spec (in practice, our own code can
    //   actually handle this as it does not strongly rely on that "it should be the first" rule, but that
    //   would set a bad example).
    // 2. earlier versions (pre-#1875) were always putting that directive on the definition, and we wanted
    //   to avoid suprising users by changing that for not reason.
    //
    // So instead, we put the directive on the schema definition unless some extensions exists but no
    // definition does (that is, no non-extension elements are populated).
    const schemaDef = schema.schemaDefinition;
    // Side-note: this test must be done _before_ we call `applyDirective`, otherwise it would take it into
    // account.
    const hasDefinition = schemaDef.hasNonExtensionElements();
    const directive = schemaDef.applyDirective(alias ?? this.url.name, args, true);
    if (!hasDefinition && schemaDef.hasExtensionElements()) {
      const extension = firstOf(schemaDef.extensions());
      assert(extension, '`hasExtensionElements` should not have been `true`');
      directive.setOfExtension(extension);
    }
    return [];
  }

  addDefinitionsToSchema(schema: Schema, as?: string, imports: CoreImport[] = []): GraphQLError[] {
    const existingCore = schema.coreFeatures;
    if (existingCore) {
      if (existingCore.coreItself.url.identity === this.identity) {
        // Already exists with the same version, let it be.
        return [];
      } else {
        return [ERRORS.INVALID_LINK_DIRECTIVE_USAGE.err(
          `Cannot add feature ${this} to the schema, it already uses ${existingCore.coreItself.url}`
        )];
      }
    }

    const nameInSchema = as ?? this.url.name;
    // The @link spec is special in that it is the one that bootstrap everything, and by the time this method
    // is called, the `schema` may not yet have any `schema.coreFeatures` setup yet. To have `checkAndAdd`
    // calls below still work, we pass a temp feature object with the proper information (not that the
    // `Directive` we pass is not complete and not even attached to the schema, but that is not used
    // in practice so unused).
    const feature = new CoreFeature(this.url, nameInSchema, new Directive(nameInSchema), imports);

    let errors: GraphQLError[] = [];
    errors = errors.concat(linkPurposeTypeSpec.checkOrAdd(schema, feature));
    errors = errors.concat(linkImportTypeSpec.checkOrAdd(schema, feature));
    errors = errors.concat(this.directiveDefinitionSpec.checkOrAdd(schema, feature));
    return errors;
  }

  /**
   * The list of all the element names that can be "imported" from this feature. Importantly, directive names
   * must start with a `@`.
   */
  allElementNames(): string[] {
    const names = [`@${this.url.name}`];
    if (this.supportPurposes()) {
      names.push('Purpose');
    }
    if (this.supportImport()) {
      names.push('Import');
    }
    return names;
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

  applyFeatureToSchema(schema: Schema, feature: FeatureDefinition, as?: string, purpose?: CorePurpose): GraphQLError[] {
    const coreDirective = this.coreDirective(schema);
    const args = {
      [this.urlArgName()]: feature.toString(),
      as,
    } as CoreDirectiveArgs;
    if (this.supportPurposes() && purpose) {
      args.for = purpose;
    }
    schema.schemaDefinition.applyDirective(coreDirective, args);
    return feature.addElementsToSchema(schema);
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
    // We sort by decreased versions sa it feels somewhat natural anyway to have more recent versions first.
    this._definitions.sort((def1, def2) => -def1.version.compareTo(def2.version));
    return this;
  }

  /**
   * Returns the definition corresponding to the requested version if known.
   */
  find(requested: FeatureVersion): T | undefined {
    return this._definitions.find((def) => def.version.equals(requested));
  }

  versions(): FeatureVersion[] {
    return this._definitions.map(def => def.version);
  }

  latest(): T {
    assert(this._definitions.length > 0, 'Trying to get latest when no definitions exist');
    return this._definitions[0];
  }

  getMinimumRequiredVersion(fedVersion: FeatureVersion): T {
    // this._definitions is already sorted with the most recent first
    // get the first definition that is compatible with the federation version
    // if the minimum version is not present, assume that we won't look for an older version
    const def = this._definitions.find(def => def.minimumFederationVersion ? fedVersion >= def.minimumFederationVersion : true);
    assert(def, `No compatible definition exists for federation version ${fedVersion}`);

    // note that it's necessary that we can only get versions that have the same major version as the latest,
    // because otherwise we can not guarantee compatibility. In this case, we want to return the oldest version with
    // the same major version as the latest.
    const latestMajor = this.latest().version.major;
    if (def.version.major !== latestMajor) {
      return findLast(this._definitions, def => def.version.major === latestMajor) ?? this.latest();
    }
    return def;
  }
}

/**
 * Versions are a (major, minor) number pair.
 */
export class FeatureVersion {
  constructor(public readonly major: number, public readonly minor: number) { }

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
      throw ERRORS.INVALID_LINK_IDENTIFIER.err(`Expected a version string (of the form v1.2), got ${input}`);
    }
    return new this(+match[1], +match[2])
  }

  /**
   * Find the maximum version in a collection of versions, returning undefined in the case
   * that the collection is empty.
   *
   * # Example
   * ```
   * expect(FeatureVersion.max([new FeatureVersion(1, 0), new FeatureVersion(2, 0)])).toBe(new FeatureVersion(2, 0))
   * expect(FeatureVersion.max([])).toBe(undefined)
   * ```
   */
  public static max(versions: Iterable<FeatureVersion>): FeatureVersion | undefined {
    let max: FeatureVersion | undefined;

    for (const version of versions) {
      if (!max || version > max) {
        max = version;
      }
    }

    return max;
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
    const { major, minor } = this
    const { major: rMajor, minor: rMinor } = required
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
    const { major } = this
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

  public lt(other: FeatureVersion): boolean {
    return this.compareTo(other) < 0;
  }

  public lte(other: FeatureVersion): boolean {
    return this.compareTo(other) <= 0;
  }

  public gt(other: FeatureVersion): boolean {
    return this.compareTo(other) > 0;
  }

  public gte(other: FeatureVersion): boolean {
    return this.compareTo(other) >= 0;
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
  ) { }

  public static maybeParse(input: string, node?: ASTNode): FeatureUrl | undefined {
    try {
      return FeatureUrl.parse(input, node);
    } catch (err) {
      return undefined;
    }
  }
    /// Parse a spec URL or throw
  public static parse(input: string, node?: ASTNode): FeatureUrl {
    const url = new URL(input)
    if (!url.pathname || url.pathname === '/') {
      throw ERRORS.INVALID_LINK_IDENTIFIER.err(`Missing path in feature url '${url}'`, { nodes: node })
    }
    const path = url.pathname.split('/')
    const verStr = path.pop()
    if (!verStr) {
      throw ERRORS.INVALID_LINK_IDENTIFIER.err(`Missing version component in feature url '${url}'`, { nodes: node })
    }
    const version = FeatureVersion.parse(verStr)
    const name = path[path.length - 1]
    if (!name) {
      throw ERRORS.INVALID_LINK_IDENTIFIER.err(`Missing feature name component in feature url '${url}'`, { nodes: node })
    }
    const element = url.hash ? url.hash.slice(1) : undefined
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
  .add(new CoreSpecDefinition(new FeatureVersion(0, 1), undefined, coreIdentity, 'core'))
  .add(new CoreSpecDefinition(new FeatureVersion(0, 2), new FeatureVersion(2, 0), coreIdentity, 'core'));

export const LINK_VERSIONS = new FeatureDefinitions<CoreSpecDefinition>(linkIdentity)
  .add(new CoreSpecDefinition(new FeatureVersion(1, 0), new FeatureVersion(2, 0)));

registerKnownFeature(CORE_VERSIONS);
registerKnownFeature(LINK_VERSIONS);

export function removeAllCoreFeatures(schema: Schema) {
  // Gather a list of core features up front, since we can't fetch them during
  // removal. (Also note that core being a feature itself, this will remove core
  // itself and mark the schema as 'not core').
  const coreFeatures = [...(schema.coreFeatures?.allFeatures() ?? [])];

  // Remove all feature elements, keeping track of any type references found
  // along the way.
  const typeReferences: {
    feature: CoreFeature;
    type: NamedType;
    references: SchemaElement<any, any>[];
  }[] = [];
  for (const feature of coreFeatures) {
    // Remove feature directive definitions and their applications.
    const featureDirectiveDefs = schema.directives()
      .filter(d => feature.isFeatureDefinition(d));
    featureDirectiveDefs.forEach(def =>
      def.remove().forEach(application => application.remove())
    );

    // Remove feature types.
    const featureTypes = schema.types()
      .filter(t => feature.isFeatureDefinition(t));
    featureTypes.forEach(type => {
      const references = type.remove();
      if (references.length > 0) {
        typeReferences.push({
          feature,
          type,
          references,
        });
      }
    });
  }

  // Now that we're finished with removals, for any referencers encountered,
  // check whether they're still attached to the schema (and fail if they are).
  //
  // We wait for after all removals are done, since it means we don't have to
  // worry about the ordering of removals (e.g. if one feature element refers
  // to a different feature's element) or any circular references.
  //
  // Note that we fail for ALL type referencers, regardless of whether removing
  // the type necessitates removal of the type referencer. E.g. even if some
  // non-core object type were to implement some core feature interface type, we
  // would still require removal of the non-core object type. Users don't have
  // to enact this removal by removing the object type from their supergraph
  // schema though; they could also just mark it @inaccessible (since this
  // function is called after removeInaccessibleElements()).
  //
  // In the future, we could potentially relax this validation once we determine
  // the appropriate semantics. (This validation has already been relaxed for
  // directive applications, since feature directive definition removal does not
  // necessitate removal of elements with directive applications.)
  const errors: GraphQLError[] = [];
  for (const { feature, type, references } of typeReferences) {
    const referencesInSchema = references.filter(r => r.isAttached());
    if (referencesInSchema.length > 0) {
      // Note: using REFERENCED_INACCESSIBLE is slightly abusive because the reference element is not marked
      // @inacessible exactly. Instead, it is inacessible due to core elements being removed, but that's very
      // very close semantically. Overall, adding a publicly documented error code just to minor difference
      // doesn't feel worth it, especially since that case is super unlikely in the first place (and, as
      // the prior comment says, may one day be removed too).
      errors.push(ERRORS.REFERENCED_INACCESSIBLE.err(
        `Cannot remove elements of feature ${feature} as feature type ${type}` +
        ` is referenced by elements: ${referencesInSchema.join(', ')}`,
        { nodes: sourceASTs(...references) },
      ));
    }
  }
  if (errors.length > 0) {
    throw ErrGraphQLAPISchemaValidationFailed(errors);
  }
}
