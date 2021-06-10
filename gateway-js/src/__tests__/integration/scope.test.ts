import gql from 'graphql-tag';
import { execute } from '../execution-utils';

import {
  astSerializer,
  queryPlanSerializer,
} from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

describe('scope', () => {
  it("doesn't wrap inline fragments with the supertype when @include is used", async () => {
    const query = `#graphql
    query GetProducts {
      topProducts {
        name
        ... on Shoe @include(if: true) {
          rating
        }
        ... on Car {
          rating
        }
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

          type Shoe implements Product @key(fields: "upc") {
            upc: String
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String
            name: String
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Shoe @key(fields: "upc") {
            upc: String @external
            rating: Int
          }

          extend type Car @key(fields: "upc") {
            upc: String @external
            rating: Int
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
                  name
                  __typename
                  upc
                }
                ... on Shoe {
                  name
                }
                ... on Shoe @include(if: true) {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Shoe {
                  __typename
                  upc
                }
                ... on Car {
                  __typename
                  upc
                }
              } =>
              {
                ... on Shoe @include(if: true) {
                  rating
                }
                ... on Car {
                  rating
                }
              }
            },
          },
        },
      }
    `);
  });

  it("doesn't merge conditions on the same type when one has a @include", async () => {
    const query = `#graphql
    query GetProducts {
      topProducts {
        name
        ... on Shoe {
          reviewsCount
        }
        ... on Shoe @include(if: true) {
          rating
        }
        ... on Car {
          rating
        }
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

          type Shoe implements Product @key(fields: "upc") {
            upc: String
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String
            name: String
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Shoe @key(fields: "upc") {
            upc: String @external
            rating: Int
            reviewsCount: Int
          }

          extend type Car @key(fields: "upc") {
            upc: String @external
            rating: Int
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
                  name
                  __typename
                  upc
                }
                ... on Shoe {
                  name
                  __typename
                  upc
                }
                ... on Shoe @include(if: true) {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Shoe {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
                ... on Car {
                  __typename
                  upc
                }
              } =>
              {
                ... on Shoe {
                  reviewsCount
                }
                ... on Shoe @include(if: true) {
                  rating
                }
                ... on Car {
                  rating
                }
              }
            },
          },
        },
      }
    `);
  });

  it("doesn't merge conditions on the same type when one has a @include even for the same selected field", async () => {
    const query = `#graphql
    query GetProducts {
      topProducts {
        name
        ... on Shoe {
          rating
        }
        ... on Shoe @include(if: true) {
          rating
        }
        ... on Car {
          rating
        }
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

          type Shoe implements Product @key(fields: "upc") {
            upc: String
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String
            name: String
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Shoe @key(fields: "upc") {
            upc: String @external
            rating: Int
            reviewsCount: Int
          }

          extend type Car @key(fields: "upc") {
            upc: String @external
            rating: Int
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
                  name
                  __typename
                  upc
                }
                ... on Shoe {
                  name
                  __typename
                  upc
                }
                ... on Shoe @include(if: true) {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Shoe {
                  __typename
                  upc
                }
                ... on Shoe {
                  __typename
                  upc
                }
                ... on Car {
                  __typename
                  upc
                }
              } =>
              {
                ... on Shoe {
                  rating
                }
                ... on Shoe @include(if: true) {
                  rating
                }
                ... on Car {
                  rating
                }
              }
            },
          },
        },
      }
    `);
  });

  it("merges nested conditions when possible", async () => {
    const query = `#graphql
    query GetProducts {
      topProducts {
        name
        ... on Shoe @include(if: true) {
          ... on Shoe {
            rating
          }
        }
        ... on Car {
          rating
        }
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

          type Shoe implements Product @key(fields: "upc") {
            upc: String
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String
            name: String
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Shoe @key(fields: "upc") {
            upc: String @external
            rating: Int
          }

          extend type Car @key(fields: "upc") {
            upc: String @external
            rating: Int
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
                  name
                  __typename
                  upc
                }
                ... on Shoe {
                  name
                }
                ... on Shoe @include(if: true) {
                  __typename
                  upc
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Shoe {
                  __typename
                  upc
                }
                ... on Car {
                  __typename
                  upc
                }
              } =>
              {
                ... on Shoe @include(if: true) {
                  rating
                }
                ... on Car {
                  rating
                }
              }
            },
          },
        },
      }
    `);
  });

  it("doesn't merge nested conditions when both have directives", async () => {
    const query = `#graphql
    query GetProducts {
      topProducts {
        name
        ... on Shoe @include(if: true) {
          ... on Shoe @skip(if: true) {
            rating
          }
        }
        ... on Car {
          rating
        }
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

          type Shoe implements Product @key(fields: "upc") {
            upc: String
            name: String
          }

          type Car implements Product @key(fields: "upc") {
            upc: String
            name: String
          }
        `,
      },
      {
        name: 'reviews',
        typeDefs: gql`
          extend type Shoe @key(fields: "upc") {
            upc: String @external
            rating: Int
          }

          extend type Car @key(fields: "upc") {
            upc: String @external
            rating: Int
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
                  name
                  __typename
                  upc
                }
                ... on Shoe {
                  name
                }
                ... on Shoe @include(if: true) {
                  ... on Shoe @skip(if: true) {
                    __typename
                    upc
                  }
                }
              }
            }
          },
          Flatten(path: "topProducts.@") {
            Fetch(service: "reviews") {
              {
                ... on Shoe {
                  ... on Shoe {
                    __typename
                    upc
                  }
                }
                ... on Car {
                  __typename
                  upc
                }
              } =>
              {
                ... on Shoe @include(if: true) {
                  ... on Shoe @skip(if: true) {
                    rating
                  }
                }
                ... on Car {
                  rating
                }
              }
            },
          },
        },
      }
    `);
  });
});
