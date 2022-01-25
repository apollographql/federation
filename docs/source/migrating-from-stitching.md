---
title: Migrating from schema stitching
description: How to move your services to Apollo Federation
---

If you have a distributed graph that uses schema stitching, follow the
steps in this guide to migrate it to use Apollo Federation.

> For a real-world example of an organization benefiting from this migration, see [this blog post](https://www.apollographql.com/blog/announcement/expedia-improved-performance-by-moving-from-schema-stitching-to-apollo-federation/).

## Summary of steps

This guide describes a set of steps for migrating architecture **incrementally** from stitching to federation. In order to do so, we rely on the fact that changes necessary for federation are completely backwards compatible. In other words, services that implement a part of your graph (**subgraphs**) can be used in both your stitching gateway and your Apollo gateway.

We recommend that you begin by modifying existing subgraphs _in place_ to support the federation specification while continuing to support schema stitching as well. At this point, you can stand up an Apollo gateway side-by-side with your existing stitching gateway and migrate over the links between the subgraphs in an incremental, backward compatible way.

Here are the high-level steps for migrating to Apollo Federation:

1. Add federation support to your subgraphs.
2. Register your GraphQL schemas with a registry.
3. Start up an instance of Apollo Server as a gateway.
4. Migrate stitching logic from your schema-stitching gateway to your subgraphs.
5. Move traffic from the schema-stitching gateway to the Apollo Server gateway.
6. Remove schema-stitching fields from your federated schema and complete your migration.

Each step is described in detail below.

> [This GitHub repository](https://github.com/apollographql/federation-migration-example) shows the same project before and after migrating to Apollo Federation from schema stitching.

## Step 1: Add federation support to your subgraphs

You can add federation support to your subgraphs _without_ impacting your existing schema-stitching architecture. Support for federation is fully compatible with schema stitching.

Because of this, we recommend that you migrate your subgraphs in-place instead of creating replacement subgraphs. Doing so helps you identify any type conflicts that exist across your graph.

### Using Apollo Server

If your subgraphs use Apollo Server, add federation support to them by installing the `@apollo/subgraph` package:

```bash
npm install @apollo/subgraph
```

Then use the `buildSubgraphSchema` function to augment your schema with fields that are necessary for federation support:

```js
const { ApolloServer } = require('apollo-server');
const { buildSubgraphSchema } = require('@apollo/subgraph');

const server = new ApolloServer({
  schema: buildSubgraphSchema([
    {
      typeDefs,
      resolvers,
    },
  ]),
});
```

### Using a GraphQL server besides Apollo Server

There are [several community-contributed packages](./other-servers/) that add federation support to other GraphQL runtimes.

## Step 2: Register your schemas with a GraphQL registry

We strongly recommend that you register all of your GraphQL schemas with an [external registry](https://principledgraphql.com/integrity#3-track-the-schema-in-a-registry). This registry supports running the gateway with the subgraphs' partial schemas. Additionally, it enables tracking changes at the subgraph level and protecting the graph from changes that break composition.

[Apollo Studio](https://www.apollographql.com/docs/studio/) provides a free schema registry that helps you manage your federated gateway's configuration. You provide your gateway a Studio API key on startup, which directs the gateway to download your schemas automatically in a fault-tolerant way.

Studio can also provide [schema validation](https://www.apollographql.com/docs/studio/managed-federation/overview/#validating-changes-to-the-graph) to ensure that all changes you make to your subgraphs are compatible with your complete graph.

> [Learn more about managed configuration](https://www.apollographql.com/docs/studio/managed-federation/overview/)

## Step 3: Start up an Apollo Server gateway

After you've registered your schemas, you can start exposing your subgraphs from a federation-compatible gateway. Apollo Server's gateway is a query planner and executor that handles incoming GraphQL requests and breaks them down into a collection of operations to perform on your subgraphs.

We recommend setting up the Apollo Server gateway _alongside_ your existing schema-stitching gateway. Depending on your infrastructure, you might even want to run both in the same _process_ to support dynamically routing traffic through one gateway or the other.

To enable managed configuration with Apollo Studio, set the `APOLLO_KEY` and `APOLLO_GRAPH_REF` environment variables when you start up your Apollo Server gateway, and **do not provide the `supergraphSDL` or `serviceList` constructor option to `ApolloGateway`**. For details, see the [Apollo Studio documentation](https://www.apollographql.com/docs/studio/managed-federation/setup/).

After your gateway is set up, you can make direct queries to it that are routed to the correct subgraphs.

## Step 4: Move linking logic to your subgraphs

When using a schema-stitching gateway, your linking logic typically resides _in the gateway itself_. In the federation model, however, linking logic resides _in each subgraph_. Therefore, you need to migrate linking logic from your schema-stitching gateway into each of your subgraphs.

Here are recommendations for common cases when migrating your logic:

* **Fragments**: Fragments in a schema-stitching resolver, usually translate to a combination of `@key` and `@requires` directives in a federated model. In general, think of `@key` as the field(s) that completely identify an entity, and only use `@requires` for additional, non-identifying information.
* **Filtering types**: We do not recommend filtering types out of your exposed schema when using a gateway. If you want to hide types, do not include them in your subgraph's registered schema.
* **Renaming types**: If you are currently renaming types at the gateway level, rename these types at the subgraph level instead.
* **Transforming fields**: If you are currently transforming fields at the gateway level, transform these fields at the subgraph level instead.

### Adding resolvers to your subgraphs

At this point your subgraphs support federation, but they still need to be able to resolve extensions to types that are defined in _other_ subgraphs.

A schema-stitching architecture declares this logic at the gateway level using the `delegateToSchema` function, like so:

```js
resolvers: {
  Reservation: {
    user: {
      fragment: `... on Reservation { userId }`,
      resolve: (parent, args, context, info) => {
        return info.mergeInfo.delegateToSchema({
          schema: userSchema,
          operation: 'query',
          fieldName: 'user',
          args: {
            id: parent.userId,
          },
          context,
          info,
        });
      },
    },
  },
}
```

This resolver calls `Query.user` on the `userSchema` to look up a `User`. It adds that user to the `Reservation.user` field that was previously defined at the gateway. This code can all remain. You don't need to remove it from the stitched gateway. In fact, if you did that, the stitched gateway would break.

On the other hand, a _federated_ architecture defines its resolvers at the subgraph level. These resolvers rely on **entities**, which are identified by a primary key. For example, the Reservation subgraph must define the `Reservation` type as an entity to allow other subgraphs to extend it. These other subgraphs use the `Reservation`'s `@key` fields to uniquely identify a given instance:

```graphql
type Reservation @key(fields: "id") {
  id: ID!
  ...
}
```

In the Users subgraph, you can then extend the `Reservation` type with a `user` field like so:

```graphql
extend type Reservation @key(fields: "id") {
  id: ID! @external
  userId: ID! @external
  user: User @requires(fields: "userId")
}
```

The `user` field indicates that it `@requires` a `Reservation`'s `userId` field in order to identify the user that _made_ the reservation.

Then in the Users subgraph, you can add a resolver for `Reservation.user` like so:

```js
{
  Reservation: {
    user: ({ userId }) => {
      return lookupUser(userId);
    },
  }
}
```

Federated resolvers like this one always receive an object that represents an instance of the extended entity. This object includes the fields that are part of the entity's `@key`, along with any other fields that the resolver `@requires`.

For example, this `Reservation.user` resolver receives the `id` of the reservation and a `userId`. You can use the `userId` to look up the corresponding user.

## Step 5: Move traffic from the schema-stitching gateway to the Apollo Server gateway

At this point, both your schema-stitching gateway and your federated gateway are able to resolve GraphQL operations. You can now begin moving traffic from the schema-stitching gateway to the federated gateway.

Perform this migration in the manner that best suits your infrastructure and applications.

Some options include:

* Testing a complete migration in your staging environment to verify that both gateways behave identically
* Use HTTP headers or feature flags to migrate your internal clients without affecting your user-facing clients

## Step 6: Remove schema-stitching fields from your federated schema

After you've fully migrated your graph and incoming traffic to use your federated gateway, you can remove all stitching-specific logic from your architecture.

You can now begin to modify your existing schema to take full advantage of the
features that federation provides. These features include:

* Greater flexibility with [federation core concepts](./subgraphs/)
* [Metrics and analysis of query plans](./performance/monitoring/#metrics-and-observability)
* [Gateway support for live schema updates from subgraphs](./managed-federation/deployment/#the-subgraph-publish-lifecycle)
* [Validation of composition logic and usage traffic](./managed-federation/federated-schema-checks/) (with a paid plan)
