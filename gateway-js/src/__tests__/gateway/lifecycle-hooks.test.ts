import gql from 'graphql-tag';
import { ApolloGateway } from '../..';
import {
  Experimental_DidResolveQueryPlanCallback,
  Experimental_UpdateServiceDefinitions,
} from '../../config';
import {
  product,
  reviews,
  inventory,
  accounts,
  books,
  documents,
} from 'apollo-federation-integration-testsuite';
import { Logger } from 'apollo-server-types';

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
    const experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions = jest.fn(
      async () => {
        return { serviceDefinitions, isNewSchema: true };
      },
    );

    const gateway = new ApolloGateway({
      serviceList: serviceDefinitions,
      experimental_updateServiceDefinitions,
      experimental_didUpdateComposition: jest.fn(),
      logger,
    });

    await gateway.load();

    expect(experimental_updateServiceDefinitions).toBeCalled();
    expect(gateway.schema!.getType('Furniture')).toBeDefined();
    await gateway.stop();
  });

  it('calls experimental_didFailComposition with a bad config', async () => {
    const experimental_didFailComposition = jest.fn();

    // Creating 2 subservices that clearly cannot composed.
    const s1 = {
      name: 'S1',
      url: 'http://S1',
      typeDefs: gql`
        type T {
          a: Int
        }
      `
    };

    const s2 = {
      name: 'S2',
      url: 'http://S2',
      typeDefs: gql`
        type T {
          a: String
        }
      `
    };


    const gateway = new ApolloGateway({
      async experimental_updateServiceDefinitions() {
        return {
          serviceDefinitions: [s1, s2],
          compositionMetadata: {
            formatVersion: 1,
            id: 'abc',
            implementingServiceLocations: [],
            schemaHash: 'abc',
          },
          isNewSchema: true,
        };
      },
      serviceList: [],
      experimental_didFailComposition,
      logger,
    });

    await expect(gateway.load()).rejects.toThrowError("A valid schema couldn't be composed");

    const callbackArgs = experimental_didFailComposition.mock.calls[0][0];
    expect(callbackArgs.serviceList).toHaveLength(2);
    expect(callbackArgs.errors[0]).toMatchInlineSnapshot(
      `[GraphQLError: Field "T.a" has incompatible types accross subgraphs: it has type "Int" in subgraph "S1" but type "String" in subgraph "S2"]`,
    );
    expect(callbackArgs.compositionMetadata.id).toEqual('abc');
    expect(experimental_didFailComposition).toBeCalled();
  });

  it('calls experimental_didUpdateComposition on schema update', async () => {
    const compositionMetadata = {
      formatVersion: 1,
      id: 'abc',
      implementingServiceLocations: [],
      schemaHash: 'hash1',
    };

    const update: Experimental_UpdateServiceDefinitions = async () => ({
      serviceDefinitions,
      isNewSchema: true,
      compositionMetadata: {
        ...compositionMetadata,
        id: '123',
        schemaHash: 'hash2',
      },
    });

    // This is the simplest way I could find to achieve mocked functions that leverage our types
    const mockUpdate = jest.fn(update);

    // We want to return a different composition across two ticks, so we mock it
    // slightly differenty
    mockUpdate.mockImplementationOnce(async () => {
      const services = serviceDefinitions.filter(s => s.name !== 'books');
      return {
        serviceDefinitions: [
          ...services,
          {
            name: 'book',
            typeDefs: books.typeDefs,
            url: 'http://localhost:32542',
          },
        ],
        isNewSchema: true,
        compositionMetadata,
      };
    });

    const mockDidUpdate = jest.fn();

    const gateway = new ApolloGateway({
      experimental_updateServiceDefinitions: mockUpdate,
      experimental_didUpdateComposition: mockDidUpdate,
      logger,
    });
    // @ts-ignore for testing purposes, a short pollInterval is ideal so we'll override here
    gateway.experimental_pollInterval = 100;

    let resolve1: Function;
    let resolve2: Function;
    const schemaChangeBlocker1 = new Promise(res => (resolve1 = res));
    const schemaChangeBlocker2 = new Promise(res => (resolve2 = res));

    gateway.onSchemaChange(
      jest
        .fn()
        .mockImplementationOnce(() => resolve1())
        .mockImplementationOnce(() => resolve2()),
    );

    await gateway.load();

    await schemaChangeBlocker1;
    expect(mockUpdate).toBeCalledTimes(1);
    expect(mockDidUpdate).toBeCalledTimes(1);

    await schemaChangeBlocker2;
    expect(mockUpdate).toBeCalledTimes(2);
    expect(mockDidUpdate).toBeCalledTimes(2);

    const [firstCall, secondCall] = mockDidUpdate.mock.calls;

    expect(firstCall[0]!.schema).toBeDefined();
    expect(firstCall[0].compositionMetadata!.schemaHash).toEqual('hash1');
    // first call should have no second "previous" argument
    expect(firstCall[1]).toBeUndefined();

    expect(secondCall[0].schema).toBeDefined();
    expect(secondCall[0].compositionMetadata!.schemaHash).toEqual('hash2');
    // second call should have previous info in the second arg
    expect(secondCall[1]!.schema).toBeDefined();
    expect(secondCall[1]!.compositionMetadata!.schemaHash).toEqual('hash1');

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
      experimental_pollInterval: 10,
      logger,
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Polling running services is dangerous and not recommended in production. Polling should only be used against a registry. If you are polling running services, use with caution.',
    );
  });

  it('registers schema change callbacks when experimental_pollInterval is set for unmanaged configs', async () => {
    const experimental_updateServiceDefinitions: Experimental_UpdateServiceDefinitions = jest.fn(
      async (_config) => {
        return { serviceDefinitions, isNewSchema: true };
      },
    );

    const gateway = new ApolloGateway({
      serviceList: [{ name: 'book', url: 'http://localhost:32542' }],
      experimental_updateServiceDefinitions,
      experimental_pollInterval: 100,
      logger,
    });

    let resolve: Function;
    const schemaChangeBlocker = new Promise(res => (resolve = res));
    const schemaChangeCallback = jest.fn(() => resolve());

    gateway.onSchemaChange(schemaChangeCallback);
    await gateway.load();

    await schemaChangeBlocker;

    expect(schemaChangeCallback).toBeCalledTimes(1);
    await gateway.stop();
  });

  it('calls experimental_didResolveQueryPlan when executor is called', async () => {
    const experimental_didResolveQueryPlan: Experimental_DidResolveQueryPlanCallback = jest.fn()

    const gateway = new ApolloGateway({
      localServiceList: [
        books
      ],
      experimental_didResolveQueryPlan,
    });

    const { executor } = await gateway.load();

    const source = `#graphql
      { book(isbn: "0262510871") { year } }
    `;

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
