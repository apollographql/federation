import {
  ArgumentDefinition,
    Directive,
  DirectiveDefinition,
  EnumType,
  ExtendableElement,
  Extension,
  FieldDefinition,
  InputFieldDefinition,
  InputObjectType,
  InterfaceImplementation,
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
    printSchemaDefinitionAndExtensions(schema.schemaDefinition)
      .concat(
        directives.map(directive => printDirectiveDefinition(directive)),
        types.flatMap(type => printTypeDefinitionAndExtensions(type)),
      )
      .filter(Boolean)
      .join('\n\n')
  );
}

function definitionAndExtensions<T extends ExtendableElement>(element: {extensions(): ReadonlySet<Extension<T>>}) {
  return [undefined, ...element.extensions()];
}

function printSchemaDefinitionAndExtensions(schemaDefinition: SchemaDefinition): string[] {
  if (isSchemaOfCommonNames(schemaDefinition)) {
    return [];
  }
  return printDefinitionAndExtensions(schemaDefinition, printSchemaDefinitionOrExtension);
}

function printDefinitionAndExtensions<T extends {extensions(): ReadonlySet<Extension<any>>}>(
  t: T,
  printer: (t: T, extension?: Extension<any>) => string | undefined
): string[] {
  return definitionAndExtensions(t)
    .map(ext => printer(t, ext))
    .filter(v => v !== undefined) as string[];
}

function printIsExtension(extension?: Extension<any>): string {
  return extension ? 'extend ' : '';
}

function forExtension<T extends {ofExtension(): Extension<any> | undefined}>(ts: readonly T[], extension?: Extension<any>): T[]  {
  return ts.filter(r => r.ofExtension() === extension);
}

function printSchemaDefinitionOrExtension(
  schemaDefinition: SchemaDefinition,
  extension?: Extension<SchemaDefinition>
): string | undefined {
  const roots = forExtension([...schemaDefinition.roots()],  extension);
  const directives = forExtension(schemaDefinition.appliedDirectives, extension);
  if (!roots.length && !directives.length) {
    return undefined;
  }
  const rootEntries = roots.map((rootType) => `${indent}${rootType.rootKind}: ${rootType.type}`);
  return printDescription(schemaDefinition)
    + printIsExtension(extension)
    + 'schema'
    + printAppliedDirectives(directives)
    + ' {\n' + rootEntries.join('\n') + '\n}';
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
  return schema.appliedDirectives.length === 0 && !schema.description && [...schema.roots()].every(r => r.isDefaultRootName());
}

export function printTypeDefinitionAndExtensions(type: NamedType): string[] {
  switch (type.kind) {
    case 'ScalarType': return printDefinitionAndExtensions(type, printScalarDefinitionOrExtension);
    case 'ObjectType': return printDefinitionAndExtensions(type, (t, ext) => printFieldBasedTypeDefinitionOrExtension('type', t, ext));
    case 'InterfaceType': return printDefinitionAndExtensions(type, (t, ext) => printFieldBasedTypeDefinitionOrExtension('interface', t, ext));
    case 'UnionType': return printDefinitionAndExtensions(type, printUnionDefinitionOrExtension);
    case 'EnumType': return printDefinitionAndExtensions(type, printEnumDefinitionOrExtension);
    case 'InputObjectType': return printDefinitionAndExtensions(type, printInputDefinitionOrExtension);
  }
}

export function printDirectiveDefinition(directive: DirectiveDefinition): string {
  const locations = directive.locations.join(' | ');
  return `${printDescription(directive)}directive @${directive}${printArgs([...directive.arguments()])}${directive.repeatable ? ' repeatable' : ''} on ${locations}`;
}

function printAppliedDirectives(appliedDirectives: readonly Directive<any>[]): string {
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

function printScalarDefinitionOrExtension(type: ScalarType, extension?: Extension<any>): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  if (extension && !directives.length) {
    return undefined;
  }
  return `${printDescription(type)}${printIsExtension(extension)}scalar ${type.name}${printAppliedDirectives(directives)}`
}

function printImplementedInterfaces(implementations: InterfaceImplementation<any>[]): string {
  return implementations.length
    ? ' implements ' + implementations.map(i => i.interface.name).join(' & ')
    : '';
}

function printFieldBasedTypeDefinitionOrExtension(kind: string, type: ObjectType | InterfaceType, extension?: Extension<any>): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const interfaces = forExtension([...type.interfaceImplementations()], extension);
  const fields = forExtension([...type.fields.values()], extension);
  if (!directives.length && !interfaces.length && !fields.length) {
    return undefined;
  }
  return printDescription(type)
    + printIsExtension(extension)
    + kind + ' ' + type
    + printImplementedInterfaces(interfaces)
    + printAppliedDirectives(directives)
    + printFields(fields);
}

function printUnionDefinitionOrExtension(type: UnionType, extension?: Extension<any>): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const members = forExtension([...type.members()], extension);
  if (!directives.length && !members.length) {
    return undefined;
  }
  const possibleTypes = members.length ? ' = ' + members.map(m => m.type).join(' | ') : '';
  return printDescription(type)
    + printIsExtension(extension)
    + 'union ' + type
    + printAppliedDirectives(directives)
    + possibleTypes;
}

function printEnumDefinitionOrExtension(type: EnumType, extension?: Extension<any>): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const values = forExtension(type.values, extension);
  if (!directives.length && !values.length) {
    return undefined;
  }
  const vals = values.map(v => `${v}${printAppliedDirectives(v.appliedDirectives)}`);
  return printDescription(type)
    + printIsExtension(extension)
    + 'enum ' + type
    + printAppliedDirectives(directives)
    + printBlock(vals);
}

function printInputDefinitionOrExtension(type: InputObjectType, extension?: Extension<any>): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const fields = forExtension([...type.fields.values()], extension);
  if (!directives.length && !fields.length) {
    return undefined;
  }
  return printDescription(type)
    + printIsExtension(extension)
    + 'input ' + type
    + printAppliedDirectives(directives)
    + printFields(fields);
}

function printFields(fields: (FieldDefinition<any> | InputFieldDefinition)[]): string {
  return printBlock(fields.map((f, i) => printDescription(f, indent, !i) + indent + printField(f) + printAppliedDirectives(f.appliedDirectives)));
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
  return `${arg}${printAppliedDirectives(arg.appliedDirectives)}`;
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
