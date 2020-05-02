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

1. For field references within a type or extension, the **type namespace**, containing:
    - all fields explicitly declared by the type or type extension
    - all names introduced with `let`
2. The **schema namespace**, containing:
    - all types explicitly declared in the schema file
    - all names introduced with `let`
3. For each ancestor directory up to the [atlas root](#atlas-root), the namespace of that directory, containing:
    - the base names (extension stripped) of all files with recognized schema extensions: `.stars`, `.gql`, and `.graphql`. It is an error for two sibling schemas to share a base name (i.e. you cannot have `users.stars` and `users.gql` as siblings in the same directory); the compiler will warn about this situation and refuse to resolve the name entirely.
    - the names of any directories containing 
    
    
### atlas root

A `.atlas` directory marks the root* of a constellation project. (* — Unless configured to be a child, by setting `child` in `atlas.toml` to `true`; sub-constellations configured as children allow name lookups continue up the directory tree).

Specifically, an `.atlas` directory contains an `atlas.toml` file, which looks like [this](./.atlas/atlas.toml):

```toml
# should atlas lookup proceed up the directory structure?
#   default: false
child = false

# default atlas to use when none is specified.
#   default: “main”
default = “main”

[atlases.main]
  id = ‘31498eaba8eb44d5a4ecc4acf7471469’
  url = ‘https://atlas.apollo.dev’

[atlases.internal]
  id = ‘a223bbc2347dfaefsdf3fefdssdac382’
  url = ‘https://some-internal-atlas.somewhere’
```

This `atlas.toml` defines two atlases: `main` and `internal`.

`main` is the default atlas (specified explicitly here, though that’s unnecessary, as it’s the default). There’s nothing special about main atlas, really, except that it’s the atlas that’s used if no atlas is specified.

`.atlas` directories may have a cache. If present, the cache is treated as read only unless explicitly updated.


## global atlas

The global atlas lives in `~/.atlas`. It has the same structure as any other `.atlas` folder, with the exception that the cache is always present.

## atlas cache

TK, but generally we use cacache with this structure:

The cache contains the current state for each atlas under its proper uri: `atlas:[atlas-id]`. The state is a *lemma*, a structure which contains:
  - the content hashes of one or more previous lemmas
  - a signed *announcement* describing a change to the state(s)
  - the derived state
  - optionally, a signature

In principle, a client can look up the prior lemmas and verify the correctness all the way back to the atlas’ *axiom*, which is a self-signed announcement declaring and describing the atlas.

In practice, signed intermediate lemmas make this unnecessary. Clients need only pull atlas data until they get a lemma signed by an identity they trust (i.e. the establishing identity of an atlas, or some identity subsequently vested with its power).
