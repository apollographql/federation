import {
  ArgumentDefinition,
  assert,
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
  SUBTYPING_RULES,
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
  isExternal,
  Subgraph,
  defaultRootName,
  CORE_VERSIONS,
  JOIN_VERSIONS,
} from "@apollo/core";
import { ASTNode, GraphQLError } from "graphql";
import { CompositionHint } from "../hints";

const coreSpec = CORE_VERSIONS.latest()!;
const joinSpec = JOIN_VERSIONS.latest()!;

// When displaying a list of something in a human readable form, after what size (in 
// number of characters) we start displaying only a subset of the list.
const MAX_HUMAN_READABLE_LIST_LENGTH = 100;

const MERGED_FEDERATION_DIRECTIVES = ['inaccessible'];

export type MergeResult = MergeSuccess | MergeFailure;

// TODO: move somewhere else.
export type CompositionOptions = {
  allowedFieldTypeMergingSubtypingRules?: SubtypingRule[]
}

// TODO: we currently cannot really allow the "direct subtyping" rule due to limitation
// of the supergraph SDL. Namely, it has no information allowing to figure out how a
// particular subgraph field type differs from the supergraph. Which in practice,
// means that later on, the query planner will have an imprecise view of the field type
// for that subgraph: it will think the field has the same type in this subgraph than
// in the supergraph, even if that is not true. This is ok in some sub-cases, for
// instance if the field has subtype `!String` in the subgraph but `String` in the
// supergraph, then querying the subgraph "has if the field may return null" even though
// it cannot in practice is harmless. But suppose the now that we allow direct subtypings
// when merging types: we could have a case where a field has type `B` in a subgraph
// and `A` in the supergraph, where `B` implements `A` _in the supergraph_. However,
// `A` may not be known of that particular subgraph. So if we query planner "thinks"
// that the field is of type `A` in the subgraph, it may generate broken queries.
// So we should improve the supergraph SDL/join-spec to indicate when a field has 
// a different type in a subgraph than in the supergraph, what that type is in the
// subgraph.
const defaultCompositionOptions: CompositionOptions = {
  allowedFieldTypeMergingSubtypingRules: SUBTYPING_RULES.filter(r => r !== "direct")
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

/**
 * Prepare a subgraph schema pre-merging.
 *
 * Currently, this only look for non-default root type names and rename them into
 * their default names.
 */
function prepareSubgraphForMerging(subgraph: Subgraph): Subgraph | GraphQLError {
  const onlyDefautRoots = allSchemaRootKinds.every(k => {
    const type = subgraph.schema.schemaDefinition.root(k)?.type;
    return !type || type.name === defaultRootName(k);
  });

  if (onlyDefautRoots) {
    return subgraph;
  }

  const updated = subgraph.schema.clone();
  for (const k of allSchemaRootKinds) {
    const type = updated.schemaDefinition.root(k)?.type;
    const defaultName = defaultRootName(k);
    if (type && type.name !== defaultName) {
      // We first ensure there is no other type using the default root name. If there is, this is a
      // composition error.
      const existing = updated.type(defaultName);
      if (existing) {
        const nodes: ASTNode[] = [];
        if (type.sourceAST) nodes.push(type.sourceAST);
        if (existing.sourceAST) nodes.push(existing.sourceAST);
        return new GraphQLError(
          `Subgraph ${subgraph.name} has a type named ${defaultName} but it is not set as the ${k} root type (${type.name} is instead). `
          + 'If a root type does not use its default name, there should be no other type with that default name',
          nodes
        );
      }
      type.rename(defaultName);
    }
  }
  return new Subgraph(subgraph.name, subgraph.url, updated);
}

function prepareSubgraphsForMerging(subgraphs: Subgraphs): Subgraphs | GraphQLError[] {
  const preparedSubgraphs: Subgraphs = new Subgraphs();
  const errors: GraphQLError[] = [];
  for (const subgraph of subgraphs) {
    const preparedOrError = prepareSubgraphForMerging(subgraph);
    if (preparedOrError instanceof GraphQLError) {
      errors.push(preparedOrError);
    } else {
      preparedSubgraphs.add(preparedOrError);
    }
  }
  return errors.length > 0 ? errors : preparedSubgraphs;
}

export function isMergeSuccessful(mergeResult: MergeResult): mergeResult is MergeSuccess {
  return !isMergeFailure(mergeResult);
}

export function isMergeFailure(mergeResult: MergeResult): mergeResult is MergeFailure {
  return !!mergeResult.errors;
}

export function mergeSubgraphs(subgraphs: Subgraphs, options: CompositionOptions = {}): MergeResult {
  const preparedSubgraphsOrErrors = prepareSubgraphsForMerging(subgraphs);
  if (Array.isArray(preparedSubgraphsOrErrors)) {
    return { errors: preparedSubgraphsOrErrors };
  }
  return new Merger(preparedSubgraphsOrErrors, { ...defaultCompositionOptions, ...options }).merge();
}

function join(toJoin: string[], sep: string = ', ', firstSep?: string, lastSep: string = ' and ') {
  if (toJoin.length == 0) {
    return '';
  }
  const first = toJoin[0];
  if (toJoin.length == 1) {
    return first;
  }
  const last = toJoin[toJoin.length - 1];
  if (toJoin.length == 2) {
    return first + (firstSep ? firstSep : lastSep) + last;
  }
  return first + (firstSep ? firstSep : sep) + toJoin.slice(1, toJoin.length - 1) + lastSep + last;
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
    return prefix + join(toDisplay);
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
      assert(type, `Cannot find type ${source} in destination schema (with types: ${[...dest.types()].join(', ')})`);
      return type;
  }
}

function isMergedType(type: NamedType): boolean {
  return !isFederationType(type);
}

function isMergedField(field: InputFieldDefinition | FieldDefinition<CompositeType>): boolean {
  return field.kind !== 'FieldDefinition' || !isFederationField(field);
}

function isMergedDirective(definition: DirectiveDefinition | Directive): boolean {
  // TODO: Currently, we really only merge a handful of federation directives. We should have have
  // a way to merge more directive (maybe only the core ones? and if they have a particular flag?).
  return MERGED_FEDERATION_DIRECTIVES.includes(definition.name);
}

// Access the type set as a particular root in the provided `SchemaDefinition`, but ignoring "query" type
// that only exists due to federation operations. In other words, if a subgraph don't have a query type,
// but one was automatically added for _entities and _services, this method returns 'undefined'.
// This mainly avoid us trying to set the supergraph root in the rare case where the supergraph has
// no actual queries (knowning that subgraphs will _always_ have a queries since they have at least
// the federation ones).
function filteredRoot(def: SchemaDefinition, rootKind: SchemaRootKind): ObjectType | undefined {
  const type = def.root(rootKind)?.type;
  return type && hasMergedFields(type) ? type : undefined;
}

function hasMergedFields(type: ObjectType): boolean {
  return [...type.fields()].some(f => isMergedField(f));
}

class Merger {
  readonly names: readonly string[];
  readonly subgraphsSchema: readonly Schema[];
  readonly errors: GraphQLError[] = [];
  readonly hints: CompositionHint[] = [];
  readonly merged: Schema = new Schema();
  readonly subgraphNamesToJoinSpecName: Map<string, string>;

  constructor(readonly subgraphs: Subgraphs, readonly options: CompositionOptions) {
    this.names = subgraphs.names();
    this.subgraphsSchema = this.names.map(name => subgraphs.get(name)!.schema);
    this.subgraphNamesToJoinSpecName = this.prepareSupergraph();
  }

  private prepareSupergraph(): Map<string, string> {
    // TODO: we will soon need to look for name conflicts for @core and @join with potentially user-defined directives and
    // pass a `as` to the methods below if necessary. However, as we currently don't propagate any subgraph directives to 
    // the supergraph outside of a few well-known ones, we don't bother yet.
    coreSpec.addToSchema(this.merged);
    coreSpec.applyFeatureToSchema(this.merged, joinSpec);

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
      this.mergeUnion(this.subgraphsTypes(unionType), unionType);
    }

    // We merge the roots first as it only depend on the type existing, not being fully merged, and when
    // we merge types next, we actually rely on this having been called to detect the "query root type"
    // (in order to skip the _entities and _service fields on that particular type).
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

    // Let's not leave federation directives that aren't used.
    for (const federationDirective of MERGED_FEDERATION_DIRECTIVES) {
      const directive = this.merged.directive(federationDirective);
      if (directive && directive.applications().length === 0) {
        directive.remove();
      }
    }

    // TODO: currently, this can't really throw. But once it does, we should add the errors to this.errors
    this.merged.validate();

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
      `Type "${mismatchedType}" has mismatched kind: it is defined as `,
      supergraphType,
      this.subgraphsTypes(supergraphType),
      t => t.kind
    );
  }

  private reportMismatchError<TMismatched extends SchemaElement<any>>(
    message: string,
    mismatchedElement:TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAcessor: (elt: TMismatched, isSupergraph: boolean) => string | undefined
  ) {
    this.reportMismatch(
      mismatchedElement,
      subgraphElements,
      mismatchAcessor,
      (elt, names) => `${elt} in ${names}`,
      (elt, names) => `${elt} in ${names}`,
      (distribution, astNodes) => {
        this.errors.push(new GraphQLError(message + join(distribution, ' and ', ' but '), astNodes));
      },
      elt => !elt
    );
  }

  private reportMismatchHint<TMismatched extends SchemaElement<any>>(
    message: string,
    supergraphElement: TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAcessor: (elt: TMismatched, isSupergraph: boolean) => string | undefined,
    supergraphElementPrinter: (elt: string, subgraphs: string) => string,
    otherElementsPrinter: (elt: string | undefined, subgraphs: string) => string,
  ) {
    this.reportMismatch(
      supergraphElement,
      subgraphElements,
      mismatchAcessor,
      supergraphElementPrinter,
      otherElementsPrinter,
      (distribution, _) => {
        // TOOD: have a better structure for hints and include astNodes
        this.hints.push(message + distribution[0] + join(distribution.slice(1), ' and '));
      }
    );
  }

  private reportMismatch<TMismatched extends SchemaElement<any>>(
    supergraphElement:TMismatched,
    subgraphElements: (TMismatched | undefined)[],
    mismatchAcessor: (element: TMismatched, isSupergraph: boolean) => string | undefined,
    supergraphElementPrinter: (elt: string, subgraphs: string) => string,
    otherElementsPrinter: (elt: string | undefined, subgraphs: string) => string,
    reporter: (distribution: string[], astNode: ASTNode[]) => void,
    ignorePredicate?: (elt: string | undefined) => boolean,
  ) {
    const distributionMap = new MultiMap<string, string>();
    const astNodes: ASTNode[] = [];
    for (const [i, subgraphElt] of subgraphElements.entries()) {
      if (!subgraphElt) {
        continue;
      }
      const elt = mismatchAcessor(subgraphElt, false);
      if (ignorePredicate && ignorePredicate(elt)) {
        continue;
      }
      distributionMap.add(elt ?? '', this.names[i]);
      if (subgraphElt.sourceAST) {
        astNodes.push(subgraphElt.sourceAST);
      }
    }
    const supergraphMismatch = mismatchAcessor(supergraphElement, true);
    assert(supergraphMismatch, `The accessor on ${supergraphElement} returned undefined/null`);
    assert(distributionMap.size > 1, `Should not have been called for ${supergraphElement}`);
    const distribution = [];
    // We always add the "supergraph" first (proper formatting of hints rely on this in particular).
    distribution.push(supergraphElementPrinter(supergraphMismatch, printSubgraphNames(distributionMap.get(supergraphMismatch)!)));
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
      // At this point, we have already reported errors for type mismatches (and so comosition
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

  // Note that we know when we call this method that all the types in sources and dest have the same kind.
  // We could express this through a generic argument, but typescript is not smart enough to save us
  // type-casting even if we do, and in fact, using a generic forces a case on `dest` for some reason.
  // So we don't bother.
  private mergeType(sources: (NamedType | undefined)[], dest: NamedType) {
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

  private addJoinType(sources: (NamedType | undefined)[], dest: NamedType) {
    const joinTypeDirective = joinSpec.typeDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      if (!source) {
        continue;
      }

      //There is either 1 join__type per-key, or if there is no key, just one for the type.
      const keys = source.appliedDirectivesOf(federationBuiltIns.keyDirective(this.subgraphsSchema[idx]));
      const name = this.joinSpecName(idx);
      if (!keys.length) {
        dest.applyDirective(joinTypeDirective, { graph: name });
      } else {
        for (const key of keys) {
          dest.applyDirective(joinTypeDirective, { graph: name, key: key.arguments().fields });
        }
      }
    }
  }

  private mergeObject(sources: (ObjectType | undefined)[], dest: ObjectType) {
    this.addFieldsShallow(sources, dest);
    if ([...dest.fields()].length === 0) {
      // This can happen for a type that existing in the subgraphs but had only non-merged fields
      // (currently, this can only be the 'Query' type, in the rare case where the federated schema
      // exposes no queries) .
      dest.remove();
    } else {
      for (const destField of dest.fields()) {
        const subgraphFields = sources.map(t => t?.field(destField.name));
        this.mergeField(subgraphFields, destField);
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

  private withoutExternal(sources: (FieldDefinition<any> | undefined)[]): (FieldDefinition<any> | undefined)[] {
    return sources.map(s => s !== undefined && isExternal(s) ? undefined : s);
  }

  private hasExternal(sources: (FieldDefinition<any> | undefined)[]): boolean {
    return sources.some(s => s !== undefined && isExternal(s));
  }

  private mergeField(sources: (FieldDefinition<any> | undefined)[], dest: FieldDefinition<any>) {
    const sourcesToMerge = this.withoutExternal(sources);
    this.addJoinField(sourcesToMerge, dest);
    this.mergeAppliedDirectives(sourcesToMerge, dest);
    this.addArgumentsShallow(sourcesToMerge, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = sourcesToMerge.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }
    this.mergeTypeReference(sourcesToMerge, dest);

    if (this.hasExternal(sources)) {
      this.validateExternalFields(sources, dest);
    }
  } 

  private validateExternalFields(sources: (FieldDefinition<any> | undefined)[], dest: FieldDefinition<any>) {
    // We shouldn't have an @external on a field having arguments: @external is mainly to mark field that are in
    // @provides and @requires field-set, and it's really unclear how you could require/provide a field only for some
    // arguments value. So as soon as the merged field has arguments, we reject composition as invalid (even if the
    // subgraph declarations with @external themselves didn't declare the arguments).
    if (dest.hasArguments()) {
      this.reportMismatchError(
        `Field ${dest.coordinate} cannot have arguments and be marked @external in some subgraphs: it is `, 
        dest,
        sources,
        field => isExternal(field) ? 'marked @external' : (field.hasArguments() ? 'has arguments' : undefined)
      );
    }

    let hasInvalid = false;
    for (const source of sources) {
      if (!source || !isExternal(source)) {
        continue;
      }
      // To be valid, an external field must use the same type as the merged field (or "at least" a subtype).
      if (!sameType(dest.type!, source.type!) && !this.isStrictSubtype(dest.type!, source.type!)) {
        hasInvalid = true;
        break;
      }
    }

    if (hasInvalid) {
      this.reportMismatchError(
        `Field "${dest.coordinate}" has incompatible types accross subgraphs (when marked @external): it has `,
        dest,
        sources,
        field => `type "${field.type}"`
      );
    }
  }

  private needsJoinField<T extends FieldDefinition<ObjectType | InterfaceType> | InputFieldDefinition>(sources: (T | undefined)[], parentName: string): boolean {
    // We can avoid the join__field if 1) the field exists in all sources having the field parent type and 2) none of the field instance has a @requires or @provides.
    for (const [idx, source] of sources.entries()) {
      if (source) {
        if (source.hasAppliedDirective('provides') || source.hasAppliedDirective('requires')) {
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

  private addJoinField<T extends FieldDefinition<ObjectType | InterfaceType> | InputFieldDefinition>(sources: (T | undefined)[], dest: T) {
    if (!this.needsJoinField(sources, dest.parent!.name)) {
      return;
    }
    const joinFieldDirective = joinSpec.fieldDirective(this.merged);
    for (const [idx, source] of sources.entries()) {
      // We don't put a join__field if the field is marked @external in that subgraph.
      if (!source || source.appliedDirectivesOf('external').length > 0) {
        continue;
      }

      const name = this.joinSpecName(idx);
      dest.applyDirective(joinFieldDirective, { 
        graph: name, 
        requires: this.getFieldSet(source, federationBuiltIns.requiresDirective(this.subgraphsSchema[idx])),
        provides: this.getFieldSet(source, federationBuiltIns.providesDirective(this.subgraphsSchema[idx]))
      });
    }
  }

  private getFieldSet(element: SchemaElement<any>, directive: DirectiveDefinition<{fields: string}>): string | undefined {
    const applications = element.appliedDirectivesOf(directive);
    assert(applications.length <= 1, `Found more than one application of ${directive} on ${element}`);
    return applications.length === 0 ? undefined : applications[0].arguments().fields;
  }

  private mergeTypeReference<TType extends Type, TElement extends NamedSchemaElementWithType<TType, any, any>>(
    sources: (TElement | undefined)[],
    dest: TElement,
    isContravariant: boolean = false
  ) {
    let destType: TType | undefined;
    let hasSubtypes: boolean = false;
    let hasIncompatible: boolean = false;
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

    assert(destType, `We should have found at least one subgraph with a type for ${dest.coordinate}`);
    // Note that destType is direct reference to one of the subgraph, so we need to copy it into our merged schema.
    dest.type = copyTypeReference(destType, this.merged) as TType;

    if (hasIncompatible) {
      this.reportMismatchError(
        `Field "${dest.coordinate}" has incompatible types accross subgraphs: it has `,
        dest,
        sources,
        field => `type "${field.type}"`
      );
    } else if (hasSubtypes) {
      // Note that we use the type `toString` representation as a way to group which subgraphs have the exact same type.
      // Doing so is actually equivalent of checking `sameType` (more precisely, it is equivalent if we ignore the kind
      // of named types, but if 2 subgraphs differs in kind for the same type name (say one has "X" be a scalar and the
      // other an interface) we know we've already registered an error and the hint her won't matter).
      this.reportMismatchHint(
        `Field "${dest.coordinate}" has mismatched, but compatible, types across subgraphs: `,
        dest,
        sources,
        field => field.type!.toString(),
        (elt, subgraphs) => `will use type "${elt}" (from ${subgraphs}) in supergraph but "${dest.coordinate}" has `,
        (elt, subgraphs) => `${isContravariant ? 'supertype' : 'subtype'} "${elt}" in ${subgraphs}`
      );
    }
  }

  private isStrictSubtype(type: Type, maybeSubType: Type): boolean {
    // To be as generic as possible, when we check if a type is a direct subtype of another (which happens if either
    // the subtype is one of the member of an union type, or the subtype explictly implements an interface), we want
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

  private mergeArgument(sources: (ArgumentDefinition<any> | undefined)[], dest: ArgumentDefinition<any>) {
    this.mergeAppliedDirectives(sources, dest);
    this.mergeTypeReference(sources, dest, true);
    this.mergeDefaultValue(sources, dest, 'Argument');
  }

  private mergeDefaultValue<T extends ArgumentDefinition<any> | InputFieldDefinition>(sources: (T | undefined)[], dest: T, kind: string) {
    let destDefault;
    let hasSeenSource: boolean = false;
    let isInconsistent: boolean = false;
    let isIncompatible: boolean = false;
    for (const source of sources) {
      if (!source) {
        continue;
      }
      const sourceDefault = source.defaultValue;
      if (!destDefault) {
        destDefault = sourceDefault
        // destDefault may be undefined either because we haven't seen any source (having the argument)
        // or because we've seen one but that source had no default. In the later case (`hasSeenSource`), 
        // if the new source _has_ a default, then we're inconsistent.
        if (hasSeenSource && sourceDefault) {
          isInconsistent = true;
        }
      } else if (!valueEquals(destDefault, sourceDefault)) {
        isInconsistent = true;
        // It's only incompatible if neither is undefined
        if (sourceDefault) {
          isIncompatible = true;
        }
      }
      hasSeenSource = true;
    }
    dest.defaultValue = destDefault;

    if (isIncompatible) {
      this.reportMismatchError(
        `${kind} "${dest.coordinate}" has incompatible default values accross subgraphs: it has default value `,
        dest,
        sources,
        arg => arg.defaultValue ? valueToString(arg.defaultValue) : undefined
      );
    } else if (isInconsistent) {
      this.reportMismatchHint(
        `${kind} "${dest.coordinate}" has a default value in only some subgraphs: `,
        dest,
        sources,
        arg => arg.defaultValue ? valueToString(arg.defaultValue) : undefined,
        (elt, subgraphs) => `will use default value ${elt} from ${subgraphs} in supergraph but `,
        (_, subgraphs) => `no default value is defined in ${subgraphs}`
      );
    }
  }

  private mergeInterface(sources: (InterfaceType | undefined)[], dest: InterfaceType) {
    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      const subgraphFields = sources.map(t => t?.field(destField.name));
      this.mergeField(subgraphFields, destField);
    }
  }

  private mergeUnion(sources: (UnionType | undefined)[], dest: UnionType) {
    // TODO: option + hint for when all definitions are not equal.
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
  }

  private mergeEnum(sources: (EnumType | undefined)[], dest: EnumType) {
    // TODO: option + hint for when all definitions are not equal.
    // TODO: hint for inacessible values not everywhere (see generalised composition doc)?
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
  }

  private mergeInput(sources: (InputObjectType | undefined)[], dest: InputObjectType) {
    this.addFieldsShallow(sources, dest);
    for (const destField of dest.fields()) {
      const subgraphFields = sources.map(t => t?.field(destField.name));
      this.mergeInputField(subgraphFields, destField);
    }
  }

  private mergeInputField(sources: (InputFieldDefinition | undefined)[], dest: InputFieldDefinition) {
    this.addJoinField(sources, dest);
    this.mergeAppliedDirectives(sources, dest);
    this.mergeTypeReference(sources, dest, true);
    this.mergeDefaultValue(sources, dest, 'Input field');
  } 

  private mergeDirectiveDefinition(sources: (DirectiveDefinition | undefined)[], dest: DirectiveDefinition) {
    this.addArgumentsShallow(sources, dest);
    for (const destArg of dest.arguments()) {
      const subgraphArgs = sources.map(f => f?.argument(destArg.name));
      this.mergeArgument(subgraphArgs, destArg);
    }

    // TODO: options + hints when things are not the same everywhere. Maybe even reject definition that are inconsistent
    // on the 'repeatable'?
    for (const source of sources) {
      if (!source) {
        continue;
      }
      dest.repeatable = dest.repeatable || source.repeatable;
      dest.addLocations(...source.locations);
    }
  }

  private mergeAppliedDirectives(sources: (SchemaElement<any> | undefined)[], dest: SchemaElement<any>) {
    const names = this.gatherAppliedDirectiveNames(sources);
    for (const name of names) {
      this.mergeAppliedDirective(name, sources, dest);
    }
  }

  private gatherAppliedDirectiveNames(sources: (SchemaElement<any> | undefined)[]): Set<string> {
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

  private mergeAppliedDirective(name: string, sources: (SchemaElement<any> | undefined)[], dest: SchemaElement<any>) {
    // TODO: we currently only merge together applications that have the exact same arguments.
    // There is however 2 cases where we could be more subtle:
    //  1) default values: if a directive has an argument with a default value, and one subgraph pass a value
    //     but the other don't (relying on the default value), should we "merge" those together, at least
    //     when the value passed and the default value are the same? Or even when they aren't (say a
    //     a subgraph mark a field `@deprecated` and the other mark it `@deprecated(reason: "Something someting")`;
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
    this.mergeAppliedDirectives(sources, dest);
    // Before merging, we actually rename all the root types to their default name
    // in subgraphs (see federation.ts, `prepareSubgraphsForFederation`), so this
    // method should never report an error in practice as there should never be
    // a name disrepancy. That said, it's easy enough to double-check this, which
    // might at least help debugging case where we forgot to call
    // `prepareSubgraphsForFederation`.
    for (const rootKind of allSchemaRootKinds) {
      let rootType: string | undefined;
      let isIncompatible: boolean = false;
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

      if (isIncompatible) {
        this.reportMismatchError(
          `Schema root "${rootKind}" is inconsistent accross subgraphs: it is set to type `,
          dest,
          sources,
          (def, isSupergraph) => isSupergraph ? def.root(rootKind)!.type.toString() : filteredRoot(def, rootKind)?.toString()
        );
      }
    }
  }
}
