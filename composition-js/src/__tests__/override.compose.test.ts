import { printSchema, printType } from "@apollo/federation-internals";
import gql from "graphql-tag";
import "./matchers";
import {
  assertCompositionSuccess,
  schemas,
  errors,
  composeAsFed2Subgraphs,
} from "./compose.test";

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

  // TODO: This test is very similar to the case of @key and `A.b` in Subgraph2
  // needs to be "turned" into an @external.
  //
  // This does raise a related question for hints: currently, once a field is
  // overridden, we raise an hint that says the field is safe to be removed,
  // but it's not technically true in this example (the same applies to the @key case
  // btw), and if the user blindly follow the hint, he will get an error due to
  // the @provides referencing a now non-existing field. Instead, the user should
  // either mark the field @external, or, alternative, also remove any directive
  // referencing the now overridden field (and which one is more approapriate
  // is likely case dependent: in the case of @key, if you've overridden a key,
  // you're probably moving the whole entity anyway, so you'd want to remove the
  // original key, but in this example, there is no particular reason you'd want
  // to remove the @provides, which still make as much sense as before, if not
  // more).
  //
  // Side-note: regarding hints, we probably want a test to ensure that if instead
  // of removing the overriden field, you just mark it @external manually, then
  // we still hint you to say that the @override can now be removed.
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
    // TODO: Should this
  });

  // TODO: Similar issue that for @provides above, but for @requires.
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
    // TODO: more checks.
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
        k: ID @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\") @join__field(graph: SUBGRAPH2, external: true)
        a: Int @join__field(graph: SUBGRAPH1)
        b: Int @join__field(graph: SUBGRAPH2)
      }"
    `);
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
    assertCompositionSuccess(result);

    const typeT = result.schema.type("T");
    expect(printType(typeT!)).toMatchInlineSnapshot(`
      "type T
        @join__type(graph: SUBGRAPH1, key: \\"k\\")
        @join__type(graph: SUBGRAPH2, key: \\"k\\")
      {
        k: ID
        a: Int @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\")
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
      }
    `);
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
        k: ID @join__field(graph: SUBGRAPH1, override: \\"Subgraph2\\") @join__field(graph: SUBGRAPH2, external: true)
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
});
