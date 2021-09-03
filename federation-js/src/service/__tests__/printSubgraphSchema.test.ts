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

      directive @cacheControl(maxAge: Int, scope: CacheControlScope, inheritMaxAge: Boolean) on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      enum CacheControlScope {
        PUBLIC
        PRIVATE
      }

      type PasswordAccount @key(fields: \\"email\\") {
        email: String!
      }

      type SMSAccount @key(fields: \\"number\\") {
        number: String
      }

      union AccountType = PasswordAccount | SMSAccount

      type UserMetadata {
        name: String
        address: String
        description: String
      }

      type User @key(fields: \\"id\\") @key(fields: \\"username name { first last }\\") {
        id: ID!
        name: Name
        username: String
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
});
