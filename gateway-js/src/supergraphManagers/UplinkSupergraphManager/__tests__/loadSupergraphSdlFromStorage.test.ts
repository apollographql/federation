import nock from 'nock';
import {
  loadSupergraphSdlFromStorage,
  loadSupergraphSdlFromUplinks,
  UplinkFetcherError,
} from '../loadSupergraphSdlFromStorage';
import fetcher from 'make-fetch-happen';
import {
  graphRef,
  apiKey,
  mockCloudConfigUrl1,
  mockCloudConfigUrl2,
  mockSupergraphSdlRequest,
  mockSupergraphSdlRequestSuccess,
  mockSupergraphSdlRequestIfAfterUnchanged,
  mockSupergraphSdlRequestIfAfter,
} from '../../../__tests__/integration/nockMocks';
import { getTestingSupergraphSdl } from '../../../__tests__/execution-utils';
import {
  nockAfterEach,
  nockBeforeEach,
} from '../../../__tests__/nockAssertions';
import { FetcherRequestInit } from '@apollo/utils.fetcher';

const logger = {
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
};

const requestTimeoutMs = 100;

describe('loadSupergraphSdlFromStorage', () => {
  beforeEach(nockBeforeEach);
  afterEach(nockAfterEach);

  it('fetches Supergraph SDL as expected', async () => {
    mockSupergraphSdlRequestSuccess();
    const result = await loadSupergraphSdlFromStorage({
      graphRef,
      apiKey,
      endpoint: mockCloudConfigUrl1,
      fetcher,
      requestTimeoutMs,
      compositionId: null,
      logger,
    });
    expect(result).toMatchObject({
      id: 'originalId-1234',
      supergraphSdl: getTestingSupergraphSdl(),
    });
  });

  it('Queries alternate Uplink URL if first one fails', async () => {
    mockSupergraphSdlRequest('originalId-1234', mockCloudConfigUrl1).reply(500);
    mockSupergraphSdlRequestIfAfter(
      'originalId-1234',
      mockCloudConfigUrl2,
    ).reply(
      200,
      JSON.stringify({
        data: {
          routerConfig: {
            __typename: 'RouterConfigResult',
            id: 'originalId-1234',
            supergraphSdl: getTestingSupergraphSdl(),
          },
        },
      }),
    );

    const result = await loadSupergraphSdlFromUplinks({
      graphRef,
      apiKey,
      endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
      fetcher,
      requestTimeoutMs,
      compositionId: 'originalId-1234',
      maxRetries: 1,
      roundRobinSeed: 0,
      logger,
    });

    expect(result).toMatchObject({
      id: 'originalId-1234',
      supergraphSdl: getTestingSupergraphSdl(),
    });
  });

  it('Queries alternate Uplink URL if first one times out', async () => {
    mockSupergraphSdlRequest('originalId-1234', mockCloudConfigUrl1)
      .delay(120_000)
      .reply(500);
    mockSupergraphSdlRequestIfAfter(
      'originalId-1234',
      mockCloudConfigUrl2,
    ).reply(
      200,
      JSON.stringify({
        data: {
          routerConfig: {
            __typename: 'RouterConfigResult',
            id: 'originalId-1234',
            supergraphSdl: getTestingSupergraphSdl(),
          },
        },
      }),
    );

    const result = await loadSupergraphSdlFromUplinks({
      graphRef,
      apiKey,
      endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
      fetcher,
      requestTimeoutMs,
      compositionId: 'originalId-1234',
      maxRetries: 1,
      roundRobinSeed: 0,
      logger,
    });

    expect(result).toMatchObject({
      id: 'originalId-1234',
      supergraphSdl: getTestingSupergraphSdl(),
    });

    // We're intentionally delaying the response above, so we need to make sure
    // nock shuts down correctly, and isn't related to the underlying abort
    // mechanism.
    nock.abortPendingRequests();
  });

  it('Throws error if all Uplink URLs fail', async () => {
    mockSupergraphSdlRequest('originalId-1234', mockCloudConfigUrl1).reply(500);
    mockSupergraphSdlRequestIfAfter(
      'originalId-1234',
      mockCloudConfigUrl2,
    ).reply(500);

    await expect(
      loadSupergraphSdlFromUplinks({
        graphRef,
        apiKey,
        endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
        fetcher,
        requestTimeoutMs,
        compositionId: 'originalId-1234',
        maxRetries: 1,
        roundRobinSeed: 0,
        logger,
      }),
    ).rejects.toThrowError(
      new UplinkFetcherError(
        'An error occurred while fetching your schema from Apollo: 500 Internal Server Error',
      ),
    );
  });

  describe('errors', () => {
    it('throws on a malformed response', async () => {
      mockSupergraphSdlRequest().reply(200, 'Invalid JSON');

      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          fetcher,
          requestTimeoutMs,
          compositionId: null,
          logger,
        }),
      ).rejects.toThrowError(
        /An error occurred while fetching your schema from Apollo: 200 invalid json response body at https:\/\/example1.cloud-config-url.com\/cloudconfig\/ reason: Unexpected token/,
      );
    });

    it('throws errors from JSON on 400', async () => {
      const message = 'Query syntax error';
      mockSupergraphSdlRequest().reply(
        400,
        JSON.stringify({
          errors: [{ message }],
        }),
      );

      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          fetcher,
          requestTimeoutMs,
          compositionId: null,
          logger,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          `An error occurred while fetching your schema from Apollo: \n${message}`,
        ),
      );
    });

    it("throws on non-OK status codes when `errors` isn't present in a JSON response", async () => {
      mockSupergraphSdlRequest().reply(500);

      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          fetcher,
          requestTimeoutMs,
          compositionId: null,
          logger,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          'An error occurred while fetching your schema from Apollo: 500 Internal Server Error',
        ),
      );
    });
  });

  it('successfully responds to SDL unchanged by returning null', async () => {
    mockSupergraphSdlRequestIfAfterUnchanged('id-1234');

    const result = await loadSupergraphSdlFromStorage({
      graphRef,
      apiKey,
      endpoint: mockCloudConfigUrl1,
      fetcher,
      requestTimeoutMs,
      compositionId: 'id-1234',
      logger,
    });
    expect(result).toBeNull();
  });
});

describe('loadSupergraphSdlFromUplinks', () => {
  beforeEach(nockBeforeEach);
  afterEach(nockAfterEach);

  it("doesn't retry in the unchanged / null case", async () => {
    mockSupergraphSdlRequestIfAfterUnchanged('id-1234', mockCloudConfigUrl1);

    let calls = 0;
    const result = await loadSupergraphSdlFromUplinks({
      graphRef,
      apiKey,
      endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
      fetcher: (url: string, init?: FetcherRequestInit) => {
        calls++;
        return fetcher(url, init);
      },
      requestTimeoutMs,
      compositionId: 'id-1234',
      maxRetries: 5,
      roundRobinSeed: 0,
      logger,
    });

    expect(result).toBeNull();
    expect(calls).toBe(1);
  });

  it('Retries on error', async () => {
    mockSupergraphSdlRequest('originalId-1234', mockCloudConfigUrl1).reply(500);
    const supergraphSdl = getTestingSupergraphSdl();
    mockSupergraphSdlRequestIfAfter(
      'originalId-1234',
      mockCloudConfigUrl2,
    ).reply(
      200,
      JSON.stringify({
        data: {
          routerConfig: {
            __typename: 'RouterConfigResult',
            id: 'originalId-1234',
            supergraphSdl,
          },
        },
      }),
    );

    const result = await loadSupergraphSdlFromUplinks({
      graphRef,
      apiKey,
      endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
      fetcher,
      requestTimeoutMs,
      compositionId: 'originalId-1234',
      maxRetries: 1,
      roundRobinSeed: 0,
      logger,
    });

    expect(result?.supergraphSdl).toEqual(supergraphSdl);
  });
});
