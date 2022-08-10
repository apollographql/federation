import { GraphQLError } from 'graphql';
import retry from 'async-retry';
import { AbortController } from "node-abort-controller";
import { SupergraphSdlUpdate } from '../../config';
import { submitOutOfBandReportIfConfigured } from './outOfBandReporter';
import { SupergraphSdlQuery } from '../../__generated__/graphqlTypes';
import type {
  FetcherResponse,
  Fetcher,
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
  requestTimeoutMs,
  roundRobinSeed,
  logger,
}: {
  graphRef: string;
  apiKey: string;
  endpoints: string[];
  errorReportingEndpoint: string | undefined,
  fetcher: Fetcher;
  compositionId: string | null;
  maxRetries: number,
  requestTimeoutMs: number,
  roundRobinSeed: number,
  logger: Logger,
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
        requestTimeoutMs,
        compositionId,
        logger,
      }),
    {
      retries: maxRetries,
      maxTimeout: 60_000,
      onRetry(e, attempt) {
        logger.debug(`Unable to fetch supergraph SDL (attempt ${attempt}), waiting before retry: ${e}`);
      },
    },
  );
}

export async function loadSupergraphSdlFromStorage({
  graphRef,
  apiKey,
  endpoint,
  errorReportingEndpoint,
  fetcher,
  requestTimeoutMs,
  compositionId,
  logger,
}: {
  graphRef: string;
  apiKey: string;
  endpoint: string;
  errorReportingEndpoint?: string;
  fetcher: Fetcher;
  requestTimeoutMs: number;
  compositionId: string | null;
  logger: Logger;
}) : Promise<SupergraphSdlUpdate | null> {
  const requestBody = JSON.stringify({
    query: SUPERGRAPH_SDL_QUERY,
    variables: {
      ref: graphRef,
      apiKey,
      ifAfterId: compositionId,
    },
  })

  const controller = new AbortController();
  const signal = setTimeout(() => {
    logger.debug(`Aborting request due to timeout`);
    controller.abort();
  }, requestTimeoutMs);

  const requestDetails: FetcherRequestInit = {
    method: 'POST',
    body: requestBody,
    headers: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
    signal: controller.signal,
  };

  logger.debug(`🔧 Fetching ${graphRef} supergraph schema from ${endpoint} ifAfterId ${compositionId}`);

  const startTime = new Date();
  let result: FetcherResponse;
  try {
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
  } finally {
    clearTimeout(signal);
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
    return { id, supergraphSdl, minDelaySeconds };
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
