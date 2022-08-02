import { buildSchema, extractSubgraphsFromSupergraph, FEDERATION2_LINK_WTH_FULL_IMPORTS, ObjectType, printSchema, Schema, SubgraphASTNode, Subgraphs } from '@apollo/federation-internals';
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
  // Note that we could user `result.schema`, but re-parsing to ensure we don't lose anything with printing/parsing.
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

  it('fragment in @provides', () => {
    const subgraphA = {
      typeDefs: gql`
        interface Fruit {
          id: ID!
        }

        type Apple implements Fruit {
          id: ID!
          keepsTheDoctorAway: Boolean!
        }

        type Payment @key(fields: "id") {
          id: ID!
          fruit: Fruit!
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        interface Fruit {
          id: ID!
        }

        type Apple implements Fruit {
          id: ID!
          keepsTheDoctorAway: Boolean!
        }

        extend type Payment @key(fields: "id") {
          id: ID! @external
          fruit: Fruit! @external
        }

        type Query {
          getFruitPayment: Payment!
            @provides(fields: "fruit { ... on Apple { keepsTheDoctorAway } }")
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [supergraph, api] = schemas(result);
    expect(printSchema(supergraph)).toMatchInlineSnapshot(`
      "schema
        @link(url: \\"https://specs.apollo.dev/link/v1.0\\")
        @link(url: \\"https://specs.apollo.dev/join/v0.2\\", for: EXECUTION)
      {
        query: Query
      }

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet, type: String, external: Boolean, override: String, usedOverridden: Boolean) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false, resolvable: Boolean! = true) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      directive @link(url: String, as: String, for: link__Purpose, import: [link__Import]) repeatable on SCHEMA

      type Apple implements Fruit
        @join__implements(graph: SUBGRAPHA, interface: \\"Fruit\\")
        @join__implements(graph: SUBGRAPHB, interface: \\"Fruit\\")
        @join__type(graph: SUBGRAPHA)
        @join__type(graph: SUBGRAPHB)
      {
        id: ID!
        keepsTheDoctorAway: Boolean!
      }

      interface Fruit
        @join__type(graph: SUBGRAPHA)
        @join__type(graph: SUBGRAPHB)
      {
        id: ID!
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPHA @join__graph(name: \\"subgraphA\\", url: \\"\\")
        SUBGRAPHB @join__graph(name: \\"subgraphB\\", url: \\"\\")
      }

      scalar link__Import

      enum link__Purpose {
        \\"\\"\\"
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        \\"\\"\\"
        SECURITY

        \\"\\"\\"
        \`EXECUTION\` features provide metadata necessary for operation execution.
        \\"\\"\\"
        EXECUTION
      }

      type Payment
        @join__type(graph: SUBGRAPHA, key: \\"id\\")
        @join__type(graph: SUBGRAPHB, key: \\"id\\")
      {
        id: ID!
        fruit: Fruit! @join__field(graph: SUBGRAPHA) @join__field(graph: SUBGRAPHB, external: true)
      }

      type Query
        @join__type(graph: SUBGRAPHA)
        @join__type(graph: SUBGRAPHB)
      {
        getFruitPayment: Payment! @join__field(graph: SUBGRAPHB, provides: \\"fruit { ... on Apple { keepsTheDoctorAway } }\\")
      }"
    `);
    expect(printSchema(api)).toMatchInlineSnapshot(`
      "type Apple implements Fruit {
        id: ID!
        keepsTheDoctorAway: Boolean!
      }

      interface Fruit {
        id: ID!
      }

      type Payment {
        id: ID!
        fruit: Fruit!
      }

      type Query {
        getFruitPayment: Payment!
      }"
    `);
    /*
    Fed1 generated a schema that looked thusly (minus the standard machinery):

    type Apple implements Fruit {
      id: ID!
      keepsTheDoctorAway: Boolean!
    }

    interface Fruit {
      id: ID!
    }

    type Payment
      @join__owner(graph: SUBGRAPH_A)
      @join__type(graph: SUBGRAPH_A, key: "id")
      @join__type(graph: SUBGRAPH_B, key: "id")
    {
      fruit: Fruit! @join__field(graph: SUBGRAPH_A)
      id: ID! @join__field(graph: SUBGRAPH_A)
    }

    type Query {
      getFruitPayment: Payment! @join__field(graph: SUBGRAPH_B, provides: "fruit{...on Apple{keepsTheDoctorAway}}")
    }

    enum join__Graph {
      SUBGRAPH_A @join__graph(name: "subgraph-a" url: "https://subgraph-a/graphql")
      SUBGRAPH_B @join__graph(name: "subgraph-b" url: "https://subgraph-b/graphql")
    }
    */

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

describe('override', () => {
  it('Accepts override if the definition is manually provided', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a: A
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
        type A @key(fields: "id") {
          id: ID!
          x: Int @override(from: "subgraphA")
        }

        directive @override(from: String!) on FIELD_DEFINITION
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    assertCompositionSuccess(result);

    const [supergraph] = schemas(result);
    const typeA = supergraph.type('A') as ObjectType;
    expect(typeA.field('x')?.appliedDirectivesOf('join__field').map((d) => d.toString())).toMatchStringArray([
      '@join__field(graph: SUBGRAPHB, override: "subgraphA")'
    ]);
  });

  it('Errors if @override is used but not defined', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a: A
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
        type A @key(fields: "id") {
          id: ID!
          x: Int @override(from: "subgraphA")
        }
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([[
      'INVALID_GRAPHQL',
      '[subgraphB] Unknown directive "@override". If you meant the "@override" federation 2 directive, note that this schema is a federation 1 schema. To be a federation 2 schema, it needs to @link to the federation specifcation v2.',
    ]]);
  });

  it('Errors is @override is defined but is incompatible', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          a: A
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
        type A @key(fields: "id") {
          id: ID!
          x: Int @override
        }

        directive @override on FIELD_DEFINITION
      `,
      name: 'subgraphB',
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(errors(result)).toStrictEqual([[
      'DIRECTIVE_DEFINITION_INVALID',
      '[subgraphB] Invalid definition for directive \"@override\": missing required argument "from"',
    ]]);
  });
});
