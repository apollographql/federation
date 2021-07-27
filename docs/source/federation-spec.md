---
title: Apollo Federation specification
sidebar_title: Federation specification
description: For implementing federation in other languages
---

> This specification is provided to help developers add Apollo Federation support to GraphQL servers that don't yet support it. It's also available for anyone curious about the inner workings of federation. It is _not_ required for using or understanding federation when using Apollo Server.

For a GraphQL server to be considered a federation-capable [subgraph](./#architecture), it **must**:

* Implement the [federation schema specification](#federation-schema-specification)
* Support [fetching subgraph capabilities](#fetch-subgraph-capabilities)
* Implement [stub type generation](#create-stub-types) for references
* Implement [request resolving for entities](#resolve-requests-for-entities)

## Federation schema specification

To act as a subgraph, a GraphQL server must add the following definitions to its schema to allow the gateway to use the subgraph for execution:

```graphql
scalar _Any
scalar _FieldSet

# a union of all types that use the @key directive
union _Entity

type _Service {
  sdl: String
}

extend type Query {
  _entities(representations: [_Any!]!): [_Entity]!
  _service: _Service!
}

directive @external on FIELD_DEFINITION
directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE

# this is an optional directive discussed below
directive @extends on OBJECT | INTERFACE
```

For more information on these additions, see the [glossary](#schema-modifications-glossary).

## Fetch subgraph capabilities

Schema composition at the gateway requires having each subgraph's schema, annotated with its federation configuration. This information is fetched from each subgraph using `_service`, an enhanced introspection entry point added to the query root of each subgraph.

> Note that the `_service` field is not exposed by the gateway. It is solely for internal use.

The `_service` resolver must return the `_Service` type, which has a single field: `sdl`. This SDL (schema definition language) is a printed version of the subgraph's schema, **including** all annotations of federation-specific directives (`@key`, `@provides`, etc.). This SDL does **not** include the additions from the [federation schema specification](#federation-schema-specification).

Given an input like this:

```graphql
extend type Query {
  me: User
}

type User @key(fields: "id") {
  id: ID!
}
```

The generated SDL should match the input exactly, with no additions. It is important to preserve type extensions and directive locations, and to omit the federation types.

Some libraries (such as `graphql-java`) don't have native support for type extensions in their printer. Apollo Federation supports using an `@extends` directive in place of `extend type` to annotate type references:

```graphql{1}
type User @key(fields: "id") @extends {
  id: ID! @external
  reviews: [Review]
}
```

## Create stub types

Individual subgraphs should be runnable _without_ having the entire graph present. Fields marked with `@external` are declarations of fields that are defined in another service.

All fields referred to in `@key`, `@requires`, and `@provides` directives must have corresponding `@external` fields in the same subgraph. This allows us to be explicit about dependencies on another subgraph. Supergraph composition verifies that an `@external` field matches the original field definition, which can catch mistakes or migration issues (when the original field changes its type for example).

`@external` fields also give a subgraph the type information it needs to validate and decode incoming representations (this is especially important for custom scalars), without requiring the composed graph schema to be available at runtime in each subgraph.

A subgraph should create `@external` fields and types locally so the subgraph can run on its own.

## Resolve requests for entities

Execution of a federated graph requires being able to "enter" into a subgraph via an entity type. To do this, every subgraph must do the following:

* Make each entity in its schema part of the `_Entity` union
* Implement the `_entities` field on the query root

To implement the `_Entity` union, each type annotated with `@key` should be added to the `_Entity` union. If no types are annotated with the `@key` directive, then the `_Entity` union and `Query._entities` field should be removed from the schema.

For example, given the following partial schema:

```graphql
type Review @key(fields: "id") {
  id: ID!
  body: String
  author: User
  product: Product
}

extend type User @key(fields: "email") {
  email: String! @external
}

extend type Product @key(fields: "upc") {
  upc: String! @external
}
```

The `_Entity` union for that partial schema should be the following:

```graphql
union _Entity = Review | User | Product
```

The `_Entity` union is critical to support the `_entities` root field:

```graphql
_entities(representations: [_Any!]!): [_Entity]!
```

Queries across subgraph boundaries start off from the `_entities` root field. The resolver for this field receives a list of **representations**. A representation is a blob of data that is supposed to match the combined requirements of the fields requested on an entity.

For example, if we execute a query for the top product's `reviews`:

```graphql
query GetTopProductReviews {
  topProducts {
    reviews {
      body
    }
  }
}
```

The gateway first fetches the `topProducts` from the Products subgraph, asking for the `upc` of each product:

```graphql
query {
  topProducts {
    upc
  }
}
```

The reason it requests `upc` is because that field is specified as a requirement on `reviews`:

```graphql
extend type Product @key(fields: "upc") {
  upc: String @external
  reviews: [Review]
}
```

The gateway then sends a list of representations for the fetched products to the Reviews subgraph:

```json
{
  "query": ...,
  "variables": {
    "_representations": [
      {
        "__typename": "Product",
        "upc": "B00005N5PF"
      },
      ...
    ]
  }
}
```

```graphql
query ($_representations: [_Any!]!) {
  _entities(representations: $_representations) {
    ... on Product {
      reviews {
        body
      }
    }
  }
}
```

GraphQL execution then goes over each representation in the list, use the `__typename` to match type conditions, build up a merged selection set, and execute it. Here, the inline fragment on `Product` will match, and the `reviews` resolver will be called repeatedly with the representation for each product. Because `Product` is part of the `_Entity` union, it can be selected as a return type of the `_entities` resolver.

To ensure the required fields are provided (and of the right type) the source object properties should coerce the input into the expected type for the property (by calling `parseValue` on the scalar type).

The real resolver can then access the required properties from the (partial) object:

```graphql
{
  Product: {
    reviews(object) {
      return fetchReviewsForProductWithUPC(object.upc);
    }
  }
}
```

## Schema modifications glossary

### `type _Service`

A new object type called `_Service` must be created. This type must have an `sdl: String!` field, which exposes the SDL of the subgraph's schema.

### `Query._service`

A new field must be added to the query root called `_service`. This field must return a non-nullable `_Service` type. The `_service` field on the query root must return SDL which includes all of the subgraph's types (after any non-federation transforms), as well as federation directive annotations on the fields and types. The federation schema modifications (i.e., new types and directive definitions) *should not be* included in this SDL.

### `union _Entity`

A new union called `_Entity` must be created. This should be a union of all types that use the `@key` directive, including both types native to the schema and extended types.

### `scalar _Any`

A new scalar called `_Any` must be created. The `_Any` scalar is used to pass representations of entities from external subgraphs into the root `_entities` field for execution. Validation of the `_Any` scalar is done by matching the `__typename` and `@external` fields defined in the schema.

### `scalar _FieldSet`

A new scalar called `_FieldSet` is a custom scalar type that is used to represent a set of fields. Grammatically, a field set is a [selection set](http://spec.graphql.org/draft/#sec-Selection-Sets) minus the braces. This means it can represent a single field `"upc"`, multiple fields `"id countryCode"`, and even nested selection sets `"id organization { id }"`.

### `Query._entities`

A new field must be added to the query root called `_entities`. This field must return a non-nullable list of `_Entity` types and have a single argument with an argument name of `representations` and type `[_Any!]!` (non-nullable list of non-nullable `_Any` scalars). The `_entities` field on the query root must allow a list of `_Any` scalars, which are "representations" of entities from external subgraphs. These representations should be validated with the following rules:

* Any representation without a `__typename: String` field is invalid.
* Representations must contain at least the fields defined in the fieldset of a `@key` directive on the base type.

### `@key`

```graphql
directive @key(fields: _FieldSet!) repeatable on OBJECT | INTERFACE
```

The `@key` directive is used to indicate a combination of fields that can be used to uniquely identify and fetch an object or interface.

```graphql
type Product @key(fields: "upc") {
  upc: UPC!
  name: String
}
```

Multiple keys can be defined on a single object type:

```graphql
type Product @key(fields: "upc") @key(fields: "sku") {
  upc: UPC!
  sku: SKU!
  name: String
}
```

> Note: Repeated directives (in this case, `@key` is used multiple times) require support by the underlying GraphQL implementation.

### `@provides`

```graphql
directive @provides(fields: _FieldSet!) on FIELD_DEFINITION
```

The `@provides` directive is used to annotate the expected returned fieldset from a field on a base type that is guaranteed to be selectable by the gateway. Given the following example:

```graphql
type Review @key(fields: "id") {
  product: Product @provides(fields: "name")
}

extend type Product @key(fields: "upc") {
  upc: String @external
  name: String @external
}
```

When fetching `Review.product` from the Reviews subgraph, it is possible to request the `name` with the expectation that the Reviews subgraph can provide it when going from review to product. `Product.name` is an external field on an external type, which is why the local type extension of `Product` and annotation of `name` is required.

### `@requires`

```graphql
directive @requires(fields: _FieldSet!) on FIELD_DEFINITION
```

The `@requires` directive is used to annotate the required input fieldset from a base type for a resolver. It is used to develop a query plan where the required fields might not be needed by the client, but the subgraph might need additional information from _other_ subgraphs. For example:

```graphql
# extended from the Users service
extend type User @key(fields: "id") {
  id: ID! @external
  email: String @external
  reviews: [Review] @requires(fields: "email")
}
```

In this case, the Reviews subgraph adds new capabilities to the `User` type by providing a list of `reviews` related to a user. To fetch these reviews, the Reviews subgraph needs to know the `email` of the `User` from the Users subgraph. This means the `reviews` field / resolver *requires* the `email` field from the base `User` type.

### `@external`

```graphql
directive @external on FIELD_DEFINITION
```

The `@external` directive is used to mark a field as owned by another subgraph. This allows subgraph A to use fields from subgraph B while also knowing at runtime the types of that field. For example:

```graphql
# extended from the Users subgraph
extend type User @key(fields: "email") {
  email: String @external
  reviews: [Review]
}
```

This type extension in the Reviews subgraph extends the `User` type from the Users subgraph. It extends it for the purpose of adding a new field called `reviews`, which returns a list of `Review`s.
