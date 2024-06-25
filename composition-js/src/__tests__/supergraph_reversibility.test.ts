import { assertCompositionSuccess, composeAsFed2Subgraphs } from "./testHelper";
import gql from 'graphql-tag';
import { asFed2SubgraphDocument, buildSubgraph, ServiceDefinition, Supergraph } from "@apollo/federation-internals";
import { composeServices } from "../compose";

function composeAndTestReversibility(subgraphs: ServiceDefinition[]) {
  const result = composeAsFed2Subgraphs(subgraphs);
  assertCompositionSuccess(result);

  const extracted = Supergraph.build(result.supergraphSdl).subgraphs();
  for (const expectedSubgraph of subgraphs) {
    const actual = extracted.get(expectedSubgraph.name)!;
    // Note: the subgraph extracted from the supergraph are created with their `@link` on the schema definition, not as an extension (no
    // strong reason for that, it's how the code was written), so let's match that so our follwoing `toMatchSubgraph` don't fail for that.
    const expected = buildSubgraph(expectedSubgraph.name, '', asFed2SubgraphDocument(expectedSubgraph.typeDefs, { addAsSchemaExtension: false }));
    expect(actual).toMatchSubgraph(expected);
  }
}

it('preserves the source of union members', () => {
  const s1 = {
    typeDefs: gql`
      type Query {
        uFromS1: U
      }

      union U = A | B

      type A {
        a: Int
      }

      type B {
        b: Int @shareable
      }
    `,
    name: 'S1',
  };

  const s2 = {
    typeDefs: gql`
      type Query {
        uFromS2: U
      }

      union U = B | C

      type B {
        b: Int @shareable
      }

      type C {
        c: Int
      }
    `,
    name: 'S2',
  };

  composeAndTestReversibility([s1, s2]);
});

it('preserves the source of enum values', () => {
  const s1 = {
    typeDefs: gql`
      type Query {
        eFromS1: E
      }

      enum E {
        A,
        B
      }
    `,
    name: 'S1',
  };

  const s2 = {
    typeDefs: gql`
      type Query {
        eFromS2: E
      }

      enum E {
        B,
        C
      }
    `,
    name: 'S2',
  };

  composeAndTestReversibility([s1, s2]);
});

describe('@interfaceObject', () => {
  it('correctly extract external fields of concrete type only provided by an @interfaceObject', () => {
    const s1 = {
      typeDefs: gql`
        type Query {
          iFromS1: I
        }

        interface I @key(fields: "id") {
          id: ID!
          x: Int
        }

        type T implements I @key(fields: "id") {
          id: ID!
          x: Int @external
          y: Int @requires(fields: "x")
        }
      `,
      name: 'S1',
    };

    const s2 = {
      typeDefs: gql`
        type Query {
          iFromS2: I
        }

        type I @interfaceObject @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
      name: 'S2',
    };

    composeAndTestReversibility([s1, s2]);
  });
});


describe('demand control directives', () => {
  it('extracts @cost from the supergraph', () => {
    const before = gql`
      type Query {
        fieldWithCost: Int @cost(weight: "5.0")
      }
    `;
    const after = gql`
      type Query {
        fieldWithCost: Int @federation__cost(weight: "5.0")
      }
    `;

    const result = composeAsFed2Subgraphs([{ name: 'my-subgraph', typeDefs: before }]);
    assertCompositionSuccess(result);

    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get('my-subgraph');
    const expected = buildSubgraph('my-subgraph', '', asFed2SubgraphDocument(after, { addAsSchemaExtension: false, includeAllImports: false }));

    expect(extracted?.toString()).toEqual(expected.toString());
    // expect(extracted).toMatchSubgraph(expected);
  });

  it('extracts @listSize from the supergraph', () => {
    const before = gql`
      type Query {
        bigList: [String!] @listSize(assumedSize: 2000, requireOneSlicingArgument: false)
      }
    `;
    const after = gql`
      type Query {
        bigList: [String!] @federation__listSize(assumedSize: 2000, requireOneSlicingArgument: false)
      }
    `;

    const result = composeAsFed2Subgraphs([{ name: 'my-subgraph', typeDefs: before }]);
    assertCompositionSuccess(result);

    const extracted = Supergraph.build(result.supergraphSdl).subgraphs().get('my-subgraph');
    const expected = buildSubgraph('my-subgraph', '', asFed2SubgraphDocument(after, { addAsSchemaExtension: false, includeAllImports: false }));

    expect(extracted).toMatchSubgraph(expected);
  });

  it('extracts the correct @cost for different subgraphs with @shareable fields', () => {
    // We need to force the link import from the cost spec instead of the federation spec
    // because the use of join directive is driven by the url from which the directive is imported
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

    // Since we've already invoked `asFed2SubgraphDocument`, we use `composeServices` directly
    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);
    // TODO: expect(result.hints.length).toBe(0);
    const supergraph = Supergraph.build(result.supergraphSdl);

    const expectedSubgraphA = buildSubgraph(
      'subgraph-a',
      '',
      asFed2SubgraphDocument(
        gql`
          type Query {
            sharedWithCost: Int @shareable @federation__cost(weight: "5.0")
          }
        `,
        { addAsSchemaExtension: false, includeAllImports: false },
      ),
    );
    const expectedSubgraphB = buildSubgraph(
      'subgraph-b',
      '',
      asFed2SubgraphDocument(
        gql`
          type Query {
            sharedWithCost: Int @shareable @federation__cost(weight: "10.0")
          }
        `,
        { addAsSchemaExtension: false, includeAllImports: false },
      ),
    );

    const extractedSubgraphA = supergraph.subgraphs().get('subgraph-a');
    expect(extractedSubgraphA?.toString()).toEqual(expectedSubgraphA.toString());
    // expect(extractedSubgraphA).toMatchSubgraph(expectedSubgraphA);

    const extractedSubgraphB = supergraph.subgraphs().get('subgraph-b');
    expect(extractedSubgraphB?.toString()).toEqual(expectedSubgraphB.toString());
    // expect(extractedSubgraphB).toMatchSubgraph(expectedSubgraphB);
  });

  it('extracts the correct @listSize for different subgraphs with @shareable fields', () => {
    // We need to force the link import from the listSize spec instead of the federation spec
    // because the use of join directive is driven by the url from which the directive is imported
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

    // Since we've already invoked `asFed2SubgraphDocument`, we use `composeServices` directly
    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);
    // TODO: expect(result.hints.length).toBe(0);
    const supergraph = Supergraph.build(result.supergraphSdl);

    const expectedSubgraphA = buildSubgraph(
      'subgraph-a',
      '',
      asFed2SubgraphDocument(
        gql`
          type Query {
            sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 10)
          }
        `,
        { addAsSchemaExtension: false, includeAllImports: false },
      ),
    );
    const expectedSubgraphB = buildSubgraph(
      'subgraph-b',
      '',
      asFed2SubgraphDocument(
        gql`
          type Query {
            sharedWithListSize: [Int] @shareable @federation__listSize(assumedSize: 20)
          }
        `,
        { addAsSchemaExtension: false, includeAllImports: false },
      ),
    );

    const extractedSubgraphA = supergraph.subgraphs().get('subgraph-a');
    expect(extractedSubgraphA?.toString()).toEqual(expectedSubgraphA.toString());
    // expect(extractedSubgraphA).toMatchSubgraph(expectedSubgraphA);

    const extractedSubgraphB = supergraph.subgraphs().get('subgraph-b');
    expect(extractedSubgraphB?.toString()).toEqual(expectedSubgraphB.toString());
    // expect(extractedSubgraphB).toMatchSubgraph(expectedSubgraphB);
  });
});
