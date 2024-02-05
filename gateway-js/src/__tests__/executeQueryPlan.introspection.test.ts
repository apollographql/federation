import gql from 'graphql-tag';
import {
  getFederatedTestingSchema,
  ServiceDefinitionModule,
} from './execution-utils';
import {
  Operation,
  parseOperation,
  Schema,
} from '@apollo/federation-internals';
import { QueryPlan } from '@apollo/query-planner';
import { LocalGraphQLDataSource } from '../datasources';
import {
  GatewayExecutionResult,
  GatewayGraphQLRequestContext,
} from '@apollo/server-gateway-interface';
import { buildOperationContext } from '../operationContext';
import { executeQueryPlan } from '../executeQueryPlan';

function buildRequestContext(
  variables: Record<string, any>,
): GatewayGraphQLRequestContext {
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
    operationDocument: gql`
      ${operation.toString()}
    `,
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

describe('handling of introspection queries', () => {
  const typeDefs: ServiceDefinitionModule[] = [
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
    },
  ];
  const { serviceMap, schema, queryPlanner } =
    getFederatedTestingSchema(typeDefs);

  it('it handles aliases on introspection fields', async () => {
    const operation = parseOperation(
      schema,
      `
      {
        myAlias: __type(name: "T1") {
          kind
          name
        }
      }
    `,
    );

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    const response = await executePlan(
      queryPlan,
      operation,
      schema,
      serviceMap,
    );
    expect(response.errors).toBeUndefined();
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "myAlias": Object {
          "kind": "OBJECT",
          "name": "T1",
        },
      }
    `);
  });

  it('it handles aliases inside introspection fields', async () => {
    const operation = parseOperation(
      schema,
      `
      {
        __type(name: "T1") {
          myKind: kind
          name
        }
      }
    `,
    );

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    const response = await executePlan(
      queryPlan,
      operation,
      schema,
      serviceMap,
    );
    expect(response.errors).toBeUndefined();
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "__type": Object {
          "myKind": "OBJECT",
          "name": "T1",
        },
      }
    `);
  });

  it('it handles variables passed to introspection fields', async () => {
    const operation = parseOperation(
      schema,
      `
      query ($name: String!) {
        __type(name: $name) {
          kind
          name
        }
      }
    `,
    );

    const queryPlan = queryPlanner.buildQueryPlan(operation);
    const response = await executePlan(
      queryPlan,
      operation,
      schema,
      serviceMap,
      { name: 'T1' },
    );
    expect(response.errors).toBeUndefined();
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "__type": Object {
          "kind": "OBJECT",
          "name": "T1",
        },
      }
    `);
  });
});
