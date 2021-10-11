/**
 * Forked from graphql-js printSchema.ts file @ v16.0.0
 * This file has been modified to support printing federated
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
  GraphQLEnumValue,
  DEFAULT_DEPRECATION_REASON,
} from 'graphql';
import type {
  FederationType,
  FederationField,
  FieldSet,
} from '../composition/types';
import { Maybe } from '../composition';
import { assert } from '../utilities';
import { printFieldSet } from '../composition/utils';
import { otherKnownDirectives } from '@apollo/subgraph/dist/directives';
interface PrintingContext {
  // Apollo addition: we need access to a map from serviceName to its corresponding
  // sanitized / uniquified enum value `Name` from the `join__Graph` enum
  graphNameToEnumValueName?: Record<string, string>;
}

// Apollo change: we need service and url information for the join__Graph enum
export function printSupergraphSdl(
  schema: GraphQLSchema,
  graphNameToEnumValueName: Record<string, string>,
): string {
  const context: PrintingContext = {
    graphNameToEnumValueName,
  }

  return printFilteredSchema(
    schema,
    (n) => !isSpecifiedDirective(n),
    isDefinedType,
    context,
  );
}

export function printIntrospectionSchema(schema: GraphQLSchema): string {
  return printFilteredSchema(
    schema,
    isSpecifiedDirective,
    isIntrospectionType,
    // Apollo change: no printing context needed for introspection
    {},
  );
}

function isDefinedType(type: GraphQLNamedType): boolean {
  return !isSpecifiedScalarType(type) && !isIntrospectionType(type);
}

function printFilteredSchema(
  schema: GraphQLSchema,
  directiveFilter: (type: GraphQLDirective) => boolean,
  typeFilter: (type: GraphQLNamedType) => boolean,
  // Apollo addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  const directives = schema.getDirectives().filter(directiveFilter);
  const types = Object.values(schema.getTypeMap()).filter(typeFilter);

  return (
    [
      printSchemaDefinition(schema),
      ...directives.map((directive) => printDirective(directive)),
      ...types.map((type) => printType(type, context)),
    ]
      .filter(Boolean)
      .join('\n\n') + '\n'
  );
}

function printSchemaDefinition(schema: GraphQLSchema): string {
  // Apollo removal: we always print the schema definition
  // if (schema.description == null && isSchemaOfCommonNames(schema)) {
  //   return;
  // }
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

  return (
    printDescription(schema) +
    'schema' +
    // Apollo change: print @core directive usages on schema node
    printCoreDirectives(schema) +
    `\n{\n${operationTypes.join('\n')}\n}`
  );
}

function printCoreDirectives(schema: GraphQLSchema) {
  const otherKnownDirectiveNames = otherKnownDirectives.map(
    ({ name }) => name,
  );
  const schemaDirectiveNames = schema.getDirectives().map(({ name }) => name);
  const otherKnownDirectivesToInclude = schemaDirectiveNames.filter((name) =>
    otherKnownDirectiveNames.includes(name),
  );
  const otherKnownDirectiveSpecUrls = otherKnownDirectivesToInclude.map(
    (name) => ({
      feature: `https://specs.apollo.dev/${name}/v0.1`,
    }),
  );

  return [
    { feature: 'https://specs.apollo.dev/core/v0.2' },
    { feature: 'https://specs.apollo.dev/join/v0.1', purpose: 'EXECUTION' },
    ...otherKnownDirectiveSpecUrls,
  ].map(
    ({ feature, purpose }) =>
      `\n  @core(feature: ${printStringLiteral(feature)}${
        purpose ? `, for: ${purpose}` : ''
      })`,
  );
}

export function printType(
  type: GraphQLNamedType,
  // Apollo addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  if (isScalarType(type)) {
    return printScalar(type);
  }
  if (isObjectType(type)) {
    return printObject(type, context);
  }
  if (isInterfaceType(type)) {
    return printInterface(type, context);
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
    printDescription(type) + `scalar ${type.name}` + printSpecifiedByURL(type)
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

function printObject(
  type: GraphQLObjectType,
  // Apollo addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  return (
    printDescription(type) +
    `type ${type.name}` +
    printImplementedInterfaces(type) +
    // Apollo addition for printing @join__owner and @join__type usages
    printTypeJoinDirectives(type, context) +
    printKnownDirectiveUsagesOnType(type) +
    printFields(type, context)
  );
}

// Apollo addition: print @tag usages (+ other future Apollo-specific directives)
function printKnownDirectiveUsagesOnType(
  type: GraphQLObjectType | GraphQLInterfaceType | GraphQLUnionType,
): string {
  const tagUsages =
    (type.extensions?.federation as FederationType)?.directiveUsages?.get(
      'tag',
    ) ?? [];
  if (tagUsages.length === 0) return '';

  return '\n  ' + tagUsages.map(print).join('\n  ');
}

// Apollo addition: print @join__owner and @join__type usages
function printTypeJoinDirectives(
  type: GraphQLObjectType | GraphQLInterfaceType,
  context: PrintingContext,
): string {
  const metadata: FederationType = type.extensions?.federation;
  if (!metadata) return '';

  const { serviceName: ownerService, keys } = metadata;
  if (!ownerService || !keys) return '';

  // Separate owner @keys from the rest of the @keys so we can print them
  // adjacent to the @owner directive.
  const { [ownerService]: ownerKeys = [], ...restKeys } = keys;
  const ownerEntry: [string, FieldSet[]] = [
    ownerService,
    ownerKeys,
  ];
  const restEntries = Object.entries(restKeys);

  // We don't want to print an owner for interface types
  const shouldPrintOwner = isObjectType(type);

  const ownerGraphEnumValue = context.graphNameToEnumValueName?.[ownerService];
  assert(
    ownerGraphEnumValue,
    `Unexpected enum value missing for subgraph ${ownerService}`,
  );
  const joinOwnerString = shouldPrintOwner
    ? `\n  @join__owner(graph: ${ownerGraphEnumValue})`
    : '';

  return (
    joinOwnerString +
    [ownerEntry, ...restEntries]
      .map(([service, keys = []]) =>
        keys
          .map((selections) => {
            const typeGraphEnumValue =
              context.graphNameToEnumValueName?.[service];
            assert(
              typeGraphEnumValue,
              `Unexpected enum value missing for subgraph ${service}`,
            );
            return `\n  @join__type(graph: ${typeGraphEnumValue}, key: ${printStringLiteral(
              printFieldSet(selections),
            )})`;
          })
          .join(''),
      )
      .join('')
  );
}

function printInterface(
  type: GraphQLInterfaceType,
  // Apollo addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  return (
    printDescription(type) +
    `interface ${type.name}` +
    printImplementedInterfaces(type) +
    // Apollo addition for printing @join__owner and @join__type usages
    printTypeJoinDirectives(type, context) +
    printKnownDirectiveUsagesOnType(type) +
    printFields(type, context)
  );
}

function printUnion(type: GraphQLUnionType): string {
  const types = type.getTypes();
  // Apollo addition: print @tag usages
  const knownDirectiveUsages = printKnownDirectiveUsagesOnType(type);
  const possibleTypes = types.length
    ? `${knownDirectiveUsages.length ? '\n' : ' '}= ` + types.join(' | ')
    : '';
  return (
    printDescription(type) +
    'union ' +
    type.name +
    // Apollo addition: print @tag usages
    knownDirectiveUsages +
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
        // Apollo addition: print federation directives on `join__Graph` enum values
        printDirectivesOnEnumValue(type, value),
    );

  return (
    printDescription(type) + `enum ${type.name}` + printBlock(values)
  );
}

// Apollo addition: print federation directives on `join__Graph` enum values
function printDirectivesOnEnumValue(type: GraphQLEnumType, value: GraphQLEnumValue) {
  if (type.name === "join__Graph") {
    return ` @join__graph(name: ${printStringLiteral((value.value.name))} url: ${printStringLiteral(value.value.url ?? '')})`
  }
  return '';
}

function printInputObject(type: GraphQLInputObjectType): string {
  const fields = Object.values(type.getFields()).map(
    (f, i) => printDescription(f, '  ', !i) + '  ' + printInputValue(f),
  );
  return printDescription(type) + `input ${type.name}` + printBlock(fields);
}

function printFields(
  type: GraphQLObjectType | GraphQLInterfaceType,
  // Apollo addition - see `PrintingContext` type for details
  context: PrintingContext,
) {
  const fields = Object.values(type.getFields()).map(
    (f, i) =>
      printDescription(f, '  ', !i) +
      '  ' +
      f.name +
      printArgs(f.args, '  ') +
      ': ' +
      String(f.type) +
      printDeprecated(f.deprecationReason) +
      // Apollo addition: print directives on fields
      // We don't want to print field owner directives on fields belonging to an interface type
      (isObjectType(type)
        ? printJoinFieldDirectives(f, type, context) +
          printKnownDirectiveUsagesOnFields(f)
        : ''),
  );

  // Apollo addition: for entities, we want to print the block on a new line.
  // This is just a formatting nice-to-have.
  const isEntity = Boolean(type.extensions?.federation?.keys);
  const hasTags = Boolean(
    type.extensions?.federation?.directiveUsages?.get('tag')?.length,
  );

  return printBlock(fields, isEntity || hasTags);
}

/**
 * Apollo addition: print @join__field directives
 *
 * @param field
 * @param parentType
 */
function printJoinFieldDirectives(
  field: GraphQLField<any, any>,
  parentType: GraphQLObjectType | GraphQLInterfaceType,
  // Apollo addition - see `PrintingContext` type for details
  context: PrintingContext,
): string {
  const directiveArgs: string[] = [];

  const fieldMetadata: FederationField | undefined =
    field.extensions?.federation;

  let serviceName = fieldMetadata?.serviceName;

  // For entities (which we detect through the existence of `keys`),
  // although the join spec doesn't currently require `@join__field(graph:)` when
  // a field can be resolved from the owning service, the code we used
  // previously did include it in those cases. And especially since we want to
  // remove type ownership, I think it makes to keep the same behavior.
  if (!serviceName && parentType.extensions?.federation.keys) {
    serviceName = parentType.extensions?.federation.serviceName;
  }

  if (serviceName) {
    const enumValue = context.graphNameToEnumValueName?.[serviceName];
    assert(
      enumValue,
      `Unexpected enum value missing for subgraph ${serviceName}`,
    );

    directiveArgs.push(`graph: ${enumValue}`);
  }

  const requires = fieldMetadata?.requires;

  if (requires && requires.length > 0) {
    directiveArgs.push(
      `requires: ${printStringLiteral(printFieldSet(requires))}`,
    );
  }

  const provides = fieldMetadata?.provides;

  if (provides && provides.length > 0) {
    directiveArgs.push(
      `provides: ${printStringLiteral(printFieldSet(provides))}`,
    );
  }

  // A directive without arguments isn't valid (nor useful).
  if (directiveArgs.length < 1) return '';

  return ` @join__field(${directiveArgs.join(', ')})`;
}

// Apollo addition: print `@tag` directives (and possibly other future known
// directives) found in subgraph SDL into the supergraph SDL
function printKnownDirectiveUsagesOnFields(field: GraphQLField<any, any>) {
  const tagUsages = (
    field.extensions?.federation as FederationField
  )?.directiveUsages?.get('tag');
  if (!tagUsages || tagUsages.length < 1) return '';
  return ` ${tagUsages
    .slice()
    .sort((a, b) => a.name.value.localeCompare(b.name.value))
    .map(print)
    .join(' ')}`;
};

// Apollo addition: `onNewLine` is a formatting nice-to-have for printing
// types that have a list of directives attached, i.e. an entity.
function printBlock(items: string[], onNewLine?: boolean) {
  return items.length !== 0
    ? onNewLine
      ? '\n{\n' + items.join('\n') + '\n}'
      : ' {\n' + items.join('\n') + '\n}'
    : '';
}

function printArgs(args: GraphQLArgument[], indentation = '') {
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
  return argDecl + printDeprecated(arg.deprecationReason);
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
    const astValue = print({ kind: 'StringValue', value: reason });
    return ` @deprecated(reason: ${astValue})`;
  }
  return ' @deprecated';
}

// Apollo addition: support both specifiedByUrl and specifiedByURL - these
// happen across v15 and v16.
function printSpecifiedByURL(scalar: GraphQLScalarType): string {
  if (
    scalar.specifiedByUrl == null &&
    // @ts-ignore (accomodate breaking change across 15.x -> 16.x)
    scalar.specifiedByURL == null
  ) {
    return '';
  }
  const astValue = print({
    kind: 'StringValue',
    value:
      scalar.specifiedByUrl ??
      // @ts-ignore (accomodate breaking change across 15.x -> 16.x)
      scalar.specifiedByURL,
  });
  return ` @specifiedBy(url: ${astValue})`;
}

function printDescription(
  def: { description?: Maybe<string> },
  indentation: string = '',
  firstInBlock: boolean = true,
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

// Apollo addition
// Using JSON.stringify ensures that we will generate a valid string literal,
// escaping quote marks, backslashes, etc. when needed.
// The `graphql-js` printer also does this when printing out a `StringValue`:
// https://github.com/graphql/graphql-js/blob/d4bcde8d3e7a7cb8462044ff21122a3996af8655/src/language/printer.js#L109-L112
function printStringLiteral(value: string) {
  return JSON.stringify(value);
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
