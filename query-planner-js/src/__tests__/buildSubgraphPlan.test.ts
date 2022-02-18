import { astSerializer, queryPlanSerializer, QueryPlanner } from '@apollo/query-planner';
import { composeSubgraphFromServices } from '@apollo/composition';
import { /*assert,*/ buildSchema, operationFromDocument, Schema, ServiceDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';
/*
import { MAX_COMPUTED_PLANS } from '../buildPlan';
import { FetchNode } from '../QueryPlan';
import { FieldNode, OperationDefinitionNode, parse } from 'graphql';
*/

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

function composeAndCreatePlanner(...services: ServiceDefinition[]): [Schema, QueryPlanner] {
  const compositionResults = composeSubgraphFromServices(services);
  expect(compositionResults.errors).toBeUndefined();
  return [
    compositionResults.schema!.toAPISchema(),
    new QueryPlanner(buildSchema(compositionResults.supergraphSdl!))
  ];
}

test("look at me I'm the subgraph now", () => {
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
  query($representations:[_Any!]!){
    _entities(representations:$representations){
      ...on User{
        prop1
      }
    }
  }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Fetch(service: "Subgraph1") {
        {
          __typename
          ... on User {
            prop1
          }
        }
      },
    }
  `);
});

test("look at me I'm the federated subgraph now", () => {
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
  query($representations:[_Any!]!){
    _entities(representations:$representations){
      ...on User{
        prop1
        prop2
      }
    }
  }
  `);

  const plan = queryPlanner.buildQueryPlan(operation);
  expect(plan).toMatchInlineSnapshot(`
    QueryPlan {
      Parallel {
        Fetch(service: "Subgraph1") {
          {
            __typename
            ... on User {
              prop1
            }
          }
        },
        Fetch(service: "Subgraph2") {
          {
            __typename
            ... on User {
              prop2
            }
          }
        },
      },
    }
  `);
});
