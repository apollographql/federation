import { ASTNode, GraphQLError, Source } from "graphql";
import { SchemaRootKind } from "./definitions";
import { assert } from "./utils";

/*
 * We didn't track errors addition precisely pre-2.0 and tracking it now has an
 * unclear ROI, so we just mark all the error code that predates 2.0 as 0.x.
 */
const FED1_CODE = '0.x';

export type ErrorCodeMetadata = {
  addedIn: string,
  replaces?: string[],
}

export type GraphQLErrorArgs = {
  message: string,
  nodes?: readonly ASTNode[] | ASTNode,
  source?: Source,
  positions?: readonly number[],
  path?: readonly (string | number)[],
  originalError?: Error | null,
  extensions?: { [key: string]: unknown },
};


export type ErrorCodeDefinition = {
  code: string,
  description: string,
  metadata: ErrorCodeMetadata,
  err: (args: GraphQLErrorArgs) => GraphQLError,
}

const makeCodeDefinition = (
  code: string,
  description: string,
  metadata: ErrorCodeMetadata = DEFAULT_METADATA
): ErrorCodeDefinition => ({
  code,
  description,
  metadata,
  err: ({
    message,
    nodes,
    source,
    positions,
    path,
    originalError,
    extensions,
  }: GraphQLErrorArgs) => new GraphQLError(
    message,
    nodes,
    source,
    positions,
    path,
    originalError,
    {
      ...extensions,
      code,
    },
  ),
});

/*
 * Most codes currently originate from the initial fed 2 release so we use this for convenience.
 * This can be changed later, inline versions everywhere, if that becomes irrelevant.
 */
const DEFAULT_METADATA = { addedIn: '2.0.0' };

export type ErrorCodeCategory<TElement = string> = {
  get(element: TElement): ErrorCodeDefinition;
}

const makeErrorCodeCategory = <TElement = string>(
  extractCode: (element: TElement) => string,
  makeDescription: (element: TElement) => string,
  metadata: ErrorCodeMetadata = DEFAULT_METADATA,
): ErrorCodeCategory<TElement> & { createCode(element: TElement): ErrorCodeDefinition } => ({
  createCode: (element: TElement) => {
    return makeCodeDefinition(extractCode(element), makeDescription(element), metadata);
  },
  get: (element: TElement) => {
    const def = codeDefByCode[extractCode(element)];
    assert(def, `Unexpected element: ${element}`);
    return def;
  }
});

const makeFederationDirectiveErrorCodeCategory = (
  codeSuffix: string,
  makeDescription: (directiveName: string) => string,
  metadata: ErrorCodeMetadata = DEFAULT_METADATA,
) => makeErrorCodeCategory((directive) => `${directive.toLocaleUpperCase()}_${codeSuffix}`, makeDescription, metadata);


export function errorCode(e: GraphQLError): string | undefined {
  if (!('code' in e.extensions)) {
    return undefined;
  }
  return e.extensions.code as string;
}

export function errorCodeDef(e: GraphQLError | string): ErrorCodeDefinition | undefined {
  const code = typeof e === 'string' ? e : errorCode(e);
  return code ? codeDefByCode[code] : undefined;
}

export function withModifiedErrorMessage(e: GraphQLError, newMessage: string): GraphQLError {
  return new GraphQLError(
    newMessage,
    {
      nodes: e.nodes,
      source: e.source,
      positions: e.positions,
      path: e.path,
      originalError: e.originalError,
      extensions: e.extensions
    }
  );
}

export function withModifiedErrorNodes(e: GraphQLError, newNodes: readonly ASTNode[] | ASTNode | undefined): GraphQLError {
  return new GraphQLError(
    e.message,
    {
      nodes: newNodes,
      source: e.source,
      positions: e.positions,
      path: e.path,
      originalError: e.originalError,
      extensions: e.extensions
    }
  );
}

const INVALID_GRAPHQL = makeCodeDefinition(
  'INVALID_GRAPHQL',
  'A schema is invalid GraphQL: it violates one of the rule of the specification.'
);

const DIRECTIVE_DEFINITION_INVALID = makeCodeDefinition(
  'DIRECTIVE_DEFINITION_INVALID',
  'A built-in or federation directive has an invalid definition in the schema.',
  { ...DEFAULT_METADATA, replaces: ['TAG_DEFINITION_INVALID'] },
);

const TYPE_DEFINITION_INVALID = makeCodeDefinition(
  'TYPE_DEFINITION_INVALID',
  'A built-in or federation type has an invalid definition in the schema.',
);

const UNKNOWN_FEDERATION_LINK_VERSION = makeCodeDefinition(
  'UNKNOWN_FEDERATION_LINK_VERSION',
  'The version of federation in a @link directive on the schema is unknown.',
);

const FIELDS_HAS_ARGS = makeFederationDirectiveErrorCodeCategory(
  'FIELDS_HAS_ARGS',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes a field defined with arguments (which is not currently supported).`
);

const KEY_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS.createCode('key');
const PROVIDES_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS.createCode('provides');
const REQUIRES_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS.createCode('requires');

const DIRECTIVE_FIELDS_MISSING_EXTERNAL = makeFederationDirectiveErrorCodeCategory(
  'FIELDS_MISSING_EXTERNAL',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes a field that is not marked as \`@external\`.`,
  { addedIn: FED1_CODE },
);

const PROVIDES_MISSING_EXTERNAL = DIRECTIVE_FIELDS_MISSING_EXTERNAL.createCode('provides');
const REQUIRES_MISSING_EXTERNAL = DIRECTIVE_FIELDS_MISSING_EXTERNAL.createCode('requires');

const DIRECTIVE_UNSUPPORTED_ON_INTERFACE = makeFederationDirectiveErrorCodeCategory(
  'UNSUPPORTED_ON_INTERFACE',
  (directive) => `A \`@${directive}\` directive is used on an interface, which is not (yet) supported.`,
);

const KEY_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE.createCode('key');
const PROVIDES_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE.createCode('provides');
const REQUIRES_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE.createCode('requires');

const EXTERNAL_UNUSED = makeCodeDefinition(
  'EXTERNAL_UNUSED',
  'An `@external` field is not being used by any instance of `@key`, `@requires`, `@provides` or to satisfy an interface implememtation.',
  { addedIn: FED1_CODE },
);

const TYPE_WITH_ONLY_UNUSED_EXTERNAL = makeCodeDefinition(
  'TYPE_WITH_ONLY_UNUSED_EXTERNAL',
  'A federation 1 schema has a composite type comprised only of unused external fields.'
  + ` Note that this error can _only_ be raised for federation 1 schema as federation 2 schema do not allow unused external fields (and errors with code ${EXTERNAL_UNUSED.code} will be raised in that case).`
  + ' But when federation 1 schema are automatically migrated to federation 2 ones, unused external fields are automaticaly removed, and in rare case this can leave a type empty. If that happens, an error with this code will be raised',
);

const PROVIDES_ON_NON_OBJECT_FIELD = makeCodeDefinition(
  'PROVIDES_ON_NON_OBJECT_FIELD',
  'A `@provides` directive is used to mark a field whose base type is not an object type.'
);

const DIRECTIVE_INVALID_FIELDS_TYPE = makeFederationDirectiveErrorCodeCategory(
  'INVALID_FIELDS_TYPE',
  (directive) => `The value passed to the \`fields\` argument of a \`@${directive}\` directive is not a string.`,
);

const KEY_INVALID_FIELDS_TYPE = DIRECTIVE_INVALID_FIELDS_TYPE.createCode('key');
const PROVIDES_INVALID_FIELDS_TYPE = DIRECTIVE_INVALID_FIELDS_TYPE.createCode('provides');
const REQUIRES_INVALID_FIELDS_TYPE = DIRECTIVE_INVALID_FIELDS_TYPE.createCode('requires');

const DIRECTIVE_INVALID_FIELDS = makeFederationDirectiveErrorCodeCategory(
  'INVALID_FIELDS',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive is invalid (it has invalid syntax, includes unknown fields, ...).`,
);

const KEY_INVALID_FIELDS = DIRECTIVE_INVALID_FIELDS.createCode('key');
const PROVIDES_INVALID_FIELDS = DIRECTIVE_INVALID_FIELDS.createCode('provides');
const REQUIRES_INVALID_FIELDS = DIRECTIVE_INVALID_FIELDS.createCode('requires');

const KEY_FIELDS_SELECT_INVALID_TYPE = makeCodeDefinition(
  'KEY_FIELDS_SELECT_INVALID_TYPE',
  'The `fields` argument of `@key` directive includes a field whose type is a list, interface, or union type. Fields of these types cannot be part of a `@key`',
  { addedIn: FED1_CODE },
)

const ROOT_TYPE_USED = makeErrorCodeCategory<SchemaRootKind>(
  (kind) => `ROOT_${kind.toLocaleUpperCase()}_USED`,
  (kind) => `A subgraph's schema defines a type with the name \`${kind}\`, while also specifying a _different_ type name as the root query object. This is not allowed.`,
  { addedIn: FED1_CODE },
);

const ROOT_QUERY_USED = ROOT_TYPE_USED.createCode('query');
const ROOT_MUTATION_USED = ROOT_TYPE_USED.createCode('mutation');
const ROOT_SUBSCRIPTION_USED = ROOT_TYPE_USED.createCode('subscription');

const INVALID_SUBGRAPH_NAME = makeCodeDefinition(
  'INVALID_SUBGRAPH_NAME',
  'A subgraph name is invalid (subgraph names cannot be a single underscore ("_")).'
);

const NO_QUERIES = makeCodeDefinition(
  'NO_QUERIES',
  'None of the composed subgraphs expose any query.'
);

const INTERFACE_FIELD_NO_IMPLEM = makeCodeDefinition(
  'INTERFACE_FIELD_NO_IMPLEM',
  'After subgraph merging, an implemenation is missing a field of one of the interface it implements (which can happen for valid subgraphs).'
);

const TYPE_KIND_MISMATCH = makeCodeDefinition(
  'TYPE_KIND_MISMATCH',
  'A type has the same name in different subgraphs, but a different kind. For instance, one definition is an object type but another is an interface.',
  { ...DEFAULT_METADATA, replaces: ['VALUE_TYPE_KIND_MISMATCH', 'EXTENSION_OF_WRONG_KIND', 'ENUM_MISMATCH_TYPE'] },
);

const EXTERNAL_TYPE_MISMATCH = makeCodeDefinition(
  'EXTERNAL_TYPE_MISMATCH',
  'An `@external` field has a type that is incompatible with the declaration(s) of that field in other subgraphs.',
  { addedIn: FED1_CODE },
);

const EXTERNAL_ARGUMENT_MISSING = makeCodeDefinition(
  'EXTERNAL_ARGUMENT_MISSING',
  'An `@external` field is missing some arguments present in the declaration(s) of that field in other subgraphs.',
);

const EXTERNAL_ARGUMENT_TYPE_MISMATCH = makeCodeDefinition(
  'EXTERNAL_ARGUMENT_TYPE_MISMATCH',
  'An `@external` field declares an argument with a type that is incompatible with the corresponding argument in the declaration(s) of that field in other subgtaphs.',
);

const EXTERNAL_ARGUMENT_DEFAULT_MISMATCH = makeCodeDefinition(
  'EXTERNAL_ARGUMENT_DEFAULT_MISMATCH',
  'An `@external` field declares an argument with a default that is incompatible with the corresponding argument in the declaration(s) of that field in other subgtaphs.',
);

const EXTERNAL_ON_INTERFACE = makeCodeDefinition(
  'EXTERNAL_ON_INTERFACE',
  'The field of an interface type is marked with `@external`: as external is about marking field not resolved by the subgraph and as interface field are not resolved (only implementations of those fields are), an "external" interface field is nonsensical',
);

const MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL = makeCodeDefinition(
  'MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL',
  'In a subgraph, a field is both marked @external and has a merged directive applied to it',
);

const FIELD_TYPE_MISMATCH = makeCodeDefinition(
  'FIELD_TYPE_MISMATCH',
  'A field has a type that is incompatible with other declarations of that field in other subgraphs.',
  { ...DEFAULT_METADATA, replaces: ['VALUE_TYPE_FIELD_TYPE_MISMATCH'] },
);

const ARGUMENT_TYPE_MISMATCH = makeCodeDefinition(
  'FIELD_ARGUMENT_TYPE_MISMATCH',
  'An argument (of a field/directive) has a type that is incompatible with that of other declarations of that same argument in other subgraphs.',
  { ...DEFAULT_METADATA, replaces: ['VALUE_TYPE_INPUT_VALUE_MISMATCH'] },
);

const INPUT_FIELD_DEFAULT_MISMATCH = makeCodeDefinition(
  'INPUT_FIELD_DEFAULT_MISMATCH',
  'An input field has a default value that is incompatible with other declarations of that field in other subgraphs.',
);

const ARGUMENT_DEFAULT_MISMATCH = makeCodeDefinition(
  'FIELD_ARGUMENT_DEFAULT_MISMATCH',
  'An argument (of a field/directive) has a default value that is incompatible with that of other declarations of that same argument in other subgraphs.',
);

const NON_REPEATABLE_DIRECTIVE_ARGUMENTS_MISMATCH = makeCodeDefinition(
  'NON_REPEATABLE_DIRECTIVE_ARGUMENTS_MISMATCH',
  'A non-repeatable directive is applied to a schema element in different subgraphs but with arguments that are different.',
);

const EXTENSION_WITH_NO_BASE = makeCodeDefinition(
  'EXTENSION_WITH_NO_BASE',
  'A subgraph is attempting to `extend` a type that is not originally defined in any known subgraph.',
  { addedIn: FED1_CODE },
);

const EXTERNAL_MISSING_ON_BASE = makeCodeDefinition(
  'EXTERNAL_MISSING_ON_BASE',
  'A field is marked as `@external` in a subgraph but with no non-external declaration in any other subgraph.',
  { addedIn: FED1_CODE },
);

const INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH = makeCodeDefinition(
  'INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH',
  'For an interface field, some of its concrete implementations have @external or @requires and there is difference in those implementations return type (which is currently not supported; see https://github.com/apollographql/federation/issues/1257)'
);

const INVALID_FIELD_SHARING = makeCodeDefinition(
  'INVALID_FIELD_SHARING',
  'A field that is non-shareable in at least one subgraph is resolved by multiple subgraphs.'
);

const INVALID_LINK_DIRECTIVE_USAGE = makeCodeDefinition(
  'INVALID_LINK_DIRECTIVE_USAGE',
  'An application of the @link directive is invalid/does not respect the specification.'
);

const LINK_IMPORT_NAME_MISMATCH = makeCodeDefinition(
  'LINK_IMPORT_NAME_MISMATCH',
  'The import name for a merged directive (as declared by the relevant `@link(import:)` argument) is inconsistent between subgraphs.'
);

const REFERENCED_INACCESSIBLE = makeCodeDefinition(
  'REFERENCED_INACCESSIBLE',
  'An element is marked as @inaccessible but is referenced by a non-inaccessible element.'
);

const REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH = makeCodeDefinition(
  'REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH',
  'An argument of a field or directive definition is mandatory in some subgraphs, but the argument is not defined in all subgraphs that define the field or directive definition.'
);

const SATISFIABILITY_ERROR = makeCodeDefinition(
  'SATISFIABILITY_ERROR',
  'Subgraphs can be merged, but the resulting supergraph API would have queries that cannot be satisfied by those subgraphs.',
);

const OVERRIDE_FROM_SELF_ERROR = makeCodeDefinition(
  'OVERRIDE_FROM_SELF_ERROR',
  'Field with `@override` directive has "from" location that references its own subgraph.',
);

const OVERRIDE_SOURCE_HAS_OVERRIDE = makeCodeDefinition(
  'OVERRIDE_SOURCE_HAS_OVERRIDE',
  'Field which is overridden to another subgraph is also marked @override.',
);

const OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE = makeCodeDefinition(
  'OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE',
  'The @override directive cannot be used on external fields, nor to override fields with either @external, @provides, or @requires.',
);

export const ERROR_CATEGORIES = {
  DIRECTIVE_FIELDS_MISSING_EXTERNAL,
  DIRECTIVE_UNSUPPORTED_ON_INTERFACE,
  DIRECTIVE_INVALID_FIELDS_TYPE,
  DIRECTIVE_INVALID_FIELDS,
  FIELDS_HAS_ARGS,
  ROOT_TYPE_USED,
}

export const ERRORS = {
  INVALID_GRAPHQL,
  DIRECTIVE_DEFINITION_INVALID,
  TYPE_DEFINITION_INVALID,
  UNKNOWN_FEDERATION_LINK_VERSION,
  KEY_FIELDS_HAS_ARGS,
  PROVIDES_FIELDS_HAS_ARGS,
  REQUIRES_FIELDS_HAS_ARGS,
  PROVIDES_MISSING_EXTERNAL,
  REQUIRES_MISSING_EXTERNAL,
  KEY_UNSUPPORTED_ON_INTERFACE,
  PROVIDES_UNSUPPORTED_ON_INTERFACE,
  REQUIRES_UNSUPPORTED_ON_INTERFACE,
  EXTERNAL_UNUSED,
  TYPE_WITH_ONLY_UNUSED_EXTERNAL,
  PROVIDES_ON_NON_OBJECT_FIELD,
  KEY_INVALID_FIELDS_TYPE,
  PROVIDES_INVALID_FIELDS_TYPE,
  REQUIRES_INVALID_FIELDS_TYPE,
  KEY_INVALID_FIELDS,
  PROVIDES_INVALID_FIELDS,
  REQUIRES_INVALID_FIELDS,
  KEY_FIELDS_SELECT_INVALID_TYPE,
  ROOT_QUERY_USED,
  ROOT_MUTATION_USED,
  ROOT_SUBSCRIPTION_USED,
  INVALID_SUBGRAPH_NAME,
  NO_QUERIES,
  INTERFACE_FIELD_NO_IMPLEM,
  TYPE_KIND_MISMATCH,
  EXTERNAL_TYPE_MISMATCH,
  EXTERNAL_ARGUMENT_MISSING,
  EXTERNAL_ARGUMENT_TYPE_MISMATCH,
  EXTERNAL_ARGUMENT_DEFAULT_MISMATCH,
  EXTERNAL_ON_INTERFACE,
  MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL,
  FIELD_TYPE_MISMATCH,
  ARGUMENT_TYPE_MISMATCH,
  INPUT_FIELD_DEFAULT_MISMATCH,
  ARGUMENT_DEFAULT_MISMATCH,
  NON_REPEATABLE_DIRECTIVE_ARGUMENTS_MISMATCH,
  EXTENSION_WITH_NO_BASE,
  EXTERNAL_MISSING_ON_BASE,
  INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH,
  INVALID_FIELD_SHARING,
  INVALID_LINK_DIRECTIVE_USAGE,
  LINK_IMPORT_NAME_MISMATCH,
  REFERENCED_INACCESSIBLE,
  REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH,
  SATISFIABILITY_ERROR,
  OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE,
  OVERRIDE_FROM_SELF_ERROR,
  OVERRIDE_SOURCE_HAS_OVERRIDE,
};

const codeDefByCode = Object.values(ERRORS).reduce((obj: {[code: string]: ErrorCodeDefinition}, codeDef: ErrorCodeDefinition) => { obj[codeDef.code] = codeDef; return obj; }, {});

/*
 * A list of now-removed errors, each as a pair of the old code and a comment for the removal.
 * This exist mostly for the sake of being included in the auto-generated documentation. But
 * having it here means that grepping any error code in this file should turn up something:
 * - either a currently active code.
 * - or one that has been replaced/generalized (in a `replaces:` of an active code).
 * - or a now removed code below.
 */
export const REMOVED_ERRORS = [
  ['KEY_FIELDS_MISSING_ON_BASE', 'Keys can now use any field from any other subgraph.'],
  ['KEY_FIELDS_MISSING_EXTERNAL', 'Using `@external` for key fields is now decouraged, unless the field is truly meant to be external.'],
  ['KEY_MISSING_ON_BASE', 'Each subgraph is now free to declare a key only if it needs it.'],
  ['MULTIPLE_KEYS_ON_EXTENSION', 'Every subgraph can have multiple keys, as necessary.'],
  ['KEY_NOT_SPECIFIED', 'Each subgraph can declare key independently of any other subgraph.'],
  ['EXTERNAL_USED_ON_BASE', 'As there is not type ownership anymore, there is also no particular limitation as to where a field can be external.'],

  ['PROVIDES_NOT_ON_ENTITY', '@provides can now be used on any type.'],
  ['REQUIRES_FIELDS_MISSING_ON_BASE', 'Fields in @requires can now be from any subgraph.'],
  ['REQUIRES_USED_ON_BASE', 'As there is not type ownership anymore, there is also no particular limitation as to which subgraph can use a @requires.'],

  ['DUPLICATE_SCALAR_DEFINITION', 'As duplicate scalar definitions is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL`'],
  ['DUPLICATE_ENUM_DEFINITION', 'As duplicate enum definitions is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL`'],
  ['DUPLICATE_ENUM_VALUE', 'As duplicate enum values is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL`'],

  ['ENUM_MISMATCH', 'Subgraph definitions for an enum are now merged by composition'],
  ['VALUE_TYPE_NO_ENTITY', 'There is no strong different between entity and value types in the model (they are just usage pattern) and a type can have keys in one subgraph but not another.'],
  ['VALUE_TYPE_UNION_TYPES_MISMATCH', 'Subgraph definitions for an union are now merged by composition'],
  ['PROVIDES_FIELDS_SELECT_INVALID_TYPE', '@provides can now be used on field of interface, union and list types'],
  ['RESERVED_FIELD_USED', 'This error was previously not correctly enforced: the _service and _entities, if present, were overriden; this is still the case'],
];
