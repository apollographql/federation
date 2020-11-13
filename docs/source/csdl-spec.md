---
title: CSDL Specification
sidebar_title: CSDL Specification
description: The Composed Schema Definition Language
status: Draft
version: "1.0.0"
authors: 
  - Jake Dawkins <jake@apollographql.com>
  - Trevor Scheer <trevor@apollographql.com>
  - Ashi Krishnan <ashi@apollographql.com>
---

## Introduction: What is CSDL?

The Composed Schema Definition Language (CSDL) provides a way to describe a GraphQL Schema which is composed from one or more other GraphQL schemas.

The CSDL is intended to be a single artifact which can power a graph router. For example, the CSDL replaces the service list configuration of Apollo Gateway.

CSDL is a subset of the [GraphQL Schema Definition Language](https://spec.graphql.org/). It removes certain SDL features (for instance, type extensions are not permitted) while also requiring the definition of certain types and providing a suite of directives to describe graph topology. In particular, a CSDL can:
- define [subgraphs](#subgraph) and bind them to [endpoints](#endpoint) (with the required [`csdl_Graph`](#csdl_Graph) type and [`@csdl_endpoint`](#csdl_endpoint) directive)
- assign fields to subgraphs (with [`@csdl_resolve`](#resolve))
- declare additional data required and provided by subgraph field resolvers (with [`@csdl_key`](#key), and [`@csdl_resolve`](#csdl_resolve))

## How to read this document

TK, discussion of spec nomenclature
e.g.: https://html.spec.whatwg.org/multipage/introduction.html#how-to-read-this-specification

### What this document isn't

This document specifies the CSDL and only the CSDL. It does not have an opinion about how CSDL should be generated from subgraphs. A suggestion is provided in [Appendix: Basic Composition Algorithm](#appendix-suggested-composition-algorithm), but conforming implementations may choose approach they like.

## Example: Let's go to the moon

*This section is non-normative.*

We'll refer to this example throughout the document. The example consists of two example schemas—a `rockets` schema which serves data about rockets, and an `astronauts` service which services queries regarding the people flying on them—along with a CSDL that composes them.

### Rockets

<a name=ex-rockets href=#ex-rockets class='listing not-csdl'>Rockets example service</a>
```graphql
# Rockets Service
type Query {
  rockets: [Rocket]!
}

type Rocket @key(fields: "id") {
  id: String! 
  name: String!
  captain: Astronaut @provides(fields: "tripId")
}

extend type Astronaut @key(fields: "id") {
  id: String! @external
  tripId: String! @external
  rocket: Rocket!
}
```

### Astronauts

<a name=ex-astronauts href=#ex-astronauts class='listing not-csdl'>Astronauts example service</a>

```graphql
# Astronauts Service
type Query {
  astronauts: [Astronaut]!
}

type Astronaut @key(fields: "id") {
  id: String! 
  name: String!
  tripId: String!
}

extend type Rocket @key(fields: "id") {
  id: String! @external
  astronaut: Astronaut!
}
```

### CSDL: Rockets & Astronauts

This example is non-normative, and represents just one possible way to compose [rockets](#rockets) and [astronauts](#astronauts) into CSDL.

<a name=ex-rockets-and-astronauts href=#ex-rockets-and-astronauts class=listing>Example CSDL composing `rockets` and `astronauts`</a>
```graphql
schema @csdl(version: "^1") {
  query: Query
}

enum csdl_Graph {
  ROCKETS    @csdl_endpoint(url: "https://rockets.api.com"),
  ASTRONAUTS @csdl_endpoint(url: "https://astronauts.api.com"),
}

type Query {
  rockets: [Rocket]!       @csdl_resolve(graph: ROCKETS)
  astronauts: [Astronaut]! @csdl_resolve(graph: ASTRONAUTS)
}

type Astronaut
  @csdl_key(graph: ASTRONAUTS, repr: "{ id }")
  @csdl_key(graph: ROCKETS, repr: "{ id }")
{
  id: String!     @csdl_resolve(graph: ASTRONAUTS)
  name: String!   @csdl_resolve(graph: ASTRONAUTS)
  tripId: String! @csdl_resolve(graph: ASTRONAUTS)
  rocket: Rocket! @csdl_resolve(graph: ASTRONAUTS)
}

type Rocket 
  @csdl_key(graph: ASTRONAUTS, repr: "{ id }")
  @csdl_key(graph: ROCKETS, repr: "{ id }")
{
  id: String!           @csdl_resolve(graph: ROCKETS)
  name: String!         @csdl_resolve(graph: ROCKETS)
  astronaut: Astronaut! @csdl_resolve(graph: ASTRONAUTS)
  captain: Astronaut    @csdl_resolve(graph: ASTRONAUTS,
                                      provides: "{ tripId }")
}
```

The meaning of these directives is explored the [Directives](#directives) section.

## Composition Pipeline Roles

```mermaid
flowchart TB
    subgraph A [subgraph A]
      schemaA([schema A])
      endpointA([endpoint A])
    end    
    subgraph B [subgraph B]
      schemaB([schema B])
      endpointB([endpoint B])
    end
    subgraph C [subgraph C]
      schemaC([schema C])
      endpointC([endpoint C])
    end
    subgraph Producer
      Composer
    end
    subgraph csdl
      CSDL
    end
    subgraph Consumer
      Router
    end    
    A-->Composer
    B-->Composer
    C-->Composer
    Composer-->CSDL
    CSDL-->Router
    Router-->Clients
    Clients-->Router
```

- **Producer** the bit that generates CSDL. spec will place requirements on composers.
- **Consumer** the bit that consumes CSDL. spec will place requirements on consumers.
- **Composer** a kind of producer which composes subgraph schemas into CSDL. (no requirements on consumers, diagrammed for clarity.)
- **Subgraphs** subgraphs which are composed by the composer (no requirements on subgraphs, diagrammed for clarity.)
- **Router** a kind of consumer which serves CSDL as a graphql endpoint. no requirements on routers, these are described in the federation spec.

## Structure

A CSDL document must be a valid [GraphQL schema definition language](https://spec.graphql.org/draft/#sec-Type-System) document.

CSDL removes certain SDL features, as described in the [divergence](#divergence-from-graphql-sdl) section. Nevertheless, CSDL consumers **should** be prepared to parse any valid GraphQL SDL. A CSDL document which contains disallowed SDL constructs **should** trigger validation errors after parsing.

CSDL introduces a suite of types and directives. All CSDL-specific types and directives are prefixed with `csdl_` as recommended in [the GraphQL specification](https://spec.graphql.org/draft/#note-ca863).

### Divergence from GraphQL SDL
Formally, CSDL is a subset of the [GraphQL schema definition language](https://spec.graphql.org/draft/#sec-Type-System).

In particular, CSDL differs from GraphQL SDL in the following ways:
- **Extensions are forbidden.** You cannot `extend type` or `extend interface` within a CSDL document.
- **`schema @csdl(version:)` is mandatory.** Conforming CSDL documents must have a `schema` declaration which must be annotated with a `@csdl` directive specifying, at a minimum, the semver for the CSDL spec in use.
- the CSDL must define certain types as described in the [mandatory types](#mandatory-types) section.

### Mandatory Types

A CSDL document **must** define a `csdl_Graph` enum. Each enum value defines a subgraph. Each value **must** be annotated with a `@csdl_endpoint` directive specifying the endpoint URL for the subgraph.

```graphql
enum csdl_Graph {
  ROCKETS @csdl_endpoint(url: "https://rockets.api.com"),
  ASTRONAUTS @csdl_endpoint(url: "https://astronauts.api.com"),
}
```

The `csdl_Graph` enum is used as input to csdl directives which link fields and types to subgraphs.

## Scalars

### `scalar csdl_SelectionSet`

A GraphQL selection set represented with the same syntax as defined in [the GraphQL SDL](https://spec.graphql.org/draft/#sec-Selection-Sets).

Note: Unlike the federation `_FieldSet` scalar, a `csdl_SelectionSet` must parse as a GraphQL selection set, so the selections must be surrounded by braces.

### `scalar csdl_Url`

A [URL](https://www.w3.org/Addressing/URL/url-spec.html).

### `scalar csdl_Version`

A [Semantic versioning 2.0.0](https://semver.org/spec/v2.0.0.html) verison or range.

## Data Model
TK, draws heavily from federation, a little more general.

### Realized types

A type is *realized* wherever a resolver from a particular *subgraph* returns that type. We use the notation `subgraph::Type` to represent `Type` realized by `subgraph` and `subgraph::Type.field` to represent the resolver for `Type.field` within `subgraph`.

<a class="listing">Query with resolvers and realized types</a>
```graphql
query {          # resolver                    | realizes
                 # ----------------------------|--------------
  rockets {      # rockets::Query.rockets     -> rockets::Rocket
    captain {    # rockets::Rocket.astronaut  -> rockets::Astronaut
      name       # astronauts::Astronaut.name -> String
      rocket {   # rockets::Astronaut.rocket  -> rockets::Rocket
        id       # rockets::Rocket.id         -> ID
      }
    }
  }

}
```

These distinctions are immaterial to the client. As far as clients are concerned, all selections on `Rocket` are the same.

This illusion is maintained by the router, which must break incoming queries into subqueries. In the example above, the path `rockets.captain` is resolved by the `rockets::Rocket.astronaut` resolver, so its selection set is realized as a `rockets::Astronaut`. However, there is no `name` field for `rockets::Astronaut`—instead, the only resolver for `Astronaut.name` is `astronauts::Astronaut.name`. To process this query, the router must "convert" a `rockets::Astronaut` to an `astronauts::Astronaut` via an `_entities` query.

### Portability
A type is *portable to* a subgraph if it has a `@csdl_key` for that subgraph.

### Free / Bound fields

Free fields can be resolved by any subgraph, bound fields can only be resolved by the subgraph they're bound to.

## Directives
### `@csdl`
<code class='grammar'>
directive @csdl(version: csdl_Version!) on SCHEMA
</code>

Specify the version of CSDL needed by this document.

<a class="listing">Using `@csdl` to specify the CSDL version for the document</a>

```graphql
schema @csdl(version: "^1") {
  query: Query
}
```

### `@csdl_key`
<code class="grammar">
directive @csdl_key(graph: csdl_Graph!, repr: csdl_SelectionSet!)
  repeatable on OBJECT
</code>

Define an entity key for this type within a subgraph.

The `@csdl_key` directive tells consumers what subset of fields are necessary to identify this type of entity to a particular subgraph. It provides a way for csdl consumers to "switch graphs" when planning a query. For example:

<a name=query-port-astronaut-type href=#query-port-astronaut-type class=listing>A query which requires porting the Astronaut type between services</a>
```graphql
query {          # resolver                    | realizes
                 # ----------------------------|--------------
  rockets {      # rockets::Query.rockets     -> rockets::Rocket
    captain {    # rockets::Rocket.astronaut  -> rockets::Astronaut
      name       # astronauts::Astronaut.name -> String
      rocket {   # rockets::Astronaut.rocket  -> rockets::Rocket
        id       # rockets::Rocket.id         -> ID
      }
    }
  }
  
}
```

`Astronaut.name` is provided by the `astronauts` subgraph. But the `captain` field is provided by the `rockets` subgraph.

The fields specified in `repr` will be passed to the subgraph's `Query._entities(representations:)` as an item within the `representations` list.

Multiple `@csdl_key`s can be provided for different graphs, or for the same graph.

<a name=using-csdl_key href=#using-csdl_key class=listing>Using `@csdl_key` to specify subgraph keys</a>

```graphql
type Astronaut
  @csdl_key(graph: ASTRONAUTS, repr: "{ id }")
  @csdl_key(graph: ROCKETS, repr: "{ id }")
{ ... }
```

### `@csdl_endpoint`
<code class='grammar'>
directive @csdl_endpoint(url: csdl_Url) on ENUM_VALUE
</code>

Bind an endpoint URL to a subgraph. This directive is only valid on enum values within the required `csdl_Graph` enum type.

<a name=using-csdl_endpoint href=#using-csdl_endpoint class="listing">Using `@csdl_endpoint` to specify subgraph endpoints</a>

```graphql
enum csdl_Graph {
  ROCKETS @csdl_endpoint(url: "https://rockets.api.com"),
  ASTRONAUTS @csdl_endpoint(url: "https://astronauts.api.com"),
}
```

### `@csdl_resolve`
<code class='grammar'>
directive @csdl_resolve(
  graph: csdl_Graph!,
  requires: csdl_SelectionSet,
  provides: csdl_SelectionSet) on FIELD_DEFINITION
</code>

Bind a subgraph resolver to this field.

Any field definitions without a `@csdl_resolve` directive are *free*. That is, the CSDL asserts they can be resolved by any subgraph in which the parent type can be found. Specifying `@csdl_resolve` binds a field to resolve in exactly one subgraph. Unless it is a root type, the enclosing type **must** be [portable](#portability) to the specified subgraph (it must have `@csdl_key`s specified for that graph).

<a name=using-csdl_resolve href=#using-csdl_resolve class=listing>Using `@csdl_resolve` to specify subgraph resolvers</a>

```graphql
type Astronaut
  @csdl_key(graph: ASTRONAUTS, fields: "{ id }")
  @csdl_key(graph: ROCKETS, fields: "{ id }")
{
  id: String!     @csdl_resolve(graph: ASTRONAUTS)
  name: String!   @csdl_resolve(graph: ASTRONAUTS)
  tripId: String! @csdl_resolve(graph: ASTRONAUTS)
  rocket: Rocket! @csdl_resolve(graph: ASTRONAUTS)
}

type Rocket 
  @csdl_key(fields: "{ id }", graph: ASTRONAUTS)
  @csdl_key(fields: "{ id }", graph: ROCKETS)
{
  id: String!           @csdl_resolve(graph: ROCKETS)
  name: String!         @csdl_resolve(graph: ROCKETS)
  astronaut: Astronaut! @csdl_resolve(graph: ASTRONAUTS)
  captain: Astronaut    @csdl_resolve(graph: ASTRONAUTS,
                                      provides: "{ tripId }")
}
```

Fields on root types must always be bound to a subgraph:

<a name=using-csdl_resolve-root href=#using-csdl_resolve-root class=listing>`@csdl_resolve` on root type fields</a>

```graphql
type Query {
  rockets: [Rocket]!       @csdl_resolve(graph: ROCKETS)
  astronauts: [Astronaut]! @csdl_resolve(graph: ASTRONAUTS)
}
```

## Validations

### validate all fields resolvable
### validate no extensions
### validate csdl version
### validate all fields resolvable


## Glossary
#### Endpoint
An endpoint is a running server which can resolve GraphQL queries against a schema. In this version of the spec, endpoints must be URLs, typically http/https URLs.
#### Graph Router
A GraphQL server which can resolve queries against a CSDL schema. Graph routers differ from standard GraphQL endpoints in that they are not expected to process data or communicate with (non-GraphQL) backend services on their own. Instead, graph routers receive GraphQL requests and service them by performing additional GraphQL requests.
#### Subgraph
Subgraphs are the GraphQL schemas which were composed to form the CSDL. A subgraph has:
  - a name, which must be unique within the CSDL
  - an [endpoint](#endpoint)

## Appendix: Suggested Composition Algorithm

TK


<style>
  html {
    /* SpaceKit colors from https://space-kit.netlify.app/ */
    
    /** Brand colors **/    
    --pink-darkest: rgb(102, 31, 78);
    --pink-darker: rgb(131, 35, 99);
    --pink-dark: rgb(196, 57, 151);
    --pink-base: rgb(242, 92, 193);
    --pink-light: rgb(255, 163, 224);
    --pink-lighter: rgb(255, 212, 241);
    --pink-lightest: rgb(255, 230, 247);
    --teal-darkest: rgb(31, 102, 100);
    --teal-darker: rgb(29, 123, 120);
    --teal-dark: rgb(38, 162, 157);
    --teal-base: rgb(65, 217, 211);
    --teal-light: rgb(139, 246, 242);
    --teal-lighter: rgb(198, 255, 253);
    --teal-lightest: rgb(230, 255, 254);
    --indigo-darkest: rgb(45, 31, 102);
    --indigo-darker: rgb(49, 28, 135);
    --indigo-dark: rgb(63, 32, 186);
    --indigo-base: rgb(113, 86, 217);
    --indigo-light: rgb(173, 155, 246);
    --indigo-lighter: rgb(217, 207, 255);
    --indigo-lightest: rgb(235, 230, 255);

    /** Neutrals **/
    --black-darker: rgb(18, 21, 26);
    --black-dark: rgb(20, 23, 28);
    --black-base: rgb(25, 28, 35);
    --black-light: rgb(34, 38, 46);
    --black-lighter: rgb(47, 53, 63);
    --grey-darker: rgb(66, 72, 85);
    --grey-dark: rgb(90, 98, 112);
    --grey-base: rgb(119, 127, 142);
    --grey-light: rgb(149, 157, 170);
    --grey-lighter: rgb(178, 185, 195);
    --silver-darker: rgb(202, 208, 216);
    --silver-dark: rgb(222, 226, 231);
    --silver-base: rgb(235, 238, 240);
    --silver-light: rgb(244, 246, 248);
    --silver-lighter: rgb(252, 253, 255);

    /** Interface Colors **/
    --red-darkest: rgb(102, 31, 31);
    --red-darker: rgb(120, 28, 28);
    --red-dark: rgb(156, 35, 35);
    --red-base: rgb(209, 59, 59);
    --red-light: rgb(241, 134, 134);
    --red-lighter: rgb(255, 195, 195);
    --red-lightest: rgb(255, 230, 230);
    --green-darkest: rgb(20, 94, 51);
    --green-darker: rgb(19, 108, 56);
    --green-dark: rgb(28, 132, 72);
    --green-base: rgb(54, 173, 104);
    --green-light: rgb(126, 217, 164);
    --green-lighter: rgb(190, 244, 213);
    --green-lightest: rgb(230, 255, 240);
    --blue-darkest: rgb(22, 60, 102);
    --blue-darker: rgb(15, 65, 122);
    --blue-dark: rgb(16, 83, 160);
    --blue-base: rgb(32, 117, 214);
    --blue-light: rgb(116, 176, 244);
    --blue-lighter: rgb(187, 219, 255);
    --blue-lightest: rgb(240, 247, 255);

    /** Alternate Colors **/
    --orange-darkest: rgb(102, 63, 31);
    --orange-darker: rgb(136, 76, 30);
    --orange-dark: rgb(180, 102, 38);
    --orange-base: rgb(245, 145, 64);
    --orange-light: rgb(255, 193, 143);
    --orange-lighter: rgb(255, 226, 202);
    --orange-lightest: rgb(255, 241, 230);
    --yellow-darkest: rgb(102, 80, 31);
    --yellow-darker: rgb(132, 103, 29);
    --yellow-dark: rgb(180, 143, 37);
    --yellow-base: rgb(244, 208, 63);
    --yellow-light: rgb(255, 232, 142);
    --yellow-lighter: rgb(255, 244, 202);
    --yellow-lightest: rgb(255, 250, 230);
    --purple-darkest: rgb(66, 22, 102);
    --purple-darker: rgb(82, 21, 132);
    --purple-dark: rgb(113, 30, 180);
    --purple-base: rgb(162, 61, 245);
    --purple-light: rgb(205, 143, 255);
    --purple-lighter: rgb(232, 204, 255);
    --purple-lightest: rgb(244, 230, 255);
    --blilet-darkest: rgb(27, 34, 64);
    --blilet-darker: rgb(37, 46, 80);
    --blilet-dark: rgb(60, 74, 133);
    --blilet-base: rgb(81, 104, 194);
    --blilet-light: rgb(122, 146, 240);
    --blilet-lighter: rgb(176, 190, 247);
    --blilet-lightest: rgb(230, 235, 255);
    --midnight-darkest: rgb(6, 15, 47);
    --midnight-darker: rgb(27, 34, 64);
    --midnight-dark: rgb(56, 61, 91);
    --midnight-base: rgb(61, 75, 106);
    --midnight-light: rgb(86, 105, 146);
    --midnight-lighter: rgb(121, 143, 187);
    --midnight-lightest: rgb(180, 195, 219);    
  }

  /** Dark "theme" **/

  body {
    transition: background 1s, color 1s;
    background: var(--midnight-darkest);
    color: var(--grey-lighter);
  }

  hr {
    background-color: var(--grey-darker) !important;
  }

  main > header > div {
    background: none !important;
    backdrop-filter: blur(20px);
  }

  aside {
    border: none !important;
  }

  h1 { color: var(--silver-dark); }

  h2 {
    color: var(--grey-lighter);
  }

  h3, h4 {
    color: var(--grey-light) !important;
  }

  .algolia-autocomplete, button, a[href="https://www.apollographql.com/docs/"] {
    filter: invert(100%) hue-rotate(180deg);    
  }

  .algolia-autocomplete {
    background: rgba(255, 255, 255, 0.6) !important;
    box-shadow: 5px 5px 10px rgba(255, 255, 255, 0.5);
  }

  input { 
    background: rgba(255, 255, 255, 0.2) !important;
  }

  .gatsby-highlight {
    filter: invert(100%) hue-rotate(180deg);
  }

  .gatsby-highlight > div:first-of-type {
    border: none;
  }

  :not(pre) > code[class*="language-"] {
    background: none;
    /* border: 1px solid var(--blue-light); */
    color: var(--silver-base);
    padding: 0;
  }

  a[href]:not([class]) {
    color: var(--blue-base) !important;
  }

  .not-csdl::after {
    content: "Note: Code is GraphQL SDL, not CSDL.";
    font-size: 80%;
    line-height: 125%;
    color: var(--yellow-base);
    padding: 4px;
    /* border: 1px solid var(--yellow-base); */
    border-radius: 9px;
    margin-left: 3em;
  }

  /** Section numbering **/

  body {
    counter-reset: section subsection listing;
  }

  h2 {
    counter-increment: section;
    counter-reset: subsection listing;
  }

  h3 {
    counter-increment: subsection;
  }

  .headerLink {
    position: relative;
  }

  .headingLink::before {
    position: absolute;
    bottom: 0;
    transform: translateX(-100%);
    margin-left: -20px;

    content: counter(section);
    color: var(--grey-darker);
    text-align: right;
    line-height: inherit;
  }

  h3 > .headingLink::before {
    content: counter(section) "." counter(subsection)
  }

  a.listing {
    display: block;
    position: relative;
    margin-bottom: -3.8em;
    font-size: 90%;
    color: var(--grey-base);
    text-decoration: none;
  }

  a.listing::before {
    position: absolute;
    bottom: 0;
    transform: translateX(-100%);
    margin-left: -20px;
    
    counter-increment: listing;
    content: "Code " counter(section) "." counter(subsection) "." counter(listing);
    color: var(--grey-dark);
  }

  code.grammar {
    white-space: pre;
    margin: 0;
    margin-bottom: 1em;
    display: block;
  }
</style>
