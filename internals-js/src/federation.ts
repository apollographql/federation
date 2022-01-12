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
import { assert, OrderedMap } from "./utils";
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
} from "graphql";
import { defaultPrintOptions, printDirectiveDefinition } from "./print";
import { KnownTypeNamesInFederationRule } from "./validation/KnownTypeNamesInFederationRule";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { parseSelectionSet, SelectionSet } from './operations';
import { tagLocations, TAG_VERSIONS } from "./tagSpec";
import {
  errorCodeDef,
  ErrorCodeDefinition,
  ERRORS,
} from "./error";
import { ERROR_CATEGORIES } from ".";

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

export const serviceFieldName = '_service';
export const entitiesFieldName = '_entities';

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
  tagDirectiveName
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
  externalTester: ExternalTester,
  externalFieldCoordinatesCollector: string[],
  allowOnNonExternalLeafFields: boolean,
): void {
  for (const selection of selectionSet.selections()) {
    if (selection.kind === 'FieldSelection') {
      const field = selection.element().definition;
      const isExternal = externalTester.isExternal(field);
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
        if (externalTester.isFakeExternal(field)) {
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
            if (fieldInImplem && externalTester.isExternal(fieldInImplem)) {
              newHasExternalInParents = true;
              break;
            }
          }
        }
        validateFieldSetSelections(directiveName, selection.selectionSet, newHasExternalInParents, externalTester, externalFieldCoordinatesCollector, allowOnNonExternalLeafFields);
      }
    } else {
      validateFieldSetSelections(directiveName, selection.selectionSet, hasExternalInParents, externalTester, externalFieldCoordinatesCollector, allowOnNonExternalLeafFields);
    }
  }
}

function validateFieldSet(
  type: CompositeType,
  directive: Directive<any, {fields: any}>,
  externalTester: ExternalTester,
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
      validateFieldSetSelections(directive.name, selectionSet, false, externalTester, externalFieldCoordinatesCollector, allowOnNonExternalLeafFields);
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
  externalTester: ExternalTester,
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
      externalTester,
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
  schema: Schema,
  externalTester: ExternalTester,
  allExternalFieldsUsedInFederationDirectivesCoordinates: string[],
  errorCollector: GraphQLError[],
): void {
  for (const type of schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    for (const field of type.fields()) {
      if (!externalTester.isExternal(field) || allExternalFieldsUsedInFederationDirectivesCoordinates.includes(field.coordinate)) {
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

    const directive = this.addBuiltInDirective(schema, 'tag').addLocations(...tagLocations);
    directive.addArgument("name", new NonNullType(schema.stringType()));
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

    const externalTester = new ExternalTester(schema);

    const externalFieldsInFedDirectivesCoordinates: string[] = [];
    // We validate the @key, @requires and @provides.
    const keyDirective = this.keyDirective(schema);
    validateAllFieldSet<CompositeType>(
      keyDirective,
      type => type,
      errors,
      externalTester,
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
      externalTester,
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
      externalTester,
      externalFieldsInFedDirectivesCoordinates,
      false,
      false,
    );

    validateAllExternalFieldsUsed(schema, externalTester, externalFieldsInFedDirectivesCoordinates, errors);

    // If tag is redefined by the user, make sure the definition is compatible with what we expect
    const tagDirective = this.tagDirective(schema);
    if (!tagDirective.isBuiltIn) {
      const error = tagSpec.checkCompatibleDirective(tagDirective);
      if (error) {
        errors.push(error);
      }
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

export function buildSubgraph(name: string, source: DocumentNode | string): Schema {
  try {
    return typeof source === 'string'
      ? buildSchema(new Source(source, name), federationBuiltIns)
      : buildSchemaFromAST(source, federationBuiltIns);
  } catch (e) {
    if (e instanceof GraphQLError) {
      // Note that `addSubgraphToError` only adds the provided code if the original error
      // didn't have one, and the only one that will not have a code are GraphQL errors
      // (since we assign specific codes to the federation errors).
      throw addSubgraphToError(e, name, ERRORS.INVALID_GRAPHQL);
    } else {
      throw e;
    }
  }
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
      subgraphs.add(service.name, service.url ?? '', service.typeDefs);
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

  add(subgraph: Subgraph): Subgraph;
  add(name: string, url: string, schema: Schema | DocumentNode | string): Subgraph;
  add(subgraphOrName: Subgraph | string, url?: string, schema?: Schema | DocumentNode | string): Subgraph {
    const toAdd: Subgraph = typeof subgraphOrName  === 'string'
      ? new Subgraph(subgraphOrName, url!, schema instanceof Schema ? schema! : buildSubgraph(subgraphOrName, schema!))
      : subgraphOrName;

    if (toAdd.name === FEDERATION_RESERVED_SUBGRAPH_NAME) {
      throw ERRORS.INVALID_SUBGRAPH_NAME.err({ message: `Invalid name ${FEDERATION_RESERVED_SUBGRAPH_NAME} for a subgraph: this name is reserved` });
    }

    if (this.subgraphs.has(toAdd.name)) {
      throw new Error(`A subgraph named ${toAdd.name} already exists` + (toAdd.url ? ` (with url '${toAdd.url}')` : ''));
    }
    this.subgraphs.add(toAdd.name, toAdd);
    return toAdd;
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

  toString(): string {
    return '[' + this.subgraphs.keys().join(', ') + ']'
  }
}

export class Subgraph {
  constructor(
    readonly name: string,
    readonly url: string,
    readonly schema: Schema,
    validateSchema: boolean = true
  ) {
    if (validateSchema) {
      schema.validate();
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
        originalError: cause.originalError,
        extensions: cause.extensions,
      });
    } else {
      return new GraphQLError(
        message,
        nodes,
        cause.source,
        cause.positions,
        cause.path,
        cause.originalError,
        cause.extensions
      );
    }
  });

  return ErrGraphQLValidationFailed(updatedCauses);
}

export class ExternalTester {
  private readonly fakeExternalFields = new Set<string>();

  constructor(readonly schema: Schema) {
    this.collectFakeExternals();
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
}
