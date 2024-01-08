import { printSchema, printType } from "@apollo/federation-internals";
import gql from "graphql-tag";
import "./matchers";
import {
  assertCompositionSuccess,
  schemas,
  errors,
  composeAsFed2Subgraphs,
} from "./testHelper";

describe("composition involving @override directive", () => {
  it.skip("@override whole type", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") @override(from: "Subgraph2") {
          k: ID
          a: Int
          b: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
          c: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        a: Int
        b: Int
      }"
    `);
  });

  it("@override single field.", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph2")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
          b: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        a: Int @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\")
        b: Int @join__field(graph: SUBGRAPH2)
      }"
    `);

    const [_, api] = schemas(result);
    expect(printSchema(api)).toMatchString(`
      type Query {
        t: T
      }

      type T {
        k: ID
        a: Int
        b: Int
      }
    `);
  });

  it("override field in a @provides", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }
        type T @key(fields: "k") {
          k: ID
          a: A @shareable
        }
        type A @key(fields: "id") {
          id: ID!
          b: B @override(from: "Subgraph2")
        }
        type B @key(fields: "id") {
          id: ID!
          v: String @shareable
        }
      `,
    };

    // Note @provides is only allowed on fields that the subgraph does not resolve, but
    // because of nesting, this doesn't equate to all fields in a @provides being
    // external. But it does mean that for an overriden field to be in a @provides,
    // some nesting has to be involved.
    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: A @shareable @provides(fields: "b { v }")
        }
        type A @key(fields: "id") {
          id: ID!
          b: B
        }
        type B @key(fields: "id") {
          id: ID!
          v: String @external
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    // Ensures `A.b` is marked external in Subgraph2 since it's overridden but there is still a provides mentioning it.
    const typeA = result.schema.type("A");
    expect(printType(typeA!)).toMatchInlineSnapshot(`
      "type A
        @join__type(graph: SUBGRAPH1, key: \\"id\\")
        @join__type(graph: SUBGRAPH2, key: \\"id\\")
      {
        id: ID!
        b: B @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\") @join__field(graph: SUBGRAPH2, usedOverridden: true)
      }"
    `);

    // Ensuring the provides is still here.
    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        a: A @join__field(graph: SUBGRAPH1) @join__field(graph: SUBGRAPH2, provides: \\"b { v }\\")
      }"
    `);
  });

  it("override field in a @requires", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }
        type T @key(fields: "k") {
          k: ID
          a: A @shareable
        }
        type A @key(fields: "id") {
          id: ID!
          b: B @override(from: "Subgraph2")
        }
        type B @key(fields: "id") {
          id: ID!
          v: String @shareable
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: A @shareable
          x: Int @requires(fields: "a { b { v } }")
        }
        type A @key(fields: "id") {
          id: ID!
          b: B
        }
        type B @key(fields: "id") {
          id: ID!
          v: String @external
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    // Ensures `A.b` is marked external in Subgraph2 since it's overridden but there is still a requires mentioning it.
    const typeA = result.schema.type("A");
    expect(printType(typeA!)).toMatchInlineSnapshot(`
      "type A
        @join__type(graph: SUBGRAPH1, key: \\"id\\")
        @join__type(graph: SUBGRAPH2, key: \\"id\\")
      {
        id: ID!
        b: B @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\") @join__field(graph: SUBGRAPH2, usedOverridden: true)
      }"
    `);

    // Ensuring the requires is still here.
    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        a: A
        x: Int @join__field(graph: SUBGRAPH2, requires: \\"a { b { v } }\\")
      }"
    `);
  });

  it("override field that is necessary for an interface", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        interface I {
          x: Int
        }

        type T implements I @key(fields: "k") {
          k: ID
          x: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          x: Int @override(from: "Subgraph1")
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    // Ensures `T.x` is marked external in Subgraph1 since it's overridden but still required by interface I.
    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T implements I
        @join__implements(graph: SUBGRAPH1, interface: \\"I\\")
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        x: Int @join__field(graph: SUBGRAPH1, usedOverridden: true) @join__field(graph: SUBGRAPH2, override: \\"Subgraph1\\")
      }"
    `);
  });

  it("override from self error", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph1")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors?.length).toBe(1);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      [
        "OVERRIDE_FROM_SELF_ERROR",
        `Source and destination subgraphs "Subgraph1" are the same for overridden field "T.a"`,
      ],
    ]);
  });

  it.skip("override in both type and field error", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") @override(from: "Subgraph2") {
          k: ID
          a: Int @override(from: "Subgraph2")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors?.length).toBe(1);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      [
        "OVERRIDE_ON_BOTH_FIELD_AND_TYPE",
        `Field "T.a" on subgraph "Subgraph1" is marked with @override directive on both the field and the type`,
      ],
    ]);
  });

  it("multiple override error", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph2")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph1")
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    // TODO: This test really should not cause the shareable error to be raised, but to fix it would be a bit of a pain, so punting
    // for now
    expect(result.errors?.length).toBe(3);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      [
        "OVERRIDE_SOURCE_HAS_OVERRIDE",
        `Field "T.a" on subgraph "Subgraph1" is also marked with directive @override in subgraph "Subgraph2". Only one @override directive is allowed per field.`,
      ],
      [
        "OVERRIDE_SOURCE_HAS_OVERRIDE",
        `Field "T.a" on subgraph "Subgraph2" is also marked with directive @override in subgraph "Subgraph1". Only one @override directive is allowed per field.`,
      ],
      [
        "INVALID_FIELD_SHARING",
        `Non-shareable field "T.a" is resolved from multiple subgraphs: it is resolved from subgraphs "Subgraph1" and "Subgraph2" and defined as non-shareable in all of them`,
      ],
    ]);
  });

  it("override @key field", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID @override(from: "Subgraph2")
          a: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          b: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\") @join__field(graph: SUBGRAPH2, usedOverridden: true)
        a: Int @join__field(graph: SUBGRAPH1)
        b: Int @join__field(graph: SUBGRAPH2)
      }"
    `);
  });

  it("override @key field that breaks composition validation", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }
        type T @key(fields: "k") {
          k: ID @override(from: "Subgraph2")
          a: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          otherT: T
        }
        type T @key(fields: "k") {
          k: ID
          b: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors).toBeDefined();
    expect(result.errors?.map((e) => e.message)).toMatchStringArray([
      `
      The following supergraph API query:
      {
        otherT {
          k
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "Subgraph2":
        - field "T.k" is not resolvable because it is overridden by subgraph "Subgraph1".
        - cannot move to subgraph "Subgraph1" using @key(fields: "k") of "T", the key field(s) cannot be resolved from subgraph "Subgraph2" (note that some of those key fields are overridden in "Subgraph2").
      `,
      `
      The following supergraph API query:
      {
        otherT {
          a
        }
      }
      cannot be satisfied by the subgraphs because:
      - from subgraph "Subgraph2":
        - cannot find field "T.a".
        - cannot move to subgraph "Subgraph1" using @key(fields: "k") of "T", the key field(s) cannot be resolved from subgraph "Subgraph2" (note that some of those key fields are overridden in "Subgraph2").
      `,
    ]);
  });

  it("override field with change to type definition", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          a: Int @override(from: "Subgraph2")
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          a: String
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors?.length).toBe(1);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toStrictEqual([
      [
        "FIELD_TYPE_MISMATCH",
        'Type of field "T.a" is incompatible across subgraphs: it has type "Int" in subgraph "Subgraph1" but type "String" in subgraph "Subgraph2"',
      ],
    ]);
  });

  it("override field that is a key in another type", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "e { k }") {
          e: E
        }

        type E {
          k: ID @override(from: "Subgraph2")
          a: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "e { k }") {
          e: E
          x: Int
        }

        type E {
          k: ID
          b: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    assertCompositionSuccess(result);

    const typeE = result.schema.type("E");
    expect(printType(typeE!)).toMatchInlineSnapshot(`
      "type E
        @join__type(graph: SUBGRAPH1)
        @join__type(graph: SUBGRAPH2)
      {
        k: ID @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\") @join__field(graph: SUBGRAPH2, usedOverridden: true)
        a: Int @join__field(graph: SUBGRAPH1)
        b: Int @join__field(graph: SUBGRAPH2)
      }"
    `);

    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"e { k }\\")
        @join__type(graph: SUBGRAPH2, key: \\"e { k }\\")
      {
        e: E
        x: Int @join__field(graph: SUBGRAPH2)
      }"
    `);
  });

  it("override with @provides on overridden field", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          u: U @override(from: "Subgraph2")
        }

        type U @key(fields: "id") {
          id: ID
          name: String
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          u: U @provides(fields: "name")
        }

        extend type U @key(fields: "id") {
          id: ID
          name: String @external
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    // expect(result.errors?.length).toBe(1);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toContainEqual([
      "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
      `@override cannot be used on field "T.u" on subgraph "Subgraph1" since "T.u" on "Subgraph1" is marked with directive "@provides"`,
    ]);
  });

  it("override with @requires on overridden field", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID
          id: ID
          u: U @override(from: "Subgraph2")
        }

        type U @key(fields: "id") {
          id: ID
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          id: ID @external
          u: U @requires(fields: "id")
        }

        extend type U @key(fields: "id") {
          id: ID
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    // expect(result.errors?.length).toBe(1);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toContainEqual([
      "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
      `@override cannot be used on field "T.u" on subgraph "Subgraph1" since "T.u" on "Subgraph1" is marked with directive "@requires"`,
    ]);
  });

  it("override with @external on overriding field", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          t: T
        }

        type T @key(fields: "k") {
          k: ID @override(from: "Subgraph2") @external
          a: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type T @key(fields: "k") {
          k: ID
          b: Int
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toContainEqual([
      "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
      `@override cannot be used on field "T.k" on subgraph "Subgraph1" since "T.k" on "Subgraph1" is marked with directive "@external"`,
    ]);
  });

  it("does not allow @override on interface fields", () => {
    const subgraph1 = {
      name: "Subgraph1",
      url: "https://Subgraph1",
      typeDefs: gql`
        type Query {
          i1: I
        }

        interface I {
          k: ID
          a: Int @override(from: "Subgraph2")
        }

        type A implements I @key(fields: "k") {
          k: ID
          a: Int
        }
      `,
    };

    const subgraph2 = {
      name: "Subgraph2",
      url: "https://Subgraph2",
      typeDefs: gql`
        type Query {
          i2: I
        }

        interface I {
          k: ID
          a: Int
        }

        type A implements I @key(fields: "k") {
          k: ID
          a: Int @external
        }
      `,
    };

    const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
    expect(result.errors).toBeDefined();
    expect(errors(result)).toContainEqual([
      "OVERRIDE_ON_INTERFACE",
      '@override cannot be used on field "I.a" on subgraph "Subgraph1": @override is not supported on interface type fields.',
    ]);
  });

  // At the moment, we've punted on @override support when interacting with @interfaceObject, so the
  // following tests mainly cover the various possible use and show that it currently correcly raise
  // some validation errors. We may lift some of those limitation in the future.
  describe("@interfaceObject", () => {
    it("does not allow @override on @interfaceObject fields", () => {
      // We currently rejects @override on fields of an @interfaceObject type. We could lift
      // that limitation in the future, and that would mean such override overrides the field
      // in _all_ the implementations of the target subtype, but that would imply generalizing
      // the handling overriden fields and the override error messages, so we keep that for
      // later.
      // Note that it would be a tad simpler to support @override on an @interfaceObject if
      // the `from` subgraph is also an @interfaceObject, as we can essentially ignore that
      // we have @interfaceObject in such case, but it's a corner case and it's clearer for
      // not to just always reject @override on @interfaceObject.
      const subgraph1 = {
        name: "Subgraph1",
        url: "https://Subgraph1",
        typeDefs: gql`
          type Query {
            i1: I
          }

          type I @interfaceObject @key(fields: "k") {
            k: ID
            a: Int @override(from: "Subgraph2")
          }
        `,
      };

      const subgraph2 = {
        name: "Subgraph2",
        url: "https://Subgraph2",
        typeDefs: gql`
          type Query {
            i2: I
          }

          interface I @key(fields: "k") {
            k: ID
            a: Int
          }

          type A implements I @key(fields: "k") {
            k: ID
            a: Int
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toContainEqual([
        "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
        '@override is not yet supported on fields of @interfaceObject types: cannot be used on field "I.a" on subgraph "Subgraph1".',
      ]);
    });

    it("does not allow @override when overriden field is an @interfaceObject field", () => {
      // We don't allow @override on a concrete type field when the `from` subgraph has
      // an @interfaceObject field "covering" that field. In theory, this could have some
      // use if one wanted to move a field from an @interfaceObject into all its implementations
      // (in another subgraph) but it's also a bit hard to validate/use because we would have
      // to check that all the implementations have an @override for it to be correct and
      // it's unclear how useful that gets.
      const subgraph1 = {
        name: "Subgraph1",
        url: "https://Subgraph1",
        typeDefs: gql`
          type Query {
            i1: I
          }

          type I @interfaceObject @key(fields: "k") {
            k: ID
            a: Int
          }
        `,
      };

      const subgraph2 = {
        name: "Subgraph2",
        url: "https://Subgraph2",
        typeDefs: gql`
          type Query {
            i2: I
          }

          interface I @key(fields: "k") {
            k: ID
            a: Int
          }

          type A implements I @key(fields: "k") {
            k: ID
            a: Int @override(from: "Subgraph1")
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      expect(result.errors).toBeDefined();
      expect(errors(result)).toContainEqual([
        "OVERRIDE_COLLISION_WITH_ANOTHER_DIRECTIVE",
        'Invalid @override on field "A.a" of subgraph "Subgraph2": source subgraph "Subgraph1" does not have field "A.a" but abstract it in type "I" and overriding abstracted fields is not supported.',
      ]);
    });
  });

  describe("progressive override", () => {
    it("captures override labels in supergraph", () => {
      const subgraph1 = {
        name: "Subgraph1",
        url: "https://Subgraph1",
        typeDefs: gql`
          type Query {
            t: T
          }

          type T @key(fields: "k") {
            k: ID
            a: Int @override(from: "Subgraph2", label: "foo")
          }
        `,
      };

      const subgraph2 = {
        name: "Subgraph2",
        url: "https://Subgraph2",
        typeDefs: gql`
          type T @key(fields: "k") {
            k: ID
            a: Int
            b: Int
          }
        `,
      };

      const result = composeAsFed2Subgraphs([subgraph1, subgraph2]);
      assertCompositionSuccess(result);

      const typeT = result.schema.type("T");
      expect(printType(typeT!)).toMatchInlineSnapshot(`
        "type T
          @join__type(graph: SUBGRAPH1, key: \\"k\\")
          @join__type(graph: SUBGRAPH2, key: \\"k\\")
        {
          k: ID
          a: Int @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\", overrideLabel: \\"foo\\")
          b: Int @join__field(graph: SUBGRAPH2)
        }"
      `);

      const [_, api] = schemas(result);
      expect(printSchema(api)).toMatchString(`
        type Query {
          t: T
        }

        type T {
          k: ID
          a: Int
          b: Int
        }
      `);
    });

    describe("label validation", () => {
      const overridden = {
        name: "overridden",
        url: "https://overridden",
        typeDefs: gql`
          type T @key(fields: "k") {
            k: ID
            a: Int
          }
        `,
      };

      it.each(["abc123", "Z_1-2:3/4.5"])(
        "allows valid labels starting with alpha and including alphanumerics + `_-:./`",
        (value) => {
          const withValidLabel = {
            name: "validLabel",
            url: "https://validLabel",
            typeDefs: gql`
            type Query {
              t: T
            }

            type T @key(fields: "k") {
              k: ID
              a: Int
                @override(from: "overridden", label: "${value}")
            }
          `,
          };

          const result = composeAsFed2Subgraphs([withValidLabel, overridden]);
          assertCompositionSuccess(result);
        }
      );

      it.each(["1_starts-with-non-alpha", "includes!@_invalid_chars"])(
        "disallows invalid labels",
        (value) => {
          const withInvalidLabel = {
            name: "invalidLabel",
            url: "https://invalidLabel",
            typeDefs: gql`
            type Query {
              t: T
            }

            type T @key(fields: "k") {
              k: ID
              a: Int @override(from: "overridden", label: "${value}")
            }
          `,
          };

          const result = composeAsFed2Subgraphs([withInvalidLabel, overridden]);
          expect(result.errors).toBeDefined();
          expect(errors(result)).toContainEqual([
            "OVERRIDE_LABEL_INVALID",
            `Invalid @override label "${value}" on field "T.a" on subgraph "invalidLabel": labels must start with a letter and after that may contain alphanumerics, underscores, minuses, colons, periods, or slashes. Alternatively, labels may be of the form "percent(x)" where x is a float between 0-100 inclusive.`,
          ]);
        }
      );

      it.each(["0.5", "1", "1.0", "99.9"])(
        "allows valid percent-based labels",
        (value) => {
          const withPercentLabel = {
            name: "percentLabel",
            url: "https://percentLabel",
            typeDefs: gql`
            type Query {
              t: T
            }

            type T @key(fields: "k") {
              k: ID
              a: Int @override(from: "overridden", label: "percent(${value})")
            }
          `,
          };

          const result = composeAsFed2Subgraphs([withPercentLabel, overridden]);
          assertCompositionSuccess(result);
        }
      );

      it.each([".1", "101", "1.1234567879"])(
        "disallows invalid percent-based labels",
        (value) => {
          const withInvalidPercentLabel = {
            name: "invalidPercentLabel",
            url: "https://invalidPercentLabel",
            typeDefs: gql`
            type Query {
              t: T
            }

            type T @key(fields: "k") {
              k: ID
              a: Int @override(from: "overridden", label: "percent(${value})")
            }
          `,
          };

          const result = composeAsFed2Subgraphs([
            withInvalidPercentLabel,
            overridden,
          ]);
          expect(errors(result)).toContainEqual([
            "OVERRIDE_LABEL_INVALID",
            `Invalid @override label "percent(${value})" on field "T.a" on subgraph "invalidPercentLabel": labels must start with a letter and after that may contain alphanumerics, underscores, minuses, colons, periods, or slashes. Alternatively, labels may be of the form "percent(x)" where x is a float between 0-100 inclusive.`,
          ]);
        }
      );
    });
  });
});
