---
title: Third-party libraries that support Apollo Federation
sidebar_title: Supported libraries
---

The following open-source GraphQL server libraries provide support for Apollo Federation and are included in our [Subgraph Compatibility Repository](apollo-federation-subgraph-compatibility). Check out the [repository](apollo-federation-subgraph-compatibility) if you are interested in learning more about the testing strategy.

| Language | Framework | _service | @key (single) | @key (multi) | @key (composite) | @requires | @provides | ftv1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| JavaScript | [apollo-server](https://github.com/apollographql/apollo-server/) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Java | [federation-jvm](https://github.com/apollographql/federation-jvm) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Java / Kotlin | [dgs](https://github.com/netflix/dgs-framework/) |  ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Kotlin | [graphql-kotlin](https://github.com/ExpediaGroup/graphql-kotlin) | ✔️ | ✔️* | ✔️* | ✔️* | ✔️ | ✔️ | ✔️  |
| Python | [graphene](https://github.com/preply/graphene-federation) | ✔️ | ✔️ | ✔️ | ❌ | ✔️ | ✔️ | ❌  |
| Python | [ariadne](https://github.com/mirumee/ariadne) | ✔️ | ✔️* | ✔️* | ✔️*| ✔️ | ✔️ | ❌  |
| Python | [strawberry-graphql](https://strawberry.rocks/docs) | ✔️ | ✔️ | ✔️ | ✔️| ✔️ | ✔️ | ❌  |
| Ruby | [apollo-federation-ruby](https://github.com/Gusto/apollo-federation-ruby) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |
| Scala | [caliban](https://ghostdogpr.github.io/caliban/docs/federation.html) | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️ | ✔️  |

_*_ _Implementation does not support multiple `@key` definitions, but all types of `@key` definitions are supported_

The following libraries appear to be actively maintained, but don't currently have an implementation in our [Subgraph Compatibility Repository](apollo-federation-subgraph-compatibility). We audit this list every few months and remove libraries that are no longer active.

| Language    | Framework     | Library                                                                          |
| ----------- | ------------- | -------------------------------------------------------------------------------- |
| Go            | [gqlgen](https://github.com/99designs/gqlgen/tree/master/plugin/federation)      | [GitHub Issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues/17)
| Rust          | [async-graphql](https://github.com/async-graphql/async-graphql)                   | [GitHub Issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues/21) |

If you want to see a library added to this list, feel free to open an [Issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out our [Apollo Federation Library Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to see about submitting a PR for your library!