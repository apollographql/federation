import { buildSchema, extractSubgraphsFromSupergraph, FEDERATION2_LINK_WTH_FULL_IMPORTS, printSchema, Schema, SubgraphASTNode, Subgraphs } from '@apollo/federation-internals';
import { CompositionResult, composeServices, CompositionSuccess } from '../compose';
import gql from 'graphql-tag';
import './matchers';

function assertCompositionSuccess(r: CompositionResult): asserts r is CompositionSuccess {
  if (r.errors) {
    throw new Error(`Expected composition to succeed but got errors:\n${r.errors.join('\n\n')}`);
  }
}

function errors(r: CompositionResult): [string, string][] {
  return r.errors?.map(e => [e.extensions.code as string, e.message]) ?? [];
}

// Returns [the supergraph schema, its api schema, the extracted subgraphs]
function schemas(result: CompositionSuccess): [Schema, Schema, Subgraphs] {
  // Note that we could user `result.schema`, but reparsing to ensure we don't lose anything with printing/parsing.
  const schema = buildSchema(result.supergraphSdl);
  expect(schema.isCoreSchema()).toBeTruthy();
  return [schema, schema.toAPISchema(), extractSubgraphsFromSupergraph(schema)];
}

describe('basic type extensions', () => {
  it('works when extension subgraph is second', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          products: [Product!]
        }

        type Product @key(fields: "sku") {
          sku: String!
          name: String!
        }
      `,
      name: 'subgraphA',
    };

    // Note that putting @external on the key is now frown upon, but putting it there for a fed1-compatible example.
    const subgraphB = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String! @external
          price: Int!
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api, subgraphs] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Product {
        sku: String!
        name: String!
        price: Int!
      }

      type Query {
        products: [Product!]
      }
    `);

    expect(subgraphs.get('subgraphA')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    // Note that the "upgrade" of fed1 schema removes extensions amongst other things, and
    // the extract subgraphs are essentially the upgraded subgraphs, so it is normal it isn't
    // an extension.
    expect(subgraphs.get('subgraphB')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        price: Int!
      }
    `);
  });

  it('works when extension subgraph is first', () => {
    // Note that putting @external on the key is now frown upon, but putting it there for a fed1-compatible example.
    const subgraphA = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String! @external
          price: Int!
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          products: [Product!]
        }

        type Product @key(fields: "sku") {
          sku: String!
          name: String!
        }
      `,
      name: 'subgraphB',
    };


    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api, subgraphs] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Product {
        sku: String!
        price: Int!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    // Same remark than in prevoius test
    expect(subgraphs.get('subgraphA')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        price: Int!
      }
    `);

    expect(subgraphs.get('subgraphB')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);
  });

  it('works with multiple extensions on the same type', () => {
    const subgraphA = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String!
          price: Int!
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          products: [Product!]
        }

        type Product {
          sku: String!
          name: String!
        }
      `,
      name: 'subgraphB',
    };

    const subgraphC = {
      typeDefs: gql`
        extend type Product @key(fields: "sku") {
          sku: String!
          color: String!
        }
      `,
      name: 'subgraphC',
    };

    const result = composeServices([subgraphA, subgraphB, subgraphC]);
    assertCompositionSuccess(result);

    const [_, api, subgraphs] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Product {
        sku: String!
        price: Int!
        name: String!
        color: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    expect(subgraphs.get('subgraphA')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        price: Int!
      }
    `);

    expect(subgraphs.get('subgraphB')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    expect(subgraphs.get('subgraphC')!.toString()).toMatchString(`
      schema
        @link(url: "https://specs.apollo.dev/link/v1.0")
        ${FEDERATION2_LINK_WTH_FULL_IMPORTS}
      {
        query: Query
      }

      type Product
        @key(fields: "sku")
      {
        sku: String!
        color: String!
      }
    `);
  });
});

describe('validations', () => {
  it('errors if a type extension has no definition counterpart', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          q: String
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        extend type A @key(fields: "k") {
          k: ID!
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);

    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      ['EXTENSION_WITH_NO_BASE', '[subgraphB] Type "A" is an extension type, but there is no type definition for "A" in any subgraph.'],
    ]);
  });

  it('include pointers to fed1 schema in errors', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a: A
        }

        scalar A
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type A @key(fields: "f") {
          f: String
        }
      `,
      name: 'subgraphB',
    };

    const subgraphC = {
      typeDefs: gql`
        extend type A @key(fields: "f") {
          f: String
        }
      `,
      name: 'subgraphC',
    };

    const result = composeServices([subgraphA, subgraphB, subgraphC]);

    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      ['TYPE_KIND_MISMATCH', 'Type "A" has mismatched kind: it is defined as Scalar Type in subgraph "subgraphA" but Object Type in subgraphs "subgraphB" and "subgraphC"'],
    ]);

    // The migration to fed2 removes types extensions, so we can double check that the error correctly points to the original schema
    // by looking if the 3rd AST of the error, the one pointing to "subgraphC", points to a type extension or not.
    const err = result.errors![0];
    expect(err.nodes).toHaveLength(3);
    const subgraphCAST = err.nodes![2] as SubgraphASTNode;
    expect(subgraphCAST.subgraph).toBe("subgraphC");
    expect(subgraphCAST.kind).toBe("ObjectTypeExtension");
  });
});

describe('shareable', () => {
  it('handles provides', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a1: A
        }

        type A @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          a2: A @provides(fields: "x")
        }

        extend type A @key(fields: "id") {
          id: ID! @external
          x: Int @external
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type A {
        id: ID!
        x: Int
      }

      type Query {
        a1: A
        a2: A
      }
    `);
  });

  it('handles provides with mixed fed1/fed2 schema (when the provides is in the fed2 schema)', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a1: A
        }

        type A @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@provides", "@external"])

        type Query {
          a2: A @provides(fields: "x")
        }

        type A @key(fields: "id") {
          id: ID!
          x: Int @external
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type A {
        id: ID!
        x: Int
      }

      type Query {
        a1: A
        a2: A
      }
    `);
  });

  it('handles provides with mixed fed1/fed2 schema (when the provides is in the fed1 schema)', () => {
    const subgraphA = {
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

        type Query {
          a1: A
        }

        type A @key(fields: "id") {
          id: ID!
          x: Int @shareable
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          a2: A @provides(fields: "x")
        }

        extend type A @key(fields: "id") {
          id: ID! @external
          x: Int @external
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type A {
        id: ID!
        x: Int
      }

      type Query {
        a1: A
        a2: A
      }
    `);
  });

  it('errors on provides with non-shared field with mixed fed1/fed2 schema', () => {
    const subgraphA = {
      typeDefs: gql`
        extend schema @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key"])

        type Query {
          a1: A
        }

        type A @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          a2: A @provides(fields: "x")
        }

        extend type A @key(fields: "id") {
          id: ID! @external
          x: Int @external
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      ['INVALID_FIELD_SHARING', 'Non-shareable field "A.x" is resolved from multiple subgraphs: it is resolved from subgraphs "subgraphA" and "subgraphB" and defined as non-shareable in subgraph "subgraphA"']
    ]);
  });

  it('makes value types shareable', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a1: A
        }

        type A {
          x: Int
          y: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          a2: A
        }

        type A {
          x: Int
          y: Int
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type A {
        x: Int
        y: Int
      }

      type Query {
        a1: A
        a2: A
      }
    `);
  });
});
