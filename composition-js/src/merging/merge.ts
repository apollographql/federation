import {
  ArgumentDefinition,
  assert,
  arrayEquals,
  DirectiveDefinition,
  EnumType,
  FieldDefinition,
  InputObjectType,
  InterfaceType,
  NamedType,
  newNamedType,
  ObjectType,
  Schema,
  SchemaDefinition,
  SchemaElement,
  UnionType,
  sameType,
  isStrictSubtype,
  ListType,
  NonNullType,
  Type,
  NullableType,
  NamedSchemaElementWithType,
  valueEquals,
  valueToString,
  InputFieldDefinition,
  allSchemaRootKinds,
  Directive,
  isFederationField,
  SchemaRootKind,
  CompositeType,
  Subgraphs,
  JOIN_VERSIONS,
  INACCESSIBLE_VERSIONS,
  NamedSchemaElement,
  errorCauses,
  isObjectType,
  SubgraphASTNode,
  addSubgraphToASTNode,
  firstOf,
  Extension,
  isInterfaceType,
  sourceASTs,
  ERRORS,
  FederationMetadata,
  printSubgraphNames,
  federationIdentity,
  linkIdentity,
  coreIdentity,
  FEDERATION_OPERATION_TYPES,
  LINK_VERSIONS,
  federationMetadata,
  errorCode,
  withModifiedErrorNodes,
  didYouMean,
  suggestionList,
  EnumValue,
  baseType,
  isEnumType,
  filterTypesOfKind,
  isNonNullType,
  isExecutableDirectiveLocation,
  parseFieldSetArgument,
  isCompositeType,
  isDefined,
  addSubgraphToError,
  printHumanReadableList,
  ArgumentMerger,
  JoinSpecDefinition,
  CoreSpecDefinition,
  FeatureVersion,
  FEDERATION_VERSIONS,
  InaccessibleSpecDefinition,
  LinkDirectiveArgs,
  sourceIdentity,
  FeatureUrl,
  CoreFeature,
  Subgraph,
} from "@apollo/federation-internals";
import { ASTNode, GraphQLError, DirectiveLocation } from "graphql";
import {
  CompositionHint,
  HintCodeDefinition,
  HINTS,
} from "../hints";
import { ComposeDirectiveManager } from '../composeDirectiveManager';
import { MismatchReporter } from './reporter';
import { inspect } from "util";
import { collectCoreDirectivesToCompose, CoreDirectiveInSubgraphs } from "./coreDirectiveCollector";
import { CompositionOptions } from "../compose";

type FieldOrUndefinedArray = (FieldDefinition<any> | undefined)[];

export type MergeResult = MergeSuccess | MergeFailure;

type FieldMergeContextProperties = {
  usedOverridden: boolean,
  unusedOverridden: boolean,
  overrideWithUnknownTarget: boolean,
  overrideLabel: string | undefined,
}

// for each source, specify additional properties that validate functions can set
class FieldMergeContext {
  _props: FieldMergeContextProperties[];

  constructor(sources: unknown[]) {
    this._props = (
      new Array(sources.length)).fill(true).map(_ => ({
        usedOverridden: false,
        unusedOverridden: false,
        overrideWithUnknownTarget: false,
        overrideLabel: undefined,
      }));
  }

  isUsedOverridden(idx: number) {
    return this._props[idx].usedOverridden;
  }

  isUnusedOverridden(idx: number) {
    return this._props[idx].unusedOverridden;
  }

  hasOverrideWithUnknownTarget(idx: number) {
    return this._props[idx].overrideWithUnknownTarget;
  }

  overrideLabel(idx: number) {
    return this._props[idx].overrideLabel;
  }

  setUsedOverridden(idx: number) {
    this._props[idx].usedOverridden = true;
  }

  setUnusedOverridden(idx: number) {
    this._props[idx].unusedOverridden = true;
  }

  setOverrideWithUnknownTarget(idx: number) {
    this._props[idx].overrideWithUnknownTarget = true;
  }

  setOverrideLabel(idx: number, label: string) {
    this._props[idx].overrideLabel = label;
  }

  some(predicate: (props: FieldMergeContextProperties) => boolean): boolean {
    return this._props.some(predicate);
  }
}

export interface MergeSuccess {
  supergraph: Schema;
  hints: CompositionHint[];
  errors?: undefined;
}

export interface MergeFailure {
  errors: GraphQLError[];
  supergraph?: undefined;
  hints?: undefined;
}

export function isMergeSuccessful(mergeResult: MergeResult): mergeResult is MergeSuccess {
  return !isMergeFailure(mergeResult);
}

export function isMergeFailure(mergeResult: MergeResult): mergeResult is MergeFailure {
  return !!mergeResult.errors;
}

export function mergeSubgraphs(subgraphs: Subgraphs, options: CompositionOptions = {}): MergeResult {
  assert(subgraphs.values().every((s) => s.isFed2Subgraph()), 'Merging should only be applied to federation 2 subgraphs');
  return new Merger(subgraphs, options).merge();
}

function copyTypeReference(source: Type, dest: Schema): Type {
  switch (source.kind) {
    case 'ListType':
      return new ListType(copyTypeReference(source.ofType, dest));
    case 'NonNullType':
      return new NonNullType(copyTypeReference(source.ofType, dest) as NullableType);
    default:
      const type = dest.type(source.name);
      assert(type, () => `Cannot find type ${source} in destination schema (with types: ${dest.types().join(', ')})`);
      return type;
  }
}

const NON_MERGED_CORE_FEATURES = [ federationIdentity, linkIdentity, coreIdentity ];

function isMergedType(type: NamedType): boolean {
  if (type.isIntrospectionType() || FEDERATION_OPERATION_TYPES.map((s) => s.name).includes(type.name)) {
    return false;
  }

  const coreFeatures = type.schema().coreFeatures;
  const typeFeature = coreFeatures?.sourceFeature(type)?.feature.url.identity;
  return !(typeFeature && NON_MERGED_CORE_FEATURES.includes(typeFeature));
}

function isMergedField(field: InputFieldDefinition | FieldDefinition<CompositeType>): boolean {
  return field.kind !== 'FieldDefinition' || !isFederationField(field);
}

function isGraphQLBuiltInDirective(def: DirectiveDefinition): boolean {
  // `def.isBuiltIn` is not entirely reliable here because if it will be `false`
  // if the user has manually redefined the built-in directive (if they do,
  // we validate the definition is "compabitle" with the built-in version, but
  // otherwise return the use one). But when merging, we want to essentially
  // ignore redefinitions, so we instead just check if the "name" is that of
  // built-in directive.
  return !!def.schema().builtInDirective(def.name);
}

function printTypes<T extends NamedType>(types: T[]): string {
  return printHumanReadableList(
    types.map((t) => `"${t.coordinate}"`),
    {
      prefix: 'type',
      prefixPlural: 'types',
    }
  );
}

// Access the type set as a particular root in the provided `SchemaDefinition`, but ignoring "query" type
// that only exists due to federation operations. In other words, if a subgraph don't have a query type,
// but one was automatically added for _entities and _services, this method returns 'undefined'.
// This mainly avoid us trying to set the supergraph root in the rare case where the supergraph has
// no actual queries (knowing that subgraphs will _always_ have a queries since they have at least
// the federation ones).
function filteredRoot(def: SchemaDefinition, rootKind: SchemaRootKind): ObjectType | undefined {
  const type = def.root(rootKind)?.type;
  return type && hasMergedFields(type) ? type : undefined;
}

function hasMergedFields(type: ObjectType): boolean {
  for (const field of type.fields()) {
    if (isMergedField(field)) {
      return true;
    }
  }
  return false;
}

function indexOfMax(arr: number[]): number {
  if (arr.length === 0) {
    return -1;
  }
  let indexOfMax = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[indexOfMax]) {
      indexOfMax = i;
    }
  }
  return indexOfMax;
}

function descriptionString(toIndent: string, indentation: string): string {
  return indentation + '"""\n' + indentation + toIndent.replace('\n', '\n' + indentation) + '\n' + indentation + '"""';
}

function locationString(locations: DirectiveLocation[]): string {
  if (locations.length === 0) {
    return "";
  }
  return (locations.length === 1 ? 'location ' : 'locations ') + '"' + locations.join(', ') + '"';
}

type EnumTypeUsagePosition = 'Input' | 'Output' | 'Both';
type EnumTypeUsage = {
  position: EnumTypeUsagePosition,
  examples: {
    Input?: {coordinate: string, sourceAST?: SubgraphASTNode},
    Output?: {coordinate: string, sourceAST?: SubgraphASTNode},
  },
}

interface OverrideArgs {
  from: string;
  label?: string;
}

class Merger {
  readonly names: readonly string[];
  readonly subgraphsSchema: readonly Schema[];
  readonly errors: GraphQLError[] = [];
  readonly hints: CompositionHint[] = [];
  readonly merged: Schema = new Schema();
  readonly subgraphNamesToJoinSpecName: Map<string, string>;
  readonly mergedFederationDirectiveNames = new Set<string>();
  readonly mergedFederationDirectiveInSupergraph = new Map<string, { definition: DirectiveDefinition, argumentsMerger?: ArgumentMerger }>();
  readonly enumUsages = new Map<string, EnumTypeUsage>();
  private composeDirectiveManager: ComposeDirectiveManager;
  private mismatchReporter: MismatchReporter;
  private appliedDirectivesToMerge: {
    names: Set<string>,
    sources: (SchemaElement<any, any> | undefined)[],
    dest: SchemaElement<any, any>,
  }[];
  private joinSpec: JoinSpecDefinition;
  private linkSpec: CoreSpecDefinition;
  private inaccessibleSpec: InaccessibleSpecDefinition;
  private latestFedVersionUsed: FeatureVersion;
  private joinDirectiveIdentityURLs = new Set<string>();
  private schemaToImportNameToFeatureUrl = new Map<Schema, Map<string, FeatureUrl>>();

  constructor(readonly subgraphs: Subgraphs, readonly options: CompositionOptions) {
    this.latestFedVersionUsed = this.getLatestFederationVersionUsed();
    this.joinSpec = JOIN_VERSIONS.getMinimumRequiredVersion(this.latestFedVersionUsed);
    this.linkSpec = LINK_VERSIONS.getMinimumRequiredVersion(this.latestFedVersionUsed);
    this.inaccessibleSpec = INACCESSIBLE_VERSIONS.getMinimumRequiredVersion(this.latestFedVersionUsed);

    this.names = subgraphs.names();
    this.composeDirectiveManager = new ComposeDirectiveManager(
      this.subgraphs,
      (error: GraphQLError) => { this.errors.push(error) },
      (hint: CompositionHint) => { this.hints.push(hint) },
    );
    this.mismatchReporter = new MismatchReporter(
      this.names,
      (error: GraphQLError) => { this.errors.push(error); },
      (hint: CompositionHint) => { this.hints.push(hint); },
    );

    this.subgraphsSchema = subgraphs.values().map(({ schema }) => {
      if (!this.schemaToImportNameToFeatureUrl.has(schema)) {
        this.schemaToImportNameToFeatureUrl.set(
          schema,
          this.computeMapFromImportNameToIdentityUrl(schema),
        );
      }
      return schema;
    });

    this.subgraphNamesToJoinSpecName = this.prepareSupergraph();
    this.appliedDirectivesToMerge = [];

    [ // Represent any applications of directives imported from these spec URLs
      // using @join__directive in the merged supergraph.
      sourceIdentity,
    ].forEach(url => this.joinDirectiveIdentityURLs.add(url));
  }

  private getLatestFederationVersionUsed(): FeatureVersion {
    const versions = this.subgraphs.values()
                        .map((s) => this.getLatestFederationVersionUsedInSubgraph(s))
                        .filter(isDefined);

    return FeatureVersion.max(versions) ?? FEDERATION_VERSIONS.latest().version;
  }

  private getLatestFederationVersionUsedInSubgraph(subgraph: Subgraph): FeatureVersion | undefined {
    const linkedFederationVersion = subgraph.metadata()?.federationFeature()?.url.version;
    if (!linkedFederationVersion) {
      return undefined;
    }

    // Check if any of the directives imply a newer version of federation than is explicitly linked
    const versionsFromFeatures: FeatureVersion[] = [];
    for (const feature of subgraph.schema.coreFeatures?.allFeatures() ?? []) {
      const version = feature.minimumFederationVersion();
      if (version) {
        versionsFromFeatures.push(version);
      }
    }
    const impliedFederationVersion = FeatureVersion.max(versionsFromFeatures);
    if (!impliedFederationVersion?.satisfies(linkedFederationVersion) || linkedFederationVersion >= impliedFederationVersion) {
      return linkedFederationVersion;
    }

    // If some of the directives are causing an implicit upgrade, put one in the hint
    let featureCausingUpgrade: CoreFeature | undefined;
    for (const feature of subgraph.schema.coreFeatures?.allFeatures() ?? []) {
      if (feature.minimumFederationVersion() == impliedFederationVersion) {
        featureCausingUpgrade = feature;
        break;
      }
    }

    if (featureCausingUpgrade) {
      this.hints.push(new CompositionHint(
        HINTS.IMPLICITLY_UPGRADED_FEDERATION_VERSION,
        `Subgraph ${subgraph.name} has been implicitly upgraded from federation ${linkedFederationVersion} to ${impliedFederationVersion}`,
        featureCausingUpgrade.directive.definition,
        featureCausingUpgrade.directive.sourceAST ?
          addSubgraphToASTNode(featureCausingUpgrade.directive.sourceAST, subgraph.name) :
          undefined
      ));
    }

    return impliedFederationVersion;
  }


  private prepareSupergraph(): Map<string, string> {
    // TODO: we will soon need to look for name conflicts for @core and @join with potentially user-defined directives and
    // pass a `as` to the methods below if necessary. However, as we currently don't propagate any subgraph directives to
    // the supergraph outside of a few well-known ones, we don't bother yet.
    this.linkSpec.addToSchema(this.merged);
    const errors = this.linkSpec.applyFeatureToSchema(this.merged, this.joinSpec, undefined, this.joinSpec.defaultCorePurpose);
    assert(errors.length === 0, "We shouldn't have errors adding the join spec to the (still empty) supergraph schema");

    const directivesMergeInfo = collectCoreDirectivesToCompose(this.subgraphs);
    for (const mergeInfo of directivesMergeInfo) {
      this.validateAndMaybeAddSpec(mergeInfo);
    }

    return this.joinSpec.populateGraphEnum(this.merged, this.subgraphs);
  }

  private validateAndMaybeAddSpec({url, name, definitionsPerSubgraph, compositionSpec}: CoreDirectiveInSubgraphs) {
    // Not composition specification means that it shouldn't be composed.
    if (!compositionSpec) {
      return;
    }

    let nameInSupergraph: string | undefined;
    for (const subgraph of this.subgraphs) {
      const directive = definitionsPerSubgraph.get(subgraph.name);
      if (!directive) {
        continue;
      }

      if (!nameInSupergraph) {
        nameInSupergraph = directive.name;
      } else if (nameInSupergraph !== directive.name) {
        this.mismatchReporter.reportMismatchError(
          ERRORS.LINK_IMPORT_NAME_MISMATCH,
          `The "@${name}" directive (from ${url}) is imported with mismatched name between subgraphs: it is imported as `,
          directive,
          this.subgraphs.values().map((s) => definitionsPerSubgraph.get(s.name)),
          (def) => `"@${def.name}"`,
        );
        return;
      }
    }

    // If we get here with `nameInSupergraph` unset, it means there is no usage for the directive at all and we
    // don't bother adding the spec to the supergraph.
    if (nameInSupergraph) {
      const specInSupergraph = compositionSpec.supergraphSpecification(this.latestFedVersionUsed);
      const errors = this.linkSpec.applyFeatureToSchema(this.merged, specInSupergraph, nameInSupergraph === specInSupergraph.url.name ? undefined : nameInSupergraph, specInSupergraph.defaultCorePurpose);
      assert(errors.length === 0, "We shouldn't have errors adding the join spec to the (still empty) supergraph schema");
      const feature = this.merged?.coreFeatures?.getByIdentity(specInSupergraph.url.identity);
      assert(feature, 'Should have found the feature we just added');
      const argumentsMerger = compositionSpec.argumentsMerger?.call(null, this.merged, feature);
      if (argumentsMerger instanceof GraphQLError) {
        // That would mean we made a mistake in the declaration of a hard-coded directive, so we just throw right away so this can be caught and corrected.
        throw argumentsMerger;
      }
      this.mergedFederationDirectiveNames.add(nameInSupergraph);
      this.mergedFederationDirectiveInSupergraph.set(specInSupergraph.url.name, {
        definition: this.merged.directive(nameInSupergraph)!,
        argumentsMerger,
      });
    }
  }

  private joinSpecName(subgraphIndex: number): string {
    return this.subgraphNamesToJoinSpecName.get(this.names[subgraphIndex])!;
  }

  private metadata(idx: number): FederationMetadata {
    return this.subgraphs.values()[idx].metadata();
  }

  private isMergedDirective(subgraphName: string, definition: DirectiveDefinition | Directive): boolean {
    // If it's a directive application, then we skip it unless it's a graphQL built-in
    // (even if the definition itself allows executable locations, this particular
    // application is an type-system element and we don't want to merge it).
    if (this.composeDirectiveManager.shouldComposeDirective({ subgraphName, directiveName: definition.name })) {
      return true;
    }
    if (definition instanceof Directive) {
      // We have special code in `Merger.prepareSupergraph` to include the _definition_ of merged federation
      // directives in the supergraph, so we don't have to merge those _definition_, but we *do* need to merge
      // the applications.
      // Note that this is a temporary solution: a more principled way to have directive propagated
      // is coming and will remove the hard-coding.
      return this.mergedFederationDirectiveNames.has(definition.name) || isGraphQLBuiltInDirective(definition.definition!);
    } else if (isGraphQLBuiltInDirective(definition)) {
      // We never "merge" graphQL built-in definitions, since they are built-in and
      // don't need to be defined.
      return false;
    }
    return definition.hasExecutableLocations();
  }

  merge(): MergeResult {

    this.composeDirectiveManager.validate();
    this.addCoreFeatures();
    // We first create empty objects for all the types and directives definitions that will exists in the
    // supergraph. This allow to be able to reference those from that point on.
    this.addTypesShallow();
    this.addDirectivesShallow();

    const typesToMerge = this.merged.types()
      .filter((type) => !this.linkSpec.isSpecType(type) && !this.joinSpec.isSpecType(type));

    // Then, for object and interface types, we merge the 'implements' relationship, and we merge the unions.
    // We do this first because being able to know if a type is a subtype of another one (which relies on those
    // 2 things) is used when merging fields.
    for (const objectType of filterTypesOfKind<ObjectType>(typesToMerge, 'ObjectType')) {
      this.mergeImplements(this.subgraphsTypes(objectType), objectType);
    }
    for (const interfaceType of filterTypesOfKind<InterfaceType>(typesToMerge, 'InterfaceType')) {
      this.mergeImplements(this.subgraphsTypes(interfaceType), interfaceType);
    }
    for (const unionType of filterTypesOfKind<UnionType>(typesToMerge, 'UnionType')) {
      this.mergeType(this.subgraphsTypes(unionType), unionType);
    }

    // We merge the roots first as it only depend on the type existing, not being fully merged, and when
    // we merge types next, we actually rely on this having been called to detect "root types"
    // (in order to skip the _entities and _service fields on that particular type, and to avoid
    // calling root type a "value type" when hinting).
    this.mergeSchemaDefinition(this.subgraphsSchema.map(s => s.schemaDefinition), this.merged.schemaDefinition);

    for (const type of typesToMerge) {
      // We've already merged unions above and we've going to merge enums last
      if (type.kind === 'UnionType' || type.kind === 'EnumType') {
        continue;
      }
      this.mergeType(this.subgraphsTypes(type), type);
    }

    for (const definition of this.merged.directives()) {
      // we should skip the supergraph specific directives, that is the @core and @join directives.
      if (this.linkSpec.isSpecDirective(definition) || this.joinSpec.isSpecDirective(definition)) {
        continue;
      }
      this.mergeDirectiveDefinition(this.subgraphsSchema.map(s => s.directive(definition.name)), definition);
    }

    // We merge enum dead last because enums can be used as both input and output types and the merging behavior
    // depends on their usage and it's easier to check said usage if everything else has been merge (at least
    // anything that may use an enum type, so all fields and arguments).
    for (const enumType of filterTypesOfKind<EnumType>(typesToMerge, 'EnumType')) {
      this.mergeType(this.subgraphsTypes(enumType), enumType);
    }

    if (!this.merged.schemaDefinition.rootType('query')) {
      this.errors.push(ERRORS.NO_QUERIES.err("No queries found in any subgraph: a supergraph must have a query root type."));
    }

    this.mergeAllAppliedDirectives();

    // When @interfaceObject is used in a subgraph, then that subgraph essentially provides fields both
    // to the interface but also to all its implementations. But so far, we only merged the type definition
    // itself, so we now need to potentially add the field to the implementations if missing.
    // Note that we do this after everything else have been merged because this method will essentially
    // copy things from interface in the merged schema into their implementation in that same schema so
    // we want to make sure everything is ready.
    this.addMissingInterfaceObjectFieldsToImplementations();

    // If we already encountered errors, `this.merged` is probably incomplete. Let's not risk adding errors that
    // are only an artifact of that incompleteness as it's confusing.
    if (this.errors.length === 0) {
      this.postMergeValidations();

      if (this.errors.length === 0) {
        try {
          // TODO: Errors thrown by the `validate` below are likely to be confusing for users, because they
          // refer to a document they don't know about (the merged-but-not-returned supergraph) and don't
          // point back to the subgraphs in any way.
          // Given the subgraphs are valid and given how merging works (it takes the union of what is in the
          // subgraphs), there is only so much things that can be invalid in the supergraph at this point. We
          // should make sure we add all such validation to `postMergeValidations` with good error messages (that points
          // to subgraphs appropriately). and then simply _assert_ that `Schema.validate()` doesn't throw as a sanity
          // check.
          this.merged.validate();
          // Lastly, we validate that the API schema of the supergraph can be successfully compute, which currently will surface issues around
          // misuses of `@inaccessible` (there should be other errors in theory, but if there is, better find it now rather than later).
          this.merged.toAPISchema();
        } catch (e) {
          const causes = errorCauses(e);
          if (causes) {
            this.errors.push(...this.updateInaccessibleErrorsWithLinkToSubgraphs(causes));
          } else {
            // Not a GraphQLError, so probably a programming error. Let's re-throw so it can be more easily tracked down.
            throw e;
          }
        }
      }
    }

    if (this.errors.length > 0) {
      return { errors: this.errors };
    } else {
      return {
        supergraph: this.merged,
        hints: this.hints
      }
    }
  }

  // Amongst other thing, this will ensure all the definitions of a given name are of the same kind
  // and report errors otherwise.
  private addTypesShallow() {
    const mismatchedTypes = new Set<string>();
    const typesWithInterfaceObject = new Set<string>();
    for (const subgraph of this.subgraphs) {
      const metadata = subgraph.metadata();

      // We include the built-ins in general (even if we skip some federation specific ones): if a subgraph built-in
      // is not a supergraph built-in, we should add it as a normal type.
      for (const type of subgraph.schema.allTypes()) {
        if (!isMergedType(type)) {
          continue;
        }

        let expectedKind = type.kind;
        if (metadata.isInterfaceObjectType(type)) {
          expectedKind = 'InterfaceType';
          typesWithInterfaceObject.add(type.name);
        }
        const previous = this.merged.type(type.name);
        if (!previous) {
          this.merged.addType(newNamedType(expectedKind, type.name));
        } else if (previous.kind !== expectedKind) {
          mismatchedTypes.add(type.name);
        }
      }
    }
    mismatchedTypes.forEach(t => this.reportMismatchedTypeDefinitions(t));

    // Most invalid use of @interfaceObject are reported as a mismatch above, but one exception is the
    // case where a type is used only with @interfaceObject, but there is no corresponding interface
    // definition in any subgraph.
    for (const itfObjectType of typesWithInterfaceObject) {
      if (mismatchedTypes.has(itfObjectType)) {
        continue;
      }

      if (!this.subgraphsSchema.some((s) => s.type(itfObjectType)?.kind === 'InterfaceType')) {
        const subgraphsWithType = this.subgraphs.values().filter((s) => s.schema.type(itfObjectType) !== undefined);
        // Note that there is meaningful way in which the supergraph could work in this situation, expect maybe if
        // the type is unused, because validation composition would complain it cannot find the `__typename` in path
        // leading to that type. But the error here is a bit more "direct"/user friendly than what post-merging
        // validation would return, so we make this a hard error, not just a warning.
        this.errors.push(ERRORS.INTERFACE_OBJECT_USAGE_ERROR.err(
          `Type "${itfObjectType}" is declared with @interfaceObject in all the subgraphs in which is is defined (it is defined in ${printSubgraphNames(subgraphsWithType.map((s) => s.name))} but should be defined as an interface in at least one subgraph)`,
          { nodes: sourceASTs(...subgraphsWithType.map((s) => s.schema.type(itfObjectType))) },
        ));
      }
    }
  }

  private addCoreFeatures() {
    const features = this.composeDirectiveManager.allComposedCoreFeatures();
    for (const [feature, directives] of features) {
      const imports = directives.map(([asName, origName]) => {
        if (asName === origName) {
          return `@${asName}`;
        } else {
          return {
            name: `@${origName}`,
            as: `@${asName}`,
          };
        }
      });
      this.merged.schemaDefinition.applyDirective('link', {
        url: feature.url.toString(),
        import: imports,
      });
    }
  }

  private addDirectivesShallow() {
    // Like for types, we initially add all the directives that are defined in any subgraph.
    // However, in practice and for "execution" directives, we will only keep the the ones
    // that are in _all_ subgraphs. But we're do the remove later, and while this is all a
    // bit round-about, it's a tad simpler code-wise to do this way.
    this.subgraphsSchema.forEach((subgraph, idx) => {
      for (const directive of subgraph.allDirectives()) {
        if (!this.isMergedDirective(this.names[idx], directive)) {
          continue;
        }
        if (!this.merged.directive(directive.name)) {
          this.merged.addDirectiveDefinition(new DirectiveDefinition(directive.name));
        }
      }
    });
  }

  private reportMismatchedTypeDefinitions(mismatchedType: string) {
    const supergraphType = this.merged.type(mismatchedType)!;
    const typeKindToString = (t: NamedType) => {
      const metadata = federationMetadata(t.schema());
      if (metadata?.isInterfaceObjectType(t)) {
        return 'Interface Object Type (Object Type with @interfaceObject)';
      } else {
        return t.kind.replace("Type", " Type");
      }
    };
    this.mismatchReporter.reportMismatchError(
      ERRORS.TYPE_KIND_MISMATCH,
      `Type "${mismatchedType}" has mismatched kind: it is defined as `,
      supergraphType,
      this.subgraphsSchema.map(s => s.type(mismatchedType)),
      typeKindToString
    );
  }

  private subgraphsTypes<T extends NamedType>(supergraphType: T): (T | undefined)[] {
    return this.subgraphs.values().map((subgraph) => {
      const type = subgraph.schema.type(supergraphType.name);
      if (!type) {
        return undefined;
      }

      // At this point, we have already reported errors for type mismatches (and so composition
      // will fail, we just try to gather more errors), so simply ignore versions of the type
      // that don't have the "proper" kind.
      const kind = subgraph.metadata().isInterfaceObjectType(type) ? 'InterfaceType' : type.kind;
      if (kind !== supergraphType.kind) {
        return undefined;
      }
      return type as T;
    });
  }

  private mergeImplements<T extends ObjectType | InterfaceType>(sources: (T | undefined)[], dest: T) {
    const implemented = new Set<string>();
    const joinImplementsDirective = this.joinSpec.implementsDirective(this.merged)!;
    for (const [idx, source] of sources.entries()) {
      if (source) {
        const name = this.joinSpecName(idx);
        for (const itf of source.interfaces()) {
          implemented.add(itf.name);
          dest.applyDirective(joinImplementsDirective, { graph: name, interface: itf.name });
        }
      }
    }
    implemented.forEach(itf => dest.addImplementedInterface(itf));
  }

  private mergeDescription<T extends SchemaElement<any, any>>(sources: (T | undefined)[], dest: T) {
    const descriptions: string[] = [];
    const counts: number[] = [];
    for (const source of sources) {
      if (!source || source.description === undefined) {
        continue;
      }

      const idx = descriptions.indexOf(source.description);
      if (idx < 0) {
        descriptions.push(source.description);
        // Very much a hack but simple enough: while we do merge 'empty-string' description if that's all we have (debatable behavior in the first place,
        // but graphQL-js does print such description and fed 1 has historically merged them so ...), we really don't want to favor those if we
        // have any non-empty description, even if we have more empty ones across subgraphs. So we use a super-negative base count if the description
        // is empty so that our `indexOfMax` below never pick them if there is a choice.
        counts.push(source.description === '' ? Number.MIN_SAFE_INTEGER : 1);
      } else {
        counts[idx]++;
      }
    }

    if (descriptions.length > 0) {
      // we don't want to raise a hint if a description is ""
      const nonEmptyDescriptions = descriptions.filter(desc => desc !== '');
      if (descriptions.length === 1) {
        dest.description = descriptions[0];
      } else if (nonEmptyDescriptions.length === 1) {
        dest.description = nonEmptyDescriptions[0];
      } else {
        const idx = indexOfMax(counts);
        dest.description = descriptions[idx];
        // TODO: Currently showing full descriptions in the hint messages, which is probably fine in some cases. However
        // this might get less helpful if the description appears to differ by a very small amount (a space, a single character typo)
        // and even more so the bigger the description is, and we could improve the experience here. For instance, we could
        // print the supergraph description but then show other descriptions as diffs from that (using, say, https://www.npmjs.com/package/diff).
        // And we could even switch between diff/non-diff modes based on the levenshtein distances between the description we found.
        // That said, we should decide if we want to bother here: maybe we can leave it to studio so handle a better experience (as
        // it can more UX wise).
        const name = dest instanceof NamedSchemaElement ? `Element "${dest.coordinate}"` : 'The schema definition';
        this.mismatchReporter.reportMismatchHint({
          code: HINTS.INCONSISTENT_DESCRIPTION,
          message: `${name} has inconsistent descriptions across subgraphs. `,
          supergraphElement: dest,
          subgraphElements: sources,
          elementToString: elt => elt.description,
          supergraphElementPrinter: (desc, subgraphs) => `The supergraph will use description (from ${subgraphs}):\n${descriptionString(desc, '  ')}`,
          otherElementsPrinter: (desc: string, subgraphs) => `\nIn ${subgraphs}, the description is:\n${descriptionString(desc, '  ')}`,
          ignorePredicate: elt => elt?.description === undefined,
          noEndOfMessageDot: true,  // Skip the end-of-message '.' since it would look ugly in that specific case
        });
      }
    }
  }

  // Note that we know when we call this method that all the types in sources and dest have the same kind.
  // We could express this through a generic argument, but typescript is not smart enough to save us
  // type-casting even if we do, and in fact, using a generic forces a case on `dest` for some reason.
  // So we don't bother.
  private mergeType(sources: (NamedType | undefined)[], dest: NamedType) {
    this.checkForExtensionWithNoBase(sources, dest);
    this.mergeDescription(sources, dest);
    this.addJoinType(sources, dest);
    this.recordAppliedDirectivesToMerge(sources, dest);
    this.addJoinDirectiveDirectives(sources, dest);
    switch (dest.kind) {
      case 'ScalarType':
        // Since we don't handle applied directives yet, we have nothing specific to do for scalars.
        break;
      case 'ObjectType':
        this.mergeObject(sources as (ObjectType | undefined)[], dest);
        break;
      case 'InterfaceType':
        // Note that due to @interfaceObject, we can have some ObjectType in the sources, not just interfaces.
        this.mergeInterface(sources as (InterfaceType | ObjectType | undefined)[], dest);
        break;
      case 'UnionType':
        this.mergeUnion(sources as (UnionType | undefined)[], dest);
        break;
      case 'EnumType':
        this.mergeEnum(sources as (EnumType | undefined)[], dest);
        break;
      case 'InputObjectType':
        this.mergeInput(sources as (InputObjectType | undefined)[], dest);
        break;
    }
  }

  private checkForExtensionWithNoBase(sources: (NamedType | undefined)[], dest: NamedType) {
    if (isObjectType(dest) && dest.isRootType()) {
      return;
    }

    const defSubgraphs: string[] = [];
    const extensionSubgraphs: string[] = [];
    const extensionASTs: (ASTNode|undefined)[] = [];

    for (const [i, source] of sources.entries()) {
      if (!source) {
        continue;
      }
      if (source.hasNonExtensionElements()) {
        defSubgraphs.push(this.names[i]);
      }
      if (source.hasExtensionElements()) {
        extensionSubgraphs.push(this.names[i]);
        extensionASTs.push(firstOf<Extension<any>>(source.extensions().values())!.sourceAST);
      }
    }
    if (extensionSubgraphs.length > 0 && defSubgraphs.length === 0) {
      for (const [i, subgraph] of extensionSubgraphs.entries()) {
        this.errors.push(ERRORS.EXTENSION_WITH_NO_BASE.err(
          `[${subgraph}] Type "${dest}" is an extension type, but there is no type definition for "${dest}" in any subgraph.`,
          { nodes: extensionASTs[i] },
        ));
      }
    }
  }

  private addJoinType(sources: (NamedType | undefined)[], dest: NamedType) {
    const joinTypeDirective = this.joinSpec.typeDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      if (!source) {
        continue;
      }

      // There is either 1 join__type per-key, or if there is no key, just one for the type.
      const sourceMetadata = this.subgraphs.values()[idx].metadata();
      // Note that mechanically we don't need to substitute `undefined` for `false` below (`false` is the
      // default value), but doing so 1) yield smaller supergraph (because the parameter isn't included)
      // and 2) this avoid needless discrepancies compared to supergraphs generated before @interfaceObject was added.
      const isInterfaceObject = sourceMetadata.isInterfaceObjectType(source) ? true : undefined;
      const keys = source.appliedDirectivesOf(sourceMetadata.keyDirective());
      const name = this.joinSpecName(idx);
      if (!keys.length) {
        dest.applyDirective(joinTypeDirective, { graph: name, isInterfaceObject });
      } else {
        for (const key of keys) {
          const extension = key.ofExtension() || source.hasAppliedDirective(sourceMetadata.extendsDirective()) ? true : undefined;
          const { resolvable } = key.arguments();
          dest.applyDirective(joinTypeDirective, { graph: name, key: key.arguments().fields, extension, resolvable, isInterfaceObject });
        }
      }
    }
  }

  private mergeObject(sources: (ObjectType | undefined)[], dest: ObjectType) {
    const isEntity = this.hintOnInconsistentEntity(sources, dest);
    const isValueType = !isEntity && !dest.isRootType();
    const isSubscription = dest.isSubscriptionRootType();

    this.addFieldsShallow(sources, dest);
    if (!dest.hasFields()) {
      // This can happen for a type that existing in the subgraphs but had only non-merged fields
      // (currently, this can only be the 'Query' type, in the rare case where the federated schema
      // exposes no queries) .
      dest.remove();
    } else {
      for (const destField of dest.fields()) {
        if (isValueType) {
          this.hintOnInconsistentValueTypeField(sources, dest, destField);
        }
        const subgraphFields = sources.map(t => t?.field(destField.name));
        const mergeContext = this.validateOverride(subgraphFields, destField);

        if (isSubscription) {
          this.validateSubscriptionField(subgraphFields);
        }

        this.mergeField({
          sources: subgraphFields,
          dest: destField,
          mergeContext,
        });
        this.validateFieldSharing(subgraphFields, destField, mergeContext);
      }
    }
  }

  // Return whether the type is an entity in at least one subgraph.
  private hintOnInconsistentEntity(sources: (ObjectType | undefined)[], dest: ObjectType): boolean {
    const sourceAsEntity: ObjectType[] = [];
    const sourceAsNonEntity: ObjectType[] = [];
    for (const source of sources) {
      if (!source) {
        continue;
      }
      if (source.hasAppliedDirective('key')) {
        sourceAsEntity.push(source);
      } else {
        sourceAsNonEntity.push(source);
      }
    }
    if (sourceAsEntity.length > 0 && sourceAsNonEntity.length > 0) {
      this.mismatchReporter.reportMismatchHint({
        code: HINTS.INCONSISTENT_ENTITY,
        message: `Type "${dest}" is declared as an entity (has a @key applied) in some but not all defining subgraphs: `,
        supergraphElement: dest,
        subgraphElements: sources,
        // All we use the string of the next line for is to categorize source with a @key of the others.
        elementToString: type => type.hasAppliedDirective('key') ? 'yes' : 'no',
        // Note that the first callback is for element that are "like the supergraph". As the supergraph has no @key ...
        supergraphElementPrinter: (_, subgraphs) => `it has no @key in ${subgraphs}`,
        otherElementsPrinter: (_, subgraphs) => ` but has some @key in ${subgraphs}`,
      });
    }
    return sourceAsEntity.length > 0;
  }

  // Assume it is called on a field of a value type
  private hintOnInconsistentValueTypeField(
    sources: (ObjectType | InterfaceType | undefined)[],
    dest: ObjectType | InterfaceType,
    field: FieldDefinition<any>,
  ) {
    let hintId: HintCodeDefinition;
    let typeDescription: string;
    switch (dest.kind) {
      case 'ObjectType':
        hintId = HINTS.INCONSISTENT_OBJECT_VALUE_TYPE_FIELD;
        typeDescription = 'non-entity object'
        break;
      case 'InterfaceType':
        hintId = HINTS.INCONSISTENT_INTERFACE_VALUE_TYPE_FIELD;
        typeDescription = 'interface'
        break;
    }
    for (const [index, source] of sources.entries()) {
      // As soon as we find a subgraph that has the type but not the field, we hint.
      if (source && !source.field(field.name) && !this.areAllFieldsExternal(index, source)) {
        this.mismatchReporter.reportMismatchHint({
          code: hintId,
          message: `Field "${field.coordinate}" of ${typeDescription} type "${dest}" is defined in some but not all subgraphs that define "${dest}": `,
          supergraphElement: dest,
          subgraphElements: sources,
          elementToString: type => type.field(field.name) ? 'yes' : 'no',
          supergraphElementPrinter: (_, subgraphs) => `"${field.coordinate}" is defined in ${subgraphs}`,
          otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
        });
      }
    }
  }

  private addMissingInterfaceObjectFieldsToImplementations() {
    // For each merged object types, we check if we're missing a field from one of the implemented interface.
    // If we do, then we look if one of the subgraph provides that field as a (non-external) interface object
    // type, and if that's the case, we add the field to the object.
    for (const type of this.merged.objectTypes()) {
      for (const implementedItf of type.interfaces()) {
        for (const itfField of implementedItf.fields()) {
          if (type.field(itfField.name)) {
            continue;
          }

          // Note that we don't blindly add the field yet, that would be incorrect in many cases (and we
          // have a specific validation that return a user-friendly error in such incorrect cases, see
          // `postMergeValidations`). We must first check that there is some subgraph that implement
          // that field as an "interface object", since in that case the field will genuinely be provided
          // by that subgraph at runtime.
          if (this.isFieldProvidedByAnInterfaceObject(itfField.name, implementedItf.name)) {
            // Note it's possible that interface is abstracted away (as an interface object) in multiple
            // subgraphs, so we don't bother with the field definition in those subgraphs, but rather
            // just copy the merged definition from the interface.
            const implemField = type.addField(itfField.name, itfField.type);
            // Cases could probably be made for both either copying or not copying the description
            // and applied directives from the interface field, but we copy both here as it feels
            // more likely to be what user expects (assume they care either way). It's unlikely
            // this will be an issue to anyone, but we can always make this behaviour tunable
            // "somehow" later if the need arise. Feels highly overkill at this point though.
            implemField.description = itfField.description;
            this.copyNonJoinAppliedDirectives(itfField, implemField);
            for (const itfArg of itfField.arguments()) {
              const implemArg = implemField.addArgument(itfArg.name, itfArg.type, itfArg.defaultValue);
              implemArg.description = itfArg.description;
              this.copyNonJoinAppliedDirectives(itfArg, implemArg);
            }

            // We add a special @join__field for those added field with no `graph` target. This
            // clarify to the later extraction process that this particular field doesn't come
            // from any particular subgraph (it comes indirectly from an @interfaceObject type,
            // but it's very much indirect so ...).
            implemField.applyDirective(this.joinSpec.fieldDirective(this.merged), { graph: undefined });


            // If we had to add a field here, it means that, for this particular implementation, the
            // field is only provided through the @interfaceObject. But because the field wasn't
            // merged, it also mean we haven't validated field sharing for that field, and we could
            // have field sharing concerns if the field is provided by multiple @interfaceObject.
            // So we validate field sharing now (it's convenient to wait until now as now that
            // the field is part of the supergraph, we can just call `validateFieldSharing` with
            // all sources `undefined` and it wil still find and check the `@interfaceObject`).
            const sources = new Array<undefined>(this.names.length);
            this.validateFieldSharing(sources, implemField, new FieldMergeContext(sources));
          }
        }
      }
    }
  }

  private copyNonJoinAppliedDirectives(source: SchemaElement<any, any>, dest: SchemaElement<any, any>) {
    // This method is used to copy "user provided" applied directives from interface fields to some
    // implementation type when @interfaceObject is used. But we shouldn't copy the `join` spec directive
    // as those are for the interface field but are invalid for the implementation field.
    source.appliedDirectives.forEach((d) => {
      if (!this.joinSpec.isSpecDirective(d.definition!)) {
        dest.applyDirective(d.name, {...d.arguments()})
      }
    });
  }

  private isFieldProvidedByAnInterfaceObject(fieldName: string, interfaceName: string): boolean {
    return this.subgraphs.values().some((s) => {
      const meta = s.metadata();
      const type = s.schema.type(interfaceName);
      const field = type && meta.isInterfaceObjectType(type) ? type.field(fieldName) : undefined;
      return field && !meta.isFieldExternal(field);
    });
  }

  private addFieldsShallow<T extends ObjectType | InterfaceType | InputObjectType>(sources: (T | undefined)[], dest: T) {
    for (const source of sources) {
      if (!source) {
        continue;
      }
      for (const field of source.fields()) {
        if (!isMergedField(field)) {
          continue;
        }
        if (!dest.field(field.name)) {
          dest.addField(field.name);
        }
      }
    }
  }

  private isExternal(sourceIdx: number, field: FieldDefinition<any> | InputFieldDefinition) {
    return this.metadata(sourceIdx).isFieldExternal(field);
  }

  private isFullyExternal(sourceIdx: number, field: FieldDefinition<any> | InputFieldDefinition) {
    return this.metadata(sourceIdx).isFieldFullyExternal(field);
  }

  private areAllFieldsExternal(sourceIdx: number, type: ObjectType | InterfaceType): boolean {
    return type.fields().every(f => this.isExternal(sourceIdx, f));
  }

  private validateAndFilterExternal(sources: (FieldDefinition<any> | undefined)[]): (FieldDefinition<any> | undefined)[] {
    const filtered: (FieldDefinition<any> | undefined)[] = [];
    for (const [i, source] of sources.entries()) {
      // If the source doesn't have the field or it is not external, we mirror the input
      if (source == undefined || !this.isExternal(i, source)) {
        filtered.push(source);
      } else {
        // Otherwise, we filter out the source, but also "validate" it.
        filtered.push(undefined);

        // We don't allow "merged" directives on external fields because as far as merging goes, external fields don't really
        // exists and allowing "merged" directives on them is dodgy. To take examples, having a `@deprecated` or `@tag` on
        // an external feels unclear semantically: should it deprecate/tag the field? Essentially we're saying that "no it
        // shouldn't" and so it's clearer to reject it.
        // Note that if we change our mind on this semantic and wanted directives on external to propagate, then we'll also
        // need to update the merging of fields since external fields are filtered out (by this very method).
        for (const directive of source.appliedDirectives) {
          if (this.isMergedDirective(source.name, directive)) {
            // Contrarily to most of the errors during merging that "merge" errors for related elements, we're logging one
            // error for every application here. But this is because there error is somewhat subgraph specific and is
            // unlikely to span multiple subgraphs. In fact, we could almost have thrown this error during subgraph validation
            // if this wasn't for the fact that it is only thrown for directives being merged and so is more logical to
            // be thrown only when merging.
            this.errors.push(ERRORS.MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL.err(
              `[${this.names[i]}] Cannot apply merged directive ${directive} to external field "${source.coordinate}"`,
              { nodes: directive.sourceAST },
            ));
          }
        }
      }
    }
    return filtered;
  }

  private hasExternal(sources: FieldOrUndefinedArray): boolean {
    return sources.some((s, i) => s !== undefined && this.isExternal(i, s));
  }

  private isShareable(sourceIdx: number, field: FieldDefinition<any>): boolean {
    return this.metadata(sourceIdx).isFieldShareable(field);
  }

  private getOverrideDirective(sourceIdx: number, field: FieldDefinition<any>): Directive<any, OverrideArgs> | undefined {
    // Check the directive on the field, then on the enclosing type.
    const metadata = this.metadata(sourceIdx);
    const overrideDirective = metadata.isFed2Schema() ? metadata.overrideDirective() : undefined;
    const allFieldOverrides = overrideDirective ? field.appliedDirectivesOf(overrideDirective) : [];
    return allFieldOverrides[0]; // if array is empty, will return undefined
  }

  private overrideConflictsWithOtherDirective({
    idx,
    field,
    subgraphName,
    fromIdx,
    fromField,
  }: {
    idx: number;
    field: FieldDefinition<any> | undefined;
    subgraphName: string;
    fromIdx: number;
    fromField: FieldDefinition<any> | undefined;
  }): { result: boolean, conflictingDirective?: DirectiveDefinition, subgraph?: string } {
    const fromMetadata = this.metadata(fromIdx);
    for (const directive of [fromMetadata.requiresDirective(), fromMetadata.providesDirective()]) {
      if (fromField?.hasAppliedDirective(directive)) {
         return {
           result: true,
           conflictingDirective: directive,
           subgraph: this.names[fromIdx],
         };
       }
    }
    if (field && this.isExternal(idx, field)) {
      return {
        result: true,
        conflictingDirective: fromMetadata.externalDirective(),
        subgraph: subgraphName,
      };
    }
    return { result: false };
  }

  /**
   * Validates whether or not the use of the @override directive is correct.
   * return value is a list of fields that has been filtered to ignore overridden fields
   */
  private validateOverride(sources: FieldOrUndefinedArray, dest: FieldDefinition<any>): FieldMergeContext {
    const result = new FieldMergeContext(sources);

    // For any field, we can't have more than one @override directive
    type MappedValue = {
      idx: number,
      name: string,
      isInterfaceField?: boolean,
      isInterfaceObject?: boolean,
      interfaceObjectAbstractingFields?: FieldDefinition<any>[],
      overrideDirective?: Directive<FieldDefinition<any>, OverrideArgs>,
    };

    type ReduceResultType = {
      subgraphsWithOverride: string[],
      subgraphMap: { [key: string]: MappedValue },
    };

    // convert sources to a map so we don't have to keep scanning through the array to find a source
    const { subgraphsWithOverride, subgraphMap } = sources.map((source, idx) => {
      if (!source) {
        // While the subgraph may not have the field directly, it could have "stand-in" for that field
        // through @interfaceObject, and it is those stand-ins that would be effectively overridden.
        const interfaceObjectAbstractingFields = this.fieldsInSourceIfAbstractedByInterfaceObject(dest, idx);
        if (interfaceObjectAbstractingFields.length > 0) {
          return {
            idx,
            name: this.names[idx],
            interfaceObjectAbstractingFields,
          };
        }

        return undefined;
      }

      return {
        idx,
        name: this.names[idx],
        isInterfaceField: isInterfaceType(source.parent),
        isInterfaceObject: this.metadata(idx).isInterfaceObjectType(source.parent),
        overrideDirective: this.getOverrideDirective(idx, source),
      };
    }).reduce((acc: ReduceResultType, elem) => {
      if (elem !== undefined) {
        acc.subgraphMap[elem.name] = elem;
        if (elem.overrideDirective !== undefined) {
          acc.subgraphsWithOverride.push(elem.name);
        }
      }
      return acc;
    }, { subgraphsWithOverride: [], subgraphMap: {} });

    // for each subgraph that has an @override directive, check to see if any errors or hints should be surfaced
    subgraphsWithOverride.forEach((subgraphName) => {
      const { overrideDirective, idx, isInterfaceObject, isInterfaceField } = subgraphMap[subgraphName];
      if (!overrideDirective) return;

      const overridingSubgraphASTNode = overrideDirective.sourceAST ? addSubgraphToASTNode(overrideDirective.sourceAST, subgraphName) : undefined;
      if (isInterfaceField) {
        this.errors.push(ERRORS.OVERRIDE_ON_INTERFACE.err(
          `@override cannot be used on field "${dest.coordinate}" on subgraph "${subgraphName}": @override is not supported on interface type fields.`,
          { nodes: overridingSubgraphASTNode }
        ));
        return;
      }

      if (isInterfaceObject) {
        this.errors.push(ERRORS.OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE.err(
          `@override is not yet supported on fields of @interfaceObject types: cannot be used on field "${dest.coordinate}" on subgraph "${subgraphName}".`,
          { nodes: overridingSubgraphASTNode }
        ));
        return;
      }

      const sourceSubgraphName = overrideDirective.arguments().from;
      if (!this.names.includes(sourceSubgraphName)) {
        result.setOverrideWithUnknownTarget(idx);
        const suggestions = suggestionList(sourceSubgraphName, this.names);
        const extraMsg = didYouMean(suggestions);
        this.hints.push(new CompositionHint(
          HINTS.FROM_SUBGRAPH_DOES_NOT_EXIST,
          `Source subgraph "${sourceSubgraphName}" for field "${dest.coordinate}" on subgraph "${subgraphName}" does not exist.${extraMsg}`,
          dest,
          overridingSubgraphASTNode,
        ));
      } else if (sourceSubgraphName === subgraphName) {
        this.errors.push(ERRORS.OVERRIDE_FROM_SELF_ERROR.err(
          `Source and destination subgraphs "${sourceSubgraphName}" are the same for overridden field "${dest.coordinate}"`,
          { nodes: overrideDirective.sourceAST },
        ));
      } else if (subgraphsWithOverride.includes(sourceSubgraphName)) {
        this.errors.push(ERRORS.OVERRIDE_SOURCE_HAS_OVERRIDE.err(
          `Field "${dest.coordinate}" on subgraph "${subgraphName}" is also marked with directive @override in subgraph "${sourceSubgraphName}". Only one @override directive is allowed per field.`,
          { nodes: sourceASTs(overrideDirective, subgraphMap[sourceSubgraphName].overrideDirective) }
        ));
      } else if (subgraphMap[sourceSubgraphName] === undefined) {
        this.hints.push(new CompositionHint(
          HINTS.OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
          `Field "${dest.coordinate}" on subgraph "${subgraphName}" no longer exists in the from subgraph. The @override directive can be removed.`,
          dest,
          overridingSubgraphASTNode,
        ));
      } else {
        // For now, we don't supporting overriding a field that is not truly in the source subgraph, but is instead abstracted by
        // one or more @interfaceObject.
        const { interfaceObjectAbstractingFields } = subgraphMap[sourceSubgraphName];
        if (interfaceObjectAbstractingFields) {
          const abstractingTypes = printTypes(interfaceObjectAbstractingFields.map((f) => f.parent));
          this.errors.push(ERRORS.OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE.err(
            `Invalid @override on field "${dest.coordinate}" of subgraph "${subgraphName}": source subgraph "${sourceSubgraphName}" does not have field "${dest.coordinate}" but abstract it in ${abstractingTypes} and overriding abstracted fields is not supported.`,
            { nodes: sourceASTs(overrideDirective, subgraphMap[sourceSubgraphName].overrideDirective) }
          ));
          return;
        }

        // check to make sure that there is no conflicting @provides, @requires, or @external directives
        const fromIdx = this.names.indexOf(sourceSubgraphName);
        const fromField = sources[fromIdx];
        const { result: hasIncompatible, conflictingDirective, subgraph } = this.overrideConflictsWithOtherDirective({
          idx,
          field: sources[idx],
          subgraphName,
          fromIdx: this.names.indexOf(sourceSubgraphName),
          fromField: sources[fromIdx],
        });
        if (hasIncompatible) {
          assert(conflictingDirective !== undefined, 'conflictingDirective should not be undefined');
          this.errors.push(ERRORS.OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE.err(
            `@override cannot be used on field "${fromField?.coordinate}" on subgraph "${subgraphName}" since "${fromField?.coordinate}" on "${subgraph}" is marked with directive "@${conflictingDirective.name}"`,
            { nodes: sourceASTs(overrideDirective, conflictingDirective) }
          ));
        } else {
          // if we get here, then the @override directive is valid
          // if the field being overridden is used, then we need to add an @external directive
          assert(fromField, 'fromField should not be undefined');
          const overriddenSubgraphASTNode = fromField.sourceAST ? addSubgraphToASTNode(fromField.sourceAST, sourceSubgraphName) : undefined;
          const overrideLabel = overrideDirective.arguments().label;
          const overriddenFieldIsReferenced = !!this.metadata(fromIdx).isFieldUsed(fromField);
          if (this.isExternal(fromIdx, fromField)) {
            // The from field is explicitly marked external by the user (which means it is "used" and cannot be completely
            // removed) so the @override can be removed.
            this.hints.push(new CompositionHint(
              HINTS.OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
              `Field "${dest.coordinate}" on subgraph "${subgraphName}" is not resolved anymore by the from subgraph (it is marked "@external" in "${sourceSubgraphName}"). The @override directive can be removed.`,
              dest,
              overridingSubgraphASTNode,
            ));
          } else if (overriddenFieldIsReferenced) {
            result.setUsedOverridden(fromIdx);
            if (!overrideLabel) {
              this.hints.push(new CompositionHint(
                HINTS.OVERRIDDEN_FIELD_CAN_BE_REMOVED,
                  `Field "${dest.coordinate}" on subgraph "${sourceSubgraphName}" is overridden. It is still used in some federation directive(s) (@key, @requires, and/or @provides) and/or to satisfy interface constraint(s), but consider marking it @external explicitly or removing it along with its references.`,
                  dest,
                  overriddenSubgraphASTNode,
                )
              );
            }
          } else {
            result.setUnusedOverridden(fromIdx);
            if (!overrideLabel) {
              this.hints.push(new CompositionHint(
                HINTS.OVERRIDDEN_FIELD_CAN_BE_REMOVED,
                `Field "${dest.coordinate}" on subgraph "${sourceSubgraphName}" is overridden. Consider removing it.`,
                dest,
                overriddenSubgraphASTNode,
              ));
            }
          }

          // capture an override label if it exists
          if (overrideLabel) {
            const labelRegex = /^[a-zA-Z][a-zA-Z0-9_\-:./]*$/;
            // Enforce that the label matches the following pattern: percent(x)
            // where x is a float between 0 and 100 with no more than 8 decimal places
            const percentRegex = /^percent\((\d{1,2}(\.\d{1,8})?|100)\)$/;
            if (labelRegex.test(overrideLabel)) {
              result.setOverrideLabel(idx, overrideLabel);
              result.setOverrideLabel(fromIdx, overrideLabel);
            } else if (percentRegex.test(overrideLabel)) {
              const parts = percentRegex.exec(overrideLabel);
              if (parts) {
                const percent = parseFloat(parts[1]);
                if (percent >= 0 && percent <= 100) {
                  result.setOverrideLabel(idx, overrideLabel);
                  result.setOverrideLabel(fromIdx, overrideLabel);
                }
              }
            }

            if (!result.overrideLabel(idx)) {
              this.errors.push(ERRORS.OVERRIDE_LABEL_INVALID.err(
                `Invalid @override label "${overrideLabel}" on field "${dest.coordinate}" on subgraph "${subgraphName}": labels must start with a letter and after that may contain alphanumerics, underscores, minuses, colons, periods, or slashes. Alternatively, labels may be of the form "percent(x)" where x is a float between 0-100 inclusive.`,
                { nodes: overridingSubgraphASTNode }
              ));
            }

            const message = overriddenFieldIsReferenced
              ? `Field "${dest.coordinate}" on subgraph "${sourceSubgraphName}" is currently being migrated via progressive @override. It is still used in some federation directive(s) (@key, @requires, and/or @provides) and/or to satisfy interface constraint(s). Once the migration is complete, consider marking it @external explicitly or removing it along with its references.`
              : `Field "${dest.coordinate}" is currently being migrated with progressive @override. Once the migration is complete, remove the field from subgraph "${sourceSubgraphName}".`;

            this.hints.push(new CompositionHint(
              HINTS.OVERRIDE_MIGRATION_IN_PROGRESS,
              message,
              dest,
              overriddenSubgraphASTNode,
            ));
          }
        }
      }
    });

    return result;
  }

  /**
   * Given a supergraph field `f` for an object type `T` and a given subgraph (identified by its index) where
   * `T` is not defined, check if that subgraph defines one or more of the interface of `T` as @interfaceObject,
   * and if so return any instance of `f` on those @interfaceObject.
   */
  private fieldsInSourceIfAbstractedByInterfaceObject(destField: FieldDefinition<any>, sourceIdx: number): FieldDefinition<any>[] {
    const parentInSupergraph = destField.parent;
    const schema = this.subgraphsSchema[sourceIdx];
    if (!isObjectType(parentInSupergraph) || schema.type(parentInSupergraph.name)) {
      return [];
    }

    return parentInSupergraph.interfaces().map((itfType) => {
      if (!itfType.field(destField.name)) {
        return undefined;
      }
      const typeInSchema = schema.type(itfType.name);
      // Note that since the type is an interface in the supergraph, we can assume that
      // if it is an object type in the subgraph, then it is an @interfaceObject.
      if (!typeInSchema || !isObjectType(typeInSchema)) {
        return undefined;
      }
      return typeInSchema.field(destField.name);
    }).filter(isDefined);
  }

  private mergeField({
    sources,
    dest,
    mergeContext = new FieldMergeContext(sources),
  }: {
    sources: FieldOrUndefinedArray,
    dest: FieldDefinition<any>,
    mergeContext: FieldMergeContext,
  }) {
    if (sources.every((s, i) => s === undefined ? this.fieldsInSourceIfAbstractedByInterfaceObject(dest, i).every((f) => this.isExternal(i, f)) : this.isExternal(i, s))) {
      const definingSubgraphs = sources.map((source, i) => {
        if (source) {
          return this.names[i];
        }

        const itfObjectFields = this.fieldsInSourceIfAbstractedByInterfaceObject(dest, i);
        if (itfObjectFields.length === 0) {
          return undefined;
        }
        return `${this.names[i]} (through @interaceObject ${printTypes(itfObjectFields.map((f) => f.parent))})`;
      }).filter(isDefined);
      const nodes = sources.map(source => source?.sourceAST).filter(s => s !== undefined) as ASTNode[];
      this.errors.push(ERRORS.EXTERNAL_MISSING_ON_BASE.err(
        `Field "${dest.coordinate}" is marked @external on all the subgraphs in which it is listed (${printSubgraphNames(definingSubgraphs)}).`,
        { nodes }
      ));
      return;
    }

    const withoutExternal = this.validateAndFilterExternal(sources);

    // Note that we don't truly merge externals: we don't want, for instance, a field that is non-nullable everywhere to appear nullable in the
    // supergraph just because someone fat-fingered the type in an external definition. But after merging the non-external definitions, we
    // validate the external ones are consistent.
    this.mergeDescription(withoutExternal, dest);
    this.recordAppliedDirectivesToMerge(withoutExternal, dest);
    this.addArgumentsShallow(withoutExternal, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = withoutExternal.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }
    // Note that due to @interfaceObject, it's possible that `withoutExternal` is "empty" (has no
    // non-undefined at all) but to still get here. That is, we can have:
    // ```
    //   # First subgraph
    //   interface I {
    //     id: ID!
    //     x: Int
    //   }
    //
    //   type T implements I @key(fields: "id") {
    //     id: ID!
    //     x: Int @external
    //     y: Int @requires(fields: "x")
    //   }
    // ```
    // and
    // ```
    //   # Second subgraph
    //   type I @interfaceObject @key(fields: "id") {
    //     id: ID!
    //     x: Int
    //   }
    // ```
    // In that case, it is valid to mark `T.x` external because it is provided by
    // another subgraph, the second one, through the interfaceObject object on I.
    // But because the first subgraph is the only one to have `T` and `x` is
    // external there, `withoutExternal` will be false.
    //
    // Anyway, we still need to merge a type in the supergraph, so in that case
    // we use merge the external declarations directly.
    const allTypesEqual = withoutExternal.every((s) => !s)
      ? this.mergeTypeReference(sources, dest)
      : this.mergeTypeReference(withoutExternal, dest);

    if (this.hasExternal(sources)) {
      this.validateExternalFields(sources, dest, allTypesEqual);
    }
    this.addJoinField({ sources, dest, allTypesEqual, mergeContext });
    this.addJoinDirectiveDirectives(sources, dest);
  }

  private validateFieldSharing(sources: FieldOrUndefinedArray, dest: FieldDefinition<ObjectType>, mergeContext: FieldMergeContext) {
    const shareableSources: { subgraph: string, idx: number}[] = [];
    const nonShareableSources: { subgraph: string, idx: number}[] = [];
    const allResolving: { subgraph: string, field: FieldDefinition<any> }[] = [];

    const categorizeField = (idx: number, subgraph: string, field: FieldDefinition<any>) => {
      if (!this.isFullyExternal(idx, field)) {
        allResolving.push({ subgraph, field });
        if (this.isShareable(idx, field)) {
          shareableSources.push({subgraph, idx});
        } else {
          nonShareableSources.push({subgraph, idx});
        }
      }
    };

    for (const [i, source] of sources.entries()) {
      const subgraph = '"' + this.names[i] + '"';
      if (!source) {
        const itfObjectFields = this.fieldsInSourceIfAbstractedByInterfaceObject(dest, i);
        // In theory, a type can implement multiple interfaces and all of them could be a @interfaceObject in
        // the source and provide the field. If so, we want to consider each as a different source of the
        // field.
        itfObjectFields.forEach((field) => categorizeField(i, subgraph + ` (through @interfaceObject field "${field.coordinate}")`, field));
        continue;
      }

      if (mergeContext.isUsedOverridden(i) || mergeContext.isUnusedOverridden(i)) {
        continue;
      }

      categorizeField(i, subgraph, source);
    }

    if (nonShareableSources.length > 0 && (shareableSources.length > 0 || nonShareableSources.length > 1)) {
      const printSubgraphs = (l: {subgraph: string}[]) => printHumanReadableList(
        l.map(({subgraph}) => subgraph),
        // When @interfaceObject is involved, the strings we print can be somewhat long, so we increase the cutoff size somewhat.
        { prefix: 'subgraph', prefixPlural: 'subgraphs', cutoff_output_length: 500 }
      );
      const resolvingSubgraphs = printSubgraphs(allResolving);
      const nonShareables = shareableSources.length > 0 ? printSubgraphs(nonShareableSources) : 'all of them';

      // An easy-to-make error that can lead here is the mispelling of the `from` argument of an @override. Because in that case, the
      // @override will essentially be ignored (we'll have logged a warning, but the error we're about to log will overshadow it) and
      // the 2 field insteances will violate the sharing rules. But because in that case the error is ultimately with @override, it
      // can be hard for user to understand why they get a shareability error, so we detect this case and offer an additional hint
      // at what the problem might be in the error message (note that even if we do find an @override with a unknown target, we
      // cannot be 100% sure this is the issue, because this could also be targeting a subgraph that has just been removed, in which
      // case the shareable error is legit; so keep the shareabilty error with a strong hint is hopefully good enough in practice).
      // Note: if there is multiple non-shareable fields with "target-less overrides", we only hint about one of them, because that's
      // easier and almost surely good enough to bring the attention of the user to potential typo in @override usage.
      const subgraphWithTargetlessOverride = nonShareableSources.find(({idx}) => mergeContext.hasOverrideWithUnknownTarget(idx));
      let extraHint = '';
      if (subgraphWithTargetlessOverride !== undefined) {
        extraHint = ` (please note that "${dest.coordinate}" has an @override directive in ${subgraphWithTargetlessOverride.subgraph} that targets an unknown subgraph so this could be due to misspelling the @override(from:) argument)`;
      }
      this.errors.push(ERRORS.INVALID_FIELD_SHARING.err(
        `Non-shareable field "${dest.coordinate}" is resolved from multiple subgraphs: it is resolved from ${resolvingSubgraphs} and defined as non-shareable in ${nonShareables}${extraHint}`,
        { nodes: sourceASTs(...allResolving.map(({field}) => field)) },
      ));
    }
  }

  private validateExternalFields(sources: FieldOrUndefinedArray, dest: FieldDefinition<any>, allTypesEqual: boolean) {
    let hasInvalidTypes = false;
    const invalidArgsPresence = new Set<string>();
    const invalidArgsTypes = new Set<string>();
    const invalidArgsDefaults = new Set<string>();
    for (const [i, source] of sources.entries()) {
      if (!source || !this.isExternal(i, source)) {
        continue;
      }
      // To be valid, an external field must use the same type as the merged field (or "at least" a subtype).
      if (!(sameType(dest.type!, source.type!) || (!allTypesEqual && this.isStrictSubtype(dest.type!, source.type!)))) {
        hasInvalidTypes = true;
      }

      // For arguments, it should at least have all the arguments of the merged, and their type needs to be supertypes (contravariance).
      // We also require the default is that of the supergraph (maybe we could relax that, but we should decide how we want
      // to deal with field with arguments in @key, @provides, @requires first as this could impact it).
      for (const destArg of dest.arguments()) {
        const name = destArg.name;
        const arg = source.argument(name);
        if (!arg) {
          invalidArgsPresence.add(name);
          continue;
        }
        if (!sameType(destArg.type!, arg.type!) && !this.isStrictSubtype(arg.type!, destArg.type!)) {
          invalidArgsTypes.add(name);
        }
        if (destArg.defaultValue !== arg.defaultValue) {
          invalidArgsDefaults.add(name);
        }
      }
    }

    if (hasInvalidTypes) {
      this.mismatchReporter.reportMismatchError(
        ERRORS.EXTERNAL_TYPE_MISMATCH,
        `Type of field "${dest.coordinate}" is incompatible across subgraphs (where marked @external): it has `,
        dest,
        sources,
        field => `type "${field.type}"`
      );
    }
    for (const arg of invalidArgsPresence) {
      const destArg = dest.argument(arg)!;
      this.mismatchReporter.reportMismatchErrorWithSpecifics({
        code: ERRORS.EXTERNAL_ARGUMENT_MISSING,
        message: `Field "${dest.coordinate}" is missing argument "${destArg.coordinate}" in some subgraphs where it is marked @external: `,
        mismatchedElement: destArg,
        subgraphElements: sources.map(s => s?.argument(destArg.name)),
        mismatchAccessor: arg => arg ? `argument "${arg.coordinate}"` : undefined,
        supergraphElementPrinter: (elt, subgraphs) => `${elt} is declared in ${subgraphs}`,
        otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs} (where "${dest.coordinate}" is @external).`,
        includeMissingSources: true,
      });
    }
    for (const arg of invalidArgsTypes) {
      const destArg = dest.argument(arg)!;
      this.mismatchReporter.reportMismatchError(
        ERRORS.EXTERNAL_ARGUMENT_TYPE_MISMATCH,
        `Type of argument "${destArg.coordinate}" is incompatible across subgraphs (where "${dest.coordinate}" is marked @external): it has `,
        destArg,
        sources.map(s => s?.argument(destArg.name)),
        arg => `type "${arg.type}"`
      );
    }
    for (const arg of invalidArgsDefaults) {
      const destArg = dest.argument(arg)!;
      this.mismatchReporter.reportMismatchError(
        ERRORS.EXTERNAL_ARGUMENT_DEFAULT_MISMATCH,
        `Argument "${destArg.coordinate}" has incompatible defaults across subgraphs (where "${dest.coordinate}" is marked @external): it has `,
        destArg,
        sources.map(s => s?.argument(destArg.name)),
        arg => arg.defaultValue !== undefined ? `default value ${valueToString(arg.defaultValue, arg.type)}` : 'no default value'
      );
    }
  }

  private needsJoinField<T extends FieldDefinition<ObjectType | InterfaceType> | InputFieldDefinition>({
    sources,
    parentName,
    allTypesEqual,
    mergeContext,
  }: {
    sources: (T | undefined)[],
    parentName: string,
    allTypesEqual: boolean,
    mergeContext: FieldMergeContext,
  }): boolean {
    // If not all the types are equal, then we need to put a join__field to preserve the proper type information.
    if (!allTypesEqual) {
      return true;
    }
    if (mergeContext.some(({ usedOverridden, overrideLabel }) => usedOverridden || !!overrideLabel)) {
      return true;
    }

    // We can avoid the join__field if:
    //   1) the field exists in all sources having the field parent type,
    //   2) none of the field instance has a @requires or @provides.
    //   3) none of the field is @external.
    for (const [idx, source] of sources.entries()) {
      const overridden = mergeContext.isUnusedOverridden(idx);
      if (source && !overridden) {
        const sourceMeta = this.subgraphs.values()[idx].metadata();
        if (this.isExternal(idx, source)
          || source.hasAppliedDirective(sourceMeta.providesDirective())
          || source.hasAppliedDirective(sourceMeta.requiresDirective())
        ) {
          return true;
        }
      } else {
        // This subgraph does not have the field, so if it has the field type, we need a join__field.
        if (this.subgraphsSchema[idx].type(parentName)) {
          return true;
        }
      }
    }

    return false;
  }

  private addJoinField<T extends FieldDefinition<ObjectType | InterfaceType> | InputFieldDefinition>(
    {
      sources,
      dest,
      allTypesEqual,
      mergeContext,
    }: {
      sources: (T | undefined)[],
      dest: T,
      allTypesEqual: boolean,
      mergeContext: FieldMergeContext,
    }) {
    if (!this.needsJoinField({
      sources,
      parentName: dest.parent.name,
      allTypesEqual,
      mergeContext,
    })) {
      return;
    }
    const joinFieldDirective = this.joinSpec.fieldDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      const usedOverridden = mergeContext.isUsedOverridden(idx);
      const unusedOverridden = mergeContext.isUnusedOverridden(idx);
      const overrideLabel = mergeContext.overrideLabel(idx);
      if (!source || (unusedOverridden && !overrideLabel)) {
        continue;
      }

      const external = this.isExternal(idx, source);
      const sourceMeta = this.subgraphs.values()[idx].metadata();
      const name = this.joinSpecName(idx);
      dest.applyDirective(joinFieldDirective, {
        graph: name,
        requires: this.getFieldSet(source, sourceMeta.requiresDirective()),
        provides: this.getFieldSet(source, sourceMeta.providesDirective()),
        override: source.appliedDirectivesOf(sourceMeta.overrideDirective()).pop()?.arguments()?.from,
        type: allTypesEqual ? undefined : source.type?.toString(),
        external: external ? true : undefined,
        usedOverridden: usedOverridden ? true : undefined,
        overrideLabel: mergeContext.overrideLabel(idx),
      });
    }
  }

  private getFieldSet(element: SchemaElement<any, any>, directive: DirectiveDefinition<{fields: string}>): string | undefined {
    const applications = element.appliedDirectivesOf(directive);
    assert(applications.length <= 1, () => `Found more than one application of ${directive} on ${element}`);
    return applications.length === 0 ? undefined : applications[0].arguments().fields;
  }

  // Returns `true` if the type references were all completely equal and `false` if some subtyping happened (or
  // if types were incompatible since an error is logged in this case but the method does not throw).
  private mergeTypeReference<TType extends Type, TElement extends NamedSchemaElementWithType<TType, any, any, any>>(
    sources: (TElement | undefined)[],
    dest: TElement,
    isInputPosition: boolean = false
  ): boolean {
    let destType: TType | undefined;
    let hasSubtypes = false;
    let hasIncompatible = false;
    for (const source of sources) {
      if (!source) {
        continue;
      }
      // Note that subtyping checks below relies on
      const sourceType = source.type!;
      if (!destType || sameType(destType, sourceType)) {
        destType = sourceType;
      } else if (this.isStrictSubtype(destType, sourceType)) {
        hasSubtypes = true;
        if (isInputPosition) {
          destType = sourceType;
        }
      } else if (this.isStrictSubtype(sourceType, destType)) {
        hasSubtypes = true;
        if (!isInputPosition) {
          destType = sourceType;
        }
      } else {
        hasIncompatible = true;
      }
    }

    assert(destType, () => `We should have found at least one subgraph with a type for ${dest.coordinate}`);
    // Note that destType is direct reference to one of the subgraph, so we need to copy it into our merged schema.
    dest.type = copyTypeReference(destType, this.merged) as TType;

    const isArgument = dest instanceof ArgumentDefinition;
    const elementKind: string = isArgument ? 'argument' : 'field';

    const base = baseType(dest.type);
    // Collecting enum usage for the sake of merging enums later.
    if (isEnumType(base)) {
      const existing = this.enumUsages.get(base.name);
      const thisPosition = isInputPosition ? 'Input' : 'Output';
      const position = existing && existing.position !== thisPosition ? 'Both' : thisPosition;
      const examples = existing?.examples ?? {};
      if (!examples[thisPosition]) {
        const idx = sources.findIndex((s) => !!s);
        if (idx >= 0) {
          const example = sources[idx]!;
          examples[thisPosition] = {
            coordinate: example.coordinate,
            sourceAST: example.sourceAST ? addSubgraphToASTNode(example.sourceAST, this.names[idx]) : undefined,
          };
        }
      }
      this.enumUsages.set(base.name, { position, examples });
    }

    if (hasIncompatible) {
      this.mismatchReporter.reportMismatchError(
        isArgument ? ERRORS.ARGUMENT_TYPE_MISMATCH : ERRORS.FIELD_TYPE_MISMATCH,
        `Type of ${elementKind} "${dest.coordinate}" is incompatible across subgraphs: it has `,
        dest,
        sources,
        field => `type "${field.type}"`
      );
      return false;
    } else if (hasSubtypes) {
      // Note that we use the type `toString` representation as a way to group which subgraphs have the exact same type.
      // Doing so is actually equivalent of checking `sameType` (more precisely, it is equivalent if we ignore the kind
      // of named types, but if 2 subgraphs differs in kind for the same type name (say one has "X" be a scalar and the
      // other an interface) we know we've already registered an error and the hint her won't matter).
      this.mismatchReporter.reportMismatchHint({
        code: isArgument ? HINTS.INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE : HINTS.INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE,
        message: `Type of ${elementKind} "${dest.coordinate}" is inconsistent but compatible across subgraphs: `,
        supergraphElement: dest,
        subgraphElements: sources,
        elementToString: field => field.type!.toString(),
        supergraphElementPrinter: (elt, subgraphs) => `will use type "${elt}" (from ${subgraphs}) in supergraph but "${dest.coordinate}" has `,
        otherElementsPrinter: (elt, subgraphs) => `${isInputPosition ? 'supertype' : 'subtype'} "${elt}" in ${subgraphs}`
      });
      return false;
    }
    return true;
  }

  private isStrictSubtype(type: Type, maybeSubType: Type): boolean {
    // To be as generic as possible, when we check if a type is a direct subtype of another (which happens if either
    // the subtype is one of the member of an union type, or the subtype explicitly implements an interface), we want
    // to use the union/interface definitions from the merged schema. This is why we have merged interface implementation
    // relationships and unions first.
    return isStrictSubtype(
      type,
      maybeSubType,
      this.options.allowedFieldTypeMergingSubtypingRules,
      (union, maybeMember) => (this.merged.type(union.name)! as UnionType).hasTypeMember(maybeMember.name),
      (maybeImplementer, itf) => (this.merged.type(maybeImplementer.name)! as (ObjectType | InterfaceType)).implementsInterface(itf)
    );
  }

  private addArgumentsShallow<T extends FieldDefinition<any> | DirectiveDefinition>(sources: (T | undefined)[], dest: T) {
    const argNames = new Set<string>();
    for (const source of sources) {
      if (!source) {
        continue;
      }
      source.arguments().forEach((arg) => argNames.add(arg.name));
    }

    for (const argName of argNames) {
      // We add the argument unconditionally even if we're going to remove it in
      // some path. Done because this helps reusing our "reportMismatchHint" method
      // in those cases.
      const arg = dest.addArgument(argName);
      // If all the sources that have the field have the argument, we do merge it
      // and we're good, but otherwise ...
      if (sources.some((s) => s && !s.argument(argName))) {
        // ... we don't merge the argument: some subgraphs wouldn't know what
        // to make of it and that would be dodgy at best. If the argument is
        // optional in all sources, then we can compose properly and just issue a
        // hint. But if it is mandatory, then we have to fail composition, otherwise
        // the query planner would have no choice but to generate invalidate queries.
        const nonOptionalSources = sources.map((s, i) => s && s.argument(argName)?.isRequired() ? this.names[i] : undefined).filter((s) => !!s) as string[];
        if (nonOptionalSources.length > 0) {
          const nonOptionalSubgraphs = printSubgraphNames(nonOptionalSources);
          const missingSources = printSubgraphNames(sources.map((s, i) => s && !s.argument(argName) ? this.names[i] : undefined).filter((s) => !!s) as string[]);
          this.errors.push(ERRORS.REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH.err(
            `Argument "${arg.coordinate}" is required in some subgraphs but does not appear in all subgraphs: it is required in ${nonOptionalSubgraphs} but does not appear in ${missingSources}`,
            { nodes: sourceASTs(...sources.map((s) => s?.argument(argName))) },
          ));
        } else {
          this.mismatchReporter.reportMismatchHint({
            code: HINTS.INCONSISTENT_ARGUMENT_PRESENCE,
            message: `Optional argument "${arg.coordinate}" will not be included in the supergraph as it does not appear in all subgraphs: `,
            supergraphElement: arg,
            subgraphElements: sources.map((s) => s ? s.argument(argName) : undefined),
            elementToString: _ => 'yes',
            supergraphElementPrinter: (_, subgraphs) => `it is defined in ${subgraphs}`,
            otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
            includeMissingSources: true
          });
        }
        // Note that we remove the element after the hint/error because we access it in the hint message generation.
        arg.remove();
      }
    }
  }

  private mergeArgument(sources: (ArgumentDefinition<any> | undefined)[], dest: ArgumentDefinition<any>) {
    this.mergeDescription(sources, dest);
    this.recordAppliedDirectivesToMerge(sources, dest);
    this.mergeTypeReference(sources, dest, true);
    this.mergeDefaultValue(sources, dest, 'Argument');
  }

  private mergeDefaultValue<T extends ArgumentDefinition<any> | InputFieldDefinition>(sources: (T | undefined)[], dest: T, kind: string) {
    let destDefault;
    let hasSeenSource = false;
    let isInconsistent = false;
    let isIncompatible = false;
    for (const source of sources) {
      if (!source) {
        continue;
      }
      // Because default values are always in input/contra-variant positions, we use an intersection strategy. Namely,
      // the result only has a default if _all_ have a default (which has to be the same, but we error if we found
      // 2 different defaults no matter what). Essentially, an argument/input field can only be made optional
      // in the supergraph API if it is optional in all subgraphs, or we may query a subgraph that expects the
      // value to be provided when it isn't. Note that an alternative could be to use an union strategy instead
      // but have the router/gateway fill in the default for subgraphs that don't know it, but that imply parsing
      // all the subgraphs fetches and we probably don't want that.
      const sourceDefault = source.defaultValue;
      if (destDefault === undefined) {
        // Note that we set destDefault even if we have seen a source before and maybe thus be inconsistent.
        // We won't use that value later if we're inconsistent, but keeping it allows us to always error out
        // if we any 2 incompatible defaults.
        destDefault = sourceDefault;
        // destDefault may be undefined either because we haven't seen any source (having the argument)
        // or because we've seen one but that source had no default. In the later case (`hasSeenSource`),
        // if the new source _has_ a default, then we're inconsistent.
        if (hasSeenSource && sourceDefault !== undefined) {
          isInconsistent = true;
        }
      } else if (!valueEquals(destDefault, sourceDefault)) {
        isInconsistent = true;
        // It's only incompatible if neither is undefined
        if (sourceDefault !== undefined) {
          isIncompatible = true;
        }
      }
      hasSeenSource = true;
    }
    // Note that we set the default if isIncompatible mostly to help the building of the error message. But
    // as we'll error out, it doesn't really matter.
    if (!isInconsistent || isIncompatible) {
      dest.defaultValue = destDefault;
    }

    if (isIncompatible) {
      this.mismatchReporter.reportMismatchError(
        kind === 'Argument' ? ERRORS.ARGUMENT_DEFAULT_MISMATCH : ERRORS.INPUT_FIELD_DEFAULT_MISMATCH,
        `${kind} "${dest.coordinate}" has incompatible default values across subgraphs: it has `,
        dest,
        sources,
        arg => arg.defaultValue !== undefined ? `default value ${valueToString(arg.defaultValue, arg.type)}` : 'no default value'
      );
    } else if (isInconsistent) {
      this.mismatchReporter.reportMismatchHint({
        code: HINTS.INCONSISTENT_DEFAULT_VALUE_PRESENCE,
        message: `${kind} "${dest.coordinate}" has a default value in only some subgraphs: `,
        supergraphElement: dest,
        subgraphElements: sources,
        elementToString: arg => arg.defaultValue !== undefined ? valueToString(arg.defaultValue, arg.type) : undefined,
        supergraphElementPrinter: (_, subgraphs) => `will not use a default in the supergraph (there is no default in ${subgraphs}) but `,
        otherElementsPrinter: (elt, subgraphs) => `"${dest.coordinate}" has default value ${elt} in ${subgraphs}`
      });
    }
  }

  private mergeInterface(sources: (InterfaceType | ObjectType | undefined)[], dest: InterfaceType) {
    const hasKey = this.validateInterfaceKeys(sources, dest);
    this.validateInterfaceObjects(sources, dest);

    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      if (!hasKey) {
        this.hintOnInconsistentValueTypeField(sources, dest, destField);
      }
      const subgraphFields = sources.map(t => t?.field(destField.name));
      const mergeContext = this.validateOverride(subgraphFields, destField);
      this.mergeField({
        sources: subgraphFields,
        dest: destField,
        mergeContext,
      });
    }
  }

  // Returns whether the interface has a key (even a non-resolvable one) in any subgraph.
  private validateInterfaceKeys(sources: (InterfaceType | ObjectType | undefined)[], dest: InterfaceType): boolean {
    // Remark: it might be ok to filter @inaccessible types in `supergraphImplementations`, but this requires
    // some more thinking (and I'm not even sure it makes a practical difference given the rules for validity
    // of @inaccessible) and it will be backward compatible to filter them later, while the reverse wouldn't
    // technically be, so we stay on the safe side.
    const supergraphImplementations = dest.possibleRuntimeTypes();

    // Validate that if a source defines a (resolvable) @key on an interface, then that subgraph defines
    // all the implementations of that interface in the supergraph.
    let hasKey = false;
    for (const [idx, source] of sources.entries()) {
      if (!source || !isInterfaceType(source)) {
        continue;
      }
      const sourceMetadata = this.subgraphs.values()[idx].metadata();
      const keys = source.appliedDirectivesOf(sourceMetadata.keyDirective());
      hasKey ||= keys.length > 0;
      const resolvableKey = keys.find((k) => k.arguments().resolvable !== false);
      if (!resolvableKey) {
        continue;
      }

      const implementationsInSubgraph = source.possibleRuntimeTypes();
      if (implementationsInSubgraph.length < supergraphImplementations.length) {
        const missingImplementations = supergraphImplementations.filter((superImpl) => !implementationsInSubgraph.some((subgImpl) => superImpl.name === subgImpl.name));
        this.errors.push(addSubgraphToError(
          ERRORS.INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE.err(
            `Interface type "${source.coordinate}" has a resolvable key (${resolvableKey}) in subgraph "${this.names[idx]}" but that subgraph is missing some of the supergraph implementation types of "${dest.coordinate}". `
            + `Subgraph "${this.names[idx]}" should define ${printTypes(missingImplementations)} (and have ${missingImplementations.length > 1 ? 'them' : 'it'} implement "${source.coordinate}").`,
            { nodes: resolvableKey.sourceAST},
          ),
          this.names[idx],
        ));
      }
    }
    return hasKey;
  }

  private validateInterfaceObjects(sources: (InterfaceType | ObjectType | undefined)[], dest: InterfaceType) {
    const supergraphImplementations = dest.possibleRuntimeTypes();

    // Validates that if a source defines the interface as an @interfaceObject, then it doesn't define any
    // of the implementations. We can discuss if there is ways to lift that limitation later, but an
    // @interfaceObject already "provides" fields for all the underlying impelmentations, so also defining
    // one those implementation would require additional care for shareability and more. This also feel
    // like this can get easily be done by mistake and gets rather confusing, so it's worth some additional
    // consideration before allowing.
    for (const [idx, source] of sources.entries()) {
      if (!source || !this.metadata(idx).isInterfaceObjectType(source)) {
        continue;
      }

      const subgraphName = this.names[idx];
      const schema = source.schema();
      const definedImplementations = supergraphImplementations.map((i) => schema.type(i.name)).filter(isDefined);
      if (definedImplementations.length > 0) {
        this.errors.push(addSubgraphToError(
          ERRORS.INTERFACE_OBJECT_USAGE_ERROR.err(
            `Interface type "${dest.coordinate}" is defined as an @interfaceObject in subgraph "${subgraphName}" so that subgraph should not define any of the implementation types of "${dest.coordinate}", but it defines ${printTypes(definedImplementations)}`,
            { nodes: sourceASTs(source, ...definedImplementations) },
          ),
          subgraphName,
        ));
      }
    }
  }

  private mergeUnion(sources: (UnionType | undefined)[], dest: UnionType) {
    for (const source of sources) {
      if (!source) {
        continue;
      }
      for (const type of source.types()) {
        if (!dest.hasTypeMember(type.name)) {
          dest.addType(type.name);
        }
      }
    }
    for (const type of dest.types()) {
      this.addJoinUnionMember(sources, dest, type);
      this.hintOnInconsistentUnionMember(sources, dest, type.name);
    }
  }

  private addJoinUnionMember(sources: (UnionType | undefined)[], dest: UnionType, member: ObjectType) {
    const joinUnionMemberDirective = this.joinSpec.unionMemberDirective(this.merged);
    // We should always be merging with the latest join spec, so this should exists, but well, in prior versions where
    // the directive didn't existed, we simply did had any replacement so ...
    if (!joinUnionMemberDirective) {
      return;
    }

    for (const [idx, source] of sources.entries()) {
      if (!source?.hasTypeMember(member.name)) {
        continue;
      }

      const name = this.joinSpecName(idx);
      dest.applyDirective(joinUnionMemberDirective, {
        graph: name,
        member: member.name,
      });
    }
  }

  private hintOnInconsistentUnionMember(
    sources: (UnionType | undefined)[],
    dest: UnionType,
    memberName: string
  ) {
    for (const source of sources) {
      // As soon as we find a subgraph that has the type but not the member, we hint.
      if (source && !source.hasTypeMember(memberName)) {
        this.mismatchReporter.reportMismatchHint({
          code: HINTS.INCONSISTENT_UNION_MEMBER,
          message: `Union type "${dest}" includes member type "${memberName}" in some but not all defining subgraphs: `,
          supergraphElement: dest,
          subgraphElements: sources,
          elementToString: type => type.hasTypeMember(memberName) ? 'yes' : 'no',
          supergraphElementPrinter: (_, subgraphs) => `"${memberName}" is defined in ${subgraphs}`,
          otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
        });
        return;
      }
    }
  }

  private mergeEnum(sources: (EnumType | undefined)[], dest: EnumType) {
    let usage = this.enumUsages.get(dest.name);
    if (!usage) {
      // If the enum is unused, we have a choice to make. We could skip the enum entirely (after all, exposing an unreferenced type mostly "pollutes" the supergraph API), but
      // some evidence shows that many a user have such unused enums in federation 1 and having those removed from their API might be surprising. We could merge it as
      // an "input-only" or as a "input/ouput" type, but the hints/errors generated in both those cases would be confusing in that case, and while we could amend them
      // for this case, it would complicate things and doesn't feel like it would feel very justified. So we merge it as an "output" type, which is the least contraining
      // option. We do raise an hint though so users can notice this.
      usage = { position: 'Output', examples: {}};
      this.hints.push(new CompositionHint(
        HINTS.UNUSED_ENUM_TYPE,
        `Enum type "${dest}" is defined but unused. It will be included in the supergraph with all the values appearing in any subgraph ("as if" it was only used as an output type).`,
        dest
      ));
    }

    for (const source of sources) {
      if (!source) {
        continue;
      }
      for (const value of source.values) {
        // Note that we add all the values we see as a simple way to know which values there is to consider. But some of those value may
        // be removed later in `mergeEnumValue`
        if (!dest.value(value.name)) {
          dest.addValue(value.name);
        }
      }
    }
    for (const value of dest.values) {
      this.mergeEnumValue(sources, dest, value, usage);
    }

    // We could be left with an enum type with no values, and that's invalid in graphQL
    if (dest.values.length === 0) {
      this.errors.push(ERRORS.EMPTY_MERGED_ENUM_TYPE.err(
        `None of the values of enum type "${dest}" are defined consistently in all the subgraphs defining that type. As only values common to all subgraphs are merged, this would result in an empty type.`,
        { nodes: sourceASTs(...sources) },
      ));
    }
  }

  private mergeEnumValue(
    sources: (EnumType | undefined)[],
    dest: EnumType,
    value: EnumValue,
    { position, examples }: EnumTypeUsage,
  ) {
    // We merge directives (and description while at it) on the value even though we might remove it later in that function,
    // but we do so because:
    // 1. this will catch any problems merging the description/directives (which feels like a good thing).
    // 2. it easier to see if the value is marked @inaccessible.
    const valueSources = sources.map(s => s?.value(value.name));
    this.mergeDescription(valueSources, value);
    this.recordAppliedDirectivesToMerge(valueSources, value);
    this.addJoinEnumValue(valueSources, value);

    const inaccessibleInSupergraph = this.mergedFederationDirectiveInSupergraph.get(this.inaccessibleSpec.inaccessibleDirectiveSpec.name);
    const isInaccessible = inaccessibleInSupergraph && value.hasAppliedDirective(inaccessibleInSupergraph.definition);
    // The merging strategy depends on the enum type usage:
    //  - if it is _only_ used in position of Input type, we merge it with an "intersection" strategy (like other input types/things).
    //  - if it is _only_ used in position of Output type, we merge it with an "union" strategy (like other output types/things).
    //  - otherwise, it's used as both input and output and we can only merge it if it has the same values in all subgraphs.
    // So in particular, the value will be in the supergraph only if it is either an "output only" enum, or if the value is in all subgraphs.
    // Note that (like for input object fields), manually marking the value as @inaccessible let's use skips any check and add the value
    // regardless of inconsistencies.
    if (!isInaccessible && position !== 'Output' && sources.some((source) => source && !source.value(value.name))) {
      // We have a source (subgraph) that _has_ the enum type but not that particular enum value. If we've in the "both input and output usages",
      // that's where we have to fail. But if we're in the "only input" case, we simply don't merge that particular value and hint about it.
      if (position === 'Both') {
        const inputExample = examples.Input!;
        const outputExample = examples.Output!;
        this.mismatchReporter.reportMismatchErrorWithSpecifics({
          code: ERRORS.ENUM_VALUE_MISMATCH,
          message: `Enum type "${dest}" is used as both input type (for example, as type of "${inputExample.coordinate}") and output type (for example, as type of "${outputExample.coordinate}"), but value "${value}" is not defined in all the subgraphs defining "${dest}": `,
          mismatchedElement: dest,
          subgraphElements: sources,
          mismatchAccessor: (type) => type?.value(value.name) ? 'yes' : 'no',
          supergraphElementPrinter: (_, subgraphs) => `"${value}" is defined in ${subgraphs}`,
          otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
          extraNodes: sourceASTs(inputExample, outputExample),
        });
        // We leave the value in the merged output in that case because:
        // 1. it's harmless to do so; we have an error so we won't return a supergraph.
        // 2. it avoids generating an additional "enum type is empty" error in `mergeEnum` if all the values are inconsistent.
      } else {
        this.mismatchReporter.reportMismatchHint({
          code: HINTS.INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM,
          message: `Value "${value}" of enum type "${dest}" will not be part of the supergraph as it is not defined in all the subgraphs defining "${dest}": `,
          supergraphElement: dest,
          subgraphElements: sources,
          targetedElement: value,
          elementToString: (type) => type.value(value.name) ? 'yes' : 'no',
          supergraphElementPrinter: (_, subgraphs) => `"${value}" is defined in ${subgraphs}`,
          otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
        });
        // We remove the value after the generation of the hint/errors because `reportMismatchHint` will show the message for the subgraphs that are "like" the supergraph
        // first, and the message flows better if we say which subgraph defines the value first, so we want the value to still be present for the generation of the
        // message.
        value.remove();
      }
    } else if (position === 'Output') {
      this.hintOnInconsistentOutputEnumValue(sources, dest, value);
    }
  }

  private addJoinEnumValue(sources: (EnumValue | undefined)[], dest: EnumValue) {
    const joinEnumValueDirective = this.joinSpec.enumValueDirective(this.merged);
    // We should always be merging with the latest join spec, so this should exists, but well, in prior versions where
    // the directive didn't existed, we simply did had any replacement so ...
    if (!joinEnumValueDirective) {
      return;
    }

    for (const [idx, source] of sources.entries()) {
      if (!source) {
        continue;
      }

      const name = this.joinSpecName(idx);
      dest.applyDirective(joinEnumValueDirective, {
        graph: name,
      });
    }
  }

  private hintOnInconsistentOutputEnumValue(
    sources: (EnumType | undefined)[],
    dest: EnumType,
    value: EnumValue,
  ) {
    const valueName: string = value.name
    for (const source of sources) {
      // As soon as we find a subgraph that has the type but not the member, we hint.
      if (source && !source.value(valueName)) {
        this.mismatchReporter.reportMismatchHint({
          code: HINTS.INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM,
          message: `Value "${valueName}" of enum type "${dest}" has been added to the supergraph but is only defined in a subset of the subgraphs defining "${dest}": `,
          supergraphElement: dest,
          subgraphElements: sources,
          targetedElement: value,
          elementToString: type => type.value(valueName) ? 'yes' : 'no',
          supergraphElementPrinter: (_, subgraphs) => `"${valueName}" is defined in ${subgraphs}`,
          otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
        });
        return;
      }
    }
  }

  private mergeInput(sources: (InputObjectType | undefined)[], dest: InputObjectType) {
    const inaccessibleInSupergraph = this.mergedFederationDirectiveInSupergraph.get(this.inaccessibleSpec.inaccessibleDirectiveSpec.name);

    // Like for other inputs, we add all the fields found in any subgraphs initially as a simple mean to have a complete list of
    // field to iterate over, but we will remove those that are not in all subgraphs.
    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      const name = destField.name
      // We merge the details of the field first, even if we may remove it afterwards because 1) this ensure we always checks type
      // compatibility between definitions and 2) we actually want to see if the result is marked inaccessible or not and it makes
      // that easier.
      this.mergeInputField(sources.map(t => t?.field(name)), destField);
      const isInaccessible = inaccessibleInSupergraph && destField.hasAppliedDirective(inaccessibleInSupergraph.definition);
      // Note that if the field is manually marked @inaccessible, we can always accept it to be inconsistent between subgraphs since
      // it won't be exposed in the API, and we don't hint about it because we're just doing what the user is explicitely asking.
      if (!isInaccessible && sources.some((source) => source && !source.field(name))) {
        // One of the subgraph has the input type but not that field. If the field is optional, we remove it for the supergraph
        // and issue a hint. But if it is required, we have to error out.
        const nonOptionalSources = sources.map((s, i) => s && s.field(name)?.isRequired() ? this.names[i] : undefined).filter((s) => !!s) as string[];
        if (nonOptionalSources.length > 0) {
          const nonOptionalSubgraphs = printSubgraphNames(nonOptionalSources);
          const missingSources = printSubgraphNames(sources.map((s, i) => s && !s.field(name) ? this.names[i] : undefined).filter((s) => !!s) as string[]);
          this.errors.push(ERRORS.REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH.err(
            `Input object field "${destField.coordinate}" is required in some subgraphs but does not appear in all subgraphs: it is required in ${nonOptionalSubgraphs} but does not appear in ${missingSources}`,
            { nodes: sourceASTs(...sources.map((s) => s?.field(name))) },
          ));
        } else {
          this.mismatchReporter.reportMismatchHint({
            code: HINTS.INCONSISTENT_INPUT_OBJECT_FIELD,
            message: `Input object field "${destField.name}" will not be added to "${dest}" in the supergraph as it does not appear in all subgraphs: `,
            supergraphElement: destField,
            subgraphElements: sources.map((s) => s ? s.field(name) : undefined),
            elementToString: _ => 'yes',
            // Note that the first callback is for element that are "like the supergraph" and we've pass `destField` which we havne't yet removed.
            supergraphElementPrinter: (_, subgraphs) => `it is defined in ${subgraphs}`,
            otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
            includeMissingSources: true
          });
        }
        // Note that we remove the element after the hint/error because we access the parent in the hint message.
        destField.remove();
      }
    }

    // We could be left with an input type with no fields, and that's invalid in graphQL
    if (!dest.hasFields()) {
      this.errors.push(ERRORS.EMPTY_MERGED_INPUT_TYPE.err(
        `None of the fields of input object type "${dest}" are consistently defined in all the subgraphs defining that type. As only fields common to all subgraphs are merged, this would result in an empty type.`,
        { nodes: sourceASTs(...sources) },
      ));
    }
  }

  private mergeInputField(sources: (InputFieldDefinition | undefined)[], dest: InputFieldDefinition) {
    this.mergeDescription(sources, dest);
    this.recordAppliedDirectivesToMerge(sources, dest);
    const allTypesEqual = this.mergeTypeReference(sources, dest, true);
    const mergeContext = new FieldMergeContext(sources);
    this.addJoinField({ sources, dest, allTypesEqual, mergeContext });
    this.mergeDefaultValue(sources, dest, 'Input field');
  }

  private mergeDirectiveDefinition(sources: (DirectiveDefinition | undefined)[], dest: DirectiveDefinition) {
    // We have 2 behavior depending on the kind of directives:
    // 1) for the few handpicked type system directives that we merge, we always want to keep
    //   them (it's ok if a subgraph decided to not include the definition because that particular
    //   subgraph didn't use the directive on its own definitions). For those, we essentially take
    //   a "union" strategy.
    // 2) for other directives, the ones we keep for their 'execution' locations, we instead
    //   use an "intersection" strategy: we only keep directives that are defined everywhere.
    //   The reason is that those directives may be used anywhere in user queries (those made
    //   against the supergraph API), and hence can end up in queries to any subgraph, and as
    //   a consequence all subgraphs need to be able to handle any application of the directive.
    //   Which we can only guarantee if all the subgraphs know the directive, and that the directive
    //   definition is the intersection of all definitions (meaning that if there divergence in
    //   locations, we only expose locations that are common everywhere).
    if (this.composeDirectiveManager.directiveExistsInSupergraph(dest.name)) {
      this.mergeCustomCoreDirective(dest);
    } else if (sources.some((s, idx) => s && this.isMergedDirective(this.names[idx], s))) {
      this.mergeExecutableDirectiveDefinition(sources, dest);
    }
  }

  // Note: as far as directive definition goes, we currently only merge directive having execution location, and only for
  // thos locations. Any type system directive definition that propagates to the supergraph (graphQL built-ins and `@tag`)
  // is currently handled in an hard-coded way. This will change very soon however so keeping this code around to be
  // re-enabled by a future commit.
  //private mergeTypeSystemDirectiveDefinition(sources: (DirectiveDefinition | undefined)[], dest: DirectiveDefinition) {
  //  this.addArgumentsShallow(sources, dest);
  //  for (const destArg of dest.arguments()) {
  //    const subgraphArgs = sources.map(f => f?.argument(destArg.name));
  //    this.mergeArgument(subgraphArgs, destArg);
  //  }

  //  let repeatable: boolean | undefined = undefined;
  //  let inconsistentRepeatable = false;
  //  let locations: DirectiveLocation[] | undefined = undefined;
  //  let inconsistentLocations = false;
  //  for (const source of sources) {
  //    if (!source) {
  //      continue;
  //    }
  //    if (repeatable === undefined) {
  //      repeatable = source.repeatable;
  //    } else if (repeatable !== source.repeatable) {
  //      inconsistentRepeatable = true;
  //    }

  //    const sourceLocations = this.extractLocations(source);
  //    if (!locations) {
  //      locations = sourceLocations;
  //    } else {
  //      if (!arrayEquals(locations, sourceLocations)) {
  //        inconsistentLocations = true;
  //      }
  //      // This create duplicates, but `addLocations` below eliminate them.
  //      sourceLocations.forEach(loc => {
  //        if (!locations!.includes(loc)) {
  //          locations!.push(loc);
  //        }
  //      });
  //    }
  //  }
  //  dest.repeatable = repeatable!;
  //  dest.addLocations(...locations!);

  //  if (inconsistentRepeatable) {
  //    this.mismatchReporter.reportMismatchHint(
  //      HINTS.INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE,
  //      `Type system directive "${dest}" is marked repeatable in the supergraph but it is inconsistently marked repeatable in subgraphs: `,
  //      dest,
  //      sources,
  //      directive => directive.repeatable ? 'yes' : 'no',
  //      // Note that the first callback is for element that are "like the supergraph". And the supergraph will be repeatable on inconsistencies.
  //      (_, subgraphs) => `it is repeatable in ${subgraphs}`,
  //      (_, subgraphs) => ` but not in ${subgraphs}`,
  //    );
  //  }
  //  if (inconsistentLocations) {
  //    this.mismatchReporter.reportMismatchHint(
  //      HINTS.INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS,
  //      `Type system directive "${dest}" has inconsistent locations across subgraphs `,
  //      dest,
  //      sources,
  //      directive => locationString(this.extractLocations(directive)),
  //      // Note that the first callback is for element that are "like the supergraph".
  //      (locs, subgraphs) => `and will use ${locs} (union of all subgraphs) in the supergraph, but has: ${subgraphs ? `${locs} in ${subgraphs} and ` : ''}`,
  //      (locs, subgraphs) => `${locs} in ${subgraphs}`,
  //    );
  //  }
  //}

  private mergeCustomCoreDirective(dest: DirectiveDefinition) {
    const def = this.composeDirectiveManager.getLatestDirectiveDefinition(dest.name);
    if (def) {
      dest.repeatable = def.repeatable;
      dest.description = def.description;
      dest.addLocations(...def.locations);
      this.addArgumentsShallow([def], dest);
      for (const arg of def.arguments()) {
        const destArg = dest.argument(arg.name);
        assert(destArg, 'argument must exist on destination directive');
        this.mergeArgument([arg], destArg);
      }
    }
  }

  private mergeExecutableDirectiveDefinition(sources: (DirectiveDefinition | undefined)[], dest: DirectiveDefinition) {
    let repeatable: boolean | undefined = undefined;
    let inconsistentRepeatable = false;
    let locations: DirectiveLocation[] | undefined = undefined;
    let inconsistentLocations = false;
    for (const source of sources) {
      if (!source) {
        // An executable directive could appear in any place of a query and thus get to any subgraph, so we cannot keep an
        // executable directive unless it is in all subgraphs. We use an 'intersection' strategy.
        const usages = dest.remove();
        assert(usages.length === 0, () => `Found usages of executable directive ${dest}: ${usages}`);
        this.mismatchReporter.reportMismatchHint({
          code: HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE,
          message: `Executable directive "${dest}" will not be part of the supergraph as it does not appear in all subgraphs: `,
          supergraphElement: dest,
          subgraphElements: sources,
          elementToString: _ => 'yes',
          supergraphElementPrinter: (_, subgraphs) => `it is defined in ${subgraphs}`,
          otherElementsPrinter: (_, subgraphs) => ` but not in ${subgraphs}`,
          includeMissingSources: true,
        });
        return;
      }

      if (repeatable === undefined) {
        repeatable = source.repeatable;
      } else if (repeatable !== source.repeatable) {
        inconsistentRepeatable = true;
        // Again, we use an intersection strategy: we can let users repeat the directive on a query only if
        // all subgraphs know it as repeatable.
        repeatable = false;
      }

      const sourceLocations = this.extractExecutableLocations(source);
      if (!locations) {
        locations = sourceLocations;
      } else {
        if (!arrayEquals(locations, sourceLocations)) {
          inconsistentLocations = true;
        }
        // Still an intersection: we can only allow locations that all subgraphs understand.
        locations = locations.filter(loc => sourceLocations.includes(loc));
        if (locations.length === 0) {
          const usages = dest.remove();
          assert(usages.length === 0, () => `Found usages of executable directive ${dest}: ${usages}`);
          this.mismatchReporter.reportMismatchHint({
            code: HINTS.NO_EXECUTABLE_DIRECTIVE_LOCATIONS_INTERSECTION,
            message: `Executable directive "${dest}" has no location that is common to all subgraphs: `,
            supergraphElement: dest,
            subgraphElements: sources,
            elementToString: directive => locationString(this.extractExecutableLocations(directive)),
            // Note that the first callback is for element that are "like the supergraph" and only the subgraph will have no locations (the
            // source that do not have the directive are not included).
            supergraphElementPrinter: () => `it will not appear in the supergraph as there no intersection between `,
            otherElementsPrinter: (locs, subgraphs) => `${locs} in ${subgraphs}`,
          });
          return;
        }
      }
    }
    dest.repeatable = repeatable!;
    dest.addLocations(...locations!);

    this.mergeDescription(sources, dest);

    if (inconsistentRepeatable) {
      this.mismatchReporter.reportMismatchHint({
        code: HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE,
        message: `Executable directive "${dest}" will not be marked repeatable in the supergraph as it is inconsistently marked repeatable in subgraphs: `,
        supergraphElement: dest,
        subgraphElements: sources,
        elementToString: directive => directive.repeatable ? 'yes' : 'no',
        supergraphElementPrinter: (_, subgraphs) => `it is not repeatable in ${subgraphs}`,
        otherElementsPrinter: (_, subgraphs) => ` but is repeatable in ${subgraphs}`,
      });
    }
    if (inconsistentLocations) {
      this.mismatchReporter.reportMismatchHint({
        code: HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS,
        message: `Executable directive "${dest}" has inconsistent locations across subgraphs `,
        supergraphElement: dest,
        subgraphElements: sources,
        elementToString: directive => locationString(this.extractExecutableLocations(directive)),
        supergraphElementPrinter: (locs, subgraphs) => `and will use ${locs} (intersection of all subgraphs) in the supergraph, but has: ${subgraphs ? `${locs} in ${subgraphs} and ` : ''}`,
        otherElementsPrinter: (locs, subgraphs) => `${locs} in ${subgraphs}`,
      });
    }

    // Doing args last, mostly so we don't bother adding if the directive doesn't make it in.
    this.addArgumentsShallow(sources, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = sources.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }
  }

  private extractExecutableLocations(source: DirectiveDefinition): DirectiveLocation[] {
    // We sort the locations so that the return list of locations essentially act like a set.
    return this.filterExecutableDirectiveLocations(source).concat().sort();
  }

  private filterExecutableDirectiveLocations(source: DirectiveDefinition): readonly DirectiveLocation[] {
    return source.locations.filter(loc => isExecutableDirectiveLocation(loc));
  }

  // In general, we want to merge applied directives after merging elements, the one exception
  // is @inaccessible, which is necessary to exist in the supergraph for EnumValues to properly
  // determine whether the fact that a value is both input / output will matter
  private recordAppliedDirectivesToMerge(sources: (SchemaElement<any, any> | undefined)[], dest: SchemaElement<any, any>) {
    const inaccessibleInSupergraph = this.mergedFederationDirectiveInSupergraph.get(this.inaccessibleSpec.inaccessibleDirectiveSpec.name);
    const inaccessibleName = inaccessibleInSupergraph?.definition.name;
    const names = this.gatherAppliedDirectiveNames(sources);

    if (inaccessibleName && names.has(inaccessibleName)) {
      this.mergeAppliedDirective(inaccessibleName, sources, dest);
      names.delete(inaccessibleName);
    }
    this.appliedDirectivesToMerge.push({
      names,
      sources,
      dest,
    });
  }

  // to be called after elements are merged
  private mergeAllAppliedDirectives() {
    for (const { names, sources, dest } of this.appliedDirectivesToMerge) {
      // There is some cases where we had to call the method that records directives to merged
      // on a `dest` that ended up being removed from the ouptut (typically because we needed
      // to known if that `dest` was @inaccessible before deciding if it should be kept or
      // not). So check that the `dest` is still there (still "attached") and skip it entirely
      // otherwise.
      if (!dest.isAttached()) {
        continue;
      }
      for (const name of names) {
        this.mergeAppliedDirective(name, sources, dest);
      }
    }
    this.appliedDirectivesToMerge = [];
  }

  private gatherAppliedDirectiveNames(sources: (SchemaElement<any, any> | undefined)[]): Set<string> {
    const names = new Set<string>();
    sources.forEach((source, idx) => {
      if (source) {
        for (const directive of source.appliedDirectives) {
          if (this.isMergedDirective(this.names[idx], directive)) {
            names.add(directive.name);
          }
        }
      }
    });
    return names;
  }

  private mergeAppliedDirective(name: string, sources: (SchemaElement<any, any> | undefined)[], dest: SchemaElement<any, any>) {
    // TODO: we currently "only" merge together applications that have the exact same arguments (with defaults expanded however),
    // but when an argument is an input object type, we should (?) ignore those fields that will not be included in the supergraph
    // due the intersection merging of input types, otherwise the merged value may be invalid for the supergraph.
    let perSource: Directive[][] = [];
    for (const source of sources) {
      if (!source) {
        continue;
      }
      const directives: Directive[] = source.appliedDirectivesOf(name);
      if (directives.length > 0) {
        perSource.push(directives);
      }
    }

    if (perSource.length === 0) {
      return;
    }

    if (dest.schema().directive(name)?.repeatable) {
      // For repeatable directives, we simply include each application found but with exact duplicates removed
      while (perSource.length > 0) {
        const directive = this.pickNextDirective(perSource);
        dest.applyDirective(directive.name, directive.arguments(false));
        // We remove every instances of this particular application. That is we remove any other applicaiton with
        // the same arguments. Note that when doing so, we include default values. This allows "merging" 2 applications
        // when one rely on the default value while another don't but explicitely uses that exact default value.
        perSource = perSource
          .map(ds => ds.filter(d => !this.sameDirectiveApplication(directive, d)))
          .filter(ds => ds.length);
      }
    } else {
      // When non-repeatable, we use a similar strategy than for descriptions: we count the occurence of each _different_ application (different arguments)
      // and if there is more than one option (that is, if not all subgraph have the same application), we use in the supergraph whichever application appeared
      // in the most subgraph and warn that we have had to ignore some other applications (of course, if the directive has no arguments, this is moot and
      // we'll never warn, but this is handled by the general code below.
      const differentApplications: Directive[] = [];
      const counts: number[] = [];
      for (const source of perSource) {
        assert(source.length === 1, () => `Non-repeatable directive shouldn't have multiple application ${source} in a subgraph`)
        const application = source[0];
        const idx = differentApplications.findIndex((existing) => this.sameDirectiveApplication(existing, application));
        if (idx < 0) {
          differentApplications.push(application);
          counts.push(1);
        } else {
          counts[idx]++;
        }
      }

      assert(differentApplications.length > 0, 'We exited early when there was no applications, so we should have found one');
      if (differentApplications.length === 1) {
        dest.applyDirective(name, differentApplications[0].arguments(false));
      } else {
        const info = this.mergedFederationDirectiveInSupergraph.get(name);
        if (info && info.argumentsMerger) {
          const mergedArguments = Object.create(null);
          const applicationsArguments = differentApplications.map((a) => a.arguments(true));
          for (const argDef of info.definition.arguments()) {
            const values = applicationsArguments.map((args) => args[argDef.name]);
            mergedArguments[argDef.name] = info.argumentsMerger.merge(argDef.name, values);
          }
          dest.applyDirective(name, mergedArguments);
          this.mismatchReporter.pushHint(new CompositionHint(
            HINTS.MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
            `Directive @${name} is applied to "${(dest as any)['coordinate'] ?? dest}" in multiple subgraphs with different arguments. Merging strategies used by arguments: ${info.argumentsMerger}`,
            undefined,
          ));
        } else {
          const idx = indexOfMax(counts);
          // We apply the directive to the destination first, we allows `reportMismatchHint` to find which application is used in
          // the supergraph.
          dest.applyDirective(name, differentApplications[idx].arguments(false));
          this.mismatchReporter.reportMismatchHint({
            code: HINTS.INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS,
            message: `Non-repeatable directive @${name} is applied to "${(dest as any)['coordinate'] ?? dest}" in multiple subgraphs but with incompatible arguments. `,
            supergraphElement: dest,
            subgraphElements: sources,
            elementToString: (elt) => {
              const args = elt.appliedDirectivesOf(name).pop()?.arguments();
              return args === undefined
                ? undefined
                : Object.values(args).length === 0 ? 'no arguments' : (`arguments ${valueToString(args)}`);
            },
            supergraphElementPrinter: (application, subgraphs) => `The supergraph will use ${application} (from ${subgraphs}), but found `,
            otherElementsPrinter: (application, subgraphs) => `${application} in ${subgraphs}`,
          });
        }
      }
    }
  }

  private pickNextDirective(directives: Directive[][]): Directive {
    return directives[0][0];
  }

  private sameDirectiveApplication(application1: Directive, application2: Directive): boolean {
    // Note that when comparing arguments, we include default values. This means that we consider it the same thing (as far as
    // merging application goes) to rely on a default value or to pass that very exact value explicitely. In theory we
    // could make the difference between the two, but this feel more surprising/convenient.
    // TODO: we use valueEquals on the whole argument object rather than on individual values. This
    // work just fine given how valueEquals is defined today, but we might want to clean this nonetheless.
    return application1.name === application2.name
      && valueEquals(application1.arguments(true), application2.arguments(true));
  }

  private mergeSchemaDefinition(sources: SchemaDefinition[], dest: SchemaDefinition) {
    this.mergeDescription(sources, dest);
    this.recordAppliedDirectivesToMerge(sources, dest);
    // Before merging, we actually rename all the root types to their default name
    // in subgraphs (see federation.ts, `prepareSubgraphsForFederation`), so this
    // method should never report an error in practice as there should never be
    // a name discrepancy. That said, it's easy enough to double-check this, which
    // might at least help debugging case where we forgot to call
    // `prepareSubgraphsForFederation`.
    for (const rootKind of allSchemaRootKinds) {
      let rootType: string | undefined;
      let isIncompatible = false;
      for (const sourceType of sources.map(s => filteredRoot(s, rootKind))) {
        if (!sourceType) {
          continue;
        }
        if (rootType) {
          isIncompatible = isIncompatible || rootType !== sourceType.name;
        } else {
          rootType = sourceType.name;
        }
      }
      if (!rootType) {
        continue;
      }
      dest.setRoot(rootKind, rootType);

      // Because we rename all root type in subgraphs to their default names, we shouldn't ever have incompatibilities here.
      assert(!isIncompatible, () => `Should not have incompatible root type for ${rootKind}`);
    }
    this.addJoinDirectiveDirectives(sources, dest);
  }

  private shouldUseJoinDirectiveForURL(url: FeatureUrl | undefined): boolean {
    return Boolean(
      url &&
      this.joinDirectiveIdentityURLs.has(url.identity)
    );
  }

  private computeMapFromImportNameToIdentityUrl(
    schema: Schema,
  ): Map<string, FeatureUrl> {
    // For each @link directive on the schema definition, store its normalized
    // identity url in a Map, reachable from all its imported names.
    const map = new Map<string, FeatureUrl>();
    for (const linkDirective of schema.schemaDefinition.appliedDirectivesOf<LinkDirectiveArgs>('link')) {
      const { url, import: imports } = linkDirective.arguments();
      const parsedUrl = FeatureUrl.maybeParse(url);
      if (parsedUrl && imports) {
        for (const i of imports) {
          if (typeof i === 'string') {
            map.set(i, parsedUrl);
          } else {
            map.set(i.as ?? i.name, parsedUrl);
          }
        }
      }
    }
    return map;
  }

  // This method gets called at various points during the merge to allow
  // subgraph directive applications to be reflected (unapplied) in the
  // supergraph, using the @join__directive(graphs,name,args) directive.
  private addJoinDirectiveDirectives(
    sources: (SchemaElement<any, any> | undefined)[],
    dest: SchemaElement<any, any>,
  ) {
    const joinsByDirectiveName: {
      [directiveName: string]: Array<{
        graphs: string[];
        args: Record<string, any>;
      }>
    } = Object.create(null);

    for (const [idx, source] of sources.entries()) {
      if (!source) continue;
      const graph = this.joinSpecName(idx);

      // We compute this map only once per subgraph, as it takes time
      // proportional to the size of the schema.
      const linkImportIdentityURLMap =
        this.schemaToImportNameToFeatureUrl.get(source.schema());
      if (!linkImportIdentityURLMap) continue;

      for (const directive of source.appliedDirectives) {
        let shouldIncludeAsJoinDirective = false;

        if (directive.name === 'link') {
          const { url } = directive.arguments();
          const parsedUrl = FeatureUrl.maybeParse(url);
          if (typeof url === 'string' && parsedUrl) {
            shouldIncludeAsJoinDirective =
              this.shouldUseJoinDirectiveForURL(parsedUrl);
          }
        } else {
          // To be consistent with other code accessing
          // linkImportIdentityURLMap, we ensure directive names start with a
          // leading @.
          const nameWithAtSymbol =
            directive.name.startsWith('@') ? directive.name : '@' + directive.name;
          shouldIncludeAsJoinDirective = this.shouldUseJoinDirectiveForURL(
            linkImportIdentityURLMap.get(nameWithAtSymbol),
          );
        }

        if (shouldIncludeAsJoinDirective) {
          const existingJoins = (joinsByDirectiveName[directive.name] ??= []);
          let found = false;
          for (const existingJoin of existingJoins) {
            if (valueEquals(existingJoin.args, directive.arguments())) {
              existingJoin.graphs.push(graph);
              found = true;
              break;
            }
          }
          if (!found) {
            existingJoins.push({
              graphs: [graph],
              args: directive.arguments(),
            });
          }
        }
      }
    }

    const joinDirective = this.joinSpec.directiveDirective(this.merged);
    Object.keys(joinsByDirectiveName).forEach(directiveName => {
      joinsByDirectiveName[directiveName].forEach(join => {
        dest.applyDirective(joinDirective, {
          graphs: join.graphs,
          name: directiveName,
          args: join.args,
        });
      });
    });
  }

  private filterSubgraphs(predicate: (schema: Schema) => boolean): string[] {
    return this.subgraphsSchema.map((s, i) => predicate(s) ? this.names[i] : undefined).filter(n => n !== undefined) as string[];
  }

  private subgraphByName(name: string): Schema {
    return this.subgraphsSchema[this.names.indexOf(name)];
  }

  // TODO: the code here largely duplicate code that is in `internals-js/src/validate.ts`, except that when it detect an error, it
  // provides an error in terms of subgraph inputs (rather than what is merge). We could maybe try to save some of that duplication.
  private postMergeValidations() {
    for (const type of this.merged.types()) {
      if (!isObjectType(type) && !isInterfaceType(type)) {
        continue;
      }
      for (const itf of type.interfaces()) {
        for (const itfField of itf.fields()) {
          const field = type.field(itfField.name);
          if (!field) {
            // This means that the type was defined (or at least implemented the interface) only in subgraphs where the interface didn't have
            // that field.
            const subgraphsWithTheField = this.filterSubgraphs(s => s.typeOfKind<InterfaceType>(itf.name, 'InterfaceType')?.field(itfField.name) !== undefined);
            const subgraphsWithTypeImplementingItf = this.filterSubgraphs(s => {
              const typeInSubgraph = s.type(type.name);
              return typeInSubgraph !== undefined && (typeInSubgraph as ObjectType | InterfaceType).implementsInterface(itf.name);
            });
            this.errors.push(ERRORS.INTERFACE_FIELD_NO_IMPLEM.err(
              `Interface field "${itfField.coordinate}" is declared in ${printSubgraphNames(subgraphsWithTheField)} but type "${type}", `
                + `which implements "${itf}" only in ${printSubgraphNames(subgraphsWithTypeImplementingItf)} does not have field "${itfField.name}".`,
              {
                nodes: sourceASTs(
                  ...subgraphsWithTheField.map(s => this.subgraphByName(s).typeOfKind<InterfaceType>(itf.name, 'InterfaceType')?.field(itfField.name)),
                  ...subgraphsWithTypeImplementingItf.map(s => this.subgraphByName(s).type(type.name))
                )
              }
            ));
            continue;
          }

          // TODO: should we validate more? Can we have some invalid implementation of a field post-merging?
        }
      }
    }

    // We need to redo some validation for @requires after merge. The reason is that each subgraph validates that its own
    // @requires are valid, but "requirements" are requested from _other_ subgraphs (by definition of @requires really),
    // and there is a few situations (see details below) where a validity within the originated subgraph does not entail
    // validity for all subgraph that would have to provide those "requirements".
    // Long story short, we need to re-validate every @requires against the supergraph to guarantee it will always work
    // at runtime.
    for (const subgraph of this.subgraphs) {
      for (const requiresApplication of subgraph.metadata().requiresDirective().applications()) {
        const originalField = requiresApplication.parent as FieldDefinition<CompositeType>;
        assert(originalField.kind === 'FieldDefinition', () => `Expected ${inspect(originalField)} to be a field`);
        const mergedType = this.merged.type(originalField.parent.name);
        // The type should exists: there is a few types we don't merge, but those are from specific core features and they shouldn't have @provides.
        // In fact, if we were to not merge a type with a @provides, this would essentially mean that @provides cannot work, so worth catching
        // the issue early if this ever happen for some reason. And of course, the type should be composite since it is in at least the one
        // subgraph we're checking.
        assert(mergedType && isCompositeType(mergedType), () => `Merged type ${originalField.parent.name} should exist should have field ${originalField.name}`)
        assert(isCompositeType(mergedType), `${mergedType} should be a composite type but got ${mergedType.kind}`);
        try {
          parseFieldSetArgument({
            parentType: mergedType,
            directive: requiresApplication,
            decorateValidationErrors: false,
          });
        } catch (e) {
          if (!(e instanceof GraphQLError)) {
            throw e;
          }

          // Providing a useful error message to the user here is tricky in the general case because what we checked is that
          // a given subgraph @provides definition is invalid "on the supergraph", but the user seeing the error will not have
          // the supergraph, so we need to express the error in terms of the subgraphs.
          // But in practice, there is only a handful of cases that can trigger an error here. Indeed, at this point we know that
          //  - the @require application is valid in its original subgraph.
          //  - there was not merging errors (we don't call this whole method otherwise).
          // This eliminate the risk of the error being due to some invalid syntax, of some subsection on a non-composite or missing
          // on on a composite one (merging would have error), or of some unknown field in the selection (output types are merged
          // by union, so any field that was in the subgraph will be in the supergraph), or even any error due to the types of fields
          // involved (because the merged type is always a (non-strict) supertype of its counterpart in any subgraph, and anything
          // that could be queried in a subtype can be queried on a supertype).
          // As such, the only errors that we can have here are due to field arguments: because they are merged by intersection,
          // it _is_ possible that something that is valid in a subgraph is not valid in the supergraph. And the only 2 things that
          // can make such invalidity are:
          //  1. an argument may not be in the supergraph: it is in the subgraph, but not in all the subgraphs having the field,
          //    and the `@provides` passes a concrete value to that argument.
          //  2. the type of an argument in the supergraph is a strict subtype the type that argument has in `subgraph` (the one
          //    with the `@provides`) _and_ the `@provides` selection relies on the type difference. Now, argument types are input
          //    types and the only subtyping difference input types is related to nullability (neither interfaces nor union are
          //    input types in particular), so the only case this can happen is if a field `x` has some argument `a` type `A` in
          //    `subgraph` but type `!A` with no default in the supergraph, _and_ the `@provides` queries that field `x` _without_
          //    value for `a` (valid when `a` has type `A` but not with `!A` and no default).
          // So to ensure we provide good error messages, we brute-force detecting those 2 possible cases and have a special
          // treatment for each.
          // Note that this detection is based on pattern-matching the error message, which is somewhat fragile, but because we
          // only have 2 cases, we can easily cover them with unit tests, which means there is no practical risk of a message
          // change breaking this code and being released undetected. A cleaner implementation would probably require having
          // error codes and classes for all the graphqQL validations, but doing so cleanly is a fair amount of effort and probably
          // no justified "just for this particular case".
          const requireAST = requiresApplication.sourceAST ? [ addSubgraphToASTNode(requiresApplication.sourceAST, subgraph.name)] : [];

          const that = this;
          const registerError = (
            arg: string,
            field: string,
            isIncompatible: (f: FieldDefinition<any>) => boolean,
            makeMsg: (incompatibleSubgraphs: string) => string,
          ) => {
            const incompatibleSubgraphs = that.subgraphs.values().map((otherSubgraph) => {
              if (otherSubgraph.name === subgraph.name) {
                return undefined;
              }
              const fieldInOther = otherSubgraph.schema.elementByCoordinate(field);
              const fieldIsIncompatible = fieldInOther
                && fieldInOther instanceof FieldDefinition
                && isIncompatible(fieldInOther);
              return fieldIsIncompatible
                ? {
                  name: otherSubgraph.name,
                  node: fieldInOther.sourceAST ? addSubgraphToASTNode(fieldInOther.sourceAST, otherSubgraph.name) : undefined,
                }
                : undefined;
            }).filter(isDefined);
            assert(incompatibleSubgraphs.length > 0, () => `Got error on ${arg} of ${field} but no "incompatible" subgraphs (error: ${e})`);
            const nodes = requireAST.concat(incompatibleSubgraphs.map((s) => s.node).filter(isDefined));
            const error = ERRORS.REQUIRES_INVALID_FIELDS.err(
              `On field "${originalField.coordinate}", for ${requiresApplication}: ${makeMsg(printSubgraphNames(incompatibleSubgraphs.map((s) => s.name)))}`,
              { nodes }
            );
            that.errors.push(addSubgraphToError(error, subgraph.name));
          }

          const unknownArgument = e.message.match(/Unknown argument \"(?<arg>[^"]*)\" found in value: \"(?<field>[^"]*)\" has no argument.*/);
          if (unknownArgument) {
            const arg = unknownArgument.groups?.arg!;
            const field = unknownArgument.groups?.field!;
            registerError(
              arg,
              field,
              (f) => !f.argument(arg),
              (incompatibleSubgraphs) => `cannot provide a value for argument "${arg}" of field "${field}" as argument "${arg}" is not defined in ${incompatibleSubgraphs}`,
            );
            continue;
          }

          const missingMandatory = e.message.match(/Missing mandatory value for argument \"(?<arg>[^"]*)\" of field \"(?<field>[^"]*)\".*/);
          if (missingMandatory) {
            const arg = missingMandatory.groups?.arg!;
            const field = missingMandatory.groups?.field!;
            registerError(
              arg,
              field,
              (f) => !!f.argument(arg)?.isRequired(),
              (incompatibleSubgraphs) => `no value provided for argument "${arg}" of field "${field}" but a value is mandatory as "${arg}" is required in ${incompatibleSubgraphs}`,
            );
            continue;
          }

          assert(false, () => `Unexpected error throw by ${requiresApplication} when evaluated on supergraph: ${e.message}`);
        }
      }
    }

  }

  private updateInaccessibleErrorsWithLinkToSubgraphs(
    errors: GraphQLError[]
  ): GraphQLError[] {
    // While we could just take the supergraph referencer coordinate and return
    // any corresponding elements in the subgraphs, some of those subgraph
    // referencers may not have been the cause of the erroneous reference; it
    // often depends on the kind of reference (the logic of which is captured
    // below).
    function isRelevantSubgraphReferencer(
      subgraphReferencer: NamedSchemaElement<any, any, any>,
      err: GraphQLError,
      supergraphElements: string[],
      hasInaccessibleElements: boolean,
    ): boolean {
      switch (errorCode(err)) {
        case ERRORS.REFERENCED_INACCESSIBLE.code: {
          // We only care about subgraph fields/arguments/input fields whose
          // base type matches that of the inaccessible element.
          if (
            !((subgraphReferencer instanceof FieldDefinition) ||
            (subgraphReferencer instanceof ArgumentDefinition) ||
            (subgraphReferencer instanceof InputFieldDefinition))
          ) {
            return false;
          }
          const subgraphType = subgraphReferencer.type;
          const supergraphType = supergraphElements[0];

          return !!subgraphType &&
            baseType(subgraphType).name === supergraphType;
        }
        case ERRORS.DEFAULT_VALUE_USES_INACCESSIBLE.code: {
          // Default values are merged via intersection, so no need to filter
          // out any subgraph referencers here.
          return true;
        }
        case ERRORS.REQUIRED_INACCESSIBLE.code: {
          // An argument is required if it's non-nullable and has no default
          // value. This means that a required supergraph argument could be
          // the result of merging two non-required subgraph arguments (e.g.
          // one is non-nullable with a default while the other is nullable
          // without a default value). So we include nodes that are either
          // non-nullable or have no default value.
          if (
            !((subgraphReferencer instanceof ArgumentDefinition) ||
            (subgraphReferencer instanceof InputFieldDefinition))
          ) {
            return false;
          }
          const subgraphType = subgraphReferencer.type;
          return (subgraphType && isNonNullType(subgraphType)) ||
          subgraphReferencer.defaultValue === undefined;
        }
        case ERRORS.IMPLEMENTED_BY_INACCESSIBLE.code: {
          // Any subgraph containing the implemented field/argument is relevant,
          // so no need to filter out any subgraph elements here.
          return true;
        }
        case ERRORS.DISALLOWED_INACCESSIBLE.code: {
          // We only care about disallowed types/directives that contained at
          // least one @inaccessible descendant, so we filter by that here.
          return hasInaccessibleElements;
        }
        case ERRORS.ONLY_INACCESSIBLE_CHILDREN.code: {
          // We only care about parent types that contained at least one
          // @inaccessible descendant, so we filter by that here.
          return hasInaccessibleElements;
        }
        default: {
          return false;
        }
      }
    }

    return errors.map((err) => {
      const elements = err.extensions['inaccessible_elements'];
      if (!Array.isArray(elements)) return err;
      const errorNodes = [];
      const subgraphHasInaccessibleElements: boolean[] = [];
      for (const coordinate of elements) {
        if (typeof coordinate !== 'string') continue;
        errorNodes.push(...sourceASTs(...this.subgraphsSchema.flatMap(
          (subgraphSchema, subgraphIndex) => {
            const subgraphElement =
              subgraphSchema.elementByCoordinate(coordinate);
            if (subgraphElement) {
              const inaccessibleDirective =
                federationMetadata(subgraphSchema)!.inaccessibleDirective();
              if (subgraphElement.hasAppliedDirective(inaccessibleDirective)) {
                subgraphHasInaccessibleElements[subgraphIndex] = true;
                return [subgraphElement];
              }
          }
          return [];
        })));
      }

      const referencers = err.extensions['inaccessible_referencers'];
      if (Array.isArray(referencers)) {
        for (const coordinate of referencers) {
          if (typeof coordinate !== 'string') continue;
          errorNodes.push(...sourceASTs(...this.subgraphsSchema.flatMap(
            (subgraphSchema, subgraphIndex) => {
              const subgraphReferencer =
                subgraphSchema.elementByCoordinate(coordinate);
              if (
                subgraphReferencer &&
                isRelevantSubgraphReferencer(
                  subgraphReferencer,
                  err,
                  elements,
                  subgraphHasInaccessibleElements[subgraphIndex]
                )
              ) {
                return [subgraphReferencer];
              }
            return [];
          })));
        }
      }

      return errorNodes.length > 0
        ? withModifiedErrorNodes(err, errorNodes)
        : err;
    });
  }

  private validateSubscriptionField(sources: FieldOrUndefinedArray) {
    // no subgraph marks field as @shareable
    const fieldsWithShareable = sources.filter((src, idx) => src && src.appliedDirectivesOf(this.metadata(idx).shareableDirective()).length > 0);
    if (fieldsWithShareable.length > 0) {
      const nodes = sourceASTs(...fieldsWithShareable);
      this.errors.push(ERRORS.INVALID_FIELD_SHARING.err(
        `Fields on root level subscription object cannot be marked as shareable`,
        { nodes},
      ));
    }
  }
}
