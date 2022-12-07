# Apollo Gateway

This package provides utilities for combining multiple GraphQL microservices into a single GraphQL endpoint.

Each microservice should implement the [federation schema specification](https://www.apollographql.com/docs/apollo-server/federation/subgraph-spec/). This can be done either through [Apollo Federation](https://github.com/apollographql/federation/tree/HEAD/subgraph-js) or a variety of other open source products.

For complete documentation, see the [Apollo Gateway API reference](https://www.apollographql.com/docs/apollo-server/api/apollo-gateway/).

## Usage

```js
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from '@apollo/server/standalone';
import { ApolloGateway, IntrospectAndCompose } from "@apollo/gateway";

const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
       { name: "accounts", url: "http://localhost:4001/graphql" }
       // List of federation-capable GraphQL endpoints...
    ],
  }),
});

const server = new ApolloServer({ gateway });

// Note the top-level await!
const { url } = await startStandaloneServer(server);
console.log(`🚀  Server ready at ${url}`);
```
