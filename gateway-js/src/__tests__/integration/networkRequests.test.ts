import nock from 'nock';
import gql from 'graphql-tag';
import { DocumentNode, GraphQLObjectType, GraphQLSchema } from 'graphql';
import { Logger } from 'apollo-server-types';
import { ApolloGateway } from '../..';
import {
  mockSDLQuerySuccess,
  mockServiceHealthCheckSuccess,
  mockAllServicesHealthCheckSuccess,
  mockServiceHealthCheck,
  mockCsdlRequestSuccess,
  apiKey,
  apiKeyHash,
  graphId,
  graphVariant,
  mockCsdlRequest,
} from './nockMocks';
import {
  accounts,
  books,
  documents,
  fixturesWithUpdate,
  inventory,
  product,
  reviews,
} from 'apollo-federation-integration-testsuite';
import { getTestingCsdl } from '../execution-utils';

export interface MockService {
  name: string;
  url: string;
  typeDefs: DocumentNode;
}

const simpleService: MockService = {
  name: 'accounts',
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

const loadConfig = {
  apollo: { key: apiKey, keyHash: apiKeyHash, graphId, graphVariant },
};

function getRootQueryFields(schema?: GraphQLSchema): string[] {
  return Object.keys(
    (schema?.getType('Query') as GraphQLObjectType).getFields(),
  );
}

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
  mockSDLQuerySuccess(simpleService);

  gateway = new ApolloGateway({ serviceList: [simpleService] });
  await gateway.load();
  expect(gateway.schema!.getType('User')!.description).toBe('This is my User');
});

it('Fetches CSDL from remote storage', async () => {
  mockCsdlRequestSuccess();

  gateway = new ApolloGateway({ logger });

  await gateway.load(loadConfig);
  await gateway.stop();
  expect(gateway.schema?.getType('User')).toBeTruthy();
});

it('Updates CSDL from remote storage', async () => {
  mockCsdlRequestSuccess();
  mockCsdlRequestSuccess(getTestingCsdl(fixturesWithUpdate), 'updatedId-5678');

  // This test is only interested in the second time the gateway notifies of an
  // update, since the first happens on load.
  let secondUpdateResolve: Function;
  const secondUpdate = new Promise((res) => (secondUpdateResolve = res));
  const schemaChangeCallback = jest
    .fn()
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      secondUpdateResolve();
    });

  gateway = new ApolloGateway({ logger });
  // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
  gateway.experimental_pollInterval = 100;
  gateway.onSchemaChange(schemaChangeCallback);

  await gateway.load(loadConfig);
  expect(gateway['compositionId']).toMatchInlineSnapshot(`"originalId-1234"`);

  await secondUpdate;
  expect(gateway['compositionId']).toMatchInlineSnapshot(`"updatedId-5678"`);
});

describe('CSDL update failures', () => {
  it('Gateway throws on initial load failure', async () => {
    mockCsdlRequest().reply(401);

    const gateway = new ApolloGateway({
      logger,
    });

    await expect(
      gateway.load(loadConfig),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"401: Unexpected failure while fetching updated CSDL"`,
    );
  });

  it('Handles arbitrary fetch failures (non 200 response)', async () => {
    mockCsdlRequestSuccess();
    mockCsdlRequest().reply(500);

    const gateway = new ApolloGateway({
      logger,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    await gateway.load(loadConfig);
    await gateway.stop();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      '500: Unexpected failure while fetching updated CSDL',
    );
  });

  it('Handles GraphQL errors', async () => {
    mockCsdlRequestSuccess();
    mockCsdlRequest().reply(200, {
      errors: [
        {
          message: 'Cannot query field "fail" on type "Query".',
          locations: [{ line: 1, column: 3 }],
          extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
        },
      ],
    });

    const gateway = new ApolloGateway({
      logger,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    await gateway.load(loadConfig);
    await gateway.stop();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Cannot query field "fail" on type "Query".',
    );
  });
});

it('Rollsback to a previous schema when triggered', async () => {
  // Init
  mockCsdlRequestSuccess();
  mockCsdlRequestSuccess(getTestingCsdl(fixturesWithUpdate), 'updatedId-5678');
  mockCsdlRequestSuccess();

  let firstResolve: Function;
  let secondResolve: Function;
  let thirdResolve: Function;
  const firstSchemaChangeBlocker = new Promise((res) => (firstResolve = res));
  const secondSchemaChangeBlocker = new Promise((res) => (secondResolve = res));
  const thirdSchemaChangeBlocker = new Promise((res) => (thirdResolve = res));

  const onChange = jest
    .fn()
    .mockImplementationOnce(() => firstResolve())
    .mockImplementationOnce(() => secondResolve())
    .mockImplementationOnce(() => thirdResolve());

  gateway = new ApolloGateway({ logger });
  // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
  gateway.experimental_pollInterval = 100;

  gateway.onSchemaChange(onChange);
  await gateway.load(loadConfig);

  await firstSchemaChangeBlocker;
  expect(onChange).toHaveBeenCalledTimes(1);

  await secondSchemaChangeBlocker;
  expect(onChange).toHaveBeenCalledTimes(2);

  await thirdSchemaChangeBlocker;
  expect(onChange).toHaveBeenCalledTimes(3);
});

describe('Downstream service health checks', () => {
  describe('Unmanaged mode', () => {
    it(`Performs health checks to downstream services on load`, async () => {
      mockSDLQuerySuccess(simpleService);
      mockServiceHealthCheckSuccess(simpleService);

      gateway = new ApolloGateway({
        logger,
        serviceList: [simpleService],
        serviceHealthCheck: true,
      });

      await gateway.load();
      expect(gateway.schema!.getType('User')!.description).toBe(
        'This is my User',
      );
    });

    it(`Rejects on initial load when health check fails`, async () => {
      mockSDLQuerySuccess(simpleService);
      mockServiceHealthCheck(simpleService).reply(500);

      gateway = new ApolloGateway({
        serviceList: [simpleService],
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
      mockAllServicesHealthCheckSuccess();

      gateway = new ApolloGateway({ serviceHealthCheck: true, logger });
      // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
      gateway.experimental_pollInterval = 100;

      await gateway.load(loadConfig);
      await gateway.stop();

      expect(gateway.schema!.getType('User')!).toBeTruthy();
    });

    it('Rejects on initial load when health check fails', async () => {
      mockCsdlRequestSuccess();
      mockServiceHealthCheck(accounts).reply(500);
      mockServiceHealthCheckSuccess(books);
      mockServiceHealthCheckSuccess(inventory);
      mockServiceHealthCheckSuccess(product);
      mockServiceHealthCheckSuccess(reviews);
      mockServiceHealthCheckSuccess(documents);

      gateway = new ApolloGateway({ serviceHealthCheck: true, logger });

      await expect(
        gateway.load(loadConfig),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"500: Internal Server Error"`,
      );
    });

    // This test has been flaky for a long time, and fails consistently after changes
    // introduced by https://github.com/apollographql/apollo-server/pull/4277.
    // I've decided to skip this test for now with hopes that we can one day
    // determine the root cause and test this behavior in a reliable manner.
    it('Rolls over to new schema when health check succeeds', async () => {
      mockCsdlRequestSuccess();
      mockAllServicesHealthCheckSuccess();

      // Update
      mockCsdlRequestSuccess(getTestingCsdl(fixturesWithUpdate), 'updatedId-5678');
      mockAllServicesHealthCheckSuccess();

      let resolve1: Function;
      let resolve2: Function;
      const schemaChangeBlocker1 = new Promise((res) => (resolve1 = res));
      const schemaChangeBlocker2 = new Promise((res) => (resolve2 = res));
      const onChange = jest
        .fn()
        .mockImplementationOnce(() => resolve1())
        .mockImplementationOnce(() => resolve2());

      gateway = new ApolloGateway({
        serviceHealthCheck: true,
        logger,
      });
      // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
      gateway.experimental_pollInterval = 100;

      gateway.onSchemaChange(onChange);
      await gateway.load(loadConfig);

      // Basic testing schema doesn't contain a `review` field on `Query` type
      await schemaChangeBlocker1;
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');
      expect(onChange).toHaveBeenCalledTimes(1);

      // "Updated" testing schema adds a `review` field on `Query` type
      await schemaChangeBlocker2;
      expect(getRootQueryFields(gateway.schema)).toContain('review');

      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('Preserves original schema when health check fails', async () => {
      mockCsdlRequestSuccess();
      mockAllServicesHealthCheckSuccess();

      // Update (with one health check failure)
      mockCsdlRequestSuccess(getTestingCsdl(fixturesWithUpdate), 'updatedId-5678');
      mockServiceHealthCheck(accounts).reply(500);
      mockServiceHealthCheckSuccess(books);
      mockServiceHealthCheckSuccess(inventory);
      mockServiceHealthCheckSuccess(product);
      mockServiceHealthCheckSuccess(reviews);
      mockServiceHealthCheckSuccess(documents);

      let resolve: Function;
      const schemaChangeBlocker = new Promise((res) => (resolve = res));

      gateway = new ApolloGateway({ serviceHealthCheck: true, logger });
      // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
      gateway.experimental_pollInterval = 100;

      // @ts-ignore for testing purposes, we'll call the original `updateComposition`
      // function from our mock. The first call should mimic original behavior,
      // but the second call needs to handle the PromiseRejection. Typically for tests
      // like these we would leverage the `gateway.onSchemaChange` callback to drive
      // the test, but in this case, that callback isn't triggered when the update
      // fails (as expected) so we get creative with the second mock as seen below.
      const original = gateway.updateComposition;
      const mockUpdateComposition = jest
        .fn()
        .mockImplementationOnce(async () => {
          await original.apply(gateway);
        })
        .mockImplementationOnce(async () => {
          // mock the first poll and handle the error which would otherwise be caught
          // and logged from within the `pollServices` class method
          await expect(
            original.apply(gateway),
          ).rejects.toThrowErrorMatchingInlineSnapshot(
            `"500: Internal Server Error"`,
          );
          // finally resolve the promise which drives this test
          resolve();
        });

      // @ts-ignore for testing purposes, replace the `updateComposition`
      // function on the gateway with our mock
      gateway.updateComposition = mockUpdateComposition;

      // load the gateway as usual
      await gateway.load(loadConfig);

      // Validate we have the original schema
      expect(getRootQueryFields(gateway.schema)).toContain('topReviews');
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');

      await schemaChangeBlocker;

      // At this point, the mock update should have been called but the schema
      // should still be the original.
      expect(mockUpdateComposition).toHaveBeenCalledTimes(2);
      expect(getRootQueryFields(gateway.schema)).toContain('topReviews');
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');
    });
  });
});
