import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { Subgraph } from '..';
import { buildSubgraph } from '../federation';
import { defaultPrintOptions, printSchema } from '../print';
import { buildForErrors } from './testUtils';

describe('fieldset-based directives', () => {
  it('rejects field defined with arguments in @key', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f(x: Int): Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_FIELDS_HAS_ARGS',
        '[S] On type "T", for @key(fields: "f"): field T.f cannot be included because it has arguments (fields with argument are not allowed in @key)',
      ],
    ]);
  });

  it('rejects field defined with arguments in @provides', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: "f")
      }

      type T {
        f(x: Int): Int @external
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_FIELDS_HAS_ARGS',
        '[S] On field "Query.t", for @provides(fields: "f"): field T.f cannot be included because it has arguments (fields with argument are not allowed in @provides)',
      ],
    ]);
  });

  it('rejects @provides on non-external fields', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: "f")
      }

      type T {
        f: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_FIELDS_MISSING_EXTERNAL',
        '[S] On field "Query.t", for @provides(fields: "f"): field "T.f" should not be part of a @provides since it is already provided by this subgraph (it is not marked @external)',
      ],
    ]);
  });

  it('rejects @requires on non-external fields', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T {
        f: Int
        g: Int @requires(fields: "f")
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_FIELDS_MISSING_EXTERNAL',
        '[S] On field "T.g", for @requires(fields: "f"): field "T.f" should not be part of a @requires since it is already provided by this subgraph (it is not marked @external)',
      ],
    ]);
  });

  it.each(['2.0', '2.1', '2.2'])(
    'rejects @key on interfaces _in the %p spec_',
    (version) => {
      const subgraph = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v${version}", import: ["@key"])

      type Query {
        t: T
      }

      interface T @key(fields: "f") {
        f: Int
      }
    `;
      expect(buildForErrors(subgraph, { asFed2: false })).toStrictEqual([
        [
          'KEY_UNSUPPORTED_ON_INTERFACE',
          '[S] Cannot use @key on interface "T": @key is not yet supported on interfaces',
        ],
      ]);
    },
  );

  it('rejects @provides on interfaces', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      interface T {
        f: U @provides(fields: "g")
      }

      type U {
        g: Int @external
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_UNSUPPORTED_ON_INTERFACE',
        '[S] Cannot use @provides on field "T.f" of parent type "T": @provides is not yet supported within interfaces',
      ],
    ]);
  });

  it('rejects @requires on interfaces', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      interface T {
        f: Int @external
        g: Int @requires(fields: "f")
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_UNSUPPORTED_ON_INTERFACE',
        '[S] Cannot use @requires on field "T.g" of parent type "T": @requires is not yet supported within interfaces',
      ],
      [
        'EXTERNAL_ON_INTERFACE',
        '[S] Interface type field "T.f" is marked @external but @external is not allowed on interface fields (it is nonsensical).',
      ],
    ]);
  });

  it('rejects unused @external', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'EXTERNAL_UNUSED',
        '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).',
      ],
    ]);
  });

  it('rejects @provides on non-object fields', () => {
    const subgraph = gql`
      type Query {
        t: Int @provides(fields: "f")
      }

      type T {
        f: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_ON_NON_OBJECT_FIELD',
        '[S] Invalid @provides directive on field "Query.t": field has type "Int" which is not a Composite Type',
      ],
    ]);
  });

  it('rejects a non-string argument to @key', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: ["f"]) {
        f: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_INVALID_FIELDS_TYPE',
        '[S] On type "T", for @key(fields: ["f"]): Invalid value for argument "fields": must be a string.',
      ],
    ]);
  });

  it('rejects a non-string argument to @provides', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: ["f"])
      }

      type T {
        f: Int @external
      }
    `;
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_INVALID_FIELDS_TYPE',
        '[S] On field "Query.t", for @provides(fields: ["f"]): Invalid value for argument "fields": must be a string.',
      ],
      [
        'EXTERNAL_UNUSED',
        '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).',
      ],
    ]);
  });

  it('rejects a non-string argument to @requires', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
        g: Int @requires(fields: ["f"])
      }
    `;
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_INVALID_FIELDS_TYPE',
        '[S] On field "T.g", for @requires(fields: ["f"]): Invalid value for argument "fields": must be a string.',
      ],
      [
        'EXTERNAL_UNUSED',
        '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).',
      ],
    ]);
  });

  // Special case of non-string argument, specialized because it hits a different
  // code-path due to enum values being parsed as string and requiring special care.
  it('rejects an enum-like argument to @key', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: f) {
        f: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_INVALID_FIELDS_TYPE',
        '[S] On type "T", for @key(fields: f): Invalid value for argument "fields": must be a string.',
      ],
    ]);
  });

  // Special case of non-string argument, specialized because it hits a different
  // code-path due to enum values being parsed as string and requiring special care.
  it('rejects an enum-lik argument to @provides', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: f)
      }

      type T {
        f: Int @external
      }
    `;
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_INVALID_FIELDS_TYPE',
        '[S] On field "Query.t", for @provides(fields: f): Invalid value for argument "fields": must be a string.',
      ],
      [
        'EXTERNAL_UNUSED',
        '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).',
      ],
    ]);
  });

  // Special case of non-string argument, specialized because it hits a different
  // code-path due to enum values being parsed as string and requiring special care.
  it('rejects an enum-like argument to @requires', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
        g: Int @requires(fields: f)
      }
    `;
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_INVALID_FIELDS_TYPE',
        '[S] On field "T.g", for @requires(fields: f): Invalid value for argument "fields": must be a string.',
      ],
      [
        'EXTERNAL_UNUSED',
        '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).',
      ],
    ]);
  });

  it('rejects an invalid `fields` argument to @key', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: ":f") {
        f: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_INVALID_FIELDS',
        '[S] On type "T", for @key(fields: ":f"): Syntax Error: Expected Name, found ":".',
      ],
    ]);
  });

  it('rejects an invalid `fields` argument to @provides', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: "{{f}}")
      }

      type T {
        f: Int @external
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_INVALID_FIELDS',
        '[S] On field "Query.t", for @provides(fields: "{{f}}"): Syntax Error: Expected Name, found "{".',
      ],
      [
        'EXTERNAL_UNUSED',
        '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).',
      ],
    ]);
  });

  it('rejects an invalid `fields` argument to @requires', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
        g: Int @requires(fields: "f b")
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_INVALID_FIELDS',
        '[S] On field "T.g", for @requires(fields: "f b"): Cannot query field "b" on type "T" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).',
      ],
    ]);
  });

  it('rejects @key on an interface field', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f: I
      }

      interface I {
        i: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_FIELDS_SELECT_INVALID_TYPE',
        '[S] On type "T", for @key(fields: "f"): field "T.f" is a Interface type which is not allowed in @key',
      ],
    ]);
  });

  it('rejects @key on an union field', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f: U
      }

      union U = Query | T
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_FIELDS_SELECT_INVALID_TYPE',
        '[S] On type "T", for @key(fields: "f"): field "T.f" is a Union type which is not allowed in @key',
      ],
    ]);
  });

  it('rejects directive applications in @key', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: "v { x ... @include(if: false) { y }}") {
        v: V
      }

      type V {
        x: Int
        y: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_DIRECTIVE_IN_FIELDS_ARG',
        '[S] On type "T", for @key(fields: "v { x ... @include(if: false) { y }}"): cannot have directive applications in the @key(fields:) argument but found @include(if: false).',
      ],
    ]);
  });

  it('rejects directive applications in @provides', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: "v { ... on V @skip(if: true) { x y } }")
      }

      type T @key(fields: "id") {
        id: ID
        v: V @external
      }

      type V {
        x: Int
        y: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_DIRECTIVE_IN_FIELDS_ARG',
        '[S] On field "Query.t", for @provides(fields: "v { ... on V @skip(if: true) { x y } }"): cannot have directive applications in the @provides(fields:) argument but found @skip(if: true).',
      ],
    ]);
  });

  it('rejects directive applications in @requires', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: "id") {
        id: ID
        a: Int @requires(fields: "... @skip(if: false) { b }")
        b: Int @external
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_DIRECTIVE_IN_FIELDS_ARG',
        '[S] On field "T.a", for @requires(fields: "... @skip(if: false) { b }"): cannot have directive applications in the @requires(fields:) argument but found @skip(if: false).',
      ],
    ]);
  });

  it('can collect multiple errors in a single `fields` argument', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: "f(x: 3)")
      }

      type T @key(fields: "id") {
        id: ID
        f(x: Int): Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_FIELDS_HAS_ARGS',
        '[S] On field "Query.t", for @provides(fields: "f(x: 3)"): field T.f cannot be included because it has arguments (fields with argument are not allowed in @provides)',
      ],
      [
        'PROVIDES_FIELDS_MISSING_EXTERNAL',
        '[S] On field "Query.t", for @provides(fields: "f(x: 3)"): field "T.f" should not be part of a @provides since it is already provided by this subgraph (it is not marked @external)',
      ],
    ]);
  });

  it('rejects aliases in @key', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T @key(fields: "foo: id") {
        id: ID!
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'KEY_INVALID_FIELDS',
        '[S] On type "T", for @key(fields: "foo: id"): Cannot use alias "foo" in "foo: id": aliases are not currently supported in @key',
      ],
    ]);
  });

  it('rejects aliases in @provides', () => {
    const subgraph = gql`
      type Query {
        t: T @provides(fields: "bar: x")
      }

      type T @key(fields: "id") {
        id: ID!
        x: Int @external
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'PROVIDES_INVALID_FIELDS',
        '[S] On field "Query.t", for @provides(fields: "bar: x"): Cannot use alias "bar" in "bar: x": aliases are not currently supported in @provides',
      ],
    ]);
  });

  it('rejects aliases in @requires', () => {
    const subgraph = gql`
      type Query {
        t: T
      }

      type T {
        x: X @external
        y: Int @external
        g: Int @requires(fields: "foo: y")
        h: Int @requires(fields: "x { m: a n: b }")
      }

      type X {
        a: Int
        b: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'REQUIRES_INVALID_FIELDS',
        '[S] On field "T.g", for @requires(fields: "foo: y"): Cannot use alias "foo" in "foo: y": aliases are not currently supported in @requires',
      ],
      [
        'REQUIRES_INVALID_FIELDS',
        '[S] On field "T.h", for @requires(fields: "x { m: a n: b }"): Cannot use alias "m" in "m: a": aliases are not currently supported in @requires',
      ],
    ]);
  });
});

describe('root types', () => {
  it('rejects using Query as type name if not the query root', () => {
    const subgraph = gql`
      schema {
        query: MyQuery
      }

      type MyQuery {
        f: Int
      }

      type Query {
        g: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'ROOT_QUERY_USED',
        '[S] The schema has a type named "Query" but it is not set as the query root type ("MyQuery" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.',
      ],
    ]);
  });

  it('rejects using Mutation as type name if not the mutation root', () => {
    const subgraph = gql`
      schema {
        mutation: MyMutation
      }

      type MyMutation {
        f: Int
      }

      type Mutation {
        g: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'ROOT_MUTATION_USED',
        '[S] The schema has a type named "Mutation" but it is not set as the mutation root type ("MyMutation" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.',
      ],
    ]);
  });

  it('rejects using Subscription as type name if not the subscription root', () => {
    const subgraph = gql`
      schema {
        subscription: MySubscription
      }

      type MySubscription {
        f: Int
      }

      type Subscription {
        g: Int
      }
    `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      [
        'ROOT_SUBSCRIPTION_USED',
        '[S] The schema has a type named "Subscription" but it is not set as the subscription root type ("MySubscription" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.',
      ],
    ]);
  });
});

describe('custom error message for misnamed directives', () => {
  it.each([
    {
      name: 'fed1',
      extraMsg:
        ' If so, note that it is a federation 2 directive but this schema is a federation 1 one. To be a federation 2 schema, it needs to @link to the federation specifcation v2.',
    },
    { name: 'fed2', extraMsg: '' },
  ])(
    'has suggestions if a federation directive name is mispelled in $name',
    ({ name, extraMsg }) => {
      const subgraph = gql`
        type T @keys(fields: "id") {
          id: Int @foo
          foo: String @sharable
        }
      `;

      expect(
        buildForErrors(subgraph, { asFed2: name === 'fed2' }),
      ).toStrictEqual([
        ['INVALID_GRAPHQL', `[S] Unknown directive "@foo".`],
        [
          'INVALID_GRAPHQL',
          `[S] Unknown directive "@sharable". Did you mean "@shareable"?${extraMsg}`,
        ],
        [
          'INVALID_GRAPHQL',
          `[S] Unknown directive "@keys". Did you mean "@key"?`,
        ],
      ]);
    },
  );

  it('has suggestions if a fed2 directive is used in fed1', () => {
    const subgraph = gql`
      type T @key(fields: "id") {
        id: Int
        foo: String @shareable
      }
    `;

    expect(buildForErrors(subgraph, { asFed2: false })).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        `[S] Unknown directive "@shareable". If you meant the \"@shareable\" federation 2 directive, note that this schema is a federation 1 schema. To be a federation 2 schema, it needs to @link to the federation specifcation v2.`,
      ],
    ]);
  });

  it('has suggestions if a fed2 directive is used under the wrong name (for the schema)', () => {
    const subgraph = gql`
      extend schema
        @link(
          url: "https://specs.apollo.dev/federation/v2.0"
          import: [{ name: "@key", as: "@myKey" }]
        )

      type T @key(fields: "id") {
        id: Int
        foo: String @shareable
      }
    `;

    // Note: it's a fed2 schema, but we manually add the @link, so we pass `asFed2: false` to avoid having added twice.
    expect(buildForErrors(subgraph, { asFed2: false })).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        `[S] Unknown directive "@shareable". If you meant the \"@shareable\" federation directive, you should use fully-qualified name "@federation__shareable" or add "@shareable" to the \`import\` argument of the @link to the federation specification.`,
      ],
      [
        'INVALID_GRAPHQL',
        `[S] Unknown directive "@key". If you meant the "@key" federation directive, you should use "@myKey" as it is imported under that name in the @link to the federation specification of this schema.`,
      ],
    ]);
  });
});

function buildAndValidate(doc: DocumentNode): Subgraph {
  const name = 'S';
  return buildSubgraph(name, `http://${name}`, doc).validate();
}

describe('@core/@link handling', () => {
  const expectedFullSchema = `
    schema
      @link(url: "https://specs.apollo.dev/link/v1.0")
      @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])
    {
      query: Query
    }

    directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

    directive @key(fields: federation__FieldSet!, resolvable: Boolean = true) repeatable on OBJECT | INTERFACE

    directive @federation__requires(fields: federation__FieldSet!) on FIELD_DEFINITION

    directive @federation__provides(fields: federation__FieldSet!) on FIELD_DEFINITION

    directive @federation__external(reason: String) on OBJECT | FIELD_DEFINITION

    directive @federation__tag(name: String!) repeatable on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

    directive @federation__extends on OBJECT | INTERFACE

    directive @federation__shareable on OBJECT | FIELD_DEFINITION

    directive @federation__inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

    directive @federation__override(from: String!) on FIELD_DEFINITION

    type T
      @key(fields: "k")
    {
      k: ID!
    }

    enum link__Purpose {
      """
      \`SECURITY\` features provide metadata necessary to securely resolve fields.
      """
      SECURITY

      """
      \`EXECUTION\` features provide metadata necessary for operation execution.
      """
      EXECUTION
    }

    scalar link__Import

    scalar federation__FieldSet

    scalar _Any

    type _Service {
      sdl: String
    }

    union _Entity = T

    type Query {
      _entities(representations: [_Any!]!): [_Entity]!
      _service: _Service!
    }
  `;
  const validateFullSchema = (subgraph: Subgraph) => {
    // Note: we merge types and extensions to avoid having to care whether the @link are on a schema definition or schema extension
    // as 1) this will vary (we add them to extensions in our test, but when auto-added, they are added to the schema definition)
    // and 2) it doesn't matter in practice, it's valid in all cases.
    expect(
      printSchema(subgraph.schema, {
        ...defaultPrintOptions,
        mergeTypesAndExtensions: true,
      }),
    ).toMatchString(expectedFullSchema);
  };

  it('expands everything if only the federation spec is linked', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }
    `;

    validateFullSchema(buildAndValidate(doc));
  });

  it('expands definitions if both the federation spec and link spec are linked', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }
    `;

    validateFullSchema(buildAndValidate(doc));
  });

  it('is valid if a schema is complete from the get-go', () => {
    validateFullSchema(buildAndValidate(gql(expectedFullSchema)));
  });

  it('expands missing definitions when some are partially provided', () => {
    const docs = [
      gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        directive @key(
          fields: federation__FieldSet!
          resolvable: Boolean = true
        ) repeatable on OBJECT | INTERFACE

        scalar federation__FieldSet

        scalar link__Import
      `,
      gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        scalar link__Import
      `,
      gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        scalar link__Import
      `,
      gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        directive @federation__external(
          reason: String
        ) on OBJECT | FIELD_DEFINITION
      `,
      gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0")

        type T {
          k: ID!
        }

        enum link__Purpose {
          EXECUTION
          SECURITY
        }
      `,
    ];

    // Note that we cannot use `validateFullSchema` as-is for those examples because the order or directive is going
    // to be different. But that's ok, we mostly care that the validation doesn't throw since validation ultimately
    // calls the graphQL-js validation, so we can be somewhat sure that if something necessary wasn't expanded
    // properly, we would have an issue. The main reason we did validate the full schema in prior tests is
    // so we had at least one full example of a subgraph expansion in the tests.
    docs.forEach((doc) => buildAndValidate(doc));
  });

  it('allows known directives with incomplete but compatible definitions', () => {
    const docs = [
      // @key has a `resolvable` argument in its full definition, but it is optional.
      gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        directive @key(
          fields: federation__FieldSet!
        ) repeatable on OBJECT | INTERFACE

        scalar federation__FieldSet
      `,
      // @inacessible can be put in a bunch of locations, but you're welcome to restrict yourself to just fields.
      gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@inaccessible"]
          )

        type T {
          k: ID! @inaccessible
        }

        directive @inaccessible on FIELD_DEFINITION
      `,
      // @key is repeatable, but you're welcome to restrict yourself to never repeating it.
      gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        directive @key(
          fields: federation__FieldSet!
          resolvable: Boolean = true
        ) on OBJECT | INTERFACE

        scalar federation__FieldSet
      `,
      // @key `resolvable` argument is optional, but you're welcome to force users to always provide it.
      gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k", resolvable: true) {
          k: ID!
        }

        directive @key(
          fields: federation__FieldSet!
          resolvable: Boolean!
        ) repeatable on OBJECT | INTERFACE

        scalar federation__FieldSet
      `,
      // @link `url` argument is allowed to be `null` now, but it used not too, so making sure we still
      // accept definition where it's mandatory.
      gql`
        extend schema
          @link(url: "https://specs.apollo.dev/link/v1.0")
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key"]
          )

        type T @key(fields: "k") {
          k: ID!
        }

        directive @link(
          url: String!
          as: String
          for: link__Purpose
          import: [link__Import]
        ) repeatable on SCHEMA

        scalar link__Import
        scalar link__Purpose
      `,
    ];

    // Like above, we really only care that the examples validate.
    docs.forEach((doc) => buildAndValidate(doc));
  });

  it('errors on invalid known directive location', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }

      directive @federation__external(
        reason: String
      ) on OBJECT | FIELD_DEFINITION | SCHEMA
    `;

    // @external is not allowed on 'schema' and likely never will.
    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'DIRECTIVE_DEFINITION_INVALID',
        '[S] Invalid definition for directive "@federation__external": "@federation__external" should have locations OBJECT, FIELD_DEFINITION, but found (non-subset) OBJECT, FIELD_DEFINITION, SCHEMA',
      ],
    ]);
  });

  it('errors on invalid non-repeatable directive marked repeateable', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }

      directive @federation__external repeatable on OBJECT | FIELD_DEFINITION
    `;

    // @external is not repeatable (and has no reason to be since it has no arguments).
    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'DIRECTIVE_DEFINITION_INVALID',
        '[S] Invalid definition for directive "@federation__external": "@federation__external" should not be repeatable',
      ],
    ]);
  });

  it('errors on unknown argument of known directive', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }

      directive @federation__external(foo: Int) on OBJECT | FIELD_DEFINITION
    `;

    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'DIRECTIVE_DEFINITION_INVALID',
        '[S] Invalid definition for directive "@federation__external": unknown/unsupported argument "foo"',
      ],
    ]);
  });

  it('errors on invalid type for a known argument', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }

      directive @key(
        fields: String!
        resolvable: String
      ) repeatable on OBJECT | INTERFACE
    `;

    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'DIRECTIVE_DEFINITION_INVALID',
        '[S] Invalid definition for directive "@key": argument "resolvable" should have type "Boolean" but found type "String"',
      ],
    ]);
  });

  it('errors on a required argument defined as optional', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }

      directive @key(
        fields: federation__FieldSet
        resolvable: Boolean = true
      ) repeatable on OBJECT | INTERFACE

      scalar federation__FieldSet
    `;

    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'DIRECTIVE_DEFINITION_INVALID',
        '[S] Invalid definition for directive "@key": argument "fields" should have type "federation__FieldSet!" but found type "federation__FieldSet"',
      ],
    ]);
  });

  it('errors on invalid definition for @link Purpose', () => {
    const doc = gql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.0")

      type T {
        k: ID!
      }

      enum link__Purpose {
        EXECUTION
        RANDOM
      }
    `;

    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'TYPE_DEFINITION_INVALID',
        '[S] Invalid definition for type "Purpose": expected values [EXECUTION, SECURITY] but found [EXECUTION, RANDOM].',
      ],
    ]);
  });

  it('allows any (non-scalar) type in redefinition when expected type is a scalar', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

      type T @key(fields: "k") {
        k: ID!
      }

      # 'fields' should be of type 'federation_FieldSet!', but ensure we allow 'String!' alternatively.
      directive @key(
        fields: String!
        resolvable: Boolean = true
      ) repeatable on OBJECT | INTERFACE
    `;

    // Just making sure this don't error out.
    buildAndValidate(doc);
  });

  it('allows defining a repeatable directive as non-repeatable but validates usages', () => {
    const doc = gql`
      type T @key(fields: "k1") @key(fields: "k2") {
        k1: ID!
        k2: ID!
      }

      directive @key(fields: String!) on OBJECT
    `;

    // Test for fed2 (with @key being @link-ed)
    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] The directive "@key" can only be used once at this location.',
      ],
    ]);

    // Test for fed1
    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'INVALID_GRAPHQL',
        '[S] The directive "@key" can only be used once at this location.',
      ],
    ]);
  });
});

describe('federation 1 schema', () => {
  it('accepts federation directive definitions without arguments', () => {
    const doc = gql`
      type Query {
        a: Int
      }

      directive @key on OBJECT | INTERFACE
      directive @requires on FIELD_DEFINITION
    `;

    buildAndValidate(doc);
  });

  it('accepts federation directive definitions with nullable arguments', () => {
    const doc = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id") {
        id: ID! @requires(fields: "x")
        x: Int @external
      }

      # Tests with the _FieldSet argument non-nullable
      scalar _FieldSet
      directive @key(fields: _FieldSet) on OBJECT | INTERFACE

      # Tests with the argument as String and non-nullable
      directive @requires(fields: String) on FIELD_DEFINITION
    `;

    buildAndValidate(doc);
  });

  it('accepts federation directive definitions with "FieldSet" type instead of "_FieldSet"', () => {
    const doc = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id") {
        id: ID!
      }

      scalar FieldSet
      directive @key(fields: FieldSet) on OBJECT | INTERFACE
    `;

    buildAndValidate(doc);
  });

  it('rejects federation directive definition with unknown arguments', () => {
    const doc = gql`
      type Query {
        a: Int
      }

      type T @key(fields: "id", unknown: 42) {
        id: ID!
      }

      scalar _FieldSet
      directive @key(fields: _FieldSet!, unknown: Int) on OBJECT | INTERFACE
    `;

    expect(buildForErrors(doc, { asFed2: false })).toStrictEqual([
      [
        'DIRECTIVE_DEFINITION_INVALID',
        '[S] Invalid definition for directive "@key": unknown/unsupported argument "unknown"',
      ],
    ]);
  });
});

describe('@shareable', () => {
  it('can only be applied to fields of object types', () => {
    const doc = gql`
      interface I {
        a: Int @shareable
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_SHAREABLE_USAGE',
        '[S] Invalid use of @shareable on field "I.a": only object type fields can be marked with @shareable',
      ],
    ]);
  });

  it('rejects duplicate @shareable on the same definition declaration', () => {
    const doc = gql`
      type E @shareable @key(fields: "id") @shareable {
        id: ID!
        a: Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_SHAREABLE_USAGE',
        '[S] Invalid duplicate application of @shareable on the same type declaration of "E": @shareable is only repeatable on types so it can be used simultaneously on a type definition and its extensions, but it should not be duplicated on the same definition/extension declaration',
      ],
    ]);
  });

  it('rejects duplicate @shareable on the same extension declaration', () => {
    const doc = gql`
      type E @shareable {
        id: ID!
        a: Int
      }

      extend type E @shareable @shareable {
        b: Int
      }
    `;
    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_SHAREABLE_USAGE',
        '[S] Invalid duplicate application of @shareable on the same type declaration of "E": @shareable is only repeatable on types so it can be used simultaneously on a type definition and its extensions, but it should not be duplicated on the same definition/extension declaration',
      ],
    ]);
  });

  it('rejects duplicate @shareable on a field', () => {
    const doc = gql`
      type E {
        a: Int @shareable @shareable
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INVALID_SHAREABLE_USAGE',
        '[S] Invalid duplicate application of @shareable on field "E.a": @shareable is only repeatable on types so it can be used simultaneously on a type definition and its extensions, but it should not be duplicated on the same definition/extension declaration',
      ],
    ]);
  });
});

describe('@interfaceObject/@key on interfaces validation', () => {
  it('@key on interfaces require @key on all implementations', () => {
    const doc = gql`
      interface I @key(fields: "id1") @key(fields: "id2") {
        id1: ID!
        id2: ID!
      }

      type A implements I @key(fields: "id2") {
        id1: ID!
        id2: ID!
        a: Int
      }

      type B implements I @key(fields: "id1") @key(fields: "id2") {
        id1: ID!
        id2: ID!
        b: Int
      }

      type C implements I @key(fields: "id2") {
        id1: ID!
        id2: ID!
        c: Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INTERFACE_KEY_NOT_ON_IMPLEMENTATION',
        '[S] Key @key(fields: "id1") on interface type "I" is missing on implementation types "A" and "C".',
      ],
    ]);
  });

  it('@key on interfaces with @key on some implementation non resolvable', () => {
    const doc = gql`
      interface I @key(fields: "id1") {
        id1: ID!
      }

      type A implements I @key(fields: "id1") {
        id1: ID!
        a: Int
      }

      type B implements I @key(fields: "id1") {
        id1: ID!
        b: Int
      }

      type C implements I @key(fields: "id1", resolvable: false) {
        id1: ID!
        c: Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INTERFACE_KEY_NOT_ON_IMPLEMENTATION',
        '[S] Key @key(fields: "id1") on interface type "I" should be resolvable on all implementation types, but is declared with argument "@key(resolvable:)" set to false in type "C".',
      ],
    ]);
  });

  it('ensures order of fields in key does not matter', () => {
    const doc = gql`
      interface I @key(fields: "a b c") {
        a: Int
        b: Int
        c: Int
      }

      type A implements I @key(fields: "c b a") {
        a: Int
        b: Int
        c: Int
      }

      type B implements I @key(fields: "a c b") {
        a: Int
        b: Int
        c: Int
      }

      type C implements I @key(fields: "a b c") {
        a: Int
        b: Int
        c: Int
      }
    `;

    expect(buildForErrors(doc)).toBeUndefined();
  });

  // There is no meaningful way to make @interfaceObject work on a value type at the moment, because
  // if you have an @interfaceObject, some other subgraph needs to be able to resolve the concrete
  // type, and that imply that you have key to go to that other subgraph.
  // To be clear, the @key on the @interfaceObject technically con't need to be "resolvable", and the
  // difference between no key and a non-resolvable key is arguably more convention than a genuine
  // mechanical difference at the moment, but still a good idea to rely on that convention to help
  // catching obvious mistakes early.
  it('only allow @interfaceObject on entity types', () => {
    const doc = gql`
      # This one shouldn't raise an error
      type A @key(fields: "id", resolvable: false) @interfaceObject {
        id: ID!
      }

      # This one should
      type B @interfaceObject {
        x: Int
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'INTERFACE_OBJECT_USAGE_ERROR',
        '[S] The @interfaceObject directive can only be applied to entity types but type "B" has no @key in this subgraph.',
      ],
    ]);
  });
});

describe('@cost', () => {
  it('rejects applications on interfaces', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

      type Query {
        a: A
      }

      interface A {
        x: Int @cost(weight: 10)
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'COST_APPLIED_TO_INTERFACE_FIELD',
        `[S] @cost cannot be applied to interface "A.x"`,
      ],
    ]);
  });
});

describe('@listSize', () => {
  it('rejects applications on non-lists (unless it uses sizedFields)', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        a1: A @listSize(assumedSize: 5)
        a2: A @listSize(assumedSize: 10, sizedFields: ["ints"])
      }

      type A {
        ints: [Int]
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      ['LIST_SIZE_APPLIED_TO_NON_LIST', `[S] "Query.a1" is not a list`],
    ]);
  });

  it('rejects negative assumedSize', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        a: [Int] @listSize(assumedSize: -5)
        b: [Int] @listSize(assumedSize: 0)
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'LIST_SIZE_INVALID_ASSUMED_SIZE',
        `[S] Assumed size of "Query.a" cannot be negative`,
      ],
    ]);
  });

  it('rejects slicingArguments which are not arguments of the field', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        myField(something: Int): [String]
          @listSize(slicingArguments: ["missing1", "missing2"])
        myOtherField(somethingElse: String): [Int]
          @listSize(slicingArguments: ["alsoMissing"])
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'LIST_SIZE_INVALID_SLICING_ARGUMENT',
        `[S] Slicing argument "missing1" is not an argument of "Query.myField"`,
      ],
      [
        'LIST_SIZE_INVALID_SLICING_ARGUMENT',
        `[S] Slicing argument "missing2" is not an argument of "Query.myField"`,
      ],
      [
        'LIST_SIZE_INVALID_SLICING_ARGUMENT',
        `[S] Slicing argument "alsoMissing" is not an argument of "Query.myOtherField"`,
      ],
    ]);
  });

  it('rejects slicingArguments which are not Int or Int!', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        sliced(first: String, second: Int, third: Int!, fourth: [Int], fifth: [Int]!): [String]
          @listSize(slicingArguments: ["first", "second", "third", "fourth", "fifth"])
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'LIST_SIZE_INVALID_SLICING_ARGUMENT',
        `[S] Slicing argument "Query.sliced(first:)" must be Int or Int!`,
      ],
      [
        'LIST_SIZE_INVALID_SLICING_ARGUMENT',
        `[S] Slicing argument "Query.sliced(fourth:)" must be Int or Int!`,
      ],
      [
        'LIST_SIZE_INVALID_SLICING_ARGUMENT',
        `[S] Slicing argument "Query.sliced(fifth:)" must be Int or Int!`,
      ],
    ]);
  });

  it('rejects sizedFields when the output type is not an object', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        notObject: Int @listSize(assumedSize: 1, sizedFields: ["anything"])
        a: A @listSize(assumedSize: 5, sizedFields: ["ints"])
        b: B @listSize(assumedSize: 10, sizedFields: ["ints"])
      }

      type A {
        ints: [Int]
      }

      interface B {
        ints: [Int]
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'LIST_SIZE_INVALID_SIZED_FIELD',
        `[S] Sized fields cannot be used because "Int" is not a composite type`,
      ],
    ]);
  });

  it('rejects sizedFields which are not fields of the output type', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        a: A @listSize(assumedSize: 5, sizedFields: ["notOnA"])
      }

      type A {
        ints: [Int]
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'LIST_SIZE_INVALID_SIZED_FIELD',
        `[S] Sized field "notOnA" is not a field on type "A"`,
      ],
    ]);
  });

  it('rejects sizedFields which are not lists', () => {
    const doc = gql`
      extend schema
        @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

      type Query {
        a: A @listSize(assumedSize: 5, sizedFields: ["list", "nonNullList", "notList"])
      }

      type A {
        list: [String]
        nonNullList: [String]!
        notList: String
      }
    `;

    expect(buildForErrors(doc)).toStrictEqual([
      [
        'LIST_SIZE_APPLIED_TO_NON_LIST',
        `[S] Sized field "A.notList" is not a list`,
      ],
    ]);
  });
});
