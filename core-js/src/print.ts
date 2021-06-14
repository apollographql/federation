import {
  AnyDirective,
  AnyDirectiveDefinition,
  AnyFieldDefinition,
  AnySchema,
  AnyInputFieldDefinition,
  AnyInputObjectType,
  AnyNamedType,
  AnyObjectType,
  AnyScalarType,
  AnySchemaDefinition,
  AnySchemaElement,
  AnyUnionType,
  defaultRootTypeName
} from "./definitions";

const indent = "  "; // Could be made an option at some point

export function printSchema(schema: AnySchema): string {
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

function printSchemaDefinition(schemaDefinition: AnySchemaDefinition): string | undefined {
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
function isSchemaOfCommonNames(schema: AnySchemaDefinition): boolean {
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

export function printTypeDefinition(type: AnyNamedType): string {
  switch (type.kind) {
    case 'ScalarType': return printScalarType(type);
    case 'ObjectType': return printObjectType(type);
    case 'UnionType': return printUnionType(type);
    case 'InputObjectType': return printInputObjectType(type);
  }
}

export function printDirectiveDefinition(directive: AnyDirectiveDefinition): string {
  const args = directive.arguments.size == 0
    ? "" 
    : [...directive.arguments.values()].map(arg => arg.toString()).join(', ');
  const locations = directive.locations.join(' | ');
  return `directive @${directive}${args}${directive.repeatable ? ' repeatable' : ''} on ${locations}`;
}

function printAppliedDirectives(element: AnySchemaElement): string {
  const appliedDirectives = element.appliedDirectives;
  return appliedDirectives.length == 0 ? "" : " " + appliedDirectives.map((d: AnyDirective) => d.toString()).join(" ");
}

function printScalarType(type: AnyScalarType): string {
  return `scalar ${type.name}${printAppliedDirectives(type)}`
}

function printObjectType(type: AnyObjectType): string {
  // TODO: missing interfaces
  return `type ${type.name}${printAppliedDirectives(type)}` + printFields([...type.fields.values()]);
}

function printUnionType(type: AnyUnionType): string {
  const possibleTypes = type.types.length ? ' = ' + type.types.join(' | ') : '';
  return `union ${type}${possibleTypes}`;
}

function printInputObjectType(type: AnyInputObjectType): string {
  return `input ${type.name}${printAppliedDirectives(type)}` + printFields([...type.fields.values()]);
}

function printFields(fields: AnyFieldDefinition[] | AnyInputFieldDefinition[]): string {
  return printBlock(fields.map((f: AnyFieldDefinition | AnyInputFieldDefinition) => indent + `${printField(f)}${printAppliedDirectives(f)}`));
}

function printField(field: AnyFieldDefinition | AnyInputFieldDefinition): string {
  let args = '';
  if (field.kind == 'FieldDefinition' && field.arguments.size > 0) {
    args = '(' + [...field.arguments.values()].map(arg => `${arg}${printAppliedDirectives(arg)}`).join(', ') + ')';
  }
  return `${field.name}${args}: ${field.type}`;
}

function printBlock(items: string[]): string {
  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
}
