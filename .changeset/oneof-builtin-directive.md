---
"@apollo/federation-internals": patch
---

Recognize the built-in `@oneOf` directive (part of the GraphQL spec since graphql-js 16.9) as a known directive, instead of rejecting it with "Unknown directive". This was previously blocking `buildSubgraphSchema` and subgraph composition for any schema using `@oneOf` input types, even though `graphql` is already a `^16.5.0` peer dependency here.

This also bumps the repo's dev-only `graphql` pin from 16.8.1 to 16.9.0, the minimum version where `@oneOf`/`isOneOf` are actually implemented in graphql-js, since `Schema#toGraphQLJSSchema` builds the final schema via graphql-js's own `buildASTSchema` and needs that support to be present for this fix to take effect.
