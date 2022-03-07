import { asFed2SubgraphDocument, buildSchema, extractSubgraphsFromSupergraph, ObjectType, printSchema, Schema, ServiceDefinition, Subgraphs } from '@apollo/federation-internals';
import { CompositionResult, composeServices, CompositionSuccess } from '../compose';
import gql from 'graphql-tag';
import './matchers';

function assertCompositionSuccess(r: CompositionResult): asserts r is CompositionSuccess {
  if (r.errors) {
    throw new Error(`Expected composition to succeed but got errors:\n${r.errors.join('\n\n')}`);
  }
}

function errors(r: CompositionResult): [string, string][] {
  return r.errors?.map(e => [e.extensions.code as string, e.message]) ?? [];
}

// Returns [the supergraph schema, its api schema, the extracted subgraphs]
function schemas(result: CompositionSuccess): [Schema, Schema, Subgraphs] {
  // Note that we could user `result.schema`, but reparsing to ensure we don't lose anything with printing/parsing.
  const schema = buildSchema(result.supergraphSdl);
  expect(schema.isCoreSchema()).toBeTruthy();
  return [schema, schema.toAPISchema(), extractSubgraphsFromSupergraph(schema)];
}

// Note that tests for composition involving fed1 subgraph are in `composeFed1Subgraphs.test.ts` so all the test of this
// file are on fed2 subgraphs, but to avoid needing to add the proper `@link(...)` everytime, we inject it here automatically.
export function composeAsFed2Subgraphs(services: ServiceDefinition[]): CompositionResult {
  return composeServices(services.map((s) => ({
    ...s,
    typeDefs: asFed2SubgraphDocument(s.typeDefs)
  })));
}

describe('composition', () => {
  it('generates a valid supergraph', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      url: 'https://Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      url: 'https://Subgraph2',
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
          b: String
        }
      `
    }

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toMatchString(`
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
      {
        query: Query
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      enum core__Purpose {
        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY

        """
        \`EXECUTION\` features provide metadata necessary for operation execution.
        """
        EXECUTION
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH1 @join__graph(name: "Subgraph1", url: "https://Subgraph1")
        SUBGRAPH2 @join__graph(name: "Subgraph2", url: "https://Subgraph2")
      }

      type Query
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        t: T @join__field(graph: SUBGRAPH1)
      }

      type T
        @join__type(graph: SUBGRAPH1, key: "k")
        @join__type(graph: SUBGRAPH2, key: "k")
      {
        k: ID
        a: Int @join__field(graph: SUBGRAPH2)
        b: String @join__field(graph: SUBGRAPH2)
      }
    `);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Query {
        t: T
      }

      type T {
        k: ID
        a: Int
        b: String
      }
    `);
  })

  it('preserves descriptions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        "A cool schema"
        schema {
          query: Query
        }

        """
        Available queries
        Not much yet
        """
        type Query {
          "Returns tea"
          t(
            "An argument that is very important"
            x: String!
          ): String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        "An enum"
        enum E {
          "The A value"
          A
          "The B value"
          B
        }
      `
    }

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      """A cool schema"""
      schema {
        query: Query
      }

      """An enum"""
      enum E {
        """The A value"""
        A

        """The B value"""
        B
      }

      """
      Available queries
      Not much yet
      """
      type Query {
        """Returns tea"""
        t(
          """An argument that is very important"""
          x: String!
        ): String
      }
    `);
  })

  it('include types from different subgraphs', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          products: [Product!]
        }

        type Product {
          sku: String!
          name: String!
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type User {
          name: String
          email: String!
        }
      `,
      name: 'subgraphB',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

    assertCompositionSuccess(result);

    const [_, api, subgraphs] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Product {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }

      type User {
        name: String
        email: String!
      }
    `);

    expect(subgraphs.get('subgraphA')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@shareable", "@tag", "@extends"])
      {
        query: Query
      }

      type Product {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    expect(subgraphs.get('subgraphB')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@shareable", "@tag", "@extends"])
      {
        query: Query
      }

      type User {
        name: String
        email: String!
      }
    `);
  });

  it("doesn't leave federation directives in the final schema", () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          products: [Product!] @provides(fields: "name")
        }

        type Product @key(fields: "sku") {
          sku: String!
          name: String! @external
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Product @key(fields: "sku") {
          sku: String!
          name: String! @shareable
        }
      `,
      name: 'subgraphB',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api, subgraphs] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Product {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    // Of course, the federation directives should be rebuilt in the extracted subgraphs.
    expect(subgraphs.get('subgraphA')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@shareable", "@tag", "@extends"])
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        name: String! @external
      }

      type Query {
        products: [Product!] @provides(fields: "name")
      }
    `);

    expect(subgraphs.get('subgraphB')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@shareable", "@tag", "@extends"])
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        name: String!
      }
    `);
  });

  describe('merging of type references', () => {
    describe('for field types', () => {
      it('errors on incompatible types', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f: String @shareable
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
          ['FIELD_TYPE_MISMATCH', 'Field "T.f" has incompatible types across subgraphs: it has type "String" in subgraph "subgraphA" but type "Int" in subgraph "subgraphB"']
        ]);
      });

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
          ['EXTERNAL_TYPE_MISMATCH', 'Field "T.f" has incompatible types across subgraphs (where marked @external): it has type "Int" in subgraph "subgraphB" but type "String" in subgraph "subgraphA"'],
        ]);
      });

      it('errors on merging a list type with a non-list version', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f: String @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f: [String] @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['FIELD_TYPE_MISMATCH', 'Field "T.f" has incompatible types across subgraphs: it has type "String" in subgraph "subgraphA" but type "[String]" in subgraph "subgraphB"']
        ]);
      });

      it('merges nullable and non-nullable', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f: String! @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f: String @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api] = schemas(result);
        // We expect `f` to be nullable.
        expect(printSchema(api)).toMatchString(`
          type Query {
            T: T!
          }

          type T {
            id: ID!
            f: String
          }
        `);
      });

      it('merges interface subtypes', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            interface I {
              a: Int
            }

            type A implements I @shareable {
              a: Int
              b: Int
            }

            type B implements I {
              a: Int
              c: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: I @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type A @shareable {
              a: Int
              b: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: A @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api, subgraphs] = schemas(result);
        // We expect `f` to be `I` as that is the supertype between itself and `A`.
        expect(printSchema(api)).toMatchString(`
          type A implements I {
            a: Int
            b: Int
          }

          type B implements I {
            a: Int
            c: Int
          }

          interface I {
            a: Int
          }

          type Query {
            T: T!
          }

          type T {
            id: ID!
            f: I
          }
        `);

        // Making sure we properly extract the type of `f` for both subgraphs
        const fInA = (subgraphs.get('subgraphA')!.schema.type('T')! as ObjectType).field('f');
        expect(fInA).toBeDefined();
        expect(fInA?.type?.toString()).toBe('I');

        const fInB = (subgraphs.get('subgraphB')!.schema.type('T')! as ObjectType).field('f');
        expect(fInB).toBeDefined();
        expect(fInB?.type?.toString()).toBe('A');
      });

      it('merges union subtypes', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            union U = A | B

            type A @shareable {
              a: Int
            }

            type B {
              b: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: U @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type A @shareable {
              a: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: A @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api, subgraphs] = schemas(result);
        // We expect `f` to be `I` as that is the supertype between itself and `A`.
        expect(printSchema(api)).toMatchString(`
          type A {
            a: Int
          }

          type B {
            b: Int
          }

          type Query {
            T: T!
          }

          type T {
            id: ID!
            f: U
          }

          union U = A | B
        `);

        // Making sur we properly extract the type of `f` for both subgraphs
        const fInA = (subgraphs.get('subgraphA')!.schema.type('T')! as ObjectType).field('f');
        expect(fInA).toBeDefined();
        expect(fInA?.type?.toString()).toBe('U');

        const fInB = (subgraphs.get('subgraphB')!.schema.type('T')! as ObjectType).field('f');
        expect(fInB).toBeDefined();
        expect(fInB?.type?.toString()).toBe('A');
      });

      it('merges complex subtypes', () => {
        // This example merge types that differs both on interface subtyping
        // and on nullability
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            interface I {
              a: Int
            }

            type A implements I @shareable {
              a: Int
              b: Int
            }

            type B implements I {
              a: Int
              c: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: I @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type A @shareable {
              a: Int
              b: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: A! @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api, subgraphs] = schemas(result);
        // We expect `f` to be `I` as that is the supertype between itself and `A`.
        expect(printSchema(api)).toMatchString(`
          type A implements I {
            a: Int
            b: Int
          }

          type B implements I {
            a: Int
            c: Int
          }

          interface I {
            a: Int
          }

          type Query {
            T: T!
          }

          type T {
            id: ID!
            f: I
          }
        `);

        // Making sur we properly extract the type of `f` for both subgraphs
        const fInA = (subgraphs.get('subgraphA')!.schema.type('T')! as ObjectType).field('f');
        expect(fInA).toBeDefined();
        expect(fInA?.type?.toString()).toBe('I');

        const fInB = (subgraphs.get('subgraphB')!.schema.type('T')! as ObjectType).field('f');
        expect(fInB).toBeDefined();
        expect(fInB?.type?.toString()).toBe('A!');
      });

      it('merges subtypes within lists', () => {
        // This example merge types that differs both on interface subtyping
        // and on nullability
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            interface I {
              a: Int
            }

            type A implements I @shareable {
              a: Int
              b: Int
            }

            type B implements I {
              a: Int
              c: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: [I] @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type A @shareable {
              a: Int
              b: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: [A!] @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api, subgraphs] = schemas(result);
        // We expect `f` to be `I` as that is the supertype between itself and `A`.
        expect(printSchema(api)).toMatchString(`
          type A implements I {
            a: Int
            b: Int
          }

          type B implements I {
            a: Int
            c: Int
          }

          interface I {
            a: Int
          }

          type Query {
            T: T!
          }

          type T {
            id: ID!
            f: [I]
          }
        `);

        // Making sur we properly extract the type of `f` for both subgraphs
        const fInA = (subgraphs.get('subgraphA')!.schema.type('T')! as ObjectType).field('f');
        expect(fInA).toBeDefined();
        expect(fInA?.type?.toString()).toBe('[I]');

        const fInB = (subgraphs.get('subgraphB')!.schema.type('T')! as ObjectType).field('f');
        expect(fInB).toBeDefined();
        expect(fInB?.type?.toString()).toBe('[A!]');
      });

      it('merges subtypes within non-nullable', () => {
        // This example merge types that differs both on interface subtyping
        // and on nullability
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            interface I {
              a: Int
            }

            type A implements I @shareable {
              a: Int
              b: Int
            }

            type B implements I {
              a: Int
              c: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: I! @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type A @shareable {
              a: Int
              b: Int
            }

            type T @key(fields: "id") {
              id: ID!
              f: A! @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api, subgraphs] = schemas(result);
        // We expect `f` to be `I` as that is the supertype between itself and `A`.
        expect(printSchema(api)).toMatchString(`
          type A implements I {
            a: Int
            b: Int
          }

          type B implements I {
            a: Int
            c: Int
          }

          interface I {
            a: Int
          }

          type Query {
            T: T!
          }

          type T {
            id: ID!
            f: I!
          }
        `);

        // Making sur we properly extract the type of `f` for both subgraphs
        const fInA = (subgraphs.get('subgraphA')!.schema.type('T')! as ObjectType).field('f');
        expect(fInA).toBeDefined();
        expect(fInA?.type?.toString()).toBe('I!');

        const fInB = (subgraphs.get('subgraphB')!.schema.type('T')! as ObjectType).field('f');
        expect(fInB).toBeDefined();
        expect(fInB?.type?.toString()).toBe('A!');
      });

      it('errors on incompatible input field types', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              q: String
            }

            input T {
              f: String
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            input T {
              f: Int
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['FIELD_TYPE_MISMATCH', 'Field "T.f" has incompatible types across subgraphs: it has type "String" in subgraph "subgraphA" but type "Int" in subgraph "subgraphB"'],
        ]);
      });

      it('errors on incompatible input field types', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              q: String
            }

            input T {
              f: Int = 0
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            input T {
              f: Int = 1
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['INPUT_FIELD_DEFAULT_MISMATCH', 'Input field "T.f" has incompatible default values across subgraphs: it has default value 0 in subgraph "subgraphA" but default value 1 in subgraph "subgraphB"'],
        ]);
      });

    });

    describe('for arguments', () => {
      it('errors on incompatible types', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
                f(x: Int): Int @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f(x: String): Int @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['FIELD_ARGUMENT_TYPE_MISMATCH', 'Argument "T.f(x:)" has incompatible types across subgraphs: it has type "Int" in subgraph "subgraphA" but type "String" in subgraph "subgraphB"']
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
          ['EXTERNAL_ARGUMENT_TYPE_MISMATCH', 'Argument "T.f(x:)" has incompatible types across subgraphs (where "T.f" is marked @external): it has type "Int" in subgraph "subgraphB" but type "String" in subgraph "subgraphA"'],
        ]);
      });

      it('errors on incompatible argument default', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f(x: Int = 0): String @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f(x: Int = 1): String @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['FIELD_ARGUMENT_DEFAULT_MISMATCH', 'Argument "T.f(x:)" has incompatible default values across subgraphs: it has default value 0 in subgraph "subgraphA" but default value 1 in subgraph "subgraphB"'],
        ]);
      });

      it('errors on incompatible argument default in @external declaration', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            interface I {
              f(x: Int): String
            }

            type T implements I @key(fields: "id") {
              id: ID!
              f(x: Int): String @external
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f(x: Int = 1): String
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['EXTERNAL_ARGUMENT_DEFAULT_MISMATCH', 'Argument "T.f(x:)" has incompatible defaults across subgraphs (where "T.f" is marked @external): it has default value 1 in subgraph "subgraphB" but no default value in subgraph "subgraphA"'],
        ]);
      });

      it('errors on merging a list type with a non-list version', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f(x: String): String @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f(x: [String]): String @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['FIELD_ARGUMENT_TYPE_MISMATCH', 'Argument "T.f(x:)" has incompatible types across subgraphs: it has type "String" in subgraph "subgraphA" but type "[String]" in subgraph "subgraphB"']
        ]);
      });

      it('merges nullable and non-nullable', () => {
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f(x: String): String @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f(x: String!): String @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api] = schemas(result);
        // We expect `f(x:)` to be non-nullable.
        expect(printSchema(api)).toMatchString(`
          type Query {
            T: T!
          }

          type T {
            id: ID!
            f(x: String!): String
          }
        `);
      });

      it('merges subtypes within lists', () => {
        // This example merge types that differs both on interface subtyping
        // and on nullability
        const subgraphA = {
          name: 'subgraphA',
          typeDefs: gql`
            type Query {
              T: T!
            }

            type T @key(fields: "id") {
              id: ID!
              f(x: [Int]): Int @shareable
            }
          `,
        };

        const subgraphB = {
          name: 'subgraphB',
          typeDefs: gql`
            type T @key(fields: "id") {
              id: ID!
              f(x: [Int!]): Int @shareable
            }
          `,
        };

        const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
        assertCompositionSuccess(result);

        const [_, api] = schemas(result);
        // We expect `f` to be `I` as that is the supertype between itself and `A`.
        expect(printSchema(api)).toMatchString(`
          type Query {
            T: T!
          }

          type T {
            id: ID!
            f(x: [Int!]): Int
          }
        `);
      });
    });
  });

  describe('merge validations', () => {
    it('errors when a subgraph is invalid', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            a: A
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type A {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_GRAPHQL', '[subgraphA] Unknown type A'],
      ]);
    });

    it('errors when the @tag definition is invalid', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            a: String
          }

          directive @tag on ENUM_VALUE
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type A {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['DIRECTIVE_DEFINITION_INVALID', '[subgraphA] Found invalid @tag directive definition. Please ensure the directive definition in your schema\'s definitions matches the following:\n\tdirective @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION'],
      ]);
    });

    it('reject a subgraph named "_"', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            a: String
          }
        `,
        name: '_',
      };

      const subgraphB = {
        typeDefs: gql`
          type A {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_SUBGRAPH_NAME', '[_] Invalid name _ for a subgraph: this name is reserved'],
      ]);
    });

    it('reject if no subgraphs have a query', () => {
      const subgraphA = {
        typeDefs: gql`
          type A {
            a: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type B {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['NO_QUERIES', 'No queries found in any subgraph: a supergraph must have a query root type.'],
      ]);
    });

    it('reject a type defined with different kinds in different subgraphs', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q: A
          }

          type A {
            a: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          interface A {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['TYPE_KIND_MISMATCH', 'Type "A" has mismatched kind: it is defined as Object Type in subgraph "subgraphA" but Interface Type in subgraph "subgraphB"'],
      ]);
    });

    it('errors if an @external field is not defined in any other subgraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q: String
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          interface I {
            f: Int
          }

          type A implements I @key(fields: "k") {
            k: ID!
            f: Int @external
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['EXTERNAL_MISSING_ON_BASE', 'Field "A.f" is marked @external on all the subgraphs in which it is listed (subgraph "subgraphB").'],
      ]);
    });

    it('errors if a mandatory argument is not in all subgraphs', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q(a: Int!): String @shareable
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            q: String @shareable
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['REQUIRED_ARGUMENT_MISSING_IN_SOME_SUBGRAPH',
          'Argument "Query.q(a:)" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "subgraphA" but does not appear in subgraph "subgraphB"']
      ]);
    });
  });

  describe('post-merge validation', () => {
    it('errors if a type does not implement one of its interface post-merge', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            I: [I!]
          }

          interface I {
            a: Int
          }

          type A implements I {
            a: Int
            b: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          interface I {
            b: Int
          }

          type B implements I {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INTERFACE_FIELD_NO_IMPLEM', 'Interface field "I.a" is declared in subgraph \"subgraphA\" but type "B", which implements "I" only in subgraph \"subgraphB\" does not have field "a".'],
      ]);
    })

    it('errors if a type does not implement one of its interface post-merge with interface on interface', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            I: [I!]
          }

          interface I {
            a: Int
          }

          interface J implements I {
            a: Int
            b: Int
          }

          type A implements I & J {
            a: Int
            b: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          interface J {
            b: Int
          }

          type B implements J {
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INTERFACE_FIELD_NO_IMPLEM', 'Interface field "J.a" is declared in subgraph \"subgraphA\" but type "B", which implements "J" only in subgraph \"subgraphB\" does not have field "a".'],
      ]);
    })
  });

  it('is not broken by similar field argument signatures (#1100)', () => {
    // This test is about validating the case from https://github.com/apollographql/federation/issues/1100 is fixed.

    const subgraphA = {
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @shareable {
          a(x: String): Int
          b(x: Int): Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type T @shareable {
          a(x: String): Int
          b(x: Int): Int
        }
      `,
      name: 'subgraphB',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Query {
        t: T
      }

      type T {
        a(x: String): Int
        b(x: Int): Int
      }
    `);
  });

  // We have specific validation tests in `validation_errors.test.ts` but this one test
  // just check the associated error code is correct (since we check most composition error
  // codes in this file)
  it('use the proper error code for composition validation errors', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a: A
        }

        type A @shareable {
          x: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type A @shareable {
          x: Int
          y: Int
        }
      `,
      name: 'subgraphB',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

    expect(result.errors).toBeDefined();
    expect(errors(result).map(([code]) => code)).toStrictEqual(['SATISFIABILITY_ERROR']);
    expect(errors(result).map(([_, msg]) => msg)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        a {
          y
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "subgraphA":
        - cannot find field "A.y".
        - cannot move to subgraph "subgraphB", which has field "A.y", because type "A" has no @key defined in subgraph "subgraphB".
      `],
    );
  });

  describe('field sharing', () => {
    it ('errors if a non-shareable fields are shared in "value types"', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            a: A
          }

          type A {
            x: Int
            y: Int
            z: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type A {
            x: Int
            z: Int @shareable
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_FIELD_SHARING', 'Non-shareable field "A.x" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in all of them'],
        ['INVALID_FIELD_SHARING', 'Non-shareable field "A.z" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in subgraph "subgraphA"'],
      ]);
    });

    it ('errors if a non-shareable fields are shared in an "entity type"', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            a: A
          }

          type A @key(fields: "x") {
            x: Int
            y: Int
            z: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type A @key(fields: "x") {
            x: Int
            z: Int @shareable
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_FIELD_SHARING', 'Non-shareable field "A.z" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in subgraph "subgraphA"'],
      ]);
    });

    it ('errors if a query is shared without @shareable', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            me: String
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            me: String
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_FIELD_SHARING', 'Non-shareable field "Query.me" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in all of them'],
      ]);
    });

    it ('errors if provided fields are not marked @shareable', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            e: E
          }

          type E @key(fields: "id") {
            id: ID!
            a: Int
            b: Int
            c: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            eWithProvided: E @provides(fields: "a c")
          }

          type E @key(fields: "id") {
            id: ID!
            a: Int @external
            c: Int @external
            d: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_FIELD_SHARING', 'Non-shareable field "E.a" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in subgraph "subgraphA"'],
        ['INVALID_FIELD_SHARING', 'Non-shareable field "E.c" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in subgraph "subgraphA"'],
      ]);
    });
  });

  it('handles renamed federation directives', () => {
    const subgraphA = {
      typeDefs: gql`
        extend schema @link(
          url: "https://specs.apollo.dev/federation/v2.0",
          import: [{ name: "@key", as: "@identity"}, {name: "@requires", as: "@gimme"}, {name: "@external", as: "@notInThisSubgraph"}]
        )

        type Query {
          users: [User]
        }

        type User @identity(fields: "id") {
          id: ID!
          name: String!
          birthdate: String! @notInThisSubgraph
          age: Int! @gimme(fields: "birthdate")
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        extend schema @link(
          url: "https://specs.apollo.dev/federation/v2.0",
          import: [{ name: "@key", as: "@myKey"}]
        )

        type User @myKey(fields: "id") {
          id: ID!
          birthdate: String!
        }
      `,
      name: 'subgraphB',
    };

    // Note that we don't use `composeAsFed2Subgraph` since we @link manually in that example.
    const result = composeServices([subgraphA, subgraphB]);

    assertCompositionSuccess(result);

    const [supergraph, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
        type Query {
          users: [User]
        }

        type User {
          id: ID!
          name: String!
          birthdate: String!
          age: Int!
        }
    `);

    /*
     * We validate that all the directives have been properly processed, namely:
     *  - That `User` has a key in both subgraphs
     *  - That `User.birthdate` is external in the first subgraph.
     *  - That `User.age` does require `birthdate`.
     */
    expect(printSchema(supergraph)).toMatchString(`
      schema
        @core(feature: \"https://specs.apollo.dev/core/v0.2\")
        @core(feature: \"https://specs.apollo.dev/join/v0.2\", for: EXECUTION)
      {
        query: Query
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      enum core__Purpose {
        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY

        """
        \`EXECUTION\` features provide metadata necessary for operation execution.
        """
        EXECUTION
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPHA @join__graph(name: "subgraphA", url: "")
        SUBGRAPHB @join__graph(name: "subgraphB", url: "")
      }

      type Query
        @join__type(graph: SUBGRAPHA)
        @join__type(graph: SUBGRAPHB)
      {
        users: [User] @join__field(graph: SUBGRAPHA)
      }

      type User
        @join__type(graph: SUBGRAPHA, key: "id")
        @join__type(graph: SUBGRAPHB, key: "id")
      {
        id: ID!
        name: String! @join__field(graph: SUBGRAPHA)
        birthdate: String! @join__field(graph: SUBGRAPHA, external: true) @join__field(graph: SUBGRAPHB)
        age: Int! @join__field(graph: SUBGRAPHA, requires: "birthdate")
      }
    `);
  })
});
