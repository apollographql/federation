import { GraphQLSchema } from 'graphql';
import gql from 'graphql-tag';
import { buildOperationContext } from '../operationContext';
import {
  astSerializer,
  queryPlanSerializer,
  fixturesWithUpdate,
} from 'apollo-federation-integration-testsuite';
import { getFederatedTestingSchema } from './execution-utils';
import { QueryPlanner, FetchNode } from '@apollo/query-planner';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('buildQueryPlan', () => {
  let schema: GraphQLSchema;
  let queryPlanner: QueryPlanner;

  beforeEach(() => {
    expect(
      () => ({ schema, queryPlanner } = getFederatedTestingSchema()),
    ).not.toThrow();
  });

  it(`should not confuse union types with overlapping field names`, () => {
    const operationString = `#graphql
      query {
          body {
            ... on Image {
              attributes {
                url
              }
            }
            ... on Text {
              attributes {
                bold
                text
              }
            }
          }
        }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "documents") {
          {
            body {
              __typename
              ... on Image {
                attributes {
                  url
                }
              }
              ... on Text {
                attributes {
                  bold
                  text
                }
              }
            }
          }
        },
      }
    `);
  });

  it(`should use a single fetch when requesting a root field from one service`, () => {
    const operationString = `#graphql
      query {
        me {
          name
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "accounts") {
          {
            me {
              name
            }
          }
        },
      }
    `);
  });

  it(`should use two independent fetches when requesting root fields from two services`, () => {
    const operationString = `#graphql
      query {
        me {
          name
        }
        topProducts {
          name
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Parallel {
          Fetch(service: "accounts") {
            {
              me {
                name
              }
            }
          },
          Sequence {
            Fetch(service: "product") {
              {
                topProducts {
                  __typename
                  ... on Book {
                    __typename
                    isbn
                  }
                  ... on Furniture {
                    name
                  }
                }
              }
            },
            Flatten(path: "topProducts.@") {
              Fetch(service: "books") {
                {
                  ... on Book {
                    __typename
                    isbn
                  }
                } =>
                {
                  ... on Book {
                    __typename
                    isbn
                    title
                    year
                  }
                }
              },
            },
            Flatten(path: "topProducts.@") {
              Fetch(service: "product") {
                {
                  ... on Book {
                    __typename
                    isbn
                    title
                    year
                  }
                } =>
                {
                  ... on Book {
                    name
                  }
                }
              },
            },
          },
        },
      }
    `);
  });

  it(`should use a single fetch when requesting multiple root fields from the same service`, () => {
    const operationString = `#graphql
      query {
        topProducts {
          name
        }
        product(upc: "1") {
          name
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "product") {
            {
              topProducts {
                __typename
                ... on Book {
                  __typename
                  isbn
                }
                ... on Furniture {
                  name
                }
              }
              product(upc: "1") {
                __typename
                ... on Book {
                  __typename
                  isbn
                }
                ... on Furniture {
                  name
                }
              }
            }
          },
          Parallel {
            Sequence {
              Flatten(path: "topProducts.@") {
                Fetch(service: "books") {
                  {
                    ... on Book {
                      __typename
                      isbn
                    }
                  } =>
                  {
                    ... on Book {
                      __typename
                      isbn
                      title
                      year
                    }
                  }
                },
              },
              Flatten(path: "topProducts.@") {
                Fetch(service: "product") {
                  {
                    ... on Book {
                      __typename
                      isbn
                      title
                      year
                    }
                  } =>
                  {
                    ... on Book {
                      name
                    }
                  }
                },
              },
            },
            Sequence {
              Flatten(path: "product") {
                Fetch(service: "books") {
                  {
                    ... on Book {
                      __typename
                      isbn
                    }
                  } =>
                  {
                    ... on Book {
                      __typename
                      isbn
                      title
                      year
                    }
                  }
                },
              },
              Flatten(path: "product") {
                Fetch(service: "product") {
                  {
                    ... on Book {
                      __typename
                      isbn
                      title
                      year
                    }
                  } =>
                  {
                    ... on Book {
                      name
                    }
                  }
                },
              },
            },
          },
        },
      }
    `);
  });

  it(`should use a single fetch when requesting relationship subfields from the same service`, () => {
    const operationString = `#graphql
      query {
        topReviews {
          body
          author {
            reviews {
              body
            }
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "reviews") {
          {
            topReviews {
              body
              author {
                reviews {
                  body
                }
              }
            }
          }
        },
      }
    `);
  });

  it(`should use a single fetch when requesting relationship subfields and provided keys from the same service`, () => {
    const operationString = `#graphql
      query {
        topReviews {
          body
          author {
            id
            reviews {
              body
            }
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "reviews") {
          {
            topReviews {
              body
              author {
                id
                reviews {
                  body
                }
              }
            }
          }
        },
      }
    `);
  });

  describe(`when requesting an extension field from another service`, () => {
    it(`should add the field's representation requirements to the parent selection set and use a dependent fetch`, () => {
      const operationString = `#graphql
        query {
          me {
            name
            reviews {
              body
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "accounts") {
              {
                me {
                  name
                  __typename
                  id
                }
              }
            },
            Flatten(path: "me") {
              Fetch(service: "reviews") {
                {
                  ... on User {
                    __typename
                    id
                  }
                } =>
                {
                  ... on User {
                    reviews {
                      body
                    }
                  }
                }
              },
            },
          },
        }
      `);
    });

    describe(`when the parent selection set is empty`, () => {
      it(`should add the field's requirements to the parent selection set and use a dependent fetch`, () => {
        const operationString = `#graphql
          query {
            me {
              reviews {
                body
              }
            }
          }
        `;

        const operationDocument = gql(operationString);

        const queryPlan = queryPlanner.buildQueryPlan(
          buildOperationContext({
            schema,
            operationDocument,
          }),
        );

        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "accounts") {
                {
                  me {
                    __typename
                    id
                  }
                }
              },
              Flatten(path: "me") {
                Fetch(service: "reviews") {
                  {
                    ... on User {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on User {
                      reviews {
                        body
                      }
                    }
                  }
                },
              },
            },
          }
        `);
      });
    });

    // TODO: Ask martijn about the meaning of this test
    it(`should only add requirements once`, () => {
      const operationString = `#graphql
        query {
          me {
            reviews {
              body
            }
            numberOfReviews
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "accounts") {
              {
                me {
                  __typename
                  id
                }
              }
            },
            Flatten(path: "me") {
              Fetch(service: "reviews") {
                {
                  ... on User {
                    __typename
                    id
                  }
                } =>
                {
                  ... on User {
                    reviews {
                      body
                    }
                    numberOfReviews
                  }
                }
              },
            },
          },
        }
      `);
    });
  });

  describe(`when requesting a composite field with subfields from another service`, () => {
    it(`should add key fields to the parent selection set and use a dependent fetch`, () => {
      const operationString = `#graphql
        query {
          topReviews {
            body
            author {
              name
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "reviews") {
              {
                topReviews {
                  body
                  author {
                    __typename
                    id
                  }
                }
              }
            },
            Flatten(path: "topReviews.@.author") {
              Fetch(service: "accounts") {
                {
                  ... on User {
                    __typename
                    id
                  }
                } =>
                {
                  ... on User {
                    name
                  }
                }
              },
            },
          },
        }
      `);
    });

    describe(`when requesting a field defined in another service which requires a field in the base service`, () => {
      it(`should add the field provided by base service in first Fetch`, () => {
        const operationString = `#graphql
          query {
            topCars {
              retailPrice
            }
          }
        `;

        const operationDocument = gql(operationString);

        const queryPlan = queryPlanner.buildQueryPlan(
          buildOperationContext({
            schema,
            operationDocument,
          }),
        );

        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "product") {
                {
                  topCars {
                    __typename
                    id
                    price
                  }
                }
              },
              Flatten(path: "topCars.@") {
                Fetch(service: "reviews") {
                  {
                    ... on Car {
                      __typename
                      id
                      price
                    }
                  } =>
                  {
                    ... on Car {
                      retailPrice
                    }
                  }
                },
              },
            },
          }
        `);
      });
    });

    describe(`when the parent selection set is empty`, () => {
      it(`should add key fields to the parent selection set and use a dependent fetch`, () => {
        const operationString = `#graphql
          query {
            topReviews {
              author {
                name
              }
            }
          }
        `;

        const operationDocument = gql(operationString);

        const queryPlan = queryPlanner.buildQueryPlan(
          buildOperationContext({
            schema,
            operationDocument,
          }),
        );

        expect(queryPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "reviews") {
                {
                  topReviews {
                    author {
                      __typename
                      id
                    }
                  }
                }
              },
              Flatten(path: "topReviews.@.author") {
                Fetch(service: "accounts") {
                  {
                    ... on User {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on User {
                      name
                    }
                  }
                },
              },
            },
          }
        `);
      });
    });
  });
  describe(`when requesting a relationship field with extension subfields from a different service`, () => {
    it(`should first fetch the object using a key from the base service and then pass through the requirements`, () => {
      const operationString = `#graphql
        query {
          topReviews {
            author {
              birthDate
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "reviews") {
              {
                topReviews {
                  author {
                    __typename
                    id
                  }
                }
              }
            },
            Flatten(path: "topReviews.@.author") {
              Fetch(service: "accounts") {
                {
                  ... on User {
                    __typename
                    id
                  }
                } =>
                {
                  ... on User {
                    birthDate
                  }
                }
              },
            },
          },
        }
      `);
    });
  });

  describe(`for abstract types`, () => {
    // GraphQLError: Cannot query field "isbn" on type "Book"
    // Probably an issue with extending / interfaces in composition. None of the fields from the base Book type
    // are showing up in the resulting schema.
    it(`should add __typename when fetching objects of an interface type from a service`, () => {
      const operationString = `#graphql
        query {
          topProducts {
            price
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "product") {
            {
              topProducts {
                __typename
                ... on Book {
                  price
                }
                ... on Furniture {
                  price
                }
              }
            }
          },
        }
      `);
    });

    it(`should not get confused by a fragment spread multiple times`, () => {
      const operationString = `#graphql
        fragment Price on Product {
          price
        }

        query {
          topProducts {
            __typename
            ... on Book {
              ...Price
            }
            ... on Furniture {
              ...Price
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
                QueryPlan {
                  Fetch(service: "product") {
                    {
                      topProducts {
                        __typename
                        ... on Book {
                          price
                        }
                        ... on Furniture {
                          price
                        }
                      }
                    }
                  },
                }
            `);
    });

    it(`should not get confused by an inline fragment multiple times`, () => {
      const operationString = `#graphql
        query {
          topProducts {
            __typename
            ... on Book {
              ...on Product {
                price
              }
            }
            ... on Furniture {
              ... on Product {
                price
              }
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
                QueryPlan {
                  Fetch(service: "product") {
                    {
                      topProducts {
                        __typename
                        ... on Book {
                          price
                        }
                        ... on Furniture {
                          price
                        }
                      }
                    }
                  },
                }
            `);
    });

    it(`should preserve type conditions for value types`, () => {
      const operationString = `#graphql
        query {
          body {
            ... on Image {
              ... on NamedObject {
                name
              }
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
                QueryPlan {
                  Fetch(service: "documents") {
                    {
                      body {
                        __typename
                        ... on Image {
                          ... on NamedObject {
                            name
                          }
                        }
                      }
                    }
                  },
                }
            `);
    });

    it(`should preserve directives on inline fragments even if the fragment is otherwise useless`, () => {
      const operationString = `#graphql
        query myQuery($b: Boolean) {
          body {
            ... on Image {
              ... on NamedObject @include(if: $b) {
                name
              }
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
                QueryPlan {
                  Fetch(service: "documents") {
                    {
                      body {
                        __typename
                        ... on Image {
                          ... on NamedObject @include(if: $b) {
                            name
                          }
                        }
                      }
                    }
                  },
                }
            `);
    });
  });

  // GraphQLError: Cannot query field "isbn" on type "Book"
  // Probably an issue with extending / interfaces in composition. None of the fields from the base Book type
  // are showing up in the resulting schema.
  it(`should break up when traversing an extension field on an interface type from a service`, () => {
    const operationString = `#graphql
      query {
        topProducts {
          price
          reviews {
            body
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "product") {
            {
              topProducts {
                __typename
                ... on Book {
                  price
                  __typename
                  isbn
                }
                ... on Furniture {
                  price
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Book {
                  __typename
                  isbn
                }
                ... on Furniture {
                  __typename
                  upc
                }
              } =>
              {
                ... on Book {
                  reviews {
                    body
                  }
                }
                ... on Furniture {
                  reviews {
                    body
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  it(`interface fragments should expand into possible types only`, () => {
    const operationString = `#graphql
      query {
        books {
          ... on Product {
            name
            ... on Furniture {
              upc
            }
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "books") {
            {
              books {
                __typename
                isbn
                title
                year
              }
            }
          },
          Flatten(path: "books.@") {
            Fetch(service: "product") {
              {
                ... on Book {
                  __typename
                  isbn
                  title
                  year
                }
              } =>
              {
                ... on Book {
                  name
                }
              }
            },
          },
        },
      }
    `);
  });

  it(`interface inside interface should expand into possible types only`, () => {
    const operationString = `#graphql
      query {
        product(upc: "") {
          details {
            country
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "product") {
          {
            product(upc: "") {
              __typename
              ... on Book {
                details {
                  country
                }
              }
              ... on Furniture {
                details {
                  country
                }
              }
            }
          }
        },
      }
    `);
  });

  describe(`experimental compression to downstream services`, () => {
    it(`should generate fragments internally to downstream requests`, () => {
      const operationString = `#graphql
        query {
          topReviews {
            body
            author
            product {
              name
              price
              details {
                country
              }
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
        { autoFragmentization: true },
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "reviews") {
              {
                topReviews {
                  ...__QueryPlanFragment_1__
                }
              }
              
              fragment __QueryPlanFragment_1__ on Review {
                body
                author
                product {
                  ...__QueryPlanFragment_0__
                }
              }
              
              fragment __QueryPlanFragment_0__ on Product {
                __typename
                ... on Book {
                  __typename
                  isbn
                }
                ... on Furniture {
                  __typename
                  upc
                }
              }
            },
            Parallel {
              Sequence {
                Flatten(path: "topReviews.@.product") {
                  Fetch(service: "books") {
                    {
                      ... on Book {
                        __typename
                        isbn
                      }
                    } =>
                    {
                      ... on Book {
                        __typename
                        isbn
                        title
                        year
                      }
                    }
                  },
                },
                Flatten(path: "topReviews.@.product") {
                  Fetch(service: "product") {
                    {
                      ... on Book {
                        __typename
                        isbn
                        title
                        year
                      }
                    } =>
                    {
                      ... on Book {
                        name
                      }
                    }
                  },
                },
              },
              Flatten(path: "topReviews.@.product") {
                Fetch(service: "product") {
                  {
                    ... on Furniture {
                      __typename
                      upc
                    }
                    ... on Book {
                      __typename
                      isbn
                    }
                  } =>
                  {
                    ... on Furniture {
                      name
                      price
                      details {
                        country
                      }
                    }
                    ... on Book {
                      price
                      details {
                        country
                      }
                    }
                  }
                },
              },
            },
          },
        }
      `);
    });

    it(`shouldn't generate fragments for selection sets of length 2 or less`, () => {
      const operationString = `#graphql
        query {
          topReviews {
            body
            author
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
        { autoFragmentization: true },
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "reviews") {
            {
              topReviews {
                body
                author
              }
            }
          },
        }
      `);
    });

    it(`should generate fragments for selection sets of length 3 or greater`, () => {
      const operationString = `#graphql
        query {
          topReviews {
            id
            body
            author
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
        { autoFragmentization: true },
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "reviews") {
            {
              topReviews {
                ...__QueryPlanFragment_0__
              }
            }
            
            fragment __QueryPlanFragment_0__ on Review {
              id
              body
              author
            }
          },
        }
      `);
    });

    it(`should generate fragments correctly when aliases are used`, () => {
      const operationString = `#graphql
        query {
          reviews: topReviews {
            content: body
            author
            product {
              name
              cost: price
              details {
                origin: country
              }
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
        { autoFragmentization: true },
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "reviews") {
              {
                reviews: topReviews {
                  ...__QueryPlanFragment_1__
                }
              }
              
              fragment __QueryPlanFragment_1__ on Review {
                content: body
                author
                product {
                  ...__QueryPlanFragment_0__
                }
              }
              
              fragment __QueryPlanFragment_0__ on Product {
                __typename
                ... on Book {
                  __typename
                  isbn
                }
                ... on Furniture {
                  __typename
                  upc
                }
              }
            },
            Parallel {
              Sequence {
                Flatten(path: "reviews.@.product") {
                  Fetch(service: "books") {
                    {
                      ... on Book {
                        __typename
                        isbn
                      }
                    } =>
                    {
                      ... on Book {
                        __typename
                        isbn
                        title
                        year
                      }
                    }
                  },
                },
                Flatten(path: "reviews.@.product") {
                  Fetch(service: "product") {
                    {
                      ... on Book {
                        __typename
                        isbn
                        title
                        year
                      }
                    } =>
                    {
                      ... on Book {
                        name
                      }
                    }
                  },
                },
              },
              Flatten(path: "reviews.@.product") {
                Fetch(service: "product") {
                  {
                    ... on Furniture {
                      __typename
                      upc
                    }
                    ... on Book {
                      __typename
                      isbn
                    }
                  } =>
                  {
                    ... on Furniture {
                      name
                      cost: price
                      details {
                        origin: country
                      }
                    }
                    ... on Book {
                      cost: price
                      details {
                        origin: country
                      }
                    }
                  }
                },
              },
            },
          },
        }
      `);
    });
  });

  it(`should properly expand nested unions with inline fragments`, () => {
    const operationString = `#graphql
      query {
        body {
          ... on Image {
            ... on Body {
              ... on Image {
                attributes {
                  url
                }
              }
              ... on Text {
                attributes {
                  bold
                  text
                }
              }
            }
          }
          ... on Text {
            attributes {
              bold
            }
          }
        }
      }
    `;

    const operationDocument = gql(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      }),
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "documents") {
          {
            body {
              __typename
              ... on Image {
                attributes {
                  url
                }
              }
              ... on Text {
                attributes {
                  bold
                }
              }
            }
          }
        },
      }
    `);
  });

  describe('deduplicates fields / selections regardless of adjacency and type condition nesting', () => {
    it('for inline fragments', () => {
      const operationString = `#graphql
        query {
          body {
            ... on Image {
              ... on Text {
                attributes {
                  bold
                }
              }
            }
            ... on Body {
              ... on Text {
                attributes {
                  bold
                  text
                }
              }
            }
            ... on Text {
              attributes {
                bold
                text
              }
            }
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "documents") {
            {
              body {
                __typename
                ... on Text {
                  attributes {
                    bold
                    text
                  }
                }
              }
            }
          },
        }
      `);
    });

    it('for named fragment spreads', () => {
      const operationString = `#graphql
        fragment TextFragment on Text {
          attributes {
            bold
            text
          }
        }

        query {
          body {
            ... on Image {
              ...TextFragment
            }
            ... on Body {
              ...TextFragment
            }
            ...TextFragment
          }
        }
      `;

      const operationDocument = gql(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "documents") {
            {
              body {
                __typename
                ... on Text {
                  attributes {
                    bold
                    text
                  }
                }
              }
            }
          },
        }
      `);
    });
  });

  describe('top-level @skip/@include behavior', () => {
    beforeEach(() => {
      ({ schema, queryPlanner } =
        getFederatedTestingSchema(fixturesWithUpdate));
    });

    function getQueryPlan(operation: string) {
      const operationDocument = gql(operation);

      return queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        }),
      );
    }

    it('simple skip', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: true) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ skip: true, include: null }]);
    });

    it('simple include', () => {
      const operation = `#graphql
        query {
          topReviews @include(if: false) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ include: false, skip: null }]);
    });

    it('simple include with variables', () => {
      const operation = `#graphql
        query {
          topReviews @include(if: $shouldInclude) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ include: 'shouldInclude', skip: null }]);
    });

    it('simple skip with variables', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: $shouldSkip) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ skip: 'shouldSkip', include: null }]);
    });

    it('not all top-levels have conditionals', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: $shouldSkip) {
            body
          }
          review(id: "1") {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toBeUndefined();
    });

    it('all top-levels have conditionals', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: $shouldSkip) {
            body
          }
          review(id: "1") @skip(if: true) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([
        { skip: 'shouldSkip', include: null },
        { skip: true, include: null },
      ]);
    });

    it('all top-levels use literals (include case)', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: false) {
            body
          }
          review(id: "1") @include(if: true) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toBeUndefined();
    });

    it('all top-levels use literals (skip case)', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: true) {
            body
          }
          review(id: "1") @include(if: false) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([
        { skip: true, include: null },
        { include: false, skip: null },
      ]);
    });

    it('skip: false, include: false', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: false) @include(if: false) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ skip: false, include: false }]);
    });

    it('skip: false, include: true', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: false) @include(if: true) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toBeUndefined();
    });

    it('skip: true, include: false', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: true) @include(if: false) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ skip: true, include: false }]);
    });

    it('skip: true, include: true', () => {
      const operation = `#graphql
        query {
          topReviews @skip(if: true) @include(if: true) {
            body
          }
        }
      `;

      expect(
        (getQueryPlan(operation).node as FetchNode).inclusionConditions,
      ).toEqual([{ skip: true, include: true }]);
    });

    describe.skip('known limitations', () => {
      it('conditionals on top-level fragment spreads are captured', () => {
        const operation = `#graphql
          query {
            ...TopReviews @skip(if: $shouldSkip)
          }

          fragment TopReviews on Query {
            topReviews {
              body
            }
          }
        `;

        expect(
          (getQueryPlan(operation).node as FetchNode).inclusionConditions,
        ).toEqual([{ skip: 'shouldSkip', include: null }]);
      });

      it('conditionals on top-level inline fragments are captured', () => {
        const operation = `#graphql
          query {
            ... on Query @skip(if: $shouldSkip) {
              topReviews {
                body
              }
            }
          }
        `;

        expect(
          (getQueryPlan(operation).node as FetchNode).inclusionConditions,
        ).toEqual([{ skip: 'shouldSkip', include: null }]);
      });

      it.todo(
        'deeply-nested conditionals within fragment spreads are captured',
      );
      it.todo(
        'deeply-nested conditionals within inline fragments are captured',
      );
    });
  });
});
