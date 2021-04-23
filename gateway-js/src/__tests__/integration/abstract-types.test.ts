import gql from 'graphql-tag';
import { execute } from '../execution-utils';

import { astSerializer, queryPlanSerializer } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

it('handles an abstract type from the base service', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        upc
        name
        price
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({
    product: {
      upc,
      name: 'Table',
      price: '899',
    },
  });

  expect(queryPlan).toCallService('product');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                upc
                __typename
                isbn
                price
              }
              ... on Furniture {
                upc
                name
                price
              }
            }
          }
        },
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
    }
  `);
});

it('can request fields on extended interfaces', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        inStock
      }
    }
  `;

  const upc = '1';

  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({ product: { inStock: true } });
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('inventory');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "inventory") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
              }
            } =>
            {
              ... on Book {
                inStock
              }
              ... on Furniture {
                inStock
              }
            }
          },
        },
      },
    }
  `);
});

it('can request fields on extended types that implement an interface', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        inStock
        ... on Furniture {
          isHeavy
        }
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({ product: { inStock: true, isHeavy: false } });
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('inventory');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "inventory") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
              }
            } =>
            {
              ... on Book {
                inStock
              }
              ... on Furniture {
                inStock
                isHeavy
              }
            }
          },
        },
      },
    }
  `);
});

it('prunes unfilled type conditions', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        inStock
        ... on Furniture {
          isHeavy
        }
        ... on Book {
          isCheckedOut
        }
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({ product: { inStock: true, isHeavy: false } });
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('inventory');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
              __typename
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
              }
            }
          }
        },
        Flatten(path: "product") {
          Fetch(service: "inventory") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
              }
            } =>
            {
              ... on Book {
                inStock
                isCheckedOut
              }
              ... on Furniture {
                inStock
                isHeavy
              }
            }
          },
        },
      },
    }
  `);
});

it('fetches interfaces returned from other services', async () => {
  const query = `#graphql
    query GetUserAndProducts {
      me {
        reviews {
          product {
            price
            ... on Book {
              title
            }
          }
        }
      }
    }
  `;

  const { data, queryPlan } = await execute({
    query,
  });

  expect(data).toEqual({
    me: {
      reviews: [
        { product: { price: '899' } },
        { product: { price: '1299' } },
        { product: { price: '49', title: 'Design Patterns' } },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
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
                  product {
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
                }
              }
            }
          },
        },
        Parallel {
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "product") {
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
                  price
                }
                ... on Furniture {
                  price
                }
              }
            },
          },
          Flatten(path: "me.reviews.@.product") {
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
                }
              }
            },
          },
        },
      },
    }
  `);
});

it('fetches composite fields from a foreign type casted to an interface [@provides field]', async () => {
  const query = `#graphql
    query GetUserAndProducts {
      me {
        reviews {
          product {
            price
            ... on Book {
              name
            }
          }
        }
      }
    }
  `;

  const { data, queryPlan } = await execute({
    query,
  });

  expect(data).toEqual({
    me: {
      reviews: [
        { product: { price: '899' } },
        { product: { price: '1299' } },
        { product: { price: '49', name: 'Design Patterns (1995)' } },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
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
                  product {
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
                }
              }
            }
          },
        },
        Parallel {
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "product") {
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
                  price
                }
                ... on Furniture {
                  price
                }
              }
            },
          },
          Sequence {
            Flatten(path: "me.reviews.@.product") {
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
            Flatten(path: "me.reviews.@.product") {
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

it('allows for extending an interface from another service with fields', async () => {
  const query = `#graphql
    query GetProduct($upc: String!) {
      product(upc: $upc) {
        reviews {
          body
        }
      }
    }
  `;

  const upc = '1';
  const { data, queryPlan } = await execute({
    query,
    variables: { upc },
  });

  expect(data).toEqual({
    product: {
      reviews: [{ body: 'Love it!' }, { body: 'Prefer something else.' }],
    },
  });

  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            product(upc: $upc) {
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
          }
        },
        Flatten(path: "product") {
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

describe('unions', () => {
  it('handles unions from the same service', async () => {
    const query = `#graphql
      query GetUserAndProducts {
        me {
          reviews {
            product {
              price
              ... on Furniture {
                brand {
                  ... on Ikea {
                    asile
                  }
                  ... on Amazon {
                    referrer
                  }
                }
              }
            }
          }
        }
      }
    `;

    const { data, queryPlan } = await execute({
      query,
    });

    expect(data).toEqual({
      me: {
        reviews: [
          { product: { price: '899', brand: { asile: 10 } } },
          {
            product: {
              price: '1299',
              brand: { referrer: 'https://canopy.co' },
            },
          },
          { product: { price: '49' } },
        ],
      },
    });

    expect(queryPlan).toCallService('accounts');
    expect(queryPlan).toCallService('reviews');
    expect(queryPlan).toCallService('product');
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
                    product {
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
                  }
                }
              }
            },
          },
          Flatten(path: "me.reviews.@.product") {
            Fetch(service: "product") {
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
                  price
                }
                ... on Furniture {
                  price
                  brand {
                    __typename
                    ... on Ikea {
                      asile
                    }
                    ... on Amazon {
                      referrer
                    }
                  }
                }
              }
            },
          },
        },
      }
    `);
  });

  it("doesn't expand interfaces with inline type conditions if all possibilities are fufilled by one service", async () => {
    const query = `#graphql
      query GetProducts {
        topProducts {
          name
        }
      }
    `;

    const { queryPlan, errors } = await execute({ query }, [
      {
        name: 'products',
        typeDefs: gql`
          extend type Query {
            topProducts: [Product]
          }

          interface Product {
            name: String
          }

          type Shoe implements Product {
            name: String
          }

          type Car implements Product {
            name: String
          }
        `,
      },
    ]);

    expect(errors).toBeUndefined();
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Fetch(service: "products") {
          {
            topProducts {
              __typename
              name
            }
          }
        },
      }
    `);
  });

  // FIXME: turn back on when extending unions is supported in composition
  it.todo('fetches unions across services');
  // async () => {
  //   const query = gql`
  //     query GetUserAndProducts {
  //       me {
  //         account {
  //           ... on LibraryAccount {
  //             library {
  //               name
  //             }
  //           }
  //           ... on SMSAccount {
  //             number
  //           }
  //         }
  //       }
  //     }
  //   `;

  //   const { data, queryPlan } = await execute(
  //     {
  //       query,
  //     },
  //   );

  //   expect(data).toEqual({
  //     me: {
  //       account: {
  //         library: {
  //           name: 'NYC Public Library',
  //         },
  //       },
  //     },
  //   });

  //   expect(queryPlan).toCallService('accounts');
  //   expect(queryPlan).toCallService('books');
  // });
});

describe("doesn't result in duplicate fetches", () => {
  it("when exploding types", async () => {
    const query = `#graphql
      query {
        topProducts {
          name
          price
          reviews {
            author {
              name
              username
            }
            body
            id
          }
        }
      }
    `;

    const { queryPlan, errors } = await execute({ query }, [
      {
        name: 'accounts',
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            name: String
            username: String
          }
        `,
      },
      {
        name: 'products',
        typeDefs: gql`
          type Book implements Product @key(fields: "isbn") {
            isbn: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type TV implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type Computer implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type Furniture implements Product @key(fields: "sku") {
            sku: String!
            name: String
            price: Int
            weight: Int
          }
          interface Product {
            name: String
            price: Int
          }
          extend type Query {
            topProducts: [Product]
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Book implements Product @key(fields: "isbn") {
            isbn: String! @external
            reviews: [Review]
          }
          extend type TV implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend type Computer implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend type Furniture implements Product @key(fields: "sku") {
            sku: String! @external
            reviews: [Review]
          }
          extend interface Product {
            reviews: [Review]
          }
          type Review @key(fields: "id") {
            id: ID!
            body: String
            author: User @provides(fields: "username")
            product: Product
          }
          extend type User @key(fields: "id") {
            id: ID! @external
            username: String @external
            reviews: [Review]
          }
        `,
      },
    ]);

    expect(errors).toBeUndefined();
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "products") {
            {
              topProducts {
                __typename
                ... on Book {
                  name
                  price
                  __typename
                  isbn
                }
                ... on Computer {
                  name
                  price
                  __typename
                  id
                }
                ... on Furniture {
                  name
                  price
                  __typename
                  sku
                }
                ... on TV {
                  name
                  price
                  __typename
                  id
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
                ... on Computer {
                  __typename
                  id
                }
                ... on Furniture {
                  __typename
                  sku
                }
                ... on TV {
                  __typename
                  id
                }
              } =>
              {
                ... on Book {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
                ... on Computer {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
                ... on Furniture {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
                ... on TV {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
              }
            },
          },
          Flatten(path: "topProducts.@.reviews.@.author") {
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

it("when including the same nested fields under different type conditions", async () => {
    const query = `#graphql
      query {
        topProducts {
          ... on Book {
            name
            price
            reviews {
              author {
                name
                username
              }
              body
              id
            }
          }
          ... on TV {
            name
            price
            reviews {
              author {
                name
                username
              }
              body
              id
            }
          }
        }
      }
    `;

    const { queryPlan, errors } = await execute({ query }, [
      {
        name: 'accounts',
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            name: String
            username: String
          }
        `,
      },
      {
        name: 'products',
        typeDefs: gql`
          type Book implements Product @key(fields: "isbn") {
            isbn: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type TV implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type Computer implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type Furniture implements Product @key(fields: "sku") {
            sku: String!
            name: String
            price: Int
            weight: Int
          }
          interface Product {
            name: String
            price: Int
          }
          extend type Query {
            topProducts: [Product]
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Book implements Product @key(fields: "isbn") {
            isbn: String! @external
            reviews: [Review]
          }
          extend type TV implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend type Computer implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend type Furniture implements Product @key(fields: "sku") {
            sku: String! @external
            reviews: [Review]
          }
          extend interface Product {
            reviews: [Review]
          }
          type Review @key(fields: "id") {
            id: ID!
            body: String
            author: User @provides(fields: "username")
            product: Product
          }
          extend type User @key(fields: "id") {
            id: ID! @external
            username: String @external
            reviews: [Review]
          }
        `,
      },
    ]);

    expect(errors).toBeUndefined();
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "products") {
            {
              topProducts {
                __typename
                ... on Book {
                  name
                  price
                  __typename
                  isbn
                }
                ... on TV {
                  name
                  price
                  __typename
                  id
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
                ... on TV {
                  __typename
                  id
                }
              } =>
              {
                ... on Book {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
                ... on TV {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
              }
            },
          },
          Flatten(path: "topProducts.@.reviews.@.author") {
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

it('when including multiple nested fields to the same service under different type conditions', async () => {
  const query = `#graphql
    query {
      topProducts {
        ... on Book {
          name
          price
          reviews {
            author {
              name
              username
            }
            editor {
              name
              username
            }
            body
            id
          }
        }
        ... on TV {
          name
          price
          reviews {
            author {
              name
              username
            }
            editor {
              name
              username
            }
            body
            id
          }
        }
      }
    }
  `;

    const { queryPlan, errors } = await execute({ query }, [
      {
        name: 'accounts',
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            name: String
            username: String
          }
        `,
      },
      {
        name: 'products',
        typeDefs: gql`
          type Book implements Product @key(fields: "isbn") {
            isbn: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type TV implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type Computer implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type Furniture implements Product @key(fields: "sku") {
            sku: String!
            name: String
            price: Int
            weight: Int
          }
          interface Product {
            name: String
            price: Int
          }
          extend type Query {
            topProducts: [Product]
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Book implements Product @key(fields: "isbn") {
            isbn: String! @external
            reviews: [Review]
          }
          extend type TV implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend type Computer implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend type Furniture implements Product @key(fields: "sku") {
            sku: String! @external
            reviews: [Review]
          }
          extend interface Product {
            reviews: [Review]
          }
          type Review @key(fields: "id") {
            id: ID!
            body: String
            author: User @provides(fields: "username")
            editor: User @provides(fields: "username")
            product: Product
          }
          extend type User @key(fields: "id") {
            id: ID! @external
            username: String @external
            reviews: [Review]
          }
        `,
      },
    ]);

    expect(errors).toBeUndefined();
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "products") {
            {
              topProducts {
                __typename
                ... on Book {
                  name
                  price
                  __typename
                  isbn
                }
                ... on TV {
                  name
                  price
                  __typename
                  id
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
                ... on TV {
                  __typename
                  id
                }
              } =>
              {
                ... on Book {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    editor {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
                ... on TV {
                  reviews {
                    author {
                      __typename
                      id
                      username
                    }
                    editor {
                      __typename
                      id
                      username
                    }
                    body
                    id
                  }
                }
              }
            },
          },
          Parallel {
            Flatten(path: "topProducts.@.reviews.@.author") {
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
            Flatten(path: "topProducts.@.reviews.@.editor") {
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
        },
      }
    `);
});

it('when exploding types through multiple levels', async () => {
  const query = `#graphql
    query {
      productsByCategory {
        name
        ... on BookCategory {
          items {
            ...ProductReviews
          }
        }
        ... on FurnitureCategory {
          items {
            ...ProductReviews
          }
        }
      }
    }

    fragment ProductReviews on Product {
      reviews {
        body
      }
    }
  `;

  const { queryPlan, errors } = await execute({ query }, [
    {
      name: 'accounts',
      typeDefs: gql`
        type User @key(fields: "id") {
          id: ID!
          name: String
          username: String
        }
      `,
    },
    {
      name: 'products',
      typeDefs: gql`
        type Book implements Product @key(fields: "isbn") {
          isbn: String!
          title: String
          year: Int
          name: String
          price: Int
        }

        type Furniture implements Product @key(fields: "sku") {
          sku: String!
          name: String
          price: Int
          weight: Int
        }

        interface Product {
          name: String
          price: Int
        }

        extend type Query {
          productsByCategory: [ProductCategory]
        }

        interface ProductCategory {
          name: String!
        }

        type BookCategory implements ProductCategory {
          name: String!
          items: [Book]
        }

        type FurnitureCategory implements ProductCategory {
          name: String!
          items: [Furniture]
        }
      `,
    },
    {
      name: 'reviews',
      typeDefs: gql`
        extend type Book implements Product @key(fields: "isbn") {
          isbn: String! @external
          reviews: [Review]
        }
        extend type Furniture implements Product @key(fields: "sku") {
          sku: String! @external
          reviews: [Review]
        }
        extend interface Product {
          reviews: [Review]
        }
        type Review @key(fields: "id") {
          id: ID!
          body: String
          author: User @provides(fields: "username")
          product: Product
        }
        extend type User @key(fields: "id") {
          id: ID! @external
          username: String @external
          reviews: [Review]
        }
      `,
    },
  ]);

  expect(errors).toBeUndefined();
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "products") {
          {
            productsByCategory {
              __typename
              name
              ... on BookCategory {
                items {
                  __typename
                  isbn
                }
              }
              ... on FurnitureCategory {
                items {
                  __typename
                  sku
                }
              }
            }
          }
        },
        Flatten(path: "productsByCategory.@.items.@") {
          Fetch(service: "reviews") {
            {
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                __typename
                sku
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

  // This test case describes a situation that isn't fixed by the deduplication
  // workaround. It is here to remind us to look into this, but it doesn't
  // actually test for the failing behavior so the test still succeeds.
  //
  // In cases where different possible types live in different
  // services, you can't just merge the dependent fetches because they don't
  // have the same parent. What you want here is to have these dependent fetches
  // execute separately, but only take the objects fetched by its parent as input.
  // The problem currently is that these fetches act on on the same path, so
  // depending on the timing either one (or both) will end up fetching the same
  // data just fetched by the other.
  //
  // To make this more concrete, in this case that means we'll fetch all of the
  // reviews and authors twice.
  //
  // Solving this requires us to filter on the types of response objects as
  // opposed to just collecting all objects in the path.
it("when including the same nested fields under different type conditions that are split between services", async () => {
    const query = `#graphql
      query {
        topProducts {
          ... on Book {
            name
            price
            reviews {
              author {
                name
                username
              }
              body
              id
            }
          }
          ... on TV {
            name
            price
            reviews {
              author {
                name
                username
              }
              body
              id
            }
          }
        }
      }
    `;

    const { queryPlan, errors } = await execute({ query }, [
      {
        name: 'accounts',
        typeDefs: gql`
          type User @key(fields: "id") {
            id: ID!
            name: String
            username: String
          }
        `,
      },
      {
        name: 'products',
        typeDefs: gql`
          type Book implements Product @key(fields: "isbn") {
            isbn: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          type TV implements Product @key(fields: "id") {
            id: String!
            title: String
            year: Int
            name: String
            price: Int
          }
          interface Product {
            name: String
            price: Int
          }
          extend type Query {
            topProducts: [Product]
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type TV implements Product @key(fields: "id") {
            id: String! @external
            reviews: [Review]
          }
          extend interface Product {
            reviews: [Review]
          }
          type Review @key(fields: "id") {
            id: ID!
            body: String
            author: User @provides(fields: "username")
            product: Product
          }
          extend type User @key(fields: "id") {
            id: ID! @external
            username: String @external
            reviews: [Review]
          }
        `,
      },
      {
        name: 'books',
        typeDefs: gql`
          extend type Book @key(fields: "isbn") {
            isbn: String! @external
            reviews: [Review]
          }
          extend type Review @key(fields: "id") {
            id: ID! @external
          }
        `,
      },
    ]);

    expect(errors).toBeUndefined();
    expect(queryPlan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "products") {
            {
              topProducts {
                __typename
                ... on Book {
                  name
                  price
                  __typename
                  isbn
                }
                ... on TV {
                  name
                  price
                  __typename
                  id
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
                      reviews {
                        __typename
                        id
                      }
                    }
                  }
                },
              },
              Flatten(path: "topProducts.@.reviews.@") {
                Fetch(service: "reviews") {
                  {
                    ... on Review {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on Review {
                      author {
                        __typename
                        id
                        username
                      }
                      body
                    }
                  }
                },
              },
              Flatten(path: "topProducts.@.reviews.@.author") {
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
            Sequence {
              Flatten(path: "topProducts.@") {
                Fetch(service: "reviews") {
                  {
                    ... on TV {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on TV {
                      reviews {
                        author {
                          __typename
                          id
                          username
                        }
                        body
                        id
                      }
                    }
                  }
                },
              },
              Flatten(path: "topProducts.@.reviews.@.author") {
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
          },
        },
      }
    `);
  });
});
