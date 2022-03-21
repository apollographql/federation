import {
  allSchemaRootKinds,
  baseType,
  CompositeType,
  CoreFeature,
  defaultRootName,
  Directive,
  DirectiveDefinition,
  ErrGraphQLValidationFailed,
  errorCauses,
  FieldDefinition,
  InputFieldDefinition,
  InterfaceType,
  isCompositeType,
  isInterfaceType,
  isObjectType,
  isUnionType,
  ListType,
  NamedType,
  NonNullType,
  ObjectType,
  ScalarType,
  Schema,
  SchemaBlueprint,
  SchemaDefinition,
  SchemaElement,
  sourceASTs,
  UnionType,
} from "./definitions";
import { assert, joinStrings, MultiMap, printHumanReadableList, OrderedMap } from "./utils";
import { SDLValidationRule } from "graphql/validation/ValidationContext";
import { specifiedSDLRules } from "graphql/validation/specifiedRules";
import {
  ASTNode,
  DocumentNode,
  GraphQLError,
  Kind,
  KnownTypeNamesRule,
  PossibleTypeExtensionsRule,
  print as printAST,
  Source,
  SchemaExtensionNode,
} from "graphql";
import { KnownTypeNamesInFederationRule } from "./validation/KnownTypeNamesInFederationRule";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { parseSelectionSet, selectionOfElement, SelectionSet } from './operations';
import { TAG_VERSIONS } from "./tagSpec";
import {
  errorCodeDef,
  ErrorCodeDefinition,
  ERROR_CATEGORIES,
  ERRORS,
  withModifiedErrorMessage,
} from "./error";
import { computeShareables } from "./sharing";
import {
  CoreSpecDefinition,
  FeatureVersion,
  LINK_VERSIONS,
  LinkDirectiveArgs,
  linkDirectiveDefaultName,
  linkIdentity,
} from "./coreSpec";
import {
  FEDERATION_VERSIONS,
  federationIdentity,
  fieldSetTypeSpec,
  keyDirectiveSpec,
  requiresDirectiveSpec,
  providesDirectiveSpec,
  externalDirectiveSpec,
  extendsDirectiveSpec,
  shareableDirectiveSpec,
  tagDirectiveSpec,
  FEDERATION2_SPEC_DIRECTIVES,
  ALL_FEDERATION_DIRECTIVES_DEFAULT_NAMES,
  FEDERATION2_ONLY_SPEC_DIRECTIVES,
} from "./federationSpec";
import { defaultPrintOptions, PrintOptions as PrintOptions, printSchema } from "./print";
import { createObjectTypeSpecification, createScalarTypeSpecification, createUnionTypeSpecification } from "./directiveAndTypeSpecification";
import { didYouMean, suggestionList } from "./suggestions";

const linkSpec = LINK_VERSIONS.latest();
const tagSpec = TAG_VERSIONS.latest();
const federationSpec = FEDERATION_VERSIONS.latest();

// We don't let user use this as a subgraph name. That allows us to use it in `query graphs` to name the source of roots
// in the "federated query graph" without worrying about conflict (see `FEDERATED_GRAPH_ROOT_SOURCE` in `querygraph.ts`).
// (note that we could deal with this in other ways, but having a graph named '_' feels like a terrible idea anyway, so
// disallowing it feels like more a good thing than a real restriction).
export const FEDERATION_RESERVED_SUBGRAPH_NAME = '_';

const FEDERATION_OMITTED_VALIDATION_RULES = [
  // We allow subgraphs to declare an extension even if the subgraph itself doesn't have a corresponding definition.
  // The implication being that the definition is in another subgraph.
  PossibleTypeExtensionsRule,
  // The `KnownTypeNamesRule` of graphQL-js only looks at type definitions, so this goes against our previous
  // desire to let a subgraph only have an extension for a type. Below, we add a replacement rules that looks
  // at both type definitions _and_ extensions.
  KnownTypeNamesRule
];

const FEDERATION_SPECIFIC_VALIDATION_RULES = [
  KnownTypeNamesInFederationRule
];

const FEDERATION_VALIDATION_RULES = specifiedSDLRules.filter(rule => !FEDERATION_OMITTED_VALIDATION_RULES.includes(rule)).concat(FEDERATION_SPECIFIC_VALIDATION_RULES);

// Returns a list of the coordinate of all the fields in the selection that are marked external.
function validateFieldSetSelections(
  directiveName: string,
  selectionSet: SelectionSet,
  hasExternalInParents: boolean,
  federationMetadata: FederationMetadata,
  allowOnNonExternalLeafFields: boolean,
): void {
  for (const selection of selectionSet.selections()) {
    if (selection.kind === 'FieldSelection') {
      const field = selection.element().definition;
      const isExternal = federationMetadata.isFieldExternal(field);
      if (field.hasArguments()) {
        throw ERROR_CATEGORIES.FIELDS_HAS_ARGS.get(directiveName).err({
          message: `field ${field.coordinate} cannot be included because it has arguments (fields with argument are not allowed in @${directiveName})`,
          nodes: field.sourceAST
        });
      }
      // The field must be external if we don't allow non-external leaf fields, it's a leaf, and we haven't traversed an external field in parent chain leading here.
      const mustBeExternal = !selection.selectionSet && !allowOnNonExternalLeafFields && !hasExternalInParents;
      if (!isExternal && mustBeExternal) {
        const errorCode = ERROR_CATEGORIES.DIRECTIVE_FIELDS_MISSING_EXTERNAL.get(directiveName);
        if (federationMetadata.isFieldFakeExternal(field)) {
          throw errorCode.err({
            message: `field "${field.coordinate}" should not be part of a @${directiveName} since it is already "effectively" provided by this subgraph `
              + `(while it is marked @${externalDirectiveSpec.name}, it is a @${keyDirectiveSpec.name} field of an extension type, which are not internally considered external for historical/backward compatibility reasons)`,
            nodes: field.sourceAST
          });
        } else {
          throw errorCode.err({
            message: `field "${field.coordinate}" should not be part of a @${directiveName} since it is already provided by this subgraph (it is not marked @${externalDirectiveSpec.name})`,
            nodes: field.sourceAST
          });
        }
      }
      if (selection.selectionSet) {
        // When passing the 'hasExternalInParents', the field might be external himself, but we may also have
        // the case where the field parent is an interface and some implementation of the field are external, in
        // which case we should say we have an external on the path, because we may have one.
        let newHasExternalInParents = hasExternalInParents || isExternal;
        const parentType = field.parent;
        if (!newHasExternalInParents && isInterfaceType(parentType)) {
          for (const implem of parentType.possibleRuntimeTypes()) {
            const fieldInImplem = implem.field(field.name);
            if (fieldInImplem && federationMetadata.isFieldExternal(fieldInImplem)) {
              newHasExternalInParents = true;
              break;
            }
          }
        }
        validateFieldSetSelections(directiveName, selection.selectionSet, newHasExternalInParents, federationMetadata, allowOnNonExternalLeafFields);
      }
    } else {
      validateFieldSetSelections(directiveName, selection.selectionSet, hasExternalInParents, federationMetadata, allowOnNonExternalLeafFields);
    }
  }
}

function validateFieldSet(
  type: CompositeType,
  directive: Directive<any, {fields: any}>,
  federationMetadata: FederationMetadata,
  allowOnNonExternalLeafFields: boolean,
  onFields?: (field: FieldDefinition<any>) => void,
): GraphQLError | undefined {
  try {
    // Note that `parseFieldSetArgument` already properly format the error, hence the separate try-catch.
    const fieldAccessor = onFields
      ? (type: CompositeType, fieldName: string) => {
        const field = type.field(fieldName);
        if (field) {
          onFields(field);
        }
        return field;
      }
      : undefined;
    const selectionSet = parseFieldSetArgument({parentType: type, directive, fieldAccessor});

    try {
      validateFieldSetSelections(directive.name, selectionSet, false, federationMetadata, allowOnNonExternalLeafFields);
      return undefined;
    } catch (e) {
      if (!(e instanceof GraphQLError)) {
        throw e;
      }
      const nodes = sourceASTs(directive);
      if (e.nodes) {
        nodes.push(...e.nodes);
      }
      const codeDef = errorCodeDef(e) ?? ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS.get(directive.name);
      return codeDef.err({
        message: `${fieldSetErrorDescriptor(directive)}: ${e.message.trim()}`,
        nodes,
        originalError: e,
      });
    }
  } catch (e) {
    if (e instanceof GraphQLError) {
      return e;
    } else {
      throw e;
    }
  }
}

function fieldSetErrorDescriptor(directive: Directive<any, {fields: any}>): string {
  return `On ${fieldSetTargetDescription(directive)}, for ${directiveStrUsingASTIfPossible(directive)}`;
}

// This method is called to display @key, @provides or @requires directives in error message in place where the directive `fields`
// argument might be invalid because it was not a string in the underlying AST. If that's the case, we want to use the AST to
// print the directive or the message might be a bit confusing for the user.
function directiveStrUsingASTIfPossible(directive: Directive<any>): string {
  return directive.sourceAST ? printAST(directive.sourceAST) : directive.toString();
}

function fieldSetTargetDescription(directive: Directive<any, {fields: any}>): string {
  const targetKind = directive.parent instanceof FieldDefinition ? "field" : "type";
  return `${targetKind} "${directive.parent?.coordinate}"`;
}

function validateAllFieldSet<TParent extends SchemaElement<any, any>>(
  definition: DirectiveDefinition<{fields: any}>,
  targetTypeExtractor: (element: TParent) => CompositeType,
  errorCollector: GraphQLError[],
  federationMetadata: FederationMetadata,
  isOnParentType: boolean,
  allowOnNonExternalLeafFields: boolean,
  onFields?: (field: FieldDefinition<any>) => void,
): void {
  for (const application of definition.applications()) {
    const elt = application.parent as TParent;
    const type = targetTypeExtractor(elt);
    const parentType = isOnParentType ? type : (elt.parent as NamedType);
    if (isInterfaceType(parentType)) {
      const code = ERROR_CATEGORIES.DIRECTIVE_UNSUPPORTED_ON_INTERFACE.get(definition.name);
      errorCollector.push(code.err({
        message: isOnParentType
          ? `Cannot use ${definition.coordinate} on interface "${parentType.coordinate}": ${definition.coordinate} is not yet supported on interfaces`
          : `Cannot use ${definition.coordinate} on ${fieldSetTargetDescription(application)} of parent type "${parentType}": ${definition.coordinate} is not yet supported within interfaces`,
        nodes: sourceASTs(application).concat(isOnParentType ? [] : sourceASTs(type)),
      }));
    }
    const error = validateFieldSet(
      type,
      application,
      federationMetadata,
      allowOnNonExternalLeafFields,
      onFields);
    if (error) {
      errorCollector.push(error);
    }
  }
}

export function collectUsedExternalFieldsCoordinates(metadata: FederationMetadata): Set<string> {
  const usedExternalCoordinates = new Set<string>();

  // Collects all external fields used by a key, requires or provides
  collectUsedExternaFieldsForDirective<CompositeType>(
    metadata,
    metadata.keyDirective(),
    type => type,
    usedExternalCoordinates,
  );
  collectUsedExternaFieldsForDirective<FieldDefinition<CompositeType>>(
    metadata,
    metadata.requiresDirective(),
    field => field.parent!,
    usedExternalCoordinates,
  );
  collectUsedExternaFieldsForDirective<FieldDefinition<CompositeType>>(
    metadata,
    metadata.providesDirective(),
    field => {
      const type = baseType(field.type!);
      return isCompositeType(type) ? type : undefined;
    },
    usedExternalCoordinates,
  );

  // Collects all external fields used to satisfy an interface constraint
  for (const itfType of metadata.schema.types<InterfaceType>('InterfaceType')) {
    const runtimeTypes = itfType.possibleRuntimeTypes();
    for (const field of itfType.fields()) {
      for (const runtimeType of runtimeTypes) {
        const implemField = runtimeType.field(field.name);
        if (implemField && metadata.isFieldExternal(implemField)) {
          usedExternalCoordinates.add(implemField.coordinate);
        }
      }
    }
  }

  return usedExternalCoordinates;
}

function collectUsedExternaFieldsForDirective<TParent extends SchemaElement<any, any>>(
  metadata: FederationMetadata,
  definition: DirectiveDefinition<{fields: any}>,
  targetTypeExtractor: (element: TParent) => CompositeType | undefined,
  usedExternalCoordinates: Set<string>
) {
  for (const application of definition.applications()) {
    const type = targetTypeExtractor(application.parent! as TParent);
    if (!type) {
      // Means the application is wrong: we ignore it here as later validation will detect it
      continue;
    }
    // Note that we don't want to 'validate', because even if a field set is invalid for some reason, we still want to consider
    // its field as "used". This avoid, when a `fields` argument is invalid, to get one error for the `fields` itself, but also
    // a bunch of other errors that says some external fields are unused that are just a consequence of not considering that
    // particular `fields` argument. In other words, this avoid cascading errors that would be confusing to the user without
    // being of any concrete use.
    collectTargetFields({
      parentType: type,
      directive: application as Directive<any, {fields: any}>,
      includeInterfaceFieldsImplementations: true,
      validate: false,
    }).filter((field) => metadata.isFieldExternal(field))
      .forEach((field) => usedExternalCoordinates.add(field.coordinate));
  }
}

/**
 * Checks that all fields marked @external is used in a federation directive (@key, @provides or @requires) _or_ to satisfy an
 * interface implementation. Otherwise, the field declaration is somewhat useless.
 */
function validateAllExternalFieldsUsed(metadata: FederationMetadata, errorCollector: GraphQLError[]): void {
  const allUsedExternals = collectUsedExternalFieldsCoordinates(metadata);
  for (const type of metadata.schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    for (const field of type.fields()) {
      if (!metadata.isFieldExternal(field) || allUsedExternals.has(field.coordinate)) {
        continue;
      }

      if (!isFieldSatisfyingInterface(field)) {
        errorCollector.push(ERRORS.EXTERNAL_UNUSED.err({
          message: `Field "${field.coordinate}" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface;`
          + ' the field declaration has no use and should be removed (or the field should not be @external).',
          nodes: field.sourceAST,
        }));
      }
    }
  }
}

function validateNoExternalOnInterfaceFields(metadata: FederationMetadata, errorCollector: GraphQLError[]) {
  for (const itf of metadata.schema.types<InterfaceType>('InterfaceType')) {
    for (const field of itf.fields()) {
      if (metadata.isFieldExternal(field)) {
        errorCollector.push(ERRORS.EXTERNAL_ON_INTERFACE.err({
          message: `Interface type field "${field.coordinate}" is marked @external but @external is not allowed on interface fields (it is nonsensical).`,
          nodes: field.sourceAST,
        }));
      }
    }
  }
}

function isFieldSatisfyingInterface(field: FieldDefinition<ObjectType | InterfaceType>): boolean {
  return field.parent.interfaces().some(itf => itf.field(field.name));
}

/**
 * Register errors when, for an interface field, some of the implementations of that field are @external
 * _and_ not all of those field implementation have the same type (which otherwise allowed because field
 * implementation types can be a subtype of the interface field they implement).
 * This is done because if that is the case, federation may later generate invalid query plans (see details
 * on https://github.com/apollographql/federation/issues/1257).
 * This "limitation" will be removed when we stop generating invalid query plans for it.
 */
function validateInterfaceRuntimeImplementationFieldsTypes(
  itf: InterfaceType,
  metadata: FederationMetadata, 
  errorCollector: GraphQLError[],
): void {
  const requiresDirective = federationMetadata(itf.schema())?.requiresDirective();
  assert(requiresDirective, 'Schema should be a federation subgraph, but @requires directive not found');
  const runtimeTypes = itf.possibleRuntimeTypes();
  for (const field of itf.fields()) {
    const withExternalOrRequires: FieldDefinition<ObjectType>[] = [];
    const typeToImplems: MultiMap<string, FieldDefinition<ObjectType>> = new MultiMap();
    const nodes: ASTNode[] = [];
    for (const type of runtimeTypes) {
      const implemField = type.field(field.name);
      if (!implemField) continue;
      if (implemField.sourceAST) {
        nodes.push(implemField.sourceAST);
      }
      if (metadata.isFieldExternal(implemField) || implemField.hasAppliedDirective(requiresDirective)) {
        withExternalOrRequires.push(implemField);
      }
      const returnType = implemField.type!;
      typeToImplems.add(returnType.toString(), implemField);
    }
    if (withExternalOrRequires.length > 0 && typeToImplems.size > 1) {
      const typeToImplemsArray = [...typeToImplems.entries()];
      errorCollector.push(ERRORS.INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH.err({
        message: `Some of the runtime implementations of interface field "${field.coordinate}" are marked @external or have a @require (${withExternalOrRequires.map(printFieldCoordinate)}) so all the implementations should use the same type (a current limitation of federation; see https://github.com/apollographql/federation/issues/1257), but ${formatFieldsToReturnType(typeToImplemsArray[0])} while ${joinStrings(typeToImplemsArray.slice(1).map(formatFieldsToReturnType), ' and ')}.`,
        nodes
      }));
    }
  }
}

const printFieldCoordinate = (f: FieldDefinition<CompositeType>): string => `"${f.coordinate}"`;

function formatFieldsToReturnType([type, implems]: [string, FieldDefinition<ObjectType>[]]) {
  return `${joinStrings(implems.map(printFieldCoordinate))} ${implems.length == 1 ? 'has' : 'have'} type "${type}"`;
}

export class FederationMetadata {
  private _externalTester?: ExternalTester;
  private _sharingPredicate?: (field: FieldDefinition<CompositeType>) => boolean;
  private _isFed2Schema?: boolean;

  constructor(readonly schema: Schema) {
  }

  private onInvalidate() {
    this._externalTester = undefined;
    this._sharingPredicate = undefined;
    this._isFed2Schema = undefined;
  }

  isFed2Schema(): boolean {
    if (!this._isFed2Schema) {
      const feature = this.federationFeature();
      this._isFed2Schema = !!feature && feature.url.version.satisfies(new FeatureVersion(2, 0))
    }
    return this._isFed2Schema;
  }

  federationFeature(): CoreFeature | undefined {
    return this.schema.coreFeatures?.getByIdentity(federationSpec.identity);
  }

  private externalTester(): ExternalTester {
    if (!this._externalTester) {
      this._externalTester = new ExternalTester(this.schema);
    }
    return this._externalTester;
  }

  private sharingPredicate(): (field: FieldDefinition<CompositeType>) => boolean {
    if (!this._sharingPredicate) {
      this._sharingPredicate = computeShareables(this.schema);
    }
    return this._sharingPredicate;
  }

  isFieldExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.externalTester().isExternal(field);
  }

  isFieldPartiallyExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.externalTester().isPartiallyExternal(field);
  }

  isFieldFullyExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.externalTester().isFullyExternal(field);
  }

  isFieldFakeExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.externalTester().isFakeExternal(field);
  }

  selectionSelectsAnyExternalField(selectionSet: SelectionSet): boolean {
    return this.externalTester().selectsAnyExternalField(selectionSet);
  }

  isFieldShareable(field: FieldDefinition<any>): boolean {
    return this.sharingPredicate()(field);
  }

  federationDirectiveNameInSchema(name: string): string {
    if (this.isFed2Schema()) {
      const coreFeatures = this.schema.coreFeatures;
      assert(coreFeatures, 'Schema should be a core schema');
      const federationFeature = coreFeatures.getByIdentity(federationSpec.identity);
      assert(federationFeature, 'Schema should have the federation feature');
      return federationFeature.directiveNameInSchema(name);
    } else {
      return name;
    }
  }

  federationTypeNameInSchema(name: string): string {
    // Currently, the types used to define the federation operations, that is _Any, _Entity and _Service,
    // are not considered part of the federation spec, and are instead hardcoded to the names above.
    // The reason being that there is no way to maintain backward compatbility with fed2 if we were to add
    // those to the federation spec without requiring users to add those types to their @link `import`,
    // and that wouldn't be a good user experience (because most users don't really know what those types
    // are/do). And so we special case it.
    if (name.charAt(0) === '_') {
      return name;
    }

    if (this.isFed2Schema()) {
      const coreFeatures = this.schema.coreFeatures;
      assert(coreFeatures, 'Schema should be a core schema');
      const federationFeature = coreFeatures.getByIdentity(federationSpec.identity);
      assert(federationFeature, 'Schema should have the federation feature');
      return federationFeature.typeNameInSchema(name);
    } else {
      // The only type here so far is the the `FieldSet` one. And in fed1, it's called `_FieldSet`, so ...
      return '_' + name;
    }
  }

  private getFederationDirective<TApplicationArgs extends {[key: string]: any}>(
    name: string
  ): DirectiveDefinition<TApplicationArgs> {
    const directive = this.schema.directive(this.federationDirectiveNameInSchema(name));
    assert(directive, `The provided schema does not have federation directive @${name}`);
    return directive as DirectiveDefinition<TApplicationArgs>;
  }

  keyDirective(): DirectiveDefinition<{fields: any, resolvable?: boolean}> {
    return this.getFederationDirective(keyDirectiveSpec.name);
  }

  extendsDirective(): DirectiveDefinition<Record<string, never>> {
    return this.getFederationDirective(extendsDirectiveSpec.name);
  }

  externalDirective(): DirectiveDefinition<Record<string, never>> {
    return this.getFederationDirective(externalDirectiveSpec.name);
  }

  requiresDirective(): DirectiveDefinition<{fields: any}> {
    return this.getFederationDirective(requiresDirectiveSpec.name);
  }

  providesDirective(): DirectiveDefinition<{fields: any}> {
    return this.getFederationDirective(providesDirectiveSpec.name);
  }

  shareableDirective(): DirectiveDefinition<{}> {
    return this.getFederationDirective(shareableDirectiveSpec.name);
  }

  tagDirective(): DirectiveDefinition<{name: string}> {
    return this.getFederationDirective(tagDirectiveSpec.name);
  }

  allFederationDirectives(): DirectiveDefinition[] {
    const baseDirectives = [
      this.keyDirective(),
      this.externalDirective(),
      this.requiresDirective(),
      this.providesDirective(),
      this.tagDirective(),
      this.extendsDirective(),
    ];
    return this.isFed2Schema()
      ? baseDirectives.concat(this.shareableDirective())
      : baseDirectives;
  }

  // Note that a subgraph may have no "entities" and so no _EntityType.
  entityType(): UnionType | undefined {
    return this.schema.type(this.federationTypeNameInSchema(entityTypeSpec.name)) as UnionType | undefined;
  }

  anyType(): ScalarType {
    return this.schema.type(this.federationTypeNameInSchema(anyTypeSpec.name)) as ScalarType;
  }

  serviceType(): ObjectType {
    return this.schema.type(this.federationTypeNameInSchema(serviceTypeSpec.name)) as ObjectType;
  }

  fieldSetType(): ScalarType {
    return this.schema.type(this.federationTypeNameInSchema(fieldSetTypeSpec.name)) as ScalarType;
  }

  allFederationTypes(): NamedType[] {
    const baseTypes: NamedType[] = [
      this.anyType(),
      this.serviceType(),
      this.fieldSetType(),
    ];
    const entityType = this.entityType();
    if (entityType) {
      baseTypes.push(entityType);
    }
    return baseTypes;
  }
}

export class FederationBlueprint extends SchemaBlueprint {
  onAddedCoreFeature(schema: Schema, feature: CoreFeature) {
    super.onAddedCoreFeature(schema, feature);
    if (feature.url.identity === federationIdentity) {
      const spec = FEDERATION_VERSIONS.find(feature.url.version);
      if (spec) {
        spec.addElementsToSchema(schema);
      }
    }
  }

  onMissingDirectiveDefinition(schema: Schema, name: string): DirectiveDefinition | undefined {
    if (name === linkDirectiveDefaultName) {
      linkSpec.addToSchema(schema);
      return schema.directive(name);
    }
    return super.onMissingDirectiveDefinition(schema, name);
  }

  ignoreParsedField(type: NamedType, fieldName: string): boolean {
    // Historically, federation 1 has accepted invalid schema, including some where the Query type included
    // the definition of `_entities` (so `_entities(representations: [_Any!]!): [_Entity]!`) but _without_
    // defining the `_Any` or `_Entity` type. So while we want to be stricter for fed2 (so this kind of
    // really weird case can be fixed), we want fed2 to accept as much fed1 schema as possible. 
    //
    // So, to avoid this problem, we ignore the _entities and _service fields if we parse them from
    // a fed1 input schema. Those will be added back anyway (along with the proper types) post-parsing.
    if (!FEDERATION_OPERATION_FIELDS.includes(fieldName)) {
      return false;
    }
    const metadata = federationMetadata(type.schema());
    return !!metadata && !metadata.isFed2Schema();
  }

  onConstructed(schema: Schema) {
    const existing = federationMetadata(schema);
    if (!existing) {
      (schema as any)['_federationMetadata'] = new FederationMetadata(schema);
    }
  }

  onDirectiveDefinitionAndSchemaParsed(schema: Schema) {
    completeSubgraphSchema(schema);
  }

  onInvalidation(schema: Schema) {
    super.onInvalidation(schema);
    const metadata = federationMetadata(schema);
    assert(metadata, 'Federation schema should have had its metadata set on construction');
    FederationMetadata.prototype['onInvalidate'].call(metadata);
  }

  onValidation(schema: Schema): GraphQLError[] {
    const errors = super.onValidation(schema);

    // We rename all root type to their default names (we do here rather than in `prepareValidation` because
    // that can actually fail).
    for (const k of allSchemaRootKinds) {
      const type = schema.schemaDefinition.root(k)?.type;
      const defaultName = defaultRootName(k);
      if (type && type.name !== defaultName) {
        // We first ensure there is no other type using the default root name. If there is, this is a
        // composition error.
        const existing = schema.type(defaultName);
        if (existing) {
          errors.push(ERROR_CATEGORIES.ROOT_TYPE_USED.get(k).err({
            message: `The schema has a type named "${defaultName}" but it is not set as the ${k} root type ("${type.name}" is instead): `
              + 'this is not supported by federation. '
              + 'If a root type does not use its default name, there should be no other type with that default name.',
            nodes: sourceASTs(type, existing),
          }));
        }
        type.rename(defaultName);
      }
    }

    const metadata = federationMetadata(schema);
    assert(metadata, 'Federation schema should have had its metadata set on construction');
    // We skip the rest of validation for fed1 schema because there is a number of validation that is stricter than what fed 1
    // accepted, and some of those issues are fixed by `SchemaUpgrader`. So insofar as any fed 1 scheam is ultimately converted
    // to a fed 2 one before composition, then skipping some validation on fed 1 schema is fine.
    if (!metadata.isFed2Schema()) {
      return errors;
    }

    // We validate the @key, @requires and @provides.
    const keyDirective = metadata.keyDirective();
    validateAllFieldSet<CompositeType>(
      keyDirective,
      type => type,
      errors,
      metadata,
      true,
      true,
      field => {
        const type = baseType(field.type!);
        if (isUnionType(type) || isInterfaceType(type)) {
          let kind: string = type.kind;
          kind = kind.slice(0, kind.length - 'Type'.length);
          throw ERRORS.KEY_FIELDS_SELECT_INVALID_TYPE.err({
            message: `field "${field.coordinate}" is a ${kind} type which is not allowed in @key`
          });
        }
      }
    );
    // Note that we currently reject @requires where a leaf field of the selection is not external,
    // because if it's provided by the current subgraph, why "requires" it? That said, it's not 100%
    // nonsensical if you wanted a local field to be part of the subgraph fetch even if it's not
    // truly queried _for some reason_. But it's unclear such reasons exists, so for now we prefer
    // rejecting it as it also make it less likely user misunderstand what @requires actually do.
    // But we could consider lifting that limitation if users comes with a good rational for allowing
    // it.
    validateAllFieldSet<FieldDefinition<CompositeType>>(
      metadata.requiresDirective(),
      field => field.parent,
      errors,
      metadata,
      false,
      false,
    );
    // Note that like for @requires above, we error out if a leaf field of the selection is not
    // external in a @provides (we pass `false` for the `allowOnNonExternalLeafFields` parameter),
    // but contrarily to @requires, there is probably no reason to ever change this, as a @provides
    // of a field already provides is 100% nonsensical.
    validateAllFieldSet<FieldDefinition<CompositeType>>(
      metadata.providesDirective(),
      field => {
        if (metadata.isFieldExternal(field)) {
          throw new GraphQLError(`Cannot have both @provides and @external on field "${field.coordinate}"`, field.sourceAST);
        }
        const type = baseType(field.type!);
        if (!isCompositeType(type)) {
          throw ERRORS.PROVIDES_ON_NON_OBJECT_FIELD.err({
            message: `Invalid @provides directive on field "${field.coordinate}": field has type "${field.type}" which is not a Composite Type`,
            nodes: field.sourceAST,
          });
        }
        return type;
      },
      errors,
      metadata,
      false,
      false,
    );

    validateNoExternalOnInterfaceFields(metadata, errors);
    validateAllExternalFieldsUsed(metadata, errors);

    // If tag is redefined by the user, make sure the definition is compatible with what we expect
    const tagDirective = metadata.tagDirective();
    if (tagDirective) {
      const error = tagSpec.checkCompatibleDirective(tagDirective);
      if (error) {
        errors.push(error);
      }
    }

    for (const itf of schema.types<InterfaceType>('InterfaceType')) {
      validateInterfaceRuntimeImplementationFieldsTypes(itf, metadata, errors);
    }

    return errors;
  }

  validationRules(): readonly SDLValidationRule[] {
    return FEDERATION_VALIDATION_RULES;
  }

  onUnknownDirectiveValidationError(schema: Schema, unknownDirectiveName: string, error: GraphQLError): GraphQLError {
    const metadata = federationMetadata(schema);
    assert(metadata, `This method should only have been called on a subgraph schema`)
    if (ALL_FEDERATION_DIRECTIVES_DEFAULT_NAMES.includes(unknownDirectiveName)) {
      // The directive name is "unknown" but it is a default federation directive name. So it means one of a few things
      // happened:
      //  1. it's a fed1 schema but the directive is a fed2 only one (only possible case for fed1 schema).
      //  2. the directive has not been imported at all (so needs to be prefixed for it to work).
      //  3. the directive has an `import`, but it's been aliased to another name.
      if (metadata.isFed2Schema()) {
        const federationFeature = metadata.federationFeature();
        assert(federationFeature, 'Fed2 subgraph _must_ link to the federation feature')
        const directiveNameInSchema = federationFeature.directiveNameInSchema(unknownDirectiveName);
        console.log(`For ${unknownDirectiveName}, name in schema = ${directiveNameInSchema}`);
        if (directiveNameInSchema.startsWith(federationFeature.nameInSchema + '__')) {
          // There is no import for that directive
          return withModifiedErrorMessage(
            error,
            `${error.message} If you meant the "@${unknownDirectiveName}" federation directive, you should use fully-qualified name "@${directiveNameInSchema}" or add "@${unknownDirectiveName}" to the \`import\` argument of the @link to the federation specification.`
          );
        } else {
          // There's an import, but it's renamed
          return withModifiedErrorMessage(
            error,
            `${error.message} If you meant the "@${unknownDirectiveName}" federation directive, you should use "@${directiveNameInSchema}" as it is imported under that name in the @link to the federation specification of this schema.`
          );
        }
      } else {
        return withModifiedErrorMessage(
          error, 
          `${error.message} If you meant the "@${unknownDirectiveName}" federation 2 directive, note that this schema is a federation 1 schema. To be a federation 2 schema, it needs to @link to the federation specifcation v2.`
        );
      }
    } else if (!metadata.isFed2Schema()) {
      // We could get here in the case where a fed1 schema has tried to use a fed2 directive but mispelled it.
      const suggestions = suggestionList(unknownDirectiveName, FEDERATION2_ONLY_SPEC_DIRECTIVES.map((spec) => spec.name));
      if (suggestions.length > 0) {
        return withModifiedErrorMessage(
          error, 
          `${error.message}${didYouMean(suggestions.map((s) => '@' + s))} If so, note that ${suggestions.length === 1 ? 'it is a federation 2 directive' : 'they are federation 2 directives'} but this schema is a federation 1 one. To be a federation 2 schema, it needs to @link to the federation specifcation v2.`
        );
      }
    }
    return error;
  }
}

const federationBlueprint = new FederationBlueprint();

function findUnusedNamedForLinkDirective(schema: Schema): string | undefined {
  if (!schema.directive(linkSpec.url.name)) {
    return undefined;
  }

  // The schema already defines a directive named `@link` so we need to use an alias.
  // To keep it simple, we add a number in the end (so we try `@link1`, and if that's taken `@link2`, ...)
  const baseName = linkSpec.url.name;
  let n = 1;
  for (;;) {
    const candidate = baseName + n;
    if (!schema.directive(candidate)) {
      return candidate;
    }
  }
}

export function setSchemaAsFed2Subgraph(schema: Schema) {
  let core = schema.coreFeatures;
  let spec: CoreSpecDefinition;
  if (core) {
    spec = core.coreDefinition;
    // We don't accept pre-1.0 @core: this avoid having to care about what the name
    // of the argument below is, and why would be bother?
    assert(spec.url.version.satisfies(linkSpec.version), `Fed2 schema must use @link with version >= 1.0, but schema uses ${spec.url}`);
  } else {
    const alias = findUnusedNamedForLinkDirective(schema);
    linkSpec.addToSchema(schema, alias);
    spec = linkSpec;
    core = schema.coreFeatures;
    assert(core, 'Schema should now be a core schema');
  }

  assert(!core.getByIdentity(federationSpec.identity), 'Schema already set as a federation subgraph');
  schema.schemaDefinition.applyDirective(
    core.coreItself.nameInSchema,
    {
      url: federationSpec.url.toString(),
      import: FEDERATION2_SPEC_DIRECTIVES.map((spec) => `@${spec.name}`),
    }
  );
  completeSubgraphSchema(schema);
}

export function asFed2SubgraphDocument(document: DocumentNode): DocumentNode {
  const fed2LinkExtension: SchemaExtensionNode = {
    kind: Kind.SCHEMA_EXTENSION,
    directives: [{
      kind: Kind.DIRECTIVE,
      name: { kind: Kind.NAME, value: linkDirectiveDefaultName },
      arguments: [{
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: 'url' },
        value: { kind: Kind.STRING, value: federationSpec.url.toString() }
      },
      {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: 'import' },
        value: { kind: Kind.LIST, values: FEDERATION2_SPEC_DIRECTIVES.map((spec) => ({ kind: Kind.STRING, value: `@${spec.name}` })) }
      }]
    }]
  };
  return {
    kind: Kind.DOCUMENT,
    loc: document.loc,
    definitions: document.definitions.concat(fed2LinkExtension)
  }
}

export function printSubgraphNames(names: string[]): string {
  return printHumanReadableList(
    names.map(n => `"${n}"`),
    {
      prefix: 'subgraph',
      prefixPlural: 'subgraphs',
    }
  );
}

export function federationMetadata(schema: Schema): FederationMetadata | undefined {
  return (schema as any)['_federationMetadata'];
}

export function isFederationSubgraphSchema(schema: Schema): boolean {
  return !!federationMetadata(schema);
}

export function isFederationField(field: FieldDefinition<CompositeType>): boolean {
  if (field.parent === field.schema().schemaDefinition.root("query")?.type) {
    return FEDERATION_OPERATION_FIELDS.includes(field.name);
  }
  return false;
}

export function isEntityType(type: NamedType): boolean {
  if (type.kind !== "ObjectType") {
    return false;
  }
  const metadata = federationMetadata(type.schema());
  return !!metadata && type.hasAppliedDirective(metadata.keyDirective());
}

export function buildSubgraph(
  name: string,
  url: string,
  source: DocumentNode | string
): Subgraph {
  const buildOptions = {
    blueprint: federationBlueprint,
    validate: false,
  };
  let subgraph: Subgraph;
  try {
    const schema = typeof source === 'string'
      ? buildSchema(new Source(source, name), buildOptions)
      : buildSchemaFromAST(source, buildOptions)
    subgraph = new Subgraph(name, url, schema);
  } catch (e) {
    if (e instanceof GraphQLError) {
      throw addSubgraphToError(e, name, ERRORS.INVALID_GRAPHQL);
    } else {
      throw e;
    }
  }
  return subgraph.validate();
}

export function newEmptyFederation2Schema(): Schema {
  const schema = new Schema(federationBlueprint);
  setSchemaAsFed2Subgraph(schema);
  return schema;
}

function completeSubgraphSchema(schema: Schema) {
  const coreFeatures = schema.coreFeatures;
  if (coreFeatures) {
    const fedFeature = coreFeatures.getByIdentity(federationIdentity);
    if (fedFeature) {
      completeFed2SubgraphSchema(schema);
    } else {
      completeFed1SubgraphSchema(schema);
    }
  } else {
    const fedLink = schema.schemaDefinition.appliedDirectivesOf(linkDirectiveDefaultName).find(isFedSpecLinkDirective);
    if (fedLink) {
      linkSpec.addToSchema(schema);
      completeFed2SubgraphSchema(schema);
    } else {
      completeFed1SubgraphSchema(schema);
    }
  }
}

function isFedSpecLinkDirective(directive: Directive<SchemaDefinition>): directive is Directive<SchemaDefinition, LinkDirectiveArgs> {
  const args = directive.arguments();
  return directive.name === linkDirectiveDefaultName && args['url'] && (args['url'] as string).startsWith(federationIdentity);
}

function completeFed1SubgraphSchema(schema: Schema) {
  fieldSetTypeSpec.checkOrAdd(schema, '_' + fieldSetTypeSpec.name);

  keyDirectiveSpec.checkOrAdd(schema);
  requiresDirectiveSpec.checkOrAdd(schema);
  providesDirectiveSpec.checkOrAdd(schema);
  extendsDirectiveSpec.checkOrAdd(schema);
  externalDirectiveSpec.checkOrAdd(schema);
  tagDirectiveSpec.checkOrAdd(schema);
}

function completeFed2SubgraphSchema(schema: Schema) {
  const coreFeatures = schema.coreFeatures;
  assert(coreFeatures, 'This method should not have been called on a non-core schema');

  const fedFeature = coreFeatures.getByIdentity(federationIdentity);
  assert(fedFeature, 'This method should not have been called on a schema with no @link for federation');

  const spec = FEDERATION_VERSIONS.find(fedFeature.url.version);
  if (!spec) {
    throw ERRORS.UNKNOWN_FEDERATION_LINK_VERSION.err({
      message: `Invalid version ${fedFeature.url.version} for the federation feature in @link direction on schema`,
      nodes: fedFeature.directive.sourceAST
    });
  }

  spec.addElementsToSchema(schema);
}

export function parseFieldSetArgument({
  parentType,
  directive,
  fieldAccessor,
  validate,
}: {
  parentType: CompositeType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  fieldAccessor?: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined,
  validate?: boolean,
}): SelectionSet {
  try {
    return parseSelectionSet({
      parentType,
      source: validateFieldSetValue(directive),
      fieldAccessor,
      validate,
    });
  } catch (e) {
    if (!(e instanceof GraphQLError)) {
      throw e;
    }

    const nodes = sourceASTs(directive);
    if (e.nodes) {
      nodes.push(...e.nodes);
    }
    let msg = e.message.trim();
    // The rule for validating @requires in fed 1 was not properly recursive, so people upgrading
    // may have a @require that selects some fields but without declaring those fields on the
    // subgraph. As we fixed the validation, this will now fail, but we try here to provide some
    // hint for those users for how to fix the problem.
    // Note that this is a tad fragile to rely on the error message like that, but worth case, a
    // future change make us not show the hint and that's not the end of the world.
    if (msg.startsWith('Cannot query field')) {
      if (msg.endsWith('.')) {
        msg = msg.slice(0, msg.length - 1);
      }
      if (directive.name === keyDirectiveSpec.name) {
        msg = msg + ' (the field should be either be added to this subgraph or, if it should not be resolved by this subgraph, you need to add it to this subgraph with @external).';
      } else {
        msg = msg + ' (if the field is defined in another subgraph, you need to add it to this subgraph with @external).';
      }
    }

    const codeDef = errorCodeDef(e) ?? ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS.get(directive.name);
    throw codeDef.err({
      message: `${fieldSetErrorDescriptor(directive)}: ${msg}`,
      nodes,
      originalError: e,
    });
  }
}

export function collectTargetFields({
  parentType,
  directive,
  includeInterfaceFieldsImplementations,
  validate = true,
}: {
  parentType: CompositeType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  includeInterfaceFieldsImplementations: boolean,
  validate?: boolean,
}): FieldDefinition<CompositeType>[] {
  const fields: FieldDefinition<CompositeType>[] = [];
  try {
    parseFieldSetArgument({
      parentType,
      directive,
      fieldAccessor: (t, f) => {
        const field = t.field(f);
        if (field) {
          fields.push(field);
          if (includeInterfaceFieldsImplementations && isInterfaceType(t)) {
            for (const implType of t.possibleRuntimeTypes()) {
              const implField = implType.field(f);
              if (implField) {
                fields.push(implField);
              }
            }
          }
        }
        return field;
      },
      validate,
    });
  } catch (e) {
    // If we explicitely requested no validation, then we shouldn't throw a (graphQL) error, but if we do, we swallow it
    // (returning a partial result, but we assume it is fine).
    const isGraphQLError = errorCauses(e) !== undefined
    if (!isGraphQLError || validate) {
      throw e;
    }
  }
  return fields;
}

function validateFieldSetValue(directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>): string {
  const fields = directive.arguments().fields;
  const nodes = directive.sourceAST;
  if (typeof fields !== 'string') {
    throw ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS_TYPE.get(directive.name).err({
      message: `Invalid value for argument "${directive.definition!.argument('fields')!.name}": must be a string.`,
      nodes,
    });
  }
  // While validating if the field is a string will work in most cases, this will not catch the case where the field argument was
  // unquoted but parsed as an enum value (see federation/issues/850 in particular). So if we have the AST (which we will usually
  // have in practice), use that to check that the argument was truly a string.
  if (nodes && nodes.kind === 'Directive') {
    for (const argNode of nodes.arguments ?? []) {
      if (argNode.name.value === 'fields') {
        if (argNode.value.kind !== 'StringValue') {
          throw ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS_TYPE.get(directive.name).err({
            message: `Invalid value for argument "${directive.definition!.argument('fields')!.name}": must be a string.`,
            nodes,
          });
        }
        break;
      }
    }
  }

  return fields;
}

export interface ServiceDefinition {
  typeDefs: DocumentNode;
  name: string;
  url?: string;
}
export function subgraphsFromServiceList(serviceList: ServiceDefinition[]): Subgraphs | GraphQLError[] {
  let errors: GraphQLError[] = [];
  const subgraphs = new Subgraphs();
  for (const service of serviceList) {
    try {
      subgraphs.add(buildSubgraph(service.name, service.url ?? '', service.typeDefs));
    } catch (e) {
      const causes = errorCauses(e);
      if (causes) {
        errors = errors.concat(causes);
      } else {
        throw e;
      }
    }
  }
  return errors.length === 0 ? subgraphs : errors;
}

// Simple wrapper around a Subgraph[] that ensures that 1) we never mistakenly get 2 subgraph with the same name,
// 2) keep the subgraphs sorted by name (makes iteration more predictable). It also allow convenient access to
// a subgraph by name so behave like a map<string, Subgraph> in most ways (but with the previously mentioned benefits).
export class Subgraphs {
  private readonly subgraphs = new OrderedMap<string, Subgraph>();

  add(subgraph: Subgraph): Subgraph {
    if (this.subgraphs.has(subgraph.name)) {
      throw new Error(`A subgraph named ${subgraph.name} already exists` + (subgraph.url ? ` (with url '${subgraph.url}')` : ''));
    }

    this.subgraphs.add(subgraph.name, subgraph);
    return subgraph;
  }

  get(name: string): Subgraph | undefined {
    return this.subgraphs.get(name);
  }

  size(): number {
    return this.subgraphs.size;
  }

  names(): readonly string[] {
    return this.subgraphs.keys();
  }

  values(): readonly Subgraph[] {
    return this.subgraphs.values();
  }

  *[Symbol.iterator]() {
    for (const subgraph of this.subgraphs) {
      yield subgraph;
    }
  }

  validate(): GraphQLError[] | undefined {
    let errors: GraphQLError[] = [];
    for (const subgraph of this.values()) {
      try {
        subgraph.validate();
      } catch (e) {
        const causes = errorCauses(e);
        if (!causes) {
          throw e;
        }
        errors = errors.concat(causes);
      }
    }
    return errors.length === 0 ? undefined : errors;
  }

  toString(): string {
    return '[' + this.subgraphs.keys().join(', ') + ']'
  }
}

export const anyTypeSpec = createScalarTypeSpecification({ name: '_Any' });

export const serviceTypeSpec = createObjectTypeSpecification({
  name: '_Service',
  fieldsFct: (schema) => [{ name: 'sdl', type: schema.stringType() }],
});

export const entityTypeSpec = createUnionTypeSpecification({
  name: '_Entity',
  membersFct: (schema) => {
    return schema.types<ObjectType>("ObjectType").filter(isEntityType).map((t) => t.name);
  },
});

export const FEDERATION_OPERATION_TYPES = [ anyTypeSpec, serviceTypeSpec, entityTypeSpec ];

export const serviceFieldName = '_service';
export const entitiesFieldName = '_entities';

export const FEDERATION_OPERATION_FIELDS: readonly string[] = [ serviceFieldName, entitiesFieldName ];

export class Subgraph {
  constructor(
    readonly name: string,
    readonly url: string,
    readonly schema: Schema,
  ) {
    if (name === FEDERATION_RESERVED_SUBGRAPH_NAME) {
      throw ERRORS.INVALID_SUBGRAPH_NAME.err({ message: `Invalid name ${FEDERATION_RESERVED_SUBGRAPH_NAME} for a subgraph: this name is reserved` });
    }
  }

  metadata(): FederationMetadata {
    const metadata = federationMetadata(this.schema);
    assert(metadata, 'The subgraph schema should have built with the federation built-ins.');
    return metadata;
  }

  isFed2Subgraph(): boolean {
    return this.metadata().isFed2Schema();
  }

  // Adds the _entities and _service fields to the root query type.
  private addFederationOperations() {
    const metadata = this.metadata();

    for (const type of FEDERATION_OPERATION_TYPES) {
      type.checkOrAdd(this.schema);
    }

    const queryRoot = this.schema.schemaDefinition.root("query");
    const queryType = queryRoot ? queryRoot.type : this.schema.addType(new ObjectType("Query"));

    const entityField = queryType.field(entitiesFieldName);
    const entityType = metadata.entityType();
    if (entityType) {
      const entityFieldType = new NonNullType(new ListType(entityType));
      if (!entityField) {
        queryType.addField(entitiesFieldName, entityFieldType)
          .addArgument('representations', new NonNullType(new ListType(new NonNullType(metadata.anyType()))));
      } else if (!entityField.type) {
        // This can happen when the schema had an empty redefinition of _Entity as we've removed it in
        // that clear and that would have clear the type of the correspond field. Let's re-populate it
        // in that case.
        entityField.type = entityType;
      }
    } else if (entityField) {
      entityField.remove();
    }

    if (!queryType.field(serviceFieldName)) {
      queryType.addField(serviceFieldName, metadata.serviceType());
    }
  }

  validate(): Subgraph {
    try {
      this.addFederationOperations();
      this.schema.validate();
      return this;
    } catch (e) {
      if (e instanceof GraphQLError) {
        // Note that `addSubgraphToError` only adds the provided code if the original error
        // didn't have one, and the only one that will not have a code are GraphQL errors
        // (since we assign specific codes to the federation errors).
        throw addSubgraphToError(e, this.name, ERRORS.INVALID_GRAPHQL);
      } else {
        throw e;
      }
    }
  }

  private isPrintedDirective(d: DirectiveDefinition): boolean {
    if (this.metadata().allFederationDirectives().includes(d)) {
      return false;
    }

    const core = this.schema.coreFeatures;
    return !core || core.sourceFeature(d)?.url.identity !== linkIdentity;
  }

  private isPrintedType(t: NamedType): boolean {
    if (this.metadata().allFederationTypes().includes(t)) {
      return false;
    }

    const core = this.schema.coreFeatures;
    return !core || core.sourceFeature(t)?.url.identity !== linkIdentity;
  }

  toString(basePrintOptions: PrintOptions = defaultPrintOptions) {
    return printSchema(
      this.schema,
      {
        ...basePrintOptions,
        directiveDefinitionFilter: (d) => this.isPrintedDirective(d),
        typeFilter: (t) => this.isPrintedType(t),
        fieldFilter: (f) => !isFederationField(f),
      }
    );
  }
}

export type SubgraphASTNode = ASTNode & { subgraph: string };

export function addSubgraphToASTNode(node: ASTNode, subgraph: string): SubgraphASTNode {
  return {
    ...node,
    subgraph
  };
}

export function addSubgraphToError(e: GraphQLError, subgraphName: string, errorCode?: ErrorCodeDefinition): GraphQLError {
  const updatedCauses = errorCauses(e)!.map(cause => {
    const message = `[${subgraphName}] ${cause.message}`;
    const nodes = cause.nodes
      ? cause.nodes.map(node => addSubgraphToASTNode(node, subgraphName))
      : undefined;

    const code = errorCodeDef(cause) ?? errorCode;
    if (code) {
      return code.err({
        message,
        nodes,
        source: cause.source,
        positions: cause.positions,
        path: cause.path,
        originalError: cause,
        extensions: cause.extensions,
      });
    } else {
      return new GraphQLError(
        message,
        nodes,
        cause.source,
        cause.positions,
        cause.path,
        cause,
        cause.extensions
      );
    }
  });

  return updatedCauses.length === 1 ? updatedCauses[0] : ErrGraphQLValidationFailed(updatedCauses);
}

class ExternalTester {
  private readonly fakeExternalFields = new Set<string>();
  private readonly providedFields = new Set<string>();
  private readonly externalDirective: DirectiveDefinition<{}>;

  constructor(readonly schema: Schema) {
    this.externalDirective = this.metadata().externalDirective();
    this.collectFakeExternals();
    this.collectProvidedFields();
  }

  private metadata(): FederationMetadata {
    const metadata = federationMetadata(this.schema);
    assert(metadata, 'Schema should be a subgraphs schema');
    return metadata;
  }

  private collectFakeExternals() {
    const metadata = this.metadata();
    const extendsDirective =  metadata.extendsDirective();
    for (const key of metadata.keyDirective().applications()) {
      const parentType = key.parent as CompositeType;
      if (!(key.ofExtension() || parentType.hasAppliedDirective(extendsDirective))) {
        continue;
      }
      collectTargetFields({
        parentType,
        directive: key as Directive<any, {fields: any}>,
        includeInterfaceFieldsImplementations: false,
        validate: false,
      }).filter((field) => field.hasAppliedDirective(this.externalDirective))
        .forEach((field) => this.fakeExternalFields.add(field.coordinate));
    }
  }

  private collectProvidedFields() {
    for (const provides of this.metadata().providesDirective().applications()) {
      const parent = provides.parent as FieldDefinition<CompositeType>;
      collectTargetFields({
        parentType: baseType(parent.type!) as CompositeType,
        directive: provides as Directive<any, {fields: any}>,
        includeInterfaceFieldsImplementations: true,
        validate: false,
      }).forEach((f) => this.providedFields.add(f.coordinate));
    }
  }

  isExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return field.hasAppliedDirective(this.externalDirective) && !this.isFakeExternal(field);
  }

  isFakeExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.fakeExternalFields.has(field.coordinate);
  }

  selectsAnyExternalField(selectionSet: SelectionSet): boolean {
    for (const selection of selectionSet.selections()) {
      if (selection.kind === 'FieldSelection' && this.isExternal(selection.element().definition)) {
        return true;
      }
      if (selection.selectionSet) {
        if (this.selectsAnyExternalField(selection.selectionSet)) {
          return true;
        }
      }
    }
    return false;
  }

  isPartiallyExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.isExternal(field) && this.providedFields.has(field.coordinate);
  }

  isFullyExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.isExternal(field) && !this.providedFields.has(field.coordinate);
  }
}

export type ProvidesOrRequiresApplication = Directive<FieldDefinition<ObjectType | InterfaceType>, {fields: any}>

/*
 * It makes no sense to have a @provides/@requires on a non-external leaf field, and we usually reject it during schema
 * validation but this method allows to remove those for:
 *  1. when we extract subgraphs from a fed 1 supergraph, where such validation hadn't been run.
 *  2. for the fed 1 -> fed 2 upgader code.
 *
 * The reason we do this (and generally reject it) is that such provides/requires have a negative impact on later query
 * planning, because it sometimes make us to try type-exploding some interfaces unecessarily. Besides, if a use add
 * something useless, there is a change it hasn't fully understood something, and warning it about that fact through
 * an error is more helpful.
 */
export function removeInactiveProvidesAndRequires(
  schema: Schema,
  onModified: (field: FieldDefinition<any>, original: ProvidesOrRequiresApplication, updated?: ProvidesOrRequiresApplication) => void = () => {},
) {
  const metadata = federationMetadata(schema);
  if (!metadata) {
    return;
  }
  const providesDirective = metadata.providesDirective();
  const requiresDirective = metadata.requiresDirective();

  for (const type of schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }

    for (const field of type.fields()) {
      const fieldBaseType = baseType(field.type!) as CompositeType;
      removeInactiveApplications(providesDirective, field, fieldBaseType, onModified);
      removeInactiveApplications(requiresDirective, field, type, onModified);
    }
  }
}

function removeInactiveApplications(
  directiveDefinition: DirectiveDefinition<{fields: any}>,
  field: FieldDefinition<any>,
  parentType: CompositeType,
  onModified: (field: FieldDefinition<any>, original: ProvidesOrRequiresApplication, updated?: ProvidesOrRequiresApplication) => void
) {
  for (const application of field.appliedDirectivesOf(directiveDefinition)) {
    let selection;
    try {
      selection = parseFieldSetArgument({parentType, directive: application});
    } catch (e) {
      // This method is sometimes called on federation directives that haven't been validated, and so parsing the
      // `fields` argument may throw. In that case, we just silently ignore that particular directive application:
      // it's not the job of this method to do validation, but we will always validate things in other places
      // when needed so whatever error that directive has will be caught in a more appropriate place.
      continue;
    }
    if (selectsNonExternalLeafField(selection)) {
      application.remove();
      const updated = withoutNonExternalLeafFields(selection);
      if (!updated.isEmpty()) {
        const updatedDirective = field.applyDirective(directiveDefinition, { fields: updated.toString(true, false) });
        onModified(field, application, updatedDirective);
      } else {
        onModified(field, application);
      }
    }
  }
}

function isExternalOrHasExternalImplementations(field: FieldDefinition<CompositeType>): boolean {
  const metadata = federationMetadata(field.schema());
  if (!metadata) {
    return false;
  }
  if (field.hasAppliedDirective(metadata.externalDirective())) {
    return true;
  }
  const parentType = field.parent;
  if (isInterfaceType(parentType)) {
    for (const implem of parentType.possibleRuntimeTypes()) {
      const fieldInImplem = implem.field(field.name);
      if (fieldInImplem && fieldInImplem.hasAppliedDirective(metadata.externalDirective())) {
        return true;
      }
    }
  }
  return false;
}

function selectsNonExternalLeafField(selection: SelectionSet): boolean {
  return selection.selections().some(s => {
    if (s.kind === 'FieldSelection') {
      // If it's external, we're good and don't need to recurse.
      if (isExternalOrHasExternalImplementations(s.field.definition)) {
        return false;
      }
      // Otherwise, we select a non-external if it's a leaf, or the sub-selection does.
      return !s.selectionSet || selectsNonExternalLeafField(s.selectionSet);
    } else {
      return selectsNonExternalLeafField(s.selectionSet);
    }
  });
}

function withoutNonExternalLeafFields(selectionSet: SelectionSet): SelectionSet {
  const newSelectionSet = new SelectionSet(selectionSet.parentType);
  for (const selection of selectionSet.selections()) {
    if (selection.kind === 'FieldSelection') {
      if (isExternalOrHasExternalImplementations(selection.field.definition)) {
        // That field is external, so we can add the selection back entirely.
        newSelectionSet.add(selection);
        continue;
      }
    }
    // Note that for fragments will always be true (and we just recurse), while
    // for fields, we'll only get here if the field is not external, and so
    // we want to add the selection only if it's not a leaf and even then, only
    // the part where we've recursed.
    if (selection.selectionSet) {
      const updated = withoutNonExternalLeafFields(selection.selectionSet);
      if (!updated.isEmpty()) {
        newSelectionSet.add(selectionOfElement(selection.element(), updated));
      }
    }
  }
  return newSelectionSet;
}
