import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';
import { operationFromDocument } from '@apollo/federation-internals';

describe('finder query plan tests', () => {
  test('finder for a single field', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          allUsers: [User]
          me: User!
        }

        type User @key(fields: "id") {
          id: ID!
          name: String
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          getUser(id: ID!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          address: String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          me {
            name
            address
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
              me {
                __typename
                id
                name
              }
            }
          },
          Flatten(path: "me") {
            SubgraphFetch(service: "Subgraph2") {
              {
                getUser(id: $id) {
                  ... on User {
                    address
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  it.todo('not sure how to trigger a naming conflict with "id" variable');

  test('finder invoked within a list', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          allUsers: [User]
        }

        type User @key(fields: "id") {
          id: ID!
          name: String
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          getUser(id: ID!): User @finder
        }

        type User @key(fields: "id") {
          id: ID!
          address: String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          allUsers {
            name
            address
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
              allUsers {
                __typename
                id
                name
              }
            }
          },
          Flatten(path: "allUsers.@") {
            SubgraphFetch(service: "Subgraph2") {
              {
                getUser(id: $id) {
                  ... on User {
                    address
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  test('finder with two keys on the same entity', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        type Query {
          allUsers: [User]
        }

        type User @key(fields: "id") @key(fields: "otherID") {
          id: ID!
          otherID: ID!
          name: String
        }
      `,
    };

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        type Query {
          getUser(id: ID!): User @finder
          getUserByOther(otherID: ID!): User @finder
        }

        type User @key(fields: "id") @key(fields: "otherID") {
          id: ID!
          otherID: ID!
          address: String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          allUsers {
            name
            address
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
            allUsers {
              __typename
              id
              name
            }
          }
        },
        Flatten(path: "allUsers.@") {
          SubgraphFetch(service: "Subgraph2") {
            {
              getUser(id: $id) {
                ... on User {
                  address
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
