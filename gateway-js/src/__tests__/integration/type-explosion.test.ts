import gql from 'graphql-tag';
import { execute } from '../execution-utils';

import { astSerializer, queryPlanSerializer } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('an interface implemented by value types', () => {
  it("doesn't explode types when a field can be resolved from the parent group for all possible types", async () => {
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
});

describe('an interface implemented by entity types', () => {
  it("doesn't explode types when a field can be resolved from the parent group for all possible types", async () => {
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
            upc: String!
            name: String
          }

          type Shoe implements Product @key(fields: "upc") {
            upc: String!
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String!
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

  it("doesn't explode types when fetching a field defined in another subgraph for all possible types", async () => {
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
            upc: String!
            name: String
          }

          extend type Shoe implements Product @key(fields: "upc") {
            upc: String! @external
            name: String @external
          }

          extend type Car implements Product @key(fields: "upc") {
            upc: String! @external
            name: String @external
          }
        `,
      },
      {
        name: 'catalog',
        typeDefs: gql`
          interface Product {
            upc: String!
            name: String
          }

          type Shoe implements Product @key(fields: "upc") {
            upc: String!
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String!
            name: String
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
                ... on Car {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "catalog") {
              {
                ... on Car {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
              } =>
              {
                ... on Product {
                  name
                }
              }
            },
          },
        },
      }
    `);
  });

  it("doesn't explode types when fetching an extension field defined in another subgraph for all possible types", async () => {
    const query = `#graphql
    query GetProducts {
      topProducts {
        name
        inStock
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
            upc: String!
            name: String
          }

          type Shoe implements Product @key(fields: "upc") {
            upc: String!
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String!
            name: String
          }
        `,
      },
      {
        name: 'inventory',
        typeDefs: gql`
          extend interface Product {
            upc: String! @external
            inStock: Boolean
          }

          extend type Shoe @key(fields: "upc") {
            upc: String! @external
            inStock: Boolean
          }

          extend type Car @key(fields: "upc") {
            upc: String! @external
            inStock: Boolean
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
                name
                ... on Car {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "inventory") {
              {
                ... on Car {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
              } =>
              {
                ... on Product {
                  inStock
                }
              }
            },
          },
        },
      }
    `);
  });

  it("explodes types when fetching a field defined in another subgraph for all possible types, when the subgraph doesn't know about the interface", async () => {
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
            upc: String!
            name: String
          }

          extend type Shoe implements Product @key(fields: "upc") {
            upc: String! @external
            name: String @external
          }

          extend type Car implements Product @key(fields: "upc") {
            upc: String! @external
            name: String @external
          }
        `,
      },
      {
        name: 'catalog',
        typeDefs: gql`
          type Shoe @key(fields: "upc") {
            upc: String!
            name: String
          }

          type Car @key(fields: "upc") {
            upc: String!
            name: String
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
                ... on Car {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "catalog") {
              {
                ... on Car {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
              } =>
              {
                ... on Car {
                  name
                }
                ... on Shoe {
                  name
                }
              }
            },
          },
        },
      }
    `);
  });

  it("explodes types when a field can't be fetched from the parent group for all possible types", async () => {
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
            upc: String!
            name: String
          }

          type Furniture implements Product @key(fields: "upc") {
            upc: String!
            name: String
          }

          type Shoe implements Product @key(fields: "upc") {
            upc: String!
            name: String
          }

          extend type Book implements Product @key(fields: "upc") {
            upc: String! @external
            name: String @external
          }
        `,
      },
      {
        name: 'books',
        typeDefs: gql`
          type Book @key(fields: "upc") {
            upc: String!
            name: String
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
                  __typename
                  upc
                }
                ... on Furniture {
                  name
                }
                ... on Shoe {
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
                  upc
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
});
