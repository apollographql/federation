---
title: Federation-Compatible Subgraph Implementations
subtitle: Reference for compatible GraphQL server libraries
description: Reference for open-source GraphQL server libraries and hosted solutions that are compatible with Apollo Federation.
---

The following open-source GraphQL server libraries and hosted solutions support acting as a subgraph in a federated supergraph. Their support is tracked in Apollo's [subgraph compatibility repository](https://github.com/apollographql/apollo-federation-subgraph-compatibility). Check out the repository for details on the compatibility tests listed in the table below.

> To add a subgraph to this list, feel free to open an [issue](https://github.com/apollographql/apollo-federation-subgraph-compatibility/issues) or check out the [Apollo Federation Subgraph Maintainers Implementation Guide](https://github.com/apollographql/apollo-federation-subgraph-compatibility/blob/main/CONTRIBUTORS.md) to learn how to submit a PR for your implementation!

## Table Legend

| Icon                                                                                                                                                                              | Description                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| <img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://apollo-server-landing-page.cdn.apollographql.com/_latest/assets/favicon.png"/> | Maintained by Apollo                                 |
| 🟢                                                                                                                                                                                 | Functionality is supported                           |
| ❌                                                                                                                                                                                 | Critical functionality is NOT supported              |
| 🔲                                                                                                                                                                                 | Additional federation functionality is NOT supported |

## Ballerina

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://ballerina.io/spec/graphql">Ballerina GraphQL Module</a></big></th>
		</tr>
		<tr>
			<td>A spec-compliant, production-ready, Standard Library module for building and interacting with GraphQL APIs using Ballerina.<br/>
<br/>
Github: <a href="https://github.com/ballerina-platform/module-ballerina-graphql">ballerina-platform/module-ballerina-graphql</a><br/>
<br/>
Type: Code first<br/>
Stars: 144 ⭐<br/>
Last Release: 2024-05-03<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🔲</td></tr>
          <tr><th><code>@provides</code></th><td>🔲</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🔲</td></tr>
          <tr><th><code>@tag</code></th><td>🔲</td></tr>
          <tr><th><code>@override</code></th><td>🔲</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🔲</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## C# / .NET

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://graphql-dotnet.github.io">GraphQL for .NET</a></big></th>
		</tr>
		<tr>
			<td>GraphQL for .NET<br/>
<br/>
Github: <a href="https://github.com/graphql-dotnet/graphql-dotnet">graphql-dotnet/graphql-dotnet</a><br/>
<br/>
Type: Code first | SDL first<br/>
Stars: 5.8k ⭐<br/>
Last Release: 2024-02-06<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🔲</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>❌</td></tr>
          <tr><th><code>@shareable</code></th><td>🔲</td></tr>
          <tr><th><code>@tag</code></th><td>🔲</td></tr>
          <tr><th><code>@override</code></th><td>🔲</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🔲</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://chillicream.com/docs/hotchocolate">Hot Chocolate</a></big></th>
		</tr>
		<tr>
			<td>Open-source GraphQL server for the Microsoft .NET platform that takes the complexity away and lets you focus on delivering the next big thing.<br/>
<br/>
Github: <a href="https://github.com/ChilliCream/graphql-platform">ChilliCream/graphql-platform</a><br/>
<br/>
Type: Code first | SDL first<br/>
Stars: 4.9k ⭐<br/>
Last Release: 2024-04-22<br/>
<br/>
Federation Library: <a href="https://github.com/apollographql/federation-hotchocolate">apollographql/federation-hotchocolate</a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Elixir

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://hexdocs.pm/absinthe_federation/readme.html">Absinthe</a></big></th>
		</tr>
		<tr>
			<td>The GraphQL toolkit for Elixir<br/>
<br/>
Github: <a href="https://github.com/absinthe-graphql/absinthe">absinthe-graphql/absinthe</a><br/>
<br/>
Type: Code first<br/>
Stars: 4.2k ⭐<br/>
Last Release: 2021-09-28<br/>
<br/>
Federation Library: <a href="https://github.com/DivvyPayHQ/absinthe_federation">DivvyPayHQ/absinthe_federation</a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Go

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://gqlgen.com">gqlgen</a></big></th>
		</tr>
		<tr>
			<td>go generate based graphql server library<br/>
<br/>
Github: <a href="https://github.com/99designs/gqlgen">99designs/gqlgen</a><br/>
<br/>
Type: SDL first<br/>
Stars: 9.6k ⭐<br/>
Last Release: 2024-03-11<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://github.com/dariuszkuc/graphql#this-is-fork-of-graphql-gographql-that-adds-apollo-federation-support">GraphQL Go (fork)</a></big></th>
		</tr>
		<tr>
			<td>This is a fork of graphql-go&#x2F;graphql that adds Federation support<br/>
<br/>
Github: <a href="https://github.com/dariuszkuc/graphql">dariuszkuc/graphql</a><br/>
<br/>
Type: Code first<br/>
Stars: 2 ⭐<br/>
Last Release: 2022-11-11<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Java / Kotlin

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://netflix.github.io/dgs/federation/">dgs-framework</a></big></th>
		</tr>
		<tr>
			<td>GraphQL for Java with Spring Boot made easy.<br/>
<br/>
Github: <a href="https://github.com/netflix/dgs-framework/">netflix/dgs-framework</a><br/>
<br/>
Type: SDL first<br/>
Stars: 3.0k ⭐<br/>
Last Release: 2024-04-30<br/>
<br/>
Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a><br/>
Federation Library: <a href="https://github.com/apollographql/federation-jvm">apollographql/federation-jvm&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://github.com/graphql-java-kickstart/graphql-spring-boot">GraphQL Java Kickstart (Spring Boot)</a></big></th>
		</tr>
		<tr>
			<td>GraphQL and GraphiQL Spring Framework Boot Starters - Forked from oembedler&#x2F;graphql-spring-boot due to inactivity.<br/>
<br/>
Github: <a href="https://github.com/graphql-java-kickstart/graphql-spring-boot">graphql-java-kickstart/graphql-spring-boot</a><br/>
<br/>
Type: SDL first<br/>
Stars: 1.5k ⭐<br/>
Last Release: 2023-12-07<br/>
<br/>
Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a><br/>
Federation Library: <a href="https://github.com/apollographql/federation-jvm">apollographql/federation-jvm&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>❌</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://github.com/ExpediaGroup/graphql-kotlin">GraphQL Kotlin</a></big></th>
		</tr>
		<tr>
			<td>Libraries for running GraphQL in Kotlin<br/>
<br/>
Github: <a href="https://github.com/ExpediaGroup/graphql-kotlin">ExpediaGroup/graphql-kotlin</a><br/>
<br/>
Type: Code first<br/>
Stars: 1.7k ⭐<br/>
Last Release: 2024-04-18<br/>
<br/>
Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a><br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://docs.spring.io/spring-graphql/docs/current/reference/html/">Spring GraphQL</a></big></th>
		</tr>
		<tr>
			<td>Spring Integration for GraphQL <br/>
<br/>
Github: <a href="https://github.com/spring-projects/spring-graphql">spring-projects/spring-graphql</a><br/>
<br/>
Type: SDL first<br/>
Stars: 1.5k ⭐<br/>
Last Release: 2024-04-16<br/>
<br/>
Core Library: <a href="https://github.com/graphql-java/graphql-java">GraphQL Java</a><br/>
Federation Library: <a href="https://github.com/apollographql/federation-jvm">apollographql/federation-jvm&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## JavaScript / TypeScript

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://www.apollographql.com/docs/federation/">Apollo Server</a></big></th>
		</tr>
		<tr>
			<td>🌍  Spec-compliant and production ready JavaScript GraphQL server that lets you develop in a schema-first way. Built for Express, Connect, Hapi, Koa, and more.<br/>
<br/>
Github: <a href="https://github.com/apollographql/apollo-server">apollographql/apollo-server&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a><br/>
<br/>
Type: SDL first<br/>
Stars: 13.7k ⭐<br/>
Last Release: 2024-04-18<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://github.com/graphql/express-graphql">express-graphql</a></big></th>
		</tr>
		<tr>
			<td>Create a GraphQL HTTP server with Express.<br/>
<br/>
Github: <a href="https://github.com/graphql/express-graphql">graphql/express-graphql</a><br/>
<br/>
Type: SDL first<br/>
Stars: 6.3k ⭐<br/>
Last Release: 2020-11-19<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://www.the-guild.dev/graphql/yoga-server/v3/features/apollo-federation">GraphQL Yoga</a></big></th>
		</tr>
		<tr>
			<td>The fully-featured GraphQL server with focus on easy setup, performance and great developer experience.<br/>
<br/>
Github: <a href="https://github.com/dotansimha/graphql-yoga/">dotansimha/graphql-yoga</a><br/>
<br/>
Type: SDL first<br/>
Stars: 8.0k ⭐<br/>
Last Release: 2024-03-29<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://graphql-helix.vercel.app">GraphQL Helix</a></big></th>
		</tr>
		<tr>
			<td>A highly evolved and framework-agnostic GraphQL HTTP server.<br/>
<br/>
Github: <a href="https://github.com/contra/graphql-helix">contra/graphql-helix</a><br/>
<br/>
Type: SDL first<br/>
Stars: 831 ⭐<br/>
Last Release: 2022-07-09<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://mercurius.dev/#/">Mercurius</a></big></th>
		</tr>
		<tr>
			<td>Implement GraphQL servers and gateways with Fastify<br/>
<br/>
Github: <a href="https://github.com/mercurius-js/mercurius">mercurius-js/mercurius</a><br/>
<br/>
Type: SDL first<br/>
Stars: 2.3k ⭐<br/>
Last Release: 2024-04-22<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://nestjs.com">NestJS (code first)</a></big></th>
		</tr>
		<tr>
			<td>A progressive Node.js framework for building efficient, reliable and scalable server-side applications.<br/>
<br/>
Github: <a href="https://github.com/nestjs/graphql">nestjs/graphql</a><br/>
<br/>
Type: Code first<br/>
Stars: 1.4k ⭐<br/>
Last Release: 2024-02-07<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🔲</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://nestjs.com">NestJS (SDL First)</a></big></th>
		</tr>
		<tr>
			<td>A progressive Node.js framework for building efficient, reliable and scalable server-side applications.<br/>
<br/>
Github: <a href="https://github.com/nestjs/graphql">nestjs/graphql</a><br/>
<br/>
Type: SDL first<br/>
Stars: 1.4k ⭐<br/>
Last Release: 2024-02-07<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://pothos-graphql.dev/docs/plugins/federation">Pothos GraphQL</a></big></th>
		</tr>
		<tr>
			<td>Plugin based GraphQL schema builder that makes building graphql schemas with TypeScript easy, fast and enjoyable.<br/>
<br/>
Github: <a href="https://github.com/hayes/pothos">hayes/pothos</a><br/>
<br/>
Type: Code first<br/>
Stars: 2.2k ⭐<br/>
Last Release: 2024-04-17<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## PHP

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://lighthouse-php.com/">Lighthouse (Laravel)</a></big></th>
		</tr>
		<tr>
			<td>A framework for serving GraphQL from Laravel<br/>
<br/>
Github: <a href="https://github.com/nuwave/lighthouse">nuwave/lighthouse</a><br/>
<br/>
Type: SDL first<br/>
Stars: 3.3k ⭐<br/>
Last Release: 2024-05-01<br/>
<br/>
Core Library: <a href="https://github.com/webonyx/graphql-php">webonyx/graphql-php</a><br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://github.com/Skillshare/apollo-federation-php">GraphQL PHP</a></big></th>
		</tr>
		<tr>
			<td>PHP implementation of the GraphQL specification based on the reference implementation in JavaScript<br/>
<br/>
Github: <a href="https://github.com/webonyx/graphql-php">webonyx/graphql-php</a><br/>
<br/>
Type: Code first<br/>
Stars: 4.6k ⭐<br/>
Last Release: 2024-03-11<br/>
<br/>
Federation Library: <a href="https://github.com/Skillshare/apollo-federation-php">Skillshare/apollo-federation-php</a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>❌</td></tr>
          <tr><th><code>@shareable</code></th><td>🔲</td></tr>
          <tr><th><code>@tag</code></th><td>🔲</td></tr>
          <tr><th><code>@override</code></th><td>🔲</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🔲</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Python

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://ariadnegraphql.org/docs/apollo-federation">Ariadne</a></big></th>
		</tr>
		<tr>
			<td>Python library for implementing GraphQL servers using schema-first approach.<br/>
<br/>
Github: <a href="https://github.com/mirumee/ariadne">mirumee/ariadne</a><br/>
<br/>
Type: SDL first<br/>
Stars: 2.1k ⭐<br/>
Last Release: 2024-03-18<br/>
<br/>
Core Library: <a href="https://github.com/graphql-python/graphql-core">GraphQL-core 3</a><br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://graphene-python.org/">Graphene</a></big></th>
		</tr>
		<tr>
			<td>GraphQL framework for Python<br/>
<br/>
Github: <a href="https://github.com/graphql-python/graphene">graphql-python/graphene</a><br/>
<br/>
Type: Code first<br/>
Stars: 8.0k ⭐<br/>
Last Release: 2023-07-26<br/>
<br/>
Core Library: <a href="https://github.com/graphql-python/graphql-core">GraphQL-core 3</a><br/>
Federation Library: <a href="https://github.com/graphql-python/graphene-federation">graphql-python/graphene-federation</a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://strawberry.rocks">Strawberry</a></big></th>
		</tr>
		<tr>
			<td>A GraphQL library for Python that leverages type annotations 🍓<br/>
<br/>
Github: <a href="https://github.com/strawberry-graphql/strawberry">strawberry-graphql/strawberry</a><br/>
<br/>
Type: Code first<br/>
Stars: 3.8k ⭐<br/>
Last Release: 2024-05-01<br/>
<br/>
Core Library: <a href="https://github.com/graphql-python/graphql-core">GraphQL-core 3</a><br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Ruby

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://graphql-ruby.org/">GraphQL Ruby</a></big></th>
		</tr>
		<tr>
			<td>Ruby implementation of GraphQL <br/>
<br/>
Github: <a href="https://github.com/rmosolgo/graphql-ruby">rmosolgo/graphql-ruby</a><br/>
<br/>
Type: Code first<br/>
Stars: 5.3k ⭐<br/>
Last Release: 2021-02-12<br/>
<br/>
Federation Library: <a href="https://github.com/Gusto/apollo-federation-ruby/">Gusto/apollo-federation-ruby</a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Rust

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://async-graphql.github.io/async-graphql/en/apollo_federation.html">async-graphql</a></big></th>
		</tr>
		<tr>
			<td>A GraphQL server library implemented in Rust<br/>
<br/>
Github: <a href="https://github.com/async-graphql/async-graphql">async-graphql/async-graphql</a><br/>
<br/>
Type: Code first<br/>
Stars: 3.2k ⭐<br/>
Last Release: 2022-11-28<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Scala

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://ghostdogpr.github.io/caliban/docs/federation.html">Caliban</a></big></th>
		</tr>
		<tr>
			<td>Functional GraphQL library for Scala<br/>
<br/>
Github: <a href="https://github.com/ghostdogpr/caliban">ghostdogpr/caliban</a><br/>
<br/>
Type: Code first<br/>
Stars: 939 ⭐<br/>
Last Release: 2024-04-16<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://sangria-graphql.github.io/learn/#graphql-federation">Sangria</a></big></th>
		</tr>
		<tr>
			<td>Scala GraphQL implementation<br/>
<br/>
Github: <a href="https://github.com/sangria-graphql/sangria">sangria-graphql/sangria</a><br/>
<br/>
Type: Code first<br/>
Stars: 2.0k ⭐<br/>
Last Release: 2024-02-01<br/>
<br/>
Federation Library: <a href="https://github.com/sangria-graphql/sangria-federated">sangria-graphql/sangria-federated</a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Swift

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://github.com/GraphQLSwift/Graphiti">Graphiti</a></big></th>
		</tr>
		<tr>
			<td>The Swift GraphQL Schema framework for macOS and Linux<br/>
<br/>
Github: <a href="https://github.com/GraphQLSwift/Graphiti">GraphQLSwift/Graphiti</a><br/>
<br/>
Type: SDL first<br/>
Stars: 523 ⭐<br/>
Last Release: 2023-11-15<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>

## Other Solutions

<table>
  <thead>
    <tr>
      <th width="300">Library</th>
      <th>Federation 1 Support</th>
      <th>Federation 2 Support</th>
    </tr>
  </thead>
	<tbody>
		<tr>
			<th colspan="3"><big><a href="https://aws.amazon.com/appsync/">AWS AppSync</a></big></th>
		</tr>
		<tr>
			<td>Serverless GraphQL and Pub&#x2F;Sub APIs<br/>
<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://dgraph.io/docs/graphql/">Dgraph</a></big></th>
		</tr>
		<tr>
			<td>Dgraph is the native GraphQL database with a graph backend. It is open-source, scalable, distributed, highly available and lightning fast.<br/>
<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>❌</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🔲</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🔲</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🔲</td></tr>
          <tr><th><code>@requires</code></th><td>🔲</td></tr>
          <tr><th><code>@provides</code></th><td>🔲</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>❌</td></tr>
          <tr><th><code>@shareable</code></th><td>🔲</td></tr>
          <tr><th><code>@tag</code></th><td>🔲</td></tr>
          <tr><th><code>@override</code></th><td>🔲</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🔲</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://grafbase.com/docs">Grafbase</a></big></th>
		</tr>
		<tr>
			<td>The GraphQL platform<br/>
<br/>
Github: <a href="https://github.com/grafbase/grafbase">grafbase/grafbase</a><br/>
<br/>
Type: Code first | SDL first<br/>
Stars: 934 ⭐<br/>
Last Release: 2024-02-23<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>❌</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://www.the-guild.dev/graphql/mesh">GraphQL Mesh</a></big></th>
		</tr>
		<tr>
			<td>Executable GraphQL schema from multiple data sources, query anything, run anywhere.<br/>
<br/>
Github: <a href="https://github.com/Urigo/graphql-mesh">Urigo/graphql-mesh</a><br/>
<br/>

Stars: 3.2k ⭐<br/>
Last Release: 2024-04-30<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://neo4j.com/docs/graphql-manual/current/">Neo4J Graph Database</a></big></th>
		</tr>
		<tr>
			<td>A GraphQL to Cypher query execution layer for Neo4j and JavaScript GraphQL implementations.<br/>
<br/>
Github: <a href="https://github.com/neo4j/graphql">neo4j/graphql</a><br/>
<br/>
Type: Code first | SDL first<br/>
Stars: 485 ⭐<br/>
Last Release: 2024-04-30<br/>
<br/>
Core Library: <a href="https://www.npmjs.com/package/graphql">GraphQL.js</a><br/>
Federation Library: <a href="https://www.npmjs.com/package/@apollo/subgraph">Apollo Subgraph&nbsp;&nbsp;<img style="display:inline-block; height:1em; width:auto;" alt="Maintained by Apollo" src="https://raw.githubusercontent.com/apollographql/apollo-federation-subgraph-compatibility/d7829ef89441c337749bf6538711a642cfa2689c/docs/assets/horizon_logo.png"/></a>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🟢</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🟢</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🟢</td></tr>
          <tr><th><code>federated tracing</code></th><td>🟢</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🟢</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🟢</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://stepzen.com/apollo-stepzen">StepZen, an IBM Company</a></big></th>
		</tr>
		<tr>
			<td>Build GraphQL APIs for all your data in a declarative way. Federate across any data source, including GraphQL.<br/>
<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🔲</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🔲</td></tr>
          <tr><th><code>@requires</code></th><td>🟢</td></tr>
          <tr><th><code>@provides</code></th><td>🔲</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🟢</td></tr>
          <tr><th><code>@tag</code></th><td>🟢</td></tr>
          <tr><th><code>@override</code></th><td>🟢</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🟢</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
		<tr>
			<th colspan="3"><big><a href="https://hasura.io">Hasura</a></big></th>
		</tr>
		<tr>
			<td>Hasura lets you effortlessly connect all your databases, services, and code into a unified data graph, and expose it via one powerful supergraph API with unparalleled composability and speed.<br/>
<br/>
      GitHub: <a href="https://github.com/hasura/graphql-engine">hasura/graphql-engine</a><br/>
      Stars: 31k ⭐<br/>
<br/>
      </td>
      <td>
        <table>
          <tr><th><code>_service</code></th><td>🟢</td></tr>
          <tr><th><code>@key (single)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (multi)</code></th><td>🟢</td></tr>
          <tr><th><code>@key (composite)</code></th><td>🔲</td></tr>
          <tr><th><code>repeatable @key</code></th><td>🔲</td></tr>
          <tr><th><code>@requires</code></th><td>🔲</td></tr>
          <tr><th><code>@provides</code></th><td>🔲</td></tr>
          <tr><th><code>federated tracing</code></th><td>🔲</td></tr>
        </table>
      </td>
      <td>
        <table>
          <tr><th><code>@link</code></th><td>🟢</td></tr>
          <tr><th><code>@shareable</code></th><td>🔲</td></tr>
          <tr><th><code>@tag</code></th><td>🔲</td></tr>
          <tr><th><code>@override</code></th><td>🔲</td></tr>
          <tr><th><code>@inaccessible</code></th><td>🔲</td></tr>
          <tr><th><code>@composeDirective</code></th><td>🔲</td></tr>
          <tr><th><code>@interfaceObject</code></th><td>🔲</td></tr>
        </table>
      </td>
    </tr>
  </tbody>
</table>
