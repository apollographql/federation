import gql from "graphql-tag";
import { assertCompositionSuccess, composeAsFed2Subgraphs } from "./testHelper";

describe("setContext tests", () => {
  test("vanilla setContext - success case", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  test("using a list as input to @fromContext", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: [String]!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: [String] @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  // test('vanilla setContext - success case alt', () => {
  //   const subgraph1 = {
  //     name: 'Subgraph1',
  //     utl: 'https://Subgraph1',
  //     typeDefs: gql`
  //       type Query {
  //         t: T!
  //       }

  //       type T @key(fields: "id") @context(name: "context") {
  //         id: ID!
  //         u: U!
  //         prop: String!
  //       }

  //       type U @key(fields: "id") {
  //         id: ID!
  //         field : Int! @requires(fields: "field2")
  //         field2: String! @external
  //       }
  //     `
  //   };

  //   const subgraph2 = {
  //     name: 'Subgraph2',
  //     utl: 'https://Subgraph2',
  //     typeDefs: gql`
  //       type Query {
  //         a: Int!
  //       }

  //       type U @key(fields: "id") {
  //         id: ID!
  //         field2: String!
  //       }
  //     `
  //   };

  //   const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
  //   assertCompositionSuccess(result);
  // });

  it("setContext with multiple contexts (duck typing) - success", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          foo: Foo!
          bar: Bar!
        }

        type Foo @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type Bar @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it("setContext with multiple contexts (duck typing) - type mismatch", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          foo: Foo!
          bar: Bar!
        }

        type Foo @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type Bar @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: Int!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: the type of the selection "Int" does not match the expected type "String"'
    );
  });

  it("setContext with multiple contexts (type conditions) - success", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          foo: Foo!
          bar: Bar!
        }

        type Foo @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type Bar @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop2: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(
            a: String
              @fromContext(
                field: "$context ... on Foo { prop } ... on Bar { prop2 }"
              )
          ): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it("context is never set", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$unknown { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "unknown" is used at location "U.field(a:)" but is never set.'
    );
  });

  it("resolved field is not available in context", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(
            a: String @fromContext(field: "$context { invalidprop }")
          ): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid for type T. Error: Cannot query field "invalidprop" on type "T".'
    );
  });

  it("context variable does not appear in selection", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "{ prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] @fromContext argument does not reference a context "{ prop }".'
    );
  });

  it("type matches no type conditions", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          bar: Bar!
        }

        type Foo @key(fields: "id") {
          id: ID!
          u: U!
          prop: String!
        }

        type Bar @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop2: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(
            a: String @fromContext(field: "$context ... on Foo { prop }")
          ): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: no type condition matches the location "Bar"'
    );
  });

  it("setContext on interface - success", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          i: I!
        }

        interface I @context(name: "context") {
          prop: String!
        }

        type T implements I @key(fields: "id") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it("setContext on interface with type condition - success", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          i: I!
        }

        interface I @context(name: "context") {
          prop: String!
        }

        type T implements I @key(fields: "id") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(
            a: String @fromContext(field: "$context ... on T { prop }")
          ): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it("@context fails on union when type is missing prop", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        union T @context(name: "context") = T1 | T2

        type T1 @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
          a: String!
        }

        type T2 @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          b: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid for type T. Error: Cannot query field "prop" on type "T".'
    );
  });
  it.todo("type mismatch in context variable");
  it("nullability mismatch is ok if contextual value is non-nullable", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  // test is no longer valid since we don't allow non-nullable arguments
  it.skip("nullability mismatch is not ok if argument is non-nullable", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String! @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };
    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: the type of the selection does not match the expected type "String"'
    );
  });

  it("selection contains more than one value", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { id prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };
    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: multiple selections are made'
    );
  });

  it("fields marked @external because of context are not flagged as not used", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String! @external
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type T @key(fields: "id") {
          id: ID!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  // Since it's possible that we have to call into the same subgraph with multiple fetch groups where we would have previously used only one,
  // we need to verify that there is a resolvable key on the object that uses a context.
  it("at least one key on an object that uses a context must be resolvable", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id", resolvable: false) {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Object "U" has no resolvable key but has an a field with a contextual argument.'
    );
  });

  it("context selection contains an alias", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { foo: prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: aliases are not allowed in the selection'
    );
  });

  it("context name is invalid", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "_context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$_context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context name "_context" may not contain an underscore.'
    );
  });

  it("context selection contains a query directive", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        directive @foo on FIELD
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop @foo }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: directives are not allowed in the selection'
    );
  });

  it("context selection references an @interfaceObject", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        directive @foo on FIELD
        type Query {
          t: T!
        }

        type T @interfaceObject @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] Context "is used in "U.field(a:)" but the selection is invalid: One of the types in the selection is an interfaceObject: "T"'
    );
  });

  it("contextual argument is present in multiple subgraphs -- success case", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
            @shareable
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
          field: Int! @shareable
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it("contextual argument is present in multiple subgraphs, not nullable, no default", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
            @shareable
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String!): Int! @shareable
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      'Argument "U.field(a:)" is contextual in at least one subgraph but in "U.field(a:)" it does not have @fromContext, is not nullable and has no default value.'
    );
  });

  it("contextual argument is present in multiple subgraphs, nullable", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
            @shareable
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String): Int! @shareable
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it("contextual argument is present in multiple subgraphs, default value", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
            @shareable
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
          field(a: String! = "default"): Int! @shareable
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
    expect(result.hints).toMatchInlineSnapshot(`
      Array [
        CompositionHint {
          "coordinate": undefined,
          "definition": Object {
            "code": "CONTEXTUAL_ARGUMENT_NOT_CONTEXTUAL_IN_ALL_SUBGRAPHS",
            "description": "Indicates that the argument will not be present in the supergraph because it is contextual in at least one subgraph.",
            "level": Object {
              "name": "INFO",
              "value": 40,
            },
          },
          "element": undefined,
          "message": "Contextual argument \\"U.field(a:)\\" will not be included in the supergraph since it is contextual in at least one subgraph",
          "nodes": undefined,
        },
      ]
    `);
  });

  it("contextual argument on a directive definition argument", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        directive @foo(
          a: String @fromContext(field: "$context { prop }")
        ) on FIELD_DEFINITION

        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field: Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] @fromContext argument cannot be used on a directive definition "@foo(a:)".'
    );
  });

  it("forbid default values on contextual arguments", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field(
            a: String = "default" @fromContext(field: "$context { prop }")
          ): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] @fromContext arguments may not have a default value: "U.field(a:)".'
    );
  });

  it("forbid contextual arguments on interfaces", () => {
    const subgraph1 = {
      name: "Subgraph1",
      utl: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T!
        }

        interface I @key(fields: "id") {
          id: ID!
          field: Int!
        }

        type T @key(fields: "id") @context(name: "context") {
          id: ID!
          u: U!
          prop: String!
        }

        type U implements I @key(fields: "id") {
          id: ID!
          field(a: String @fromContext(field: "$context { prop }")): Int!
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      utl: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe(
      '[Subgraph1] @fromContext argument cannot be used on a field implementing an interface field "I.field".'
    );
  });
});
