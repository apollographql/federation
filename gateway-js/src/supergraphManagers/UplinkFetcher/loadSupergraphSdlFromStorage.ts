import { fetch, Response, Request } from 'apollo-server-env';
import { GraphQLError } from 'graphql';
import { SupergraphSdlUpdate } from '../../config';
import { submitOutOfBandReportIfConfigured } from './outOfBandReporter';
import { SupergraphSdlQuery } from '../../__generated__/graphqlTypes';

// Magic /* GraphQL */ comment below is for codegen, do not remove
export const SUPERGRAPH_SDL_QUERY = /* GraphQL */`#graphql
  query SupergraphSdl($apiKey: String!, $ref: String!, $ifAfterId: ID) {
    routerConfig(ref: $ref, apiKey: $apiKey, ifAfterId: $ifAfterId) {
      __typename
      ... on RouterConfigResult {
        id
        supergraphSdl: supergraphSDL
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
}: {
  graphRef: string;
  apiKey: string;
  endpoints: string[];
  errorReportingEndpoint: string | undefined,
  fetcher: typeof fetch;
  compositionId: string | null;
  maxRetries: number,
  roundRobinSeed: number,
}) : Promise<SupergraphSdlUpdate | null> {
  let retries = 0;
  let lastException = null;
  let result: SupergraphSdlUpdate | null = null;
  while (retries++ <= maxRetries && result == null) {
    try {
      result = await loadSupergraphSdlFromStorage({
        graphRef,
        apiKey,
        endpoint: endpoints[roundRobinSeed++ % endpoints.length],
        errorReportingEndpoint,
        fetcher,
        compositionId,
      });
    } catch (e) {
      lastException = e;
    }
  }
  if (result === null && lastException !== null) {
    throw lastException;
  }
  return result;
}

export async function loadSupergraphSdlFromStorage({
  graphRef,
  apiKey,
  endpoint,
  errorReportingEndpoint,
  fetcher,
  compositionId,
}: {
  graphRef: string;
  apiKey: string;
  endpoint: string;
  errorReportingEndpoint?: string;
  fetcher: typeof fetch;
  compositionId: string | null;
}) : Promise<SupergraphSdlUpdate | null> {
  let result: Response;
  const requestDetails = {
    method: 'POST',
    body: JSON.stringify({
      query: SUPERGRAPH_SDL_QUERY,
      variables: {
        ref: graphRef,
        apiKey,
        ifAfterId: compositionId,
      },
    }),
    headers: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
  };

  const request: Request = new Request(endpoint, requestDetails);

  const startTime = new Date();
  try {
    result = await fetcher(endpoint, requestDetails);
  } catch (e) {
    const endTime = new Date();

    await submitOutOfBandReportIfConfigured({
      error: e,
      request,
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
      request,
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
      // messages,
    } = routerConfig;
    return { id, supergraphSdl: supergraphSdl! };
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
