import {
  ArgumentDefinition,
  assert,
  arrayEquals,
  DirectiveDefinition,
  EnumType,
  FieldDefinition,
  InputObjectType,
  InterfaceType,
  MultiMap,
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
  TAG_VERSIONS,
  INACCESSIBLE_VERSIONS,
  NamedSchemaElement,
  executableDirectiveLocations,
  errorCauses,
  isObjectType,
  SubgraphASTNode,
  addSubgraphToASTNode,
  firstOf,
  Extension,
  DEFAULT_SUBTYPING_RULES,
  isInterfaceType,
  sourceASTs,
  ErrorCodeDefinition,
  ERRORS,
  joinStrings,
  FederationMetadata,
  printSubgraphNames,
  federationIdentity,
  linkIdentity,
  coreIdentity,
  FEDERATION_OPERATION_TYPES,
  LINK_VERSIONS,
  federationMetadata,
  FeatureDefinition,
  Subgraph,
  errorCode,
  withModifiedErrorNodes,
  didYouMean,
  suggestionList,
  EnumValue,
  baseType,
  isEnumType,
  filterTypesOfKind,
  isNonNullType,
} from "@apollo/federation-internals";
import { ASTNode, GraphQLError, DirectiveLocation } from "graphql";
import {
  CompositionHint,
  HintCodeDefinition,
  HINTS,
} from "../hints";
import { type CompositionOptions } from '../types';

const linkSpec = LINK_VERSIONS.latest();
type FieldOrUndefinedArray = (FieldDefinition<any> | undefined)[];

const joinSpec = JOIN_VERSIONS.latest();
const inaccessibleSpec = INACCESSIBLE_VERSIONS.latest();

export type MergeResult = MergeSuccess | MergeFailure;

// for each source, specify additional properties that validate functions can set
class FieldMergeContext {
  _props: { usedOverridden: boolean, unusedOverridden: boolean }[];

  constructor(sources: unknown[]) {
    this._props = (new Array(sources.length)).fill(true).map(_ => ({ usedOverridden: false, unusedOverridden: false }));
  }

  isUsedOverridden(idx: number) {
    return this._props[idx].usedOverridden;
  }

  isUnusedOverridden(idx: number) {
    return this._props[idx].unusedOverridden;
  }

  setUsedOverridden(idx: number) {
    this._props[idx].usedOverridden = true;
  }

  setUnusedOverridden(idx: number) {
    this._props[idx].unusedOverridden = true;
  }

  some(predicate: ({ usedOverridden, unusedOverridden }: { usedOverridden: boolean, unusedOverridden: boolean }) => boolean): boolean {
    return this._props.some(predicate);
  }
}

// TODO:" we currently cannot allow "list upgrades", meaning a subgraph returning `String`
// and another returning `[String]`. To support it, we would need the execution code to
// recognize situation and "coerce" results from the first subgraph (the one returning
// `String`) into singleton lists.
const defaultCompositionOptions: CompositionOptions = {
  allowedFieldTypeMergingSubtypingRules: DEFAULT_SUBTYPING_RULES
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
  return new Merger(subgraphs, { ...defaultCompositionOptions, ...options }).merge();
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
  const typeFeature = coreFeatures?.sourceFeature(type)?.url.identity;
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

type MergedDirectiveInfo = {
  specInSupergraph: FeatureDefinition,
  definitionInSubgraph: (subgraph: Subgraph) => DirectiveDefinition,
}

const MERGED_FEDERATION_DIRECTIVES: MergedDirectiveInfo[] = [
  { specInSupergraph: TAG_VERSIONS.latest(), definitionInSubgraph: (subgraph) => subgraph.metadata().tagDirective() },
  { specInSupergraph: INACCESSIBLE_VERSIONS.latest(), definitionInSubgraph: (subgraph) => subgraph.metadata().inaccessibleDirective() },
];

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

function typeKindToString(t: NamedType): string {
  return t.kind.replace("Type", " Type");
}

function locationString(locations: DirectiveLocation[]): string {
  if (locations.length === 0) {
    return "";
  }
  return (locations.length === 1 ? 'location ' : 'locations ') + '"' + locations.join(', ') + '"';
}

/**
 * Given a list of directive sources, get the set of locations, removing duplicates
 */
const getLocationsFromDirectiveDefs = (sources: (DirectiveDefinition | undefined)[]) => {
  let consistentLocations = true;
  const locationSet = new Set<DirectiveLocation>();
  sources
    .filter((src): src is DirectiveDefinition => src !== undefined)
    .forEach((src, idx) => {
      const prevLength = locationSet.size;
      src.locations.forEach(locationSet.add, locationSet);
      if (idx > 0 && prevLength !== locationSet.size) {
        consistentLocations = false;
      }
    });
  return {
    consistentLocations,
    locations: Array.from(locationSet),
  };
}

type EnumTypeUsagePosition = 'Input' | 'Output' | 'Both';
type EnumTypeUsage = {
  position: EnumTypeUsagePosition,
  examples: {
    Input?: {coordinate: string, sourceAST?: SubgraphASTNode},
    Output?: {coordinate: string, sourceAST?: SubgraphASTNode},
  },
}

class Merger {
  readonly names: readonly string[];
  readonly subgraphsSchema: readonly Schema[];
  readonly errors: GraphQLError[] = [];
  readonly hints: CompositionHint[] = [];
  readonly merged: Schema = new Schema();
  readonly subgraphNamesToJoinSpecName: Map<string, string>;
  readonly mergedFederationDirectiveNames = new Set<string>();
  readonly mergedFederationDirectiveInSupergraph = new Map<string, DirectiveDefinition>();
  readonly enumUsages = new Map<string, EnumTypeUsage>();

  constructor(readonly subgraphs: Subgraphs, readonly options: CompositionOptions) {
    this.names = subgraphs.names();
    this.subgraphsSchema = subgraphs.values().map(subgraph => subgraph.schema);
    this.subgraphNamesToJoinSpecName = this.prepareSupergraph();
  }

  private prepareSupergraph(): Map<string, string> {
    // TODO: we will soon need to look for name conflicts for @core and @join with potentially user-defined directives and
    // pass a `as` to the methods below if necessary. However, as we currently don't propagate any subgraph directives to
    // the supergraph outside of a few well-known ones, we don't bother yet.
    linkSpec.addToSchema(this.merged);
    const errors = linkSpec.applyFeatureToSchema(this.merged, joinSpec, undefined, joinSpec.defaultCorePurpose);
    assert(errors.length === 0, "We shouldn't have errors adding the join spec to the (still empty) supergraph schema");

    for (const mergedInfo of MERGED_FEDERATION_DIRECTIVES) {
      this.validateAndMaybeAddSpec(mergedInfo);
    }

    return joinSpec.populateGraphEnum(this.merged, this.subgraphs);
  }

  private validateAndMaybeAddSpec({specInSupergraph, definitionInSubgraph}: MergedDirectiveInfo) {
    let nameInSupergraph: string | undefined;
    for (const subgraph of this.subgraphs) {
      const directive = definitionInSubgraph(subgraph);
      if (directive.applications().length === 0) {
        continue;
      }

      if (!nameInSupergraph) {
        nameInSupergraph = directive.name;
      } else if (nameInSupergraph !== directive.name) {
        this.reportMismatchError(
          ERRORS.LINK_IMPORT_NAME_MISMATCH,
          `The federation "@${specInSupergraph.url.name}" directive is imported with mismatched name between subgraphs: it is imported as `,
          subgraph.metadata().federationFeature()?.directive!,
          this.subgraphs.values().map((s) => s.metadata().federationFeature()?.directive),
          (linkDef) => `"@${federationMetadata(linkDef.schema())?.federationFeature()?.directiveNameInSchema(specInSupergraph.url.name)}"`,
        );
        return;
      }
    }

    // If we get here with `nameInSupergraph` unset, it means there is no usage for the directive at all and we
    // don't bother adding the spec to the supergraph.
    if (nameInSupergraph) {
      const errors = linkSpec.applyFeatureToSchema(this.merged, specInSupergraph, nameInSupergraph === specInSupergraph.url.name ? undefined : nameInSupergraph, specInSupergraph.defaultCorePurpose);
      assert(errors.length === 0, "We shouldn't have errors adding the join spec to the (still empty) supergraph schema");
      this.mergedFederationDirectiveNames.add(nameInSupergraph);
      this.mergedFederationDirectiveInSupergraph.set(specInSupergraph.url.name, this.merged.directive(nameInSupergraph)!);
    }
  }

  private joinSpecName(subgraphIndex: number): string {
    return this.subgraphNamesToJoinSpecName.get(this.names[subgraphIndex])!;
  }

  private metadata(idx: number): FederationMetadata {
    return this.subgraphs.values()[idx].metadata();
  }

  private isMergedDirective(definition: DirectiveDefinition | Directive): boolean {
    // If it's a directive application, then we skip it unless it's a graphQL built-in
    // (even if the definition itself allows executable locations, this particular
    // application is an type-system element and we don't want to merge it).
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
    return definition.locations.some(loc => executableDirectiveLocations.includes(loc));
  }

  merge(): MergeResult {
    // We first create empty objects for all the types and directives definitions that will exists in the
    // supergraph. This allow to be able to reference those from that point on.
    this.addTypesShallow();
    this.addDirectivesShallow();
    this.addCustomTypeSystemDirectives();

    const typesToMerge = this.merged.types()
      .filter((type) => !linkSpec.isSpecType(type) && !joinSpec.isSpecType(type));

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
      if (linkSpec.isSpecDirective(definition) || joinSpec.isSpecDirective(definition)) {
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
      this.errors.push(ERRORS.NO_QUERIES.err({ message: "No queries found in any subgraph: a supergraph must have a query root type." }));
    }

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
            // Not a GraphQLError, so probably a programing error. Let's re-throw so it can be more easily tracked down.
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
    for (const subgraph of this.subgraphsSchema) {
      // We include the built-ins in general (even if we skip some federation specific ones): if a subgraph built-in
      // is not a supergraph built-in, we should add it as a normal type.
      for (const type of subgraph.allTypes()) {
        if (!isMergedType(type)) {
          continue;
        }
        const previous = this.merged.type(type.name);
        if (!previous) {
          this.merged.addType(newNamedType(type.kind, type.name));
        } else if (previous.kind !== type.kind) {
          mismatchedTypes.add(type.name);
        }
      }
    }
    mismatchedTypes.forEach(t => this.reportMismatchedTypeDefinitions(t));
  }

  private addDirectivesShallow() {
    // Like for types, we initially add all the directives that are defined in any subgraph.
    // However, in practice and for "execution" directives, we will only keep the the ones
    // that are in _all_ subgraphs. But we're do the remove later, and while this is all a
    // bit round-about, it's a tad simpler code-wise to do this way.
    for (const subgraph of this.subgraphsSchema) {
      for (const directive of subgraph.allDirectives()) {
        if (!this.isMergedDirective(directive)) {
          continue;
        }
        if (!this.merged.directive(directive.name)) {
          this.merged.addDirectiveDefinition(new DirectiveDefinition(directive.name));
        }
      }
    }
  }

  /**
   * Go through the list of custom directives. If any of them are type system directives
   * or have a type system component, go ahead and add the full union of locations to the existing directive
   * (if the directive has an executable portion) or create a new directive if not.
   */
  private addCustomTypeSystemDirectives() {
    const directiveNameMap = this.exposedDirectives().reduce((acc, name: string) => {
      acc[name] = [];
      return acc;
    }, {} as { [name: string]: DirectiveDefinition[] });
    for (const subgraph of this.subgraphsSchema) {
      for (const directive of subgraph.allDirectives()) {
        if (directive.name in directiveNameMap) {
          directiveNameMap[directive.name].push(directive);
        }
      }
    }
    Object.entries(directiveNameMap).forEach(([name, definitions]) => {
      // only add if the custom directive is not "executable"
      // TODO: Should we generate a hint if definition.length === 0?
      if (definitions.length > 0) {
        let def: DirectiveDefinition | undefined;
        // if it's an executable directive, we probably have already created it
        if (definitions.some(d => d.locations.some(loc => executableDirectiveLocations.includes(loc)))) {
          def = this.merged.directive(name);
          assert(def, `could not find directive '@${name}'`);
          const { locations } = getLocationsFromDirectiveDefs(definitions);
          def.addLocations(...locations);
        } else {
          def = new DirectiveDefinition(name);
          this.merged.addDirectiveDefinition(def);
          this.mergeTypeSystemDirectiveDefinition(definitions, def);
        }
      }
    });

    // TODO: Check to make sure that these really are custom directives
  }

  private reportMismatchedTypeDefinitions(mismatchedType: string) {
    const supergraphType = this.merged.type(mismatchedType)!;
    this.reportMismatchError(
      ERRORS.TYPE_KIND_MISMATCH,
      `Type "${mismatchedType}" has mismatched kind: it is defined as `,
      supergraphType,
      this.subgraphsSchema.map(s => s.type(mismatchedType)),
      typeKindToString
    );
  }

  private reportMismatchError<TMismatched extends { sourceAST?: ASTNode }>(
    code: ErrorCodeDefinition,
    message: string,
    mismatchedElement:TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAccessor: (elt: TMismatched, isSupergraph: boolean) => string | undefined
  ) {
    this.reportMismatch(
      mismatchedElement,
      subgraphElements,
      mismatchAccessor,
      (elt, names) => `${elt} in ${names}`,
      (elt, names) => `${elt} in ${names}`,
      (distribution, nodes) => {
        this.errors.push(code.err({
          message: message + joinStrings(distribution, ' and ', ' but '),
          nodes
        }));
      },
      elt => !elt
    );
  }

  private reportMismatchErrorWithSpecifics<TMismatched extends { sourceAST?: ASTNode }>({
    code,
    message,
    mismatchedElement,
    subgraphElements,
    mismatchAccessor,
    supergraphElementPrinter,
    otherElementsPrinter,
    ignorePredicate,
    includeMissingSources = false,
    extraNodes,
  }: {
    code: ErrorCodeDefinition,
    message: string,
    mismatchedElement: TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAccessor: (elt: TMismatched | undefined, isSupergraph: boolean) => string | undefined,
    supergraphElementPrinter: (elt: string, subgraphs: string | undefined) => string,
    otherElementsPrinter: (elt: string | undefined, subgraphs: string) => string,
    ignorePredicate?: (elt: TMismatched | undefined) => boolean,
    includeMissingSources?: boolean,
    extraNodes?: SubgraphASTNode[],
  }) {
    this.reportMismatch(
      mismatchedElement,
      subgraphElements,
      mismatchAccessor,
      supergraphElementPrinter,
      otherElementsPrinter,
      (distribution, nodes) => {
        this.errors.push(code.err({
          message: message + distribution[0] + joinStrings(distribution.slice(1), ' and '),
          nodes: nodes.concat(extraNodes ?? [])
        }));
      },
      ignorePredicate,
      includeMissingSources
    );
  }

  private reportMismatchHint<TMismatched extends { sourceAST?: ASTNode }>(
    hintId: HintCodeDefinition,
    message: string,
    supergraphElement: TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAccessor: (elt: TMismatched, isSupergraph: boolean) => string | undefined,
    supergraphElementPrinter: (elt: string, subgraphs: string | undefined) => string,
    otherElementsPrinter: (elt: string | undefined, subgraphs: string) => string,
    ignorePredicate?: (elt: TMismatched | undefined) => boolean,
    includeMissingSources: boolean = false,
    noEndOfMessageDot: boolean = false
  ) {
    this.reportMismatch(
      supergraphElement,
      subgraphElements,
      mismatchAccessor,
      supergraphElementPrinter,
      otherElementsPrinter,
      (distribution, astNodes) => {
        this.hints.push(new CompositionHint(
          hintId,
          message + distribution[0] + joinStrings(distribution.slice(1), ' and ') + (noEndOfMessageDot ? '' : '.'),
          astNodes
        ));
      },
      ignorePredicate,
      includeMissingSources
    );
  }

  private reportMismatch<TMismatched extends { sourceAST?: ASTNode }>(
    supergraphElement:TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAccessor: (element: TMismatched, isSupergraph: boolean) => string | undefined,
    supergraphElementPrinter: (elt: string, subgraphs: string | undefined) => string,
    otherElementsPrinter: (elt: string | undefined, subgraphs: string) => string,
    reporter: (distribution: string[], astNode: SubgraphASTNode[]) => void,
    ignorePredicate?: (elt: TMismatched | undefined) => boolean,
    includeMissingSources: boolean = false
  ) {
    const distributionMap = new MultiMap<string, string>();
    const astNodes: SubgraphASTNode[] = [];
    for (const [i, subgraphElt] of subgraphElements.entries()) {
      if (!subgraphElt) {
        if (includeMissingSources) {
          distributionMap.add('', this.names[i]);
        }
        continue;
      }
      if (ignorePredicate && ignorePredicate(subgraphElt)) {
        continue;
      }
      const elt = mismatchAccessor(subgraphElt, false);
      distributionMap.add(elt ?? '', this.names[i]);
      if (subgraphElt.sourceAST) {
        astNodes.push(addSubgraphToASTNode(subgraphElt.sourceAST, this.names[i]));
      }
    }
    const supergraphMismatch = mismatchAccessor(supergraphElement, true) ?? '';
    assert(distributionMap.size > 1, () => `Should not have been called for ${supergraphElement}`);
    const distribution = [];
    // We always add the "supergraph" first (proper formatting of hints rely on this in particular).
    const subgraphsLikeSupergraph = distributionMap.get(supergraphMismatch);
    distribution.push(supergraphElementPrinter(supergraphMismatch, subgraphsLikeSupergraph ? printSubgraphNames(subgraphsLikeSupergraph) : undefined));
    for (const [v, names] of distributionMap.entries()) {
      if (v === supergraphMismatch) {
        continue;
      }
      distribution.push(otherElementsPrinter(v === '' ? undefined : v, printSubgraphNames(names)));
    }
    reporter(distribution, astNodes);
  }

  private subgraphsTypes<T extends NamedType>(supergraphType: T): (T | undefined)[] {
    return this.subgraphsSchema.map((subgraph) => {
      const type = subgraph.type(supergraphType.name);
      // At this point, we have already reported errors for type mismatches (and so composition
      // will fail, we just try to gather more errors), so simply ignore versions of the type
      // that don't have the proper kind.
      if (!type || type.kind !== supergraphType.kind) {
        return undefined;
      }
      return type as T;
    });
  }

  private mergeImplements<T extends ObjectType | InterfaceType>(sources: (T | undefined)[], dest: T) {
    const implemented = new Set<string>();
    const joinImplementsDirective = joinSpec.implementsDirective(this.merged)!;
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
      if (descriptions.length === 1) {
        dest.description = descriptions[0];
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
        this.reportMismatchHint(
          HINTS.INCONSISTENT_DESCRIPTION,
          `${name} has inconsistent descriptions across subgraphs. `,
          dest,
          sources,
          elt => elt.description,
          (desc, subgraphs) => `The supergraph will use description (from ${subgraphs}):\n${descriptionString(desc, '  ')}`,
          (desc, subgraphs) => `\nIn ${subgraphs}, the description is:\n${descriptionString(desc!, '  ')}`,
          elt => elt?.description === undefined,
          false,  // Don't including sources with no description
          true    // Skip the end-of-message '.' since it would look ugly in that specific case
        );
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
    this.mergeAppliedDirectives(sources, dest);
    switch (dest.kind) {
      case 'ScalarType':
        // Since we don't handle applied directives yet, we have nothing specific to do for scalars.
        break;
      case 'ObjectType':
        this.mergeObject(sources as (ObjectType | undefined)[], dest);
        break;
      case 'InterfaceType':
        this.mergeInterface(sources as (InterfaceType | undefined)[], dest);
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
        this.errors.push(ERRORS.EXTENSION_WITH_NO_BASE.err({
          message: `[${subgraph}] Type "${dest}" is an extension type, but there is no type definition for "${dest}" in any subgraph.`,
          nodes: extensionASTs[i],
        }));
      }
    }
  }

  private addJoinType(sources: (NamedType | undefined)[], dest: NamedType) {
    const joinTypeDirective = joinSpec.typeDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      if (!source) {
        continue;
      }

      // There is either 1 join__type per-key, or if there is no key, just one for the type.
      const sourceMetadata = this.subgraphs.values()[idx].metadata();
      const keys = source.appliedDirectivesOf(sourceMetadata.keyDirective());
      const name = this.joinSpecName(idx);
      if (!keys.length) {
        dest.applyDirective(joinTypeDirective, { graph: name });
      } else {
        for (const key of keys) {
          const extension = key.ofExtension() || source.hasAppliedDirective(sourceMetadata.extendsDirective()) ? true : undefined;
          const { resolvable } = key.arguments();
          dest.applyDirective(joinTypeDirective, { graph: name, key: key.arguments().fields, extension, resolvable });
        }
      }
    }
  }

  private mergeObject(sources: (ObjectType | undefined)[], dest: ObjectType) {
    const isEntity = this.hintOnInconsistentEntity(sources, dest);
    const isValueType = !isEntity && !dest.isRootType();

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

        this.mergeField(subgraphFields, destField, mergeContext);
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
      this.reportMismatchHint(
        HINTS.INCONSISTENT_ENTITY,
        `Type "${dest}" is declared as an entity (has a @key applied) in some but not all defining subgraphs: `,
        dest,
        sources,
        // All we use the string of the next line for is to categorize source with a @key of the others.
        type => type.hasAppliedDirective('key') ? 'yes' : 'no',
        // Note that the first callback is for element that are "like the supergraph". As the supergraph has no @key ...
        (_, subgraphs) => `it has no @key in ${subgraphs}`,
        (_, subgraphs) => ` but has some @key in ${subgraphs}`,
      );
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
    for (const source of sources) {
      // As soon as we find a subgraph that has the type but not the field, we hint.
      if (source && !source.field(field.name)) {
        this.reportMismatchHint(
          hintId,
          `Field "${field.coordinate}" of ${typeDescription} type "${dest}" is defined in some but not all subgraphs that define "${dest}": `,
          dest,
          sources,
          type => type.field(field.name) ? 'yes' : 'no',
          (_, subgraphs) => `"${field.coordinate}" is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
        );
      }
    }
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
          if (this.isMergedDirective(directive)) {
            // Contrarily to most of the errors during merging that "merge" errors for related elements, we're logging one
            // error for every application here. But this is because there error is somewhat subgraph specific and is
            // unlikely to span multiple subgraphs. In fact, we could almost have thrown this error during subgraph validation
            // if this wasn't for the fact that it is only thrown for directives being merged and so is more logical to
            // be thrown only when merging.
            this.errors.push(ERRORS.MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL.err({
              message: `[${this.names[i]}] Cannot apply merged directive ${directive} to external field "${source.coordinate}"`,
              nodes: directive.sourceAST
            }));
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

  private getOverrideDirective(sourceIdx: number, field: FieldDefinition<any>): Directive<any> | undefined {
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
           subgraph: subgraphName,
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
  private validateOverride(sources: FieldOrUndefinedArray, { coordinate }: FieldDefinition<any>): FieldMergeContext {
    const result = new FieldMergeContext(sources);

    // For any field, we can't have more than one @override directive
    type MappedValue = {
      idx: number,
      name: string,
      overrideDirective: Directive<FieldDefinition<any>> | undefined,
    };

    type ReduceResultType = {
      subgraphsWithOverride: string[],
      subgraphMap: { [key: string]: MappedValue },
    };

    // convert sources to a map so we don't have to keep scanning through the array to find a source
    const { subgraphsWithOverride, subgraphMap } = sources.map((source, idx) => {
      if (!source) {
        return undefined;
      }
      return {
        idx,
        name: this.names[idx],
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
      const { overrideDirective } = subgraphMap[subgraphName];
      const sourceSubgraphName = overrideDirective?.arguments()?.from;
      const overridingSubgraphASTNode = overrideDirective?.sourceAST ? addSubgraphToASTNode(overrideDirective.sourceAST, subgraphName) : undefined;
      if (!this.names.includes(sourceSubgraphName)) {
        const suggestions = suggestionList(sourceSubgraphName, this.names);
        const extraMsg = didYouMean(suggestions);
        this.hints.push(new CompositionHint(
          HINTS.FROM_SUBGRAPH_DOES_NOT_EXIST,
          `Source subgraph "${sourceSubgraphName}" for field "${coordinate}" on subgraph "${subgraphName}" does not exist.${extraMsg}`,
          overridingSubgraphASTNode,
        ));
      } else if (sourceSubgraphName === subgraphName) {
        this.errors.push(ERRORS.OVERRIDE_FROM_SELF_ERROR.err({
          message: `Source and destination subgraphs "${sourceSubgraphName}" are the same for overridden field "${coordinate}"`,
          nodes: overrideDirective?.sourceAST,
        }));
      } else if (subgraphsWithOverride.includes(sourceSubgraphName)) {
        this.errors.push(ERRORS.OVERRIDE_SOURCE_HAS_OVERRIDE.err({
          message: `Field "${coordinate}" on subgraph "${subgraphName}" is also marked with directive @override in subgraph "${sourceSubgraphName}". Only one @override directive is allowed per field.`,
          nodes: sourceASTs(overrideDirective, subgraphMap[sourceSubgraphName].overrideDirective)
        }));
      } else if (subgraphMap[sourceSubgraphName] === undefined) {
        this.hints.push(new CompositionHint(
          HINTS.OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
          `Field "${coordinate}" on subgraph "${subgraphName}" no longer exists in the from subgraph. The @override directive can be removed.`,
          overridingSubgraphASTNode,
        ));
      } else {
        // check to make sure that there is no conflicting @provides, @requires, or @external directives
        const fromIdx = this.names.indexOf(sourceSubgraphName);
        const fromField = sources[fromIdx];
        const { result: hasIncompatible, conflictingDirective, subgraph } = this.overrideConflictsWithOtherDirective({
          idx: subgraphMap[subgraphName].idx,
          field: sources[subgraphMap[subgraphName].idx],
          subgraphName,
          fromIdx: this.names.indexOf(sourceSubgraphName),
          fromField: sources[fromIdx],
        });
        if (hasIncompatible) {
          assert(conflictingDirective !== undefined, 'conflictingDirective should not be undefined');
          this.errors.push(ERRORS.OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE.err({
            message: `@override cannot be used on field "${fromField?.coordinate}" on subgraph "${subgraphName}" since "${fromField?.coordinate}" on "${subgraph}" is marked with directive "@${conflictingDirective.name}"`,
            nodes: sourceASTs(overrideDirective, conflictingDirective)
          }));
        } else {
          // if we get here, then the @override directive is valid
          // if the field being overridden is used, then we need to add an @external directive
          assert(fromField, 'fromField should not be undefined');
          const overriddenSubgraphASTNode = fromField.sourceAST ? addSubgraphToASTNode(fromField.sourceAST, sourceSubgraphName) : undefined;
          if (this.isExternal(fromIdx, fromField)) {
            // The from field is explicitly marked external by the user (which means it is "used" and cannot be completely
            // removed) so the @override can be removed.
            this.hints.push(new CompositionHint(
              HINTS.OVERRIDE_DIRECTIVE_CAN_BE_REMOVED,
              `Field "${coordinate}" on subgraph "${subgraphName}" is not resolved anymore by the from subgraph (it is marked "@external" in "${sourceSubgraphName}"). The @override directive can be removed.`,
              overridingSubgraphASTNode,
            ));
          } else if (this.metadata(fromIdx).isFieldUsed(fromField)) {
            result.setUsedOverridden(fromIdx);
            this.hints.push(new CompositionHint(
              HINTS.OVERRIDDEN_FIELD_CAN_BE_REMOVED,
              `Field "${coordinate}" on subgraph "${sourceSubgraphName}" is overridden. It is still used in some federation directive(s) (@key, @requires, and/or @provides) and/or to satisfy interface constraint(s), but consider marking it @external explicitly or removing it along with its references.`,
              overriddenSubgraphASTNode,
            ));
          } else {
            result.setUnusedOverridden(fromIdx);
            this.hints.push(new CompositionHint(
              HINTS.OVERRIDDEN_FIELD_CAN_BE_REMOVED,
              `Field "${coordinate}" on subgraph "${sourceSubgraphName}" is overridden. Consider removing it.`,
              overriddenSubgraphASTNode,
            ));
          }
        }
      }
    });

    return result;
  }

  private mergeField(sources: FieldOrUndefinedArray, dest: FieldDefinition<any>, mergeContext: FieldMergeContext = new FieldMergeContext(sources)) {
    if (sources.every((s, i) => s === undefined || this.isExternal(i, s))) {
      const definingSubgraphs = sources.map((source, i) => source ? this.names[i] : undefined).filter(s => s !== undefined) as string[];
      const nodes = sources.map(source => source?.sourceAST).filter(s => s !== undefined) as ASTNode[];
      this.errors.push(ERRORS.EXTERNAL_MISSING_ON_BASE.err({
        message: `Field "${dest.coordinate}" is marked @external on all the subgraphs in which it is listed (${printSubgraphNames(definingSubgraphs)}).`,
        nodes
      }));
      return;
    }

    const withoutExternal = this.validateAndFilterExternal(sources);
    // Note that we don't truly merge externals: we don't want, for instance, a field that is non-nullable everywhere to appear nullable in the
    // supergraph just because someone fat-fingered the type in an external definition. But after merging the non-external definitions, we
    // validate the external ones are consistent.
    this.mergeDescription(withoutExternal, dest);
    this.mergeAppliedDirectives(withoutExternal, dest);
    this.addArgumentsShallow(withoutExternal, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = withoutExternal.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }
    const allTypesEqual = this.mergeTypeReference(withoutExternal, dest);
    if (this.hasExternal(sources)) {
      this.validateExternalFields(sources, dest, allTypesEqual);
    }
    this.addJoinField({ sources, dest, allTypesEqual, mergeContext });
  }

  private validateFieldSharing(sources: FieldOrUndefinedArray, dest: FieldDefinition<any>, mergeContext: FieldMergeContext) {
    const shareableSources: number[] = [];
    const nonShareableSources: number[] = [];
    const allResolving: FieldDefinition<any>[] = [];
    for (const [i, source] of sources.entries()) {
      const overridden = mergeContext.isUsedOverridden(i) || mergeContext.isUnusedOverridden(i);
      if (!source || this.isFullyExternal(i, source) || overridden) {
        continue;
      }

      allResolving.push(source);
      if (this.isShareable(i, source)) {
        shareableSources.push(i);
      } else {
        nonShareableSources.push(i);
      }
    }

    if (nonShareableSources.length > 0 && (shareableSources.length > 0 || nonShareableSources.length > 1)) {
      const resolvingSubgraphs = nonShareableSources.concat(shareableSources).map((s) => this.names[s]);
      const nonShareables = shareableSources.length > 0
        ? printSubgraphNames(nonShareableSources.map((s) => this.names[s]))
        : 'all of them';
      this.errors.push(ERRORS.INVALID_FIELD_SHARING.err({
        message: `Non-shareable field "${dest.coordinate}" is resolved from multiple subgraphs: it is resolved from ${printSubgraphNames(resolvingSubgraphs)} and defined as non-shareable in ${nonShareables}`,
        nodes: sourceASTs(...allResolving),
      }));
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
      this.reportMismatchError(
        ERRORS.EXTERNAL_TYPE_MISMATCH,
        `Type of field "${dest.coordinate}" is incompatible across subgraphs (where marked @external): it has `,
        dest,
        sources,
        field => `type "${field.type}"`
      );
    }
    for (const arg of invalidArgsPresence) {
      const destArg = dest.argument(arg)!;
      this.reportMismatchErrorWithSpecifics({
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
      this.reportMismatchError(
        ERRORS.EXTERNAL_ARGUMENT_TYPE_MISMATCH,
        `Type of argument "${destArg.coordinate}" is incompatible across subgraphs (where "${dest.coordinate}" is marked @external): it has `,
        destArg,
        sources.map(s => s?.argument(destArg.name)),
        arg => `type "${arg.type}"`
      );
    }
    for (const arg of invalidArgsDefaults) {
      const destArg = dest.argument(arg)!;
      this.reportMismatchError(
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
    if (mergeContext.some(({ usedOverridden }) => usedOverridden)) {
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
    const joinFieldDirective = joinSpec.fieldDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      const usedOverridden = mergeContext.isUsedOverridden(idx);
      const unusedOverridden = mergeContext.isUnusedOverridden(idx);
      if (!source || unusedOverridden) {
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
      this.reportMismatchError(
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
      this.reportMismatchHint(
        isArgument ? HINTS.INCONSISTENT_BUT_COMPATIBLE_ARGUMENT_TYPE : HINTS.INCONSISTENT_BUT_COMPATIBLE_FIELD_TYPE,
        `Type of ${elementKind} "${dest.coordinate}" is inconsistent but compatible across subgraphs: `,
        dest,
        sources,
        field => field.type!.toString(),
        (elt, subgraphs) => `will use type "${elt}" (from ${subgraphs}) in supergraph but "${dest.coordinate}" has `,
        (elt, subgraphs) => `${isInputPosition ? 'supertype' : 'subtype'} "${elt}" in ${subgraphs}`
      );
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
          this.errors.push(ERRORS.REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH.err({
            message: `Argument "${arg.coordinate}" is required in some subgraphs but does not appear in all subgraphs: it is required in ${nonOptionalSubgraphs} but does not appear in ${missingSources}`,
            nodes: sourceASTs(...sources.map((s) => s?.argument(argName))),
          }));
        } else {
          this.reportMismatchHint(
            HINTS.INCONSISTENT_ARGUMENT_PRESENCE,
            `Optional argument "${arg.coordinate}" will not be included in the supergraph as it does not appear in all subgraphs: `,
            arg,
            sources.map((s) => s ? s.argument(argName) : undefined),
            _ => 'yes',
            // Note that the first callback is for element that are "like the supergraph" and we've pass `dest`.
            (_, subgraphs) => `it is defined in ${subgraphs}`,
            (_, subgraphs) => ` but not in ${subgraphs}`,
            undefined,
            true // Do include undefined sources, that's the point
          );
        }
        // Note that we remove the element after the hint/error because we access it in the hint message generation.
        arg.remove();
      }
    }
  }

  private mergeArgument(sources: (ArgumentDefinition<any> | undefined)[], dest: ArgumentDefinition<any>) {
    this.mergeDescription(sources, dest);
    this.mergeAppliedDirectives(sources, dest);
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
      this.reportMismatchError(
        kind === 'Argument' ? ERRORS.ARGUMENT_DEFAULT_MISMATCH : ERRORS.INPUT_FIELD_DEFAULT_MISMATCH,
        `${kind} "${dest.coordinate}" has incompatible default values across subgraphs: it has `,
        dest,
        sources,
        arg => arg.defaultValue !== undefined ? `default value ${valueToString(arg.defaultValue, arg.type)}` : 'no default value'
      );
    } else if (isInconsistent) {
      this.reportMismatchHint(
        HINTS.INCONSISTENT_DEFAULT_VALUE_PRESENCE,
        `${kind} "${dest.coordinate}" has a default value in only some subgraphs: `,
        dest,
        sources,
        arg => arg.defaultValue !== undefined ? valueToString(arg.defaultValue, arg.type) : undefined,
        (_, subgraphs) => `will not use a default in the supergraph (there is no default in ${subgraphs}) but `,
        (elt, subgraphs) => `"${dest.coordinate}" has default value ${elt} in ${subgraphs}`
      );
    }
  }

  private mergeInterface(sources: (InterfaceType | undefined)[], dest: InterfaceType) {
    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      this.hintOnInconsistentValueTypeField(sources, dest, destField);
      const subgraphFields = sources.map(t => t?.field(destField.name));
      this.mergeField(subgraphFields, destField);
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
      this.hintOnInconsistentUnionMember(sources, dest, type.name);
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
        this.reportMismatchHint(
          HINTS.INCONSISTENT_UNION_MEMBER,
          `Union type "${dest}" includes member type "${memberName}" in some but not all defining subgraphs: `,
          dest,
          sources,
          type => type.hasTypeMember(memberName) ? 'yes' : 'no',
          (_, subgraphs) => `"${memberName}" is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
        );
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
      this.errors.push(ERRORS.EMPTY_MERGED_ENUM_TYPE.err({
        message: `None of the values of enum type "${dest}" are defined consistently in all the subgraphs defining that type. As only values common to all subgraphs are merged, this would result in an empty type.`,
        nodes: sourceASTs(...sources),
      }));
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
    this.mergeAppliedDirectives(valueSources, value);

    const inaccessibleInSupergraph = this.mergedFederationDirectiveInSupergraph.get(inaccessibleSpec.inaccessibleDirectiveSpec.name);
    const isInaccessible = inaccessibleInSupergraph && value.hasAppliedDirective(inaccessibleInSupergraph);
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
        this.reportMismatchErrorWithSpecifics({
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
        this.reportMismatchHint(
          HINTS.INCONSISTENT_ENUM_VALUE_FOR_INPUT_ENUM,
          `Value "${value}" of enum type "${dest}" will not be part of the supergraph as it is not defined in all the subgraphs defining "${dest}": `,
          dest,
          sources,
          (type) => type.value(value.name) ? 'yes' : 'no',
          (_, subgraphs) => `"${value}" is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
        );
        // We remove the value after the generation of the hint/errors because `reportMismatchHint` will show the message for the subgraphs that are "like" the supergraph
        // first, and the message flows better if we say which subgraph defines the value first, so we want the value to still be present for the generation of the
        // message.
        value.remove();
      }
    } else if (position === 'Output') {
      this.hintOnInconsistentOutputEnumValue(sources, dest, value.name);
    }
  }

  private hintOnInconsistentOutputEnumValue(
    sources: (EnumType | undefined)[],
    dest: EnumType,
    valueName: string
  ) {
    for (const source of sources) {
      // As soon as we find a subgraph that has the type but not the member, we hint.
      if (source && !source.value(valueName)) {
        this.reportMismatchHint(
          HINTS.INCONSISTENT_ENUM_VALUE_FOR_OUTPUT_ENUM,
          `Value "${valueName}" of enum type "${dest}" has been added to the supergraph but is only defined in a subset of the subgraphs defining "${dest}": `,
          dest,
          sources,
          type => type.value(valueName) ? 'yes' : 'no',
          (_, subgraphs) => `"${valueName}" is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
        );
        return;
      }
    }
  }

  private mergeInput(sources: (InputObjectType | undefined)[], dest: InputObjectType) {
    const inaccessibleInSupergraph = this.mergedFederationDirectiveInSupergraph.get(inaccessibleSpec.inaccessibleDirectiveSpec.name);

    // Like for other inputs, we add all the fields found in any subgraphs initially as a simple mean to have a complete list of
    // field to iterate over, but we will remove those that are not in all subgraphs.
    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      const name = destField.name
      // We merge the details of the field first, even if we may remove it afterwards because 1) this ensure we always checks type
      // compatibility between definitions and 2) we actually want to see if the result is marked inaccessible or not and it makes
      // that easier.
      this.mergeInputField(sources.map(t => t?.field(name)), destField);
      const isInaccessible = inaccessibleInSupergraph && destField.hasAppliedDirective(inaccessibleInSupergraph);
      // Note that if the field is manually marked @inaccessible, we can always accept it to be inconsistent between subgraphs since
      // it won't be exposed in the API, and we don't hint about it because we're just doing what the user is explicitely asking.
      if (!isInaccessible && sources.some((source) => source && !source.field(name))) {
        // One of the subgraph has the input type but not that field. If the field is optional, we remove it for the supergraph
        // and issue a hint. But if it is required, we have to error out.
        const nonOptionalSources = sources.map((s, i) => s && s.field(name)?.isRequired() ? this.names[i] : undefined).filter((s) => !!s) as string[];
        if (nonOptionalSources.length > 0) {
          const nonOptionalSubgraphs = printSubgraphNames(nonOptionalSources);
          const missingSources = printSubgraphNames(sources.map((s, i) => s && !s.field(name) ? this.names[i] : undefined).filter((s) => !!s) as string[]);
          this.errors.push(ERRORS.REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH.err({
            message: `Input object field "${destField.coordinate}" is required in some subgraphs but does not appear in all subgraphs: it is required in ${nonOptionalSubgraphs} but does not appear in ${missingSources}`,
            nodes: sourceASTs(...sources.map((s) => s?.field(name))),
          }));
        } else {
          this.reportMismatchHint(
            HINTS.INCONSISTENT_INPUT_OBJECT_FIELD,
            `Input object field "${destField.name}" will not be added to "${dest}" in the supergraph as it does not appear in all subgraphs: `,
            destField,
            sources.map((s) => s ? s.field(name) : undefined),
            _ => 'yes',
            // Note that the first callback is for element that are "like the supergraph" and we've pass `destField` which we havne't yet removed.
            (_, subgraphs) => `it is defined in ${subgraphs}`,
            (_, subgraphs) => ` but not in ${subgraphs}`,
            undefined,
            true // Do include undefined sources, that's the point
          );
        }
        // Note that we remove the element after the hint/error because we access the parent in the hint message.
        destField.remove();
      }
    }

    // We could be left with an input type with no fields, and that's invalid in graphQL
    if (!dest.hasFields()) {
      this.errors.push(ERRORS.EMPTY_MERGED_INPUT_TYPE.err({
        message: `None of the fields of input object type "${dest}" are consistently defined in all the subgraphs defining that type. As only fields common to all subgraphs are merged, this would result in an empty type.`,
        nodes: sourceASTs(...sources),
      }));
    }
  }

  private mergeInputField(sources: (InputFieldDefinition | undefined)[], dest: InputFieldDefinition) {
    this.mergeDescription(sources, dest);
    this.mergeAppliedDirectives(sources, dest);
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
    this.mergeDescription(sources, dest);
    if (sources.some((s) => s && this.isMergedDirective(s))) {
      this.mergeExecutableDirectiveDefinition(sources, dest);
    }
  }

  // Note: as far as directive definition goes, we currently only merge directive having execution location, and only for
  // those locations. Any type system directive definition that propagates to the supergraph (graphQL built-ins and `@tag`)
  // is currently handled in an hard-coded way. This will change very soon however so keeping this code around to be
  // re-enabled by a future commit.
  private mergeTypeSystemDirectiveDefinition(sources: DirectiveDefinition[], dest: DirectiveDefinition) {
    this.addArgumentsShallow(sources, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = sources.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }

    const repeatable = sources[0].repeatable;
    const inconsistentRepeatable = sources.some(src => src.repeatable !== repeatable);
    const { consistentLocations, locations } = getLocationsFromDirectiveDefs(sources);

    dest.repeatable = repeatable;
    dest.addLocations(...locations);

   if (inconsistentRepeatable) {
     this.reportMismatchHint(
       HINTS.INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_REPEATABLE,
       `Type system directive "${dest}" is marked repeatable in the supergraph but it is inconsistently marked repeatable in subgraphs: `,
       dest,
       sources,
       directive => directive.repeatable ? 'yes' : 'no',
       // Note that the first callback is for element that are "like the supergraph". And the supergraph will be repeatable on inconsistencies.
       (_, subgraphs) => `it is repeatable in ${subgraphs}`,
       (_, subgraphs) => ` but not in ${subgraphs}`,
     );
   }
   if (!consistentLocations) {
     console.log('mismatch hint');
     this.reportMismatchHint(
       HINTS.INCONSISTENT_TYPE_SYSTEM_DIRECTIVE_LOCATIONS,
       `Type system directive "${dest}" has inconsistent locations across subgraphs `,
       dest,
       sources,
       directive => locationString(directive.locations as any),
       // Note that the first callback is for element that are "like the supergraph".
       (locs, subgraphs) => `and will use ${locs} (union of all subgraphs) in the supergraph, but has: ${subgraphs ? `${locs} in ${subgraphs} and ` : ''}`,
       (locs, subgraphs) => `${locs} in ${subgraphs}`,
     );
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
        this.reportMismatchHint(
          HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_PRESENCE,
          `Executable directive "${dest}" will not be part of the supergraph as it does not appear in all subgraphs: `,
          dest,
          sources,
          _ => 'yes',
          // Note that the first callback is for element that are "like the supergraph" and we've pass `dest`.
          (_, subgraphs) => `it is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
          undefined,
          true
        );
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
          this.reportMismatchHint(
            HINTS.NO_EXECUTABLE_DIRECTIVE_LOCATIONS_INTERSECTION,
            `Executable directive "${dest}" has no location that is common to all subgraphs: `,
            dest,
            sources,
            directive => locationString(this.extractExecutableLocations(directive)),
            // Note that the first callback is for element that are "like the supergraph" and only the subgraph will have no locations (the
            // source that do not have the directive are not included).
            () => `it will not appear in the supergraph as there no intersection between `,
            (locs, subgraphs) => `${locs} in ${subgraphs}`,
          );
          return;
        }
      }
    }
    dest.repeatable = repeatable!;
    dest.addLocations(...locations!);

    if (inconsistentRepeatable) {
      this.reportMismatchHint(
        HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_REPEATABLE,
        `Executable directive "${dest}" will not be marked repeatable in the supergraph as it is inconsistently marked repeatable in subgraphs: `,
        dest,
        sources,
        directive => directive.repeatable ? 'yes' : 'no',
        // Note that the first callback is for element that are "like the supergraph". And the supergraph will _not_ be repeatable on inconsistencies.
        (_, subgraphs) => `it is not repeatable in ${subgraphs}`,
        (_, subgraphs) => ` but is repeatable in ${subgraphs}`,
      );
    }
    if (inconsistentLocations) {
      this.reportMismatchHint(
        HINTS.INCONSISTENT_EXECUTABLE_DIRECTIVE_LOCATIONS,
        `Executable directive "${dest}" has inconsistent locations across subgraphs `,
        dest,
        sources,
        directive => locationString(this.extractExecutableLocations(directive)),
        // Note that the first callback is for element that are "like the supergraph".
        (locs, subgraphs) => `and will use ${locs} (intersection of all subgraphs) in the supergraph, but has: ${subgraphs ? `${locs} in ${subgraphs} and ` : ''}`,
        (locs, subgraphs) => `${locs} in ${subgraphs}`,
      );
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
    return source.locations.filter(loc => executableDirectiveLocations.includes(loc));
  }

  private mergeAppliedDirectives(sources: (SchemaElement<any, any> | undefined)[], dest: SchemaElement<any, any>) {
    const names = this.gatherAppliedDirectiveNames(sources);
    for (const name of names) {
      this.mergeAppliedDirective(name, sources, dest);
    }
  }

  private gatherAppliedDirectiveNames(sources: (SchemaElement<any, any> | undefined)[]): Set<string> {
    const names = new Set<string>();
    for (const source of sources) {
      if (source) {
        for (const directive of source.appliedDirectives) {
          if (this.isMergedDirective(directive) || this.exposedDirectives().includes(directive.name)) {
            names.add(directive.name);
          }
        }
      }
    }
    return names;
  }

  private mergeAppliedDirective(name: string, sources: (SchemaElement<any, any> | undefined)[], dest: SchemaElement<any, any>) {
    // TODO: we currently only merge together applications that have the exact same arguments.
    // There is however 2 cases where we could be more subtle:
    //  1) default values: if a directive has an argument with a default value, and one subgraph pass a value
    //     but the other don't (relying on the default value), should we "merge" those together, at least
    //     when the value passed and the default value are the same? Or even when they aren't (say a
    //     a subgraph mark a field `@deprecated` and the other mark it `@deprecated(reason: "Something something")`;
    //     Do we really want composition to fail (because `@deprecated` is non-repeatable and the arguments
    //     are deemed incompatible?).
    //  2) when an argument is an input type, should we allow some value merging between subgraphs?
    //     After all, we're going to merge the subgraph input type definitions, so it would be consistent
    //     to merge values as well. For instance, say some input type has fields 'a, b' in one subgraph
    //     and field 'a, c' in another, and that type is used for a directive definition argument. The
    //     result type will have fields 'a, b and c', but currently we wouldn't do any merging of directive
    //     applications with the same value for 'a', even though it might be intended to merge.
    // Of course, actually merging the rules above can be a tad tricky in general for repeatable directives.
    // At the same time, if we don't merge those, this might get annoying, especially for non repeatable
    // directives.

    // TODO: even if we stick to pure equality checks, we should have special handling for non-repeatable
    // directive and fail right away if we get incompatible applications. This will give better error
    // messages than if we wait for post-merging validation.

    let perSource: Directive[][] = [];
    for (const source of sources) {
      if (!source) {
        continue;
      }
      const directives: Directive[] = source.appliedDirectivesOf(name);
      if (directives.length) {
        perSource.push(directives);
      }
    }

    while (perSource.length > 0) {
      const directive = this.pickNextDirective(perSource);
      if (!directive.definition?.repeatable && dest.hasAppliedDirective(directive.name)) {
        this.reportMismatchError(
          ERRORS.NON_REPEATABLE_DIRECTIVE_ARGUMENTS_MISMATCH,
          `Non-repeatable directive @${directive.name} is applied to "${(dest as any)['coordinate'] ?? dest}" in multiple subgraphs but with incompatible arguments: it uses `,
          dest,
          sources,
          (elt) => {
            const args = elt.appliedDirectivesOf(directive.name).pop()?.arguments();
            return args === undefined
              ? undefined
              : Object.values(args).length === 0 ? 'no arguments' : (`arguments ${valueToString(args)}`);
          }
        );
        // We only want to report the error once, so we remove any remaining instance of
        // the directive
        perSource = perSource
          .map((ds) => ds.filter((d) => d.name !== directive.name))
          .filter((ds) => ds.length > 0) ;
      } else {
        dest.applyDirective(directive.name, directive.arguments(false));
        perSource = this.removeDirective(directive, perSource);
      }
    }
  }

  private pickNextDirective(directives: Directive[][]): Directive {
    return directives[0][0];
  }

  private removeDirective(toRemove: Directive, directives: Directive[][]): Directive[][] {
    // TODO: we use valueEquals on the whole argument object rather than on individual values. This
    // work just fine given how valueEquals is defined today, but we might want to clean this nonetheless.
    return directives
      .map(ds => ds.filter(d => !valueEquals(toRemove.arguments(), d.arguments()))).
      filter(ds => ds.length);
  }

  private mergeSchemaDefinition(sources: SchemaDefinition[], dest: SchemaDefinition) {
    this.mergeDescription(sources, dest);
    this.mergeAppliedDirectives(sources, dest);
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
            this.errors.push(ERRORS.INTERFACE_FIELD_NO_IMPLEM.err({
              message: `Interface field "${itfField.coordinate}" is declared in ${printSubgraphNames(subgraphsWithTheField)} but type "${type}", `
                + `which implements "${itf}" only in ${printSubgraphNames(subgraphsWithTypeImplementingItf)} does not have field "${itfField.name}".`,
              nodes: sourceASTs(
                ...subgraphsWithTheField.map(s => this.subgraphByName(s).typeOfKind<InterfaceType>(itf.name, 'InterfaceType')?.field(itfField.name)),
                ...subgraphsWithTypeImplementingItf.map(s => this.subgraphByName(s).type(type.name))
              )
            }));
            continue;
          }

          // TODO: should we validate more? Can we have some invalid implementation of a field post-merging?
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

  /**
   * Get rid of leading '@' if present and return the list of directives passed to the Merger object
   */
  private exposedDirectives() {
    return (this.options.exposeDirectives ?? []).map(directive => directive[0] === '@' ? directive.slice(1) : directive);
  }
}
