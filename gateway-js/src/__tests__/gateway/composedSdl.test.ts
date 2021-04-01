import { ApolloGateway } from '@apollo/gateway';
import { ApolloServer } from 'apollo-server';
import { fetch } from '../../__mocks__/apollo-server-env';
import { getTestingSupergraphSdl } from '../execution-utils';

async function getSupergraphSdlGatewayServer() {
  const server = new ApolloServer({
    gateway: new ApolloGateway({
      supergraphSdl: getTestingSupergraphSdl(),
    }),
    subscriptions: false,
    engine: false,
  });

  await server.listen({ port: 0 });
  return server;
}

describe('Using supergraphSdl configuration', () => {
  it('successfully starts and serves requests to the proper services', async () => {
    const server = await getSupergraphSdlGatewayServer();

    fetch.mockJSONResponseOnce({
      data: { me: { id: 1, username: '@jbaxleyiii' } },
    });

    const result = await server.executeOperation({
      query: '{ me { id username } }',
    });

    expect(result.data).toMatchInlineSnapshot(`
      Object {
        "me": Object {
          "id": "1",
          "username": "@jbaxleyiii",
        },
      }
    `);

    const [url, request] = fetch.mock.calls[0];
    expect(url).toEqual('https://accounts.api.com');
    expect(request?.body).toEqual(
      JSON.stringify({ query: '{me{id username}}', variables: {} }),
    );
    await server.stop();
  });
});
