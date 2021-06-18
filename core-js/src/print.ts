import {
    ArgumentDefinition,
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
  const directives = [...schema.directives()];
  const types = [...schema.types()]
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
  return `${printDescription(schemaDefinition)}schema${printAppliedDirectives(schemaDefinition)} {\n${rootEntries.join('\n')}\n}`;
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
  if (schema.appliedDirectives.length > 0 || schema.description) {
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
  const locations = directive.locations.join(' | ');
  return `${printDescription(directive)}directive @${directive}${printArgs([...directive.arguments()])}${directive.repeatable ? ' repeatable' : ''} on ${locations}`;
}

function printAppliedDirectives(element: SchemaElement<any>): string {
  const appliedDirectives = element.appliedDirectives;
  return appliedDirectives.length == 0 ? "" : " " + appliedDirectives.map(d => d.toString()).join(" ");
}

function printDescription(
  element: SchemaElement<any>,
  indentation: string = '',
  firstInBlock: boolean = true
): string {
  if (!element.description) {
    return '';
  }

  const preferMultipleLines = element.description.length > 70;
  const blockString = printBlockString(element.description, '', preferMultipleLines);
  const prefix =
    indentation && !firstInBlock ? '\n' + indentation : indentation;

  return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
}

function printScalarType(type: ScalarType): string {
  return `${printDescription(type)}scalar ${type.name}${printAppliedDirectives(type)}`
}

function printImplementedInterfaces(type: ObjectType | InterfaceType): string {
  return type.interfaces.length
    ? ' implements ' + type.interfaces.map(i => i.name).join(' & ')
    : '';
}

function printFieldBasedType(kind: string, type: ObjectType | InterfaceType): string {
  return `${printDescription(type)}${kind} ${type.name}${printImplementedInterfaces(type)}${printAppliedDirectives(type)}` + printFields([...type.fields.values()]);
}

function printUnionType(type: UnionType): string {
  const possibleTypes = type.types.length ? ' = ' + type.types.join(' | ') : '';
  return `${printDescription(type)}union ${type}${printAppliedDirectives(type)}${possibleTypes}`;
}

function printEnumType(type: EnumType): string {
  const vals = type.values.map(v => `${v}${printAppliedDirectives(v)}`);
  return `${printDescription(type)}enum ${type}${printAppliedDirectives(type)}${printBlock(vals)}`;
}

function printInputObjectType(type: InputObjectType): string {
  return `${printDescription(type)}input ${type.name}${printAppliedDirectives(type)}` + printFields([...type.fields.values()]);
}

function printFields(fields: (FieldDefinition<any> | InputFieldDefinition)[]): string {
  return printBlock(fields.map((f, i) => printDescription(f, indent, !i) + indent + `${printField(f)}${printAppliedDirectives(f)}`));
}

function printField(field: FieldDefinition<any> | InputFieldDefinition): string {
  let args = field.kind == 'FieldDefinition' ? printArgs([...field.arguments.values()], indent) : '';
  return `${field.name}${args}: ${field.type}`;
}

function printArgs(args: ArgumentDefinition<any>[], indentation = '') {
  if (args.length === 0) {
    return '';
  }

  // If every arg does not have a description, print them on one line.
  if (args.every(arg => !arg.description)) {
    return '(' + args.map(printArg).join(', ') + ')';
  }

  const formattedArgs = args
    .map((arg, i) => printDescription(arg, '  ' + indentation, !i) + '  ' + indentation + printArg(arg))
    .join('\n');
  return `(\n${formattedArgs}\n${indentation})`;
}

function printArg(arg: ArgumentDefinition<any>) {
  return `${arg}${printAppliedDirectives(arg)}`;
}

function printBlock(items: string[]): string {
  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
}

/**
 * Print a block string in the indented block form by adding a leading and
 * trailing blank line. However, if a block string starts with whitespace and is
 * a single-line, adding a leading blank line would strip that whitespace.
 */
function printBlockString(
  value: string,
  indentation: string = '',
  preferMultipleLines: boolean = false,
): string {
  const isSingleLine = value.indexOf('\n') === -1;
  const hasLeadingSpace = value[0] === ' ' || value[0] === '\t';
  const hasTrailingQuote = value[value.length - 1] === '"';
  const hasTrailingSlash = value[value.length - 1] === '\\';
  const printAsMultipleLines =
    !isSingleLine ||
    hasTrailingQuote ||
    hasTrailingSlash ||
    preferMultipleLines;

  let result = '';
  // Format a multi-line block quote to account for leading space.
  if (printAsMultipleLines && !(isSingleLine && hasLeadingSpace)) {
    result += '\n' + indentation;
  }
  result += indentation ? value.replace(/\n/g, '\n' + indentation) : value;
  if (printAsMultipleLines) {
    result += '\n';
  }

  return '"""' + result.replace(/"""/g, '\\"""') + '"""';
}
