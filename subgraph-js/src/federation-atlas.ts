import { Atlas, IAtlas, Schema, gql } from "@apollo/core-schema";

export const SUBGRAPH_BASE = Schema.basic(
  gql `${'builtin:subgraph-base'}
    @link(url: "https://specs.apollo.dev/federation/v1.0", as: "",
          import: "@key @requires @provides @external")
    @link(url: "https://specs.apollo.dev/tag/v0.1")
  `)

export const ATLAS: IAtlas = Atlas.fromSchemas(
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
  directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION

  scalar FieldSet
  `),

  Schema.basic(gql `${'builtin/federation/v2.0.graphql'}
  @id(url: "https://specs.apollo.dev/federation/v2.0")

  """
  federation 2.0 key directive
  """
  directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE
  directive @requires(fields: FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: FieldSet!) on FIELD_DEFINITION
  directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION
  directive @moving(to: String!) on FIELD_DEFINITION
  directive @shareable on FIELD_DEFINITION | OBJECT

  scalar FieldSet
  `),

  Schema.basic(gql `${'builtin/link/v0.3.graphql'}
  @id(url: "https://specs.apollo.dev/link/v0.3")

  directive @link(url: Url!, as: Name, import: Imports)
    repeatable on SCHEMA

  scalar Url
  scalar Name
  scalar Imports
  `),

  Schema.basic(gql `${'builtin/id/v1.0.graphql'}
  @id(url: "https://specs.apollo.dev/id/v1.0")
  @link(url: "https://specs.apollo.dev/link/v0.3",
        import: "Url Name")

  directive @id(url: Url!, as: Name) on SCHEMA
  `)
)
