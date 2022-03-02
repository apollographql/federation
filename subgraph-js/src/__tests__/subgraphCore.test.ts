import { fixtures } from 'apollo-federation-integration-testsuite';
import { subgraphSchema } from '../schema-helper/buildSchemaFromSDL';
import { print } from 'graphql';
import recall from '@protoplasm/recall';

describe('subgraphSchema', () => {
  it('compiles a subgraph into a core schema', () => {
    const result = recall(() =>
      subgraphSchema([{ typeDefs: fixtures[0].typeDefs }]),
    ).getResult();
    if (result.didThrow()) throw result.error;
    expect([...result.errors()].length).toBe(0)
    expect(print(result.data.document)).toBe(`directive @stream on FIELD

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

extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@requires", "@provides", "@external", "@shareable", "@tag", "@extends"])

extend schema

directive @key(fields: federation__FieldSet!) repeatable on OBJECT

directive @shareable on FIELD_DEFINITION

directive @external repeatable on OBJECT

directive @requires(fields: federation__FieldSet!) on FIELD_DEFINITION

directive @link(url: link__Url!, as: link__Name, import: link__Imports) repeatable on SCHEMA

scalar federation__FieldSet

scalar link__Url

scalar link__Name

scalar link__Imports`);
  });
});
