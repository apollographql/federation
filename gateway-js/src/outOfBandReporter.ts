import { fetch, Response, Request } from 'apollo-server-env';
import { ApiMonitoringReport, ErrorCode } from './__generated__/graphqlTypes';


// Magic /* GraphQL */ comment below is for codegen, do not remove
export const OUT_OF_BAND_REPORTER_QUERY = /* GraphQL */`#graphql
  mutation OOBReport($input: APIMonitoringReport) {
    reportError(report: $input)
  }
`;

const { name, version } = require('../package.json');

export class OutOfBandReporter {
  endpoint: string | null;

  constructor() {
    this.endpoint = process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT || null;
  }

  async submitOutOfBandReport({
    error,
    request,
    response,
    startedAt,
    endedAt,
    tags,
    fetcher,
  }: {
    error: Error;
    request: Request;
    response?: Response;
    startedAt: Date;
    endedAt: Date;
    tags?: string[];
    fetcher: typeof fetch;
  }) {

    // don't send report if the endpoint url is not configured
    if (!this.endpoint) {
      return;
    }

    let errorCode = ErrorCode.Other;

    // some possible error situations to check against
    if (response?.status && [400, 413, 422].includes(response?.status)) {
      errorCode = ErrorCode.InvalidBody;
    }
    else if (response?.status && [408, 504].includes(response?.status)) {
      errorCode = ErrorCode.Timeout;
    }
    else if (!response || [502, 503].includes(response?.status)) {
      errorCode = ErrorCode.ConnectionFailed;
    }

    let responseBody: string;
    try{
      responseBody = await response?.json();
    } catch (e) {
      responseBody = '';
    }

    const oobVariables: ApiMonitoringReport = {
      error: {
        code: errorCode,
        message: error.message ?? error
      },
      request: {
        url: request.url,
        body: request.bodyUsed ? await request.json() : ''
      },
      response: response ? {
        httpStatusCode: response.status,
        body: responseBody
      } : null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      tags: tags
    }

    let oobResponse: Response;
    await fetcher(this.endpoint, {
      method: 'POST',
      body: JSON.stringify({
        query: OUT_OF_BAND_REPORTER_QUERY,
        variables: {
          input: oobVariables
        },
      }),
      headers: {
        'apollographql-client-name': name,
        'apollographql-client-version': version,
        'user-agent': `${name}/${version}`,
        'content-type': 'application/json',
      },
    }).then(result => {
      oobResponse = result;
      return result.json();
    }).then(response => {
      if (!response?.data?.reportError) {
        throw new Error(`Out-of-band error reporting failed: ${oobResponse.status} ${oobResponse.statusText}`);
      }
    }).catch(e => {
      throw new Error(`Out-of-band error reporting failed: ${e.message ?? e}`);
    })
  }
}
