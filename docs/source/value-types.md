---
title: Value types
sidebar_title: Reusing types (value types)
description: Define the exact same type in multiple services
---

It's common to reuse a GraphQL type across multiple [implementing services](./implementing-services/). For example, you might define a generic `Error` interface and an `ErrorCode` enum:

```graphql
interface Error {
  code: ErrorCode!
  message: String!
}

enum ErrorCode {
  UNKNOWN_ERROR
  NETWORK_ERROR
  AUTHENTICATION_ERROR
  SERVER_ERROR
}
```

These **value types** don't "originate" in a particular service. Instead, _all_ of the services that define a value type share ownership.

Most importantly, a value type must be defined **identically** in every service that defines it. Otherwise, your federated schema will fail composition. Not every service needs to define a particular value type.

Any of the following can be a value type:

* Scalars
* Objects
* Interfaces
* Inputs
* Enums
* Unions


Considerations for each of these are listed below.

## Scalars

If you define a [custom scalar](https://www.apollographql.com/docs/apollo-server/schema/custom-scalars/) as a value type, make sure all of your implementing services use the exact same serialization and parsing logic for it. The schema composition process _does not_ verify this.

## Objects, interfaces, and inputs

For types with field definitions, all fields _and their types_ must be identical (including nullability).

If an object type is an [entity](./entities/), it _cannot_ be a value type.

## Enums and unions

For enums and unions, **all possible values must match across all defining services**. Even if a particular service doesn't use a particular value, that value still must be defined in the schema. Otherwise, your federated schema will fail composition.
