import { composeServices } from '../../../compose';
import { keyFieldsSelectInvalidType as validateKeyFieldsSelectInvalidType } from '../';
import {
  gql,
  graphqlErrorSerializer,
} from 'apollo-federation-integration-testsuite';
import { assertCompositionSuccess } from '../../../utils';

expect.addSnapshotSerializer(graphqlErrorSerializer);

describe('keyFieldsSelectInvalidType', () => {
  it('returns no warnings with proper @key usage', () => {
    const serviceA = {
      // FIXME: add second key "upc" when duplicate directives are supported
      // i.e. @key(fields: "sku") @key(fields: "upc")
      typeDefs: gql`
        type Product @key(fields: "sku") {
          sku: String!
          upc: String!
          color: Color!
        }

        type Color {
          id: ID!
          value: String!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          sku: String! @external
          price: Int! @requires(fields: "sku")
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const compositionResult = composeServices(serviceList);
    assertCompositionSuccess(compositionResult);
    const { schema } = compositionResult;

    const warnings = validateKeyFieldsSelectInvalidType({
      schema,
      serviceList,
    });
    expect(warnings).toHaveLength(0);
  });

  it('warns if @key references fields of an interface type', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "featuredItem") {
          featuredItem: Node!
          sku: String!
        }

        interface Node {
          id: ID!
        }
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          sku: String! @external
          price: Int! @requires(fields: "sku")
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const compositionResult = composeServices(serviceList);
    assertCompositionSuccess(compositionResult);
    const { schema } = compositionResult;

    const warnings = validateKeyFieldsSelectInvalidType({
      schema,
      serviceList,
    });
    expect(warnings).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "KEY_FIELDS_SELECT_INVALID_TYPE",
          "locations": Array [
            Object {
              "column": 27,
              "line": 2,
            },
          ],
          "message": "[serviceA] Product -> A @key selects Product.featuredItem, which is an interface type. Keys cannot select interfaces.",
        },
      ]
    `);
  });

  it('warns if @key references fields of a union type', () => {
    const serviceA = {
      typeDefs: gql`
        type Product @key(fields: "price") {
          sku: String!
          price: Numeric!
        }

        union Numeric = Float | Int
      `,
      name: 'serviceA',
    };

    const serviceB = {
      typeDefs: gql`
        extend type Product {
          sku: String! @external
          name: String!
        }
      `,
      name: 'serviceB',
    };

    const serviceList = [serviceA, serviceB];
    const compositionResult = composeServices(serviceList);
    assertCompositionSuccess(compositionResult);
    const { schema } = compositionResult;

    const warnings = validateKeyFieldsSelectInvalidType({
      schema,
      serviceList,
    });
    expect(warnings).toMatchInlineSnapshot(`
      Array [
        Object {
          "code": "KEY_FIELDS_SELECT_INVALID_TYPE",
          "locations": Array [
            Object {
              "column": 27,
              "line": 2,
            },
          ],
          "message": "[serviceA] Product -> A @key selects Product.price, which is a union type. Keys cannot select union types.",
        },
      ]
    `);
  });
});
