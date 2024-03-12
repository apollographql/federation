import gql from 'graphql-tag';
import {
  assertCompositionSuccess,
  composeAsFed2Subgraphs,
} from "./testHelper";
import { printSchema } from '@apollo/federation-internals';

describe('setContext tests', () => {
  test('vanilla setContext works', () => {
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

    const schema = result.schema;
    console.log(printSchema(schema));
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
    expect(result.errors?.[0].message).toBe('Context "nocontext" is used in "U.field(a:)" but is never set in any subgraph.');
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
    expect(result.errors?.[0].message).toBe('Context \"context\" is used in \"U.field(a:)\" but the selection is invalid: Cannot query field \"invalidprop\" on type \"T\".');
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
    expect(result.errors?.[0].message).toBe('@fromContext argument does not reference a context \"{ prop }\".');
  });
  it.todo('type mismatch in context variable');
  it.todo('nullability mismatch is ok if contextual value is non-nullable')
  it.todo('nullability mismatch is not ok if argument is non-nullable')
  it.todo('selection contains more than one value');
})
