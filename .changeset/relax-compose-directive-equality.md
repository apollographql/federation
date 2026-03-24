---
"@apollo/composition": minor
---

Relax `@composeDirective` validation when definitions are absent in some subgraphs.

Previously, if some set of spec directives were being composed into the supergraph schema via `@composeDirective`, then subgraphs with the latest version of that spec would each have to declare all of those spec directive definitions. Not following this rule would often result in composition emitting a `DIRECTIVE_COMPOSITION_ERROR` error. This restriction has now been relaxed, and a definition needs to only be in at least one of those subgraphs with the latest version of that spec.

As an example, the following `@composeDirective` usage could previously fail, but is now valid.
```graphql
# subgraph A — composes and defines @foo and @bar
extend schema
    # ...
    @link(url: "https://myorg.dev/myspec/v1.0", import: ["@foo", "@bar"])
    @composeDirective(name: "@foo") @composeDirective(name: "@bar")
# ...
directive @foo on FIELD
directive @bar on FIELD

# subgraph B — composes and defines only @foo
extend schema
    # ...
    @link(url: "https://myorg.dev/myspec/v1.0", import: ["@foo"])
    @composeDirective(name: "@foo")
# ...
directive @foo on FIELD
```
