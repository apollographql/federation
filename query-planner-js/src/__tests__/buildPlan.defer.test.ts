import { operationFromDocument, Schema, ServiceDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { QueryPlanner } from '@apollo/query-planner';
import { composeAndCreatePlanner, composeAndCreatePlannerWithOptions } from "./buildPlan.test";

function composeAndCreatePlannerWithDefer(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  return composeAndCreatePlannerWithOptions(services, { incrementalDelivery: { enableDefer : true }});
}

describe('handles simple @defer', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t : T
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
        v1: Int
        v2: Int
      }
    `
  }

  test('without defer-support enabled', () => {
    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v1
          ... @defer {
            v2
          }
        }
      }
    `);

    // Without defer-support enabled, we should get the same plan than if `@defer` wasn't there.
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
                  v1
                  v2
                }
              }
            },
          },
        },
      }
    `);
  });

  test('with defer-support enabled', () => {
    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v1
          ... @defer {
            v2
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                v1
              }
            }:
            Sequence {
              Fetch(service: "Subgraph1", id: 0) {
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
                      v1
                    }
                  }
                },
              },
            }
          }, [
            Deferred(depends: [0], path: "t") {
              {
                v2
              }:
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
                      v2
                    }
                  }
                },
              }
            },
          ]
        },
      }
    `);
  });
});

describe('non-router-based-defer', () => {
  test('@defer on value type', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t : T
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
          v: V
        }

        type V {
          a: Int
          b: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v {
            a
            ... @defer {
              b
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // We cannot handle a @defer on value type at the query planning level, so we expect nothing to be
    // deferred. However, we still want the `DeferNode` structure with the proper sub-selections so that
    // the execution can create responses that match the actual @defer.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                v {
                  a
                }
              }
            }:
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
                      v {
                        a
                        b
                      }
                    }
                  }
                },
              },
            }
          }, [
            Deferred(depends: [], path: "t.v") {
              {
                b
              }:
            },
          ]
        },
      }
    `);
  });

  test('@defer on entity but with no @key', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t : T
        }

        type T @key(fields: "id", resolvable: false) {
          id: ID!
          v1: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v2: String
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          ... @defer {
            v1
          }
          v2
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // While the @defer in the operation is on an entity, the @key in the first subgraph
    // is explicitely marked as non-resovable, so we cannot use it to actually defer the
    // fetch to `v1`. Note that example still compose because, defer excluded, `v1` can
    // still be fetched for all queries (which is only `t` here).
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                v2
              }
            }:
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
                      v2
                    }
                  }
                },
              },
            }
          }, [
            Deferred(depends: [], path: "t") {
              {
                v1
              }:
            },
          ]
        },
      }
    `);
  });

  test('@defer on value type but with entity afterwards', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t : T
        }

        type T @key(fields: "id") {
          id: ID!
        }

        type U @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v: V
        }

        type V {
          a: Int
          u: U
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v {
            a
            ... @defer {
              u {
                x
              }
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // While we cannot defer the initial resolving of `u`, we can defer the fetch of it's `x` field,
    // and so ensuring we do it, but also that the subselections do respect what is is the @defer and
    // what isn't.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                v {
                  a
                }
              }
            }:
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
                Fetch(service: "Subgraph2", id: 0) {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      v {
                        a
                        u {
                          __typename
                          id
                        }
                      }
                    }
                  }
                },
              },
            }
          }, [
            Deferred(depends: [0], path: "t.v") {
              {
                u {
                  x
                }
              }:
              Flatten(path: "t.v.u") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on U {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on U {
                      x
                    }
                  }
                },
              }
            },
          ]
        },
      }
    `);
  });
});

test('@defer resuming in same subgraph', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t : T
      }

      type T @key(fields: "id") {
        id: ID!
        v0: String
        v1: String
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1);
  const operation = operationFromDocument(api, gql`
    {
      t {
        v0
        ... @defer {
          v1
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            t {
              v0
            }
          }:
          Fetch(service: "Subgraph1", id: 0) {
            {
              t {
                __typename
                v0
                id
              }
            }
          }
        }, [
          Deferred(depends: [0], path: "t") {
            {
              v1
            }:
            Flatten(path: "t") {
              Fetch(service: "Subgraph1") {
                {
                  ... on T {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T {
                    v1
                  }
                }
              },
            }
          },
        ]
      },
    }
  `);
});

test('@defer multiple fields in different subgraphs', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t : T
      }

      type T @key(fields: "id") {
        id: ID!
        v0: String
        v1: String
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
        v2: String
      }
    `
  }

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
        v3: String
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2, subgraph3);
  const operation = operationFromDocument(api, gql`
    {
      t {
        v0
        ... @defer {
          v1
          v2
          v3
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            t {
              v0
            }
          }:
          Fetch(service: "Subgraph1", id: 0) {
            {
              t {
                __typename
                v0
                id
              }
            }
          }
        }, [
          Deferred(depends: [0], path: "t") {
            {
              v1
              v2
              v3
            }:
            Parallel {
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
                      v3
                    }
                  }
                },
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
                      v2
                    }
                  }
                },
              },
              Flatten(path: "t") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      v1
                    }
                  }
                },
              },
            }
          },
        ]
      },
    }
  `);
});

test('multiple (non-nested) @defer + label handling', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t : T
      }

      type T @key(fields: "id") {
        id: ID!
        v0: String
        v1: String
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
        v2: String
        v3: U
      }

      type U @key(fields: "id") {
        id: ID!
      }
    `
  }

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type U @key(fields: "id") {
        id: ID!
        x: Int
        y: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2, subgraph3);
  const operation = operationFromDocument(api, gql`
    {
      t {
        v0
        ... @defer(label: "defer_v1") {
          v1
        }
        ... @defer {
          v2
        }
        v3 {
          x
          ... @defer(label: "defer_in_v3") {
            y
          }
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            t {
              v0
              v3 {
                x
              }
            }
          }:
          Sequence {
            Fetch(service: "Subgraph1", id: 0) {
              {
                t {
                  __typename
                  id
                  v0
                }
              }
            },
            Flatten(path: "t") {
              Fetch(service: "Subgraph2", id: 1) {
                {
                  ... on T {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T {
                    v3 {
                      __typename
                      id
                    }
                  }
                }
              },
            },
            Flatten(path: "t.v3") {
              Fetch(service: "Subgraph3") {
                {
                  ... on U {
                    __typename
                    id
                  }
                } =>
                {
                  ... on U {
                    x
                  }
                }
              },
            },
          }
        }, [
          Deferred(depends: [0], path: "t") {
            {
              v2
            }:
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
                    v2
                  }
                }
              },
            }
          },
          Deferred(depends: [0], path: "t", label: "defer_v1") {
            {
              v1
            }:
            Flatten(path: "t") {
              Fetch(service: "Subgraph1") {
                {
                  ... on T {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T {
                    v1
                  }
                }
              },
            }
          },
          Deferred(depends: [1], path: "t.v3", label: "defer_in_v3") {
            {
              y
            }:
            Flatten(path: "t.v3") {
              Fetch(service: "Subgraph3") {
                {
                  ... on U {
                    __typename
                    id
                  }
                } =>
                {
                  ... on U {
                    y
                  }
                }
              },
            }
          },
        ]
      },
    }
  `);
});

describe('nested @defer', () => {
  test('on entities', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          me : User
        }

        type User @key(fields: "id") {
          id: ID!
          name: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          messages: [Message]
        }

        type Message @key(fields: "id") {
          id: ID!
          body: String
          author: User
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        me {
          name
          ... on User @defer {
            messages {
              body
              author {
                name
                ... @defer {
                  messages {
                    body
                  }
                }
              }
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              me {
                name
              }
            }:
            Fetch(service: "Subgraph1", id: 0) {
              {
                me {
                  __typename
                  name
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "me") {
              Defer {
                Primary {
                  {
                    ... on User {
                      messages {
                        body
                        author {
                          name
                        }
                      }
                    }
                  }:
                  Sequence {
                    Flatten(path: "me") {
                      Fetch(service: "Subgraph2", id: 1) {
                        {
                          ... on User {
                            __typename
                            id
                          }
                        } =>
                        {
                          ... on User {
                            messages {
                              body
                              author {
                                __typename
                                id
                              }
                            }
                          }
                        }
                      },
                    },
                    Flatten(path: "me.messages.@.author") {
                      Fetch(service: "Subgraph1") {
                        {
                          ... on User {
                            __typename
                            id
                          }
                        } =>
                        {
                          ... on User {
                            name
                          }
                        }
                      },
                    },
                  }
                }, [
                  Deferred(depends: [1], path: "me.messages.@.author") {
                    {
                      messages {
                        body
                      }
                    }:
                    Flatten(path: "me.messages.@.author") {
                      Fetch(service: "Subgraph2") {
                        {
                          ... on User {
                            __typename
                            id
                          }
                        } =>
                        {
                          ... on User {
                            messages {
                              body
                            }
                          }
                        }
                      },
                    }
                  },
                ]
              }
            },
          ]
        },
      }
    `);
  });

  test('on value types', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          me : User
        }

        type User @key(fields: "id") {
          id: ID!
          name: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          messages: [Message]
        }

        type Message {
          id: ID!
          body: MessageBody
        }

        type MessageBody {
          paragraphs: [String]
          lines: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        me {
          ... @defer {
            messages {
              ... @defer {
                body {
                  lines
                }
              }
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            :
            Fetch(service: "Subgraph1", id: 0) {
              {
                me {
                  __typename
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "me") {
              Defer {
                Primary {
                  :
                  Flatten(path: "me") {
                    Fetch(service: "Subgraph2") {
                      {
                        ... on User {
                          __typename
                          id
                        }
                      } =>
                      {
                        ... on User {
                          messages {
                            body {
                              lines
                            }
                          }
                        }
                      }
                    },
                  }
                }, [
                  Deferred(depends: [], path: "me.messages.@") {
                    {
                      body {
                        lines
                      }
                    }:
                  },
                ]
              }
            },
          ]
        },
      }
    `);
  });

  test('direct nesting on entity', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          me : User
        }

        type User @key(fields: "id") {
          id: ID!
          name: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          age: Int
          address: String
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        me {
          name
          ... @defer {
            age
            ... @defer {
              address
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              me {
                name
              }
            }:
            Fetch(service: "Subgraph1", id: 0) {
              {
                me {
                  __typename
                  name
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "me") {
              Defer {
                Primary {
                  {
                    age
                  }:
                  Flatten(path: "me") {
                    Fetch(service: "Subgraph2", id: 1) {
                      {
                        ... on User {
                          __typename
                          id
                        }
                      } =>
                      {
                        ... on User {
                          __typename
                          age
                          id
                        }
                      }
                    },
                  }
                }, [
                  Deferred(depends: [1], path: "me") {
                    {
                      address
                    }:
                    Flatten(path: "me") {
                      Fetch(service: "Subgraph2") {
                        {
                          ... on User {
                            __typename
                            id
                          }
                        } =>
                        {
                          ... on User {
                            address
                          }
                        }
                      },
                    }
                  },
                ]
              }
            },
          ]
        },
      }
    `);
  });

  test('direct nesting on value type', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          me : User
        }

        type User  {
          id: ID!
          name: String
          age: Int
          address: String
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1);
    const operation = operationFromDocument(api, gql`
      {
        me {
          name
          ... @defer {
            age
            ... @defer {
              address
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              me {
                name
              }
            }:
            Fetch(service: "Subgraph1") {
              {
                me {
                  name
                  age
                  address
                }
              }
            }
          }, [
            Deferred(depends: [], path: "me") {
              Defer {
                Primary {
                  {
                    age
                  }:
                }, [
                  Deferred(depends: [], path: "me") {
                    {
                      address
                    }:
                  },
                ]
              }
            },
          ]
        },
      }
    `);
  });
});

describe('@defer on mutation', () => {
  test('mutations on same subgraph', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t : T
        }

        type Mutation {
          update1: T
          update2: T
        }

        type T @key(fields: "id") {
          id: ID!
          v0: String
          v1: String
        }
      `

    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v2: String
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      mutation mut {
        update1 {
          v0
          ... @defer {
            v1
          }
        }
        update2 {
          v1
          ... @defer {
            v0
            v2
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // What matters here is that the updates (that go to different fields) are correctly done in sequence,
    // and that defers have proper dependency set.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              update1 {
                v0
              }
              update2 {
                v1
              }
            }:
            Fetch(service: "Subgraph1", id: 0) {
              {
                update1 {
                  __typename
                  v0
                  id
                }
                update2 {
                  __typename
                  v1
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "update1") {
              {
                v1
              }:
              Flatten(path: "update1") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      v1
                    }
                  }
                },
              }
            },
            Deferred(depends: [0], path: "update2") {
              {
                v0
                v2
              }:
              Parallel {
                Flatten(path: "update2") {
                  Fetch(service: "Subgraph2") {
                    {
                      ... on T {
                        __typename
                        id
                      }
                    } =>
                    {
                      ... on T {
                        v2
                      }
                    }
                  },
                },
                Flatten(path: "update2") {
                  Fetch(service: "Subgraph1") {
                    {
                      ... on T {
                        __typename
                        id
                      }
                    } =>
                    {
                      ... on T {
                        v0
                      }
                    }
                  },
                },
              }
            },
          ]
        },
      }
    `);
  });

  test('mutations on different subgraphs', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t : T
        }

        type Mutation {
          update1: T
        }

        type T @key(fields: "id") {
          id: ID!
          v0: String
          v1: String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Mutation {
          update2: T
        }

        type T @key(fields: "id") {
          id: ID!
          v2: String
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      mutation mut {
        update1 {
          v0
          ... @defer {
            v1
          }
        }
        update2 {
          v1
          ... @defer {
            v0
            v2
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    // What matters here is that the updates (that go to different fields) are correctly done in sequence,
    // and that defers have proper dependency set.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              update1 {
                v0
              }
              update2 {
                v1
              }
            }:
            Sequence {
              Fetch(service: "Subgraph1", id: 0) {
                {
                  update1 {
                    __typename
                    v0
                    id
                  }
                }
              },
              Fetch(service: "Subgraph2", id: 1) {
                {
                  update2 {
                    __typename
                    id
                  }
                }
              },
              Flatten(path: "update2") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      v1
                    }
                  }
                },
              },
            }
          }, [
            Deferred(depends: [0], path: "update1") {
              {
                v1
              }:
              Flatten(path: "update1") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      v1
                    }
                  }
                },
              }
            },
            Deferred(depends: [1], path: "update2") {
              {
                v0
                v2
              }:
              Parallel {
                Flatten(path: "update2") {
                  Fetch(service: "Subgraph2") {
                    {
                      ... on T {
                        __typename
                        id
                      }
                    } =>
                    {
                      ... on T {
                        v2
                      }
                    }
                  },
                },
                Flatten(path: "update2") {
                  Fetch(service: "Subgraph1") {
                    {
                      ... on T {
                        __typename
                        id
                      }
                    } =>
                    {
                      ... on T {
                        v0
                      }
                    }
                  },
                },
              }
            },
          ]
        },
      }
    `);
  });
});

test('multi-dependency deferred section', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        t: T
      }

      type T @key(fields: "id0") {
        id0: ID!
        v1: Int
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id0") @key(fields: "id1") {
        id0: ID!
        id1: ID!
        v2: Int
      }
    `
  }

  const subgraph3 = {
    name: 'Subgraph3',
    typeDefs: gql`
      type T @key(fields: "id0") @key(fields: "id2") {
        id0: ID!
        id2: ID!
        v3: Int
      }
    `
  }

  const subgraph4 = {
    name: 'Subgraph4',
    typeDefs: gql`
      type T @key(fields: "id1 id2") {
        id1: ID!
        id2: ID!
        v4: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2, subgraph3, subgraph4);
  let operation = operationFromDocument(api, gql`
    {
      t {
        v1
        v2
        v3
        ... @defer {
          v4
        }
      }
    }
  `);

  let plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            t {
              v1
              v2
              v3
            }
          }:
          Sequence {
            Fetch(service: "Subgraph1") {
              {
                t {
                  __typename
                  id0
                  v1
                }
              }
            },
            Parallel {
              Flatten(path: "t") {
                Fetch(service: "Subgraph3", id: 0) {
                  {
                    ... on T {
                      __typename
                      id0
                    }
                  } =>
                  {
                    ... on T {
                      v3
                      id2
                    }
                  }
                },
              },
              Flatten(path: "t") {
                Fetch(service: "Subgraph2", id: 1) {
                  {
                    ... on T {
                      __typename
                      id0
                    }
                  } =>
                  {
                    ... on T {
                      v2
                      id1
                    }
                  }
                },
              },
            },
          }
        }, [
          Deferred(depends: [0, 1], path: "t") {
            {
              v4
            }:
            Flatten(path: "t") {
              Fetch(service: "Subgraph4") {
                {
                  ... on T {
                    __typename
                    id1
                    id2
                  }
                } =>
                {
                  ... on T {
                    v4
                  }
                }
              },
            }
          },
        ]
      },
    }
  `);

  operation = operationFromDocument(api, gql`
    {
      t {
        v1
        ... @defer {
          v4
        }
      }
    }
  `);

  plan = queryPlanner.buildQueryPlan(operation);
  // TODO: the following plan is admittedly not as effecient as it could be, as the 2 queries to
  // subgraph 2 and 3 are done in the "primary" section, but all they do is handle transitive
  // key dependencies for the deferred block, so it would make more sense to defer those fetches
  // as well. It is however tricky to both improve this here _and_ maintain the plan generate
  // just above (which is admittedly optimial). More precisely, what the code currently does is
  // that when it gets to a defer, then it defers the fetch that gets the deferred fields (the 
  // fetch to subgraph 4 here), but it puts the "condition" resolution for the key of that fetch
  // in the non-deferred section. Here, resolving that fetch conditions is what creates the
  // dependency on the the fetches to subgraph 2 and 3, and so those get non-deferred.
  // Now, it would be reasonably simple to say that when we resolve the "conditions" for a deferred
  // fetch, then the first "hop" is non-deferred, but any following ones do get deferred, which
  // would move the 2 fetches to subgraph 2 and 3 in the deferred section. The problem is that doing
  // that wholesale means that in the previous example above, we'd keep the 2 non-deferred fetches
  // to subgraph 2 and 3 for v2 and v3, but we would then have new deferred fetches to those
  // subgraphs in the deferred section to now get the key id1 and id2, and that is in turn arguably
  // non-optimal. So ideally, the code would be able to distinguish between those 2 cases and
  // do the most optimal thing in each cases, but it's not that simple to do with the current
  // code.
  // Taking a step back, this "inefficiency" only exists where there is a @key "chain", and while
  // such chains have their uses, they are likely pretty rare in the first place. And as the
  // generated plan is not _that_ bad either, optimizing this feels fairly low priority and
  // we leave it for "later".
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            t {
              v1
            }
          }:
          Sequence {
            Fetch(service: "Subgraph1") {
              {
                t {
                  __typename
                  v1
                  id0
                }
              }
            },
            Parallel {
              Flatten(path: "t") {
                Fetch(service: "Subgraph3", id: 0) {
                  {
                    ... on T {
                      __typename
                      id0
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
                Fetch(service: "Subgraph2", id: 1) {
                  {
                    ... on T {
                      __typename
                      id0
                    }
                  } =>
                  {
                    ... on T {
                      id1
                    }
                  }
                },
              },
            },
          }
        }, [
          Deferred(depends: [0, 1], path: "t") {
            {
              v4
            }:
            Flatten(path: "t") {
              Fetch(service: "Subgraph4") {
                {
                  ... on T {
                    __typename
                    id1
                    id2
                  }
                } =>
                {
                  ... on T {
                    v4
                  }
                }
              },
            }
          },
        ]
      },
    }
  `);
});

describe('@require', () => {
  test('requirements of deferred fields are deferred', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          v1: Int
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v2: Int @requires(fields: "v3")
          v3: Int @external
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v3: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2, subgraph3);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v1
          ... @defer {
            v2
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                v1
              }
            }:
            Fetch(service: "Subgraph1", id: 0) {
              {
                t {
                  __typename
                  v1
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "t") {
              {
                v2
              }:
              Sequence {
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
                        v3
                      }
                    }
                  },
                },
                Flatten(path: "t") {
                  Fetch(service: "Subgraph2") {
                    {
                      ... on T {
                        __typename
                        v3
                        id
                      }
                    } =>
                    {
                      ... on T {
                        v2
                      }
                    }
                  },
                },
              }
            },
          ]
        },
      }
    `);
  });
});

describe('@provides', () => {
  test('@provides are ignored for deferred fields', () => {
    // Note: this test tests the currently implemented behaviour, which ignore @provides when it
    // concerns a deferred field. However, this is the behaviour implemented at the moment more
    // because it is the simplest option and it's not illogical, but it is not the only possibly
    // valid option. In particular, one could make the case that if a subgraph has a `@provides`,
    // then this probably means that the subgraph can provide the field "cheaply" (why have
    // a `@provides` otherwise?), and so that ignoring the @defer (instead of ignoring the @provides)
    // is preferable. We can change to this behaviour later if we decide that it is preferable since
    // the responses sent to the end-user would be the same regardless.

    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t : T @provides(fields: "v2")
        }

        type T @key(fields: "id") {
          id: ID!
          v1: Int
          v2: Int @external
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          v2: Int @shareable
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          v1
          ... @defer {
            v2
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                v1
              }
            }:
            Fetch(service: "Subgraph1", id: 0) {
              {
                t {
                  __typename
                  v1
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "t") {
              {
                v2
              }:
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
                      v2
                    }
                  }
                },
              }
            },
          ]
        },
      }
    `);
  });
});

test('@defer on query root type', () => {
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        op1 : Int
        op2: A
      }

      type A {
        x: Int
        y: Int
        next: Query
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type Query {
        op3: Int
        op4: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
  const operation = operationFromDocument(api, gql`
    {
      op2 {
        x
        y
        next {
          op3
          ... @defer {
            op1
            op4
          }
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            op2 {
              x
              y
              next {
                op3
              }
            }
          }:
          Sequence {
            Fetch(service: "Subgraph1", id: 0) {
              {
                op2 {
                  x
                  y
                  next {
                    __typename
                  }
                }
              }
            },
            Flatten(path: "op2.next") {
              Fetch(service: "Subgraph2") {
                {
                  ... on Query {
                    op3
                  }
                }
              },
            },
          }
        }, [
          Deferred(depends: [0], path: "op2.next") {
            {
              op1
              op4
            }:
            Parallel {
              Flatten(path: "op2.next") {
                Fetch(service: "Subgraph2") {
                  {
                    ... on Query {
                      op4
                    }
                  }
                },
              },
              Flatten(path: "op2.next") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on Query {
                      op1
                    }
                  }
                },
              },
            }
          },
        ]
      },
    }
  `);
});

test('@defer on everything queried', () => {
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

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
        y: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
  const operation = operationFromDocument(api, gql`
    {
      ... @defer {
        t {
          x
          y
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          :
        }, [
          Deferred(depends: [], path: "") {
            {
              t {
                x
                y
              }
            }:
            Sequence {
              Flatten(path: "") {
                Fetch(service: "Subgraph1") {
                  {
                    ... on Query {
                      t {
                        __typename
                        id
                        x
                      }
                    }
                  }
                },
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
                      y
                    }
                  }
                },
              },
            }
          },
        ]
      },
    }
  `);
});

test('@defer everything within entity', () => {
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

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      type T @key(fields: "id") {
        id: ID!
        y: Int
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
  const operation = operationFromDocument(api, gql`
    {
      t {
        ... @defer {
          x
          y
        }
      }
    }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          :
          Fetch(service: "Subgraph1", id: 0) {
            {
              t {
                __typename
                id
              }
            }
          }
        }, [
          Deferred(depends: [0], path: "t") {
            {
              x
              y
            }:
            Parallel {
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
                      y
                    }
                  }
                },
              },
              Flatten(path: "t") {
                Fetch(service: "Subgraph1") {
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
            }
          },
        ]
      },
    }
  `);
});

describe('defer with conditions', () => {
  test.each([{
    name: 'without explicit label',
    label: undefined,
  }, {
    name: 'with explicit label',
    label: 'testLabel',
  }])('simple @defer with condition $name', ({label}) => {
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

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      query($cond: Boolean) {
        t {
          x
          ... @defer(${label ? `label: "${label}", ` : ''}if: $cond) {
            y
          }
        }
      }
    `);

    let plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Condition(if: $cond) {
          Then {
            Defer {
              Primary {
                {
                  t {
                    x
                  }
                }:
                Fetch(service: "Subgraph1", id: 0) {
                  {
                    t {
                      __typename
                      x
                      id
                    }
                  }
                }
              }, [
                Deferred(depends: [0], path: "t"${label ? `, label: "${label}"` : ''}) {
                  {
                    y
                  }:
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
                          y
                        }
                      }
                    },
                  }
                },
              ]
            }
          } Else {
            Sequence {
              Fetch(service: "Subgraph1") {
                {
                  t {
                    __typename
                    id
                    x
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
                      y
                    }
                  }
                },
              },
            }
          }
        },
      }
    `);
  });

  test('@defer with condition on single subgraph', () => {
    // This test mostly serves to illustrate why we handle @defer conditions with `ConditionNode` instead of
    // just generating only the plan with the @defer and ignoring the `DeferNode` at execution: this is
    // because doing can result in sub-par execution for the case where the @defer is disabled (unless of
    // course the execution "merges" fetch groups, but it's not trivial to do so).
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x: Int
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1);
    const operation = operationFromDocument(api, gql`
      query($cond: Boolean) {
        t {
          x
          ... @defer(if: $cond) {
            y
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Condition(if: $cond) {
          Then {
            Defer {
              Primary {
                {
                  t {
                    x
                  }
                }:
                Fetch(service: "Subgraph1", id: 0) {
                  {
                    t {
                      __typename
                      x
                      id
                    }
                  }
                }
              }, [
                Deferred(depends: [0], path: "t") {
                  {
                    y
                  }:
                  Flatten(path: "t") {
                    Fetch(service: "Subgraph1") {
                      {
                        ... on T {
                          __typename
                          id
                        }
                      } =>
                      {
                        ... on T {
                          y
                        }
                      }
                    },
                  }
                },
              ]
            }
          } Else {
            Fetch(service: "Subgraph1") {
              {
                t {
                  x
                  y
                }
              }
            }
          }
        },
      }
    `);
  });

  test('multiple @defer with conditions and labels', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          x: Int
          u: U
        }

        type U @key(fields: "id") {
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
          y: Int
        }
      `
    }

    const subgraph3 = {
      name: 'Subgraph3',
      typeDefs: gql`
        type U @key(fields: "id") {
          id: ID!
          b: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2, subgraph3);
    const operation = operationFromDocument(api, gql`
      query($cond1: Boolean, $cond2: Boolean) {
        t {
          x
          ... @defer(if: $cond1, label: "foo") {
            y
          }
          ... @defer(if: $cond2, label: "bar") {
            u {
              a
              ... @defer(if: $cond1) {
                b
              }
            }
          }
        }
      }
    `);

    const plan = queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Condition(if: $cond1) {
          Then {
            Condition(if: $cond2) {
              Then {
                Defer {
                  Primary {
                    {
                      t {
                        x
                      }
                    }:
                    Fetch(service: "Subgraph1", id: 0) {
                      {
                        t {
                          __typename
                          x
                          id
                        }
                      }
                    }
                  }, [
                    Deferred(depends: [0], path: "t", label: "bar") {
                      Defer {
                        Primary {
                          {
                            u {
                              a
                            }
                          }:
                          Flatten(path: "t") {
                            Fetch(service: "Subgraph1", id: 1) {
                              {
                                ... on T {
                                  __typename
                                  id
                                }
                              } =>
                              {
                                ... on T {
                                  u {
                                    __typename
                                    a
                                    id
                                  }
                                }
                              }
                            },
                          }
                        }, [
                          Deferred(depends: [1], path: "t.u") {
                            {
                              b
                            }:
                            Flatten(path: "t.u") {
                              Fetch(service: "Subgraph3") {
                                {
                                  ... on U {
                                    __typename
                                    id
                                  }
                                } =>
                                {
                                  ... on U {
                                    b
                                  }
                                }
                              },
                            }
                          },
                        ]
                      }
                    },
                    Deferred(depends: [0], path: "t", label: "foo") {
                      {
                        y
                      }:
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
                              y
                            }
                          }
                        },
                      }
                    },
                  ]
                }
              } Else {
                Defer {
                  Primary {
                    {
                      t {
                        x
                        u {
                          a
                        }
                      }
                    }:
                    Fetch(service: "Subgraph1", id: 0) {
                      {
                        t {
                          __typename
                          x
                          id
                          u {
                            __typename
                            a
                            id
                          }
                        }
                      }
                    }
                  }, [
                    Deferred(depends: [0], path: "t", label: "foo") {
                      {
                        y
                      }:
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
                              y
                            }
                          }
                        },
                      }
                    },
                    Deferred(depends: [0], path: "t.u") {
                      {
                        b
                      }:
                      Flatten(path: "t.u") {
                        Fetch(service: "Subgraph3") {
                          {
                            ... on U {
                              __typename
                              id
                            }
                          } =>
                          {
                            ... on U {
                              b
                            }
                          }
                        },
                      }
                    },
                  ]
                }
              }
            }
          } Else {
            Condition(if: $cond2) {
              Then {
                Defer {
                  Primary {
                    {
                      t {
                        x
                        y
                      }
                    }:
                    Sequence {
                      Fetch(service: "Subgraph1", id: 0) {
                        {
                          t {
                            __typename
                            id
                            x
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
                              y
                            }
                          }
                        },
                      },
                    }
                  }, [
                    Deferred(depends: [0], path: "t", label: "bar") {
                      {
                        u {
                          a
                          b
                        }
                      }:
                      Sequence {
                        Flatten(path: "t") {
                          Fetch(service: "Subgraph1") {
                            {
                              ... on T {
                                __typename
                                id
                              }
                            } =>
                            {
                              ... on T {
                                u {
                                  __typename
                                  id
                                  a
                                }
                              }
                            }
                          },
                        },
                        Flatten(path: "t.u") {
                          Fetch(service: "Subgraph3") {
                            {
                              ... on U {
                                __typename
                                id
                              }
                            } =>
                            {
                              ... on U {
                                b
                              }
                            }
                          },
                        },
                      }
                    },
                  ]
                }
              } Else {
                Sequence {
                  Fetch(service: "Subgraph1") {
                    {
                      t {
                        __typename
                        id
                        x
                        u {
                          __typename
                          id
                          a
                        }
                      }
                    }
                  },
                  Parallel {
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
                            y
                          }
                        }
                      },
                    },
                    Flatten(path: "t.u") {
                      Fetch(service: "Subgraph3") {
                        {
                          ... on U {
                            __typename
                            id
                          }
                        } =>
                        {
                          ... on U {
                            b
                          }
                        }
                      },
                    },
                  },
                }
              }
            }
          }
        },
      }
    `);
  });
});

test('defer when some interface has different definitions in different subgraphs', () => {
  // This test exists to ensure an early bug is fixed: that but was in the code building
  // the `subselection` of `DeferNode` in the plan, and was such that those subselections
  // were created with links to subgraph types instead the supergraph ones. As a result,
  // we were sometimes trying to add a field (`b` in the example here) to version of a
  // type that didn't had that field (the definition of `I` in Subgraph1 here), hence
  // running into an assertion error.
  const subgraph1 = {
    name: 'Subgraph1',
    typeDefs: gql`
      type Query {
        i: I
      }

      interface I {
        a: Int
        c: Int
      }

      type T implements I @key(fields: "id") {
        id: ID!
        a: Int
        c: Int
      }
    `
  }

  const subgraph2 = {
    name: 'Subgraph2',
    typeDefs: gql`
      interface I {
        b: Int
      }

      type T implements I @key(fields: "id") {
        id: ID!
        a: Int @external
        b: Int @requires(fields: "a")
      }
    `
  }

  const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
  const operation = operationFromDocument(api, gql`
    query Dimensions {
      i {
        a
        b
        ... @defer {
          c
        }
      }
    }
  `);

  const queryPlan = queryPlanner.buildQueryPlan(operation);
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Defer {
        Primary {
          {
            i {
              a
              ... on T {
                b
              }
            }
          }:
          Sequence {
            Fetch(service: "Subgraph1") {
              {
                i {
                  __typename
                  a
                  ... on T {
                    __typename
                    id
                    a
                  }
                  c
                }
              }
            },
            Flatten(path: "i") {
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
        }, [
          Deferred(depends: [], path: "i") {
            {
              c
            }:
          },
        ]
      },
    }
  `);
});

describe('named fragments', () => {
  test('simple use', () => {
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
          x: Int
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          ...TestFragment @defer
        }
      }

      fragment TestFragment on T {
        x
        y
      }
    `);

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            :
            Fetch(service: "Subgraph1", id: 0) {
              {
                t {
                  __typename
                  id
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "t") {
              {
                ... on T {
                  x
                  y
                }
              }:
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
                      x
                      y
                    }
                  }
                },
              }
            },
          ]
        },
      }
    `);
  });

  test('expands into the same field deferred and not deferred', () => {
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
          x: Int
          y: Int
          z: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          ...Fragment1
          ...Fragment2 @defer
        }
      }

      fragment Fragment1 on T {
        x
        y
      }

      fragment Fragment2 on T {
        y
        z
      }
    `);

    // Field 'y' is queried twice, both in the deferred and non-deferred section. The spec says that
    // means the field is requested twice, so ensures that's what we do.
    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                x
                y
              }
            }:
            Sequence {
              Fetch(service: "Subgraph1", id: 0) {
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
                      x
                      y
                    }
                  }
                },
              },
            }
          }, [
            Deferred(depends: [0], path: "t") {
              {
                ... on T {
                  y
                  z
                }
              }:
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
                      y
                      z
                    }
                  }
                },
              }
            },
          ]
        },
      }
    `);
  });

  test('can request __typename in a fragment', () => {
    // Note that there is nothing super special about __typename in theory, but because it's a field that is always available
    // in all subghraph (for a type the subgraph has), it tends to create multiple options for the query planner, and so
    // excercises some code-paths that triggered an early bug in the handling of `@defer` (https://github.com/apollographql/federation/issues/2128).
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

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          y: Int
        }
      `
    }

    const [api, queryPlanner] = composeAndCreatePlannerWithDefer(subgraph1, subgraph2);
    const operation = operationFromDocument(api, gql`
      {
        t {
          ...OnT @defer
          x
        }
      }

      fragment OnT on T {
        y
        __typename
      }
    `);

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Defer {
          Primary {
            {
              t {
                x
              }
            }:
            Fetch(service: "Subgraph1", id: 0) {
              {
                t {
                  __typename
                  id
                  x
                }
              }
            }
          }, [
            Deferred(depends: [0], path: "t") {
              {
                ... on T {
                  y
                  __typename
                }
              }:
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
                      __typename
                      y
                    }
                  }
                },
              }
            },
          ]
        },
      }
    `);
  });
});
