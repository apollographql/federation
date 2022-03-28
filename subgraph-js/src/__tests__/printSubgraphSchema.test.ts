import { fixtures } from 'apollo-federation-integration-testsuite';
import { buildSubgraphSchema } from '../buildSubgraphSchema';
import { printSubgraphSchema } from '../printSubgraphSchema';
import gql from 'graphql-tag';
import raw from '@apollo/core-schema/dist/snapshot-serializers/raw';

describe('printSubgraphSchema', () => {
  it('prints a subgraph correctly', () => {
    const schema = buildSubgraphSchema(fixtures[0].typeDefs);
    expect(raw(printSubgraphSchema(schema))).toMatchInlineSnapshot(`
      schema {
        query: RootQuery
        mutation: Mutation
      }

      extend schema @link(url: "https://specs.apollo.dev/link/v0.3") @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@shareable", "@tag", "@extends"]) @link(url: "https://specs.apollo.dev/tag/v0.1") @link(url: "https://specs.apollo.dev/id/v1.0")

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      directive @link(url: link__Url!, as: link__Name, import: link__Imports) repeatable on SCHEMA

      """federation 2.0 key directive"""
      directive @key(fields: federation__FieldSet!) repeatable on OBJECT | INTERFACE

      directive @shareable on FIELD_DEFINITION | OBJECT

      directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      enum CacheControlScope {
        PUBLIC
        PRIVATE
      }

      scalar JSON @specifiedBy(url: "https://json-spec.dev")

      type RootQuery {
        _entities(representations: [_Any!]!): [_Entity]!
        _service: _Service!
        user(id: ID!): User
        me: User
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
        name: Name
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
        userAccount(id: ID! = 1): User @requires(fields: "name")
      }

      scalar link__Url

      scalar link__Name

      scalar link__Imports

      scalar federation__FieldSet

    `);
  });

  it('prints a scalar without a directive correctly', () => {
    const schema = gql`
      scalar JSON
    `;
    const subgraphSchema = buildSubgraphSchema(schema);

    expect(printSubgraphSchema(subgraphSchema)).toMatchInlineSnapshot(`
      "extend schema @link(url: \\"https://specs.apollo.dev/link/v0.3\\") @link(url: \\"https://specs.apollo.dev/federation/v1.0\\", as: \\"\\", import: [\\"@key\\", \\"@requires\\", \\"@provides\\", \\"@external\\"]) @link(url: \\"https://specs.apollo.dev/tag/v0.1\\") @link(url: \\"https://specs.apollo.dev/id/v1.0\\")

      directive @link(url: link__Url!, as: link__Name, import: link__Imports) repeatable on SCHEMA

      scalar JSON

      scalar link__Url

      scalar link__Name

      scalar link__Imports

      type Query {
        _service: _Service!
      }
      "
    `);
  });

  it('prints reviews subgraph correctly', () => {
    const schema = buildSubgraphSchema(fixtures[5].typeDefs);
    expect(printSubgraphSchema(schema)).toMatchInlineSnapshot(`
      "extend schema @link(url: \\"https://specs.apollo.dev/link/v0.3\\") @link(url: \\"https://specs.apollo.dev/federation/v2.0\\", import: [\\"@key\\", \\"@requires\\", \\"@provides\\", \\"@external\\", \\"@shareable\\", \\"@tag\\", \\"@extends\\"]) @link(url: \\"https://specs.apollo.dev/tag/v0.1\\") @link(url: \\"https://specs.apollo.dev/id/v1.0\\")

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on INTERFACE | FIELD_DEFINITION | OBJECT | UNION

      directive @link(url: link__Url!, as: link__Name, import: link__Imports) repeatable on SCHEMA

      \\"\\"\\"federation 2.0 key directive\\"\\"\\"
      directive @key(fields: federation__FieldSet!) repeatable on OBJECT | INTERFACE

      directive @provides(fields: federation__FieldSet!) on FIELD_DEFINITION

      directive @external repeatable on OBJECT | INTERFACE | FIELD_DEFINITION

      directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

      directive @shareable on FIELD_DEFINITION | OBJECT

      type Query {
        _entities(representations: [_Any!]!): [_Entity]!
        _service: _Service!
        topReviews(first: Int = 5): [Review]
      }

      type Review @key(fields: \\"id\\") {
        id: ID!
        body(format: Boolean = false): String
        author: User @provides(fields: \\"username\\")
        product: Product
        metadata: [MetadataOrError]
      }

      input UpdateReviewInput {
        id: ID!
        body: String
      }

      type UserMetadata {
        address: String @external
      }

      type User @key(fields: \\"id\\") @tag(name: \\"from-reviews\\") {
        id: ID!
        username: String @external
        reviews: [Review]
        numberOfReviews: Int!
        metadata: [UserMetadata] @external
        goodAddress: Boolean @requires(fields: \\"metadata { address }\\")
      }

      interface Product @tag(name: \\"from-reviews\\") {
        reviews: [Review]
      }

      type Furniture implements Product @key(fields: \\"upc\\") {
        upc: String!
        reviews: [Review]
      }

      type Book implements Product @key(fields: \\"isbn\\") {
        isbn: String!
        reviews: [Review]
        similarBooks: [Book]! @external
        relatedReviews: [Review!]! @requires(fields: \\"similarBooks { isbn }\\")
      }

      interface Vehicle {
        retailPrice: String
      }

      type Car implements Vehicle @key(fields: \\"id\\") {
        id: String!
        price: String @external
        retailPrice: String @requires(fields: \\"price\\")
      }

      type Van implements Vehicle @key(fields: \\"id\\") {
        id: String!
        price: String @external
        retailPrice: String @requires(fields: \\"price\\")
      }

      input ReviewProduct {
        upc: String!
        body: String!
        stars: Int @deprecated(reason: \\"Stars are no longer in use\\")
      }

      type Mutation {
        reviewProduct(input: ReviewProduct!): Product
        updateReview(review: UpdateReviewInput!): Review
        deleteReview(id: ID!): Boolean
      }

      type KeyValue @shareable {
        key: String!
        value: String!
      }

      type Error @shareable {
        code: Int
        message: String
      }

      union MetadataOrError = KeyValue | Error

      scalar link__Url

      scalar link__Name

      scalar link__Imports

      scalar federation__FieldSet
      "
    `);
  });
});
