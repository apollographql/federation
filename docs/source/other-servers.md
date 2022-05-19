---
title: Subgraph-compatible server libraries
---

The following open-source GraphQL server libraries support acting as a subgraph in a federated graph, and their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). Check out the repository for details on the compatibility tests listed in the table below.

> To add a library to this list, feel free to open an [issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out the [Apollo Federation Library Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to learn how to submit a PR for your library!

## C# / .NET

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [GraphQL for .NET](https://graphql-dotnet.github.io) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>❌</td></tr><tr><th>@key (composite)</th><td>❌</td></tr><tr><th>@requires</th><td>❌</td></tr><tr><th>@provides</th><td>❌</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |
| [Hot Chocolate](https://chillicream.com/docs/hotchocolate) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Elixir

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [Absinthe.Federation](https://github.com/DivvyPayHQ/absinthe_federation) (Absinthe) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Go

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [gqlgen](https://gqlgen.com) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>✅</td></tr><tr><th>@shareable</th><td>✅</td></tr><tr><th>@tag</th><td>✅</td></tr><tr><th>@override</th><td>✅</td></tr><tr><th>@inaccessible</th><td>✅</td></tr></table> |

## Java / Kotlin

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [dgs-framework](https://github.com/netflix/dgs-framework/) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |
| [Federation JVM](https://github.com/apollographql/federation-jvm) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>✅</td></tr><tr><th>@shareable</th><td>✅</td></tr><tr><th>@tag</th><td>✅</td></tr><tr><th>@override</th><td>✅</td></tr><tr><th>@inaccessible</th><td>✅</td></tr></table> |
| [GraphQL Kotlin](https://github.com/ExpediaGroup/graphql-kotlin) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## JavaScript / TypeScript
| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [Apollo Server](https://www.apollographql.com/docs/federation/) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>✅</td></tr><tr><th>@shareable</th><td>✅</td></tr><tr><th>@tag</th><td>✅</td></tr><tr><th>@override</th><td>✅</td></tr><tr><th>@inaccessible</th><td>✅</td></tr></table> |
| [express-graphql](https://github.com/graphql/express-graphql) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>✅</td></tr><tr><th>@shareable</th><td>✅</td></tr><tr><th>@tag</th><td>✅</td></tr><tr><th>@override</th><td>✅</td></tr><tr><th>@inaccessible</th><td>✅</td></tr></table> |
| [GraphQL Yoga](https://www.graphql-yoga.com/docs/features/apollo-federation) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>✅</td></tr><tr><th>@shareable</th><td>✅</td></tr><tr><th>@tag</th><td>✅</td></tr><tr><th>@override</th><td>✅</td></tr><tr><th>@inaccessible</th><td>✅</td></tr></table> |
| [Mercurius](https://mercurius.dev/#/) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## PHP

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [Apollo Federation PHP](https://github.com/Skillshare/apollo-federation-php) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |
| [Lighthouse](https://lighthouse-php.com/) (Laravel) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Python

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [Ariadne](https://ariadnegraphql.org/docs/apollo-federation) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>❌</td></tr><tr><th>@key (composite)</th><td>❌</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |
| [Graphene](https://graphene-python.org/) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>❌</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>❌</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |
| [Strawberry](https://strawberry.rocks) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Ruby

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [GraphQL Ruby](https://graphql-ruby.org/) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Rust

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [Async-graphql](https://async-graphql.github.io/async-graphql/en/index.html) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Scala
| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [Caliban](https://ghostdogpr.github.io/caliban/docs/federation.html) | <table><tr><th>_service</th><td>✅</td></tr><tr><th>@key (single)</th><td>✅</td></tr><tr><th>@key (multi)</th><td>✅</td></tr><tr><th>@key (composite)</th><td>✅</td></tr><tr><th>@requires</th><td>✅</td></tr><tr><th>@provides</th><td>✅</td></tr><tr><th>@ftv1</th><td>✅</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |

## Multi-language

| Library | Federation 1 Support | Federation 2 Support |
| --- | --- | --- |
| [AWS AppSync](https://aws.amazon.com/appsync/) | <table><tr><th>_service</th><td>❌</td></tr><tr><th>@key (single)</th><td>❌</td></tr><tr><th>@key (multi)</th><td>❌</td></tr><tr><th>@key (composite)</th><td>❌</td></tr><tr><th>@requires</th><td>❌</td></tr><tr><th>@provides</th><td>❌</td></tr><tr><th>@ftv1</th><td>❌</td></tr></table> | <table><tr><th>@link</th><td>❌</td></tr><tr><th>@shareable</th><td>❌</td></tr><tr><th>@tag</th><td>❌</td></tr><tr><th>@override</th><td>❌</td></tr><tr><th>@inaccessible</th><td>❌</td></tr></table> |
