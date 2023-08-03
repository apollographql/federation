import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner, composeAndCreatePlannerWithOptions } from './testHelper';

describe('subscription query plan tests', () => {
  it('basic subscription query plan', async () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          me: User!
        }

        type Subscription {
          onNewUser: User!
        }

        type User @key(fields: "id") {
          id: ID!
          name: String!
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type Query {
          foo: Int
        }

        type User @key(fields: "id") {
          id: ID!
          address: String!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraphA, subgraphB);
    const operation = operationFromDocument(
      api,
      gql`
        subscription MySubscription {
          onNewUser {
            id
            name
            address
          }
        }
      `,
    );

    const plan = await queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Subscription {
          Primary: {
            Fetch(service: "subgraphA") {
              {
                onNewUser {
                  __typename
                  id
                  name
                }
              }
            }
          },
          Rest: {
            Sequence {
              Flatten(path: "onNewUser") {
                Fetch(service: "subgraphB") {
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
              },
            }
          }
        },
      }
    `);
  });
  it('basic subscription query plan, single subgraph', async () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          me: User!
        }

        type Subscription {
          onNewUser: User!
        }

        type User @key(fields: "id") {
          id: ID!
          name: String!
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type Query {
          foo: Int
        }

        type User @key(fields: "id") {
          id: ID!
          address: String!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraphA, subgraphB);
    const operation = operationFromDocument(
      api,
      gql`
        subscription MySubscription {
          onNewUser {
            id
            name
          }
        }
      `,
    );

    const plan = await queryPlanner.buildQueryPlan(operation);
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Subscription {
          Primary: {
            Fetch(service: "subgraphA") {
              {
                onNewUser {
                  id
                  name
                }
              }
            }
          },
          }
        },
      }
    `);
  });

  it('trying to use @defer with a description results in an error', async () => {
    const subgraphA = {
      name: 'subgraphA',
      typeDefs: gql`
        type Query {
          me: User!
        }

        type Subscription {
          onNewUser: User!
        }

        type User @key(fields: "id") {
          id: ID!
          name: String!
        }
      `,
    };

    const subgraphB = {
      name: 'subgraphB',
      typeDefs: gql`
        type Query {
          foo: Int
        }

        type User @key(fields: "id") {
          id: ID!
          address: String!
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlannerWithOptions([subgraphA, subgraphB], { incrementalDelivery: { enableDefer: true } });
    const operation = operationFromDocument(
      api,
      gql`
        subscription MySubscription {
          onNewUser {
            id
            ... @defer {
              name
            }
            address
          }
        }
      `,
    );
    queryPlanner.buildQueryPlan(operation)
    .then(() => {
      fail('expected exception');
    })
    .catch((e) => {
      expect(e.message).toEqual('@defer is not supported on subscriptions');
    })
  });
});
