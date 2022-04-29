import { astSerializer, queryPlanSerializer, QueryPlanner } from '@apollo/query-planner';
import { composeServices } from '@apollo/composition';
import { asFed2SubgraphDocument, assert, buildSchema, operationFromDocument, Schema, ServiceDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { MAX_COMPUTED_PLANS } from '../buildPlan';
import { FetchNode, FlattenNode, SequenceNode } from '../QueryPlan';
import { FieldNode, OperationDefinitionNode, parse } from 'graphql';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

function composeAndCreatePlanner(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  const compositionResults = composeServices(
    services.map((s) => ({ ...s, typeDefs: asFed2SubgraphDocument(s.typeDefs) }))
  );
  expect(compositionResults.errors).toBeUndefined();
  return [
    compositionResults.schema!.toAPISchema(),
    new QueryPlanner(buildSchema(compositionResults.supergraphSdl!))
  ];
}

test('can use same root operation from multiple subgraphs in parallel', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        me: User! @shareable
      }

      type User @key(fields: "id") {
        id: ID!
        prop1: String
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Query {
        me: User! @shareable
      }

      type User @key(fields: "id") {
        id: ID!
        prop2: String
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
  const operation = operationFromDocument(api, gql`
    {
      me {
        prop1
        prop2
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  // Note that even though we have keys, it is faster to query both
  // subgraphs in parallel for each property than querying one first
  // and then using the key.
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Parallel {
        Fetch(service: "Subgraph1") {
          {
            me {
              prop1
            }
          }
        },
        Fetch(service: "Subgraph2") {
          {
            me {
              prop2
            }
          }
        },
      },
    }
  `);
});

test('pick keys that minimize fetches', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        transfers: [Transfer!]!
      }

      type Transfer @key(fields: "from { iso } to { iso }") {
        from: Country!
        to: Country!
      }

      type Country @key(fields: "iso") {
        iso: String!
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Transfer @key(fields: "from { iso } to { iso }") {
        id: ID!
        from: Country!
        to: Country!
      }

      type Country @key(fields: "iso") {
        iso: String!
        currency: Currency!
      }

      type Currency {
        name: String!
        sign: String!
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
  const operation = operationFromDocument(api, gql`
    {
      transfers {
        from {
          currency {
            name
          }
        }
        to {
          currency {
            sign
          }
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  // We want to make sure we use the key on Transfer just once, not 2 fetches using the keys
  // on Country.
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph1") {
          {
            transfers {
              __typename
              from {
                iso
              }
              to {
                iso
              }
            }
          }
        },
        Flatten(path: "transfers.@") {
          Fetch(service: "Subgraph2") {
            {
              ... on Transfer {
                __typename
                from {
                  iso
                }
                to {
                  iso
                }
              }
            } =>
            {
              ... on Transfer {
                from {
                  currency {
                    name
                  }
                }
                to {
                  currency {
                    sign
                  }
                }
              }
            }
          },
        },
      },
    }
  `);
});

describe('@provides', () => {
  it('works with nested provides', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          doSomething: Response
          doSomethingWithProvides: Response @provides(fields: "responseValue { subResponseValue { subSubResponseValue } }")
        }

        type Response {
          responseValue: SubResponse
        }

        type SubResponse {
          subResponseValue: SubSubResponse
        }

        type SubSubResponse @key(fields: "id") {
          id: ID!
          subSubResponseValue: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type SubSubResponse @key(fields: "id") {
          id: ID!
          subSubResponseValue: Int @shareable
        }
      `
    }

    let [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      {
        doSomething {
          responseValue {
            subResponseValue {
              subSubResponseValue
            }
          }
        }
      }
      `);

    let plan = queryPlanner.buildQueryPlan(operation);
    // This is our sanity check: we first query _without_ the provides to make sure we _do_ need to
    // go the the second subgraph.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              doSomething {
                responseValue {
                  subResponseValue {
                    __typename
                    id
                  }
                }
              }
            }
          },
          Flatten(path: "doSomething.responseValue.subResponseValue") {
            Fetch(service: "Subgraph2") {
              {
                ... on SubSubResponse {
                  __typename
                  id
                }
              } =>
              {
                ... on SubSubResponse {
                  subSubResponseValue
                }
              }
            },
          },
        },
      }
      `);

    // And now make sure with the provides we do only get a fetch to subgraph1
    operation = operationFromDocument(api, gql`
      {
        doSomethingWithProvides {
          responseValue {
            subResponseValue {
              subSubResponseValue
            }
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            doSomethingWithProvides {
              responseValue {
                subResponseValue {
                  subSubResponseValue
                }
              }
            }
          }
        },
      }
      `);
  });

  it('works on interfaces', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          noProvides: I
          withProvides: I @provides(fields: "v { a }")
        }

        interface I {
          v: Value
        }

        type Value {
          a: Int @shareable
        }

        type T1 implements I @key(fields: "id") {
          id: ID!
          v: Value @external
        }

        type T2 implements I @key(fields: "id") {
          id: ID!
          v: Value @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Value {
          a: Int @shareable
          b: Int
        }

        type T1 @key(fields: "id") {
          id: ID!
          v: Value @shareable
        }

        type T2 @key(fields: "id") {
          id: ID!
          v: Value @shareable
        }
      `
    }

    let [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      {
        noProvides {
          v {
            a
          }
        }
      }
      `);

    let plan = queryPlanner.buildQueryPlan(operation);
    // This is our sanity check: we first query _without_ the provides to make sure we _do_ need to
    // go the the second subgraph.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              noProvides {
                __typename
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                }
              }
            }
          },
          Flatten(path: "noProvides") {
            Fetch(service: "Subgraph2") {
              {
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                }
              } =>
              {
                ... on T1 {
                  v {
                    a
                  }
                }
                ... on T2 {
                  v {
                    a
                  }
                }
              }
            },
          },
        },
      }
      `);

    // Ensuring that querying only `a` can be done with subgraph1 only.
    operation = operationFromDocument(api, gql`
      {
        withProvides {
          v {
            a
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            withProvides {
              __typename
              v {
                a
              }
            }
          }
        },
      }
      `);

    // Sanity check that if we query `b` however we have to got to subgraph2.
    operation = operationFromDocument(api, gql`
      {
        withProvides {
          v {
            a
            b
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              withProvides {
                __typename
                v {
                  a
                }
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                }
              }
            }
          },
          Flatten(path: "withProvides") {
            Fetch(service: "Subgraph2") {
              {
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                }
              } =>
              {
                ... on T1 {
                  v {
                    b
                  }
                }
                ... on T2 {
                  v {
                    b
                  }
                }
              }
            },
          },
        },
      }
      `);
  });

  it('works on unions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          noProvides: U
          withProvidesForT1: U @provides(fields: "... on T1 { a }")
          withProvidesForBoth: U @provides(fields: "... on T1 { a } ... on T2 {b}")
        }

        union U = T1 | T2

        type T1 @key(fields: "id") {
          id: ID!
          a: Int @external
        }

        type T2 @key(fields: "id") {
          id: ID!
          a: Int
          b: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T1 @key(fields: "id") {
          id: ID!
          a: Int @shareable
        }

        type T2 @key(fields: "id") {
          id: ID!
          b: Int @shareable
        }
      `
    }

    let [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      {
        noProvides {
          ... on T1 {
            a
          }
          ... on T2 {
            a
            b
          }
        }
      }
      `);

    let plan = queryPlanner.buildQueryPlan(operation);
    // This is our sanity check: we first query _without_ the provides to make sure we _do_ need to
    // go the the second subgraph.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              noProvides {
                __typename
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                  a
                }
              }
            }
          },
          Flatten(path: "noProvides") {
            Fetch(service: "Subgraph2") {
              {
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                }
              } =>
              {
                ... on T1 {
                  a
                }
                ... on T2 {
                  b
                }
              }
            },
          },
        },
      }
      `);

    // Ensuring that querying only `a` can be done with subgraph1 only when provided.
    operation = operationFromDocument(api, gql`
      {
        withProvidesForT1 {
          ... on T1 {
            a
          }
          ... on T2 {
            a
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            withProvidesForT1 {
              __typename
              ... on T1 {
                a
              }
              ... on T2 {
                a
              }
            }
          }
        },
      }
      `);

    // But ensure that querying `b` still goes to subgraph2 if only a is provided.
    operation = operationFromDocument(api, gql`
      {
        withProvidesForT1 {
          ... on T1 {
            a
          }
          ... on T2 {
            a
            b
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              withProvidesForT1 {
                __typename
                ... on T1 {
                  a
                }
                ... on T2 {
                  __typename
                  id
                  a
                }
              }
            }
          },
          Flatten(path: "withProvidesForT1") {
            Fetch(service: "Subgraph2") {
              {
                ... on T2 {
                  __typename
                  id
                }
              } =>
              {
                ... on T2 {
                  b
                }
              }
            },
          },
        },
      }
      `);

    // Lastly, if both are provided, ensures we only hit subgraph1.
    operation = operationFromDocument(api, gql`
      {
        withProvidesForBoth {
          ... on T1 {
            a
          }
          ... on T2 {
            a
            b
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            withProvidesForBoth {
              __typename
              ... on T1 {
                a
              }
              ... on T2 {
                a
                b
              }
            }
          }
        },
      }
      `);
  });

  it('allow providing fields for only some subtype', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          noProvides: I
          withProvidesOnA: I @provides(fields: "... on T2 { a }")
          withProvidesOnB: I @provides(fields: "... on T2 { b }")
        }

        interface I {
          a: Int
          b: Int
        }

        type T1 implements I @key(fields: "id") {
          id: ID!
          a: Int
          b: Int @external
        }

        type T2 implements I @key(fields: "id") {
          id: ID!
          a: Int @external
          b: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T1 @key(fields: "id") {
          id: ID!
          b: Int
        }

        type T2 @key(fields: "id") {
          id: ID!
          a: Int @shareable
          b: Int @shareable
        }
      `
    }

    let [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      {
        noProvides {
          a
          b
        }
      }
      `);

    let plan = queryPlanner.buildQueryPlan(operation);
    // This is our sanity check: we first query _without_ the provides to make sure we _do_ need to
    // go the the second subgraph.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              noProvides {
                __typename
                ... on T1 {
                  __typename
                  id
                  a
                }
                ... on T2 {
                  __typename
                  id
                }
              }
            }
          },
          Flatten(path: "noProvides") {
            Fetch(service: "Subgraph2") {
              {
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  __typename
                  id
                }
              } =>
              {
                ... on T1 {
                  b
                }
                ... on T2 {
                  a
                  b
                }
              }
            },
          },
        },
      }
      `);

    // Ensuring that querying only `a` can be done with subgraph1 only.
    operation = operationFromDocument(api, gql`
      {
        withProvidesOnA {
          a
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            withProvidesOnA {
              __typename
              ... on T1 {
                a
              }
              ... on T2 {
                a
              }
            }
          }
        },
      }
      `);

    // Ensuring that for `b`, only the T2 value is provided by subgraph1.
    operation = operationFromDocument(api, gql`
      {
        withProvidesOnB {
          b
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              withProvidesOnB {
                __typename
                ... on T1 {
                  __typename
                  id
                }
                ... on T2 {
                  b
                }
              }
            }
          },
          Flatten(path: "withProvidesOnB") {
            Fetch(service: "Subgraph2") {
              {
                ... on T1 {
                  __typename
                  id
                }
              } =>
              {
                ... on T1 {
                  b
                }
              }
            },
          },
        },
      }
      `);

    // But if we only query for T2, then no reason to go to subgraph2.
    operation = operationFromDocument(api, gql`
      {
        withProvidesOnB {
          ... on T2 {
            b
          }
        }
      }
      `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            withProvidesOnB {
              __typename
              ... on T2 {
                b
              }
            }
          }
        },
      }
      `);
  });
});

describe('@requires', () => {
  it('handles multiple requires within the same entity fetch', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          is: [I!]!
        }

        interface I {
          id: ID!
          f: Int
          g: Int
        }

        type T1 implements I {
          id: ID!
          f: Int
          g: Int
        }

        type T2 implements I @key(fields: "id") {
          id: ID!
          f: Int!
          g: Int @external
        }

        type T3 implements I @key(fields: "id") {
          id: ID!
          f: Int
          g: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T2 @key(fields: "id") {
          id: ID!
          f: Int! @external
          g: Int @requires(fields: "f")
        }

        type T3 @key(fields: "id") {
          id: ID!
          f: Int @external
          g: Int @requires(fields: "f")
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        is {
          g
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // The main goal of this test is to show that the 2 @requires for `f` gets handled seemlessly
    // into the same fetch group.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              is {
                __typename
                ... on T1 {
                  g
                }
                ... on T2 {
                  __typename
                  id
                  f
                }
                ... on T3 {
                  __typename
                  id
                  f
                }
              }
            }
          },
          Flatten(path: "is.@") {
            Fetch(service: "Subgraph2") {
              {
                ... on T2 {
                  __typename
                  id
                  f
                }
                ... on T3 {
                  __typename
                  id
                  f
                }
              } =>
              {
                ... on T2 {
                  g
                }
                ... on T3 {
                  g
                }
              }
            },
          },
        },
      }
    `);
  });

  test('handles multiple requires involving different nestedness', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          list: [Item]
        }

        type Item @key(fields: "user { id }") {
          id: ID!
          value: String
          user: User
        }

        type User @key(fields: "id") {
          id: ID!
          value: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Item @key(fields: "user { id }") {
          user: User
          value: String @external
          computed: String @requires(fields: "user { value } value")
          computed2: String @requires(fields: "user { value }")
        }

        type User @key(fields: "id") {
          id: ID!
          value: String @external
          computed: String @requires(fields: "value")
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        list {
          computed
          computed2
          user {
            computed
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // The main goal of this test is to show that the 2 @requires for `f` gets handled seemlessly
    // into the same fetch group.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              list {
                __typename
                user {
                  __typename
                  id
                  value
                }
                value
              }
            }
          },
          Parallel {
            Flatten(path: "list.@") {
              Fetch(service: "Subgraph2") {
                {
                  ... on Item {
                    __typename
                    user {
                      id
                      value
                    }
                    value
                  }
                } =>
                {
                  ... on Item {
                    computed
                    computed2
                  }
                }
              },
            },
            Flatten(path: "list.@.user") {
              Fetch(service: "Subgraph2") {
                {
                  ... on User {
                    __typename
                    id
                    value
                  }
                } =>
                {
                  ... on User {
                    computed
                  }
                }
              },
            },
          },
        },
      }
    `);
  })

  it('handles simple require chain (require that depends on another require)', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          v: Int!
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            v: Int! @external
            inner: Int! @requires(fields: "v")
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner: Int! @external
          outer: Int! @requires(fields: "inner")
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3);
    // Ensures that if we only ask `outer`, we get everything needed in between.
    let operation = operationFromDocument(api, gql`
      {
        t {
          outer
        }
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              t {
                __typename
                id
                v
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph2") {
              {
                ... on T {
                  __typename
                  v
                  id
                }
              } =>
              {
                ... on T {
                  inner
                }
              }
            },
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph3") {
              {
                ... on T {
                  __typename
                  inner
                  id
                }
              } =>
              {
                ... on T {
                  outer
                }
              }
            },
          },
        },
      }
    `);

    // Ensures that manually asking for the required dependencies doesn't change anything 
    // (note: technically it happens to switch the order of fields in the inputs of "Subgraph2"
    // so the plans are not 100% the same "string", which is why we inline it in both cases,
    // but that's still the same plan and a perfectly valid output).
    operation = operationFromDocument(api, gql`
      {
        t {
          v
          inner
          outer
        }
      }
    `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              t {
                __typename
                id
                v
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph2") {
              {
                ... on T {
                  __typename
                  id
                  v
                }
              } =>
              {
                ... on T {
                  inner
                }
              }
            },
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph3") {
              {
                ... on T {
                  __typename
                  inner
                  id
                }
              } =>
              {
                ... on T {
                  outer
                }
              }
            },
          },
        },
      }
    `);
  });

  it('handles require chain not ending in original group', () => {
    // This is somewhat simiar to the 'simple require chain' case, but the chain does not
    // end in the group in which the query start
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            v: Int! @external
            inner: Int! @requires(fields: "v")
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner: Int! @external
          outer: Int! @requires(fields: "inner")
        }
      `
    }

    const subgraph4 = {
      name: 'Subgraph4',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v: Int!
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3, subgraph4);
    // Ensures that if we only ask `outer`, we get everything needed in between.
    let operation = operationFromDocument(api, gql`
      {
        t {
          outer
        }
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    const expectedPlan = `
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              t {
                __typename
                id
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph4") {
              {
                ... on T {
                  __typename
                  id
                }
              } =>
              {
                ... on T {
                  v
                }
              }
            },
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph2") {
              {
                ... on T {
                  __typename
                  v
                  id
                }
              } =>
              {
                ... on T {
                  inner
                }
              }
            },
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph3") {
              {
                ... on T {
                  __typename
                  inner
                  id
                }
              } =>
              {
                ... on T {
                  outer
                }
              }
            },
          },
        },
      }
    `;
    expect(plan).toMatchInlineSnapshot(expectedPlan);

    // Ensures that manually asking for the required dependencies doesn't change anything.
    operation = operationFromDocument(api, gql`
      {
        t {
          v
          inner
          outer
        }
      }
    `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(expectedPlan);
  });

  it('handles longer require chain (a chain of 10 requires)', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          v1: Int!
        }
      `
    }

    const totalRequires = 10;
    const subgraphs: ServiceDefinition[] = [subgraph1];
    for (let i = 2; i <= totalRequires; i++) {
      subgraphs.push({
        name: `Subgraph${i}`,
        typeDefs: gql`
          type T @key(fields: "id") {
              id: ID!
              v${i-1}: Int! @external
              v${i}: Int! @requires(fields: "v${i-1}")
          }
        `
      });
    }

    const [api, queryPlanner] = composeAndCreatePlanner(...subgraphs);
    // Ensures that if we only ask `outer`, we get everything needed in between.
    let operation = operationFromDocument(api, gql`
      {
        t {
          v${totalRequires}
        }
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    const dependentFetches: string[] = [];
    for (let i = 2; i <= totalRequires; i++) {
      dependentFetches.push(`${i === 2 ? '' : '          '}Flatten(path: "t") {
            Fetch(service: "Subgraph${i}") {
              {
                ... on T {
                  __typename
                  v${i-1}
                  id
                }
              } =>
              {
                ... on T {
                  v${i}
                }
              }
            },
          },`
      );
    }
    const expectedPlan = `
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              t {
                __typename
                id
                v1
              }
            }
          },
          ${dependentFetches.join('\n')}
        },
      }
    `;
    expect(plan).toMatchInlineSnapshot(expectedPlan);
  });

  it('handles complex require chain', () => {
    // Another "require chain" test but with more complexity as we have a require on multiple fields, some of which being
    // nested, and having requirements of their own.
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            inner1: Int!
            inner2_required: Int!
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            inner2_required: Int! @external
            inner2: Int! @requires(fields: "inner2_required")
        }
      `
    }

    const subgraph4 = {
      name: 'Subgraph4',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            inner3: Inner3Type!
        }

        type Inner3Type @key(fields: "k3") {
          k3: ID!
        }

        type Inner4Type @key(fields: "k4") {
          k4: ID!
          inner4_required: Int!
        }
      `
    }

    const subgraph5 = {
      name: 'Subgraph5',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner1: Int! @external
          inner2: Int! @external
          inner3: Inner3Type! @external
          inner4: Inner4Type! @external
          inner5: Int! @external
          outer: Int! @requires(fields: "inner1 inner2 inner3 { inner3_nested } inner4 { inner4_nested } inner5")
        }

      type Inner3Type @key(fields: "k3") {
        k3: ID!
        inner3_nested: Int!
      }

      type Inner4Type @key(fields: "k4") {
        k4: ID!
        inner4_nested: Int! @requires(fields: "inner4_required")
        inner4_required: Int! @external
      }
      `
    }

    const subgraph6 = {
      name: 'Subgraph6',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            inner4: Inner4Type!
        }

        type Inner4Type @key(fields: "k4") {
          k4: ID!
        }
      `
    }

    const subgraph7 = {
      name: 'Subgraph7',
      typeDefs: gql`
        type T @key(fields: "id") {
            id: ID!
            inner5: Int!
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3, subgraph4, subgraph5, subgraph6, subgraph7);
    const operation = operationFromDocument(api, gql`
      {
        t {
          outer
        }
      }
    `);

    // This is a big plan, but afaict, this is optimal. That is, there is 3 main steps:
    // 1. it get the `id` for `T`, which is needed for anything else.
    // 2. it gets all the dependencies of for the @require on `outer` in parallel
    // 3. it finally get `outer`, passing all requirements as inputs.
    //
    // The 2nd step is the most involved, but it's just gathering the "outer" requirements in parallel,
    // while satisfying the "inner" requirements in each branch.
    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              t {
                __typename
                id
              }
            }
          },
          Parallel {
            Flatten(path: "t") {
              Fetch(service: "Subgraph7") {
                {
                  ... on T {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T {
                    inner5
                  }
                }
              },
            },
            Sequence {
              Flatten(path: "t") {
                Fetch(service: "Subgraph6") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      inner4 {
                        __typename
                        k4
                      }
                    }
                  }
                },
              },
              Flatten(path: "t.inner4") {
                Fetch(service: "Subgraph4") {
                  {
                    ... on Inner4Type {
                      __typename
                      k4
                    }
                  } =>
                  {
                    ... on Inner4Type {
                      inner4_required
                    }
                  }
                },
              },
              Flatten(path: "t.inner4") {
                Fetch(service: "Subgraph5") {
                  {
                    ... on Inner4Type {
                      __typename
                      inner4_required
                      k4
                    }
                  } =>
                  {
                    ... on Inner4Type {
                      inner4_nested
                    }
                  }
                },
              },
            },
            Sequence {
              Flatten(path: "t") {
                Fetch(service: "Subgraph4") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      inner3 {
                        __typename
                        k3
                      }
                    }
                  }
                },
              },
              Flatten(path: "t.inner3") {
                Fetch(service: "Subgraph5") {
                  {
                    ... on Inner3Type {
                      __typename
                      k3
                    }
                  } =>
                  {
                    ... on Inner3Type {
                      inner3_nested
                    }
                  }
                },
              },
            },
            Sequence {
              Flatten(path: "t") {
                Fetch(service: "Subgraph2") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      inner1
                      inner2_required
                    }
                  }
                },
              },
              Flatten(path: "t") {
                Fetch(service: "Subgraph3") {
                  {
                    ... on T {
                      __typename
                      inner2_required
                      id
                    }
                  } =>
                  {
                    ... on T {
                      inner2
                    }
                  }
                },
              },
            },
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph5") {
              {
                ... on T {
                  __typename
                  inner1
                  inner2
                  inner3 {
                    inner3_nested
                  }
                  inner4 {
                    inner4_nested
                  }
                  inner5
                  id
                }
              } =>
              {
                ... on T {
                  outer
                }
              }
            },
          },
        },
      }
    `);
  });

  it('planning does not modify the underlying query graph', () => {
    // Test the fixes for issue #1750. Before that fix, the 2nd query planned in this
    // test was unexpectedly mutating some edge conditions of the query planner underlying
    // query graph, resulting in the last assertion of this test failing (despite the
    // 2 compared plans being for the exact same query).
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          entity: Entity
        }

        type Entity @key(fields: "k") {
          k: String
          f1: ValueType
        }

        type ValueType @shareable {
          v1: String
          v2: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Entity @key(fields: "k") {
          k: String
          f1: ValueType @external
          f2: String @requires(fields: "f1 { v1 }")
          f3: String @requires(fields: "f1 { v2 }")
        }

        type ValueType @shareable {
          v1: String
          v2: String
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const op1 = operationFromDocument(api, gql`
      {
        entity {
          f2
          f3
        }
      }
    `);

    const op2 = operationFromDocument(api, gql`
      {
        entity {
          f3
        }
      }
    `);

    const plan1 = queryPlanner.buildQueryPlan(op2);
    const expectedPlan = `
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              entity {
                __typename
                k
                f1 {
                  v2
                }
              }
            }
          },
          Flatten(path: "entity") {
            Fetch(service: "Subgraph2") {
              {
                ... on Entity {
                  __typename
                  k
                  f1 {
                    v2
                  }
                }
              } =>
              {
                ... on Entity {
                  f3
                }
              }
            },
          },
        },
      }
    `;
    expect(plan1).toMatchInlineSnapshot(expectedPlan);

    const plan2 = queryPlanner.buildQueryPlan(op1);
    expect(plan2).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              entity {
                __typename
                k
                f1 {
                  v2
                  v1
                }
              }
            }
          },
          Flatten(path: "entity") {
            Fetch(service: "Subgraph2") {
              {
                ... on Entity {
                  __typename
                  k
                  f1 {
                    v2
                    v1
                  }
                }
              } =>
              {
                ... on Entity {
                  f2
                  f3
                }
              }
            },
          },
        },
      }
    `);

    const plan3 = queryPlanner.buildQueryPlan(op2);
    expect(plan3).toMatchInlineSnapshot(expectedPlan);
  });
});

describe('fetch operation names', () => {
  test('handle subgraph with - in the name', () => {
    const subgraph1 = {
      name: 'S1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `
    }

    const subgraph2 = {
      name: 'non-graphql-name',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      query myOp {
        t {
          x
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S1") {
            {
              t {
                __typename
                id
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "non-graphql-name") {
              {
                ... on T {
                  __typename
                  id
                }
              } =>
              {
                ... on T {
                  x
                }
              }
            },
          },
        },
      }
    `);
    const fetch = ((plan.node as SequenceNode).nodes[1] as FlattenNode).node as FetchNode;
    expect(fetch.operation).toMatch(/^query myOp__non_graphql_name__1.*/i);
  });

  test('ensures sanitization applies repeatedly', () => {
    const subgraph1 = {
      name: 'S1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `
    }

    const subgraph2 = {
      name: 'a-na&me-with-plen&ty-replace*ments',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      query myOp {
        t {
          x
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S1") {
            {
              t {
                __typename
                id
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "a-na&me-with-plen&ty-replace*ments") {
              {
                ... on T {
                  __typename
                  id
                }
              } =>
              {
                ... on T {
                  x
                }
              }
            },
          },
        },
      }
    `);
    const fetch = ((plan.node as SequenceNode).nodes[1] as FlattenNode).node as FetchNode;
    expect(fetch.operation).toMatch(/^query myOp__a_name_with_plenty_replacements__1.*/i);
  });

  test('handle very non-graph subgraph name', () => {
    const subgraph1 = {
      name: 'S1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `
    }

    const subgraph2 = {
      name: '42!',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      query myOp {
        t {
          x
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S1") {
            {
              t {
                __typename
                id
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "42!") {
              {
                ... on T {
                  __typename
                  id
                }
              } =>
              {
                ... on T {
                  x
                }
              }
            },
          },
        },
      }
    `);
    const fetch = ((plan.node as SequenceNode).nodes[1] as FlattenNode).node as FetchNode;

    expect(fetch.operation).toMatch(/^query myOp___42__1.*/i);
  });
});

test('Correctly handle case where there is too many plans to consider', () => {
  // Creating realistic examples where there is too many plan to consider is not trivial, but creating unrealistic examples
  // is thankfully trivial. Here, we just have 2 subgraphs that are _exactly the same_ with a single type having plenty of
  // fields. The reason this create plenty of possible query plans is that each field can be independently reached
  // from either subgraph and so in theory the possible plans is the cartesian product of the 2 choices for each field (which
  // gets very large very quickly). Obviously, there is no reason to do this in practice.

  // Each leaf field is reachable from 2 subgraphs, so doubles the number of plans.
  const fieldCount = Math.ceil(Math.log2(MAX_COMPUTED_PLANS)) + 1;
  const fields = [...Array(fieldCount).keys()].map((i) => `f${i}`);

  const typeDefs = gql`
    type Query {
      t: T @shareable
    }

    type T {
      ${fields.map((f) => `${f}: Int @shareable\n`)}
    }
  `;

  const [api, queryPlanner] = composeAndCreatePlanner({ name: 'S1', typeDefs }, { name: 'S2', typeDefs });
  const operation = operationFromDocument(api, gql`
    {
      t {
        ${fields.map((f) => `${f}\n`)}
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  // Note: The way the code that handle multiple plans currently work, it mess up the order of fields a bit. It's not a
  // big deal in practice cause everything gets re-order in practice during actual execution, but this means it's a tad
  // harder to valid the plan automatically here with `toMatchInlineSnapshot`.
  const mainNode = plan.node;
  assert(mainNode, `Expected the plan to have a main node`);
  expect(mainNode.kind).toBe('Fetch');
  const fetchNode = mainNode as FetchNode;
  expect(fetchNode.serviceName).toBe('S1');
  expect(fetchNode.requires).toBeUndefined();
  const fetchOp = parse(fetchNode.operation);
  expect(fetchOp.definitions).toHaveLength(1);
  // fetchOp is essentially:
  // {
  //   t {
  //     ... all fields
  //   }
  // }
  const mainSelection = (fetchOp.definitions[0] as OperationDefinitionNode).selectionSet;
  const subSelection = (mainSelection.selections[0] as FieldNode).selectionSet;
  const queriedFields = subSelection?.selections.map((s) => (s as FieldNode).name.value) ?? [];
  fields.sort(); // Note that alphabetical order is not numerical order, hence this
  queriedFields.sort();
  expect(queriedFields).toStrictEqual(fields);
});

