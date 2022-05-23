import { GraphQLError } from 'graphql';
import retry from 'async-retry';
import { SupergraphSdlUpdate } from '../../config';
import { submitOutOfBandReportIfConfigured } from './outOfBandReporter';
import { SupergraphSdlQuery } from '../../__generated__/graphqlTypes';
import type {
  Fetcher,
  FetcherResponse,
  FetcherRequestInit,
} from '@apollo/utils.fetcher';
import type { Logger } from '@apollo/utils.logger';

// Magic /* GraphQL */ comment below is for codegen, do not remove
export const SUPERGRAPH_SDL_QUERY = /* GraphQL */`#graphql
  query SupergraphSdl($apiKey: String!, $ref: String!, $ifAfterId: ID) {
    routerConfig(ref: $ref, apiKey: $apiKey, ifAfterId: $ifAfterId) {
      __typename
      ... on RouterConfigResult {
        id
        supergraphSdl: supergraphSDL
        minDelaySeconds
      }
      ... on FetchError {
        code
        message
      }
    }
  }
`;


type SupergraphSdlQueryResult =
  | SupergraphSdlQuerySuccess
  | SupergraphSdlQueryFailure;

interface SupergraphSdlQuerySuccess {
  data: SupergraphSdlQuery;
}

interface SupergraphSdlQueryFailure {
  data?: SupergraphSdlQuery;
  errors: GraphQLError[];
}

const { name, version } = require('../../../package.json');

const fetchErrorMsg = "An error occurred while fetching your schema from Apollo: ";

export class UplinkFetcherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UplinkFetcherError';
  }
}

export async function loadSupergraphSdlFromUplinks({
  graphRef,
  apiKey,
  endpoints,
  errorReportingEndpoint,
  fetcher,
  compositionId,
  maxRetries,
  roundRobinSeed,
  earliestFetchTime,
  logger,
}: {
  graphRef: string;
  apiKey: string;
  endpoints: string[];
  errorReportingEndpoint: string | undefined,
  fetcher: Fetcher;
  compositionId: string | null;
  maxRetries: number,
  roundRobinSeed: number,
  earliestFetchTime: Date | null,
  logger?: Logger | undefined,
}) : Promise<SupergraphSdlUpdate | null> {
  // This Promise resolves with either an updated supergraph or null if no change.
  // This Promise can reject in the case that none of the retries are successful,
  // in which case it will reject with the most frequently encountered error.
  return retry(
    () =>
      loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: endpoints[roundRobinSeed++ % endpoints.length],
        errorReportingEndpoint,
        fetcher,
        compositionId,
        logger,
      }),
    {
      retries: maxRetries,
      onRetry: async () => {
        const delayMS = earliestFetchTime ? earliestFetchTime.getTime() - Date.now(): 0;
        logger?.debug(`Waiting ${delayMS}ms before retrying (earliest fetch time ${earliestFetchTime})...`);
        if (delayMS > 0) await new Promise(resolve => setTimeout(resolve, delayMS));
      }
    },
  );

}

export async function loadSupergraphSdlFromStorage({
  graphRef,
  apiKey,
  endpoint,
  errorReportingEndpoint,
  fetcher,
  compositionId,
  logger,
}: {
  graphRef: string;
  apiKey: string;
  endpoint: string;
  errorReportingEndpoint?: string;
  fetcher: Fetcher;
  compositionId: string | null;
  logger?: Logger | undefined;
}) : Promise<SupergraphSdlUpdate | null> {
  const requestBody = JSON.stringify({
    query: SUPERGRAPH_SDL_QUERY,
    variables: {
      ref: graphRef,
      apiKey,
      ifAfterId: compositionId,
    },
  })

  const requestDetails: FetcherRequestInit = {
    method: 'POST',
    body: requestBody,
    headers: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
  };

  const startTime = new Date();
  let result: FetcherResponse;
  try {
    logger?.debug(`🔧 Fetching supergraph schema from ${endpoint}`);
    result = await fetcher(endpoint, requestDetails);
  } catch (e) {
    const endTime = new Date();

    await submitOutOfBandReportIfConfigured({
      error: e,
      requestEndpoint: endpoint,
      requestBody,
      endpoint: errorReportingEndpoint,
      startedAt: startTime,
      endedAt: endTime,
      fetcher,
    });

    throw new UplinkFetcherError(fetchErrorMsg + (e.message ?? e));
  }

  const endTime = new Date();
  let response: SupergraphSdlQueryResult;

  if (result.ok || result.status === 400) {
    try {
      response = await result.json();
    } catch (e) {
      // Bad response
      throw new UplinkFetcherError(fetchErrorMsg + result.status + ' ' + e.message ?? e);
    }

    if ('errors' in response) {
      throw new UplinkFetcherError(
        [fetchErrorMsg, ...response.errors.map((error) => error.message)].join(
          '\n',
        ),
      );
    }
  } else {
    await submitOutOfBandReportIfConfigured({
      error: new UplinkFetcherError(fetchErrorMsg + result.status + ' ' + result.statusText),
      requestEndpoint: endpoint,
      requestBody,
      endpoint: errorReportingEndpoint,
      response: result,
      startedAt: startTime,
      endedAt: endTime,
      fetcher,
    });
    throw new UplinkFetcherError(fetchErrorMsg + result.status + ' ' + result.statusText);
  }

  const { routerConfig } = response.data;
  if (routerConfig.__typename === 'RouterConfigResult') {
    const {
      id,
      supergraphSdl,
      minDelaySeconds,
      // messages,
    } = routerConfig;
    return { id, supergraphSdl: supergraphSdl!, minDelaySeconds };
  } else if (routerConfig.__typename === 'FetchError') {
    // FetchError case
    const { code, message } = routerConfig;
    throw new UplinkFetcherError(`${code}: ${message}`);
  } else if (routerConfig.__typename === 'Unchanged') {
    return null;
  } else {
    throw new UplinkFetcherError('Programming error: unhandled response failure');
  }
}
