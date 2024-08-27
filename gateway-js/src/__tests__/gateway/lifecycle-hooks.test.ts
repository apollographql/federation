import gql from 'graphql-tag';
import { ApolloGateway } from '../..';
import {
  DynamicGatewayConfig,
  Experimental_DidResolveQueryPlanCallback,
  Experimental_UpdateServiceDefinitions,
  ServiceDefinitionUpdate,
} from '../../config';
import {
  product,
  reviews,
  inventory,
  accounts,
  books,
  documents,
  fixtures,
  fixturesWithUpdate,
} from 'apollo-federation-integration-testsuite';
import { createHash } from '@apollo/utils.createhash';
import type { Logger } from '@apollo/utils.logger';
import resolvable from '@josephg/resolvable';
import { getTestingSupergraphSdl } from '../execution-utils';

// The order of this was specified to preserve existing test coverage. Typically
// we would just import and use the `fixtures` array.
const serviceDefinitions = [
  product,
  reviews,
  inventory,
  accounts,
  books,
  documents,
].map((s, i) => ({
  name: s.name,
  typeDefs: s.typeDefs,
  url: `http://localhost:${i}`,
}));

let logger: Logger;

beforeEach(() => {
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

describe('lifecycle hooks', () => {
  it('uses updateServiceDefinitions override', async () => {
    const experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions =
      jest.fn(async () => {
        return { serviceDefinitions, isNewSchema: true };
      });

    const gateway = new ApolloGateway({
      serviceList: serviceDefinitions,
      experimental_updateServiceDefinitions,
      logger,
    });

    await gateway.load();

    expect(experimental_updateServiceDefinitions).toBeCalled();
    expect(gateway.schema!.getType('Furniture')).toBeDefined();
    await gateway.stop();
  });

  it('calls experimental_didUpdateSupergraph on schema update', async () => {
    const compositionMetadata = {
      formatVersion: 1,
      id: 'abc',
      implementingServiceLocations: [],
      schemaHash: 'hash1',
    };

    const mockUpdate = jest
      .fn<Promise<ServiceDefinitionUpdate>, [config: DynamicGatewayConfig]>()
      .mockImplementationOnce(async () => {
        return {
          serviceDefinitions: fixtures,
          isNewSchema: true,
          compositionMetadata: {
            ...compositionMetadata,
            id: '123',
            schemaHash: 'hash2',
          },
        };
      })
      // We want to return a different composition across two ticks, so we mock it
      // slightly differently
      .mockImplementationOnce(async () => {
        return {
          serviceDefinitions: fixturesWithUpdate,
          isNewSchema: true,
          compositionMetadata,
        };
      });

    const mockDidUpdate = jest.fn();

    const gateway = new ApolloGateway({
      experimental_updateServiceDefinitions: mockUpdate,
      experimental_didUpdateSupergraph: mockDidUpdate,
      logger,
    });
    // for testing purposes, a short pollInterval is ideal so we'll override here
    gateway['pollIntervalInMs'] = 100;

    const schemaChangeBlocker1 = resolvable();
    const schemaChangeBlocker2 = resolvable();

    gateway.onSchemaLoadOrUpdate(
      jest
        .fn()
        .mockImplementationOnce(() => schemaChangeBlocker1.resolve())
        .mockImplementationOnce(() => schemaChangeBlocker2.resolve()),
    );

    await gateway.load();

    await schemaChangeBlocker1;

    expect(mockUpdate).toBeCalledTimes(1);
    expect(mockDidUpdate).toBeCalledTimes(1);

    await schemaChangeBlocker2;

    expect(mockUpdate).toBeCalledTimes(2);
    expect(mockDidUpdate).toBeCalledTimes(2);

    const [firstCall, secondCall] = mockDidUpdate.mock.calls;

    // Note that we've composing our usual test fixtures here
    const expectedFirstId = createHash('sha256')
      .update(getTestingSupergraphSdl())
      .digest('hex');
    expect(firstCall[0]!.compositionId).toEqual(expectedFirstId);
    // first call should have no second "previous" argument
    expect(firstCall[1]).toBeUndefined();

    // Note that this assertion is a tad fragile in that every time we modify
    // the supergraph (even just formatting differences), this ID will change
    // and this test will have to updated.
    expect(secondCall[0]!.compositionId).toMatchInlineSnapshot(
      `"4aa2278e35df345ff5959a30546d2e9ef9e997204b4ffee4a42344b578b36068"`,
    );
    // second call should have previous info in the second arg
    expect(secondCall[1]!.compositionId).toEqual(expectedFirstId);

    await gateway.stop();
  });

  it('uses default service definition updater', async () => {
    const gateway = new ApolloGateway({
      localServiceList: serviceDefinitions,
      logger,
    });

    const { schema } = await gateway.load();

    // spying on gateway.loadServiceDefinitions wasn't working, so this also
    // should test functionality. If there's no overwriting service definition
    // updater, it has to use the default. If there's a valid schema, then
    // the loader had to have been called.
    expect(schema.getType('User')).toBeDefined();

    await gateway.stop();
  });

  it('warns when polling on the default fetcher', async () => {
    new ApolloGateway({
      serviceList: serviceDefinitions,
      pollIntervalInMs: 10,
      logger,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Polling running services is dangerous and not recommended in production. Polling should only be used against a registry. If you are polling running services, use with caution.',
    );
  });

  it('registers schema change callbacks when pollIntervalInMs is set for unmanaged configs', async () => {
    const experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions =
      jest.fn(async (_config) => {
        return { serviceDefinitions, isNewSchema: true };
      });

    const gateway = new ApolloGateway({
      serviceList: [{ name: 'book', url: 'http://localhost:32542' }],
      experimental_updateServiceDefinitions,
      pollIntervalInMs: 100,
      logger,
    });

    const schemaChangeBlocker = resolvable();
    const schemaChangeCallback = jest.fn(() => schemaChangeBlocker.resolve());

    gateway.onSchemaLoadOrUpdate(schemaChangeCallback);
    await gateway.load();

    await schemaChangeBlocker;

    expect(schemaChangeCallback).toBeCalledTimes(1);
    await gateway.stop();
  });

  it('calls experimental_didResolveQueryPlan when executor is called', async () => {
    const experimental_didResolveQueryPlan: Experimental_DidResolveQueryPlanCallback =
      jest.fn();

    const gateway = new ApolloGateway({
      localServiceList: [books],
      experimental_didResolveQueryPlan,
    });

    const { executor } = await gateway.load();

    const source = `#graphql
      { book(isbn: "0262510871") { year } }
    `;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await executor({
      source,
      document: gql(source),
      request: {},
      queryHash: 'hashed',
      context: {},
    });

    expect(experimental_didResolveQueryPlan).toBeCalled();
    await gateway.stop();
  });
});
