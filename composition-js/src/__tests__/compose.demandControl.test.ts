import {
  asFed2SubgraphDocument,
  demandControlIdentity,
  FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS,
  ServiceDefinition,
  Supergraph
} from '@apollo/federation-internals';
import { composeServices } from '../compose';
import gql from 'graphql-tag';
import { assertCompositionSuccess } from "./testHelper";

const subgraphWithCost = {
  name: 'subgraphWithCost',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: ["@cost"])

    type Query {
      fieldWithCost: Int @cost(weight: 5)
    }
  `),
};

const subgraphWithListSize = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: ["@listSize"])

    type Query {
      fieldWithListSize: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
    }
  `),
};

const subgraphWithRenamedCost = {
  name: 'subgraphWithCost',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: [{ name: "@cost", as: "@renamedCost" }])

    type Query {
      fieldWithCost: Int @renamedCost(weight: 5)
    }
  `),
};

const subgraphWithRenamedListSize = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: [{ name: "@listSize", as: "@renamedListSize" }])

    type Query {
      fieldWithListSize: [String!] @renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)
    }
  `),
};

const subgraphWithCostFromFederationSpec = {
  name: 'subgraphWithCost',
  typeDefs: asFed2SubgraphDocument(
    gql`  
      type Query {
        fieldWithCost: Int @cost(weight: 5)
      }
    `,
    { includeAllImports: true },
  ),
};

const subgraphWithListSizeFromFederationSpec = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(
    gql`
      type Query {
        fieldWithListSize: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
      }
    `,
    { includeAllImports: true },
  ),
};

describe('demand control directive composition', () => {
  describe('when imported from the demand control spec', () => {
    it.each([subgraphWithCost, subgraphWithRenamedCost, subgraphWithCostFromFederationSpec])('does not include @cost as a core feature', (subgraph: ServiceDefinition) => {
      const result = composeServices([subgraph]);

      assertCompositionSuccess(result);
      expect(result.schema.coreFeatures?.getByIdentity(demandControlIdentity)).toBeUndefined();
    });

    it.each([subgraphWithListSize, subgraphWithRenamedListSize, subgraphWithListSizeFromFederationSpec])('does not include @listSize as a core feature', (subgraph: ServiceDefinition) => {
      const result = composeServices([subgraph]);

      assertCompositionSuccess(result);
      expect(result.schema.coreFeatures?.getByIdentity(demandControlIdentity)).toBeUndefined();
    });

    it.each([
      [subgraphWithCost, subgraphWithListSize],
      [subgraphWithCostFromFederationSpec, subgraphWithListSizeFromFederationSpec],
    ])('propagates @cost and @listSize to the supergraph using @join__directive', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
      const result = composeServices([costSubgraph, listSizeSubgraph]);
      assertCompositionSuccess(result);
  
      const costDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithCost')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(costDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "cost", args: {weight: 5})`);
  
      const listSizeDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithListSize')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(listSizeDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHLISTSIZE], name: "listSize", args: {assumedSize: 2000, requireOneSlicingArgument: false})`);
    });
  });

  describe('when renamed', () => {
    it('propagates @cost and @listSize to the supergraph using @join__directive', () => {
      const result = composeServices([subgraphWithRenamedCost, subgraphWithRenamedListSize]);
      assertCompositionSuccess(result);

      const costDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithCost')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(costDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "renamedCost", args: {weight: 5})`);

      const listSizeDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithListSize')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(listSizeDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHLISTSIZE], name: "renamedListSize", args: {assumedSize: 2000, requireOneSlicingArgument: false})`);
    });
  });
});

describe('demand control directive extraction', () => {
  it.each([subgraphWithCost, subgraphWithRenamedCost, subgraphWithCostFromFederationSpec])('extracts @cost from the supergraph', (subgraph: ServiceDefinition) => {
    const result = composeServices([subgraph]);
    assertCompositionSuccess(result);
    expect(result.hints.length).toBe(0);
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get(subgraphWithCost.name);

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        fieldWithCost: Int @federation__cost(weight: 5)
      }
    `);
  });

  it.each([subgraphWithListSize, subgraphWithRenamedListSize, subgraphWithListSizeFromFederationSpec])('extracts @listSize from the supergraph', (subgraph: ServiceDefinition) => {
    const result = composeServices([subgraph]);
    assertCompositionSuccess(result);
    expect(result.hints.length).toBe(0);
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get(subgraphWithListSize.name);

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        fieldWithListSize: [String!] @federation__listSize(assumedSize: 2000, requireOneSlicingArgument: false)
      }
    `);
  });

  it('extracts the correct @cost for different subgraphs with @shareable fields', () => {
    const subgraphA = {
      name: 'subgraph-a',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: ["@cost"])

        type Query {
          sharedWithCost: Int @shareable @cost(weight: 5)
        }
      `)
    };
    const subgraphB = {
      name: 'subgraph-b',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: ["@cost"])

        type Query {
          sharedWithCost: Int @shareable @cost(weight: 10)
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
        sharedWithCost: Int @shareable @federation__cost(weight: 5)
      }
    `);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithCost: Int @shareable @federation__cost(weight: 10)
      }
    `);
  });

  it('extracts the correct @listSize for different subgraphs with @shareable fields', () => {
    const subgraphA = {
      name: 'subgraph-a',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: ["@listSize"])

        type Query {
          sharedWithListSize: [Int] @shareable @listSize(assumedSize: 10)
        }
      `)
    };
    const subgraphB = {
      name: 'subgraph-b',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/demandControl/v0.1", import: ["@listSize"])

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
