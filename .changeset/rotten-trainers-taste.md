---
"@apollo/composition": patch
"@apollo/federation-internals": patch
---

Restrict usage of auth directives on interfaces

Restricts usage of `@authenticated`, `@policy` and `@requiresScopes` from being applied on interfaces, interface objects and their fields.

GraphQL spec currently does not define any interface inheritance rules and developers have to explicitly redefine all interface fields on their implementations. At runtime, GraphQL servers cannot return abstract types and always return concrete output types. Due to the above, applying auth directives on the interfaces may lead to unexpected runtime behavior as they won't have any effect at runtime.
