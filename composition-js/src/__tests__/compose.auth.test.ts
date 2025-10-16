import gql from 'graphql-tag';
import {
  assertCompositionSuccess,
  composeAsFed2Subgraphs,
} from "./testHelper";

describe('authorization tests', () => {
  describe("@requires", () => {
    it('works with explicit auth', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: String @external
            requiresExtra: String @requires(fields: "extra") @authenticated
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: String @authenticated
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
    })

    it('works with auth on the type', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") @policy(policies: [["P1"]]) {
            id: ID
            extra: String @external
            requiresExtra: String @requires(fields: "extra")
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: String @policy(policies: [["P1"]])
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
    })

    it('works with valid subset of auth', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: String @external
            requiresExtra: String @requires(fields: "extra") @requiresScopes(scopes: [["S2", "S1"]])
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: String @requiresScopes(scopes: [["S1", "S2"], ["S3"]])
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
    })

    it('works with auth on nested selection', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") @authenticated {
            id: ID
            extra: I @external
            requiresExtra: String @requires(fields: "extra { i ... on I1 { i1 } ... on I2 { i2 } }")
              @requiresScopes(scopes: [["S1"]["S2"]]) @policy(policies: [["P1"]])
          }

          interface I {
            i: String
          }

          type I1 implements I @external {
            i: String
            i1: String
          }

          type I2 implements I @external {
            i: String
            i2: Int
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: I @authenticated
          }

          interface I {
            i: String
          }

          type I1 implements I {
            i: String @requiresScopes(scopes: [["S1"]])
            i1: String @requiresScopes(scopes: [["S2"]])
          }

          type I2 implements I {
            i: String
            i2: Int @policy(policies: [["P1"]])
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
    })

    it('does not work when missing auth', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: String @external
            requiresExtra: String @requires(fields: "extra")
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: String @authenticated
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "T.requiresExtra" does not specify necessary @authenticated, @requiresScopes and/or ' +
          '@policy auth requirements to access the transitive field T.extra data from @requires selection set.'
      );
    })

    it('does not work with subset of auth', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: String @external
            requiresExtra: String @requires(fields: "extra") @requiresScopes(scopes: [["S1"]])
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: String @requiresScopes(scopes: [["S1", "S2"]])
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "T.requiresExtra" does not specify necessary @authenticated, @requiresScopes and/or @policy ' +
          'auth requirements to access the transitive field T.extra data from @requires selection set.'
      );
    })

    it('does not work when missing auth on a nested selection', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: I @external
            requiresExtra: String @requires(fields: "extra { i ... on I1 { i1 } ... on I2 { i2 } }")
          }

          interface I {
            i: String
          }

          type I1 implements I @external {
            i: String
            i1: String
          }

          type I2 implements I @external {
            i: String
            i2: Int
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: I
          }

          interface I {
            i: String
          }

          type I1 implements I {
            i: String
            i1: String
          }

          type I2 implements I {
            i: String
            i2: Int @policy(policies: [["P1"]])
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "T.requiresExtra" does not specify necessary @authenticated, @requiresScopes and/or @policy ' +
          'auth requirements to access the transitive field I2.i2 data from @requires selection set.'
      );
    })

    it('does not work when missing explicit auth on an interface field selection', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: I @external
            requiresExtra: String @requires(fields: "extra { i }")
          }

          interface I {
            i: String
          }

          type I1 implements I @external {
            i: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: I
          }

          interface I {
            i: String
          }

          type I1 implements I {
            i: String @requiresScopes(scopes: [["S1"]])
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "T.requiresExtra" does not specify necessary @authenticated, @requiresScopes and/or @policy ' +
          'auth requirements to access the transitive field I1.i data from @requires selection set.'
      );
    })

    it('does not work when missing inherited auth on a interface field selection', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: I @external
            requiresExtra: String @requires(fields: "extra { i }")
          }

          interface I {
            i: String
          }

          type I1 implements I @external {
            i: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: I
          }

          interface I {
            i: String
          }

          type I1 implements I @authenticated {
            i: String
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "T.requiresExtra" does not specify necessary @authenticated, @requiresScopes and/or @policy ' +
          'auth requirements to access the transitive interface I data from @requires selection set.'
      );
    })

    it('does not work when missing auth on type condition in a field selection', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID
            extra: I @external
            requiresExtra: String @requires(fields: "extra { ... on I1 { i1 } ... on I2 { i2 }}")
          }

          interface I {
            i: String
          }

          type I1 implements I @external {
            i: String
            i1: Int
          }
          
          type I2 implements I @external {
            i: String
            i2: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type T @key(fields: "id") {
            id: ID
            extra: I
          }

          interface I {
            i: String
          }

          type I1 implements I @requiresScopes(scopes: [["S1"]]) {
            i: String 
            i1: Int
          }

          type I2 implements I {
            i: String
            i2: String
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "T.requiresExtra" does not specify necessary @authenticated, @requiresScopes and/or @policy' +
          ' auth requirements to access the transitive data in inline fragment type condition I1 from @requires selection set.'
      );
    })
  });
  describe("@context", () => {
    it('works with explicit auth', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T!
          }

          type T @key(fields: "id") @context(name: "context") {
            id: ID!
            u: U!
            prop: String! @authenticated
          }

          type U @key(fields: "id") {
            id: ID!
            field(a: String @fromContext(field: "$context { prop }")): Int! @authenticated
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            a: Int!
          }

          type U @key(fields: "id") {
            id: ID!
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
    })

    it('works with explicit auth and multiple contexts', () => {
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
            prop: String! @requiresScopes(scopes: [["S1"]])
          }

          type Bar @key(fields: "id") @context(name: "context") {
            id: ID!
            u: U!
            prop: String! @requiresScopes(scopes: [["S2"]])
          }

          type U @key(fields: "id") {
            id: ID!
            field(a: String @fromContext(field: "$context { prop }")): Int! @requiresScopes(scopes: [["S1"], ["S2"]])
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
    })

    it('works with explicit auth and multiple contexts using type conditions', () => {
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
            prop: String! @requiresScopes(scopes: [["S1"]])
          }

          type Bar @key(fields: "id") @context(name: "context") {
            id: ID!
            u: U!
            prop2: String! @policy(policies: [["P1"]])
          }

          type U @key(fields: "id") {
            id: ID!
            field(
              a: String
              @fromContext(
                field: "$context ... on Foo { prop } ... on Bar { prop2 }"
              )
            ): Int! @requiresScopes(scopes: [["S1"]]) @policy(policies: [["P1"]])
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
    })

    it('does not work with missing auth', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            t: T!
          }

          type T @key(fields: "id") @context(name: "context") {
            id: ID!
            u: U!
            prop: String! @authenticated
          }

          type U @key(fields: "id") {
            id: ID!
            field(a: String @fromContext(field: "$context { prop }")): Int!
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            a: Int!
          }

          type U @key(fields: "id") {
            id: ID!
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "U.field" does not specify necessary @authenticated, @requiresScopes and/or @policy ' +
          'auth requirements to access the transitive field T.prop data from @fromContext selection set.'
      );
    })

    it('does not work with missing auth on one of the contexts', () => {
      const subgraph1 = {
        name: "Subgraph1",
        utl: "https://Subgraph1",
        typeDefs: gql`
          type Query {
            foo: Foo!
            bar: Bar!
          }

          type Foo @key(fields: "id") @context(name: "context") @authenticated {
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
      expect(result.schema).toBeUndefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].message).toBe(
          '[Subgraph1] Field "U.field" does not specify necessary @authenticated, @requiresScopes and/or @policy auth ' +
          'requirements to access the transitive data in context Subgraph1__context from @fromContext selection set.'
      );
    })
  });
});
