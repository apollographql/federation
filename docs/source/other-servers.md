---
title: Subgraph-compatible server libraries
---

The following open-source GraphQL server libraries support acting as a subgraph in a federated graph, and their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). Check out the repository for details on the compatibility tests listed in the table below.

<div class="sticky-table">

| Language      | Framework                                                                            | \_service | @key (single) | @key (multi) | @key (composite) | @requires | @provides | ftv1                                                                         |
| ------------- | ------------------------------------------------------------------------------------ | --------- | ------------- | ------------ | ---------------- | --------- | --------- | ---------------------------------------------------------------------------- |
| AppSync       | [aws-appsync](https://aws.amazon.com/appsync/)                                       | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| C# (.NET)     | [graphql-dotnet](https://github.com/graphql-dotnet/graphql-dotnet)                   | ✅         | ✅             | ❌            | ❌                | ❌         | ❌         | ❌                                                                            |
| C# (.NET)     | [hotchocolate](https://github.com/ChilliCream/hotchocolate)                          | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| Elixir        | [absinthe_federation](https://github.com/DivvyPayHQ/absinthe_federation)             | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌ ([in progress](https://github.com/DivvyPayHQ/absinthe_federation/pull/25)) |
| Go            | [gqlgen](https://gqlgen.com/)                                                        | ✅         | ✅\*           | ✅\*          | ❌                | ✅         | ✅         | ❌                                                                            |
| JavaScript    | [apollo-server](https://github.com/apollographql/apollo-server/)                     | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ✅                                                                            |
| JavaScript    | [express-graphql](https://graphql.org/graphql-js/running-an-express-graphql-server/) | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| JavaScript    | [Mercurius](https://mercurius.dev/#/)                                                | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| Java          | [federation-jvm](https://github.com/apollographql/federation-jvm)                    | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ✅                                                                            |
| Java / Kotlin | [dgs](https://github.com/netflix/dgs-framework/)                                     | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ✅                                                                            |
| Kotlin        | [graphql-kotlin](https://github.com/ExpediaGroup/graphql-kotlin)                     | ✅         | ✅\*           | ✅\*          | ✅\*              | ✅         | ✅         | ✅                                                                            |
| PHP           | [apollo-federation-php](https://github.com/Skillshare/apollo-federation-php)         | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| PHP           | [Lighthouse](https://lighthouse-php.com/) (Laravel)                                  | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| Python        | [graphene](https://github.com/preply/graphene-federation)                            | ✅         | ✅             | ✅            | ❌                | ✅         | ✅         | ❌                                                                            |
| Python        | [ariadne](https://github.com/mirumee/ariadne)                                        | ✅         | ✅\*           | ✅\*          | ✅\*              | ✅         | ✅         | ❌                                                                            |
| Python        | [strawberry-graphql](https://strawberry.rocks/docs)                                  | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| Ruby          | [apollo-federation-ruby](https://github.com/Gusto/apollo-federation-ruby)            | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ✅                                                                            |
| Rust          | [async-graphql](https://async-graphql.github.io/async-graphql/)                      | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ❌                                                                            |
| Scala         | [caliban](https://ghostdogpr.github.io/caliban/docs/federation.html)                 | ✅         | ✅             | ✅            | ✅                | ✅         | ✅         | ✅                                                                            |

</div>

_*_ _Library does not support **multiple** `@key` definitions, but all types of `@key` definitions are supported_

To add a library to this list, feel free to open an [issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out the [Apollo Federation Library Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to learn how to submit a PR for your library!
