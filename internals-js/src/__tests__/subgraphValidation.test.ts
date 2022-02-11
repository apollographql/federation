import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';
import { errorCauses } from '../definitions';
import { asFed2SubgraphDocument, buildSubgraph } from "../federation"

// Builds the provided subgraph (using name 'S' for the subgraph) and, if the
// subgraph is invalid/has errors, return those errors as a list of [code, message].
// If the subgraph is valid, return undefined.
function buildForErrors(subgraphDefs: DocumentNode, subgraphName: string = 'S'): [string, string][] | undefined {
  try {
    const doc = asFed2SubgraphDocument(subgraphDefs);
    buildSubgraph(subgraphName, `http://${subgraphName}`, doc).validate();
    return undefined;
  } catch (e) {
    const causes = errorCauses(e);
    if (!causes) {
      throw e;
    }
    return causes.map((err) => [err.extensions.code as string, err.message]);
  }
}

describe('fieldset-based directives', () => {
  it('rejects field defined with arguments in @key', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f(x: Int): Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_FIELDS_HAS_ARGS', '[S] On type "T", for @key(fields: "f"): field T.f cannot be included because it has arguments (fields with argument are not allowed in @key)']
    ]);
  });

  it('rejects field defined with arguments in @provides', () => {
    const subgraph =  gql`
      type Query {
        t: T @provides(fields: "f")
      }

      type T {
        f(x: Int): Int @external
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_FIELDS_HAS_ARGS', '[S] On field "Query.t", for @provides(fields: "f"): field T.f cannot be included because it has arguments (fields with argument are not allowed in @provides)']
    ]);
  });

  it('rejects field defined with arguments in @requires', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T {
        f(x: Int): Int @external
        g: Int @requires(fields: "f")
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['REQUIRES_FIELDS_HAS_ARGS', '[S] On field "T.g", for @requires(fields: "f"): field T.f cannot be included because it has arguments (fields with argument are not allowed in @requires)']
    ]);
  });

  it('rejects @provides on non-external fields', () => {
    const subgraph =  gql`
      type Query {
        t: T @provides(fields: "f")
      }

      type T {
        f: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_FIELDS_MISSING_EXTERNAL', '[S] On field "Query.t", for @provides(fields: "f"): field "T.f" should not be part of a @provides since it is already provided by this subgraph (it is not marked @external)']
    ]);
  });

  it('rejects @requires on non-external fields', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T {
        f: Int
        g: Int @requires(fields: "f")
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['REQUIRES_FIELDS_MISSING_EXTERNAL', '[S] On field "T.g", for @requires(fields: "f"): field "T.f" should not be part of a @requires since it is already provided by this subgraph (it is not marked @external)']
    ]);
  });

  it('rejects @key on interfaces', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      interface T @key(fields: "f") {
        f: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_UNSUPPORTED_ON_INTERFACE', '[S] Cannot use @key on interface "T": @key is not yet supported on interfaces'],
    ]);
  });

  it('rejects @provides on interfaces', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      interface T {
        f: U @provides(fields: "g")
      }

      type U {
        g: Int @external
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_UNSUPPORTED_ON_INTERFACE', '[S] Cannot use @provides on field "T.f" of parent type "T": @provides is not yet supported within interfaces'],
    ]);
  });

  it('rejects @requires on interfaces', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      interface T {
        f: Int @external
        g: Int @requires(fields: "f")
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['REQUIRES_UNSUPPORTED_ON_INTERFACE', '[S] Cannot use @requires on field "T.g" of parent type "T": @requires is not yet supported within interfaces' ],
    ]);
  });

  it('rejects unused @external', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['EXTERNAL_UNUSED', '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).'],
    ]);
  });

  it('rejects @provides on non-object fields', () => {
    const subgraph =  gql`
      type Query {
        t: Int @provides(fields: "f")
      }

      type T {
        f: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_ON_NON_OBJECT_FIELD', '[S] Invalid @provides directive on field "Query.t": field has type "Int" which is not a Composite Type'],
    ]);
  });

  it('rejects a non-string argument to @key', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: ["f"]) {
        f: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_INVALID_FIELDS_TYPE', '[S] On type "T", for @key(fields: ["f"]): Invalid value for argument "fields": must be a string.'],
    ]);
  });

  it('rejects a non-string argument to @provides', () => {
    const subgraph =  gql`
      type Query {
        t: T @provides(fields: ["f"])
      }

      type T {
        f: Int @external
      }
    `
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_INVALID_FIELDS_TYPE', '[S] On field "Query.t", for @provides(fields: ["f"]): Invalid value for argument "fields": must be a string.'],
      ['EXTERNAL_UNUSED', '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).' ],
    ]);
  });

  it('rejects a non-string argument to @requires', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
        g: Int @requires(fields: ["f"])
      }
    `
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['REQUIRES_INVALID_FIELDS_TYPE', '[S] On field "T.g", for @requires(fields: ["f"]): Invalid value for argument "fields": must be a string.'],
      ['EXTERNAL_UNUSED', '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).' ],
    ]);
  });

  // Special case of non-string argument, specialized because it hits a different
  // code-path due to enum values being parsed as string and requiring special care.
  it('rejects an enum-like argument to @key', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: f) {
        f: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_INVALID_FIELDS_TYPE', '[S] On type "T", for @key(fields: f): Invalid value for argument "fields": must be a string.'],
    ]);
  });

  // Special case of non-string argument, specialized because it hits a different
  // code-path due to enum values being parsed as string and requiring special care.
  it('rejects an enum-lik argument to @provides', () => {
    const subgraph =  gql`
      type Query {
        t: T @provides(fields: f)
      }

      type T {
        f: Int @external
      }
    `
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_INVALID_FIELDS_TYPE', '[S] On field "Query.t", for @provides(fields: f): Invalid value for argument "fields": must be a string.'],
      ['EXTERNAL_UNUSED', '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).' ],
    ]);
  });

  // Special case of non-string argument, specialized because it hits a different
  // code-path due to enum values being parsed as string and requiring special care.
  it('rejects an enum-like argument to @requires', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
        g: Int @requires(fields: f)
      }
    `
    // Note: since the error here is that we cannot parse the key `fields`, this also mean that @external on
    // `f` will appear unused and we get an error for it. It's kind of hard to avoid cleanly and hopefully
    // not a big deal (having errors dependencies is not exactly unheard of).
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['REQUIRES_INVALID_FIELDS_TYPE', '[S] On field "T.g", for @requires(fields: f): Invalid value for argument "fields": must be a string.'],
      ['EXTERNAL_UNUSED', '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).' ],
    ]);
  });

  it('rejects an invalid `fields` argument to @key', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: ":f") {
        f: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_INVALID_FIELDS', '[S] On type "T", for @key(fields: ":f"): Syntax Error: Expected Name, found ":".'],
    ]);
  });

  it('rejects an invalid `fields` argument to @provides', () => {
    const subgraph =  gql`
      type Query {
        t: T @provides(fields: "{{f}}")
      }

      type T {
        f: Int @external
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['PROVIDES_INVALID_FIELDS', '[S] On field "Query.t", for @provides(fields: "{{f}}"): Syntax Error: Expected Name, found "{".'],
      ['EXTERNAL_UNUSED', '[S] Field "T.f" is marked @external but is not used in any federation directive (@key, @provides, @requires) or to satisfy an interface; the field declaration has no use and should be removed (or the field should not be @external).' ],
    ]);
  });

  it('rejects an invalid `fields` argument to @requires', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T {
        f: Int @external
        g: Int @requires(fields: "f b")
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['REQUIRES_INVALID_FIELDS', '[S] On field "T.g", for @requires(fields: "f b"): Cannot query field "b" on type "T" (if the field is defined in another subgraph, you need to add it to this subgraph with @external).'],
    ]);
  });

  it('rejects @key on a list field', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f: [Int]
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_FIELDS_SELECT_INVALID_TYPE', '[S] On type "T", for @key(fields: "f"): field "T.f" is a List type which is not allowed in @key'],
    ]);
  });

  it('rejects @key on an interface field', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f: I
      }

      interface I {
        i: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_FIELDS_SELECT_INVALID_TYPE', '[S] On type "T", for @key(fields: "f"): field "T.f" is a Interface type which is not allowed in @key'],
    ]);
  });

  it('rejects @key on an union field', () => {
    const subgraph =  gql`
      type Query {
        t: T
      }

      type T @key(fields: "f") {
        f: U
      }

      union U = Query | T
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['KEY_FIELDS_SELECT_INVALID_TYPE', '[S] On type "T", for @key(fields: "f"): field "T.f" is a Union type which is not allowed in @key'],
    ]);
  });
});

describe('root types', () => {
  it('rejects using Query as type name if not the query root', () => {
    const subgraph =  gql`
      schema {
        query: MyQuery
      }

      type MyQuery {
        f: Int
      }

      type Query {
        g: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['ROOT_QUERY_USED', '[S] The schema has a type named "Query" but it is not set as the query root type ("MyQuery" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.'],
    ]);
  });

  it('rejects using Mutation as type name if not the mutation root', () => {
    const subgraph =  gql`
      schema {
        mutation: MyMutation
      }

      type MyMutation {
        f: Int
      }

      type Mutation {
        g: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['ROOT_MUTATION_USED', '[S] The schema has a type named "Mutation" but it is not set as the mutation root type ("MyMutation" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.'],
    ]);
  });

  it('rejects using Subscription as type name if not the subscription root', () => {
    const subgraph =  gql`
      schema {
        subscription: MySubscription
      }

      type MySubscription {
        f: Int
      }

      type Subscription {
        g: Int
      }
    `
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['ROOT_SUBSCRIPTION_USED', '[S] The schema has a type named "Subscription" but it is not set as the subscription root type ("MySubscription" is instead): this is not supported by federation. If a root type does not use its default name, there should be no other type with that default name.'],
    ]);
  });
});


it('validates all implementations of interface field have same type if any has @external', () => {
  const subgraph = gql`
    type Query {
      is: [I!]!
    }

    interface I {
      f: Int
    }

    type T1 implements I {
      f: Int
    }

    type T2 implements I {
      f: Int!
    }

    type T3 implements I {
      id: ID!
      f: Int @external
    }
  `;
    expect(buildForErrors(subgraph)).toStrictEqual([
      ['INTERFACE_FIELD_IMPLEM_TYPE_MISMATCH', '[S] Some of the runtime implementations of interface field "I.f" are marked @external or have a @require ("T3.f") so all the implementations should use the same type (a current limitation of federation; see https://github.com/apollographql/federation/issues/1257), but "T1.f" and "T3.f" have type "Int" while "T2.f" has type "Int!".'],
    ]);
})
