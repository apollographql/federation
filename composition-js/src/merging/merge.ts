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
  SubtypingRule,
  ListType,
  NonNullType,
  Type,
  NullableType,
  NamedSchemaElementWithType,
  valueEquals,
  valueToString,
  InputFieldDefinition,
  allSchemaRootKinds,
  isFederationType,
  Directive,
  isFederationField,
  SchemaRootKind,
  CompositeType,
  Subgraphs,
  federationBuiltIns,
  CORE_VERSIONS,
  JOIN_VERSIONS,
  TAG_VERSIONS,
  NamedSchemaElement,
  executableDirectiveLocations,
  errorCauses,
  tagDirectiveName,
  isObjectType,
  SubgraphASTNode,
  addSubgraphToASTNode,
  firstOf,
  Extension,
  DEFAULT_SUBTYPING_RULES,
  providesDirectiveName,
  requiresDirectiveName,
  ExternalTester,
  isInterfaceType,
  sourceASTs,
  ErrorCodeDefinition,
  ERRORS,
  joinStrings,
} from "@apollo/federation-internals";
import { ASTNode, GraphQLError, DirectiveLocation } from "graphql";
import {
  CompositionHint,
  HintID,
  hintInconsistentArgumentType,
  hintInconsistentDefaultValue,
  hintInconsistentEntity,
  hintInconsistentFieldType,
  hintInconsistentObjectValueTypeField,
  hintInconsistentInterfaceValueTypeField,
  hintInconsistentInputObjectField,
  hintInconsistentUnionMember,
  hintInconsistentEnumValue,
  hintInconsistentTypeSystemDirectiveRepeatable,
  hintInconsistentTypeSystemDirectiveLocations,
  hintInconsistentExecutionDirectivePresence,
  hintNoExecutionDirectiveLocationsIntersection,
  hintInconsistentExecutionDirectiveRepeatable,
  hintInconsistentExecutionDirectiveLocations,
  hintInconsistentArgumentPresence,
  hintInconsistentDescription,
} from "../hints";

const coreSpec = CORE_VERSIONS.latest();
const joinSpec = JOIN_VERSIONS.latest();
const tagSpec = TAG_VERSIONS.latest();

// When displaying a list of something in a human readable form, after what size (in
// number of characters) we start displaying only a subset of the list.
const MAX_HUMAN_READABLE_LIST_LENGTH = 100;

const MERGED_TYPE_SYSTEM_DIRECTIVES = ['inaccessible', 'deprecated', 'specifiedBy', 'tag'];

export type MergeResult = MergeSuccess | MergeFailure;

// TODO: move somewhere else.
export type CompositionOptions = {
  allowedFieldTypeMergingSubtypingRules?: SubtypingRule[]
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
  return new Merger(subgraphs, { ...defaultCompositionOptions, ...options }).merge();
}

function printHumanReadableList(names: string[], prefixSingle?: string, prefixPlural?: string): string {
  assert(names.length > 0, 'Should not have been called with no names');
  if (names.length == 1) {
    return prefixSingle ? prefixSingle + ' ' + names[0] : names[0];
  }
  let toDisplay = names;
  let totalLength = toDisplay.reduce((count, name) => count + name.length, 0);
  // In case the name we list have absurdly long names, let's ensure we at least display one.
  while (totalLength > MAX_HUMAN_READABLE_LIST_LENGTH && toDisplay.length > 1) {
    toDisplay = toDisplay.slice(0, toDisplay.length - 1);
    totalLength = toDisplay.reduce((count, name) => count + name.length, 0);
  }
  const prefix = prefixPlural
    ? prefixPlural + ' '
    : (prefixSingle ? prefixSingle + ' ' : '');
  if (toDisplay.length === names.length) {
    return prefix + joinStrings(toDisplay);
  } else {
    return prefix + toDisplay.join(', ') + ', ...';
  }
}

function printSubgraphNames(names: string[]): string {
  return printHumanReadableList(names.map(n => `"${n}"`), 'subgraph', 'subgraphs');
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

function isMergedType(type: NamedType): boolean {
  return !isFederationType(type) && !type.isIntrospectionType();
}

function isMergedField(field: InputFieldDefinition | FieldDefinition<CompositeType>): boolean {
  return field.kind !== 'FieldDefinition' || !isFederationField(field);
}

function isMergedDirective(definition: DirectiveDefinition | Directive): boolean {
  // Currently, we only merge "executable" directives, and a small subset of well-known type-system directives.
  // Note that some user directive definitions may have both executable and non-executable locations.
  // In that case this method will return the definition, but the merge code filters the non-executable
  // locations.
  if (MERGED_TYPE_SYSTEM_DIRECTIVES.includes(definition.name)) {
    return true;
  }
  // If it's a directive application, then we skip it (even if the definition itself allows executable locations,
  // this particular application is an type-system element and we don't want to merge it).
  if (definition instanceof Directive) {
    return false;
  }
  return definition.locations.some(loc => executableDirectiveLocations.includes(loc));
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

function typeKindToString(t: NamedType): string {
  return t.kind.replace("Type", " Type");
}

function hasTagUsage(subgraph: Schema): boolean {
  const directive = subgraph.directive(tagDirectiveName);
  return !!directive && directive.applications().length > 0;
}

function locationString(locations: DirectiveLocation[]): string {
  if (locations.length === 0) {
    return "";
  }
  return (locations.length === 1 ? 'location ' : 'locations ') + '"' + locations.join(', ') + '"';
}

class Merger {
  readonly names: readonly string[];
  readonly subgraphsSchema: readonly Schema[];
  readonly errors: GraphQLError[] = [];
  readonly hints: CompositionHint[] = [];
  readonly merged: Schema = new Schema();
  readonly subgraphNamesToJoinSpecName: Map<string, string>;
  readonly externalTesters: readonly ExternalTester[];

  constructor(readonly subgraphs: Subgraphs, readonly options: CompositionOptions) {
    this.names = subgraphs.names();
    this.subgraphsSchema = subgraphs.values().map(subgraph => subgraph.schema);
    this.subgraphNamesToJoinSpecName = this.prepareSupergraph();
    this.externalTesters = this.subgraphsSchema.map(schema => new ExternalTester(schema));
  }

  private prepareSupergraph(): Map<string, string> {
    // TODO: we will soon need to look for name conflicts for @core and @join with potentially user-defined directives and
    // pass a `as` to the methods below if necessary. However, as we currently don't propagate any subgraph directives to
    // the supergraph outside of a few well-known ones, we don't bother yet.
    coreSpec.addToSchema(this.merged);
    coreSpec.applyFeatureToSchema(this.merged, joinSpec, undefined, 'EXECUTION');

    if (this.subgraphsSchema.some(hasTagUsage)) {
      coreSpec.applyFeatureToSchema(this.merged, tagSpec);
    }

    return joinSpec.populateGraphEnum(this.merged, this.subgraphs);
  }

  private joinSpecName(subgraphIndex: number): string {
    return this.subgraphNamesToJoinSpecName.get(this.names[subgraphIndex])!;
  }

  merge(): MergeResult {
    // We first create empty objects for all the types and directives definitions that will exists in the
    // supergraph. This allow to be able to reference those from that point on.
    this.addTypesShallow();
    this.addDirectivesShallow();

    // Then, for object and interface types, we merge the 'implements' relationship, and we merge the unions.
    // We do this first because being able to know if a type is a subtype of another one (which relies on those
    // 2 things) is used when merging fields.
    for (const objectType of this.merged.types<ObjectType>('ObjectType')) {
      this.mergeImplements(this.subgraphsTypes(objectType), objectType);
    }
    for (const interfaceType of this.merged.types<InterfaceType>('InterfaceType')) {
      this.mergeImplements(this.subgraphsTypes(interfaceType), interfaceType);
    }
    for (const unionType of this.merged.types<UnionType>('UnionType')) {
      this.mergeType(this.subgraphsTypes(unionType), unionType);
    }

    // We merge the roots first as it only depend on the type existing, not being fully merged, and when
    // we merge types next, we actually rely on this having been called to detect "root types"
    // (in order to skip the _entities and _service fields on that particular type, and to avoid
    // calling root type a "value type" when hinting).
    this.mergeSchemaDefinition(this.subgraphsSchema.map(s => s.schemaDefinition), this.merged.schemaDefinition);

    for (const type of this.merged.types()) {
      // We've already merged unions above
      if (type.kind === 'UnionType' || joinSpec.isSpecType(type)) {
        continue;
      }
      this.mergeType(this.subgraphsTypes(type), type);
    }

    for (const definition of this.merged.directives()) {
      // we should skip the supergraph specific directives, that is the @core and @join directives.
      if (coreSpec.isSpecDirective(definition) || joinSpec.isSpecDirective(definition)) {
        continue;
      }
      this.mergeDirectiveDefinition(this.subgraphsSchema.map(s => s.directive(definition.name)), definition);
    }

    // Let's not leave merged directives that aren't used.
    for (const federationDirective of MERGED_TYPE_SYSTEM_DIRECTIVES) {
      const directive = this.merged.directive(federationDirective);
      if (directive && !directive.isBuiltIn && directive.applications().length === 0) {
        directive.remove();
      }
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
        } catch (e) {
          const causes = errorCauses(e);
          if (causes) {
            this.errors.push(...causes);
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
        if (!isMergedDirective(directive)) {
          continue;
        }
        if (!this.merged.directive(directive.name)) {
          this.merged.addDirectiveDefinition(new DirectiveDefinition(directive.name));
        }
      }
    }
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

  private reportMismatchError<TMismatched extends SchemaElement<any, any>>(
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

  private reportMismatchErrorWithSpecifics<TMismatched extends SchemaElement<any, any>>(
    code: ErrorCodeDefinition,
    message: string,
    mismatchedElement: TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAccessor: (elt: TMismatched | undefined, isSupergraph: boolean) => string | undefined,
    supergraphElementPrinter: (elt: string, subgraphs: string | undefined) => string,
    otherElementsPrinter: (elt: string | undefined, subgraphs: string) => string,
    ignorePredicate?: (elt: TMismatched | undefined) => boolean,
    includeMissingSources: boolean = false
  ) {
    this.reportMismatch(
      mismatchedElement,
      subgraphElements,
      mismatchAccessor,
      supergraphElementPrinter,
      otherElementsPrinter,
      (distribution, nodes) => {
        this.errors.push(code.err({
          message: message + distribution[0] + joinStrings(distribution.slice(1), ' and '),
          nodes
        }));
      },
      ignorePredicate,
      includeMissingSources
    );
  }

  private reportMismatchHint<TMismatched extends SchemaElement<any, any>>(
    hintId: HintID,
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
          supergraphElement instanceof NamedSchemaElement ? supergraphElement.coordinate : '<schema>',
          astNodes
        ));
      },
      ignorePredicate,
      includeMissingSources
    );
  }

  private reportMismatch<TMismatched extends SchemaElement<any, any>>(
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
          hintInconsistentDescription,
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
      const sourceSchema = this.subgraphsSchema[idx];
      const keys = source.appliedDirectivesOf(federationBuiltIns.keyDirective(sourceSchema));
      const name = this.joinSpecName(idx);
      if (!keys.length) {
        dest.applyDirective(joinTypeDirective, { graph: name });
      } else {
        for (const key of keys) {
          const extension = key.ofExtension() || source.hasAppliedDirective(federationBuiltIns.extendsDirective(sourceSchema)) ? true : undefined;
          dest.applyDirective(joinTypeDirective, { graph: name, key: key.arguments().fields, extension });
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
        this.mergeField(subgraphFields, destField);
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
        hintInconsistentEntity,
        `Type "${dest}" is declared as an entity (has a @key applied) in only some subgraphs: `,
        dest,
        sources,
        // All we use the string of the next line for is to categorize source with a @key of the others.
        type => type.hasAppliedDirective('key') ? 'yes' : 'no',
        // Note that the first callback is for element that are "like the supergraph". As the supergraph has no @key ...
        (_, subgraphs) => `it has no key in ${subgraphs}`,
        (_, subgraphs) => ` but has one in ${subgraphs}`,
      );
    }
    return sourceAsEntity.length > 0;
  }

  // Assume it is called on a field of a value type
  private hintOnInconsistentValueTypeField(
    sources: (ObjectType | InterfaceType | InputObjectType | undefined)[],
    dest: ObjectType | InterfaceType | InputObjectType,
    field: FieldDefinition<any> | InputFieldDefinition
  ) {
    let hintId: HintID;
    let typeDescription: string;
    switch (dest.kind) {
      case 'ObjectType':
        hintId = hintInconsistentObjectValueTypeField;
        typeDescription = 'non-entity object'
        break;
      case 'InterfaceType':
        hintId = hintInconsistentInterfaceValueTypeField;
        typeDescription = 'interface'
        break;
      case 'InputObjectType':
        hintId = hintInconsistentInputObjectField;
        typeDescription = 'input object'
        break;
    }
    for (const source of sources) {
      // As soon as we find a subgraph that has the type but not the field, we hint.
      if (source && !source.field(field.name)) {
        this.reportMismatchHint(
          hintId,
          // Note that at the time this code run, we haven't run validation yet and so we don't truly know that the field is always resolvable, but
          // we can anticipate it since hints will not surface to users if there is a validation error anyway.
          `Field "${field.coordinate}" of ${typeDescription} type "${dest}" is not defined in all the subgraphs defining "${dest}" (but can always be resolved from these subgraphs): `,
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
    return this.externalTesters[sourceIdx].isExternal(field);
  }

  private withoutExternal(sources: (FieldDefinition<any> | undefined)[]): (FieldDefinition<any> | undefined)[] {
    return sources.map((s, i) => s !== undefined && this.isExternal(i, s) ? undefined : s);
  }

  private hasExternal(sources: (FieldDefinition<any> | undefined)[]): boolean {
    return sources.some((s, i) => s !== undefined && this.isExternal(i, s));
  }

  private mergeField(sources: (FieldDefinition<any> | undefined)[], dest: FieldDefinition<any>) {
    if (sources.every((s, i) => s === undefined || this.isExternal(i, s))) {
      const definingSubgraphs = sources.map((source, i) => source ? this.names[i] : undefined).filter(s => s !== undefined) as string[];
      const nodes = sources.map(source => source?.sourceAST).filter(s => s !== undefined) as ASTNode[];
      this.errors.push(ERRORS.EXTERNAL_MISSING_ON_BASE.err({
        message: `Field "${dest.coordinate}" is marked @external on all the subgraphs in which it is listed (${printSubgraphNames(definingSubgraphs)}).`,
        nodes
      }));
      return;
    }

    const withoutExternal = this.withoutExternal(sources);
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

    this.addJoinField(sources, dest, allTypesEqual);
  }

  private validateExternalFields(sources: (FieldDefinition<any> | undefined)[], dest: FieldDefinition<any>, allTypesEqual: boolean) {
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
        `Field "${dest.coordinate}" has incompatible types across subgraphs (where marked @external): it has `,
        dest,
        sources,
        field => `type "${field.type}"`
      );
    }
    for (const arg of invalidArgsPresence) {
      const destArg = dest.argument(arg)!;
      this.reportMismatchErrorWithSpecifics(
        ERRORS.EXTERNAL_ARGUMENT_MISSING,
        `Field "${dest.coordinate}" is missing argument "${destArg.coordinate}" in some subgraphs where it is marked @external: `,
        destArg,
        sources.map(s => s?.argument(destArg.name)),
        arg => arg ? `argument "${arg.coordinate}"` : undefined,
        (elt, subgraphs) => `${elt} is declared in ${subgraphs}`,
        (_, subgraphs) => ` but not in ${subgraphs} (where "${dest.coordinate}" is @external).`,
        undefined,
        true
      );
    }
    for (const arg of invalidArgsTypes) {
      const destArg = dest.argument(arg)!;
      this.reportMismatchError(
        ERRORS.EXTERNAL_ARGUMENT_TYPE_MISMATCH,
        `Argument "${destArg.coordinate}" has incompatible types across subgraphs (where "${dest.coordinate}" is marked @external): it has `,
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

  private needsJoinField<T extends FieldDefinition<ObjectType | InterfaceType> | InputFieldDefinition>(
    sources: (T | undefined)[],
    parentName: string,
    allTypesEqual: boolean
  ): boolean {
    // If not all the types are equal, then we need to put a join__field to preserve the proper type information.
    if (!allTypesEqual) {
      return true;
    }

    // We can avoid the join__field if:
    //   1) the field exists in all sources having the field parent type,
    //   2) none of the field instance has a @requires or @provides.
    //   3) none of the field is @external.
    for (const [idx, source] of sources.entries()) {
      if (source) {
        if (this.isExternal(idx, source)
          || source.hasAppliedDirective(providesDirectiveName)
          || source.hasAppliedDirective(requiresDirectiveName)
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
    sources: (T | undefined)[],
    dest: T,
    allTypesEqual: boolean
  ) {
    if (!this.needsJoinField(sources, dest.parent.name, allTypesEqual)) {
      return;
    }
    const joinFieldDirective = joinSpec.fieldDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      if (!source) {
        continue;
      }

      const external = this.isExternal(idx, source);
      const name = this.joinSpecName(idx);
      dest.applyDirective(joinFieldDirective, {
        graph: name,
        requires: this.getFieldSet(source, federationBuiltIns.requiresDirective(this.subgraphsSchema[idx])),
        provides: this.getFieldSet(source, federationBuiltIns.providesDirective(this.subgraphsSchema[idx])),
        type: allTypesEqual ? undefined : source.type?.toString(),
        external: external ? true : undefined,
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
    isContravariant: boolean = false
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
        if (isContravariant) {
          destType = sourceType;
        }
      } else if (this.isStrictSubtype(sourceType, destType)) {
        hasSubtypes = true;
        if (!isContravariant) {
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
    const elementKind: string = isArgument ? 'Argument' : 'Field';


    if (hasIncompatible) {
      this.reportMismatchError(
        isArgument ? ERRORS.ARGUMENT_TYPE_MISMATCH : ERRORS.FIELD_TYPE_MISMATCH,
        `${elementKind} "${dest.coordinate}" has incompatible types across subgraphs: it has `,
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
        isArgument ? hintInconsistentArgumentType : hintInconsistentFieldType,
        `${elementKind} "${dest.coordinate}" has mismatched, but compatible, types across subgraphs: `,
        dest,
        sources,
        field => field.type!.toString(),
        (elt, subgraphs) => `will use type "${elt}" (from ${subgraphs}) in supergraph but "${dest.coordinate}" has `,
        (elt, subgraphs) => `${isContravariant ? 'supertype' : 'subtype'} "${elt}" in ${subgraphs}`
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
    for (const source of sources) {
      if (!source) {
        continue;
      }
      for (const argument of source.arguments()) {
        if (!dest.argument(argument.name)) {
          dest.addArgument(argument.name);
        }
      }
    }
  }

  private mergeArgument(sources: (ArgumentDefinition<any> | undefined)[], dest: ArgumentDefinition<any>, useIntersection: boolean = false) {
    if (useIntersection) {
      for (const source of sources) {
        if (!source) {
          this.reportMismatchHint(
            hintInconsistentArgumentPresence,
            `Argument "${dest.coordinate}" will not be added to "${dest.parent}" in the supergraph as it does not appear in all subgraphs: `,
            dest,
            sources,
            _ => 'yes',
            // Note that the first callback is for element that are "like the supergraph" and we've pass `dest`.
            (_, subgraphs) => `it is defined in ${subgraphs}`,
            (_, subgraphs) => ` but not in ${subgraphs}`,
            undefined,
            true // Do include undefined sources, that's the point
          );
          // Note that we remove the element after the hint because we access the parent in the hint message.
          dest.remove();
          return;
        }
      }
    }
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
        hintInconsistentDefaultValue,
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
    this.mergeDescription(sources, dest);
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
          hintInconsistentUnionMember,
          // Note that at the time this code run, we haven't run validation yet and so we don't truly know that the field is always resolvable, but
          // we can anticipate it since hints will not surface to users if there is a validation error anyway.
          `Member type "${memberName}" in union type "${dest}" is only defined in a subset of subgraphs defining "${dest}" (but can always be resolved from these subgraphs): `,
          dest,
          sources,
          type => type.hasTypeMember(memberName) ? 'yes' : 'no',
          (_, subgraphs) => `"${memberName}" is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
        );
      }
    }
  }

  private mergeEnum(sources: (EnumType | undefined)[], dest: EnumType) {
    // TODO: option + hint for when all definitions are not equal.
    // TODO: hint for inaccessible values not everywhere (see generalized composition doc)?
    for (const source of sources) {
      if (!source) {
        continue;
      }
      for (const value of source.values) {
        if (!dest.value(value.name)) {
          dest.addValue(value.name);
        }
      }
    }
    for (const value of dest.values) {
      const valueSources = sources.map(s => s?.value(value.name));
      this.mergeDescription(valueSources, value);
      this.mergeAppliedDirectives(valueSources, value);
      this.hintOnInconsistentEnumValue(sources, dest, value.name);
    }
  }

  private hintOnInconsistentEnumValue(
    sources: (EnumType | undefined)[],
    dest: EnumType,
    valueName: string
  ) {
    for (const source of sources) {
      // As soon as we find a subgraph that has the type but not the member, we hint.
      if (source && !source.value(valueName)) {
        this.reportMismatchHint(
          hintInconsistentEnumValue,
          // Note that at the time this code run, we haven't run validation yet and so we don't truly know that the field is always resolvable, but
          // we can anticipate it since hints will not surface to users if there is a validation error anyway.
          `Value "${valueName}" of enum type "${dest}" is only defined in a subset of the subgraphs defining "${dest}" (but can always be resolved from these subgraphs): `,
          dest,
          sources,
          type => type.value(valueName) ? 'yes' : 'no',
          (_, subgraphs) => `"${valueName}" is defined in ${subgraphs}`,
          (_, subgraphs) => ` but not in ${subgraphs}`,
        );
      }
    }
  }

  private mergeInput(sources: (InputObjectType | undefined)[], dest: InputObjectType) {
    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      this.hintOnInconsistentValueTypeField(sources, dest, destField);
      const subgraphFields = sources.map(t => t?.field(destField.name));
      this.mergeInputField(subgraphFields, destField);
    }
  }

  private mergeInputField(sources: (InputFieldDefinition | undefined)[], dest: InputFieldDefinition) {
    this.mergeDescription(sources, dest);
    this.mergeAppliedDirectives(sources, dest);
    const allTypesEqual = this.mergeTypeReference(sources, dest, true);
    this.addJoinField(sources, dest, allTypesEqual);
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
    if (MERGED_TYPE_SYSTEM_DIRECTIVES.includes(dest.name)) {
      this.mergeTypeSystemDirectiveDefinition(sources, dest);
    } else {
      this.mergeExecutionDirectiveDefinition(sources, dest);
    }
  }

  private mergeTypeSystemDirectiveDefinition(sources: (DirectiveDefinition | undefined)[], dest: DirectiveDefinition) {
    this.addArgumentsShallow(sources, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = sources.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }

    let repeatable: boolean | undefined = undefined;
    let inconsistentRepeatable = false;
    let locations: DirectiveLocation[] | undefined = undefined;
    let inconsistentLocations = false;
    for (const source of sources) {
      if (!source) {
        continue;
      }
      if (repeatable === undefined) {
        repeatable = source.repeatable;
      } else if (repeatable !== source.repeatable) {
        inconsistentRepeatable = true;
      }

      const sourceLocations = this.extractLocations(source);
      if (!locations) {
        locations = sourceLocations;
      } else {
        if (!arrayEquals(locations, sourceLocations)) {
          inconsistentLocations = true;
        }
        // This create duplicates, but `addLocations` below eliminate them.
        sourceLocations.forEach(loc => {
          if (!locations!.includes(loc)) {
            locations!.push(loc);
          }
        });
      }
    }
    dest.repeatable = repeatable!;
    dest.addLocations(...locations!);

    if (inconsistentRepeatable) {
      this.reportMismatchHint(
        hintInconsistentTypeSystemDirectiveRepeatable,
        `Type system directive "${dest}" is marked repeatable in the supergraph but it is inconsistently marked repeatable in subgraphs: `,
        dest,
        sources,
        directive => directive.repeatable ? 'yes' : 'no',
        // Note that the first callback is for element that are "like the supergraph". And the supergraph will be repeatable on inconsistencies.
        (_, subgraphs) => `it is repeatable in ${subgraphs}`,
        (_, subgraphs) => ` but not in ${subgraphs}`,
      );
    }
    if (inconsistentLocations) {
      this.reportMismatchHint(
        hintInconsistentTypeSystemDirectiveLocations,
        `Type system directive "${dest}" has inconsistent locations across subgraphs `,
        dest,
        sources,
        directive => locationString(this.extractLocations(directive)),
        // Note that the first callback is for element that are "like the supergraph".
        (locs, subgraphs) => `and will use ${locs} (union of all subgraphs) in the supergraph, but has: ${subgraphs ? `${locs} in ${subgraphs} and ` : ''}`,
        (locs, subgraphs) => `${locs} in ${subgraphs}`,
      );
    }
  }

  private mergeExecutionDirectiveDefinition(sources: (DirectiveDefinition | undefined)[], dest: DirectiveDefinition) {
    let repeatable: boolean | undefined = undefined;
    let inconsistentRepeatable = false;
    let locations: DirectiveLocation[] | undefined = undefined;
    let inconsistentLocations = false;
    for (const source of sources) {
      if (!source) {
        // An execution directive could appear in any place of a query and thus get to any subgraph, so we cannot keep an
        // execution directive unless it is in all subgraphs. We use an 'intersection' strategy.
        const usages = dest.remove();
        assert(usages.length === 0, () => `Found usages of execution directive ${dest}: ${usages}`);
        this.reportMismatchHint(
          hintInconsistentExecutionDirectivePresence,
          `Execution directive "${dest}" will not be part of the supergraph as it does not appear in all subgraphs: `,
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

      const sourceLocations = this.extractLocations(source);
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
          assert(usages.length === 0, () => `Found usages of execution directive ${dest}: ${usages}`);
          this.reportMismatchHint(
            hintNoExecutionDirectiveLocationsIntersection,
            `Execution directive "${dest}" has no location that is common to all subgraphs: `,
            dest,
            sources,
            directive => locationString(this.extractLocations(directive)),
            // Note that the first callback is for element that are "like the supergraph" and only the subgraph will have no locations (the
            // source that do not have the directive are not included).
            () => `it will not appear in the subgraph as there no intersection between `,
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
        hintInconsistentExecutionDirectiveRepeatable,
        `Execution directive "${dest}" will not be marked repeatable in the supergraph as it is inconsistently marked repeatable in subgraphs: `,
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
        hintInconsistentExecutionDirectiveLocations,
        `Execution directive "${dest}" has inconsistent locations across subgraphs `,
        dest,
        sources,
        directive => locationString(this.extractLocations(directive)),
        // Note that the first callback is for element that are "like the supergraph".
        (locs, subgraphs) => `and will use ${locs} (intersection of all subgraphs) in the supergraph, but has: ${subgraphs ? `${locs} in ${subgraphs} and ` : ''}`,
        (locs, subgraphs) => `${locs} in ${subgraphs}`,
      );
    }

    // Doing args last, mostly so we don't bother adding if the directive doesn't make it in.
    this.addArgumentsShallow(sources, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = sources.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg, true);
    }
  }

  private extractLocations(source: DirectiveDefinition): DirectiveLocation[] {
    // We sort the locations so that the return list of locations essentially act like a set.
    return this.filterExecutableDirectiveLocations(source).concat().sort();
  }

  private filterExecutableDirectiveLocations(source: DirectiveDefinition): readonly DirectiveLocation[] {
    if (MERGED_TYPE_SYSTEM_DIRECTIVES.includes(source.name)) {
      return source.locations;
    }
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
          if (isMergedDirective(directive)) {
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
      // TODO: should we bother copying the args?
      dest.applyDirective(directive.name, directive.arguments(false));
      perSource = this.removeDirective(directive, perSource);
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
}
