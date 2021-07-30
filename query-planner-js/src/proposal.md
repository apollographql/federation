# [Github Issue](https://github.com/apollographql/federation/issues/364) Comment

Hi @queerviolet, @abernix, @jbaxleyiii,

Transitive dependency support is a high priority for us as well. Are you accepting contributions in this space? 
We've done a [small POC](link to draft PR) to better understand this problem, and as @queerviolet mentioned, rewriting 
the query planner to use a dependency graph appears to be a larger effort.

It may be more pallatable for us (and perhaps others e.g. @benjaminjkraft) to work on this if we can do so incrementally
behind a feature flag.

A reasonable first iteration may be to only support Queries by executing requests serially. Further iterations may 
introduce parallelism, mutation support, etc.

What are your thoughts on this approach?

# Draft PR Description

## Summary
This POC was used to better understand the work required to enable transitive dependency support
in the query planner. The scope is limited to satisfying the basic use case expressed in [this unit test](link to test).

## Approach
The solution is to construct a dependency graph from the GraphQLSchema, and then traverse said graph to find
the subset of nodes that are relevant to fulfilling an operation (i.e. query or mutation). We then sort the subset of 
relevant nodes into a legal order of execution and map them into a QueryPlan. See below for a more detailed breakdown of each step:

### 1. Construct a dependency graph from the GraphQLSchema

We implemented the dependency graph as a separate class, which contains an adjacency set and a number of utility methods.
The fromSchema method instantiates this class from a GraphQLSchema by iterating over the fields in its' TypeMap and 
creating an edge for each dependency found in `field.extensions.federation.requires`. We treat key fields as 
dependencies in a similar manner.

While this is done in the query planner for simplicity, it could be performed ahead of time whenever the schema changes.

### 2. Traverse the schema dependency graph to find the subset of nodes that are needed to fulfill an operation

Our mental model here is informed by this [comment](https://github.com/apollographql/federation/issues/364#issuecomment-555576424).
As it pertains to this problem, the schema can be thought of as a graph with both structural and dependency edges. Structural
edges define the structure of the schema (e.g. Query.getA: A -> fieldOfA, fieldOfA: B -> fieldOfB, etc.). Dependency edges
are defined by @requires and @key. Given an operation and a schema, and assuming that the operation is a structural subet of the schema,
we can find the nodes needed to fulfil said operation by following the operation's structural edges and the schema's dependency edges.

`getDependencySubgraph` does this by traversing the fiedDef (schema) and fieldNode (operation) trees in parallel. 
A seperate data structure maintains a mapping between nodes and paths needed later to define the `mergeAt` property in 
QueryPlan nodes.

### 3. Sort the subgraph into a legal order of execution

`getSortedNodes` is currently implemented using a simple toposorting library. This should be expanded in the future to support
parallelism and batching requests to the same service.

### 4. Map sorted nodes into a QueryPlan

This is performed by combining snippets from a QueryPlan object, since properly constructing the QueryPlan was not the 
focus of this POC.
