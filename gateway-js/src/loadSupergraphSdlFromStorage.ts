import { fetch, Response, Request } from 'apollo-server-env';
import { GraphQLError } from 'graphql';
import { ErrorCode, SupergraphSdlQuery } from './__generated__/graphqlTypes';

// Magic /* GraphQL */ comment below is for codegen, do not remove
export const SUPERGRAPH_SDL_QUERY = /* GraphQL */`#graphql
  query SupergraphSdl($apiKey: String!, $ref: String!) {
    routerConfig(ref: $ref, apiKey: $apiKey) {
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

// Magic /* GraphQL */ comment below is for codegen, do not remove
export const OUT_OF_BAND_REPORTER_QUERY = /* GraphQL */`#graphql
  mutation testMutation($input: APIMonitoringReport) {
    reportError(report: $input)
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

const { name, version } = require('../package.json');

const fetchErrorMsg = "An error occurred while fetching your schema from Apollo: ";

async function submitOutOfBandReport({
  error,
  request,
  response,
  startedAt = '',
  endedAt = '',
  tags,
  fetcher,
}: {
  error: any;
  request: Request;
  response?: Response;
  startedAt: string;
  endedAt: string;
  tags?: string[];
  fetcher: typeof fetch;
}) {

  // don't send report if the endpoint url is not configured
  if (!process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT) {
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

  try {
    const result = await fetcher(process.env.APOLLO_OUT_OF_BAND_REPORTER_ENDPOINT!!, {
      method: 'POST',
      body: JSON.stringify({
        query: OUT_OF_BAND_REPORTER_QUERY,
        variables: {
          input: {
            error: {
              code: errorCode,
              message: error.message ?? error
            },
            request: {
              url: request.url,
              headers: request.headers,
              body: request.bodyUsed ? request.json() : ''
            },
            response: response ? {
              httpStatusCode: response.status,
              headers: response.headers,
              body: response.json()
            } : null,
            startedAt: startedAt,
            endedAt: endedAt,
            tags: tags
          }
        },
      }),
      headers: {
        'apollographql-client-name': name,
        'apollographql-client-version': version,
        'user-agent': `${name}/${version}`,
        'content-type': 'application/json',
      },
    });

    const oobResponse = await result.json();
    if (!oobResponse?.reportError) {
      console.log("Failed to submit error report")
    }
  } catch (e) {
    throw new Error(fetchErrorMsg + (e.message ?? e));
  }
}

export async function loadSupergraphSdlFromStorage({
  graphId,
  graphVariant,
  apiKey,
  endpoint,
  fetcher,
}: {
  graphId: string;
  graphVariant: string;
  apiKey: string;
  endpoint: string;
  fetcher: typeof fetch;
}) {
  let result: Response;
  const request: Request = new Request(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      query: SUPERGRAPH_SDL_QUERY,
      variables: {
        ref: `${graphId}@${graphVariant}`,
        apiKey,
      },
    }),
    headers: [
      ['apollographql-client-name', name],
      ['apollographql-client-version', version],
      ['user-agent', `${name}/${version}`],
      ['content-type', 'application/json']
    ]
  });

  const startTime = new Date()
  try {
    console.log(request.url)
    result = await fetcher(request);
  } catch (e) {
    const endTime = new Date();
    console.log(e)

    submitOutOfBandReport({
      error: e,
      request,
      startedAt: startTime.toISOString(),
      endedAt: endTime.toISOString(),
      fetcher
    });

    throw new Error(fetchErrorMsg + (e.message ?? e));
  }

  const endTime = new Date();
  let response: SupergraphSdlQueryResult;

  if (result.ok || result.status === 400) {
    try {
      response = await result.json();
    } catch (e) {
      // Bad response
      throw new Error(fetchErrorMsg + result.status + ' ' + e.message ?? e);
    }

    if ('errors' in response) {
      throw new Error(
        [fetchErrorMsg, ...response.errors.map((error) => error.message)].join(
          '\n',
        ),
      );
    }
  } else {
    submitOutOfBandReport({
      error: fetchErrorMsg,
      request,
      response: result,
      startedAt: startTime.toISOString(),
      endedAt: endTime.toISOString(),
      fetcher
    });

    throw new Error(fetchErrorMsg + result.status + ' ' + result.statusText);
  }

  const { routerConfig } = response.data;
  if (routerConfig.__typename === 'RouterConfigResult') {
    const {
      id,
      supergraphSdl,
      // messages,
    } = routerConfig;

    // `supergraphSdl` should not be nullable in the schema, but it currently is
    return { id, supergraphSdl: supergraphSdl! };
  } else if (routerConfig.__typename === 'FetchError') {
    // FetchError case
    const { code, message } = routerConfig;
    throw new Error(`${code}: ${message}`);
  } else {
    throw new Error('Programming error: unhandled response failure');
  }
}
