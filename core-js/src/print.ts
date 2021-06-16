import {
  defaultRootTypeName,
    DirectiveDefinition,
    EnumType,
    FieldDefinition,
    InputFieldDefinition,
    InputObjectType,
    InterfaceType,
    NamedType,
    ObjectType,
    ScalarType,
  Schema,
  SchemaDefinition,
  SchemaElement,
  UnionType
} from "./definitions";

const indent = "  "; // Could be made an option at some point

export function printSchema(schema: Schema): string {
  const directives = [...schema.directives.values()].filter(d => !d.isBuiltIn);
  const types = [...schema.types.values()]
    .filter(t => !t.isBuiltIn)
    .sort((type1, type2) => type1.name.localeCompare(type2.name));
  return (
    [printSchemaDefinition(schema.schemaDefinition)]
      .concat(
        directives.map(directive => printDirectiveDefinition(directive)),
        types.map(type => printTypeDefinition(type)),
      )
      .filter(Boolean)
      .join('\n\n')
  );
}

function printSchemaDefinition(schemaDefinition: SchemaDefinition): string | undefined {
  if (isSchemaOfCommonNames(schemaDefinition)) {
    return;
  }
  const rootEntries = [...schemaDefinition.roots.entries()].map(([root, type]) => `${indent}${root}: ${type}`);
  return `schema${printAppliedDirectives(schemaDefinition)} {\n${rootEntries.join('\n')}\n}`;
}

/**
 * GraphQL schema define root types for each type of operation. These types are
 * the same as any other type and can be named in any manner, however there is
 * a common naming convention:
 *
 *   schema {
 *     query: Query
 *     mutation: Mutation
 *   }
 *
 * When using this naming convention, the schema description can be omitted.
 */
function isSchemaOfCommonNames(schema: SchemaDefinition): boolean {
  if (schema.appliedDirectives.length > 0) {
    return false;
  }
  for (const [root, type] of schema.roots) {
    if (type.name != defaultRootTypeName(root)) {
      return false;
    }
  }
  return true;
}

export function printTypeDefinition(type: NamedType): string {
  switch (type.kind) {
    case 'ScalarType': return printScalarType(type);
    case 'ObjectType': return printFieldBasedType('type', type);
    case 'InterfaceType': return printFieldBasedType('interface', type);
    case 'UnionType': return printUnionType(type);
    case 'EnumType': return printEnumType(type);
    case 'InputObjectType': return printInputObjectType(type);
  }
}

export function printDirectiveDefinition(directive: DirectiveDefinition): string {
  const args = directive.arguments.size == 0
    ? "" 
    : [...directive.arguments.values()].map(arg => arg.toString()).join(', ');
  const locations = directive.locations.join(' | ');
  return `directive @${directive}${args}${directive.repeatable ? ' repeatable' : ''} on ${locations}`;
}

function printAppliedDirectives(element: SchemaElement<any, any>): string {
  const appliedDirectives = element.appliedDirectives;
  return appliedDirectives.length == 0 ? "" : " " + appliedDirectives.map(d => d.toString()).join(" ");
}

function printScalarType(type: ScalarType): string {
  return `scalar ${type.name}${printAppliedDirectives(type)}`
}

function printImplementedInterfaces(type: ObjectType | InterfaceType): string {
  return type.interfaces.length
    ? ' implements ' + type.interfaces.map(i => i.name).join(' & ')
    : '';
}

function printFieldBasedType(kind: string, type: ObjectType | InterfaceType): string {
  return `${kind} ${type.name}${printImplementedInterfaces(type)}${printAppliedDirectives(type)}` + printFields([...type.fields.values()]);
}

function printUnionType(type: UnionType): string {
  const possibleTypes = type.types.length ? ' = ' + type.types.join(' | ') : '';
  return `union ${type}${possibleTypes}`;
}

function printEnumType(type: EnumType): string {
  const vals = type.values.map(v => `${v}${printAppliedDirectives(v)}`);
  return `enum ${type}${printBlock(vals)}`;
}

function printInputObjectType(type: InputObjectType): string {
  return `input ${type.name}${printAppliedDirectives(type)}` + printFields([...type.fields.values()]);
}

function printFields(fields: (FieldDefinition<any> | InputFieldDefinition)[]): string {
  return printBlock(fields.map(f => indent + `${printField(f)}${printAppliedDirectives(f)}`));
}

function printField(field: FieldDefinition<any> | InputFieldDefinition): string {
  let args = '';
  if (field.kind == 'FieldDefinition' && field.arguments.size > 0) {
    args = '(' + [...field.arguments.values()].map(arg => `${arg}${printAppliedDirectives(arg)}`).join(', ') + ')';
  }
  return `${field.name}${args}: ${field.type}`;
}

function printBlock(items: string[]): string {
  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
}
