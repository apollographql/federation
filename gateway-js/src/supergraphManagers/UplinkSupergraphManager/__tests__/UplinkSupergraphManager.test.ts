import mockedEnv from 'mocked-env';

import { UplinkSupergraphManager } from '@apollo/gateway';
import nock from 'nock';
import { SUPERGRAPH_SDL_QUERY } from '../loadSupergraphSdlFromStorage';
import {
  nockBeforeEach,
  nockAfterEach,
} from '../../../__tests__/nockAssertions';

let cleanUp: (() => void) | undefined;

const logger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};
const apiKey = 'OU812';
const graphRef = 'graph@ref';

afterEach(async () => {
  if (cleanUp) {
    cleanUp();
    cleanUp = undefined;
  }
});

describe('UplinkSupergraphManager', () => {
  it('can be minimally constructed', () => {
    new UplinkSupergraphManager({ apiKey, graphRef });
  });

  describe('setting uplink URLs', () => {
    it('uses default uplink URLs', async () => {
      const manager = new UplinkSupergraphManager({ apiKey, graphRef, logger });

      expect(manager.uplinkEndpoints).toEqual(
        UplinkSupergraphManager.DEFAULT_UPLINK_ENDPOINTS,
      );
    });

    it('can set uplink URLs via config', async () => {
      cleanUp = mockedEnv({
        APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: 'https://env-delivery.com',
      });
      const uplinkEndpoints = [
        'https://config-delivery1.com',
        'https://config-delivery2.com',
      ];

      const manager = new UplinkSupergraphManager({
        apiKey,
        graphRef,
        uplinkEndpoints,
        logger,
      });

      expect(manager.uplinkEndpoints).toEqual(uplinkEndpoints);
    });

    it('can set uplink URLs via environment variable', async () => {
      const uplinkUrl = 'https://env-delivery.com';
      cleanUp = mockedEnv({
        APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: uplinkUrl,
      });

      const manager = new UplinkSupergraphManager({ apiKey, graphRef, logger });

      expect(manager.uplinkEndpoints).toEqual([uplinkUrl]);
    });
  });

  describe('fallbackPollIntervalInMs', () => {
    beforeEach(nockBeforeEach);
    afterEach(nockAfterEach);

    it('uses the provided fallback interval when Uplink provides a shorter interval', async () => {
      // These are the two interesting values for the test. We just want to make
      // sure that when the UplinkSupergraphManager receives 5s from Uplink that
      // it opts for the fallbackInterval since it's longer.
      const fallbackPollIntervalInMs = 15_000;
      // This is used in the mock response from Uplink below
      const minDelaySeconds = 5;

      const manager = new UplinkSupergraphManager({
        apiKey,
        graphRef,
        fallbackPollIntervalInMs,
      });

      mockUplinkResponse(minDelaySeconds);

      const { supergraphSdl, cleanup } = await manager.initialize({
        // These aren't really used for anything, just keeping TS happy
        update: jest.fn(),
        healthCheck: jest.fn(),
        getDataSource: jest.fn(),
      });
      cleanUp = cleanup;

      // validates we got a response from "Uplink" that we're happy with
      expect(supergraphSdl).toEqual('supergraph sdl');

      // validates that the fallback interval was used instead of the one from Uplink
      expect(manager['pollIntervalMs']).toEqual(fallbackPollIntervalInMs);
    });
  });
});

function mockUplinkResponse(minDelaySeconds: number) {
  nock('https://uplink.api.apollographql.com/')
    .post('/', {
      query: SUPERGRAPH_SDL_QUERY,
      variables: {
        ref: graphRef,
        apiKey,
        ifAfterId: null,
      },
    })
    .reply(200, {
      data: {
        __typename: 'Query',
        routerConfig: {
          __typename: 'RouterConfigResult',
          id: '123',
          supergraphSdl: 'supergraph sdl',
          minDelaySeconds,
        },
      },
    });
}
