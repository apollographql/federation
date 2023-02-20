---
title: Federation-compatible subgraph implementations
description: For use in a federated supergraph
---

The following open-source GraphQL server libraries and hosted solutions support acting as a subgraph in a federated supergraph. Their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). Check out the repository for details on the compatibility tests listed in the table below.

> To add a subgraph to this list, feel free to open an [issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out the [Apollo Federation Subgraph Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to learn how to submit a PR for your implementation!

## Table Legend

| Icon | Description                                          |
| ---- | ---------------------------------------------------- |
| 🟢    | Functionality is supported                           |
| ❌    | Critical functionality is NOT supported              |
| 🔲    | Additional federation functionality is NOT supported |

## C# / .NET

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://graphql-dotnet.github.io">GraphQL for .NET</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://chillicream.com/docs/hotchocolate">Hot Chocolate</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Elixir

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://github.com/DivvyPayHQ/absinthe_federation">Absinthe.Federation</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Go

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://gqlgen.com">gqlgen</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🔲</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://github.com/graphql-go/graphql">GraphQL Go</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Java / Kotlin

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://github.com/netflix/dgs-framework/">dgs-framework</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><td><a href="https://github.com/apollographql/federation-jvm">Federation JVM</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><td><a href="https://github.com/graphql-java-kickstart/graphql-spring-boot">GraphQL Java Kickstart (Spring Boot)</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://github.com/ExpediaGroup/graphql-kotlin">GraphQL Kotlin</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## JavaScript / TypeScript

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://www.apollographql.com/docs/federation/">Apollo Server</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><td><a href="https://github.com/graphql/express-graphql">express-graphql</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://www.the-guild.dev/graphql/yoga-server/v3/features/apollo-federation">GraphQL Yoga</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><td><a href="https://graphql-helix.vercel.app">GraphQL Helix</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><td><a href="https://mercurius.dev/#/">Mercurius</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://nestjs.com">NestJS (code first)</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://nestjs.com">NestJS</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><td><a href="https://pothos-graphql.dev/docs/plugins/federation">Pothos GraphQL</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## PHP

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://lighthouse-php.com/">Lighthouse (Laravel)</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://github.com/Skillshare/apollo-federation-php">Apollo Federation PHP</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Python

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://ariadnegraphql.org/docs/apollo-federation">Ariadne</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://graphene-python.org/">Graphene</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🔲</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://strawberry.rocks">Strawberry</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## Ruby

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://graphql-ruby.org/">GraphQL Ruby</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Rust

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://async-graphql.github.io/async-graphql/en/apollo_federation.html">Async-graphql</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Scala

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://ghostdogpr.github.io/caliban/docs/federation.html">Caliban</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://sangria-graphql.github.io/learn/#graphql-federation">Sangria</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Swift

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://github.com/GraphQLSwift/Graphiti">Graphiti</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## Other Solutions

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><td><a href="https://aws.amazon.com/appsync/">AWS AppSync</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://dgraph.io/docs/graphql/overview/">Dgraph</a></td><td><table><tr><th><code>_service</code></th><td>❌</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🔲</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🔲</td></tr><tr><th><code>@provides</code></th><td>🔲</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://www.the-guild.dev/graphql/mesh">GraphQL Mesh</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><td><a href="https://stepzen.com/apollo-stepzen">StepZen</a></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>
