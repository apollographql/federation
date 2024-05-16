import {composeServices} from "../compose";
import {printSchema} from "@apollo/federation-internals";
import {parse} from "graphql/index";

describe("connect spec and join__directive", () => {
    it("composes", () => {
        const subgraphs = [
            {
                name: "with-connectors",
                typeDefs: parse(`
                    extend schema
                    @link(
                        url: "https://specs.apollo.dev/federation/v2.7"
                        import: ["@key"]
                    )
                    @link(
                        url: "https://specs.apollo.dev/connect/v0.1"
                        import: ["@connect", "@source"]
                    )
                    @source(name: "v1", http: { baseURL: "http://v1" })

                    type Query {
                        resources: [Resource!]!
                        @connect(source: "v1", http: { GET: "/resources" })
                    }

                    type Resource @key(fields: "id") {
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
        @link(url: \\"https://specs.apollo.dev/join/v0.4\\", for: EXECUTION)
        @join__directive(graphs: [WITH_CONNECTORS], name: \\"link\\", args: {url: \\"https://specs.apollo.dev/connect/v0.1\\", import: [\\"@connect\\", \\"@source\\"]})
        @join__directive(graphs: [WITH_CONNECTORS], name: \\"source\\", args: {name: \\"v1\\", http: {baseURL: \\"http://v1\\"}})
      {
        query: Query
      }

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean, overrideLabel: String) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

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
        WITH_CONNECTORS @join__graph(name: \\"with-connectors\\", url: \\"\\")
      }

      scalar join__FieldSet

      scalar join__DirectiveArguments

      type Query
        @join__type(graph: WITH_CONNECTORS)
      {
        resources: [Resource!]! @join__directive(graphs: [WITH_CONNECTORS], name: \\"connect\\", args: {source: \\"v1\\", http: {GET: \\"/resources\\"}})
      }

      type Resource
        @join__type(graph: WITH_CONNECTORS, key: \\"id\\")
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

    it("composes with renames", () => {
        const subgraphs = [
            {
                name: "with-connectors",
                typeDefs: parse(`
                    extend schema
                    @link(
                        url: "https://specs.apollo.dev/federation/v2.7"
                        import: ["@key"]
                    )
                    @link(
                        url: "https://specs.apollo.dev/connect/v0.1"
                        as: "http"
                        import: [
                            { name: "@connect", as: "@http" }
                            { name: "@source", as: "@api" }
                        ]
                    )
                    @api(name: "v1", http: { baseURL: "http://v1" })

                    type Query {
                        resources: [Resource!]!
                        @http(source: "v1", http: { GET: "/resources" })
                    }

                    type Resource @key(fields: "id") {
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
        @link(url: \\"https://specs.apollo.dev/join/v0.4\\", for: EXECUTION)
        @join__directive(graphs: [WITH_CONNECTORS], name: \\"link\\", args: {url: \\"https://specs.apollo.dev/connect/v0.1\\", as: \\"http\\", import: [{name: \\"@connect\\", as: \\"@http\\"}, {name: \\"@source\\", as: \\"@api\\"}]})
        @join__directive(graphs: [WITH_CONNECTORS], name: \\"api\\", args: {name: \\"v1\\", http: {baseURL: \\"http://v1\\"}})
      {
        query: Query
      }

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean, overrideLabel: String) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

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
        WITH_CONNECTORS @join__graph(name: \\"with-connectors\\", url: \\"\\")
      }

      scalar join__FieldSet

      scalar join__DirectiveArguments

      type Query
        @join__type(graph: WITH_CONNECTORS)
      {
        resources: [Resource!]! @join__directive(graphs: [WITH_CONNECTORS], name: \\"http\\", args: {source: \\"v1\\", http: {GET: \\"/resources\\"}})
      }

      type Resource
        @join__type(graph: WITH_CONNECTORS, key: \\"id\\")
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

    it("requires the http arg for @source", () => {
        const subgraphs = [
            {
                name: "with-connectors",
                typeDefs: parse(`
          extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.7"
            import: ["@key"]
          )
          @link(
            url: "https://specs.apollo.dev/connect/v0.1"
            import: ["@connect", "@source"]
          )
          @source(name: "v1")

          type Query {
            resources: [Resource!]!
            @connect(source: "v1", http: { GET: "/resources" })
          }

          type Resource {
            id: ID!
            name: String!
          }
        `),
            },
        ];

        const result = composeServices(subgraphs);
        expect(result.errors?.length).toBe(1);
        const error = result.errors![0];
        expect(error.message).toEqual('[with-connectors] Directive "@source" argument "http" of type "connect__SourceHTTP!" is required, but it was not provided.');
        expect(error.extensions.code).toEqual("INVALID_GRAPHQL");
    })

    it("requires the http arg for @connect", () => {
        const subgraphs = [
            {
                name: "with-connectors",
                typeDefs: parse(`
          extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.7"
            import: ["@key"]
          )
          @link(
            url: "https://specs.apollo.dev/connect/v0.1"
            import: ["@connect", "@source"]
          )
          @source(name: "v1", http: {baseURL: "http://127.0.0.1"})

          type Query {
            resources: [Resource!]!
            @connect(source: "v1")
          }

          type Resource {
            id: ID!
            name: String!
          }
        `),
            },
        ];

        const result = composeServices(subgraphs);
        expect(result.errors?.length).toBe(1);
        const error = result.errors![0];
        expect(error.message).toEqual('[with-connectors] Directive "@connect" argument "http" of type "connect__ConnectHTTP!" is required, but it was not provided.');
        expect(error.extensions.code).toEqual("INVALID_GRAPHQL");
    })

    it("validates the baseURL argument for sources", () => {
        const subgraphs = [
            {
                name: "with-connectors",
                typeDefs: parse(`
          extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.7"
            import: ["@key"]
          )
          @link(
            url: "https://specs.apollo.dev/connect/v0.1"
            import: ["@connect", "@source"]
          )
          @source(name: "v1", http: {baseURL: "127.0.0.1"})

          type Query {
            resources: [String!]!
            @connect(source: "v1", http: {GET: "/resources"})
          }
        `),
            },
        ];

        const result = composeServices(subgraphs);
        expect(result.errors?.length).toBe(1);
        const error = result.errors![0];
        expect(error.message).toEqual('[with-connectors] baseURL argument for @source \"v1\" was not a valid URL: relative URL without a base');
        expect(error.extensions.code).toEqual("SOURCE_URL_INVALID");
        expect(error.locations).toBeDefined()
    })

    it("includes locations for renamed directives", () => {
        const subgraphs = [
            {
                name: "with-connectors",
                typeDefs: parse(`
          extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.7"
          )
          @link(
            url: "https://specs.apollo.dev/connect/v0.1"
            import: [{name: "@source", as: "@api"}, "@connect"]
          )
          @api(name: "v1", http: {baseURL: "127.0.0.1"})

          type Query {
            resources: [String!]!
            @connect(source: "v1", http: {GET: "/resources"})
          }
        `),
            },
        ];

        const result = composeServices(subgraphs);
        expect(result.errors?.length).toBe(1);
        const error = result.errors![0];
        expect(error.message).toEqual('[with-connectors] baseURL argument for @api \"v1\" was not a valid URL: relative URL without a base');
        expect(error.extensions.code).toEqual("SOURCE_URL_INVALID");
        expect(error.locations).toBeDefined()
    })
});
