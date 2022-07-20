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
import { getTestingSupergraphSdl } from '../execution-utils';

let gateway: ApolloGateway | undefined;
let server: ApolloServer | undefined;
let cleanUp: (() => void) | undefined;

beforeEach(() => {
  nockBeforeEach();
});

afterEach(async () => {
  if (server) {
    await server.stop();
    server = undefined;
  }

  if (gateway) {
    await gateway.stop();
    gateway = undefined;
  }

  nockAfterEach();

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
    expect(uplinkManager.uplinkEndpoints).toEqual([
      schemaConfigDeliveryEndpoint,
    ]);
  });

  it('supports a custom fetcher', async () => {
    // fetcher: (...args) => {
    //   calls++;
    //   return fetcher(...args);
    // },

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
    expect(uplinkManager.uplinkEndpoints).toEqual([
      schemaConfigDeliveryEndpoint,
    ]);
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
      }),
    });
    await expect(gateway.load()).resolves.not.toThrow();
  });

  it('invokes callback if uplink throws an error during init', async () => {
    mockSupergraphSdlRequest(null, /.*?apollographql.com/).reply(500);

    const supergraphSchema = getTestingSupergraphSdl();
    let hasFired;
    gateway = new ApolloGateway({
      logger,
      supergraphSdl: new UplinkSupergraphManager({
        apiKey,
        graphRef,
        logger,
        maxRetries: 0,
        async onFailureToFetchSupergraphSdlDuringInit() {
          hasFired = true;
          return supergraphSchema;
        },
      }),
    });

    await expect(gateway.load()).resolves.not.toThrow();
    expect(gateway.__testing().supergraphSdl).toBe(supergraphSchema);
    expect(hasFired).toBeTruthy();
  });

  it('invokes callback if uplink throws an error after init', async () => {
    // This is kinda wonky to read: we're responding the first time with success, then the next fetch should fail
    mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ })
      .post('/')
      .reply(500);

    const supergraphSchema = getTestingSupergraphSdl();
    let hasFired;
    let uplinkManager = new UplinkSupergraphManager({
      apiKey,
      graphRef,
      logger,
      maxRetries: 0,
      async onFailureToFetchSupergraphSdlAfterInit() {
        hasFired = true;
        return supergraphSchema;
      },
    });
    // Set pollIntervalMs lower than the typically allowed value so we don't wait 10s between polling
    uplinkManager['pollIntervalMs'] = 0;

    gateway = new ApolloGateway({
      logger,
      supergraphSdl: uplinkManager,
    });

    await expect(gateway.load()).resolves.not.toThrow();
    expect(hasFired).toBeFalsy();

    await uplinkManager.nextFetch();

    expect(hasFired).toBeTruthy();
  });

  it.each([
    ['x', 'Syntax Error: Unexpected Name "x".'],
    ['', 'Invalid supergraph schema supplied during initialization.'],
    [' ', 'Syntax Error: Unexpected <EOF>.'],
    ['type Query {hi: String}', 'Invalid supergraph: must be a core schema'],
  ])(
    'throws if invalid supergraph schema returned from callback during init: %p',
    async (schemaText, expectedMessage) => {
      mockSupergraphSdlRequest(null, /.*?apollographql.com/).reply(500);

      gateway = new ApolloGateway({
        logger,
        supergraphSdl: new UplinkSupergraphManager({
          apiKey,
          graphRef,
          logger,
          maxRetries: 0,
          async onFailureToFetchSupergraphSdlDuringInit() {
            return schemaText;
          },
        }),
      });

      await expect(gateway.load()).rejects.toThrowError(expectedMessage);
    },
  );

  it.each([
    ['x', 'Syntax Error: Unexpected Name "x".'],
    [' ', 'Syntax Error: Unexpected <EOF>.'],
    ['type Query {hi: String}', 'Invalid supergraph: must be a core schema'],
  ])(
    'throws if invalid supergraph schema returned from callback after init: %p',
    async (schemaText, expectedMessage) => {
      // This is kinda wonky to read: we're responding the first time with success, then the next fetch should fail
      mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ })
        .post('/')
        .reply(500);

      let hasFired;
      let uplinkManager = new UplinkSupergraphManager({
        apiKey,
        graphRef,
        logger,
        maxRetries: 0,
        async onFailureToFetchSupergraphSdlAfterInit() {
          hasFired = true;
          return schemaText;
        },
      });
      // Set pollIntervalMs lower than the typically allowed value so we don't wait 10s between polling
      uplinkManager['pollIntervalMs'] = 0;

      gateway = new ApolloGateway({
        logger,
        supergraphSdl: uplinkManager
      });

      await expect(gateway.load()).resolves.not.toThrow();
      expect(hasFired).toBeFalsy();

      await uplinkManager.nextFetch();

      expect(hasFired).toBeTruthy();
      expect(logger.error).toBeCalledWith(
        `UplinkSupergraphManager failed to update supergraph with the following error: ${expectedMessage}`,
      );
    },
  );

  it.each([null, ''])(
    'uses existing supergraph schema if false-y value returned from callback after init: %p',
    async (schemaText) => {
      // This is kinda wonky to read: we're responding the first time with success, then the next fetch should fail
      mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ })
        .post('/')
        .reply(500);

      let hasFired;
      let uplinkManager = new UplinkSupergraphManager({
        apiKey,
        graphRef,
        logger,
        maxRetries: 0,

        async onFailureToFetchSupergraphSdlAfterInit() {
          hasFired = true;
          return schemaText;
        },
      });
      // Set pollIntervalMs lower than the typically allowed value so we don't wait 10s between polling
      uplinkManager['pollIntervalMs'] = 0;

      gateway = new ApolloGateway({
        logger,
        supergraphSdl: uplinkManager,
      });

      await expect(gateway.load()).resolves.not.toThrow();
      expect(hasFired).toBeFalsy();

      await uplinkManager.nextFetch();

      expect(hasFired).toBeTruthy();

      const supergraphSchema = getTestingSupergraphSdl();
      expect(gateway.__testing().supergraphSdl).toBe(supergraphSchema);
    },
  );
});
