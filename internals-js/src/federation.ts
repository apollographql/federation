import {
  BuiltIns,
  Schema,
  DirectiveDefinition,
  NonNullType,
  NamedType,
  Directive,
  UnionType,
  ObjectType,
  ListType,
  FieldDefinition,
  CompositeType,
  allSchemaRootKinds,
  defaultRootName,
  errorCauses,
  ErrGraphQLValidationFailed,
  SchemaElement,
  baseType,
  isInterfaceType,
  isObjectType,
  isListType,
  isUnionType,
  sourceASTs,
  VariableDefinitions,
  InterfaceType,
  InputFieldDefinition,
  isCompositeType
} from "./definitions";
import { assert, joinStrings, MultiMap, OrderedMap } from "./utils";
import { SDLValidationRule } from "graphql/validation/ValidationContext";
import { specifiedSDLRules } from "graphql/validation/specifiedRules";
import {
  ASTNode,
  DocumentNode,
  GraphQLError,
  Kind,
  KnownTypeNamesRule,
  parse,
  PossibleTypeExtensionsRule,
  print as printAST,
  Source,
  DirectiveLocation,
  SchemaExtensionNode,
} from "graphql";
import { defaultPrintOptions, printDirectiveDefinition } from "./print";
import { KnownTypeNamesInFederationRule } from "./validation/KnownTypeNamesInFederationRule";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { parseSelectionSet, selectionOfElement, SelectionSet } from './operations';
import { tagLocations, TAG_VERSIONS } from "./tagSpec";
import {
  errorCodeDef,
  ErrorCodeDefinition,
  ERROR_CATEGORIES,
  ERRORS,
} from "./error";
import { computeShareables } from "./sharing";
import { printHumanReadableList } from ".";

export const entityTypeName = '_Entity';
export const serviceTypeName = '_Service';
export const anyTypeName = '_Any';
export const fieldSetTypeName = '_FieldSet';

export const keyDirectiveName = 'key';
export const extendsDirectiveName = 'extends';
export const externalDirectiveName = 'external';
export const requiresDirectiveName = 'requires';
export const providesDirectiveName = 'provides';
// TODO: so far, it seems we allow tag to appear without a corresponding definition, so we add it as a built-in.
// If we change our mind, we should change this.
export const tagDirectiveName = 'tag';

export const shareableDirectiveName = 'shareable';
export const linkDirectiveName = 'link';

export const serviceFieldName = '_service';
export const entitiesFieldName = '_entities';

const FEDERATION_SPEC_URL = 'https://specs.apollo.dev/federation/v2.0'

const tagSpec = TAG_VERSIONS.latest();

// We don't let user use this as a subgraph name. That allows us to use it in `query graphs` to name the source of roots
// in the "federated query graph" without worrying about conflict (see `FEDERATED_GRAPH_ROOT_SOURCE` in `querygraph.ts`).
// (note that we could deal with this in other ways, but having a graph named '_' feels like a terrible idea anyway, so
// disallowing it feels like more a good thing than a real restriction).
export const FEDERATION_RESERVED_SUBGRAPH_NAME = '_';

const FEDERATION_TYPES = [
  entityTypeName,
  serviceTypeName,
  anyTypeName,
  fieldSetTypeName
];
const FEDERATION_DIRECTIVES = [
  keyDirectiveName,
  extendsDirectiveName,
  externalDirectiveName,
  requiresDirectiveName,
  providesDirectiveName,
  tagDirectiveName,
  shareableDirectiveName,
  linkDirectiveName,
];
const FEDERATION_ROOT_FIELDS = [
  serviceFieldName,
  entitiesFieldName
];

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
  externalFieldCoordinatesCollector: string[],
  allowOnNonExternalLeafFields: boolean,
): void {
  for (const selection of selectionSet.selections()) {
    if (selection.kind === 'FieldSelection') {
      const field = selection.element().definition;
      const isExternal = federationMetadata.isFieldExternal(field);
      // We collect the field as external before any other validation to avoid getting a (confusing)
      // "external unused" error on top of another error due to exiting that method too early.
      if (isExternal) {
        externalFieldCoordinatesCollector.push(field.coordinate);
      }
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
              + `(while it is marked @${externalDirectiveName}, it is a @${keyDirectiveName} field of an extension type, which are not internally considered external for historical/backward compatibility reasons)`,
            nodes: field.sourceAST
          });
        } else {
          throw errorCode.err({
            message: `field "${field.coordinate}" should not be part of a @${directiveName} since it is already provided by this subgraph (it is not marked @${externalDirectiveName})`,
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
        validateFieldSetSelections(directiveName, selection.selectionSet, newHasExternalInParents, federationMetadata, externalFieldCoordinatesCollector, allowOnNonExternalLeafFields);
      }
    } else {
      validateFieldSetSelections(directiveName, selection.selectionSet, hasExternalInParents, federationMetadata, externalFieldCoordinatesCollector, allowOnNonExternalLeafFields);
    }
  }
}

function validateFieldSet(
  type: CompositeType,
  directive: Directive<any, {fields: any}>,
  federationMetadata: FederationMetadata,
  externalFieldCoordinatesCollector: string[],
  allowOnNonExternalLeafFields: boolean,
  onFields?: (field: FieldDefinition<any>) => void,
): GraphQLError | undefined {
  try {
    // Note that `parseFieldSetArgument` already properly format the error, hence the separate try-catch.
    const fieldAcessor = onFields
      ? (type: CompositeType, fieldName: string) => {
        const field = type.field(fieldName);
        if (field) {
          onFields(field);
        }
        return field;
      }
      : undefined;
    const selectionSet = parseFieldSetArgument(type, directive, fieldAcessor);

    try {
      validateFieldSetSelections(directive.name, selectionSet, false, federationMetadata, externalFieldCoordinatesCollector, allowOnNonExternalLeafFields);
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
  externalFieldCoordinatesCollector: string[],
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
      externalFieldCoordinatesCollector,
      allowOnNonExternalLeafFields,
      onFields);
    if (error) {
      errorCollector.push(error);
    }
  }
}

/**
 * Checks that all fields marked @external is used in a federation directive (@key, @provides or @requires) _or_ to satisfy an
 * interface implementation. Otherwise, the field declaration is somewhat useless.
 */
function validateAllExternalFieldsUsed(
  schema: Schema, allExternalFieldsUsedInFederationDirectivesCoordinates: string[], errorCollector: GraphQLError[],
): void {
  const metadata = federationMetadata(schema);
  if (!metadata) return;
  for (const type of schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    for (const field of type.fields()) {
      if (!metadata.isFieldExternal(field) || allExternalFieldsUsedInFederationDirectivesCoordinates.includes(field.coordinate)) {
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
  externalTester: ExternalTester, 
  errorCollector: GraphQLError[],
): void {
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
      if (externalTester.isExternal(implemField) || implemField.hasAppliedDirective(requiresDirectiveName)) {
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

function checkIfFed2Schema(schema: Schema): boolean {
  // TODO: this is over-simple and needs to be updated
  const linkDirectives = schema.schemaDefinition.appliedDirectivesOf(federationBuiltIns.linkDirective(schema));
  return linkDirectives.some((d) => d.arguments().url === FEDERATION_SPEC_URL);
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
      this._isFed2Schema = checkIfFed2Schema(this.schema);
    }
    return this._isFed2Schema;
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
}

export class FederationBuiltIns extends BuiltIns {
  addBuiltInTypes(schema: Schema) {
    super.addBuiltInTypes(schema);

    this.addBuiltInUnion(schema, entityTypeName);
    this.addBuiltInObject(schema, serviceTypeName).addField('sdl', schema.stringType());
    this.addBuiltInScalar(schema, anyTypeName);
    this.addBuiltInScalar(schema, fieldSetTypeName);
  }

  addBuiltInDirectives(schema: Schema) {
    super.addBuiltInDirectives(schema);

    const fieldSetType = new NonNullType(schema.type(fieldSetTypeName)!);

    // Note that we allow @key on interfaces in the definition to not break backward compatibility, because it has historically unfortunately be declared this way, but
    // @key is actually not supported on interfaces at the moment, so if if is "used" then it is rejected.
    const keyDirective = this.addBuiltInDirective(schema, keyDirectiveName)
      .addLocations(DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE);
    // TODO: I believe fed 1 does not mark key repeatable and relax validation to accept repeating non-repeatable directive.
    // Do we want to perpetuate this? (Obviously, this is for historical reason and some graphQL implementations still do
    // not support 'repeatable'. But since this code does not kick in within users' code, not sure we have to accommodate
    // for those implementations. Besides, we _do_ accept if people re-defined @key as non-repeatable).
    keyDirective.repeatable = true;
    keyDirective.addArgument('fields', fieldSetType);

    this.addBuiltInDirective(schema, extendsDirectiveName)
      .addLocations(DirectiveLocation.OBJECT, DirectiveLocation.INTERFACE);

    this.addBuiltInDirective(schema, externalDirectiveName)
      .addLocations(DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION);

    for (const name of [requiresDirectiveName, providesDirectiveName]) {
      this.addBuiltInDirective(schema, name)
        .addLocations(DirectiveLocation.FIELD_DEFINITION)
        .addArgument('fields', fieldSetType);
    }

    const tagDirective = this.addBuiltInDirective(schema, 'tag').addLocations(...tagLocations);
    tagDirective.addArgument("name", new NonNullType(schema.stringType()));

    this.addBuiltInDirective(schema, shareableDirectiveName)
      .addLocations(DirectiveLocation.OBJECT, DirectiveLocation.FIELD_DEFINITION);

    const linkDirective = this.addBuiltInDirective(schema, linkDirectiveName).addLocations(DirectiveLocation.SCHEMA);
    linkDirective.addArgument("url", new NonNullType(schema.stringType()));
  }

  onConstructed(schema: Schema) {
    const existing = federationMetadata(schema);
    if (!existing) {
      (schema as any)['_federationMetadata'] = new FederationMetadata(schema);
    }
  }

  onInvalidation(schema: Schema) {
    super.onInvalidation(schema);
    const metadata = federationMetadata(schema);
    assert(metadata, 'Federation schema should have had its metadata set on construction');
    FederationMetadata.prototype['onInvalidate'].call(metadata);
  }

  prepareValidation(schema: Schema) {
    super.prepareValidation(schema);

    // Populate the _Entity type union.
    let entityType = schema.type(entityTypeName) as UnionType;
    // Not that it's possible the _Entity type was provided in the schema. In that case, we don't really want to modify that
    // instance, but rather the builtIn one.
    if (!entityType.isBuiltIn) {
      // And if it _was_ redefined, but the redefinition is empty, let's just remove it as we've historically allowed that
      // (and it's a reasonable convenience). If the redefinition _has_ members, than we leave it but follow-up validation
      // will bark if the redefinition is incorrect.
      if (entityType.membersCount() === 0) {
        entityType.remove();
      }
      entityType = schema.builtInTypes<UnionType>('UnionType', true).find(u => u.name === entityTypeName)!
    }
    entityType.clearTypes();
    for (const objectType of schema.types<ObjectType>("ObjectType")) {
      if (isEntityType(objectType)) {
        entityType.addType(objectType);
      }
    }

    const hasEntities = entityType.membersCount() > 0;
    if (!hasEntities) {
      entityType.remove();
    }

    // Adds the _entities and _service fields to the root query type.
    const queryRoot = schema.schemaDefinition.root("query");
    const queryType = queryRoot ? queryRoot.type : schema.addType(new ObjectType("Query"));
    const entityField = queryType.field(entitiesFieldName);
    if (hasEntities) {
      const anyType = schema.type(anyTypeName);
      assert(anyType, `The schema should have the _Any type`);
      const entityFieldType = new NonNullType(new ListType(entityType));
      if (!entityField) {
        this.addBuiltInField(queryType, entitiesFieldName, entityFieldType)
          .addArgument('representations', new NonNullType(new ListType(new NonNullType(anyType))));
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
      this.addBuiltInField(queryType, serviceFieldName, schema.type(serviceTypeName) as ObjectType);
    }
  }

  onValidation(schema: Schema): GraphQLError[] {
    // We skip the validation on tagDirective to have a more targeted error message later below
    const errors = super.onValidation(schema, [tagDirectiveName]);

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
    const externalTester = new ExternalTester(schema);

    const externalFieldsInFedDirectivesCoordinates: string[] = [];
    // We validate the @key, @requires and @provides.
    const keyDirective = this.keyDirective(schema);
    validateAllFieldSet<CompositeType>(
      keyDirective,
      type => type,
      errors,
      metadata,
      externalFieldsInFedDirectivesCoordinates,
      true,
      true,
      field => {
        if (isListType(field.type!) || isUnionType(field.type!) || isInterfaceType(field.type!)) {
          let kind: string = field.type!.kind;
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
      this.requiresDirective(schema),
      field => field.parent,
      errors,
      metadata,
      externalFieldsInFedDirectivesCoordinates,
      false,
      false,
    );
    // Note that like for @requires above, we error out if a leaf field of the selection is not
    // external in a @provides (we pass `false` for the `allowOnNonExternalLeafFields` parameter),
    // but contrarily to @requires, there is probably no reason to ever change this, as a @provides
    // of a field already provides is 100% nonsensical.
    validateAllFieldSet<FieldDefinition<CompositeType>>(
      this.providesDirective(schema),
      field => {
        if (externalTester.isExternal(field)) {
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
      externalFieldsInFedDirectivesCoordinates,
      false,
      false,
    );

    validateAllExternalFieldsUsed(schema, externalFieldsInFedDirectivesCoordinates, errors);

    // If tag is redefined by the user, make sure the definition is compatible with what we expect
    const tagDirective = this.tagDirective(schema);
    if (!tagDirective.isBuiltIn) {
      const error = tagSpec.checkCompatibleDirective(tagDirective);
      if (error) {
        errors.push(error);
      }
    }

    for (const itf of schema.types<InterfaceType>('InterfaceType')) {
      validateInterfaceRuntimeImplementationFieldsTypes(itf, externalTester, errors);
    }

    return errors;
  }

  validationRules(): readonly SDLValidationRule[] {
    return FEDERATION_VALIDATION_RULES;
  }

  keyDirective(schema: Schema): DirectiveDefinition<{fields: any}> {
    return this.getTypedDirective(schema, keyDirectiveName);
  }

  extendsDirective(schema: Schema): DirectiveDefinition<Record<string, never>> {
    return this.getTypedDirective(schema, extendsDirectiveName);
  }

  externalDirective(schema: Schema): DirectiveDefinition<Record<string, never>> {
    return this.getTypedDirective(schema, externalDirectiveName);
  }

  requiresDirective(schema: Schema): DirectiveDefinition<{fields: any}> {
    return this.getTypedDirective(schema, requiresDirectiveName);
  }

  providesDirective(schema: Schema): DirectiveDefinition<{fields: any}> {
    return this.getTypedDirective(schema, providesDirectiveName);
  }

  tagDirective(schema: Schema): DirectiveDefinition<{name: string}> {
    return this.getTypedDirective(schema, tagDirectiveName);
  }

  shareableDirective(schema: Schema): DirectiveDefinition<{}> {
    return this.getTypedDirective(schema, shareableDirectiveName);
  }

  linkDirective(schema: Schema): DirectiveDefinition<{url: string}> {
    return this.getTypedDirective(schema, linkDirectiveName);
  }

  maybeUpdateSubgraphDocument(schema: Schema, document: DocumentNode): DocumentNode {
    document = super.maybeUpdateSubgraphDocument(schema, document);

    const definitions = document.definitions.concat();
    for (const directiveName of FEDERATION_DIRECTIVES) {
      const directive = schema.directive(directiveName);
      assert(directive, 'This method should only have been called on a schema with federation built-ins')
      // If the directive is _not_ marked built-in, that means it was manually defined
      // in the document and we don't need to add it. Note that `onValidation` will
      // ensure that re-definition is valid.
      if (directive.isBuiltIn) {
        definitions.push(parse(printDirectiveDefinition(directive, defaultPrintOptions)).definitions[0]);
      }
    }

    return {
      kind: Kind.DOCUMENT,
      loc: document.loc,
      definitions
    };
  }
}

export const federationBuiltIns = new FederationBuiltIns();

export function setSchemaAsFed2Subgraph(schema: Schema) {
  const linkDirective = federationBuiltIns.linkDirective(schema);
  // We set the directive on a schema extension because the vast majority of subgraph don't
  // have custom operations so it ends up looking cleaner/shorter to have
  //   extend schema @link(...)
  // at the beginning of the schema, rather:
  //   schema @link(...) {
  //     query: Query
  //     mutation: Mutation
  //   }
  // As a minor aside, as federation subgraphs are allowed to be authored _without_ a Query
  // type (one is automatically added for them ultimately by `buildSubgraphSchema`), using
  // an extension also avoid confusing GraphQL-js in that case.
  schema.schemaDefinition.applyDirective( linkDirective, { url: FEDERATION_SPEC_URL })
    .setOfExtension(schema.schemaDefinition.newExtension());
}

export function asFed2SubgraphDocument(document: DocumentNode): DocumentNode {
  const fed2LinkExtension: SchemaExtensionNode = {
    kind: Kind.SCHEMA_EXTENSION,
    directives: [{
      kind: Kind.DIRECTIVE,
      name: { kind: Kind.NAME, value: linkDirectiveName },
      arguments: [{
        kind: Kind.ARGUMENT,
        name: { kind: Kind.NAME, value: 'url' },
        value: { kind: Kind.STRING, value: FEDERATION_SPEC_URL }
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
  return schema.builtIns instanceof FederationBuiltIns;
}

export function isFederationType(type: NamedType): boolean {
  return isFederationTypeName(type.name);
}

export function isFederationTypeName(typeName: string): boolean {
  return FEDERATION_TYPES.includes(typeName);
}

export function isFederationField(field: FieldDefinition<CompositeType>): boolean {
  if (field.parent === field.schema().schemaDefinition.root("query")?.type) {
    return FEDERATION_ROOT_FIELDS.includes(field.name);
  }
  return false;
}

export function isFederationDirective(directive: DirectiveDefinition | Directive): boolean {
  return FEDERATION_DIRECTIVES.includes(directive.name);
}

export function isEntityType(type: NamedType): boolean {
  return type.kind == "ObjectType" && type.hasAppliedDirective(keyDirectiveName);
}

export function buildSubgraph(
  name: string,
  url: string,
  source: DocumentNode | string
): Subgraph {
  // Note that we don't validate right away for 2 reasons:
  // 1. we wantt to use `Subgraph.validate` instead in general as it adds the subgraph
  //    name to the error.
  // 2. federation 1 subgraph won't always validate as is and we only want to run
  //    validation later on the "upgraded" schema. 
  const schema = typeof source === 'string'
    ? buildSchema(new Source(source, name), federationBuiltIns, false)
    : buildSchemaFromAST(source, federationBuiltIns, false)
  return new Subgraph(name, url, schema);
}

export function parseFieldSetArgument(
  parentType: CompositeType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  fieldAccessor: (type: CompositeType, fieldName: string) => FieldDefinition<any> | undefined = (type, name) => type.field(name)
): SelectionSet {
  try {
    const selectionSet = parseSelectionSet(parentType, validateFieldSetValue(directive), new VariableDefinitions(), undefined, fieldAccessor);
    selectionSet.validate();
    return selectionSet;
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
      if (directive.name === keyDirectiveName) {
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

export function forEachFieldSetArgument(
  parentType: CompositeType,
  directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>,
  callback: (field: FieldDefinition<CompositeType>) => void,
  includeInterfaceFieldsImplementations: boolean,
) {
  parseFieldSetArgument(parentType, directive, (t, f) => {
    const field = t.field(f);
    if (field) {
      callback(field);
      if (includeInterfaceFieldsImplementations && isInterfaceType(t)) {
        for (const implType of t.possibleRuntimeTypes()) {
          const implField = implType.field(f);
          if (implField) {
            callback(implField);
          }
        }
      }
    }
    return field;
  });
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
      if (e instanceof GraphQLError) {
        errors.push(addSubgraphToError(e, service.name, ERRORS.INVALID_GRAPHQL));
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
    if (subgraph.name === FEDERATION_RESERVED_SUBGRAPH_NAME) {
      throw ERRORS.INVALID_SUBGRAPH_NAME.err({ message: `Invalid name ${FEDERATION_RESERVED_SUBGRAPH_NAME} for a subgraph: this name is reserved` });
    }

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

export class Subgraph {
  constructor(
    readonly name: string,
    readonly url: string,
    readonly schema: Schema,
  ) {
  }

  metadata(): FederationMetadata {
    const metadata = federationMetadata(this.schema);
    assert(metadata, 'The subgraph schema should have built with the federation built-ins.');
    return metadata;
  }

  isFed2Subgraph(): boolean {
    return this.metadata().isFed2Schema();
  }

  validate() {
    try {
      return this.schema.validate();
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

  toString() {
    return `${this.name} (${this.url})`
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

  constructor(readonly schema: Schema) {
    this.collectFakeExternals();
    this.collectProvidedFields();
  }

  private collectFakeExternals() {
    const keyDirective = federationBuiltIns.keyDirective(this.schema);
    if (!keyDirective) {
      return;
    }
    for (const key of keyDirective.applications()) {
      const parent = key.parent as CompositeType;
      if (!(key.ofExtension() || parent.hasAppliedDirective(extendsDirectiveName))) {
        continue;
      }
      try {
        parseFieldSetArgument(parent, key as Directive<any, {fields: any}>, (parentType, fieldName) => {
          const field = parentType.field(fieldName);
          if (field && field.hasAppliedDirective(externalDirectiveName)) {
            this.fakeExternalFields.add(field.coordinate);
          }
          return field;
        });
      } catch (e) {
        // This is not the right time to throw errors. If a directive is invalid, we'll throw
        // an error later anyway, so just ignoring it for now.
      }
    }
  }

  private collectProvidedFields() {
    const providesDirective = federationBuiltIns.providesDirective(this.schema);
    if (!providesDirective) {
      return;
    }
    for (const provides of providesDirective.applications()) {
      const parent = provides.parent as FieldDefinition<CompositeType>;
      try {
        forEachFieldSetArgument(
          baseType(parent.type!) as CompositeType,
          provides as Directive<any, {fields: any}>,
          (f) => this.providedFields.add(f.coordinate),
          true
        );
      } catch (e) {
        // This is not the right time to throw errors. If a directive is invalid, we'll throw
        // an error later anyway, so just ignoring it for now.
      }
    }
  }

  isExternal(field: FieldDefinition<any> | InputFieldDefinition) {
    return field.hasAppliedDirective(externalDirectiveName) && !this.isFakeExternal(field);
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
  const providesDirective = federationBuiltIns.providesDirective(schema);
  const requiresDirective = federationBuiltIns.requiresDirective(schema);

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
    const selection = parseFieldSetArgument(parentType, application);
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
  if (field.hasAppliedDirective(externalDirectiveName)) {
    return true;
  }
  const parentType = field.parent;
  if (isInterfaceType(parentType)) {
    for (const implem of parentType.possibleRuntimeTypes()) {
      const fieldInImplem = implem.field(field.name);
      if (fieldInImplem && fieldInImplem.hasAppliedDirective(externalDirectiveName)) {
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
