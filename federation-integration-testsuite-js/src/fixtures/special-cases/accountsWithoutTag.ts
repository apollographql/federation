import { fed2gql as gql } from '../../utils/fed2gql';

export { name, url, resolvers } from '../accounts';
export const typeDefs = gql`
  directive @stream on FIELD
  directive @transform(from: String!) on FIELD

  schema {
    query: RootQuery
    mutation: Mutation
  }

  type RootQuery {
    user(id: ID!): User
    me: User
  }

  type PasswordAccount @key(fields: "email") {
    email: String!
  }

  type SMSAccount @key(fields: "number") {
    number: String
  }

  union AccountType = PasswordAccount | SMSAccount

  type UserMetadata {
    name: String
    address: String
    description: String
  }

  type User @key(fields: "id") @key(fields: "username name { first last }") {
    id: ID!
    name: Name
    username: String @shareable # Provided by the 'reviews' subgraph
    birthDate(locale: String): String
    account: AccountType
    metadata: [UserMetadata]
    ssn: String
  }

  type Name {
    first: String
    last: String
  }

  type Mutation {
    login(username: String!, password: String!): User
  }

  type Library @key(fields: "id") {
    id: ID!
    name: String @external
    userAccount(id: ID! = "1"): User @requires(fields: "name")

  }
`;
