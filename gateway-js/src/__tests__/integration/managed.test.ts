import mockedEnv from 'mocked-env';

import { ApolloGateway, UplinkSupergraphManager } from '@apollo/gateway';
import { ApolloServer } from 'apollo-server';
import { ApolloServerPluginUsageReportingDisabled } from 'apollo-server-core';

import { nockAfterEach, nockBeforeEach } from '../nockAssertions';
import {
  mockSupergraphSdlRequestSuccess,
  graphRef,
  apiKey,
  mockSupergraphSdlRequest,
} from '../integration/nockMocks';
import { GraphQLError } from 'graphql';
import { getTestingSupergraphSdl } from '../execution-utils';

let gateway: ApolloGateway | undefined;
let server: ApolloServer | undefined;
let cleanUp: (() => void) | undefined;

beforeEach(() => {
  nockBeforeEach();
});

afterEach(async () => {
  nockAfterEach();

  if (server) {
    await server.stop();
    server = undefined;
  }

  if (gateway) {
    await gateway.stop();
    gateway = undefined;
  }

  if (cleanUp) {
    cleanUp();
    cleanUp = undefined;
  }
});

const logger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

describe('minimal gateway', () => {
  it('uses managed federation', async () => {
    cleanUp = mockedEnv({
      APOLLO_KEY: apiKey,
      APOLLO_GRAPH_REF: graphRef,
    });
    mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ });

    gateway = new ApolloGateway({ logger });
    server = new ApolloServer({
      gateway,
      plugins: [ApolloServerPluginUsageReportingDisabled()],
    });
    await server.listen({ port: 0 });
    expect(gateway.supergraphManager).toBeInstanceOf(UplinkSupergraphManager);
  });

  it('can set uplink URLs', async () => {
    cleanUp = mockedEnv({
      APOLLO_KEY: apiKey,
      APOLLO_GRAPH_REF: graphRef,
    });

    const uplinkEndpoint = 'https://example.com';
    mockSupergraphSdlRequestSuccess({ url: uplinkEndpoint });

    gateway = new ApolloGateway({ logger, uplinkEndpoints: [uplinkEndpoint] });
    server = new ApolloServer({
      gateway,
      plugins: [ApolloServerPluginUsageReportingDisabled()],
    });
    await server.listen({ port: 0 });
    expect(gateway.supergraphManager).toBeInstanceOf(UplinkSupergraphManager);
    const uplinkManager = gateway.supergraphManager as UplinkSupergraphManager;
    expect(uplinkManager.uplinkEndpoints).toEqual([uplinkEndpoint]);
  });

  it('can set uplink URLs via deprecated schemaConfigDeliveryEndpoint', async () => {
    cleanUp = mockedEnv({
      APOLLO_KEY: apiKey,
      APOLLO_GRAPH_REF: graphRef,
    });

    const schemaConfigDeliveryEndpoint = 'https://example.com';
    mockSupergraphSdlRequestSuccess({ url: schemaConfigDeliveryEndpoint });

    gateway = new ApolloGateway({ logger, schemaConfigDeliveryEndpoint });
    server = new ApolloServer({
      gateway,
      plugins: [ApolloServerPluginUsageReportingDisabled()],
    });
    await server.listen({ port: 0 });
    expect(gateway.supergraphManager).toBeInstanceOf(UplinkSupergraphManager);
    const uplinkManager = gateway.supergraphManager as UplinkSupergraphManager;
    expect(uplinkManager.uplinkEndpoints).toEqual([schemaConfigDeliveryEndpoint]);
  });
});

describe('Managed gateway with explicit UplinkSupergraphManager', () => {
  it('waits for supergraph schema to load', async () => {
    mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ });

    gateway = new ApolloGateway({
      logger,
      supergraphSdl: new UplinkSupergraphManager({
        apiKey,
        graphRef,
        logger,
        maxRetries: 0,
        pollIntervalInMs: 10,
      }),
    });
    await gateway.load();
  });

  it('invokes callback if uplink throws an error', async () => {
    mockSupergraphSdlRequest(null, /.*?apollographql.com/).reply(500);

    const supergraphSchema = getTestingSupergraphSdl();
    gateway = new ApolloGateway({
      logger,
      supergraphSdl: new UplinkSupergraphManager({
        apiKey,
        graphRef,
        logger,
        maxRetries: 0,
        pollIntervalInMs: 0,
        async onFailureToUpdateSupergraphSdl(
          this: UplinkSupergraphManager,
          { error }: { error: Error },
        ) {
          this.logger.info(error);
          return supergraphSchema;
        },
      }),
    });

    await gateway.load();
  });

  it.each(['x', '', ' ', 'type Query {hi: String}'])(
    'throws if invalid supergraph schema returned from callback: %p',
    async (schemaText) => {
      mockSupergraphSdlRequest(null, /.*?apollographql.com/).reply(500);

      gateway = new ApolloGateway({
        logger,
        supergraphSdl: new UplinkSupergraphManager({
          apiKey,
          graphRef,
          logger,
          maxRetries: 0,
          pollIntervalInMs: 0,
          async onFailureToUpdateSupergraphSdl(
            this: UplinkSupergraphManager,
            { error: _error }: { error: Error },
          ) {
            return schemaText;
          },
        }),
      });

      await expect(gateway.load()).rejects.toThrowError(GraphQLError);
    },
  );
});
