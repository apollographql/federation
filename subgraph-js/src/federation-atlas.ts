import { parse, Source } from "graphql";
import { Atlas, IAtlas, Schema } from "@apollo/core-schema";

export const BASE = Schema.from(parse(new Source(`
  extend schema
    @link(url: "https://specs.apollo.dev/link/v0.3")
    @link(url: "https://specs.apollo.dev/id/v1.0")
`, 'base')))

export const SUBGRAPH_BASE = Schema.from(parse(new Source(`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v1.0", as: "",
      import: "@key @requires @provides @external")
`, 'subgraph-base')), BASE)

export const ATLAS: IAtlas = Atlas.fromSchemas(
  Schema.from(parse(new Source(`
  extend schema @id(url: "https://specs.apollo.dev/federation/v1.0")

  directive @key(fields: FieldSet!) repeatable on OBJECT
  directive @requires(fields: FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: FieldSet!) on FIELD_DEFINITION
  directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION

  scalar FieldSet
  `, 'builtin/federation/v1.0.graphql')), BASE),

  Schema.from(parse(new Source(`
  extend schema @id(url: "https://specs.apollo.dev/federation/v2.0")

  directive @key(fields: FieldSet!) repeatable on OBJECT
  directive @requires(fields: FieldSet!) on FIELD_DEFINITION
  directive @provides(fields: FieldSet!) on FIELD_DEFINITION
  directive @external repeatable on OBJECT
  directive @moving(to: String!) on FIELD_DEFINITION
  directive @shareable on FIELD_DEFINITION

  scalar FieldSet
  `, 'builtin/federation/v2.0.graphql')), BASE),

  Schema.from(parse(new Source(`
  extend schema @id(url: "https://specs.apollo.dev/link/v0.3")

  directive @link(url: Url!, as: Name, import: Imports)
    repeatable on SCHEMA

  scalar Url
  scalar Name
  scalar Imports
  `, 'builtin/link/v0.3.graphql')), BASE),

  Schema.from(parse(new Source(`
  extend schema @id(url: "https://specs.apollo.dev/id/v1.0")
    @link(url: "https://specs.apollo.dev/link/v0.3", import: "Url Name")

  directive @id(url: Url!, as: Name) on SCHEMA
  `, 'builtin/id/v1.0.graphql')), BASE)
)
