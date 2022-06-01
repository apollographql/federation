import mockedEnv from 'mocked-env';

import { UplinkSupergraphManager } from '@apollo/gateway';

import { DEFAULT_UPLINK_ENDPOINTS } from '..';

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

      expect(manager.uplinkEndpoints).toEqual(DEFAULT_UPLINK_ENDPOINTS);
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
});
