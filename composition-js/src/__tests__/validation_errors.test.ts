import gql from 'graphql-tag';
import { CompositionResult, composeServices } from '../compose';
import './matchers';

function errorMessages(r: CompositionResult): string[] {
  return r.errors?.map((e) => e.message) ?? [];
}

describe('composition', () => {
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
      `,
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
      `,
    };

    const result = composeServices([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      The follow supergraph API query:
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
      The follow supergraph API query:
      {
        a {
          z
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "A": cannot find field "A.z".
      - from subgraph "B": cannot satisfy @require conditions on field "A.z" (please ensure that this is not due to key field "id" being accidentally marked @external).
      `,
    ]);
  });
});
