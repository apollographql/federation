import {
  asFed2SubgraphDocument,
  costIdentity,
  FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS,
  listSizeIdentity,
  Supergraph
} from '@apollo/federation-internals';
import { composeServices } from '../compose';
import gql from 'graphql-tag';
import { assertCompositionSuccess } from "./testHelper";

describe('demand control directive composition', () => {
  describe('when imported from the demand control spec', () => {
    it('does not include @cost or @listSize as core features', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: asFed2SubgraphDocument(
          gql`
            extend schema
              @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])
              @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

            type Query {
              expensive: Int @cost(weight: "5.0")
              bigList: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
            }
          `,
        ),
      };
      const result = composeServices([subgraphA]);

      assertCompositionSuccess(result);
      expect(result.schema.coreFeatures?.getByIdentity(costIdentity)).toBeUndefined();
      expect(result.schema.coreFeatures?.getByIdentity(listSizeIdentity)).toBeUndefined();
    });


    it('propagates @cost and @listSize to the supergraph using @join__directive', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])
  
          type Query {
            expensive: Int @cost(weight: "5.0")
          }
        `),
      };
  
      const subgraphB = {
        name: 'subgraphB',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])
  
          type Query {
            bigList: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
          }
        `),
      };
  
      const result = composeServices([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
  
      const costDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('expensive')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(costDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHA], name: "cost", args: {weight: "5.0"})`);
  
      const listSizeDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('bigList')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(listSizeDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHB], name: "listSize", args: {assumedSize: 2000, requireOneSlicingArgument: false})`);
    });
  });

  describe('when imported from the federation spec', () => {
    // This is not necessarily desired behavior, but it should be called out.
    // If users try to import @cost or @listSize from the federation spec, they
    // will be skipped during composition because the federation URL is not
    // registered as using @join__directive and @cost/@listSize are not composed
    // by default.
    it('does not propagate @cost and @listSize to the supergraph', () => {
      const subgraphA = {
        name: 'subgraphA',
        typeDefs: asFed2SubgraphDocument(
          gql`  
            type Query {
              expensive: Int @cost(weight: "5.0")
            }
          `,
          { includeAllImports: true },
        ),
      };
  
      const subgraphB = {
        name: 'subgraphB',
        typeDefs: asFed2SubgraphDocument(
          gql`
            type Query {
              bigList: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
            }
          `,
          { includeAllImports: true },
        ),
      };
  
      const result = composeServices([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
  
      const costDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('expensive')
        ?.appliedDirectivesOf('join__directive');
      expect(costDirectiveApplications?.length).toBe(0);
  
      const listSizeDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('bigList')
        ?.appliedDirectivesOf('join__directive');
      expect(listSizeDirectiveApplications?.length).toBe(0);
    });
  });
});

describe('demand control directive extraction', () => {
  it('extracts @cost from the supergraph', () => {
    const subgraph = {
      name: 'my-subgraph', 
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

        type Query {
          fieldWithCost: Int @cost(weight: "5.0")
        }
      `)
    };

    const result = composeServices([subgraph]);
    assertCompositionSuccess(result);
    expect(result.hints.length).toBe(0);
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get('my-subgraph');

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        fieldWithCost: Int @federation__cost(weight: "5.0")
      }
    `);
  });

  it('extracts @listSize from the supergraph', () => {
    const subgraph = {
      name: 'my-subgraph', 
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

        type Query {
          bigList: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
        }
      `)
    };

    const result = composeServices([subgraph]);
    assertCompositionSuccess(result);
    expect(result.hints.length).toBe(0);
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get('my-subgraph');

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        bigList: [String!] @federation__listSize(assumedSize: 2000, requireOneSlicingArgument: false)
      }
    `);
  });

  it('extracts the correct @cost for different subgraphs with @shareable fields', () => {
    const subgraphA = {
      name: 'subgraph-a',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

        type Query {
          sharedWithCost: Int @shareable @cost(weight: "5.0")
        }
      `)
    };
    const subgraphB = {
      name: 'subgraph-b',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

        type Query {
          sharedWithCost: Int @shareable @cost(weight: "10.0")
        }
      `)
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);
    expect(result.hints.length).toBe(0);
    const supergraph = Supergraph.build(result.supergraphSdl);

    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithCost: Int @shareable @federation__cost(weight: "5.0")
      }
    `);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithCost: Int @shareable @federation__cost(weight: "10.0")
      }
    `);
  });

  it('extracts the correct @listSize for different subgraphs with @shareable fields', () => {
    const subgraphA = {
      name: 'subgraph-a',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

        type Query {
          sharedWithListSize: [Int] @shareable @listSize(assumedSize: 10)
        }
      `)
    };
    const subgraphB = {
      name: 'subgraph-b',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

        type Query {
          sharedWithListSize: [Int] @shareable @listSize(assumedSize: 20)
        }
      `)
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);
    expect(result.hints.length).toBe(0);
    const supergraph = Supergraph.build(result.supergraphSdl);

    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 10)
      }
    `);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 20)
      }
    `);
  });
});
