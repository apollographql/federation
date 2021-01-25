import {
  GraphQLSchema,
  isSpecifiedDirective,
  isIntrospectionType,
  isSpecifiedScalarType,
  GraphQLNamedType,
  GraphQLDirective,
  isScalarType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isEnumType,
  isInputObjectType,
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLUnionType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLArgument,
  GraphQLInputField,
  astFromValue,
  print,
  GraphQLField,
  GraphQLEnumValue,
  GraphQLString,
  DEFAULT_DEPRECATION_REASON,
  ASTNode,
  SelectionNode,
} from 'graphql';
import dedent from 'dedent';
import { Maybe, ServiceDefinition, FederationType, FederationField } from '../composition';
import { isFederationType } from '../types';
import { isFederationDirective } from '../composition/utils';
import Join from '../spec/join';
import { getJoins, IntoFragment, JoinInput } from '../composition/joins'
import Using from '../spec/using';

import { default as Local, Namer } from '../spec/local';

type Options = {
  /**
   * Descriptions are defined as preceding string literals, however an older
   * experimental version of the SDL supported preceding comments as
   * descriptions. Set to true to enable this deprecated behavior.
   * This option is provided to ease adoption and will be removed in v16.
   *
   * Default: false
   */
  commentDescriptions: boolean;
  join: Join;
  local: Local;
  using: Using;
  namer: Namer;
};

function withDefaults(options: Partial<Options> = {}): Options {
  const local = options.local ?? Local.default();
  return {
    commentDescriptions: false,
    join: Join.default(),
    using: Using.default(),
    local,
    namer: local.namer(),
    ...options,
  }
}

/**
 * Accepts options as a second argument:
 *
 *    - commentDescriptions:
 *        Provide true to use preceding comments as the description.
 *
 */
export function printComposedSdl(
  schema: GraphQLSchema,
  serviceList: ServiceDefinition[],
  options?: Partial<Options>,
): string {
  const opts = withDefaults(options)
  return printFilteredSchema(
    schema,
    // Federation change: we need service and url information for the @graph directives
    serviceList,
    // Federation change: treat the directives defined by the federation spec
    // similarly to the directives defined by the GraphQL spec (ie, don't print
    // their definitions).
    (n) => !isSpecifiedDirective(n) && !isFederationDirective(n),
    isDefinedType,
    opts,
  );
}

export function printIntrospectionSchema(
  schema: GraphQLSchema,
  options: Options,
): string {
  return printFilteredSchema(
    schema,
    [],
    isSpecifiedDirective,
    isIntrospectionType,
    options,
  );
}

// Federation change: treat the types defined by the federation spec
// similarly to the directives defined by the GraphQL spec (ie, don't print
// their definitions).
function isDefinedType(type: GraphQLNamedType): boolean {
  return (
    !isSpecifiedScalarType(type) &&
    !isIntrospectionType(type) &&
    !isFederationType(type)
  );
}

function printFilteredSchema(
  schema: GraphQLSchema,
  // Federation change: we need service and url information for the @graph directives
  serviceList: ServiceDefinition[],
  directiveFilter: (type: GraphQLDirective) => boolean,
  typeFilter: (type: GraphQLNamedType) => boolean,
  options: Options,
): string {
  const directives = schema.getDirectives().filter(directiveFilter)

  const types = Object.values(schema.getTypeMap())
    .sort((type1, type2) => type1.name.localeCompare(type2.name))
    .filter(typeFilter);

  return (
    [printSchemaDefinition(schema, options)]
      .concat(
        options.using.definitions,
        options.local.definitions,
        options.join.definitions,
        printGraphs(serviceList, options),
        directives.map(directive => printDirective(directive, options)),
        types.map(type => printType(type, options)),
      )
      .filter(Boolean)
      .join('\n\n') + '\n'
  );
}

function printSchemaDefinition(
  schema: GraphQLSchema,
  options: Options
): string | undefined {
  const { using, join, local } = options;
  const operationTypes = [];

  const queryType = schema.getQueryType();
  if (queryType) {
    operationTypes.push(`query: ${queryType.name}`);
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    operationTypes.push(`mutation: ${mutationType.name}`);
  }

  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType) {
    operationTypes.push(`subscription: ${subscriptionType.name}`);
  }

  const directives = [using, join, local]
    .map(spec => using.usingSpec(spec))
    .filter(Boolean)
    .map(dir => `\n  ${dir}`)
    .join('')

  const ops = operationTypes.map(op => `\n  ${op}`).join('')
  return `schema${directives}\n{${ops}\n}`;
}

function printGraphs(serviceList: ServiceDefinition[], {join}: Options) {
  return join.Graph.define(
    serviceList.map(service => [
      service.name, join.link({ to: { http: { url: service.url! } } })
    ])
  )
}

export function printType(type: GraphQLNamedType, options: Options): string {
  return printKnownTypes(type, options) + '\n' + options.namer.definitions
}

export function printKnownTypes(type: GraphQLNamedType, options: Options): string {
  if (isScalarType(type)) {
    return printScalar(type, options);
  } else if (isObjectType(type)) {
    return printObject(type, options);
  } else if (isInterfaceType(type)) {
    return printInterface(type, options);
  } else if (isUnionType(type)) {
    return printUnion(type, options);
  } else if (isEnumType(type)) {
    return printEnum(type, options);
  } else if (isInputObjectType(type)) {
    return printInputObject(type, options);
  }

  throw Error('Unexpected type: ' + (type as GraphQLNamedType).toString());
}

function printScalar(type: GraphQLScalarType, options: Options): string {
  return printDescription(options, type) + `scalar ${type.name}`;
}

function printObject(type: GraphQLObjectType, options: Options): string {
  const interfaces = type.getInterfaces();
  const implementedInterfaces = interfaces.length
    ? ' implements ' + interfaces.map(i => i.name).join(' & ')
    : '';

  // Federation change: print `extend` keyword on type extensions.
  //
  // The implementation assumes that an owned type will have fields defined
  // since that is required for a valid schema. Types that are *only*
  // extensions will not have fields on the astNode since that ast doesn't
  // exist.
  //
  // XXX revist extension checking
  const isExtension =
    type.extensionASTNodes && type.astNode && !type.astNode.fields;

  let fields = printFields(options, type)
  return (
    printDescription(options, type) +
    (isExtension ? 'extend ' : '') +
    `type ${type.name}` +
    implementedInterfaces + ' ' +
    printJoinDirectives(type, type, options) +
    fields + '\n'
  );
}

function printJoinDirectives(type: GraphQLNamedType, node: any, options: Options): string {
  return getJoins(node)
    .map(j => `\n  ${printJoinDirective(type, j, options)}`)
    .join('')
}

function printJoinDirective(type: GraphQLNamedType, input: JoinInput, opts: Options): string {
  const {join: {join}} = opts
  const args = {
    graph: input.graph,
    type: (input as any).type,
    ...input.requires ? {
      requires: findOrCreateFragment(type, input.requires, opts)
    } : {},
    ...hasProvides(input) ? {
      provides: findOrCreateFragment(type, input.provides, opts)
    } : {}
  }
  return join(args)
}

function hasProvides(item: any): item is { provides: IntoFragment } {
  return Array.isArray(item.provides) && item.provides.length
}

function printInterface(type: GraphQLInterfaceType, options: Options): string {
  // Federation change: print `extend` keyword on type extensions.
  // See printObject for assumptions made.
  //
  // XXX revist extension checking
  const isExtension =
    type.extensionASTNodes && type.astNode && !type.astNode.fields;

  return (
    printDescription(options, type) +
    (isExtension ? 'extend ' : '') +
    `interface ${type.name} ` +
    printJoinDirectives(type, type, options) +
    printFields(options, type) +
    printFragmentsForType(type)
  );
}

function printUnion(type: GraphQLUnionType, options: Options): string {
  const types = type.getTypes();
  const possibleTypes = types.length ? ' = ' + types.join(' | ') : '';
  return printDescription(options, type) +
    'union ' + type.name +
    printJoinDirectives(type, type, options) +
    possibleTypes;
}

function printEnum(type: GraphQLEnumType, options?: Options): string {
  const values = type
    .getValues()
    .map(
      (value, i) =>
        printDescription(options, value, '  ', !i) +
        '  ' +
        value.name +
        printDeprecated(value),
    );

  return (
    printDescription(options, type) + `enum ${type.name}` + printBlock(values)
  );
}

function printInputObject(
  type: GraphQLInputObjectType,
  options?: Options,
): string {
  const fields = Object.values(type.getFields()).map(
    (f, i) =>
      printDescription(options, f, '  ', !i) + '  ' + printInputValue(f),
  );
  return (
    printDescription(options, type) + `input ${type.name}` + printBlock(fields)
  );
}

function printFields(
  options: Options,
  type: GraphQLObjectType | GraphQLInterfaceType,
) {
  const fields = Object.values(type.getFields()).map(
    (f, i) =>
      printDescription(options, f, '  ', !i) +
      '  ' +
      f.name +
      printArgs(options, f.args, '  ') +
      ': ' +
      String(f.type) +
      printDeprecated(f) +
      printFederationFieldDirectives(type, f, options),
  );

  // Federation change: for entities, we want to print the block on a new line.
  // This is just a formatting nice-to-have.
  const isEntity = Boolean(type.extensions?.federation?.keys);

  return printBlock(fields, isEntity);
}

export function printWithReducedWhitespace(ast: ASTNode): string {
  return print(ast)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Federation change: print fieldsets for @key, @requires, and @provides directives
 *
 * @param selections
 */
function printFieldSet(selections: readonly SelectionNode[]): string {
  return `{ ${selections.map(printWithReducedWhitespace).join(' ')} }`;
}

/**
 * Federation change: print @resolve, @requires, and @provides directives
 *
 * @param field
 */
function printFederationFieldDirectives(
  type: GraphQLObjectType | GraphQLInterfaceType,
  field: GraphQLField<any, any>,
  options: Options
): string {
  const {join} = options;

  if (type.astNode?.kind === 'InterfaceTypeDefinition')
    return ''

  if (!field.extensions?.federation) {
    const fedType: FederationType = type.extensions?.federation;
    const {serviceName, isValueType} = fedType
    if (isValueType || !serviceName) return ''
    return ` ${join.join({ graph: serviceName })}`
  }

  const {
    serviceName,
    requires = [],
    provides = [],
  }: FederationField = field.extensions.federation;

  return ' ' + join.join({
    graph: serviceName!,
    requires: requires.length
      ? findOrCreateFragment(type, requires, options)
      : undefined,
    provides: provides.length
      ? findOrCreateFragment(type, provides, options)
      : undefined,
  })
}

type FragmentSource = (GraphQLObjectType | GraphQLInterfaceType) & {
  fragments?: Map<string, { id: string, text: string }>,
  nextFragmentId?: number
}

function findOrCreateFragment(
  type: GraphQLNamedType,
  selections: readonly SelectionNode[],
  {namer}: Options
): string {
  const key = `${type.name}_${printFieldSet(selections)}`;
  return namer(key, (id: string) => dedent `
    fragment ${id} on ${type.name}
    ${printFieldSet(selections)}
  `)
}

function printFragmentsForType(type: FragmentSource) {
  return [...type.fragments?.values() ?? []].map(f => `\n${f.text}`).join();
}

// Federation change: `onNewLine` is a formatting nice-to-have for printing
// types that have a list of directives attached, i.e. an entity.
function printBlock(items: string[], onNewLine?: boolean) {
  return items.length !== 0
    ? onNewLine
      ? '\n{\n' + items.join('\n') + '\n}'
      : ' {\n' + items.join('\n') + '\n}'
    : '';
}

function printArgs(
  options: Options | undefined,
  args: GraphQLArgument[],
  indentation = '',
) {
  if (args.length === 0) {
    return '';
  }

  // If every arg does not have a description, print them on one line.
  if (args.every((arg) => !arg.description)) {
    return '(' + args.map(printInputValue).join(', ') + ')';
  }

  return (
    '(\n' +
    args
      .map(
        (arg, i) =>
          printDescription(options, arg, '  ' + indentation, !i) +
          '  ' +
          indentation +
          printInputValue(arg),
      )
      .join('\n') +
    '\n' +
    indentation +
    ')'
  );
}

function printInputValue(arg: GraphQLInputField) {
  const defaultAST = astFromValue(arg.defaultValue, arg.type);
  let argDecl = arg.name + ': ' + String(arg.type);
  if (defaultAST) {
    argDecl += ` = ${print(defaultAST)}`;
  }
  return argDecl;
}

function printDirective(directive: GraphQLDirective, options?: Options) {
  return (
    printDescription(options, directive) +
    'directive @' +
    directive.name +
    printArgs(options, directive.args) +
    (directive.isRepeatable ? ' repeatable' : '') +
    ' on ' +
    directive.locations.join(' | ')
  );
}

function printDeprecated(
  fieldOrEnumVal: GraphQLField<any, any> | GraphQLEnumValue,
) {
  if (!fieldOrEnumVal.isDeprecated) {
    return '';
  }
  const reason = fieldOrEnumVal.deprecationReason;
  const reasonAST = astFromValue(reason, GraphQLString);
  if (reasonAST && reason !== DEFAULT_DEPRECATION_REASON) {
    return ' @deprecated(reason: ' + print(reasonAST) + ')';
  }
  return ' @deprecated';
}

function printDescription<T extends { description?: Maybe<string> }>(
  options: Options | undefined,
  def: T,
  indentation = '',
  firstInBlock = true,
): string {
  const { description } = def;
  if (description == null) {
    return '';
  }

  if (options?.commentDescriptions === true) {
    return printDescriptionWithComments(description, indentation, firstInBlock);
  }

  const preferMultipleLines = description.length > 70;
  const blockString = printBlockString(description, '', preferMultipleLines);
  const prefix =
    indentation && !firstInBlock ? '\n' + indentation : indentation;

  return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
}

function printDescriptionWithComments(
  description: string,
  indentation: string,
  firstInBlock: boolean,
) {
  const prefix = indentation && !firstInBlock ? '\n' : '';
  const comment = description
    .split('\n')
    .map((line) => indentation + (line !== '' ? '# ' + line : '#'))
    .join('\n');

  return prefix + comment + '\n';
}

/**
 * Print a block string in the indented block form by adding a leading and
 * trailing blank line. However, if a block string starts with whitespace and is
 * a single-line, adding a leading blank line would strip that whitespace.
 *
 * @internal
 */
export function printBlockString(
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
