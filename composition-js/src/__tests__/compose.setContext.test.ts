import gql from 'graphql-tag';
import {
  assertCompositionSuccess,
  composeAsFed2Subgraphs,
} from "./testHelper";

describe('setContext tests', () => {
  test('vanilla setContext - success case', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });
  
  test('using a list as input to @fromContext', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: [String]! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
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

  it('setContext with multiple contexts (duck typing) - success', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it('setContext with multiple contexts (duck typing) - type mismatch', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context \"context\" is used in \"U.field(a:)\" but the selection is invalid: the type of the selection does not match the expected type \"String!\"');
  });

  it('setContext with multiple contexts (type conditions) - success', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context ... on Foo { prop } ... on Bar { prop2 }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it('context is never set', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$nocontext { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context \"nocontext\" is used at location \"U.field(a:)\" but is never set.');
  });

  it('resolved field is not available in context', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { invalidprop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context \"context\" is used in \"U.field(a:)\" but the selection is invalid for type T. Error: Cannot query field \"invalidprop\" on type \"T\".');
  });

  it('context variable does not appear in selection', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "{ prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] @fromContext argument does not reference a context \"{ prop }\".');
  });

  it('type matches no type conditions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context ... on Foo { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context \"context\" is used in \"U.field(a:)\" but the selection is invalid: no type condition matches the location \"Bar\"');
  });

  it('setContext on interface - success', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it('setContext on interface with type condition - success', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context ... on I { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });

  it('type matches multiple type conditions', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context ... on I { prop } ... on T { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });
  
  it('type condition on union type', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          prop: String!
          b: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);    
  });

  it('type condition on union, but a member of the union doesnt have property', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid for type T2. Error: Cannot query field "prop" on type "T2".');
  });
  it.todo('type mismatch in context variable');
  it('nullability mismatch is ok if contextual value is non-nullable', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });
  
  it('nullability mismatch is not ok if argument is non-nullable', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };
    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: the type of the selection does not match the expected type "String!"');
  });
  
  it('selection contains more than one value', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { id prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };
    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Context "context" is used in "U.field(a:)" but the selection is invalid: multiple selections are made');    
  });
  
  it('fields marked @external because of context are not flagged as not used', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
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
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);
  });
  
  // Since it's possible that we have to call into the same subggraph with multiple fetch groups where we would have previously used only one,
  // we need to verify that there is a resolvable key on the object that uses a context.
  it('at least one key on an object that uses a context must be resolvable', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
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
          field (
            a: String! @fromContext(field: "$context { prop }")
          ): Int!
        }
      `
    };

    const subgraph2 = {
      name: 'Subgraph2',
      utl: 'https://Subgraph2',
      typeDefs: gql`
        type Query {
          a: Int!
        }

        type U @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.schema).toBeUndefined();
    expect(result.errors?.length).toBe(1);
    expect(result.errors?.[0].message).toBe('[Subgraph1] Object \"U\" has no resolvable key but has an a field with a contextual argument.');    
  });
});
