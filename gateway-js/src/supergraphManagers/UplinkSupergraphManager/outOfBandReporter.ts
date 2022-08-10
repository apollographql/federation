import { FetcherResponse, type Fetcher } from '@apollo/utils.fetcher';
import { GraphQLError } from 'graphql';
import {
  ErrorCode,
  OobReportMutation,
  OobReportMutationVariables,
} from '../../__generated__/graphqlTypes';

// Magic /* GraphQL */ comment below is for codegen, do not remove
export const OUT_OF_BAND_REPORTER_QUERY = /* GraphQL */`#graphql
  mutation OOBReport($input: APIMonitoringReport) {
    reportError(report: $input)
  }
`;

const { name, version } = require('../../../package.json');

type OobReportMutationResult =
  | OobReportMutationSuccess
  | OobReportMutationFailure;

interface OobReportMutationSuccess {
  data: OobReportMutation;
}

interface OobReportMutationFailure {
  data?: OobReportMutation;
  errors: GraphQLError[];
}

export async function submitOutOfBandReportIfConfigured({
  error,
  requestEndpoint,
  requestBody,
  endpoint,
  response,
  startedAt,
  endedAt,
  tags,
  fetcher,
}: {
  error: Error;
  requestEndpoint: string;
  requestBody: string;
  endpoint: string | undefined;
  response?: FetcherResponse;
  startedAt: Date;
  endedAt: Date;
  tags?: string[];
  fetcher: Fetcher;
}) {
  // don't send report if the endpoint url is not configured
  if (!endpoint) {
    return;
  }

  let errorCode: ErrorCode;
  if (!response) {
    errorCode = ErrorCode.ConnectionFailed;
  } else {
    // possible error situations to check against
    switch (response.status) {
      case 400:
      case 413:
      case 422:
        errorCode = ErrorCode.InvalidBody;
        break;
      case 408:
      case 504:
        errorCode = ErrorCode.Timeout;
        break;
      case 502:
      case 503:
        errorCode = ErrorCode.ConnectionFailed;
        break;
      default:
        errorCode = ErrorCode.Other;
    }
  }

  const responseBody: string | undefined = await response?.text();

  const variables: OobReportMutationVariables = {
    input: {
      error: {
        code: errorCode,
        message: error.message,
      },
      request: {
        url: requestEndpoint,
        body: requestBody,
      },
      response: response
        ? {
            httpStatusCode: response.status,
            body: responseBody,
          }
        : null,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      tags: tags,
    },
  };

  try {
    const oobResponse = await fetcher(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        query: OUT_OF_BAND_REPORTER_QUERY,
        variables,
      }),
      headers: {
        'apollographql-client-name': name,
        'apollographql-client-version': version,
        'user-agent': `${name}/${version}`,
        'content-type': 'application/json',
      },
    });
    const parsedResponse: OobReportMutationResult = await oobResponse.json();
    if (!parsedResponse?.data?.reportError) {
      throw new Error(
        `Out-of-band error reporting failed: ${oobResponse.status} ${oobResponse.statusText}`,
      );
    }
  } catch (e) {
    throw new Error(`Out-of-band error reporting failed: ${e.message ?? e}`);
  }
}
