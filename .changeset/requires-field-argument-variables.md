---
"@apollo/federation-internals": minor
"@apollo/composition": minor
"@apollo/query-planner": minor
"@apollo/gateway": minor
---

Support binding a required field's argument to a variable in a `@requires` field set.

A `@requires` field set may now reference one of the annotated field's own arguments as a variable. At query
planning time, the value the operation supplies for that argument is threaded through to the subgraph that owns the
required field:

```graphql
type T @key(fields: "id") {
  id: ID!
  x(arg: Int): Int @external
  # `$arg` names the `arg` argument of `y` (the field carrying @requires).
  y(arg: Int): Int @requires(fields: "x(arg: $arg)")
}
```

- A client-supplied operation variable is **forwarded** into the subgraph fetch (`x(arg: $var)`).
- A literal is **inlined** (`x(arg: 7)`).
- An omitted nullable argument resolves to `null`, and an omitted argument with a schema default resolves to that
  default.
- Variables may appear nested inside list/object argument values, and a field set may bind multiple arguments.

Composition rejects a variable that does not name an argument of the annotated field, a bound argument whose type
is incompatible with the position where the variable is used, and any variable used in a `@provides` field set
(all with `REQUIRES_INVALID_FIELDS`/`PROVIDES_INVALID_FIELDS`).
