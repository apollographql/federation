# The Atlas

The Atlas records everything we know about the structure of some part of the universal graph. This includes the graph *structure*—the kind of description we'd find in a schema file. It also includes metadata which might be encoded in a schema file with directives or provided externally. An important piece of metadata is what endpoints can serve particular fields, but this graph metadata also encompasses everything else you might want to say about a graph: information about who can change parts of the graph, which fields contain PII, who the graph owner for some subgraph is, etc.

This document is an attempt to answer a few questions: *where* does the atlas store this data, *how*, and most importantly *why*?

## Problems

Last bit first: *why*? What problems does the atlas solve?

The atlas describes points in the graph.

&#8220;A point in the graph&#8221; might be represented in many ways, for example:
- a token within a schema file
- a token within a query against a particular schema
- the type or other schema element associated with some universal resource identifier (an `atlas:` uri, for example).

For each point in the graph, there are various things we'll want to know:
- for types:
    - the names of accessible fields and their types
    - the (much larger) set of accessible extension fields which may not have bare names but are valid at this point
    - (note that the above effectively answers the question of where I can go when standing on a type)
- the scalar information (format, raw byte size) at this point (for scalar fields)
- metadata annotations applied through directives or elsewhere, such as `@private`, `@userdata`, `@external`, etc

This is the most general problem statement for the atlas. Here are some more specific problems which fall out of this big one:

### Resolve references in schema files

Consider [this bit of gql]('./fixtures/basic/admin.gql):

```graphql
extend type User @from(type: "users.User") {
  role: Role
}
```

`@from(type: "users.User")` references a type from somewhere in the graph. Maybe it's defined in this file. Maybe it's defined in a nearby file. Or maybe it's defined extremely elsewhere, as part of another graph with wholly different owners. Regardless, this is the question for us: what does `users.User` mean? Does it refer to anything, and what is that thing, what fields does it have, what endpoints can serve it, and so on?

In particular, the compiler needs to be able to retrieve at least:
- **a uri.** some universal identifier for the resolved type distinguishing it from all other types named `User`, in this or any other atlas.
- **a set of fields for this type.** including all applied extensions, and so on. At a minimum, the compiler needs this information in order to emit the type into the generated `gql`
- **metadata about this type (i.e. directives).** which may alter the way it's compiled
- **transitive dependencies.** all of the above for types referenced from every field, and their fields, and so on.

### Support language servers

A (relatively straightfoward) generalization of [resolving references](#resolve-references-in-schema-files) is to be able to identify and describe any token in any schema file on disk. This is effectively the core work of a language server. It makes sense to wrap this into the atlas' responsibilities. The atlas *isn't* a language server (in the sense of implementing the language server protocol), but it should be able to form the core of one.

### Provide forge with canonical representations of graph structures

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

Here we're using hypothetical starql syntax, but it should be possible for such post-schema directives to be applied by other tooling as well.

## Structure

### `atlas:` URLs

TK, `atlas:` URLs uniquely define points in the graph.

Technically `atlas:` URLs are URIs or maybe URNs but [WHATWG basically thinks the distinction is unnecessary and confusing](https://url.spec.whatwg.org/#goals) so we're going with that.

Generally, `atlas:` URLs:

```
# start off identifying the atlas by a bracketed hash
# (the hash of the axiom, specifically):
atlas:[atlas_ident]:

# or more conveniently by alias:
atlas:corp-internal:

# when no alias is provided, `main` is assumed:
atlas::
  is equivalent to
atlas:main:

# dives into the namespace with a dotted path
atlas::schema.Type
atlas:internal:schema.Type.internalField

# can specify identifies edges by including `/outputType`
atlas::schema.Type.field/schema.someType
atlas:internal:schema.Type.internalField/String

~~~
q: should this be a full atlas URL? i.e. should it be possible to specify links between atlases without composing them into a new atlas? I think no, need to think a bit more about this.
~~~

# can conclude with a layer.
#
# layers are different places where atlas data may be
# stored. for example, when compiling types against
# the public atlas, the layers might include:
#   - schema files in the workspace
#   - the global cache in ~/.atlas
#   - the public atlas in heaven
atlas:internal:schema.InternalType.field:return.Type?path=file://some/wkspce/schema.stars

# distinguishing a file version, perhaps useful for the language server layer
atlas::schema.Type.field:return.Type?path=file://some/wkspce/schema.stars&ver=232


# q: can we use this form for anything?
atlas://<authority>/
```

### Atlas schema

TK, the atlas provides [a schema](./primer/atlas.stars) very much like the introspection schema, but extended with:
  - the ability to track directives and where they're applied
  - a `Point` scalar which holds an atlas uri
  - `id: Point` fields on all schema elements
  - more `Query` methods

Additional schemas can blend into the atlas core schema, providing queries by e.g. fileystem path and token position, or the ability to provide announcements

## Filesystem binding

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
default = "main"

[atlases.main]
  id = "31498eaba8eb44d5a4ecc4acf7471469"
  url = "https://atlas.apollo.dev"

[atlases.internal]
  id = "a223bbc2347dfaefsdf3fefdssdac382"
  url = "https://some-internal-atlas.somewhere"
```

This `atlas.toml` defines two atlases: `main` and `internal`.

`main` is the default atlas (specified explicitly here, though that’s unnecessary, as it’s the default). There’s nothing special about main atlas, really, except that it’s the atlas that’s used if no atlas is specified.

`.atlas` directories may have a cache. If present, the cache is treated as read only unless explicitly updated.

### global atlas

The global atlas lives in `~/.atlas`. It has the same structure as any other `.atlas` folder, with the exception that the cache is always present.

### atlas cache

TK, but generally we use cacache holding the current state for each atlas under its proper uri as a key. The state is a lemma which references others, also held in the cache under their own hash.

## Distributed data format

TK, basically a sequence of *lemmas*, including:
  - the content hashes of one or more previous lemmas
  - a signed *announcement* describing a change to atlas' current state(s)
  - optionally, a new derived state

The first lemma in an atlas is the `axiom`. It is simply a signed message describing the atlas and granting a single public key the ability to declare within the entire namespace.

Subsequent lemmas may:
  - `GRANT` or `REVOKE` permissions to the namespace or subsets of it to other public keys
  - `WRITE` to a particular path within the atlas
    - maybe break this into specific operations, like `ANNOUNCE` endpoint availability/unavailability?
  - `STATE` the result of applying one or more intermediate lemmas. This allows clients to skip following and recomputing (maybe very big) proof trees if they trust the `STATE` signer