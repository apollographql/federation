import { CompositionResult } from '../compose';
import gql from 'graphql-tag';
import { composeAsFed2Subgraphs } from './testHelper';

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

describe('non-resolvable keys', () => {
  it('fails if key is declared non-resolvable but would be needed', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type T @key(fields: "id", resolvable: false) {
          id: ID!
          f: String
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type Query {
          getTs: [T]
        }

        type T @key(fields: "id") {
          id: ID!
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        getTs {
          f
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "B":
        - cannot find field "T.f".
        - cannot move to subgraph "A", which has field "T.f", because none of the @key defined on type "T" in subgraph "A" are resolvable (they are all declared with their "resolvable" argument set to false).
      `
    ]);
  });
});

describe('@interfaceObject', () => {
  it('fails on @interfaceObject usage with missing @key on interface', () => {
    const subgraphA = {
      typeDefs: gql`
        interface I {
          id: ID!
          x: Int
        }

        type A implements I @key(fields: "id") {
          id: ID!
          x: Int
        }

        type B implements I @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          iFromB: I
        }

        type I @interfaceObject @key(fields: "id") {
          id: ID!
          y: Int
        }
      `,
      name: 'subgraphB',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        iFromB {
          ... on A {
            ...
          }
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "subgraphB": no subgraph can be reached to resolve the implementation type of @interfaceObject type "I".
      `,
      `
      The following supergraph API query:
      {
        iFromB {
          ... on B {
            ...
          }
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "subgraphB": no subgraph can be reached to resolve the implementation type of @interfaceObject type "I".
      `,
    ]);
  });

  it('fails on @interfaceObject with some unreachable implementation', () => {
    const subgraphA = {
      typeDefs: gql`
        interface I @key(fields: "id") {
          id: ID!
          x: Int
        }

        type A implements I @key(fields: "id") {
          id: ID!
          x: Int
        }

        type B implements I @key(fields: "id") {
          id: ID!
          x: Int
        }
      `,
      name: 'subgraphA',
    };

    const subgraphB = {
      typeDefs: gql`
        type Query {
          iFromB: I
        }

        type I @interfaceObject @key(fields: "id") {
          id: ID!
          y: Int
        }
      `,
      name: 'subgraphB',
    };

    const subgraphC = {
      typeDefs: gql`
        type A {
          z: Int
        }
      `,
      name: 'subgraphC',
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB, subgraphC]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        iFromB {
          ... on A {
            z
          }
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "subgraphB":
        - cannot find implementation type "A" (supergraph interface "I" is declared with @interfaceObject in "subgraphB").
        - cannot move to subgraph "subgraphC", which has field "A.z", because interface "I" is not defined in this subgraph (to jump to "subgraphC", it would need to both define interface "I" and have a @key on it).
      - from subgraph "subgraphA":
        - cannot find field "A.z".
        - cannot move to subgraph "subgraphC", which has field "A.z", because type "A" has no @key defined in subgraph "subgraphC".
      `
    ]);
  });
});

describe('when shared field has non-intersecting runtime types in different subgraphs', () => {
  it('errors for interfaces', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type Query {
          a: A @shareable
        }

        interface A {
          x: Int
        }

        type I1 implements A {
          x: Int
          i1: Int
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type Query {
          a: A @shareable
        }

        interface A {
          x: Int
        }

        type I2 implements A {
          x: Int
          i2: Int
        }
      `
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      For the following supergraph API query:
      {
        a {
          ...
        }
      }
      Shared field "Query.a" return type "A" has a non-intersecting set of possible runtime types across subgraphs. Runtime types in subgraphs are:
       - in subgraph "A", type "I1";
       - in subgraph "B", type "I2".
      This is not allowed as shared fields must resolve the same way in all subgraphs, and that imply at least some common runtime types between the subgraphs.
      `
    ]);
  });

  it('errors for unions', () => {
    const subgraphA = {
      name: 'A',
      typeDefs: gql`
        type Query {
          e: E! @shareable
        }

        type E @key(fields: "id") {
          id: ID!
          s: U! @shareable
        }

        union U = A | B

        type A {
          a: Int
        }

        type B {
          b: Int
        }
      `
    };

    const subgraphB = {
      name: 'B',
      typeDefs: gql`
        type E @key(fields: "id") {
          id: ID!
          s: U! @shareable
        }

        union U = C | D

        type C {
          c: Int
        }

        type D {
          d: Int
        }

      `
    };

    const result = composeAsFed2Subgraphs([subgraphA, subgraphB]);
    expect(result.errors).toBeDefined();
    expect(errorMessages(result)).toMatchStringArray([
      `
      For the following supergraph API query:
      {
        e {
          s {
            ...
          }
        }
      }
      Shared field "E.s" return type "U!" has a non-intersecting set of possible runtime types across subgraphs. Runtime types in subgraphs are:
       - in subgraph "A", types "A" and "B";
       - in subgraph "B", types "C" and "D".
      This is not allowed as shared fields must resolve the same way in all subgraphs, and that imply at least some common runtime types between the subgraphs.
      `
    ]);
  });
});
