import { fixtures } from 'apollo-federation-integration-testsuite';
import { buildSubgraphSchema } from '../buildSubgraphSchema';
import { printSubgraphSchema } from '../printSubgraphSchema';

describe('printSubgraphSchema', () => {
  it('prints a subgraph correctly', () => {
    const schema = buildSubgraphSchema(fixtures[0].typeDefs);
    expect(printSubgraphSchema(schema)).toMatchInlineSnapshot(`
      "schema {
        query: RootQuery
        mutation: Mutation
      }

      directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on FIELD_DEFINITION | INTERFACE | OBJECT | UNION

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      enum CacheControlScope {
        PUBLIC
        PRIVATE
      }

      scalar JSON @specifiedBy(url: \\"https://json-spec.dev\\")

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
        name: Name
        username: String
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

      extend type RootQuery {
        _entities(representations: [_Any!]!): [_Entity]!
        _service: _Service!
        user(id: ID!): User
        me: User
      }

      extend type Library @key(fields: \\"id\\") {
        id: ID! @external
        name: String @external
        userAccount(id: ID! = 1): User @requires(fields: \\"name\\")
      }
      "
    `);
  });

  it('prints reviews subgraph correctly', () => {
    const schema = buildSubgraphSchema(fixtures[5].typeDefs);
    expect(printSubgraphSchema(schema)).toMatchInlineSnapshot(`
      "directive @stream on FIELD

      directive @transform(from: String!) on FIELD

      directive @tag(name: String!) repeatable on INTERFACE | FIELD_DEFINITION | OBJECT | UNION

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

      input ReviewProduct {
        upc: String!
        body: String!
        stars: Int @deprecated(reason: \\"Stars are no longer in use\\")
      }

      type KeyValue {
        key: String!
        value: String!
      }

      type Error {
        code: Int
        message: String
      }

      union MetadataOrError = KeyValue | Error

      extend type Query {
        _entities(representations: [_Any!]!): [_Entity]!
        _service: _Service!
        topReviews(first: Int = 5): [Review]
      }

      extend type UserMetadata {
        address: String @external
      }

      extend type User @key(fields: \\"id\\") @tag(name: \\"from-reviews\\") {
        id: ID! @external @tag(name: \\"on-external\\")
        username: String @external
        reviews: [Review]
        numberOfReviews: Int!
        metadata: [UserMetadata] @external
        goodAddress: Boolean @requires(fields: \\"metadata { address }\\")
      }

      extend interface Product @tag(name: \\"from-reviews\\") {
        reviews: [Review]
      }

      extend type Furniture implements Product @key(fields: \\"upc\\") {
        upc: String! @external
        reviews: [Review]
      }

      extend type Book implements Product @key(fields: \\"isbn\\") {
        isbn: String! @external
        reviews: [Review]
        similarBooks: [Book]! @external
        relatedReviews: [Review!]! @requires(fields: \\"similarBooks { isbn }\\")
      }

      extend interface Vehicle {
        retailPrice: String
      }

      extend type Car implements Vehicle @key(fields: \\"id\\") {
        id: String! @external
        price: String @external
        retailPrice: String @requires(fields: \\"price\\")
      }

      extend type Van implements Vehicle @key(fields: \\"id\\") {
        id: String! @external
        price: String @external
        retailPrice: String @requires(fields: \\"price\\")
      }

      extend type Mutation {
        reviewProduct(input: ReviewProduct!): Product
        updateReview(review: UpdateReviewInput!): Review
        deleteReview(id: ID!): Boolean
      }
      "
    `);
  });
});
