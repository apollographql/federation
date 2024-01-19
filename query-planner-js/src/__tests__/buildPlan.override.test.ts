import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';

describe('override with label (progressive)', () => {
  describe('root fields', () => {
    const subgraph1 = {
      name: 's1',
      typeDefs: gql`
        type Query {
          hello: String
        }
      `,
    };

    const subgraph2 = {
      name: 's2',
      typeDefs: gql`
        type Query {
          hello: String @override(from: "s1", label: "test")
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);
    const operation = operationFromDocument(
      api,
      gql`
        {
          hello
        }
      `,
    );

    it('overrides when the label is provided', () => {
      const overriddenPlan = queryPlanner.buildQueryPlan(operation, {
        overrideConditions: new Map([['test', true]]),
      });
      expect(overriddenPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "s2") {
            {
              hello
            }
          },
        }
      `);
    });

    it('does not override when the label is not provided', () => {
      const nonOverriddenPlan = queryPlanner.buildQueryPlan(operation, {
        overrideConditions: new Map([['test', false]]),
      });
      expect(nonOverriddenPlan).toMatchInlineSnapshot(`
        QueryPlan {
          Fetch(service: "s1") {
            {
              hello
            }
          },
        }
      `);
    });
  });

  describe('entity fields', () => {
    const subgraph1 = {
      name: 'S1',
      typeDefs: gql`
        type Query {
          t: T
          t2: T2
        }

        type T @key(fields: "id") {
          id: ID!
          f1: String
        }

        type T2 @key(fields: "id") {
          id: ID!
          f1: String @override(from: "S2", label: "test2")
          t: T
        }
      `,
    };

    const subgraph2 = {
      name: 'S2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          f1: String @override(from: "S1", label: "test")
          f2: String
        }

        type T2 @key(fields: "id") {
          id: ID!
          f1: String
          f2: String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

    describe('simple example', () => {
      const operation = operationFromDocument(
        api,
        gql`
          {
            t {
              f1
              f2
            }
          }
        `,
      );

      it('overrides when the label is provided', () => {
        const overriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', true]]),
        });
        expect(overriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                  }
                }
              },
              Flatten(path: "t") {
                Fetch(service: "S2") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f1
                      f2
                    }
                  }
                },
              },
            },
          }
        `);
      });

      it('does not override when the label is omitted', () => {
        const nonOverriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', false]]),
        });
        expect(nonOverriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                    f1
                  }
                }
              },
              Flatten(path: "t") {
                Fetch(service: "S2") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f2
                    }
                  }
                },
              },
            },
          }
        `);
      });
    });

    describe('nested example', () => {
      const operation = operationFromDocument(
        api,
        gql`
          {
            t2 {
              t {
                f1
              }
            }
          }
        `,
      );

      it('overrides when the label is provided', () => {
        const overriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', true]]),
        });
        expect(overriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t2 {
                    t {
                      __typename
                      id
                    }
                  }
                }
              },
              Flatten(path: "t2.t") {
                Fetch(service: "S2") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f1
                    }
                  }
                },
              },
            },
          }
        `);
      });

      it(`doesn't override when the label is omitted`, () => {
        const nonOverriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', false]]),
        });
        expect(nonOverriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Fetch(service: "S1") {
              {
                t2 {
                  t {
                    f1
                  }
                }
              }
            },
          }
        `);
      });
    });
  });

  describe('@shareable interaction', () => {
    const subgraph1 = {
      name: 'S1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "id") {
          id: ID!
          f1: String @shareable
        }
      `,
    };

    const subgraph2 = {
      name: 'S2',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          f1: String @shareable @override(from: "S1", label: "test")
          f2: String
        }
      `,
    };

    const subgraph3 = {
      name: 'S3',
      typeDefs: gql`
        type T @key(fields: "id") {
          id: ID!
          f1: String @shareable
          f3: String
        }
      `,
    };

    const [api, queryPlanner] = composeAndCreatePlanner(
      subgraph1,
      subgraph2,
      subgraph3,
    );

    describe(`through S2's T.f1`, () => {
      const operation = operationFromDocument(
        api,
        gql`
          {
            t {
              f1
              f2
            }
          }
        `,
      );

      it('overrides T.f1 resolution to S2 when the label is provided', () => {
        const overriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', true]]),
        });
        expect(overriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                  }
                }
              },
              Flatten(path: "t") {
                Fetch(service: "S2") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f2
                      f1
                    }
                  }
                },
              },
            },
          }
        `);
      });

      it('preserves T.f1 resolution in S1 when the label is omitted', () => {
        const nonOverriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', false]]),
        });
        expect(nonOverriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                    f1
                  }
                }
              },
              Flatten(path: "t") {
                Fetch(service: "S2") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f2
                    }
                  }
                },
              },
            },
          }
        `);
      });
    });

    // This is very similar to the S2 example. The fact that the @override in S2
    // specifies _from_ S1 actually affects all T.f1 fields the same way (except
    // S1). That is to say, it's functionally equivalent to have the `@override`
    // exist in either S2 or S3 from S2/S3/Sn's perspective. It's helpful to
    // test here that the QP will take a path through _either_ S2 or S3 when
    // appropriate to do so. In these tests and the previous S2 tests,
    // "appropriate" is determined by the other fields being selected in the
    // query.
    describe(`through S3's T.f1`, () => {
      const operation = operationFromDocument(
        api,
        gql`
          {
            t {
              f1
              f3
            }
          }
        `,
      );

      it('overrides T.f1 resolution to S3 when the label is provided', () => {
        const overriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', true]]),
        });
        expect(overriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                  }
                }
              },
              Flatten(path: "t") {
                Fetch(service: "S3") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f3
                      f1
                    }
                  }
                },
              },
            },
          }
        `);
      });

      it('preserves T.f1 resolution in S1 when the label is omitted', () => {
        const nonOverriddenPlan = queryPlanner.buildQueryPlan(operation, {
          overrideConditions: new Map([['test', false]]),
        });
        expect(nonOverriddenPlan).toMatchInlineSnapshot(`
          QueryPlan {
            Sequence {
              Fetch(service: "S1") {
                {
                  t {
                    __typename
                    id
                    f1
                  }
                }
              },
              Flatten(path: "t") {
                Fetch(service: "S3") {
                  {
                    ... on T {
                      __typename
                      id
                    }
                  } =>
                  {
                    ... on T {
                      f3
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
});
