import { ASTNode, GraphQLError, Source } from "graphql";
import { SchemaRootKind } from "./definitions";
import { assert, MapWithCachedArrays } from "./utils";

/*
 * We didn't track errors addition precisely pre-2.0 and tracking it now has an
 * unclear ROI, so we just mark all the error code that predates 2.0 as 0.x.
 */
const FED1_CODE = '0.x';

export interface ErrorCodeMetadata {
  addedIn: string,
  replaces?: string[],
}

export class ErrorCodeDefinition {
  constructor(
    readonly code: string,
    // Describes the error code. This is expected to use markdown formatting if necessary.
    readonly description: string,
    readonly metadata: ErrorCodeMetadata,
  ) {
  }

  err(
    message: string,
    nodes?: readonly ASTNode[] | ASTNode,
    source?: Source,
    positions?: readonly number[],
    path?: readonly (string | number)[],
    originalError?: Error | null,
    extensions?: { [key: string]: unknown },
  ) {
    return new GraphQLError(
      message,
      nodes,
      source,
      positions,
      path,
      originalError,
      {
        ...extensions,
        code: this.code,
      },
    );
  }
}

/*
 * Most codes currently originate from the initial fed 2 release so we use this for convenience.
 * This can be changed later, inline versions everywhere, if that becomes irrelevant.
 */
const DEFAULT_METADATA = { addedIn: '2.0.0' };

export class ErrorCodeRegistry {
  private readonly codes = new MapWithCachedArrays<string, ErrorCodeDefinition>();

  add(
    code: string,
    description: string,
    metadata: ErrorCodeMetadata = DEFAULT_METADATA
  ): ErrorCodeDefinition {
    const def = new ErrorCodeDefinition(code, description, metadata);
    this.codes.set(code, def);
    return def;
  }

  get(code: string): ErrorCodeDefinition | undefined {
    return this.codes.get(code);
  }

  getWithDefault(code: string | undefined, defaultCode: ErrorCodeDefinition): ErrorCodeDefinition {
    if (!code) {
      return defaultCode;
    }
    return this.get(code) ?? defaultCode;
  }

  registeredDefinitions(): readonly ErrorCodeDefinition[] {
    return this.codes.values();
  }
}

export interface ErrorCodeCategory<TElement = string> {
  get(element: TElement): ErrorCodeDefinition;
}

class ConcreteErrorCodeCategory<TElement = string> implements ErrorCodeCategory<TElement> {
  constructor(
    private readonly codeFct: (element: TElement) => string,
    private readonly descriptionFct: (element: TElement) => string,
    private readonly metadata: ErrorCodeMetadata = DEFAULT_METADATA
  ) {
  }

  create(element: TElement): ErrorCodeDefinition {
    return reg.add(
      this.codeFct(element),
      this.descriptionFct(element),
      this.metadata,
    );
  }

  get(element: TElement): ErrorCodeDefinition {
    const def = reg.get(this.codeFct(element));
    assert(def, `Unexpected element: ${element}`);
    return def;
  }
}

export function errorCode(e: GraphQLError): string | undefined {
  if (!('code' in e.extensions)) {
    return undefined;
  }
  return e.extensions.code as string;
}

export function errorCodeDef(e: GraphQLError): ErrorCodeDefinition | undefined {
  const code = errorCode(e);
  return code ? ERROR_CODE_REGISTRY.get(code) : undefined;
}

export const ERROR_CODE_REGISTRY = new ErrorCodeRegistry();
const reg = ERROR_CODE_REGISTRY;

const INVALID_GRAPHQL = reg.add(
  'INVALID_GRAPHQL',
  'A schema is invalid GraphQL: it violates one of the rule of the specification.'
);

const TAG_DEFINITION_INVALID = reg.add(
  'TAG_DIRECTIVE_DEFINITION_INVALID',
  'The @tag directive has an invalid defintion in the schema.',
  { addedIn: FED1_CODE },
);

class FederationDirectiveErrorCodeCategory extends ConcreteErrorCodeCategory {
  constructor(
    codeSuffix: string,
    descriptionFct: (directiveName: string) => string,
    metadata: ErrorCodeMetadata = DEFAULT_METADATA
  ) {
    super(
      (directive) => `${directive.toLocaleUpperCase()}_${codeSuffix}`,
      descriptionFct,
      metadata
    );
  }
}

const FIELDS_HAS_ARGS_CATEGORY = new FederationDirectiveErrorCodeCategory(
  'FIELDS_HAS_ARGS',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes a field defined with arguments (which is not currently supported).`
);

const KEY_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS_CATEGORY.create('key');
const PROVIDES_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS_CATEGORY.create('provides');
const REQUIRES_FIELDS_HAS_ARGS = FIELDS_HAS_ARGS_CATEGORY.create('requires');

const DIRECTIVE_FIELDS_MISSING_EXTERNAL_CATEGORY = new FederationDirectiveErrorCodeCategory(
  'FIELDS_MISSING_EXTERNAL',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive includes a field that is not marked as \`@external\`.`,
  { addedIn: FED1_CODE },
);

const PROVIDES_MISSING_EXTERNAL = DIRECTIVE_FIELDS_MISSING_EXTERNAL_CATEGORY.create('provides');
const REQUIRES_MISSING_EXTERNAL = DIRECTIVE_FIELDS_MISSING_EXTERNAL_CATEGORY.create('requires');

const DIRECTIVE_UNSUPPORTED_ON_INTERFACE_CATEGORY = new FederationDirectiveErrorCodeCategory(
  'UNSUPPORTED_ON_INTERFACE',
  (directive) => `A \`@${directive}\` directive is used on an interface, which is not (yet) supported.`,
);

const KEY_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE_CATEGORY.create('key');
const PROVIDES_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE_CATEGORY.create('provides');
const REQUIRES_UNSUPPORTED_ON_INTERFACE = DIRECTIVE_UNSUPPORTED_ON_INTERFACE_CATEGORY.create('requires');

const EXTERNAL_UNUSED = reg.add(
  'EXTERNAL_UNUSED',
  'An `@external` field is not being used by any instance of `@key`, `@requires`, `@provides` or to satisfy an interface implememtation.',
  { addedIn: FED1_CODE },
);

const PROVIDES_ON_NON_OBJECT_FIELD = reg.add(
  'PROVIDES_ON_NON_OBJECT_FIELD',
  'A `@provides` directive is used to mark a field whose base type is not an object type.'
);

const DIRECTIVE_INVALID_FIELDS_TYPE_CATEGORY = new FederationDirectiveErrorCodeCategory(
  'INVALID_FIELDS_TYPE',
  (directive) => `The value passed to the \`fields\` argument of a \`@${directive}\` directive is not a string.`,
);

const KEY_INVALID_FIELDS_TYPE = DIRECTIVE_INVALID_FIELDS_TYPE_CATEGORY.create('key');
const PROVIDES_INVALID_FIELDS_TYPE = DIRECTIVE_INVALID_FIELDS_TYPE_CATEGORY.create('provides');
const REQUIRES_INVALID_FIELDS_TYPE = DIRECTIVE_INVALID_FIELDS_TYPE_CATEGORY.create('requires');

const DIRECTIVE_INVALID_FIELDS_CATEGORY = new FederationDirectiveErrorCodeCategory(
  'INVALID_FIELDS',
  (directive) => `The \`fields\` argument of a \`@${directive}\` directive is invalid (it has invalid syntax, includes unknown fields, ...).`,
);

const KEY_INVALID_FIELDS = DIRECTIVE_INVALID_FIELDS_CATEGORY.create('key');
const PROVIDES_INVALID_FIELDS = DIRECTIVE_INVALID_FIELDS_CATEGORY.create('provides');
const REQUIRES_INVALID_FIELDS = DIRECTIVE_INVALID_FIELDS_CATEGORY.create('requires');

const KEY_FIELDS_SELECT_INVALID_TYPE = reg.add(
  'KEY_FIELDS_SELECT_INVALID_TYPE',
  'The `fields` argument of `@key` directive includes a field whose type is a list, interface, or union type. Fields of these types cannot be part of a `@key`',
  { addedIn: FED1_CODE },
)

const ROOT_TYPE_USED_CATEGORY = new ConcreteErrorCodeCategory<SchemaRootKind>(
  (kind) => `ROOT_${kind.toLocaleUpperCase()}_USED`,
  (kind) => `A subgraph's schema defines a type with the name \`${kind}\`, while also specifying a _different_ type name as the root query object. This is not allowed.`,
  { addedIn: FED1_CODE },
);

const ROOT_QUERY_USED = ROOT_TYPE_USED_CATEGORY.create('query');
const ROOT_MUTATION_USED = ROOT_TYPE_USED_CATEGORY.create('mutation');
const ROOT_SUBSCRIPTION_USED = ROOT_TYPE_USED_CATEGORY.create('subscription');

const INVALID_SUBGRAPH_NAME = reg.add(
  'INVALID_SUBGRAPH_NAME',
  'A subgraph name is invalid (subgraph names cannot be a single underscore ("_")).'
);

const NO_QUERIES = reg.add(
  'NO_QUERIES',
  'None of the composed subgraphs expose any query.'
);

const INTERFACE_FIELD_NO_IMPLEM = reg.add(
  'INTERFACE_FIELD_NO_IMPLEM',
  'After subgraph merging, an implemenation is missing a field of one of the interface it implements (which can happen for valid subgraphs).'
);

const TYPE_KIND_MISMATCH = reg.add(
  'TYPE_KIND_MISMATCH',
  'A type has the same name in different subgraphs, but a different kind. For instance, one definition is an object type but another is an interface.',
  { ...DEFAULT_METADATA, replaces: ['VALUE_TYPE_KIND_MISMATCH', 'EXTENSION_OF_WRONG_KIND', 'ENUM_MISMATCH_TYPE'] },
);

const EXTERNAL_TYPE_MISMATCH = reg.add(
  'EXTERNAL_TYPE_MISMATCH',
  'An `@external` field has a type that is incompatible with the declaration(s) of that field in other subgraphs.',
  { addedIn: FED1_CODE },
);

const EXTERNAL_ARGUMENT_MISSING = reg.add(
  'EXTERNAL_ARGUMENT_MISSING',
  'An `@external` field is missing some arguments present in the declaration(s) of that field in other subgraphs.',
);

const EXTERNAL_ARGUMENT_TYPE_MISMATCH = reg.add(
  'EXTERNAL_ARGUMENT_TYPE_MISMATCH',
  'An `@external` field declares an argument with a type that is incompatible with the corresponding argument in the declaration(s) of that field in other subgtaphs.',
);

const EXTERNAL_ARGUMENT_DEFAULT_MISMATCH = reg.add(
  'EXTERNAL_ARGUMENT_DEFAULT_MISMATCH',
  'An `@external` field declares an argument with a default that is incompatible with the corresponding argument in the declaration(s) of that field in other subgtaphs.',
);

const FIELD_TYPE_MISMATCH = reg.add(
  'FIELD_TYPE_MISMATCH',
  'A field has a type that is incompatible with other declarations of that field in other subgraphs.',
  { ...DEFAULT_METADATA, replaces: ['VALUE_TYPE_FIELD_TYPE_MISMATCH'] },
);

const ARGUMENT_TYPE_MISMATCH = reg.add(
  'FIELD_ARGUMENT_TYPE_MISMATCH',
  'An argument (of a field/directive) has a type that is incompatible with that of other declarations of that same argument in other subgraphs.',
  { ...DEFAULT_METADATA, replaces: ['VALUE_TYPE_INPUT_VALUE_MISMATCH'] },
);

const INPUT_FIELD_DEFAULT_MISMATCH = reg.add(
  'INPUT_FIELD_DEFAULT_MISMATCH',
  'An input field has a default value that is incompatible with other declarations of that field in other subgraphs.',
);

const ARGUMENT_DEFAULT_MISMATCH = reg.add(
  'FIELD_ARGUMENT_DEFAULT_MISMATCH',
  'An argument (of a field/directive) has a default value that is incompatible with that of other declarations of that same argument in other subgraphs.',
);

const EXTENSION_WITH_NO_BASE = reg.add(
  'EXTENSION_WITH_NO_BASE',
  'A subgraph is attempting to `extend` a type that is not originally defined in any known subgraph.',
  { addedIn: FED1_CODE },
);

const EXTERNAL_MISSING_ON_BASE = reg.add(
  'EXTERNAL_MISSING_ON_BASE',
  'A field is marked as `@external` in a subgraph but with no non-external declaration in any other subgraph.',
  { addedIn: FED1_CODE },
);

const SATISFIABILITY_ERROR = reg.add(
  'SATISFIABILITY_ERROR',
  'Subgraphs can be merged, but the resulting supergraph API would have queries that cannot be satisfied by those subgraphs.',
);

export const ERRORS = {
  INVALID_GRAPHQL,
  TAG_DEFINITION_INVALID,
  FIELDS_HAS_ARGS_CATEGORY,
  KEY_FIELDS_HAS_ARGS,
  PROVIDES_FIELDS_HAS_ARGS,
  REQUIRES_FIELDS_HAS_ARGS,
  DIRECTIVE_FIELDS_MISSING_EXTERNAL_CATEGORY,
  PROVIDES_MISSING_EXTERNAL,
  REQUIRES_MISSING_EXTERNAL,
  DIRECTIVE_UNSUPPORTED_ON_INTERFACE_CATEGORY,
  KEY_UNSUPPORTED_ON_INTERFACE,
  PROVIDES_UNSUPPORTED_ON_INTERFACE,
  REQUIRES_UNSUPPORTED_ON_INTERFACE,
  EXTERNAL_UNUSED,
  PROVIDES_ON_NON_OBJECT_FIELD,
  DIRECTIVE_INVALID_FIELDS_TYPE_CATEGORY,
  KEY_INVALID_FIELDS_TYPE,
  PROVIDES_INVALID_FIELDS_TYPE,
  REQUIRES_INVALID_FIELDS_TYPE,
  DIRECTIVE_INVALID_FIELDS_CATEGORY,
  KEY_INVALID_FIELDS,
  PROVIDES_INVALID_FIELDS,
  REQUIRES_INVALID_FIELDS,
  KEY_FIELDS_SELECT_INVALID_TYPE,
  ROOT_TYPE_USED_CATEGORY,
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
  FIELD_TYPE_MISMATCH,
  ARGUMENT_TYPE_MISMATCH,
  INPUT_FIELD_DEFAULT_MISMATCH,
  ARGUMENT_DEFAULT_MISMATCH,
  EXTENSION_WITH_NO_BASE,
  EXTERNAL_MISSING_ON_BASE,
  SATISFIABILITY_ERROR,
};

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
