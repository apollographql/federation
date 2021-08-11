import { ApolloGateway } from '../../..';
import { graphqlErrorSerializer } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('core v0.1', () => {
  it("doesn't throw errors / ignores 'for' args", () => {
    const supergraphSdl = `#graphql
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.1")
        @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
        @core(
          feature: "https://specs.apollo.dev/something-unsupported/v0.1"
          for: SECURITY
        ) {
        query: Query
      }

      directive @core(feature: String!) repeatable on SCHEMA

      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
      ) on FIELD_DEFINITION

      directive @join__type(
        graph: join__Graph!
        key: join__FieldSet
      ) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      enum CacheControlScope {
        PRIVATE
        PUBLIC
      }

      scalar join__FieldSet

      enum join__Graph {
        WORLD @join__graph(name: "world", url: "https://world.api.com")
      }

      type Query {
        hello: String! @join__field(graph: WORLD)
      }
    `;

    const gateway = new ApolloGateway({
      supergraphSdl,
    });

    expect(() => gateway.load()).resolves;
  });
});

describe('supported features', () => {
  it("doesn't throw errors when using supported features", async () => {
    const supergraphSdl = `#graphql
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
        @core(feature: "https://specs.apollo.dev/tag/v0.1") {
        query: Query
      }

      directive @core(
        feature: String!
        as: String
        for: core__Purpose
      ) repeatable on SCHEMA

      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
      ) on FIELD_DEFINITION

      directive @join__type(
        graph: join__Graph!
        key: join__FieldSet
      ) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      enum CacheControlScope {
        PRIVATE
        PUBLIC
      }

      enum core__Purpose {
        """
        \`EXECUTION\` features provide metadata necessary to for operation execution.
        """
        EXECUTION

        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY
      }

      scalar join__FieldSet

      enum join__Graph {
        WORLD @join__graph(name: "world", url: "https://world.api.com")
      }

      type Query {
        hello: String! @join__field(graph: WORLD)
      }
    `;

    const gateway = new ApolloGateway({
      supergraphSdl,
    });

    expect(() => gateway.load()).resolves;
  });

  it('throws errors when using unsupported features for EXECUTION', () => {
    const supergraphSdl = `#graphql
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
        @core(
          feature: "https://specs.apollo.dev/unsupported-feature/v0.1"
          for: EXECUTION
        ) {
        query: Query
      }

      directive @core(
        feature: String!
        as: String
        for: core__Purpose
      ) repeatable on SCHEMA

      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
      ) on FIELD_DEFINITION

      directive @join__type(
        graph: join__Graph!
        key: join__FieldSet
      ) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      enum CacheControlScope {
        PRIVATE
        PUBLIC
      }

      enum core__Purpose {
        """
        \`EXECUTION\` features provide metadata necessary to for operation execution.
        """
        EXECUTION

        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY
      }

      scalar join__FieldSet

      enum join__Graph {
        WORLD @join__graph(name: "world", url: "https://world.api.com")
      }

      type Query {
        hello: String! @join__field(graph: WORLD)
      }
    `;

    const gateway = new ApolloGateway({
      supergraphSdl,
    });

    expect(() => gateway.load()).rejects.toMatchInlineSnapshot(`
      Array [
        "feature https://specs.apollo.dev/unsupported-feature/v0.1 is for: EXECUTION but is unsupported",
      ]
    `);
  });

  it('throws errors when using unsupported features for SECURITY', async () => {
    const supergraphSdl = `#graphql
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
        @core(
          feature: "https://specs.apollo.dev/unsupported-feature/v0.1"
          for: SECURITY
        ) {
        query: Query
      }

      directive @core(
        feature: String!
        as: String
        for: core__Purpose
      ) repeatable on SCHEMA

      directive @join__field(
        graph: join__Graph
        requires: join__FieldSet
        provides: join__FieldSet
      ) on FIELD_DEFINITION

      directive @join__type(
        graph: join__Graph!
        key: join__FieldSet
      ) repeatable on OBJECT | INTERFACE

      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @tag(
        name: String!
      ) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      enum CacheControlScope {
        PRIVATE
        PUBLIC
      }

      enum core__Purpose {
        """
        \`EXECUTION\` features provide metadata necessary to for operation execution.
        """
        EXECUTION

        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY
      }

      scalar join__FieldSet

      enum join__Graph {
        WORLD @join__graph(name: "world", url: "https://world.api.com")
      }

      type Query {
        hello: String! @join__field(graph: WORLD)
      }
    `;

    const gateway = new ApolloGateway({
      supergraphSdl,
    });

    expect(() => gateway.load()).rejects.toMatchInlineSnapshot(`
      Array [
        "feature https://specs.apollo.dev/unsupported-feature/v0.1 is for: SECURITY but is unsupported",
      ]
    `);
  });
});
