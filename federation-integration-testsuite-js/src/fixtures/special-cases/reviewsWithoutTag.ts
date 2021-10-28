import { fed2gql as gql } from '../../utils/fed2gql';

export { name, url, resolvers } from '../reviews';
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD

  type Query {
    topReviews(first: Int = 5): [Review]
  }

  type Review @key(fields: "id") {
    id: ID!
    body(format: Boolean = false): String
    author: User @provides(fields: "username")
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

  type User @key(fields: "id") {
    id: ID!
    username: String @external
    reviews: [Review]
    numberOfReviews: Int!
    metadata: [UserMetadata] @external
    goodAddress: Boolean @requires(fields: "metadata { address }")
  }

  interface Product {
    reviews: [Review]
  }

  type Furniture implements Product @key(fields: "upc") {
    upc: String!
    reviews: [Review]
  }

  type Book implements Product @key(fields: "isbn") {
    isbn: String!
    reviews: [Review]
    similarBooks: [Book]! @external
    relatedReviews: [Review!]! @requires(fields: "similarBooks { isbn }")
  }

  interface Vehicle {
    retailPrice: String
  }

  type Car implements Vehicle @key(fields: "id") {
    id: String!
    price: String @external
    retailPrice: String @requires(fields: "price")
  }

  type Van implements Vehicle @key(fields: "id") {
    id: String!
    price: String @external
    retailPrice: String @requires(fields: "price")
  }

  input ReviewProduct {
    upc: String!
    body: String!
    stars: Int @deprecated(reason: "Stars are no longer in use")
  }

  type Mutation {
    reviewProduct(input: ReviewProduct): Product
    updateReview(review: UpdateReviewInput!): Review
    deleteReview(id: ID!): Boolean
  }

  # Value type
  type KeyValue {
    key: String!
    value: String!
  }

  # Value type
  type Error {
    code: Int
    message: String
  }

  # Value type
  union MetadataOrError = KeyValue | Error
`;
