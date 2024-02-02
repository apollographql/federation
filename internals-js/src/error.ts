import { ASTNode, GraphQLError, GraphQLErrorOptions, GraphQLFormattedError } from "graphql";
import { assert } from "./utils";

// Redefining `SchemaRootKind` here instead of using the version from `./definition.ts` because we don't want
// this file to import other ones, so it can be used without worrying about recusive dependency. That
// "duplication" is very minor in practice though and unlikely to be a maintenance headache (graphQL is unlikely
// to add new root kind all that often).
type SchemaRootKind = 'query' | 'mutation' | 'subscription';

/*
 * We didn't track errors addition precisely pre-2.0 and tracking it now has an
 * unclear ROI, so we just mark all the error code that predates 2.0 as 0.x.
 */
const FED1_CODE = '0.x';

export type ErrorCodeMetadata = {
  addedIn: string,
  replaces?: string[],
}

export type ErrorCodeDefinition = {
  code: string,
  description: string,
  metadata: ErrorCodeMetadata,
  err: (message: string, options?: GraphQLErrorOptions) => GraphQLError,
}

const makeCodeDefinition = (
  code: string,
  description: string,
  metadata: ErrorCodeMetadata = DEFAULT_METADATA
): ErrorCodeDefinition => ({
  code,
  description,
  metadata,
  err: (message: string, options?: GraphQLErrorOptions) => new GraphQLError(
    message,
    {
      ...options,
      extensions: {
        ...options?.extensions,
        code,
      }
    }
  ),
});

export function extractGraphQLErrorOptions(e: GraphQLError): GraphQLErrorOptions {
  return {
    nodes: e.nodes,
    source: e.source,
    positions: e.positions,
    path: e.path,
    originalError: e.originalError,
    extensions: e.extensions,
  };
}

class AggregateGraphQLError extends GraphQLError {
  constructor(
    code: string,
    message: string,
    readonly causes: GraphQLError[],
    options?: GraphQLErrorOptions,
  ) {
    super(
      message + '. Caused by:\n' + causes.map((c) => c.toString()).join('\n\n'),
      {
        ...options,
        extensions: { code },
      }
    );
  }

  toString() {
    let output = `[${this.extensions.code}] ${super.toString()}`
    output += "\ncaused by:";
    for (const cause of this.causes) {
      output += "\n\n  - ";
      output += cause.toString().split("\n").join("\n    ");
    }
    return output;
  }
}

export function aggregateError(code: string, message: string, causes: GraphQLError[]): GraphQLError {
  return new AggregateGraphQLError(code, message, causes);
}

/**
 * Given an error, check if it is a graphQL error and potentially extract its causes if is aggregate.
 * If the error is not a graphQL error, undefined is returned.
 */
export function errorCauses(e: Error): GraphQLError[] | undefined {
  if (e instanceof AggregateGraphQLError) {
    return e.causes;
  }
  if (e instanceof GraphQLError) {
    return [e];
  }
  return undefined;
}

export function printGraphQLErrorsOrRethrow(e: Error): string {
  const causes = errorCauses(e);
  if (!causes) {
    throw e;
  }
  return causes.map(e => e.toString()).join('\n\n');
}

export function printErrors(errors: GraphQLError[]): string {
  return errors.map(e => e.toString()).join('\n\n');
}
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


export function errorCode(e: GraphQLError | GraphQLFormattedError): string | undefined {
  if (!e.extensions || !('code' in e.extensions)) {
    return undefined;
  }
  return e.extensions.code as string;
}

export function errorCodeDef(e: GraphQLError | GraphQLFormattedError | string): ErrorCodeDefinition | undefined {
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

const UNSUPPORTED_LINKED_FEATURE = makeCodeDefinition(
  'UNSUPPORTED_LINKED_FEATURE',
  'Indicates that a feature used in a @link is either unsupported or is used with unsupported options.',
);

const UNKNOWN_FEDERATION_LINK_VERSION = makeCodeDefinition(
  'UNKNOWN_FEDERATION_LINK_VERSION',
  'The version of federation in a @link directive on the schema is unknown.',
);

const UNKNOWN_LINK_VERSION = makeCodeDefinition(
  'UNKNOWN_LINK_VERSION',
  'The version of @link set on the schema is unknown.',
  { addedIn: '2.1.0' },
);

const FIELDS_HAS_ARGS = makeFederationDirectiveErrorCodeCategory(
  'FIELDS_HAS_ARGS',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes a field defined with arguments (which is not currently supported).`
);

const KEY_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS.createCode('key');
const PROVIDES_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS.createCode('provides');

const DIRECTIVE_FIELDS_MISSING_EXTERNAL = makeFederationDirectiveErrorCodeCategory(
  'FIELDS_MISSING_EXTERNAL',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes a field that is not marked as \`@external\`.`,
  { addedIn: FED1_CODE },
);

const PROVIDES_MISSING_EXTERNAL = DIRECTIVE_FIELDS_MISSING_EXTERNAL.createCode('provides');
const REQUIRES_MISSING_EXTERNAL = DIRECTIVE_FIELDS_MISSING_EXTERNAL.createCode('requires');

const DIRECTIVE_UNSUPPORTED_ON_INTERFACE = makeFederationDirectiveErrorCodeCategory(
  'UNSUPPORTED_ON_INTERFACE',
  (directive) => `A \`@${directive}\` directive is used on an interface, which is ${directive === 'key' ? 'only supported when @linking to federation 2.3+' : 'not (yet) supported'}.`,
);

const KEY_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE.createCode('key');
const PROVIDES_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE.createCode('provides');
const REQUIRES_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE.createCode('requires');

const DIRECTIVE_IN_FIELDS_ARG = makeFederationDirectiveErrorCodeCategory(
  'DIRECTIVE_IN_FIELDS_ARG',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes some directive applications. This is not supported`,
  { addedIn: '2.1.0' },
);

const KEY_HAS_DIRECTIVE_IN_FIELDS_ARGS = DIRECTIVE_IN_FIELDS_ARG.createCode('key');
const PROVIDES_HAS_DIRECTIVE_IN_FIELDS_ARGS = DIRECTIVE_IN_FIELDS_ARG.createCode('provides');
const REQUIRES_HAS_DIRECTIVE_IN_FIELDS_ARGS = DIRECTIVE_IN_FIELDS_ARG.createCode('requires');

const EXTERNAL_UNUSED = makeCodeDefinition(
  'EXTERNAL_UNUSED',
  'An `@external` field is not being used by any instance of `@key`, `@requires`, `@provides` or to satisfy an interface implementation.',
  { addedIn: FED1_CODE },
);

const TYPE_WITH_ONLY_UNUSED_EXTERNAL = makeCodeDefinition(
  'TYPE_WITH_ONLY_UNUSED_EXTERNAL',
  'A federation 1 schema has a composite type comprised only of unused external fields.'
  + ` Note that this error can _only_ be raised for federation 1 schema as federation 2 schema do not allow unused external fields (and errors with code ${EXTERNAL_UNUSED.code} will be raised in that case).`
  + ' But when federation 1 schema are automatically migrated to federation 2 ones, unused external fields are automatically removed, and in rare case this can leave a type empty. If that happens, an error with this code will be raised',
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
  'After subgraph merging, an implementation is missing a field of one of the interface it implements (which can happen for valid subgraphs).'
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

const EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE = makeCodeDefinition(
  'EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE',
  'The @external directive collides with other directives in some situations.',
  { addedIn: '2.1.0' },
);

const EXTERNAL_ARGUMENT_MISSING = makeCodeDefinition(
  'EXTERNAL_ARGUMENT_MISSING',
  'An `@external` field is missing some arguments present in the declaration(s) of that field in other subgraphs.',
);

const EXTERNAL_ARGUMENT_TYPE_MISMATCH = makeCodeDefinition(
  'EXTERNAL_ARGUMENT_TYPE_MISMATCH',
  'An `@external` field declares an argument with a type that is incompatible with the corresponding argument in the declaration(s) of that field in other subgraphs.',
);

const EXTERNAL_ARGUMENT_DEFAULT_MISMATCH = makeCodeDefinition(
  'EXTERNAL_ARGUMENT_DEFAULT_MISMATCH',
  'An `@external` field declares an argument with a default that is incompatible with the corresponding argument in the declaration(s) of that field in other subgraphs.',
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

const INVALID_FIELD_SHARING = makeCodeDefinition(
  'INVALID_FIELD_SHARING',
  'A field that is non-shareable in at least one subgraph is resolved by multiple subgraphs.'
);

const INVALID_SHAREABLE_USAGE = makeCodeDefinition(
  'INVALID_SHAREABLE_USAGE',
  'The `@shareable` federation directive is used in an invalid way.',
  { addedIn: '2.1.2' },
);

const INVALID_LINK_DIRECTIVE_USAGE = makeCodeDefinition(
  'INVALID_LINK_DIRECTIVE_USAGE',
  'An application of the @link directive is invalid/does not respect the specification.'
);

const INVALID_LINK_IDENTIFIER = makeCodeDefinition(
  'INVALID_LINK_IDENTIFIER',
  'A url/version for a @link feature is invalid/does not respect the specification.',
  { addedIn: '2.1.0' },
);

const LINK_IMPORT_NAME_MISMATCH = makeCodeDefinition(
  'LINK_IMPORT_NAME_MISMATCH',
  'The import name for a merged directive (as declared by the relevant `@link(import:)` argument) is inconsistent between subgraphs.'
);

const REFERENCED_INACCESSIBLE = makeCodeDefinition(
  'REFERENCED_INACCESSIBLE',
  'An element is marked as @inaccessible but is referenced by an element visible in the API schema.'
);

const DEFAULT_VALUE_USES_INACCESSIBLE = makeCodeDefinition(
  'DEFAULT_VALUE_USES_INACCESSIBLE',
  'An element is marked as @inaccessible but is used in the default value of an element visible in the API schema.'
);

const QUERY_ROOT_TYPE_INACCESSIBLE = makeCodeDefinition(
  'QUERY_ROOT_TYPE_INACCESSIBLE',
  'An element is marked as @inaccessible but is the query root type, which must be visible in the API schema.'
);

const REQUIRED_INACCESSIBLE = makeCodeDefinition(
  'REQUIRED_INACCESSIBLE',
  'An element is marked as @inaccessible but is required by an element visible in the API schema.'
);

const IMPLEMENTED_BY_INACCESSIBLE = makeCodeDefinition(
  'IMPLEMENTED_BY_INACCESSIBLE',
  'An element is marked as @inaccessible but implements an element visible in the API schema.'
);

const DISALLOWED_INACCESSIBLE = makeCodeDefinition(
  'DISALLOWED_INACCESSIBLE',
  'An element is marked as @inaccessible that is not allowed to be @inaccessible.'
);

const ONLY_INACCESSIBLE_CHILDREN = makeCodeDefinition(
  'ONLY_INACCESSIBLE_CHILDREN',
  'A type visible in the API schema has only @inaccessible children.'
);

const REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH = makeCodeDefinition(
  'REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH',
  'A field of an input object type is mandatory in some subgraphs, but the field is not defined in all the subgraphs that define the input object type.'
);

const REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH = makeCodeDefinition(
  'REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH',
  'An argument of a field or directive definition is mandatory in some subgraphs, but the argument is not defined in all the subgraphs that define the field or directive definition.'
);

const EMPTY_MERGED_INPUT_TYPE = makeCodeDefinition(
  'EMPTY_MERGED_INPUT_TYPE',
  'An input object type has no field common to all the subgraphs that define the type. Merging that type would result in an invalid empty input object type.'
);

const ENUM_VALUE_MISMATCH = makeCodeDefinition(
  'ENUM_VALUE_MISMATCH',
  'An enum type that is used as both an input and output type has a value that is not defined in all the subgraphs that define the enum type.'
);

const EMPTY_MERGED_ENUM_TYPE = makeCodeDefinition(
  'EMPTY_MERGED_ENUM_TYPE',
  'An enum type has no value common to all the subgraphs that define the type. Merging that type would result in an invalid empty enum type.'
);

const SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES = makeCodeDefinition(
  'SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES',
  'A shareable field return type has mismatched possible runtime types in the subgraphs in which the field is declared. As shared fields must resolve the same way in all subgraphs, this is almost surely a mistake.'
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

const OVERRIDE_ON_INTERFACE = makeCodeDefinition(
  'OVERRIDE_ON_INTERFACE',
  'The @override directive cannot be used on the fields of an interface type.',
  { addedIn: '2.3.0' },
);

const OVERRIDE_LABEL_INVALID = makeCodeDefinition(
  'OVERRIDE_LABEL_INVALID',
  'The @override directive `label` argument must match the pattern /^[a-zA-Z][a-zA-Z0-9_\-:./]*$/ or /^percent\((\d{1,2}(\.\d{1,8})?|100)\)$/',
  { addedIn: '2.7.0' },
);

const UNSUPPORTED_FEATURE = makeCodeDefinition(
  'UNSUPPORTED_FEATURE',
  'Indicates an error due to feature currently unsupported by federation.',
  { addedIn: '2.1.0' },
);

const INVALID_FEDERATION_SUPERGRAPH = makeCodeDefinition(
  'INVALID_FEDERATION_SUPERGRAPH',
  'Indicates that a schema provided for an Apollo Federation supergraph is not a valid supergraph schema.',
  { addedIn: '2.1.0' },
);

const DOWNSTREAM_SERVICE_ERROR = makeCodeDefinition(
  'DOWNSTREAM_SERVICE_ERROR',
  'Indicates an error in a subgraph service query during query execution in a federated service.',
  { addedIn: FED1_CODE },
);

const DIRECTIVE_COMPOSITION_ERROR = makeCodeDefinition(
  'DIRECTIVE_COMPOSITION_ERROR',
  'Error when composing custom directives.',
  { addedIn: '2.1.0' },
);

const INTERFACE_OBJECT_USAGE_ERROR = makeCodeDefinition(
  'INTERFACE_OBJECT_USAGE_ERROR',
  'Error in the usage of the @interfaceObject directive.',
  { addedIn: '2.3.0' },
);

const INTERFACE_KEY_NOT_ON_IMPLEMENTATION = makeCodeDefinition(
  'INTERFACE_KEY_NOT_ON_IMPLEMENTATION',
  'A `@key` is defined on an interface type, but is not defined (or is not resolvable) on at least one of the interface implementations',
  { addedIn: '2.3.0' },
);

const INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE = makeCodeDefinition(
  'INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE',
  'A subgraph has a `@key` on an interface type, but that subgraph does not define an implementation (in the supergraph) of that interface',
  { addedIn: '2.3.0' },
)

const SOURCE_FEDERATION_VERSION_REQUIRED = makeCodeDefinition(
  'SOURCE_FEDERATION_VERSION_REQUIRED',
  'Schemas using `@source{API,Type,Field}` directives must @link-import v2.7 or later of federation',
  { addedIn: '2.7.1' },
);

const SOURCE_API_NAME_INVALID = makeCodeDefinition(
  'SOURCE_API_NAME_INVALID',
  'Each `@sourceAPI` directive must take a unique and valid name as an argument',
  { addedIn: '2.7.0' },
);

const SOURCE_API_PROTOCOL_INVALID = makeCodeDefinition(
  'SOURCE_API_PROTOCOL_INVALID',
  'Each `@sourceAPI` directive must specify exactly one of the known protocols',
  { addedIn: '2.7.0' },
);

const SOURCE_API_HTTP_BASE_URL_INVALID = makeCodeDefinition(
  'SOURCE_API_HTTP_BASE_URL_INVALID',
  'The `@sourceAPI` directive must specify a valid http.baseURL',
  { addedIn: '2.7.0' },
);

const SOURCE_HTTP_HEADERS_INVALID = makeCodeDefinition(
  'SOURCE_HTTP_HEADERS_INVALID',
  'The `http.headers` argument of `@source*` directives must specify valid HTTP headers',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_API_ERROR = makeCodeDefinition(
  'SOURCE_TYPE_API_ERROR',
  'The `api` argument of the `@sourceType` directive must match a valid `@sourceAPI` name',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_PROTOCOL_INVALID = makeCodeDefinition(
  'SOURCE_TYPE_PROTOCOL_INVALID',
  'The `@sourceType` directive must specify the same protocol as its corresponding `@sourceAPI`',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_HTTP_METHOD_INVALID = makeCodeDefinition(
  'SOURCE_TYPE_HTTP_METHOD_INVALID',
  'The `@sourceType` directive must specify exactly one of `http.GET` or `http.POST`',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_HTTP_PATH_INVALID = makeCodeDefinition(
  'SOURCE_TYPE_HTTP_PATH_INVALID',
  'The `@sourceType` directive must specify a valid URL template for `http.GET` or `http.POST`',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_HTTP_BODY_INVALID = makeCodeDefinition(
  'SOURCE_TYPE_HTTP_BODY_INVALID',
  'If the `@sourceType` specifies `http.body`, it must be a valid `JSONSelection`',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_ON_NON_OBJECT_OR_NON_ENTITY = makeCodeDefinition(
  'SOURCE_TYPE_ON_NON_OBJECT_OR_NON_ENTITY',
  'The `@sourceType` directive must be applied to an object or interface type that also has `@key`',
  { addedIn: '2.7.0' },
);

const SOURCE_TYPE_SELECTION_INVALID = makeCodeDefinition(
  'SOURCE_TYPE_SELECTION_INVALID',
  'The `selection` argument of the `@sourceType` directive must be a valid `JSONSelection` that outputs fields of the GraphQL type',
);

const SOURCE_FIELD_API_ERROR = makeCodeDefinition(
  'SOURCE_FIELD_API_ERROR',
  'The `api` argument of the `@sourceField` directive must match a valid `@sourceAPI` name',
  { addedIn: '2.7.0' },
);

const SOURCE_FIELD_PROTOCOL_INVALID = makeCodeDefinition(
  'SOURCE_FIELD_PROTOCOL_INVALID',
  'If `@sourceField` specifies a protocol, it must match the corresponding `@sourceAPI` protocol',
  { addedIn: '2.7.0' },
);

const SOURCE_FIELD_HTTP_METHOD_INVALID = makeCodeDefinition(
  'SOURCE_FIELD_HTTP_METHOD_INVALID',
  'The `@sourceField` directive must specify at most one of `http.{GET,POST,PUT,PATCH,DELETE}`',
  { addedIn: '2.7.0' },
);

const SOURCE_FIELD_HTTP_PATH_INVALID = makeCodeDefinition(
  'SOURCE_FIELD_HTTP_PATH_INVALID',
  'The `@sourceField` directive must specify a valid URL template for `http.{GET,POST,PUT,PATCH,DELETE}`',
  { addedIn: '2.7.0' },
);

const SOURCE_FIELD_HTTP_BODY_INVALID = makeCodeDefinition(
  'SOURCE_FIELD_HTTP_BODY_INVALID',
  'If `@sourceField` specifies http.body, it must be a valid `JSONSelection` matching available arguments and fields',
  { addedIn: '2.7.0' },
);

const SOURCE_FIELD_SELECTION_INVALID = makeCodeDefinition(
  'SOURCE_FIELD_SELECTION_INVALID',
  'The `selection` argument of the `@sourceField` directive must be a valid `JSONSelection` that outputs fields of the GraphQL type',
  { addedIn: '2.7.0' },
);

const SOURCE_FIELD_NOT_ON_ROOT_OR_ENTITY_FIELD = makeCodeDefinition(
  'SOURCE_FIELD_NOT_ON_ROOT_OR_ENTITY_FIELD',
  'The `@sourceField` directive must be applied to a field of the `Query` or `Mutation` types, or of an entity type',
  { addedIn: '2.7.0' },
);

export const ERROR_CATEGORIES = {
  DIRECTIVE_FIELDS_MISSING_EXTERNAL,
  DIRECTIVE_UNSUPPORTED_ON_INTERFACE,
  DIRECTIVE_INVALID_FIELDS_TYPE,
  DIRECTIVE_INVALID_FIELDS,
  FIELDS_HAS_ARGS,
  ROOT_TYPE_USED,
  DIRECTIVE_IN_FIELDS_ARG,
}

export const ERRORS = {
  INVALID_GRAPHQL,
  DIRECTIVE_DEFINITION_INVALID,
  TYPE_DEFINITION_INVALID,
  UNSUPPORTED_LINKED_FEATURE,
  UNKNOWN_FEDERATION_LINK_VERSION,
  UNKNOWN_LINK_VERSION,
  KEY_FIELDS_HAS_ARGS,
  PROVIDES_FIELDS_HAS_ARGS,
  PROVIDES_MISSING_EXTERNAL,
  REQUIRES_MISSING_EXTERNAL,
  KEY_UNSUPPORTED_ON_INTERFACE,
  PROVIDES_UNSUPPORTED_ON_INTERFACE,
  REQUIRES_UNSUPPORTED_ON_INTERFACE,
  EXTERNAL_UNUSED,
  EXTERNAL_COLLISION_WITH_ANOTHER_DIRECTIVE,
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
  EXTENSION_WITH_NO_BASE,
  EXTERNAL_MISSING_ON_BASE,
  INVALID_FIELD_SHARING,
  INVALID_SHAREABLE_USAGE,
  INVALID_LINK_DIRECTIVE_USAGE,
  INVALID_LINK_IDENTIFIER,
  LINK_IMPORT_NAME_MISMATCH,
  REFERENCED_INACCESSIBLE,
  DEFAULT_VALUE_USES_INACCESSIBLE,
  QUERY_ROOT_TYPE_INACCESSIBLE,
  REQUIRED_INACCESSIBLE,
  DISALLOWED_INACCESSIBLE,
  IMPLEMENTED_BY_INACCESSIBLE,
  ONLY_INACCESSIBLE_CHILDREN,
  REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH,
  REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH,
  EMPTY_MERGED_INPUT_TYPE,
  ENUM_VALUE_MISMATCH,
  EMPTY_MERGED_ENUM_TYPE,
  SHAREABLE_HAS_MISMATCHED_RUNTIME_TYPES,
  SATISFIABILITY_ERROR,
  OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE,
  OVERRIDE_FROM_SELF_ERROR,
  OVERRIDE_SOURCE_HAS_OVERRIDE,
  OVERRIDE_ON_INTERFACE,
  OVERRIDE_LABEL_INVALID,
  UNSUPPORTED_FEATURE,
  INVALID_FEDERATION_SUPERGRAPH,
  DOWNSTREAM_SERVICE_ERROR,
  KEY_HAS_DIRECTIVE_IN_FIELDS_ARGS,
  PROVIDES_HAS_DIRECTIVE_IN_FIELDS_ARGS,
  REQUIRES_HAS_DIRECTIVE_IN_FIELDS_ARGS,
  DIRECTIVE_COMPOSITION_ERROR,
  INTERFACE_OBJECT_USAGE_ERROR,
  INTERFACE_KEY_NOT_ON_IMPLEMENTATION,
  INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE,
  // Errors related to @sourceAPI, @sourceType, and/or @sourceField
  SOURCE_FEDERATION_VERSION_REQUIRED,
  SOURCE_API_NAME_INVALID,
  SOURCE_API_PROTOCOL_INVALID,
  SOURCE_API_HTTP_BASE_URL_INVALID,
  SOURCE_HTTP_HEADERS_INVALID,
  SOURCE_TYPE_API_ERROR,
  SOURCE_TYPE_PROTOCOL_INVALID,
  SOURCE_TYPE_HTTP_METHOD_INVALID,
  SOURCE_TYPE_HTTP_PATH_INVALID,
  SOURCE_TYPE_HTTP_BODY_INVALID,
  SOURCE_TYPE_ON_NON_OBJECT_OR_NON_ENTITY,
  SOURCE_TYPE_SELECTION_INVALID,
  SOURCE_FIELD_API_ERROR,
  SOURCE_FIELD_PROTOCOL_INVALID,
  SOURCE_FIELD_HTTP_METHOD_INVALID,
  SOURCE_FIELD_HTTP_PATH_INVALID,
  SOURCE_FIELD_HTTP_BODY_INVALID,
  SOURCE_FIELD_SELECTION_INVALID,
  SOURCE_FIELD_NOT_ON_ROOT_OR_ENTITY_FIELD,
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
  ['KEY_FIELDS_MISSING_EXTERNAL', 'Using `@external` for key fields is now discouraged, unless the field is truly meant to be external.'],
  ['KEY_MISSING_ON_BASE', 'Each subgraph is now free to declare a key only if it needs it.'],
  ['MULTIPLE_KEYS_ON_EXTENSION', 'Every subgraph can have multiple keys, as necessary.'],
  ['KEY_NOT_SPECIFIED', 'Each subgraph can declare key independently of any other subgraph.'],
  ['EXTERNAL_USED_ON_BASE', 'As there is not type ownership anymore, there is also no particular limitation as to where a field can be external.'],

  ['PROVIDES_NOT_ON_ENTITY', '@provides can now be used on any type.'],
  ['REQUIRES_FIELDS_MISSING_ON_BASE', 'Fields in @requires can now be from any subgraph.'],
  ['REQUIRES_USED_ON_BASE', 'As there is not type ownership anymore, there is also no particular limitation as to which subgraph can use a @requires.'],

  ['DUPLICATE_SCALAR_DEFINITION', 'As duplicate scalar definitions is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL`.'],
  ['DUPLICATE_ENUM_DEFINITION', 'As duplicate enum definitions is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL`.'],
  ['DUPLICATE_ENUM_VALUE', 'As duplicate enum values is invalid GraphQL, this will now be an error with code `INVALID_GRAPHQL`.'],

  ['ENUM_MISMATCH', 'Subgraph definitions for an enum are now merged by composition.'],
  ['VALUE_TYPE_NO_ENTITY', 'There is no strong different between entity and value types in the model (they are just usage pattern) and a type can have keys in one subgraph but not another.'],
  ['VALUE_TYPE_UNION_TYPES_MISMATCH', 'Subgraph definitions for an union are now merged by composition.'],
  ['PROVIDES_FIELDS_SELECT_INVALID_TYPE', '@provides can now be used on field of interface, union and list types.'],
  ['RESERVED_FIELD_USED', 'This error was previously not correctly enforced: the _service and _entities, if present, were overridden; this is still the case.'],

  ['NON_REPEATABLE_DIRECTIVE_ARGUMENTS_MISMATCH', 'Since federation 2.1.0, the case this error used to cover is now a warning (with code `INCONSISTENT_NON_REPEATABLE_DIRECTIVE_ARGUMENTS`) instead of an error.'],
  ['REQUIRES_FIELDS_HAS_ARGS', 'Since federation 2.1.1, using fields with arguments in a @requires is fully supported.'],

  ['INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH', 'This error was thrown by a validation introduced to avoid running into a known runtime bug. Since federation 2.3, the underlying runtime bug has been addressed and the validation/limitation was no longer necessary and has been removed.'],
];
