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
  RootType,
  ScalarType,
  Schema,
  SchemaDefinition,
  SchemaElement,
  SchemaRootKind,
  UnionType
} from "./definitions";
import { assert } from "./utils";
import { valueToString } from "./values";

export type Options = {
  indentString: string;
  definitionsOrder: ('schema' | 'types' | 'directives')[],
  rootTypesOrder: SchemaRootKind[],
  typeCompareFn?: (t1: NamedType, t2: NamedType) => number;
  directiveCompareFn?: (d1: DirectiveDefinition, d2: DirectiveDefinition) => number;
  mergeTypesAndExtensions: boolean;
  showAllBuiltIns: boolean;
  showNonGraphQLBuiltIns: boolean;
  noDescriptions: boolean;
}

export const defaultPrintOptions: Options = {
  indentString: "  ",
  definitionsOrder: ['schema', 'directives', 'types'],
  rootTypesOrder: ['query', 'mutation', 'subscription'],
  mergeTypesAndExtensions: false,
  showAllBuiltIns: false,
  showNonGraphQLBuiltIns: false,
  noDescriptions: false,
}

export function orderPrintedDefinitions(options: Options): Options {
  return {
    ...options,
    typeCompareFn: (t1, t2) => t1.name.localeCompare(t2.name),
    directiveCompareFn: (t1, t2) => t1.name.localeCompare(t2.name),
  };
}

function isDefinitionOrderValid(options: Options): boolean {
  return options.definitionsOrder.length === 3
    && options.definitionsOrder.indexOf('schema') >= 0
    && options.definitionsOrder.indexOf('types') >= 0
    && options.definitionsOrder.indexOf('directives') >= 0;
}

function validateOptions(options: Options) {
  if (!isDefinitionOrderValid(options)) {
    throw new Error(`'definitionsOrder' should be a 3-element array containing 'schema', 'types' and 'directives' in the desired order (got: [${options.definitionsOrder.join(', ')}])`);
  }
}

export function printSchema(schema: Schema, options: Options = defaultPrintOptions): string {
  validateOptions(options);
  let directives = options.showAllBuiltIns ? schema.allDirectives() : schema.directives(options.showNonGraphQLBuiltIns);
  if (options.directiveCompareFn) {
    directives = directives.concat().sort(options.directiveCompareFn);
  }
  let types = options.showAllBuiltIns ? schema.allTypes() : schema.types(undefined, options.showNonGraphQLBuiltIns);
  if (options.typeCompareFn) {
    types = types.concat().sort(options.typeCompareFn);
  }
  const definitions: string[][] = new Array(3);
  definitions[options.definitionsOrder.indexOf('schema')] = printSchemaDefinitionAndExtensions(schema.schemaDefinition, options);
  definitions[options.definitionsOrder.indexOf('directives')] = directives.map(directive => printDirectiveDefinition(directive, options));
  definitions[options.definitionsOrder.indexOf('types')] = types.flatMap(type => printTypeDefinitionAndExtensions(type, options));
  return definitions.flat().join('\n\n');
}

function definitionAndExtensions<T extends ExtendableElement>(element: {extensions(): ReadonlySet<Extension<T>>}, options: Options): (Extension<any> | null | undefined)[] {
  return options.mergeTypesAndExtensions ? [undefined] : [null, ...element.extensions()];
}

function printSchemaDefinitionAndExtensions(schemaDefinition: SchemaDefinition, options: Options): string[] {
  return printDefinitionAndExtensions(schemaDefinition, options, printSchemaDefinitionOrExtension);
}

function printDefinitionAndExtensions<T extends {extensions(): ReadonlySet<Extension<any>>}>(
  t: T,
  options: Options,
  printer: (t: T, options: Options, extension?: Extension<any> | null) => string | undefined
): string[] {
  return definitionAndExtensions(t, options)
    .map(ext => printer(t, options, ext))
    .filter(v => v !== undefined) as string[];
}

function printIsExtension(extension?: Extension<any> | null): string {
  return extension ? 'extend ' : '';
}

function forExtension<T extends {ofExtension(): Extension<any> | undefined}>(ts: readonly T[], extension?: Extension<any> |null): readonly T[]  {
  if (extension === undefined) {
    return ts;
  }
  return ts.filter(r => (r.ofExtension() ?? null) === extension);
}

function orderRoots(roots: readonly RootType[], options: Options): RootType[] {
  return roots.concat().sort((r1, r2) => options.rootTypesOrder.indexOf(r1.rootKind) - options.rootTypesOrder.indexOf(r2.rootKind));
}

function printSchemaDefinitionOrExtension(
  schemaDefinition: SchemaDefinition,
  options: Options,
  extension?: Extension<SchemaDefinition> | null
): string | undefined {
  const roots = forExtension(schemaDefinition.roots(),  extension);
  const directives = forExtension(schemaDefinition.appliedDirectives, extension);
  if (!roots.length && !directives.length) {
    return undefined;
  }
  if (!extension && !directives.length && isSchemaOfCommonNames(schemaDefinition)) {
    return undefined;
  }
  const rootEntries = orderRoots(roots, options).map((rootType) => `${options.indentString}${rootType.rootKind}: ${rootType.type}`);
  // Note that that the description is never written with the extension as `extend schema` doesn _not_ support descriptions
  return (extension ? '' : printDescription(schemaDefinition, options))
    + printIsExtension(extension)
    + 'schema'
    + printAppliedDirectives(directives, options, true, rootEntries.length !== 0)
    + (directives.length === 0 ? ' ' : '')
    + (rootEntries.length === 0 ? '' : '{\n' + rootEntries.join('\n') + '\n}');
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
  return !schema.description && schema.roots().every(r => r.isDefaultRootName());
}

/**
 * Convenience function that assumes `printTypeDefinitionAndExtensions` returns a single result and return that result.
 * Throw an error if there `printTypeDefinitionAndExtensions` returns multiple results.
 */
export function printType(type: NamedType, options: Options = defaultPrintOptions): string {
  const definitionAndExtensions = printTypeDefinitionAndExtensions(type, options);
  assert(definitionAndExtensions.length == 1, `Type ${type} is built from more than 1 definition or extension`);
  return definitionAndExtensions[0];
}

export function printTypeDefinitionAndExtensions(type: NamedType, options: Options = defaultPrintOptions): string[] {
  switch (type.kind) {
    case 'ScalarType': return printDefinitionAndExtensions(type, options, printScalarDefinitionOrExtension);
    case 'ObjectType': return printDefinitionAndExtensions(type, options, (t, options, ext) => printFieldBasedTypeDefinitionOrExtension('type', t, options, ext));
    case 'InterfaceType': return printDefinitionAndExtensions(type, options, (t, options, ext) => printFieldBasedTypeDefinitionOrExtension('interface', t, options, ext));
    case 'UnionType': return printDefinitionAndExtensions(type, options, printUnionDefinitionOrExtension);
    case 'EnumType': return printDefinitionAndExtensions(type, options, printEnumDefinitionOrExtension);
    case 'InputObjectType': return printDefinitionAndExtensions(type, options, printInputDefinitionOrExtension);
  }
}

export function printDirectiveDefinition(directive: DirectiveDefinition, options: Options): string {
  const locations = directive.locations.join(' | ');
  return `${printDescription(directive, options)}directive ${directive}${printArgs(directive.arguments(), options)}${directive.repeatable ? ' repeatable' : ''} on ${locations}`;
}

function printAppliedDirectives(
  appliedDirectives: readonly Directive<any>[],
  options: Options,
  onNewLines: boolean = false,
  endWithNewLine: boolean = onNewLines
): string {
  if (appliedDirectives.length == 0) {
    return "";
  }
  const joinStr = onNewLines ? '\n' + options.indentString : ' ';
  const directives = appliedDirectives.map(d => d.toString()).join(joinStr);
  return onNewLines ? '\n' + options.indentString + directives + (endWithNewLine ? '\n' : '') : ' ' + directives;
}

function printDescription(
  element: SchemaElement<any, any>,
  options: Options,
  indentation: string = '',
  firstInBlock: boolean = true
): string {
  if (element.description === undefined || options.noDescriptions) {
    return '';
  }

  const preferMultipleLines = element.description.length > 70;
  const blockString = printBlockString(element.description, '', preferMultipleLines);
  const prefix =
    indentation && !firstInBlock ? '\n' + indentation : indentation;

  return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
}

function printScalarDefinitionOrExtension(type: ScalarType, options: Options, extension?: Extension<any> | null): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  if (extension && !directives.length) {
    return undefined;
  }
  return `${printDescription(type, options)}${printIsExtension(extension)}scalar ${type.name}${printAppliedDirectives(directives, options, true, false)}`
}

function printImplementedInterfaces(implementations: readonly InterfaceImplementation<any>[]): string {
  return implementations.length
    ? ' implements ' + implementations.map(i => i.interface.name).join(' & ')
    : '';
}

function printFieldBasedTypeDefinitionOrExtension(kind: string, type: ObjectType | InterfaceType, options: Options, extension?: Extension<any> | null): string | undefined {
  const directives = forExtension<Directive<ObjectType | InterfaceType>>(type.appliedDirectives, extension);
  const interfaces = forExtension<InterfaceImplementation<any>>(type.interfaceImplementations(), extension);
  const fields = forExtension<FieldDefinition<any>>(type.fields(options.showNonGraphQLBuiltIns), extension);
  if (!directives.length && !interfaces.length && !fields.length) {
    return undefined;
  }
  return printDescription(type, options)
    + printIsExtension(extension)
    + kind + ' ' + type
    + printImplementedInterfaces(interfaces)
    + printAppliedDirectives(directives, options, true, fields.length > 0)
    + (directives.length === 0 ? ' ' : '')
    + printFields(fields, options);
}

function printUnionDefinitionOrExtension(type: UnionType, options: Options, extension?: Extension<any> | null): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const members = forExtension(type.members(), extension);
  if (!directives.length && !members.length) {
    return undefined;
  }
  const possibleTypes = members.length ? ' = ' + members.map(m => m.type).join(' | ') : '';
  return printDescription(type, options)
    + printIsExtension(extension)
    + 'union ' + type
    + printAppliedDirectives(directives, options, true, members.length > 0)
    + possibleTypes;
}

function printEnumDefinitionOrExtension(type: EnumType, options: Options, extension?: Extension<any> | null): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const values = forExtension(type.values, extension);
  if (!directives.length && !values.length) {
    return undefined;
  }
  const vals = values.map((v, i) =>
    printDescription(v, options, options.indentString, !i)
    + options.indentString
    + v
    + printAppliedDirectives(v.appliedDirectives, options));
  return printDescription(type, options)
    + printIsExtension(extension)
    + 'enum ' + type
    + printAppliedDirectives(directives, options, true, vals.length > 0)
    + (directives.length === 0 ? ' ' : '')
    + printBlock(vals);
}

function printInputDefinitionOrExtension(type: InputObjectType, options: Options, extension?: Extension<any> | null): string | undefined {
  const directives = forExtension(type.appliedDirectives, extension);
  const fields = forExtension(type.fields(), extension);
  if (!directives.length && !fields.length) {
    return undefined;
  }
  return printDescription(type, options)
    + printIsExtension(extension)
    + 'input ' + type
    + printAppliedDirectives(directives, options, true, fields.length > 0)
    + (directives.length === 0 ? ' ' : '')
    + printFields(fields, options);
}

function printFields(fields: readonly (FieldDefinition<any> | InputFieldDefinition)[], options: Options): string {
  return printBlock(fields.map((f, i) =>
    printDescription(f, options, options.indentString, !i)
    + options.indentString
    + printField(f, options)
    + printAppliedDirectives(f.appliedDirectives, options)));
}

function printField(field: FieldDefinition<any> | InputFieldDefinition, options: Options): string {
  const args = field.kind == 'FieldDefinition' ? printArgs(field.arguments(), options, options.indentString) : '';
  const defaultValue = field.kind === 'InputFieldDefinition' && field.defaultValue !== undefined
    ? ' = ' + valueToString(field.defaultValue, field.type)
    : '';
  return `${field.name}${args}: ${field.type}${defaultValue}`;
}

function printArgs(args: readonly ArgumentDefinition<any>[], options: Options, indentation = '') {
  if (args.length === 0) {
    return '';
  }

  // If every arg does not have a description, print them on one line.
  // Note: this line means that, for args, we skip empty descriptions (because the empty string is falsy). This is inconsistent with
  // `printDescription` where we print such description in other places. _However_, this is what graphQL-js does as well, and for now,
  // we'd rather not have things diverge because of just that.
  if (args.every(arg => !arg.description)) {
    return '(' + args.map(arg => printArg(arg, options)).join(', ') + ')';
  }

  const formattedArgs = args
    .map((arg, i) => printDescription(arg, options, '  ' + indentation, !i) + '  ' + indentation + printArg(arg, options))
    .join('\n');
  return `(\n${formattedArgs}\n${indentation})`;
}

function printArg(arg: ArgumentDefinition<any>, options: Options) {
  return `${arg}${printAppliedDirectives(arg.appliedDirectives, options)}`;
}

function printBlock(items: string[]): string {
  return items.length !== 0 ? '{\n' + items.join('\n') + '\n}' : '';
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
