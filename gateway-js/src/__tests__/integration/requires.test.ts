import gql from 'graphql-tag';
import { execute } from '../execution-utils';
import { astSerializer, queryPlanSerializer } from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);
it('supports passing additional fields defined by a requires', async () => {
  const query = `#graphql
    query GetReviwedBookNames {
      me {
        reviews {
          product {
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
        { product: {} },
        { product: {} },
        {
          product: {
            name: 'Design Patterns (1995)',
          },
        },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('books');
});

it('supports transitive requires', async () => {
  const serviceA = {
    name: 'a',
    typeDefs: gql`
      type Query {
        getA: A
      }
      type A @key(fields: "id") {
        id: ID!
      }
    `,
    resolvers: {
      Query: {
        getA() {
          return {
            id: '1',
          };
        },
      },
    },
  };
  const serviceB = {
    name: 'b',
    typeDefs: gql`
      extend type A @key(fields: "id") {
        id: ID! @external
        extendedbyB: String
      }
    `,
    resolvers: {
      A: {
        extendedbyB(a: any) {
          return `extendedbyB calculated using a.id = ${a.id}`;
        },
      },
    },
  };
  const serviceC = {
    name: 'c',
    typeDefs: gql`
      extend type A @key(fields: "id") {
        id: ID! @external
        extendedbyB: String @external
        extendedbyC: String @requires(fields: "extendedbyB")
      }
    `,
    resolvers: {
      A: {
        extendedbyC(a: any) {
          return `extendedbyC calculated using a.extendedbyB = {${a.extendedbyB}}`;
        },
      },
    },
  };
  const serviceD = {
    name: 'd',
    typeDefs: gql`
      extend type A @key(fields: "id") {
        id: ID! @external
        extendedbyC: String @external
        extendedbyD: String @requires(fields: "extendedbyC")
      }
    `,
    resolvers: {
      A: {
        extendedbyD(a: any) {
          return `extendedbyD calculated using a.extendedbyC = {${a.extendedbyC}}`;
        },
      },
    },
  };
  const serviceE = {
    name: 'e',
    typeDefs: gql`
      extend type A @key(fields: "id") {
        id: ID! @external
        extendedbyD: String @external
        extendedbyE: String @requires(fields: "extendedbyD")
      }
    `,
    resolvers: {
      A: {
        extendedbyE(a: any) {
          return `extendedbyE calculated using a.extendedbyD = {${a.extendedbyD}}`;
        },
      },
    },
  };
  const serviceF = {
    name: 'f',
    typeDefs: gql`
      extend type A @key(fields: "id") {
        id: ID! @external
        extendedbyE: String @external
        extendedbyD: String @external
        extendedbyF: String @requires(fields: "extendedbyE extendedbyD")
      }
    `,
    resolvers: {
      A: {
        extendedbyF(a: any) {
          return `extendedbyF calculated using a.extendedbyE = {${a.extendedbyE}} AND {${a.extendedbyD}}`;
        },
      },
    },
  };

  const query = `#graphql
    query TestQuery {
      getA {
        id
        extendedbyF
      }
    }
  `;

  const { data, queryPlan } = await execute({
        query,
      },
      [
          serviceA,
          serviceB,
          serviceC,
          serviceD,
          serviceE,
          serviceF
      ]
  );

  expect(data).toEqual({
    getA: {
      id: "1",
      extendedbyF: "extendedbyF calculated using " +
          "a.extendedbyE = {extendedbyE calculated using " +
          "a.extendedbyD = {extendedbyD calculated using " +
          "a.extendedbyC = {extendedbyC calculated using " +
          "a.extendedbyB = {extendedbyB calculated using " +
          "a.id = 1}}}} AND {" +
          "extendedbyD calculated using " +
          "a.extendedbyC = {extendedbyC calculated using " +
          "a.extendedbyB = {extendedbyB calculated using " +
          "a.id = 1}}}"
    },
  });

  expect(queryPlan).toCallService('a');
  expect(queryPlan).toCallService('b');
  expect(queryPlan).toCallService('c');
  expect(queryPlan).toCallService('d');
  expect(queryPlan).toCallService('e');
  expect(queryPlan).toCallService('f');
});

const serviceA = {
  name: 'a',
  typeDefs: gql`
    type Query {
      user: User
    }

    type User @key(fields: "id") {
      id: ID!
      preferences: Preferences
    }

    type Preferences {
      favorites: Things
    }

    type Things {
      color: String
      animal: String
    }
  `,
  resolvers: {
    Query: {
      user() {
        return {
          id: '1',
          preferences: {
            favorites: { color: 'limegreen', animal: 'platypus' },
          },
        };
      },
    },
  },
};

const serviceB = {
  name: 'b',
  typeDefs: gql`
    extend type User @key(fields: "id") {
      id: ID! @external
      preferences: Preferences @external
      favoriteColor: String
        @requires(fields: "preferences { favorites { color } }")
      favoriteAnimal: String
        @requires(fields: "preferences { favorites { animal } }")
    }

    extend type Preferences {
      favorites: Things @external
    }

    extend type Things {
      color: String @external
      animal: String @external
    }
  `,
  resolvers: {
    User: {
      favoriteColor(user: any) {
        return user.preferences.favorites.color;
      },
      favoriteAnimal(user: any) {
        return user.preferences.favorites.animal;
      },
    },
  },
};

it('collapses nested requires', async () => {
  const query = `#graphql
    query UserFavorites {
      user {
        favoriteColor
        favoriteAnimal
      }
    }
  `;

  const { data, errors, queryPlan } = await execute(
    {
      query,
    },
    [serviceA, serviceB],
  );

  expect(errors).toEqual(undefined);

  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "a") {
          {
            user {
              __typename
              id
              preferences {
                favorites {
                  color
                  animal
                }
              }
            }
          }
        },
        Flatten(path: "user") {
          Fetch(service: "b") {
            {
              ... on User {
                __typename
                id
                preferences {
                  favorites {
                    color
                    animal
                  }
                }
              }
            } =>
            {
              ... on User {
                favoriteColor
                favoriteAnimal
              }
            }
          },
        },
      },
    }
  `);

  expect(data).toEqual({
    user: {
      favoriteAnimal: 'platypus',
      favoriteColor: 'limegreen',
    },
  });

  expect(queryPlan).toCallService('a');
  expect(queryPlan).toCallService('b');
});

it('collapses nested requires with user-defined fragments', async () => {
  const query = `#graphql
    query UserFavorites {
      user {
        favoriteAnimal
        ...favoriteColor
      }
    }

    fragment favoriteColor on User {
      preferences {
        favorites {
          color
        }
      }
    }
  `;

  const { data, errors, queryPlan } = await execute(
    {
      query,
    },
    [serviceA, serviceB],
  );

  expect(errors).toEqual(undefined);

  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "a") {
          {
            user {
              __typename
              id
              preferences {
                favorites {
                  animal
                  color
                }
              }
            }
          }
        },
        Flatten(path: "user") {
          Fetch(service: "b") {
            {
              ... on User {
                __typename
                id
                preferences {
                  favorites {
                    animal
                  }
                }
              }
            } =>
            {
              ... on User {
                favoriteAnimal
              }
            }
          },
        },
      },
    }
  `);

  expect(data).toEqual({
    user: {
      favoriteAnimal: 'platypus',
      preferences: {
        favorites: {
          color: 'limegreen',
        },
      },
    },
  });

  expect(queryPlan).toCallService('a');
  expect(queryPlan).toCallService('b');
});

it('passes null values correctly', async () => {
  const serviceA = {
    name: 'a',
    typeDefs: gql`
      type Query {
        user: User
      }

      type User @key(fields: "id") {
        id: ID!
        favorite: Color
        dislikes: [Color]
      }

      type Color {
        name: String!
      }
    `,
    resolvers: {
      Query: {
        user() {
          return {
            id: '1',
            favorite: null,
            dislikes: [null],
          };
        },
      },
    },
  };

  const serviceB = {
    name: 'b',
    typeDefs: gql`
      extend type User @key(fields: "id") {
        id: ID! @external
        favorite: Color @external
        dislikes: [Color] @external
        favoriteColor: String @requires(fields: "favorite { name }")
        dislikedColors: String @requires(fields: "dislikes { name }")
      }

      extend type Color {
        name: String! @external
      }
    `,
    resolvers: {
      User: {
        favoriteColor(user: any) {
          if (user.favorite !== null) {
            throw Error(
              'Favorite color should be null. Instead, got: ' +
                JSON.stringify(user.favorite),
            );
          }
          return 'unknown';
        },
        dislikedColors(user: any) {
          const color = user.dislikes[0];
          if (color !== null) {
            throw Error(
              'Disliked colors should be null. Instead, got: ' +
                JSON.stringify(user.dislikes),
            );
          }
          return 'unknown';
        },
      },
    },
  };

  const query = `#graphql
    query UserFavorites {
      user {
        favoriteColor
        dislikedColors
      }
    }
  `;

  const { data, errors } = await execute({ query }, [serviceA, serviceB]);

  expect(errors).toEqual(undefined);
  expect(data).toEqual({
    user: {
      favoriteColor: 'unknown',
      dislikedColors: 'unknown',
    },
  });
});
