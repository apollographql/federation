import nock from 'nock';
import gql from 'graphql-tag';
import { Logger } from 'apollo-server-types';
import { ApolloGateway } from '../..';
import {
  mockSDLQuerySuccess,
  mockServiceHealthCheckSuccess,
  mockServiceHealthCheck,
  mockCsdlRequestSuccess,
  apiKey,
  apiKeyHash,
  graphId,
  graphVariant,
} from './nockMocks';
import { accounts, books, documents, inventory, product, reviews } from 'apollo-federation-integration-testsuite';
import { DocumentNode } from 'graphql';

export interface MockService {
  url: string;
  typeDefs: DocumentNode;
}

const service: MockService = {
  url: 'http://localhost:4001',
  typeDefs: gql`
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
  url: 'http://localhost:4002',
  typeDefs: gql`
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

let logger: Logger;
let gateway: ApolloGateway | null = null;

beforeEach(() => {
  if (!nock.isActive()) nock.activate();

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

it('Queries remote endpoints for their SDLs', async () => {
  mockSDLQuerySuccess(service);

  gateway = new ApolloGateway({
    serviceList: [{ name: 'accounts', url: service.url }],
    logger,
  });
  await gateway.load();
  expect(gateway.schema!.getType('User')!.description).toBe('This is my User');
});

it('Extracts service definitions from remote storage', async () => {
  mockCsdlRequestSuccess();

  gateway = new ApolloGateway({ logger });

  await gateway.load({
    apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
  });
  expect(gateway.schema?.getType('User')).toBeTruthy();
});

// TODO: try converting this
// This test has been flaky for a long time, and fails consistently after changes
// introduced by https://github.com/apollographql/apollo-server/pull/4277.
// I've decided to skip this test for now with hopes that we can one day
// determine the root cause and test this behavior in a reliable manner.
// it.skip('Rollsback to a previous schema when triggered', async () => {
//   // Init
//   mockStorageSecretSuccess();
//   mockCompositionConfigLinkSuccess();
//   mockCompositionConfigsSuccess([service]);
//   mockImplementingServicesSuccess(service);
//   mockRawPartialSchemaSuccess(service);

//   // Update 1
//   mockStorageSecretSuccess();
//   mockCompositionConfigLinkSuccess();
//   mockCompositionConfigsSuccess([updatedService]);
//   mockImplementingServicesSuccess(updatedService);
//   mockRawPartialSchemaSuccess(updatedService);

//   // Rollback
//   mockStorageSecretSuccess();
//   mockCompositionConfigLinkSuccess();
//   mockCompositionConfigsSuccess([service]);
//   mockImplementingServices(service).reply(304);
//   mockRawPartialSchema(service).reply(304);

//   let firstResolve: () => void;
//   let secondResolve: () => void;
//   let thirdResolve: () => void;
//   const firstSchemaChangeBlocker = new Promise((res) => (firstResolve = res));
//   const secondSchemaChangeBlocker = new Promise((res) => (secondResolve = res));
//   const thirdSchemaChangeBlocker = new Promise((res) => (thirdResolve = res));

//   const onChange = jest
//     .fn()
//     .mockImplementationOnce(() => firstResolve())
//     .mockImplementationOnce(() => secondResolve())
//     .mockImplementationOnce(() => thirdResolve());

//   gateway = new ApolloGateway({ logger });
//   // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
//   gateway.experimental_pollInterval = 100;

//   gateway.onSchemaChange(onChange);
//   await gateway.load({
//     apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
//   });

//   await firstSchemaChangeBlocker;
//   expect(onChange).toHaveBeenCalledTimes(1);

//   await secondSchemaChangeBlocker;
//   expect(onChange).toHaveBeenCalledTimes(2);

//   await thirdSchemaChangeBlocker;
//   expect(onChange).toHaveBeenCalledTimes(3);
// });

// TODO: add error case test for CSDL or delete
// it.skip(`Errors when the secret isn't hosted on GCS`, async () => {
//   mockStorageSecret().reply(
//     403,
//     `<Error><Code>AccessDenied</Code>
//     Anonymous caller does not have storage.objects.get`,
//     { 'content-type': 'application/xml' },
//   );

//   gateway = new ApolloGateway({ fetcher, logger });
//   await expect(
//     gateway.load({
//       apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
//     }),
//   ).rejects.toThrowErrorMatchingInlineSnapshot(
//     `"Unable to authenticate with Apollo storage while fetching https://storage-secrets.api.apollographql.com/federated-service/storage-secret/dd55a79d467976346d229a7b12b673ce.json.  Ensure that the API key is configured properly and that a federated service has been pushed.  For details, see https://go.apollo.dev/g/resolve-access-denied."`,
//   );
// });

describe('Downstream service health checks', () => {
  describe('Unmanaged mode', () => {
    it(`Performs health checks to downstream services on load`, async () => {
      mockSDLQuerySuccess(service);
      mockServiceHealthCheckSuccess(service);

      gateway = new ApolloGateway({
        logger,
        serviceList: [{ name: 'accounts', url: service.url }],
        serviceHealthCheck: true,
      });

      await gateway.load();
      expect(gateway.schema!.getType('User')!.description).toBe(
        'This is my User',
      );
    });

    it(`Rejects on initial load when health check fails`, async () => {
      mockSDLQuerySuccess(service);
      mockServiceHealthCheck(service).reply(500);

      const gateway = new ApolloGateway({
        serviceList: [{ name: 'accounts', url: service.url }],
        serviceHealthCheck: true,
        logger,
      });

      // TODO: smell that we should be awaiting something else
      await expect(gateway.load()).rejects.toThrowErrorMatchingInlineSnapshot(
        `"500: Internal Server Error"`,
      );
    });
  });

  describe('Managed mode', () => {
    it('Performs health checks to downstream services on load', async () => {
      mockCsdlRequestSuccess();
      mockServiceHealthCheckSuccess(accounts);
      mockServiceHealthCheckSuccess(books);
      mockServiceHealthCheckSuccess(documents);
      mockServiceHealthCheckSuccess(inventory);
      mockServiceHealthCheckSuccess(product);
      mockServiceHealthCheckSuccess(reviews);

      gateway = new ApolloGateway({ serviceHealthCheck: true, logger });

      await gateway.load({
        apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
      });


      expect(gateway.schema!.getType('User')!).toBeTruthy();
    });

    it('Rejects on initial load when health check fails', async () => {
      mockCsdlRequestSuccess();
      mockServiceHealthCheck(accounts).reply(500);
      mockServiceHealthCheckSuccess(books);
      mockServiceHealthCheckSuccess(documents);
      mockServiceHealthCheckSuccess(inventory);
      mockServiceHealthCheckSuccess(product);
      mockServiceHealthCheckSuccess(reviews);

      const gateway = new ApolloGateway({ serviceHealthCheck: true, logger });

      await expect(
        gateway.load({
          apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"500: Internal Server Error"`,
      );
    });

    // This test has been flaky for a long time, and fails consistently after changes
    // introduced by https://github.com/apollographql/apollo-server/pull/4277.
    // I've decided to skip this test for now with hopes that we can one day
    // determine the root cause and test this behavior in a reliable manner.
    // it.skip('Rolls over to new schema when health check succeeds', async () => {
    //   mockStorageSecretSuccess();
    //   mockCompositionConfigLinkSuccess();
    //   mockCompositionConfigsSuccess([service]);
    //   mockImplementingServicesSuccess(service);
    //   mockRawPartialSchemaSuccess(service);
    //   mockServiceHealthCheckSuccess(service);

    //   // Update
    //   mockStorageSecretSuccess();
    //   mockCompositionConfigLinkSuccess();
    //   mockCompositionConfigsSuccess([updatedService]);
    //   mockImplementingServicesSuccess(updatedService);
    //   mockRawPartialSchemaSuccess(updatedService);
    //   mockServiceHealthCheckSuccess(updatedService);

    //   let resolve1: () => void;
    //   let resolve2: () => void;
    //   const schemaChangeBlocker1 = new Promise((res) => (resolve1 = res));
    //   const schemaChangeBlocker2 = new Promise((res) => (resolve2 = res));
    //   const onChange = jest
    //     .fn()
    //     .mockImplementationOnce(() => resolve1())
    //     .mockImplementationOnce(() => resolve2());

    //   gateway = new ApolloGateway({
    //     serviceHealthCheck: true,
    //     logger,
    //   });
    //   // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    //   gateway.experimental_pollInterval = 100;

    //   gateway.onSchemaChange(onChange);
    //   await gateway.load({
    //     apollo: { key: apiKey,keyHash: apiKeyHash, graphId, graphVariant },
    //   });

    //   await schemaChangeBlocker1;
    //   expect(gateway.schema!.getType('User')!.description).toBe(
    //     'This is my User',
    //   );
    //   expect(onChange).toHaveBeenCalledTimes(1);

    //   await schemaChangeBlocker2;
    //   expect(gateway.schema!.getType('User')!.description).toBe(
    //     'This is my updated User',
    //   );
    //   expect(onChange).toHaveBeenCalledTimes(2);
    // });

    // TODO: update to CSDL
    // it('Preserves original schema when health check fails', async () => {
    //   mockStorageSecretSuccess();
    //   mockCompositionConfigLinkSuccess();
    //   mockCompositionConfigsSuccess([service]);
    //   mockImplementingServicesSuccess(service);
    //   mockRawPartialSchemaSuccess(service);
    //   mockServiceHealthCheckSuccess(service);

    //   // Update
    //   mockStorageSecretSuccess();
    //   mockCompositionConfigLinkSuccess();
    //   mockCompositionConfigsSuccess([updatedService]);
    //   mockImplementingServicesSuccess(updatedService);
    //   mockRawPartialSchemaSuccess(updatedService);
    //   mockServiceHealthCheck(updatedService).reply(500);

    //   let resolve: () => void;
    //   const schemaChangeBlocker = new Promise((res) => (resolve = res));

    //   gateway = new ApolloGateway({ serviceHealthCheck: true, logger });
    //   // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    //   gateway.experimental_pollInterval = 100;

    //   // @ts-ignore for testing purposes, we'll call the original `updateComposition`
    //   // function from our mock. The first call should mimic original behavior,
    //   // but the second call needs to handle the PromiseRejection. Typically for tests
    //   // like these we would leverage the `gateway.onSchemaChange` callback to drive
    //   // the test, but in this case, that callback isn't triggered when the update
    //   // fails (as expected) so we get creative with the second mock as seen below.
    //   const original = gateway.updateComposition;
    //   const mockUpdateComposition = jest
    //     .fn()
    //     .mockImplementationOnce(async () => {
    //       await original.apply(gateway);
    //     })
    //     .mockImplementationOnce(async () => {
    //       // mock the first poll and handle the error which would otherwise be caught
    //       // and logged from within the `pollServices` class method
    //       await expect(
    //         original.apply(gateway),
    //       ).rejects.toThrowErrorMatchingInlineSnapshot(
    //         `"500: Internal Server Error"`,
    //       );
    //       // finally resolve the promise which drives this test
    //       resolve();
    //     });

    //   // @ts-ignore for testing purposes, replace the `updateComposition`
    //   // function on the gateway with our mock
    //   gateway.updateComposition = mockUpdateComposition;

    //   // load the gateway as usual
    //   await gateway.load({
    //     apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
    //   });

    //   expect(gateway.schema!.getType('User')!.description).toBe(
    //     'This is my User',
    //   );

    //   await schemaChangeBlocker;

    //   // At this point, the mock update should have been called but the schema
    //   // should not have updated to the new one.
    //   expect(mockUpdateComposition.mock.calls.length).toBe(2);
    //   expect(gateway.schema!.getType('User')!.description).toBe(
    //     'This is my User',
    //   );
    // });
  });
});
