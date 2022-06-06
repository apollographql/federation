import nock from 'nock';
import {
  fixtures,
  fixturesWithUpdate,
} from 'apollo-federation-integration-testsuite';
import { nockBeforeEach, nockAfterEach } from '../../../__tests__/nockAssertions';
import { RemoteGraphQLDataSource, ServiceEndpointDefinition } from '../../..';
import { IntrospectAndCompose } from '..';
import { mockAllServicesSdlQuerySuccess } from '../../../__tests__/integration/nockMocks';
import { getTestingSupergraphSdl, wait } from '../../../__tests__/execution-utils';
import resolvable from '@josephg/resolvable';
import type { Logger } from '@apollo/utils.logger';

describe('IntrospectAndCompose', () => {
  beforeEach(nockBeforeEach);
  afterEach(nockAfterEach);

  it('constructs', () => {
    expect(
      () =>
        new IntrospectAndCompose({
          subgraphs: fixtures,
        }),
    ).not.toThrow();
  });

  it('has an `initialize` property which is callable (simulating the gateway calling it)', async () => {
    mockAllServicesSdlQuerySuccess();
    const instance = new IntrospectAndCompose({ subgraphs: fixtures });
    await expect(
      instance.initialize({
        update() {},
        async healthCheck() {},
        getDataSource({ url }) {
          return new RemoteGraphQLDataSource({ url });
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('uses `GraphQLDataSource`s provided by the `buildService` function', async () => {
    mockAllServicesSdlQuerySuccess();

    const processSpies: jest.SpyInstance[] = [];
    function getDataSourceSpy(definition: ServiceEndpointDefinition) {
      const datasource = new RemoteGraphQLDataSource({
        url: definition.url,
      });
      const processSpy = jest.spyOn(datasource, 'process');
      processSpies.push(processSpy);
      return datasource;
    }

    const instance = new IntrospectAndCompose({
      subgraphs: fixtures,
    });

    await instance.initialize({
      update() {},
      async healthCheck() {},
      getDataSource: getDataSourceSpy,
    });

    expect(processSpies.length).toBe(fixtures.length);
    for (const processSpy of processSpies) {
      expect(processSpy).toHaveBeenCalledTimes(1);
    }
  });

  it('polls services when a `pollInterval` is set and stops when `cleanup` is called', async () => {
    // This is mocked 4 times to include the initial load (followed by 3 polls)
    // We need to alternate schemas, else the update will be ignored
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess(fixturesWithUpdate);
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess(fixturesWithUpdate);

    const p1 = resolvable();
    const p2 = resolvable();
    const p3 = resolvable();

    // `update` (below) is called each time we poll (and there's an update to
    // the supergraph), so this is a reasonable hook into "when" the poll
    // happens and drives this test cleanly with `Promise`s.
    const updateSpy = jest
      .fn()
      .mockImplementationOnce(() => p1.resolve())
      .mockImplementationOnce(() => p2.resolve())
      .mockImplementationOnce(() => p3.resolve());

    const instance = new IntrospectAndCompose({
      subgraphs: fixtures,
      pollIntervalInMs: 10,
    });

    const { cleanup } = await instance.initialize({
      update(supergraphSdl) {
        updateSpy(supergraphSdl);
      },
      async healthCheck() {},
      getDataSource({ url }) {
        return new RemoteGraphQLDataSource({ url });
      },
    });

    await Promise.all([p1, p2, p3]);

    expect(updateSpy).toHaveBeenCalledTimes(3);

    // stop polling
    await cleanup!();

    expect(updateSpy).toHaveBeenCalledTimes(3);

    // ensure we cancelled the timer
    // @ts-ignore
    expect(instance.timerRef).toBe(null);
  });

  // TODO: useFakeTimers (though I'm struggling to get this to work as expected)
  it("doesn't call `update` when there's no change to the supergraph", async () => {
    // mock for initial load and a few polls against an unchanging schema
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess();

    const instance = new IntrospectAndCompose({
      subgraphs: fixtures,
      pollIntervalInMs: 100,
    });

    const updateSpy = jest.fn();
    const { cleanup } = await instance.initialize({
      update(supergraphSdl) {
        updateSpy(supergraphSdl);
      },
      async healthCheck() {},
      getDataSource({ url }) {
        return new RemoteGraphQLDataSource({
          url,
        });
      },
    });

    // let the instance poll through all the active mocks
    // wouldn't need to do this if I could get fakeTimers working as expected
    while (nock.activeMocks().length > 0) {
      await wait(0);
    }

    await cleanup!();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('issues subgraph health checks when enabled (and polling)', async () => {
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess(fixturesWithUpdate);

    const healthCheckPromiseOnLoad = resolvable();
    const healthCheckPromiseOnUpdate = resolvable();

    const healthCheckSpy = jest
      .fn()
      .mockImplementationOnce(() => healthCheckPromiseOnLoad.resolve())
      .mockImplementationOnce(() => healthCheckPromiseOnUpdate.resolve());

    const instance = new IntrospectAndCompose({
      subgraphs: fixtures,
      pollIntervalInMs: 10,
      subgraphHealthCheck: true,
    });

    const { cleanup } = await instance.initialize({
      update() {},
      async healthCheck(supergraphSdl) {
        healthCheckSpy(supergraphSdl);
      },
      getDataSource({ url }) {
        return new RemoteGraphQLDataSource({ url });
      },
    });

    await Promise.all([
      healthCheckPromiseOnLoad,
      healthCheckPromiseOnUpdate,
    ]);

    expect(healthCheckSpy).toHaveBeenNthCalledWith(
      1,
      getTestingSupergraphSdl(fixtures),
    );
    expect(healthCheckSpy).toHaveBeenNthCalledWith(
      2,
      getTestingSupergraphSdl(fixturesWithUpdate),
    );

    // stop polling
    await cleanup!();
  });

  describe('errors', () => {
    it('logs an error when `update` function throws', async () => {
      const errorLoggedPromise = resolvable();

      const errorSpy = jest.fn(() => {
        errorLoggedPromise.resolve();
      });
      const logger: Logger = {
        error: errorSpy,
        debug() {},
        info() {},
        warn() {},
      };

      // mock successful initial load
      mockAllServicesSdlQuerySuccess();

      // mock first update
      mockAllServicesSdlQuerySuccess(fixturesWithUpdate);

      const instance = new IntrospectAndCompose({
        subgraphs: fixtures,
        pollIntervalInMs: 1000,
        logger,
      });

      const thrownErrorMessage = 'invalid supergraph';
      // simulate gateway throwing an error when `update` is called
      const updateSpy = jest.fn().mockImplementationOnce(() => {
        throw new Error(thrownErrorMessage);
      });

      const { cleanup } = await instance.initialize({
        update: updateSpy,
        async healthCheck() {},
        getDataSource({ url }) {
          return new RemoteGraphQLDataSource({ url });
        },
      });

      await errorLoggedPromise;
      // stop polling
      await cleanup!();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        `IntrospectAndCompose failed to update supergraph with the following error: ${thrownErrorMessage}`,
      );
    });

    it('fails to load when `healthCheck` function throws on startup', async () => {
      mockAllServicesSdlQuerySuccess();

      const expectedErrorMsg = 'error reaching subgraph';
      const errorLoggedPromise = resolvable();
      const errorSpy = jest.fn(() => {
        errorLoggedPromise.resolve();
      });
      const logger: Logger = {
        error: errorSpy,
        debug() {},
        info() {},
        warn() {},
      };

      const updateSpy = jest.fn();

      const instance = new IntrospectAndCompose({
        subgraphs: fixtures,
        pollIntervalInMs: 10,
        subgraphHealthCheck: true,
        logger,
      });

      await expect(
        instance.initialize({
          update() {
            updateSpy();
          },
          async healthCheck() {
            throw new Error(expectedErrorMsg);
          },
          getDataSource({ url }) {
            return new RemoteGraphQLDataSource({ url });
          },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`"error reaching subgraph"`);

      await errorLoggedPromise;

      expect(errorSpy).toHaveBeenCalledWith(
        `IntrospectAndCompose failed to update supergraph with the following error: ${expectedErrorMsg}`,
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('does not attempt to update when `healthCheck` function throws', async () => {
      mockAllServicesSdlQuerySuccess();
      mockAllServicesSdlQuerySuccess(fixturesWithUpdate);

      const expectedErrorMsg = 'error reaching subgraph';
      const errorLoggedPromise = resolvable();
      const errorSpy = jest.fn(() => {
        errorLoggedPromise.resolve();
      });
      const logger: Logger = {
        error: errorSpy,
        debug() {},
        info() {},
        warn() {},
      };

      const healthCheckPromiseOnLoad = resolvable();
      const healthCheckPromiseOnUpdate = resolvable();
      const healthCheckSpyWhichEventuallyThrows = jest
        .fn()
        .mockImplementationOnce(() => healthCheckPromiseOnLoad.resolve())
        .mockImplementationOnce(() => {
          healthCheckPromiseOnUpdate.resolve();
          throw new Error(expectedErrorMsg);
        });

      const updateSpy = jest.fn();

      const instance = new IntrospectAndCompose({
        subgraphs: fixtures,
        pollIntervalInMs: 10,
        subgraphHealthCheck: true,
        logger,
      });

      const { cleanup } = await instance.initialize({
        update() {
          updateSpy();
        },
        async healthCheck(supergraphSdl) {
          healthCheckSpyWhichEventuallyThrows(supergraphSdl);
        },
        getDataSource({ url }) {
          return new RemoteGraphQLDataSource({ url });
        },
      });

      await Promise.all([
        healthCheckPromiseOnLoad,
        healthCheckPromiseOnUpdate,
        errorLoggedPromise,
      ]);

      expect(errorSpy).toHaveBeenCalledWith(
        `IntrospectAndCompose failed to update supergraph with the following error: ${expectedErrorMsg}`,
      );
      expect(healthCheckSpyWhichEventuallyThrows).toHaveBeenCalledTimes(2);
      // update isn't called on load so this shouldn't be called even once
      expect(updateSpy).not.toHaveBeenCalled();

      // stop polling
      await cleanup!();
    });
  });
});
