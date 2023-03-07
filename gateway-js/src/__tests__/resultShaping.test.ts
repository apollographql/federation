import { buildSchemaFromAST, parseOperation } from "@apollo/federation-internals"
import { gql } from "apollo-federation-integration-testsuite";
import { computeResponse } from "../resultShaping";

const introspectionHandling = () => null;

describe('gateway post-processing', () => {
  test('filters unqueried fields', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        t: T
        v: Int!
      }

      type T {
        a: Int
        b: String
        c: [C]
        d: Int
      }

      interface C {
        x: Int
        y: Int
      }

      type P1 implements C {
        id: ID!
        x: Int
        y: Int
      }

      type P2 implements C {
        x: Int
        y: Int
        w: Int
        z: Int
      }
    `);

    const input = {
      "t": {
        "a": 0,
        "b": 'testData',
        "c": [{
          __typename: 'P1',
          id: 'foo',
          x: 1,
          y: 2,
        }, {
          __typename: 'P2',
          x: 10,
          y: 20,
          w: 30,
          z: 40,
        }],
        "d": 1,
      },
      "v": 42
    }

    const operation = parseOperation(schema, `
      {
        t {
          a
          c {
            x
            ... on P1 {
              x
              y
            }
            ... on P2 {
              z
            }
          }
        }
      }
    `);

    expect(computeResponse({
      operation,
      input,
      introspectionHandling,
    })).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "t": Object {
            "a": 0,
            "c": Array [
              Object {
                "x": 1,
                "y": 2,
              },
              Object {
                "x": 10,
                "z": 40,
              },
            ],
          },
        },
        "errors": Array [],
      }
    `);
  });

  describe('null propagation for non-nullable types', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        tNullable: T
        tNonNullable: T!
      }

      type T {
        a: Int
        b: Int!
        c: [Int]
        d: [Int]!
        e: [Int!]
        f: [Int!]!
      }
    `);

    const tObj = {
      "a": null,
      "b": null,
      "c": [24, null, 42, null],
      "d": [24, null, 42, null],
      "e": [24, null, 42, null],
      "f": [24, null, 42, null],
    }

    const input = {
      "tNullable": tObj,
      "tNonNullable": tObj,
    }

    test('no propagation on nullable (non-list) type', () => {
      const operation = parseOperation(schema, `
        {
          tNonNullable {
            a
          }
        }
      `);

      expect(computeResponse({
        operation,
        input,
        introspectionHandling,
      })).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "tNonNullable": Object {
              "a": null,
            },
          },
          "errors": Array [],
        }
      `);
    });

    test('propagation on non-nullable (non-list) type', () => {
      const operationNonNullable = parseOperation(schema, `
        {
          tNonNullable {
            b
          }
        }
      `);

      let res = computeResponse({
        operation: operationNonNullable,
        input,
        introspectionHandling,
      });
      expect(res).toMatchInlineSnapshot(`
        Object {
          "data": null,
          "errors": Array [
            [GraphQLError: Cannot return null for non-nullable field T.b.],
          ],
        }
      `);
      expect(res.errors[0].path).toStrictEqual(['tNonNullable', 'b']);


      const operationNullable = parseOperation(schema, `
        {
          tNullable {
            b
          }
        }
      `);

      res = computeResponse({
        operation: operationNullable,
        input,
        introspectionHandling,
      });
      expect(res).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "tNullable": null,
          },
          "errors": Array [
            [GraphQLError: Cannot return null for non-nullable field T.b.],
          ],
        }
      `);
      expect(res.errors[0].path).toStrictEqual(['tNullable', 'b']);
    });

    test('no propagation on nullable list type', () => {
      const operation = parseOperation(schema, `
        {
          tNonNullable {
            c
          }
        }
      `);

      expect(computeResponse({
        operation,
        input,
        introspectionHandling,
      })).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "tNonNullable": Object {
              "c": Array [
                24,
                null,
                42,
                null,
              ],
            },
          },
          "errors": Array [],
        }
      `);
    });

    test('no propagation on null elements of non-nullable list type with nullable inner element type', () => {
      const operationNonNullable = parseOperation(schema, `
        {
          tNonNullable {
            d
          }
        }
      `);

      const res = computeResponse({
        operation: operationNonNullable,
        input,
        introspectionHandling,
      });
      expect(res).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "tNonNullable": Object {
              "d": Array [
                24,
                null,
                42,
                null,
              ],
            },
          },
          "errors": Array [],
        }
      `);
    });

    test('propagation on null elements of list type with non-nullable inner element type', () => {
      const operationNonNullable = parseOperation(schema, `
        {
          tNonNullable {
            e
          }
        }
      `);

      const res = computeResponse({
        operation: operationNonNullable,
        input,
        introspectionHandling,
      });
      expect(res).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "tNonNullable": Object {
              "e": null,
            },
          },
          "errors": Array [
            [GraphQLError: Cannot return null for non-nullable array element of type Int at index 1.],
            [GraphQLError: Cannot return null for non-nullable array element of type Int at index 3.],
          ],
        }
      `);
      expect(res.errors[0].path).toStrictEqual(['tNonNullable', 'e', 1]);
      expect(res.errors[1].path).toStrictEqual(['tNonNullable', 'e', 3]);
    });

    test('propagation on null elements of non-nullable list type with non-nullable inner element type', () => {
      const operationNonNullable = parseOperation(schema, `
        {
          tNonNullable {
            f
          }
        }
      `);

      let res = computeResponse({
        operation: operationNonNullable,
        input,
        introspectionHandling,
      });
      expect(res).toMatchInlineSnapshot(`
        Object {
          "data": null,
          "errors": Array [
            [GraphQLError: Cannot return null for non-nullable array element of type Int at index 1.],
            [GraphQLError: Cannot return null for non-nullable array element of type Int at index 3.],
          ],
        }
      `);
      expect(res.errors[0].path).toStrictEqual(['tNonNullable', 'f', 1]);
      expect(res.errors[1].path).toStrictEqual(['tNonNullable', 'f', 3]);

      const operationNullable = parseOperation(schema, `
        {
          tNullable {
            f
          }
        }
      `);

      res = computeResponse({
        operation: operationNullable,
        input,
        introspectionHandling,
      });
      expect(res).toMatchInlineSnapshot(`
        Object {
          "data": Object {
            "tNullable": null,
          },
          "errors": Array [
            [GraphQLError: Cannot return null for non-nullable array element of type Int at index 1.],
            [GraphQLError: Cannot return null for non-nullable array element of type Int at index 3.],
          ],
        }
      `);
      expect(res.errors[0].path).toStrictEqual(['tNullable', 'f', 1]);
      expect(res.errors[1].path).toStrictEqual(['tNullable', 'f', 3]);
    });
  });

  test('handles invalid values for native scalars', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        x: Int!
      }
    `);

    const input = {
      "x": 'foo',
    }

    const operation = parseOperation(schema, `
      {
        x
      }
    `);

    const res = computeResponse({
      operation,
      input,
      introspectionHandling,
    });
    expect(res).toMatchInlineSnapshot(`
      Object {
        "data": null,
        "errors": Array [
          [GraphQLError: Invalid value found for field Query.x.],
        ],
      }
    `);
    expect(res.errors[0].path).toStrictEqual(['x']);
  });

  test('Adds __typename for root types if necessary', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        t: T
      }

      type T {
        a: Int
        q: Query
      }
    `);

    const input = {
      "t": {
        "a": 42,
        "q": {
          "t": {
            "q": {
              "t": {
                "a": 24
              },
            },
          },
        },
      },
    }

    const operation = parseOperation(schema, `
      {
        __typename
        t {
          a
          q {
            __typename
            t {
              q {
                __typename
                t {
                  a
                }
              }
            }
          }
        }
      }
    `);

    expect(computeResponse({
      operation,
      input,
      introspectionHandling,
    })).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "__typename": "Query",
          "t": Object {
            "a": 42,
            "q": Object {
              "__typename": "Query",
              "t": Object {
                "q": Object {
                  "__typename": "Query",
                  "t": Object {
                    "a": 24,
                  },
                },
              },
            },
          },
        },
        "errors": Array [],
      }
    `);
  });

  test('Handles __typename from subgraphs correctly', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        i: [I]
      }

      interface I {
        x: Int
      }

      type A implements I {
        x: Int
      }

      type B implements I {
        x: Int
      }
    `);

    const input = {
      "i": [
        {
          "__typename": "A",
          "x": 24,
        },
        {
          "__typename": "B",
          "x": 42,
        },
      ]
    }

    const operation = parseOperation(schema, `
      {
        i {
          ... on I {
            __typename
            x
          }
        }
      }
    `);

    expect(computeResponse({
      operation,
      input,
      introspectionHandling,
    })).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "i": Array [
            Object {
              "__typename": "A",
              "x": 24,
            },
            Object {
              "__typename": "B",
              "x": 42,
            },
          ],
        },
        "errors": Array [],
      }
    `);
  });

  test('Handles defaulted `if` conditions', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        hello: String!
      }
    `);

    const input = {
      skipped: 'world',
      included: 'world',
    };

    const operation = parseOperation(schema, `#graphql
      query DefaultedIfCondition($if: Boolean = true) {
        skipped: hello @skip(if: $if)
        included: hello @include(if: $if)
      }
    `);

    expect(
      computeResponse({
        operation,
        input,
        introspectionHandling,
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "included": "world",
        },
        "errors": Array [],
      }
    `);
  });

  test('Provided variables overwrite defaulted variable values', () => {
    const schema = buildSchemaFromAST(gql`
      type Query {
        hello: String!
      }
    `);

    const input = {
      skipped: 'world',
      included: 'world',
    };

    const operation = parseOperation(schema, `#graphql
        # note that the default conditional is inverted from the previous test
      query DefaultedIfCondition($if: Boolean = false) {
        skipped: hello @skip(if: $if)
        included: hello @include(if: $if)
      }
    `);

    expect(
      computeResponse({
        operation,
        input,
        variables: { if: true },
        introspectionHandling,
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "included": "world",
        },
        "errors": Array [],
      }
    `);
  });
})
