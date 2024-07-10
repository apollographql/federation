import {
  asFed2SubgraphDocument,
  EnumType,
  FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS,
  InputObjectType,
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

    enum AorB @cost(weight: 15) {
      A
      B
    }

    input InputTypeWithCost {
      somethingWithCost: Int @cost(weight: 20)
    }

    type Query {
      fieldWithCost: Int @cost(weight: 5)
      argWithCost(arg: Int @cost(weight: 10)): Int
      enumWithCost: AorB
      inputWithCost(someInput: InputTypeWithCost): Int
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

    enum AorB @renamedCost(weight: 15) {
      A
      B
    }

    input InputTypeWithCost {
      somethingWithCost: Int @renamedCost(weight: 20)
    }

    type Query {
      fieldWithCost: Int @renamedCost(weight: 5)
      argWithCost(arg: Int @renamedCost(weight: 10)): Int
      enumWithCost: AorB
      inputWithCost(someInput: InputTypeWithCost): Int
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
      enum AorB @cost(weight: 15) {
        A
        B
      }
      
      input InputTypeWithCost {
        somethingWithCost: Int @cost(weight: 20)
      }

      type Query {
        fieldWithCost: Int @cost(weight: 5)
        argWithCost(arg: Int @cost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
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

      enum AorB @renamedCost(weight: 15) {
        A
        B
      }

      input InputTypeWithCost {
        somethingWithCost: Int @renamedCost(weight: 20)
      }

      type Query {
        fieldWithCost: Int @renamedCost(weight: 5)
        argWithCost(arg: Int @renamedCost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
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
  it.skip('propagates @cost and @listSize to the supergraph', () => {
    const result = composeServices([subgraphWithCost, subgraphWithListSize]);
    assertCompositionSuccess(result);

    const costDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithCost')
      ?.appliedDirectivesOf('cost')
      .toString();
    expect(costDirectiveApplications).toMatchString(`@cost(weight: 5)`);

    const argCostDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('argWithCost')
      ?.argument('arg')
      ?.appliedDirectivesOf('cost')
      .toString();
    expect(argCostDirectiveApplications).toMatchString(`@cost(weight: 10)`);

    const enumWithCost = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('enumWithCost')
      ?.type as EnumType;
    const enumCostDirectiveApplications = enumWithCost.appliedDirectivesOf('cost').toString();
    expect(enumCostDirectiveApplications).toMatchString(`@cost(weight: 15)`);

    const inputWithCost = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('inputWithCost')
      ?.argument('someInput')
      ?.type as InputObjectType;
    const inputCostDirectiveApplications = inputWithCost.field('somethingWithCost')?.appliedDirectivesOf('cost').toString();
    expect(inputCostDirectiveApplications).toMatchString(`@cost(weight: 20)`);

    const listSizeDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithListSize')
      ?.appliedDirectivesOf('listSize')
      .toString();
    expect(listSizeDirectiveApplications).toMatchString(`@listSize(assumedSize: 2000, requireOneSlicingArgument: false)`);
  });

  it.each([
    [subgraphWithCost, subgraphWithListSize],
    [subgraphWithCostFromFederationSpec, subgraphWithListSizeFromFederationSpec],
  ])('propagates @cost and @listSize to the supergraph', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
    const result = composeServices([costSubgraph, listSizeSubgraph]);
    assertCompositionSuccess(result);

    const costDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithCost')
      ?.appliedDirectivesOf('cost')
      .toString();
    expect(costDirectiveApplications).toMatchString(`@cost(weight: 5)`);

    const argCostDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('argWithCost')
      ?.argument('arg')
      ?.appliedDirectivesOf('cost')
      .toString();
    expect(argCostDirectiveApplications).toMatchString(`@cost(weight: 10)`);

    const enumWithCost = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('enumWithCost')
      ?.type as EnumType;
    const enumCostDirectiveApplications = enumWithCost.appliedDirectivesOf('cost').toString();
    expect(enumCostDirectiveApplications).toMatchString(`@cost(weight: 15)`);

    const inputWithCost = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('inputWithCost')
      ?.argument('someInput')
      ?.type as InputObjectType;
    const inputCostDirectiveApplications = inputWithCost.field('somethingWithCost')?.appliedDirectivesOf('cost').toString();
    expect(inputCostDirectiveApplications).toMatchString(`@cost(weight: 20)`);

    const listSizeDirectiveApplications = result
      .schema
      .schemaDefinition
      .rootType('query')
      ?.field('fieldWithListSize')
      ?.appliedDirectivesOf('listSize')
      .toString();
    expect(listSizeDirectiveApplications).toMatchString(`@listSize(assumedSize: 2000, requireOneSlicingArgument: false)`);
  });

  describe('when renamed', () => {
    it.each([
      [subgraphWithRenamedCost, subgraphWithRenamedListSize],
      [subgraphWithRenamedCostFromFederationSpec, subgraphWithRenamedListSizeFromFederationSpec]
    ])('propagates the renamed @cost and @listSize to the supergraph', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
      const result = composeServices([costSubgraph, listSizeSubgraph]);
      assertCompositionSuccess(result);

      // Ensure the new directive names are specified in the supergraph so we can use them during extraction
      const links = result.schema.schemaDefinition.appliedDirectivesOf("link");
      const costLink = links.find((link) => link.arguments().url === "https://specs.apollo.dev/cost/v0.1");
      expect(costLink?.arguments().as).toBe("renamedCost");

      const listSizeLink = links.find((link) => link.arguments().url === "https://specs.apollo.dev/listSize/v0.1");
      expect(listSizeLink?.arguments().as).toBe("renamedListSize");

      // Ensure the directives are applied to the expected fields with the new names
      const costDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithCost')
        ?.appliedDirectivesOf('renamedCost')
        .toString();
      expect(costDirectiveApplications).toMatchString(`@renamedCost(weight: 5)`);

      const argCostDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('argWithCost')
        ?.argument("arg")
        ?.appliedDirectivesOf('renamedCost')
        .toString();
      expect(argCostDirectiveApplications).toMatchString(`@renamedCost(weight: 10)`);

      const enumWithCost = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('enumWithCost')
        ?.type as EnumType;
      const enumCostDirectiveApplications = enumWithCost.appliedDirectivesOf('renamedCost').toString();
      expect(enumCostDirectiveApplications).toMatchString(`@renamedCost(weight: 15)`);

      const listSizeDirectiveApplications = result
        .schema
        .schemaDefinition
        .rootType('query')
        ?.field('fieldWithListSize')
        ?.appliedDirectivesOf('renamedListSize')
        .toString();
      expect(listSizeDirectiveApplications).toMatchString(`@renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)`);
    });
  });
});

describe('demand control directive extraction', () => {
  it.skip('extracts @cost from the supergraph', () => {
    const result = composeServices([subgraphWithCost]);
    assertCompositionSuccess(result);
    // expect(result.hints).toEqual([]);
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get(subgraphWithCost.name);

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      enum AorB
        @federation__cost(weight: 15)
      {
        A
        B
      }

      input InputTypeWithCost {
        somethingWithCost: Int @federation__cost(weight: 20)
      }

      type Query {
        fieldWithCost: Int @federation__cost(weight: 5)
        argWithCost(arg: Int @federation__cost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
      }
    `);
  });

  it.each([
    subgraphWithCost,
    subgraphWithRenamedCost,
    subgraphWithCostFromFederationSpec,
    subgraphWithRenamedCostFromFederationSpec
  ])('extracts @cost from the supergraph', (subgraph: ServiceDefinition) => {
    const result = composeServices([subgraph]);
    assertCompositionSuccess(result);
    // expect(result.hints).toEqual([]);
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get(subgraphWithCost.name);

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      enum AorB
        @federation__cost(weight: 15)
      {
        A
        B
      }

      input InputTypeWithCost {
        somethingWithCost: Int @federation__cost(weight: 20)
      }

      type Query {
        fieldWithCost: Int @federation__cost(weight: 5)
        argWithCost(arg: Int @federation__cost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
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
    // expect(result.hints).toEqual([]);
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

  it('extracts the merged (max) @cost for different subgraphs with @shareable fields', () => {
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
    // expect(result.hints).toEqual([]);
    const supergraph = Supergraph.build(result.supergraphSdl);

    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithCost: Int @shareable @federation__cost(weight: 10)
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

  it('extracts the merged @listSize for different subgraphs with @shareable fields', () => {
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
    // expect(result.hints).toEqual([]);
    const supergraph = Supergraph.build(result.supergraphSdl);

    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 20, requireOneSlicingArgument: true)
      }
    `);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 20, requireOneSlicingArgument: true)
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
    // expect(result.hints).toEqual([]);
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
        sizedList(first: Int!): HasInts @shareable @federation__listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: false)
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
        sizedList(first: Int!): HasInts @shareable @federation__listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: false)
      }
    `);
  })
});
