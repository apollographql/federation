import mockedEnv from 'mocked-env';

import { ApolloGateway, UplinkSupergraphManager } from '@apollo/gateway';

import { nockAfterEach, nockBeforeEach } from '../nockAssertions';
import { getTestingSupergraphSdl } from '../execution-utils';
import {
  mockSupergraphSdlRequestSuccess,
  mockCloudConfigUrl1,
  mockCloudConfigUrl2,
  mockCloudConfigUrl3,
  graphRef,
  apiKey,
  mockSupergraphSdlRequest,
} from '../integration/nockMocks';
import {
  DEFAULT_UPLINK_ENDPOINTS,
  UpdateSupergraphSdlFailureInputs,
} from '../../supergraphManagers/UplinkSupergraphManager/index';

let gateway: ApolloGateway | undefined;
const logger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

beforeEach(() => {
  nockBeforeEach();
});

afterEach(async () => {
  if (gateway) {
    await gateway.stop();
    gateway = undefined;
  }

  nockAfterEach();
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
          { error }: UpdateSupergraphSdlFailureInputs
        ) {
          this.logger.info(error);
          return supergraphSchema;
        },
      }),
    });

    await gateway.load();
  });

  // TODO: unskip when there are good error messages
  it.skip.each(['', ' '])(
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
            { error: _error }: UpdateSupergraphSdlFailureInputs
          ) {
            return schemaText;
          },
        }),
      });

      await expect(gateway.load()).rejects.toThrowErrorMatchingInlineSnapshot("Invalid supergraph schema");
    }
  );
});

describe('Managed gateway', () => {
  let cleanUp: (() => void) | undefined;

  afterEach(() => {
    if (cleanUp) {
      cleanUp();
      cleanUp = undefined;
    }
  });

  it('uses default uplink URLs', async () => {
    mockSupergraphSdlRequestSuccess({ url: /.*?apollographql.com/ });

    gateway = new ApolloGateway({ logger });
    await gateway.load({ apollo: { graphRef, key: apiKey } });

    expect(gateway.supergraphManager).toBeInstanceOf(UplinkSupergraphManager);
    const uplinkSupergraphManager: UplinkSupergraphManager = gateway.supergraphManager as UplinkSupergraphManager;
    expect(uplinkSupergraphManager.uplinkEndpoints).toEqual(DEFAULT_UPLINK_ENDPOINTS);
  });

  it('can set uplink URLs via config', async () => {
    cleanUp = mockedEnv({
      APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: 'https://env-delivery.com',
    });
    mockSupergraphSdlRequestSuccess();
    const uplinkEndpoints = [mockCloudConfigUrl1, mockCloudConfigUrl2, mockCloudConfigUrl3];

    gateway = new ApolloGateway({ uplinkEndpoints, logger });
    await gateway.load({ apollo: { graphRef, key: apiKey } });

    expect(gateway.supergraphManager).toBeInstanceOf(UplinkSupergraphManager);
    const uplinkSupergraphManager: UplinkSupergraphManager = gateway.supergraphManager as UplinkSupergraphManager;
    expect(uplinkSupergraphManager.uplinkEndpoints).toEqual(uplinkEndpoints);
  });

  it('can set uplink URLs via environment variable', async () => {
    const uplinkUrl = 'https://env-delivery.com';
    cleanUp = mockedEnv({
      APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: uplinkUrl,
    });
    mockSupergraphSdlRequestSuccess({ url: uplinkUrl });

    gateway = new ApolloGateway({ logger });
    await gateway.load({ apollo: { graphRef, key: apiKey } });

    expect(gateway.supergraphManager).toBeInstanceOf(UplinkSupergraphManager);
    expect((gateway.supergraphManager as UplinkSupergraphManager).uplinkEndpoints).toEqual([uplinkUrl]);
  });
});
