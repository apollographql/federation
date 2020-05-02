# The Atlas

The Atlas gives *names* to *parts of the universal graph*. It answers the question: given a name in a schema file, what part of the universe does it reference?

## Name resolution from files

Consider this bit of gql from the [basic fixture]('./fixtures/basic/admin.gql):

```graphql
extend type User @from(type: "users.User") {
  role: Role
}
```

To complete the type `User`, the compiler needs to resolve `users.User`. This happens in two steps:

1. first, we `Lookup` the name `user`, proceeding up the [scope chain](#scope-chain) until a scope is found in which it's been defined.
2. then, we descend into the definition, looking for a `User` type.

### Scope chain

The scope chain consists of:

1. For field references within a type or extension, the type namespace, containing:
    - all fields explicitly declared by the type or type extension
    - all names introduced with `let`
2. The file namespace, containing:
    - all types explicitly declared in the schema file
    - all names introduced with `let`
3. For each ancestor directory up to the [atlas root](#atlas-root), the namespace of that directory:

### Atlas root




## Algorithms

#### Lookup(scope: Dictionary, name: String) -> Point

*Scan up the scope stack for a given name.*

  1. If `name` is defined within `scope`, return its binding within `scope`
  2. Otherwise, return `Lookup(scope.parent, name)`
      - If `scope` has no parent, fail.

