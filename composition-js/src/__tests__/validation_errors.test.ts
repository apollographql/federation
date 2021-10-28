import { CompositionResult } from '../compose';
import gql from 'graphql-tag';
import './matchers';
import { composeAsFed2Subgraphs } from './compose.test';

function errorMessages(r: CompositionResult): string[] {
  return r.errors?.map(e => e.message) ?? [];
}

describe('@requires', () => {
  it('fails if it cannot satisfy a @requires', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type Query {
          a: A
        }

        type A @key(fields: "id") {
          id: ID!
          x: Int
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type A @key(fields: "id") {
          id: ID! @external
          x: Int @external
          y: Int @requires(fields: "x")
          z: Int @requires(fields: "x")
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        a {
          y
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "A": cannot find field "A.y".
      - from subgraph "B": cannot satisfy @require conditions on field "A.y" (please ensure that this is not due to key field "id" being accidentally marked @external).
      `,
      `
      The following supergraph API query:
      {
        a {
          z
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "A": cannot find field "A.z".
      - from subgraph "B": cannot satisfy @require conditions on field "A.z" (please ensure that this is not due to key field "id" being accidentally marked @external).
      `
    ]);
  });

  it('fails if it no usable post-@requires keys', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type T1 @key(fields: "id") {
          id: Int!
          f1: String
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type Query {
          getT1s: [T1]
        }

        type T1 {
          id: Int! @shareable
          f1: String @external
          f2: T2! @requires(fields: "f1")
        }

        type T2 {
          a: String
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        getT1s {
          f2 {
            ...
          }
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "B": @require condition on field "T1.f2" can be satisfied but missing usable key on "T1" in subgraph "B" to resume query.
      - from subgraph "A": cannot find field "T1.f2".
      `
    ]);
  });
});
