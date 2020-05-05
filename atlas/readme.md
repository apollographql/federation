# The Atlas

The Atlas records everything we know about the structure of some part of the universal graph. This includes the graph *structure*—the kind of description we'd find in a schema file. It also includes metadata. Primarily, what endpoints can serve particular fields, but also all the other metadata you can imagine: information about who can change parts of the graph, which fields contain PII, who the graph owner for some subgraph is, etc, etc, for all the metadata anyone might want to store talking about the graph.

This document is an attempt to answer a few questions: *where* does the atlas store this data, *how*, and most importantly *why*?

## Why?

Last question first. What problems does the atlas solve?

### Resolve references in schema files

Consider [this bit of gql]('./fixtures/basic/admin.gql):

```graphql
extend type User @from(type: "users.User") {
  role: Role
}
```

`@from(type: "users.User")` references a type from somewhere in the graph. Maybe it's defined in this file. Maybe it's defined in a nearby file. Or maybe it's defined very elsewhere, part of another graph with wholly different owners. Regardless, this is the question for us: what does `users.User` mean? Does it refer to anything, and what is that thing, what fields does it have, what endpoints can serve it, and so on?

In particular, the compiler needs to be able to retrieve at least:
- **a uri.** some universal identifier for the resolved type distinguishing it from all other types named `User`, in this or any other atlas.
- **a set of fields for this type.** including all applied extensions, and so on. At a minimum, the compiler needs this information in order to emit the type into the generated `gql`
- **metadata about this type (i.e. directives).** which may alter the way it's compiled
- **transitive dependencies.** all of the above for types referenced from every field, and their fields, and so on.

### Support language servers

A (relatively straightfoward) generalization of [resolving references](#resolve-references-in-schema-files) is to be able to identify and describe any token in any schema file on disk. This is effectively the core work of a language server. It makes sense to wrap this into the atlas' responsibilities. The atlas *isn't* a language server (in the sense of implementing the language server protocol), but it should be able to form the core of one.

### Provide a canonical representation of graph structures

Two pieces to this:

**Input.** In order to compose a schema, the compiler needs to reference other existing compiled graphs. This graph structure data needs to be represented in some way for transmission and caching.

**Output.** The compiler needs to emit compiled graphs in some form.

In other words, we an interchange format for graph structure data. We're being vague as to how right now—it could be a `.gql` file with directive, it could be some other format. Regardless, the atlas is responsible for defining what this is.

### Provide flexible mechanisms to externally tag graph structures

That is, we will want to mark pieces of the graph in arbitrary ways. For example, an organization may want to mark certain fields as containing personally identifying information. Naturally, you can do this with a custom directive on the field:

```graphql
type User {
  address: String @userdata(privacy: PII)
}
```

But constellation also allows us to do this in another schema entirely:

```graphql
extend type users.User {
  users.address: String @userdata(privacy: PII)
}
```

Here we're using starql syntax, but it should be possible for such directives to be applied by other tooling.

## How?

### Resolving references

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
