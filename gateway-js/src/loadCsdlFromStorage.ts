import { fetch } from 'apollo-server-env';
import { GraphQLError } from 'graphql';

export const CSDL_QUERY = `#graphql
  query Csdl($apiKey: String!, $ref: String!) {
    routerConfig(
      ref: $ref
      apiKey: $apiKey
    ) {
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
  data: { routerConfig: RouterConfigResponse };
}

interface CsdlQueryFailure {
  data?: { routerConfig: RouterConfigResponse };
  errors: GraphQLError[];
}

type RouterConfigResponse = RouterConfigResult | FetchError;

interface RouterConfigResult {
  __typename: 'RouterConfigResult';
  id: string;
  csdl: string;
  messages: Message[];
}

interface Message {
  __typename: 'Message';
  body: string;
  level: MessageLevel;
}

enum MessageLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
}

interface FetchError {
  __typename: 'FetchError';
  code: FetchErrorCode;
  message: string;
}

enum FetchErrorCode {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  UNKNOWN_REF = 'UNKNOWN_REF',
  RETRY_LATER = 'RETRY_LATER',
}

export async function loadCsdlFromStorage({
  graphId,
  graphVariant,
  apiKey,
  fetcher,
}: {
  graphId: string;
  graphVariant: string;
  apiKey: string;
  fetcher: typeof fetch;
}) {
  const result = await fetcher(
    'https://us-central1-mdg-services.cloudfunctions.net:443/cloudconfig-staging/',
    {
      method: 'POST',
      body: JSON.stringify({
        query: CSDL_QUERY,
        variables: {
          ref: `${graphId}@${graphVariant}`,
          apiKey,
        },
      }),
      headers: {
        'user-agent': `apollo-gateway/${require('../package.json').version}`,
        'Content-Type': 'application/json',
      },
    },
  );



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
    return { id, csdl };
  } else if (routerConfig.__typename === 'FetchError') {
    // FetchError case
    const { code, message } = routerConfig;
    throw new Error(`${code}: ${message}`);
  } else {
    throw new Error('Programming error: unhandled response failure');
  }
}
