import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';

describe('subscription query plan tests', () => {
  it('basic subscription query plan', () => {
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

    const plan = queryPlanner.buildQueryPlan(operation);
    // Note that even though we have keys, it is faster to query both
    // subgraphs in parallel for each property than querying one first
    // and then using the key.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        SubscriptionPlan {
          Primary: {
            Subscription(service: "subgraphA") {
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
  it('basic subscription query plan, single subgraph', () => {
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

    const plan = queryPlanner.buildQueryPlan(operation);
    // Note that even though we have keys, it is faster to query both
    // subgraphs in parallel for each property than querying one first
    // and then using the key.
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        SubscriptionPlan {
          Primary: {
            Subscription(service: "subgraphA") {
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
});
