import { fetch } from 'apollo-server-env';

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

  // TODO: Error handling
  const { id, csdl } = (await result.json()).data.routerConfig;

  return { id, csdl };
}
