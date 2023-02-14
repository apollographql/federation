import { assert, operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { isPlanNode } from '../QueryPlan';
import { composeAndCreatePlanner, findFetchNodes } from "./testHelper";

describe('basic @key on interface/@interfaceObject handling', () => {
  const subgraph1 = {
    name: 'S1',
    typeDefs: gql`
      type Query {
        iFromS1: I
      }

      interface I @key(fields: "id") {
        id: ID!
        x: Int
      }

      type A implements I @key(fields: "id") {
        id: ID!
        x: Int
        z: Int
      }

      type B implements I @key(fields: "id") {
        id: ID!
        x: Int
        w: Int
      }
    `
  }

  const subgraph2 = {
    name: 'S2',
    typeDefs: gql`
      type Query {
        iFromS2: I
      }

      type I @interfaceObject @key(fields: "id") {
        id: ID!
        y: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

  test('can use a @key on an @interfaceObject type', () => {
    // Start by ensuring we can use the key on an @interfaceObject type
    const operation = operationFromDocument(api, gql`
      {
        iFromS1 {
          x
          y
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S1") {
            {
              iFromS1 {
                __typename
                id
                x
              }
            }
          },
          Flatten(path: "iFromS1") {
            Fetch(service: "S2") {
              {
                ... on I {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  y
                }
              }
            },
          },
        },
      }
    `);
    });

  test('can use a @key on an interface "from" an @interfaceObject type', () => {
    const operation = operationFromDocument(api, gql`
      {
        iFromS2 {
          x
          y
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S2") {
            {
              iFromS2 {
                __typename
                id
                y
              }
            }
          },
          Flatten(path: "iFromS2") {
            Fetch(service: "S1") {
              {
                ... on I {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  __typename
                  x
                }
              }
            },
          },
        },
      }
    `);
  });

  test('only uses an @interfaceObject if it can', () => {
    const operation = operationFromDocument(api, gql`
      {
        iFromS2 {
          y
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S2") {
          {
            iFromS2 {
              y
            }
          }
        },
      }
    `);
  });

  test('does not rely on an @interfaceObject directly for `__typename`', () => {
    const operation = operationFromDocument(api, gql`
      {
        iFromS2 {
          __typename
          y
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S2") {
            {
              iFromS2 {
                __typename
                id
                y
              }
            }
          },
          Flatten(path: "iFromS2") {
            Fetch(service: "S1") {
              {
                ... on I {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  __typename
                }
              }
            },
          },
        },
      }
    `);
  });

  test('does not rely on an @interfaceObject directly if a specific implementation is requested', () => {
    // Even though `y` is part of the interface and accessible from the 2nd subgraph, the
    // fact that we "filter" a single implementation should act as if `__typename` was queried
    // (effectively, the gateway/router need that `__typename` to decide if the returned data
    // should be included or not.
    const operation = operationFromDocument(api, gql`
      {
        iFromS2 {
          ... on A {
            y
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S2") {
            {
              iFromS2 {
                __typename
                id
              }
            }
          },
          Flatten(path: "iFromS2") {
            Fetch(service: "S1") {
              {
                ... on I {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  __typename
                }
              }
            },
          },
          Flatten(path: "iFromS2") {
            Fetch(service: "S2") {
              {
                ... on A {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  y
                }
              }
            },
          },
        },
      }
    `);
  });

  test('can use a @key on an @interfaceObject type even for a concrete implementation', () => {
    const operation = operationFromDocument(api, gql`
      {
        iFromS1 {
          ... on A {
            y
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S1") {
            {
              iFromS1 {
                __typename
                ... on A {
                  __typename
                  id
                }
              }
            }
          },
          Flatten(path: "iFromS1") {
            Fetch(service: "S2") {
              {
                ... on A {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  y
                }
              }
            },
          },
        },
      }
    `);

    assert(isPlanNode(plan.node), 'buildQueryPlan should return QueryPlan');
    const rewrites = findFetchNodes('S2', plan.node)[0].inputRewrites;
    expect(rewrites).toBeDefined();
    expect(rewrites?.length).toBe(1);
    const rewrite = rewrites![0];
    expect(rewrite.path).toEqual(['... on A', '__typename']);
    expect(rewrite.setValueTo).toBe('I');
  });

  test('handles query of an interface field (that is not on the `@interfaceObject`) for a specific implementation when query starts on the @interfaceObject', () => {
    // Here, we start on S2, but `x` is only in S1. Further, while `x` is on the `I` interface, we only query it for `A`.
    const operation = operationFromDocument(api, gql`
      {
        iFromS2 {
          ... on A {
            x
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "S2") {
            {
              iFromS2 {
                __typename
                id
              }
            }
          },
          Flatten(path: "iFromS2") {
            Fetch(service: "S1") {
              {
                ... on I {
                  __typename
                  id
                }
              } =>
              {
                ... on I {
                  __typename
                  ... on A {
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

it('avoids buffering @interfaceObject results that may have to filtered with lists', () => {
  const subgraph1 = {
    name: 'S1',
    typeDefs: gql`
      type Query {
        everything: [I]
      }

      type I @interfaceObject @key(fields: "id") {
        id: ID!
        expansiveField: String
      }
    `
  }

  const subgraph2 = {
    name: 'S2',
    typeDefs: gql`
      interface I @key(fields: "id") {
        id: ID!
      }

      type A implements I @key(fields: "id") {
        id: ID!
        a: Int
      }

      type B implements I @key(fields: "id") {
        id: ID!
        b: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

  const operation = operationFromDocument(api, gql`
    {
      everything {
        ... on A {
          a
          expansiveField
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "S1") {
          {
            everything {
              __typename
              id
            }
          }
        },
        Flatten(path: "everything.@") {
          Fetch(service: "S2") {
            {
              ... on I {
                __typename
                id
              }
            } =>
            {
              ... on I {
                __typename
                ... on A {
                  a
                }
              }
            }
          },
        },
        Flatten(path: "everything.@") {
          Fetch(service: "S1") {
            {
              ... on A {
                __typename
                id
              }
            } =>
            {
              ... on I {
                expansiveField
              }
            }
          },
        },
      },
    }
  `);
});

it('handles @requires on concrete type of field provided by interface object', () => {
  const subgraph1 = {
    name: 'S1',
    typeDefs: gql`
      type I @interfaceObject @key(fields: "id") {
        id: ID!
        x: Int @shareable
      }
    `
  }

  const subgraph2 = {
    name: 'S2',
    typeDefs: gql`
      type Query {
        i: I
      }

      interface I @key(fields: "id") {
        id: ID!
        x: Int
      }

      type A implements I @key(fields: "id") {
        id: ID!
        x: Int @external
        y: String @requires(fields: "x")
      }

      type B implements I @key(fields: "id") {
        id: ID!
        x: Int @shareable
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

  const operation = operationFromDocument(api, gql`
    {
      i {
        ... on A {
          y
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "S2") {
          {
            i {
              __typename
              ... on A {
                __typename
                id
              }
            }
          }
        },
        Flatten(path: "i") {
          Fetch(service: "S1") {
            {
              ... on A {
                __typename
                id
              }
            } =>
            {
              ... on I {
                x
              }
            }
          },
        },
        Flatten(path: "i") {
          Fetch(service: "S2") {
            {
              ... on A {
                __typename
                x
                id
              }
            } =>
            {
              ... on A {
                y
              }
            }
          },
        },
      },
    }
  `);
});

it('handles @interfaceObject in nested entity', () => {
  const subgraph1 = {
    name: 'S1',
    typeDefs: gql`
      type I @interfaceObject @key(fields: "id") {
        id: ID!
        t: T
      }

      type T {
        relatedIs: [I]
      }
    `
  }

  const subgraph2 = {
    name: 'S2',
    typeDefs: gql`
      type Query {
        i: I
      }

      interface I @key(fields: "id") {
        id: ID!
        a: Int
      }

      type A implements I @key(fields: "id") {
        id: ID!
        a: Int
      }

      type B implements I @key(fields: "id") {
        id: ID!
        a: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

  const operation = operationFromDocument(api, gql`
    {
      i {
        t {
          relatedIs {
            a
          }
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "S2") {
          {
            i {
              __typename
              id
            }
          }
        },
        Flatten(path: "i") {
          Fetch(service: "S1") {
            {
              ... on I {
                __typename
                id
              }
            } =>
            {
              ... on I {
                t {
                  relatedIs {
                    __typename
                    id
                  }
                }
              }
            }
          },
        },
        Flatten(path: "i.t.relatedIs.@") {
          Fetch(service: "S2") {
            {
              ... on I {
                __typename
                id
              }
            } =>
            {
              ... on I {
                __typename
                a
              }
            }
          },
        },
      },
    }
  `);
});
