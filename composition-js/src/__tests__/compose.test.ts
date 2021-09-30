import { buildSchema, extractSubgraphsFromSupergraph, printSchema, Schema, Subgraphs } from '@apollo/core';
import { CompositionResult, composeServices, CompositionSuccess } from '../compose';
import gql from 'graphql-tag';

// TODO: this is the same than in definition.test.ts. Would be nice to extract somewhere (tough maybe there is
// a better, more jest-native, way to do this).
declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchString(actual: string): R;
    }
  }
}

function deIndent(str: string): string {
  // Strip leading \n
  str = str.slice(str.search(/[^\n]/));
  // Strip trailing \n or space
  while (str.charAt(str.length - 1) === '\n' || str.charAt(str.length - 1) === ' ') {
    str = str.slice(0, str.length - 1);
  }
  const indent = str.search(/[^ ]/);
  return str
    .split('\n')
    .map(line => line.slice(indent))
    .join('\n');
}

expect.extend({
  toMatchString(expected: string, received: string) {
    received = deIndent(received);
    const pass = this.equals(expected, received);
    const message = pass
      ? () => this.utils.matcherHint('toMatchString', undefined, undefined)
          + '\n\n'
          + `Expected: not ${this.printExpected(expected)}`
      : () => {
        return (
          this.utils.matcherHint('toMatchString', undefined, undefined,)
          + '\n\n'
          + this.utils.printDiffOrStringify(expected, received, 'Expected', 'Received', true));
      };
    return {received, expected, message, name: 'toMatchString', pass};
  }
});

function assertCompositionSuccess(r: CompositionResult): asserts r is CompositionSuccess {
  if (r.errors) {
    throw new Error(`Expected composition to succeed but got errors:\n${r.errors.join('\n\n')}`);
  }
}

// Returns [the supergraph schema, its api schema, the extracted subgraphs]
function schemas(result: CompositionSuccess): [Schema, Schema, Subgraphs] {
  // Note that we could user `result.schema`, but reparsing to ensure we don't lose anything with printing/parsing.
  const schema = buildSchema(result.supergraphSdl);
  expect(schema.isCoreSchema()).toBeTruthy();
  return [schema, schema.toAPISchema(), extractSubgraphsFromSupergraph(schema)];
}

describe('composition', () => {
  it('generates a valid supergraph', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      url: 'https://Subgraph1',
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      url: 'https://Subgraph2',
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
          b: String
        }
      `
    }

    const result = composeServices([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    expect(result.supergraphSdl).toMatchString(`
      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/join/v0.2", for: EXECUTION)
      {
        query: Query
      }

      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @join__field(graph: join__Graph!, requires: join__FieldSet, provides: join__FieldSet) repeatable on FIELD_DEFINITION | INPUT_FIELD_DEFINITION

      directive @join__graph(name: String!, url: String!) on ENUM_VALUE

      directive @join__implements(graph: join__Graph!, interface: String!) repeatable on OBJECT | INTERFACE

      directive @join__type(graph: join__Graph!, key: join__FieldSet, extension: Boolean! = false) repeatable on OBJECT | INTERFACE | UNION | ENUM | INPUT_OBJECT | SCALAR

      enum core__Purpose {
        """
        \`SECURITY\` features provide metadata necessary to securely resolve fields.
        """
        SECURITY

        """
        \`EXECUTION\` features provide metadata necessary for operation execution.
        """
        EXECUTION
      }

      scalar join__FieldSet

      enum join__Graph {
        SUBGRAPH1 @join__graph(name: "Subgraph1", url: "https://Subgraph1")
        SUBGRAPH2 @join__graph(name: "Subgraph2", url: "https://Subgraph2")
      }

      type Query
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        t: T @join__field(graph: SUBGRAPH1)
      }

      type T
        @join__type(graph: SUBGRAPH1, key: "k")
        @join__type(graph: SUBGRAPH2, key: "k")
      {
        k: ID
        a: Int @join__field(graph: SUBGRAPH2)
        b: String @join__field(graph: SUBGRAPH2)
      }
    `);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Query {
        t: T
      }

      type T {
        k: ID
        a: Int
        b: String
      }
    `);
  })

  it('preserves descriptions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      typeDefs: gql`
        "A cool schema"
        schema {
          query: Query
        }

        """
        Available queries
        Not much yet
        """
        type Query {
          "Returns tea"
          t(
            "An argument that is very important"
            x: String!
          ): String
        }
      `
    }

    const subgraph2 = {
      name: 'Subgraph2',
      typeDefs: gql`
        "An enum"
        enum E {
          "The A value"
          A
          "The B value"
          B
        }
      `
    }

    const result = composeServices([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      """A cool schema"""
      schema {
        query: Query
      }

      """An enum"""
      enum E {
        """The A value"""
        A

        """The B value"""
        B
      }

      """
      Available queries
      Not much yet
      """
      type Query {
        """Returns tea"""
        t(
          """An argument that is very important"""
          x: String!
        ): String
      }
    `);
  })

  it('include types from different subgraphs', () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          products: [Product!]
        }

        type Product {
          sku: String!
          name: String!
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type User {
          name: String
          email: String!
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
      }

      type Query {
        products: [Product!]
      }

      type User {
        name: String
        email: String!
      }
    `);

    expect(printSchema(subgraphs.get('subgraphA')!.schema)).toMatchString(`
      type Product {
        sku: String!
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    expect(printSchema(subgraphs.get('subgraphB')!.schema)).toMatchString(`
      type User {
        name: String
        email: String!
      }
    `);
  });

  it("doesn't leave federation directives in the final schema", () => {
    const subgraphA = {
      typeDefs: gql`
        type Query {
          products: [Product!] @provides(fields: "name")
        }

        type Product @key(fields: "sku") {
          sku: String!
          name: String! @external
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
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
        name: String!
      }

      type Query {
        products: [Product!]
      }
    `);

    // Of course, the federation directives should be rebuilt in the extracted subgraphs.
    expect(printSchema(subgraphs.get('subgraphA')!.schema)).toMatchString(`
      type Product
        @key(fields: "sku")
      {
        sku: String!
        name: String! @external
      }

      type Query {
        products: [Product!] @provides(fields: "name")
      }
    `);

    expect(printSchema(subgraphs.get('subgraphB')!.schema)).toMatchString(`
      type Product
        @key(fields: "sku")
      {
        sku: String!
        name: String!
      }
    `);
  });

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

      expect(printSchema(subgraphs.get('subgraphA')!.schema)).toMatchString(`
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

      // Note that while this is a weird-looking schema, this is what is extract from
      // the supergraph as we don't preserve enough information to say that the whole type
      // was defined as an extension, only that the key part on an extension (the reason
      // being that it's the only thing we truly need as the handling of @external on
      // key fields of extension differs from that of non-extension, but nothing else
      // does).
      expect(printSchema(subgraphs.get('subgraphB')!.schema)).toMatchString(`
        type Product {
          price: Int!
          sku: String!
        }

        extend type Product
          @key(fields: "sku")
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
      expect(printSchema(subgraphs.get('subgraphA')!.schema)).toMatchString(`
        type Product {
          price: Int!
          sku: String!
        }

        extend type Product
          @key(fields: "sku")
      `);

      expect(printSchema(subgraphs.get('subgraphB')!.schema)).toMatchString(`
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

      expect(printSchema(subgraphs.get('subgraphA')!.schema)).toMatchString(`
        type Product {
          sku: String!
          price: Int!
        }

        extend type Product
          @key(fields: "sku")
      `);

      expect(printSchema(subgraphs.get('subgraphB')!.schema)).toMatchString(`
        type Product {
          sku: String!
          name: String!
        }

        type Query {
          products: [Product!]
        }
      `);

      expect(printSchema(subgraphs.get('subgraphC')!.schema)).toMatchString(`
        type Product {
          sku: String!
          color: String!
        }

        extend type Product
          @key(fields: "sku")
      `);
    });
  });
});
