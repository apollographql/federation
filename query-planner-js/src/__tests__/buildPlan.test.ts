import { QueryPlanner } from '@apollo/query-planner';
import { assert, buildSchema, operationFromDocument, ServiceDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { MAX_COMPUTED_PLANS } from '../buildPlan';
import { FetchNode, FlattenNode, SequenceNode } from '../QueryPlan';
import { FieldNode, OperationDefinitionNode, parse } from 'graphql';
import { composeAndCreatePlanner, composeAndCreatePlannerWithOptions } from './testHelper';

describe('shareable root fields', () => {
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

  test('handles root operation shareable in many subgraphs', () => {
    const fieldCount = 4;
    const fields = [...Array(fieldCount).keys()].map((i) => `f${i}`);
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          ${fields.map((f) => `${f}: Int\n`)}
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
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type Query {
          me: User! @shareable
        }

        type User @key(fields: "id") {
          id: ID!
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3);
    const operation = operationFromDocument(api, gql`
      {
        me {
          ${fields.map((f) => `${f}\n`)}
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph2") {
            {
              me {
                __typename
                id
              }
            }
          },
          Flatten(path: "me") {
            Fetch(service: "Subgraph1") {
              {
                ... on User {
                  __typename
                  id
                }
              } =>
              {
                ... on User {
                  f0
                  f1
                  f2
                  f3
                }
              }
            },
          },
        },
      }
    `);
  });
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

  it('works with type-condition, even for types only reachable by the @provides', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          noProvides: E
          withProvides: E @provides(fields: "i { a ... on T1 { b } }")
        }

        type E @key(fields: "id") {
          id: ID!
          i: I @external
        }

        interface I {
          a: Int
        }

        type T1 implements I @key(fields: "id") {
          id: ID!
          a: Int @external
          b: Int @external
        }

        type T2 implements I @key(fields: "id") {
          id: ID!
          a: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type E @key(fields: "id") {
          id: ID!
          i: I @shareable
        }

        interface I {
          a: Int
        }

        type T1 implements I @key(fields: "id") {
          id: ID!
          a: Int @shareable
          b: Int @shareable
        }

        type T2 implements I @key(fields: "id") {
          id: ID!
          a: Int @shareable
          c: Int
        }
      `
    }

    let [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      {
        noProvides {
          i {
            a
            ... on T1 {
              b
            }
            ... on T2 {
              c
            }
          }
        }
      }
      `);

    let plan = queryPlanner.buildQueryPlan(operation);
    // This is our sanity check: we first query _without_ the provides to make sure we _do_ need to
    // go the the second subgraph for everything.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              noProvides {
                __typename
                id
              }
            }
          },
          Flatten(path: "noProvides") {
            Fetch(service: "Subgraph2") {
              {
                ... on E {
                  __typename
                  id
                }
              } =>
              {
                ... on E {
                  i {
                    __typename
                    a
                    ... on T1 {
                      b
                    }
                    ... on T2 {
                      c
                    }
                  }
                }
              }
            },
          },
        },
      }
    `);

    // But the same operation with the provides allow to get what is provided from the first subgraph.
    operation = operationFromDocument(api, gql`
      {
        withProvides {
          i {
            a
            ... on T1 {
              b
            }
            ... on T2 {
              c
            }
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
                i {
                  __typename
                  a
                  ... on T1 {
                    b
                  }
                  ... on T2 {
                    __typename
                    id
                  }
                }
              }
            }
          },
          Flatten(path: "withProvides.i") {
            Fetch(service: "Subgraph2") {
              {
                ... on T2 {
                  __typename
                  id
                }
              } =>
              {
                ... on T2 {
                  c
                }
              }
            },
          },
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
                      inner2_required
                      inner1
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

  it('handes diamond-shape depedencies', () => {
    // The idea of this test is that to be able to fulfill the @require in subgraph D, we need
    // both values from C for the @require and values from B for the key itself, but both
    // B and C can be queried directly after the initial query to A. This make the optimal query
    // plan diamond-shaped: after starting in A, we can get everything from B and C in
    // parallel, and then D needs to wait on both of those to run.

    const subgraph1 = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t : T
        }

        type T @key(fields: "id1") {
          id1: ID!
        }
      `
    }

    const subgraph2 = {
      name: 'B',
      typeDefs: gql`
        type T @key(fields: "id1") @key(fields: "id2") {
          id1: ID!
          id2: ID!
          v1: Int
          v2: Int
        }
      `
    }

    const subgraph3 = {
      name: 'C',
      typeDefs: gql`
        type T @key(fields: "id1") {
          id1: ID!
          v3: Int
        }
      `
    }

    const subgraph4 = {
      name: 'D',
      typeDefs: gql`
        type T @key(fields: "id2") {
          id2: ID!
          v3: Int @external
          v4: Int @requires(fields: "v3")
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3, subgraph4);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v1
          v2
          v3
          v4
        }
      }
    `);

    // The optimal plan should:
    // 1. fetch id1 from A
    // 2. from that, it can both (in parallel):
    //   - get id2, v1 and v2 from B
    //   - get v3 from C
    // 3. lastly, once both of those return, it can get v4 from D as it has all requirement
    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "A") {
            {
              t {
                __typename
                id1
              }
            }
          },
          Parallel {
            Flatten(path: "t") {
              Fetch(service: "B") {
                {
                  ... on T {
                    __typename
                    id1
                  }
                } =>
                {
                  ... on T {
                    __typename
                    id2
                    v1
                    v2
                    id1
                  }
                }
              },
            },
            Flatten(path: "t") {
              Fetch(service: "C") {
                {
                  ... on T {
                    __typename
                    id1
                  }
                } =>
                {
                  ... on T {
                    v3
                  }
                }
              },
            },
          },
          Flatten(path: "t") {
            Fetch(service: "D") {
              {
                ... on T {
                  __typename
                  v3
                  id2
                }
              } =>
              {
                ... on T {
                  v4
                }
              }
            },
          },
        },
      }
    `);
  });

  describe('@include and @skip', () => {
    it('handles a simple @requires triggered within a conditional', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            a: Int
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            a: Int @external
            b: Int @requires(fields: "a")
          }
        `
      }

      const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
      const operation = operationFromDocument(api, gql`
        query foo($test: Boolean!){
          t @include(if: $test) {
            b
          }
        }
      `);

      const plan = queryPlanner.buildQueryPlan(operation);
      // Note that during query planning, the inputs for the 2nd fetch also have the `@include(if: $test)` condition
      // on them, but the final query plan format does not support that at the momment, which is why they don't
      // appear below (it is a bit of a shame because that means the gateway/router can't use it, and so this
      // should (imo) be fixed but...).
      expect(plan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "Subgraph1") {
              {
                t @include(if: $test) {
                  __typename
                  id
                  a
                }
              }
            },
            Flatten(path: "t") {
              Fetch(service: "Subgraph2") {
                {
                  ... on T {
                    __typename
                    id
                    a
                  }
                } =>
                {
                  ... on T @include(if: $test) {
                    b
                  }
                }
              },
            },
          },
        }
      `);
    });

    it('handles a @requires triggered conditionally', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            a: Int
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            a: Int @external
            b: Int @requires(fields: "a")
          }
        `
      }

      const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
      const operation = operationFromDocument(api, gql`
        query foo($test: Boolean!){
          t {
            b @include(if: $test)
          }
        }
      `);

      const plan = queryPlanner.buildQueryPlan(operation);
      expect(plan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "Subgraph1") {
              {
                t {
                  __typename
                  id
                  ... on T @include(if: $test) {
                    a
                  }
                }
              }
            },
            Flatten(path: "t") {
              Fetch(service: "Subgraph2") {
                {
                  ... on T {
                    __typename
                    id
                    a
                  }
                } =>
                {
                  ... on T {
                    b @include(if: $test)
                  }
                }
              },
            },
          },
        }
      `);
    });

    it('handles a @requires where multiple conditional are involved', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        typeDefs: gql`
          type Query {
            a: A
          }

          type A @key(fields: "idA") {
            idA: ID!
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        typeDefs: gql`
          type A @key(fields: "idA") {
            idA: ID!
            b: [B]
          }

          type B @key(fields: "idB") {
            idB: ID!
            required: Int
          }
        `
      }

      const subgraph3 = {
        name: 'Subgraph3',
        typeDefs: gql`
          type B @key(fields: "idB") {
            idB: ID!
            c: Int @requires(fields: "required")
            required: Int @external
          }
        `
      }

      const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3);
      const operation = operationFromDocument(api, gql`
        query foo($test1: Boolean!, $test2: Boolean!){
          a @include(if: $test1) {
            b @include(if: $test2) {
              c
            }
          }
        }
      `);

      const plan = queryPlanner.buildQueryPlan(operation);
      expect(plan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "Subgraph1") {
              {
                a @include(if: $test1) {
                  __typename
                  idA
                }
              }
            },
            Flatten(path: "a") {
              Fetch(service: "Subgraph2") {
                {
                  ... on A {
                    __typename
                    idA
                  }
                } =>
                {
                  ... on A @include(if: $test1) {
                    b @include(if: $test2) {
                      __typename
                      idB
                      required
                    }
                  }
                }
              },
            },
            Flatten(path: "a.b.@") {
              Fetch(service: "Subgraph3") {
                {
                  ... on B {
                    ... on B {
                      __typename
                      idB
                      required
                    }
                  }
                } =>
                {
                  ... on B @include(if: $test1) {
                    ... on B @include(if: $test2) {
                      c
                    }
                  }
                }
              },
            },
          },
        }
      `);
    });
  });

  it('can require @inaccessible fields', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          one: One
          onlyIn1: Int
        }

        type One @key(fields: "id") {
          id: ID!
          a: String @inaccessible
          onlyIn1: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          onlyIn2: Int
        }

        type One @key(fields: "id") {
          id: ID!
          a: String @external
          b: String @requires(fields: "a" )
          onlyIn2: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        one {
          b
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              one {
                __typename
                id
                a
              }
            }
          },
          Flatten(path: "one") {
            Fetch(service: "Subgraph2") {
              {
                ... on One {
                  __typename
                  id
                  a
                }
              } =>
              {
                ... on One {
                  b
                }
              }
            },
          },
        },
      }
    `);
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

describe('Field covariance and type-explosion', () => {
  // This tests the issue from https://github.com/apollographql/federation/issues/1858.
  // That issue, which was a bug in the handling of selection sets, was concretely triggered with
  // a mix of an interface field implemented with some covariance and the query plan using
  // type-explosion.
  // We include a test using a federation 1 supergraph as this is how the issue was discovered
  // and it is the simplest way to reproduce since type-explosion is always triggered when we
  // have federation 1 supergraph (due to those lacking information on interfaces). The 2nd
  // test shows that error can be reproduced on a pure fed2 example, it's just a bit more
  // complex as we need to involve a @provide just to force the query planner to type explode
  // (more precisely, this force the query planner to _consider_ type explosion; the generated
  // query plan still ends up not type-exploding in practice since as it's not necessary).
  test('with federation 1 supergraphs', () => {
    const supergraphSdl = `
      schema @core(feature: "https://specs.apollo.dev/core/v0.1") @core(feature: "https://specs.apollo.dev/join/v0.1") {
        query: Query
      }

      directive @core(feature: String!) repeatable on SCHEMA
      directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet) on FIELD_DEFINITION
      directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on OBJECT | INTERFACE
      directive @join__owner(graph: join__Graph!) on OBJECT | INTERFACE
      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      interface Interface {
        field: Interface
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH @join__graph(name: "subgraph", url: "http://localhost:4001/")
      }

      type Object implements Interface {
        field: Object
      }

      type Query {
        dummy: Interface @join__field(graph: SUBGRAPH)
      }
    `;

    const supergraph = buildSchema(supergraphSdl);
    const api = supergraph.toAPISchema();
    const queryPlanner = new QueryPlanner(supergraph);

    const operation = operationFromDocument(api, gql`
      {
        dummy {
          field {
            ... on Object {
              field {
                __typename
              }
            }
          }
        }
      }
    `);
    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "subgraph") {
          {
            dummy {
              __typename
              field {
                __typename
                ... on Object {
                  field {
                    __typename
                  }
                }
              }
            }
          }
        },
      }
    `);
  });

  it('with federation 2 subgraphs', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          dummy: Interface
        }

        interface Interface {
          field: Interface
        }

        type Object implements Interface @key(fields: "id") {
          id: ID!
          field: Object @provides(fields: "x")
          x: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Object @key(fields: "id") {
          id: ID!
          x: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        dummy {
          field {
            ... on Object {
              field {
                __typename
              }
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            dummy {
              __typename
              field {
                __typename
                ... on Object {
                  field {
                    __typename
                  }
                }
              }
            }
          }
        },
      }
    `);
  });
})

describe('handles non-intersecting fragment conditions', () => {
  test('with federation 1 supergraphs', () => {
    const supergraphSdl = `
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2"),
        @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
      {
        query: Query
      }

      directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA
      directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION
      directive @join__graph(name: String!, url: String!) on ENUM_VALUE
      directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT
      directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

      type Apple implements Fruit {
        edible: Boolean!
        hasStem: Boolean!
      }

      type Banana implements Fruit {
        edible: Boolean!
        inBunch: Boolean!
      }

      interface Fruit {
        edible: Boolean!
      }

      type Query {
        fruit: Fruit! @join__field(graph: S1)
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      scalar join__FieldSet

      enum join__Graph {
        S1 @join__graph(name: "S1" url: "")
      }
    `

    const supergraph = buildSchema(supergraphSdl);
    const api = supergraph.toAPISchema();
    const queryPlanner = new QueryPlanner(supergraph);

    const operation = operationFromDocument(api, gql`
      fragment OrangeYouGladIDidntSayBanana on Fruit {
        ... on Banana {
          inBunch
        }
        ... on Apple {
          hasStem
        }
      }

      query Fruitiness {
        fruit {
          ... on Apple {
            ...OrangeYouGladIDidntSayBanana
          }
        }
      }
    `);
    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            fruit {
              __typename
              ... on Apple {
                hasStem
              }
            }
          }
        },
      }
    `);
  });

  test('with federation 2 subgraphs', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        interface Fruit {
          edible: Boolean!
        }

        type Banana implements Fruit {
          edible: Boolean!
          inBunch: Boolean!
        }

        type Apple implements Fruit {
          edible: Boolean!
          hasStem: Boolean!
        }

        type Query {
          fruit: Fruit!
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(api, gql`
      fragment OrangeYouGladIDidntSayBanana on Fruit {
        ... on Banana {
          inBunch
        }
        ... on Apple {
          hasStem
        }
      }

      query Fruitiness {
        fruit {
          ... on Apple {
            ...OrangeYouGladIDidntSayBanana
          }
        }
      }
    `);
    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            fruit {
              __typename
              ... on Apple {
                hasStem
              }
            }
          }
        },
      }
    `);
  });
});

test('avoids unnecessary fetches', () => {
  // This test is a reduced example demonstrating a previous issue with the computation of query plans cost.
  // The general idea is that "Subgraph 3" has a declaration that is kind of useless (it declares entity A
  // that only provides it's own key, so there is never a good reason to use it), but the query planner
  // doesn't know that and will "test" plans including fetch to that subgraphs in its exhaustive search
  // of all options. In theory, the query plan costing mechanism should eliminate such plans in favor of
  // plans not having this inefficient, but an issue in the plan cost computation led to such inefficient
  // to have the same cost as the more efficient one and to be picked (just because it was the first computed).
  // This test ensures this costing bug is fixed.

  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
      }

      type T @key(fields: "idT") {
        idT: ID!
        a: A
      }

      type A @key(fields: "idA2") {
        idA2: ID!
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "idT") {
        idT: ID!
        u: U
      }


      type U @key(fields: "idU") {
        idU: ID!
      }
    `
  }

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type A @key(fields: "idA1") {
        idA1: ID!
      }
    `
  }

  const subgraph4 = {
    name: 'Subgraph4',
    typeDefs: gql`
      type A @key(fields: "idA1") @key(fields: "idA2") {
        idA1: ID!
        idA2: ID!
      }
    `
  }

  const subgraph5 = {
    name: 'Subgraph5',
    typeDefs: gql`
      type U @key(fields: "idU") {
        idU: ID!
        v: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3, subgraph4, subgraph5);
  const operation = operationFromDocument(api, gql`
    {
      t {
        u {
          v
        }
        a {
          idA1
        }
      }
    }
  `);
  const queryPlan = queryPlanner.buildQueryPlan(operation);
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              idT
              a {
                __typename
                idA2
              }
            }
          }
        },
        Parallel {
          Sequence {
            Flatten(path: "t") {
              Fetch(service: "Subgraph2") {
                {
                  ... on T {
                    __typename
                    idT
                  }
                } =>
                {
                  ... on T {
                    u {
                      __typename
                      idU
                    }
                  }
                }
              },
            },
            Flatten(path: "t.u") {
              Fetch(service: "Subgraph5") {
                {
                  ... on U {
                    __typename
                    idU
                  }
                } =>
                {
                  ... on U {
                    v
                  }
                }
              },
            },
          },
          Flatten(path: "t.a") {
            Fetch(service: "Subgraph4") {
              {
                ... on A {
                  __typename
                  idA2
                }
              } =>
              {
                ... on A {
                  idA1
                }
              }
            },
          },
        },
      },
    }
  `);
});

describe('Fed1 supergraph handling', () => {
  test('do not type-explode if interface only implemented by value types', () => {
    const supergraphSdl = `
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2"),
        @core(feature: "https://specs.apollo.dev/join/v0.1", for: EXECUTION)
      {
        query: Query
      }

      directive @core(as: String, feature: String!, for: core__Purpose) repeatable on SCHEMA
      directive @join__field(graph: join__Graph, provides: join__FieldSet, requires: join__FieldSet) on FIELD_DEFINITION
      directive @join__graph(name: String!, url: String!) on ENUM_VALUE
      directive @join__owner(graph: join__Graph!) on INTERFACE | OBJECT
      directive @join__type(graph: join__Graph!, key: join__FieldSet) repeatable on INTERFACE | OBJECT

      interface Node {
        id: ID!
      }

      type Query {
        t: T @join__field(graph: S1)
      }

      type T implements Node {
        id: ID!
        nodes: [Node]
      }

      type V implements Node {
        id: ID!
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      scalar join__FieldSet

      enum join__Graph {
        S1 @join__graph(name: "S1" url: "")
        S2 @join__graph(name: "S2" url: "")
      }
    `;

    const supergraph = buildSchema(supergraphSdl);
    const api = supergraph.toAPISchema();
    const queryPlanner = new QueryPlanner(supergraph);

    const operation = operationFromDocument(api, gql`
      {
        t {
          nodes {
            id
          }
        }
      }
    `);

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            t {
              nodes {
                __typename
                id
              }
            }
          }
        },
      }
    `);
  });
});

describe('Named fragments preservation', () => {
  it('works with nested fragments', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          a: Anything
        }

        union Anything = A1 | A2 | A3

        interface Foo {
          foo: String
          child: Foo
        }

        type A1 implements Foo {
          foo: String
          child: Foo
        }

        type A2 implements Foo {
          foo: String
          child: Foo
        }

        type A3 implements Foo {
          foo: String
          child: Foo
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(api, gql`
      query {
        a {
          ...on A1 {
            ...FooSelect
          }
          ...on A2 {
            ...FooSelect
          }
          ...on A3 {
            ...FooSelect
          }
        }
      }

      fragment FooSelect on Foo {
        __typename
        foo
        child {
          ...FooChildSelect
        }
      }

      fragment FooChildSelect on Foo {
        __typename
        foo
        child {
          child {
            child {
              foo
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            a {
              __typename
              ... on A1 {
                ...FooSelect
              }
              ... on A2 {
                ...FooSelect
              }
              ... on A3 {
                ...FooSelect
              }
            }
          }
          
          fragment FooChildSelect on Foo {
            __typename
            foo
            child {
              __typename
              child {
                __typename
                child {
                  __typename
                  foo
                }
              }
            }
          }
          
          fragment FooSelect on Foo {
            __typename
            foo
            child {
              ...FooChildSelect
            }
          }
        },
      }
    `);
  });

  it('avoid fragments usable only once', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          v1: V
        }

        type V @shareable {
          a: Int
          b: Int
          c: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v2: V
          v3: V
        }

        type V @shareable {
          a: Int
          b: Int
          c: Int
        }
      `
    }

    // We use a fragment which does save some on the original query, but as each
    // field gets to a different subgraph, the fragment would only be used one
    // on each sub-fetch and we make sure the fragment is not used in that case.
    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      query {
        t {
          v1 {
            ...OnV
          }
          v2 {
            ...OnV
          }
        }
      }

      fragment OnV on V {
        a
        b
        c
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
                v1 {
                  a
                  b
                  c
                }
              }
            }
          },
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
                  v2 {
                    a
                    b
                    c
                  }
                }
              }
            },
          },
        },
      }
    `);

    // But double-check that if we query 2 fields from the same subgraph, then
    // the fragment gets used now.
    operation = operationFromDocument(api, gql`
      query {
        t {
          v2 {
            ...OnV
          }
          v3 {
            ...OnV
          }
        }
      }

      fragment OnV on V {
        a
        b
        c
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
              }
            }
          },
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
                  v2 {
                    ...OnV
                  }
                  v3 {
                    ...OnV
                  }
                }
              }
              
              fragment OnV on V {
                a
                b
                c
              }
            },
          },
        },
      }
    `);
  });

  it.each([ true, false ])('respects query planner option "reuseQueryFragments=%p"', (reuseQueryFragments: boolean) => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T {
          a1: A
          a2: A
        }

        type A {
          x: Int
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithOptions([subgraph1], { reuseQueryFragments });
    const operation = operationFromDocument(api, gql`
      query {
        t {
          a1 {
            ...Selection
          }
          a2 {
            ...Selection
          }
        }
      }

      fragment Selection on A {
        x
        y
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    const withReuse = `
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              a1 {
                ...Selection
              }
              a2 {
                ...Selection
              }
            }
          }
          
          fragment Selection on A {
            x
            y
          }
        },
      }
    `;
    const withoutReuse = `
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              a1 {
                x
                y
              }
              a2 {
                x
                y
              }
            }
          }
        },
      }
    `

    expect(plan).toMatchInlineSnapshot(reuseQueryFragments ? withReuse : withoutReuse);
  });

  it('works with nested fragments when only the nested fragment gets preserved', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields : "id") {
          id: ID!
          a: V
          b: V
        }

        type V {
          v: Int
        }

      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    let operation = operationFromDocument(api, gql`
      {
        t {
          ...OnT
        }
      }

      fragment OnT on T {
        a {
          ...OnV
        }
        b {
          ...OnV
        }
      }

      fragment OnV on V {
        v
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              a {
                ...OnV
              }
              b {
                ...OnV
              }
            }
          }
          
          fragment OnV on V {
            v
          }
        },
      }
    `);
  });

  it('preserves directives when fragment not used (because used only once)', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields : "id") {
          id: ID!
          a: Int
          b: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    let operation = operationFromDocument(api, gql`
      query test($if: Boolean) {
        t {
          id
          ...OnT @include(if: $if)
        }
      }

      fragment OnT on T {
        a
        b
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              id
              ... on T @include(if: $if) {
                a
                b
              }
            }
          }
        },
      }
    `);
  });

  it('preserves directives when fragment is re-used', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields : "id") {
          id: ID!
          a: Int
          b: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    let operation = operationFromDocument(api, gql`
      query test($test1: Boolean, $test2: Boolean) {
        t {
          id
          ...OnT @include(if: $test1)
          ...OnT @include(if: $test2)
        }
      }

      fragment OnT on T {
        a
        b
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              id
              ...OnT @include(if: $test1)
              ...OnT @include(if: $test2)
            }
          }
          
          fragment OnT on T {
            a
            b
          }
        },
      }
    `);
  });

  it('do not try to apply fragments that are not valid for the subgaph', () => {
    // Slightly artificial example for simplicity, but this highlight the problem.
    // In that example, the only queried subgraph is the first one (there is in fact
    // no way to ever reach the 2nd one), so the plan should mostly simply forward
    // the query to the 1st subgraph, but a subtlety is that the named fragment used
    // in the query is *not* valid for Subgraph1, because it queries `b` on `I`, but
    // there is no `I.b` in Subgraph1.
    // So including the named fragment in the fetch would be erroneous: the subgraph
    // server would reject it when validating the query, and we must make sure it
    // is not reused.
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i1: I
          i2: I
        }

        interface I {
          a: Int
        }

        type T implements I {
          a: Int
          b: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I {
          a: Int
          b: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      query {
        i1 {
          ... on T {
            ...Frag
          }
        }
        i2 {
          ... on T {
            ...Frag
          }
        }
      }

      fragment Frag on I {
        b
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            i1 {
              __typename
              ... on T {
                b
              }
            }
            i2 {
              __typename
              ... on T {
                b
              }
            }
          }
        },
      }
    `);
  });
});

test('works with key chains', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
      }

      type T @key(fields: "id1") {
        id1: ID!
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id1")  @key(fields: "id2") {
        id1: ID!
        id2: ID!
      }
    `
  }

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T @key(fields: "id2") {
        id2: ID!
        x: Int
        y: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3);
  // Note: querying `id2` is only purpose, because there is 2 choice to get `id2` (either
  // from then 2nd or 3rd subgraph), and that create some choice in the query planning algorithm,
  // so excercices additional paths.
  const operation = operationFromDocument(api, gql`
    {
      t {
        id2
        x
        y
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              id1
            }
          }
        },
        Flatten(path: "t") {
          Fetch(service: "Subgraph2") {
            {
              ... on T {
                __typename
                id1
              }
            } =>
            {
              ... on T {
                id2
              }
            }
          },
        },
        Flatten(path: "t") {
          Fetch(service: "Subgraph3") {
            {
              ... on T {
                __typename
                id2
              }
            } =>
            {
              ... on T {
                x
                y
              }
            }
          },
        },
      },
    }
  `);
});

describe('__typename handling', () => {
  it('preservers aliased __typename', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    let operation = operationFromDocument(api, gql`
      query {
        t {
          foo: __typename
          x
        }
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              foo: __typename
              x
            }
          }
        },
      }
    `);

    operation = operationFromDocument(api, gql`
      query {
        t {
          foo: __typename
          x
          __typename
        }
      }
    `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              foo: __typename
              x
            }
          }
        },
      }
    `);
  });

  it('does not needlessly consider options for __typename', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          s: S
        }

        type S @key(fields: "id") {
          id: ID
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type S @key(fields: "id") {
          id: ID
          t: T @shareable
        }

        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type S @key(fields: "id") {
          id: ID
          t: T @shareable
        }

        type T @key(fields: "id") {
          id: ID!
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2, subgraph3);
    // This tests the patch from https://github.com/apollographql/federation/pull/2137.
    // Namely, the schema is such that `x` can only be fetched from one subgraph, but
    // technically __typename can be fetched from 2 subgraphs. However, the optimization
    // we test for is that we actually don't consider both choices for __typename and
    // instead only evaluate a single query plan (the assertion on `evaluatePlanCount`)
    let operation = operationFromDocument(api, gql`
      query {
        s {
          t {
            __typename
            x
          }
        }
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(1);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              s {
                __typename
                id
              }
            }
          },
          Flatten(path: "s") {
            Fetch(service: "Subgraph2") {
              {
                ... on S {
                  __typename
                  id
                }
              } =>
              {
                ... on S {
                  t {
                    __typename
                    x
                  }
                }
              }
            },
          },
        },
      }
    `);

    // Almost the same test, but we artificially create a case where the result set
    // for `s` has a __typename alongside just an inline fragments. This should
    // change nothing to the example (the __typename on `s` is trivially fetched
    // from the 1st subgraph and does not create new choices), but an early bug
    // in the implementation made this example forgo the optimization of the
    // __typename within `t`. We make sure this is not case (that we still only
    // consider a single choice of plan).
    operation = operationFromDocument(api, gql`
      query {
        s {
          __typename
          ... on S {
            t {
              __typename
              x
            }
          }
        }
      }
    `);

    plan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(1);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              s {
                __typename
                id
              }
            }
          },
          Flatten(path: "s") {
            Fetch(service: "Subgraph2") {
              {
                ... on S {
                  __typename
                  id
                }
              } =>
              {
                ... on S {
                  t {
                    __typename
                    x
                  }
                }
              }
            },
          },
        },
      }
    `);
  });
});

describe('mutations', () => {
  it('executes mutation operations in sequence', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          q1: Int
        }

        type Mutation {
          m1: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Mutation {
          m2: Int
        }
      `
    }

    let [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(api, gql`
      mutation {
        m2
        m1
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph2") {
            {
              m2
            }
          },
          Fetch(service: "Subgraph1") {
            {
              m1
            }
          },
        },
      }
    `);
  });
});

describe('interface type-explosion', () => {
  test('handles non-matching value types under interface field', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i: I
        }

        interface I {
          s: S
        }

        type T implements I @key(fields: "id") {
          id: ID!
          s: S @shareable
        }

        type S @shareable {
          x: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          s: S @shareable
        }

        type S @shareable {
          x: Int
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        i {
          s {
            y
          }
        }
      }
    `);

    // The schema is constructed in such a way that we *need* to type-explode interface `I`
    // to be able to find field `y`. Make sure that happens.
    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              i {
                __typename
                ... on T {
                  __typename
                  id
                }
              }
            }
          },
          Flatten(path: "i") {
            Fetch(service: "Subgraph2") {
              {
                ... on T {
                  __typename
                  id
                }
              } =>
              {
                ... on T {
                  s {
                    y
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  test('skip type-explosion early if unnecessary', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i: I
        }

        interface I {
          s: S
        }

        type T implements I @key(fields: "id") {
          id: ID!
          s: S @shareable
        }

        type S @shareable {
          x: Int
          y: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          s: S @shareable
        }

        type S @shareable {
          x: Int
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        i {
          s {
            y
          }
        }
      }
    `);

    // This test is a small variation on the previous test ('handles non-matching ...'), we
    // we _can_ use the interface field directly and don't need to type-explode. So we
    // double-check that the plan indeed does not type-explode, but the true purpose of
    // this test is to ensure the proper optimisation kicks in so that we do _not_ even
    // evaluate the plan where we type explode. In other words, we ensure that the plan
    // we get is the _only_ one evaluated.
    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            i {
              __typename
              s {
                y
              }
            }
          }
        },
      }
    `);
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(1);
  });
});

/*
 * Those tests the cases where 2 abstract types (interface or union) interact (having some common runtime
 * types intersection), but one of them include an runtime type that the other also include _in the supergraph_
 * but *not* in one of the subgraph. The tl;dr is that in some of those interaction, we must force a type-explosion
 * to handle it properly, but no in other interactions, and this ensures this is handled properly.
 */
describe('merged abstract types handling', () => {
  test('union/interface interaction', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          u: U
        }

        union U = A | B | C

        interface I {
          v: Int
        }

        type A {
          v: Int @shareable
        }

        type B implements I {
          v: Int
        }

        type C implements I {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I {
          v: Int
        }

        type A implements I {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        u {
          ... on I {
            v
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // Type `A` can be returned by `u` and is a `I` *in the supergraph* but not in `Subgraph1`, so need to
    // type-explode `I` in the query to `Subgraph1` so it doesn't exclude `A`.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            u {
              __typename
              ... on A {
                v
              }
              ... on B {
                v
              }
              ... on C {
                v
              }
            }
          }
        },
      }
    `);
  });

  test('union/interface interaction, but no need to type-explode', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          u: U
        }

        union U = B | C

        interface I {
          v: Int
        }

        type A implements I {
          v: Int @shareable
        }

        type B implements I {
          v: Int
        }

        type C implements I {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U = A

        type A {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        u {
          ... on I {
            v
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // While `A` is a `U` in the supergraph while not in `Subgraph1`, since the `u`
    // operation is resolved by `Subgraph1`, it cannot ever return a A, and so
    // there is need to type-explode `I` in this query.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            u {
              __typename
              ... on I {
                v
              }
            }
          }
        },
      }
    `);
  });

  test('interface/union interaction', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i: I
        }

        union U = B | C

        interface I {
          v: Int
        }

        type A implements I {
          v: Int @shareable
        }

        type B implements I {
          v: Int
        }

        type C implements I {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U = A

        type A {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        i {
          ... on U {
            ... on A {
              v
            }
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // Type `A` can be returned by `i` and is a `U` *in the supergraph* but not in `Subgraph1`, so need to
    // type-explode `U` in the query to `Subgraph1` so it doesn't exclude `A`.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            i {
              __typename
              ... on A {
                v
              }
            }
          }
        },
      }
    `);
  });

  test('interface/union interaction, but no need to type-explode', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i: I
        }

        union U = A | B | C

        interface I {
          v: Int
        }

        type A {
          v: Int @shareable
        }

        type B implements I {
          v: Int
        }

        type C implements I {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I {
          v: Int
        }

        type A implements I {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        i {
          ... on U {
            ... on A {
              v
            }
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // While `A` is a `I` in the supergraph while not in `Subgraph1`, since the `i` operation is resolved by
    // `Subgraph1`, it cannot ever return a A, and so we should skip the whole `v` selection; or at the very
    // least, we should not send a query with `... on U { ... on A { <stuff> }}` to `Subgraph1` since it
    // would reject it as invalid.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            i {
              __typename
            }
          }
        },
      }
    `);
  });

  test('interface/interface interaction', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i1: I1
        }

        interface I1 {
          v: Int
        }

        interface I2 {
          v: Int
        }

        type A implements I1 {
          v: Int @shareable
        }

        type B implements I1 & I2 {
          v: Int
        }

        type C implements I1 & I2 {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I2 {
          v: Int
        }

        type A implements I2 {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        i1 {
          ... on I2 {
            v
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // Type `A` can be returned by `i1` and is a `I2` *in the supergraph* but not in `Subgraph1`, so need to
    // type-explode `I2` in the query to `Subgraph1` so it doesn't exclude `A`.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            i1 {
              __typename
              ... on A {
                v
              }
              ... on B {
                v
              }
              ... on C {
                v
              }
            }
          }
        },
      }
    `);
  });

  test('interface/interface interaction, but no need to type-explode', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          i1: I1
        }

        interface I1 {
          v: Int
        }

        interface I2 {
          v: Int
        }

        type A implements I2 {
          v: Int @shareable
        }

        type B implements I1 & I2 {
          v: Int
        }

        type C implements I1 & I2 {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I1 {
          v: Int
        }

        type A implements I1 {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        i1 {
          ... on I2 {
            v
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // While `A` is a `I1` in the supergraph while not in `Subgraph1`, since the `i1`
    // operation is resolved by `Subgraph1`, it cannot ever return a A, and so
    // there is need to type-explode `I2` in this query (even if `Subgraph1` would
    // otherwise not include `A` from a `... on I2`).
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            i1 {
              __typename
              ... on I2 {
                v
              }
            }
          }
        },
      }
    `);
  });

  test('union/union interaction', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          u1: U1
        }

        union U1 = A | B | C
        union U2 = B | C

        type A {
          v: Int @shareable
        }

        type B {
          v: Int
        }

        type C {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U2 = A

        type A {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        u1 {
          ... on U2 {
            ... on A {
              v
            }
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // Type `A` can be returned by `u1` and is a `U2` *in the supergraph* but not in `Subgraph1`, so need to
    // type-explode `U2` in the query to `Subgraph1` so it doesn't exclude `A`.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            u1 {
              __typename
              ... on A {
                v
              }
            }
          }
        },
      }
    `);
  });

  // TODO: this test currently doesn't work due to https://github.com/apollographql/federation/issues/2256
  // (it is not a direct test of that issue, but one of its consequence nonetheles). We should enable it
  // with the fix of that issue.
  test.skip('union/union interaction, but no need to type-explode', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          u1: U1
        }

        union U1 = B | C
        union U2 = A | B | C

        type A {
          v: Int @shareable
        }

        type B {
          v: Int
        }

        type C {
          v: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U1 = A

        type A {
          v: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        u1 {
          ... on U2 {
            ... on A {
              v
            }
          }
        }
      }
      `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // While `A` is a `U1` in the supergraph while not in `Subgraph1`, since the `u1` operation is resolved by
    // `Subgraph1`, it cannot ever return a A, and so we should skip the whole `v` selection; or at the very
    // least, we should not send a query with `u1 { ... on A { <stuff> }}` to `Subgraph1` since it
    // would reject it as invalid.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            u1 {
              __typename
            }
          }
        },
      }
    `);
  });
});
