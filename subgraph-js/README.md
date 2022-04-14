# `Apollo Subgraph`

This package provides utilities for creating GraphQL microservices, which can be combined into a single endpoint through tools like [Apollo Gateway](https://github.com/apollographql/federation/tree/main/gateway-js).

For complete documentation, see the [Apollo Subgraph API reference](https://www.apollographql.com/docs/federation/subgraphs/).

## Usage

```js
const { ApolloServer, gql } = require("apollo-server");
const { buildSubgraphSchema } = require("@apollo/subgraph");

const typeDefs = gql`
  type Query {
    me: User
  }

  type User @key(fields: "id") {
    id: ID!
    username: String
  }
`;

const resolvers = {
  Query: {
    me() {
      return { id: "1", username: "@ava" }
    }
  },
  User: {
    __resolveReference(user, { fetchUserById }){
      return fetchUserById(user.id)
    }
  }
};

const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }])
});

server.listen(4001).then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
});
```
