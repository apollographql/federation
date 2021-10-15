---
title: Subgraph-compatible server libraries
sidebar_title: Subgraph-compatible libraries
---

The following open-source GraphQL server libraries support acting as a subgraph in a federated graph, and their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). Check out the repository for details on the compatibility tests listed in the table below.

| Language | Framework | _service | @key (single) | @key (multi) | @key (composite) | @requires | @provides | ftv1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Elixir | [absinthe_federation](https://github.com/DivvyPayHQ/absinthe_federation) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ❌ ([coming soon](https://github.com/DivvyPayHQ/absinthe_federation/pull/25)) |
| JavaScript | [apollo-server](https://github.com/apollographql/apollo-server/) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Java | [federation-jvm](https://github.com/apollographql/federation-jvm) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Java / Kotlin | [dgs](https://github.com/netflix/dgs-framework/) |  ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Kotlin | [graphql-kotlin](https://github.com/ExpediaGroup/graphql-kotlin) | ✔️ | ✔️* | ✔️* | ✔️* | ✔️ | ✔️ | ✔️  |
| PHP | [apollo-federation-php](https://github.com/Skillshare/apollo-federation-php) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ❌  |
| Python | [graphene](https://github.com/preply/graphene-federation) | ✔️ | ✔️ | ✔️ | ❌ | ✔️ | ✔️ | ❌  |
| Python | [ariadne](https://github.com/mirumee/ariadne) | ✔️ | ✔️* | ✔️* | ✔️*| ✔️ | ✔️ | ❌  |
| Python | [strawberry-graphql](https://strawberry.rocks/docs) | ✔️ | ✔️ | ✔️ | ✔️| ✔️ | ✔️ | ❌  |
| Ruby | [apollo-federation-ruby](https://github.com/Gusto/apollo-federation-ruby) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Rust | [async-graphql](https://async-graphql.github.io/async-graphql/) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ❌  |
| Scala | [caliban](https://ghostdogpr.github.io/caliban/docs/federation.html) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |

_*_ _Library does not support **multiple** `@key` definitions, but all types of `@key` definitions are supported_

The following libraries appear to be actively maintained, but don't currently have an implementation in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). We audit this list every few months and remove libraries that are no longer active.

| Language    | Framework     | Library                                                                          |
| ----------- | ------------- | -------------------------------------------------------------------------------- |
| Go            | [gqlgen](https://github.com/99designs/gqlgen/tree/master/plugin/federation)      | [GitHub Issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues/17)

To add a library to this list, feel free to open an [issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out the [Apollo Federation Library Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to learn how to submit a PR for your library!
