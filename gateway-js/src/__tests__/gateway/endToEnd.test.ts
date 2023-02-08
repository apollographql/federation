import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from 'apollo-server';
import fetch, { Response } from 'node-fetch';
import { ApolloGateway } from '../..';
import { fixtures } from 'apollo-federation-integration-testsuite';
import { ApolloServerPluginInlineTrace } from 'apollo-server-core';
import { GraphQLSchemaModule } from '@apollo/subgraph/src/schema-helper';
import { buildSchema, ObjectType, ServiceDefinition } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { printSchema } from 'graphql';
import LRUCache from 'lru-cache';
import { QueryPlan } from '@apollo/query-planner';
import { createHash } from '@apollo/utils.createhash';

function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

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

let backendServers: ApolloServer[];
let gateway: ApolloGateway;
let gatewayServer: ApolloServer;
let gatewayUrl: string;

async function startServicesAndGateway(servicesDefs: ServiceDefinition[], cache?: LRUCache<string, QueryPlan>) {
  backendServers = [];
  const serviceList = [];
  for (const serviceDef of servicesDefs) {
    const { server, url } = await startFederatedServer([serviceDef]);
    backendServers.push(server);
    serviceList.push({ name: serviceDef.name, url });
  }

  gateway = new ApolloGateway({
    serviceList,
    queryPlannerConfig: cache ? { cache } : undefined,
  });

  gatewayServer = new ApolloServer({
    gateway,
  });
  ({ url: gatewayUrl } = await gatewayServer.listen({ port: 0 }));
}

async function queryGateway(query: string): Promise<Response> {
  return fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
}

afterEach(async () => {
  for (const server of backendServers) {
    await server.stop();
  }
  if (gatewayServer) {
    await gatewayServer.stop();
  }
});


describe('caching', () => {
  const cache = new LRUCache<string, QueryPlan>({maxSize: Math.pow(2, 20) * (30), sizeCalculation: approximateObjectSize});
  beforeEach(async () => {
    await startServicesAndGateway(fixtures, cache);
  });

  it(`cached query plan`, async () => {
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

    await queryGateway(query);
    const queryHash:string = createHash('sha256').update(query).digest('hex');
    expect(cache.has(queryHash)).toBe(true);
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

    const response = await queryGateway(query);
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

    const response = await queryGateway(query);
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

/**
 * Tests for a number of specific features end-to-end.
 * Note that those features have (or at least should have) much thorough test coverage in the various places
 * that handle them more directly, and those tests largely duplicate other test, but it's meant to ensure we
 * have basic end-to-end testing, thus ensuring those feature don't break in places we didn't expect.
 */
describe('end-to-end features', () => {
  it('@tag renaming', async () => {
    const subgraphA = {
      name: 'A',
      url: 'https://A',
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0",
            import: [ "@key", { name: "@tag", as: "@federationTag"} ]
          )

        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          x: Int @federationTag(name: "Important")
        }
      `,
      resolvers: {
        Query: {
          t: () => ({
            k: 42,
            x: 1
          }),
        }
      }
    };

    const subgraphB = {
      name: 'B',
      url: 'https://B',
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0",
            import: [ "@key", { name: "@tag", as: "@federationTag"} ]
          )

        type T @key(fields: "k") {
          k: ID
          y: Int @federationTag(name: "Less Important")
        }
      `,
      resolvers: {
        T: {
          __resolveReference: ({ k }: { k: string }) => {
            return k === '42' ? ({ y: 2 }) : undefined;
          },
        }
      }
    };

    await startServicesAndGateway([subgraphA, subgraphB]);

    const query = `
      {
        t {
          x
          y
        }
      }
    `;

    const response = await queryGateway(query);
    const result = await response.json();
    expect(result).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "t": Object {
            "x": 1,
            "y": 2,
          },
        },
      }
    `);

    const supergraphSdl = gateway.__testing().supergraphSdl;
    expect(supergraphSdl).toBeDefined();
    const supergraph = buildSchema(supergraphSdl!);
    const typeT = supergraph.type('T') as ObjectType;
    expect(typeT.field('x')?.appliedDirectivesOf('federationTag').toString()).toStrictEqual('@federationTag(name: "Important")');
    expect(typeT.field('y')?.appliedDirectivesOf('federationTag').toString()).toStrictEqual('@federationTag(name: "Less Important")');
  });

  it('handles fed1 schema', async () => {
    const subgraphA = {
      name: 'A',
      url: 'https://A',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          x: Int
        }
      `,
      resolvers: {
        Query: {
          t: () => ({
            k: 42,
            x: 1
          }),
        }
      }
    };

    const subgraphB = {
      name: 'B',
      url: 'https://B',
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          y: Int
        }
      `,
      resolvers: {
        T: {
          __resolveReference: ({ k }: { k: string }) => {
            return k === '42' ? ({ y: 2 }) : undefined;
          },
        }
      }
    };

    await startServicesAndGateway([subgraphA, subgraphB]);

    const query = `
      {
        t {
          x
          y
        }
      }
    `;

    const response = await queryGateway(query);
    const result = await response.json();
    expect(result).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "t": Object {
            "x": 1,
            "y": 2,
          },
        },
      }
    `);
  });

  it('removals of @inaccessible', async () => {
    const subgraphA = {
      name: 'A',
      url: 'https://A',
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0",
            import: [ "@key", "@shareable", "@inaccessible"]
          )

        type Query {
          t: T
          f(e: E): Int
        }

        enum E {
          FOO
          BAR @inaccessible
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @inaccessible
          b: Int
          c: String @shareable
        }
      `,
      resolvers: {
        Query: {
          t: () => ({
            k: 42,
            a: 1,
            b: 2,
            c: 3,
          }),
          f: (_: any, args: any) => {
            return args.e === 'FOO' ? 0 : 1;
          }
        }
      }
    };

    const subgraphB = {
      name: 'B',
      url: 'https://B',
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0",
            import: [ "@key", "@shareable", "@inaccessible" ]
          )

        type T @key(fields: "k") {
          k: ID
          c: String @shareable @inaccessible
          d: String
        }
      `,
      resolvers: {
        T: {
          __resolveReference: ({ k }: { k: string }) => {
            return k === '42' ? ({ c: 'foo', d: 'bar' }) : undefined;
          },
        }
      }
    };

    await startServicesAndGateway([subgraphA, subgraphB]);

    const q1 = `
      {
        t {
          b
          d
        }
        f(e: FOO)
      }
    `;

    const resp1 = await queryGateway(q1);
    const res1 = await resp1.json();
    expect(res1).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "f": 0,
          "t": Object {
            "b": 2,
            "d": "bar",
          },
        },
      }
    `);

    // Make sure the exposed API doesn't have any @inaccessible elements.
    expect(printSchema(gateway.schema!)).toMatchInlineSnapshot(`
      "enum E {
        FOO
      }

      type Query {
        t: T
        f(e: E): Int
      }

      type T {
        k: ID
        b: Int
        d: String
      }"
    `);

    // Lastly, make sure querying inaccessible things is rejected
    const q2 = `
      {
        f(e: BAR)
      }
    `;
    const resp2 = await queryGateway(q2);
    const res2 = await resp2.json();
    expect(res2).toMatchInlineSnapshot(`
      Object {
        "errors": Array [
          Object {
            "extensions": Object {
              "code": "GRAPHQL_VALIDATION_FAILED",
            },
            "message": "Value \\"BAR\\" does not exist in \\"E\\" enum.",
          },
        ],
      }
    `);

    const q3 = `
      {
        t {
          a
        }
      }
    `;
    const resp3 = await queryGateway(q3);
    const res3 = await resp3.json();
    expect(res3).toMatchInlineSnapshot(`
      Object {
        "errors": Array [
          Object {
            "extensions": Object {
              "code": "GRAPHQL_VALIDATION_FAILED",
            },
            "message": "Cannot query field \\"a\\" on type \\"T\\". Did you mean \\"b\\", \\"d\\", or \\"k\\"?",
          },
        ],
      }
    `);
  });
})
