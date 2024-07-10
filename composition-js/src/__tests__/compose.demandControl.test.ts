import {
  ArgumentDefinition,
  asFed2SubgraphDocument,
  EnumType,
  FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS,
  FieldDefinition,
  InputObjectType,
  ObjectType,
  ServiceDefinition,
  Supergraph
} from '@apollo/federation-internals';
import { composeServices, CompositionResult } from '../compose';
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

// Used to test @cost applications on FIELD_DEFINITION
function fieldWithCost(result: CompositionResult): FieldDefinition<ObjectType> | undefined {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('fieldWithCost');
}

// Used to test @cost applications on ARGUMENT_DEFINITION
function argumentWithCost(result: CompositionResult): ArgumentDefinition<FieldDefinition<ObjectType>> | undefined {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('argWithCost')
    ?.argument('arg');
}

// Used to test @cost applications on ENUM
function enumWithCost(result: CompositionResult): EnumType | undefined {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('enumWithCost')
    ?.type as EnumType;
}

// Used to test @cost applications on INPUT_FIELD_DEFINITION
function inputWithCost(result: CompositionResult): InputObjectType | undefined {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('inputWithCost')
    ?.argument('someInput')
    ?.type as InputObjectType;
}

// Used to test @listSize applications on FIELD_DEFINITION
function fieldWithListSize(result: CompositionResult): FieldDefinition<ObjectType> | undefined  {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('fieldWithListSize');
}

describe('demand control directive composition', () => {
  it.each([
    [subgraphWithCost, subgraphWithListSize],
    [subgraphWithCostFromFederationSpec, subgraphWithListSizeFromFederationSpec],
  ])('propagates @cost and @listSize to the supergraph', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
    const result = composeServices([costSubgraph, listSizeSubgraph]);
    assertCompositionSuccess(result);

    const costDirectiveApplications = fieldWithCost(result)?.appliedDirectivesOf('cost');
    expect(costDirectiveApplications?.toString()).toMatchString(`@cost(weight: 5)`);

    const argCostDirectiveApplications = argumentWithCost(result)?.appliedDirectivesOf('cost');
    expect(argCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 10)`);

    const enumCostDirectiveApplications = enumWithCost(result)?.appliedDirectivesOf('cost');
    expect(enumCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 15)`);

    const inputCostDirectiveApplications = inputWithCost(result)?.field('somethingWithCost')?.appliedDirectivesOf('cost');
    expect(inputCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 20)`);

    const listSizeDirectiveApplications = fieldWithListSize(result)?.appliedDirectivesOf('listSize');
    expect(listSizeDirectiveApplications?.toString()).toMatchString(`@listSize(assumedSize: 2000, requireOneSlicingArgument: false)`);
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
      const costDirectiveApplications = fieldWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(costDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 5)`);

      const argCostDirectiveApplications = argumentWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(argCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 10)`);

      const enumCostDirectiveApplications = enumWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(enumCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 15)`);

      const listSizeDirectiveApplications = fieldWithListSize(result)?.appliedDirectivesOf('renamedListSize');
      expect(listSizeDirectiveApplications?.toString()).toMatchString(`@renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)`);
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

    const expectedSchema = `
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithCost: Int @shareable @federation__cost(weight: 10)
      }
    `;
    // Even though different costs went in, the arguments are merged by taking the max weight.
    // This means the extracted costs for the shared field have the same weight on the way out.
    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(expectedSchema);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(expectedSchema);
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

    const expectedSubgraph = `
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type Query {
        sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 20, requireOneSlicingArgument: true)
      }
    `;
    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(expectedSubgraph);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(expectedSubgraph);
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

    const expectedSubgraph = `
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
    `;
    expect(supergraph.subgraphs().get(subgraphA.name)?.toString()).toMatchString(expectedSubgraph);
    expect(supergraph.subgraphs().get(subgraphB.name)?.toString()).toMatchString(expectedSubgraph);
  });
});
