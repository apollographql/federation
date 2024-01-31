import gql from 'graphql-tag';
import {
  assertCompositionSuccess,
  composeAsFed2Subgraphs,
} from "./testHelper";

describe('setContext tests', () => {
  test('contextual argument does not appear in all subgraphs', () => {
    const subgraph1 = {
      name: 'Subgraph1',
      utl: 'https://Subgraph1',
      typeDefs: gql`
        type Query {
          t: T!
        }

        type T @key(fields: "id") {
          id: ID!
          u: U! # @setContext here
          prop: String!
        }

        type U @key(fields: "id") {
          id: ID!
          field (
            a: String! @require(fromContext: "context", field: "{ prop }")
          ): Int! @shareable
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
          field (
            a: String!
          ): Int! @shareable
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

  });
})
