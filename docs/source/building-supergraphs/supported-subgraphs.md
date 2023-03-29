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
<tr><th colspan="3"><big><a href="https://graphql-dotnet.github.io">GraphQL for .NET</a></big></th></tr>
<tr><td>GraphQL for .NET</br></br>Github: <a href="https://github.com/graphql-dotnet/graphql-dotnet">graphql-dotnet/graphql-dotnet</a></br>
Type: Code first | SDL first</br>
Stars: 5.5k ⭐</br>
Last Release: 2023-02-27</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://chillicream.com/docs/hotchocolate">Hot Chocolate</a></big></th></tr>
<tr><td>Open-source GraphQL server for the Microsoft .NET platform that takes the complexity away and lets you focus on delivering the next big thing.</br></br>Github: <a href="https://github.com/ChilliCream/graphql-platform">ChilliCream/graphql-platform</a></br>
Type: Code first | SDL first</br>
Stars: 4.3k ⭐</br>
Last Release: 2023-03-22</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Elixir

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://hexdocs.pm/absinthe_federation/readme.html">Absinthe</a></big></th></tr>
<tr><td>The GraphQL toolkit for Elixir</br></br>Github: <a href="https://github.com/absinthe-graphql/absinthe">absinthe-graphql/absinthe</a></br>
Type: Code first</br>
Stars: 4.1k ⭐</br>
Last Release: 2021-09-28</br></br>Federation Library: <a href="https://github.com/DivvyPayHQ/absinthe_federation">Absinthe.Federation</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Go

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://gqlgen.com">gqlgen</a></big></th></tr>
<tr><td>go generate based graphql server library</br></br>Github: <a href="https://github.com/99designs/gqlgen">99designs/gqlgen</a></br>
Type: SDL first</br>
Stars: 8.7k ⭐</br>
Last Release: 2023-03-20</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🔲</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://github.com/dariuszkuc/graphql#this-is-fork-of-graphql-gographql-that-adds-apollo-federation-support">GraphQL Go (fork)</a></big></th></tr>
<tr><td>This is a fork of graphql-go/graphql that adds Federation support</br></br>Github: <a href="https://github.com/dariuszkuc/graphql">dariuszkuc/graphql</a></br>
Type: Code first</br>
Stars: 1 ⭐</br>
Last Release: 2022-11-11</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Java / Kotlin

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://netflix.github.io/dgs/federation/">dgs-framework</a></big></th></tr>
<tr><td>GraphQL for Java with Spring Boot made easy.</br></br>Github: <a href="https://github.com/netflix/dgs-framework/">netflix/dgs-framework</a></br>
Type: SDL first</br>
Stars: 2.6k ⭐</br>
Last Release: 2023-02-17</br></br>Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a></br>Federation Library: <a href="https://github.com/apollographql/federation-jvm">Federation JVM</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://github.com/graphql-java-kickstart/graphql-spring-boot">GraphQL Java Kickstart (Spring Boot)</a></big></th></tr>
<tr><td>GraphQL and GraphiQL Spring Framework Boot Starters - Forked from oembedler/graphql-spring-boot due to inactivity.</br></br>Github: <a href="https://github.com/graphql-java-kickstart/graphql-spring-boot">graphql-java-kickstart/graphql-spring-boot</a></br>
Type: Schema first</br>
Stars: 1.5k ⭐</br>
Last Release: 2022-12-05</br></br>Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a></br>Federation Library: <a href="https://github.com/apollographql/federation-jvm">Federation JVM</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://github.com/ExpediaGroup/graphql-kotlin">GraphQL Kotlin</a></big></th></tr>
<tr><td>Libraries for running GraphQL in Kotlin</br></br>Github: <a href="https://github.com/ExpediaGroup/graphql-kotlin">ExpediaGroup/graphql-kotlin</a></br>
Type: Code first</br>
Stars: 1.6k ⭐</br>
Last Release: 2023-03-15</br></br>Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://docs.spring.io/spring-graphql/docs/current/reference/html/">Spring GraphQL</a></big></th></tr>
<tr><td>Spring Integration for GraphQL </br></br>Github: <a href="https://github.com/spring-projects/spring-graphql">spring-projects/spring-graphql</a></br>
Type: Schema first</br>
Stars: 1.3k ⭐</br>
Last Release: 2023-03-21</br></br>Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a></br>Federation Library: <a href="https://github.com/apollographql/federation-jvm">Federation JVM</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## JavaScript / TypeScript

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://www.apollographql.com/docs/federation/">Apollo Server</a></big></th></tr>
<tr><td>🌍  Spec-compliant and production ready JavaScript GraphQL server that lets you develop in a schema-first way. Built for Express, Connect, Hapi, Koa, and more.</br></br>Github: <a href="https://github.com/apollographql/apollo-server">apollographql/apollo-server</a></br>
Type: SDL first</br>
Stars: 13.3k ⭐</br>
Last Release: 2023-03-15</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://github.com/graphql/express-graphql">express-graphql</a></big></th></tr>
<tr><td>Create a GraphQL HTTP server with Express.</br></br>Github: <a href="https://github.com/graphql/express-graphql">graphql/express-graphql</a></br>
Type: SDL first</br>
Stars: 6.4k ⭐</br>
Last Release: 2020-11-19</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://www.the-guild.dev/graphql/yoga-server/v3/features/apollo-federation">GraphQL Yoga</a></big></th></tr>
<tr><td>The fully-featured GraphQL server with focus on easy setup, performance and great developer experience.</br></br>Github: <a href="https://github.com/dotansimha/graphql-yoga/">dotansimha/graphql-yoga</a></br>
Type: SDL first</br>
Stars: 7.5k ⭐</br>
Last Release: 2023-03-14</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://graphql-helix.vercel.app">GraphQL Helix</a></big></th></tr>
<tr><td>A highly evolved and framework-agnostic GraphQL HTTP server.</br></br>Github: <a href="https://github.com/contra/graphql-helix">contra/graphql-helix</a></br>
Type: SDL first</br>
Stars: 810 ⭐</br>
Last Release: 2022-07-09</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://mercurius.dev/#/">Mercurius</a></big></th></tr>
<tr><td>Implement GraphQL servers and gateways with Fastify</br></br>Github: <a href="https://github.com/mercurius-js/mercurius">mercurius-js/mercurius</a></br>
Type: SDL first</br>
Stars: 2.1k ⭐</br>
Last Release: 2023-02-22</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://nestjs.com">NestJS (code first)</a></big></th></tr>
<tr><td>A progressive Node.js framework for building efficient, reliable and scalable server-side applications.</br></br>Github: <a href="https://github.com/nestjs/graphql">nestjs/graphql</a></br>
Type: Code first</br>
Stars: 1.3k ⭐</br>
Last Release: 2023-03-20</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://nestjs.com">NestJS (SDL First)</a></big></th></tr>
<tr><td>A progressive Node.js framework for building efficient, reliable and scalable server-side applications.</br></br>Github: <a href="https://github.com/nestjs/graphql">nestjs/graphql</a></br>
Type: SDL first</br>
Stars: 1.3k ⭐</br>
Last Release: 2023-03-20</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br>Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://pothos-graphql.dev/docs/plugins/federation">Pothos GraphQL</a></big></th></tr>
<tr><td>Plugin based GraphQL schema builder that makes building graphql schemas with TypeScript easy, fast and enjoyable.</br></br>Github: <a href="https://github.com/hayes/pothos">hayes/pothos</a></br>
Type: Code first</br>
Stars: 1.8k ⭐</br>
Last Release: 2023-03-24</br></br>Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## PHP

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://lighthouse-php.com/">Lighthouse (Laravel)</a></big></th></tr>
<tr><td>A framework for serving GraphQL from Laravel</br></br>Github: <a href="https://github.com/nuwave/lighthouse">nuwave/lighthouse</a></br>
Type: SDL first</br>
Stars: 3.1k ⭐</br>
Last Release: 2023-03-24</br></br>Core Library: <a href="https://github.com/webonyx/graphql-php">graphql-php</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://github.com/Skillshare/apollo-federation-php">GraphQL PHP</a></big></th></tr>
<tr><td>PHP implementation of the GraphQL specification based on the reference implementation in JavaScript</br></br>Github: <a href="https://github.com/webonyx/graphql-php">webonyx/graphql-php</a></br>
Type: Code first</br>
Stars: 4.5k ⭐</br>
Last Release: 2023-03-20</br></br>Federation Library: <a href="https://github.com/Skillshare/apollo-federation-php">Apollo Federation PHP</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Python

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://ariadnegraphql.org/docs/apollo-federation">Ariadne</a></big></th></tr>
<tr><td>Python library for implementing GraphQL servers using schema-first approach.</br></br>Github: <a href="https://github.com/mirumee/ariadne">mirumee/ariadne</a></br>
Type: SDL first</br>
Stars: 2.0k ⭐</br>
Last Release: 2023-02-22</br></br>Core Library: <a href="https://github.com/graphql-python/graphql-core">GraphQL-core 3</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://graphene-python.org/">Graphene</a></big></th></tr>
<tr><td>GraphQL framework for Python</br></br>Github: <a href="https://github.com/graphql-python/graphene">graphql-python/graphene</a></br>
Type: Code first</br>
Stars: 7.6k ⭐</br>
Last Release: 2023-03-13</br></br>Core Library: <a href="https://github.com/graphql-python/graphql-core">GraphQL-core 3</a></br>Federation Library: <a href="https: //github.com/graphql-python/graphene-federation">graphene-federation</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🔲</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://strawberry.rocks">Strawberry</a></big></th></tr>
<tr><td>A GraphQL library for Python that leverages type annotations 🍓</br></br>Github: <a href="https://github.com/strawberry-graphql/strawberry">strawberry-graphql/strawberry</a></br>
Type: Code first</br>
Stars: 3.0k ⭐</br>
Last Release: 2023-03-25</br></br>Core Library: <a href="https://github.com/graphql-python/graphql-core">GraphQL-core 3</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## Ruby

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://graphql-ruby.org/">GraphQL Ruby</a></big></th></tr>
<tr><td>Ruby implementation of GraphQL </br></br>Github: <a href="https://github.com/rmosolgo/graphql-ruby">rmosolgo/graphql-ruby</a></br>
Type: Code first</br>
Stars: 5.2k ⭐</br>
Last Release: 2021-02-12</br></br>Federation Library: <a href="https://github.com/Gusto/apollo-federation-ruby/">Gusto/apollo-federation-ruby</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## Rust

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://async-graphql.github.io/async-graphql/en/apollo_federation.html">async-graphql</a></big></th></tr>
<tr><td>A GraphQL server library implemented in Rust</br></br>Github: <a href="https://github.com/async-graphql/async-graphql">async-graphql/async-graphql</a></br>
Type: Code first</br>
Stars: 2.8k ⭐</br>
Last Release: 2022-11-28</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Scala

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://ghostdogpr.github.io/caliban/docs/federation.html">Caliban</a></big></th></tr>
<tr><td>Functional GraphQL library for Scala</br></br>Github: <a href="https://github.com/ghostdogpr/caliban">ghostdogpr/caliban</a></br>
Type: Code first</br>
Stars: 861 ⭐</br>
Last Release: 2022-12-19</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🔲</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://sangria-graphql.github.io/learn/#graphql-federation">Sangria</a></big></th></tr>
<tr><td>Scala GraphQL implementation</br></br>Github: <a href="https://github.com/sangria-graphql/sangria">sangria-graphql/sangria</a></br>
Type: Code first</br>
Stars: 1.9k ⭐</br>
Last Release: 2023-03-09</br></br>Federation Library: <a href="https://github.com/sangria-graphql/sangria-federated">Sangria Federated</a></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>

## Swift

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://github.com/GraphQLSwift/Graphiti">Graphiti</a></big></th></tr>
<tr><td>The Swift GraphQL Schema framework for macOS and Linux</br></br>Github: <a href="https://github.com/GraphQLSwift/Graphiti">GraphQLSwift/Graphiti</a></br>
Type: SDL first</br>
Stars: 493 ⭐</br>
Last Release: 2023-03-19</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🟢</td></tr><tr><th><code>@interfaceObject</code></th><td>🟢</td></tr></table></td></tr>
</tbody>
</table>

## Other Solutions

<table>
<thead>
<tr><th width="300">Library</th><th>Federation 1 Support</th><th>Federation 2 Support</th></tr>
</thead>
<tbody>
<tr><th colspan="3"><big><a href="https://aws.amazon.com/appsync/">AWS AppSync</a></big></th></tr>
<tr><td>Serverless GraphQL and Pub/Sub APIs</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://dgraph.io/docs/graphql/">Dgraph</a></big></th></tr>
<tr><td>Dgraph is the native GraphQL database with a graph backend. It is open-source, scalable, distributed, highly available and lightning fast.</br></br></td><td><table><tr><th><code>_service</code></th><td>❌</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🔲</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🔲</td></tr><tr><th><code>@provides</code></th><td>🔲</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>❌</td></tr><tr><th><code>@shareable</code></th><td>🔲</td></tr><tr><th><code>@tag</code></th><td>🔲</td></tr><tr><th><code>@override</code></th><td>🔲</td></tr><tr><th><code>@inaccessible</code></th><td>🔲</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://www.the-guild.dev/graphql/mesh">GraphQL Mesh</a></big></th></tr>
<tr><td>Executable GraphQL schema from multiple data sources, query anything, run anywhere.</br></br>Github: <a href="https://github.com/Urigo/graphql-mesh">Urigo/graphql-mesh</a></br>
Type: undefined</br>
Stars: 2.8k ⭐</br>
Last Release: 2023-03-23</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🟢</td></tr><tr><th><code>repeatable @key</code></th><td>🟢</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🟢</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
<tr><th colspan="3"><big><a href="https://stepzen.com/apollo-stepzen">StepZen, an IBM Company</a></big></th></tr>
<tr><td>Build GraphQL APIs for all your data in a declarative way. Federate across any data source, including GraphQL.</br></br></td><td><table><tr><th><code>_service</code></th><td>🟢</td></tr><tr><th><code>@key (single)</code></th><td>🟢</td></tr><tr><th><code>@key (multi)</code></th><td>🟢</td></tr><tr><th><code>@key (composite)</code></th><td>🔲</td></tr><tr><th><code>repeatable @key</code></th><td>🔲</td></tr><tr><th><code>@requires</code></th><td>🟢</td></tr><tr><th><code>@provides</code></th><td>🟢</td></tr><tr><th><code>federated tracing</code></th><td>🔲</td></tr></table></td><td><table><tr><th><code>@link</code></th><td>🟢</td></tr><tr><th><code>@shareable</code></th><td>🟢</td></tr><tr><th><code>@tag</code></th><td>🟢</td></tr><tr><th><code>@override</code></th><td>🟢</td></tr><tr><th><code>@inaccessible</code></th><td>🟢</td></tr><tr><th><code>@composeDirective</code></th><td>🔲</td></tr><tr><th><code>@interfaceObject</code></th><td>🔲</td></tr></table></td></tr>
</tbody>
</table>
