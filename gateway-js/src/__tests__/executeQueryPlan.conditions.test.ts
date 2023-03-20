import gql from 'graphql-tag';
import { getFederatedTestingSchema, ServiceDefinitionModule } from './execution-utils';
import {
  astSerializer,
  queryPlanSerializer,
} from 'apollo-federation-integration-testsuite';
import { Operation, parseOperation, Schema } from '@apollo/federation-internals';
import { QueryPlan } from '@apollo/query-planner';
import { LocalGraphQLDataSource } from '../datasources';
import { GatewayExecutionResult, GatewayGraphQLRequestContext } from '@apollo/server-gateway-interface';
import { buildOperationContext } from '../operationContext';
import { executeQueryPlan } from '../executeQueryPlan';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('Execution tests for @include/@skip', () => {
  function buildRequestContext(variables: Record<string, any>): GatewayGraphQLRequestContext {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return {
      cache: undefined as any,
      context: {},
      request: {
        variables,
      },
      metrics: {},
    };
  }

  let s2Queries: {id : number}[] = [];
  /**
   * Simple subgraph schemas reused by a number of tests. This declares a simple interface `T` with 2 implems `T1` and `T2`.
   * There is a simple operation that returns a list of 3 simple objects:
   *  1. { __typename: 'T1', id: 1, a1: 10, b1: 100 },
   *  2. { __typename: 'T2', id: 2, a2: 20, b2: 200 },
   *  3. { __typename: 'T1', id: 3, a1: 30, b1: 300 },
   * The `b1` and `b2` fields are provided by the 2nd subgraph, the rest by the 1st one.
   *
   * Additionally, everytime the 2nd subgraph is asked to resolve an entity, we collect it in `s2Queries`. This allows tests to
   * validate when condition should not applied that the conditioned fetch is indeed not queried.
   */
  const simpleInterfaceSchemas: ServiceDefinitionModule[] = [
    {
      name: 'S1',
      typeDefs: gql`
        type Query {
          t: [T]
        }

        interface T {
          id: ID!
        }

        type T1 implements T @key(fields: "id") {
          id: ID!
          a1: Int
        }

        type T2 implements T @key(fields: "id") {
          id: ID!
          a2: Int
        }
      `,
      resolvers: {
        Query: {
          t() {
            return [
              { __typename: 'T1', id: 1, a1: 10 },
              { __typename: 'T2', id: 2, a2: 20 },
              { __typename: 'T1', id: 3, a1: 30 },
            ];
          }
        },
      }
    },
    {
      name: 'S2',
      typeDefs: gql`
        type T1 @key(fields: "id") {
          id: ID!
          b1: Int
        }

        type T2 @key(fields: "id") {
          id: ID!
          b2: Int
        }
      `,
      resolvers: {
        T1: {
          __resolveReference(ref: { id: number }) {
            s2Queries.push(ref);
            return { ...ref, b1: 100 * ref.id };
          },
        },
        T2: {
          __resolveReference(ref: { id: number }) {
            s2Queries.push(ref);
            return { ...ref, b2: 100 * ref.id };
          },
        },
      }
    }
  ];

  async function executePlan(
    queryPlan: QueryPlan,
    operation: Operation,
    schema: Schema,
    serviceMap: { [serviceName: string]: LocalGraphQLDataSource },
    variables: Record<string, any> = {},
  ): Promise<GatewayExecutionResult> {
    const apiSchema = schema.toAPISchema();
    const operationContext = buildOperationContext({
      schema: apiSchema.toGraphQLJSSchema(),
      operationDocument: gql`${operation.toString()}`,
    });
    return executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(variables),
      operationContext,
      schema.toGraphQLJSSchema(),
      apiSchema,
    );
  }

  describe('Constant conditions optimisation', () => {
    const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema(simpleInterfaceSchemas);

    it('top-level @include never included', async () => {
      const operation = parseOperation(schema, `
        {
          t @include(if: false) {
            id
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      expect(queryPlan).toMatchInlineSnapshot(`QueryPlan {}`);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`Object {}`);
    });

    it('top-level @skip always skipped', async () => {
      const operation = parseOperation(schema, `
        {
          t @skip(if: true) {
            id
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      expect(queryPlan).toMatchInlineSnapshot(`QueryPlan {}`);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`Object {}`);
    });

    it('top-level @include always included', async () => {
      const operation = parseOperation(schema, `
        {
          t @include(if: true) {
            id
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // Note that due to how we handle constant conditions, those don't get removed in the fetch nodes (which only matter when things are
      // included with a constant; if they are skipped with a constant, then the fetch is not include so ...). This feels like a very minor
      // point so leaving it be for now: constant conditions are a bit of a smell in the first place, so unsure we need to go above and
      // beyond to optimise them.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "S1") {
            {
              t @include(if: true) {
                __typename
                id
              }
            }
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
    });

    it('top-level @skip always included', async () => {
      const operation = parseOperation(schema, `
        {
          t @skip(if: false) {
            id
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // Same as for @include: the @skip within the fetch is not cleared, but that's harmless.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "S1") {
            {
              t @skip(if: false) {
                __typename
                id
              }
            }
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
    });

    it('Non top-level @include never included', async () => {
      const operation = parseOperation(schema, `
        {
          t {
            ... on T1 {
              a1
              b1 @include(if: false)
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // Importantly, we only bother querying S1
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "S1") {
            {
              t {
                __typename
                ... on T1 {
                  __typename
                  id
                  a1
                }
              }
            }
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "a1": 10,
            },
            Object {},
            Object {
              "a1": 30,
            },
          ],
        }
      `);
    });

    it('Non top-level @skip always skipped', async () => {
      const operation = parseOperation(schema, `
        {
          t {
            ... on T1 {
              a1
              b1 @skip(if: true)
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // Importantly, we only bother querying S1
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "S1") {
            {
              t {
                __typename
                ... on T1 {
                  __typename
                  id
                  a1
                }
              }
            }
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "a1": 10,
            },
            Object {},
            Object {
              "a1": 30,
            },
          ],
        }
      `);
    });

    it('Non top-level @include always included', async () => {
      const operation = parseOperation(schema, `
        {
          t {
            ... on T1 {
              a1
              b1 @include(if: true)
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // Again, constantly included is the one case that still show up in the fetch, but that's harmless. The point here is
      // that we don't bother with a ConditionNode.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  ... on T1 {
                    __typename
                    id
                    a1
                  }
                }
              }
            },
            Flatten(path: "t.@") {
              Fetch(service: "S2") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    b1 @include(if: true)
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "a1": 10,
              "b1": 100,
            },
            Object {},
            Object {
              "a1": 30,
              "b1": 300,
            },
          ],
        }
      `);
    });

    it('Non top-level @skip always included', async () => {
      const operation = parseOperation(schema, `
        {
          t {
            ... on T1 {
              a1
              b1 @skip(if: false)
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // Again, constantly included is the one case that still show up in the fetch, but that's harmless. The point here is
      // that we don't bother with a ConditionNode.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  ... on T1 {
                    __typename
                    id
                    a1
                  }
                }
              }
            },
            Flatten(path: "t.@") {
              Fetch(service: "S2") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    b1 @skip(if: false)
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "a1": 10,
              "b1": 100,
            },
            Object {},
            Object {
              "a1": 30,
              "b1": 300,
            },
          ],
        }
      `);
    });
  });

  describe('Simple variable conditions handling', () => {
    const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema(simpleInterfaceSchemas);

    it('handles default values for condition variables', async () => {
      const operation = parseOperation(schema, `
        query ($if: Boolean! = false){
          t {
            id
            ... on T1 @include(if: $if) {
              b1
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // We validate that the condition has been extracted.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  id
                  ... on T1 @include(if: $if) {
                    __typename
                    id
                  }
                }
              }
            },
            Include(if: $if) {
              Flatten(path: "t.@") {
                Fetch(service: "S2") {
                  {
                    ... on T1 {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T1 {
                      b1
                    }
                  }
                },
              }
            },
          },
        }
      `);

      s2Queries = [];
      // No variables: the default (not included) should be used.
      let response = await executePlan(queryPlan, operation, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(0);

      s2Queries = [];
      // Checks that the overriding of the default does work.
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "b1": 100,
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "b1": 300,
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(2);
    });

    it('handles condition on named fragments spread', async () => {
      const operation = parseOperation(schema, `
        query ($if: Boolean!){
          t {
            id
            ... GetB1 @include(if: $if)
          }
        }

        fragment GetB1 on T1 {
          b1
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  id
                  ... on T1 @include(if: $if) {
                    __typename
                    id
                  }
                }
              }
            },
            Include(if: $if) {
              Flatten(path: "t.@") {
                Fetch(service: "S2") {
                  {
                    ... on T1 {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T1 {
                      b1
                    }
                  }
                },
              }
            },
          },
        }
      `);

      s2Queries = [];
      let response = await executePlan(queryPlan, operation, schema, serviceMap, { if: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "b1": 100,
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "b1": 300,
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(2);

      s2Queries = [];
      // Checks that the overriding of the default does work.
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if: false });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(0);
    });

    it('handles condition inside named fragments', async () => {
      const operation = parseOperation(schema, `
        query ($if: Boolean!){
          t {
            id
            ... OtherGetB1
          }
        }

        fragment OtherGetB1 on T1 {
          b1 @include(if: $if)
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  id
                  ... on T1 {
                    __typename
                    id
                  }
                }
              }
            },
            Include(if: $if) {
              Flatten(path: "t.@") {
                Fetch(service: "S2") {
                  {
                    ... on T1 {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T1 {
                      b1
                    }
                  }
                },
              }
            },
          },
        }
      `);

      s2Queries = [];
      let response = await executePlan(queryPlan, operation, schema, serviceMap, { if: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "b1": 100,
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "b1": 300,
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(2);

      s2Queries = [];
      // Checks that the overriding of the default does work.
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if: false });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(0);
    });
  })

  describe('Fetches with multiple top-level conditioned types', () => {
    const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema(simpleInterfaceSchemas);

    it('creates a condition node when a condition covers a whole fetch', async () => {
      const operation = parseOperation(schema, `
        query ($if: Boolean!){
          t {
            id
            ... on T1 @include(if: $if) {
              b1
            }
            ... on T2 @include(if: $if) {
              b2
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // We validate that the condition has been extracted.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  id
                  ... on T1 @include(if: $if) {
                    __typename
                    id
                  }
                  ... on T2 @include(if: $if) {
                    __typename
                    id
                  }
                }
              }
            },
            Include(if: $if) {
              Flatten(path: "t.@") {
                Fetch(service: "S2") {
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
                      b1
                    }
                    ... on T2 {
                      b2
                    }
                  }
                },
              }
            },
          },
        }
      `);

      s2Queries = [];
      let response = await executePlan(queryPlan, operation, schema, serviceMap, { if: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "b1": 100,
              "id": "1",
            },
            Object {
              "b2": 200,
              "id": "2",
            },
            Object {
              "b1": 300,
              "id": "3",
            },
          ],
        }
      `);
      // Since we include the fields, S2 should have been asked to resolve the `b` field of our 3 entities.
      expect(s2Queries).toHaveLength(3);

      s2Queries = [];
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if: false });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      // But make sure we indeed do not query S2 if we don't need to.
      expect(s2Queries).toHaveLength(0);
    });

    it('does _not_ creates a condition node when no single condition covers the whole fetch', async () => {
      const operation = parseOperation(schema, `
        query ($if1: Boolean!, $if2: Boolean!){
          t {
            id
            ... on T1 @include(if: $if1) {
              b1
            }
            ... on T2 @include(if: $if2) {
              b2
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // We validate that the condition has been extracted.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  id
                  ... on T1 @include(if: $if1) {
                    __typename
                    id
                  }
                  ... on T2 @include(if: $if2) {
                    __typename
                    id
                  }
                }
              }
            },
            Flatten(path: "t.@") {
              Fetch(service: "S2") {
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
                  ... on T1 @include(if: $if1) {
                    b1
                  }
                  ... on T2 @include(if: $if2) {
                    b2
                  }
                }
              },
            },
          },
        }
      `);

      s2Queries = [];
      let response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: true, if2: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "b1": 100,
              "id": "1",
            },
            Object {
              "b2": 200,
              "id": "2",
            },
            Object {
              "b1": 300,
              "id": "3",
            },
          ],
        }
      `);
      // Since we include the fields, S2 should have been asked to resolve the `b` field of our 3 entities.
      expect(s2Queries).toHaveLength(3);

      s2Queries = [];
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: false, if2: false });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      // TODO: It's unfortunate, but we currently do query S2 in that case. We could fix this by including the
      // condition in the inputs: even if the gateway/router don't have a `ConditionNode` to shortcut things
      // directly, as long as it handle the conditions when extracting the inputs, it would end up with 0
      // inputs in this case, and would not send a query, which technically would be a tiny bit slower than
      // having a `ConditionNode`, but tons better than sending a useless fetch.
      expect(s2Queries).toHaveLength(3);

      s2Queries = [];
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: false, if2: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "b2": 200,
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      // TODO: Similar to the previous case, we could (should) here only send the query for the single
      // entity that is included, but we currently instead send everything.
      expect(s2Queries).toHaveLength(3);
    });

    it('handles "nested" conditions', async () => {
      // Shows that as long as the condition matches, even "nested" @include gets handled as a condition node.
      const operation = parseOperation(schema, `
        query ($if1: Boolean!, $if2: Boolean!){
          t {
            id
            ... on T1 @include(if: $if1) {
              b1 @include(if: $if2)
            }
            ... on T2 @include(if: $if1) {
              b2 @include(if: $if2)
            }
          }
        }
      `);

      const queryPlan = queryPlanner.buildQueryPlan(operation);
      // We validate that the condition has been extracted.
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                t {
                  __typename
                  id
                  ... on T1 @include(if: $if1) {
                    __typename
                    id
                  }
                  ... on T2 @include(if: $if1) {
                    __typename
                    id
                  }
                }
              }
            },
            Include(if: $if2) {
              Include(if: $if1) {
                Flatten(path: "t.@") {
                  Fetch(service: "S2") {
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
                        b1
                      }
                      ... on T2 {
                        b2
                      }
                    }
                  },
                }
              }
            },
          },
        }
      `);

      s2Queries = [];
      let response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: true, if2: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "b1": 100,
              "id": "1",
            },
            Object {
              "b2": 200,
              "id": "2",
            },
            Object {
              "b1": 300,
              "id": "3",
            },
          ],
        }
      `);
      // Since we include the fields, S2 should have been asked to resolve the `b` field of our 3 entities.
      expect(s2Queries).toHaveLength(3);

      s2Queries = [];
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: false, if2: true });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      // If any one of the 2 condition is false, then we shouldn't query S2 at all (even if the other is true).
      expect(s2Queries).toHaveLength(0);

      s2Queries = [];
      response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: true, if2: false });
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "t": Array [
            Object {
              "id": "1",
            },
            Object {
              "id": "2",
            },
            Object {
              "id": "3",
            },
          ],
        }
      `);
      expect(s2Queries).toHaveLength(0);
    });

    describe('same element having both @skip and @include', () => {
      it('with constant conditions, neither excluding', async () => {
        const operation = parseOperation(schema, `
          {
            t {
              id
              ... on T1 @include(if: true) @skip(if: false) {
                b1
              }
            }
          }
        `);

        const queryPlan = queryPlanner.buildQueryPlan(operation);
        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                    ... on T1 @include(if: true) @skip(if: false) {
                      __typename
                      id
                    }
                  }
                }
              },
              Flatten(path: "t.@") {
                Fetch(service: "S2") {
                  {
                    ... on T1 {
                      ... on T1 {
                        __typename
                        id
                      }
                    }
                  } =>
                  {
                    ... on T1 @include(if: true) {
                      ... on T1 @skip(if: false) {
                        b1
                      }
                    }
                  }
                },
              },
            },
          }
        `);

        s2Queries = [];
        const response = await executePlan(queryPlan, operation, schema, serviceMap);
        expect(response.errors).toBeUndefined();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "t": Array [
              Object {
                "b1": 100,
                "id": "1",
              },
              Object {
                "id": "2",
              },
              Object {
                "b1": 300,
                "id": "3",
              },
            ],
          }
        `);
        expect(s2Queries).toHaveLength(2);
      });

      it('with constant conditions, both excluding', async () => {
        const operation = parseOperation(schema, `
          {
            t {
              id
              ... on T1 @include(if: false) @skip(if: true) {
                b1
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
                  __typename
                  id
                  ... on T1 @include(if: false) @skip(if: true) {
                    __typename
                    id
                  }
                }
              }
            },
          }
        `);

        s2Queries = [];
        const response = await executePlan(queryPlan, operation, schema, serviceMap);
        expect(response.errors).toBeUndefined();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "t": Array [
              Object {
                "id": "1",
              },
              Object {
                "id": "2",
              },
              Object {
                "id": "3",
              },
            ],
          }
        `);
        expect(s2Queries).toHaveLength(0);
      });

      it('with constant conditions, first excluding', async () => {
        const operation = parseOperation(schema, `
          {
            t {
              id
              ... on T1 @include(if: false) @skip(if: false) {
                b1
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
                  __typename
                  id
                  ... on T1 @include(if: false) @skip(if: false) {
                    __typename
                    id
                  }
                }
              }
            },
          }
        `);

        s2Queries = [];
        const response = await executePlan(queryPlan, operation, schema, serviceMap);
        expect(response.errors).toBeUndefined();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "t": Array [
              Object {
                "id": "1",
              },
              Object {
                "id": "2",
              },
              Object {
                "id": "3",
              },
            ],
          }
        `);
        expect(s2Queries).toHaveLength(0);
      });

      it('with constant conditions, second excluding', async () => {
        const operation = parseOperation(schema, `
          {
            t {
              id
              ... on T1 @include(if: true) @skip(if: true) {
                b1
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
                  __typename
                  id
                  ... on T1 @include(if: true) @skip(if: true) {
                    __typename
                    id
                  }
                }
              }
            },
          }
        `);

        s2Queries = [];
        const response = await executePlan(queryPlan, operation, schema, serviceMap);
        expect(response.errors).toBeUndefined();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "t": Array [
              Object {
                "id": "1",
              },
              Object {
                "id": "2",
              },
              Object {
                "id": "3",
              },
            ],
          }
        `);
        expect(s2Queries).toHaveLength(0);
      });

      it('with variable conditions', async () => {
        const operation = parseOperation(schema, `
          query ($if1: Boolean!, $if2: Boolean!) {
            t {
              id
              ... on T1 @include(if: $if1) @skip(if: $if2) {
                b1
              }
            }
          }
        `);

        const queryPlan = queryPlanner.buildQueryPlan(operation);
        // Ensures both @skip and @include have condition nodes.
        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                    ... on T1 @include(if: $if1) @skip(if: $if2) {
                      __typename
                      id
                    }
                  }
                }
              },
              Skip(if: $if2) {
                Include(if: $if1) {
                  Flatten(path: "t.@") {
                    Fetch(service: "S2") {
                      {
                        ... on T1 {
                          ... on T1 {
                            __typename
                            id
                          }
                        }
                      } =>
                      {
                        ... on T1 {
                          ... on T1 {
                            b1
                          }
                        }
                      }
                    },
                  }
                }
              },
            },
          }
        `);

        s2Queries = [];
        // With data included by both conditions
        let response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: true, if2: false });
        expect(response.errors).toBeUndefined();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "t": Array [
              Object {
                "b1": 100,
                "id": "1",
              },
              Object {
                "id": "2",
              },
              Object {
                "b1": 300,
                "id": "3",
              },
            ],
          }
        `);
        expect(s2Queries).toHaveLength(2);

        s2Queries = [];
        // With data excluded by one condition
        response = await executePlan(queryPlan, operation, schema, serviceMap, { if1: true, if2: true });
        expect(response.errors).toBeUndefined();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "t": Array [
              Object {
                "id": "1",
              },
              Object {
                "id": "2",
              },
              Object {
                "id": "3",
              },
            ],
          }
        `);
        expect(s2Queries).toHaveLength(0);
      });
    })
  })
});
