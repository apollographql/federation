import gql from "graphql-tag";
// import {
//   assert,
//   FEDERATION2_LINK_WITH_FULL_IMPORTS,
//   printSchema,
//   Schema,
// } from "@apollo/federation-internals";
import { composeServices, CompositionResult } from "../compose";

export function errors(r: CompositionResult): [string, string][] {
  return r.errors?.map(e => [e.extensions.code as string, e.message]) ?? [];
}

const subgraphB = {
  name: "subgraphB",
  typeDefs: gql`
    extend schema @link(url: "https://specs.apollo.dev/federation/v2.4")

    type Query {
      getInt: Int
    }
  `,
};

describe("composing graphs with @finder", () => {
  it("finder success case", () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          name: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
    expect(result.supergraphSdl).toMatchInlineSnapshot(`
      "schema
        @link(url: \\"https://specs.apollo.dev/link/v1.0\\")
        @link(url: \\"https://specs.apollo.dev/join/v0.4\\", for: EXECUTION)
      {
        query: Query
      }

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean, isFinder: Boolean = false) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPHA @join__graph(name: \\"subgraphA\\", url: \\"\\")
        SUBGRAPHB @join__graph(name: \\"subgraphB\\", url: \\"\\")
      }

      scalar link__Import

      enum link__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      type Query
        @join__type(graph: SUBGRAPHA)
        @join__type(graph: SUBGRAPHB)
      {
        user(id: ID!): User @join__field(graph: SUBGRAPHA, isFinder: true)
        getInt: Int @join__field(graph: SUBGRAPHB)
      }

      type User
        @join__type(graph: SUBGRAPHA, key: \\"id\\")
      {
        id: ID!
        name: String!
      }"
    `);
  });

  it('lack of finder for a key is a problem when there is at least one finder usage', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!): User @finder
        }

        type User @key(fields: "id") @key(fields: "email") {
          id: ID!
          email: String!
          name: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', 'No finder exists for key "email" on entity "User".']
    ]);
  });

  it('multiple finders for the same key', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!): User @finder
          userById(id: ID!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', 'Multiple finders exist for the same entity key "User.id".']
    ]);
  });

  it('input type name does not match entity field name', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(theID: ID!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', 'Cannot find entity key for this finder(Entity: "User", Key: "theID". Make sure that the parameter name matches the field and that the key is defined.'],
      ['FINDER_USAGE_ERROR', 'No finder exists for key "id" on entity "User".'],
    ]);
  });

  it('input type does not match entity field type', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: String!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', 'Finder input type \"id: String!\" does not match type on field "id: ID!" on entity "User".'],
      ['FINDER_USAGE_ERROR', 'No finder exists for key "id" on entity "User".'],
    ]);
  });

  it('finder with zero arguments', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user: User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', 'Field without any arguments contains a @finder directive.'],
      ['FINDER_USAGE_ERROR', 'No finder exists for key "id" on entity "User".'],
    ]);
  });

  it('finder on composite key', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!, email: String!): User @finder
        }

        type User @key(fields: "id email") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', 'Finders are currently not supported for composite key lookup.'],
    ]);
  });

  it('composite keys do not error when they do not have a finder', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.4"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!): User @finder
        }

        type User @key(fields: "id") @key(fields: "id email") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
  });

  it.todo('finder not on root query field');
  it.todo('finder on interface');
  it.todo('finder on input type');
});
