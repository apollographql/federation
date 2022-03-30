import { fixtures } from 'apollo-federation-integration-testsuite';
import { subgraphCore } from '../schema-helper/buildSchemaFromSDL';
import { print } from 'graphql';
import { getResult } from '@apollo/core-schema';
import { ATLAS } from '../federation-atlas';
import raw from '@apollo/core-schema/dist/snapshot-serializers/raw';
import Schema from '@apollo/core-schema';

describe('subgraphCore', () => {
  it('compiles a subgraph into a core schema', () => {
    const result = getResult(() =>
      subgraphCore([{ typeDefs: fixtures[0].typeDefs }]),
    );
    expect([...result.errors()]).toEqual([]);
    expect(raw(print(result.unwrap()))).toMatchInlineSnapshot(`
      extend schema @link(url: "https://specs.apollo.dev/link/v0.3") @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@tag", "@extends", "@shareable", "@inaccessible"]) @link(url: "https://specs.apollo.dev/tag/v0.1") @link(url: "https://specs.apollo.dev/id/v1.0")

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      enum CacheControlScope @tag(name: "from-reviews") {
        PUBLIC @tag(name: "from-reviews")
        PRIVATE
      }

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      scalar JSON @tag(name: "from-reviews") @specifiedBy(url: "https://json-spec.dev")

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
        birthDate(locale: String @tag(name: "admin")): String @tag(name: "admin") @tag(name: "dev")
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

      directive @link(url: String!, as: String, import: [link__Import]) repeatable on SCHEMA

      """federation 2.0 key directive"""
      directive @key(fields: federation__FieldSet!) repeatable on OBJECT | INTERFACE

      directive @shareable on FIELD_DEFINITION | OBJECT

      directive @external on OBJECT | FIELD_DEFINITION

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      scalar link__Import

      scalar federation__FieldSet
    `);
  });

  it('has an atlas', () => {
    expect([...ATLAS]).toMatchInlineSnapshot(`
      Array [
        <https://specs.apollo.dev/tag/v0.1>[builtin/tag/v0.1] 👉@id(url: "https://specs.apollo.dev/tag/v0.1"),
        <https://specs.apollo.dev/tag/v0.1#@>[builtin/tag/v0.1] 👉directive @tag(name: String!),
        <https://specs.apollo.dev/federation/v1.0>[builtin/federation/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/federation/v1.0"),
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@provides>[builtin/federation/v1.0.graphql] 👉directive @provides(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
        <https://specs.apollo.dev/federation/v2.0>[builtin/federation/v2.0.graphql] 👉@id(url: "https://specs.apollo.dev/federation/v2.0"),
        <https://specs.apollo.dev/federation/v2.0#@key>[builtin/federation/v2.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v2.0#@requires>[builtin/federation/v2.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@provides>[builtin/federation/v2.0.graphql] 👉directive @provides(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@external>[builtin/federation/v2.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@moving>[builtin/federation/v2.0.graphql] 👉directive @moving(to: String!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@shareable>[builtin/federation/v2.0.graphql] 👉directive @shareable on FIELD_DEFINITION | OBJECT,
        <https://specs.apollo.dev/federation/v2.0#FieldSet>[builtin/federation/v2.0.graphql] 👉scalar FieldSet,
        <https://specs.apollo.dev/link/v0.3>[builtin/link/v0.3.graphql] 👉@id(url: "https://specs.apollo.dev/link/v0.3"),
        <https://specs.apollo.dev/link/v0.3#@>[builtin/link/v0.3.graphql] 👉directive @link(url: String!, as: String, import: [Import]),
        <https://specs.apollo.dev/link/v0.3#Import>[builtin/link/v0.3.graphql] 👉scalar Import,
        <https://specs.apollo.dev/id/v1.0>[builtin/id/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/id/v1.0"),
        <https://specs.apollo.dev/id/v1.0#@>[builtin/id/v1.0.graphql] 👉directive @id(url: Url!, as: Name) on SCHEMA,
      ]
    `);
  });

  it('links against federation 1.0 by default', () => {
    const doc = fixtures[0].typeDefs;
    const result = getResult(() =>
      subgraphCore([
        {
          typeDefs: {
            ...doc,
            // remove the last '@link()', which brings in fed2
            definitions: doc.definitions.slice(0, doc.definitions.length - 1),
          },
        },
      ]),
    );

    // shareable isn't in fed1
    expect([...result.errors()].map((err: any) => raw(err.toString())))
      .toMatchInlineSnapshot(`
      Array [
        [NoDefinition] no definitions found for reference

      GraphQL request:58:20
      57 |   name: Name @cacheControl(inheritMaxAge: true)
      58 |   username: String @shareable # Provided by the 'reviews' subgraph
         |                    ^
      59 |   birthDate(locale: String @tag(name: "admin")): String @tag(name: "admin") @tag(name: "dev"),
      ]
    `);

    const document = result.unwrap();

    expect([...Schema.from(document)]).toMatchInlineSnapshot(`
      Array [
        <>[+] extend schema @link(url: "https://specs.apollo.dev/link/v0.3") @link(url: "https://specs.apollo.dev/federation/v1.0", import: ["@key", "@requires", "@provides", "@external"]) @link(url: "https://specs.apollo.dev/tag/v0.1") @link(url: "https://specs.apollo.dev/id/v1.0"),
        <#@stream>[GraphQL request] 👉directive @stream on FIELD,
        <#@transform>[GraphQL request] 👉directive @transform(from: String!) on FIELD,
        <https://specs.apollo.dev/tag/v0.1#@>[GraphQL request] 👉directive @tag(name: String!) repeatable on,
        <#CacheControlScope>[GraphQL request] 👉enum CacheControlScope @tag(name: "from-reviews") {,
        <#@cacheControl>[GraphQL request] 👉directive @cacheControl(,
        <#JSON>[GraphQL request] 👉scalar JSON @tag(name: "from-reviews") @specifiedBy(url: "https://json-spec.dev"),
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
        <https://specs.apollo.dev/link/v0.3#@>[builtin/link/v0.3.graphql] 👉directive @link(url: String!, as: String, import: [Import]),
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/link/v0.3#Import>[builtin/link/v0.3.graphql] 👉scalar Import,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
      ]
    `);

    expect(raw(print(document))).toMatchInlineSnapshot(`
      extend schema @link(url: "https://specs.apollo.dev/link/v0.3") @link(url: "https://specs.apollo.dev/federation/v1.0", import: ["@key", "@requires", "@provides", "@external"]) @link(url: "https://specs.apollo.dev/tag/v0.1") @link(url: "https://specs.apollo.dev/id/v1.0")

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      enum CacheControlScope @tag(name: "from-reviews") {
        PUBLIC @tag(name: "from-reviews")
        PRIVATE
      }

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      scalar JSON @tag(name: "from-reviews") @specifiedBy(url: "https://json-spec.dev")

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
        birthDate(locale: String @tag(name: "admin")): String @tag(name: "admin") @tag(name: "dev")
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

      directive @link(url: String!, as: String, import: [link__Import]) repeatable on SCHEMA

      """federation 1.0 key directive"""
      directive @key(fields: federation__FieldSet!) repeatable on OBJECT | INTERFACE

      directive @external on OBJECT | FIELD_DEFINITION

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      scalar link__Import

      scalar federation__FieldSet
    `);
  });
});
