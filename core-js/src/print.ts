import {
    AnyDirective,
  AnyDirectiveDefinition,
  AnyFieldDefinition,
  AnyGraphQLDocument,
  AnyInputFieldDefinition,
  AnyInputObjectType,
  AnyNamedType,
  AnyObjectType,
  AnyScalarType,
  AnySchema,
  AnySchemaElement,
  AnyUnionType,
  defaultRootTypeName,
  isBuiltInDirective,
  isBuiltInType
} from "./definitions";
import { federationMachineryTypesNames, federationDirectivesNames } from "./federation";

const indent = "  "; // Could be made an option at some point

const defaultTypeFilter = (type: AnyNamedType) => (
  !isBuiltInType(type) &&
  !federationMachineryTypesNames.includes(type.name)
);

const defaultDirectiveFilter = (directive: AnyDirectiveDefinition) => (
  !isBuiltInDirective(directive) &&
  !federationDirectivesNames.includes(directive.name)
);

export function printDocument(document: AnyGraphQLDocument): string {
  return printFilteredDocument(document, defaultTypeFilter, defaultDirectiveFilter);
}

function printFilteredDocument(
  document: AnyGraphQLDocument,
  typeFilter: (type: AnyNamedType) => boolean,
  directiveFilter: (type: AnyDirectiveDefinition) => boolean
): string {
  const directives = [...document.directives.values()].filter(directiveFilter);
  const types = [...document.types.values()]
    .sort((type1, type2) => type1.name.localeCompare(type2.name))
    .filter(typeFilter);
  return (
    [printSchema(document.schema)]
      .concat(
        directives.map(directive => printDirectiveDefinition(directive)),
        types.map(type => printTypeDefinition(type)),
      )
      .filter(Boolean)
      .join('\n\n')
  );
}

function printSchema(schema: AnySchema): string | undefined {
  if (isSchemaOfCommonNames(schema)) {
    return;
  }
  const rootEntries = [...schema.roots.entries()].map(([root, type]) => `${indent}${root}: ${type}`);
  return `schema {\n${rootEntries.join('\n')}\n}`;
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
function isSchemaOfCommonNames(schema: AnySchema): boolean {
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
  const args = directive.arguments().size == 0
    ? "" 
    : [...directive.arguments().values()].map(arg => arg.toString()).join(', ');
  // TODO: missing isRepeatable and locations
  return `directive @${directive}${args}`;
}

function printAppliedDirectives(element: AnySchemaElement): string {
  const appliedDirectives = element.appliedDirectives();
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
  if (field.kind == 'FieldDefinition' && field.arguments().size > 0) {
    args = '(' + [...field.arguments().values()].map(arg => `${arg}${printAppliedDirectives(arg)}`).join(', ') + ')';
  }
  return `${field.name}${args}: ${field.type()}`;
}

function printBlock(items: string[]): string {
  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
}
