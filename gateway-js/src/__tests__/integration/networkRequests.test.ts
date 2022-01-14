import gql from 'graphql-tag';
import { GraphQLObjectType, GraphQLSchema } from 'graphql';
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
  mockCloudConfigUrl1,
  mockSupergraphSdlRequestIfAfter,
  mockSupergraphSdlRequestSuccessIfAfter,
} from './nockMocks';
import {
  accounts,
  books,
  documents,
  Fixture,
  fixturesWithUpdate,
  inventory,
  product,
  reviews,
} from 'apollo-federation-integration-testsuite';
import { getTestingSupergraphSdl } from '../execution-utils';
import { nockAfterEach, nockBeforeEach } from '../nockAssertions';
import resolvable from '@josephg/resolvable';

const simpleService: Fixture = {
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
  nockBeforeEach();

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
  nockAfterEach();

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

it('Fetches Supergraph SDL from remote storage', async () => {
  mockSupergraphSdlRequestSuccess();

  gateway = new ApolloGateway({
    logger,
    uplinkEndpoints: [mockCloudConfigUrl1],
  });

  await gateway.load(mockApolloConfig);
  await gateway.stop();
  expect(gateway.schema?.getType('User')).toBeTruthy();
});

it('Fetches Supergraph SDL from remote storage using a configured env variable', async () => {
  cleanUp = mockedEnv({
    APOLLO_SCHEMA_CONFIG_DELIVERY_ENDPOINT: mockCloudConfigUrl1,
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
  const secondUpdate = resolvable();

  gateway = new ApolloGateway({
    logger,
    uplinkEndpoints: [mockCloudConfigUrl1],
  });
  // for testing purposes, a short pollInterval is ideal so we'll override here
  gateway['pollIntervalInMs'] = 100;

  const schemas: GraphQLSchema[] = [];
  gateway.onSchemaLoadOrUpdate(({apiSchema}) => {
    schemas.push(apiSchema);
  });
  gateway.onSchemaLoadOrUpdate(
    jest
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => secondUpdate.resolve()),
  );

  await gateway.load(mockApolloConfig);

  await secondUpdate;

  // First schema has no 'review' field on the 'Query' type
  expect(
    (schemas[0].getType('Query') as GraphQLObjectType).getFields()['review'],
  ).toBeFalsy();

  // Updated schema adds 'review' field on the 'Query' type
  expect(
    (schemas[1].getType('Query') as GraphQLObjectType).getFields()['review'],
  ).toBeTruthy();
});

describe('Supergraph SDL update failures', () => {
  it('Gateway throws on initial load failure', async () => {
    mockSupergraphSdlRequest().reply(401);

    gateway = new ApolloGateway({
      logger,
      uplinkEndpoints: [mockCloudConfigUrl1],
      uplinkMaxRetries: 0,
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
    const errorLoggedPromise = resolvable();
    logger.error = jest.fn(() => errorLoggedPromise.resolve());

    gateway = new ApolloGateway({
      logger,
      uplinkEndpoints: [mockCloudConfigUrl1],
      uplinkMaxRetries: 0,
    });

    // for testing purposes, a short pollInterval is ideal so we'll override here
    gateway['pollIntervalInMs'] = 100;

    await gateway.load(mockApolloConfig);
    await errorLoggedPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'UplinkFetcher failed to update supergraph with the following error: An error occurred while fetching your schema from Apollo: 500 Internal Server Error',
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
    const errorLoggedPromise = resolvable();
    logger.error = jest.fn(() => errorLoggedPromise.resolve());

    gateway = new ApolloGateway({
      logger,
      uplinkEndpoints: [mockCloudConfigUrl1],
      uplinkMaxRetries: 0,
    });
    // for testing purposes, a short pollInterval is ideal so we'll override here
    gateway['pollIntervalInMs'] = 100;

    await gateway.load(mockApolloConfig);
    await errorLoggedPromise;

    expect(logger.error).toHaveBeenCalledWith(
      `UplinkFetcher failed to update supergraph with the following error: An error occurred while fetching your schema from Apollo: \nCannot query field "fail" on type "Query".`,
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
    const errorLoggedPromise = resolvable();
    logger.error = jest.fn(() => errorLoggedPromise.resolve());

    gateway = new ApolloGateway({
      logger,
      uplinkEndpoints: [mockCloudConfigUrl1],
    });
    // for testing purposes, a short pollInterval is ideal so we'll override here
    gateway['pollIntervalInMs'] = 100;

    await gateway.load(mockApolloConfig);
    await errorLoggedPromise;

    expect(logger.error).toHaveBeenCalledWith(
      'UplinkFetcher failed to update supergraph with the following error: Syntax Error: Unexpected Name "Syntax".',
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
      uplinkEndpoints: [mockCloudConfigUrl1],
    });
    // for testing purposes, a short pollInterval is ideal so we'll override here
    gateway['pollIntervalInMs'] = 100;

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

  const firstSchemaChangeBlocker = resolvable();
  const secondSchemaChangeBlocker = resolvable();
  const thirdSchemaChangeBlocker = resolvable();

  const onChange = jest
    .fn()
    .mockImplementationOnce(() => firstSchemaChangeBlocker.resolve())
    .mockImplementationOnce(() => secondSchemaChangeBlocker.resolve())
    .mockImplementationOnce(() => thirdSchemaChangeBlocker.resolve());

  gateway = new ApolloGateway({
    logger,
    uplinkEndpoints: [mockCloudConfigUrl1],
  });
  // for testing purposes, a short pollInterval is ideal so we'll override here
  gateway['pollIntervalInMs'] = 100;

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

      expect(err.message).toMatchInlineSnapshot(`
        "The gateway subgraphs health check failed. Updating to the provided \`supergraphSdl\` will likely result in future request failures to subgraphs. The following error occurred during the health check:
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
        uplinkEndpoints: [mockCloudConfigUrl1],
      });
      // for testing purposes, a short pollInterval is ideal so we'll override here
      gateway['pollIntervalInMs'] = 100;

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
        uplinkEndpoints: [mockCloudConfigUrl1],
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
        "The gateway subgraphs health check failed. Updating to the provided \`supergraphSdl\` will likely result in future request failures to subgraphs. The following error occurred during the health check:
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

      const schemaChangeBlocker1 = resolvable();
      const schemaChangeBlocker2 = resolvable();
      const onChange = jest
        .fn()
        .mockImplementationOnce(() => schemaChangeBlocker1.resolve())
        .mockImplementationOnce(() => schemaChangeBlocker2.resolve());

      gateway = new ApolloGateway({
        serviceHealthCheck: true,
        logger,
        uplinkEndpoints: [mockCloudConfigUrl1],
      });
      // for testing purposes, a short pollInterval is ideal so we'll override here
      gateway['pollIntervalInMs'] = 100;

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
      const errorLoggedPromise = resolvable();
      const errorSpy = jest.fn(() => errorLoggedPromise.resolve());
      logger.error = errorSpy;

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

      gateway = new ApolloGateway({
        serviceHealthCheck: true,
        logger,
        uplinkEndpoints: [mockCloudConfigUrl1],
      });
      // for testing purposes, a short pollInterval is ideal so we'll override here
      gateway['pollIntervalInMs'] = 100;

      const updateSpy = jest.fn();
      gateway.onSchemaLoadOrUpdate(() => updateSpy());

      // load the gateway as usual
      await gateway.load(mockApolloConfig);

      // Validate we have the original schema
      expect(getRootQueryFields(gateway.schema)).toContain('topReviews');
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');

      await errorLoggedPromise;
      expect(logger.error).toHaveBeenCalledWith(
        `UplinkFetcher failed to update supergraph with the following error: The gateway subgraphs health check failed. Updating to the provided \`supergraphSdl\` will likely result in future request failures to subgraphs. The following error occurred during the health check:\n[accounts]: 500: Internal Server Error`,
      );

      // At this point, the mock update should have been called but the schema
      // should still be the original.
      expect(updateSpy).toHaveBeenCalledTimes(1);

      expect(getRootQueryFields(gateway.schema)).toContain('topReviews');
      expect(getRootQueryFields(gateway.schema)).not.toContain('review');
    });
  });
});
