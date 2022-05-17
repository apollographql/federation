import mockedEnv from 'mocked-env';

import { ApolloGateway, UplinkFetcher } from '@apollo/gateway';
import { ApolloServer } from 'apollo-server';
import { ApolloServerPluginUsageReportingDisabled } from 'apollo-server-core';

import { nockAfterEach, nockBeforeEach } from '../nockAssertions';
import { mockSupergraphSdlRequestSuccess, graphRef, apiKey } from '../integration/nockMocks';

beforeEach(() => {
  nockBeforeEach();
});

afterEach(async () => {
  nockAfterEach();
});

const logger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

describe('minimal gateway', () => {
  let gateway: ApolloGateway | undefined;
  let server: ApolloServer | undefined;
  let cleanUp: (() => void) | undefined;

  afterEach(async () => {
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

  it('uses managed federation', async () => {
    cleanUp = mockedEnv({
      APOLLO_KEY: apiKey,
      APOLLO_GRAPH_REF: graphRef,
    });
    mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ });

    gateway = new ApolloGateway({ logger });
    server = new ApolloServer({ gateway, plugins: [ApolloServerPluginUsageReportingDisabled()] });
    await server.listen({ port: 0 });
    expect(gateway.supergraphManager).toBeInstanceOf(UplinkFetcher);
  });
});
