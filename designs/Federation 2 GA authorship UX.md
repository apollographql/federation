# Federation 2 GA authoring UX design

*Status*: review (see below)
*Author*: Sylvain Lebresne

## Purpose and status

The goal of this document, once finalised, is to provide a precise picture of the subgraph main authoring UX federation 2 will have for GA and post-GA. Noting that:

* by "authoring UX", we essentially mean the directives that subgraph authors will have at their disposal and how those will behave.
* this document is about describing solutions and, for the sake of being synthetic, will not dwell on the justifications or alternatives to those solutions, but will point to other issues that do so when appropriate.

This document is currently a work in progress, which means both that:

* it is incomplete;
* some of what is described may still be changed.

Note in particular that the content of this document is not in sync with the current federation 2 implementation, so when this document says things like "Federation 2 has/does X" this should be understood has "Federation 2 will have/do X once implemented".

Once this document is completed and reasonable consensus has been reached, we'll change the status to  "final" to reflect those stages.

### Overview

The federation 2 UX is an evolution of federation 1 (note we use "federation 1" as a shortcut for "federation before 2" even if technically it was released under version numbers 0.x), and the federation 1 directives are mostly still supported, though with some of their behaviour amended. The first section will review those existing directives, how they behave in federation 2 and highlight general differences with federation 1.

One of the key differences with federation 1 is that federation 2 does not inherit the "ownership" model, mostly in order to avoid the limitations of that model. That ownership model had important governance benefits regarding the sharing of entity fields between subgraphs, and federation 2 will provide those benefits through a new "field sharing" mechanism which the next section will describe.

Another addition of federation 2 is a better support for interfaces as abstractions across different subgraphs and we’ll describe what is going to be initially supported on that front in the following section.

Lastly, a focus of federation 2 is on providing a better experience for schema evolution, and particularly good native support for migrating types and fields between subgraphs, and the last section will describe the associated mechanisms.

### Using Federation 2

Subgraphs must opt-in to using Federation 2 semantics and directives by including a stanza like the following:

```
extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
       import: ["@key", "@requires", "@shareable"])
```

This block makes the schema a core schema. `@link(url:)` is the new name for `@core(feature:)`—the team believes this rename presents a more coherent and legible model of core schemas to end users.

These directives may be applied in either a schema definition or an extend schema schema extension block. This flexibility means that a block like the above can be textually concatenated to an existing subgraph schema document to convert it into a fed v2 schema, providing a fast path to adoption even with subgraph libraries which don’t yet deeply integrate core schema semantics.

We can also use this block to rename federation directives, if they conflict with existing customer-defined directives:
```
extend schema
  @link(url: "https://specs.apollo.dev/federation/v2.0",
        import: [ { name: "@tag", as: "@contractTag"}, "@key", "@requires", "@shareable"]
```

## Federation 1 directives in Federation 2

This section explains how federation 2 defines the existing directives of federation: `@key`, `@requires`, `@provides`, `@external` and `@extends`. By and large, those directives work the same way than in federation 1 and we'll keep this section light on details, focusing mainly on differences (with fed 1). But we'll also try to provide a few precise definitions that will be used in the follow-up sections.

### @key

In federation 2, the `@key` directive allows you to declare that a given subgraph (the one in which the `@key` is declared) has the ability to resolve objects of a given type (the type marked by the `@key`) given some specific inputs (the fields argument of `@key`). Note that this declaration is aimed at the federation machinery itself: keys are used by the federation gateway/router to "join" information across subgraphs.

The benefit of adding `@key` is that it allows to distribute the fields of types across subgraphs. But importantly, while adding a `@key` on a type `T` in subgraph `S` declares that `S` can resolve objects of `T` given the proper inputs sent by other subgraphs, it can only work at runtime if a corresponding "reference resolver" is implemented for `T` in `S`. How reference resolver are defined in practice is (federation-enabled) server specific (for Apollo Server, it's the referenceResolver method). But the rule is simple: "every @key must have a corresponding reference resolver implementation".

Note that keys are only truly supported on object types in Federation 1. More precisely, while federation 1 does not reject `@key` on interface types, those definitions are completely ignored. Federation 2 will add proper support for `@key` on interfaces, but as this is new to federation 2, this support is going to be described in further details in a dedicated section later on in this document.

Remark that the definition of keys above is also valid in federation 1, but an important difference is that in federation 1, `@key` also makes the type it is applied on an "owned entity", which comes with a number of additional rules and restrictions. None of those apply in federation 2, and the definition of `@key` in federation 2 is fully described above.

### @requires

The `@requires` directive works similarly in federation 1 and federation 2, it allows a field to require that some other fields are resolved/collected before itself. The only differences are implementation related: the implementation in federation 2 has less limitations on which fields can be "required" and in particular:

* there are no restrictions of required fields needing to come from the service owning the type (in fact, there is no type owning in federation 2 so this wouldn't make sense). Nor is it even required that all the fields in a given `@requires` comes from the same subgraph (of course, requiring fields from many different subgraphs has performance consequences since all of those subgraphs have to be queried, but this should hardly come as a surprise).
* the validation of the fields argument has been fixed to ensure all the fields required are declared in the subgraph (using `@external`), even if nesting is involved.

### @provides

As with `@requires`, the `@provides` directive behaviour is largely preserved in federation 2: it still allows a subgraph to declare that a field that is not generally resolved by a subgraph is resolved on some specific paths (the ones having a `@provides`). Note that by definition, `@provides` applies to external fields, and we'll define below the notion of partially external/partially resolved fields which involves `@provides`.

As for `@requires`, the differences between federation 2 and federation 1 are due to lifted limitations allowed by the new implementation. Mainly:

* nested provides are supported
* you can provides fields of interfaces and unions (it's also possible to only provide a field for specific implementation of an interface by using type-conditions/fragments in the fields argument "result set").

A tangential difference is also that federation 2 allows an entity field to be defined in multiple subgraphs directly, which is the equivalent of using `@provides` for every path resolving the field type but is a lot more convenient/synthetic. As a result, it makes `@provides` less often useful in practice.

### @external

In federation 2, `@external` declares fields in a subgraph that aren't resolved by that subgraph. The reasons for declaring a non-resolved field is to satisfy requirements for either:

1. a federation directive with a fields argument: `@provides`, `@requires` or, much more rarely, `@key`.
2. an interface: an object type that implements an interface in a given subgraph may not want to resolve that particular field, leaving it to another subgraph to resolve. When that's the case, the field must be added with `@external` or the subgraph wouldn't be valid graphQL.

While this is very similar to federation 1, note that fed 1 has an inconsistent exception: in federation 1, key fields of type extension must be `@external` but they should also be resolved by the subgraph (the query planner expects this and will ask the subgraph to resolve the fields), which is contradictory to the definition of `@external` as marking non-resolved fields.

As we just mentioned, `@external` is about declaring fields that are not resolved by the subgraph. However, the whole point of `@provides` is to declare that some of those fields, while not resolved "in general", are still resolved by the subgraph when some specific paths (the one with a `@provides`) are taken by a query. To simplify discussion of that subtlety and because we'll need it later, we define the following 2 sub-categories of external fields:

* "full external" fields are those fields marked with `@external` that are not partially external (see next, but basically they are not in any `@provides` nor implementing an interface field that is in a `@provides`).
* "partially external" fields are `@external` fields that either:
    * appears in any `@provides` in the subgraph.
    * implements any interface field that appears in any `@provides` in the subgraph (as this indirectly still means that the field may be resolved on some paths).

From this, we also defined the other notion of a field being resolved by a subgraph: a field is resolved by a subgraph if that subgraph may be required, during the execution of a query on the federated supergraph, to "resolve" a value for that field. Like external fields, resolved fields can be further distinguished in 2 sub-categories:

* fields fully resolved by a given subgraph: those are the object type fields that are declared by the subgraph and are not external (that is, neither full or partial external).
* fields partially resolved by a given subgraph: those are the object type fields that are declared by the subgraph and are partially external (in the sense we just defined). In other words, "partially resolved" and "partially external" are just different names for the exact same notion.

Note that interface types are never "resolved by a subgraph" because interface fields are not really resolved (https://spec.graphql.org/October2021/#ResolveFieldValue()) (some concrete graphQL server implementations may allow putting a resolver on a field of an interface, but this is really just a shortcut for assigning the resolver to each concrete implementation of that interface). So when say that a field in "resolved by a subgraph", we implicitly imply that it is not an interface field.

Lastly, remark that this means that for a given object type field f and a given subgraph S, one and only one of the following property is true:

1. f is fully resolved by S.
2. f is fully external to S.
3. f is partially resolved by S (or, equivalently, f is partially external to S).

We'll use those definitions to precisely define the notion of "field sharing" in the next section.

## Field sharing

Federation 2 has a concept of "field sharing" which allows to control whether a field can be resolved by multiple subgraphs or not. The "resolved by" notion is the one defined in the previous section (see `@external` sub-section).

Every instance of a field declaration that is resolved by a subgraph has an underlying "sharing mode" binary property, which can be either shareable or non-shareable.

Do note that sharing modes are defined for a field declaration in a particular subgraph, and so a given field may have different sharing modes in different subgraphs. And in fact, sharing modes only produce a concrete effect when the sharing modes of the various declarations of a field are compared.

More precisely, a field can only be "merged" by composition if it passes the sharing mode validation which, for a given field f, is algorithmically defined thusly:

* collect the sharing modes of f for all subgraphs that resolve f (fully or partially).
* if 1) there is more than one such sharing mode and 2) any of those sharing modes are non-shareable, then the sharing mode validation fails for that field and composition error is triggered.
* otherwise, the sharing mode validation succeeds for f.

This definition implies that:

* the sharing mode validation ignores a field declaration in a subgraph if it is not resolved by that subgraph. It means that both fully external and interface field declarations are ignored by sharing mode validation (reminder that interface fields are never resolved, at least for the definition this document uses).
* a field can only be resolved by multiple subgraphs if the field is shareable in all the subgraphs resolving it. And so, equivalently, a non-shareable field in a subgraph guarantees that no other subgraph may resolve that field (and compose successfully).

Now, let's define how the sharing mode of a field in a subgraph is defined. If a field f is resolved by subgraph S, then the sharing mode for f in S, sharing(f, S), is determined by the following algorithm:

* if f declaration in S is marked with `@shareable`, then sharing(f, S) = shareable.
* otherwise, if the object type declaration of f is marked with `@shareable`, then sharing(f, S) = shareable.
* otherwise, if f is either partially external, or part of the fields argument of any `@key` directive in S, then sharing(f, S) = shareable.
* otherwise, sharing(f, S) = non-shareable

Which can be formulated more succinctly, if less precisely, with: fields are non-shareable by default, except for `@key`/`@requires` fields that are shareable (and this isn’t overridable). The non-shareable default can be overridden explicitly with `@shareable` at either the field level or the type level.

Remark that sharing is about fields, so while we allow `@shareable` on a type as a shortcut, it should not be understood as making the type shareable (type should be understood as always shareable in the current model), but rather as a shortcut to make the fields of the type declaration shareable.

The `@shareable` directive is a new federation directive defined thusly:

`directive @shareable ON FIELD_DEFINITION | OBJECT`

Examples

Consider the following 2 subgraphs:

#### subgraph 'Products'
```
type Query {
  products: [Product!]!
}

interface Product {
  upc: ID!
  description: String
}

type Furniture implements Product {
  upc: ID!
  description: String
  size: String
}

type Book implements Product {
  upc: ID!
  description: String
  pages: Int
  published: Date
}

type Date {
  year: Int
  month: Int
  day: Int
}
```

#### subgraph 'Inventory'

```
type Query {
  outOfStockProducts: [Product!]! @provides(fields: "description")
}

interface Product {
  upc: ID!
  stock: Int
  description: String @external
  nextRestock: Date
}

type Furniture implements Product @key(fields: "upc") {
  upc: ID!
  stock: Int
  description: String @external
  nextRestock: Date
}

type Book implements Product @key(fields: "upc") {
  upc: ID!
  stock: Int
  description: String @external
  nextRestock: Date
}

type Date {
  year: Int
  month: Int
  day: Int
}
```

According to the rules we just described, those subgraphs do not compose in federation 2 for a number of reasons:

1. the description field in both Furniture and Book is non-shareable in subgraph products (the default) but also in subgraph inventory because it is part of a `@provides` (or, more precisely, they implements the interface field Product.description which is part of a `@provides`). To compose, either the `@provides` would have to be removed, or the description field would have to be marked with `@shareable` for both Furniture and Book.
2. the upc field in both Furniture and Book is non-shareable in subgraph products (the default) but shareable in subgraph inventory because it is part of a key (in both cases). To compose, both fields would either have to be marked `@shareable` in products or, more likely, the keys could be added to products (we say "more likely" because the subgraph happens to not compose also because of the lack of keys in that it is not possible to get some fields after a outOfStockProducts operation as it stands).
3. The Date type is defined similarly in both products and inventory but all its fields are non-shareable (the default). To compose, one would likely want to mark the type with `@shareable`.

In summary, for those subgraphs to compose, they can be changed into (for instance, this is not the only option):

#### subgraph 'Products'
```
type Query {
  products: [Product!]!
}

interface Product {
  upc: ID!
  description: String
}

type Furniture implements Product @key(fields: "upc") {
  upc: ID!
  description: String @shareable
  size: String
}

type Book implements Product @key(fields: "upc") {
  upc: ID!
  description: String @shareable
  pages: Int
  published: Date
}

type Date @shareable {
  year: Int
  month: Int
  day: Int
}
```

#### subgraph 'Inventory'
```
type Query {
  outOfStockProducts: [Product!]! @provides(fields: "description")
}

interface Product {
  upc: ID!
  stock: Int
  description: String @external
  nextRestock: Date
}

type Furniture implements Product @key(fields: "upc") {
  upc: ID!
  stock: Int
  description: String @external
  nextRestock: Date
}

type Book implements Product @key(fields: "upc") {
  upc: ID!
  stock: Int
  description: String @external
  nextRestock: Date
}

type Date @shareable {
  year: Int
  month: Int
  day: Int
}
```


# Post-GA

## interfaces as abstractions across subgraphs

Federation 2 improves interface support in 2 main ways:

1. federation 2 supports more general/flexible merging rules and those carry on to interfaces. Effectively, interfaces can have differing definitions across subgraphs, increasing flexibility, and this as long they merge consistently (and as long as merging doesn't leave some implementations missing for some of the fields of the merged interface).
2. federation 2 will support `@key` on interfaces (note that federation 1 "accepts" those but ignores them) and will allow a subgraph to work with an interface without knowing any of its implementation. It is this mechanism we will now describe.

Note that what we’ll describe in this document is not the end of the road for interfaces. For instance, the mechanism we'll describe below do not allow to "distribute" implementations of an interface across subgraphs, and we will consider such possibilities, but it is strictly future work as there is a lot of open questions regarding such possibilities.

In federation 1, an interface cannot be used in a subgraph to abstract implementations from another subgraph, which limits the usefulness of interfaces as a tool for abstraction in federation. To illustrate this, let's consider the case where a products subgraph defines a Product interface with a number of implementations, say Book, BluRay and Game. That subgraph might look something like:

#### subgraph 'Products'
```
type Query {
  products: [Product!]!
}

interface Product @key(fields: "upc") {
  upc: ID!
  description: String
  price: Int
}

type Book implements Product {
  upc: ID!
  description: String
  price: Int
  pages: Int
  ... more fields ...
}

type BluRay implements Product {
  upc: ID!
  description: String
  price: Int
  duration_sec: Int
  ... more fields ...
}

type Game implements Product {
  upc: ID!
  description: String
  price: Int
  max_players: Int
  ... more fields ...
}
```

Let's further suppose that we want to support user reviews on all products through another subgraph. In that case, it is very reasonable to imagine that reviews are not implementation specific, and so we'd like the new reviews subgraph to be able to abstract products in general.

But this is not doable in federation 1 as while the reviews subgraph can declare the Product interface and add a reviews field, it would have to declare all the implementation types and add the reviews field there as well. This is far from ideal: on top of being redundant, this also mean that any new addition of a Product implementation in products would have to also be added into reviews.

And as an aside, note that while having a `@key` on Product in the subgraph above is accepted by federation 1, this has no effect whatsoever in federation 1, and so accepting it is effectively misleading.

To allow using interfaces as abstraction across subgraphs, federation 2 introduces the `@interfaceObject` annotation, which allows a subgraph to use an object type as a "stand-in" for what is an interface in other subgraphs. Using our example, it allows the reviews subgraph to be written as:

#### subgraph 'Reviews'
```
type Query {
  mostReviewedProducts(limit: Int): [Product!]!
}

type Product @interfaceObject @key(fields: "upc") {
  upc: ID!
  reviews: [Review!]!
}

type Review {
  text: String
  author: String
}
```

This allows the reviews subgraph to use Product as a normal type (which can, in particular, facilitate testing the subgraph in isolation) but to inform federation that Product is actually an interface in the federated supergraph. In particular, composition will:

* treat the definition of Product in reviews as if it was an interface for the sake of merging it with other subgraph's definitions.
* error out if a type is marked with `@interfaceObject` but no other subgraph defines an interface of the same name.
* automatically add the reviews field to all implementations in the supergraph (to ensure the supergraph API is valid GraphQL).

Additionally, federation 2 will (genuinely) support the `@key` annotation on Product in products in the sense that, as for any other `@key` declaration, a reference resolver will need to be written. The difference with existing object-type keys is that this reference resolver will be declared on the interface and it follows that federation-enabled graphQL servers will need to be updated to supported this new kind of resolver and ensure that the \_entities implementation dispatches to this new kind of resolver (when the __typename is received as input it points to an interface type). Do note that the implementation of such reference resolver will still return actual runtime types: in the case of Product key in products, the reference resolver would have to resolve the provided upc into either a Book, or a BluRay, or a Game, etc. In other words, putting an key on an interface implies that the key field is "common" to all implementations, in the sense that you cannot have both a Book and a BluRay having the same upc value (otherwise you wouldn't be able to properly write the implementation of the Product _referenceResolver method).

Concretely, for a query like:
```
query {
  products {
    description
    reviews {
      text
    }
  }
}
```

the products subgraph will first be queried for all concrete products upc value, and then the reviews subgraph will be queried for the reviews of all those products, using the `@key` on Product in reviews (which, from the point of view of the reviews subgraph is a normal object type key, but the gateway will have to handle "rewriting" the __typename field in the internal query as the reviews subgraph don't know about concrete implementations; this is however an implementation detail).

As for a query like:
```
query {
  mostReviewedProducts(limit: 10) {
    description
    reviews {
      text
    }
  }
}
```

the reviews subgraph would be queried for the proper product upc and accompanying reviews (and because Product is a "type" as far as reviews is concern, this is a valid graphQL query), and then the `@key` on interface Product in the products subgraph would be used to find the proper implementations (and their description).

An important remark about allowing `@key` on interfaces (as for Product in products) is that it implies the corresponding resolver is always able to resolve any reference for that interface . Or to put it another way, if 2 different subgraphs have a key on the same interface, then both subgraph should be able to resolve the exact same implementations (if this wasn't the case, there would be case were the query planner couldn't decide what subgraph to query). To make it easier for users to understand this implication, we propose to add the constraint that if an interface has a `@key` in a subgraph, then that subgraph must have a definition for all the implementations of the interface across all subgraphs (note that we will consider ways to leave such “limitations” in later versions, but there is substantial challenges to do it in a both useful and efficient way so this is left as “future work”). In other words, in our example above you would not be able to add (with no other changes) a new subgraph:

#### subgraph 'otherProducts'
```
interface Product {
  upc: ID!
}

type Car implements Product @key(fields: "id") {
  upc: ID!
  color: String
}
```

And this because products has a `@key` on interface Product but does not define the new Car type which is now a possible implementation of the Product interface. Of course, if Car is added to the products subgraph, this would start working again, and otherProducts could extend Car with specific fields (that is, products would have to declare Car but don't have to define the color field which can still be provided by otherProducts).

### @override

Sometimes it will be desirable to move an entity field that is non-shareable from one subgraph to another. Although it is possible to do this by making the field shareable during migration, this is not desirable since the intention is for the field to be non-shareable and subgraphs other than the intended destination could start providing the field during migration. Furthermore, it's required to remove directives once migration is complete in order to get back to the desired of a non-shareable field. These issues are solved by the `@override` directive.

Suppose you have an entity field T.f in some "old" subgraph and want to move it to the T definition in a "new" subgraph. The steps for migration in federation 2 would be as follows:

1. Add T.f in "new"
2. Mark T.f in "new" with `@override`(from: "old")
3. Remove T.f from "old" completely

When the `@override` directive exists on a field of a subgraph, the query planner will resolve the field to that subgraph if and only if the field is not provided on the subgraph the field is moving to. Once the field is present in the destination subgraph, future query plans will resolve to the new subgraph.

Please note that the destination subgraph is a required parameter in the directive, and that once the field is available in the new destination subgraph, 100% of uncached query plans will resolve to the new subgraph.

The `@override` directive will be defined by:

`directive @override(from: String!) on FIELD_DEFINITION`
