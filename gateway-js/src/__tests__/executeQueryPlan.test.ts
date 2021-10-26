import {
  buildClientSchema,
  getIntrospectionQuery,
  GraphQLObjectType,
  GraphQLSchema,
  print,
} from 'graphql';
import { addResolversToSchema, GraphQLResolverMap } from 'apollo-graphql';
import gql from 'graphql-tag';
import { GraphQLRequestContext, VariableValues } from 'apollo-server-types';
import { AuthenticationError } from 'apollo-server-core';
import { buildOperationContext } from '../operationContext';
import { executeQueryPlan } from '../executeQueryPlan';
import { LocalGraphQLDataSource } from '../datasources/LocalGraphQLDataSource';
import {
  astSerializer,
  queryPlanSerializer,
  superGraphWithInaccessible,
} from 'apollo-federation-integration-testsuite';
import { buildComposedSchema, QueryPlanner } from '@apollo/query-planner';
import { ApolloGateway } from '..';
import { ApolloServerBase as ApolloServer } from 'apollo-server-core';
import { getFederatedTestingSchema } from './execution-utils';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('executeQueryPlan', () => {
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

  let serviceMap: {
    [serviceName: string]: LocalGraphQLDataSource;
  };
  let schema: GraphQLSchema;
  let queryPlanner: QueryPlanner;
  beforeEach(() => {
    expect(
      () =>
        ({ serviceMap, schema, queryPlanner } = getFederatedTestingSchema()),
    ).not.toThrow();
  });

  function buildRequestContext(
    variables: VariableValues = {},
  ): GraphQLRequestContext {
    // @ts-ignore
    return {
      cache: undefined as any,
      context: {},
      request: {
        variables,
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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

      expect(response).not.toHaveProperty('errors');
    });

    it(`should include an error when a root-level field errors out`, async () => {
      overrideResolversInService('accounts', {
        RootQuery: {
          me() {
            throw new AuthenticationError('Something went wrong');
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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const requestContext = buildRequestContext();
    requestContext.request.variables = { first: 3 };

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      requestContext,
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const requestContext = buildRequestContext();
    requestContext.request.variables = { locale: 'en-US' };

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      requestContext,
      operationContext,
    );

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
    const operationContext = buildOperationContext({
      schema,
      operationDocument: gql`
        ${getIntrospectionQuery()}
      `,
    });
    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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

    const operationDocument = gql(operationString);

    const operationContext = buildOperationContext({
      schema,
      operationDocument,
    });

    const queryPlan = queryPlanner.buildQueryPlan(operationContext);

    const response = await executeQueryPlan(
      queryPlan,
      serviceMap,
      buildRequestContext(),
      operationContext,
    );

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
      schema = buildComposedSchema(superGraphWithInaccessible);
      queryPlanner = new QueryPlanner(schema);

      const operationContext = buildOperationContext({
        schema,
        operationDocument: gql`
          ${getIntrospectionQuery()}
        `,
      });
      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      schema = buildComposedSchema(superGraphWithInaccessible);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

      const operationDocument = gql(operationString);

      // Vehicle ID #1 is a "Car" type.
      // This supergraph marks the "Car" type as inaccessible.
      schema = buildComposedSchema(superGraphWithInaccessible);

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

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

  describe('top-level @skip / @include usages', () => {
    it(`top-level skip never calls reviews service (using literals)`, async () => {
      const operationDocument = gql`
        query {
          topReviews @skip(if: true) {
            body
          }
        }
      `;

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

      expect(response.data).toMatchInlineSnapshot(`Object {}`);
      expect(queryPlan).not.toCallService('reviews');
    });

    it(`top-level skip never calls reviews service (using variables)`, async () => {
      const operationDocument = gql`
        query TopReviews($shouldSkip: Boolean!) {
          topReviews @skip(if: $shouldSkip) {
            body
          }
        }
      `;

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const variables = { shouldSkip: true };
      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(variables),
        operationContext,
      );

      expect(response.data).toMatchInlineSnapshot(`Object {}`);
      expect({ queryPlan, variables }).not.toCallService('reviews');
    });

    it(`call to service isn't skipped unless all top-level fields are skipped`, async () => {
      const operationDocument = gql`
        query {
          user(id: "1") @skip(if: true) {
            username
          }
          me @include(if: true) {
            username
          }
        }
      `;

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

      expect(response.data).toMatchObject({
        me: {
          username: '@ada',
        },
      });
      expect(queryPlan).toCallService('accounts');
    });

    it(`call to service is skipped when all top-level fields are skipped`, async () => {
      const operationDocument = gql`
        query {
          user(id: "1") @skip(if: true) {
            username
          }
          me @include(if: false) {
            username
          }
        }
      `;

      const operationContext = buildOperationContext({
        schema,
        operationDocument,
      });

      const queryPlan = queryPlanner.buildQueryPlan(operationContext);

      const response = await executeQueryPlan(
        queryPlan,
        serviceMap,
        buildRequestContext(),
        operationContext,
      );

      expect(response.data).toMatchObject({});
      expect(queryPlan).not.toCallService('accounts');
    });

    describe('@skip and @include combinations', () => {
      it(`include: false, skip: false`, async () => {
        const operationDocument = gql`
          query TopReviews($shouldInclude: Boolean!, $shouldSkip: Boolean!) {
            topReviews @include(if: $shouldInclude) @skip(if: $shouldSkip) {
              body
            }
          }
        `;

        const operationContext = buildOperationContext({
          schema,
          operationDocument,
        });

        const queryPlan = queryPlanner.buildQueryPlan(operationContext);

        const variables = { shouldInclude: false, shouldSkip: false };
        const response = await executeQueryPlan(
          queryPlan,
          serviceMap,
          buildRequestContext(variables),
          operationContext,
        );

        expect(response.data).toMatchObject({});
        expect({ queryPlan, variables }).not.toCallService('reviews');
      });

      it(`include: false, skip: true`, async () => {
        const operationDocument = gql`
          query TopReviews($shouldInclude: Boolean!, $shouldSkip: Boolean!) {
            topReviews @include(if: $shouldInclude) @skip(if: $shouldSkip) {
              body
            }
          }
        `;

        const operationContext = buildOperationContext({
          schema,
          operationDocument,
        });

        const queryPlan = queryPlanner.buildQueryPlan(operationContext);

        const variables = { shouldInclude: false, shouldSkip: true };
        const response = await executeQueryPlan(
          queryPlan,
          serviceMap,
          buildRequestContext(variables),
          operationContext,
        );

        expect(response.data).toMatchObject({});
        expect({ queryPlan, variables }).not.toCallService('reviews');
      });

      it(`include: true, skip: false`, async () => {
        const operationDocument = gql`
          query TopReviews($shouldInclude: Boolean!, $shouldSkip: Boolean!) {
            topReviews(first: 2) @include(if: $shouldInclude) @skip(if: $shouldSkip) {
              body
            }
          }
        `;

        const operationContext = buildOperationContext({
          schema,
          operationDocument,
        });

        const queryPlan = queryPlanner.buildQueryPlan(operationContext);

        const variables = { shouldInclude: true, shouldSkip: false };
        const response = await executeQueryPlan(
          queryPlan,
          serviceMap,
          buildRequestContext(variables),
          operationContext,
        );

        expect(response.data).toMatchObject({
          topReviews: [
            {
              body: 'Love it!',
            },
            {
              body: 'Too expensive.',
            },
          ],
        });
        expect({ queryPlan, variables }).toCallService('reviews');
      });

      it(`include: true, skip: true`, async () => {
        const operationDocument = gql`
          query TopReviews($shouldInclude: Boolean!, $shouldSkip: Boolean!) {
            topReviews @include(if: $shouldInclude) @skip(if: $shouldSkip) {
              body
            }
          }
        `;

        const operationContext = buildOperationContext({
          schema,
          operationDocument,
        });

        const queryPlan = queryPlanner.buildQueryPlan(operationContext);

        const variables = { shouldInclude: true, shouldSkip: true };
        const response = await executeQueryPlan(
          queryPlan,
          serviceMap,
          buildRequestContext(variables),
          operationContext,
        );

        expect(response.data).toMatchObject({});
        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Fetch(service: "reviews", inclusionConditions: [{ include: "shouldInclude", skip: "shouldSkip" }]) {
              {
                topReviews @include(if: $shouldInclude) @skip(if: $shouldSkip) {
                  body
                }
              }
            },
          }
        `);

        expect({ queryPlan, variables }).not.toCallService('reviews');
      });
    });
  });
});
