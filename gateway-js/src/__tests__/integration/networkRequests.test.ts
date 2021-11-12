import nock from 'nock';
import gql from 'graphql-tag';
import { DocumentNode, GraphQLObjectType, GraphQLSchema } from 'graphql';
import mockedEnv from 'mocked-env';
import { Logger } from 'apollo-server-types';
import { ApolloGateway } from '../..';
import {
  mockSdlQuerySuccess,
  mockServiceHealthCheckSuccess,
  mockAllServicesHealthCheckSuccess,
  mockServiceHealthCheck,
  mockSupergraphSdlRequestSuccess,
  mockSupergraphSdlRequest,
  mockApolloConfig,
  mockCloudConfigUrl,
  mockSupergraphSdlRequestIfAfter,
  mockSupergraphSdlRequestSuccessIfAfter,
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
import { getTestingSupergraphSdl } from '../execution-utils';

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

function getRootQueryFields(schema?: GraphQLSchema): string[] {
  return Object.keys(
    (schema?.getType('Query') as GraphQLObjectType).getFields(),
  );
}

let logger: Logger;
let gateway: ApolloGateway | null = null;
let cleanUp: (() => void) | null = null;

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

  if (cleanUp) {
    cleanUp();
    cleanUp = null;
  }
});

it('Queries remote endpoints for their SDLs', async () => {
  mockSdlQuerySuccess(simpleService);

  gateway = new ApolloGateway({ serviceList: [simpleService] });
  await gateway.load();
  expect(gateway.schema!.getType('User')!.description).toBe('This is my User');
});

// TODO(trevor:cloudconfig): Remove all usages of the experimental config option
it('Fetches Supergraph SDL from remote storage', async () => {
  mockSupergraphSdlRequestSuccess();

  gateway = new ApolloGateway({
    logger,
    schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
  });

  await gateway.load(mockApolloConfig);
  await gateway.stop();
  expect(gateway.schema?.getType('User')).toBeTruthy();
});

// TODO(trevor:cloudconfig): This test should evolve to demonstrate overriding the default in the future
it('Fetches Supergraph SDL from remote storage using a configured env variable', async () => {
  cleanUp = mockedEnv({
    APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: mockCloudConfigUrl,
  });
  mockSupergraphSdlRequestSuccess();

  gateway = new ApolloGateway({
    logger,
  });

  await gateway.load(mockApolloConfig);
  await gateway.stop();
  expect(gateway.schema?.getType('User')).toBeTruthy();
});

it('Updates Supergraph SDL from remote storage', async () => {
  mockSupergraphSdlRequestSuccess();
  mockSupergraphSdlRequestSuccessIfAfter(
    'originalId-1234',
    'updatedId-5678',
    getTestingSupergraphSdl(fixturesWithUpdate),
  );

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

  gateway = new ApolloGateway({
    logger,
    schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
  });
  // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
  gateway.experimental_pollInterval = 100;
  gateway.onSchemaChange(schemaChangeCallback);

  await gateway.load(mockApolloConfig);
  expect(gateway['compositionId']).toMatchInlineSnapshot(`"originalId-1234"`);

  await secondUpdate;
  expect(gateway['compositionId']).toMatchInlineSnapshot(`"updatedId-5678"`);
});

describe('Supergraph SDL update failures', () => {
  it('Gateway throws on initial load failure', async () => {
    mockSupergraphSdlRequest().reply(401);

    gateway = new ApolloGateway({
      logger,
      schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
    });

    await expect(
      gateway.load(mockApolloConfig),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"An error occurred while fetching your schema from Apollo: 401 Unauthorized"`,
    );

    await expect(gateway.stop()).rejects.toThrowErrorMatchingInlineSnapshot(
      `"ApolloGateway.stop does not need to be called before ApolloGateway.load is called successfully"`,
    );
    // Set to `null` so we don't try to call `stop` on it in the `afterEach`,
    // which triggers a different error that we're not testing for here.
    gateway = null;
  });

  it('Handles arbitrary fetch failures (non 200 response)', async () => {
    mockSupergraphSdlRequestSuccess();
    mockSupergraphSdlRequestIfAfter('originalId-1234').reply(500);

    // Spy on logger.error so we can just await once it's been called
    let errorLogged: Function;
    const errorLoggedPromise = new Promise((r) => (errorLogged = r));
    logger.error = jest.fn(() => errorLogged());

    gateway = new ApolloGateway({
      logger,
      schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
    });

    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    await gateway.load(mockApolloConfig);
    await errorLoggedPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'An error occurred while fetching your schema from Apollo: 500 Internal Server Error',
    );
  });

  it('Handles GraphQL errors', async () => {
    mockSupergraphSdlRequestSuccess();
    mockSupergraphSdlRequest('originalId-1234').reply(200, {
      errors: [
        {
          message: 'Cannot query field "fail" on type "Query".',
          locations: [{ line: 1, column: 3 }],
          extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
        },
      ],
    });

    // Spy on logger.error so we can just await once it's been called
    let errorLogged: Function;
    const errorLoggedPromise = new Promise((r) => (errorLogged = r));
    logger.error = jest.fn(() => errorLogged());

    gateway = new ApolloGateway({
      logger,
      schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    await gateway.load(mockApolloConfig);
    await errorLoggedPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'An error occurred while fetching your schema from Apollo: ' +
        '\n' +
        'Cannot query field "fail" on type "Query".',
    );
  });

  it("Doesn't update and logs on receiving unparseable Supergraph SDL", async () => {
    mockSupergraphSdlRequestSuccess();
    mockSupergraphSdlRequestIfAfter('originalId-1234').reply(
      200,
      JSON.stringify({
        data: {
          routerConfig: {
            __typename: 'RouterConfigResult',
            id: 'failure',
            supergraphSdl: 'Syntax Error - invalid SDL',
          },
        },
      }),
    );

    // Spy on logger.error so we can just await once it's been called
    let errorLogged: Function;
    const errorLoggedPromise = new Promise((r) => (errorLogged = r));
    logger.error = jest.fn(() => errorLogged());

    gateway = new ApolloGateway({
      logger,
      schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    await gateway.load(mockApolloConfig);
    await errorLoggedPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'Syntax Error: Unexpected Name "Syntax".',
    );
    expect(gateway.schema).toBeTruthy();
  });

  it('Throws on initial load when receiving unparseable Supergraph SDL', async () => {
    mockSupergraphSdlRequest().reply(
      200,
      JSON.stringify({
        data: {
          routerConfig: {
            __typename: 'RouterConfigResult',
            id: 'failure',
            supergraphSdl: 'Syntax Error - invalid SDL',
          },
        },
      }),
    );

    gateway = new ApolloGateway({
      logger,
      schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    await expect(
      gateway.load(mockApolloConfig),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Syntax Error: Unexpected Name \\"Syntax\\"."`,
    );

    expect(gateway['state'].phase).toEqual('failed to load');

    // Set to `null` so we don't try to call `stop` on it in the `afterEach`,
    // which triggers a different error that we're not testing for here.
    gateway = null;
  });
});

it('Rollsback to a previous schema when triggered', async () => {
  // Init
  mockSupergraphSdlRequestSuccess();
  mockSupergraphSdlRequestSuccessIfAfter(
    'originalId-1234',
    'updatedId-5678',
    getTestingSupergraphSdl(fixturesWithUpdate),
  );
  mockSupergraphSdlRequestSuccessIfAfter('updatedId-5678');

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

  gateway = new ApolloGateway({
    logger,
    schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
  });
  // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
  gateway.experimental_pollInterval = 100;

  gateway.onSchemaChange(onChange);
  await gateway.load(mockApolloConfig);

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
      mockSdlQuerySuccess(simpleService);
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
      mockSdlQuerySuccess(simpleService);
      mockServiceHealthCheck(simpleService).reply(500);

      gateway = new ApolloGateway({
        serviceList: [simpleService],
        serviceHealthCheck: true,
        logger,
      });

      // This is the ideal, but our version of Jest has a bug with printing error snapshots.
      // See: https://github.com/facebook/jest/pull/10217 (fixed in v26.2.0)
      //     expect(gateway.load(mockApolloConfig)).rejects.toThrowErrorMatchingInlineSnapshot(`
      //       "A valid schema couldn't be composed. The following composition errors were found:
      //         [accounts] User -> A @key selects id, but User.id could not be found
      //         [accounts] Account -> A @key selects id, but Account.id could not be found"
      //     `);
      // Instead we'll just use the regular snapshot matcher...
      try {
        await gateway.load(mockApolloConfig);
      } catch (e) {
        var err = e;
      }

      // TODO: smell that we should be awaiting something else
      expect(err.message).toMatchInlineSnapshot(`
        "The gateway did not update its schema due to failed service health checks. The gateway will continue to operate with the previous schema and reattempt updates. The following error occurred during the health check:
        [accounts]: 500: Internal Server Error"
      `);

      await expect(gateway.stop()).rejects.toThrowErrorMatchingInlineSnapshot(
        `"ApolloGateway.stop does not need to be called before ApolloGateway.load is called successfully"`,
      );

      // Set to `null` so we don't try to call `stop` on it in the `afterEach`,
      // which triggers a different error that we're not testing for here.
      gateway = null;
    });
  });

  describe('Managed mode', () => {
    it('Performs health checks to downstream services on load', async () => {
      mockSupergraphSdlRequestSuccess();
      mockAllServicesHealthCheckSuccess();

      gateway = new ApolloGateway({
        serviceHealthCheck: true,
        logger,
        schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
      });
      // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
      gateway.experimental_pollInterval = 100;

      await gateway.load(mockApolloConfig);
      await gateway.stop();

      expect(gateway.schema!.getType('User')!).toBeTruthy();
    });

    it('Rejects on initial load when health check fails', async () => {
      mockSupergraphSdlRequestSuccess();
      mockServiceHealthCheck(accounts).reply(500);
      mockServiceHealthCheckSuccess(books);
      mockServiceHealthCheckSuccess(inventory);
      mockServiceHealthCheckSuccess(product);
      mockServiceHealthCheckSuccess(reviews);
      mockServiceHealthCheckSuccess(documents);

      gateway = new ApolloGateway({
        serviceHealthCheck: true,
        logger,
        schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
      });

      // This is the ideal, but our version of Jest has a bug with printing error snapshots.
      // See: https://github.com/facebook/jest/pull/10217 (fixed in v26.2.0)
      //     expect(gateway.load(mockApolloConfig)).rejects.toThrowErrorMatchingInlineSnapshot(`
      //       "A valid schema couldn't be composed. The following composition errors were found:
      //         [accounts] User -> A @key selects id, but User.id could not be found
      //         [accounts] Account -> A @key selects id, but Account.id could not be found"
      //     `);
      // Instead we'll just use the regular snapshot matcher...
      try {
        await gateway.load(mockApolloConfig);
      } catch (e) {
        var err = e;
      }

      // TODO: smell that we should be awaiting something else
      expect(err.message).toMatchInlineSnapshot(`
        "The gateway did not update its schema due to failed service health checks. The gateway will continue to operate with the previous schema and reattempt updates. The following error occurred during the health check:
        [accounts]: 500: Internal Server Error"
      `);

      await expect(gateway.stop()).rejects.toThrowErrorMatchingInlineSnapshot(
        `"ApolloGateway.stop does not need to be called before ApolloGateway.load is called successfully"`,
      );

      // Set to `null` so we don't try to call `stop` on it in the `afterEach`,
      // which triggers a different error that we're not testing for here.
      gateway = null;
    });

    // This test has been flaky for a long time, and fails consistently after changes
    // introduced by https://github.com/apollographql/apollo-server/pull/4277.
    // I've decided to skip this test for now with hopes that we can one day
    // determine the root cause and test this behavior in a reliable manner.
    it('Rolls over to new schema when health check succeeds', async () => {
      mockSupergraphSdlRequestSuccess();
      mockAllServicesHealthCheckSuccess();

      // Update
      mockSupergraphSdlRequestSuccessIfAfter(
        'originalId-1234',
        'updatedId-5678',
        getTestingSupergraphSdl(fixturesWithUpdate),
      );
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
        schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
      });
      // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
      gateway.experimental_pollInterval = 100;

      gateway.onSchemaChange(onChange);
      await gateway.load(mockApolloConfig);

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
      mockSupergraphSdlRequestSuccess();
      mockAllServicesHealthCheckSuccess();

      // Update (with one health check failure)
      mockSupergraphSdlRequestSuccessIfAfter(
        'originalId-1234',
        'updatedId-5678',
        getTestingSupergraphSdl(fixturesWithUpdate),
      );
      mockServiceHealthCheck(accounts).reply(500);
      mockServiceHealthCheckSuccess(books);
      mockServiceHealthCheckSuccess(inventory);
      mockServiceHealthCheckSuccess(product);
      mockServiceHealthCheckSuccess(reviews);
      mockServiceHealthCheckSuccess(documents);

      let resolve: Function;
      const schemaChangeBlocker = new Promise((res) => (resolve = res));

      gateway = new ApolloGateway({
        serviceHealthCheck: true,
        logger,
        schemaConfigDeliveryEndpoint: mockCloudConfigUrl,
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

          // This is the ideal, but our version of Jest has a bug with printing error snapshots.
          // See: https://github.com/facebook/jest/pull/10217 (fixed in v26.2.0)
          //     expect(original.apply(gateway)).rejects.toThrowErrorMatchingInlineSnapshot(`
          //       The gateway did not update its schema due to failed service health checks. The gateway will continue to operate with the previous schema and reattempt updates. The following error occurred during the health check:
          //         [accounts]: 500: Internal Server Error"
          //     `);
          // Instead we'll just use the regular snapshot matcher...
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
      await gateway.load(mockApolloConfig);

      // Validate we have the original schema
      expect(getRootQueryFields(gateway.schema)).toContain('topReviews');
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');

      await schemaChangeBlocker;

      // At this point, the mock update should have been called but the schema
      // should still be the original.
      expect(mockUpdateSchema).toHaveBeenCalledTimes(2);
      expect(getRootQueryFields(gateway.schema)).toContain('topReviews');
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');
    });
  });
});
