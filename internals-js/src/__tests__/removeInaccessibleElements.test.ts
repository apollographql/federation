import { ObjectType } from "../definitions";
import { buildSchema } from "../buildSchema";
import { apiSchemaValidationErrorCode } from "../coreSpec";
import { removeInaccessibleElements } from "../inaccessibleSpec";
import { GraphQLErrorExt } from "@apollo/core-schema/dist/error";
import { GraphQLError } from "graphql";

describe("removeInaccessibleElements", () => {
  function errorCauses(e: Error): GraphQLError[] {
    expect(e instanceof GraphQLErrorExt).toBeTruthy();
    const error = e as GraphQLErrorExt<string>;
    expect(error.code).toStrictEqual(apiSchemaValidationErrorCode);
    const causes = (error as any).causes;
    expect(Array.isArray(causes)).toBeTruthy();
    return causes as GraphQLError[];
  }

  it(`removes @inaccessible fields`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        someField: String
        privateField: String @inaccessible
      }
    `);

    removeInaccessibleElements(schema);

    const queryType = schema.schemaDefinition.rootType("query")!;

    expect(queryType.field("someField")).toBeDefined();
    expect(queryType.field("privateField")).toBeUndefined();
  });

  it(`removes @inaccessible object types`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo @inaccessible
        barField: Bar
      }

      type Foo @inaccessible {
        someField: String
      }

      type Bar {
        someField: String
      }

      union Baz = Foo | Bar
    `);

    removeInaccessibleElements(schema);

    expect(schema.type("Foo")).toBeUndefined();
  });

  it(`removes @inaccessible interface types`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo @inaccessible
        barField: Bar
      }

      interface Foo @inaccessible {
        someField: String
      }

      type Bar implements Foo {
        someField: String
      }
    `);

    removeInaccessibleElements(schema);

    expect(schema.type("Foo")).toBeUndefined();
    const barType = schema.type("Bar") as ObjectType | undefined;
    expect(barType).toBeDefined();
    expect(barType?.field("someField")).toBeDefined();
    expect([...barType!.interfaces()]).toHaveLength(0);
  });

  it(`removes @inaccessible union types`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo @inaccessible
        barField: Bar
      }

      union Foo @inaccessible = Bar | Baz

      type Bar {
        someField: String
      }

      type Baz {
        anotherField: String
      }
    `);

    removeInaccessibleElements(schema);

    expect(schema.type("Foo")).toBeUndefined();
    expect(schema.type("Bar")).toBeDefined();
    expect(schema.type("Baz")).toBeDefined();
  });

  it(`throws when a field returning an @inaccessible type isn't marked @inaccessible itself`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo
        barField: Bar
      }

      type Foo @inaccessible {
        someField: String
      }

      type Bar {
        someField: String
      }

      union Baz = Foo | Bar
    `);

    try {
      // Assert that an aggregate Error is thrown, then allow the error to be
      // caught for further validation
      expect(removeInaccessibleElements(schema)).toThrow(GraphQLErrorExt);
    } catch (err) {
      const causes = errorCauses(err);
      expect(causes).toHaveLength(1);
      expect(causes[0].message).toMatchInlineSnapshot(
        `"Type \\"Foo\\" is @inaccessible but is referenced by \\"Query.fooField\\", which is in the API schema."`
      );
    }
  });

  it(`throws when there are multiple problems`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo
      }

      type Foo @inaccessible {
        someField: String
      }

      union Bar = Foo
    `);

    try {
      // Assert that an aggregate Error is thrown, then allow the error to be
      // caught for further validation
      expect(removeInaccessibleElements(schema)).toThrow(GraphQLErrorExt);
    } catch (err) {
      const causes = errorCauses(err);
      expect(causes).toHaveLength(2);
      expect(causes[0].message).toMatchInlineSnapshot(
        `"Type \\"Foo\\" is @inaccessible but is referenced by \\"Query.fooField\\", which is in the API schema."`
      );
      expect(causes[1].message).toMatchInlineSnapshot(
        `"Type \\"Bar\\" is in the API schema but all of its members are @inaccessible."`
      );
    }
  });

  it(`removes @inaccessible query root type`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query @inaccessible {
        fooField: Foo
      }

      type Foo {
        someField: String
      }
    `);

    try {
      // Assert that an aggregate Error is thrown, then allow the error to be
      // caught for further validation
      expect(removeInaccessibleElements(schema)).toThrow(GraphQLErrorExt);
    } catch (err) {
      const causes = errorCauses(err);
      expect(causes).toHaveLength(1);
      expect(causes[0].message).toMatchInlineSnapshot(
        `"Type \\"Query\\" is @inaccessible but is the root query type, which must be in the API schema."`
      );
    }
  });

  it(`removes @inaccessible mutation root type`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
        mutation: Mutation
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo
      }

      type Mutation @inaccessible {
        fooField: Foo
      }

      type Foo {
        someField: String
      }
    `);

    removeInaccessibleElements(schema);

    expect(schema.schemaDefinition.rootType("mutation")).toBeUndefined();
    expect(schema.type("Mutation")).toBeUndefined();
  });

  it(`removes @inaccessible subscription root type`, () => {
    const schema = buildSchema(`
      directive @core(feature: String!, as: String, for: core__Purpose) repeatable on SCHEMA

      directive @inaccessible on FIELD_DEFINITION | OBJECT | INTERFACE | UNION

      schema
        @core(feature: "https://specs.apollo.dev/core/v0.2")
        @core(feature: "https://specs.apollo.dev/inaccessible/v0.1")
      {
        query: Query
        subscription: Subscription
      }

      enum core__Purpose {
        EXECUTION
        SECURITY
      }

      type Query {
        fooField: Foo
      }

      type Subscription @inaccessible {
        fooField: Foo
      }

      type Foo {
        someField: String
      }
    `);

    removeInaccessibleElements(schema);

    expect(schema.schemaDefinition.rootType("subscription")).toBeUndefined();
    expect(schema.type("Subscription")).toBeUndefined();
  });
});
