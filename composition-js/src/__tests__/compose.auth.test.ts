import gql from 'graphql-tag';
import {
  assertCompositionSuccess,
  composeAsFed2Subgraphs,
} from "./testHelper";
import {InterfaceType} from "@apollo/federation-internals";

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
          '@policy auth requirements to access the transitive field "T.extra" data from @requires selection set.'
      );
    })

    it('does not work with invalid subset of auth', () => {
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
          'auth requirements to access the transitive field "T.extra" data from @requires selection set.'
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
          'auth requirements to access the transitive field "I2.i2" data from @requires selection set.'
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
          'auth requirements to access the transitive field "I1.i" data from @requires selection set.'
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
          'auth requirements to access the transitive field "T.extra" data from @requires selection set.'
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
          ' auth requirements to access the transitive field "T.extra" data from @requires selection set.'
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
          'auth requirements to access the transitive field "T.prop" data from @fromContext selection set.'
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
  describe("interfaces", () => {
    it('propagates @authenticated from type', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            i: I!
          }

          interface I {
            id: ID
          }

          type T implements I @key(fields: "id") @authenticated {
            id: ID
            value1: String
          }

          type U implements I @key(fields: "id") {
            id: ID
            value2: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            other: Int
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
      expect(
          result.schema.type('I')?.appliedDirectivesOf("authenticated")?.[0]
      );
    })

    it('propagates @requiresScopes from type', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            i: I!
          }

          interface I {
            id: ID
          }

          type T implements I @key(fields: "id") @requiresScopes(scopes: [["S1"], ["S2"]]) {
            id: ID
            vT: String
          }

          type U implements I @key(fields: "id") @requiresScopes(scopes: [["S1"], ["S2", "S3"]]) {
            id: ID
            vU: String
          }

          type V implements I @key(fields: "id") {
            id: ID
            vV: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            other: Int
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
      expect(
          result.schema.type('I')
              ?.appliedDirectivesOf("requiresScopes")
              ?.[0]?.arguments()?.["scopes"]).toStrictEqual(
          [
            ['S1'],
            ['S2', 'S3'],
          ]
      );
    })

    it('propagates @policy from type', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            i: I!
          }

          interface I {
            id: ID
          }

          type T implements I @key(fields: "id") @policy(policies: [["P1"]]) {
            id: ID
            vT: String
          }

          type U implements I @key(fields: "id") @policy(policies: [["P2"]]) {
            id: ID
            vU: String
          }

          type V implements I @key(fields: "id") {
            id: ID
            vV: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "id") {
            id: ID!
            other: Int
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
      expect(
          result.schema.type('I')
              ?.appliedDirectivesOf("policy")
              ?.[0]?.arguments()?.["policies"]).toStrictEqual(
          [
            ['P1', 'P2'],
          ]
      );
    })

    it('propagates @authenticated from fields', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            i: I!
          }

          interface I {
            id: ID
            i1: Int
            i2: String
            i3: String
          }

          type T1 implements I @key(fields: "id") {
            id: ID
            i1: Int
            i2: String @shareable
            i3: String
            value1: String
          }

          type T2 implements I @key(fields: "id") {
            id: ID
            i1: Int @authenticated
            i2: String
            i3: String
            value2: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            t: T1
          }

          type T1 @key(fields: "id") {
            id: ID!
            i2: String @shareable @authenticated
            other: Int
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
      const i = result.schema.type('I');
      expect(i).toBeDefined();
      expect(i).toBeInstanceOf(InterfaceType);
      const field1 = (i as InterfaceType).field("i1");
      const field2 = (i as InterfaceType).field("i2");
      expect(field1?.appliedDirectivesOf("authenticated")?.[0]).toBeDefined();
      expect(field2?.appliedDirectivesOf("authenticated")?.[0]).toBeDefined();
    })

    it('propagates @requiresScopes from field', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            i: I!
          }

          interface I {
            id: ID
            i1: Int
            i2: String
            i3: String
          }

          type T1 implements I @key(fields: "id") {
            id: ID
            i1: Int @requiresScopes(scopes: [["S1"]])
            i2: String @shareable
            i3: String
            value1: String
          }

          type T2 implements I @key(fields: "id") {
            id: ID
            i1: Int @requiresScopes(scopes: [["S1", "S2"]])
            i2: String
            i3: String
            value2: String
          }

          type T3 implements I @key(fields: "id") {
            id: ID
            i1: Int
            i2: String
            i3: String
            value2: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            t: T1
          }

          type T1 @key(fields: "id") {
            id: ID!
            i2: String @shareable @requiresScopes(scopes: [["S3"]])
            other: Int
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
      const i = result.schema.type('I');
      expect(i).toBeDefined();
      expect(i).toBeInstanceOf(InterfaceType);
      const field1 = (i as InterfaceType).field("i1");
      expect(field1?.appliedDirectivesOf("requiresScopes")
          ?.[0]?.arguments()?.["scopes"]).toStrictEqual(
          [
            ['S1', 'S2'],
          ]
      );
      const field2 = (i as InterfaceType).field("i2");
      expect(field2?.appliedDirectivesOf("requiresScopes")
          ?.[0]?.arguments()?.["scopes"]).toStrictEqual(
          [
            ['S3'],
          ]
      );
    })

    it('propagates @policy on field', () => {
      const subgraph1 = {
        name: 'Subgraph1',
        url: 'https://Subgraph1',
        typeDefs: gql`
          type Query {
            i: I!
          }

          interface I {
            id: ID
            i1: Int
            i2: String
            i3: String
          }

          type T1 implements I @key(fields: "id") {
            id: ID
            i1: Int @policy(policies: [["P1"], ["P2"]])
            i2: String @shareable
            i3: String
            value1: String
          }

          type T2 implements I @key(fields: "id") {
            id: ID
            i1: Int @policy(policies: [["P1"], ["P2", "P3"]])
            i2: String
            i3: String
            value2: String
          }

          type T3 implements I @key(fields: "id") {
            id: ID
            i1: Int
            i2: String
            i3: String
            value2: String
          }
        `
      }

      const subgraph2 = {
        name: 'Subgraph2',
        url: 'https://Subgraph2',
        typeDefs: gql`
          type Query {
            t: T1
          }

          type T1 @key(fields: "id") {
            id: ID!
            i2: String @shareable @policy(policies: [["P4"]])
            other: Int
          }
        `
      }

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);
      const i = result.schema.type('I');
      expect(i).toBeDefined();
      expect(i).toBeInstanceOf(InterfaceType);
      const field1 = (i as InterfaceType).field("i1");
      expect(field1?.appliedDirectivesOf("policy")
          ?.[0]?.arguments()?.["policies"]).toStrictEqual(
          [
            ['P1'],
            ['P2', 'P3'],
          ]
      );
      const field2 = (i as InterfaceType).field("i2");
      expect(field2?.appliedDirectivesOf("policy")
          ?.[0]?.arguments()?.["policies"]).toStrictEqual(
          [
            ['P4'],
          ]
      );
    })
  });
});
