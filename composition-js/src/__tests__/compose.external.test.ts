import gql from 'graphql-tag';
import './matchers';
import {
  assertCompositionSuccess,
  errors,
  schemas,
  composeAsFed2Subgraphs,
} from "./testHelper";
import {
  printSchema,
} from '@apollo/federation-internals';

describe('tests related to @external', () => {
  it('errors on incompatible types with @external', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          T: T! @provides(fields: "f")
        }

        type T @key(fields: "id") {
          id: ID!
          f: String @external
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          f: Int @shareable
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      ['EXTERNAL_TYPE_MISMATCH', 'Type of field "T.f" is incompatible across subgraphs (where marked @external): it has type "Int" in subgraph "subgraphB" but type "String" in subgraph "subgraphA"'],
    ]);
  });

  it('errors on missing arguments to @external declaration', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          T: T! @provides(fields: "f")
        }

        type T @key(fields: "id") {
          id: ID!
          f: String @external
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          f(x: Int): String @shareable
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      ['EXTERNAL_ARGUMENT_MISSING', 'Field "T.f" is missing argument "T.f(x:)" in some subgraphs where it is marked @external: argument "T.f(x:)" is declared in subgraph "subgraphB" but not in subgraph "subgraphA" (where "T.f" is @external).'],
    ]);
  });

  it('errors on incompatible argument types in @external declaration', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          T: T!
        }

        interface I {
          f(x: String): String
        }

        type T implements I @key(fields: "id") {
          id: ID!
          f(x: String): String @external
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          f(x: Int): String
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      ['EXTERNAL_ARGUMENT_TYPE_MISMATCH', 'Type of argument "T.f(x:)" is incompatible across subgraphs (where "T.f" is marked @external): it has type "Int" in subgraph "subgraphB" but type "String" in subgraph "subgraphA"'],
    ]);
  });

  it('@external marked on type', () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          T: T!
        }

        type T @key(fields: "id") {
          id: ID!
          x: X @external
          y: Int @requires(fields: "x { a b c d }")
        }

        type X @external {
          a: Int
          b: Int
          c: Int
          d: Int
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: X
        }

        type X {
          a: Int
          b: Int
          c: Int
          d: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Query {
        T: T!
      }

      type T {
        id: ID!
        x: X
        y: Int
      }

      type X {
        a: Int
        b: Int
        c: Int
        d: Int
      }
    `);
  });
});
