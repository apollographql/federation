import {
  buildClientSchema,
  getIntrospectionQuery,
  GraphQLError,
  GraphQLObjectType,
  print,
} from 'graphql';
import gql from 'graphql-tag';
import { buildOperationContext } from '../operationContext';
import { executeQueryPlan } from '../executeQueryPlan';
import { LocalGraphQLDataSource } from '../datasources/LocalGraphQLDataSource';
import {
  astSerializer,
  queryPlanSerializer,
  superGraphWithInaccessible,
} from 'apollo-federation-integration-testsuite';
import { QueryPlan, QueryPlanner } from '@apollo/query-planner';
import { ApolloGateway } from '..';
import { ApolloServerBase as ApolloServer } from 'apollo-server-core';
import { getFederatedTestingSchema } from './execution-utils';
import { Schema, Operation, parseOperation, buildSchemaFromAST, arrayEquals } from '@apollo/federation-internals';
import {
  addResolversToSchema,
  GraphQLResolverMap,
} from '@apollo/subgraph/src/schema-helper';
import {GatewayExecutionResult, GatewayGraphQLRequestContext} from '@apollo/server-gateway-interface';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('executeQueryPlan', () => {
  let serviceMap: {
    [serviceName: string]: LocalGraphQLDataSource;
  };

  const parseOp = (operation: string, operationSchema?: Schema): Operation => {
    return parseOperation((operationSchema ?? schema), operation);
  }

  const buildPlan = (operation: string | Operation, operationQueryPlanner?: QueryPlanner, operationSchema?: Schema): QueryPlan => {
    const op = typeof operation === 'string' ? parseOp(operation, operationSchema): operation;
    return (operationQueryPlanner ?? queryPlanner).buildQueryPlan(op);
  }

  async function executePlan(
    queryPlan: QueryPlan,
    operation: Operation,
    executeRequestContext?: GatewayGraphQLRequestContext,
    executeSchema?: Schema,
    executeServiceMap?: { [serviceName: string]: LocalGraphQLDataSource }
  ): Promise<GatewayExecutionResult> {
    const supergraphSchema = executeSchema ?? schema;
    const operationContext = buildOperationContext({
      schema: supergraphSchema.toAPISchema().toGraphQLJSSchema(),
      operationDocument: gql`${operation.toString()}`,
    });
    return executeQueryPlan(
      queryPlan,
      executeServiceMap ?? serviceMap,
      executeRequestContext ?? buildRequestContext(),
      operationContext,
      supergraphSchema.toGraphQLJSSchema(),
    );
  }

  async function executeOperation(operationString: string, requestContext?: GatewayGraphQLRequestContext): Promise<GatewayExecutionResult> {
      const operation = parseOp(operationString);
      const queryPlan = buildPlan(operation);
      return executePlan(queryPlan, operation, requestContext);
  }

  function overrideResolversInService(
    serviceName: string,
    resolvers: GraphQLResolverMap,
  ) {
    addResolversToSchema(serviceMap[serviceName].schema, resolvers);
  }

  function spyOnEntitiesResolverInService(serviceName: string) {
    const entitiesField = serviceMap[serviceName].schema
      .getQueryType()!
      .getFields()['_entities'];
    return jest.spyOn(entitiesField, 'resolve');
  }

  let schema: Schema;
  let queryPlanner: QueryPlanner;
  beforeEach(() => {
    expect(
      () =>
        ({ serviceMap, schema, queryPlanner } = getFederatedTestingSchema()),
    ).not.toThrow();
  });

  function buildRequestContext(): GatewayGraphQLRequestContext {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return {
      cache: undefined as any,
      context: {},
      request: {
        variables: {},
      },
    };
  }

  describe(`errors`, () => {
    it(`should not include an empty "errors" array when no errors were encountered`, async () => {
      const operationString = `#graphql
        query {
          me {
            name {
              first
              last
            }
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(response).not.toHaveProperty('errors');
    });

    it(`should include an error when a root-level field errors out`, async () => {
      overrideResolversInService('accounts', {
        RootQuery: {
          me() {
            throw new GraphQLError('Something went wrong', {
              extensions: { code: 'UNAUTHENTICATED' },
            });
          },
        },
      });

      const operationString = `#graphql
        query {
          me {
            name {
              first
              last
            }
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(response).toHaveProperty('data.me', null);
      expect(response).toHaveProperty(
        'errors.0.message',
        'Something went wrong',
      );
      expect(response).toHaveProperty('errors.0.path', undefined);
      expect(response).toHaveProperty(
        'errors.0.extensions.code',
        'UNAUTHENTICATED',
      );
      expect(response).toHaveProperty(
        'errors.0.extensions.serviceName',
        'accounts',
      );
      expect(response).not.toHaveProperty('errors.0.extensions.query');
      expect(response).not.toHaveProperty('errors.0.extensions.variables');
    });

    it(`should not send request to downstream services when all entities are undefined`, async () => {
      const accountsEntitiesResolverSpy =
        spyOnEntitiesResolverInService('accounts');

      const operationString = `#graphql
        query {
          # The first 3 products are all Furniture
          topProducts(first: 3) {
            reviews {
              body
            }
            ... on Book {
              reviews {
                author {
                  name {
                    first
                    last
                  }
                }
              }
            }
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(accountsEntitiesResolverSpy).not.toHaveBeenCalled();

      expect(response).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "topProducts": Array [
              Object {
                "reviews": Array [
                  Object {
                    "body": "Love it!",
                  },
                  Object {
                    "body": "Prefer something else.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "body": "Too expensive.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "body": "Could be better.",
                  },
                ],
              },
            ],
          },
        }
      `);
    });

    it(`should send a request to downstream services for the remaining entities when some entities are undefined`, async () => {
      const accountsEntitiesResolverSpy =
        spyOnEntitiesResolverInService('accounts');

      const operationString = `#graphql
        query {
          # The first 3 products are all Furniture, but the next 2 are Books
          topProducts(first: 5) {
            reviews {
              body
            }
            ... on Book {
              reviews {
                author {
                  name {
                    first
                    last
                  }
                }
              }
            }
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(accountsEntitiesResolverSpy).toHaveBeenCalledTimes(1);
      expect(accountsEntitiesResolverSpy.mock.calls[0][1]).toEqual({
        representations: [
          { __typename: 'User', id: '2' },
          { __typename: 'User', id: '2' },
        ],
      });

      expect(response).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "topProducts": Array [
              Object {
                "reviews": Array [
                  Object {
                    "body": "Love it!",
                  },
                  Object {
                    "body": "Prefer something else.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "body": "Too expensive.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "body": "Could be better.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "author": Object {
                      "name": Object {
                        "first": "Alan",
                        "last": "Turing",
                      },
                    },
                    "body": "Wish I had read this before.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "author": Object {
                      "name": Object {
                        "first": "Alan",
                        "last": "Turing",
                      },
                    },
                    "body": "A bit outdated.",
                  },
                ],
              },
            ],
          },
        }
      `);
    });

    it(`should not send request to downstream service when entities don't match type conditions`, async () => {
      const reviewsEntitiesResolverSpy =
        spyOnEntitiesResolverInService('reviews');

      const operationString = `#graphql
        query {
          # The first 3 products are all Furniture
          topProducts(first: 3) {
            ... on Book {
              reviews {
                body
              }
            }
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(reviewsEntitiesResolverSpy).not.toHaveBeenCalled();

      expect(response).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "topProducts": Array [
              Object {},
              Object {},
              Object {},
            ],
          },
        }
      `);
    });

    it(`should send a request to downstream services for the remaining entities when some entities don't match type conditions`, async () => {
      const reviewsEntitiesResolverSpy =
        spyOnEntitiesResolverInService('reviews');

      const operationString = `#graphql
        query {
          # The first 3 products are all Furniture, but the next 2 are Books
          topProducts(first: 5) {
            ... on Book {
              reviews {
                body
              }
            }
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(reviewsEntitiesResolverSpy).toHaveBeenCalledTimes(1);
      expect(reviewsEntitiesResolverSpy.mock.calls[0][1]).toEqual({
        representations: [
          { __typename: 'Book', isbn: '0262510871' },
          { __typename: 'Book', isbn: '0136291554' },
        ],
      });

      expect(response).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "topProducts": Array [
              Object {},
              Object {},
              Object {},
              Object {
                "reviews": Array [
                  Object {
                    "body": "Wish I had read this before.",
                  },
                ],
              },
              Object {
                "reviews": Array [
                  Object {
                    "body": "A bit outdated.",
                  },
                ],
              },
            ],
          },
        }
      `);
    });

    it(`should still include other root-level results if one root-level field errors out`, async () => {
      overrideResolversInService('accounts', {
        RootQuery: {
          me() {
            throw new Error('Something went wrong');
          },
        },
      });

      const operationString = `#graphql
        query {
          me {
            name {
              first
              last
            }
          }
          topReviews {
            body
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(response).toHaveProperty('data.me', null);
      expect(response).toHaveProperty('data.topReviews', expect.any(Array));
    });

    it(`should still include data from other services if one services is unavailable`, async () => {
      delete serviceMap.accounts;

      const operationString = `#graphql
        query {
          me {
            name {
              first
              last
            }
          }
          topReviews {
            body
          }
        }
      `;

      const response = await executeOperation(operationString);

      expect(response).toHaveProperty('data.me', null);
      expect(response).toHaveProperty('data.topReviews', expect.any(Array));
    });
  });

  it(`should only return fields that have been requested directly`, async () => {
    const operationString = `#graphql
      query {
        topReviews {
          body
          author {
            name {
              first
              last
            }
          }
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "topReviews": Array [
          Object {
            "author": Object {
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Love it!",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Too expensive.",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Could be better.",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Prefer something else.",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Wish I had read this before.",
          },
        ],
      }
    `);
  });

  it('should not duplicate variable definitions', async () => {
    const operationString = `#graphql
      query Test($first: Int!) {
        first: topReviews(first: $first) {
          body
          author {
            name {
              first
              last
            }
          }
        }
        second: topReviews(first: $first) {
          body
          author {
            name {
              first
              last
            }
          }
        }
      }
    `;

    const requestContext = buildRequestContext();
    requestContext.request.variables = { first: 3 };
    const response = await executeOperation(operationString, requestContext);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "first": Array [
          Object {
            "author": Object {
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Love it!",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Too expensive.",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Could be better.",
          },
        ],
        "second": Array [
          Object {
            "author": Object {
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Love it!",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Too expensive.",
          },
          Object {
            "author": Object {
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Could be better.",
          },
        ],
      }
    `);
  });

  it('should include variables in non-root requests', async () => {
    const operationString = `#graphql
      query Test($locale: String) {
        topReviews {
          body
          author {
            name {
              first
              last
            }
            birthDate(locale: $locale)
          }
        }
      }
    `;

    const requestContext = buildRequestContext();
    requestContext.request.variables = { locale: 'en-US' };
    const response = await executeOperation(operationString, requestContext);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "topReviews": Array [
          Object {
            "author": Object {
              "birthDate": "12/10/1815",
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Love it!",
          },
          Object {
            "author": Object {
              "birthDate": "12/10/1815",
              "name": Object {
                "first": "Ada",
                "last": "Lovelace",
              },
            },
            "body": "Too expensive.",
          },
          Object {
            "author": Object {
              "birthDate": "6/23/1912",
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Could be better.",
          },
          Object {
            "author": Object {
              "birthDate": "6/23/1912",
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Prefer something else.",
          },
          Object {
            "author": Object {
              "birthDate": "6/23/1912",
              "name": Object {
                "first": "Alan",
                "last": "Turing",
              },
            },
            "body": "Wish I had read this before.",
          },
        ],
      }
    `);
  });

  it('can execute an introspection query', async () => {
    const response = await executeOperation(`${getIntrospectionQuery()}`);

    expect(response.data).toHaveProperty('__schema');
    expect(response.errors).toBeUndefined();
  });

  it(`can execute queries on interface types`, async () => {
    const operationString = `#graphql
      query {
        vehicle(id: "1") {
          description
          price
          retailPrice
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "vehicle": Object {
          "description": "Humble Toyota",
          "price": "9990",
          "retailPrice": "9990",
        },
      }
    `);
  });

  it(`can execute queries whose fields are interface types`, async () => {
    const operationString = `#graphql
      query {
        user(id: "1") {
          name {
            first
            last
          }
          vehicle {
            description
            price
            retailPrice
          }
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "user": Object {
          "name": Object {
            "first": "Ada",
            "last": "Lovelace",
          },
          "vehicle": Object {
            "description": "Humble Toyota",
            "price": "9990",
            "retailPrice": "9990",
          },
        },
      }
    `);
  });

  it(`can execute queries whose fields are union types`, async () => {
    const operationString = `#graphql
      query {
        user(id: "1") {
          name {
            first
            last
          }
          thing {
            ... on Vehicle {
              description
              price
              retailPrice
            }
            ... on Ikea {
              asile
            }
          }
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "user": Object {
          "name": Object {
            "first": "Ada",
            "last": "Lovelace",
          },
          "thing": Object {
            "description": "Humble Toyota",
            "price": "9990",
            "retailPrice": "9990",
          },
        },
      }
    `);
  });

  it('can execute queries with falsey @requires (except undefined)', async () => {
    const operationString = `#graphql
      query {
        books {
          name # Requires title, year (on Book type)
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "books": Array [
          Object {
            "name": "Structure and Interpretation of Computer Programs (1996)",
          },
          Object {
            "name": "Object Oriented Software Construction (1997)",
          },
          Object {
            "name": "Design Patterns (1995)",
          },
          Object {
            "name": "The Year Was Null (null)",
          },
          Object {
            "name": " (404)",
          },
          Object {
            "name": "No Books Like This Book! (2019)",
          },
        ],
      }
    `);
  });

  it('can execute queries with list @requires', async () => {
    const operationString = `#graphql
      query {
        book(isbn: "0201633612") {
          # Requires similarBooks { isbn }
          relatedReviews {
            id
            body
          }
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.errors).toMatchInlineSnapshot(`undefined`);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "book": Object {
          "relatedReviews": Array [
            Object {
              "body": "A classic.",
              "id": "6",
            },
            Object {
              "body": "A bit outdated.",
              "id": "5",
            },
          ],
        },
      }
    `);
  });

  it('can execute queries with selections on null @requires fields', async () => {
    const operationString = `#graphql
      query {
        book(isbn: "0987654321") {
          # Requires similarBooks { isbn }
          relatedReviews {
            id
            body
          }
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.errors).toBeUndefined();

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "book": Object {
          "relatedReviews": Array [],
        },
      }
    `);
  });

  it(`can execute queries with @include on inline fragment with extension field`, async () => {
    const operationString = `#graphql
      query {
        topProducts(first: 5) {
          ... on Book @include(if: true) {
            price
            inStock
          }
          ... on Furniture {
            price
            inStock
          }
        }
      }
    `;

    const response = await executeOperation(operationString);

    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "topProducts": Array [
          Object {
            "inStock": true,
            "price": "899",
          },
          Object {
            "inStock": false,
            "price": "1299",
          },
          Object {
            "inStock": true,
            "price": "54",
          },
          Object {
            "inStock": true,
            "price": "39",
          },
          Object {
            "inStock": false,
            "price": "29",
          },
        ],
      }
    `);
  });

  describe('@inaccessible', () => {
    it(`should not include @inaccessible fields in introspection`, async () => {
      schema = buildSchemaFromAST(superGraphWithInaccessible);

      const operation = parseOp(`${getIntrospectionQuery()}`, schema);
      queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operation);
      const response = await executePlan(queryPlan, operation, undefined, schema);

      expect(response.data).toHaveProperty('__schema');
      expect(response.errors).toBeUndefined();

      const introspectedSchema = buildClientSchema(response.data as any);

      const userType = introspectedSchema.getType('User') as GraphQLObjectType;

      expect(userType.getFields()['username']).toBeDefined();
      expect(userType.getFields()['ssn']).toBeUndefined();
    });

    it(`should not return @inaccessible fields`, async () => {
      const operationString = `#graphql
        query {
          topReviews {
            body
            author {
              username
              ssn
            }
          }
        }
      `;

      const operation = parseOp(operationString);

      schema = buildSchemaFromAST(superGraphWithInaccessible);

      queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operation);

      const response = await executePlan(queryPlan, operation, undefined, schema);

      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "topReviews": Array [
            Object {
              "author": Object {
                "username": "@ada",
              },
              "body": "Love it!",
            },
            Object {
              "author": Object {
                "username": "@ada",
              },
              "body": "Too expensive.",
            },
            Object {
              "author": Object {
                "username": "@complete",
              },
              "body": "Could be better.",
            },
            Object {
              "author": Object {
                "username": "@complete",
              },
              "body": "Prefer something else.",
            },
            Object {
              "author": Object {
                "username": "@complete",
              },
              "body": "Wish I had read this before.",
            },
          ],
        }
      `);
    });

    it(`should return a validation error when an @inaccessible field is requested`, async () => {
      // Because validation is part of the Apollo Server request pipeline,
      // we have to construct an instance of ApolloServer and execute the
      // the operation against it.
      // This test uses the same `gateway.load()` pattern as existing tests that
      // execute operations against Apollo Server (like queryPlanCache.test.ts).
      // But note that this is only one possible initialization path for the
      // gateway, and with the current duplication of logic we'd actually need
      // to test other scenarios (like loading from supergraph SDL) separately.
      const gateway = new ApolloGateway({
        supergraphSdl: print(superGraphWithInaccessible),
      });

      const { schema, executor } = await gateway.load();

      const server = new ApolloServer({ schema, executor });

      const query = `#graphql
        query {
          topReviews {
            body
            author {
              username
              ssn
            }
          }
        }
      `;

      const response = await server.executeOperation({
        query,
      });

      expect(response.data).toBeUndefined();
      expect(response.errors).toMatchInlineSnapshot(`
        Array [
          [ValidationError: Cannot query field "ssn" on type "User".],
        ]
      `);
    });

    // THIS TEST SHOULD BE MODIFIED AFTER THE ISSUE OUTLINED IN
    // https://github.com/apollographql/federation/issues/981 HAS BEEN RESOLVED.
    // IT IS BEING LEFT HERE AS A TEST THAT WILL INTENTIONALLY FAIL WHEN
    // IT IS RESOLVED IF IT'S NOT ADDRESSED.
    //
    // This test became relevant after a combination of two things:
    //   1. when the gateway started surfacing errors from subgraphs happened in
    //      https://github.com/apollographql/federation/pull/159
    //   2. the idea of field redaction became necessary after
    //      https://github.com/apollographql/federation/pull/893,
    //      which introduced the notion of inaccessible fields.
    //      The redaction started in
    //      https://github.com/apollographql/federation/issues/974, which added
    //      the following test.
    //
    // However, the error surfacing (first, above) needed to be reverted, thus
    // de-necessitating this redaction logic which is no longer tested.
    it(`doesn't leak @inaccessible typenames in error messages`, async () => {
      const operationString = `#graphql
        query {
          vehicle(id: "1") {
            id
          }
        }
      `;

      const operation = parseOp(operationString);

      // Vehicle ID #1 is a "Car" type.
      // This supergraph marks the "Car" type as inaccessible.
      schema = buildSchemaFromAST(superGraphWithInaccessible);

      queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operation);

      const response = await executePlan(queryPlan, operation, undefined, schema);

      expect(response.data?.vehicle).toEqual(null);
      expect(response.errors).toBeUndefined();
      // SEE COMMENT ABOVE THIS TEST.  SHOULD BE RE-ENABLED AFTER #981 IS FIXED!
      // expect(response.errors).toMatchInlineSnapshot(`
      //   Array [
      //     [GraphQLError: Abstract type "Vehicle" was resolve to a type [inaccessible type] that does not exist inside schema.],
      //   ]
      // `);
    });
  });

  describe('reusing root types', () => {
    it('can query other subgraphs when the Query type is the type of a field', async () => {
      const s1 = gql`
        type Query {
          getA: A
        }

        type A {
          q: Query
        }
      `;

      const s2 = gql`
        type Query {
          one: Int
        }
      `;

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([
        { name: 'S1', typeDefs: s1 },
        { name: 'S2', typeDefs: s2 }
      ]);

      addResolversToSchema(serviceMap['S1'].schema, {
        Query: {
          getA() {
            return {
              getA: {}
            };
          },
        },
        A: {
          q() {
            return Object.create(null);
          }
        }
      });

      addResolversToSchema(serviceMap['S2'].schema, {
        Query: {
          one() {
            return 1;
          },
        },
      });

      const operation = parseOp(`
        query {
          getA {
            q {
              one
            }
          }
        }
        `, schema);

      const queryPlan = buildPlan(operation, queryPlanner);

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                getA {
                  q {
                    __typename
                  }
                }
              }
            },
            Flatten(path: "getA.q") {
              Fetch(service: "S2") {
                {
                  ... on Query {
                    one
                  }
                }
              },
            },
          },
        }
        `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);

      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getA": Object {
            "q": Object {
              "one": 1,
            },
          },
        }
      `);
    })

    it('can query other subgraphs when the Query type is the type of a field after a mutation', async () => {
        const s1 = gql`
          type Query {
            one: Int
          }

          type Mutation {
            mutateSomething: Query
          }
        `;

        const s2 = gql`
          type Query {
            two: Int
          }
        `;

        const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([
          { name: 'S1', typeDefs: s1 },
          { name: 'S2', typeDefs: s2 }
        ]);

        let hasMutated = false;

        addResolversToSchema(serviceMap['S1'].schema, {
          Query: {
            one() {
              return 1;
            },
          },
          Mutation: {
            mutateSomething() {
              hasMutated = true;
              return {};
            },
          }
        });

        addResolversToSchema(serviceMap['S2'].schema, {
          Query: {
            two() {
              return 2;
            },
          },
        });

        const operation = parseOp(`
          mutation {
            mutateSomething {
              one
              two
            }
          }
          `, schema);

        const queryPlan = buildPlan(operation, queryPlanner);

        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  mutateSomething {
                    __typename
                    one
                  }
                }
              },
              Flatten(path: "mutateSomething") {
                Fetch(service: "S2") {
                  {
                    ... on Query {
                      two
                    }
                  }
                },
              },
            },
          }
        `);

        const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);

        expect(hasMutated).toBeTruthy();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "mutateSomething": Object {
              "one": 1,
              "two": 2,
            },
          }
        `);
    })

    it('can mutate other subgraphs when the Mutation type is the type of a field', async () => {
      const s1 = gql`
        type Query {
          getA: A
        }

        type Mutation {
          mutateOne: Int
        }

        type A {
          m: Mutation
        }
      `;

      const s2 = gql`
        type Mutation {
          mutateTwo: Int
        }
      `;

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([
        { name: 'S1', typeDefs: s1 },
        { name: 'S2', typeDefs: s2 }
      ]);

      let mutateOneCalled = false;
      let mutateTwoCalled = false;

      addResolversToSchema(serviceMap['S1'].schema, {
        Query: {
          getA() {
            return {
              getA: {}
            };
          },
        },
        A: {
          m() {
            return Object.create(null);
          }
        },
        Mutation: {
          mutateOne() {
            mutateOneCalled = true;
            return 1;
          }
        }
      });

      addResolversToSchema(serviceMap['S2'].schema, {
        Mutation: {
          mutateTwo() {
            mutateTwoCalled = true;
            return 2;
          },
        },
      });

      const operation = parseOp(`
        query {
          getA {
            m {
              mutateOne
              mutateTwo
            }
          }
        }
        `, schema);

      const queryPlan = buildPlan(operation, queryPlanner);

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                getA {
                  m {
                    __typename
                    mutateOne
                  }
                }
              }
            },
            Flatten(path: "getA.m") {
              Fetch(service: "S2") {
                {
                  ... on Mutation {
                    mutateTwo
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(mutateOneCalled).toBeTruthy();
      expect(mutateTwoCalled).toBeTruthy();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getA": Object {
            "m": Object {
              "mutateOne": 1,
              "mutateTwo": 2,
            },
          },
        }
      `);
    })

    it('can mutate other subgraphs when the Mutation type is the type of a field after a mutation', async () => {
        const s1 = gql`
          type Query {
            one: Int
          }

          type Mutation {
            mutateSomething: Mutation
          }
        `;

        const s2 = gql`
          type Mutation {
            mutateTwo: Int
          }
        `;

        const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([
          { name: 'S1', typeDefs: s1 },
          { name: 'S2', typeDefs: s2 }
        ]);

        let somethingMutationCount = 0;
        let hasMutatedTwo = false;

        addResolversToSchema(serviceMap['S1'].schema, {
          Query: {
            one() {
              return 1;
            },
          },
          Mutation: {
            mutateSomething() {
              ++somethingMutationCount;
              return {};
            },
          }
        });

        addResolversToSchema(serviceMap['S2'].schema, {
          Mutation: {
            mutateTwo() {
              hasMutatedTwo = true;
              return 2;
            },
          },
        });

        const operation = parseOp(`
          mutation {
            mutateSomething {
              mutateSomething {
                mutateTwo
              }
            }
          }
          `, schema);

        const queryPlan = buildPlan(operation, queryPlanner);

        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  mutateSomething {
                    mutateSomething {
                      __typename
                    }
                  }
                }
              },
              Flatten(path: "mutateSomething.mutateSomething") {
                Fetch(service: "S2") {
                  {
                    ... on Mutation {
                      mutateTwo
                    }
                  }
                },
              },
            },
          }
        `);

        const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);

        expect(somethingMutationCount).toBe(2);
        expect(hasMutatedTwo).toBeTruthy();
        expect(response.data).toMatchInlineSnapshot(`
          Object {
            "mutateSomething": Object {
              "mutateSomething": Object {
                "mutateTwo": 2,
              },
            },
          }
        `);
    })
  });

  describe('interfaces on interfaces', () => {
    it('can execute queries on an interface only implemented by other interfaces', async () => {
      const s1 = gql`
        type Query {
          allValues: [TopInterface!]!
        }

        interface TopInterface {
          a: Int
        }

        interface SubInterface1 implements TopInterface {
          a: Int
          b: String
        }

        interface SubInterface2 implements TopInterface {
          a: Int
          c: String
        }

        type T1 implements SubInterface1 & TopInterface {
          a: Int
          b: String
        }

        type T2 implements SubInterface1 & TopInterface @key(fields: "b") {
          a: Int @external
          b: String
        }

        type T3 implements SubInterface2 & TopInterface {
          a: Int
          c: String
        }

        type T4 implements SubInterface1 & SubInterface2 & TopInterface @key(fields: "a") {
          a: Int
          b: String @external
          c: String @external
        }
      `;

      const s2 = gql`
        type T2 @key(fields: "b") {
          a: Int
          b: String
        }

        type T4 @key(fields: "a") {
          a: Int
          b: String
          c: String
        }
      `;

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([
        { name: 'S1', typeDefs: s1 },
        { name: 'S2', typeDefs: s2 }
      ]);

      const t1s_s1: any[] = [{ __typename: 'T1', a: 1, b: 'T1_v1'}, {__typename: 'T1', a: 2, b: 'T1_v2'}];
      const t2s_s1: any[] = [{__typename: 'T2', b: 'k1'}, {__typename: 'T2', b: 'k2'}];
      const t3s_s1: any[] = [{__typename: 'T3', a: 42, c: 'T3_v1'}];
      const t4s_s1: any[] = [{__typename: 'T4', a: 0}, {__typename: 'T4', a: 10}, {__typename: 'T4', a: 20}];

      const t2s_s2 = new Map<string, {a: number, b: string}>();
      t2s_s2.set('k1', {a: 12 , b: 'k1'});
      t2s_s2.set('k2', {a: 24 , b: 'k2'});

      const t4s_s2 = new Map<number, {a: number, b: string, c: string}>();
      t4s_s2.set(0, {a: 0, b: 'b_0', c: 'c_0'});
      t4s_s2.set(10, {a: 10, b: 'b_10', c: 'c_10'});
      t4s_s2.set(20, {a: 20, b: 'b_20', c: 'c_20'});

      addResolversToSchema(serviceMap['S1'].schema, {
        Query: {
          allValues() {
            return t1s_s1.concat(t2s_s1).concat(t3s_s1).concat(t4s_s1);
          },
        },
      });

      addResolversToSchema(serviceMap['S2'].schema, {
        T2: {
          __resolveReference(ref) {
            return t2s_s2.get(ref.b);
          }
        },
        T4: {
          __resolveReference(ref) {
            return t4s_s2.get(ref.a);
          }
        },
      });

      const operation = parseOp(`
        query {
          allValues {
            a
            ... on SubInterface1 {
              b
            }
            ... on SubInterface2 {
              c
            }
          }
        }
        `, schema);

      const queryPlan = buildPlan(operation, queryPlanner);

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                allValues {
                  __typename
                  ... on T1 {
                    a
                    b
                  }
                  ... on T2 {
                    __typename
                    b
                  }
                  ... on T3 {
                    a
                    c
                  }
                  ... on T4 {
                    __typename
                    a
                  }
                }
              }
            },
            Flatten(path: "allValues.@") {
              Fetch(service: "S2") {
                {
                  ... on T2 {
                    __typename
                    b
                  }
                  ... on T4 {
                    __typename
                    a
                  }
                } =>
                {
                  ... on T2 {
                    a
                  }
                  ... on T4 {
                    b
                    c
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);

      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "allValues": Array [
            Object {
              "a": 1,
              "b": "T1_v1",
            },
            Object {
              "a": 2,
              "b": "T1_v2",
            },
            Object {
              "a": 12,
              "b": "k1",
            },
            Object {
              "a": 24,
              "b": "k2",
            },
            Object {
              "a": 42,
              "c": "T3_v1",
            },
            Object {
              "a": 0,
              "b": "b_0",
              "c": "c_0",
            },
            Object {
              "a": 10,
              "b": "b_10",
              "c": "c_10",
            },
            Object {
              "a": 20,
              "b": "b_20",
              "c": "c_20",
            },
          ],
        }
        `);
    });

    it('does not type explode when it does not need to', async () => {
      // Fairly similar example than the previous one, but ensure field `a` don't need
      // type explosion and unsure it isn't type-exploded.
      const s1 = gql`
        type Query {
          allValues: [TopInterface!]!
        }

        interface TopInterface {
          a: Int
        }

        interface SubInterface1 implements TopInterface {
          a: Int
          b: String
        }

        interface SubInterface2 implements TopInterface {
          a: Int
          c: String
        }

        type T1 implements SubInterface1 & TopInterface {
          a: Int
          b: String
        }

        type T2 implements SubInterface1 & TopInterface @key(fields: "a") {
          a: Int
          b: String @external
        }

        type T3 implements SubInterface2 & TopInterface {
          a: Int
          c: String
        }

        type T4 implements SubInterface1 & SubInterface2 & TopInterface @key(fields: "a") {
          a: Int
          b: String @external
          c: String @external
        }
      `;

      const s2 = gql`
        type T2 @key(fields: "a") {
          a: Int
          b: String
        }

        type T4 @key(fields: "a") {
          a: Int
          b: String
          c: String
        }
      `;

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([
        { name: 'S1', typeDefs: s1 },
        { name: 'S2', typeDefs: s2 }
      ]);

      const t1s_s1: any[] = [{ __typename: 'T1', a: 1, b: 'T1_v1'}, {__typename: 'T1', a: 2, b: 'T1_v2'}];
      const t2s_s1: any[] = [{__typename: 'T2', a: 12}, {__typename: 'T2', a: 24}];
      const t3s_s1: any[] = [{__typename: 'T3', a: 42, c: 'T3_v1'}];
      const t4s_s1: any[] = [{__typename: 'T4', a: 0}, {__typename: 'T4', a: 10}, {__typename: 'T4', a: 20}];

      const t2s_s2 = new Map<number, {a: number, b: string}>();
      t2s_s2.set(12, {a: 12 , b: 'k1'});
      t2s_s2.set(24, {a: 24 , b: 'k2'});

      const t4s_s2 = new Map<number, {a: number, b: string, c: string}>();
      t4s_s2.set(0, {a: 0, b: 'b_0', c: 'c_0'});
      t4s_s2.set(10, {a: 10, b: 'b_10', c: 'c_10'});
      t4s_s2.set(20, {a: 20, b: 'b_20', c: 'c_20'});

      addResolversToSchema(serviceMap['S1'].schema, {
        Query: {
          allValues() {
            return t1s_s1.concat(t2s_s1).concat(t3s_s1).concat(t4s_s1);
          },
        },
      });

      addResolversToSchema(serviceMap['S2'].schema, {
        T2: {
          __resolveReference(ref) {
            return t2s_s2.get(ref.b);
          }
        },
        T4: {
          __resolveReference(ref) {
            return t4s_s2.get(ref.a);
          }
        },
      });

      let operation = parseOp(`
        query {
          allValues {
            a
          }
        }
        `, schema);

      let queryPlan = buildPlan(operation, queryPlanner);

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "S1") {
            {
              allValues {
                __typename
                a
              }
            }
          },
        }
      `);

      let response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "allValues": Array [
            Object {
              "a": 1,
            },
            Object {
              "a": 2,
            },
            Object {
              "a": 12,
            },
            Object {
              "a": 24,
            },
            Object {
              "a": 42,
            },
            Object {
              "a": 0,
            },
            Object {
              "a": 10,
            },
            Object {
              "a": 20,
            },
          ],
        }
        `);

      operation = parseOp(`
        query {
          allValues {
            ... on SubInterface1 {
              a
            }
          }
        }
        `, schema);

      queryPlan = buildPlan(operation, queryPlanner);

      // TODO: we're actually type-exploding in this case because currently, as soon as we need to type-explode, we do
      // so into all the runtime types, while here it could make sense to only type-explode into the direct sub-types=
      // (the sub-interfaces). We should fix this (but it's only sub-optimal, not incorrect).
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "S1") {
            {
              allValues {
                __typename
                ... on T1 {
                  a
                }
                ... on T2 {
                  a
                }
                ... on T4 {
                  a
                }
              }
            }
          },
        }
      `);

      response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "allValues": Array [
            Object {
              "a": 1,
            },
            Object {
              "a": 2,
            },
            Object {
              "a": 12,
            },
            Object {
              "a": 24,
            },
            Object {},
            Object {
              "a": 0,
            },
            Object {
              "a": 10,
            },
            Object {
              "a": 20,
            },
          ],
        }
        `);
    });
  });

  test('do not send subgraphs an interface they do not know', async () => {
    // This test validates that the issue described on https://github.com/apollographql/federation/issues/817 is fixed.
    const s1 = {
      name: 'S1',
      typeDefs: gql`
        type Query {
          myField: MyInterface
        }

        interface MyInterface {
          name: String
        }

        type MyTypeA implements MyInterface {
          name: String
        }

        type MyTypeB implements MyInterface {
          name: String
        }
      `
    }

    const s2 = {
      name: 'S2',
      typeDefs: gql`
        interface MyInterface {
          name: String
        }

        type MyTypeC implements MyInterface {
          name: String
        }
      `
    }

    const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

    addResolversToSchema(serviceMap['S1'].schema, {
      Query: {
        myField() {
          return { __typename: 'MyTypeA', name: "foo" };
        },
      },
    });

    // First, we just query the field without conditions.
    // Note that there is no reason to type-explode this: clearly, `myField` will never return a `MyTypeC` since
    // it's resolved by S1 which doesn't know that type, but that doesn't impact the plan.
    let operation = parseOp(`
      query {
        myField {
          name
        }
      }
      `, schema);
    let queryPlan = buildPlan(operation, queryPlanner);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            myField {
              __typename
              name
            }
          }
        },
      }
    `);
    let response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "myField": Object {
          "name": "foo",
        },
      }
      `);

    // Now forcing the query planning to notice that `MyTypeC` can never happen and making
    // sure it doesn't ask it from S1, which doesn't know it.
    operation = parseOp(`
      query {
        myField {
          ... on MyTypeA {
            name
          }
          ... on MyTypeC {
            name
          }
        }
      }
      `, schema);
    queryPlan = buildPlan(operation, queryPlanner);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            myField {
              __typename
              ... on MyTypeA {
                name
              }
            }
          }
        },
      }
    `);

    response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "myField": Object {
          "name": "foo",
        },
      }
      `);


    // Testing only getting name for `MyTypeB`, which is known by S1, but not returned
    // by `myField` in practice (so the result is "empty").
    operation = parseOp(`
      query {
        myField {
          ... on MyTypeB {
            name
          }
        }
      }
      `, schema);

    queryPlan = buildPlan(operation, queryPlanner);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            myField {
              __typename
              ... on MyTypeB {
                name
              }
            }
          }
        },
      }
    `);
    response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "myField": Object {},
      }
      `);

    operation = parseOp(`
      query {
        myField {
          ... on MyTypeC {
            name
          }
        }
      }
      `, schema);

    // Lastly, same with only getting name for `MyTypeC`. It isn't known by S1 so the condition should not
    // be included in the query, but we should still query `myField` to know if it resolve to "something"
    // (and all we know it can't be a `MyTypeC`) or to `null`. In particular, the end response should be
    // the same than in the previous example with `MyTypeB` since from the end-use POV, this is the same
    // example.
    queryPlan = buildPlan(operation, queryPlanner);
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "S1") {
          {
            myField {
              __typename
            }
          }
        },
      }
    `);

    response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
    expect(response.data).toMatchInlineSnapshot(`
      Object {
        "myField": Object {},
      }
      `);
  });

  describe('@requires', () => {
    test('handles null in required field correctly (with nullable fields)', async () => {
      const s1_data = [
        { id: 0, f1: "foo" },
        { id: 1, f1: null },
        { id: 2, f1: "bar" },
      ];

      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type T1 @key(fields: "id") {
            id: Int!
            f1: String
          }
        `,
        resolvers: {
          T1: {
            __resolveReference(ref: {id: number}) {
              return s1_data[ref.id];
            },
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Query {
            getT1s: [T1]
          }

          type T1 @key(fields: "id") {
            id: Int!
            f1: String @external
            f2: T2 @requires(fields: "f1")
          }

          type T2 {
            a: String
          }
        `,
        resolvers: {
          Query: {
            getT1s() {
              return [{id: 0}, {id: 1}, {id: 2}];
            },
          },
          T1: {
            __resolveReference(ref: { id: number }) {
              // the ref has already the id and f1 is a require is triggered, and we resolve f2 below
              return ref;
            },
            f2(o: { f1: string }) {
              return o.f1 === null ? null : { a: `t1:${o.f1}` };
            }
          }
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        query {
          getT1s {
            id
            f1
            f2 {
              a
            }
          }
        }
        `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S2") {
              {
                getT1s {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S1") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f1
                  }
                }
              },
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S2") {
                {
                  ... on T1 {
                    __typename
                    f1
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f2 {
                      a
                    }
                  }
                }
              },
            },
          },
        }
      `);
      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getT1s": Array [
            Object {
              "f1": "foo",
              "f2": Object {
                "a": "t1:foo",
              },
              "id": 0,
            },
            Object {
              "f1": null,
              "f2": null,
              "id": 1,
            },
            Object {
              "f1": "bar",
              "f2": Object {
                "a": "t1:bar",
              },
              "id": 2,
            },
          ],
        }
        `);
      expect(response.errors).toBeUndefined();
    });

    test('handles null in required field correctly (with @require field non-nullable)', async () => {
      const s1_data = [
        { id: 0, f1: "foo" },
        { id: 1, f1: null },
        { id: 2, f1: "bar" },
      ];

      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type T1 @key(fields: "id") {
            id: Int!
            f1: String
          }
        `,
        resolvers: {
          T1: {
            __resolveReference(ref: { id: number }) {
              return s1_data[ref.id];
            },
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Query {
            getT1s: [T1]
          }

          type T1 @key(fields: "id") {
            id: Int!
            f1: String @external
            f2: T2! @requires(fields: "f1")
          }

          type T2 {
            a: String
          }
        `,
        resolvers: {
          Query: {
            getT1s() {
              return [{id: 0}, {id: 1}, {id: 2}];
            },
          },
          T1: {
            __resolveReference(ref: { id: number }) {
              // the ref has already the id and f1 is a require is triggered, and we resolve f2 below
              return ref;
            },
            f2(o: { f1: string }) {
              return o.f1 === null ? null : { a: `t1:${o.f1}` };
            }
          }
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        query {
          getT1s {
            id
            f1
            f2 {
              a
            }
          }
        }
        `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S2") {
              {
                getT1s {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S1") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f1
                  }
                }
              },
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S2") {
                {
                  ... on T1 {
                    __typename
                    f1
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f2 {
                      a
                    }
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      // `null` should bubble up since `f2` is now non-nullable. But we should still get the `id: 0` response.
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getT1s": Array [
            Object {
              "f1": "foo",
              "f2": Object {
                "a": "t1:foo",
              },
              "id": 0,
            },
            null,
            Object {
              "f1": "bar",
              "f2": Object {
                "a": "t1:bar",
              },
              "id": 2,
            },
          ],
        }
        `);

      // We returning `null` for f2 which isn't nullable, so it bubbled up and we should have an error
      expect(response.errors?.map((e) => e.message)).toStrictEqual(['Cannot return null for non-nullable field T1.f2.']);
    });

    test('handles null in required field correctly (with non-nullable required field)', async () => {
      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type T1 @key(fields: "id") {
            id: Int!
            f1: String!
          }
        `,
        resolvers: {
          T1: {
            __resolveReference(ref: { id: number}) {
              return s1_data[ref.id];
            },
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Query {
            getT1s: [T1]
          }

          type T1 @key(fields: "id") {
            id: Int!
            f1: String! @external
            f2: T2 @requires(fields: "f1")
          }

          type T2 {
            a: String
          }
        `,
        resolvers: {
          Query: {
            getT1s() {
              return [{id: 0}, {id: 1}, {id: 2}];
            },
          },
          T1: {
            __resolveReference(ref: { id: number }) {
              // the ref has already the id and f1 is a require is triggered, and we resolve f2 below
              return ref;
            },
            f2(o: { f1: string }) {
              return o.f1 === null ? null : { a: `t1:${o.f1}` };
            }
          }
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const s1_data = [
        { id: 0, f1: "foo" },
        { id: 1, f1: null },
        { id: 2, f1: "bar" },
      ];

      const operation = parseOp(`
        query {
          getT1s {
            id
            f1
            f2 {
              a
            }
          }
        }
        `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S2") {
              {
                getT1s {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S1") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f1
                  }
                }
              },
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S2") {
                {
                  ... on T1 {
                    __typename
                    f1
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f2 {
                      a
                    }
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      // `null` should bubble up since `f2` is now non-nullable. But we should still get the `id: 0` response.
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getT1s": Array [
            Object {
              "f1": "foo",
              "f2": Object {
                "a": "t1:foo",
              },
              "id": 0,
            },
            null,
            Object {
              "f1": "bar",
              "f2": Object {
                "a": "t1:bar",
              },
              "id": 2,
            },
          ],
        }
        `);
      expect(response.errors?.map((e) => e.message)).toStrictEqual(['Cannot return null for non-nullable field T1.f1.']);
    });

    test('handles errors in required field correctly (with nullable fields)', async () => {
      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type T1 @key(fields: "id") {
            id: Int!
            f1: String
          }
        `,
        resolvers: {
          T1: {
            __resolveReference(ref: { id: number }) {
              return ref;
            },
            f1(o: { id: number }) {
              switch (o.id) {
                case 0: return "foo";
                case 1: return [ "invalid" ]; // This will effectively throw
                case 2: return "bar";
                default: throw new Error('Not handled');
              }
            }
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Query {
            getT1s: [T1]
          }

          type T1 @key(fields: "id") {
            id: Int!
            f1: String @external
            f2: T2 @requires(fields: "f1")
          }

          type T2 {
            a: String
          }
        `,
        resolvers: {
          Query: {
            getT1s() {
              return [{id: 0}, {id: 1}, {id: 2}];
            },
          },
          T1: {
            __resolveReference(ref: { id: number }) {
              // the ref has already the id and f1 is a require is triggered, and we resolve f2 below
              return ref;
            },
            f2(o: { f1: string }) {
              return o.f1 === null ? null : { a: `t1:${o.f1}` };
            }
          }
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        query {
          getT1s {
            id
            f1
            f2 {
              a
            }
          }
        }
        `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S2") {
              {
                getT1s {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S1") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f1
                  }
                }
              },
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S2") {
                {
                  ... on T1 {
                    __typename
                    f1
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f2 {
                      a
                    }
                  }
                }
              },
            },
          },
        }
      `);
      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getT1s": Array [
            Object {
              "f1": "foo",
              "f2": Object {
                "a": "t1:foo",
              },
              "id": 0,
            },
            Object {
              "f1": null,
              "f2": null,
              "id": 1,
            },
            Object {
              "f1": "bar",
              "f2": Object {
                "a": "t1:bar",
              },
              "id": 2,
            },
          ],
        }
        `);
      expect(response.errors?.map((e) => e.message)).toStrictEqual(['String cannot represent value: ["invalid"]']);
    });

    test('ensures type condition on inaccessible type in @require works correctly', async () => {
      const s1 = {
        name: 'data',
        typeDefs: gql`
          extend schema
          @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

          type Entity @key(fields: "id") {
            id: ID!
            data: Foo
          }

          interface Foo {
            foo: String!
          }

          interface Bar implements Foo {
            foo: String!
            bar: String!
          }

          type Data implements Foo & Bar @shareable {
            foo: String!
            bar: String!
          }
        `,
        resolvers: {
            Query: {
              dummy() {
                return {};
              },
            },
            Entity: {
              __resolveReference() {
                return {};
              },
              id() {
                return "id";
              },
              data() {
                return {
                  __typename: "Data",
                  foo: "foo",
                  bar: "bar",
                };
              },
            },

        }
      }

      let requirerRepresentation: any = undefined;

      const s2 = {
        name: 'requirer',
        typeDefs: gql`
          extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0",
            import: ["@key", "@shareable", "@external", "@requires", "@inaccessible"]
          )

          type Query {
            dummy: Entity
          }

          type Entity @key(fields: "id") {
            id: ID!
            data: Foo @external
            requirer: String! @requires(fields: "data { foo ... on Bar { bar } }")
          }

          interface Foo {
            foo: String!
          }

          interface Bar implements Foo @inaccessible {
            foo: String!
            bar: String!
          }

          type Data implements Foo & Bar @shareable {
            foo: String!
            bar: String!
          }
        `,
        resolvers: {
          Query: {
            dummy() {
              return {};
            },
          },
          Entity: {
            __resolveReference(representation: any) {
              requirerRepresentation = representation;
              return {};
            },
            id() {
              return "id";
            },
            requirer() {
              return "requirer";
            },
          },
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        query {
          dummy {
            requirer
          }
        }
        `, schema);

      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "requirer") {
              {
                dummy {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "dummy") {
              Fetch(service: "data") {
                {
                  ... on Entity {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Entity {
                    data {
                      __typename
                      foo
                      ... on Data {
                        bar
                      }
                    }
                  }
                }
              },
            },
            Flatten(path: "dummy") {
              Fetch(service: "requirer") {
                {
                  ... on Entity {
                    __typename
                    data {
                      foo
                      ... on Bar {
                        bar
                      }
                    }
                    id
                  }
                } =>
                {
                  ... on Entity {
                    requirer
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "dummy": Object {
            "requirer": "requirer",
          },
        }
      `);

      expect(requirerRepresentation).toMatchInlineSnapshot(`
        Object {
          "__typename": "Entity",
          "data": Object {
            "bar": "bar",
            "foo": "foo",
          },
          "id": "id",
        }
      `);
    });

    test('correctly include key/typename when top-level required object is non-external', async () => {
      const entityTwo = {
        id: 'key2',
        external: 'v2',
      };
      const entityOne = {
        id: 'key1',
        two: { id: entityTwo.id },
      };

      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type Query {
            one: One
          }

          type One @key(fields: "id") {
            id: ID!
            two: Two
            computed: String @requires(fields: "two { external }")
          }

          type Two @key(fields: "id") {
            id: ID!
            external: String @external
          }
        `,
        resolvers: {
          Query: {
            one() {
              return entityOne;
            },
          },
          One: {
            __resolveReference(ref: { id: string }) {
              return ref.id === entityOne.id ? { ...entityOne, ...ref } : undefined;
            },
            computed(parent: any) {
              return `computed value: ${parent.two.external}`;
            },
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Two @key(fields: "id") {
            id: ID!
            external: String
          }
        `,
        resolvers: {
          Two: {
            __resolveReference(ref: { id: string }) {
              return ref.id === entityTwo.id ? entityTwo : undefined;
            },
          },
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        {
          one {
            computed
          }
        }
      `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S1") {
              {
                one {
                  __typename
                  two {
                    __typename
                    id
                  }
                  id
                }
              }
            },
            Flatten(path: "one.two") {
              Fetch(service: "S2") {
                {
                  ... on Two {
                    __typename
                    id
                  }
                } =>
                {
                  ... on Two {
                    external
                  }
                }
              },
            },
            Flatten(path: "one") {
              Fetch(service: "S1") {
                {
                  ... on One {
                    __typename
                    two {
                      external
                    }
                    id
                  }
                } =>
                {
                  ... on One {
                    computed
                  }
                }
              },
            },
          },
        }
      `);
      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      expect(response.errors).toBeUndefined();
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "one": Object {
            "computed": "computed value: v2",
          },
        }
      `);
    });
  });

  describe('@key', () => {
    test('Works on a list of scalar', async () => {
      const s1_data = [
        { id: [0, 1], f1: "foo" },
        { id: [2, 3], f1: "bar" },
        { id: [4, 5], f1: "baz" },
      ];

      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type T1 @key(fields: "id") {
            id: [Int]
            f1: String
          }
        `,
        resolvers: {
          T1: {
            __resolveReference(ref: { id: number[] }) {
              return s1_data.find((e) => arrayEquals(e.id, ref.id));
            },
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Query {
            getT1s: [T1]
          }

          type T1 {
            id: [Int]
          }
        `,
        resolvers: {
          Query: {
            getT1s() {
              return [{id: [2, 3]}, {id: [4, 5]}];
            },
          },
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        query {
          getT1s {
            id
            f1
          }
        }
        `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S2") {
              {
                getT1s {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S1") {
                {
                  ... on T1 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T1 {
                    f1
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      // `null` should bubble up since `f2` is now non-nullable. But we should still get the `id: 0` response.
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getT1s": Array [
            Object {
              "f1": "bar",
              "id": Array [
                2,
                3,
              ],
            },
            Object {
              "f1": "baz",
              "id": Array [
                4,
                5,
              ],
            },
          ],
        }
        `);
    });

    test('Works on a list of objects', async () => {
      const s1_data = [
        { o: [{a: 0, b: "b0", c: "zero"}, {a: 1, b: "b1", c: "one"}], f1: "foo" },
        { o: [{a: 2, b: "b2", c: "two"}], f1: "bar" },
        { o: [{a: 3, b: "b3", c: "three"}, {a: 4, b: "b4", c: "four"}], f1: "baz" },
      ];

      const s1 = {
        name: 'S1',
        typeDefs: gql`
          type T1 @key(fields: "o { a c }") {
            o: [O]
            f1: String
          }

          type O {
            a: Int
            b: String
            c: String
          }
        `,
        resolvers: {
          T1: {
            __resolveReference(ref: { o: {a : number, c: string}[] }) {
              return s1_data.find((e) => arrayEquals(e.o, ref.o, (x, y) => x.a === y.a && x.c === y.c));
            },
          },
        }
      }

      const s2 = {
        name: 'S2',
        typeDefs: gql`
          type Query {
            getT1s: [T1]
          }

          type T1 {
            o: [O]
          }

          type O {
            a: Int
            b: String
            c: String
          }
        `,
        resolvers: {
          Query: {
            getT1s() {
              return [{o: [{a: 2, b: "b2", c: "two"}]}, {o: [{a: 3, b: "b3", c: "three"}, {a: 4, b: "b4", c: "four"}]}];
            },
          },
        }
      }

      const { serviceMap, schema, queryPlanner} = getFederatedTestingSchema([ s1, s2 ]);

      const operation = parseOp(`
        query {
          getT1s {
            o {
              a
              b
              c
            }
            f1
          }
        }
        `, schema);
      const queryPlan = buildPlan(operation, queryPlanner);
      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "S2") {
              {
                getT1s {
                  __typename
                  o {
                    a
                    c
                    b
                  }
                }
              }
            },
            Flatten(path: "getT1s.@") {
              Fetch(service: "S1") {
                {
                  ... on T1 {
                    __typename
                    o {
                      a
                      c
                    }
                  }
                } =>
                {
                  ... on T1 {
                    f1
                  }
                }
              },
            },
          },
        }
      `);

      const response = await executePlan(queryPlan, operation, undefined, schema, serviceMap);
      // `null` should bubble up since `f2` is now non-nullable. But we should still get the `id: 0` response.
      expect(response.data).toMatchInlineSnapshot(`
        Object {
          "getT1s": Array [
            Object {
              "f1": "bar",
              "o": Array [
                Object {
                  "a": 2,
                  "b": "b2",
                  "c": "two",
                },
              ],
            },
            Object {
              "f1": "baz",
              "o": Array [
                Object {
                  "a": 3,
                  "b": "b3",
                  "c": "three",
                },
                Object {
                  "a": 4,
                  "b": "b4",
                  "c": "four",
                },
              ],
            },
          ],
        }
        `);
    });
  });
});
