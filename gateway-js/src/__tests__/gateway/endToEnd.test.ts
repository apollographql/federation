import { fixtures } from 'apollo-federation-integration-testsuite';
import { buildSchema, ObjectType } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { printSchema } from 'graphql';
import { startSubgraphsAndGateway, Services } from './testUtils'
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache';
import { QueryPlan } from '@apollo/query-planner';
import { createHash } from '@apollo/utils.createhash';

function approximateObjectSize<T>(obj: T): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

let services: Services;

afterEach(async () => {
  if (services) {
    await services.stop();
  }
});


describe('caching', () => {
  const cache = new InMemoryLRUCache<QueryPlan>({maxSize: Math.pow(2, 20) * (30), sizeCalculation: approximateObjectSize});
  beforeEach(async () => {
    services = await startSubgraphsAndGateway(fixtures, { gatewayConfig: { queryPlannerConfig: { cache } } });
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

    await services.queryGateway(query);
    const queryHash:string = createHash('sha256').update(query).digest('hex');
    expect(await cache.get(queryHash)).toBeTruthy();
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

    const response = await services.queryGateway(query);
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

    const response = await services.queryGateway(query);
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
    expect(response.headers.get('cache-control')).toBe('no-store');
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
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key", { name: "@tag", as: "@federationTag" }]
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
            x: 1,
          }),
        },
      },
    };

    const subgraphB = {
      name: 'B',
      url: 'https://B',
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key", { name: "@tag", as: "@federationTag" }]
          )

        type T @key(fields: "k") {
          k: ID
          y: Int @federationTag(name: "Less Important")
        }
      `,
      resolvers: {
        T: {
          __resolveReference: ({ k }: { k: string }) => {
            return k === '42' ? { y: 2 } : undefined;
          },
        },
      },
    };

    services = await startSubgraphsAndGateway([subgraphA, subgraphB]);

    const query = `
      {
        t {
          x
          y
        }
      }
    `;

    const response = await services.queryGateway(query);
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

    const supergraphSdl = services.gateway.__testing().supergraphSdl;
    expect(supergraphSdl).toBeDefined();
    const supergraph = buildSchema(supergraphSdl!);
    const typeT = supergraph.type('T') as ObjectType;
    expect(
      typeT.field('x')?.appliedDirectivesOf('federationTag').toString(),
    ).toStrictEqual('@federationTag(name: "Important")');
    expect(
      typeT.field('y')?.appliedDirectivesOf('federationTag').toString(),
    ).toStrictEqual('@federationTag(name: "Less Important")');
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
            x: 1,
          }),
        },
      },
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
            return k === '42' ? { y: 2 } : undefined;
          },
        },
      },
    };

    services = await startSubgraphsAndGateway([subgraphA, subgraphB]);

    const query = `
      {
        t {
          x
          y
        }
      }
    `;

    const response = await services.queryGateway(query);
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
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key", "@shareable", "@inaccessible"]
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
          },
        },
      },
    };

    const subgraphB = {
      name: 'B',
      url: 'https://B',
      typeDefs: gql`
        extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key", "@shareable", "@inaccessible"]
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
            return k === '42' ? { c: 'foo', d: 'bar' } : undefined;
          },
        },
      },
    };

    services = await startSubgraphsAndGateway([subgraphA, subgraphB]);

    const q1 = `
      {
        t {
          b
          d
        }
        f(e: FOO)
      }
    `;

    const resp1 = await services.queryGateway(q1);
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
    expect(printSchema(services.gateway.schema!)).toMatchInlineSnapshot(`
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
    const resp2 = await services.queryGateway(q2);
    const res2 = await resp2.json();
    expect(res2).toMatchInlineSnapshot(`
      Object {
        "errors": Array [
          Object {
            "extensions": Object {
              "code": "GRAPHQL_VALIDATION_FAILED",
            },
            "locations": Array [
              Object {
                "column": 14,
                "line": 3,
              },
            ],
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
    const resp3 = await services.queryGateway(q3);
    const res3 = await resp3.json();
    expect(res3).toMatchInlineSnapshot(`
      Object {
        "errors": Array [
          Object {
            "extensions": Object {
              "code": "GRAPHQL_VALIDATION_FAILED",
            },
            "locations": Array [
              Object {
                "column": 11,
                "line": 4,
              },
            ],
            "message": "Cannot query field \\"a\\" on type \\"T\\". Did you mean \\"b\\", \\"d\\", or \\"k\\"?",
          },
        ],
      }
    `);
  });
});
