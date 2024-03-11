import {
  CompositeType,
  FragmentElement,
  ListType,
  NamedType,
  OperationElement,
  operationFromDocument,
} from '@apollo/federation-internals';
import gql from 'graphql-tag';
import { composeAndCreatePlanner } from './testHelper';
import { GroupPath } from '../buildPlan';

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

  const stringType = api.type('String') as NamedType;
  const searchType = api.type('SearchResult') as CompositeType;
  const searchListType = new ListType(searchType);
  const idType = api.type('ID') as NamedType;

  test('yields correct response path for regular fields', () => {
    const groupPath = GroupPath.empty(false);
    const element = {
      kind: 'Field',
      key: function () {
        return 'me';
      },
      responseName: function () {
        return 'me';
      },
      definition: {
        type: stringType,
      },
    } as OperationElement;
    const expectedPath = 'me';
    expect(groupPath.add(element, stringType).toString()).toEqual(expectedPath);
  });

  test('yields correct response path for list fields', () => {
    const groupPath = GroupPath.empty(false);
    const element = {
      kind: 'Field',
      key: function () {
        return 'search';
      },
      responseName: function () {
        return 'search';
      },
      definition: {
        type: searchListType,
      },
    } as OperationElement;
    const expectedPath = 'search.@';
    expect(groupPath.add(element, searchListType).toString()).toEqual(
      expectedPath,
    );
  });

  test('does not add type condition check if the planner flag is not passed', () => {
    let groupPath = GroupPath.empty(false);

    // Add 'search' '@' to the path
    groupPath = groupPath.add(
      {
        kind: 'Field',
        key: function () {
          return this.responseName();
        },
        responseName: function () {
          return 'search';
        },
        definition: {
          type: searchListType,
        },
      } as OperationElement,
      searchListType,
    );

    // This is the interesting bit, we'll add a Fragment:
    // ... on MovieResult
    const fragment = new FragmentElement(searchType, 'MovieResult');
    groupPath = groupPath.add(fragment, searchType);

    // process ID
    const element = {
      kind: 'Field',
      key: function () {
        return this.responseName();
      },
      responseName: function () {
        return 'id';
      },
      definition: {
        type: idType,
      },
    } as OperationElement;

    const expectedPath = 'search.@.id';
    expect(groupPath.add(element, idType).toString()).toEqual(expectedPath);
  });

  test('does add type condition check if the planner flag is passed', () => {
    let groupPath = GroupPath.empty(true);
    // Add 'search' '@' to the path
    groupPath = groupPath.add(
      {
        kind: 'Field',
        key: function () {
          return this.responseName();
        },
        responseName: function () {
          return 'search';
        },
        definition: {
          type: searchType,
        },
      } as OperationElement,
      searchType,
    );

    // This is the interesting bit, we'll add a Fragment:
    // ... on MovieResult
    const fragment = new FragmentElement(searchType, 'MovieResult');
    groupPath = groupPath.add(fragment, searchType);

    // process ID
    const element = {
      kind: 'Field',
      key: function () {
        return this.responseName();
      },
      responseName: function () {
        return 'id';
      },
      definition: {
        type: idType,
      },
    } as OperationElement;

    const expectedPath = 'search|[MovieResult].id';
    expect(groupPath.add(element, idType).toString()).toEqual(expectedPath);
  });

  test('type condition checks are sorted', () => {
    let groupPath = GroupPath.empty(true);

    // Add 'search' '@' to the path
    groupPath = groupPath.add(
      {
        kind: 'Field',
        key: function () {
          return this.responseName();
        },
        responseName: function () {
          return 'search';
        },
        definition: {
          type: searchListType,
        },
      } as OperationElement,
      searchListType,
    );

    const fragment = new FragmentElement(searchType, 'MovieResult');
    const gp1 = groupPath.add(fragment, searchType);

    const fragment2 = new FragmentElement(searchType, 'ArticleResult');
    const gp2 = groupPath.add(fragment2, searchType);

    // process ID
    const element = {
      kind: 'Field',
      key: function () {
        return this.responseName();
      },
      responseName: function () {
        return 'id';
      },
      definition: {
        type: idType,
      },
    } as OperationElement;

    const expectedPath1 = 'search.@|[MovieResult].id';
    const expectedPath2 = 'search.@|[ArticleResult].id';
    expect(gp1.add(element, idType).toString()).toEqual(expectedPath1);
    expect(gp2.add(element, idType).toString()).toEqual(expectedPath2);
  });

  test('simpleschematest', () => {
    const schema1 = {
      name: 'testSchema1',
      typeDefs: gql`
        type Query {
          foo: Foo
        }

        interface Foo {
          bar: Bar
        }

        interface Bar {
          baz: String
        }

        type Foo_1 implements Foo {
          bar: Bar_1
          a: Int
        }

        type Foo_2 implements Foo {
          bar: Bar_2
          b: Int
        }

        type Bar_1 implements Bar {
          baz: String
          a: Int
        }

        type Bar_2 implements Bar {
          baz: String
          b: Int
        }

        type Bar_3 implements Bar {
          baz: String
        }
      `,
    };

    const [api, _] = composeAndCreatePlanner(schema1);

    let groupPath = GroupPath.empty(true);
    const fooInterface = api.type('Foo') as CompositeType;

    groupPath = groupPath.add(
      {
        kind: 'Field',
        key: function () {
          return 'foo';
        },
        responseName: function () {
          return 'foo';
        },
        definition: {
          type: fooInterface,
        },
      } as OperationElement,
      fooInterface,
    );

    const barInterface = api.type('Bar') as CompositeType;

    groupPath = groupPath.add(
      {
        kind: 'Field',
        key: function () {
          return 'bar';
        },
        responseName: function () {
          return 'bar';
        },
        definition: {
          type: barInterface,
        },
      } as OperationElement,
      barInterface,
    );

    expect(groupPath.toString()).toEqual('foo|[Foo_1,Foo_2].bar');
  });

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
            Flatten(path: "search.@|[MovieResult].sections.@") {
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
            Flatten(path: "search.@|[ArticleResult].sections.@") {
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
            Flatten(path: "search.@|[MovieResult].sections.@") {
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
            Flatten(path: "search.@|[ArticleResult].sections.@") {
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
            Flatten(path: "search.@|[ArticleResult,MovieResult,SeriesResult].sections.@") {
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
            Flatten(path: "search.@|[ArticleResult].sections.@") {
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
      },
    );

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
            Flatten(path: "search.@|[MovieResult].sections.@") {
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
            Flatten(path: "search.@|[ArticleResult].sections.@") {
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
