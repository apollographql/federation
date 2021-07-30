import nock from 'nock';
import { fetch } from 'apollo-server-env';
import { Logger } from 'apollo-server-types';
import { ApolloGateway, GCS_RETRY_COUNT, getDefaultFetcher } from '../..';
import {
  mockServiceHealthCheckSuccess,
  mockServiceHealthCheck,
  mockStorageSecretSuccess,
  mockStorageSecret,
  mockCompositionConfigLinkSuccess,
  mockCompositionConfigLink,
  mockCompositionConfigsSuccess,
  mockCompositionConfigs,
  mockImplementingServicesSuccess,
  mockImplementingServices,
  mockRawPartialSchemaSuccess,
  mockRawPartialSchema,
  apiKeyHash,
  graphId,
} from './legacyNockMocks';

export interface MockService {
  gcsDefinitionPath: string;
  partialSchemaPath: string;
  url: string;
  sdl: string;
}

const service: MockService = {
  gcsDefinitionPath: 'service-definition.json',
  partialSchemaPath: 'accounts-partial-schema.json',
  url: 'http://localhost:4001',
  sdl: `#graphql
    extend type Query {
      me: User
      everyone: [User]
    }
    "This is my User"
    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }
  `,
};

const updatedService: MockService = {
  gcsDefinitionPath: 'updated-service-definition.json',
  partialSchemaPath: 'updated-accounts-partial-schema.json',
  url: 'http://localhost:4002',
  sdl: `#graphql
    extend type Query {
      me: User
      everyone: [User]
    }
    "This is my updated User"
    type User @key(fields: "id") {
      id: ID!
      name: String
      username: String
    }
  `,
};

let fetcher: typeof fetch;
let logger: Logger;
let gateway: ApolloGateway | null = null;

beforeEach(() => {
  if (!nock.isActive()) nock.activate();

  fetcher = getDefaultFetcher().defaults({
    retry: {
      retries: GCS_RETRY_COUNT,
      minTimeout: 0,
      maxTimeout: 0,
    },
  });

  const warn = jest.fn();
  const debug = jest.fn();
  const error = jest.fn();
  const info = jest.fn();

  logger = {
    warn,
    debug,
    error,
    info,
  };
});

afterEach(async () => {
  expect(nock.isDone()).toBeTruthy();
  nock.cleanAll();
  nock.restore();
  if (gateway) {
    await gateway.stop();
    gateway = null;
  }
});

it('Extracts service definitions from remote storage', async () => {
  mockStorageSecretSuccess();
  mockCompositionConfigLinkSuccess();
  mockCompositionConfigsSuccess([service]);
  mockImplementingServicesSuccess(service);
  mockRawPartialSchemaSuccess(service);

  gateway = new ApolloGateway({ logger, schemaConfigDeliveryEndpoint: null });

  await gateway.load({
    apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
  });
  expect(gateway.schema!.getType('User')!.description).toBe('This is my User');
});

function failNTimes(n: number, fn: () => nock.Interceptor) {
  for (let i = 0; i < n; i++) {
    fn().reply(500);
  }
}

it(`Retries GCS (up to ${GCS_RETRY_COUNT} times) on failure for each request and succeeds`, async () => {
  failNTimes(GCS_RETRY_COUNT, mockStorageSecret);
  mockStorageSecretSuccess();

  failNTimes(GCS_RETRY_COUNT, mockCompositionConfigLink);
  mockCompositionConfigLinkSuccess();

  failNTimes(GCS_RETRY_COUNT, mockCompositionConfigs);
  mockCompositionConfigsSuccess([service]);

  failNTimes(GCS_RETRY_COUNT, () => mockImplementingServices(service));
  mockImplementingServicesSuccess(service);

  failNTimes(GCS_RETRY_COUNT, () => mockRawPartialSchema(service));
  mockRawPartialSchemaSuccess(service);

  gateway = new ApolloGateway({
    fetcher,
    logger,
    schemaConfigDeliveryEndpoint: null,
  });

  await gateway.load({
    apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
  });
  expect(gateway.schema!.getType('User')!.description).toBe('This is my User');
});

describe('Managed mode', () => {
  it('Performs health checks to downstream services on load', async () => {
    mockStorageSecretSuccess();
    mockCompositionConfigLinkSuccess();
    mockCompositionConfigsSuccess([service]);
    mockImplementingServicesSuccess(service);
    mockRawPartialSchemaSuccess(service);

    mockServiceHealthCheckSuccess(service);

    gateway = new ApolloGateway({
      serviceHealthCheck: true,
      logger,
      schemaConfigDeliveryEndpoint: null,
    });

    await gateway.load({
      apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
    });
    expect(gateway.schema!.getType('User')!.description).toBe(
      'This is my User',
    );
  });

  it('Rejects on initial load when health check fails', async () => {
    mockStorageSecretSuccess();
    mockCompositionConfigLinkSuccess();
    mockCompositionConfigsSuccess([service]);
    mockImplementingServicesSuccess(service);
    mockRawPartialSchemaSuccess(service);

    mockServiceHealthCheck(service).reply(500);

    const gateway = new ApolloGateway({
      serviceHealthCheck: true,
      logger,
      schemaConfigDeliveryEndpoint: null,
    });

    await expect(
      gateway.load({
        apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "The gateway did not update its schema due to failed service health checks. The gateway will continue to operate with the previous schema and reattempt updates. The following error occurred during the health check:
            [accounts]: 500: Internal Server Error"
          `);
  });

  it('Preserves original schema when health check fails', async () => {
    mockStorageSecretSuccess();
    mockCompositionConfigLinkSuccess();
    mockCompositionConfigsSuccess([service]);
    mockImplementingServicesSuccess(service);
    mockRawPartialSchemaSuccess(service);
    mockServiceHealthCheckSuccess(service);

    // Update
    mockStorageSecretSuccess();
    mockCompositionConfigLinkSuccess();
    mockCompositionConfigsSuccess([updatedService]);
    mockImplementingServicesSuccess(updatedService);
    mockRawPartialSchemaSuccess(updatedService);
    mockServiceHealthCheck(updatedService).reply(500);

    let resolve: () => void;
    const schemaChangeBlocker = new Promise<void>((res) => (resolve = res));

    gateway = new ApolloGateway({
      serviceHealthCheck: true,
      logger,
      schemaConfigDeliveryEndpoint: null,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    // @ts-ignore for testing purposes, we'll call the original `updateSchema`
    // function from our mock. The first call should mimic original behavior,
    // but the second call needs to handle the PromiseRejection. Typically for tests
    // like these we would leverage the `gateway.onSchemaChange` callback to drive
    // the test, but in this case, that callback isn't triggered when the update
    // fails (as expected) so we get creative with the second mock as seen below.
    const original = gateway.updateSchema;
    const mockUpdateSchema = jest
      .fn()
      .mockImplementationOnce(async () => {
        await original.apply(gateway);
      })
      .mockImplementationOnce(async () => {
        // mock the first poll and handle the error which would otherwise be caught
        // and logged from within the `pollServices` class method
        try {
          await original.apply(gateway);
        } catch (e) {
          var err = e;
        }

        expect(err.message).toMatchInlineSnapshot(`
          "The gateway did not update its schema due to failed service health checks. The gateway will continue to operate with the previous schema and reattempt updates. The following error occurred during the health check:
          [accounts]: 500: Internal Server Error"
        `);
        // finally resolve the promise which drives this test
        resolve();
      });

    // @ts-ignore for testing purposes, replace the `updateSchema`
    // function on the gateway with our mock
    gateway.updateSchema = mockUpdateSchema;

    // load the gateway as usual
    await gateway.load({
      apollo: { keyHash: apiKeyHash, graphId, graphVariant: 'current' },
    });

    expect(gateway.schema!.getType('User')!.description).toBe(
      'This is my User',
    );

    await schemaChangeBlocker;

    // At this point, the mock update should have been called but the schema
    // should not have updated to the new one.
    expect(mockUpdateSchema.mock.calls.length).toBe(2);
    expect(gateway.schema!.getType('User')!.description).toBe(
      'This is my User',
    );
  });
});
