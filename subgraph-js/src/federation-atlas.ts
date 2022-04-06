import { Atlas, Schema, gql, LinkUrl } from "@apollo/core-schema";

export const SUBGRAPH_BASE = Schema.basic(
  gql `${'builtin:subgraph-base'}
    @link(url: "https://specs.apollo.dev/federation/v1.0", as: "",
          import: "@key @requires @provides @external")
  `)

export const FEDERATION_V2_0 = LinkUrl.from("https://specs.apollo.dev/federation/v2.0")!
export const FEDERATION_V1_0 = LinkUrl.from("https://specs.apollo.dev/federation/v1.0")!
export const FEDERATION_URLS = new Set([FEDERATION_V1_0, FEDERATION_V2_0])

export const ATLAS = Atlas.fromSchemas(
  Schema.basic(gql `${'builtin/tag/v0.1'}
  @id(url: "https://specs.apollo.dev/tag/v0.1")
  directive @tag(name: String!)
    repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION
  `),
  Schema.basic(gql `${'builtin/federation/v1.0.graphql'}
  @id(url: "https://specs.apollo.dev/federation/v1.0")

  """
  federation 1.0 key directive
  """
  directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE
  directive @requires(fields: FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: FieldSet!) on FIELD_DEFINITION
  directive @external on OBJECT | FIELD_DEFINITION

  scalar FieldSet
  `),

  Schema.basic(gql `${'builtin/federation/v2.0.graphql'}
  @id(url: "https://specs.apollo.dev/federation/v2.0")
  @link(url: "https://specs.apollo.dev/tag/v0.1")
  @link(url: "https://specs.apollo.dev/inaccessible/v0.1", import: "@ (as @inaccessible)")
  @link(url: "https://specs.apollo.dev/tag/v0.1", import: "@ (as @tag)")

  """
  federation 2.0 key directive
  """
  directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE
  directive @requires(fields: FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: FieldSet!) on FIELD_DEFINITION
  directive @external on OBJECT | FIELD_DEFINITION
  directive @moving(to: String!) on FIELD_DEFINITION
  directive @shareable on FIELD_DEFINITION | OBJECT
  directive @extends on INTERFACE

  scalar FieldSet
  `),

  Schema.basic(gql `${'builtin/inaccessible/v0.1.graphql'}
  @id(url: "https://specs.apollo.dev/inaccessible/v0.1")

  directive @inaccessible on
    | OBJECT
    | INTERFACE
    | FIELD_DEFINITION
  `),

  Schema.basic(gql `${'builtin/link/v1.0.graphql'}
  @id(url: "https://specs.apollo.dev/link/v1.0")

  directive @link(url: String!, as: String, import: [Import])
    repeatable on SCHEMA

  scalar Import
  `),

  Schema.basic(gql `${'builtin/id/v1.0.graphql'}
  @id(url: "https://specs.apollo.dev/id/v1.0")
  @link(url: "https://specs.apollo.dev/link/v0.3",
        import: "Url Name")

  directive @id(url: Url!, as: Name) on SCHEMA
  `)
)
