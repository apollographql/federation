import { astSerializer, queryPlanSerializer, QueryPlanner } from '@apollo/query-planner';
import { composeServices } from '@apollo/composition';
import { buildSchema, operationFromDocument, Schema, ServiceDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

function composeAndCreatePlanner(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  const compositionResults = composeServices(services);
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
        me: User!
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
        me: User!
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
