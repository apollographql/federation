import {
  loadSupergraphSdlFromStorage,
  loadSupergraphSdlFromUplinks,
  UplinkFetcherError,
} from '../loadSupergraphSdlFromStorage';
import { getDefaultFetcher } from '../../..';
import {
  graphRef,
  apiKey,
  mockCloudConfigUrl1,
  mockCloudConfigUrl2,
  mockOutOfBandReporterUrl,
  mockSupergraphSdlRequest,
  mockOutOfBandReportRequestSuccess,
  mockSupergraphSdlRequestSuccess,
  mockSupergraphSdlRequestIfAfterUnchanged,
  mockSupergraphSdlRequestIfAfter
} from '../../../__tests__/integration/nockMocks';
import { getTestingSupergraphSdl } from "../../../__tests__/execution-utils";
import { nockAfterEach, nockBeforeEach } from '../../../__tests__/nockAssertions';

describe('loadSupergraphSdlFromStorage', () => {
  beforeEach(nockBeforeEach);
  afterEach(nockAfterEach);

  it('fetches Supergraph SDL as expected', async () => {
    mockSupergraphSdlRequestSuccess();
    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromStorage({
      graphRef,
      apiKey,
      endpoint: mockCloudConfigUrl1,
      errorReportingEndpoint: undefined,
      fetcher,
      compositionId: null,
    });
    expect(result).toMatchObject({
      id: 'originalId-1234',
      supergraphSdl: getTestingSupergraphSdl(),
    });
  });

  it('Queries alternate Uplink URL if first one fails', async () => {
    mockSupergraphSdlRequest('originalId-1234', mockCloudConfigUrl1).reply(500);
    mockSupergraphSdlRequestIfAfter('originalId-1234', mockCloudConfigUrl2).reply(
      200,
      JSON.stringify({
        data: {
          routerConfig: {
            __typename: 'RouterConfigResult',
            id: 'originalId-1234',
            supergraphSdl: getTestingSupergraphSdl()
          },
        },
      }),
    );

    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromUplinks({
      graphRef,
      apiKey,
      endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
      errorReportingEndpoint: undefined,
      fetcher,
      compositionId: "originalId-1234",
      maxRetries: 1
    });

    expect(result).toMatchObject({
      id: 'originalId-1234',
      supergraphSdl: getTestingSupergraphSdl(),
    });
  });

  it('Throws error if all Uplink URLs fail', async () => {
    mockSupergraphSdlRequest("originalId-1234", mockCloudConfigUrl1).reply(500);
    mockSupergraphSdlRequestIfAfter("originalId-1234", mockCloudConfigUrl2).reply(500);

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromUplinks({
        graphRef,
        apiKey,
        endpoints: [mockCloudConfigUrl1, mockCloudConfigUrl2],
        errorReportingEndpoint: undefined,
        fetcher,
        compositionId: "originalId-1234",
        maxRetries: 1
      }),
    ).rejects.toThrowError(
      new UplinkFetcherError(
        "An error occurred while fetching your schema from Apollo: 500 Internal Server Error",
      )
    );
  })

  describe('errors', () => {
    it('throws on a malformed response', async () => {
      mockSupergraphSdlRequest().reply(200, 'Invalid JSON');

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 200 invalid json response body at https://example1.cloud-config-url.com/cloudconfig/ reason: Unexpected token I in JSON at position 0"
        )
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

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(`An error occurred while fetching your schema from Apollo: \n${message}`)
      );
    });

    it("throws on non-OK status codes when `errors` isn't present in a JSON response", async () => {
      mockSupergraphSdlRequest().reply(500);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 500 Internal Server Error"
        )
      );
    });

    // if an additional request were made by the out of band reporter, nock would throw since it's unmocked
    // and this test would fail
    it("Out of band reporting doesn't submit reports when endpoint is not configured", async () => {
      mockSupergraphSdlRequest().reply(400);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 400 invalid json response body at https://example1.cloud-config-url.com/cloudconfig/ reason: Unexpected end of JSON input",
        )
      );
    });

    it('throws on 400 status response and does not submit an out of band error', async () => {

      mockSupergraphSdlRequest().reply(400);

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 400 invalid json response body at https://example1.cloud-config-url.com/cloudconfig/ reason: Unexpected end of JSON input",
        )
      );
    });

    it('throws on 413 status response and successfully submits an out of band error', async () => {
      mockSupergraphSdlRequest().reply(413);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 413 Payload Too Large",
        )
      );
    });

    it('throws on 422 status response and successfully submits an out of band error', async () => {
      mockSupergraphSdlRequest().reply(422);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 422 Unprocessable Entity",
        )
      );
    });

    it('throws on 408 status response and successfully submits an out of band error', async () => {
      mockSupergraphSdlRequest().reply(408);
      mockOutOfBandReportRequestSuccess();

      const fetcher = getDefaultFetcher();
      await expect(
        loadSupergraphSdlFromStorage({
          graphRef,
          apiKey,
          endpoint: mockCloudConfigUrl1,
          errorReportingEndpoint: mockOutOfBandReporterUrl,
          fetcher,
          compositionId: null,
        }),
      ).rejects.toThrowError(
        new UplinkFetcherError(
          "An error occurred while fetching your schema from Apollo: 408 Request Timeout",
        )
      );
    });
  });

  it('throws on 504 status response and successfully submits an out of band error', async () => {

    mockSupergraphSdlRequest().reply(504);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl1,
        errorReportingEndpoint: mockOutOfBandReporterUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowError(
      new UplinkFetcherError(
        "An error occurred while fetching your schema from Apollo: 504 Gateway Timeout",
      )
    );
  });

  it('throws when there is no response and successfully submits an out of band error', async () => {
    mockSupergraphSdlRequest().replyWithError('no response');
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl1,
        errorReportingEndpoint: mockOutOfBandReporterUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowError(
      new UplinkFetcherError(
        "An error occurred while fetching your schema from Apollo: request to https://example1.cloud-config-url.com/cloudconfig/ failed, reason: no response",
      )
    );
  });

  it('throws on 502 status response and successfully submits an out of band error', async () => {
    mockSupergraphSdlRequest().reply(502);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl1,
        errorReportingEndpoint: mockOutOfBandReporterUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowError(
      new UplinkFetcherError(
        "An error occurred while fetching your schema from Apollo: 502 Bad Gateway",
      )
    );
  });

  it('throws on 503 status response and successfully submits an out of band error', async () => {
    mockSupergraphSdlRequest().reply(503);
    mockOutOfBandReportRequestSuccess();

    const fetcher = getDefaultFetcher();
    await expect(
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl1,
        errorReportingEndpoint: mockOutOfBandReporterUrl,
        fetcher,
        compositionId: null,
      }),
    ).rejects.toThrowError(
      new UplinkFetcherError(
        "An error occurred while fetching your schema from Apollo: 503 Service Unavailable",
      )
    );
  });

  it('successfully responds to SDL unchanged by returning null', async () => {
    mockSupergraphSdlRequestIfAfterUnchanged("id-1234");

    const fetcher = getDefaultFetcher();
    const result = await loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: mockCloudConfigUrl1,
        errorReportingEndpoint: mockOutOfBandReporterUrl,
        fetcher,
        compositionId: "id-1234",
    });
    expect(result).toBeNull();
  });
});

