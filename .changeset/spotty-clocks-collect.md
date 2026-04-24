---
"@apollo/federation-internals": minor
---

Add validations for `@link` usages to prevent name conflicts.

This change helps to avoid ambiguity for downstream `@link`-consuming code, which previously may have found different results for a spec schema element depending on search order. If your composition fails after this change, please rename conflicting elements via `@link(import:)` and conflicting specs/features via `@link(as:)`.

Note that if you were declaring `@link`s for the `https://specs.apollo.dev/tag` or `https://specs.apollo.dev/inaccessible` specs in your subgraph schema, you will need to instead import `@tag` and `@inaccessible` from the `https://specs.apollo.dev/federation` spec. This previous pattern only succeeded due to a now-fixed bug and is fragile/may lead to undesirable behavior.
