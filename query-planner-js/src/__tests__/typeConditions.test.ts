import { operationFromDocument } from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';

describe('Type Condition field merging', () => {
  const subgraph1 = {
    name: 'searchSubgraph',
    typeDefs: gql`
      type Query {
        search: [SearchResult]
      }

      union SearchResult = MovieResult | ArticleResult
      union Section = EntityCollectionSection | GallerySection

      type MovieResult @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      type ArticleResult @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      type EntityCollectionSection @key(fields: "id") {
        id: ID!
      }

      type GallerySection @key(fields: "id") {
        id: ID!
      }
    `,
  };

  const subgraph2 = {
    name: 'artworkSubgraph',
    typeDefs: gql`
      type Query {
        me: String
      }

      type EntityCollectionSection @key(fields: "id") {
        id: ID!
        title: String
        artwork(params: String): String
      }

      type GallerySection @key(fields: "id") {
        id: ID!
        artwork(params: String): String
      }
    `,
  };

  const [api, queryPlanner] = composeAndCreatePlanner(subgraph1, subgraph2);

  test('does eagerly merge fields on different type conditions if flag is absent', () => {
    const operation = operationFromDocument(
      api,
      gql`
        query Search($movieParams: String, $articleParams: String) {
          search {
            __typename
            ... on MovieResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $movieParams)
                }
              }
            }
            ... on ArticleResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $articleParams)
                  title
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
          Fetch(service: "searchSubgraph") {
            {
              search {
                __typename
                ... on MovieResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
                ... on ArticleResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Flatten(path: "search.@.sections.@") {
            Fetch(service: "artworkSubgraph") {
              {
                ... on EntityCollectionSection {
                  __typename
                  id
                }
              } =>
              {
                ... on EntityCollectionSection {
                  artwork(params: $movieParams)
                  title
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
        query Search($movieResultParam: String, $articleResultParam: String) {
          search {
            ... on MovieResult {
              sections {
                ... on EntityCollectionSection {
                  id
                  title
                  artwork(params: $movieResultParam)
                }
                ... on GallerySection {
                  artwork(params: $movieResultParam)
                  id
                }
              }
              id
            }
            ... on ArticleResult {
              id
              sections {
                ... on GallerySection {
                  artwork(params: $articleResultParam)
                }
                ... on EntityCollectionSection {
                  artwork(params: $articleResultParam)
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
          Fetch(service: "searchSubgraph") {
            {
              search {
                __typename
                ... on MovieResult {
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                    ... on GallerySection {
                      __typename
                      id
                    }
                  }
                  id
                }
                ... on ArticleResult {
                  id
                  sections {
                    __typename
                    ... on GallerySection {
                      __typename
                      id
                    }
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".search.@|[MovieResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                  ... on GallerySection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    title
                    artwork(params: $movieResultParam)
                  }
                  ... on GallerySection {
                    artwork(params: $movieResultParam)
                  }
                }
              },
            },
            Flatten(path: ".search.@|[ArticleResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on GallerySection {
                    __typename
                    id
                  }
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on GallerySection {
                    artwork(params: $articleResultParam)
                  }
                  ... on EntityCollectionSection {
                    artwork(params: $articleResultParam)
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
    name: 'searchSubgraph',
    typeDefs: gql`
      type Query {
        search: [SearchResult]
      }

      union Section = EntityCollectionSection | GallerySection

      interface SearchResult @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      interface VideoResult implements SearchResult @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      type MovieResult implements VideoResult & SearchResult
        @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      type SeriesResult implements VideoResult & SearchResult
        @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      type ArticleResult implements SearchResult @key(fields: "id") {
        id: ID!
        sections: [Section]
      }

      type EntityCollectionSection @key(fields: "id") {
        id: ID!
      }

      type GallerySection @key(fields: "id") {
        id: ID!
      }
    `,
  };

  test('does not eagerly merge fields on different type conditions if flag is present with interface', () => {
    const [api2, queryPlanner2] = composeAndCreatePlanner(subgraph3, subgraph2);

    const operation = operationFromDocument(
      api2,
      gql`
        query Search($movieParams: String, $articleParams: String) {
          search {
            __typename
            ... on MovieResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $movieParams)
                }
              }
            }
            ... on ArticleResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $articleParams)
                  title
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
          Fetch(service: "searchSubgraph") {
            {
              search {
                __typename
                ... on MovieResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
                ... on ArticleResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".search.@|[MovieResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $movieParams)
                  }
                }
              },
            },
            Flatten(path: ".search.@|[ArticleResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $articleParams)
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

  test('does generate type conditions with interface fragment', () => {
    const [api2, queryPlanner2] = composeAndCreatePlanner(subgraph3, subgraph2);

    const operation = operationFromDocument(
      api2,
      gql`
        query Search($movieParams: String, $articleParams: String) {
          search {
            __typename
            ... on SearchResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $movieParams)
                }
              }
            }
            ... on ArticleResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $articleParams)
                  title
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
          Fetch(service: "searchSubgraph") {
            {
              search {
                __typename
                id
                sections {
                  __typename
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                }
                ... on ArticleResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".search.@.sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $movieParams)
                  }
                }
              },
            },
            Flatten(path: ".search.@|[ArticleResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $articleParams)
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

  test('does generate type conditions with interface fragment', () => {
    const [api, queryPlanner] = composeAndCreatePlanner(
      {
        name: 'artworkSubgraph',
        typeDefs: gql`
          type Query {
            me: String
          }

          type EntityCollectionSection @key(fields: "id") {
            id: ID!
            title: String
            artwork(params: String): String
          }

          type GallerySection @key(fields: "id") {
            id: ID!
            artwork(params: String): String
          }
        `,
      },
      {
        name: 'searchSubgraph',
        typeDefs: gql`
          type Query {
            search: [SearchResult]
            oneSearch: SearchResult
          }

          union SearchResult = MovieResult | ArticleResult
          union Section = EntityCollectionSection | GallerySection

          type MovieResult @key(fields: "id") {
            id: ID!
            sections: [Section]
            oneSection: Section
          }

          type ArticleResult @key(fields: "id") {
            id: ID!
            sections: [Section]
            oneSection: Section
          }

          type EntityCollectionSection @key(fields: "id") {
            id: ID!
          }

          type GallerySection @key(fields: "id") {
            id: ID!
          }
        `,
      },
    );

    const operation = operationFromDocument(
      api,
      gql`
        query Search($movieParams: String, $articleParams: String) {
          oneSearch {
            __typename
            ... on MovieResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $movieParams)
                }
              }
            }
            ... on ArticleResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $articleParams)
                  title
                }
              }
            }
          }
          search {
            __typename
            ... on MovieResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $movieParams)
                }
              }
            }
            ... on ArticleResult {
              id
              sections {
                ... on EntityCollectionSection {
                  id
                  artwork(params: $articleParams)
                  title
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
          Fetch(service: "searchSubgraph") {
            {
              oneSearch {
                __typename
                ... on MovieResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
                ... on ArticleResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
              }
              search {
                __typename
                ... on MovieResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
                ... on ArticleResult {
                  id
                  sections {
                    __typename
                    ... on EntityCollectionSection {
                      __typename
                      id
                    }
                  }
                }
              }
            }
          },
          Parallel {
            Flatten(path: ".oneSearch|[MovieResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $movieParams)
                  }
                }
              },
            },
            Flatten(path: ".oneSearch|[ArticleResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $articleParams)
                    title
                  }
                }
              },
            },
            Flatten(path: ".search.@|[MovieResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $movieParams)
                  }
                }
              },
            },
            Flatten(path: ".search.@|[ArticleResult].sections.@") {
              Fetch(service: "artworkSubgraph") {
                {
                  ... on EntityCollectionSection {
                    __typename
                    id
                  }
                } =>
                {
                  ... on EntityCollectionSection {
                    artwork(params: $articleParams)
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
});
