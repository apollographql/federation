[![CircleCI](https://circleci.com/gh/apollographql/federation/tree/main.svg?style=shield)](https://circleci.com/gh/apollographql/federation/tree/main) [![Netlify Status](https://api.netlify.com/api/v1/badges/3a012f93-2d02-41f7-bb2b-848cf005b831/deploy-status)](https://app.netlify.com/sites/apollo-federation-docs/deploys)

---

# Apollo Federation

Apollo Federation is an architecture for declaratively composing APIs into a unified graph. Each team can own their slice of the graph independently, empowering them to deliver autonomously and incrementally.

## What does Apollo Federation do?

When paired with the Apollo Router, Apollo Federation acts as an API orchestration layer for your organization’s microservices. It enables you to compose multiple APIs—whether GraphQL, REST, or other sources—into a single, unified graph that clients can query just like any GraphQL API.
The router handles incoming requests by routing them to the appropriate services and combining the results into a single response. This simplifies client logic and gives backend teams the flexibility to evolve independently.

Check out the [docs](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/federation) to learn more.

## Who is Apollo?

[Apollo](https://apollographql.com/) builds open-source tools and commercial services to make application development easier, better, and accessible to more people. We help you ship faster with:

* [GraphOS](https://www.apollographql.com/graphos) - The platform for building, managing, and scaling a supergraph: a unified network of your organization's microservices and their data sources—all composed into a single distributed API.
* [Apollo Federation](https://www.apollographql.com/federation) – The industry-standard open architecture for building a distributed graph.
* [Apollo Router](https://github.com/apollographql/router) - The routing runtime for supergraphs. It determines a query plan, routes requests across your services, and provides detailed observability. 
* [Apollo Connectors](https://www.apollographql.com/docs/graphos/schema-design/connectors) - A declarative way of plugging REST APIs into your graph built on the Apollo Router and Federation.
* [Apollo Server](https://www.apollographql.com/docs/apollo-server/) – A production-ready JavaScript GraphQL server that connects to any microservice, API, or database. Compatible with all popular JavaScript frameworks and deployable in serverless environments.
* [Apollo Client](https://github.com/apollographql/apollo-client) – The most popular GraphQL client for the web. Apollo also builds and maintains [Apollo iOS](https://github.com/apollographql/apollo-ios) and [Apollo Kotlin](https://github.com/apollographql/apollo-kotlin).

## Learn how to build with Apollo

Check out the [Odyssey](https://odyssey.apollographql.com/) learning platform, the perfect place to start your GraphQL journey with videos and interactive code challenges. Join the [Apollo Community](https://community.apollographql.com/) to interact with and get technical help from the GraphQL community.

## Contributing

If this project seems like something to which you want to contribute, first off **thank you**. We are so excited that you are excited about this project and we want to make sure contributing is a safe, fun, and fruitful experience for you. Please read our [code of conduct](https://github.com/apollographql/.github/blob/HEAD/CODE_OF_CONDUCT.md) and then head on over to the [contributing guide](./CONTRIBUTING.md) to learn how to work on this project.

If you ever have any problems, questions, or ideas, the maintainers of this project are available to help.  Please open an issue for assistance!

### Current branches

1. **Federation 2** is the current `main` branch. Installing `latest` from npm is the most recent published code from `main`.
2. **Prior releases** are located under the `version-0.x` branch. This comprises all 0.x packages previously released. Installing `latest-1` from npm is the most recent published code from `version-0.x`.

## Licensing

Source code in this repository is covered by (i) the Elastic License 2.0 or (ii) an MIT compatible license, in each case, as designated by a licensing file in a subdirectory or file header. The default throughout the repository is a license under the Elastic License 2.0, unless a file header or a licensing file in a subdirectory specifies another license.
