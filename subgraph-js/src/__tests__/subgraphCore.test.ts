import { fixtures } from 'apollo-federation-integration-testsuite';
import { subgraphCore } from '../schema-helper/buildSchemaFromSDL';
import { print } from 'graphql';
import { getResult } from '@apollo/core-schema';
import { ATLAS } from '../federation-atlas';
import raw from '@apollo/core-schema/dist/snapshot-serializers/raw';
import Schema, { gql } from '@apollo/core-schema';

describe('subgraphCore', () => {
  it('compiles a subgraph into a core schema', () => {
    const result = getResult(() => subgraphCore(fixtures[0].typeDefs));
    expect([...result.errors()]).toEqual([]);
    expect(raw(print(result.unwrap()))).toMatchInlineSnapshot(`
      extend schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/inaccessible/v0.1") @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@tag", "@extends", "@shareable", "@override"])

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
        description: String @override(from: "books")
      }

      """federation 2.0 key directive"""
      directive @key(fields: federation__FieldSet!, resolvable: Boolean) repeatable on OBJECT | INTERFACE

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      directive @provides(fields: federation__FieldSet!) on FIELD_DEFINITION

      directive @external on OBJECT | FIELD_DEFINITION

      directive @extends on OBJECT | INTERFACE

      directive @shareable on FIELD_DEFINITION | OBJECT

      directive @override(from: String!) on FIELD_DEFINITION

      directive @link(url: String!, as: String, import: [link__Import]) repeatable on SCHEMA

      scalar federation__FieldSet

      directive @inaccessible on OBJECT | INTERFACE | FIELD_DEFINITION

      scalar link__Import
    `);
  });

  it('has an atlas', () => {
    expect([...ATLAS]).toMatchInlineSnapshot(`
      Array [
        <https://specs.apollo.dev/tag/v0.1>[builtin/tag/v0.1] 👉@id(url: "https://specs.apollo.dev/tag/v0.1"),
        <https://specs.apollo.dev/tag/v0.1#@>[builtin/tag/v0.1] 👉directive @tag(name: String!),
        <https://specs.apollo.dev/tag/v0.2>[builtin/tag/v0.2] 👉@id(url: "https://specs.apollo.dev/tag/v0.2"),
        <https://specs.apollo.dev/tag/v0.2#@>[builtin/tag/v0.2] 👉directive @tag(name: String!),
        <https://specs.apollo.dev/federation/v1.0>[builtin/federation/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/federation/v1.0"),
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@provides>[builtin/federation/v1.0.graphql] 👉directive @provides(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@extends>[builtin/federation/v1.0.graphql] 👉directive @extends on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
        GRef <https://specs.apollo.dev/federation/v2.0#@tag> => GRef <https://specs.apollo.dev/tag/v0.2#@> (via [builtin/federation/v2.0.graphql] 👉@link(url: "https://specs.apollo.dev/tag/v0.2", import: [{ name: "@", as: "@tag" }])),
        GRef <https://specs.apollo.dev/federation/v2.0#@inaccessible> => GRef <https://specs.apollo.dev/inaccessible/v0.1#@> (via [builtin/federation/v2.0.graphql] 👉@link(url: "https://specs.apollo.dev/inaccessible/v0.1", import: [{ name: "@", as: "@inaccessible" }])),
        <https://specs.apollo.dev/federation/v2.0>[builtin/federation/v2.0.graphql] 👉@id(url: "https://specs.apollo.dev/federation/v2.0"),
        <https://specs.apollo.dev/federation/v2.0#@key>[builtin/federation/v2.0.graphql] 👉directive @key(fields: FieldSet!, resolvable: Boolean) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v2.0#@requires>[builtin/federation/v2.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@provides>[builtin/federation/v2.0.graphql] 👉directive @provides(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@external>[builtin/federation/v2.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#@shareable>[builtin/federation/v2.0.graphql] 👉directive @shareable on FIELD_DEFINITION | OBJECT,
        <https://specs.apollo.dev/federation/v2.0#@extends>[builtin/federation/v2.0.graphql] 👉directive @extends on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v2.0#@override>[builtin/federation/v2.0.graphql] 👉directive @override(from: String!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v2.0#FieldSet>[builtin/federation/v2.0.graphql] 👉scalar FieldSet,
        <https://specs.apollo.dev/inaccessible/v0.1>[builtin/inaccessible/v0.1.graphql] 👉@id(url: "https://specs.apollo.dev/inaccessible/v0.1"),
        <https://specs.apollo.dev/inaccessible/v0.1#@>[builtin/inaccessible/v0.1.graphql] 👉directive @inaccessible on,
        <https://specs.apollo.dev/link/v1.0>[builtin/link/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/link/v1.0"),
        <https://specs.apollo.dev/link/v1.0#@>[builtin/link/v1.0.graphql] 👉directive @link(url: String!, as: String, import: [Import]),
        <https://specs.apollo.dev/link/v1.0#Import>[builtin/link/v1.0.graphql] 👉scalar Import,
        GRef <https://specs.apollo.dev/id/v1.0#Url> => GRef <https://specs.apollo.dev/link/v1.0#Url> (via [builtin/id/v1.0.graphql] 👉@link(url: "https://specs.apollo.dev/link/v1.0"),
        GRef <https://specs.apollo.dev/id/v1.0#Name> => GRef <https://specs.apollo.dev/link/v1.0#Name> (via [builtin/id/v1.0.graphql] 👉@link(url: "https://specs.apollo.dev/link/v1.0"),
        <https://specs.apollo.dev/id/v1.0>[builtin/id/v1.0.graphql] 👉@id(url: "https://specs.apollo.dev/id/v1.0"),
        <https://specs.apollo.dev/id/v1.0#@>[builtin/id/v1.0.graphql] 👉directive @id(url: Url!, as: Name) on SCHEMA,
      ]
    `);
  });

  it('removes unused links', () => {
    const core = subgraphCore(
      gql`
        extend type User @key(fields: "someField") {
          someField: ID!
        }
      `,
    );
    expect(raw(print(core))).toMatchInlineSnapshot(`
      extend type User @key(fields: "someField") {
        someField: ID!
      }

      directive @link(url: String!, as: String, import: [link__Import]) repeatable on SCHEMA

      scalar link__Import

      """federation 1.0 key directive"""
      directive @key(fields: federation__FieldSet!) repeatable on OBJECT | INTERFACE

      scalar federation__FieldSet

      type User
    `);
  });

  it('links against federation 1.0 by default', () => {
    const doc = fixtures[0].typeDefs;
    const result = getResult(() =>
      subgraphCore({
        ...doc,
        // remove the last '@link()', which brings in fed2
        definitions: doc.definitions.slice(0, doc.definitions.length - 1),
      }),
    );

    // shareable isn't in fed1
    expect([...result.errors()].map((err: any) => raw(err.toString())))
      .toMatchInlineSnapshot(`
      Array [
        [NoDefinition] no definitions found for reference: #@shareable

      GraphQL request:55:20
      54 |   name: Name @cacheControl(inheritMaxAge: true)
      55 |   username: String @shareable # Provided by the 'reviews' subgraph
         |                    ^
      56 |   birthDate(locale: String @tag(name: "admin")): String,
        [NoDefinition] no definitions found for reference: #@override

      GraphQL request:81:24
      80 |   userAccount(id: ID! = "1"): User @requires(fields: "name")
      81 |   description: String  @override(from: "books")
         |                        ^
      82 | },
      ]
    `);

    const document = result.unwrap();

    expect([...Schema.from(document)]).toMatchInlineSnapshot(`
      Array [
        <#@stream>[GraphQL request] 👉directive @stream on FIELD,
        <#@transform>[GraphQL request] 👉directive @transform(from: String!) on FIELD,
        <#@tag>[GraphQL request] 👉directive @tag(,
        <#CacheControlScope>[GraphQL request] 👉enum CacheControlScope @tag(name: "from-reviews") {,
        <#@cacheControl>[GraphQL request] 👉directive @cacheControl(,
        <#JSON>[GraphQL request] 👉scalar JSON,
        <>[GraphQL request] 👉schema {,
        <#RootQuery>[GraphQL request] 👉type RootQuery {,
        <#PasswordAccount>[GraphQL request] 👉type PasswordAccount @key(fields: "email") {,
        <#SMSAccount>[GraphQL request] 👉type SMSAccount @key(fields: "number") {,
        <#AccountType>[GraphQL request] 👉union AccountType @tag(name: "from-accounts") = PasswordAccount | SMSAccount,
        <#UserMetadata>[GraphQL request] 👉type UserMetadata {,
        <#User>[GraphQL request] 👉type User,
        <#Name>[GraphQL request] 👉type Name {,
        <#Mutation>[GraphQL request] 👉type Mutation {,
        <#Library>[GraphQL request] 👉type Library @key(fields: "id") {,
        <https://specs.apollo.dev/link/v1.0#@>[builtin/link/v1.0.graphql] 👉directive @link(url: String!, as: String, import: [Import]),
        <https://specs.apollo.dev/link/v1.0#Import>[builtin/link/v1.0.graphql] 👉scalar Import,
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
      ]
    `);

    expect([...Schema.from(document).refs]).toMatchInlineSnapshot(`
      Array [
        <#@stream>[GraphQL request] 👉directive @stream on FIELD,
        <#@transform>[GraphQL request] 👉directive @transform(from: String!) on FIELD,
        <https://specs.graphql.org/#String>[GraphQL request] directive @transform(from: 👉String!) on FIELD,
        <#@tag>[GraphQL request] 👉directive @tag(,
        <https://specs.graphql.org/#String>[GraphQL request] name: 👉String!,
        <#CacheControlScope>[GraphQL request] 👉enum CacheControlScope @tag(name: "from-reviews") {,
        <#@tag>[GraphQL request] enum CacheControlScope 👉@tag(name: "from-reviews") {,
        <#@tag>[GraphQL request] PUBLIC 👉@tag(name: "from-reviews"),
        <#@cacheControl>[GraphQL request] 👉directive @cacheControl(,
        <https://specs.graphql.org/#Int>[GraphQL request] maxAge: 👉Int,
        <#CacheControlScope>[GraphQL request] scope: 👉CacheControlScope,
        <https://specs.graphql.org/#Boolean>[GraphQL request] inheritMaxAge: 👉Boolean,
        <#JSON>[GraphQL request] 👉scalar JSON,
        <#@tag>[GraphQL request] 👉@tag(name: "from-reviews"),
        <https://specs.graphql.org/#@specifiedBy>[GraphQL request] 👉@specifiedBy(url: "https://json-spec.dev"),
        <>[GraphQL request] 👉schema {,
        <>[GraphQL request] 👉query: RootQuery,
        <#RootQuery>[GraphQL request] query: 👉RootQuery,
        <>[GraphQL request] 👉mutation: Mutation,
        <#Mutation>[GraphQL request] mutation: 👉Mutation,
        <#RootQuery>[GraphQL request] 👉type RootQuery {,
        <https://specs.graphql.org/#ID>[GraphQL request] user(id: 👉ID!): User,
        <#User>[GraphQL request] user(id: ID!): 👉User,
        <#User>[GraphQL request] me: 👉User @cacheControl(maxAge: 1000, scope: PRIVATE),
        <#@cacheControl>[GraphQL request] me: User 👉@cacheControl(maxAge: 1000, scope: PRIVATE),
        <#PasswordAccount>[GraphQL request] 👉type PasswordAccount @key(fields: "email") {,
        <https://specs.apollo.dev/federation/v1.0#@key>[GraphQL request] type PasswordAccount 👉@key(fields: "email") {,
        <https://specs.graphql.org/#String>[GraphQL request] email: 👉String!,
        <#SMSAccount>[GraphQL request] 👉type SMSAccount @key(fields: "number") {,
        <https://specs.apollo.dev/federation/v1.0#@key>[GraphQL request] type SMSAccount 👉@key(fields: "number") {,
        <https://specs.graphql.org/#String>[GraphQL request] number: 👉String,
        <#AccountType>[GraphQL request] 👉union AccountType @tag(name: "from-accounts") = PasswordAccount | SMSAccount,
        <#@tag>[GraphQL request] union AccountType 👉@tag(name: "from-accounts") = PasswordAccount | SMSAccount,
        <#PasswordAccount>[GraphQL request] union AccountType @tag(name: "from-accounts") = 👉PasswordAccount | SMSAccount,
        <#SMSAccount>[GraphQL request] union AccountType @tag(name: "from-accounts") = PasswordAccount | 👉SMSAccount,
        <#UserMetadata>[GraphQL request] 👉type UserMetadata {,
        <https://specs.graphql.org/#String>[GraphQL request] name: 👉String,
        <https://specs.graphql.org/#String>[GraphQL request] address: 👉String,
        <https://specs.graphql.org/#String>[GraphQL request] description: 👉String,
        <#User>[GraphQL request] 👉type User,
        <https://specs.apollo.dev/federation/v1.0#@key>[GraphQL request] 👉@key(fields: "id"),
        <https://specs.apollo.dev/federation/v1.0#@key>[GraphQL request] 👉@key(fields: "username name { first last }"),
        <#@tag>[GraphQL request] 👉@tag(name: "from-accounts") {,
        <https://specs.graphql.org/#ID>[GraphQL request] id: 👉ID! @tag(name: "accounts"),
        <#@tag>[GraphQL request] id: ID! 👉@tag(name: "accounts"),
        <#Name>[GraphQL request] name: 👉Name @cacheControl(inheritMaxAge: true),
        <#@cacheControl>[GraphQL request] name: Name 👉@cacheControl(inheritMaxAge: true),
        <https://specs.graphql.org/#String>[GraphQL request] username: 👉String @shareable # Provided by the 'reviews' subgraph,
        <#@shareable>[GraphQL request] username: String 👉@shareable # Provided by the 'reviews' subgraph,
        <https://specs.graphql.org/#String>[GraphQL request] birthDate(locale: 👉String @tag(name: "admin")): String,
        <#@tag>[GraphQL request] birthDate(locale: String 👉@tag(name: "admin")): String,
        <https://specs.graphql.org/#String>[GraphQL request] birthDate(locale: String @tag(name: "admin")): 👉String,
        <#@tag>[GraphQL request] 👉@tag(name: "admin"),
        <#@tag>[GraphQL request] 👉@tag(name: "dev"),
        <#AccountType>[GraphQL request] account: 👉AccountType,
        <#UserMetadata>[GraphQL request] metadata: [👉UserMetadata],
        <https://specs.graphql.org/#String>[GraphQL request] ssn: 👉String,
        <#Name>[GraphQL request] 👉type Name {,
        <https://specs.graphql.org/#String>[GraphQL request] first: 👉String,
        <https://specs.graphql.org/#String>[GraphQL request] last: 👉String,
        <#Mutation>[GraphQL request] 👉type Mutation {,
        <https://specs.graphql.org/#String>[GraphQL request] username: 👉String!,
        <https://specs.graphql.org/#String>[GraphQL request] password: 👉String!,
        <https://specs.graphql.org/#String>[GraphQL request] userId: 👉String @deprecated(reason: "Use username instead"),
        <https://specs.graphql.org/#@deprecated>[GraphQL request] userId: String 👉@deprecated(reason: "Use username instead"),
        <#User>[GraphQL request] ): 👉User,
        <#Library>[GraphQL request] 👉type Library @key(fields: "id") {,
        <https://specs.apollo.dev/federation/v1.0#@key>[GraphQL request] type Library 👉@key(fields: "id") {,
        <https://specs.graphql.org/#ID>[GraphQL request] id: 👉ID!,
        <https://specs.graphql.org/#String>[GraphQL request] name: 👉String @external,
        <https://specs.apollo.dev/federation/v1.0#@external>[GraphQL request] name: String 👉@external,
        <https://specs.graphql.org/#ID>[GraphQL request] userAccount(id: 👉ID! = "1"): User @requires(fields: "name"),
        <#User>[GraphQL request] userAccount(id: ID! = "1"): 👉User @requires(fields: "name"),
        <https://specs.apollo.dev/federation/v1.0#@requires>[GraphQL request] userAccount(id: ID! = "1"): User 👉@requires(fields: "name"),
        <https://specs.graphql.org/#String>[GraphQL request] description: 👉String  @override(from: "books"),
        <#@override>[GraphQL request] description: String  👉@override(from: "books"),
        <https://specs.apollo.dev/link/v1.0#@>[builtin/link/v1.0.graphql] 👉directive @link(url: String!, as: String, import: [Import]),
        <https://specs.graphql.org/#String>[builtin/link/v1.0.graphql] directive @link(url: 👉String!, as: String, import: [Import]),
        <https://specs.graphql.org/#String>[builtin/link/v1.0.graphql] directive @link(url: String!, as: 👉String, import: [Import]),
        <https://specs.apollo.dev/link/v1.0#Import>[builtin/link/v1.0.graphql] directive @link(url: String!, as: String, import: [👉Import]),
        <https://specs.apollo.dev/link/v1.0#Import>[builtin/link/v1.0.graphql] 👉scalar Import,
        <https://specs.apollo.dev/federation/v1.0#@key>[builtin/federation/v1.0.graphql] 👉directive @key(fields: FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] directive @key(fields: 👉FieldSet!) repeatable on OBJECT | INTERFACE,
        <https://specs.apollo.dev/federation/v1.0#@external>[builtin/federation/v1.0.graphql] 👉directive @external on OBJECT | FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#@requires>[builtin/federation/v1.0.graphql] 👉directive @requires(fields: FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] directive @requires(fields: 👉FieldSet!) on FIELD_DEFINITION,
        <https://specs.apollo.dev/federation/v1.0#FieldSet>[builtin/federation/v1.0.graphql] 👉scalar FieldSet,
      ]
    `);

    expect(raw(print(document))).toMatchInlineSnapshot(`
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
        description: String @override(from: "books")
      }

      directive @link(url: String!, as: String, import: [link__Import]) repeatable on SCHEMA

      scalar link__Import

      """federation 1.0 key directive"""
      directive @key(fields: federation__FieldSet!) repeatable on OBJECT | INTERFACE

      directive @external on OBJECT | FIELD_DEFINITION

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      scalar federation__FieldSet
    `);
  });

  it('imports @tag from the federation spec', () => {
    const doc = subgraphCore(gql`
      @link(url: "https://specs.apollo.dev/federation/v2.0", import: "@tag")

      type User @tag(name: "something")
    `);

    expect(raw(print(doc))).toMatchInlineSnapshot(`
      extend schema @link(url: "https://specs.apollo.dev/link/v1.0") @link(url: "https://specs.apollo.dev/tag/v0.2") @link(url: "https://specs.apollo.dev/federation/v2.0")

      type User @tag(name: "something")

      directive @link(url: String!, as: String, import: [link__Import]) repeatable on SCHEMA

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION | ARGUMENT_DEFINITION | SCALAR | ENUM | ENUM_VALUE | INPUT_OBJECT | INPUT_FIELD_DEFINITION

      scalar link__Import
    `);
  });
});
