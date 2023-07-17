import {
  astSerializer,
  fed2gql,
  queryPlanSerializer,
} from 'apollo-federation-integration-testsuite';
import { getFederatedTestingSchema } from './execution-utils';
import { Schema, parseOperation } from '@apollo/federation-internals';
import { QueryPlan, QueryPlanner } from '@apollo/query-planner';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

const fixtures = [
  {
    name: 'kotlin',
    typeDefs: fed2gql`
      type Account {
        id: ID!
        internalID: ID! @shareable
      }

      type GraphVariant @extends  {
        graph: Service!
        name: String! @shareable
      }

      type Query {
        graph(id: ID!): Service
      }

      type Service  {
        accountForPersistedQueriesSubgraph: Account
        id: ID! @shareable
        variant(name: String!): GraphVariant
      }
      `,
  },
  {
    name: 'billing',
    typeDefs: fed2gql`
      union _Entity = Account

      type Account @extends @key(fields : "internalID", resolvable : true) {
        currentPlan: BillingPlan!
        internalID: ID! @external
      }

      type BillingPlan {
        persistedQueries: Boolean!
      }
      `,
  },
  {
    name: 'persistedqueries',
    typeDefs: fed2gql`
      union _Entity = GraphVariant

      type Account {
        currentPlan: BillingPlan! @external
      }

      type BillingPlan {
        persistedQueries: Boolean! @external
      }

      type GraphVariant @key(fields : "name graph { id accountForPersistedQueriesSubgraph { currentPlan { persistedQueries } } }", resolvable : true) {
        graph: Service! @external
        name: String!
        persistedQueryList: PersistedQueryList @tag(name : "platform-api")
      }

      type PersistedQueryList {
        id: ID! @tag(name : "platform-api")
      }

      type Service {
        accountForPersistedQueriesSubgraph: Account @external
        id: ID!
      }
    `,
  },
];

describe('buildQueryPlan', () => {
  let schema: Schema;
  let queryPlanner: QueryPlanner;

  const buildPlan = (operation: string): QueryPlan => {
    return queryPlanner.buildQueryPlan(parseOperation(schema, operation));
  };

  beforeEach(() => {
    ({ schema, queryPlanner } = getFederatedTestingSchema(fixtures));
  });

  it('bad query plan', () => {
    const operation = `#graphql
      query ($graphId: ID!, $name: String!) {
        graph(id: $graphId) {
          id
          variant(name: $name) {
            persistedQueryList {
              id
            }
          }
          ...GraphFrag
        }
      }

      fragment GraphFrag on Service {
        id
        __typename
      }
    `;
    const queryPlan = buildPlan(operation);

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "kotlin") {
            {
              graph(id: $graphId) {
                ...GraphFrag
                variant(name: $name) {
                  __typename
                  name
                  graph {
                    ...GraphFrag
                  }
                }
              }
            }
            
            fragment GraphFrag on Service {
              __typename
              id
            }
          },
          Flatten(path: "graph.variant.graph.accountForPersistedQueriesSubgraph") {
            Fetch(service: "billing") {
              {
                ... on Account {
                  __typename
                  internalID
                }
              } =>
              {
                ... on Account {
                  currentPlan {
                    persistedQueries
                  }
                }
              }
            },
          },
          Flatten(path: "graph.variant") {
            Fetch(service: "persistedqueries") {
              {
                ... on GraphVariant {
                  __typename
                  name
                  graph {
                    id
                    accountForPersistedQueriesSubgraph {
                      currentPlan {
                        persistedQueries
                      }
                    }
                  }
                }
              } =>
              {
                ... on GraphVariant {
                  persistedQueryList {
                    id
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  it('good query plan', () => {
    const operation = `#graphql
      query ($graphId: ID!, $name: String!) {
        graph(id: $graphId) {
          id
          variant(name: $name) {
            persistedQueryList {
              id
            }
          }
          ...GraphFrag
        }
      }

      fragment GraphFrag on Service {
        id
      }
    `;
    const queryPlan = buildPlan(operation);

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "kotlin") {
            {
              graph(id: $graphId) {
                id
                variant(name: $name) {
                  __typename
                  name
                  graph {
                    id
                    accountForPersistedQueriesSubgraph {
                      __typename
                      internalID
                    }
                  }
                }
              }
            }
          },
          Flatten(path: "graph.variant.graph.accountForPersistedQueriesSubgraph") {
            Fetch(service: "billing") {
              {
                ... on Account {
                  __typename
                  internalID
                }
              } =>
              {
                ... on Account {
                  currentPlan {
                    persistedQueries
                  }
                }
              }
            },
          },
          Flatten(path: "graph.variant") {
            Fetch(service: "persistedqueries") {
              {
                ... on GraphVariant {
                  __typename
                  name
                  graph {
                    id
                    accountForPersistedQueriesSubgraph {
                      currentPlan {
                        persistedQueries
                      }
                    }
                  }
                }
              } =>
              {
                ... on GraphVariant {
                  persistedQueryList {
                    id
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
