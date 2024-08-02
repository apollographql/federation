import {
  ArgumentDefinition,
  asFed2SubgraphDocument,
  EnumType,
  FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS,
  FieldDefinition,
  InputObjectType,
  ObjectType,
  ScalarType,
  ServiceDefinition,
  Supergraph
} from '@apollo/federation-internals';
import { composeServices, CompositionResult } from '../compose';
import gql from 'graphql-tag';
import { assertCompositionSuccess, errors } from "./testHelper";

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

    scalar ExpensiveInt @cost(weight: 30)

    type ExpensiveObject @cost(weight: 40) {
      id: ID
    }

    type Query {
      fieldWithCost: Int @cost(weight: 5)
      argWithCost(arg: Int @cost(weight: 10)): Int
      enumWithCost: AorB
      inputWithCost(someInput: InputTypeWithCost): Int
      scalarWithCost: ExpensiveInt
      objectWithCost: ExpensiveObject
    }
  `),
};

const subgraphWithListSize = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])

    type HasInts {
      ints: [Int!]
    }

    type Query {
      fieldWithListSize: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
      fieldWithDynamicListSize: HasInts @listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)
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

    scalar ExpensiveInt @renamedCost(weight: 30)

    type ExpensiveObject @renamedCost(weight: 40) {
      id: ID
    }

    type Query {
      fieldWithCost: Int @renamedCost(weight: 5)
      argWithCost(arg: Int @renamedCost(weight: 10)): Int
      enumWithCost: AorB
      inputWithCost(someInput: InputTypeWithCost): Int
      scalarWithCost: ExpensiveInt
      objectWithCost: ExpensiveObject
    }
  `),
};

const subgraphWithRenamedListSize = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(gql`
    extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: [{ name: "@listSize", as: "@renamedListSize" }])

    type HasInts {
      ints: [Int!] @shareable
    }

    type Query {
      fieldWithListSize: [String!] @renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)
      fieldWithDynamicListSize: HasInts @renamedListSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)
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

      scalar ExpensiveInt @cost(weight: 30)

      type ExpensiveObject @cost(weight: 40) {
        id: ID
      }

      type Query {
        fieldWithCost: Int @cost(weight: 5)
        argWithCost(arg: Int @cost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
        scalarWithCost: ExpensiveInt
        objectWithCost: ExpensiveObject
      }
    `,
    { includeAllImports: true },
  ),
};

const subgraphWithListSizeFromFederationSpec = {
  name: 'subgraphWithListSize',
  typeDefs: asFed2SubgraphDocument(
    gql`
      type HasInts {
        ints: [Int!]
      }

      type Query {
        fieldWithListSize: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
        fieldWithDynamicListSize: HasInts @listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)
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

      scalar ExpensiveInt @renamedCost(weight: 30)

      type ExpensiveObject @renamedCost(weight: 40) {
        id: ID
      }

      type Query {
        fieldWithCost: Int @renamedCost(weight: 5)
        argWithCost(arg: Int @renamedCost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
        scalarWithCost: ExpensiveInt
        objectWithCost: ExpensiveObject
      }
    `,
};

const subgraphWithRenamedListSizeFromFederationSpec = {
  name: 'subgraphWithListSize',
  typeDefs:
    gql`
      extend schema @link(url: "https://specs.apollo.dev/federation/v2.9", import: [{ name: "@listSize", as: "@renamedListSize" }])

      type HasInts {
        ints: [Int!]
      }

      type Query {
        fieldWithListSize: [String!] @renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)
        fieldWithDynamicListSize: HasInts @renamedListSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)
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

// Used to test @cost applications on SCALAR
function scalarWithCost(result: CompositionResult): ScalarType | undefined {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('scalarWithCost')
    ?.type as ScalarType
}

// Used to test @cost applications on OBJECT
function objectWithCost(result: CompositionResult): ObjectType | undefined {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('objectWithCost')
    ?.type as ObjectType
}

// Used to test @listSize applications on FIELD_DEFINITION with a statically assumed size
function fieldWithListSize(result: CompositionResult): FieldDefinition<ObjectType> | undefined  {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('fieldWithListSize');
}

// Used to test @listSize applications on FIELD_DEFINITION with dynamic size arguments
function fieldWithDynamicListSize(result: CompositionResult): FieldDefinition<ObjectType> | undefined  {
  return result
    .schema
    ?.schemaDefinition
    .rootType('query')
    ?.field('fieldWithDynamicListSize');
}

describe('demand control directive composition', () => {
  it.each([
    [subgraphWithCost, subgraphWithListSize],
    [subgraphWithCostFromFederationSpec, subgraphWithListSizeFromFederationSpec],
  ])('propagates @cost and @listSize to the supergraph', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
    const result = composeServices([costSubgraph, listSizeSubgraph]);
    assertCompositionSuccess(result);
    expect(result.hints).toEqual([]);

    const costDirectiveApplications = fieldWithCost(result)?.appliedDirectivesOf('cost');
    expect(costDirectiveApplications?.toString()).toMatchString(`@cost(weight: 5)`);

    const argCostDirectiveApplications = argumentWithCost(result)?.appliedDirectivesOf('cost');
    expect(argCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 10)`);

    const enumCostDirectiveApplications = enumWithCost(result)?.appliedDirectivesOf('cost');
    expect(enumCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 15)`);

    const inputCostDirectiveApplications = inputWithCost(result)?.field('somethingWithCost')?.appliedDirectivesOf('cost');
    expect(inputCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 20)`);

    const scalarCostDirectiveApplications = scalarWithCost(result)?.appliedDirectivesOf('cost');
    expect(scalarCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 30)`);

    const objectCostDirectiveApplications = objectWithCost(result)?.appliedDirectivesOf('cost');
    expect(objectCostDirectiveApplications?.toString()).toMatchString(`@cost(weight: 40)`);

    const listSizeDirectiveApplications = fieldWithListSize(result)?.appliedDirectivesOf('listSize');
    expect(listSizeDirectiveApplications?.toString()).toMatchString(`@listSize(assumedSize: 2000, requireOneSlicingArgument: false)`);

    const dynamicListSizeDirectiveApplications = fieldWithDynamicListSize(result)?.appliedDirectivesOf('listSize');
    expect(dynamicListSizeDirectiveApplications?.toString()).toMatchString(`@listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)`);
  });

  describe('when renamed', () => {
    it.each([
      [subgraphWithRenamedCost, subgraphWithRenamedListSize],
      [subgraphWithRenamedCostFromFederationSpec, subgraphWithRenamedListSizeFromFederationSpec]
    ])('propagates the renamed @cost and @listSize to the supergraph', (costSubgraph: ServiceDefinition, listSizeSubgraph: ServiceDefinition) => {
      const result = composeServices([costSubgraph, listSizeSubgraph]);
      assertCompositionSuccess(result);
      expect(result.hints).toEqual([]);

      // Ensure the new directive names are specified in the supergraph so we can use them during extraction
      const links = result.schema.schemaDefinition.appliedDirectivesOf("link");
      const costLinks = links.filter((link) => link.arguments().url === "https://specs.apollo.dev/cost/v0.1");
      expect(costLinks.length).toBe(1);
      expect(costLinks[0].toString()).toEqual(`@link(url: "https://specs.apollo.dev/cost/v0.1", import: [{name: "@cost", as: "@renamedCost"}, {name: "@listSize", as: "@renamedListSize"}])`);

      // Ensure the directives are applied to the expected fields with the new names
      const costDirectiveApplications = fieldWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(costDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 5)`);

      const argCostDirectiveApplications = argumentWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(argCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 10)`);

      const enumCostDirectiveApplications = enumWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(enumCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 15)`);

      const inputCostDirectiveApplications = inputWithCost(result)?.field('somethingWithCost')?.appliedDirectivesOf('renamedCost');
      expect(inputCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 20)`);

      const scalarCostDirectiveApplications = scalarWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(scalarCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 30)`);

      const objectCostDirectiveApplications = objectWithCost(result)?.appliedDirectivesOf('renamedCost');
      expect(objectCostDirectiveApplications?.toString()).toMatchString(`@renamedCost(weight: 40)`);

      const listSizeDirectiveApplications = fieldWithListSize(result)?.appliedDirectivesOf('renamedListSize');
      expect(listSizeDirectiveApplications?.toString()).toMatchString(`@renamedListSize(assumedSize: 2000, requireOneSlicingArgument: false)`);

      const dynamicListSizeDirectiveApplications = fieldWithDynamicListSize(result)?.appliedDirectivesOf('renamedListSize');
      expect(dynamicListSizeDirectiveApplications?.toString()).toMatchString(`@renamedListSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)`);
    });
  });

  describe('when renamed in one subgraph but not the other', () => {
    it('does not compose', () => {
      const subgraphWithDefaultName = {
        name: 'subgraphWithDefaultName',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@cost"])
      
          type Query {
            field1: Int @cost(weight: 5)
          }
        `),
      };
      const subgraphWithDifferentName = {
        name: 'subgraphWithDifferentName',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: [{ name: "@cost", as: "@renamedCost" }])
      
          type Query {
            field2: Int @renamedCost(weight: 10)
          }
        `),
      };

      const result = composeServices([subgraphWithDefaultName, subgraphWithDifferentName]);
      expect(errors(result)).toEqual([
        [
          "LINK_IMPORT_NAME_MISMATCH",
          `The "@cost" directive (from https://specs.apollo.dev/cost/v0.1) is imported with mismatched name between subgraphs: it is imported as "@renamedCost" in subgraph "subgraphWithDifferentName" but "@cost" in subgraph "subgraphWithDefaultName"`
        ]
      ]);
    });
  });

  describe('when used on @shareable fields', () => {
    it('hints about merged @cost arguments', () => {
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
      expect(result.hints).toMatchInlineSnapshot(`
        Array [
          CompositionHint {
            "coordinate": undefined,
            "definition": Object {
              "code": "MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS",
              "description": "A non-repeatable directive has been applied to a schema element in different subgraphs with different arguments and the arguments values were merged using the directive configured strategies.",
              "level": Object {
                "name": "INFO",
                "value": 40,
              },
            },
            "element": undefined,
            "message": "Directive @cost is applied to \\"Query.sharedWithCost\\" in multiple subgraphs with different arguments. Merging strategies used by arguments: { \\"weight\\": MAX }",
            "nodes": undefined,
          },
        ]
      `);
    });
  
    it('hints about merged @listSize arguments', () => {
      const subgraphA = {
        name: 'subgraph-a',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])
  
          type Query {
            sharedWithListSize: [Int] @shareable @listSize(assumedSize: 10)
          }
        `)
      };
      const subgraphB = {
        name: 'subgraph-b',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])
  
          type Query {
            sharedWithListSize: [Int] @shareable @listSize(assumedSize: 20)
          }
        `)
      };
  
      const result = composeServices([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
      expect(result.hints).toMatchInlineSnapshot(`
        Array [
          CompositionHint {
            "coordinate": undefined,
            "definition": Object {
              "code": "MERGED_NON_REPEATABLE_DIRECTIVE_ARGUMENTS",
              "description": "A non-repeatable directive has been applied to a schema element in different subgraphs with different arguments and the arguments values were merged using the directive configured strategies.",
              "level": Object {
                "name": "INFO",
                "value": 40,
              },
            },
            "element": undefined,
            "message": "Directive @listSize is applied to \\"Query.sharedWithListSize\\" in multiple subgraphs with different arguments. Merging strategies used by arguments: { \\"assumedSize\\": NULLABLE_MAX, \\"slicingArguments\\": NULLABLE_UNION, \\"sizedFields\\": NULLABLE_UNION, \\"requireOneSlicingArgument\\": NULLABLE_AND }",
            "nodes": undefined,
          },
        ]
      `);
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

      scalar ExpensiveInt
        @federation__cost(weight: 30)

      type ExpensiveObject
        @federation__cost(weight: 40)
      {
        id: ID
      }

      input InputTypeWithCost {
        somethingWithCost: Int @federation__cost(weight: 20)
      }

      type Query {
        fieldWithCost: Int @federation__cost(weight: 5)
        argWithCost(arg: Int @federation__cost(weight: 10)): Int
        enumWithCost: AorB
        inputWithCost(someInput: InputTypeWithCost): Int
        scalarWithCost: ExpensiveInt
        objectWithCost: ExpensiveObject
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
    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get(subgraphWithListSize.name);

    expect(extracted?.toString()).toMatchString(`
      schema
        ${FEDERATION2_LINK_WITH_AUTO_EXPANDED_IMPORTS}
      {
        query: Query
      }

      type HasInts {
        ints: [Int!]
      }

      type Query {
        fieldWithListSize: [String!] @federation__listSize(assumedSize: 2000, requireOneSlicingArgument: false)
        fieldWithDynamicListSize: HasInts @federation__listSize(slicingArguments: ["first"], sizedFields: ["ints"], requireOneSlicingArgument: true)
      }
    `);
  });

  describe('when used on @shareable fields', () => {
    it('extracts @cost using the max weight across subgraphs', () => {
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
  
    it('extracts @listSize using the max assumed size across subgraphs', () => {
      const subgraphA = {
        name: 'subgraph-a',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])
  
          type Query {
            sharedWithListSize: [Int] @shareable @listSize(assumedSize: 10)
          }
        `)
      };
      const subgraphB = {
        name: 'subgraph-b',
        typeDefs: asFed2SubgraphDocument(gql`
          extend schema @link(url: "https://specs.apollo.dev/cost/v0.1", import: ["@listSize"])
  
          type Query {
            sharedWithListSize: [Int] @shareable @listSize(assumedSize: 20)
          }
        `)
      };
  
      const result = composeServices([subgraphA, subgraphB]);
      assertCompositionSuccess(result);
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
  });
});
