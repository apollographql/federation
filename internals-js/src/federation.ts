import {
  allSchemaRootKinds,
  baseType,
  CompositeType,
  CoreFeature,
  defaultRootName,
  Directive,
  DirectiveDefinition,
  ErrGraphQLValidationFailed,
  Extension,
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
  SchemaConfig,
  SchemaDefinition,
  SchemaElement,
  sourceASTs,
  UnionType,
} from "./definitions";
import { assert, MultiMap, printHumanReadableList, OrderedMap, mapValues } from "./utils";
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
  GraphQLErrorOptions,
  SchemaDefinitionNode,
  OperationTypeNode,
  OperationTypeDefinitionNode,
  ConstDirectiveNode,
} from "graphql";
import { KnownTypeNamesInFederationRule } from "./validation/KnownTypeNamesInFederationRule";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { parseSelectionSet, SelectionSet } from './operations';
import { TAG_VERSIONS } from "./specs/tagSpec";
import {
  errorCodeDef,
  ErrorCodeDefinition,
  ERROR_CATEGORIES,
  ERRORS,
  withModifiedErrorMessage,
  extractGraphQLErrorOptions,
  errorCauses,
} from "./error";
import { computeShareables } from "./precompute";
import {
  CoreSpecDefinition,
  FeatureVersion,
  LINK_VERSIONS,
  LinkDirectiveArgs,
  linkDirectiveDefaultName,
  linkIdentity,
  FeatureUrl,
  CoreImport,
  extractCoreFeatureImports,
  CoreOrLinkDirectiveArgs,
} from "./specs/coreSpec";
import {
  FEDERATION_VERSIONS,
  federationIdentity,
  FederationDirectiveName,
  FederationTypeName,
  FEDERATION1_TYPES,
  FEDERATION1_DIRECTIVES,
} from "./specs/federationSpec";
import { defaultPrintOptions, PrintOptions as PrintOptions, printSchema } from "./print";
import { createObjectTypeSpecification, createScalarTypeSpecification, createUnionTypeSpecification } from "./directiveAndTypeSpecification";
import { didYouMean, suggestionList } from "./suggestions";
import { coreFeatureDefinitionIfKnown, validateKnownFeatures } from "./knownCoreFeatures";
import { joinIdentity } from "./specs/joinSpec";
import {
  SourceAPIDirectiveArgs,
  SourceFieldDirectiveArgs,
  SourceTypeDirectiveArgs,
} from "./specs/sourceSpec";

const linkSpec = LINK_VERSIONS.latest();
const tagSpec = TAG_VERSIONS.latest();
const federationSpec = FEDERATION_VERSIONS.latest();
// Some users rely on auto-expanding fed v1 graphs with fed v2 directives. While technically we should only expand @tag
// directive from v2 definitions, we will continue expanding other directives (up to v2.4) to ensure backwards compatibility.
const autoExpandedFederationSpec = FEDERATION_VERSIONS.find(new FeatureVersion(2, 4))!;

// We don't let user use this as a subgraph name. That allows us to use it in `query graphs` to name the source of roots
// in the "federated query graph" without worrying about conflict (see `FEDERATED_GRAPH_ROOT_SOURCE` in `querygraph.ts`).
// (note that we could deal with this in other ways, but having a graph named '_' feels like a terrible idea anyway, so
// disallowing it feels like more a good thing than a real restriction).
export const FEDERATION_RESERVED_SUBGRAPH_NAME = '_';

export const FEDERATION_UNNAMED_SUBGRAPH_NAME = '<unnamed>';

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

const ALL_DEFAULT_FEDERATION_DIRECTIVE_NAMES: string[] = Object.values(FederationDirectiveName);

/**
 * Federation 1 has that specificity that it wasn't using @link to name-space federation elements,
 * and so to "distinguish" the few federation type names, it prefixed those with a `_`. That is,
 * the `FieldSet` type was named `_FieldSet` in federation1. To handle this without too much effort,
 * we use a fake `CoreFeature` with imports for all the fed1 types to use those specific "aliases"
 * and we pass it when adding those types. This allows to reuse the same `TypeSpecification` objects
 * for both fed1 and fed2. Note that in the object below, all that is used is the imports, the rest
 * is just filling the blanks.
 */
const FAKE_FED1_CORE_FEATURE_TO_RENAME_TYPES: CoreFeature = new CoreFeature(
  new FeatureUrl('<fed1>', 'fed1', new FeatureVersion(0, 1)),
  'fed1',
  new Directive('fed1'),
  FEDERATION1_TYPES.map((spec) => ({ name: spec.name, as: '_' + spec.name})),
);


function validateFieldSetSelections({
  directiveName,
  selectionSet,
  hasExternalInParents,
  metadata,
  onError,
  allowOnNonExternalLeafFields,
  allowFieldsWithArguments,
}: {
  directiveName: string,
  selectionSet: SelectionSet,
  hasExternalInParents: boolean,
  metadata: FederationMetadata,
  onError: (error: GraphQLError) => void,
  allowOnNonExternalLeafFields: boolean,
  allowFieldsWithArguments: boolean,
}): void {
  for (const selection of selectionSet.selections()) {
    const appliedDirectives = selection.element.appliedDirectives;
    if (appliedDirectives.length > 0) {
      onError(ERROR_CATEGORIES.DIRECTIVE_IN_FIELDS_ARG.get(directiveName).err(
        `cannot have directive applications in the @${directiveName}(fields:) argument but found ${appliedDirectives.join(', ')}.`,
      ));
    }

    if (selection.kind === 'FieldSelection') {
      const field = selection.element.definition;
      const isExternal = metadata.isFieldExternal(field);
      if (!allowFieldsWithArguments && field.hasArguments()) {
        onError(ERROR_CATEGORIES.FIELDS_HAS_ARGS.get(directiveName).err(
          `field ${field.coordinate} cannot be included because it has arguments (fields with argument are not allowed in @${directiveName})`,
          { nodes: field.sourceAST },
        ));
      }
      // The field must be external if we don't allow non-external leaf fields, it's a leaf, and we haven't traversed an external field in parent chain leading here.
      const mustBeExternal = !selection.selectionSet && !allowOnNonExternalLeafFields && !hasExternalInParents;
      if (!isExternal && mustBeExternal) {
        const errorCode = ERROR_CATEGORIES.DIRECTIVE_FIELDS_MISSING_EXTERNAL.get(directiveName);
        if (metadata.isFieldFakeExternal(field)) {
          onError(errorCode.err(
            `field "${field.coordinate}" should not be part of a @${directiveName} since it is already "effectively" provided by this subgraph `
              + `(while it is marked @${FederationDirectiveName.EXTERNAL}, it is a @${FederationDirectiveName.KEY} field of an extension type, which are not internally considered external for historical/backward compatibility reasons)`,
            { nodes: field.sourceAST }
          ));
        } else {
          onError(errorCode.err(
            `field "${field.coordinate}" should not be part of a @${directiveName} since it is already provided by this subgraph (it is not marked @${FederationDirectiveName.EXTERNAL})`,
            { nodes: field.sourceAST }
          ));
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
            if (fieldInImplem && metadata.isFieldExternal(fieldInImplem)) {
              newHasExternalInParents = true;
              break;
            }
          }
        }
        validateFieldSetSelections({
          directiveName,
          selectionSet: selection.selectionSet,
          hasExternalInParents: newHasExternalInParents,
          metadata,
          onError,
          allowOnNonExternalLeafFields,
          allowFieldsWithArguments,
        });
      }
    } else {
      validateFieldSetSelections({
        directiveName,
        selectionSet: selection.selectionSet,
        hasExternalInParents,
        metadata,
        onError,
        allowOnNonExternalLeafFields,
        allowFieldsWithArguments,
      });
    }
  }
}

function validateFieldSet({
  type,
  directive,
  metadata,
  errorCollector,
  allowOnNonExternalLeafFields,
  allowFieldsWithArguments,
  onFields,
}: {
  type: CompositeType,
  directive: Directive<any, {fields: any}>,
  metadata: FederationMetadata,
  errorCollector: GraphQLError[],
  allowOnNonExternalLeafFields: boolean,
  allowFieldsWithArguments: boolean,
  onFields?: (field: FieldDefinition<any>) => void,
}): void {
  try {
    // Note that `parseFieldSetArgument` already properly format the error, hence the separate try-catch.
    // TODO: `parseFieldSetArgument` throws on the first issue found and never accumulate multiple
    // errors. We could fix this, but this require changes that reaches beyond this single file, so
    // we leave this for "later" (the `fields` value are rarely very big, so the benefit of accumulating
    // multiple errors within one such value is not tremendous, so that this doesn't feel like a pressing
    // issue).
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
    validateFieldSetSelections({
      directiveName: directive.name,
      selectionSet,
      hasExternalInParents: false,
      metadata,
      onError: (error) => errorCollector.push(handleFieldSetValidationError(directive, error)),
      allowOnNonExternalLeafFields,
      allowFieldsWithArguments,
    });
  } catch (e) {
    if (e instanceof GraphQLError) {
      errorCollector.push(e);
    } else {
      throw e;
    }
  }
}

function handleFieldSetValidationError(
  directive: Directive<any, {fields: any}>,
  originalError: GraphQLError,
  messageUpdater?: (msg: string) => string,
): GraphQLError {
  const nodes = sourceASTs(directive);
  if (originalError.nodes) {
    nodes.push(...originalError.nodes);
  }
  let codeDef = errorCodeDef(originalError);
  // "INVALID_GRAPHQL" errors happening during validation means that the selection set is invalid, and
  // that's where we want to use a more precise code.
  if (!codeDef || codeDef === ERRORS.INVALID_GRAPHQL) {
    codeDef = ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS.get(directive.name);
  }
  let msg = originalError.message.trim();
  if (messageUpdater) {
    msg = messageUpdater(msg);
  }
  return codeDef.err(
    `${fieldSetErrorDescriptor(directive)}: ${msg}`,
    {
      nodes,
      originalError,
    }
  );
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

function validateAllFieldSet<TParent extends SchemaElement<any, any>>({
  definition,
  targetTypeExtractor,
  errorCollector,
  metadata,
  isOnParentType = false,
  allowOnNonExternalLeafFields = false,
  allowFieldsWithArguments = false,
  allowOnInterface = false,
  onFields,
}: {
  definition: DirectiveDefinition<{fields: any}>,
  targetTypeExtractor: (element: TParent) => CompositeType,
  errorCollector: GraphQLError[],
  metadata: FederationMetadata,
  isOnParentType?: boolean,
  allowOnNonExternalLeafFields?: boolean,
  allowFieldsWithArguments?: boolean,
  allowOnInterface?: boolean,
  onFields?: (field: FieldDefinition<any>) => void,
}): void {
  for (const application of definition.applications()) {
    const elt = application.parent as TParent;
    const type = targetTypeExtractor(elt);
    const parentType = isOnParentType ? type : (elt.parent as NamedType);
    if (isInterfaceType(parentType) && !allowOnInterface) {
      const code = ERROR_CATEGORIES.DIRECTIVE_UNSUPPORTED_ON_INTERFACE.get(definition.name);
      errorCollector.push(code.err(
        isOnParentType
          ? `Cannot use ${definition.coordinate} on interface "${parentType.coordinate}": ${definition.coordinate} is not yet supported on interfaces`
          : `Cannot use ${definition.coordinate} on ${fieldSetTargetDescription(application)} of parent type "${parentType}": ${definition.coordinate} is not yet supported within interfaces`,
        { nodes: sourceASTs(application).concat(isOnParentType ? [] : sourceASTs(type)) },
      ));
    }
    validateFieldSet({
      type,
      directive: application,
      metadata,
      errorCollector,
      allowOnNonExternalLeafFields,
      allowFieldsWithArguments,
      onFields,
    });
  }
}

export function collectUsedFields(metadata: FederationMetadata): Set<FieldDefinition<CompositeType>> {
  const usedFields = new Set<FieldDefinition<CompositeType>>();

  // Collects all external fields used by a key, requires or provides
  collectUsedFieldsForDirective<CompositeType>(
    metadata.keyDirective(),
    type => type,
    usedFields,
  );
  collectUsedFieldsForDirective<FieldDefinition<CompositeType>>(
    metadata.requiresDirective(),
    field => field.parent!,
    usedFields,
  );
  collectUsedFieldsForDirective<FieldDefinition<CompositeType>>(
    metadata.providesDirective(),
    field => {
      const type = baseType(field.type!);
      return isCompositeType(type) ? type : undefined;
    },
    usedFields,
  );

  // Collects all fields used to satisfy an interface constraint
  for (const itfType of metadata.schema.interfaceTypes()) {
    const runtimeTypes = itfType.possibleRuntimeTypes();
    for (const field of itfType.fields()) {
      for (const runtimeType of runtimeTypes) {
        const implemField = runtimeType.field(field.name);
        if (implemField) {
          usedFields.add(implemField);
        }
      }
    }
  }

  return usedFields;
}

function collectUsedFieldsForDirective<TParent extends SchemaElement<any, any>>(
  definition: DirectiveDefinition<{fields: any}>,
  targetTypeExtractor: (element: TParent) => CompositeType | undefined,
  usedFieldDefs: Set<FieldDefinition<CompositeType>>
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
    }).forEach((field) => usedFieldDefs.add(field));
  }
}

/**
 * Checks that all fields marked @external is used in a federation directive (@key, @provides or @requires) _or_ to satisfy an
 * interface implementation. Otherwise, the field declaration is somewhat useless.
 */
function validateAllExternalFieldsUsed(metadata: FederationMetadata, errorCollector: GraphQLError[]): void {
  for (const type of metadata.schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    for (const field of type.fields()) {
      if (!metadata.isFieldExternal(field) || metadata.isFieldUsed(field)) {
        continue;
      }

      errorCollector.push(ERRORS.EXTERNAL_UNUSED.err(
        `Field "${field.coordinate}" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface;`
        + ' the field declaration has no use and should be removed (or the field should not be @external).',
        { nodes: field.sourceAST },
      ));
    }
  }
}

function validateNoExternalOnInterfaceFields(metadata: FederationMetadata, errorCollector: GraphQLError[]) {
  for (const itf of metadata.schema.interfaceTypes()) {
    for (const field of itf.fields()) {
      if (metadata.isFieldExternal(field)) {
        errorCollector.push(ERRORS.EXTERNAL_ON_INTERFACE.err(
          `Interface type field "${field.coordinate}" is marked @external but @external is not allowed on interface fields (it is nonsensical).`,
          { nodes: field.sourceAST },
        ));
      }
    }
  }
}

function validateKeyOnInterfacesAreAlsoOnAllImplementations(metadata: FederationMetadata, errorCollector: GraphQLError[]): void {
  for (const itfType of metadata.schema.interfaceTypes()) {
    const implementations = itfType.possibleRuntimeTypes();
    for (const keyApplication of itfType.appliedDirectivesOf(metadata.keyDirective())) {
      // Note that we will always have validated all @key fields at this point, so not bothering with extra validation
      const fields = parseFieldSetArgument({parentType: itfType, directive: keyApplication, validate: false});
      const isResolvable = !(keyApplication.arguments().resolvable === false);
      const implementationsWithKeyButNotResolvable = new Array<ObjectType>();
      const implementationsMissingKey = new Array<ObjectType>();
      for (const type of implementations) {
        const matchingApp = type.appliedDirectivesOf(metadata.keyDirective()).find((app) => {
          const appFields = parseFieldSetArgument({parentType: type, directive: app, validate: false});
          return fields.equals(appFields);
        });
        if (matchingApp) {
          if (isResolvable && matchingApp.arguments().resolvable === false) {
            implementationsWithKeyButNotResolvable.push(type);
          }
        } else {
          implementationsMissingKey.push(type);
        }
      }

      if (implementationsMissingKey.length > 0) {
        const typesString = printHumanReadableList(
          implementationsMissingKey.map((i) => `"${i.coordinate}"`),
          {
            prefix: 'type',
            prefixPlural: 'types',
          }
        );
        errorCollector.push(ERRORS.INTERFACE_KEY_NOT_ON_IMPLEMENTATION.err(
          `Key ${keyApplication} on interface type "${itfType.coordinate}" is missing on implementation ${typesString}.`,
          { nodes: sourceASTs(...implementationsMissingKey) },
        ));
      } else if (implementationsWithKeyButNotResolvable.length > 0) {
        const typesString = printHumanReadableList(
          implementationsWithKeyButNotResolvable.map((i) => `"${i.coordinate}"`),
          {
            prefix: 'type',
            prefixPlural: 'types',
          }
        );
        errorCollector.push(ERRORS.INTERFACE_KEY_NOT_ON_IMPLEMENTATION.err(
          `Key ${keyApplication} on interface type "${itfType.coordinate}" should be resolvable on all implementation types, but is declared with argument "@key(resolvable:)" set to false in ${typesString}.`,
          { nodes: sourceASTs(...implementationsWithKeyButNotResolvable) },
        ));
      }
    }
  }
}

function validateInterfaceObjectsAreOnEntities(metadata: FederationMetadata, errorCollector: GraphQLError[]): void {
  for (const application of metadata.interfaceObjectDirective().applications()) {
    if (!isEntityType(application.parent)) {
      errorCollector.push(ERRORS.INTERFACE_OBJECT_USAGE_ERROR.err(
        `The @interfaceObject directive can only be applied to entity types but type "${application.parent.coordinate}" has no @key in this subgraph.`,
        { nodes: application.parent.sourceAST }
      ));
    }
  }
}

function validateShareableNotRepeatedOnSameDeclaration(
  element: ObjectType | FieldDefinition<ObjectType>,
  metadata: FederationMetadata,
  errorCollector: GraphQLError[],
) {
  const shareableApplications: Directive[] = element.appliedDirectivesOf(metadata.shareableDirective());
  if (shareableApplications.length <= 1) {
    return;
  }

  type ByExtensions = {
    without: Directive<any, {}>[],
    with: MultiMap<Extension<any>, Directive<any, {}>>,
  };
  const byExtensions = shareableApplications.reduce<ByExtensions>(
    (acc, v) => {
      const ext = v.ofExtension();
      if (ext) {
        acc.with.add(ext, v);
      } else {
        acc.without.push(v);
      }
      return acc;
    },
    { without: [], with: new MultiMap() }
  );
  const groups = [ byExtensions.without ].concat(mapValues(byExtensions.with));
  for (const group of groups) {
    if (group.length > 1) {
      const eltStr = element.kind === 'ObjectType'
        ? `the same type declaration of "${element.coordinate}"`
        : `field "${element.coordinate}"`;
      errorCollector.push(ERRORS.INVALID_SHAREABLE_USAGE.err(
        `Invalid duplicate application of @shareable on ${eltStr}: `
        + '@shareable is only repeatable on types so it can be used simultaneously on a type definition and its extensions, but it should not be duplicated on the same definition/extension declaration',
        { nodes: sourceASTs(...group) },
      ));
    }
  }
}

export class FederationMetadata {
  private _externalTester?: ExternalTester;
  private _sharingPredicate?: (field: FieldDefinition<CompositeType>) => boolean;
  private _fieldUsedPredicate?: (field: FieldDefinition<CompositeType>) => boolean;
  private _isFed2Schema?: boolean;

  constructor(readonly schema: Schema) {}

  private onInvalidate() {
    this._externalTester = undefined;
    this._sharingPredicate = undefined;
    this._isFed2Schema = undefined;
    this._fieldUsedPredicate = undefined;
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
      this._externalTester = new ExternalTester(this.schema, this.isFed2Schema());
    }
    return this._externalTester;
  }

  private sharingPredicate(): (field: FieldDefinition<CompositeType>) => boolean {
    if (!this._sharingPredicate) {
      this._sharingPredicate = computeShareables(this.schema);
    }
    return this._sharingPredicate;
  }

  private fieldUsedPredicate(): (field: FieldDefinition<CompositeType>) => boolean {
    if (!this._fieldUsedPredicate) {
      const usedFields = collectUsedFields(this);
      this._fieldUsedPredicate = (field: FieldDefinition<CompositeType>) => !!usedFields.has(field);
    }
    return this._fieldUsedPredicate;
  }

  isFieldUsed(field: FieldDefinition<CompositeType>): boolean {
    return this.fieldUsedPredicate()(field);
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

  isInterfaceObjectType(type: NamedType): type is ObjectType {
    return isObjectType(type)
      && hasAppliedDirective(type, this.interfaceObjectDirective());
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

  // Should only be be called for "legacy" directives, those that existed in 2.0. This
  // allow to avoiding have to double-check the directive exists every time when we
  // know it will always exists (note that even though we accept fed1 schema as inputs,
  // those are almost immediately converted to fed2 ones by the `SchemaUpgrader`, so
  // we include @shareable or @override in those "legacy" directives).
  private getLegacyFederationDirective<TApplicationArgs extends {[key: string]: any}>(
    name: FederationDirectiveName
  ): DirectiveDefinition<TApplicationArgs> {
    const directive = this.getFederationDirective<TApplicationArgs>(name);
    assert(directive, `The provided schema does not have federation directive @${name}`);
    return directive;
  }

  private getFederationDirective<TApplicationArgs extends {[key: string]: any}>(
    name: FederationDirectiveName
  ): DirectiveDefinition<TApplicationArgs> | undefined {
    return this.schema.directive(this.federationDirectiveNameInSchema(name)) as DirectiveDefinition<TApplicationArgs> | undefined;
  }

  private getPost20FederationDirective<TApplicationArgs extends {[key: string]: any}>(
    name: FederationDirectiveName
  ): Post20FederationDirectiveDefinition<TApplicationArgs> {
    return this.getFederationDirective<TApplicationArgs>(name) ?? {
      name,
      applications: () => new Array<Directive<any, TApplicationArgs>>(),
    };
  }

  keyDirective(): DirectiveDefinition<{fields: any, resolvable?: boolean}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.KEY);
  }

  overrideDirective(): DirectiveDefinition<{from: string, label?: string}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.OVERRIDE);
  }

  extendsDirective(): DirectiveDefinition<Record<string, never>> {
    return this.getLegacyFederationDirective(FederationDirectiveName.EXTENDS);
  }

  externalDirective(): DirectiveDefinition<{reason: string}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.EXTERNAL);
  }

  requiresDirective(): DirectiveDefinition<{fields: any}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.REQUIRES);
  }

  providesDirective(): DirectiveDefinition<{fields: any}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.PROVIDES);
  }

  shareableDirective(): DirectiveDefinition<{}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.SHAREABLE);
  }

  tagDirective(): DirectiveDefinition<{name: string}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.TAG);
  }

  composeDirective(): Post20FederationDirectiveDefinition<{name: string}> {
    return this.getPost20FederationDirective(FederationDirectiveName.COMPOSE_DIRECTIVE);
  }

  inaccessibleDirective(): DirectiveDefinition<{}> {
    return this.getLegacyFederationDirective(FederationDirectiveName.INACCESSIBLE);
  }

  interfaceObjectDirective(): Post20FederationDirectiveDefinition<{}> {
    return this.getPost20FederationDirective(FederationDirectiveName.INTERFACE_OBJECT);
  }

  authenticatedDirective(): Post20FederationDirectiveDefinition<{}> {
    return this.getPost20FederationDirective(FederationDirectiveName.AUTHENTICATED);
  }

  requiresScopesDirective(): Post20FederationDirectiveDefinition<{scopes: string[]}> {
    return this.getPost20FederationDirective(FederationDirectiveName.REQUIRES_SCOPES);
  }

  policyDirective(): Post20FederationDirectiveDefinition<{scopes: string[]}> {
    return this.getPost20FederationDirective(FederationDirectiveName.POLICY);
  }

  sourceAPIDirective(): Post20FederationDirectiveDefinition<SourceAPIDirectiveArgs> {
    return this.getPost20FederationDirective(FederationDirectiveName.SOURCE_API);
  }

  sourceTypeDirective(): Post20FederationDirectiveDefinition<SourceTypeDirectiveArgs> {
    return this.getPost20FederationDirective(FederationDirectiveName.SOURCE_TYPE);
  }

  sourceFieldDirective(): Post20FederationDirectiveDefinition<SourceFieldDirectiveArgs> {
    return this.getPost20FederationDirective(FederationDirectiveName.SOURCE_FIELD);
  }

  allFederationDirectives(): DirectiveDefinition[] {
    const baseDirectives: DirectiveDefinition[] = [
      this.keyDirective(),
      this.externalDirective(),
      this.requiresDirective(),
      this.providesDirective(),
      this.tagDirective(),
      this.extendsDirective(),
    ];
    if (!this.isFed2Schema()) {
      return baseDirectives;
    }

    baseDirectives.push(this.shareableDirective());
    baseDirectives.push(this.inaccessibleDirective());
    baseDirectives.push(this.overrideDirective());
    const composeDirective = this.composeDirective();
    if (isFederationDirectiveDefinedInSchema(composeDirective)) {
      baseDirectives.push(composeDirective);
    }
    const interfaceObjectDirective = this.interfaceObjectDirective();
    if (isFederationDirectiveDefinedInSchema(interfaceObjectDirective)) {
      baseDirectives.push(interfaceObjectDirective);
    }

    const authenticatedDirective = this.authenticatedDirective();
    if (isFederationDirectiveDefinedInSchema(authenticatedDirective)) {
      baseDirectives.push(authenticatedDirective);
    }

    const requiresScopesDirective = this.requiresScopesDirective();
    if (isFederationDirectiveDefinedInSchema(requiresScopesDirective)) {
      baseDirectives.push(requiresScopesDirective);
    }

    const policyDirective = this.policyDirective();
    if (isFederationDirectiveDefinedInSchema(policyDirective)) {
      baseDirectives.push(policyDirective);
    }

    const sourceAPIDirective = this.sourceAPIDirective();
    if (isFederationDirectiveDefinedInSchema(sourceAPIDirective)) {
      baseDirectives.push(sourceAPIDirective);
    }
    const sourceTypeDirective = this.sourceTypeDirective();
    if (isFederationDirectiveDefinedInSchema(sourceTypeDirective)) {
      baseDirectives.push(sourceTypeDirective);
    }
    const sourceFieldDirective = this.sourceFieldDirective();
    if (isFederationDirectiveDefinedInSchema(sourceFieldDirective)) {
      baseDirectives.push(sourceFieldDirective);
    }

    return baseDirectives;
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
    return this.schema.type(this.federationTypeNameInSchema(FederationTypeName.FIELD_SET)) as ScalarType;
  }

  allFederationTypes(): NamedType[] {
    // We manually include the `_Any`, `_Service` and `Entity` types because there are not strictly
    // speaking part of the federation @link spec.
    const fedTypes: NamedType[] = [
      this.anyType(),
      this.serviceType(),
    ];

    const fedFeature = this.federationFeature();
    if (fedFeature) {
      const featureDef = FEDERATION_VERSIONS.find(fedFeature.url.version);
      assert(featureDef, () => `Federation spec should be known, but got ${fedFeature.url}`);
      for (const typeSpec of featureDef.typeSpecs()) {
        const type = this.schema.type(fedFeature.typeNameInSchema(typeSpec.name));
        if (type) {
          fedTypes.push(type);
        }
      }
    } else {
      // Fed1: the only type we had was _FieldSet.
      fedTypes.push(this.fieldSetType());
    }

    const entityType = this.entityType();
    if (entityType) {
      fedTypes.push(entityType);
    }
    return fedTypes;
  }
}

export type FederationDirectiveNotDefinedInSchema<TApplicationArgs extends {[key: string]: any}> = {
  name: string,
  applications: () => readonly Directive<any, TApplicationArgs>[],
}

export type Post20FederationDirectiveDefinition<TApplicationArgs extends {[key: string]: any}> =
  DirectiveDefinition<TApplicationArgs>
  | FederationDirectiveNotDefinedInSchema<TApplicationArgs>;

export function isFederationDirectiveDefinedInSchema<TApplicationArgs extends {[key: string]: any}>(
  definition: Post20FederationDirectiveDefinition<TApplicationArgs>
): definition is DirectiveDefinition<TApplicationArgs> {
  return definition instanceof DirectiveDefinition;
}

export function hasAppliedDirective(type: NamedType, definition: Post20FederationDirectiveDefinition<any>): boolean {
  return isFederationDirectiveDefinedInSchema(definition) && type.hasAppliedDirective(definition);
}

export class FederationBlueprint extends SchemaBlueprint {
  constructor(private readonly withRootTypeRenaming: boolean) {
    super();
  }

  onAddedCoreFeature(schema: Schema, feature: CoreFeature) {
    super.onAddedCoreFeature(schema, feature);
    if (feature.url.identity === federationIdentity) {
      const spec = FEDERATION_VERSIONS.find(feature.url.version);
      if (spec) {
        spec.addElementsToSchema(schema);
      }
    }
  }

  onMissingDirectiveDefinition(schema: Schema, directive: Directive): DirectiveDefinition | GraphQLError[] | undefined {
    if (directive.name === linkDirectiveDefaultName) {
      const args = directive.arguments();
      const url = args && (args['url'] as string | undefined);
      let as: string | undefined = undefined;
      let imports: CoreImport[] = [];
      if (url && url.startsWith(linkSpec.identity)) {
        as = args['as'] as string | undefined;
        imports = extractCoreFeatureImports(linkSpec.url, directive as Directive<SchemaDefinition, CoreOrLinkDirectiveArgs>);
      }
      const errors = linkSpec.addDefinitionsToSchema(schema, as, imports);
      return errors.length > 0 ? errors : schema.directive(directive.name);
    }
    return super.onMissingDirectiveDefinition(schema, directive);
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

  onDirectiveDefinitionAndSchemaParsed(schema: Schema): GraphQLError[] {
    const errors = completeSubgraphSchema(schema);
    schema.schemaDefinition.processUnappliedDirectives();
    return errors;
  }

  onInvalidation(schema: Schema) {
    super.onInvalidation(schema);
    const metadata = federationMetadata(schema);
    assert(metadata, 'Federation schema should have had its metadata set on construction');
    FederationMetadata.prototype['onInvalidate'].call(metadata);
  }

  onValidation(schema: Schema): GraphQLError[] {
    const errorCollector = super.onValidation(schema);

    // We rename all root type to their default names (we do here rather than in `prepareValidation` because
    // that can actually fail).
    if (this.withRootTypeRenaming) {
      for (const k of allSchemaRootKinds) {
        const type = schema.schemaDefinition.root(k)?.type;
        const defaultName = defaultRootName(k);
        if (type && type.name !== defaultName) {
          // We first ensure there is no other type using the default root name. If there is, this is a
          // composition error.
          const existing = schema.type(defaultName);
          if (existing) {
            errorCollector.push(ERROR_CATEGORIES.ROOT_TYPE_USED.get(k).err(
              `The schema has a type named "${defaultName}" but it is not set as the ${k} root type ("${type.name}" is instead): `
              + 'this is not supported by federation. '
              + 'If a root type does not use its default name, there should be no other type with that default name.',
              { nodes: sourceASTs(type, existing) },
            ));
          }
          type.rename(defaultName);
        }
      }
    }

    const metadata = federationMetadata(schema);
    assert(metadata, 'Federation schema should have had its metadata set on construction');
    // We skip the rest of validation for fed1 schema because there is a number of validation that is stricter than what fed 1
    // accepted, and some of those issues are fixed by `SchemaUpgrader`. So insofar as any fed 1 scheam is ultimately converted
    // to a fed 2 one before composition, then skipping some validation on fed 1 schema is fine.
    if (!metadata.isFed2Schema()) {
      return errorCollector;
    }

    // We validate the @key, @requires and @provides.
    const keyDirective = metadata.keyDirective();
    validateAllFieldSet<CompositeType>({
      definition: keyDirective,
      targetTypeExtractor: type => type,
      errorCollector,
      metadata,
      isOnParentType: true,
      allowOnNonExternalLeafFields: true,
      allowOnInterface: metadata.federationFeature()!.url.version.compareTo(new FeatureVersion(2, 3)) >= 0,
      onFields: field => {
        const type = baseType(field.type!);
        if (isUnionType(type) || isInterfaceType(type)) {
          let kind: string = type.kind;
          kind = kind.slice(0, kind.length - 'Type'.length);
          throw ERRORS.KEY_FIELDS_SELECT_INVALID_TYPE.err(
            `field "${field.coordinate}" is a ${kind} type which is not allowed in @key`,
          );
        }
      }
    });
    // Note that we currently reject @requires where a leaf field of the selection is not external,
    // because if it's provided by the current subgraph, why "requires" it? That said, it's not 100%
    // nonsensical if you wanted a local field to be part of the subgraph fetch even if it's not
    // truly queried _for some reason_. But it's unclear such reasons exists, so for now we prefer
    // rejecting it as it also make it less likely user misunderstand what @requires actually do.
    // But we could consider lifting that limitation if users comes with a good rational for allowing
    // it.
    validateAllFieldSet<FieldDefinition<CompositeType>>({
      definition: metadata.requiresDirective(),
      targetTypeExtractor: field => field.parent,
      errorCollector,
      metadata,
      allowFieldsWithArguments: true,
    });
    // Note that like for @requires above, we error out if a leaf field of the selection is not
    // external in a @provides (we pass `false` for the `allowOnNonExternalLeafFields` parameter),
    // but contrarily to @requires, there is probably no reason to ever change this, as a @provides
    // of a field already provides is 100% nonsensical.
    validateAllFieldSet<FieldDefinition<CompositeType>>({
      definition: metadata.providesDirective(),
      targetTypeExtractor: field => {
        if (metadata.isFieldExternal(field)) {
          throw ERRORS.EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE.err(
            `Cannot have both @provides and @external on field "${field.coordinate}"`,
            { nodes: field.sourceAST },
          );
        }
        const type = baseType(field.type!);
        if (!isCompositeType(type)) {
          throw ERRORS.PROVIDES_ON_NON_OBJECT_FIELD.err(
            `Invalid @provides directive on field "${field.coordinate}": field has type "${field.type}" which is not a Composite Type`,
            { nodes: field.sourceAST },
          );
        }
        return type;
      },
      errorCollector,
      metadata,
    });

    validateNoExternalOnInterfaceFields(metadata, errorCollector);
    validateAllExternalFieldsUsed(metadata, errorCollector);
    validateKeyOnInterfacesAreAlsoOnAllImplementations(metadata, errorCollector);
    validateInterfaceObjectsAreOnEntities(metadata, errorCollector);

    // FeatureDefinition objects passed to registerKnownFeature can register
    // validation functions for subgraph schemas by overriding the
    // validateSubgraphSchema method.
    validateKnownFeatures(schema, errorCollector);

    // If tag is redefined by the user, make sure the definition is compatible with what we expect
    const tagDirective = metadata.tagDirective();
    if (tagDirective) {
      const error = tagSpec.checkCompatibleDirective(tagDirective);
      if (error) {
        errorCollector.push(error);
      }
    }

    // While @shareable is "repeatable", this is only so one can use it on both a main
    // type definition _and_ possible other type extensions. But putting 2 @shareable
    // on the same type definition or field is both useless, and suggest some miscomprehension,
    // so we reject it with an (hopefully helpful) error message.
    for (const objectType of schema.objectTypes()) {
      validateShareableNotRepeatedOnSameDeclaration(objectType, metadata, errorCollector);
      for (const field of objectType.fields()) {
        validateShareableNotRepeatedOnSameDeclaration(field, metadata, errorCollector);
      }
    }
    // Additionally, reject using @shareable on an interface field, as that does not actually
    // make sense.
    for (const shareableApplication of metadata.shareableDirective().applications()) {
      const element = shareableApplication.parent;
      if (element instanceof FieldDefinition && !isObjectType(element.parent)) {
        errorCollector.push(ERRORS.INVALID_SHAREABLE_USAGE.err(
          `Invalid use of @shareable on field "${element.coordinate}": only object type fields can be marked with @shareable`,
          { nodes: sourceASTs(shareableApplication, element.parent) },
        ));
      }
    }

    return errorCollector;
  }

  validationRules(): readonly SDLValidationRule[] {
    return FEDERATION_VALIDATION_RULES;
  }

  onUnknownDirectiveValidationError(schema: Schema, unknownDirectiveName: string, error: GraphQLError): GraphQLError {
    const metadata = federationMetadata(schema);
    assert(metadata, `This method should only have been called on a subgraph schema`)
    if (ALL_DEFAULT_FEDERATION_DIRECTIVE_NAMES.includes(unknownDirectiveName)) {
      // The directive name is "unknown" but it is a default federation directive name. So it means one of a few things
      // happened:
      //  1. it's a fed1 schema but the directive is a fed2 only one (only possible case for fed1 schema).
      //  2. the directive has not been imported at all (so needs to be prefixed for it to work).
      //  3. the directive has an `import`, but it's been aliased to another name.
      if (metadata.isFed2Schema()) {
        const federationFeature = metadata.federationFeature();
        assert(federationFeature, 'Fed2 subgraph _must_ link to the federation feature')
        const directiveNameInSchema = federationFeature.directiveNameInSchema(unknownDirectiveName);
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
      const suggestions = suggestionList(unknownDirectiveName, ALL_DEFAULT_FEDERATION_DIRECTIVE_NAMES);
      if (suggestions.length > 0) {
        return withModifiedErrorMessage(
          error,
          `${error.message}${didYouMean(suggestions.map((s) => '@' + s))} If so, note that ${suggestions.length === 1 ? 'it is a federation 2 directive' : 'they are federation 2 directives'} but this schema is a federation 1 one. To be a federation 2 schema, it needs to @link to the federation specifcation v2.`
        );
      }
    }
    return error;
  }

  applyDirectivesAfterParsing() {
    return true;
  }
}

function findUnusedNamedForLinkDirective(schema: Schema): string | undefined {
  if (!schema.directive(linkSpec.url.name)) {
    return undefined;
  }

  // The schema already defines a directive named `@link` so we need to use an alias.
  // To keep it simple, we add a number in the end (so we try `@link1`, and if that's taken `@link2`, ...)
  const baseName = linkSpec.url.name;
  const n = 1;
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
    const errors = linkSpec.addToSchema(schema, alias);
    if (errors.length > 0) {
      throw ErrGraphQLValidationFailed(errors);
    }
    spec = linkSpec;
    core = schema.coreFeatures;
    assert(core, 'Schema should now be a core schema');
  }

  assert(!core.getByIdentity(federationSpec.identity), 'Schema already set as a federation subgraph');
  schema.schemaDefinition.applyDirective(
    core.coreItself.nameInSchema,
    {
      url: federationSpec.url.toString(),
      import: autoExpandedFederationSpec.directiveSpecs().map((spec) => `@${spec.name}`),
    }
  );
  const errors = completeSubgraphSchema(schema);
  if (errors.length > 0) {
    throw ErrGraphQLValidationFailed(errors);
  }
}

// This is the full @link declaration as added by `asFed2SubgraphDocument`. It's here primarily for uses by tests that print and match
// subgraph schema to avoid having to update 20+ tests every time we use a new directive or the order of import changes ...
export const FEDERATION2_LINK_WITH_FULL_IMPORTS = '@link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@requires", "@provides", "@external", "@tag", "@extends", "@shareable", "@inaccessible", "@override", "@composeDirective", "@interfaceObject", "@authenticated", "@requiresScopes", "@policy", "@sourceAPI", "@sourceType", "@sourceField"])';
// This is the full @link declaration that is added when upgrading fed v1 subgraphs to v2 version. It should only be used by tests.
export const FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS = '@link(url: "https://specs.apollo.dev/federation/v2.7", import: ["@key", "@requires", "@provides", "@external", "@tag", "@extends", "@shareable", "@inaccessible", "@override", "@composeDirective", "@interfaceObject"])';

/**
 * Given a document that is assumed to _not_ be a fed2 schema (it does not have a `@link` to the federation spec),
 * returns an equivalent document that `@link` to the last known federation spec.
 *
 * @param document - the document to "augment".
 * @param options.addAsSchemaExtension - defines whethere the added `@link` is added as a schema extension (`extend schema`) or
 *   added to the schema definition. Defaults to `true` (added as an extension), as this mimics what we tends to write manually.
 * @param options.includeAllImports - defines whether we should auto import ALL latest federation v2 directive definitions or include
 *   only limited set of directives (i.e. federation v2.4 definitions)
 */
export function asFed2SubgraphDocument(document: DocumentNode, options?: { addAsSchemaExtension?: boolean, includeAllImports?: boolean }): DocumentNode {
  const importedDirectives = options?.includeAllImports ? federationSpec.directiveSpecs() : autoExpandedFederationSpec.directiveSpecs();
  const directiveToAdd: ConstDirectiveNode = ({
    kind: Kind.DIRECTIVE,
    name: { kind: Kind.NAME, value: linkDirectiveDefaultName },
    arguments: [
      {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: 'url' },
        value: { kind: Kind.STRING, value: federationSpec.url.toString() }
      },
      {
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: 'import' },
        value: { kind: Kind.LIST, values: importedDirectives.map((spec) => ({ kind: Kind.STRING, value: `@${spec.name}` })) }
      }
    ]
  });
  if (options?.addAsSchemaExtension ?? true) {
    return {
      kind: Kind.DOCUMENT,
      loc: document.loc,
      definitions: document.definitions.concat({
        kind: Kind.SCHEMA_EXTENSION,
        directives: [directiveToAdd]
      }),
    }
  }

  // We can't add a new schema definition if it already exists. If it doesn't we need to know if there is a mutation type or
  // not.
  const existingSchemaDefinition = document.definitions.find((d): d is SchemaDefinitionNode => d.kind == Kind.SCHEMA_DEFINITION);
  if (existingSchemaDefinition) {
    return {
      kind: Kind.DOCUMENT,
      loc: document.loc,
      definitions: document.definitions.filter((d) => d !== existingSchemaDefinition).concat([{
        ...existingSchemaDefinition,
        directives: [directiveToAdd].concat(existingSchemaDefinition.directives ?? []),
      }]),
    }
  } else {
    const hasMutation = document.definitions.some((d) => d.kind === Kind.OBJECT_TYPE_DEFINITION && d.name.value === 'Mutation');
    const makeOpType = (opType: OperationTypeNode, name: string): OperationTypeDefinitionNode => ({
      kind: Kind.OPERATION_TYPE_DEFINITION,
      operation: opType,
      type: {
        kind: Kind.NAMED_TYPE,
        name: {
          kind: Kind.NAME,
          value: name,
        }
      },
    });
    return {
      kind: Kind.DOCUMENT,
      loc: document.loc,
      definitions: document.definitions.concat({
        kind: Kind.SCHEMA_DEFINITION,
        directives: [directiveToAdd],
        operationTypes: [ makeOpType(OperationTypeNode.QUERY, 'Query') ].concat(hasMutation ? makeOpType(OperationTypeNode.MUTATION, 'Mutation') : []),
      }),
    }
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
  if (!isObjectType(type) && !isInterfaceType(type)) {
    return false;
  }
  const metadata = federationMetadata(type.schema());
  return !!metadata && type.hasAppliedDirective(metadata.keyDirective());
}

export function isInterfaceObjectType(type: NamedType): boolean {
  if (!isObjectType(type)) {
    return false;
  }
  const metadata = federationMetadata(type.schema());
  return !!metadata && metadata.isInterfaceObjectType(type);
}

export function buildSubgraph(
  name: string,
  url: string,
  source: DocumentNode | string,
  withRootTypeRenaming: boolean = true,
): Subgraph {
  const buildOptions = {
    blueprint: new FederationBlueprint(withRootTypeRenaming),
    validate: false,
  };
  let subgraph: Subgraph;
  try {
    const schema = typeof source === 'string'
      ? buildSchema(new Source(source, name), buildOptions)
      : buildSchemaFromAST(source, buildOptions)
    subgraph = new Subgraph(name, url, schema);
  } catch (e) {
    if (e instanceof GraphQLError && name !== FEDERATION_UNNAMED_SUBGRAPH_NAME) {
      throw addSubgraphToError(e, name, ERRORS.INVALID_GRAPHQL);
    } else {
      throw e;
    }
  }
  return subgraph.validate();
}

export function newEmptyFederation2Schema(config?: SchemaConfig): Schema {
  const schema = new Schema(new FederationBlueprint(true), config);
  setSchemaAsFed2Subgraph(schema);
  return schema;
}

function completeSubgraphSchema(schema: Schema): GraphQLError[] {
  const coreFeatures = schema.coreFeatures;
  if (coreFeatures) {
    const fedFeature = coreFeatures.getByIdentity(federationIdentity);
    if (fedFeature) {
      return completeFed2SubgraphSchema(schema);
    } else {
      return completeFed1SubgraphSchema(schema);
    }
  } else {
    const fedLink = schema.schemaDefinition.appliedDirectivesOf(linkDirectiveDefaultName).find(isFedSpecLinkDirective);
    if (fedLink) {
      const errors = linkSpec.addToSchema(schema);
      if (errors.length > 0) {
        return errors;
      }
      return completeFed2SubgraphSchema(schema);
    } else {
      return completeFed1SubgraphSchema(schema);
    }
  }
}

function isFedSpecLinkDirective(directive: Directive<SchemaDefinition>): directive is Directive<SchemaDefinition, LinkDirectiveArgs> {
  const args = directive.arguments();
  return directive.name === linkDirectiveDefaultName && args['url'] && (args['url'] as string).startsWith(federationIdentity);
}

function completeFed1SubgraphSchema(schema: Schema): GraphQLError[] {
  // We special case @key, @requires and @provides because we've seen existing user schema where those
  // have been defined in an invalid way, but in a way that fed1 wasn't rejecting. So for convenience,
  // if we detect one of those case, we just remove the definition and let the code afteward add the
  // proper definition back.
  // Note that, in a perfect world, we'd do this within the `SchemaUpgrader`. But the way the code
  // is organised, this method is called before we reach the `SchemaUpgrader`, and it doesn't seem
  // worth refactoring things drastically for that minor convenience.
  for (const name of [FederationDirectiveName.KEY, FederationDirectiveName.PROVIDES, FederationDirectiveName.REQUIRES]) {
    const directive = schema.directive(name);
    if (!directive) {
      continue;
    }

    // We shouldn't have applications at the time of this writing because `completeSubgraphSchema`, which calls this,
    // is only called:
    // 1. during schema parsing, by `FederationBluePrint.onDirectiveDefinitionAndSchemaParsed`, and that is called
    //   before we process any directive applications.
    // 2. by `setSchemaAsFed2Subgraph`, but as the name imply, this trickles to `completeFed2SubgraphSchema`, not
    //   this one method.
    // In other words, there is currently no way to create a full fed1 schema first, and get that method called
    // second. If that changes (no real reason but...), we'd have to modify this because when we remove the
    // definition to re-add the "correct" version, we'd have to re-attach existing applications (doable but not
    // done). This assert is so we notice it quickly if that ever happens (again, unlikely, because fed1 schema
    // is a backward compatibility thing and there is no reason to expand that too much in the future).
    assert(directive.applications().length === 0, `${directive} shouldn't have had validation at that places`);

    // The patterns we recognize and "correct" (by essentially ignoring the definition)
    // are:
    //  1. if the definition has no arguments at all.
    //  2. if the `fields` argument is declared as nullable.
    //  3. if the `fields` argument type is named "FieldSet" instead of "_FieldSet".
    //
    // Note that they all correspong to things we've seen in use schema.
    const fieldType = directive.argument('fields')?.type?.toString();
    // Note that to be on the safe side, we check that `fields` is the only argument. That's
    // because while fed2 accepts the optional `resolvable` arg for @key, fed1 only ever
    // accepted that one argument for all those directives. But if the use had definited
    // more arguments _and_ provided value for such extra argument in some applications,
    // us removing the definition would create validation errors that would be hard to
    // understand for the user.
    const fieldTypeIsWrongInKnownWays = !!fieldType
      && directive.arguments().length === 1
      && (fieldType === 'String' || fieldType === '_FieldSet' || fieldType === 'FieldSet');

    if (directive.arguments().length === 0 || fieldTypeIsWrongInKnownWays) {
      directive.remove();
    }
  }

  const errors = FEDERATION1_TYPES.map((spec) => spec.checkOrAdd(schema, FAKE_FED1_CORE_FEATURE_TO_RENAME_TYPES))
    .concat(FEDERATION1_DIRECTIVES.map((spec) => spec.checkOrAdd(schema)))
    .flat();

  return errors.length === 0 ? expandKnownFeatures(schema) : errors;
}

function completeFed2SubgraphSchema(schema: Schema): GraphQLError[] {
  const coreFeatures = schema.coreFeatures;
  assert(coreFeatures, 'This method should not have been called on a non-core schema');

  const fedFeature = coreFeatures.getByIdentity(federationIdentity);
  assert(fedFeature, 'This method should not have been called on a schema with no @link for federation');

  const spec = FEDERATION_VERSIONS.find(fedFeature.url.version);
  if (!spec) {
    return [ERRORS.UNKNOWN_FEDERATION_LINK_VERSION.err(
      `Invalid version ${fedFeature.url.version} for the federation feature in @link directive on schema`,
      { nodes: fedFeature.directive.sourceAST },
    )];
  }

  const errors = spec.addElementsToSchema(schema);
  return errors.length === 0 ? expandKnownFeatures(schema) : errors;
}

function expandKnownFeatures(schema: Schema): GraphQLError[] {
  const coreFeatures = schema.coreFeatures;
  if (!coreFeatures) {
    return [];
  }

  let errors: GraphQLError[] = [];
  for (const feature of coreFeatures.allFeatures()) {
    // We should already have dealt with the core/link spec and federation at this point. Also, we shouldn't have the `join` spec in subgraphs,
    // but some tests play with the idea and currently the join spec is implemented in a way that is not idempotent (it doesn't use
    // `DirectiveSpecification.checkAndAdd`; we should clean it up at some point, but not exactly urgent).
    if (feature === coreFeatures.coreItself || feature.url.identity === federationIdentity  || feature.url.identity === joinIdentity) {
      continue;
    }

    const spec = coreFeatureDefinitionIfKnown(feature.url);
    if (!spec) {
      continue;
    }

    errors = errors.concat(spec.addElementsToSchema(schema));
  }
  return errors;
}

export function parseFieldSetArgument({
  parentType,
  directive,
  fieldAccessor,
  validate,
  decorateValidationErrors = true,
}: {
  parentType: CompositeType,
  directive: Directive<SchemaElement<any, any>, {fields: any}>,
  fieldAccessor?: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined,
  validate?: boolean,
  decorateValidationErrors?: boolean,
}): SelectionSet {
  try {
    const selectionSet = parseSelectionSet({
      parentType,
      source: validateFieldSetValue(directive),
      fieldAccessor,
      validate,
    });
    if (validate ?? true) {
      selectionSet.forEachElement((elt) => {
        if (elt.kind === 'Field' && elt.alias) {
          // Note that this will be caught by the surrounding catch and "decorated".
          throw new GraphQLError(`Cannot use alias "${elt.alias}" in "${elt}": aliases are not currently supported in @${directive.name}`);
        }
      });
    }
    return selectionSet;
  } catch (e) {
    if (!(e instanceof GraphQLError) || !decorateValidationErrors) {
      throw e;
    }

    throw handleFieldSetValidationError(
      directive,
      e,
      (msg: string) => {
        if (msg.startsWith('Cannot query field')) {
          if (msg.endsWith('.')) {
            msg = msg.slice(0, msg.length - 1);
          }
          if (directive.name === FederationDirectiveName.KEY) {
            msg = msg + ' (the field should either be added to this subgraph or, if it should not be resolved by this subgraph, you need to add it to this subgraph with @external).';
          } else {
            msg = msg + ' (if the field is defined in another subgraph, you need to add it to this subgraph with @external).';
          }
        }
        return msg;
      },
    );
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
    // If we explicitly requested no validation, then we shouldn't throw a (graphQL) error, but if we do, we swallow it
    // (returning a partial result, but we assume it is fine).
    const isGraphQLError = errorCauses(e) !== undefined
    if (!isGraphQLError || validate) {
      throw e;
    }
  }
  return fields;
}

function validateFieldSetValue(directive: Directive<SchemaElement<any, any>, {fields: any}>): string {
  const fields = directive.arguments().fields;
  const nodes = directive.sourceAST;
  if (typeof fields !== 'string') {
    throw ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS_TYPE.get(directive.name).err(
      `Invalid value for argument "${directive.definition!.argument('fields')!.name}": must be a string.`,
      { nodes },
    );
  }
  // While validating if the field is a string will work in most cases, this will not catch the case where the field argument was
  // unquoted but parsed as an enum value (see federation/issues/850 in particular). So if we have the AST (which we will usually
  // have in practice), use that to check that the argument was truly a string.
  if (nodes && nodes.kind === 'Directive') {
    for (const argNode of nodes.arguments ?? []) {
      if (argNode.name.value === 'fields') {
        if (argNode.value.kind !== 'StringValue') {
          throw ERROR_CATEGORIES.DIRECTIVE_INVALID_FIELDS_TYPE.get(directive.name).err(
            `Invalid value for argument "${directive.definition!.argument('fields')!.name}": must be a string.`,
            { nodes },
          );
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
    // Please note that `_Entity` cannot use "interface entities" since interface types cannot be in unions.
    // It is ok in practice because _Entity is only use as return type for `_entities`, and even when interfaces
    // are involve, the result of an `_entities` call will always be an object type anyway, and since we force
    // all implementations of an interface entity to be entity themselves in a subgraph, we're fine.
    return schema.objectTypes().filter(isEntityType).map((t) => t.name);
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
      throw ERRORS.INVALID_SUBGRAPH_NAME.err(`Invalid name ${FEDERATION_RESERVED_SUBGRAPH_NAME} for a subgraph: this name is reserved`);
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
      queryType.addField(serviceFieldName, new NonNullType(metadata.serviceType()));
    }
  }

  /**
   * Same as `Schema.assumeValid`. Use carefully.
   */
  assumeValid(): Subgraph {
    this.addFederationOperations();
    this.schema.assumeValid();
    return this;
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
    return !core || core.sourceFeature(d)?.feature.url.identity !== linkIdentity;
  }

  private isPrintedType(t: NamedType): boolean {
    if (this.metadata().allFederationTypes().includes(t)) {
      return false;
    }

    // If the query type only have our federation specific fields, then that (almost surely) means the original subgraph
    // had no Query type and so we save printing it.
    if (isObjectType(t) && t.isQueryRootType() && t.fields().filter((f) => !isFederationField(f)).length === 0) {
      return false;
    }

    const core = this.schema.coreFeatures;
    return !core || core.sourceFeature(t)?.feature.url.identity !== linkIdentity;
  }

  private isPrintedDirectiveApplication(d: Directive): boolean {
    // We print almost all directive application, but the one we skip is the `@link` to the link spec itself.
    // The reason is that it is one of the things that usually not provided by users but is instead auto-added
    // and so this keep the output a tad "cleaner".
    // Do note that it is only auto-added if it uses the `@link` name. If it is renamed, we need to include
    // the application (and more generally, if there is more argument set than just the url, we print
    // the directive to make sure we're not hidding something relevant).
    if (!this.schema.coreFeatures || d.name !== linkSpec.url.name) {
      return true;
    }
    const args = d.arguments();
    let urlArg: FeatureUrl | undefined = undefined;
    if ('url' in args) {
      try {
        urlArg = FeatureUrl.parse(args['url']);
      } catch (e) {
        // ignored on purpose: if the 'url' arg don't parse properly as a Feature url, then `urlArg` will
        // be `undefined` which we want.
      }
    }
    const isDefaultLinkToLink = urlArg?.identity === linkIdentity && Object.keys(args).length === 1;
    return !isDefaultLinkToLink;
  }

  /**
   * Returns a representation of the subgraph without any auto-imported directive definitions or "federation private"
   * types and fiels (`_service` et al.).
   *
   * In other words, this will correspond to what a user would usually write.
   *
   * Note that if one just want a representation of the full schema, then it can simply call `printSchema(this.schema)`.
   */
  toString(basePrintOptions: PrintOptions = defaultPrintOptions) {
    return printSchema(
      this.schema,
      {
        ...basePrintOptions,
        directiveDefinitionFilter: (d) => this.isPrintedDirective(d),
        typeFilter: (t) => this.isPrintedType(t),
        fieldFilter: (f) => !isFederationField(f),
        directiveApplicationFilter: (d) => this.isPrintedDirectiveApplication(d),
      }
    );
  }
}

export type SubgraphASTNode = ASTNode & { subgraph: string };

export function addSubgraphToASTNode(node: ASTNode, subgraph: string): SubgraphASTNode {
  // We won't override a existing subgraph info: it's not like the subgraph an ASTNode can come
  // from can ever change and this allow the provided to act as a "default" rather than a
  // hard setter, which is convenient in `addSubgraphToError` below if some of the AST of
  // the provided error already have a subgraph "origin".
  if ('subgraph' in (node as any)) {
    return node as SubgraphASTNode;
  }
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
    const options: GraphQLErrorOptions = {
      ...extractGraphQLErrorOptions(cause),
      nodes,
      originalError: cause,
    };

    return code
      ? code.err(message, options)
      : new GraphQLError(message, options);
  });

  return updatedCauses.length === 1 ? updatedCauses[0] : ErrGraphQLValidationFailed(updatedCauses);
}

class ExternalTester {
  private readonly fakeExternalFields = new Set<string>();
  private readonly providedFields = new Set<string>();
  private readonly externalDirective: DirectiveDefinition<{}>;
  private readonly externalFieldsOnType = new Set<string>();

  constructor(readonly schema: Schema, private readonly isFed2Schema: boolean) {
    this.externalDirective = this.metadata().externalDirective();
    this.collectFakeExternals();
    this.collectProvidedFields();
    this.collectExternalsOnType();
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
      const parentType = baseType(parent.type!);
      // If `parentType` is not a composite, that means an invalid @provides, but we ignore such errors
      // for now (also why we pass 'validate: false'). Proper errors will be thrown later during validation.
      if (isCompositeType(parentType)) {
        collectTargetFields({
          parentType,
          directive: provides as Directive<any, {fields: any}>,
          includeInterfaceFieldsImplementations: true,
          validate: false,
        }).forEach((f) => this.providedFields.add(f.coordinate));
      }
    }
  }

  private collectExternalsOnType() {
    // We do not collect @external on types for fed1 schema since those will be discarded by the schema upgrader.
    // The schema upgrader, through calls to `isExternal`, relies on the populated `externalFieldsOnType` object to
    // inform when @shareable should be automatically added. In the fed1 case, if the map is populated then @shareable won't
    // be added in places where it should have.
    if (!this.isFed2Schema) {
      return;
    }

    for (const type of this.schema.objectTypes()) {
      if (type.hasAppliedDirective(this.externalDirective)) {
        for (const field of type.fields()) {
          this.externalFieldsOnType.add(field.coordinate);
        }
      }
    }
  }

  isExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return (field.hasAppliedDirective(this.externalDirective) || this.externalFieldsOnType.has(field.coordinate)) && !this.isFakeExternal(field);
  }

  isFakeExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return this.fakeExternalFields.has(field.coordinate);
  }

  selectsAnyExternalField(selectionSet: SelectionSet): boolean {
    for (const selection of selectionSet.selections()) {
      if (selection.kind === 'FieldSelection' && this.isExternal(selection.element.definition)) {
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
      if (isExternalOrHasExternalImplementations(s.element.definition)) {
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
  return selectionSet.lazyMap((selection) => {
    if (selection.kind === 'FieldSelection') {
      if (isExternalOrHasExternalImplementations(selection.element.definition)) {
        // That field is external, so we can add the selection back entirely.
        return selection;
      }
    }
    if (selection.selectionSet) {
      // Note that for fragments this will always be true (and we just recurse), while
      // for fields, we'll only get here if the field is not external, and so
      // we want to add the selection only if it's not a leaf and even then, only
      // the part where we've recursed.
      const updated = withoutNonExternalLeafFields(selection.selectionSet);
      if (!updated.isEmpty()) {
        return selection.withUpdatedSelectionSet(updated);
      }
    }
    // We skip that selection.
    return undefined;
  });
}
