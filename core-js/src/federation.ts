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
} from "./definitions";
import { assert } from "./utils";

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
      this.addBuiltInField(queryType, entitiesFieldName, new NonNullType(new ListType(entityType)))
        .addArgument('representations', new NonNullType(new ListType(new NonNullType(anyType))));
    }
    if (!queryType.field(serviceFieldName)) {
      this.addBuiltInField(queryType, serviceFieldName, schema.type(serviceTypeName) as ObjectType);
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
  add(name: string, url: string, schema: Schema): Subgraph;
  add(subgraphOrName: Subgraph | string, url?: string, schema?: Schema): Subgraph {
    const toAdd: Subgraph = typeof subgraphOrName  === 'string'
      ? new Subgraph(subgraphOrName, url!, schema!)
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

