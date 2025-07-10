import { composeServices } from "../compose";
import { printSchema } from "@apollo/federation-internals";
import { parse } from "graphql/index";

describe("cacheTag spec and join__directive", () => {
  it("composes", () => {
    const subgraphs = [
      {
        name: "products",
        typeDefs: parse(`
                    extend schema
                    @link(
                        url: "https://specs.apollo.dev/federation/v2.12"
                        import: ["@key" "@cacheTag"]
                    )

                    type Query {
                        resources: [Resource!]! @cacheTag(format: "resources")
                    }

                    type Resource @key(fields: "id") @cacheTag(format: "resource-{$key.id}") {
                        id: ID!
                        name: String!
                    }
                `),
      },
    ];

    const result = composeServices(subgraphs);
    expect(result.errors ?? []).toEqual([]);
    const printed = printSchema(result.schema!);
    expect(printed).toMatchInlineSnapshot(`
      "schema
        @link(url: \\"https://specs.apollo.dev/link/v1.0\\")
        @link(url: \\"https://specs.apollo.dev/join/v0.5\\", for: EXECUTION)
        @link(url: \\"https://specs.apollo.dev/cacheTag/v0.1\\", for: EXECUTION)
      {
        query: Query
      }

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean, overrideLabel: String, contextArguments: [join__ContextArgument!]) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__directive(graphs: [join__Graph!], name: String!, args: join__DirectiveArguments) repeatable on SCHEMA | OBJECT | INTERFACE | FIELD_DEFINITION

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

      scalar link__Import

      enum join__Graph {
        PRODUCTS @join__graph(name: \\"products\\", url: \\"\\")
      }

      scalar join__FieldSet

      scalar join__DirectiveArguments

      scalar join__FieldValue

      input join__ContextArgument {
        name: String!
        type: String!
        context: String!
        selection: join__FieldValue!
      }

      type Query
        @join__type(graph: PRODUCTS)
      {
        resources: [Resource!]! @join__directive(graphs: [PRODUCTS], name: \\"federation__cacheTag\\", args: {format: \\"resources\\"})
      }

      type Resource
        @join__type(graph: PRODUCTS, key: \\"id\\")
        @join__directive(graphs: [PRODUCTS], name: \\"federation__cacheTag\\", args: {format: \\"resource-{$key.id}\\"})
      {
        id: ID!
        name: String!
      }"
    `);

    if (result.schema) {
      expect(printSchema(result.schema.toAPISchema())).toMatchInlineSnapshot(`
                      "type Query {
                        resources: [Resource!]!
                      }

                      type Resource {
                        id: ID!
                        name: String!
                      }"
                  `);
    }
  });

  it("composes with 2 subgraphs", () => {
    const subgraphs = [
      {
        name: "products",
        typeDefs: parse(`
                    extend schema
                    @link(
                        url: "https://specs.apollo.dev/federation/v2.12"
                        import: ["@key" "@cacheTag"]
                    )

                    type Query {
                        resources: [Resource!]! @cacheTag(format: "resources")
                    }

                    type Resource @key(fields: "id") @cacheTag(format: "resource-{$key.id}") {
                        id: ID!
                        name: String!
                    }
                `),
      },
      {
        name: "reviews",
        typeDefs: parse(`
                    extend schema
                    @link(
                        url: "https://specs.apollo.dev/federation/v2.12"
                        import: ["@key" "@cacheTag"]
                    )

                    type Resource @key(fields: "id") @cacheTag(format: "resource-{$key.id}") {
                        id: ID!
                        reviews: [String!]!
                    }
                `),
      },
    ];

    const result = composeServices(subgraphs);
    expect(result.errors ?? []).toEqual([]);
    const printed = printSchema(result.schema!);
    expect(printed).toMatchInlineSnapshot(`
      "schema
        @link(url: \\"https://specs.apollo.dev/link/v1.0\\")
        @link(url: \\"https://specs.apollo.dev/join/v0.5\\", for: EXECUTION)
        @link(url: \\"https://specs.apollo.dev/cacheTag/v0.1\\", for: EXECUTION)
      {
        query: Query
      }

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean, overrideLabel: String, contextArguments: [join__ContextArgument!]) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__directive(graphs: [join__Graph!], name: String!, args: join__DirectiveArguments) repeatable on SCHEMA | OBJECT | INTERFACE | FIELD_DEFINITION

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

      scalar link__Import

      enum join__Graph {
        PRODUCTS @join__graph(name: \\"products\\", url: \\"\\")
        REVIEWS @join__graph(name: \\"reviews\\", url: \\"\\")
      }

      scalar join__FieldSet

      scalar join__DirectiveArguments

      scalar join__FieldValue

      input join__ContextArgument {
        name: String!
        type: String!
        context: String!
        selection: join__FieldValue!
      }

      type Query
        @join__type(graph: PRODUCTS)
        @join__type(graph: REVIEWS)
      {
        resources: [Resource!]! @join__field(graph: PRODUCTS) @join__directive(graphs: [PRODUCTS], name: \\"federation__cacheTag\\", args: {format: \\"resources\\"})
      }

      type Resource
        @join__type(graph: PRODUCTS, key: \\"id\\")
        @join__type(graph: REVIEWS, key: \\"id\\")
        @join__directive(graphs: [PRODUCTS, REVIEWS], name: \\"federation__cacheTag\\", args: {format: \\"resource-{$key.id}\\"})
      {
        id: ID!
        name: String! @join__field(graph: PRODUCTS)
        reviews: [String!]! @join__field(graph: REVIEWS)
      }"
    `);

    if (result.schema) {
      expect(printSchema(result.schema.toAPISchema())).toMatchInlineSnapshot(`
                      "type Query {
                        resources: [Resource!]!
                      }

                      type Resource {
                        id: ID!
                        name: String!
                        reviews: [String!]!
                      }"
                  `);
    }
  });

  it("may be renamed", () => {
    const subgraphs = [
      {
        name: "products",
        typeDefs: parse(`
                    extend schema
                    @link(
                        url: "https://specs.apollo.dev/federation/v2.12"
                        import: ["@key" {name: "@cacheTag" as: "@myCacheTag"}]
                    )

                    type Query {
                        resources: [Resource!]! @myCacheTag(format: "resources")
                    }

                    type Resource @key(fields: "id") @myCacheTag(format: "resource-{$key.id}") {
                        id: ID!
                        name: String!
                    }
                `),
      },
    ];

    const result = composeServices(subgraphs);
    expect(result.errors ?? []).toEqual([]);
    const printed = printSchema(result.schema!);
    expect(printed).toMatchInlineSnapshot(`
      "schema
        @link(url: \\"https://specs.apollo.dev/link/v1.0\\")
        @link(url: \\"https://specs.apollo.dev/join/v0.5\\", for: EXECUTION)
        @link(url: \\"https://specs.apollo.dev/cacheTag/v0.1\\", for: EXECUTION)
      {
        query: Query
      }

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean, overrideLabel: String, contextArguments: [join__ContextArgument!]) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

      directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

      directive @join__directive(graphs: [join__Graph!], name: String!, args: join__DirectiveArguments) repeatable on SCHEMA | OBJECT | INTERFACE | FIELD_DEFINITION

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

      scalar link__Import

      enum join__Graph {
        PRODUCTS @join__graph(name: \\"products\\", url: \\"\\")
      }

      scalar join__FieldSet

      scalar join__DirectiveArguments

      scalar join__FieldValue

      input join__ContextArgument {
        name: String!
        type: String!
        context: String!
        selection: join__FieldValue!
      }

      type Query
        @join__type(graph: PRODUCTS)
      {
        resources: [Resource!]! @join__directive(graphs: [PRODUCTS], name: \\"federation__cacheTag\\", args: {format: \\"resources\\"})
      }

      type Resource
        @join__type(graph: PRODUCTS, key: \\"id\\")
        @join__directive(graphs: [PRODUCTS], name: \\"federation__cacheTag\\", args: {format: \\"resource-{$key.id}\\"})
      {
        id: ID!
        name: String!
      }"
    `);

    if (result.schema) {
      expect(printSchema(result.schema.toAPISchema())).toMatchInlineSnapshot(`
                      "type Query {
                        resources: [Resource!]!
                      }

                      type Resource {
                        id: ID!
                        name: String!
                      }"
                  `);
    }
  });
});
