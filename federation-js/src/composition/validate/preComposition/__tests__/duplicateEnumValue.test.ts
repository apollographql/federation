import { duplicateEnumValue as validateDuplicateEnumValue } from '../';
import {
  gql,
  graphqlErrorSerializer,
} from 'apollo-federation-integration-testsuite';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('duplicateEnumValue', () => {
  it('does not error with proper enum usage', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "color { id value }") {
          sku: String!
          upc: String!
          color: Color!
        }

        type Color {
          id: ID!
          value: String!
        }

        enum ProductType {
          BOOK
          FURNITURE
        }

        extend enum ProductType {
          DIGITAL
        }
      `,
      name: 'serviceA',
    };

    const warnings = validateDuplicateEnumValue(serviceA);
    expect(warnings).toEqual([]);
  });
  it('errors when there are duplicate enum values in a single service', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "color { id value }") {
          sku: String!
          upc: String!
          color: Color!
        }

        type Color {
          id: ID!
          value: String!
        }

        enum ProductType {
          BOOK
          FURNITURE
        }

        extend enum ProductType {
          DIGITAL
          BOOK
        }
      `,
      name: 'serviceA',
    };

    const warnings = validateDuplicateEnumValue(serviceA);
    expect(warnings).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "DUPLICATE_ENUM_VALUE",
          "locations": Array [
            Object {
              "column": 3,
              "line": 20,
            },
          ],
          "message": "[serviceA] ProductType.BOOK -> The enum, \`ProductType\` has multiple definitions of the \`BOOK\` value.",
        },
      ]
    `);
  });
});
