import { DocumentNode, GraphQLSchema, validate } from 'graphql';
import gql from 'graphql-tag';
import { buildOperationContext } from '../operationContext';
import { astSerializer, queryPlanSerializer } from 'apollo-federation-integration-testsuite';
import { getFederatedTestingSchema } from './execution-utils';
import { QueryPlanner } from '@apollo/query-planner';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);


describe('buildQueryPlan', () => {
  let schema: GraphQLSchema;
  let queryPlanner: QueryPlanner;

  let parseOp = (operation: string): DocumentNode => {
    const doc = gql(operation);

    // Validating the operation, to avoid having them silently becoming invalid
    // due to change to the fixtures.
    const validationErrors = validate(schema, doc);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.map(error => error.message).join("\n\n"));
    }

    return doc;
  };

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

    const operationDocument = parseOp(operationString);

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
          name {
            first
          }
        }
      }
    `;

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "accounts") {
          {
            me {
              name {
                first
              }
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
          name {
            first
          }
        }
        topProducts {
          name
        }
      }
    `;

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Parallel {
          Sequence {
            Fetch(service: "product") {
              {
                topProducts {
                  __typename
                  ... on Furniture {
                    name
                  }
                  ... on Book {
                    __typename
                    isbn
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
                    title
                    year
                    isbn
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
          Fetch(service: "accounts") {
            {
              me {
                name {
                  first
                }
              }
            }
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

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "product") {
            {
              topProducts {
                __typename
                ... on Furniture {
                  name
                }
                ... on Book {
                  __typename
                  isbn
                }
              }
              product(upc: "1") {
                __typename
                ... on Furniture {
                  name
                }
                ... on Book {
                  __typename
                  isbn
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
                      title
                      year
                      isbn
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
                      title
                      year
                      isbn
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

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
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

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
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
            name {
              first
            }
            reviews {
              body
            }
          }
        }
      `;

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Sequence {
            Fetch(service: "accounts") {
              {
                me {
                  __typename
                  id
                  name {
                    first
                  }
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

        const operationDocument = parseOp(operationString);

        const queryPlan = queryPlanner.buildQueryPlan(
          buildOperationContext({
            schema,
            operationDocument,
          })
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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
              name {
                first
              }
            }
          }
        }
      `;

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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
                    name {
                      first
                    }
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

        const operationDocument = parseOp(operationString);

        const queryPlan = queryPlanner.buildQueryPlan(
          buildOperationContext({
            schema,
            operationDocument,
          })
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
                name {
                  first
                }
              }
            }
          }
        `;

        const operationDocument = parseOp(operationString);

        const queryPlan = queryPlanner.buildQueryPlan(
          buildOperationContext({
            schema,
            operationDocument,
          })
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
                      name {
                        first
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
      );

      expect(queryPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "product") {
            {
              topProducts {
                __typename
                price
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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

    it(`eliminate unecessary type conditions`, () => {
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
      );

      expect(queryPlan).toMatchInlineSnapshot(`
                QueryPlan {
                  Fetch(service: "documents") {
                    {
                      body {
                        __typename
                        ... on Image {
                          name
                        }
                      }
                    }
                  },
                }
            `);
    });

    it(`should preserve directives on inline fragments even if the fragment is otherwise useless`, () => {
      const operationString = `#graphql
        query myQuery($b: Boolean!) {
          body {
            ... on Image {
              ... on NamedObject @include(if: $b) {
                name
              }
            }
          }
        }
      `;

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
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

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
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

  it(`interface inside interface should not type explode if possible`, () => {
    const operationString = `#graphql
      query {
        product(upc: "") {
          details {
            country
          }
        }
      }
    `;

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
    );

    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "product") {
          {
            product(upc: "") {
              __typename
              details {
                __typename
                country
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
            id
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

      const operationDocument = parseOp(operationString);

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
                id
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
            id
          }
        }
      `;

      const operationDocument = parseOp(operationString);

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
                id
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
            author {
              username
            }
          }
        }
      `;

      const operationDocument = parseOp(operationString);

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
              author {
                username
              }
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
            id
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

      const operationDocument = parseOp(operationString);

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
                id
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

    const operationDocument = parseOp(operationString);

    const queryPlan = queryPlanner.buildQueryPlan(
      buildOperationContext({
        schema,
        operationDocument,
      })
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

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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
            ... on Body {
              ...TextFragment
            }
            ...TextFragment
          }
        }
      `;

      const operationDocument = parseOp(operationString);

      const queryPlan = queryPlanner.buildQueryPlan(
        buildOperationContext({
          schema,
          operationDocument,
        })
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
});
