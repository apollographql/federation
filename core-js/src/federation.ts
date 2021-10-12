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
  sourceASTs,
  VariableDefinitions
} from "./definitions";
import { assert } from "./utils";
import { SDLValidationRule } from "graphql/validation/ValidationContext";
import { specifiedSDLRules } from "graphql/validation/specifiedRules";
import { ASTNode, DocumentNode, GraphQLError, KnownTypeNamesRule, parse, PossibleTypeExtensionsRule, Source } from "graphql";
import { defaultPrintOptions, printDirectiveDefinition } from "./print";
import { KnownTypeNamesInFederationRule } from "./validation/KnownTypeNamesInFederationRule";
import { buildSchema, buildSchemaFromAST } from "./buildSchema";
import { parseSelectionSet, SelectionSet } from './operations';
import { tagLocations, TAG_VERSIONS } from "./tagSpec";
import { error } from "./error";

export const entityTypeName = '_Entity';
export const serviceTypeName = '_Service';
export const anyTypeName = '_Any';
export const fieldSetTypeName = '_FieldSet';

export const keyDirectiveName = 'key';
export const extendsDirectiveName = 'extends';
export const externalDirectiveName = 'external';
export const requiresDirectiveName = 'requires';
export const providesDirectiveName = 'provides';
// TODO: so far, it seems we allow tag to appear without a corresponding definitio, so we add it as a built-in.
// If we change our mind, we should change this.
export const tagDirectiveName = 'tag';

export const serviceFieldName = '_service';
export const entitiesFieldName = '_entities';

const tagSpec = TAG_VERSIONS.latest()!;

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
function validateFieldSetSelections(directiveName: string, selectionSet: SelectionSet): string[] {
  const coordinates: string[] = [];
  for (const selection of selectionSet.selections()) {
    if (selection.kind === 'FieldSelection') {
      const field = selection.element().definition;
      if (field.hasArguments()) {
        throw new GraphQLError(`field ${field.coordinate} cannot be included because it has arguments (fields with argument are not allowed in @${directiveName})`, field.sourceAST);
      }
      if (field.hasAppliedDirective(externalDirectiveName)) {
        coordinates.push(field.coordinate);
      }
    }
    if (selection.selectionSet) {
      coordinates.push(...validateFieldSetSelections(directiveName, selection.selectionSet));
    }
  }
  return coordinates;
}

function validateFieldSet(
  type: CompositeType,
  directive: Directive<any, {fields: any}>,
  targetDescription: string
): GraphQLError | string[] {
  try {
    const selectionSet = parseFieldSetArgument(type, directive);
    selectionSet.validate();
    return validateFieldSetSelections(directive.name, selectionSet);
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
    return new GraphQLError(`On ${targetDescription}, for ${directive}: ${msg}`, nodes);
  }
}

function validateAllFieldSet<TParent extends SchemaElement<any, any>>(
  definition: DirectiveDefinition<{fields: any}>,
  parentTypeExtractor: (element: TParent) => CompositeType,
  targetDescriptionExtractor: (element: TParent) => string,
  errorCollector: GraphQLError[],
  externalFieldCoordinatesCollector: string[]
): void {
  for (const application of definition.applications()) {
    const elt = application.parent! as TParent;
    const type = parentTypeExtractor(elt);
    const errorOrFields = validateFieldSet(type, application, targetDescriptionExtractor(elt));
    if (Array.isArray(errorOrFields)) {
      externalFieldCoordinatesCollector.push(...errorOrFields);
    } else {
      errorCollector.push(errorOrFields);
    }
  }
}

/**
 * Checks that all fields marked @external is used in a @key, @provides or @requires
 */
function validateAllExternalFieldsUsed(
  schema: Schema,
  allUsedExternalFieldsCoordinates: string[],
  errorCollector: GraphQLError[],
): void {
  for (const type of schema.types()) {
    if (!isObjectType(type) && !isInterfaceType(type)) {
      continue;
    }
    for (const field of type.fields()) {
      if (field.hasAppliedDirective(externalDirectiveName) && !allUsedExternalFieldsCoordinates.includes(field.coordinate)) {
        errorCollector.push(new GraphQLError(
          `Field ${field.coordinate} is marked @external but is not used in any @key, @provides or @requires `
          + '(@external is only used to mark fields that are used in a @key, @provides or @requires "fields" argument but are not resolvable by the subgraph).',
          field.sourceAST
        ));
      }
    }
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
    // @key is actually not suppported on interfaces at the moment, so if if is "used" then it is rejected.
    const keyDirective = this.addBuiltInDirective(schema, keyDirectiveName)
      .addLocations('OBJECT', 'INTERFACE');
    // TODO: I believe fed 1 does not mark key repeatable and relax validation to accept repeating non-repeatable directive.
    // Do we want to perpetuate this? (Obviously, this is for historical reason and some graphQL implementations still do
    // not support 'repeatable'. But since this code does not kick in within users' code, not sure we have to accomodate
    // for those implementations. Besides, we _do_ accept if people re-defined @key as non-repeatable).
    keyDirective.repeatable = true;
    keyDirective.addArgument('fields', fieldSetType);

    this.addBuiltInDirective(schema, extendsDirectiveName)
      .addLocations('OBJECT', 'INTERFACE');

    this.addBuiltInDirective(schema, externalDirectiveName)
      .addLocations('OBJECT', 'FIELD_DEFINITION');

    for (const name of [requiresDirectiveName, providesDirectiveName]) {
      this.addBuiltInDirective(schema, name)
        .addLocations('FIELD_DEFINITION')
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
      entityType = [...schema.builtInTypes<UnionType>('UnionType')].find(u => u.name === entityTypeName)!
    }
    entityType.clearTypes();
    for (const objectType of schema.types<ObjectType>("ObjectType")) {
      if (isEntityType(objectType)) {
        entityType.addType(objectType);
      }
    }

    const hasEntities = [...entityType.members()].length > 0;
    if (!hasEntities) {
      entityType.remove();
    }

    // Adds the _entities and _service fields to the root query type.
    const queryRoot = schema.schemaDefinition.root("query");
    const queryType = queryRoot ? queryRoot.type : schema.addType(new ObjectType("Query"));
    if (hasEntities && !queryType.field(entitiesFieldName)) {
      const anyType = schema.type(anyTypeName);
      assert(anyType, `The schema should have the _Any type`);
      this.addBuiltInField(queryType, entitiesFieldName, new NonNullType(new ListType(entityType)))
        .addArgument('representations', new NonNullType(new ListType(new NonNullType(anyType))));
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
          errors.push(error(
            `ROOT_${k.toUpperCase()}_USED`,
            `The schema has a type named "${defaultName}" but it is not set as the ${k} root type ("${type.name}" is instead): `
            + 'this is not supported by federation. '
            + 'If a root type does not use its default name, there should be no other type with that default name.',
            sourceASTs(type, existing)
          ));
        }
        type.rename(defaultName);
      }
    }

    const externalFieldCoordinates: string[] = [];
    // We validate the @key, @requires and @provides.
    const keyDirective = this.keyDirective(schema);
    validateAllFieldSet<CompositeType>(
      keyDirective,
      type => type,
      type => `type "${type}"`,
      errors,
      externalFieldCoordinates
    );
    validateAllFieldSet<FieldDefinition<CompositeType>>(
      this.requiresDirective(schema),
      field => field.parent!,
      field => `field "${field.coordinate}"`,
      errors,
      externalFieldCoordinates
    );
    validateAllFieldSet<FieldDefinition<CompositeType>>(
      this.providesDirective(schema),
      field => {
        const type = baseType(field.type!);
        if (!isObjectType(type)) {
          throw new GraphQLError(
            `Invalid @provides directive on field "${field.coordinate}": field has type "${field.type}" which is not an Object Type`,
            field.sourceAST);
        }
        return type;
      },
      field => `field ${field.coordinate}`,
      errors,
      externalFieldCoordinates
    );
    validateAllExternalFieldsUsed(schema, externalFieldCoordinates, errors);

    for (const key of keyDirective.applications()) {
      const parent = key.parent! as CompositeType;
      if (isInterfaceType(parent)) {
        throw new GraphQLError(`Invalid @key on interface ${parent.coordinate}: @key is not yet supported on interfaces`, key.sourceAST);
      }
    }

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

  extendsDirective(schema: Schema): DirectiveDefinition<{}> {
    return this.getTypedDirective(schema, extendsDirectiveName);
  }

  externalDirective(schema: Schema): DirectiveDefinition<{}> {
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

    let definitions = [...document.definitions];
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
      kind: 'Document',
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
  if (field.parent === field.schema()!.schemaDefinition.root("query")?.type) {
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

export function isExternal(field: FieldDefinition<CompositeType>): boolean {
  return field.hasAppliedDirective(externalDirectiveName);
}

function buildSubgraph(name: string, source: DocumentNode | string): Schema {
  try {
    return typeof source === 'string'
      ? buildSchema(new Source(source, name), federationBuiltIns)
      : buildSchemaFromAST(source, federationBuiltIns);
  } catch (e) {
    if (e instanceof GraphQLError) {
      throw addSubgraphToError(e, name);
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
  return parseSelectionSet(parentType, validateFieldSetValue(directive), new VariableDefinitions(), undefined, fieldAccessor);
}

function validateFieldSetValue(directive: Directive<NamedType | FieldDefinition<CompositeType>, {fields: any}>): string {
  const fields = directive.arguments().fields;
  if (typeof fields !== 'string') {
    throw new GraphQLError(
      `Invalid value for argument ${directive.definition!.argument('fields')!.coordinate} on ${directive.parent!.coordinate}: must be a string.`,
      directive.sourceAST
    );
  }
  return fields;
}

// 'ServiceDefinition' is originally defined in federation-js and we don't want to create a dependency
// of core-js to that just for that interface.
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

// Simple wrapper around a Subraph[] that ensures that 1) we never mistakenly get 2 subgraph with the same name,
// 2) keep the subgraphs sorted by name (makes iteration more predictable). It also allow convenient access to
// a subgraph by name so behave like a map<string, Subgraph> in most ways (but with the previously mentioned benefits).
export class Subgraphs {
  private readonly subgraphs: Subgraph[] = [];

  private idx(name: string): number {
    // Note: we could do a binary search if we ever worry that a linear scan is too costly.
    return this.subgraphs.findIndex(s => s.name === name);
  }

  add(subgraph: Subgraph): Subgraph;
  add(name: string, url: string, schema: Schema | DocumentNode | string): Subgraph;
  add(subgraphOrName: Subgraph | string, url?: string, schema?: Schema | DocumentNode | string): Subgraph {
    const toAdd: Subgraph = typeof subgraphOrName  === 'string'
      ? new Subgraph(subgraphOrName, url!, schema instanceof Schema ? schema! : buildSubgraph(subgraphOrName, schema!))
      : subgraphOrName;

    const idx = this.idx(toAdd.name);
    if (idx >= 0) {
      throw new Error(`A subgraph named ${toAdd.name} already exists` + (toAdd.url ? ` (with url '${toAdd.url}')` : ''));
    }
    this.subgraphs.push(toAdd);
    this.subgraphs.sort();
    return toAdd;
  }

  get(name: string): Subgraph | undefined {
    const idx = this.idx(name);
    return idx >= 0 ? this.subgraphs[idx] : undefined;
  }

  size(): number {
    return this.subgraphs.length;
  }

  names(): readonly string[] {
    return this.subgraphs.map(s => s.name);
  }

  values(): readonly Subgraph[] {
    return this.subgraphs;
  }

  [Symbol.iterator]() { 
    return this.subgraphs.values();
  }

  toString(): string {
    return '[' + this.subgraphs.map(s => s.name).join(', ') + ']'
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

export function addSubgraphToError(e: GraphQLError, subgraphName: string): GraphQLError {
  const updatedCauses = errorCauses(e)!.map(cause => new GraphQLError(
    `[${subgraphName}] ${cause.message}`,
    cause.nodes ? cause.nodes.map(node => addSubgraphToASTNode(node, subgraphName)) : undefined,
    cause.source,
    cause.positions,
    cause.path,
    cause.originalError,
    cause.extensions
  ));

  return ErrGraphQLValidationFailed(updatedCauses);
}
