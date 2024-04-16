import { QueryPlanner } from '@apollo/query-planner';
import {
  assert,
  operationFromDocument,
  ServiceDefinition,
  Supergraph,
  buildSubgraph,
} from '@apollo/federation-internals';
import gql from 'graphql-tag';
import {
  FetchNode,
  FlattenNode,
  PlanNode,
  SequenceNode,
  SubscriptionNode,
  serializeQueryPlan,
} from '../QueryPlan';
import {
  FieldNode,
  OperationDefinitionNode,
  parse,
  validate,
  GraphQLError,
} from 'graphql';
import {
  composeAndCreatePlanner,
  composeAndCreatePlannerWithOptions,
  findFetchNodes,
} from './testHelper';
import { enforceQueryPlannerConfigDefaults } from '../config';

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          me {
            prop1
            prop2
          }
        }
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          me: User! @shareable
        }

        type User @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type Query {
          me: User! @shareable
        }

        type User @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );
    const operation = operationFromDocument(
      api,
      gql`
      {
        me {
          ${fields.map((f) => `${f}\n`)}
        }
      }
    `,
    );

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
    `,
  };

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
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
  const operation = operationFromDocument(
    api,
    gql`
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
    `,
  );

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
          doSomethingWithProvides: Response
            @provides(
              fields: "responseValue { subResponseValue { subSubResponseValue } }"
            )
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type SubSubResponse @key(fields: "id") {
          id: ID!
          subSubResponseValue: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
        {
          doSomething {
            responseValue {
              subResponseValue {
                subSubResponseValue
              }
            }
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          doSomethingWithProvides {
            responseValue {
              subResponseValue {
                subSubResponseValue
              }
            }
          }
        }
      `,
    );

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
        {
          noProvides {
            v {
              a
            }
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          withProvides {
            v {
              a
            }
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          withProvides {
            v {
              a
              b
            }
          }
        }
      `,
    );

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
          withProvidesForBoth: U
            @provides(fields: "... on T1 { a } ... on T2 {b}")
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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
        {
          noProvides {
            a
            b
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          withProvidesOnA {
            a
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          withProvidesOnB {
            b
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          withProvidesOnB {
            ... on T2 {
              b
            }
          }
        }
      `,
    );

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          is {
            g
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    // The main goal of this test is to show that the 2 @requires for `f` gets handled seemlessly
    // into the same fetch group. But note that because the type for `f` differs, the 2nd instance
    // gets aliased (or the fetch would be invalid graphQL).
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
                  f__alias_0: f
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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          list {
            computed
            computed2
            user {
              computed
            }
          }
        }
      `,
    );

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
  });

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v: Int! @external
          inner: Int! @requires(fields: "v")
        }
      `,
    };

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner: Int! @external
          outer: Int! @requires(fields: "inner")
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );
    // Ensures that if we only ask `outer`, we get everything needed in between.
    let operation = operationFromDocument(
      api,
      gql`
        {
          t {
            outer
          }
        }
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v
            inner
            outer
          }
        }
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v: Int! @external
          inner: Int! @requires(fields: "v")
        }
      `,
    };

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner: Int! @external
          outer: Int! @requires(fields: "inner")
        }
      `,
    };

    const subgraph4 = {
      name: 'Subgraph4',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v: Int!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
      subgraph4,
    );
    // Ensures that if we only ask `outer`, we get everything needed in between.
    let operation = operationFromDocument(
      api,
      gql`
        {
          t {
            outer
          }
        }
      `,
    );

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
    expect(serializeQueryPlan(plan)).toMatchString(expectedPlan);

    // Ensures that manually asking for the required dependencies doesn't change anything.
    operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v
            inner
            outer
          }
        }
      `,
    );

    plan = queryPlanner.buildQueryPlan(operation);
    expect(serializeQueryPlan(plan)).toMatchString(expectedPlan);
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
      `,
    };

    const totalRequires = 10;
    const subgraphs: ServiceDefinition[] = [subgraph1];
    for (let i = 2; i <= totalRequires; i++) {
      subgraphs.push({
        name: `Subgraph${i}`,
        typeDefs: gql`
          type T @key(fields: "id") {
              id: ID!
              v${i - 1}: Int! @external
              v${i}: Int! @requires(fields: "v${i - 1}")
          }
        `,
      });
    }

    const [api, queryPlanner] = composeAndCreatePlanner(...subgraphs);
    // Ensures that if we only ask `outer`, we get everything needed in between.
    const operation = operationFromDocument(
      api,
      gql`
      {
        t {
          v${totalRequires}
        }
      }
    `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    const dependentFetches: string[] = [];
    for (let i = 2; i <= totalRequires; i++) {
      dependentFetches.push(`${i === 2 ? '' : '          '}Flatten(path: "t") {
            Fetch(service: "Subgraph${i}") {
              {
                ... on T {
                  __typename
                  v${i - 1}
                  id
                }
              } =>
              {
                ... on T {
                  v${i}
                }
              }
            },
          },`);
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
    expect(serializeQueryPlan(plan)).toMatchString(expectedPlan);
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner1: Int!
          inner2_required: Int!
        }
      `,
    };

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner2_required: Int! @external
          inner2: Int! @requires(fields: "inner2_required")
        }
      `,
    };

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
      `,
    };

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
          outer: Int!
            @requires(
              fields: "inner1 inner2 inner3 { inner3_nested } inner4 { inner4_nested } inner5"
            )
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
      `,
    };

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
      `,
    };

    const subgraph7 = {
      name: 'Subgraph7',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          inner5: Int!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
      subgraph4,
      subgraph5,
      subgraph6,
      subgraph7,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            outer
          }
        }
      `,
    );

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const op1 = operationFromDocument(
      api,
      gql`
        {
          entity {
            f2
            f3
          }
        }
      `,
    );

    const op2 = operationFromDocument(
      api,
      gql`
        {
          entity {
            f3
          }
        }
      `,
    );

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
    expect(serializeQueryPlan(plan1)).toMatchString(expectedPlan);

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
    expect(serializeQueryPlan(plan3)).toMatchString(expectedPlan);
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
          t: T
        }

        type T @key(fields: "id1") {
          id1: ID!
        }
      `,
    };

    const subgraph2 = {
      name: 'B',
      typeDefs: gql`
        type T @key(fields: "id1") @key(fields: "id2") {
          id1: ID!
          id2: ID!
          v1: Int
          v2: Int
        }
      `,
    };

    const subgraph3 = {
      name: 'C',
      typeDefs: gql`
        type T @key(fields: "id1") {
          id1: ID!
          v3: Int
        }
      `,
    };

    const subgraph4 = {
      name: 'D',
      typeDefs: gql`
        type T @key(fields: "id2") {
          id2: ID!
          v3: Int @external
          v4: Int @requires(fields: "v3")
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
      subgraph4,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v1
            v2
            v3
            v4
          }
        }
      `,
    );

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
        `,
      };

      const subgraph2 = {
        name: 'Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            a: Int @external
            b: Int @requires(fields: "a")
          }
        `,
      };

      const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
      const operation = operationFromDocument(
        api,
        gql`
          query foo($test: Boolean!) {
            t @include(if: $test) {
              b
            }
          }
        `,
      );

      const plan = queryPlanner.buildQueryPlan(operation);
      expect(plan).toMatchInlineSnapshot(`
        QueryPlan {
          Include(if: $test) {
            Sequence {
              Fetch(service: "Subgraph1") {
                {
                  t {
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
                    ... on T {
                      b
                    }
                  }
                },
              },
            }
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
        `,
      };

      const subgraph2 = {
        name: 'Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID!
            a: Int @external
            b: Int @requires(fields: "a")
          }
        `,
      };

      const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
      const operation = operationFromDocument(
        api,
        gql`
          query foo($test: Boolean!) {
            t {
              b @include(if: $test)
            }
          }
        `,
      );

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
            Include(if: $test) {
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
                      b
                    }
                  }
                },
              }
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
        `,
      };

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
        `,
      };

      const subgraph3 = {
        name: 'Subgraph3',
        typeDefs: gql`
          type B @key(fields: "idB") {
            idB: ID!
            c: Int @requires(fields: "required")
            required: Int @external
          }
        `,
      };

      const [api, queryPlanner] = composeAndCreatePlanner(
        subgraph1,
        subgraph2,
        subgraph3,
      );
      const operation = operationFromDocument(
        api,
        gql`
          query foo($test1: Boolean!, $test2: Boolean!) {
            a @include(if: $test1) {
              b @include(if: $test2) {
                c
              }
            }
          }
        `,
      );

      const plan = queryPlanner.buildQueryPlan(operation);
      expect(plan).toMatchInlineSnapshot(`
        QueryPlan {
          Include(if: $test1) {
            Sequence {
              Fetch(service: "Subgraph1") {
                {
                  a {
                    __typename
                    idA
                  }
                }
              },
              Include(if: $test2) {
                Sequence {
                  Flatten(path: "a") {
                    Fetch(service: "Subgraph2") {
                      {
                        ... on A {
                          __typename
                          idA
                        }
                      } =>
                      {
                        ... on A {
                          b {
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
                        ... on B {
                          ... on B {
                            c
                          }
                        }
                      }
                    },
                  },
                }
              },
            }
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          onlyIn2: Int
        }

        type One @key(fields: "id") {
          id: ID!
          a: String @external
          b: String @requires(fields: "a")
          onlyIn2: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          one {
            b
          }
        }
      `,
    );

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

  it('require of multiple field, when one is also a key to reach another', () => {
    // The specificity of this example is that we `T.v` requires 2 fields `req1`
    // and `req2`, but `req1` is also a key to get `req2`. This dependency was
    // confusing a previous version of the code (which, when gathering the
    // "createdGroups" for `T.v` @requires, was using the group for `req1` twice
    // separatly (instead of recognizing it was the same group), and this was
    // confusing the rest of the code was wasn't expecting it.
    const subgraph1 = {
      name: 'A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id1") @key(fields: "req1") {
          id1: ID!
          req1: Int
        }
      `,
    };

    const subgraph2 = {
      name: 'B',
      typeDefs: gql`
        type T @key(fields: "id1") {
          id1: ID!
          req1: Int @external
          req2: Int @external
          v: Int @requires(fields: "req1 req2")
        }
      `,
    };

    const subgraph3 = {
      name: 'C',
      typeDefs: gql`
        type T @key(fields: "req1") {
          req1: Int
          req2: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "A") {
            {
              t {
                __typename
                id1
                req1
              }
            }
          },
          Flatten(path: "t") {
            Fetch(service: "C") {
              {
                ... on T {
                  __typename
                  req1
                }
              } =>
              {
                ... on T {
                  req2
                }
              }
            },
          },
          Flatten(path: "t") {
            Fetch(service: "B") {
              {
                ... on T {
                  __typename
                  req1
                  req2
                  id1
                }
              } =>
              {
                ... on T {
                  v
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
      `,
    };

    const subgraph2 = {
      name: 'non-graphql-name',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        query myOp {
          t {
            x
          }
        }
      `,
    );

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
    const fetch = ((plan.node as SequenceNode).nodes[1] as FlattenNode)
      .node as FetchNode;
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
      `,
    };

    const subgraph2 = {
      name: 'a-na&me-with-plen&ty-replace*ments',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        query myOp {
          t {
            x
          }
        }
      `,
    );

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
    const fetch = ((plan.node as SequenceNode).nodes[1] as FlattenNode)
      .node as FetchNode;
    expect(fetch.operation).toMatch(
      /^query myOp__a_name_with_plenty_replacements__1.*/i,
    );
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
      `,
    };

    const subgraph2 = {
      name: '42!',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        query myOp {
          t {
            x
          }
        }
      `,
    );

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
    const fetch = ((plan.node as SequenceNode).nodes[1] as FlattenNode)
      .node as FetchNode;

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
  const defaultMaxComputedPlans =
    enforceQueryPlannerConfigDefaults().debug.maxEvaluatedPlans!;
  const fieldCount = Math.ceil(Math.log2(defaultMaxComputedPlans)) + 1;
  const fields = [...Array(fieldCount).keys()].map((i) => `f${i}`);

  const typeDefs = gql`
    type Query {
      t: T @shareable
    }

    type T {
      ${fields.map((f) => `${f}: Int @shareable\n`)}
    }
  `;

  const [api, queryPlanner] = composeAndCreatePlanner(
    { name: 'S1', typeDefs },
    { name: 'S2', typeDefs },
  );
  const operation = operationFromDocument(
    api,
    gql`
    {
      t {
        ${fields.map((f) => `${f}\n`)}
      }
    }
  `,
  );

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
  const mainSelection = (fetchOp.definitions[0] as OperationDefinitionNode)
    .selectionSet;
  const subSelection = (mainSelection.selections[0] as FieldNode).selectionSet;
  const queriedFields =
    subSelection?.selections.map((s) => (s as FieldNode).name.value) ?? [];
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

    const supergraph = Supergraph.build(supergraphSdl);
    const api = supergraph.apiSchema();
    const queryPlanner = new QueryPlanner(supergraph);

    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Object @key(fields: "id") {
          id: ID!
          x: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
});

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
    `;

    const supergraph = Supergraph.build(supergraphSdl);
    const api = supergraph.apiSchema();
    const queryPlanner = new QueryPlanner(supergraph);

    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );
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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );
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
    `,
  };

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
    `,
  };

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type A @key(fields: "idA1") {
        idA1: ID!
      }
    `,
  };

  const subgraph4 = {
    name: 'Subgraph4',
    typeDefs: gql`
      type A @key(fields: "idA1") @key(fields: "idA2") {
        idA1: ID!
        idA2: ID!
      }
    `,
  };

  const subgraph5 = {
    name: 'Subgraph5',
    typeDefs: gql`
      type U @key(fields: "idU") {
        idU: ID!
        v: Int
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(
    subgraph1,
    subgraph2,
    subgraph3,
    subgraph4,
    subgraph5,
  );
  const operation = operationFromDocument(
    api,
    gql`
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
    `,
  );
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

    const supergraph = Supergraph.build(supergraphSdl);
    const api = supergraph.apiSchema();
    const queryPlanner = new QueryPlanner(supergraph);

    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            nodes {
              id
            }
          }
        }
      `,
    );

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
  it('works with nested fragments 1', () => {
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
          child2: Foo
        }

        type A1 implements Foo {
          foo: String
          child: Foo
          child2: Foo
        }

        type A2 implements Foo {
          foo: String
          child: Foo
          child2: Foo
        }

        type A3 implements Foo {
          foo: String
          child: Foo
          child2: Foo
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
        query {
          a {
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

        fragment FooSelect on Foo {
          __typename
          foo
          child {
            ...FooChildSelect
          }
          child2 {
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
      `,
    );

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
            child2 {
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
      `,
    };

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
      `,
    };

    // We use a fragment which does save some on the original query, but as each
    // field gets to a different subgraph, the fragment would only be used one
    // on each sub-fetch and we make sure the fragment is not used in that case.
    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
    operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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

  it.each([true, false])(
    'respects query planner option "reuseQueryFragments=%p"',
    (reuseQueryFragments: boolean) => {
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
        `,
      };

      const [api, queryPlanner] = composeAndCreatePlannerWithOptions(
        [subgraph1],
        { reuseQueryFragments },
      );
      const operation = operationFromDocument(
        api,
        gql`
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
        `,
      );

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
    `;

      expect(serializeQueryPlan(plan)).toMatchString(
        reuseQueryFragments ? withReuse : withoutReuse,
      );
    },
  );

  it('works with nested fragments when only the nested fragment gets preserved', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          a: V
          b: V
        }

        type V {
          v1: Int
          v2: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
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
          v1
          v2
        }
      `,
    );

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
            v1
            v2
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

        type T @key(fields: "id") {
          id: ID!
          a: Int
          b: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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

        type T @key(fields: "id") {
          id: ID!
          a: Int
          b: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I {
          a: Int
          b: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

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

  it('handles fragment rebasing in a subgraph where some subtyping relation differs', () => {
    // This test is designed such that type `Outer` implements the interface `I` in `Subgraph1`
    // but not in `Subgraph2`, yet `I` exists in `Subgraph2` (but only `Inner` implements it
    // there). Further, the operations we test have a fragment on I (`IFrag` below) that is
    // used "in the context of `Outer`" (at the top-level of fragment `OuterFrag`).
    //
    // What this all means is that `IFrag` can be rebased in `Subgraph2` "as is" because `I`
    // exists there with all its fields, but as we rebase `OuterFrag` on `Subgraph2`, we
    // cannot use `...IFrag` inside it (at the top-level), because `I` and `Outer` do
    // no intersect in `Subgraph2` and this would be an invalid selection.
    //
    // Previous versions of the code were not handling this case and were error out by
    // creating the invalid selection (#2721), and this test ensures this is fixed.
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type V @shareable {
          x: Int
        }

        interface I {
          v: V
        }

        type Outer implements I @key(fields: "id") {
          id: ID!
          v: V
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          outer1: Outer
          outer2: Outer
        }

        type V @shareable {
          x: Int
        }

        interface I {
          v: V
          w: Int
        }

        type Inner implements I {
          v: V
          w: Int
        }

        type Outer @key(fields: "id") {
          id: ID!
          inner: Inner
          w: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
        query {
          outer1 {
            ...OuterFrag
          }
          outer2 {
            ...OuterFrag
          }
        }

        fragment OuterFrag on Outer {
          ...IFrag
          inner {
            ...IFrag
          }
        }

        fragment IFrag on I {
          v {
            x
          }
        }
      `,
    );

    const expectedPlan = `
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph2") {
            {
              outer1 {
                __typename
                ...OuterFrag
                id
              }
              outer2 {
                __typename
                ...OuterFrag
                id
              }
            }
            
            fragment OuterFrag on Outer {
              inner {
                v {
                  x
                }
              }
            }
          },
          Parallel {
            Flatten(path: "outer1") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v {
                      x
                    }
                  }
                }
              },
            },
            Flatten(path: "outer2") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v {
                      x
                    }
                  }
                }
              },
            },
          },
        },
      }
    `;
    expect(
      serializeQueryPlan(queryPlanner.buildQueryPlan(operation)),
    ).toMatchString(expectedPlan);

    // We very slighly modify the operation to add an artificial indirection within `IFrag`.
    // This does not really change the query, and should result in the same plan, but
    // ensure the code handle correctly such indirection.
    operation = operationFromDocument(
      api,
      gql`
        query {
          outer1 {
            ...OuterFrag
          }
          outer2 {
            ...OuterFrag
          }
        }

        fragment OuterFrag on Outer {
          ...IFrag
          inner {
            ...IFrag
          }
        }

        fragment IFrag on I {
          ...IFragDelegate
        }

        fragment IFragDelegate on I {
          v {
            x
          }
        }
      `,
    );

    expect(
      serializeQueryPlan(queryPlanner.buildQueryPlan(operation)),
    ).toMatchString(expectedPlan);

    // The previous cases tests the cases where nothing in the `...IFrag` spread at the
    // top-level of `OuterFrag` applied at all: it all gets eliminated in the plan. But
    // in the schema of `Subgraph2`, while `Outer` does not implement `I` (and does not
    // have `v` in particular), it does contains field `w` that `I` also have, so we
    // add that field to `IFrag` and make sure we still correctly query that field.
    operation = operationFromDocument(
      api,
      gql`
        query {
          outer1 {
            ...OuterFrag
          }
          outer2 {
            ...OuterFrag
          }
        }

        fragment OuterFrag on Outer {
          ...IFrag
          inner {
            ...IFrag
          }
        }

        fragment IFrag on I {
          v {
            x
          }
          w
        }
      `,
    );

    expect(queryPlanner.buildQueryPlan(operation)).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph2") {
            {
              outer1 {
                __typename
                ...OuterFrag
                id
              }
              outer2 {
                __typename
                ...OuterFrag
                id
              }
            }
            
            fragment OuterFrag on Outer {
              w
              inner {
                v {
                  x
                }
                w
              }
            }
          },
          Parallel {
            Flatten(path: "outer1") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v {
                      x
                    }
                  }
                }
              },
            },
            Flatten(path: "outer2") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v {
                      x
                    }
                  }
                }
              },
            },
          },
        },
      }
    `);
  });

  it('handles fragment rebasing in a subgraph where some union membership relation differs', () => {
    // This test is similar to the subtyping case (it tests the same problems), but test the case
    // of unions instead of interfaces.
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type V @shareable {
          x: Int
        }

        union U = Outer

        type Outer @key(fields: "id") {
          id: ID!
          v: Int
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          outer1: Outer
          outer2: Outer
        }

        union U = Inner

        type Inner {
          v: Int
          w: Int
        }

        type Outer @key(fields: "id") {
          id: ID!
          inner: Inner
          w: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    let operation = operationFromDocument(
      api,
      gql`
        query {
          outer1 {
            ...OuterFrag
          }
          outer2 {
            ...OuterFrag
          }
        }

        fragment OuterFrag on Outer {
          ...UFrag
          inner {
            ...UFrag
          }
        }

        fragment UFrag on U {
          ... on Outer {
            v
          }
          ... on Inner {
            v
          }
        }
      `,
    );

    const expectedPlan = `
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph2") {
            {
              outer1 {
                __typename
                ...OuterFrag
                id
              }
              outer2 {
                __typename
                ...OuterFrag
                id
              }
            }
            
            fragment OuterFrag on Outer {
              inner {
                v
              }
            }
          },
          Parallel {
            Flatten(path: "outer1") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v
                  }
                }
              },
            },
            Flatten(path: "outer2") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v
                  }
                }
              },
            },
          },
        },
      }
    `;
    expect(
      serializeQueryPlan(queryPlanner.buildQueryPlan(operation)),
    ).toMatchString(expectedPlan);

    // We very slighly modify the operation to add an artificial indirection within `IFrag`.
    // This does not really change the query, and should result in the same plan, but
    // ensure the code handle correctly such indirection.
    operation = operationFromDocument(
      api,
      gql`
        query {
          outer1 {
            ...OuterFrag
          }
          outer2 {
            ...OuterFrag
          }
        }

        fragment OuterFrag on Outer {
          ...UFrag
          inner {
            ...UFrag
          }
        }

        fragment UFrag on U {
          ...UFragDelegate
        }

        fragment UFragDelegate on U {
          ... on Outer {
            v
          }
          ... on Inner {
            v
          }
        }
      `,
    );

    expect(
      serializeQueryPlan(queryPlanner.buildQueryPlan(operation)),
    ).toMatchString(expectedPlan);

    // The previous cases tests the cases where nothing in the `...IFrag` spread at the
    // top-level of `OuterFrag` applied at all: it all gets eliminated in the plan. But
    // in the schema of `Subgraph2`, while `Outer` does not implement `I` (and does not
    // have `v` in particular), it does contains field `w` that `I` also have, so we
    // add that field to `IFrag` and make sure we still correctly query that field.
    operation = operationFromDocument(
      api,
      gql`
        query {
          outer1 {
            ...OuterFrag
          }
          outer2 {
            ...OuterFrag
          }
        }

        fragment OuterFrag on Outer {
          ...UFrag
          inner {
            ...UFrag
          }
        }

        fragment UFrag on U {
          ... on Outer {
            v
            w
          }
          ... on Inner {
            v
          }
        }
      `,
    );

    expect(queryPlanner.buildQueryPlan(operation)).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph2") {
            {
              outer1 {
                __typename
                ...OuterFrag
                id
              }
              outer2 {
                __typename
                ...OuterFrag
                id
              }
            }
            
            fragment OuterFrag on Outer {
              w
              inner {
                v
              }
            }
          },
          Parallel {
            Flatten(path: "outer1") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v
                  }
                }
              },
            },
            Flatten(path: "outer2") {
              Fetch(service: "Subgraph1") {
                {
                  ... on Outer {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Outer {
                    v
                  }
                }
              },
            },
          },
        },
      }
    `);
  });

  it('validates fragments on non-object types across spreads', () => {
    const subgraph1 = {
      name: 'subgraph1',
      typeDefs: gql`
        type Query {
          theEntity: AnyEntity
        }

        union AnyEntity = EntityTypeA | EntityTypeB

        type EntityTypeA @key(fields: "unifiedEntityId") {
          unifiedEntityId: ID!
          unifiedEntity: UnifiedEntity
        }

        type EntityTypeB @key(fields: "unifiedEntityId") {
          unifiedEntityId: ID!
          unifiedEntity: UnifiedEntity
        }

        interface UnifiedEntity {
          id: ID!
        }

        type Generic implements UnifiedEntity @key(fields: "id") {
          id: ID!
        }

        type Movie implements UnifiedEntity @key(fields: "id") {
          id: ID!
        }

        type Show implements UnifiedEntity @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const subgraph2 = {
      name: 'subgraph2',
      typeDefs: gql`
        interface Video {
          videoId: Int!
          taglineMessage(uiContext: String): String
        }

        interface UnifiedEntity {
          id: ID!
        }

        type Generic implements UnifiedEntity @key(fields: "id") {
          id: ID!
          taglineMessage(uiContext: String): String
        }

        type Movie implements UnifiedEntity & Video @key(fields: "id") {
          videoId: Int!
          id: ID!
          taglineMessage(uiContext: String): String
        }

        type Show implements UnifiedEntity & Video @key(fields: "id") {
          videoId: Int!
          id: ID!
          taglineMessage(uiContext: String): String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlannerWithOptions(
      [subgraph1, subgraph2],
      { reuseQueryFragments: true },
    );

    const query = gql`
      query Search {
        theEntity {
          ... on EntityTypeA {
            unifiedEntity {
              ... on Generic {
                taglineMessage(uiContext: "Generic")
              }
            }
          }
          ... on EntityTypeB {
            unifiedEntity {
              ...VideoSummary
            }
          }
        }
      }

      fragment VideoSummary on Video {
        videoId # Note: This extra field selection is necessary, so this fragment is not ignored.
        taglineMessage(uiContext: "Video")
      }
    `;
    const operation = operationFromDocument(api, query, { validate: true });

    const plan = queryPlanner.buildQueryPlan(operation);
    const validationErrors = validateSubFetches(plan.node, subgraph2);
    expect(validationErrors).toHaveLength(0);
  });
});

/**
 * For each fetch in a PlanNode validate the generated operation is actually spec valid against its subgraph schema
 * @param plan
 * @param subgraphs
 */
function validateSubFetches(
  plan: PlanNode | SubscriptionNode | undefined,
  subgraphDef: ServiceDefinition,
): {
  errors: readonly GraphQLError[];
  serviceName: string;
  fetchNode: FetchNode;
}[] {
  if (!plan) {
    return [];
  }
  const fetches = findFetchNodes(subgraphDef.name, plan);
  const results: {
    errors: readonly GraphQLError[];
    serviceName: string;
    fetchNode: FetchNode;
  }[] = [];
  for (const fetch of fetches) {
    const subgraphName: string = fetch.serviceName;
    const operation: string = fetch.operation;
    const subgraph = buildSubgraph(
      subgraphName,
      'http://subgraph',
      subgraphDef.typeDefs,
    );
    const gql_errors = validate(
      subgraph.schema.toGraphQLJSSchema(),
      parse(operation),
    );
    if (gql_errors.length > 0) {
      results.push({
        errors: gql_errors,
        serviceName: subgraphName,
        fetchNode: fetch,
      });
    }
  }
  return results;
}

describe('Fragment autogeneration', () => {
  const subgraph = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
        t2: T
      }

      union T = A | B

      type A {
        x: Int
        y: Int
        t: T
      }

      type B {
        z: Int
      }
    `,
  };

  it('respects generateQueryFragments option', () => {
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions([subgraph], {
      generateQueryFragments: true,
    });
    const operation = operationFromDocument(
      api,
      gql`
        query {
          t {
            ... on A {
              x
              y
            }
            ... on B {
              z
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);

    // Note: `... on B {}` won't be replaced, since it has only one field.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              ..._generated_onA2_0
              ... on B {
                z
              }
            }
          }
          
          fragment _generated_onA2_0 on A {
            x
            y
          }
        },
      }
    `);
  });

  it('handles nested fragment generation', () => {
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions([subgraph], {
      generateQueryFragments: true,
    });
    const operation = operationFromDocument(
      api,
      gql`
        query {
          t {
            ... on A {
              x
              y
              t {
                ... on A {
                  x
                  y
                }
                ... on B {
                  z
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);

    // Note: `... on B {}` won't be replaced, since it has only one field.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              ..._generated_onA3_0
            }
          }
          
          fragment _generated_onA2_0 on A {
            x
            y
          }
          
          fragment _generated_onA3_0 on A {
            x
            y
            t {
              __typename
              ..._generated_onA2_0
              ... on B {
                z
              }
            }
          }
        },
      }
    `);
  });

  it('handles fragments with one non-leaf field', () => {
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions([subgraph], {
      generateQueryFragments: true,
    });
    const operation = operationFromDocument(
      api,
      gql`
        query {
          t {
            ... on A {
              t {
                ... on B {
                  z
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);

    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              ..._generated_onA1_0
            }
          }
          
          fragment _generated_onA1_0 on A {
            t {
              __typename
              ... on B {
                z
              }
            }
          }
        },
      }
    `);
  });

  it("identifies and reuses equivalent fragments that aren't identical", () => {
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions([subgraph], {
      generateQueryFragments: true,
    });
    const operation = operationFromDocument(
      api,
      gql`
        query {
          t {
            ... on A {
              x
              y
            }
          }
          t2 {
            ... on A {
              y
              x
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);

    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              ..._generated_onA2_0
            }
            t2 {
              __typename
              ..._generated_onA2_0
            }
          }
          
          fragment _generated_onA2_0 on A {
            x
            y
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
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id1") @key(fields: "id2") {
        id1: ID!
        id2: ID!
      }
    `,
  };

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T @key(fields: "id2") {
        id2: ID!
        x: Int
        y: Int
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(
    subgraph1,
    subgraph2,
    subgraph3,
  );
  // Note: querying `id2` is only purpose, because there is 2 choice to get `id2` (either
  // from then 2nd or 3rd subgraph), and that create some choice in the query planning algorithm,
  // so excercices additional paths.
  const operation = operationFromDocument(
    api,
    gql`
      {
        t {
          id2
          x
          y
        }
      }
    `,
  );

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    let operation = operationFromDocument(
      api,
      gql`
        query {
          t {
            foo: __typename
            x
          }
        }
      `,
    );

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

    operation = operationFromDocument(
      api,
      gql`
        query {
          t {
            foo: __typename
            x
            __typename
          }
        }
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type S @key(fields: "id") {
          id: ID
          t: T @shareable
        }

        type T {
          x: Int
        }
      `,
    };

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type S @key(fields: "id") {
          id: ID
          t: T @shareable
        }

        type T {
          id: ID!
          y: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );
    // This tests the patch from https://github.com/apollographql/federation/pull/2137.
    // Namely, the schema is such that `x` can only be fetched from one subgraph, but
    // technically __typename can be fetched from 2 subgraphs. However, the optimization
    // we test for is that we actually don't consider both choices for __typename and
    // instead only evaluate a single query plan (the assertion on `evaluatePlanCount`)
    let operation = operationFromDocument(
      api,
      gql`
        query {
          s {
            t {
              __typename
              x
            }
          }
        }
      `,
    );

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(
      1,
    );
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
    operation = operationFromDocument(
      api,
      gql`
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
      `,
    );

    plan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(
      1,
    );
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
                  __typename
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Mutation {
          m2: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        mutation {
          m2
          m1
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          i {
            s {
              y
            }
          }
        }
      `,
    );

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
      `,
    };

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
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          i {
            s {
              y
            }
          }
        }
      `,
    );

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
    expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(
      1,
    );
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I {
          v: Int
        }

        type A implements I {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          u {
            ... on I {
              v
            }
          }
        }
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U = A

        type A {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          u {
            ... on I {
              v
            }
          }
        }
      `,
    );

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
                __typename
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U = A

        type A {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          i {
            ... on U {
              ... on A {
                v
              }
            }
          }
        }
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I {
          v: Int
        }

        type A implements I {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          i {
            ... on U {
              ... on A {
                v
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    // Here, `A` is a `I` in the supergraph while not in `Subgraph1`, and since the `i` operation is resolved by
    // `Subgraph1`, it cannot ever return a A. And so we can skip the whole `... on U` sub-selection.
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I2 {
          v: Int
        }

        type A implements I2 {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          i1 {
            ... on I2 {
              v
            }
          }
        }
      `,
    );

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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        interface I1 {
          v: Int
        }

        type A implements I1 {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          i1 {
            ... on I2 {
              v
            }
          }
        }
      `,
    );

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
                __typename
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U2 = A

        type A {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          u1 {
            ... on U2 {
              ... on A {
                v
              }
            }
          }
        }
      `,
    );

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

  test('union/union interaction, but no need to type-explode', () => {
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
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        union U1 = A

        type A {
          v: Int @shareable
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          u1 {
            ... on U2 {
              ... on A {
                v
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    // Similar case than in the `interface/union` case: the whole `... on U2` sub-selection happens to be
    // unsatisfiable in practice.
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

test('handles spread unions correctly', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        u: U
      }

      union U = A | B

      type A @key(fields: "id") {
        id: ID!
        a1: Int
      }

      type B {
        id: ID!
        b: Int
      }

      type C @key(fields: "id") {
        id: ID!
        c1: Int
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Query {
        otherQuery: U
      }

      union U = A | C

      type A @key(fields: "id") {
        id: ID!
        a2: Int
      }

      type C @key(fields: "id") {
        id: ID!
        c2: Int
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
  const operation = operationFromDocument(
    api,
    gql`
      {
        u {
          ... on C {
            c1
          }
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  // Note: it's important that the query below DO NOT include the `... on C` part. Because in
  // Subgraph 1, `C` is not a part of the union `U` and so a spread for `C` inside `u` is invalid
  // GraphQL.
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Fetch(service: "Subgraph1") {
        {
          u {
            __typename
          }
        }
      },
    }
  `);
});

test('handles case of key chains in parallel requires', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
      }

      union T = T1 | T2

      type T1 @key(fields: "id1") {
        id1: ID!
      }

      type T2 @key(fields: "id") {
        id: ID!
        y: Int
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T1 @key(fields: "id1") @key(fields: "id2") {
        id1: ID!
        id2: ID!
      }
    `,
  };

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T1 @key(fields: "id2") {
        id2: ID!
        x: Int
      }

      type T2 @key(fields: "id") {
        id: ID!
        y: Int @external
        z: Int @requires(fields: "y")
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(
    subgraph1,
    subgraph2,
    subgraph3,
  );
  const operation = operationFromDocument(
    api,
    gql`
      {
        t {
          ... on T1 {
            x
          }
          ... on T2 {
            z
          }
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              ... on T1 {
                __typename
                id1
              }
              ... on T2 {
                __typename
                id
                y
              }
            }
          }
        },
        Parallel {
          Sequence {
            Flatten(path: "t") {
              Fetch(service: "Subgraph2") {
                {
                  ... on T1 {
                    __typename
                    id1
                  }
                } =>
                {
                  ... on T1 {
                    id2
                  }
                }
              },
            },
            Flatten(path: "t") {
              Fetch(service: "Subgraph3") {
                {
                  ... on T1 {
                    __typename
                    id2
                  }
                } =>
                {
                  ... on T1 {
                    x
                  }
                }
              },
            },
          },
          Flatten(path: "t") {
            Fetch(service: "Subgraph3") {
              {
                ... on T2 {
                  __typename
                  id
                  y
                }
              } =>
              {
                ... on T2 {
                  z
                }
              }
            },
          },
        },
      },
    }
  `);
});

test('handles types with no common supertype at the same "mergeAt"', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
      }

      union T = T1 | T2

      type T1 @key(fields: "id") {
        id: ID!
        sub: Foo
      }

      type Foo @key(fields: "id") {
        id: ID!
        x: Int
      }

      type T2 @key(fields: "id") {
        id: ID!
        sub: Bar
      }

      type Bar @key(fields: "id") {
        id: ID!
        x: Int
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Foo @key(fields: "id") {
        id: ID!
        y: Int
      }

      type Bar @key(fields: "id") {
        id: ID!
        y: Int
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
  const operation = operationFromDocument(
    api,
    gql`
      {
        t {
          ... on T1 {
            sub {
              y
            }
          }
          ... on T2 {
            sub {
              y
            }
          }
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              ... on T1 {
                sub {
                  __typename
                  id
                }
              }
              ... on T2 {
                sub {
                  __typename
                  id
                }
              }
            }
          }
        },
        Flatten(path: "t.sub") {
          Fetch(service: "Subgraph2") {
            {
              ... on Foo {
                __typename
                id
              }
              ... on Bar {
                __typename
                id
              }
            } =>
            {
              ... on Foo {
                y
              }
              ... on Bar {
                y
              }
            }
          },
        },
      },
    }
  `);
});

test('does not error out handling fragments when interface subtyping is involved', () => {
  // This test essentially make sure the issue in https://github.com/apollographql/federation/issues/2592
  // is resolved.
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        a: A!
      }

      interface IA {
        b: IB!
      }

      type A implements IA {
        b: B!
      }

      interface IB {
        v1: Int!
      }

      type B implements IB {
        v1: Int!
        v2: Int!
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
  const operation = operationFromDocument(
    api,
    gql`
      {
        a {
          ...F1
          ...F2
          ...F3
        }
      }

      fragment F1 on A {
        b {
          v2
        }
      }

      fragment F2 on IA {
        b {
          v1
        }
      }

      fragment F3 on IA {
        b {
          __typename
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Fetch(service: "Subgraph1") {
        {
          a {
            b {
              __typename
              v2
              v1
            }
          }
        }
      },
    }
  `);
});

describe('named fragments', () => {
  test('handles mix of fragments indirection and unions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          parent: Parent
        }

        union CatOrPerson = Cat | Parent | Child

        type Parent {
          childs: [Child]
        }

        type Child {
          id: ID!
        }

        type Cat {
          name: String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
        query {
          parent {
            ...F_indirection1_parent
          }
        }

        fragment F_indirection1_parent on Parent {
          ...F_indirection2_catOrPerson
        }

        fragment F_indirection2_catOrPerson on CatOrPerson {
          ...F_catOrPerson
        }

        fragment F_catOrPerson on CatOrPerson {
          __typename
          ... on Cat {
            name
          }
          ... on Parent {
            childs {
              __typename
              id
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            parent {
              __typename
              childs {
                __typename
                id
              }
            }
          }
        },
      }
    `);
  });

  test('another mix of fragments indirection and unions', () => {
    // This tests that the issue reported on https://github.com/apollographql/router/issues/3172 is resolved.

    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          owner: Owner!
        }

        interface OItf {
          id: ID!
          v0: String!
        }

        type Owner implements OItf {
          id: ID!
          v0: String!
          u: [U]
        }

        union U = T1 | T2

        interface I {
          id1: ID!
          id2: ID!
        }

        type T1 implements I {
          id1: ID!
          id2: ID!
          owner: Owner!
        }

        type T2 implements I {
          id1: ID!
          id2: ID!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    let operation = operationFromDocument(
      api,
      gql`
        {
          owner {
            u {
              ... on I {
                id1
                id2
              }
              ...Fragment1
              ...Fragment2
            }
          }
        }

        fragment Fragment1 on T1 {
          owner {
            ... on Owner {
              ...Fragment3
            }
          }
        }

        fragment Fragment2 on T2 {
          ...Fragment4
          id1
        }

        fragment Fragment3 on OItf {
          v0
        }

        fragment Fragment4 on I {
          id1
          id2
          __typename
        }
      `,
    );

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            owner {
              u {
                __typename
                ...Fragment4
                ... on T1 {
                  owner {
                    v0
                  }
                }
                ... on T2 {
                  ...Fragment4
                }
              }
            }
          }
          
          fragment Fragment4 on I {
            __typename
            id1
            id2
          }
        },
      }
    `);

    operation = operationFromDocument(
      api,
      gql`
        {
          owner {
            u {
              ... on I {
                id1
                id2
              }
              ...Fragment1
              ...Fragment2
            }
          }
        }

        fragment Fragment1 on T1 {
          owner {
            ... on Owner {
              ...Fragment3
            }
          }
        }

        fragment Fragment2 on T2 {
          ...Fragment4
          id1
        }

        fragment Fragment3 on OItf {
          v0
        }

        fragment Fragment4 on I {
          id1
          id2
        }
      `,
    );

    plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            owner {
              u {
                __typename
                ... on I {
                  __typename
                  ...Fragment4
                }
                ... on T1 {
                  owner {
                    v0
                  }
                }
                ... on T2 {
                  ...Fragment4
                }
              }
            }
          }
          
          fragment Fragment4 on I {
            id1
            id2
          }
        },
      }
    `);
  });

  test('handles fragments with interface field subtyping', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t1: T1!
        }

        interface I {
          id: ID!
          other: I!
        }

        type T1 implements I {
          id: ID!
          other: T1!
        }

        type T2 implements I {
          id: ID!
          other: T2!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1);
    const operation = operationFromDocument(
      api,
      gql`
        {
          t1 {
            ...Fragment1
          }
        }

        fragment Fragment1 on I {
          other {
            ... on T1 {
              id
            }
            ... on T2 {
              id
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t1 {
              other {
                __typename
                id
              }
            }
          }
        },
      }
    `);
  });

  test('can reuse fragments in subgraph where they only partially apply in root fetch', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t1: T
          t2: T
        }

        type T @key(fields: "id") {
          id: ID!
          v0: Int
          v1: Int
          v2: Int
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v3: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          t1 {
            ...allTFields
          }
          t2 {
            ...allTFields
          }
        }

        fragment allTFields on T {
          v0
          v1
          v2
          v3
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "Subgraph1") {
            {
              t1 {
                __typename
                ...allTFields
                id
              }
              t2 {
                __typename
                ...allTFields
                id
              }
            }
            
            fragment allTFields on T {
              v0
              v1
              v2
            }
          },
          Parallel {
            Flatten(path: "t1") {
              Fetch(service: "Subgraph2") {
                {
                  ... on T {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T {
                    v3
                  }
                }
              },
            },
            Flatten(path: "t2") {
              Fetch(service: "Subgraph2") {
                {
                  ... on T {
                    __typename
                    id
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
        },
      }
    `);
  });

  test('can reuse fragments in subgraph where they only partially apply in entity fetch', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          u1: U
          u2: U
        }

        type U @key(fields: "id") {
          id: ID!
          v0: Int
          v1: Int
        }
      `,
    };

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type U @key(fields: "id") {
          id: ID!
          v2: Int
          v3: Int
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            u1 {
              ...allUFields
            }
            u2 {
              ...allUFields
            }
          }
        }

        fragment allUFields on U {
          v0
          v1
          v2
          v3
        }
      `,
    );

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
                  u1 {
                    __typename
                    ...allUFields
                    id
                  }
                  u2 {
                    __typename
                    ...allUFields
                    id
                  }
                }
              }
              
              fragment allUFields on U {
                v0
                v1
              }
            },
          },
          Parallel {
            Flatten(path: "t.u1") {
              Fetch(service: "Subgraph3") {
                {
                  ... on U {
                    __typename
                    id
                  }
                } =>
                {
                  ... on U {
                    v2
                    v3
                  }
                }
              },
            },
            Flatten(path: "t.u2") {
              Fetch(service: "Subgraph3") {
                {
                  ... on U {
                    __typename
                    id
                  }
                } =>
                {
                  ... on U {
                    v2
                    v3
                  }
                }
              },
            },
          },
        },
      }
    `);
  });
});

describe('`debug.maxEvaluatedPlans` configuration', () => {
  // Simple schema, created to force the query planner to have multiple choice. We'll build
  // a supergraph with the 2 _same_ subgraph having this exact same schema. In practice,
  // for every field `v_i`, the planner will consider the option of fetching it from either
  // the 1st or 2nd subgraph (not that in theory, there is more choices than this; we could
  // get `t.id` from the 1st subgraph and then jump to then 2nd subgraph, but some heuristics
  // in the the query planner recognize this is not useful. Also note that we currently
  // need both the `@key` on `T` and to have `Query.t` shareable for the query to consider
  // those choices).
  const typeDefs = gql`
    type Query {
      t: T @shareable
    }

    type T @key(fields: "id") @shareable {
      id: ID!
      v1: Int
      v2: Int
      v3: Int
      v4: Int
    }
  `;

  const subgraphs = [
    {
      name: 'Subgraph1',
      typeDefs,
    },
    {
      name: 'Subgraph2',
      typeDefs,
    },
  ];

  test('works when unset', () => {
    // This test is mostly a sanity check to make sure that "by default", we do have 16 plans
    // (all combination of the 2 choices for 4 fields). It's not entirely impossible that
    // some future smarter heuristic is added to the planner so that it recognize it could
    // but the choices earlier, and if that's the case, this test will fail (showing that less
    // plans are considered) and we'll have to adapt the example (find a better way to force
    // choices).

    const config = { debug: { maxEvaluatedPlans: undefined } };
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions(
      subgraphs,
      config,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v1
            v2
            v3
            v4
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              v1
              v2
              v3
              v4
            }
          }
        },
      }
    `);

    const stats = queryPlanner.lastGeneratedPlanStatistics();
    expect(stats?.evaluatedPlanCount).toBe(16);
  });

  test('allows setting down to 1', () => {
    const config = { debug: { maxEvaluatedPlans: 1 } };
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions(
      subgraphs,
      config,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v1
            v2
            v3
            v4
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    // Note that in theory, the planner would be excused if it wasn't generated this
    // (optimal in this case) plan. But we kind of want it in this simple example so
    // we still assert this is the plan we get.
    // Note2: `v1` ends up reordered in this case due to reordering of branches that
    // happens as a by-product of cutting out choice. This is completely harmless and
    // the plan is still find and optimal, but if we someday find the time to update
    // the code to keep the order more consistent (say, if we ever rewrite said code :)),
    // then this wouldn't be the worst thing either.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              v2
              v3
              v4
              v1
            }
          }
        },
      }
    `);

    const stats = queryPlanner.lastGeneratedPlanStatistics();
    expect(stats?.evaluatedPlanCount).toBe(1);
  });

  test('can be set to an arbitrary number', () => {
    const config = { debug: { maxEvaluatedPlans: 10 } };
    const [api, queryPlanner] = composeAndCreatePlannerWithOptions(
      subgraphs,
      config,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          t {
            v1
            v2
            v3
            v4
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "Subgraph1") {
          {
            t {
              v1
              v4
              v2
              v3
            }
          }
        },
      }
    `);

    const stats = queryPlanner.lastGeneratedPlanStatistics();
    // Note that in this particular example, since we have binary choices only and due to the way
    // we cut branches when we're above the max, the number of evaluated plans can only be a power
    // of 2. Here, we just want it to be the nearest power of 2 below our limit.
    expect(stats?.evaluatedPlanCount).toBe(8);
  });

  test('cannot be set to 0 or a negative number', () => {
    let config = { debug: { maxEvaluatedPlans: 0 } };
    expect(() => composeAndCreatePlannerWithOptions(subgraphs, config)).toThrow(
      'Invalid value for query planning configuration "debug.maxEvaluatedPlans"; expected a number >= 1 but got 0',
    );

    config = { debug: { maxEvaluatedPlans: -1 } };
    expect(() => composeAndCreatePlannerWithOptions(subgraphs, config)).toThrow(
      'Invalid value for query planning configuration "debug.maxEvaluatedPlans"; expected a number >= 1 but got -1',
    );
  });
});

test('correctly generate plan built from some non-individually optimal branch options', () => {
  // The idea of this test is that the query has 2 leaf fields, `t.x` and `t.y`, whose
  // options are:
  //  1. `t.x`:
  //     a. S1(get t.x)
  //     b. S2(get t.id) -> S3(get t.x using key id)
  //  2. `t.y`:
  //     a. S2(get t.id) -> S3(get t.y using key id)
  //
  // And the idea is that "individually", for just `t.x`, getting it all in `S1` using option a.,
  // but for the whole plan, using option b. is actually better since it avoid querying `S1`
  // entirely (and `S2`/`S2` have to be queried anyway).
  //
  // Anyway, this test make sure we do correctly generate the plan using 1.b and 2.a, and do
  // not ignore 1.b in favor of 1.a in particular (which a bug did at one point).
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T @shareable
      }

      type T {
        x: Int @shareable
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Query {
        t: T @shareable
      }

      type T @key(fields: "id") {
        id: ID!
      }
    `,
  };

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
        x: Int @shareable
        y: Int
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(
    subgraph1,
    subgraph2,
    subgraph3,
  );
  const operation = operationFromDocument(
    api,
    gql`
      {
        t {
          x
          y
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
       QueryPlan {
         Sequence {
           Fetch(service: "Subgraph2") {
             {
               t {
                 __typename
                 id
               }
             }
           },
           Flatten(path: "t") {
             Fetch(service: "Subgraph3") {
               {
                 ... on T {
                   __typename
                   id
                 }
               } =>
               {
                 ... on T {
                   y
                   x
                 }
               }
             },
           },
         },
       }
    `);
});

test('does not error on some complex fetch group dependencies', () => {
  // This test is a reproduction of a bug whereby planning on this example was raising an
  // assertion error due to an incorrect handling of fetch group dependencies.

  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        me: User @shareable
      }

      type User {
        id: ID! @shareable
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Query {
        me: User @shareable
      }

      type User @key(fields: "id") {
        id: ID!
        p: Props
      }

      type Props {
        id: ID! @shareable
      }
    `,
  };

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type Query {
        me: User @shareable
      }

      type User {
        id: ID! @shareable
      }

      type Props @key(fields: "id") {
        id: ID!
        v0: Int
        t: T
      }

      type T {
        id: ID!
        v1: V
        v2: V

        # Note: this field is not queried, but matters to the reproduction this test exists
        # for because it prevents some optimizations that would happen without it (namely,
        # without it, the planner would notice that everything after type T is guaranteed
        # to be local to the subgraph).
        user: User
      }

      type V {
        x: Int
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(
    subgraph1,
    subgraph2,
    subgraph3,
  );
  const operation = operationFromDocument(
    api,
    gql`
      {
        me {
          p {
            v0
            t {
              v1 {
                x
              }
              v2 {
                x
              }
            }
          }
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph2") {
          {
            me {
              p {
                __typename
                id
              }
            }
          }
        },
        Flatten(path: "me.p") {
          Fetch(service: "Subgraph3") {
            {
              ... on Props {
                __typename
                id
              }
            } =>
            {
              ... on Props {
                v0
                t {
                  v1 {
                    x
                  }
                  v2 {
                    x
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

test('does not evaluate plans relying on a key field to fetch that same field', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
      }

      type T @key(fields: "otherId") {
        otherId: ID!
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id") @key(fields: "otherId") {
        id: ID!
        otherId: ID!
      }
    `,
  };

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(
    subgraph1,
    subgraph2,
    subgraph3,
  );
  const operation = operationFromDocument(
    api,
    gql`
      {
        t {
          id
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "Subgraph1") {
          {
            t {
              __typename
              otherId
            }
          }
        },
        Flatten(path: "t") {
          Fetch(service: "Subgraph2") {
            {
              ... on T {
                __typename
                otherId
              }
            } =>
            {
              ... on T {
                id
              }
            }
          },
        },
      },
    }
  `);

  // This is the main thing this test exists for: making sure we only evaluate a
  // single plan for this example. And while it may be hard to see what other
  // plans than the one above could be evaluated, some older version of the planner
  // where considering a plan consisting of, from `Subgraph1`, fetching key `id`
  // in `Subgraph2` using key `otherId`, and then using that `id` key to fetch
  // ... field `id` in `Subgraph3`, not realizing that the `id` is what we ultimately
  // want and so there is no point in considering path that use it as key. Anyway
  // this test ensure this is not considered anymore (considering that later plan
  // was not incorrect, but it was adding to the options to evaluate which in some
  // cases could impact query planning performance quite a bit).
  expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(
    1,
  );
});

test('avoid considering indirect paths from the root when a more direct one exists', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T @shareable
      }

      type T @key(fields: "id") {
        id: ID!
        v0: Int @shareable
      }
    `,
  };

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Query {
        t: T @shareable
      }

      type T @key(fields: "id") {
        id: ID!
        v0: Int @shareable
        v1: Int
      }
    `,
  };

  // Each of id/v0 can have 2 options each, so that's 4 combinations. If we were to consider 2 options for each
  // v1 value however, that would multiple it by 2 each times, so it would 32 possibilities. We limit the number of
  // evaluated plans just above our expected number of 4 so that if we exceed it, the generated plan will be sub-optimal.
  const [api, queryPlanner] = composeAndCreatePlannerWithOptions(
    [subgraph1, subgraph2],
    { debug: { maxEvaluatedPlans: 6 } },
  );
  const operation = operationFromDocument(
    api,
    gql`
      {
        t {
          id
          v0
          a0: v1
          a1: v1
          a2: v1
        }
      }
    `,
  );

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Fetch(service: "Subgraph2") {
        {
          t {
            a0: v1
            a1: v1
            a2: v1
            id
            v0
          }
        }
      },
    }
  `);

  // As said above, we legit have 2 options for `id` and `v0`, and we cannot know which are best before we evaluate the
  // plans completely. But for the multiple `v1`, we should recognize that going through the 1st subgraph (and taking a
  // key) is never exactly a good idea.
  expect(queryPlanner.lastGeneratedPlanStatistics()?.evaluatedPlanCount).toBe(
    4,
  );
});

describe('@requires references external field indirectly', () => {
  it('key where @external is not at top level of selection of requires', () => {
    // Field issue where we were seeing a FetchGroup created where the fields used by the key to jump subgraphs
    // were not properly fetched. In the below test, this test will ensure that 'k2' is properly collected
    // before it is used
    const subgraph1 = {
      name: 'A',
      typeDefs: gql`
        type Query {
          u: U!
        }

        type U @key(fields: "k1 { id }") {
          k1: K
        }

        type K @key(fields: "id") {
          id: ID!
        }
      `,
    };
    const subgraph2 = {
      name: 'B',
      typeDefs: gql`
        type U @key(fields: "k1 { id }") @key(fields: "k2") {
          k1: K!
          k2: ID!
          v: V! @external
          f: ID! @requires(fields: "v { v }")
          f2: Int!
        }

        type K @key(fields: "id") {
          id: ID!
        }

        type V @key(fields: "id") {
          id: ID!
          v: String! @external
        }
      `,
    };
    const subgraph3 = {
      name: 'C',
      typeDefs: gql`
        type U @key(fields: "k1 { id }") @key(fields: "k2") {
          k1: K!
          k2: ID!
          v: V!
        }

        type K @key(fields: "id") {
          id: ID!
        }

        type V @key(fields: "id") {
          id: ID!
          v: String!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );
    const operation = operationFromDocument(
      api,
      gql`
        {
          u {
            f
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "A") {
            {
              u {
                __typename
                k1 {
                  id
                }
              }
            }
          },
          Flatten(path: "u") {
            Fetch(service: "B") {
              {
                ... on U {
                  __typename
                  k1 {
                    id
                  }
                }
              } =>
              {
                ... on U {
                  k2
                }
              }
            },
          },
          Flatten(path: "u") {
            Fetch(service: "C") {
              {
                ... on U {
                  __typename
                  k2
                }
              } =>
              {
                ... on U {
                  v {
                    v
                  }
                }
              }
            },
          },
          Flatten(path: "u") {
            Fetch(service: "B") {
              {
                ... on U {
                  __typename
                  v {
                    v
                  }
                  k1 {
                    id
                  }
                }
              } =>
              {
                ... on U {
                  f
                }
              }
            },
          },
        },
      }
    `);
  });
});

describe('handles fragments with directive conditions', () => {
  test('fragment with intersecting parent type and directive condition', () => {
    const subgraphA = {
      typeDefs: gql`
        directive @test on FRAGMENT_SPREAD
        type Query {
          i: I
        }
        interface I {
          _id: ID
        }
        type T1 implements I @key(fields: "id") {
          _id: ID
          id: ID
        }
        type T2 implements I @key(fields: "id") {
          _id: ID
          id: ID
        }
      `,
      name: 'A',
    };

    const subgraphB = {
      typeDefs: gql`
        directive @test on FRAGMENT_SPREAD
        type Query {
          i2s: [I2]
        }
        interface I2 {
          id: ID
          title: String
        }
        type T1 implements I2 @key(fields: "id") {
          id: ID
          title: String
        }
        type T2 implements I2 @key(fields: "id") {
          id: ID
          title: String
        }
      `,
      name: 'B',
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraphA, subgraphB);

    const operation = operationFromDocument(
      api,
      gql`
        query {
          i {
            _id
            ... on I2 @test {
              id
            }
          }
        }
      `,
    );

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "A") {
          {
            i {
              __typename
              _id
              ... on T1 @test {
                id
              }
              ... on T2 @test {
                id
              }
            }
          }
        },
      }
    `);
  });

  test('nested fragment with interseting parent type and directive condition', () => {
    const subgraphA = {
      typeDefs: gql`
        directive @test on FRAGMENT_SPREAD
        type Query {
          i: I
        }
        interface I {
          _id: ID
        }
        type T1 implements I @key(fields: "id") {
          _id: ID
          id: ID
        }
        type T2 implements I @key(fields: "id") {
          _id: ID
          id: ID
        }
      `,
      name: 'A',
    };

    const subgraphB = {
      typeDefs: gql`
        directive @test on FRAGMENT_SPREAD
        type Query {
          i2s: [I2]
        }
        interface I2 {
          id: ID
          title: String
        }
        type T1 implements I2 @key(fields: "id") {
          id: ID
          title: String
        }
        type T2 implements I2 @key(fields: "id") {
          id: ID
          title: String
        }
      `,
      name: 'B',
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraphA, subgraphB);

    const operation = operationFromDocument(
      api,
      gql`
        query {
          i {
            _id
            ... on I2 {
              ... on I2 @test {
                id
              }
            }
          }
        }
      `,
    );

    expect(operation.expandAllFragments().toString()).toMatchInlineSnapshot(`
      "{
        i {
          _id
          ... on I2 {
            ... on I2 @test {
              id
            }
          }
        }
      }"
    `);
    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "A") {
          {
            i {
              __typename
              _id
              ... on T1 {
                ... @test {
                  id
                }
              }
              ... on T2 {
                ... @test {
                  id
                }
              }
            }
          }
        },
      }
    `);
  });
});

describe('handles operations with directives', () => {
  const subgraphA = {
    name: 'subgraphA',
    typeDefs: gql`
      directive @operation on MUTATION | QUERY | SUBSCRIPTION
      directive @field on FIELD

      type Foo @key(fields: "id") {
        id: ID!
        bar: String
        t: T!
      }

      type T @key(fields: "id") {
        id: ID!
      }

      type Query {
        foo: Foo
      }

      type Mutation {
        updateFoo(bar: String): Foo
      }
    `,
  };

  const subgraphB = {
    name: 'subgraphB',
    typeDefs: gql`
      directive @operation on MUTATION | QUERY | SUBSCRIPTION
      directive @field on FIELD

      type Foo @key(fields: "id") {
        id: ID!
        baz: Int
      }

      type T @key(fields: "id") {
        id: ID!
        f1: String
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraphA, subgraphB);

  test('if directives at the operation level are passed down to subgraph queries', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Operation @operation {
          foo @field {
            bar @field
            baz @field
            t @field {
              f1 @field
            }
          }
        }
      `,
    );

    const queryPlan = queryPlanner.buildQueryPlan(operation);

    const A_fetch_nodes = findFetchNodes(subgraphA.name, queryPlan.node);
    expect(A_fetch_nodes).toHaveLength(1);
    // Note: The query is expected to carry the `@operation` directive.
    expect(parse(A_fetch_nodes[0].operation)).toMatchInlineSnapshot(`
      query Operation__subgraphA__0 @operation {
        foo @field {
          __typename
          id
          bar @field
          t @field {
            __typename
            id
          }
        }
      }
    `);

    const B_fetch_nodes = findFetchNodes(subgraphB.name, queryPlan.node);
    expect(B_fetch_nodes).toHaveLength(2);
    // Note: The query is expected to carry the `@operation` directive.
    expect(parse(B_fetch_nodes[0].operation)).toMatchInlineSnapshot(`
      query Operation__subgraphB__1($representations: [_Any!]!) @operation {
        _entities(representations: $representations) {
          ... on Foo {
            baz @field
          }
        }
      }
    `);
    // Note: The query is expected to carry the `@operation` directive.
    expect(parse(B_fetch_nodes[1].operation)).toMatchInlineSnapshot(`
      query Operation__subgraphB__2($representations: [_Any!]!) @operation {
        _entities(representations: $representations) {
          ... on T {
            f1 @field
          }
        }
      }
    `);
  }); // end of `test`

  test('if directives on mutations are passed down to subgraph queries', () => {
    const operation = operationFromDocument(
      api,
      gql`
        mutation TestMutation @operation {
          updateFoo(bar: "something") @field {
            id @field
            bar @field
          }
        }
      `,
    );

    const queryPlan = queryPlanner.buildQueryPlan(operation);

    const A_fetch_nodes = findFetchNodes(subgraphA.name, queryPlan.node);
    expect(A_fetch_nodes).toHaveLength(1);
    // Note: The query is expected to carry the `@operation` directive.
    expect(parse(A_fetch_nodes[0].operation)).toMatchInlineSnapshot(`
      mutation TestMutation__subgraphA__0 @operation {
        updateFoo(bar: "something") @field {
          id @field
          bar @field
        }
      }
    `);
  }); // end of `test`

  test('if directives with arguments applied on queries are ok', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        directive @noArgs on QUERY
        directive @withArgs(arg1: String) on QUERY

        type Query {
          test: String!
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        directive @noArgs on QUERY
        directive @withArgs(arg1: String) on QUERY
      `,
    };

    const query = gql`
      query @noArgs @withArgs(arg1: "hi") {
        test
      }
    `;

    const [api, qp] = composeAndCreatePlanner(subgraph1, subgraph2);
    const op = operationFromDocument(api, query);
    const queryPlan = qp.buildQueryPlan(op);
    const fetch_nodes = findFetchNodes(subgraph1.name, queryPlan.node);
    expect(fetch_nodes).toHaveLength(1);
    // Note: The query is expected to carry the `@noArgs` and `@withArgs` directive.
    expect(parse(fetch_nodes[0].operation)).toMatchInlineSnapshot(`
      query @noArgs @withArgs(arg1: "hi") {
        test
      }
    `);
  });

  test('Same test as above, but this is the original reproducer.', () => {
    const schema = gql(`schema
    @link(url: "https://specs.apollo.dev/link/v1.0")
    @link(url: "https://specs.apollo.dev/join/v0.3", for: EXECUTION)
  {
    query: Query
    mutation: Mutation
    subscription: Subscription
  }

  directive @join__enumValue(graph: join__Graph!) repeatable on ENUM_VALUE

  directive @join__field(graph: join__Graph, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

  directive @join__graph(name: String!, url: String!) on ENUM_VALUE

  directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

  directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true, isInterfaceObject: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

  directive @join__unionMember(graph: join__Graph!, member: String!) repeatable on UNION

  directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

  directive @noArgs on FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | MUTATION | QUERY | SUBSCRIPTION

  directive @withArgs(arg1: String = "Default", arg2: String, arg3: Boolean, arg4: Int, arg5: [ID]) on FIELD | FRAGMENT_DEFINITION | FRAGMENT_SPREAD | INLINE_FRAGMENT | MUTATION | QUERY | SUBSCRIPTION

  interface AnInterface
    @join__type(graph: MAIN)
  {
    sharedField: String!
  }

  input AnotherInputType
    @join__type(graph: MAIN)
  {
    anotherInput: ID!
  }

  type BasicResponse
    @join__type(graph: MAIN)
  {
    id: Int!
    nullableId: Int
  }

  type BasicTypesResponse
    @join__type(graph: MAIN)
  {
    nullableId: ID
    nonNullId: ID!
    nullableInt: Int
    nonNullInt: Int!
    nullableString: String
    nonNullString: String!
    nullableFloat: Float
    nonNullFloat: Float!
    nullableBoolean: Boolean
    nonNullBoolean: Boolean!
  }

  input EnumInputType
    @join__type(graph: MAIN)
  {
    enumInput: SomeEnum!
    enumListInput: [SomeEnum!]!
    nestedEnumType: [NestedEnumInputType]
  }

  type EverythingResponse
    @join__type(graph: MAIN)
  {
    id: Int!
    nullableId: Int
    basicTypes: BasicTypesResponse
    enumResponse: SomeEnum
    interfaceResponse: AnInterface
    interfaceImplementationResponse: InterfaceImplementation2
    unionResponse: UnionType
    unionType2Response: UnionType2
    listOfBools: [Boolean!]!
    listOfInterfaces: [AnInterface]
    listOfUnions: [UnionType]
    objectTypeWithInputField(boolInput: Boolean, secondInput: Boolean!): ObjectTypeResponse
    listOfObjects: [ObjectTypeResponse]
  }

  input InputType
    @join__type(graph: MAIN)
  {
    inputString: String!
    inputInt: Int!
    inputBoolean: Boolean
    nestedType: NestedInputType!
    enumInput: SomeEnum
    listInput: [Int!]!
    nestedTypeList: [NestedInputType]
  }

  input InputTypeWithDefault
    @join__type(graph: MAIN)
  {
    nonNullId: ID!
    nonNullIdWithDefault: ID! = "id"
    nullableId: ID
    nullableIdWithDefault: ID = "id"
  }

  type InterfaceImplementation1 implements AnInterface
    @join__implements(graph: MAIN, interface: "AnInterface")
    @join__type(graph: MAIN)
  {
    sharedField: String!
    implementation1Field: Int!
  }

  type InterfaceImplementation2 implements AnInterface
    @join__implements(graph: MAIN, interface: "AnInterface")
    @join__type(graph: MAIN)
  {
    sharedField: String!
    implementation2Field: Float!
  }

  scalar join__FieldSet

  enum join__Graph {
    MAIN @join__graph(name: "main", url: "http://localhost:4001/graphql")
  }

  scalar link__Import

  enum link__Purpose {
    """
    'SECURITY' features provide metadata necessary to securely resolve fields.
    """
    SECURITY

    """
    'EXECUTION' features provide metadata necessary for operation execution.
    """
    EXECUTION
  }

  type Mutation
    @join__type(graph: MAIN)
  {
    noInputMutation: EverythingResponse!
  }

  input NestedEnumInputType
    @join__type(graph: MAIN)
  {
    someEnum: SomeEnum
  }

  input NestedInputType
    @join__type(graph: MAIN)
  {
    someFloat: Float!
    someNullableFloat: Float
  }

  type ObjectTypeResponse
    @join__type(graph: MAIN)
  {
    stringField: String!
    intField: Int!
    nullableField: String
  }

  type Query
    @join__type(graph: MAIN)
  {
    inputTypeQuery(input: InputType!): EverythingResponse!
    scalarInputQuery(listInput: [String!]!, stringInput: String!, nullableStringInput: String, intInput: Int!, floatInput: Float!, boolInput: Boolean!, enumInput: SomeEnum, idInput: ID!): EverythingResponse!
    noInputQuery: EverythingResponse!
    basicInputTypeQuery(input: NestedInputType!): EverythingResponse!
    anotherInputTypeQuery(input: AnotherInputType): EverythingResponse!
    enumInputQuery(enumInput: SomeEnum, inputType: EnumInputType): EverythingResponse!
    basicResponseQuery: BasicResponse!
    scalarResponseQuery: String
    defaultArgQuery(stringInput: String! = "default", inputType: AnotherInputType = {anotherInput: "inputDefault"}): BasicResponse!
    inputTypeDefaultQuery(input: InputTypeWithDefault): BasicResponse!
    sortQuery(listInput: [String!]!, stringInput: String!, nullableStringInput: String, INTInput: Int!, floatInput: Float!, boolInput: Boolean!, enumInput: SomeEnum, idInput: ID!): SortResponse!
  }

  enum SomeEnum
    @join__type(graph: MAIN)
  {
    SOME_VALUE_1 @join__enumValue(graph: MAIN)
    SOME_VALUE_2 @join__enumValue(graph: MAIN)
    SOME_VALUE_3 @join__enumValue(graph: MAIN)
  }

  type SortResponse
    @join__type(graph: MAIN)
  {
    id: Int!
    nullableId: Int
    zzz: Int
    aaa: Int
    CCC: Int
  }

  type Subscription
    @join__type(graph: MAIN)
  {
    noInputSubscription: EverythingResponse!
  }

  union UnionType
    @join__type(graph: MAIN)
    @join__unionMember(graph: MAIN, member: "UnionType1")
    @join__unionMember(graph: MAIN, member: "UnionType2")
   = UnionType1 | UnionType2

  type UnionType1
    @join__type(graph: MAIN)
  {
    unionType1Field: String!
    nullableString: String
  }

  type UnionType2
    @join__type(graph: MAIN)
  {
    unionType2Field: String!
    nullableString: String
  }`);

    const supergraph = Supergraph.build(schema);

    const qP = new QueryPlanner(supergraph, {});

    const op = operationFromDocument(
      supergraph.apiSchema(),
      gql`
        fragment Fragment1 on InterfaceImplementation1 {
          sharedField
          implementation1Field
        }

        fragment Fragment2 on InterfaceImplementation2
        @withArgs(arg2: "", arg1: "test", arg3: true, arg5: [1, 2], arg4: 2)
        @noArgs {
          sharedField
          implementation2Field
        }

        query DirectiveQuery @withArgs(arg2: "", arg1: "test") @noArgs {
          noInputQuery {
            enumResponse @withArgs(arg3: false, arg5: [1, 2], arg4: 2) @noArgs
            unionResponse {
              ... on UnionType1 @withArgs(arg2: "", arg1: "test") @noArgs {
                unionType1Field
              }
            }
            interfaceResponse {
              ...Fragment1 @withArgs(arg1: "test") @noArgs
              ...Fragment2
            }
          }
        }
      `,
    );

    qP.buildQueryPlan(op);
    // This is a crash test. If this test runs without crashing, it's a pass.
  });
}); // end of `describe`
