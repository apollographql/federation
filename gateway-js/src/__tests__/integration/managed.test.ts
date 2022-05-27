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

  it('fetches from provided `uplinkEndpoints`', async () => {
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

  it('fetches from (deprecated) provided `schemaConfigDeliveryEndpoint`', async () => {
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
    await expect(gateway.load()).resolves.not.toThrow();
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
        async onFailureToFetchSupergraphSdl(this: UplinkSupergraphManager, { error }) {
          this.logger.info(error);
          return supergraphSchema;
        },
      }),
    });

    await expect(gateway.load()).resolves.not.toThrow();
    expect(gateway.__testing().supergraphSdl).toBe(supergraphSchema);
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
          async onFailureToFetchSupergraphSdl(this: UplinkSupergraphManager, { error: _error }) {
            return schemaText;
          },
        }),
      });

      await expect(gateway.load()).rejects.toThrowError(GraphQLError);
    },
  );
});
