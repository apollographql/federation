---
"@apollo/gateway": minor
---

Add more information to OpenTelemetry spans.

Rename `operationName` to `graphql.operation.name` and add a
`graphql.operation.type` attribute, in conformance with the OpenTelemetry
Semantic Conventions for GraphQL. The `operationName` attribute is now
deprecated, but it is still emitted alongside `graphql.operation.name`.

Add a `graphql.document` span attribute to the `gateway.request` span,
containing the entire GraphQL source sent in the request. This feature
is disable by default.

When one or more GraphQL or internal errors occur, report them in the
OpenTelemetry span in which they took place, as an exception event. This
feature is disabled by default.

To enable the `graphql.document` span attribute and the exception event
reporting, add the following entries to your `ApolloGateway` instance
configuration:

```ts
const gateway = new ApolloGateway({
  // ...
  telemetry: {
    // Set to `true` to include the `graphql.document` attribute
    includeDocument: true,
    // Set to `true` to report all exception events, or set to a number
    // to report at most that number of exception events per span
    reportExceptions: true,
    // or: reportExceptions: 1
  },
});
```
