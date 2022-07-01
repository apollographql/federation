import {
  GraphQLSchemaModule,
  GraphQLResolverMap,
  GraphQLSchemaValidationError,
} from '@apollo/subgraph/src/schema-helper';
import { GraphQLRequest, GraphQLExecutionResult } from 'apollo-server-types';
import type { Logger } from '@apollo/utils.logger';
import { buildSubgraphSchema } from '@apollo/subgraph';
import {
  executeQueryPlan,
  buildOperationContext,
} from '@apollo/gateway';
import { QueryPlan, QueryPlanner } from '@apollo/query-planner';
import { LocalGraphQLDataSource } from '../datasources/LocalGraphQLDataSource';
import { mergeDeep } from '@apollo/client/utilities';

import { queryPlanSerializer, astSerializer } from 'apollo-federation-integration-testsuite';
import gql from 'graphql-tag';
import { fixtures } from 'apollo-federation-integration-testsuite';
import { composeServices } from '@apollo/composition';
import { buildSchema, operationFromDocument, ServiceDefinition } from '@apollo/federation-internals';

const prettyFormat = require('pretty-format');

export type ServiceDefinitionModule = ServiceDefinition & GraphQLSchemaModule;

export function overrideResolversInService(
  module: ServiceDefinitionModule,
  resolvers: GraphQLResolverMap,
): ServiceDefinitionModule {
  return {
    name: module.name,
    typeDefs: module.typeDefs,
    resolvers: mergeDeep(module.resolvers, resolvers),
  };
}

export async function execute(
  request: GraphQLRequest,
  services: ServiceDefinitionModule[] = fixtures,
  logger: Logger = console,
): Promise<GraphQLExecutionResult & { queryPlan: QueryPlan }> {
  const serviceMap = Object.fromEntries(
    services.map(({ name, typeDefs, resolvers }) => {
      return [
        name,
        new LocalGraphQLDataSource(
          buildSubgraphSchema([{ typeDefs, resolvers }]),
        ),
      ] as [string, LocalGraphQLDataSource];
    }),
  );

  const { schema, queryPlanner } = getFederatedTestingSchema(services);

  const apiSchema = schema.toAPISchema();
  const operationDocument = gql`${request.query}`;
  const operation = operationFromDocument(apiSchema, operationDocument);
  const queryPlan = queryPlanner.buildQueryPlan(operation);

  const operationContext = buildOperationContext({
    schema: apiSchema.toGraphQLJSSchema(),
    operationDocument,
  });

  const result = await executeQueryPlan(
    queryPlan,
    serviceMap,
     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
     // @ts-ignore
    {
      cache: undefined as any,
      context: {},
      request,
      logger
    },
    operationContext,
    schema.toGraphQLJSSchema(),
  );

  return { ...result, queryPlan };
}

export function buildLocalService(modules: GraphQLSchemaModule[]) {
  const schema = buildSubgraphSchema(modules);
  return new LocalGraphQLDataSource(schema);
}

export function getFederatedTestingSchema(services: ServiceDefinitionModule[] = fixtures) {
  const compositionResult = composeServices(services);
  if (compositionResult.errors) {
    throw new GraphQLSchemaValidationError(compositionResult.errors);
  }

  const queryPlanner = new QueryPlanner(compositionResult.schema, { exposeDocumentNodeInFetchNode: false} );
  const schema = buildSchema(compositionResult.supergraphSdl);

  const serviceMap = Object.fromEntries(
    services.map((service) => [
      service.name,
      buildLocalService([service]),
    ]),
  );
  return { serviceMap, schema, queryPlanner };
}

export function getTestingSupergraphSdl(services: typeof fixtures = fixtures) {
  const compositionResult = composeServices(services);
  if (!compositionResult.errors) {
    return compositionResult.supergraphSdl;
  }
  throw new Error(`Testing fixtures don't compose properly!\nCauses:\n${compositionResult.errors.join('\n\n')}`);
}

export function wait(ms: number, toResolveTo?: any) {
  return new Promise((r) => setTimeout(() => r(toResolveTo), ms));
}

export function printPlan(queryPlan: QueryPlan): string {
  return prettyFormat(queryPlan, {
    plugins: [queryPlanSerializer, astSerializer],
  });
}
