import { printType } from '@apollo/federation-internals';
import gql from "graphql-tag";
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
            url: "https://specs.apollo.dev/federation/v2.5"
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
    expect(result.schema).toBeDefined();
    const queryType = result.schema?.type('Query');
    expect(queryType ? printType(queryType) : '').toMatchInlineSnapshot(`
    "type Query
      @join__type(graph: SUBGRAPHA)
      @join__type(graph: SUBGRAPHB)
    {
      user(id: ID!): User @join__field(graph: SUBGRAPHA, isFinder: true)
      getInt: Int @join__field(graph: SUBGRAPHB)
    }"
    `);
  });

  it('lack of finder for a key is a problem when there is at least one finder usage', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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
      ['FINDER_USAGE_ERROR', `[subgraphA] Each key for an entity must have a corresponding finder if @finder is used in subgraph. Missing finder for key 'email: String!' of entity 'User'`]
    ]);
  });

  it('lack of finder for a key is a problem when there is at least one finder usage, for interface', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!): User @finder
        }

        interface I @key (fields: "id") {
          id: ID!
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
          name: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', `[subgraphA] Each key for an entity must have a corresponding finder if @finder is used in subgraph. Missing finder for key 'id: ID!' of entity 'I'`]
    ]);
  });

  it('multiple finders for the same key', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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
      ['FINDER_USAGE_ERROR', `[subgraphA] Fields marked with @finder must have unique argument names but Query.userById has the same argument name as Query.user`]
    ]);
  });

  it('input type name does not match entity field name', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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
      ['FINDER_USAGE_ERROR', `[subgraphA] Each key for an entity must have a corresponding finder if @finder is used in subgraph. Missing finder for key 'id: ID!' of entity 'User'`],
      ['FINDER_USAGE_ERROR', `[subgraphA] The arguments for field labeled with finder 'user(theID: ID!): User' do not match a key in the entity`],
    ]);
  });

  it('input type does not match entity field type', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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
      ['FINDER_USAGE_ERROR', `[subgraphA] The types of the named arguments of the finder 'user(id: String!): User' do not match the types of the corresponding fields of the key 'id: ID!' for entity 'User'`],
    ]);
  });

  it('finder with zero arguments', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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
      ['FINDER_USAGE_ERROR', '[subgraphA] Field marked with @finder must take exactly one argument which must match a key on the resulting entity'],
    ]);
  });

  it('finder on composite key', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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
      ['FINDER_USAGE_ERROR', '[subgraphA] Field marked with @finder must take exactly one argument which must match a key on the resulting entity'],
    ]);
  });

  it('composite keys do not error when they do not have a finder', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
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

  it('finder returns a non-nullable type', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
            import: ["@key", "@finder"]
          )

        type Query {
          user(id: ID!): User! @finder
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', `[subgraphA] Fields marked with @finder must return a nullable type but found 'User!'`],
    ]);
  });

  it('finder not on root query field', () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
            import: ["@key", "@finder"]
          )

        type Query {
          allQueries: AllQueries!
        }

        type AllQueries {
          user(id: ID!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          email: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([
      ['FINDER_USAGE_ERROR', `[subgraphA] Field marked with @finder must be on the Query type but AllQueries.user is on AllQueries`],
    ]);
  });

  it("finder on interface", () => {
    const subgraphA = {
      name: "subgraphA",
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.5"
            import: ["@key", "@finder"]
          )

        type Query {
          userInterface(id: ID!): UserInterface @finder
          user(id: ID!): UserConcrete @finder
        }

        interface UserInterface @key(fields: "id") {
          id: ID!
        }

        type UserConcrete implements UserInterface @key(fields: "id") {
          id: ID!
          name: String!
        }
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeUndefined();
    expect(result.schema).toBeDefined();
    const queryType = result.schema?.type("Query");
    expect(queryType ? printType(queryType) : "").toMatchInlineSnapshot(`
      "type Query
        @join__type(graph: SUBGRAPHA)
        @join__type(graph: SUBGRAPHB)
      {
        userInterface(id: ID!): UserInterface @join__field(graph: SUBGRAPHA, isFinder: true)
        user(id: ID!): UserConcrete @join__field(graph: SUBGRAPHA, isFinder: true)
        getInt: Int @join__field(graph: SUBGRAPHB)
      }"
    `);
  });
});
