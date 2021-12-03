import { GraphQLSchemaModule } from 'apollo-graphql';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from 'apollo-server';
import fetch from 'node-fetch';
import { ApolloGateway } from '../..';
import { fixtures } from 'apollo-federation-integration-testsuite';
import { ApolloServerPluginInlineTrace } from 'apollo-server-core';
import { composeServices } from '@apollo/composition';
import { randomBytes } from 'crypto';
import { createWriteStream, writeFileSync } from 'fs';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

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
  let generatedSchema: String;
  let execute = async (query: String) => {
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    return await response.json();
  }
  let process: ChildProcessWithoutNullStreams;

  beforeAll(async () => {
    backendServers = [];
    const serviceList = [];
    const servicesForSchema = [];
    for (const fixture of fixtures) {
      const { server, url } = await startFederatedServer([fixture]);
      backendServers.push(server);
      serviceList.push({ name: fixture.name, url });
      servicesForSchema.push({name: fixture.name, url, typeDefs: fixture.typeDefs });
    }

    let composeRes = composeServices(servicesForSchema);
    if (composeRes.supergraphSdl !== undefined) {
      generatedSchema = composeRes.supergraphSdl;
    }

    var filename = 'supergraph'+randomBytes(4).readUInt32LE(0)+'.graphql';
    console.log("writing: "+filename);
    writeFileSync(filename, generatedSchema);

    if (false) {
      const gateway = new ApolloGateway({ serviceList });
      gatewayServer = new ApolloServer({
        gateway,
      });
      ({ url: gatewayUrl } = await gatewayServer.listen({ port: 0 }));
    } else {

      process = spawn("/path/to/router",
        [
          "-c",
          "/path/to/configuration.yaml",
          "-s",
          "/path/to/federation/"+filename,
          ]);
      gatewayUrl = "http://127.0.0.1:4100/graphql";

      let log = createWriteStream("router.log");
      process.stdout.on('data', (data) => {
        log.write(data);
      });

      await new Promise(f => setTimeout(f, 1000));
    }
  });

  afterAll(async () => {
    for (const server of backendServers) {
      await server.stop();
    }
    if (gatewayServer) {
      await gatewayServer.stop();
    }
    if (process) {
      process.kill('SIGINT');
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

  it('executes a query plan over concrete types', async () => {
    /*const me = jest.fn(() => ({ id: 1, name: 'James' }));
    const localAccounts = overrideResolversInService(accounts, {
      Query: { me },
    });*/

    const query = `#graphql
      query GetUser {
        me_5678 {
          id
          name
        }
      }
    `;
    const result = await execute(query);
    /*const { data, queryPlan } = await execute(
      {
        query,
      },
      //[localAccounts],
    );*/

    expect(result.data).toEqual({ me_5678: { id: 1, name: 'James' } });
    //expect(queryPlan).toCallService('accounts');
    //expect(me).toBeCalled();
  });

  it("doesn't expand interfaces with inline type conditions if all possibilities are fufilled by one service", async () => {
    const query = `#graphql
      query GetProducts {
        topProducts_1234 {
          name
        }
      }
    `;

    const result = await execute(query);

    expect(result.errors).toBeUndefined();
    expect(generatedSchema).toMatchInlineSnapshot(`blah`);

    const schema =  getTestingSupergraphSdl(fixtures);
    expect(schema).toMatchInlineSnapshot(`blah`);
  });
});
