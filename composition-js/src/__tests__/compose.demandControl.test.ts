import {
  asFed2SubgraphDocument,
  costIdentity,
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
    extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

    enum AorB {
      A
      B
    }

    type Query {
      fieldWithCost: Int @cost(weight: 5)
      inputFieldWithCost(input: Int @cost(weight: 10)): Int
      enumWithCost: AorB @cost(weight: 15)
    }
  `),
};

const subgraphWithListSize = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

    type Query {
      fieldWithListSize: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
    }
  `),
};

const subgraphWithRenamedCost = {
  name: 'subgraphWithCost',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: [{ name: "@cost", as: "@renamedCost" }])

    enum AorB {
      A
      B
    }

    type Query {
      fieldWithCost: Int @renamedCost(weight: 5)
      inputFieldWithCost(input: Int @renamedCost(weight: 10)): Int
      enumWithCost: AorB @renamedCost(weight: 15)
    }
  `),
};

const subgraphWithRenamedListSize = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: [{ name: "@listSize", as: "@renamedListSize" }])

    type Query {
      fieldWithListSize: [String!] @renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)
    }
  `),
};

const subgraphWithCostFromFederationSpec = {
  name: 'subgraphWithCost',
  typeDefs: asFed2SubgraphDocument(
    gql`  
      enum AorB {
        A
        B
      }

      type Query {
        fieldWithCost: Int @cost(weight: 5)
        inputFieldWithCost(input: Int @cost(weight: 10)): Int
        enumWithCost: AorB @cost(weight: 15)
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

const subgraphWithRenamedCostFromFederationSpec = {
  name: 'subgraphWithCost',
  typeDefs:
    gql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.9", import: [{ name: "@cost", as: "@renamedCost" }])

      enum AorB {
        A
        B
      }

      type Query {
        fieldWithCost: Int @renamedCost(weight: 5)
        inputFieldWithCost(input: Int @renamedCost(weight: 10)): Int
        enumWithCost: AorB @renamedCost(weight: 15)
      }
    `,
};

const subgraphWithRenamedListSizeFromFederationSpec = {
  name: 'subgraphWithListSize',
  typeDefs:
    gql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.9", import: [{ name: "@listSize", as: "@renamedListSize" }])

      type Query {
        fieldWithListSize: [String!] @renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)
      }
    `,
};

describe('demand control directive composition', () => {
  it.each([
    subgraphWithCost,
    subgraphWithRenamedCost,
    subgraphWithCostFromFederationSpec,
    subgraphWithRenamedCostFromFederationSpec
  ])('does not include @cost as a core feature', (subgraph: ServiceDefinition) => {
    const result = composeServices([subgraph]);

    assertCompositionSuccess(result);
    expect(result.schema.coreFeatures?.getByIdentity(costIdentity)).toBeUndefined();
  });

  it.each([
    subgraphWithListSize,
    subgraphWithRenamedListSize,
    subgraphWithListSizeFromFederationSpec,
    subgraphWithRenamedListSizeFromFederationSpec
  ])('does not include @listSize as a core feature', (subgraph: ServiceDefinition) => {
    const result = composeServices([subgraph]);

    assertCompositionSuccess(result);
    expect(result.schema.coreFeatures?.getByIdentity(costIdentity)).toBeUndefined();
  });

  it.only('propagates @cost and @listSize to the supergraph using @join__directive', () => {
    const result = composeServices([subgraphWithCost, subgraphWithListSize]);
    assertCompositionSuccess(result);

    const costDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithCost')
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(costDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "cost", args: {weight: 5})`);

    const inputCostDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('inputFieldWithCost')
      ?.argument("input")
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(inputCostDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "cost", args: {weight: 10})`);

    const enumCostDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('enumWithCost')
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(enumCostDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "cost", args: {weight: 15})`);

    const listSizeDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithListSize')
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(listSizeDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHLISTSIZE], name: "listSize", args: {assumedSize: 2000, requireOneSlicingArgument: false})`);
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

    const inputCostDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('inputFieldWithCost')
      ?.argument("input")
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(inputCostDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "cost", args: {weight: 10})`);

    const enumCostDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('enumWithCost')
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(enumCostDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "cost", args: {weight: 15})`);

    const listSizeDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithListSize')
      ?.appliedDirectivesOf('join__directive')
      .toString();
    expect(listSizeDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHLISTSIZE], name: "listSize", args: {assumedSize: 2000, requireOneSlicingArgument: false})`);
  });

  describe('when renamed', () => {
    it.each([
      [subgraphWithRenamedCost, subgraphWithRenamedListSize],
      [subgraphWithRenamedCostFromFederationSpec, subgraphWithRenamedListSizeFromFederationSpec]
    ])('propagates the renamed @cost and @listSize to the supergraph using @join__directive', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
      const result = composeServices([costSubgraph, listSizeSubgraph]);
      assertCompositionSuccess(result);

      const costDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithCost')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(costDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "renamedCost", args: {weight: 5})`);

      const inputCostDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('inputFieldWithCost')
        ?.argument("input")
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(inputCostDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "renamedCost", args: {weight: 10})`);

      const enumCostDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('enumWithCost')
        ?.appliedDirectivesOf('join__directive')
        .toString();
      expect(enumCostDirectiveApplications).toMatchString(`@join__directive(graphs: [SUBGRAPHWITHCOST], name: "renamedCost", args: {weight: 15})`);

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
  it.each([
    subgraphWithCost,
    subgraphWithRenamedCost,
    subgraphWithCostFromFederationSpec,
    subgraphWithRenamedCostFromFederationSpec
  ])('extracts @cost from the supergraph', (subgraph: ServiceDefinition) => {
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

      enum AorB {
        A
        B
      }

      type Query {
        fieldWithCost: Int @federation__cost(weight: 5)
        inputFieldWithCost(input: Int @federation__cost(weight: 10)): Int
        enumWithCost: AorB @federation__cost(weight: 15)
      }
    `);
  });

  it.each([
    subgraphWithListSize,
    subgraphWithRenamedListSize,
    subgraphWithListSizeFromFederationSpec,
    subgraphWithRenamedListSizeFromFederationSpec
  ])('extracts @listSize from the supergraph', (subgraph: ServiceDefinition) => {
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
        extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

        type Query {
          sharedWithCost: Int @shareable @cost(weight: 5)
        }
      `)
    };
    const subgraphB = {
      name: 'subgraph-b',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])

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

  it('extracts @listSize with dynamic cost arguments', () => {
    const subgraphA = {
      name: 'subgraph-a',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

        type Query {
          sizedList(first: Int!): HasInts @shareable @listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)
        }

        type HasInts {
          ints: [Int!] @shareable
        }
      `)
    };
    const subgraphB = {
      name: 'subgraph-b',
      typeDefs: asFed2SubgraphDocument(gql`
        extend schema @link(url: "https://specs.apollo.dev/listSize/v0.1", import: ["@listSize"])

        type Query {
          sizedList(first: Int!): HasInts @shareable @listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: false)
        }

        type HasInts {
          ints: [Int!] @shareable
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

      type HasInts {
        ints: [Int!] @shareable
      }

      type Query {
        sizedList(first: Int!): HasInts @shareable @federation__listSize(sizedFields: ["ints"], slicingArguments: ["first"], requireOneSlicingArgument: true)
      }
    `);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type HasInts {
        ints: [Int!] @shareable
      }

      type Query {
        sizedList(first: Int!): HasInts @shareable @federation__listSize(sizedFields: ["ints"], slicingArguments: ["first"], requireOneSlicingArgument: false)
      }
    `);
  })
});
