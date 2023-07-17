import {
  asFed2SubgraphDocument,
  assert,
  AuthenticatedSpecDefinition,
  buildSubgraph,
  defaultPrintOptions,
  FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS,
  inaccessibleIdentity,
  InputObjectType,
  isObjectType,
  ObjectType,
  orderPrintedDefinitions,
  printDirectiveDefinition,
  printSchema,
  printType,
  RequiresScopesSpecDefinition,
} from '@apollo/federation-internals';
import { CompositionOptions, CompositionResult, composeServices } from '../compose';
import gql from 'graphql-tag';
import './matchers';
import { print } from 'graphql';
import {
  assertCompositionSuccess,
  schemas,
  errors,
  composeAsFed2Subgraphs,
  asFed2Service,
} from "./testHelper";

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

        type S {
          x: Int
        }

        union U = S | T
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

        enum E {
          V1
          V2
        }
      `
    }

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
      {
        query: Query
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      enum E
        @join__type(graph: SUBGRAPH2)
      {
        V1 @join__enumValue(graph: SUBGRAPH2)
        V2 @join__enumValue(graph: SUBGRAPH2)
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH1 @join__graph(name: "Subgraph1", url: "https://Subgraph1")
        SUBGRAPH2 @join__graph(name: "Subgraph2", url: "https://Subgraph2")
      }

      scalar link__Import

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

      type Query
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        t: T @join__field(graph: SUBGRAPH1)
      }

      type S
        @join__type(graph: SUBGRAPH1)
      {
        x: Int
      }

      type T
        @join__type(graph: SUBGRAPH1, key: "k")
        @join__type(graph: SUBGRAPH2, key: "k")
      {
        k: ID
        a: Int @join__field(graph: SUBGRAPH2)
        b: String @join__field(graph: SUBGRAPH2)
      }

      union U
        @join__type(graph: SUBGRAPH1)
        @join__unionMember(graph: SUBGRAPH1, member: "S")
        @join__unionMember(graph: SUBGRAPH1, member: "T")
       = S | T
    `);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      enum E {
        V1
        V2
      }

      type Query {
        t: T
      }

      type S {
        x: Int
      }

      type T {
        k: ID
        a: Int
        b: String
      }

      union U = S | T
    `);
  })

  it('respects given compose options', () => {
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

        type S {
          x: Int
        }

        union U = S | T
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

        enum E {
          V1
          V2
        }
      `
    }

    const options: CompositionOptions = {
      sdlPrintOptions: orderPrintedDefinitions(defaultPrintOptions),
    }
    const result = composeAsFed2Subgraphs([subgraph1, subgraph2], options);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
      {
        query: Query
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      enum E
        @join__type(graph: SUBGRAPH2)
      {
        V1 @join__enumValue(graph: SUBGRAPH2)
        V2 @join__enumValue(graph: SUBGRAPH2)
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH1 @join__graph(name: "Subgraph1", url: "https://Subgraph1")
        SUBGRAPH2 @join__graph(name: "Subgraph2", url: "https://Subgraph2")
      }

      scalar link__Import

      enum link__Purpose {
        """
        \`EXECUTION\` features provide metadata necessary for operation execution.
        """
        EXECUTION

        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY
      }

      type Query
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        t: T @join__field(graph: SUBGRAPH1)
      }

      type S
        @join__type(graph: SUBGRAPH1)
      {
        x: Int
      }

      type T
        @join__type(graph: SUBGRAPH1, key: "k")
        @join__type(graph: SUBGRAPH2, key: "k")
      {
        a: Int @join__field(graph: SUBGRAPH2)
        b: String @join__field(graph: SUBGRAPH2)
        k: ID
      }

      union U
        @join__type(graph: SUBGRAPH1)
        @join__unionMember(graph: SUBGRAPH1, member: "S")
        @join__unionMember(graph: SUBGRAPH1, member: "T")
       = S | T
    `);

    const [_, api] = schemas(result);
    expect(printSchema(api, orderPrintedDefinitions(defaultPrintOptions))).toMatchString(`
      enum E {
        V1
        V2
      }

      type Query {
        t: T
      }

      type S {
        x: Int
      }

      type T {
        a: Int
        b: String
        k: ID
      }

      union U = S | T
    `);
  })

  it('preserves descriptions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        "The foo directive description"
        directive @foo(url: String) on FIELD

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
        "The foo directive description"
        directive @foo(url: String) on FIELD

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

      """The foo directive description"""
      directive @foo(url: String) on FIELD

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

  it('no hint raised when merging empty description', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        schema {
          query: Query
        }

        ""
        type T {
          a: String @shareable
        }

        type Query {
          "Returns tea"
          t(
            "An argument that is very important"
            x: String!
          ): T
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        "Type T"
        type T {
          a: String @shareable
        }
      `
    }

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
    expect(result.hints).toEqual([]);
  });

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
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
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
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
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
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String! @shareable
        name: String! @external
      }

      type Query {
        products: [Product!] @provides(fields: "name")
      }
    `);

    expect(subgraphs.get('subgraphB')!.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String! @shareable
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
          ['FIELD_TYPE_MISMATCH', 'Type of field "T.f" is incompatible across subgraphs: it has type "String" in subgraph "subgraphA" but type "Int" in subgraph "subgraphB"']
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
          ['FIELD_TYPE_MISMATCH', 'Type of field "T.f" is incompatible across subgraphs: it has type "String" in subgraph "subgraphA" but type "[String]" in subgraph "subgraphB"']
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
        // This example merge types that differs interface subtyping within lists
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
        // This example merge types that differs both on interface subtyping and are non-nullable
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
        // We expect `f` to be `I!` as that is the supertype between itself and `A`.
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
          ['FIELD_TYPE_MISMATCH', 'Type of field "T.f" is incompatible across subgraphs: it has type "String" in subgraph "subgraphA" but type "Int" in subgraph "subgraphB"'],
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
          ['FIELD_ARGUMENT_TYPE_MISMATCH', 'Type of argument "T.f(x:)" is incompatible across subgraphs: it has type "Int" in subgraph "subgraphA" but type "String" in subgraph "subgraphB"']
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
          ['FIELD_ARGUMENT_TYPE_MISMATCH', 'Type of argument "T.f(x:)" is incompatible across subgraphs: it has type "String" in subgraph "subgraphA" but type "[String]" in subgraph "subgraphB"']
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

    it('errors when a subgraph has a field with an introspection-reserved name', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            __someQuery: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            aValidOne: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_GRAPHQL', '[subgraphA] Name "__someQuery" must not begin with "__", which is reserved by GraphQL introspection.'],
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
        ['DIRECTIVE_DEFINITION_INVALID', '[subgraphA] Invalid definition for directive "@tag": missing required argument "name"'],
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

    it('errors if a subgraph argument is "@required" without arguments but that argument is mandatory in the supergraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            x(arg: Int): Int @external
            y: Int @requires(fields: "x")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            x(arg: Int!): Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        [
          'REQUIRES_INVALID_FIELDS',
          '[subgraphA] On field "T.y", for @requires(fields: "x"): no value provided for argument "arg" of field "T.x" but a value is mandatory as "arg" is required in subgraph "subgraphB"',
        ]
      ]);
    });

    it('errors if a subgraph argument is "@required" with an argument, but that argument is not in the supergraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            x(arg: Int): Int @external
            y: Int @requires(fields: "x(arg: 42)")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            x: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(errors(result)).toStrictEqual([
        [
          'REQUIRES_INVALID_FIELDS',
          '[subgraphA] On field "T.y", for @requires(fields: "x(arg: 42)"): cannot provide a value for argument "arg" of field "T.x" as argument "arg" is not defined in subgraph "subgraphB"',
        ]
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

  describe('merging of directives', () => {
    it('propagates graphQL built-in directives', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            a: String @shareable @deprecated(reason: "bad")
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          type Query {
            a: String @shareable
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);

      const [_, api] = schemas(result);
      expect(printSchema(api)).toMatchString(`
        type Query {
          a: String @deprecated(reason: "bad")
        }
      `);
    });

    it('merges graphQL built-in directives', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            a: String @shareable @deprecated(reason: "bad")
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          type Query {
            a: String @shareable @deprecated(reason: "bad")
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);

      const [_, api] = schemas(result);
      expect(printSchema(api)).toMatchString(`
        type Query {
          a: String @deprecated(reason: "bad")
        }
      `);
    });

    it('propagates graphQL built-in directives even if redefined in the subgarph', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            a: String @deprecated
          }

          # Do note that the code validates that this definition below
          # is "compatible" with the "real one", which it is.
          directive @deprecated on FIELD_DEFINITION
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          type Query {
            b: String
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);

      const [_, api] = schemas(result);
      expect(printSchema(api)).toMatchString(`
        type Query {
          a: String @deprecated
          b: String
        }
      `);
    });
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

  describe('satisfiablility validation', () => {
    // We have specific validation tests for validation errors in `validation_errors.test.ts` but this one
    // test just check the associated error code is correct (since we check most composition error codes
    // in this file)
    it('uses the proper error code', () => {
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

    it('handles indirectly reacheable keys', () => {
      // This tests ensure that a regression introduced by https://github.com/apollographql/federation/pull/1653
      // is properly fixed. All we want to check is that validation succeed on this example, which it should.

      const subgraphA = {
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "k1") {
            k1: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          # Note: the ordering of the key happens to matter for this to be a proper reproduction of the
          # issue #1653 created.
          type T @key(fields: "k2") @key(fields: "k1") {
            k1: Int
            k2: Int
          }
        `,
        name: 'subgraphB',
      };

      const subgraphC = {
        typeDefs: gql`
          type T @key(fields: "k2") {
            k2: Int
            v: Int
          }
        `,
        name: 'subgraphC',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB, subgraphC]);
      assertCompositionSuccess(result);
    });
  });

  describe('field sharing', () => {
    it('errors if a non-shareable fields are shared in "value types"', () => {
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

    it('errors if a non-shareable fields are shared in an "entity type"', () => {
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

    it('errors if a query is shared without @shareable', () => {
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

    it('errors if provided fields are not marked @shareable', () => {
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

    it('applies @shareable on type only to the field within the definition', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            e: E
          }

          type E @shareable {
            id: ID!
            a: Int
          }

          extend type E {
            b: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type E @shareable {
            id: ID!
            a: Int
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      // We want the @shareable to only apply to `a` but not `b` in the first
      // subgraph, so this should _not_ compose.
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_FIELD_SHARING', 'Non-shareable field "E.b" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in subgraph "subgraphA"'],
      ]);
    });

    it('include hint in error message on shareable error due to target-less @override', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            e: E
          }

          type E @key(fields: "id") {
            id: ID!
            a: Int @override(from: "badName")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type E @key(fields: "id") {
            id: ID!
            a: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['INVALID_FIELD_SHARING', 'Non-shareable field "E.a" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in all of them (please note that "E.a" has an @override directive in "subgraphA" that targets an unknown subgraph so this could be due to misspelling the @override(from:) argument)'],
      ]);
    });

    it('allows applying @shareable on both a type definition and its extensions', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            e: E
          }

          type E @shareable {
            id: ID!
            a: Int
          }

          extend type E @shareable {
            b: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type E @shareable {
            id: ID!
            a: Int
            b: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      // Note that a previous test makes sure that _not_ having @shareable on the type extension ends up failing (as `b` is
      // not considered shareable in `subgraphA`. So succeeding here shows both that @shareable is accepted in the 2 places
      // (definition and extension) but also that it's properly taking into account.
      assertCompositionSuccess(result);
    });

    describe('@interfaceObject', () => {
      // An @interfaceObject type provides fields for all the implementation it abstracts, which should impact the shareability
      // for those concrete impelmentations. That is, if a field is provided by both an @interfaceObject and also by one concrete
      // implementation in another subgraph, then it needs to be marked @shareable. Those test check this as well as some
      // variants.

      it.each([
        {
          shareableOnConcreteType: false,
          shareableOnInterfaceObject: false,
          nonShareableErrorDetail: 'all of them',
        },
        {
          shareableOnConcreteType: true,
          shareableOnInterfaceObject: false,
          nonShareableErrorDetail: 'subgraph "subgraphA" (through @interfaceObject field "I.x")',
        },
        {
          shareableOnConcreteType: false,
          shareableOnInterfaceObject: true,
          nonShareableErrorDetail: 'subgraph "subgraphB"',
        },
        {
          shareableOnConcreteType: true,
          shareableOnInterfaceObject: true,
        },
      ])(
        'enforces shareable constraints for field "abstracted" by @interfaceObject and shared (shareable on concrete type: $shareableOnConcreteType, shareable on @interfaceObject: $shareableOnInterfaceObject)',
        ({ shareableOnConcreteType, shareableOnInterfaceObject, nonShareableErrorDetail}) => {
          const subgraphA = {
            typeDefs: gql`
              type Query {
                iFromA: I
              }

              type I @interfaceObject @key(fields: "id") {
                id: ID!
                x: Int${shareableOnInterfaceObject ? ' @shareable' : ''}
              }
            `,
            name: 'subgraphA',
          };

          const subgraphB = {
            typeDefs: gql`
              type Query {
                iFromB: I
              }

              interface I @key(fields: "id") {
                id: ID!
                x: Int
              }

              type A implements I @key(fields: "id") {
                id: ID!
                x: Int${shareableOnConcreteType ? ' @shareable' : ''}
              }
            `,
            name: 'subgraphB',
          };

          const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
          if (nonShareableErrorDetail) {
            expect(result.errors).toBeDefined();
            expect(errors(result)).toStrictEqual([[
              'INVALID_FIELD_SHARING',
              `Non-shareable field "A.x" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" (through @interfaceObject field "I.x") and "subgraphB" and defined as non-shareable in ${nonShareableErrorDetail}`
            ]]);
          } else {
            expect(result.errors).toBeUndefined();
          }
        }
      );

      it.each([
        {
          shareableOnI1: false,
          shareableOnI2: false,
          nonShareableErrorDetail: 'all of them',
        },
        {
          shareableOnI1: true,
          shareableOnI2: false,
          nonShareableErrorDetail: 'subgraph "subgraphA" (through @interfaceObject field "I2.x")',
        },
        {
          shareableOnI1: false,
          shareableOnI2: true,
          nonShareableErrorDetail: 'subgraph "subgraphA" (through @interfaceObject field "I1.x")',
        },
        {
          shareableOnI1: true,
          shareableOnI2: true,
        },
      ])(
        'enforces shareability in a single subgraph with 2 intersecting @interfaceObject (shareable on first @interfaceObject: $shareableOnI1, shareable on second @interfaceObject: $shareableOnI2)',
        ({ shareableOnI1, shareableOnI2, nonShareableErrorDetail}) => {
          const subgraphA = {
            typeDefs: gql`
              type Query {
                i1FromA: I1
                i2FromA: I2
              }

              type I1 @interfaceObject @key(fields: "id") {
                id: ID!
                x: Int${shareableOnI1 ? ' @shareable' : ''}
              }

              type I2 @interfaceObject @key(fields: "id") {
                id: ID!
                x: Int${shareableOnI2 ? ' @shareable' : ''}
              }
            `,
            name: 'subgraphA',
          };

          const subgraphB = {
            typeDefs: gql`
              type Query {
                i1FromB: I1
                i2FromB: I2
              }

              interface I1 @key(fields: "id") {
                id: ID!
              }

              interface I2 @key(fields: "id") {
                id: ID!
              }

              type A implements I1 & I2 @key(fields: "id") {
                id: ID!
              }
            `,
            name: 'subgraphB',
          };

          const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
          if (nonShareableErrorDetail) {
            expect(result.errors).toBeDefined();
            expect(errors(result)).toStrictEqual([[
              'INVALID_FIELD_SHARING',
              `Non-shareable field "A.x" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" (through @interfaceObject field "I1.x") and "subgraphA" (through @interfaceObject field "I2.x") and defined as non-shareable in ${nonShareableErrorDetail}`
            ]]);
          } else {
            expect(result.errors).toBeUndefined();
          }
        }
      );
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
        @link(url: \"https://specs.apollo.dev/link/v1.0\")
        @link(url: \"https://specs.apollo.dev/join/v0.3\", for: EXECUTION)
      {
        query: Query
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPHA @join__graph(name: "subgraphA", url: "")
        SUBGRAPHB @join__graph(name: "subgraphB", url: "")
      }

      scalar link__Import

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

  describe('@tag', () => {
    describe('propagates @tag to the supergraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            users: [User] @tag(name: "aTaggedOperation")
          }

          type User @key(fields: "id") {
            id: ID!
            name: String! @tag(name: "aTaggedField")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type User @key(fields: "id") @tag(name: "aTaggedType") {
            id: ID!
            birthdate: String!
            age: Int!
          }
        `,
        name: 'subgraphB',
      };

      const validatePropagation = (result: CompositionResult) => {
        assertCompositionSuccess(result);
        const supergraph = result.schema;
        const tagOnOp = supergraph.schemaDefinition.rootType('query')?.field('users')?.appliedDirectivesOf('tag').pop();
        expect(tagOnOp?.arguments()['name']).toBe('aTaggedOperation');

        const userType = supergraph.type('User');
        assert(userType && isObjectType(userType), `Should be an object type`);
        const tagOnType = userType.appliedDirectivesOf('tag').pop();
        expect(tagOnType?.arguments()['name']).toBe('aTaggedType');

        const tagOnField = userType?.field('name')?.appliedDirectivesOf('tag').pop();
        expect(tagOnField?.arguments()['name']).toBe('aTaggedField');
      };

      it('works for fed2 subgraphs', () => {
        validatePropagation(composeAsFed2Subgraphs([subgraphA, subgraphB]));
      });

      it('works for fed1 subgraphs', () => {
        validatePropagation(composeServices([subgraphA, subgraphB]));
      });

      it('works for mixed fed1/fed2 subgraphs', () => {
        validatePropagation(composeServices([subgraphA, asFed2Service(subgraphB)]));
      });
    });

    describe('merges multiple @tag on an element', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            user: [User]
          }

          type User @key(fields: "id") @tag(name: "aTagOnTypeFromSubgraphA") @tag(name: "aMergedTagOnType") {
            id: ID!
            name1: Name!
          }

          type Name {
            firstName: String @tag(name: "aTagOnFieldFromSubgraphA")
            lastName: String @tag(name: "aMergedTagOnField")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type User @key(fields: "id") @tag(name: "aTagOnTypeFromSubgraphB") @tag(name: "aMergedTagOnType") {
            id: ID!
            name2: String!
          }

          type Name {
            firstName: String @tag(name: "aTagOnFieldFromSubgraphB")
            lastName: String @tag(name: "aMergedTagOnField")
          }
        `,
        name: 'subgraphB',
      };

      const validatePropagation = (result: CompositionResult) => {
        assertCompositionSuccess(result);
        const supergraph = result.schema;

        const userType = supergraph.type('User');
        assert(userType && isObjectType(userType), `Should be an object type`);
        const tagsOnType = userType.appliedDirectivesOf('tag');
        expect(tagsOnType?.map((tag) => tag.arguments()['name'])).toStrictEqual(['aTagOnTypeFromSubgraphA', 'aMergedTagOnType', 'aTagOnTypeFromSubgraphB']);

        const nameType = supergraph.type('Name');
        assert(nameType && isObjectType(nameType), `Should be an object type`);
        const tagsOnFirstName = nameType?.field('firstName')?.appliedDirectivesOf('tag');
        expect(tagsOnFirstName?.map((tag) => tag.arguments()['name'])).toStrictEqual(['aTagOnFieldFromSubgraphA', 'aTagOnFieldFromSubgraphB']);

        const tagsOnLastName = nameType?.field('lastName')?.appliedDirectivesOf('tag');
        expect(tagsOnLastName?.map((tag) => tag.arguments()['name'])).toStrictEqual(['aMergedTagOnField']);
      };

      it('works for fed2 subgraphs', () => {
        // We need to mark the `Name` type shareable.
        const subgraphs = [subgraphA, subgraphB].map((s) => {
          const subgraph = buildSubgraph(s.name, '', asFed2SubgraphDocument(s.typeDefs));
          subgraph.schema.type('Name')?.applyDirective('shareable');
          return {
            ...s,
            typeDefs: subgraph.schema.toAST(),
          };
        });
        // Note that we've already converted the subgraphs to fed2 ones above, so we just call `composeServices` now.
        validatePropagation(composeServices(subgraphs));
      });

      it('works for fed1 subgraphs', () => {
        validatePropagation(composeServices([subgraphA, subgraphB]));
      });

      it('works for mixed fed1/fed2 subgraphs', () => {
        const sB = buildSubgraph(subgraphB.name, '', asFed2SubgraphDocument(subgraphB.typeDefs));
        sB.schema.type('Name')?.applyDirective('shareable');
        const updatedSubgraphB = {
          ...subgraphB,
          typeDefs: sB.schema.toAST(),
        };

        validatePropagation(composeServices([subgraphA, updatedSubgraphB]));
      });
    });

    describe('rejects @tag and @external together', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            user: [User]
          }

          type User @key(fields: "id") {
            id: ID!
            name: String!
            birthdate: Int! @external @tag(name: "myTag")
            age: Int! @requires(fields: "birthdate")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            birthdate: Int!
          }
        `,
        name: 'subgraphB',
      };

      const validateError = (result: CompositionResult) => {
        expect(result.errors).toBeDefined();
        expect(errors(result)).toStrictEqual([
          ['MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL', '[subgraphA] Cannot apply merged directive @tag(name: "myTag") to external field "User.birthdate"']
        ]);
      };

      it('works for fed2 subgraphs', () => {
        // Note that we've already converted the subgraphs to fed2 ones above, so we just call `composeServices` now.
        validateError(composeAsFed2Subgraphs([subgraphA, subgraphB]));
      });

      it('works for fed1 subgraphs', () => {
        validateError(composeServices([subgraphA, subgraphB]));
      });

      it('works for mixed fed1/fed2 subgraphs', () => {
        validateError(composeServices([subgraphA, asFed2Service(subgraphB)]));
      });
    });

    it('errors out if @tag is imported under mismatched names', () => {
      const subgraphA = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@tag", as: "@apolloTag"}])

          type Query {
            q1: Int @apolloTag(name: "t1")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@tag"])

          type Query {
            q2: Int @tag(name: "t2")
          }
        `,
        name: 'subgraphB',
      };

      const result = composeServices([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['LINK_IMPORT_NAME_MISMATCH', 'The "@tag" directive (from https://specs.apollo.dev/federation/v2.0) is imported with mismatched name between subgraphs: it is imported as "@tag" in subgraph "subgraphB" but "@apolloTag" in subgraph "subgraphA"']
      ]);
    });

    it('succeeds if @tag is imported under the same non-default name', () => {
      const subgraphA = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@tag", as: "@apolloTag"}])

          type Query {
            q1: Int @apolloTag(name: "t1")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@tag", as: "@apolloTag"}])

          type Query {
            q2: Int @apolloTag(name: "t2")
          }
        `,
        name: 'subgraphB',
      };

      const result = composeServices([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      const supergraph = result.schema;
      const tagOnQ1 = supergraph.schemaDefinition.rootType('query')?.field('q1')?.appliedDirectivesOf('apolloTag').pop();
      expect(tagOnQ1?.arguments()['name']).toBe('t1');

      const tagOnQ2 = supergraph.schemaDefinition.rootType('query')?.field('q2')?.appliedDirectivesOf('apolloTag').pop();
      expect(tagOnQ2?.arguments()['name']).toBe('t2');
    })
  });

  describe('@inaccessible', () => {
    it('propagates @inaccessible to the supergraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            me: User @inaccessible
            users: [User]
          }

          type User @key(fields: "id") {
            id: ID!
            name: String!
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            birthdate: String!
            age: Int! @inaccessible
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      const supergraph = result.schema;
      expect(supergraph.schemaDefinition.rootType('query')?.field('me')?.appliedDirectivesOf('inaccessible').pop()).toBeDefined();

      const userType = supergraph.type('User');
      assert(userType && isObjectType(userType), `Should be an object type`);
      expect(userType?.field('age')?.appliedDirectivesOf('inaccessible').pop()).toBeDefined();
    });

    it('merges @inacessible on the same element', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            user: [User]
          }

          type User @key(fields: "id") {
            id: ID!
            name: String @shareable @inaccessible
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            name: String @shareable @inaccessible
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      const supergraph = result.schema;

      const userType = supergraph.type('User');
      assert(userType && isObjectType(userType), `Should be an object type`);
      expect(userType?.field('name')?.appliedDirectivesOf('inaccessible').pop()).toBeDefined();
    });

    it('rejects @inaccessible and @external together', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            user: [User]
          }

          type User @key(fields: "id") {
            id: ID!
            name: String!
            birthdate: Int! @external @inaccessible
            age: Int! @requires(fields: "birthdate")
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            birthdate: Int!
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['MERGED_DIRECTIVE_APPLICATION_ON_EXTERNAL', '[subgraphA] Cannot apply merged directive @inaccessible to external field "User.birthdate"']
      ]);
    });

    it('errors out if @inaccessible is imported under mismatched names', () => {
      const subgraphA = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@inaccessible", as: "@private"}])

          type Query {
            q: Int
            q1: Int @private
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@inaccessible"])

          type Query {
            q2: Int @inaccessible
          }
        `,
        name: 'subgraphB',
      };

      const result = composeServices([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['LINK_IMPORT_NAME_MISMATCH', 'The "@inaccessible" directive (from https://specs.apollo.dev/federation/v2.0) is imported with mismatched name between subgraphs: it is imported as "@inaccessible" in subgraph "subgraphB" but "@private" in subgraph "subgraphA"']
      ]);
    });

    it('succeeds if @inaccessible is imported under the same non-default name', () => {
      const subgraphA = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@inaccessible", as: "@private"}])

          type Query {
            q: Int
            q1: Int @private
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          extend schema
            @link(url: "https://specs.apollo.dev/federation/v2.0", import: [{name: "@inaccessible", as: "@private"}])

          type Query {
            q2: Int @private
          }
        `,
        name: 'subgraphB',
      };

      const result = composeServices([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      const supergraph = result.schema;
      expect(supergraph.schemaDefinition.rootType('query')?.field('q1')?.appliedDirectivesOf('private').pop()).toBeDefined();
      expect(supergraph.schemaDefinition.rootType('query')?.field('q2')?.appliedDirectivesOf('private').pop()).toBeDefined();
    });

    it('ignores inaccessible element when validating composition', () => {
      // The following example would _not_ compose if the `z` was not marked inaccessible since it wouldn't be reachable
      // from the `origin` query. So all this test does is double-checking that validation does pass with it marked inaccessible.
      const subgraphA = {
        typeDefs: gql`
          type Query {
            origin: Point
          }

          type Point @shareable {
            x: Int
            y: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Point @shareable {
            x: Int
            y: Int
            z: Int @inaccessible
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
    });

    it('errors if a subgraph misuse @inaccessible', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q1: Int
            q2: A
          }

          type A @shareable {
            x: Int
            y: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type A @shareable @inaccessible {
            x: Int
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        ['REFERENCED_INACCESSIBLE', 'Type "A" is @inaccessible but is referenced by "Query.q2", which is in the API schema.']
      ]);

      // Because @inaccessible are thrown by the toAPISchema code and not the merge code directly, let's make sure the include
      // link to the relevant nodes in the subgaphs. Also note that in those test we don't have proper "location" information
      // in the AST nodes (line numbers in particular) because `gql` doesn't populate those, but printing the AST nodes kind of
      // guarantees us that we do get subgraph nodes and not supergraph nodes because supergraph nodes would have @join__*
      // directives and would _not_ have the `@shareable`/`@inacessible` directives.
      const nodes = result.errors![0].nodes!;
      expect(print(nodes[0])).toMatchString(`
        type A @shareable @inaccessible {
          x: Int
          y: Int
        }`
      );
      expect(print(nodes[1])).toMatchString('q2: A');
    })

    it('uses the SECURITY core purpose for inaccessible in the supergraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            someField: String!
            privateField: String! @inaccessible
          }
        `,
        name: 'subgraphA',
      };

      const result = composeAsFed2Subgraphs([subgraphA]);
      assertCompositionSuccess(result);
      const supergraph = result.schema;
      expect(supergraph.coreFeatures?.getByIdentity(inaccessibleIdentity)?.purpose).toBe('SECURITY');
    });
  });

  describe('Enum types', () => {
    it('merges inconsistent enum that are _only_ used as output', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            e: E!
          }

          enum E {
            V1
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V2
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      expect(printType(result.schema.toAPISchema().type('E')!)).toMatchString(`
        enum E {
          V1
          V2
        }
      `);
    });

    it('merges enum (but skip inconsistent enum values) that are _only_ used as input', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            f(e: E!): Int
          }

          enum E {
            V1
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V1
            V2
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      // Note that we will also generate an hint for the skipped value but this is already
      // tested by `hints.test.ts` so we don't duplicate the check here.
      expect(printType(result.schema.toAPISchema().type('E')!)).toMatchString(`
        enum E {
          V1
        }
      `);
    });

    it('do not error if a skipped inconsistent value has directive applied', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            f(e: E!): Int
          }

          enum E {
            V1
            V2 @deprecated(reason: "use V3 instead")
            V3
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V1
            V3
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      // Note that we will also generate an hint for the skipped value but this is already
      // tested by `hints.test.ts` so we don't duplicate the check here.
      expect(printType(result.schema.toAPISchema().type('E')!)).toMatchString(`
        enum E {
          V1
          V3
        }
      `);
    });

    it('errors if enum used _only_ as input as no consistent values', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            f(e: E!): Int
          }

          enum E {
            V1
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V2
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([[
        'EMPTY_MERGED_ENUM_TYPE',
        'None of the values of enum type "E" are defined consistently in all the subgraphs defining that type. As only values common to all subgraphs are merged, this would result in an empty type.'
      ]]);
    });

    it('errors when merging inconsistent enum that are used as both input and output', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            e: E!
            f(e: E!): Int
          }

          enum E {
            V1
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V2
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([
        [
          'ENUM_VALUE_MISMATCH',
          'Enum type "E" is used as both input type (for example, as type of "Query.f(e:)") and output type (for example, as type of "Query.e"), but value "V1" is not defined in all the subgraphs defining "E": "V1" is defined in subgraph "subgraphA" but not in subgraph "subgraphB"'
        ],
        [
          'ENUM_VALUE_MISMATCH',
          'Enum type "E" is used as both input type (for example, as type of "Query.f(e:)") and output type (for example, as type of "Query.e"), but value "V2" is not defined in all the subgraphs defining "E": "V2" is defined in subgraph "subgraphB" but not in subgraph "subgraphA"'
        ],
      ]);
    });

    it('ignores @inaccessible fields when merging enums that are used as both input and output', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            e: E!
            f(e: E!): Int
          }

          enum E {
            V1
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V1
            V2 @inaccessible
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeUndefined();
    });

    it('succeed merging consistent enum used as both input and output', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            e: E!
            f(e: E!): Int
          }

          enum E {
            V1
            V2
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          enum E {
            V1
            V2
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      expect(printType(result.schema.toAPISchema().type('E')!)).toMatchString(`
        enum E {
          V1
          V2
        }
      `);
    });
  });

  describe('Input types', () => {
    it('only merges fields common to all subgraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q1(a: A): String
          }

          input A {
            x: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            q2(a: A): String
          }

          input A {
            x: Int
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);

      const inputA = result.schema.type('A') as InputObjectType;
      expect(inputA.field('x')).toBeDefined();
      // Note that we will have a hint for this, but this is already tested in `hints.test.ts` so we don't bother checking it here.
      expect(inputA.field('y')).toBeUndefined();
    });

    it('merges input field with different but compatible types', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q1(a: A): String
          }

          input A {
            x: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            q2(a: A): String
          }

          input A {
            x: Int!
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);

      const inputA = result.schema.type('A') as InputObjectType;
      // Note that contrarily to object types, input types use contravariance to types. In other words,
      // since one of the subgraph does not know how to handle `null` inputs, we don't allow them in
      // the supergraph.
      expect(inputA.field('x')?.type?.toString()).toBe('Int!');
    });

    it('errors when merging completely inconsistent input types', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            f(i: MyInput!): Int
          }

          input MyInput {
            x: Int
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          input MyInput {
            y: Int
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([[
        'EMPTY_MERGED_INPUT_TYPE',
        'None of the fields of input object type "MyInput" are consistently defined in all the subgraphs defining that type. As only fields common to all subgraphs are merged, this would result in an empty type.'
      ]]);
    });

    it('errors if a mandatory input field is not in all subgraphs', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            q1(a: A): String
          }

          input A {
            x: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            q2(a: A): String
          }

          input A {
            x: Int
            y: Int!
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);

      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([[
        'REQUIRED_INPUT_FIELD_MISSING_IN_SOME_SUBGRAPH',
        'Input object field "A.y" is required in some subgraphs but does not appear in all subgraphs: it is required in subgraph "subgraphB" but does not appear in subgraph "subgraphA"'
      ]]);
    });
  });

  describe('Union types', () => {
    it('merges inconsistent unions', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: gql`
          type Query {
            u: U!
          }

          union U = A | B

          type A {
            a: Int
          }

          type B {
            b: Int
          }
        `,
      };

      const subgraphB = {
        name: 'subgraphB',
        typeDefs: gql`
          union U = C

          type C {
            b: Int
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      expect(printType(result.schema.toAPISchema().type('U')!)).toMatchString('union U = A | B | C');
    });
  });

  it('works with normal graphQL type extension when definition is empty', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          foo: Foo
        }

        type Foo

        extend type Foo {
          bar: String
        }
      `,
      name: 'subgraphA',
    };

    const result = composeServices([subgraphA]);
    assertCompositionSuccess(result);
  });

  it('handles fragments in @requires using @inaccessible types', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query @shareable {
          dummy: Entity
        }

        type Entity @key(fields: "id") {
          id: ID!
          data: Foo
        }

        interface Foo {
          foo: String!
        }

        interface Bar implements Foo {
          foo: String!
          bar: String!
        }

        type Baz implements Foo & Bar @shareable {
          foo: String!
          bar: String!
          baz: String!
        }

        type Qux implements Foo & Bar @shareable {
          foo: String!
          bar: String!
          qux: String!
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query @shareable {
          dummy: Entity
        }

        type Entity @key(fields: "id") {
          id: ID!
          data: Foo @external
          requirer: String! @requires(fields: "data { foo ... on Bar { bar ... on Baz { baz } ... on Qux { qux } } }")
        }

        interface Foo {
          foo: String!
        }

        interface Bar implements Foo {
          foo: String!
          bar: String!
        }

        type Baz implements Foo & Bar @shareable @inaccessible {
          foo: String!
          bar: String!
          baz: String!
        }

        type Qux implements Foo & Bar @shareable {
          foo: String!
          bar: String!
          qux: String!
        }
      `,
      name: 'subgraphB',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      interface Bar implements Foo {
        foo: String!
        bar: String!
      }

      type Entity {
        id: ID!
        data: Foo
        requirer: String!
      }

      interface Foo {
        foo: String!
      }

      type Query {
        dummy: Entity
      }

      type Qux implements Foo & Bar {
        foo: String!
        bar: String!
        qux: String!
      }
    `);
  });

  describe('@interfaceObject', () => {
    it('composes valid @interfaceObject usages correctly', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            iFromA: I
          }

          interface I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type A implements I @key(fields: "id") {
            id: ID!
            x: Int
            w: Int
          }

          type B implements I @key(fields: "id") {
            id: ID!
            x: Int
            z: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            iFromB: I
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);

      const [_, api] = schemas(result);
      expect(printSchema(api)).toMatchString(`
        type A implements I {
          id: ID!
          x: Int
          w: Int
          y: Int
        }

        type B implements I {
          id: ID!
          x: Int
          z: Int
          y: Int
        }

        interface I {
          id: ID!
          x: Int
          y: Int
        }

        type Query {
          iFromA: I
          iFromB: I
        }
      `);
    });

    it('errors if @interfaceObject is used with no corresponding interface', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            iFromA: I
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            x: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            iFromB: I
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([[
        'INTERFACE_OBJECT_USAGE_ERROR',
        'Type "I" is declared with @interfaceObject in all the subgraphs in which is is defined (it is defined in subgraphs "subgraphA" and "subgraphB" but should be defined as an interface in at least one subgraph)'
      ]]);
    });

    it('errors if @interfaceObject is missing in some subgraph', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            iFromA: I
          }

          interface I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type A implements I @key(fields: "id") {
            id: ID!
            x: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            iFromB: I
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const subgraphC = {
        typeDefs: gql`
          type Query {
            iFromC: I
          }

          type I @key(fields: "id") {
            id: ID!
            z: Int
          }
        `,
        name: 'subgraphC',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB, subgraphC]);
      expect(result.errors).toBeDefined();
      // Note: the error is a bit of a mouthful, but it should be clear enough and making it more compact requires
      // a bit more special code on the error generation side and it's not clear it's worth the trouble (since again,
      // the error should point to the problem well enough).
      expect(errors(result)).toStrictEqual([[
        'TYPE_KIND_MISMATCH',
        'Type "I" has mismatched kind: it is defined as Interface Type in subgraph "subgraphA" but Interface Object Type (Object Type with @interfaceObject) in subgraph "subgraphB" and Object Type in subgraph "subgraphC"',
      ]]);
    });

    it('errors if an interface has a @key but the subgraph do not know all implementations', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            iFromA: I
          }

          interface I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type A implements I @key(fields: "id") {
            id: ID!
            x: Int
            w: Int
          }

          type B implements I @key(fields: "id") {
            id: ID!
            x: Int
            z: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            iFromB: I
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const subgraphC = {
        typeDefs: gql`
          interface I {
            id: ID!
            x: Int
          }

          type C implements I @key(fields: "id") {
            id: ID!
            x: Int
            w: Int
          }
        `,
        name: 'subgraphC',
      }

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB, subgraphC]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([[
        'INTERFACE_KEY_MISSING_IMPLEMENTATION_TYPE',
        '[subgraphA] Interface type "I" has a resolvable key (@key(fields: "id")) in subgraph "subgraphA" but that subgraph is missing some of the supergraph implementation types of "I". Subgraph "subgraphA" should define type "C" (and have it implement "I").',
      ]]);
    });

    it('errors if a subgraph defines both an @interfaceObject and some implemenations', () => {
      const subgraphA = {
        typeDefs: gql`
          type Query {
            iFromA: I
          }

          interface I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type A implements I @key(fields: "id") {
            id: ID!
            x: Int
            w: Int
          }

          type B implements I @key(fields: "id") {
            id: ID!
            x: Int
            z: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            iFromB: I
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            y: Int
          }

          type A @key(fields: "id") {
            id: ID!
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toStrictEqual([[
        'INTERFACE_OBJECT_USAGE_ERROR',
        '[subgraphB] Interface type "I" is defined as an @interfaceObject in subgraph "subgraphB" so that subgraph should not define any of the implementation types of "I", but it defines type "A"',
      ]]);
    });

    it('composes references to @interfaceObject', () => {
      // Ensures that we have no issue merging a shared field whose is an interface in a subgraph, but an interfaceObject (so an object type)
      // in another.
      const subgraphA = {
        typeDefs: gql`
          type Query {
            i: I @shareable
          }

          interface I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type A implements I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type B implements I @key(fields: "id") {
            id: ID!
            x: Int
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            i: I @shareable
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
            y: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
    });

    it('do not error when optimizing unecessary loops', () => {
      // This test is built so that reaching `t { i { ... on A { u { v } } } }` flows from `subgraphB` to `subgraphA` (for `t`),
      // then changes types (with `i`), have a down cast to an implementation (`... A`) and then switch back subgraph (back to
      // `subgraphB` for `u { v }`). The reason is that the underlying code will check for some optimisation in that case (more
      // precisely, when switching back to `subgraphB` at the end, it will double-check if there wasn't a direct path in
      // `subgraphA` achieving the same), and there was an early issue when `@interfaceObject` are involved for that optimization.
      const subgraphA = {
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            i: I
          }

          interface I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type A implements I @key(fields: "id") {
            id: ID!
            x: Int
            u: U
          }

          type B implements I @key(fields: "id") {
            id: ID!
            x: Int
          }

          type U @key(fields: "id") {
            id: ID!
          }
        `,
        name: 'subgraphA',
      };

      const subgraphB = {
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
          }

          type I @interfaceObject @key(fields: "id") {
            id: ID!
          }

          type U @key(fields: "id") {
            id: ID!
            v: Int
          }
        `,
        name: 'subgraphB',
      };

      const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
    });
  });

  describe('@authenticated', () => {
    it('comprehensive locations', () => {
      const onObject = {
        typeDefs: gql`
          type Query {
            object: AuthenticatedObject!
          }

          type AuthenticatedObject @authenticated {
            field: Int!
          }
        `,
        name: 'on-object',
      };

      const onInterface = {
        typeDefs: gql`
          type Query {
            interface: AuthenticatedInterface!
          }

          interface AuthenticatedInterface @authenticated {
            field: Int!
          }
        `,
        name: 'on-interface',
      };

      const onInterfaceObject = {
        typeDefs: gql`
          type AuthenticatedInterfaceObject
            @interfaceObject
            @key(fields: "id")
            @authenticated
          {
            id: String!
          }
        `,
        name: 'on-interface-object',
      }

      const onScalar = {
        typeDefs: gql`
          scalar AuthenticatedScalar @authenticated

          # This needs to exist in at least one other subgraph from where it's defined
          # as an @interfaceObject (so arbitrarily adding it here). We don't actually
          # apply @authenticated to this one since we want to see it propagate even
          # when it's not applied in all locations.
          interface AuthenticatedInterfaceObject @key(fields: "id") {
            id: String!
          }
        `,
        name: 'on-scalar',
      };

      const onEnum = {
        typeDefs: gql`
          enum AuthenticatedEnum @authenticated {
            A
            B
          }
        `,
        name: 'on-enum',
      };

      const onRootField = {
        typeDefs: gql`
          type Query {
            authenticatedRootField: Int! @authenticated
          }
        `,
        name: 'on-root-field',
      };

      const onObjectField = {
        typeDefs: gql`
          type Query {
            objectWithField: ObjectWithAuthenticatedField!
          }

          type ObjectWithAuthenticatedField {
            field: Int! @authenticated
          }
        `,
        name: 'on-object-field',
      };

      const onEntityField = {
        typeDefs: gql`
          type Query {
            entityWithField: EntityWithAuthenticatedField!
          }

          type EntityWithAuthenticatedField @key(fields: "id") {
            id: ID!
            field: Int! @authenticated
          }
        `,
        name: 'on-entity-field',
      };

      const result = composeAsFed2Subgraphs([
        onObject,
        onInterface,
        onInterfaceObject,
        onScalar,
        onEnum,
        onRootField,
        onObjectField,
        onEntityField,
      ]);
      assertCompositionSuccess(result);

      const authenticatedElements = [
        "AuthenticatedObject",
        "AuthenticatedInterface",
        "AuthenticatedInterfaceObject",
        "AuthenticatedScalar",
        "AuthenticatedEnum",
        "Query.authenticatedRootField",
        "ObjectWithAuthenticatedField.field",
        "EntityWithAuthenticatedField.field",
      ];

      for (const element of authenticatedElements) {
        expect(
          result.schema
            .elementByCoordinate(element)
            ?.hasAppliedDirective("authenticated")
        ).toBeTruthy();
      }
    });

    it('@authenticated has correct definition in the supergraph', () => {
      const a = {
        typeDefs: gql`
          type Query {
            x: Int @authenticated
          }
        `,
        name: 'a',
      };

      const result = composeAsFed2Subgraphs([a]);
      assertCompositionSuccess(result);
      expect(result.schema.coreFeatures?.getByIdentity(AuthenticatedSpecDefinition.identity)?.url.toString()).toBe(
        "https://specs.apollo.dev/authenticated/v0.1"
      );
      expect(printDirectiveDefinition(result.schema.directive('authenticated')!)).toMatchString(`
        directive @authenticated on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
      `);
    });

    it('applies @authenticated on types as long as it is used once', () => {
      const a1 = {
        typeDefs: gql`
          type Query {
            a: A
          }
          type A @key(fields: "id") @authenticated {
            id: String!
            a1: String
          }
        `,
        name: 'a1',
      };
      const a2 = {
        typeDefs: gql`
          type A @key(fields: "id") {
            id: String!
            a2: String
          }
        `,
        name: 'a2',
      };

      // checking composition in either order (not sure if this is necessary but
      // it's not hurting anything)
      const result1 = composeAsFed2Subgraphs([a1, a2]);
      const result2 = composeAsFed2Subgraphs([a2, a1]);
      assertCompositionSuccess(result1);
      assertCompositionSuccess(result2);

      expect(result1.schema.type('A')?.hasAppliedDirective('authenticated')).toBeTruthy();
      expect(result2.schema.type('A')?.hasAppliedDirective('authenticated')).toBeTruthy();
    });

    it('validation error on incompatible directive definition', () => {
      const invalidDefinition = {
        typeDefs: gql`
          directive @authenticated on ENUM_VALUE

          type Query {
            a: Int
          }

          enum E {
            A @authenticated
          }
        `,
        name: 'invalidDefinition',
      };
      const result = composeAsFed2Subgraphs([invalidDefinition]);
      expect(errors(result)[0]).toEqual([
        "DIRECTIVE_DEFINITION_INVALID",
        "[invalidDefinition] Invalid definition for directive \"@authenticated\": \"@authenticated\" should have locations FIELD_DEFINITION, OBJECT, INTERFACE, SCALAR, ENUM, but found (non-subset) ENUM_VALUE",
      ]);
    });

    it('validation error on invalid application', () => {
      const invalidApplication = {
        typeDefs: gql`
          type Query {
            a: Int
          }

          enum E {
            A @authenticated
          }
        `,
        name: 'invalidApplication',
      };
      const result = composeAsFed2Subgraphs([invalidApplication]);
      expect(errors(result)[0]).toEqual([
        "INVALID_GRAPHQL",
        "[invalidApplication] Directive \"@authenticated\" may not be used on ENUM_VALUE.",
      ]);
    });
  });

  describe('@requiresScopes', () => {
    it('comprehensive locations', () => {
      const onObject = {
        typeDefs: gql`
          type Query {
            object: ScopedObject!
          }

          type ScopedObject @requiresScopes(scopes: ["object"]) {
            field: Int!
          }
        `,
        name: 'on-object',
      };

      const onInterface = {
        typeDefs: gql`
          type Query {
            interface: ScopedInterface!
          }

          interface ScopedInterface @requiresScopes(scopes: ["interface"]) {
            field: Int!
          }
        `,
        name: 'on-interface',
      };

      const onInterfaceObject = {
        typeDefs: gql`
          type ScopedInterfaceObject
            @interfaceObject
            @key(fields: "id")
            @requiresScopes(scopes: ["interfaceObject"])
          {
            id: String!
          }
        `,
        name: 'on-interface-object',
      }

      const onScalar = {
        typeDefs: gql`
          scalar ScopedScalar @requiresScopes(scopes: ["scalar"])

          # This needs to exist in at least one other subgraph from where it's defined
          # as an @interfaceObject (so arbitrarily adding it here). We don't actually
          # apply @requiresScopes to this one since we want to see it propagate even
          # when it's not applied in all locations.
          interface ScopedInterfaceObject @key(fields: "id") {
            id: String!
          }
        `,
        name: 'on-scalar',
      };

      const onEnum = {
        typeDefs: gql`
          enum ScopedEnum @requiresScopes(scopes: ["enum"]) {
            A
            B
          }
        `,
        name: 'on-enum',
      };

      const onRootField = {
        typeDefs: gql`
          type Query {
            scopedRootField: Int! @requiresScopes(scopes: ["rootField"])
          }
        `,
        name: 'on-root-field',
      };

      const onObjectField = {
        typeDefs: gql`
          type Query {
            objectWithField: ObjectWithScopedField!
          }

          type ObjectWithScopedField {
            field: Int! @requiresScopes(scopes: ["objectField"])
          }
        `,
        name: 'on-object-field',
      };

      const onEntityField = {
        typeDefs: gql`
          type Query {
            entityWithField: EntityWithScopedField!
          }

          type EntityWithScopedField @key(fields: "id") {
            id: ID!
            field: Int! @requiresScopes(scopes: ["entityField"])
          }
        `,
        name: 'on-entity-field',
      };

      const result = composeAsFed2Subgraphs([
        onObject,
        onInterface,
        onInterfaceObject,
        onScalar,
        onEnum,
        onRootField,
        onObjectField,
        onEntityField,
      ]);
      assertCompositionSuccess(result);

      const scopedElements = [
        "ScopedObject",
        "ScopedInterface",
        "ScopedInterfaceObject",
        "ScopedScalar",
        "ScopedEnum",
        "Query.scopedRootField",
        "ObjectWithScopedField.field",
        "EntityWithScopedField.field",
      ];

      for (const element of scopedElements) {
        expect(
          result.schema
            .elementByCoordinate(element)
            ?.hasAppliedDirective("requiresScopes")
        ).toBeTruthy();
      }
    });

    it('applies @requiresScopes on types as long as it is used once', () => {
      const a1 = {
        typeDefs: gql`
          type Query {
            a: A
          }
          type A @key(fields: "id") @requiresScopes(scopes: ["a"]) {
            id: String!
            a1: String
          }
        `,
        name: 'a1',
      };
      const a2 = {
        typeDefs: gql`
          type A @key(fields: "id") {
            id: String!
            a2: String
          }
        `,
        name: 'a2',
      };

      // checking composition in either order (not sure if this is necessary but
      // it's not hurting anything)
      const result1 = composeAsFed2Subgraphs([a1, a2]);
      const result2 = composeAsFed2Subgraphs([a2, a1]);
      assertCompositionSuccess(result1);
      assertCompositionSuccess(result2);

      expect(result1.schema.type('A')?.hasAppliedDirective('requiresScopes')).toBeTruthy();
      expect(result2.schema.type('A')?.hasAppliedDirective('requiresScopes')).toBeTruthy();
    });

    it('merges @requiresScopes lists (simple union)', () => {
      const a1 = {
        typeDefs: gql`
          type Query {
            a: A
          }

          type A @requiresScopes(scopes: ["a"]) @key(fields: "id") {
            id: String!
            a1: String
          }
        `,
        name: 'a1',
      };
      const a2 = {
        typeDefs: gql`
          type A @requiresScopes(scopes: ["b"]) @key(fields: "id") {
            id: String!
            a2: String
          }
        `,
        name: 'a2',
      };

      const result = composeAsFed2Subgraphs([a1, a2]);
      assertCompositionSuccess(result);
      expect(
        result.schema.type('A')
          ?.appliedDirectivesOf('requiresScopes')
          ?.[0]?.arguments()?.scopes).toStrictEqual(['a', 'b']
      );
    });

    it('merges @requiresScopes lists (deduplicates intersecting scopes)', () => {
      const a1 = {
        typeDefs: gql`
          type Query {
            a: A
          }

          type A @requiresScopes(scopes: ["a", "b"]) @key(fields: "id") {
            id: String!
            a1: String
          }
        `,
        name: 'a1',
      };
      const a2 = {
        typeDefs: gql`
          type A @requiresScopes(scopes: ["b", "c"]) @key(fields: "id") {
            id: String!
            a2: String
          }
        `,
        name: 'a2',
      };

      const result = composeAsFed2Subgraphs([a1, a2]);
      assertCompositionSuccess(result);
      expect(
        result.schema.type('A')
          ?.appliedDirectivesOf('requiresScopes')
          ?.[0]?.arguments()?.scopes).toStrictEqual(['a', 'b', 'c']
      );
    });

    it('@requiresScopes has correct definition in the supergraph', () => {
      const a = {
        typeDefs: gql`
          type Query {
            x: Int @requiresScopes(scopes: ["a", "b"])
          }
        `,
        name: 'a',
      };

      const result = composeAsFed2Subgraphs([a]);
      assertCompositionSuccess(result);
      expect(result.schema.coreFeatures?.getByIdentity(RequiresScopesSpecDefinition.identity)?.url.toString()).toBe(
        "https://specs.apollo.dev/requiresScopes/v0.1"
      );
      expect(printDirectiveDefinition(result.schema.directive('requiresScopes')!)).toMatchString(`
        directive @requiresScopes(scopes: [requiresScopes__Scope!]!) on FIELD_DEFINITION | OBJECT | INTERFACE | SCALAR | ENUM
      `);
    });

    it('composes with existing `Scope` scalar definitions in subgraphs', () => {
      const a = {
        typeDefs: gql`
          scalar Scope
          type Query {
            x: Int @requiresScopes(scopes: ["a", "b"])
          }
        `,
        name: 'a',
      };

      const b = {
        typeDefs: gql`
          scalar Scope @specifiedBy(url: "not-the-apollo-spec")
          type Query {
            y: Int @requiresScopes(scopes: ["a", "b"])
          }
        `,
        name: 'b',
      };

      const result = composeAsFed2Subgraphs([a, b]);
      assertCompositionSuccess(result);
    });

    describe('validation errors', () => {
      it('on incompatible directive location', () => {
        const invalidDefinition = {
          typeDefs: gql`
            scalar federation__Scope
            directive @requiresScopes(scopes: [federation__Scope!]!) on ENUM_VALUE

            type Query {
              a: Int
            }

            enum E {
              A @requiresScopes(scopes: [])
            }
          `,
          name: 'invalidDefinition',
        };
        const result = composeAsFed2Subgraphs([invalidDefinition]);
        expect(errors(result)[0]).toEqual([
          "DIRECTIVE_DEFINITION_INVALID",
          "[invalidDefinition] Invalid definition for directive \"@requiresScopes\": \"@requiresScopes\" should have locations FIELD_DEFINITION, OBJECT, INTERFACE, SCALAR, ENUM, but found (non-subset) ENUM_VALUE",
        ]);
      });

      it('on incompatible args', () => {
        const invalidDefinition = {
          typeDefs: gql`
            scalar federation__Scope
            directive @requiresScopes(scopes: [federation__Scope]!) on FIELD_DEFINITION

            type Query {
              a: Int
            }

            enum E {
              A @requiresScopes(scopes: [])
            }
          `,
          name: 'invalidDefinition',
        };
        const result = composeAsFed2Subgraphs([invalidDefinition]);
        expect(errors(result)[0]).toEqual([
          "DIRECTIVE_DEFINITION_INVALID",
          "[invalidDefinition] Invalid definition for directive \"@requiresScopes\": argument \"scopes\" should have type \"[federation__Scope!]!\" but found type \"[federation__Scope]!\"",
        ]);
      });

      it('on invalid application', () => {
        const invalidApplication = {
          typeDefs: gql`
            type Query {
              a: Int
            }

            enum E {
              A @requiresScopes(scopes: [])
            }
          `,
          name: 'invalidApplication',
        };
        const result = composeAsFed2Subgraphs([invalidApplication]);
        expect(errors(result)[0]).toEqual([
          "INVALID_GRAPHQL",
          "[invalidApplication] Directive \"@requiresScopes\" may not be used on ENUM_VALUE.",
        ]);
      });
    });
  });

  it('existing @authenticated directive with fed 1', () => {
    const subgraphA = {
      typeDefs: gql`
        directive @authenticated(scope: [String!]) repeatable on FIELD_DEFINITION

        extend type Foo @key(fields: "id") {
          id: ID!
          protected: String @authenticated(scope: ["foo"])
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          foo: Foo
        }

        type Foo @key(fields: "id") {
          id: ID!
          name: String!
        }
        `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([]);
    const { schema } = result;
    expect(schema).toBeDefined();
    assert(schema, 'schema does not exist');
    const authenticatedDirectiveExists = schema.directives().find(d => d.name === 'authenticated');
    expect(authenticatedDirectiveExists).toBeUndefined();
  });
});
