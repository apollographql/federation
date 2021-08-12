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
  InterfaceType,
  allSchemaRootKinds,
  defaultRootName
} from "./definitions";
import { assert } from "./utils";
import { ASTNode, GraphQLError } from "graphql";

export const entityTypeName = '_Entity';
export const serviceTypeName = '_Service';
export const anyTypeName = '_Any';

export const keyDirectiveName = 'key';
export const extendsDirectiveName = 'extends';
export const externalDirectiveName = 'external';
export const requiresDirectiveName = 'requires';
export const providesDirectiveName = 'provides';
export const inaccessibleDirectiveName = 'inaccessible';

export const serviceFieldName = '_service';
export const entitiesFieldName = '_entities';

const FEDERATION_TYPES = [
  entityTypeName,
  serviceTypeName,
  anyTypeName
];
const FEDERATION_DIRECTIVES = [
  keyDirectiveName,
  extendsDirectiveName,
  externalDirectiveName,
  requiresDirectiveName,
  providesDirectiveName,
  inaccessibleDirectiveName
];
const FEDERATION_ROOT_FIELDS = [
  serviceFieldName,
  entitiesFieldName
];

export class FederationBuiltIns extends BuiltIns {
  addBuiltInTypes(schema: Schema) {
    super.addBuiltInTypes(schema);

    this.addBuiltInUnion(schema, entityTypeName);
    this.addBuiltInObject(schema, serviceTypeName).addField('sdl', schema.stringType());
    this.addBuiltInScalar(schema, anyTypeName);
  }

  addBuiltInDirectives(schema: Schema) {
    super.addBuiltInDirectives(schema);

    this.addBuiltInDirective(schema, keyDirectiveName)
      .addLocations('OBJECT', 'INTERFACE')
      .addArgument('fields', new NonNullType(schema.stringType()));

    this.addBuiltInDirective(schema, extendsDirectiveName)
      .addLocations('OBJECT', 'INTERFACE');

    this.addBuiltInDirective(schema, externalDirectiveName)
      .addLocations('OBJECT', 'FIELD_DEFINITION');

    for (const name of [requiresDirectiveName, providesDirectiveName]) {
      this.addBuiltInDirective(schema, name)
        .addLocations('FIELD_DEFINITION')
        .addArgument('fields', new NonNullType(schema.stringType()));
    }

    this.addBuiltInDirective(schema, inaccessibleDirectiveName)
      .addAllLocations();
  }

  onValidation(schema: Schema) {
    // Populate the _Entity type union.
    const entityType = schema.type(entityTypeName) as UnionType;
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
      queryType.addField(entitiesFieldName, new NonNullType(new ListType(entityType)))
        .addArgument('representations', new NonNullType(new ListType(new NonNullType(anyType))));
    }
    if (!queryType.field(serviceFieldName)) {
      queryType.addField(serviceFieldName, schema.type(serviceTypeName) as ObjectType);
    }
  }

  keyDirective(schema: Schema): DirectiveDefinition<{fields: string}> {
    return this.getTypedDirective(schema, keyDirectiveName);
  }

  extendsDirective(schema: Schema): DirectiveDefinition<{}> {
    return this.getTypedDirective(schema, extendsDirectiveName);
  }

  externalDirective(schema: Schema): DirectiveDefinition<{}> {
    return this.getTypedDirective(schema, externalDirectiveName);
  }

  requiresDirective(schema: Schema): DirectiveDefinition<{fields: string}> {
    return this.getTypedDirective(schema, requiresDirectiveName);
  }

  providesDirective(schema: Schema): DirectiveDefinition<{fields: string}> {
    return this.getTypedDirective(schema, providesDirectiveName);
  }

  inaccessibleDirective(schema: Schema): DirectiveDefinition<{}> {
    return this.getTypedDirective(schema, inaccessibleDirectiveName);
  }
}

export const federationBuiltIns = new FederationBuiltIns();

export function isFederationSubgraphSchema(schema: Schema): boolean {
  return schema.builtIns instanceof FederationBuiltIns;
}

export function isFederationType(type: NamedType): boolean {
  return FEDERATION_TYPES.includes(type.name);
}

export function isFederationField(field: FieldDefinition<ObjectType | InterfaceType>): boolean {
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

/**
 * Prepare a subgraph schema pre-merging.
 *
 * Currently, this only look for non-default root type names and rename them into
 * their default names.
 */
function prepareSubgraph(name: string, subgraph: Schema): Schema | GraphQLError {
  const onlyDefautRoots = allSchemaRootKinds.every(k => {
    const type = subgraph.schemaDefinition.root(k)?.type;
    return !type || type.name === defaultRootName(k);
  });

  if (onlyDefautRoots) {
    return subgraph;
  }

  const updated = subgraph.clone();
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
          `Subgraph ${name} has a type named ${defaultName} but it is not set as the ${k} root type (${type.name} is instead). `
          + 'If a root type does not use its default name, there should be no other type with that default name',
          nodes
        );
      }
      type.rename(defaultName);
    }
  }
  return updated;
}

export function prepareSubgraphsForFederation(subgraphs: Map<string, Schema>): Map<string, Schema> | GraphQLError[] {
  const preparedSubgraphs = new Map<string, Schema>();
  const errors: GraphQLError[] = [];
  for (const [name, subgraph] of subgraphs.entries()) {
    const schemaOrError = prepareSubgraph(name, subgraph);
    if (schemaOrError instanceof GraphQLError) {
      errors.push(schemaOrError);
    } else {
      preparedSubgraphs.set(name, schemaOrError);
    }
  }
  return errors.length > 0 ? errors : preparedSubgraphs;
}
