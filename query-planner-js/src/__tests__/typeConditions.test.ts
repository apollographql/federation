import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';

describe('Type Condition field merging', () => {
  const subgraph1 = {
    name: 's1',
    typeDefs: gql`
      type Query {
        f1: [U1]
      }

      union U1 = T1 | T2
      union U2 = T3 | T4

      type T1 @key(fields: "id") {
        id: ID!
        f2: [U2]
      }

      type T2 @key(fields: "id") {
        id: ID!
        f2: [U2]
      }

      type T3 @key(fields: "id") {
        id: ID!
      }

      type T4 @key(fields: "id") {
        id: ID!
      }
    `,
  };

  const subgraph2 = {
    name: 's2',
    typeDefs: gql`
      type Query {
        me: String
      }

      type T3 @key(fields: "id") {
        id: ID!
        f2: String
        f3(params: String): String
      }

      type T4 @key(fields: "id") {
        id: ID!
        f3(params: String): String
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

  test('does eagerly merge fields on different type conditions if flag is absent', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query f1($p1: String, $p2: String) {
          f1 {
            __typename
            ... on T1 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p1)
                }
              }
            }
            ... on T2 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p2)
                  f2
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation, {
      typeConditionedFetching: false,
    });
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "s1") {
            {
              f1 {
                __typename
                ... on T1 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
                ... on T2 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Flatten(path: "f1.@.f2.@") {
            Fetch(service: "s2") {
              {
                ... on T3 {
                  __typename
                  id
                }
              } =>
              {
                ... on T3 {
                  f3(params: $p1)
                  f2
                }
              }
            },
          },
        },
      }
    `);
  });

  test('does not eagerly merge fields on different type conditions if flag is present', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query f1($p1: String, $p2: String) {
          f1 {
            ... on T1 {
              f2 {
                ... on T3 {
                  id
                  f2
                  f3(params: $p1)
                }
                ... on T4 {
                  f3(params: $p1)
                  id
                }
              }
              id
            }
            ... on T2 {
              id
              f2 {
                ... on T4 {
                  f3(params: $p2)
                }
                ... on T3 {
                  f3(params: $p2)
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation, {
      typeConditionedFetching: true,
    });
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "s1") {
            {
              f1 {
                __typename
                ... on T1 {
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                    ... on T4 {
                      __typename
                      id
                    }
                  }
                  id
                }
                ... on T2 {
                  id
                  f2 {
                    __typename
                    ... on T4 {
                      __typename
                      id
                    }
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".f1.@|[T1].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                  ... on T4 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f2
                    f3(params: $p1)
                  }
                  ... on T4 {
                    f3(params: $p1)
                  }
                }
              },
            },
            Flatten(path: ".f1.@|[T2].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T4 {
                    __typename
                    id
                  }
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T4 {
                    f3(params: $p2)
                  }
                  ... on T3 {
                    f3(params: $p2)
                  }
                }
              },
            },
          },
        },
      }
    `);
  });

  const subgraph3 = {
    name: 's1',
    typeDefs: gql`
      type Query {
        f1: [I1]
      }

      union U1 = T3 | T4

      interface I1 @key(fields: "id") {
        id: ID!
        f2: [U1]
      }

      interface I2 implements I1 @key(fields: "id") {
        id: ID!
        f2: [U1]
      }

      type T1 implements I2 & I1
        @key(fields: "id") {
        id: ID!
        f2: [U1]
      }

      type T5 implements I2 & I1
        @key(fields: "id") {
        id: ID!
        f2: [U1]
      }

      type T2 implements I1 @key(fields: "id") {
        id: ID!
        f2: [U1]
      }

      type T3 @key(fields: "id") {
        id: ID!
      }

      type T4 @key(fields: "id") {
        id: ID!
      }
    `,
  };

  test('does not eagerly merge fields on different type conditions if flag is present with interface', () => {
    const [api2, queryPlanner2] = composeAndCreatePlanner(subgraph3, subgraph2);

    const operation = operationFromDocument(
      api2,
      gql`
        query f1($p1: String, $p2: String) {
          f1 {
            __typename
            ... on T1 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p1)
                }
              }
            }
            ... on T2 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p2)
                  f2
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner2.buildQueryPlan(operation, {
      typeConditionedFetching: true,
    });
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "s1") {
            {
              f1 {
                __typename
                ... on T1 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
                ... on T2 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".f1.@|[T1].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p1)
                  }
                }
              },
            },
            Flatten(path: ".f1.@|[T2].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p2)
                    f2
                  }
                }
              },
            },
          },
        },
      }
    `);
  });

  test('does generate type conditions with interface fragment', () => {
    const [api2, queryPlanner2] = composeAndCreatePlanner(subgraph3, subgraph2);

    const operation = operationFromDocument(
      api2,
      gql`
        query f1($p1: String, $p2: String) {
          f1 {
            __typename
            ... on I1 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p1)
                }
              }
            }
            ... on T2 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p2)
                  f2
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner2.buildQueryPlan(operation, {
      typeConditionedFetching: true,
    });
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "s1") {
            {
              f1 {
                __typename
                id
                f2 {
                  __typename
                  ... on T3 {
                    __typename
                    id
                  }
                }
                ... on T2 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".f1.@.f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p1)
                  }
                }
              },
            },
            Flatten(path: ".f1.@|[T2].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p2)
                    f2
                  }
                }
              },
            },
          },
        },
      }
    `);
  });

  test('does generate type conditions with interface fragment', () => {
    const [api, queryPlanner] = composeAndCreatePlanner(
      {
        name: 's2',
        typeDefs: gql`
          type Query {
            me: String
          }

          type T3 @key(fields: "id") {
            id: ID!
            f2: String
            f3(params: String): String
          }

          type T4 @key(fields: "id") {
            id: ID!
            f3(params: String): String
          }
        `,
      },
      {
        name: 's1',
        typeDefs: gql`
          type Query {
            f1: [U1]
            onef1: U1
          }

          union U1 = T1 | T2
          union U2 = T3 | T4

          type T1 @key(fields: "id") {
            id: ID!
            f2: [U2]
            oneU2: U2
          }

          type T2 @key(fields: "id") {
            id: ID!
            f2: [U2]
            oneU2: U2
          }

          type T3 @key(fields: "id") {
            id: ID!
          }

          type T4 @key(fields: "id") {
            id: ID!
          }
        `,
      },
    );

    const operation = operationFromDocument(
      api,
      gql`
        query f1($p1: String, $p2: String) {
          onef1 {
            __typename
            ... on T1 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p1)
                }
              }
            }
            ... on T2 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p2)
                  f2
                }
              }
            }
          }
          f1 {
            __typename
            ... on T1 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p1)
                }
              }
            }
            ... on T2 {
              id
              f2 {
                ... on T3 {
                  id
                  f3(params: $p2)
                  f2
                }
              }
            }
          }
        }
      `,
    );

    const plan = queryPlanner.buildQueryPlan(operation, {
      typeConditionedFetching: true,
    });
    expect(plan).toMatchInlineSnapshot(`
      QueryPlan {
        Sequence {
          Fetch(service: "s1") {
            {
              onef1 {
                __typename
                ... on T1 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
                ... on T2 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
              }
              f1 {
                __typename
                ... on T1 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
                ... on T2 {
                  id
                  f2 {
                    __typename
                    ... on T3 {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".onef1|[T1].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p1)
                  }
                }
              },
            },
            Flatten(path: ".onef1|[T2].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p2)
                    f2
                  }
                }
              },
            },
            Flatten(path: ".f1.@|[T1].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p1)
                  }
                }
              },
            },
            Flatten(path: ".f1.@|[T2].f2.@") {
              Fetch(service: "s2") {
                {
                  ... on T3 {
                    __typename
                    id
                  }
                } =>
                {
                  ... on T3 {
                    f3(params: $p2)
                    f2
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
