import { fetch } from 'apollo-server-env';
import { GraphQLError } from 'graphql';
import { CsdlQuery } from './__generated__/graphqlTypes';

export const CSDL_QUERY = /* GraphQL */`#graphql
  query Csdl($apiKey: String!, $ref: String!) {
    routerConfig(ref: $ref, apiKey: $apiKey) {
      __typename
      ... on RouterConfigResult {
        id
        csdl
      }
      ... on FetchError {
        code
        message
      }
    }
  }
`;

type CsdlQueryResult = CsdlQuerySuccess | CsdlQueryFailure;

interface CsdlQuerySuccess {
  data: CsdlQuery;
}

interface CsdlQueryFailure {
  data?: CsdlQuery;
  errors: GraphQLError[];
}

const { name, version } = require('../package.json');

export async function loadCsdlFromStorage({
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
  const result = await fetcher(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      query: CSDL_QUERY,
      variables: {
        ref: `${graphId}@${graphVariant}`,
        apiKey,
      },
    }),
    headers: {
      'apollographql-client-name': name,
      'apollographql-client-version': version,
      'user-agent': `${name}/${version}`,
      'content-type': 'application/json',
    },
  });

  let response: CsdlQueryResult;

  try {
    response = await result.json();
  } catch (e) {
    // JSON parse error, bad response
    throw new Error(result.status + ': Unexpected failure while fetching updated CSDL');
  }

  // This happens before the 200 check below because the server returns a 400
  // in the case of GraphQL errors (i.e. query validation)
  if ('errors' in response) {
    throw new Error(response.errors.map((error) => error.message).join('\n'));
  }

  if (!result.ok) {
    throw new Error('Unexpected failure while fetching updated CSDL');
  }

  const { routerConfig } = response.data;
  if (routerConfig.__typename === 'RouterConfigResult') {
    const {
      id,
      csdl,
      // messages,
    } = routerConfig;

    // `csdl` should not be nullable in the schema, but it currently is
    return { id, csdl: csdl! };
  } else if (routerConfig.__typename === 'FetchError') {
    // FetchError case
    const { code, message } = routerConfig;
    throw new Error(`${code}: ${message}`);
  } else {
    throw new Error('Programming error: unhandled response failure');
  }
}
