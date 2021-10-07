import { GraphQLSchemaModule } from 'apollo-graphql';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from 'apollo-server';
import fetch from 'node-fetch';
import { ApolloGateway } from '../..';
import { fixtures } from 'apollo-federation-integration-testsuite';
import { ApolloServerPluginInlineTrace } from 'apollo-server-core';

async function startFederatedServer(modules: GraphQLSchemaModule[]) {
  const schema = buildSubgraphSchema(modules);
  const server = new ApolloServer({
    schema,
    // Manually installing the inline trace plugin means it doesn't log a message.
    plugins: [ApolloServerPluginInlineTrace()],
  });
  const { url } = await server.listen({ port: 0 });
  return { url, server };
}

describe('end-to-end', () => {
  let backendServers: ApolloServer[];
  let gatewayServer: ApolloServer;
  let gatewayUrl: string;

  beforeEach(async () => {
    backendServers = [];
    const serviceList = [];
    for (const fixture of fixtures) {
      const { server, url } = await startFederatedServer([fixture]);
      backendServers.push(server);
      serviceList.push({ name: fixture.name, url });
    }

    const gateway = new ApolloGateway({ serviceList });
    gatewayServer = new ApolloServer({
      gateway,
    });
    ({ url: gatewayUrl } = await gatewayServer.listen({ port: 0 }));
  });

  afterEach(async () => {
    for (const server of backendServers) {
      await server.stop();
    }
    if (gatewayServer) {
      await gatewayServer.stop();
    }
  });

  it(`cache control`, async () => {
    const query = `
      query {
        me {
          name {
            first
            last
          }
        }
        topProducts {
          name
        }
      }
    `;

    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "me": Object {
            "name": Object {
              "first": "Ada",
              "last": "Lovelace",
            },
          },
          "topProducts": Array [
            Object {
              "name": "Table",
            },
            Object {
              "name": "Couch",
            },
            Object {
              "name": "Chair",
            },
            Object {
              "name": "Structure and Interpretation of Computer Programs (1996)",
            },
            Object {
              "name": "Object Oriented Software Construction (1997)",
            },
          ],
        },
      }
    `);
    expect(response.headers.get('cache-control')).toBe('max-age=30, private');
  });

  it(`cache control, uncacheable`, async () => {
    const query = `
      query {
        me {
          name {
            first
            last
          }
        }
        topProducts {
          name
          ... on Book {
            details {  # This field has no cache policy.
              pages
            }
          }
        }
      }
    `;

    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const result = await response.json();
    expect(result).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "me": Object {
            "name": Object {
              "first": "Ada",
              "last": "Lovelace",
            },
          },
          "topProducts": Array [
            Object {
              "name": "Table",
            },
            Object {
              "name": "Couch",
            },
            Object {
              "name": "Chair",
            },
            Object {
              "details": null,
              "name": "Structure and Interpretation of Computer Programs (1996)",
            },
            Object {
              "details": null,
              "name": "Object Oriented Software Construction (1997)",
            },
          ],
        },
      }
    `);
    expect(response.headers.get('cache-control')).toBe(null);
  });
});
