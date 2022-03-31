/**
 * Forked from graphql-js printSchema.ts file @ v16.0.0
 * This file has been modified to support printing subgraph
 * schema, including associated federation directives.
 */
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
  DEFAULT_DEPRECATION_REASON,
  Kind,
  GraphQLEnumValue,
} from 'graphql';
import { isFederationType, Maybe } from './types';
import {
  gatherDirectives,
  federationDirectives,
  isFederationDirective,
} from './directives';

export function printSubgraphSchema(schema: GraphQLSchema): string {
  return printFilteredSchema(
    schema,
    // Apollo change: treat the directives defined by the federation spec
    // similarly to the directives defined by the GraphQL spec (ie, don't print
    // their definitions).
    (n) => !isSpecifiedDirective(n) && !isFederationDirective(n),
    isDefinedType,
  );
}

export function printIntrospectionSchema(schema: GraphQLSchema): string {
  return printFilteredSchema(schema, isSpecifiedDirective, isIntrospectionType);
}

// Apollo change: treat the types defined by the federation spec
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
  directiveFilter: (type: GraphQLDirective) => boolean,
  typeFilter: (type: GraphQLNamedType) => boolean,
): string {
  const directives = schema.getDirectives().filter(directiveFilter);
  const types = Object.values(schema.getTypeMap()).filter(typeFilter);

  return (
    [
      printSchemaDefinition(schema),
      printSchemaDirectives(schema),
      ...directives.map((directive) => printDirective(directive)),
      ...types.map((type) => printType(type)),
    ]
      .filter(Boolean)
      .join('\n\n') + '\n'
  );
}

function printSchemaDefinition(schema: GraphQLSchema): string | undefined {
  if (schema.description == null && isSchemaOfCommonNames(schema)) {
    return;
  }

  const operationTypes = [];

  const queryType = schema.getQueryType();
  if (queryType) {
    operationTypes.push(`  query: ${queryType.name}`);
  }

  const mutationType = schema.getMutationType();
  if (mutationType) {
    operationTypes.push(`  mutation: ${mutationType.name}`);
  }

  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType) {
    operationTypes.push(`  subscription: ${subscriptionType.name}`);
  }

  return printDescription(schema) + `schema {\n${operationTypes.join('\n')}\n}`;
}

/*
 * Apollo change: we write the fedederation directives put on the schema, if any,
 * and we we do so on a schema extension block. The reason for the later part
 * is that subgraphs printed by this function are allowed to not have a Query
 * type and so we cannot guarantee that `printSchemaDefinition` will have
 * any operation to display, and in that case the generated definition wouldn't
 * parse correctly (at least with the GraphQL-js parser). Using a schema extension
 * side-step that issue.
 */
function printSchemaDirectives(schema: GraphQLSchema): string | undefined {
  const directives = printFederationDirectives(schema);
  return directives === '' ? undefined : `extend schema${directives}`;
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
function isSchemaOfCommonNames(schema: GraphQLSchema): boolean {
  const queryType = schema.getQueryType();
  if (queryType && queryType.name !== 'Query') {
    return false;
  }

  const mutationType = schema.getMutationType();
  if (mutationType && mutationType.name !== 'Mutation') {
    return false;
  }

  const subscriptionType = schema.getSubscriptionType();
  if (subscriptionType && subscriptionType.name !== 'Subscription') {
    return false;
  }

  return true;
}

export function printType(type: GraphQLNamedType): string {
  if (isScalarType(type)) {
    return printScalar(type);
  }
  if (isObjectType(type)) {
    return printObject(type);
  }
  if (isInterfaceType(type)) {
    return printInterface(type);
  }
  if (isUnionType(type)) {
    return printUnion(type);
  }
  if (isEnumType(type)) {
    return printEnum(type);
  }
  if (isInputObjectType(type)) {
    return printInputObject(type);
  }

  // graphql-js uses an internal fn `inspect` but this is a `never` case anyhow
  throw Error('Unexpected type: ' + (type as GraphQLNamedType).toString());
}

function printScalar(type: GraphQLScalarType): string {
  return (
    printDescription(type) +
    `scalar ${type.name}` +
    printSpecifiedByURL(type) +
    // Apollo addition: print federation directives on scalar types
    printFederationDirectives(type)
  );
}

function printImplementedInterfaces(
  type: GraphQLObjectType | GraphQLInterfaceType,
): string {
  const interfaces = type.getInterfaces();
  return interfaces.length
    ? ' implements ' + interfaces.map((i) => i.name).join(' & ')
    : '';
}

function printObject(type: GraphQLObjectType): string {
  // Apollo change: print `extend` keyword on type extensions.
  //
  // The implementation assumes that an owned type will have fields defined
  // since that is required for a valid schema. Types that are *only*
  // extensions will not have fields on the astNode since that ast doesn't
  // exist.
  //
  // XXX revist extension checking
  const isExtension =
    type.extensionASTNodes && type.astNode && !type.astNode.fields;

  return (
    printDescription(type) +
    // Apollo addition: print `extend` keyword on type extensions
    (isExtension ? 'extend ' : '') +
    `type ${type.name}` +
    printImplementedInterfaces(type) +
    // Apollo addition: print federation directives on object types
    printFederationDirectives(type) +
    printFields(type)
  );
}

function printInterface(type: GraphQLInterfaceType): string {
  // Apollo change: print `extend` keyword on type extensions.
  // See printObject for assumptions made.
  //
  // XXX revist extension checking
  const isExtension =
    type.extensionASTNodes && type.astNode && !type.astNode.fields;

  return (
    printDescription(type) +
    // Apollo change: print `extend` keyword on interface extensions
    (isExtension ? 'extend ' : '') +
    `interface ${type.name}` +
    printImplementedInterfaces(type) +
    // Apollo addition: print federation directives on interface types
    printFederationDirectives(type) +
    printFields(type)
  );
}

function printUnion(type: GraphQLUnionType): string {
  const types = type.getTypes();
  const possibleTypes = types.length ? ' = ' + types.join(' | ') : '';
  return (
    printDescription(type) +
    'union ' +
    type.name +
    // Apollo addition: print federation directives on union types
    printFederationDirectives(type) +
    possibleTypes
  );
}

function printEnum(type: GraphQLEnumType): string {
  const values = type
    .getValues()
    .map(
      (value, i) =>
        printDescription(value, '  ', !i) +
        '  ' +
        value.name +
        printDeprecated(value.deprecationReason) +
        // Apollo addition: print federation directives on enum values
        printFederationDirectives(value),
    );

  return (
    printDescription(type) +
    `enum ${type.name}` +
    // Apollo addition: print federation directives on enum types
    printFederationDirectives(type) +
    printBlock(values)
  );
}

function printInputObject(type: GraphQLInputObjectType): string {
  const fields = Object.values(type.getFields()).map(
    (f, i) => printDescription(f, '  ', !i) + '  ' + printInputValue(f),
  );
  return (
    printDescription(type) +
    `input ${type.name}` +
    // Apollo addition: print federation directives on input object types
    printFederationDirectives(type) +
    printBlock(fields)
  );
}

function printFields(type: GraphQLObjectType | GraphQLInterfaceType) {
  const fields = Object.values(type.getFields()).map(
    (f, i) =>
      printDescription(f, '  ', !i) +
      '  ' +
      f.name +
      printArgs(f.args, '  ') +
      ': ' +
      String(f.type) +
      printDeprecated(f.deprecationReason) +
      // Apollo addition: print federation directives on object/interface fields
      printFederationDirectives(f),
  );
  return printBlock(fields);
}

// Apollo change: *do* print the usages of federation directives.
function printFederationDirectives(
  element:
    | GraphQLSchema
    | GraphQLNamedType
    | GraphQLField<any, any>
    | GraphQLArgument
    | GraphQLEnumValue
    | GraphQLInputField
): string {
  const federationDirectivesOnElement = gatherDirectives(element)
    .filter((n) =>
      federationDirectives.some((fedDir) => fedDir.name === n.name.value),
    )
    .map(print);
  const dedupedDirectives = [...new Set(federationDirectivesOnElement)];

  return dedupedDirectives.length > 0 ? ' ' + dedupedDirectives.join(' ') : '';
}

function printBlock(items: string[]) {
  return items.length !== 0 ? ' {\n' + items.join('\n') + '\n}' : '';
}

function printArgs(args: readonly GraphQLArgument[], indentation = '') {
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
          printDescription(arg, '  ' + indentation, !i) +
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
  return argDecl +
    printDeprecated(arg.deprecationReason) +
    // Apollo addition: print federation directives on input values
    printFederationDirectives(arg);
}

function printDirective(directive: GraphQLDirective) {
  return (
    printDescription(directive) +
    'directive @' +
    directive.name +
    printArgs(directive.args) +
    (directive.isRepeatable ? ' repeatable' : '') +
    ' on ' +
    directive.locations.join(' | ')
  );
}

function printDeprecated(reason: Maybe<string>): string {
  if (reason == null) {
    return '';
  }
  if (reason !== DEFAULT_DEPRECATION_REASON) {
    const astValue = print({ kind: Kind.STRING, value: reason });
    return ` @deprecated(reason: ${astValue})`;
  }
  return ' @deprecated';
}

// Apollo addition: support both specifiedByUrl and specifiedByURL - these
// happen across v15 and v16.
function printSpecifiedByURL(scalar: GraphQLScalarType): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = (scalar as any).specifiedByUrl ?? scalar.specifiedByURL;

  if (value == null) {
    return '';
  }
  const astValue = print({
    kind: Kind.STRING,
    value,
  });
  return ` @specifiedBy(url: ${astValue})`;
}

function printDescription(
  def: { readonly description?: Maybe<string> },
  indentation = '',
  firstInBlock = true,
): string {
  const { description } = def;
  if (description == null) {
    return '';
  }

  const preferMultipleLines = description.length > 70;
  const blockString = printBlockString(description, preferMultipleLines);
  const prefix =
    indentation && !firstInBlock ? '\n' + indentation : indentation;

  return prefix + blockString.replace(/\n/g, '\n' + indentation) + '\n';
}

/**
 * Print a block string in the indented block form by adding a leading and
 * trailing blank line. However, if a block string starts with whitespace and is
 * a single-line, adding a leading blank line would strip that whitespace.
 */
export function printBlockString(
  value: string,
  preferMultipleLines: boolean = false,
): string {
  const isSingleLine = !value.includes('\n');
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
    result += '\n';
  }
  result += value;
  if (printAsMultipleLines) {
    result += '\n';
  }

  return '"""' + result.replace(/"""/g, '\\"""') + '"""';
}
