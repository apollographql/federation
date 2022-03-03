import { fixtures } from 'apollo-federation-integration-testsuite';
import { subgraphCore } from '../schema-helper/buildSchemaFromSDL';
import { print } from 'graphql';
import recall from '@protoplasm/recall';
import { ATLAS } from '../federation-atlas';
import raw from '@apollo/core-schema/dist/snapshot-serializers/raw';

describe('subgraphCore', () => {
  it('compiles a subgraph into a core schema', () => {
    const result = recall(() =>
      subgraphCore([{ typeDefs: fixtures[0].typeDefs }]),
    ).getResult();
    if (result.didThrow()) throw result.error;
    expect([...result.errors()].length).toBe(0);
    expect(print(result.data.document)).toMatchInlineSnapshot(`
      "extend schema @link(url: \\"https://specs.apollo.dev/link/v0.3\\") @link(url: \\"https://specs.apollo.dev/federation/v2.0\\", import: \\"@key @requires @provides @external @shareable @tag @extends\\") @link(url: \\"https://specs.apollo.dev/id/v1.0\\")

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      enum CacheControlScope {
        PUBLIC
        PRIVATE
      }

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      scalar JSON @specifiedBy(url: \\"https://json-spec.dev\\")

      schema {
        query: RootQuery
        mutation: Mutation
      }

      type RootQuery {
        user(id: ID!): User
        me: User @cacheControl(maxAge: 1000, scope: PRIVATE)
      }

      type PasswordAccount @key(fields: \\"email\\") {
        email: String!
      }

      type SMSAccount @key(fields: \\"number\\") {
        number: String
      }

      union AccountType @tag(name: \\"from-accounts\\") = PasswordAccount | SMSAccount

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type User @key(fields: \\"id\\") @key(fields: \\"username name { first last }\\") @tag(name: \\"from-accounts\\") {
        id: ID! @tag(name: \\"accounts\\")
        name: Name @cacheControl(inheritMaxAge: true)
        username: String @shareable
        birthDate(locale: String): String @tag(name: \\"admin\\") @tag(name: \\"dev\\")
        account: AccountType
        metadata: [UserMetadata]
        ssn: String
      }

      type Name {
        first: String
        last: String
      }

      type Mutation {
        login(username: String!, password: String!, userId: String @deprecated(reason: \\"Use username instead\\")): User
      }

      type Library @key(fields: \\"id\\") {
        id: ID!
        name: String @external
        userAccount(id: ID! = \\"1\\"): User @requires(fields: \\"name\\")
      }

      directive @link(url: link__Url!, as: link__Name, import: link__Imports) repeatable on SCHEMA

      directive @key(fields: federation__FieldSet!) repeatable on OBJECT

      directive @shareable on FIELD_DEFINITION

      directive @external repeatable on OBJECT

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      scalar link__Url

      scalar link__Name

      scalar link__Imports

      scalar federation__FieldSet"
    `);
  });

  it('has an atlas', () => {
    expect([...ATLAS]).toMatchInlineSnapshot(`
      Array [
        <https://specs.apollo.dev/federation/v1.0>[builtin/federation/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/federation/v1.0"),
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@provides>[builtin/federation/v1.0.graphql] 👉directive @provides(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
        <https://specs.apollo.dev/federation/v2.0>[builtin/federation/v2.0.graphql] 👉@id(url: "https://specs.apollo.dev/federation/v2.0"),
        <https://specs.apollo.dev/federation/v2.0#@key>[builtin/federation/v2.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT,
        <https://specs.apollo.dev/federation/v2.0#@requires>[builtin/federation/v2.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@provides>[builtin/federation/v2.0.graphql] 👉directive @provides(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@external>[builtin/federation/v2.0.graphql] 👉directive @external repeatable on OBJECT,
        <https://specs.apollo.dev/federation/v2.0#@moving>[builtin/federation/v2.0.graphql] 👉directive @moving(to: String!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@shareable>[builtin/federation/v2.0.graphql] 👉directive @shareable on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#FieldSet>[builtin/federation/v2.0.graphql] 👉scalar FieldSet,
        <https://specs.apollo.dev/link/v0.3>[builtin/link/v0.3.graphql] 👉@id(url: "https://specs.apollo.dev/link/v0.3"),
        <https://specs.apollo.dev/link/v0.3#@>[builtin/link/v0.3.graphql] 👉directive @link(url: Url!, as: Name, import: Imports),
        <https://specs.apollo.dev/link/v0.3#Url>[builtin/link/v0.3.graphql] 👉scalar Url,
        <https://specs.apollo.dev/link/v0.3#Name>[builtin/link/v0.3.graphql] 👉scalar Name,
        <https://specs.apollo.dev/link/v0.3#Imports>[builtin/link/v0.3.graphql] 👉scalar Imports,
        <https://specs.apollo.dev/id/v1.0>[builtin/id/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/id/v1.0"),
        <https://specs.apollo.dev/id/v1.0#@>[builtin/id/v1.0.graphql] 👉directive @id(url: Url!, as: Name) on SCHEMA,
      ]
    `);
  });

  it('links against federation 1.0 by default', () => {
    const doc = fixtures[0].typeDefs;
    const result = recall(() =>
      subgraphCore([
        {
          typeDefs: {
            ...doc,
            definitions: doc.definitions.slice(0, doc.definitions.length - 1),
          },
        },
      ]),
    ).getResult();
    if (result.didThrow()) throw result.error;
    expect([...result.errors()].length).toBe(0);
    const schema = result.data;
    expect([...schema]).toMatchInlineSnapshot(`
      Array [
        <>[+] extend schema @link(url: "https://specs.apollo.dev/link/v0.3") @link(url: "https://specs.apollo.dev/federation/v1.0", import: "@key @requires @provides @external") @link(url: "https://specs.apollo.dev/id/v1.0"),
        <#@stream>[GraphQL request] 👉directive @stream on FIELD,
        <#@transform>[GraphQL request] 👉directive @transform(from: String!) on FIELD,
        <#@tag>[GraphQL request] 👉directive @tag(name: String!) repeatable on,
        <#CacheControlScope>[GraphQL request] 👉enum CacheControlScope {,
        <#@cacheControl>[GraphQL request] 👉directive @cacheControl(,
        <#JSON>[GraphQL request] 👉scalar JSON @specifiedBy(url: "https://json-spec.dev"),
        <>[GraphQL request] 👉schema {,
        <#RootQuery>[GraphQL request] 👉type RootQuery {,
        <#PasswordAccount>[GraphQL request] 👉type PasswordAccount @key(fields: "email") {,
        <#SMSAccount>[GraphQL request] 👉type SMSAccount @key(fields: "number") {,
        <#AccountType>[GraphQL request] 👉union AccountType @tag(name: "from-accounts") = PasswordAccount | SMSAccount,
        <#UserMetadata>[GraphQL request] 👉type UserMetadata {,
        <#User>[GraphQL request] 👉type User @key(fields: "id") @key(fields: "username name { first last }") @tag(name: "from-accounts") {,
        <#Name>[GraphQL request] 👉type Name {,
        <#Mutation>[GraphQL request] 👉type Mutation {,
        <#Library>[GraphQL request] 👉type Library @key(fields: "id") {,
        <https://specs.apollo.dev/link/v0.3#@>[builtin/link/v0.3.graphql] 👉directive @link(url: Url!, as: Name, import: Imports),
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/link/v0.3#Url>[builtin/link/v0.3.graphql] 👉scalar Url,
        <https://specs.apollo.dev/link/v0.3#Name>[builtin/link/v0.3.graphql] 👉scalar Name,
        <https://specs.apollo.dev/link/v0.3#Imports>[builtin/link/v0.3.graphql] 👉scalar Imports,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
      ]
    `);

    expect(raw(print(result.data.document))).toMatchInlineSnapshot(`
      extend schema @link(url: "https://specs.apollo.dev/link/v0.3") @link(url: "https://specs.apollo.dev/federation/v1.0", import: "@key @requires @provides @external") @link(url: "https://specs.apollo.dev/id/v1.0")

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      enum CacheControlScope {
        PUBLIC
        PRIVATE
      }

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      scalar JSON @specifiedBy(url: "https://json-spec.dev")

      schema {
        query: RootQuery
        mutation: Mutation
      }

      type RootQuery {
        user(id: ID!): User
        me: User @cacheControl(maxAge: 1000, scope: PRIVATE)
      }

      type PasswordAccount @key(fields: "email") {
        email: String!
      }

      type SMSAccount @key(fields: "number") {
        number: String
      }

      union AccountType @tag(name: "from-accounts") = PasswordAccount | SMSAccount

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type User @key(fields: "id") @key(fields: "username name { first last }") @tag(name: "from-accounts") {
        id: ID! @tag(name: "accounts")
        name: Name @cacheControl(inheritMaxAge: true)
        username: String @shareable
        birthDate(locale: String): String @tag(name: "admin") @tag(name: "dev")
        account: AccountType
        metadata: [UserMetadata]
        ssn: String
      }

      type Name {
        first: String
        last: String
      }

      type Mutation {
        login(username: String!, password: String!, userId: String @deprecated(reason: "Use username instead")): User
      }

      type Library @key(fields: "id") {
        id: ID!
        name: String @external
        userAccount(id: ID! = "1"): User @requires(fields: "name")
      }

      directive @link(url: link__Url!, as: link__Name, import: link__Imports) repeatable on SCHEMA

      directive @key(fields: federation__FieldSet!) repeatable on OBJECT

      directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      scalar link__Url

      scalar link__Name

      scalar link__Imports

      scalar federation__FieldSet
    `);
  });
});
