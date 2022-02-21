---
title: Subgraph-compatible server libraries
sidebar_title: Subgraph-compatible libraries
---

The following open-source GraphQL server libraries support acting as a subgraph in a federated graph, and their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). Check out the repository for details on the compatibility tests listed in the table below.

<style>
.sticky {
  position: sticky;
  left: 0;
  background: white;
  border-right: 1px solid #DEE2E7;
}

.table-container {
  box-shadow: inset 0px 0px 5px 0px #666;
}
</style>


<div class="table-container">

<table>

<thead>
  <tr>
    <th class="sticky">Language</th>
    <th>Framework</th>
    <th>_service</th>
    <th>@key (single)</th>
    <th>@key (multi)</th>
    <th>@key (composite)</th>
    <th>@requires</th>
    <th>@provides</th>
    <th>ftv1</th>
  </tr>
</thead>

<tbody>
  <tr>
    <td class="sticky">AppSync</td>
    <td> <a href="https://aws.amazon.com/appsync/">aws-appsync</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">C# (.NET)</td>
    <td> <a href="https://github.com/graphql-dotnet/graphql-dotnet">graphql-dotnet</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
    <td>❌</td>
    <td>❌</td>
    <td>❌</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">C# (.NET)</td>
    <td> <a href="https://github.com/ChilliCream/hotchocolate">hotchocolate</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">Elixir</td>
    <td> <a href="https://github.com/DivvyPayHQ/absinthe_federation">absinthe_federation</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌<br/>(<a href="https://github.com/DivvyPayHQ/absinthe_federation/pull/25">in progress</a>)</td>
  </tr>

  <tr>
    <td class="sticky">Go</td>
    <td> <a href="https://gqlgen.com/">gqlgen</a></td>
    <td>✔️</td>
    <td>✔️*</td>
    <td>✔️*</td>
    <td>❌</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">JavaScript</td>
    <td> <a href="https://github.com/apollographql/apollo-server/">apollo-server</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
  </tr>

  <tr>
    <td class="sticky">JavaScript</td>
    <td> <a href="https://graphql.org/graphql-js/running-an-express-graphql-server/">express-graphql</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">JavaScript</td>
    <td> <a href="https://mercurius.dev/#/">Mercurius</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">Java</td>
    <td> <a href="https://github.com/apollographql/federation-jvm">federation-jvm</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
  </tr>

  <tr>
    <td class="sticky">Java / Kotlin</td>
    <td> <a href="https://github.com/netflix/dgs-framework/">dgs</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
  </tr>

  <tr>
    <td class="sticky">Kotlin</td>
    <td> <a href="https://github.com/ExpediaGroup/graphql-kotlin">graphql-kotlin</a></td>
    <td>✔️</td>
    <td>✔️*</td>
    <td>✔️*</td>
    <td>✔️*</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
  </tr>

  <tr>
    <td class="sticky">PHP</td>
    <td> <a href="https://github.com/Skillshare/apollo-federation-php">apollo-federation-php</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">PHP</td>
    <td> <a href="https://lighthouse-php.com">Lighthouse</a> (Laravel)</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">Python</td>
    <td> <a href="https://github.com/preply/graphene-federation">graphene</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">Python</td>
    <td> <a href="https://github.com/mirumee/ariadne">ariadne</a></td>
    <td>✔️</td>
    <td>✔️*</td>
    <td>✔️*</td>
    <td>✔️*</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">Python</td>
    <td> <a href="https://strawberry.rocks/docs">strawberry-graphql</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky">Ruby</td>
    <td> <a href="https://github.com/Gusto/apollo-federation-ruby">apollo-federation-ruby</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
  </tr>

  <tr>
    <td class="sticky">Rust</td>
    <td> <a href="https://async-graphql.github.io/async-graphql/">async-graphql</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>❌</td>
  </tr>

  <tr>
    <td class="sticky" style="border-right: 1px solid #DEE2E7;">Scala</td>
    <td> <a href="https://ghostdogpr.github.io/caliban/docs/federation.html">caliban</a></td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
    <td>✔️</td>
  </tr>
</tbody>

</table>

</div>

_*_ _Library does not support **multiple** `@key` definitions, but all types of `@key` definitions are supported_

To add a library to this list, feel free to open an [issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out the [Apollo Federation Library Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to learn how to submit a PR for your library!
