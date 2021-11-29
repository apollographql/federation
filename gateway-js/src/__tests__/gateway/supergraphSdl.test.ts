import { ApolloGateway, SupergraphSdlUpdateFunction } from '@apollo/gateway';
import { fixturesWithUpdate } from 'apollo-federation-integration-testsuite';
import { createHash } from 'crypto';
import { ApolloServer } from 'apollo-server';
import { Logger } from 'apollo-server-types';
import { fetch } from '../../__mocks__/apollo-server-env';
import { getTestingSupergraphSdl, waitUntil } from '../execution-utils';

async function getSupergraphSdlGatewayServer() {
  const server = new ApolloServer({
    gateway: new ApolloGateway({
      supergraphSdl: getTestingSupergraphSdl(),
    }),
  });

  await server.listen({ port: 0 });
  return server;
}

let logger: Logger;
beforeEach(() => {
  logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
});

describe('Using supergraphSdl static configuration', () => {
  it('successfully starts and serves requests to the proper services', async () => {
    const server = await getSupergraphSdlGatewayServer();

    fetch.mockJSONResponseOnce({
      data: { me: { username: '@jbaxleyiii' } },
    });

    const result = await server.executeOperation({
      query: '{ me { username } }',
    });

    expect(result.data).toMatchInlineSnapshot(`
      Object {
        "me": Object {
          "username": "@jbaxleyiii",
        },
      }
    `);

    const [url, request] = fetch.mock.calls[0];
    expect(url).toEqual('https://accounts.api.com');
    expect(request?.body).toEqual(
      JSON.stringify({ query: '{me{username}}', variables: {} }),
    );
    await server.stop();
  });
});

describe('Using supergraphSdl dynamic configuration', () => {
  it('starts and remains in `initialized` state until user Promise resolves', async () => {
    const [forGatewayToHaveCalledSupergraphSdl, resolve] = waitUntil();

    const gateway = new ApolloGateway({
      async supergraphSdl() {
        resolve();
        return new Promise(() => {});
      },
    });

    await forGatewayToHaveCalledSupergraphSdl;
    expect(gateway.__testing().state.phase).toEqual('initialized');
  });

  it('starts and waits in `initialized` state after calling load but before user Promise resolves', async () => {
    const gateway = new ApolloGateway({
      async supergraphSdl() {
        return new Promise(() => {});
      },
    });

    gateway.load();

    expect(gateway.__testing().state.phase).toEqual('initialized');
  });

  it('moves from `initialized` to `loaded` state after calling `load()` and after user Promise resolves', async () => {
    const [userPromise, resolveSupergraph] =
      waitUntil<{ supergraphSdl: string }>();

    const gateway = new ApolloGateway({
      async supergraphSdl() {
        return userPromise;
      },
    });

    const loadPromise = gateway.load();
    expect(gateway.__testing().state.phase).toEqual('initialized');

    const supergraphSdl = getTestingSupergraphSdl();
    const expectedCompositionId = createHash('sha256')
      .update(supergraphSdl)
      .digest('hex');
    resolveSupergraph({ supergraphSdl });

    await loadPromise;
    const { state, compositionId } = gateway.__testing();
    expect(state.phase).toEqual('loaded');
    expect(compositionId).toEqual(expectedCompositionId);
  });

  it('updates its supergraph after user calls update function', async () => {
    const [userPromise, resolveSupergraph] =
      waitUntil<{ supergraphSdl: string }>();

    let userUpdateFn: SupergraphSdlUpdateFunction;
    const gateway = new ApolloGateway({
      async supergraphSdl({ update }) {
        userUpdateFn = update;
        return userPromise;
      },
    });

    const supergraphSdl = getTestingSupergraphSdl();
    const expectedId = createHash('sha256').update(supergraphSdl).digest('hex');
    resolveSupergraph({ supergraphSdl: getTestingSupergraphSdl() });
    await gateway.load();
    expect(gateway.__testing().compositionId).toEqual(expectedId);

    const updatedSupergraphSdl = getTestingSupergraphSdl(fixturesWithUpdate);
    const expectedUpdatedId = createHash('sha256')
      .update(updatedSupergraphSdl)
      .digest('hex');
    await userUpdateFn!(updatedSupergraphSdl);
    expect(gateway.__testing().compositionId).toEqual(expectedUpdatedId);
  });

  it('calls user-provided `cleanup` function when stopped', async () => {
    const cleanup = jest.fn(() => Promise.resolve());
    const gateway = new ApolloGateway({
      async supergraphSdl() {
        return {
          supergraphSdl: getTestingSupergraphSdl(),
          cleanup,
        };
      },
    });

    await gateway.load();
    const { state, compositionId } = gateway.__testing();
    expect(state.phase).toEqual('loaded');
    expect(compositionId).toEqual(
      '562c22b3382b56b1651944a96e89a361fe847b9b32660eae5ecbd12adc20bf8b',
    );

    await gateway.stop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  describe('errors', () => {
    it('fails to load if user-provided `supergraphSdl` function throws', async () => {
      const gateway = new ApolloGateway({
        async supergraphSdl() {
          throw new Error('supergraphSdl failed');
        },
        logger,
      });

      await expect(() =>
        gateway.load(),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `"User provided \`supergraphSdl\` function did not return an object containing a \`supergraphSdl\` property"`,
      );

      expect(gateway.__testing().state.phase).toEqual('failed to load');
      expect(logger.error).toHaveBeenCalledWith(
        'User-defined `supergraphSdl` function threw error: supergraphSdl failed',
      );
    });

    it('gracefully handles Promise rejections from user `cleanup` function', async () => {
      const rejectionMessage = 'thrown from cleanup function';
      const cleanup = jest.fn(() => Promise.reject(rejectionMessage));
      const gateway = new ApolloGateway({
        async supergraphSdl() {
          return {
            supergraphSdl: getTestingSupergraphSdl(),
            cleanup,
          };
        },
        logger,
      });

      await gateway.load();
      await expect(gateway.stop()).resolves.toBeUndefined();
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Error occured while calling user provided `cleanup` function: ' +
          rejectionMessage,
      );
    });
  });
});
