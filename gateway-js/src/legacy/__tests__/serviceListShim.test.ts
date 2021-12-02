import nock from 'nock';
import { fixtures, fixturesWithUpdate } from 'apollo-federation-integration-testsuite';
import { RemoteGraphQLDataSource, ServiceEndpointDefinition } from '../..';
import { ServiceListShim } from '../serviceListShim';
import { mockAllServicesSdlQuerySuccess } from '../../__tests__/integration/nockMocks';
import { wait, waitUntil } from '../../__tests__/execution-utils';

describe('ServiceListShim', () => {
  beforeEach(async () => {
    if (!nock.isActive()) nock.activate();
  });
  afterEach(async () => {
    expect(nock.isDone()).toBeTruthy();
    nock.cleanAll();
    nock.restore();
  });

  it('constructs', () => {
    expect(
      () =>
        new ServiceListShim({
          serviceList: fixtures,
        }),
    ).not.toThrow();
  });

  it('is instance callable (simulating the gateway calling it)', async () => {
    mockAllServicesSdlQuerySuccess();
    const shim = new ServiceListShim({ serviceList: fixtures });
    await expect(shim({ async update() {} })).resolves.toBeTruthy();
  });

  function getDataSourceSpy(definition: ServiceEndpointDefinition) {
    const datasource = new RemoteGraphQLDataSource({
      url: definition.url,
    });
    const processSpy = jest.fn(datasource.process);
    datasource.process = processSpy;
    return { datasource, processSpy };
  }

  it('uses `GraphQLDataSource`s provided by the `buildService` function', async () => {
    mockAllServicesSdlQuerySuccess();

    const processSpies: jest.Mock[] = [];

    const shim = new ServiceListShim({
      serviceList: fixtures,
      buildService(def) {
        const { datasource, processSpy } = getDataSourceSpy(def);
        processSpies.push(processSpy);
        return datasource;
      },
    });

    await shim({ async update() {} });

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

    const [p1, r1] = waitUntil();
    const [p2, r2] = waitUntil();
    const [p3, r3] = waitUntil();

    // `update` (below) is called each time we poll (and there's an update to
    // the supergraph), so this is a reasonable hook into "when" the poll
    // happens and drives this test cleanly with `Promise`s.
    const updateSpy = jest
      .fn()
      .mockImplementationOnce(() => r1())
      .mockImplementationOnce(() => r2())
      .mockImplementationOnce(() => r3());

    const shim = new ServiceListShim({
      serviceList: fixtures,
      pollIntervalInMs: 10,
    });

    const { cleanup } = await shim({
      async update(supergraphSdl) {
        updateSpy(supergraphSdl);
      },
    });

    await Promise.all([p1, p2, p3]);

    expect(updateSpy).toHaveBeenCalledTimes(3);

    // stop polling
    await cleanup!();

    // ensure we cancelled the timer
    // @ts-ignore
    expect(shim.timerRef).toBe(null);
  });

  // TODO: useFakeTimers (though I'm struggling to get this to work as expected)
  it("doesn't call `update` when there's no change to the supergraph", async () => {
    // mock for initial load and a few polls against an unchanging schema
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess();
    mockAllServicesSdlQuerySuccess();

    const shim = new ServiceListShim({
      serviceList: fixtures,
      pollIntervalInMs: 100,
    });

    const updateSpy = jest.fn();
    const { cleanup } = await shim({
      async update(supergraphSdl) {
        updateSpy(supergraphSdl);
      },
    });

    // let the shim poll through all the active mocks
    while (nock.activeMocks().length > 0) {
      await wait(10);
    }

    // stop polling
    await cleanup!();

    expect(updateSpy).toHaveBeenCalledTimes(0);
  });
});
