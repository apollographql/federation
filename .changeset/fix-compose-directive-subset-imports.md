---
"@apollo/composition": patch
---

Fix `@composeDirective` failing with a false `DIRECTIVE_COMPOSITION_ERROR` when subgraphs import different subsets of directives from the same custom spec.

**Affected scenario:** two or more subgraphs `@link` the same custom spec URL but import different directives from it:

```graphql
# subgraph A — imports @foo AND @bar, composes both
@link(url: "https://myorg.dev/myspec/v1.0", import: ["@foo", "@bar"])
@composeDirective(name: "@foo") @composeDirective(name: "@bar")

# subgraph B — imports only @foo from the same spec
@link(url: "https://myorg.dev/myspec/v1.0", import: ["@foo"])
@composeDirective(name: "@foo")
```

This would produce a false error:
```
DIRECTIVE_COMPOSITION_ERROR: Core feature "https://myorg.dev/myspec" in subgraph "B"
does not have a directive definition for "@foo"
```

The bug was order-dependent (failed when the subgraph elected as "latest" for the spec was not a superset of all other subgraphs' imports) and always failed for fully disjoint import sets (e.g. subgraph A imports only `@foo`, subgraph B imports only `@bar`).

**Root cause:** `ComposeDirectiveManager.getLatestDirectiveDefinition()` resolved definitions through a two-hop chain — `directiveName → spec identity → "latest" subgraph for that spec → schema.directive(...)`. The "latest" subgraph was determined by spec version alone, without checking whether it had actually imported the directive being resolved.

**Fix:** a `directiveDefinitionMap` (`directiveName → DirectiveDefinition`) is now built during `validate()`, sourcing each entry from the highest-minor-version subgraph that actually imported that specific directive. `getLatestDirectiveDefinition()` does a direct lookup on this map instead of the indirect chain.
